-- ============================================================
--  Yaga Parfum · esquema de base de datos para Supabase
--  Cómo usarlo:
--    1. Entra a tu proyecto en supabase.com
--    2. Menú lateral > SQL Editor > New query
--    3. Pega TODO este archivo y presiona "Run"
-- ============================================================

-- ---------- Tabla de perfumes ----------
create table if not exists public.perfumes (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  marca       text default '',
  descripcion text default '',
  precio      numeric(10,2) not null default 0,
  stock       integer not null default 0,
  categoria   text default 'Unisex',
  imagen_url  text default '',
  frascos       jsonb default '[]',
  notas_salida  text default '',
  notas_corazon text default '',
  notas_fondo   text default '',
  created_at  timestamptz not null default now()
);

-- Si ya creaste la tabla antes, agrega las columnas de notas:
alter table public.perfumes add column if not exists notas_salida  text default '';
alter table public.perfumes add column if not exists notas_corazon text default '';
alter table public.perfumes add column if not exists notas_fondo   text default '';
alter table public.perfumes add column if not exists frascos       jsonb default '[]';

-- ---------- Tabla de pedidos (encargos) ----------
create table if not exists public.pedidos (
  id               uuid primary key default gen_random_uuid(),
  cliente_nombre   text not null,
  cliente_telefono text not null,
  nota             text default '',
  items            jsonb not null default '[]',
  total            numeric(10,2) not null default 0,
  estado           text not null default 'nuevo',
  created_at       timestamptz not null default now()
);

-- ============================================================
--  Seguridad (Row Level Security)
--  Para empezar rápido dejamos acceso público (anon).
--  ⚠️  Cuando quieras proteger la edición, restringe INSERT/UPDATE/DELETE
--      de "perfumes" a usuarios autenticados (Supabase Auth).
-- ============================================================
alter table public.perfumes enable row level security;
alter table public.pedidos  enable row level security;

-- Todos pueden ver el catálogo
create policy "perfumes_select" on public.perfumes
  for select using (true);

-- Demo: permitir gestionar el catálogo con la llave anon.
-- (Reemplaza estas 3 por reglas de auth cuando pongas login real.)
create policy "perfumes_insert" on public.perfumes for insert with check (true);
create policy "perfumes_update" on public.perfumes for update using (true);
create policy "perfumes_delete" on public.perfumes for delete using (true);

-- Cualquiera puede crear un pedido; solo el admin debería leerlos.
create policy "pedidos_insert" on public.pedidos for insert with check (true);
create policy "pedidos_select" on public.pedidos for select using (true);
create policy "pedidos_update" on public.pedidos for update using (true);

-- ============================================================
--  Almacenamiento de imágenes
--  Crea un bucket PÚBLICO llamado "perfumes":
--    Storage > New bucket > nombre: perfumes > Public: ON
--  O ejecuta esto:
-- ============================================================
insert into storage.buckets (id, name, public)
values ('perfumes', 'perfumes', true)
on conflict (id) do nothing;

-- Permitir subir y leer imágenes del bucket "perfumes"
create policy "img_public_read" on storage.objects
  for select using (bucket_id = 'perfumes');
create policy "img_public_upload" on storage.objects
  for insert with check (bucket_id = 'perfumes');
