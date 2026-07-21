import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-wrap">
      <div class="login-card">
        <h1>Panel de administrador</h1>
        <p class="login-sub">Ingresa la contraseña para gestionar tu catálogo.</p>

        <input
          type="password"
          placeholder="Contraseña"
          [(ngModel)]="password"
          (keyup.enter)="entrar()"
          autofocus
        />

        @if (error()) {
          <p class="login-error">Contraseña incorrecta.</p>
        }

        <button class="btn" (click)="entrar()">Entrar</button>
      </div>
    </div>
  `,
})
export class AdminLoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  password = '';
  error = signal(false);

  entrar() {
    if (this.auth.login(this.password)) {
      this.router.navigate(['/admin']);
    } else {
      this.error.set(true);
    }
  }
}
