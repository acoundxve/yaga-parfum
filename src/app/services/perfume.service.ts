import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import {
  Perfume,
  Pedido,
  ItemPedido,
  Compra,
  Venta,
  Presentacion,
  diffFrascosParaCompra,
} from '../models/perfume.model';

const LS_PERFUMES = 'yaga_perfumes';
const LS_PEDIDOS = 'yaga_pedidos';
const LS_COMPRAS = 'yaga_compras';
const LS_VENTAS = 'yaga_ventas';
const BUCKET = 'perfumes';

/** Datos de ejemplo para el modo demo (primera vez). */
const SEED: Perfume[] = [
  {
    id: 'seed-1',
    nombre: 'Noir Absolu',
    marca: 'Yaga',
    descripcion: 'Amaderado intenso con notas de oud, ámbar y vainilla. Larga duración.',
    precio: 3200,
    stock: 12,
    categoria: 'Hombre',
    imagenUrl: '',
  },
  {
    id: 'seed-2',
    nombre: 'Rosa Eterna',
    marca: 'Yaga',
    descripcion: 'Floral elegante con rosa de Damasco, peonía y almizcle blanco.',
    precio: 2900,
    stock: 3,
    categoria: 'Mujer',
    imagenUrl: '',
  },
  {
    id: 'seed-3',
    nombre: 'Citrus Blu',
    marca: 'Yaga',
    descripcion: 'Fresco cítrico con bergamota, limón de Amalfi y cedro. Ideal de día.',
    precio: 2500,
    stock: 0,
    categoria: 'Unisex',
    imagenUrl: '',
  },
  {
    id: 'seed-4',
    nombre: 'Vainilla Gold',
    marca: 'Yaga',
    descripcion: 'Dulce y cálido: vainilla bourbon, caramelo y sándalo.',
    precio: 3100,
    stock: 8,
    categoria: 'Mujer',
    imagenUrl: '',
  },
];

@Injectable({ providedIn: 'root' })
export class PerfumeService {
  private sb = inject(SupabaseService);

  /** Señales reactivas que consumen las páginas. */
  readonly perfumes = signal<Perfume[]>([]);
  readonly pedidos = signal<Pedido[]>([]);
  readonly compras = signal<Compra[]>([]);
  readonly ventas = signal<Venta[]>([]);
  readonly cargando = signal<boolean>(false);

  get usaSupabase(): boolean {
    return this.sb.configurado;
  }

  // ---------- PERFUMES ----------

  async cargarPerfumes(): Promise<void> {
    this.cargando.set(true);
    try {
      if (this.usaSupabase) {
        const { data, error } = await this.sb.client!
          .from('perfumes')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) throw error;
        this.perfumes.set((data ?? []).map(fromRow));
      } else {
        this.perfumes.set(this.leerLocal<Perfume>(LS_PERFUMES, SEED));
      }
    } catch (e) {
      console.error('Error cargando perfumes:', e);
      this.perfumes.set(this.leerLocal<Perfume>(LS_PERFUMES, SEED));
    } finally {
      this.cargando.set(false);
    }
  }

  /** Guarda un perfume y devuelve la versión guardada (con su id real,
   *  importante para perfumes nuevos: Supabase/el modo local generan el id
   *  recién aquí, así que quien necesite ese id — p.ej. el registro de
   *  compras — debe leerlo del valor devuelto, no del `p` que se pasó). */
  async guardarPerfume(p: Perfume): Promise<Perfume> {
    if (this.usaSupabase) {
      const esUpdate =
        !!p.id && !p.id.startsWith('seed-') && !p.id.startsWith('local-');

      // Intenta guardar; si una columna opcional aún no existe en la BD
      // (p.ej. no corrieron el ALTER de 'frascos'), reintenta sin ella.
      const intentar = async (row: Record<string, unknown>) => {
        if (esUpdate) {
          return this.sb.client!.from('perfumes').update(row).eq('id', p.id).select().single();
        }
        delete (row as any).id;
        return this.sb.client!.from('perfumes').insert(row).select().single();
      };

      let row = toRow(p);
      let { data, error } = await intentar({ ...row });
      if (error) {
        const faltante = /column .*"?(\w+)"? .* does not exist|Could not find the '(\w+)'/i.exec(
          error.message || ''
        );
        const col = faltante?.[1] || faltante?.[2];
        if (col && col in row) {
          // reintenta sin la columna que falta
          const copia: Record<string, unknown> = { ...row };
          delete copia[col];
          const r2 = await intentar(copia);
          data = r2.data;
          error = r2.error;
        }
        if (error) throw error;
      }
      await this.cargarPerfumes();
      return data ? fromRow(data) : p;
    } else {
      const lista = [...this.perfumes()];
      const i = lista.findIndex((x) => x.id === p.id);
      const guardado = i >= 0 ? p : { ...p, id: p.id || 'local-' + Date.now() };
      if (i >= 0) {
        lista[i] = guardado;
      } else {
        lista.unshift(guardado);
      }
      this.perfumes.set(lista);
      this.guardarLocal(LS_PERFUMES, lista);
      return guardado;
    }
  }

  /**
   * Igual que `guardarPerfume`, pero además detecta incrementos de stock
   * (nuevo perfume, reabastecimiento, tamaño nuevo) y los registra como
   * una "compra" (capital invertido). Úsalo desde la UI del admin siempre
   * que el cambio venga de una persona ajustando inventario; los flujos
   * internos que solo descuentan stock (ventas) siguen usando
   * `guardarPerfume` directamente.
   */
  async guardarPerfumeConCompra(p: Perfume): Promise<void> {
    const anterior = this.perfumes().find((x) => x.id === p.id);
    const guardado = await this.guardarPerfume(p);

    const frascosAntes = anterior?.frascos;
    const frascosDespues = guardado.frascos;
    if ((frascosAntes && frascosAntes.length) || (frascosDespues && frascosDespues.length)) {
      const deltas = diffFrascosParaCompra(frascosAntes, frascosDespues);
      for (const d of deltas) {
        await this.registrarCompra({
          perfumeId: guardado.id,
          perfumeNombre: guardado.nombre,
          ml: d.ml,
          cantidad: d.cantidad,
          costoUnitario: d.costoUnitario,
          total: d.cantidad * d.costoUnitario,
          nota: '',
        });
      }
    } else {
      const delta = guardado.stock - (anterior?.stock ?? 0);
      if (delta > 0) {
        await this.registrarCompra({
          perfumeId: guardado.id,
          perfumeNombre: guardado.nombre,
          ml: 0,
          cantidad: delta,
          costoUnitario: guardado.costo ?? 0,
          total: delta * (guardado.costo ?? 0),
          nota: '',
        });
      }
    }
  }

  async eliminarPerfume(id: string): Promise<void> {
    if (this.usaSupabase) {
      const { error } = await this.sb.client!.from('perfumes').delete().eq('id', id);
      if (error) throw error;
      await this.cargarPerfumes();
    } else {
      const lista = this.perfumes().filter((x) => x.id !== id);
      this.perfumes.set(lista);
      this.guardarLocal(LS_PERFUMES, lista);
    }
  }

  /** Descuenta stock cuando entra un pedido. Solo el frasco completo (ml=0) resta.
   *  Registra una venta por cada item (frasco o decant) para el control financiero. */
  async descontarStock(
    items: ItemPedido[],
    contexto?: { pedidoId?: string; clienteNombre?: string }
  ): Promise<void> {
    const lista = [...this.perfumes()];
    for (const item of items) {
      const p = lista.find((x) => x.id === item.perfumeId);
      if (item.tipo === 'frasco' && p) {
        const frascos = (p.frascos ?? []).filter((f) => f.ml > 0 && f.precio > 0);
        if (frascos.length) {
          const fr = frascos.find((f) => f.ml === item.ml);
          if (fr) fr.stock = Math.max(0, (fr.stock || 0) - item.cantidad);
          p.frascos = frascos;
          p.stock = frascos.reduce((s, f) => s + (f.stock || 0), 0);
        } else {
          p.stock = Math.max(0, p.stock - item.cantidad);
        }
        await this.guardarPerfume(p);
      }

      const costoUnitario = this.costoDePresentacion(p, item);
      await this.registrarVenta({
        perfumeId: item.perfumeId,
        perfumeNombre: item.nombre,
        presentacion: item.presentacion,
        tipo: item.tipo,
        ml: item.ml,
        cantidad: item.cantidad,
        precioUnitario: item.precio,
        costoUnitario,
        ingreso: item.precio * item.cantidad,
        costo: costoUnitario * item.cantidad,
        ganancia: (item.precio - costoUnitario) * item.cantidad,
        origen: 'pedido',
        pedidoId: contexto?.pedidoId,
        clienteNombre: contexto?.clienteNombre,
        nota: '',
      });
    }
  }

  /** Costo de compra de una presentación vendida (frasco exacto o decant prorrateado). */
  private costoDePresentacion(p: Perfume | undefined, item: ItemPedido): number {
    if (!p) return 0;
    const frascos = (p.frascos ?? []).filter((f) => f.ml > 0 && f.precio > 0);
    if (item.tipo === 'frasco') {
      const fr = frascos.find((f) => f.ml === item.ml);
      return fr?.costo ?? p.costo ?? 0;
    }
    // Decant: prorratea desde el frasco base (el más pequeño).
    const base = [...frascos].sort((a, b) => a.ml - b.ml)[0];
    if (!base) return 0;
    const costoBase = base.costo ?? p.costo ?? 0;
    return (costoBase / base.ml) * item.ml;
  }

  /** Venta directa en persona ("venta rápida"): descuenta stock (si es frasco) y registra la venta.
   *  Devuelve la venta creada (con su id y fecha reales) para poder generar la factura. */
  async venderRapido(input: {
    perfumeId: string;
    presentacion: Presentacion;
    cantidad: number;
    precioUnitario: number;
    clienteNombre?: string;
    nota?: string;
  }): Promise<Venta> {
    const p = this.perfumes().find((x) => x.id === input.perfumeId);
    if (!p) throw new Error('Perfume no encontrado.');
    const { presentacion: pres, cantidad } = input;

    if (pres.tipo === 'frasco') {
      const frascos = (p.frascos ?? []).filter((f) => f.ml > 0 && f.precio > 0);
      const fr = frascos.find((f) => f.ml === pres.ml);
      const disponible = frascos.length ? fr?.stock ?? 0 : p.stock;
      if (disponible < cantidad) {
        throw new Error(`Stock insuficiente: quedan ${disponible} unidades de ${pres.ml} ml.`);
      }
      if (frascos.length && fr) {
        fr.stock = Math.max(0, (fr.stock || 0) - cantidad);
        p.frascos = frascos;
        p.stock = frascos.reduce((s, f) => s + (f.stock || 0), 0);
      } else {
        p.stock = Math.max(0, p.stock - cantidad);
      }
      await this.guardarPerfume(p);
    }
    // Los decants no se limitan por unidades (igual que en el catálogo).

    return this.registrarVenta({
      perfumeId: p.id,
      perfumeNombre: p.nombre,
      presentacion: pres.label,
      tipo: pres.tipo,
      ml: pres.ml,
      cantidad,
      precioUnitario: input.precioUnitario,
      costoUnitario: pres.costoUnitario,
      ingreso: input.precioUnitario * cantidad,
      costo: pres.costoUnitario * cantidad,
      ganancia: (input.precioUnitario - pres.costoUnitario) * cantidad,
      origen: 'rapida',
      clienteNombre: input.clienteNombre,
      nota: input.nota,
    });
  }

  // ---------- IMPORTAR CATÁLOGO (desde el PDF) ----------

  /**
   * Carga los 391 perfumes extraídos del PDF (public/catalogo_data.json)
   * directamente en Supabase desde el navegador. Reemplaza el catálogo actual.
   * Devuelve cuántos se insertaron. `onProgress` reporta avance 0..1.
   */
  async importarCatalogo(
    onProgress?: (hechos: number, total: number) => void
  ): Promise<number> {
    if (!this.usaSupabase) {
      throw new Error('Conecta Supabase antes de importar.');
    }
    const res = await fetch('/catalogo_data.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('No se encontró catalogo_data.json');
    const data: any[] = await res.json();

    const rows = data.map((d) => ({
      nombre: d.nombre,
      marca: d.marca,
      precio: d.precio,
      stock: d.stock ?? 10,
      categoria: d.categoria,
      imagen_url: d.imagen_url,
      descripcion: d.descripcion ?? '',
      frascos: d.frascos ?? [],
      notas_salida: d.notas_salida ?? '',
      notas_corazon: d.notas_corazon ?? '',
      notas_fondo: d.notas_fondo ?? '',
    }));

    // Vaciar catálogo actual (filtro que matchea todas las filas)
    const del = await this.sb.client!.from('perfumes').delete().gte('precio', -1);
    if (del.error) throw del.error;

    // Insertar por lotes de 100
    const lote = 100;
    let hechos = 0;
    for (let i = 0; i < rows.length; i += lote) {
      const parte = rows.slice(i, i + lote);
      const { error } = await this.sb.client!.from('perfumes').insert(parte);
      if (error) throw error;
      hechos += parte.length;
      onProgress?.(hechos, rows.length);
    }

    await this.cargarPerfumes();
    return hechos;
  }

  // ---------- IMÁGENES ----------

  /** Sube una imagen y devuelve su URL pública (o data URL en modo demo). */
  async subirImagen(file: File): Promise<string> {
    if (this.usaSupabase) {
      const nombre = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
      const { error } = await this.sb.client!.storage
        .from(BUCKET)
        .upload(nombre, file, { cacheControl: '3600', upsert: false });
      if (error) throw error;
      const { data } = this.sb.client!.storage.from(BUCKET).getPublicUrl(nombre);
      return data.publicUrl;
    }
    // Demo: convertir a base64 para guardar en localStorage
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ---------- PEDIDOS ----------

  async crearPedido(pedido: Pedido): Promise<void> {
    let pedidoId = pedido.id;
    if (this.usaSupabase) {
      const row = {
        cliente_nombre: pedido.clienteNombre,
        cliente_telefono: pedido.clienteTelefono,
        nota: pedido.nota,
        items: pedido.items,
        total: pedido.total,
        estado: pedido.estado,
      };
      const { data, error } = await this.sb.client!
        .from('pedidos')
        .insert(row)
        .select('id')
        .single();
      if (error) throw error;
      pedidoId = data?.id ?? pedidoId;
    } else {
      const lista = [pedido, ...this.leerLocal<Pedido>(LS_PEDIDOS, [])];
      this.guardarLocal(LS_PEDIDOS, lista);
      this.pedidos.set(lista);
    }
    await this.descontarStock(pedido.items, {
      pedidoId,
      clienteNombre: pedido.clienteNombre,
    });
  }

  async cargarPedidos(): Promise<void> {
    if (this.usaSupabase) {
      const { data, error } = await this.sb.client!
        .from('pedidos')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        console.error(error);
        return;
      }
      this.pedidos.set(
        (data ?? []).map((r: any) => ({
          id: r.id,
          clienteNombre: r.cliente_nombre,
          clienteTelefono: r.cliente_telefono,
          nota: r.nota,
          items: r.items ?? [],
          total: Number(r.total),
          estado: r.estado,
          createdAt: r.created_at,
        }))
      );
    } else {
      this.pedidos.set(this.leerLocal<Pedido>(LS_PEDIDOS, []));
    }
  }

  async actualizarEstadoPedido(id: string, estado: Pedido['estado']): Promise<void> {
    if (this.usaSupabase) {
      const { error } = await this.sb.client!
        .from('pedidos')
        .update({ estado })
        .eq('id', id);
      if (error) throw error;
      await this.cargarPedidos();
    } else {
      const lista = this.pedidos().map((p) => (p.id === id ? { ...p, estado } : p));
      this.pedidos.set(lista);
      this.guardarLocal(LS_PEDIDOS, lista);
    }
  }

  // ---------- FINANZAS: compras (inversión) y ventas ----------

  async cargarCompras(): Promise<void> {
    if (this.usaSupabase) {
      const { data, error } = await this.sb.client!
        .from('compras')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Error cargando compras:', error);
        return;
      }
      this.compras.set((data ?? []).map(fromRowCompra));
    } else {
      this.compras.set(this.leerLocal<Compra>(LS_COMPRAS, []));
    }
  }

  async cargarVentas(): Promise<void> {
    if (this.usaSupabase) {
      const { data, error } = await this.sb.client!
        .from('ventas')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Error cargando ventas:', error);
        return;
      }
      this.ventas.set((data ?? []).map(fromRowVenta));
    } else {
      this.ventas.set(this.leerLocal<Venta>(LS_VENTAS, []));
    }
  }

  /** Registra una compra (inversión). Nunca lanza: perder un registro del
   *  histórico no debe romper el guardado real de inventario. */
  private async registrarCompra(c: Omit<Compra, 'id' | 'createdAt'>): Promise<void> {
    try {
      if (this.usaSupabase) {
        const row = {
          perfume_id: c.perfumeId,
          perfume_nombre: c.perfumeNombre,
          ml: c.ml,
          cantidad: c.cantidad,
          costo_unitario: c.costoUnitario,
          total: c.total,
          nota: c.nota,
        };
        const { error } = await this.sb.client!.from('compras').insert(row);
        if (error) throw error;
        await this.cargarCompras();
      } else {
        const nueva: Compra = { ...c, id: 'local-' + Date.now() + Math.random(), createdAt: new Date().toISOString() };
        const lista = [nueva, ...this.compras()];
        this.compras.set(lista);
        this.guardarLocal(LS_COMPRAS, lista);
      }
    } catch (e) {
      console.error('No se pudo registrar la compra:', e);
    }
  }

  /** Registra una venta (ingreso/ganancia) y devuelve la venta guardada (con
   *  id y fecha reales, útiles para la factura). El registro del ledger
   *  nunca lanza: si falla (p.ej. la tabla `ventas` aún no existe), se
   *  devuelve igual un objeto con id/fecha generados localmente, para no
   *  bloquear la venta ya realizada ni la factura del cliente. */
  private async registrarVenta(v: Omit<Venta, 'id' | 'createdAt'>): Promise<Venta> {
    const respaldo: Venta = {
      ...v,
      id: 'local-' + Date.now() + Math.random(),
      createdAt: new Date().toISOString(),
    };
    try {
      if (this.usaSupabase) {
        const row = {
          perfume_id: v.perfumeId,
          perfume_nombre: v.perfumeNombre,
          presentacion: v.presentacion,
          tipo: v.tipo,
          ml: v.ml,
          cantidad: v.cantidad,
          precio_unitario: v.precioUnitario,
          costo_unitario: v.costoUnitario,
          ingreso: v.ingreso,
          costo: v.costo,
          ganancia: v.ganancia,
          origen: v.origen,
          pedido_id: v.pedidoId ?? null,
          cliente_nombre: v.clienteNombre ?? '',
          nota: v.nota ?? '',
        };
        const { data, error } = await this.sb.client!.from('ventas').insert(row).select().single();
        if (error) throw error;
        await this.cargarVentas();
        return data ? fromRowVenta(data) : respaldo;
      } else {
        const lista = [respaldo, ...this.ventas()];
        this.ventas.set(lista);
        this.guardarLocal(LS_VENTAS, lista);
        return respaldo;
      }
    } catch (e) {
      console.error('No se pudo registrar la venta:', e);
      return respaldo;
    }
  }

  // ---------- localStorage helpers ----------

  private leerLocal<T>(clave: string, porDefecto: T[]): T[] {
    try {
      const raw = localStorage.getItem(clave);
      if (raw) return JSON.parse(raw) as T[];
      if (porDefecto.length) this.guardarLocal(clave, porDefecto);
      return porDefecto;
    } catch {
      return porDefecto;
    }
  }

  private guardarLocal<T>(clave: string, valor: T[]): void {
    try {
      localStorage.setItem(clave, JSON.stringify(valor));
    } catch (e) {
      console.warn('No se pudo guardar en localStorage', e);
    }
  }
}

// ---------- mappers Supabase <-> modelo ----------

function fromRow(r: any): Perfume {
  return {
    id: r.id,
    nombre: r.nombre,
    marca: r.marca ?? '',
    descripcion: r.descripcion ?? '',
    precio: Number(r.precio),
    stock: Number(r.stock),
    categoria: r.categoria ?? '',
    imagenUrl: r.imagen_url ?? '',
    frascos: Array.isArray(r.frascos) ? r.frascos : [],
    notasSalida: r.notas_salida ?? '',
    notasCorazon: r.notas_corazon ?? '',
    notasFondo: r.notas_fondo ?? '',
    costo: Number(r.costo ?? 0),
    createdAt: r.created_at,
  };
}

function toRow(p: Perfume): Record<string, unknown> {
  return {
    id: p.id,
    nombre: p.nombre,
    marca: p.marca,
    descripcion: p.descripcion,
    precio: p.precio,
    stock: p.stock,
    categoria: p.categoria,
    imagen_url: p.imagenUrl,
    frascos: p.frascos ?? [],
    notas_salida: p.notasSalida ?? '',
    notas_corazon: p.notasCorazon ?? '',
    notas_fondo: p.notasFondo ?? '',
    costo: p.costo ?? 0,
  };
}

function fromRowCompra(r: any): Compra {
  return {
    id: r.id,
    perfumeId: r.perfume_id ?? '',
    perfumeNombre: r.perfume_nombre ?? '',
    ml: Number(r.ml ?? 0),
    cantidad: Number(r.cantidad ?? 0),
    costoUnitario: Number(r.costo_unitario ?? 0),
    total: Number(r.total ?? 0),
    nota: r.nota ?? '',
    createdAt: r.created_at,
  };
}

function fromRowVenta(r: any): Venta {
  return {
    id: r.id,
    perfumeId: r.perfume_id ?? '',
    perfumeNombre: r.perfume_nombre ?? '',
    presentacion: r.presentacion ?? '',
    tipo: r.tipo ?? 'frasco',
    ml: Number(r.ml ?? 0),
    cantidad: Number(r.cantidad ?? 0),
    precioUnitario: Number(r.precio_unitario ?? 0),
    costoUnitario: Number(r.costo_unitario ?? 0),
    ingreso: Number(r.ingreso ?? 0),
    costo: Number(r.costo ?? 0),
    ganancia: Number(r.ganancia ?? 0),
    origen: r.origen ?? 'pedido',
    pedidoId: r.pedido_id ?? undefined,
    clienteNombre: r.cliente_nombre ?? '',
    nota: r.nota ?? '',
    createdAt: r.created_at,
  };
}
