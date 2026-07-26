import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from './services/auth.service';
import { CarritoService } from './services/carrito.service';
import { ThemeService } from './services/theme.service';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule],
  template: `
    <div class="fondo-yaga"></div>

    <header class="barra">
      <a routerLink="/" class="logo">
        <span class="logo-mark" role="img" [attr.aria-label]="negocio"></span>
        <span class="logo-txt">{{ logoPrimero }} <span class="logo-grad">{{ logoResto }}</span></span>
      </a>

      <nav class="nav">
        <a routerLink="/" routerLinkActive="activo" [routerLinkActiveOptions]="{ exact: true }">Catálogo</a>
        @if (auth.esAdmin()) {
          <a routerLink="/admin" routerLinkActive="activo">Panel</a>
          <a class="salir" (click)="auth.logout()">Salir</a>
        }
        <button
          type="button"
          class="theme-toggle"
          (click)="theme.alternar()"
          [attr.aria-label]="theme.tema() === 'claro' ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro'"
          [title]="theme.tema() === 'claro' ? 'Tema oscuro' : 'Tema claro'"
        >
          {{ theme.tema() === 'claro' ? '🌙' : '☀️' }}
        </button>
      </nav>
    </header>

    <main class="contenido">
      <router-outlet />
    </main>

    <footer class="pie">
      <span>© {{ anio }} {{ negocio }} · Catálogo digital de perfumes</span>
    </footer>
  `,
})
export class AppComponent {
  auth = inject(AuthService);
  carrito = inject(CarritoService);
  theme = inject(ThemeService);
  negocio = environment.nombreNegocio;
  logoPrimero = this.negocio.split(' ')[0];
  logoResto = this.negocio.split(' ').slice(1).join(' ');
  anio = new Date().getFullYear();
}
