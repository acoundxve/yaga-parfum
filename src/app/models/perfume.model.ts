/** Un tamaño de frasco completo con su propio precio y stock. */
export interface FrascoTamano {
  ml: number;
  precio: number;
  stock: number;
}

export interface Perfume {
  id: string;
  nombre: string;
  marca: string;
  descripcion: string;
  precio: number; // precio de referencia (frasco base / "desde")
  stock: number;
  imagenUrl: string;
  categoria: string;
  // Tamaños de frasco completo (ml + precio). Si está vacío se usa `precio`.
  frascos?: FrascoTamano[];
  // Notas olfativas (pirámide, estilo Fragrantica)
  notasSalida?: string;
  notasCorazon?: string;
  notasFondo?: string;
  createdAt?: string;
}

export function tieneNotas(p: Perfume): boolean {
  return !!(p.notasSalida || p.notasCorazon || p.notasFondo);
}

/** Tamaños de frasco del perfume (ordenados por ml). Fallback: `precio`/`stock` con mlDefault. */
export function frascosDe(p: Perfume, mlDefault: number): FrascoTamano[] {
  const f = (p.frascos ?? []).filter((x) => x.ml > 0 && x.precio > 0);
  return f.length
    ? [...f].sort((a, b) => a.ml - b.ml)
    : [{ ml: mlDefault, precio: p.precio, stock: p.stock }];
}

/** Precio más bajo entre los frascos (para mostrar "desde"). */
export function precioDesde(p: Perfume, mlDefault: number): number {
  return Math.min(...frascosDe(p, mlDefault).map((f) => f.precio));
}

export function tieneVariosFrascos(p: Perfume, mlDefault: number): boolean {
  return frascosDe(p, mlDefault).length > 1;
}

/** Stock total del perfume (suma de todos los tamaños). */
export function stockTotal(p: Perfume, mlDefault: number): number {
  const f = (p.frascos ?? []).filter((x) => x.ml > 0 && x.precio > 0);
  return f.length ? f.reduce((s, x) => s + (x.stock || 0), 0) : p.stock;
}

export interface ItemPedido {
  perfumeId: string;
  nombre: string;
  presentacion: string; // "Frasco 100 ml", "Decant 2 ml", etc.
  tipo: 'frasco' | 'decant';
  ml: number;
  precio: number; // precio unitario de esta presentación
  cantidad: number;
}

export interface Presentacion {
  label: string;
  tipo: 'frasco' | 'decant';
  ml: number;
  precio: number; // precio final de venta (RD$)
  stock: number; // unidades disponibles de esta presentación (frasco); decants: stock total
  // Desglose (para el administrador):
  costoLiquido: number; // costo del líquido del decant
  costoEnvase: number; // costo del envase vacío
  margen: number; // multiplicador de ganancia aplicado
  ganancia: number; // ganancia neta en dinero
}

const redondear5 = (n: number) => Math.round(n / 5) * 5;

/** Margen (multiplicador sobre el costo del líquido) según el tamaño del decant.
 *  Calibrado con frasco RD$2,900 / 100 ml: 2ml→250, 5ml→500, 10ml→850. */
export function margenDecant(ml: number): number {
  if (ml === 2) return 4.31; // +331% de ganancia
  if (ml === 5) return 3.45; // +245%
  if (ml === 10) return 2.93; // +193%
  return 3.0; // por defecto +200%
}

/**
 * Precio de un decant según:
 *   costo_por_ml = precioFrasco / mlFrasco
 *   costo_liquido = costo_por_ml * tamañoDecant
 *   precio = costo_liquido * margen + costo_envase   (redondeado a 5)
 */
export function calcularDecant(
  precioFrasco: number,
  mlFrasco: number,
  tamanoDecantMl: number,
  costoEnvase: number
): Presentacion {
  const costoPorMl = precioFrasco / mlFrasco;
  const costoLiquido = costoPorMl * tamanoDecantMl;
  const margen = margenDecant(tamanoDecantMl);
  const precio = redondear5(costoLiquido * margen + costoEnvase);
  const ganancia = Math.round(precio - costoLiquido - costoEnvase);
  return {
    label: `Decant ${tamanoDecantMl} ml`,
    tipo: 'decant',
    ml: tamanoDecantMl,
    precio,
    stock: 9999, // los decants no se limitan por unidades
    costoLiquido: Math.round(costoLiquido),
    costoEnvase,
    margen,
    ganancia,
  };
}

/** Opciones de compra: cada tamaño de frasco + decants (2/5/10 ml).
 *  Los decants se calculan a partir del frasco base (el más pequeño). */
export function presentaciones(
  p: Perfume,
  mlDefault: number,
  costoEnvase: number
): Presentacion[] {
  const frascos = frascosDe(p, mlDefault);
  const base = frascos[0]; // frasco de referencia para los decants
  const total = frascos.reduce((s, f) => s + (f.stock || 0), 0);
  const opciones: Presentacion[] = frascos.map((fr) => ({
    label: `Frasco ${fr.ml} ml`,
    tipo: 'frasco',
    ml: fr.ml,
    precio: fr.precio,
    stock: fr.stock || 0,
    costoLiquido: fr.precio,
    costoEnvase: 0,
    margen: 1,
    ganancia: 0,
  }));
  // Los decants solo se ofrecen si hay algún frasco en existencia.
  if (total > 0) {
    opciones.push(calcularDecant(base.precio, base.ml, 2, costoEnvase));
    opciones.push(calcularDecant(base.precio, base.ml, 5, costoEnvase));
    opciones.push(calcularDecant(base.precio, base.ml, 10, costoEnvase));
  }
  return opciones;
}

export interface Pedido {
  id: string;
  clienteNombre: string;
  clienteTelefono: string;
  nota: string;
  items: ItemPedido[];
  total: number;
  estado: 'nuevo' | 'atendido' | 'entregado';
  createdAt: string;
}

/** Estado del inventario para mostrar el badge correcto. */
export type EstadoStock =
  | { tipo: 'agotado' }
  | { tipo: 'pocas'; cantidad: number }
  | { tipo: 'disponible' };

export function estadoStock(stock: number): EstadoStock {
  if (stock <= 0) return { tipo: 'agotado' };
  if (stock < 5) return { tipo: 'pocas', cantidad: stock };
  return { tipo: 'disponible' };
}
