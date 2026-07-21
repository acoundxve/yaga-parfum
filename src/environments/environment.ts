/**
 * Configuración de Yaga Parfum.
 *
 * 👉 Para conectar tu base de datos real:
 *    1. Entra a tu proyecto en https://supabase.com
 *    2. Copia "Project URL" y "anon public key" en Project Settings > API
 *    3. Pégalos abajo reemplazando los valores TU_...
 *
 * Si dejas los valores TU_... la app funciona igual, pero guardando
 * todo LOCALMENTE en el navegador (modo demo). Perfecto para probar.
 */
export const environment = {
  production: false,

  // --- Supabase ---
  supabaseUrl: 'https://wmmfzbpjvgvdknwzpxtq.supabase.co',
  supabaseAnonKey: 'sb_publishable_7gw7FJPjJy6SRrXLmOc1iA_patzSOg4',

  // --- Negocio ---
  // Tu número de WhatsApp con código de país, sin + ni espacios.
  // Ejemplo República Dominicana: 18095551234
  whatsappNumero: '18090000000',

  // Contraseña del panel de administrador (cámbiala).
  // En modo demo se usa esta. Con Supabase Auth puedes usar login por correo.
  adminPassword: 'yaga2026',

  nombreNegocio: 'Yaga Parfum',
  moneda: 'RD$',

  // --- Cálculo de decants ---
  // Capacidad del frasco original en ml (para el costo por ml).
  mlFrasco: 100,
  // Costo del envase/atomizador vacío del decant (RD$). 0 = ya incluido en el precio.
  costoEnvaseDecant: 0,
};
