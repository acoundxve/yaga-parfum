import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

/**
 * Envuelve el cliente de Supabase. Si no hay llaves configuradas,
 * `configurado` es false y los servicios usan el respaldo local.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly configurado: boolean;
  readonly client: SupabaseClient | null = null;

  constructor() {
    const url = environment.supabaseUrl;
    const key = environment.supabaseAnonKey;
    this.configurado =
      !!url &&
      !!key &&
      !url.startsWith('TU_') &&
      !key.startsWith('TU_');

    if (this.configurado) {
      this.client = createClient(url, key);
    }
  }
}
