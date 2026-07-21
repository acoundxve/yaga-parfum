import { Injectable, signal } from '@angular/core';
import { environment } from '../../environments/environment';

const KEY = 'yaga_admin';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly esAdmin = signal<boolean>(sessionStorage.getItem(KEY) === '1');

  login(password: string): boolean {
    if (password === environment.adminPassword) {
      sessionStorage.setItem(KEY, '1');
      this.esAdmin.set(true);
      return true;
    }
    return false;
  }

  logout(): void {
    sessionStorage.removeItem(KEY);
    this.esAdmin.set(false);
  }
}
