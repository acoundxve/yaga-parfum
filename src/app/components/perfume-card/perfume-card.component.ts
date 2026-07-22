import { Component, Input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  Perfume,
  precioDesde,
  stockTotal,
  tieneVariosFrascos,
} from '../../models/perfume.model';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-perfume-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <article class="card" [class.agotado]="agotado">
      <div class="card-img" (click)="perfume.imagenUrl && verImagen.emit(perfume)">
        @if (perfume.imagenUrl) {
          <img [src]="perfume.imagenUrl" [alt]="perfume.nombre" loading="lazy" />
        } @else {
          <div class="sin-img">
            <span>🧴</span>
            <small>{{ perfume.nombre }}</small>
          </div>
        }

        @if (agotado) {
          <span class="badge b-agotado">AGOTADO</span>
        } @else if (pocas !== null) {
          <span class="badge b-pocas">¡Solo quedan {{ pocas }}!</span>
        }

        @if (perfume.categoria) {
          <span class="cat">{{ perfume.categoria }}</span>
        }
      </div>

      <div class="card-body">
        <h3>{{ perfume.nombre }}</h3>
        <p class="marca">{{ perfume.marca }}</p>
        <p class="desc">{{ perfume.descripcion }}</p>

        <div class="card-foot">
          <span class="precio">
            @if (varios) { <small class="desde">desde</small> }
            {{ moneda }} {{ desde | number: '1.0-0' }}
          </span>
          @if (agotado) {
            <button class="btn btn-off" disabled>Agotado</button>
          } @else {
            <button class="btn" (click)="agregar.emit(perfume)">Encargar</button>
          }
        </div>

        <button class="btn-notas" (click)="verNotas.emit(perfume)">
          🌸 Ver notas
        </button>
      </div>
    </article>
  `,
})
export class PerfumeCardComponent {
  @Input({ required: true }) perfume!: Perfume;
  agregar = output<Perfume>();
  verNotas = output<Perfume>();
  verImagen = output<Perfume>();
  moneda = environment.moneda;

  private get total(): number {
    return stockTotal(this.perfume, environment.mlFrasco);
  }

  /** true cuando no queda stock en ningún tamaño. */
  get agotado(): boolean {
    return this.total <= 0;
  }

  /** cantidad restante cuando quedan menos de 5 (1–4), si no null. */
  get pocas(): number | null {
    const s = this.total;
    return s > 0 && s < 5 ? s : null;
  }

  get desde(): number {
    return precioDesde(this.perfume, environment.mlFrasco);
  }

  get varios(): boolean {
    return tieneVariosFrascos(this.perfume, environment.mlFrasco);
  }
}
