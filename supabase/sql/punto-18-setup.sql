-- ============================================================
-- Punto 18 — setup en Supabase.
--
-- Cocina y bar marcan cada producto como 'listo' (PedidosService.
-- marcarItemListo, tabla 'pedido_items'). Este script agrega:
--   1. Un trigger que, cuando el ÚLTIMO item pendiente de un pedido
--      queda 'listo' (contando TODOS los sectores que intervienen en
--      ese pedido), pasa 'pedidos.estado' a 'listo' ("pedido
--      completo"). Ese cambio en 'pedidos' es lo que dispara el
--      Database Webhook -> notificar-pedido-listo (mismo mecanismo que
--      notificar-pedido-confirmado en el punto 14).
--   2. 'pedido_items' a la publicación de Realtime, para que cocina,
--      bar y el mozo vean en vivo cuándo se marca cada producto (antes
--      sólo estaba 'pedidos').
--
-- Las tablas y los enums (estado_pedido, estado_item_pedido) YA
-- EXISTEN con su esquema oficial: este script no los toca. Correr en
-- el SQL Editor. Es idempotente: se puede correr de nuevo sin romper
-- nada.
-- ============================================================

-- 1) Trigger "pedido completo": se dispara en cada UPDATE de
--    'pedido_items' donde el item pasó a 'listo'. Bloquea la fila del
--    pedido (for update) para serializar a cocina y bar marcando el
--    último item de sus respectivos sectores casi al mismo tiempo: sin
--    ese lock, las dos transacciones podrían ver "todavía falta uno"
--    y el pedido nunca pasaría a 'listo'.
create or replace function public.verificar_pedido_completo()
returns trigger
language plpgsql
as $$
begin
  perform 1 from public.pedidos where id = new.pedido_id for update;

  if not exists (
    select 1 from public.pedido_items
    where pedido_id = new.pedido_id
      and estado not in ('listo', 'entregado')
  ) then
    update public.pedidos
    set estado = 'listo'
    where id = new.pedido_id
      and estado in ('confirmado', 'en_preparacion');
  end if;

  return new;
end;
$$;

drop trigger if exists pedido_items_verificar_completo on public.pedido_items;
create trigger pedido_items_verificar_completo
  after update on public.pedido_items
  for each row
  when (new.estado = 'listo' and old.estado is distinct from 'listo')
  execute function public.verificar_pedido_completo();

-- 2) Realtime.
do $$
begin
  begin
    alter publication supabase_realtime add table public.pedido_items;
  exception when duplicate_object then null;
  end;
end $$;
