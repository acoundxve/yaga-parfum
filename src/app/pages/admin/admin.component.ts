import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PerfumeService } from '../../services/perfume.service';
import {
  Perfume,
  Presentacion,
  estadoStock,
  presentaciones,
} from '../../models/perfume.model';
import { environment } from '../../../environments/environment';

function vacio(): Perfume {
  return {
    id: '',
    nombre: '',
    marca: 'Yaga',
    descripcion: '',
    precio: 0,
    stock: 0,
    categoria: 'Unisex',
    imagenUrl: '',
    frascos: [{ ml: 100, precio: 0, stock: 0 }],
    notasSalida: '',
    notasCorazon: '',
    notasFondo: '',
  };
}

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin.component.html',
})
export class AdminComponent implements OnInit {
  private data = inject(PerfumeService);

  moneda = environment.moneda;
  perfumes = this.data.perfumes;
  pedidos = this.data.pedidos;
  usaSupabase = this.data.usaSupabase;

  tab = signal<'inventario' | 'pedidos'>('inventario');
  buscarInv = signal('');
  ordenInv = signal<'reciente' | 'az' | 'za' | 'precio-asc' | 'precio-desc' | 'stock-asc' | 'stock-desc'>('reciente');
  editando = signal<Perfume | null>(null);
  guardando = signal(false);
  subiendo = signal(false);

  importando = signal(false);
  importProgreso = signal(0);
  importMsg = signal('');

  totalInventario = computed(() =>
    this.perfumes().reduce((s, p) => s + p.stock, 0)
  );
  bajoStock = computed(() =>
    this.perfumes().filter((p) => p.stock > 0 && p.stock < 5).length
  );
  agotados = computed(() => this.perfumes().filter((p) => p.stock <= 0).length);
  pedidosNuevos = computed(() =>
    this.pedidos().filter((p) => p.estado === 'nuevo').length
  );

  /** Inventario filtrado por búsqueda y ordenado según la opción elegida. */
  perfumesFiltrados = computed(() => {
    const q = this.buscarInv().toLowerCase().trim();
    const lista = this.perfumes().filter(
      (p) =>
        !q ||
        p.nombre.toLowerCase().includes(q) ||
        p.marca.toLowerCase().includes(q)
    );
    const nom = (p: Perfume) => `${p.marca} ${p.nombre}`.trim().toLowerCase();
    switch (this.ordenInv()) {
      case 'az':
        return [...lista].sort((a, b) => nom(a).localeCompare(nom(b)));
      case 'za':
        return [...lista].sort((a, b) => nom(b).localeCompare(nom(a)));
      case 'precio-asc':
        return [...lista].sort((a, b) => a.precio - b.precio);
      case 'precio-desc':
        return [...lista].sort((a, b) => b.precio - a.precio);
      case 'stock-asc':
        return [...lista].sort((a, b) => a.stock - b.stock);
      case 'stock-desc':
        return [...lista].sort((a, b) => b.stock - a.stock);
      default:
        return lista;
    }
  });

  est = estadoStock;
  mlFrasco = environment.mlFrasco;
  costoEnvase = environment.costoEnvaseDecant;

  /** Decants (2/5/10 ml) con su desglose de ganancia para el perfume en edición. */
  decants(p: Perfume): Presentacion[] {
    return presentaciones(p, this.mlFrasco, this.costoEnvase).filter(
      (x) => x.tipo === 'decant'
    );
  }

  agregarFrasco() {
    const p = this.editando();
    if (!p) return;
    const frascos = [...(p.frascos ?? []), { ml: 0, precio: 0, stock: 0 }];
    this.editando.set({ ...p, frascos });
  }

  quitarFrasco(i: number) {
    const p = this.editando();
    if (!p) return;
    const frascos = (p.frascos ?? []).filter((_, idx) => idx !== i);
    this.editando.set({
      ...p,
      frascos: frascos.length ? frascos : [{ ml: 100, precio: 0, stock: 0 }],
    });
  }

  async ngOnInit() {
    await Promise.all([this.data.cargarPerfumes(), this.data.cargarPedidos()]);
  }

  nuevo() {
    this.editando.set(vacio());
  }

  editar(p: Perfume) {
    const frascos =
      p.frascos && p.frascos.length
        ? p.frascos.map((f) => ({ ml: f.ml, precio: f.precio, stock: f.stock ?? 0 }))
        : [{ ml: 100, precio: p.precio || 0, stock: p.stock || 0 }];
    this.editando.set({ ...p, frascos });
  }

  cancelar() {
    this.editando.set(null);
  }

  async onImagen(evt: Event) {
    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0];
    const p = this.editando();
    if (!file || !p) return;
    this.subiendo.set(true);
    try {
      const url = await this.data.subirImagen(file);
      this.editando.set({ ...p, imagenUrl: url });
    } catch (e) {
      console.error(e);
      alert('No se pudo subir la imagen.');
    } finally {
      this.subiendo.set(false);
    }
  }

  async guardar() {
    const p = this.editando();
    if (!p) return;
    if (!p.nombre.trim()) {
      alert('El perfume necesita un nombre.');
      return;
    }
    // Limpiar frascos vacíos y sincronizar precio de referencia (el más bajo) y stock total
    const frascos = (p.frascos ?? [])
      .map((f) => ({
        ml: Number(f.ml) || 0,
        precio: Number(f.precio) || 0,
        stock: Number(f.stock) || 0,
      }))
      .filter((f) => f.ml > 0 && f.precio > 0);
    const precioRef = frascos.length
      ? Math.min(...frascos.map((f) => f.precio))
      : p.precio;
    const stockRef = frascos.length
      ? frascos.reduce((s, f) => s + f.stock, 0)
      : p.stock;
    const limpio = { ...p, frascos, precio: precioRef, stock: stockRef };

    this.guardando.set(true);
    try {
      await this.data.guardarPerfume(limpio);
      this.editando.set(null);
    } catch (e) {
      console.error(e);
      alert('No se pudo guardar. Revisa la conexión con Supabase.');
    } finally {
      this.guardando.set(false);
    }
  }

  async eliminar(p: Perfume) {
    if (!confirm(`¿Eliminar "${p.nombre}" del catálogo?`)) return;
    try {
      await this.data.eliminarPerfume(p.id);
    } catch (e) {
      console.error(e);
      alert('No se pudo eliminar.');
    }
  }

  /** Ajuste rápido de stock desde la tabla (+/-). Si hay tamaños, ajusta el primero. */
  async ajustarStock(p: Perfume, delta: number) {
    const frascos = (p.frascos ?? []).filter((f) => f.ml > 0 && f.precio > 0);
    if (frascos.length) {
      const copia = frascos.map((f) => ({ ...f }));
      copia[0].stock = Math.max(0, (copia[0].stock || 0) + delta);
      const stock = copia.reduce((s, f) => s + (f.stock || 0), 0);
      await this.data.guardarPerfume({ ...p, frascos: copia, stock });
    } else {
      await this.data.guardarPerfume({ ...p, stock: Math.max(0, p.stock + delta) });
    }
  }

  async cambiarEstadoPedido(id: string, estado: 'nuevo' | 'atendido' | 'entregado') {
    await this.data.actualizarEstadoPedido(id, estado);
  }

  get puedeImportar(): boolean {
    return this.usaSupabase;
  }

  async importarCatalogo() {
    if (!this.usaSupabase) {
      alert('Primero conecta Supabase (environment.ts) y ejecuta supabase.sql.');
      return;
    }
    if (
      !confirm(
        'Esto reemplaza el catálogo actual con los 391 perfumes del PDF. ¿Continuar?'
      )
    )
      return;
    this.importando.set(true);
    this.importProgreso.set(0);
    this.importMsg.set('Importando…');
    try {
      const n = await this.data.importarCatalogo((hechos, total) => {
        this.importProgreso.set(Math.round((hechos / total) * 100));
        this.importMsg.set(`Importando ${hechos} / ${total}…`);
      });
      this.importMsg.set(`✅ ${n} perfumes importados.`);
    } catch (e: any) {
      console.error(e);
      this.importMsg.set('❌ Error: ' + (e?.message ?? 'no se pudo importar'));
      alert(
        'No se pudo importar. Verifica que ejecutaste supabase.sql (tablas creadas) y que las políticas permiten insertar.'
      );
    } finally {
      this.importando.set(false);
    }
  }
}
