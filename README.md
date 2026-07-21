# Yaga Parfum 🧴

Catálogo digital de perfumes con **lado cliente** (ver precios y hacer encargos) y **lado administrador** (subir imágenes, controlar inventario y ver pedidos). Hecho en **Angular 19** y conectado a **Supabase**, listo para desplegar en **Vercel**.

## ¿Qué hace?

- **Cliente:** ve el catálogo, busca y filtra por categoría, arma su carrito y envía el encargo. El pedido se **guarda** y además se **abre WhatsApp** con el mensaje listo.
- **Inventario automático:**
  - Cuando el stock llega a **0** → la tarjeta dice **AGOTADO** y no se puede encargar.
  - Cuando quedan **menos de 5** → muestra **"¡Solo quedan X!"** al cliente y al admin.
- **Administrador:** entra con contraseña, crea/edita/elimina perfumes, sube imágenes, ajusta stock y revisa los pedidos recibidos.

> Funciona en **modo demo** (guardando en el navegador) sin configurar nada. Para datos reales en la nube, conecta Supabase (abajo).

---

## 1. Correr en tu computadora

Necesitas [Node.js](https://nodejs.org) instalado. En la carpeta del proyecto:

```bash
npm install
npm start
```

Abre **http://localhost:4200**

- Catálogo (cliente): `/`
- Admin: `/login` → contraseña por defecto **`yaga2026`**

---

## 2. Conectar Supabase (datos reales + imágenes)

1. Crea un proyecto gratis en <https://supabase.com>.
2. Ve a **SQL Editor**, pega el contenido de **`supabase.sql`** y pulsa **Run**. Esto crea las tablas `perfumes` y `pedidos` y el bucket de imágenes.
3. Ve a **Project Settings → API** y copia:
   - **Project URL**
   - **anon public key**
4. Abre **`src/environments/environment.ts`** y reemplaza:

```ts
supabaseUrl: 'https://xxxxx.supabase.co',
supabaseAnonKey: 'eyJhbGci...tu-llave...',
whatsappNumero: '18095551234',   // tu WhatsApp con código de país, sin +
adminPassword: 'tu-clave-secreta',
```

Reinicia (`npm start`). Arriba en el panel verás **"Conectado a Supabase"**.

---

## 2b. Cargar tu catálogo (391 perfumes del PDF)

Ya extraje del PDF los **391 perfumes** con su imagen, marca, nombre, precio y categoría:

- Las **fotos** están en `public/perfumes/` (recortadas del catálogo).
- El archivo **`supabase_import.sql`** contiene todos los `INSERT`.

Tienes dos formas de cargarlos (elige una):

**A) Con un botón (fácil, sin SQL):** entra al panel de admin → pestaña **Inventario** → botón **"⬇ Importar catálogo del PDF (391)"**. Se cargan solos en tu Supabase desde el navegador. (Solo aparece si Supabase está conectado.)

**B) Con SQL:** en Supabase → **SQL Editor → New query** → pega **`supabase_import.sql`** → **Run**.

Cualquiera de las dos requiere haber ejecutado antes `supabase.sql` (para crear las tablas). Ambas reemplazan el catálogo actual por los 391 perfumes.

Notas:
- El **stock inicial es 10** para todos; ajústalo desde el panel según tu inventario real.
- Precios en RD$. Los que tienen dos presentaciones lo indican en la descripción.
- Las imágenes se sirven desde el propio sitio (`/perfumes/...`), funcionan en local y en Vercel sin configurar Storage.

---

## 3. Publicar en Vercel

1. Sube este proyecto a un repositorio de GitHub.
2. En <https://vercel.com> → **Add New → Project** → importa el repo.
3. Vercel detecta la configuración de `vercel.json` automáticamente:
   - Build: `npm run build`
   - Output: `dist/yaga-parfum/browser`
4. **Deploy.** ¡Listo!

> Tip de seguridad: la contraseña del admin y las llaves están en `environment.ts`. La **anon key** de Supabase es pública por diseño (protégete con las políticas RLS del `supabase.sql`). Para un login de admin más fuerte, activa **Supabase Auth** por correo.

---

## Imagen de fondo (Light Yagami)

El fondo usa un **placeholder** en `public/fondo-yaga.svg`. Para poner tu imagen real:

1. Guarda tu imagen (Light Yagami sosteniendo los 2 perfumes) como **`public/fondo-yaga.jpg`**.
2. En `src/styles.css`, en `.fondo-yaga`, cambia `url('/fondo-yaga.svg')` por `url('/fondo-yaga.jpg')`.

Recomendado: imagen vertical/grande (mínimo 1600px de ancho) para que se vea nítida.

---

## Estructura

```
src/app/
  models/         Perfume, Pedido y lógica de estado de stock
  services/       Supabase, datos (con respaldo local), carrito, auth
  guards/         protección de la ruta /admin
  pages/
    catalogo/     lado del cliente (catálogo + carrito + encargo)
    admin/        panel (inventario + pedidos)
    admin-login/  entrada del administrador
  components/
    perfume-card/ tarjeta de perfume reutilizable
public/           favicon y fondo (reemplazable)
supabase.sql      esquema de base de datos
vercel.json       configuración de despliegue
```
