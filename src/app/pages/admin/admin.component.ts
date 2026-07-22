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
import { generarFacturaPdf } from '../../utils/factura-pdf';

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
    frascos: [{ ml: 100, precio: 0, stock: 0, costo: 0 }],
    notasSalida: '',
    notasCorazon: '',
    notasFondo: '',
    costo: 0,
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
  compras = this.data.compras;
  ventas = this.data.ventas;
  usaSupabase = this.data.usaSupabase;

  tab = signal<'inventario' | 'pedidos' | 'finanzas' | 'venta-rapida'>('inventario');
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

  // ---------- Finanzas ----------
  capitalInvertido = computed(() => this.compras().reduce((s, c) => s + c.total, 0));
  ingresosVentas = computed(() => this.ventas().reduce((s, v) => s + v.ingreso, 0));
  costoVendido = computed(() => this.ventas().reduce((s, v) => s + v.costo, 0));
  gananciaNeta = computed(() => this.ingresosVentas() - this.costoVendido());
  porcentajeRecuperado = computed(() => {
    const inv = this.capitalInvertido();
    return inv > 0 ? Math.min(100, Math.round((this.costoVendido() / inv) * 100)) : 0;
  });
  ventasRecientes = computed(() => this.ventas().slice(0, 20));
  ventasRapidasRecientes = computed(() =>
    this.ventas().filter((v) => v.origen === 'rapida').slice(0, 20)
  );

  // ---------- Venta rápida ----------
  vrPerfumeId = signal('');
  vrBusqueda = signal('');
  vrPresentacion = signal<Presentacion | null>(null);
  vrCantidad = signal(1);
  vrPrecio = signal(0);
  vrCliente = signal('');
  vrNota = signal('');
  vrGuardando = signal(false);
  vrMsg = signal('');

  vrPerfumeSeleccionado = computed(
    () => this.perfumes().find((x) => x.id === this.vrPerfumeId()) ?? null
  );

  /** Resultados del buscador de perfumes (como en el catálogo), solo mientras no haya uno elegido. */
  vrResultados = computed(() => {
    const q = this.vrBusqueda().toLowerCase().trim();
    if (!q) return [];
    return this.perfumes()
      .filter((p) => `${p.marca} ${p.nombre}`.toLowerCase().includes(q))
      .slice(0, 8);
  });

  vrPresentaciones = computed(() => {
    const p = this.vrPerfumeSeleccionado();
    return p ? presentaciones(p, this.mlFrasco, this.costoEnvase) : [];
  });

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
    const frascos = [...(p.frascos ?? []), { ml: 0, precio: 0, stock: 0, costo: 0 }];
    this.editando.set({ ...p, frascos });
  }

  quitarFrasco(i: number) {
    const p = this.editando();
    if (!p) return;
    const frascos = (p.frascos ?? []).filter((_, idx) => idx !== i);
    this.editando.set({
      ...p,
      frascos: frascos.length ? frascos : [{ ml: 100, precio: 0, stock: 0, costo: 0 }],
    });
  }

  async ngOnInit() {
    await Promise.all([
      this.data.cargarPerfumes(),
      this.data.cargarPedidos(),
      this.data.cargarCompras(),
      this.data.cargarVentas(),
    ]);
  }

  nuevo() {
    this.editando.set(vacio());
  }

  editar(p: Perfume) {
    const frascos =
      p.frascos && p.frascos.length
        ? p.frascos.map((f) => ({ ml: f.ml, precio: f.precio, stock: f.stock ?? 0, costo: f.costo ?? 0 }))
        : [{ ml: 100, precio: p.precio || 0, stock: p.stock || 0, costo: p.costo || 0 }];
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
        costo: Number(f.costo) || 0,
      }))
      .filter((f) => f.ml > 0 && f.precio > 0);
    const precioRef = frascos.length
      ? Math.min(...frascos.map((f) => f.precio))
      : p.precio;
    const stockRef = frascos.length
      ? frascos.reduce((s, f) => s + f.stock, 0)
      : p.stock;
    const costoRef = frascos.length
      ? Math.min(...frascos.map((f) => f.costo))
      : p.costo ?? 0;
    const limpio = { ...p, frascos, precio: precioRef, stock: stockRef, costo: costoRef };

    this.guardando.set(true);
    try {
      await this.data.guardarPerfumeConCompra(limpio);
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
      await this.data.guardarPerfumeConCompra({ ...p, frascos: copia, stock });
    } else {
      await this.data.guardarPerfumeConCompra({ ...p, stock: Math.max(0, p.stock + delta) });
    }
  }

  async cambiarEstadoPedido(id: string, estado: 'nuevo' | 'atendido' | 'entregado') {
    await this.data.actualizarEstadoPedido(id, estado);
  }

  vrSeleccionarPerfume(p: Perfume) {
    this.vrPerfumeId.set(p.id);
    this.vrBusqueda.set('');
    this.vrElegirPresentacion(null);
  }

  vrCambiarPerfume() {
    this.vrPerfumeId.set('');
    this.vrElegirPresentacion(null);
  }

  vrElegirPresentacion(pres: Presentacion | null) {
    this.vrPresentacion.set(pres);
    this.vrPrecio.set(pres?.precio ?? 0);
  }

  async confirmarVentaRapida() {
    const pres = this.vrPresentacion();
    if (!this.vrPerfumeId() || !pres || this.vrCantidad() <= 0) {
      alert('Completa perfume, presentación y cantidad.');
      return;
    }
    this.vrGuardando.set(true);
    this.vrMsg.set('');
    try {
      const venta = await this.data.venderRapido({
        perfumeId: this.vrPerfumeId(),
        presentacion: pres,
        cantidad: this.vrCantidad(),
        precioUnitario: this.vrPrecio(),
        clienteNombre: this.vrCliente(),
        nota: this.vrNota(),
      });
      this.vrMsg.set('✅ Venta registrada. Generando factura…');
      try {
        await generarFacturaPdf(venta, {
          nombre: environment.nombreNegocio,
          moneda: this.moneda,
        });
        this.vrMsg.set('✅ Venta registrada y factura descargada.');
      } catch (e) {
        console.error('No se pudo generar la factura:', e);
        this.vrMsg.set('✅ Venta registrada (no se pudo generar la factura).');
      }
      this.vrPerfumeId.set('');
      this.vrBusqueda.set('');
      this.vrPresentacion.set(null);
      this.vrCantidad.set(1);
      this.vrPrecio.set(0);
      this.vrCliente.set('');
      this.vrNota.set('');
    } catch (e: any) {
      alert(e?.message ?? 'No se pudo registrar la venta.');
    } finally {
      this.vrGuardando.set(false);
    }
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
