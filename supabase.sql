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

-- ============================================================
--  Costo de compra, inversión y ventas (control financiero)
-- ============================================================

-- Costo de compra de referencia (fallback cuando no hay desglose de frascos).
alter table public.perfumes add column if not exists costo numeric(10,2) not null default 0;
-- El costo por tamaño vive DENTRO de cada objeto del jsonb `frascos`
-- como "costo" (ej: {"ml":100,"precio":2900,"stock":10,"costo":1200}).

-- ---------- Tabla de compras (histórico de inversión) ----------
create table if not exists public.compras (
  id             uuid primary key default gen_random_uuid(),
  perfume_id     uuid references public.perfumes(id) on delete set null,
  perfume_nombre text not null,
  ml             integer not null default 0, -- 0 = sin desglose de frascos
  cantidad       integer not null,
  costo_unitario numeric(10,2) not null default 0,
  total          numeric(10,2) not null default 0,
  nota           text default '',
  created_at     timestamptz not null default now()
);

-- ---------- Tabla de ventas (histórico de ingresos/ganancia) ----------
create table if not exists public.ventas (
  id              uuid primary key default gen_random_uuid(),
  perfume_id      uuid references public.perfumes(id) on delete set null,
  perfume_nombre  text not null,
  presentacion    text not null default '', -- "Frasco 100 ml", "Decant 5 ml"
  tipo            text not null default 'frasco', -- 'frasco' | 'decant'
  ml              integer not null default 0,
  cantidad        integer not null,
  precio_unitario numeric(10,2) not null default 0,
  costo_unitario  numeric(10,2) not null default 0,
  ingreso         numeric(10,2) not null default 0, -- precio_unitario * cantidad
  costo           numeric(10,2) not null default 0, -- costo_unitario * cantidad
  ganancia        numeric(10,2) not null default 0, -- ingreso - costo
  origen          text not null default 'pedido', -- 'pedido' | 'rapida'
  pedido_id       uuid references public.pedidos(id) on delete set null,
  cliente_nombre  text default '',
  nota            text default '',
  created_at      timestamptz not null default now()
);

-- RLS: mismo criterio abierto que perfumes/pedidos. Son ledgers de solo
-- inserción (no hay policy de update/delete): nunca se edita un registro.
alter table public.compras enable row level security;
alter table public.ventas  enable row level security;

create policy "compras_select" on public.compras for select using (true);
create policy "compras_insert" on public.compras for insert with check (true);

create policy "ventas_select" on public.ventas for select using (true);
create policy "ventas_insert" on public.ventas for insert with check (true);

-- ============================================================
--  Permitir desactivar decants por producto (colonias, cremas, etc.
--  que no tiene sentido vender en muestras de 2/5/10 ml)
-- ============================================================
alter table public.perfumes add column if not exists permite_decants boolean not null default true;
