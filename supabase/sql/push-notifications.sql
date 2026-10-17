-- Push notifications: ajustes de base de datos
-- -------------------------------------------------------------
-- Idempotente: se puede volver a correr sin romper nada.
--
-- 1. push_tokens.usuario_id pasa a referenciar auth.users en vez de
--    'usuarios': los invitados (signInAnonymously) no tienen fila en
--    'usuarios' y el insert de su token fallaba por la FK. El id del
--    invitado (clientes_anonimos.id) es el mismo de su sesión de Auth.
--
-- 2. registrar_push_token(): alta/reasignación del token del
--    dispositivo a auth.uid(). Con el upsert directo desde el front, si
--    el token seguía a nombre de otro usuario (cerró la app sin logout,
--    sesión vencida) la policy usuario_id = auth.uid() bloqueaba el
--    UPDATE: el usuario nuevo no recibía pushes y el anterior recibía
--    los suyos.
--
-- 3. Condición WHEN en los triggers AFTER UPDATE que llaman a las Edge
--    Functions notificar-*: sin ella, cada UPDATE de 'pedidos' hacía 5
--    requests HTTP (casi todas terminaban en "omitido"), y
--    notificar-pedido-reenviado volvía a avisar a los mozos ante
--    cualquier UPDATE de un pedido en pendiente_mozo.
--    Los triggers se reconstruyen a partir de su definición actual
--    (pg_get_triggerdef) para no escribir acá los headers, que llevan
--    credenciales.

begin;

-- 1. FK a auth.users -------------------------------------------------
alter table public.push_tokens
  drop constraint if exists push_tokens_usuario_id_fkey;

alter table public.push_tokens
  add constraint push_tokens_usuario_id_fkey
  foreign key (usuario_id) references auth.users (id) on delete cascade;

-- 2. registrar_push_token --------------------------------------------
create or replace function public.registrar_push_token(p_token text, p_plataforma text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Hace falta una sesión para registrar el dispositivo.';
  end if;

  if coalesce(trim(p_token), '') = '' then
    raise exception 'El token de push está vacío.';
  end if;

  -- Siempre a nombre de quien llama: no se puede registrar un token
  -- para otro usuario.
  insert into public.push_tokens (usuario_id, token, plataforma, updated_at)
  values (auth.uid(), p_token, coalesce(p_plataforma, 'desconocida'), now())
  on conflict (token) do update
    set usuario_id = excluded.usuario_id,
        plataforma = excluded.plataforma,
        updated_at = now();
end;
$$;

revoke all on function public.registrar_push_token(text, text) from public, anon;
grant execute on function public.registrar_push_token(text, text) to authenticated;

-- 3. WHEN en los triggers de notificaciones --------------------------
do $$
declare
  r record;
  definicion text;
begin
  for r in
    select * from (values
      ('pedidos', 'notificar-pedido-confirmado',
        $w$new.estado = 'confirmado' and old.estado is distinct from 'confirmado'$w$),
      ('pedidos', 'notificar-pedido-listo',
        $w$new.estado = 'listo' and old.estado is distinct from 'listo'$w$),
      ('pedidos', 'notificar-pedido-rechazado',
        $w$new.estado = 'rechazado' and old.estado is distinct from 'rechazado'$w$),
      ('pedidos', 'notificar-pedido-reenviado',
        $w$new.estado = 'pendiente_mozo' and old.estado is distinct from 'pendiente_mozo'$w$),
      ('pedidos', 'notificar-cuenta-solicitada',
        $w$new.cuenta_solicitada is true and old.cuenta_solicitada is distinct from true$w$),
      ('pagos', 'notificar-pago-confirmado',
        $w$new.confirmado_por_mozo is true and old.confirmado_por_mozo is distinct from true$w$)
    ) as v (tabla, nombre, condicion)
  loop
    select pg_get_triggerdef(t.oid)
      into definicion
      from pg_trigger t
     where t.tgrelid = format('public.%I', r.tabla)::regclass
       and t.tgname = r.nombre
       and not t.tgisinternal;

    if definicion is null then
      raise exception 'No existe el trigger % en %.', r.nombre, r.tabla;
    end if;

    -- Ya tiene condición (script corrido antes): no se toca.
    if definicion like '% WHEN (%' then
      continue;
    end if;

    definicion := replace(
      definicion,
      'FOR EACH ROW EXECUTE',
      'FOR EACH ROW WHEN (' || r.condicion || ') EXECUTE'
    );

    execute format('drop trigger %I on public.%I', r.nombre, r.tabla);
    execute definicion;
  end loop;
end;
$$;

commit;
