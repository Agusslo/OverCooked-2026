import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  // El cliente se crea una sola vez, acá, cuando Angular
  // instancia este servicio por primera vez. Después, cualquier
  // otro servicio del proyecto (auth, mesas, productos, etc.)
  // lo va a usar en vez de crear su propia conexión.
  private client: SupabaseClient = createClient(
    environment.supabaseUrl,
    environment.supabaseKey
  );

  getClient(): SupabaseClient {
    return this.client;
  }
}