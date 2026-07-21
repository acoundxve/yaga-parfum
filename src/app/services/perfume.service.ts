import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Perfume, Pedido, ItemPedido } from '../models/perfume.model';

const LS_PERFUMES = 'yaga_perfumes';
const LS_PEDIDOS = 'yaga_pedidos';
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

  async guardarPerfume(p: Perfume): Promise<void> {
    if (this.usaSupabase) {
      const esUpdate =
        !!p.id && !p.id.startsWith('seed-') && !p.id.startsWith('local-');

      // Intenta guardar; si una columna opcional aún no existe en la BD
      // (p.ej. no corrieron el ALTER de 'frascos'), reintenta sin ella.
      const intentar = async (row: Record<string, unknown>) => {
        if (esUpdate) {
          return this.sb.client!.from('perfumes').update(row).eq('id', p.id);
        }
        delete (row as any).id;
        return this.sb.client!.from('perfumes').insert(row);
      };

      let row = toRow(p);
      let { error } = await intentar({ ...row });
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
          error = r2.error;
        }
        if (error) throw error;
      }
      await this.cargarPerfumes();
    } else {
      const lista = [...this.perfumes()];
      const i = lista.findIndex((x) => x.id === p.id);
      if (i >= 0) {
        lista[i] = p;
      } else {
        lista.unshift({ ...p, id: p.id || 'local-' + Date.now() });
      }
      this.perfumes.set(lista);
      this.guardarLocal(LS_PERFUMES, lista);
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

  /** Descuenta stock cuando entra un pedido. Solo el frasco completo (ml=0) resta. */
  async descontarStock(items: ItemPedido[]): Promise<void> {
    const lista = [...this.perfumes()];
    for (const item of items) {
      if (item.tipo !== 'frasco') continue; // los decants no descuentan frascos
      const p = lista.find((x) => x.id === item.perfumeId);
      if (!p) continue;
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
    if (this.usaSupabase) {
      const row = {
        cliente_nombre: pedido.clienteNombre,
        cliente_telefono: pedido.clienteTelefono,
        nota: pedido.nota,
        items: pedido.items,
        total: pedido.total,
        estado: pedido.estado,
      };
      const { error } = await this.sb.client!.from('pedidos').insert(row);
      if (error) throw error;
    } else {
      const lista = [pedido, ...this.leerLocal<Pedido>(LS_PEDIDOS, [])];
      this.guardarLocal(LS_PEDIDOS, lista);
      this.pedidos.set(lista);
    }
    await this.descontarStock(pedido.items);
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
  };
}
