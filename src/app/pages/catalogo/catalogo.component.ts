import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PerfumeService } from '../../services/perfume.service';
import { CarritoService } from '../../services/carrito.service';
import { PerfumeCardComponent } from '../../components/perfume-card/perfume-card.component';
import {
  Perfume,
  Pedido,
  ItemPedido,
  Presentacion,
  frascosDe,
  presentaciones,
  tieneNotas,
} from '../../models/perfume.model';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-catalogo',
  standalone: true,
  imports: [CommonModule, FormsModule, PerfumeCardComponent],
  templateUrl: './catalogo.component.html',
})
export class CatalogoComponent implements OnInit {
  private data = inject(PerfumeService);
  carrito = inject(CarritoService);

  moneda = environment.moneda;
  negocio = environment.nombreNegocio;

  perfumes = this.data.perfumes;
  cargando = this.data.cargando;

  busqueda = signal('');
  categoria = signal('Todos');
  orden = signal<'destacados' | 'az' | 'za' | 'precio-asc' | 'precio-desc'>('destacados');
  drawerAbierto = signal(false);
  enviando = signal(false);
  confirmado = signal(false);
  perfumeNotas = signal<Perfume | null>(null);
  perfumeElegir = signal<Perfume | null>(null);

  // Datos del cliente para el encargo
  clienteNombre = '';
  clienteTelefono = '';
  nota = '';

  categorias = computed(() => {
    const set = new Set<string>();
    for (const p of this.perfumes()) if (p.categoria) set.add(p.categoria);
    return ['Todos', ...Array.from(set)];
  });

  filtrados = computed(() => {
    const q = this.busqueda().toLowerCase().trim();
    const cat = this.categoria();
    const lista = this.perfumes().filter((p) => {
      const okCat = cat === 'Todos' || p.categoria === cat;
      const okQ =
        !q ||
        p.nombre.toLowerCase().includes(q) ||
        p.marca.toLowerCase().includes(q) ||
        p.descripcion.toLowerCase().includes(q);
      return okCat && okQ;
    });

    const nombreDe = (p: Perfume) => `${p.marca} ${p.nombre}`.trim().toLowerCase();
    switch (this.orden()) {
      case 'az':
        return [...lista].sort((a, b) => nombreDe(a).localeCompare(nombreDe(b)));
      case 'za':
        return [...lista].sort((a, b) => nombreDe(b).localeCompare(nombreDe(a)));
      case 'precio-asc':
        return [...lista].sort((a, b) => a.precio - b.precio);
      case 'precio-desc':
        return [...lista].sort((a, b) => b.precio - a.precio);
      default:
        return lista;
    }
  });

  async ngOnInit() {
    await this.data.cargarPerfumes();
  }

  // Al pulsar "Encargar" mostramos las opciones de presentación
  agregar(p: Perfume) {
    this.perfumeElegir.set(p);
  }

  opciones(p: Perfume): Presentacion[] {
    return presentaciones(p, environment.mlFrasco, environment.costoEnvaseDecant);
  }

  frascosDe(p: Perfume): Presentacion[] {
    return this.opciones(p).filter((o) => o.tipo === 'frasco');
  }

  decantsDe(p: Perfume): Presentacion[] {
    return this.opciones(p).filter((o) => o.tipo === 'decant');
  }

  elegirPresentacion(p: Perfume, pres: Presentacion) {
    this.carrito.agregar(p, pres);
    this.perfumeElegir.set(null);
    this.drawerAbierto.set(true);
  }

  abrirNotas(p: Perfume) {
    this.perfumeNotas.set(p);
  }

  hayNotas(p: Perfume): boolean {
    return tieneNotas(p);
  }

  fragranticaUrl(p: Perfume): string {
    const q = encodeURIComponent(`${p.marca} ${p.nombre}`.trim());
    return `https://www.fragrantica.com/search/?query=${q}`;
  }

  /** Stock disponible de una línea del carrito (por tamaño de frasco). */
  stockItem(i: ItemPedido): number {
    if (i.tipo !== 'frasco') return 9999; // los decants no se limitan
    const p = this.perfumes().find((x) => x.id === i.perfumeId);
    if (!p) return 0;
    const fr = frascosDe(p, environment.mlFrasco).find((f) => f.ml === i.ml);
    return fr?.stock ?? 0;
  }

  async confirmarEncargo() {
    if (!this.carrito.items().length) return;
    if (!this.clienteNombre.trim() || !this.clienteTelefono.trim()) {
      alert('Escribe tu nombre y tu teléfono para el encargo.');
      return;
    }
    this.enviando.set(true);

    const pedido: Pedido = {
      id: 'local-' + Date.now(),
      clienteNombre: this.clienteNombre.trim(),
      clienteTelefono: this.clienteTelefono.trim(),
      nota: this.nota.trim(),
      items: this.carrito.items(),
      total: this.carrito.total(),
      estado: 'nuevo',
      createdAt: new Date().toISOString(),
    };

    try {
      // 1) Guardar el pedido (Supabase o local) — el admin lo verá en el Panel
      await this.data.crearPedido(pedido);
      // 2) Abrir WhatsApp con el pedido escrito
      this.abrirWhatsapp(pedido);

      this.carrito.vaciar();
      this.confirmado.set(true);
      this.clienteNombre = '';
      this.clienteTelefono = '';
      this.nota = '';
    } catch (e) {
      console.error(e);
      alert('No se pudo enviar el encargo. Intenta de nuevo.');
    } finally {
      this.enviando.set(false);
    }
  }

  private abrirWhatsapp(pedido: Pedido) {
    const lineas = pedido.items
      .map(
        (i) =>
          `• ${i.cantidad} x ${i.nombre} (${i.presentacion}) — ${this.moneda} ${i.precio * i.cantidad}`
      )
      .join('\n');
    const msg =
      `¡Hola ${this.negocio}! Quiero hacer un encargo:\n\n` +
      `${lineas}\n\n` +
      `Total: ${this.moneda} ${pedido.total}\n` +
      `Nombre: ${pedido.clienteNombre}\n` +
      `Teléfono: ${pedido.clienteTelefono}` +
      (pedido.nota ? `\nNota: ${pedido.nota}` : '');
    const url = `https://wa.me/${environment.whatsappNumero}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  }
}
