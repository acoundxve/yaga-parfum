import { Injectable, computed, signal } from '@angular/core';
import { ItemPedido, Perfume, Presentacion } from '../models/perfume.model';

@Injectable({ providedIn: 'root' })
export class CarritoService {
  readonly items = signal<ItemPedido[]>([]);

  readonly total = computed(() =>
    this.items().reduce((s, i) => s + i.precio * i.cantidad, 0)
  );

  readonly cantidadTotal = computed(() =>
    this.items().reduce((s, i) => s + i.cantidad, 0)
  );

  /** Agrega una presentación concreta (frasco de X ml o decant) del perfume. */
  agregar(p: Perfume, pres: Presentacion): void {
    const lista = [...this.items()];
    const existente = lista.find(
      (i) => i.perfumeId === p.id && i.tipo === pres.tipo && i.ml === pres.ml
    );
    if (existente) {
      // Cada tamaño de frasco se limita a su propio stock; los decants no.
      if (pres.tipo !== 'frasco' || existente.cantidad < pres.stock)
        existente.cantidad++;
    } else {
      lista.push({
        perfumeId: p.id,
        nombre: p.nombre,
        presentacion: pres.label,
        tipo: pres.tipo,
        ml: pres.ml,
        precio: pres.precio,
        cantidad: 1,
      });
    }
    this.items.set(lista);
  }

  cambiarCantidad(
    perfumeId: string,
    tipo: 'frasco' | 'decant',
    ml: number,
    cantidad: number
  ): void {
    const lista = this.items()
      .map((i) =>
        i.perfumeId === perfumeId && i.tipo === tipo && i.ml === ml
          ? { ...i, cantidad }
          : i
      )
      .filter((i) => i.cantidad > 0);
    this.items.set(lista);
  }

  quitar(perfumeId: string, tipo: 'frasco' | 'decant', ml: number): void {
    this.items.set(
      this.items().filter(
        (i) => !(i.perfumeId === perfumeId && i.tipo === tipo && i.ml === ml)
      )
    );
  }

  vaciar(): void {
    this.items.set([]);
  }
}
