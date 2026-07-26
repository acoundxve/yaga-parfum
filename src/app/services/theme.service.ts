import { Injectable, effect, signal } from '@angular/core';

const KEY = 'yaga_tema';

export type Tema = 'oscuro' | 'claro';

/** Tema claro/oscuro del sitio. Se guarda en localStorage para recordarlo
 *  entre visitas. Por defecto queda el oscuro (el diseño original). */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly tema = signal<Tema>(this.leerGuardado());

  constructor() {
    effect(() => {
      const t = this.tema();
      document.documentElement.setAttribute('data-theme', t === 'claro' ? 'light' : 'dark');
      localStorage.setItem(KEY, t);
    });
  }

  alternar(): void {
    this.tema.set(this.tema() === 'claro' ? 'oscuro' : 'claro');
  }

  private leerGuardado(): Tema {
    return localStorage.getItem(KEY) === 'claro' ? 'claro' : 'oscuro';
  }
}
