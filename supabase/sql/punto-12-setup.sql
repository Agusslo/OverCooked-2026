-- ============================================================
-- Punto 12 — setup en Supabase.
--
-- Las tablas 'pedidos' y 'pedido_items' YA EXISTEN con su esquema
-- oficial: este script NO las crea. Sólo se asegura de que:
--   1. Se puedan leer/escribir con la anon key (RLS).
--   2. Los cambios de estado se vean en vivo (Realtime).
--
-- Correr en el SQL Editor. Es idempotente: se puede correr de nuevo
-- sin romper nada.
-- ============================================================

-- 1) RLS: mismo criterio que el resto del proyecto (cualquier usuario
--    autenticado, incluidos los invitados anónimos que igual tienen un
--    JWT con rol 'authenticated'). Si ya tenés políticas más finas en
--    estas tablas, saltá este bloque.
alter table public.pedidos enable row level security;
alter table public.pedido_items enable row level security;

drop policy if exists "pedidos_todo_autenticado" on public.pedidos;
create policy "pedidos_todo_autenticado" on public.pedidos
  for all to authenticated using (true) with check (true);

drop policy if exists "pedido_items_todo_autenticado" on public.pedido_items;
create policy "pedido_items_todo_autenticado" on public.pedido_items
  for all to authenticated using (true) with check (true);

-- 2) Realtime (opcional pero recomendado): la sala de espera y la
--    pantalla de estado del pedido se actualizan solas. Igual andan sin
--    esto porque tienen un refresco periódico de respaldo.
do $$
begin
  begin
    alter publication supabase_realtime add table public.pedidos;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.asignaciones_mesa;
  exception when duplicate_object then null;
  end;
end $$;
