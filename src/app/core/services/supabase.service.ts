import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Preferences } from '@capacitor/preferences';
import { environment } from '../../../environments/environment';

// Supabase guarda la sesión (el token de login) en un lugar de
// almacenamiento que vos le indiques. Por defecto usa
// window.localStorage, que funciona bien en el navegador pero
// Android puede llegar a "limpiarlo" cuando la app se cierra —
// por eso el login no sobrevivía a cerrar y volver a abrir la app.
//
// Este objeto le enseña a Supabase a usar en cambio
// @capacitor/preferences, que en Android usa SharedPreferences
// (el almacenamiento nativo persistente de la plataforma, el
// mismo que usan las apps "de verdad" para guardar sesión).
//
// Supabase solo pide que el objeto tenga estos tres métodos,
// cada uno devolviendo una Promise — no le importa cómo estén
// implementados por dentro.
const almacenamientoNativo = {
  async getItem(clave: string): Promise<string | null> {
    const { value } = await Preferences.get({ key: clave });
    return value;
  },
  async setItem(clave: string, valor: string): Promise<void> {
    await Preferences.set({ key: clave, value: valor });
  },
  async removeItem(clave: string): Promise<void> {
    await Preferences.remove({ key: clave });
  },
};

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private client: SupabaseClient = createClient(
    environment.supabaseUrl,
    environment.supabaseKey,
    {
      auth: {
        storage: almacenamientoNativo,
        persistSession: true,
        autoRefreshToken: true,
        // Esto es para flujos de login por link (ej. "olvidé mi
        // contraseña") que llegan por URL en la web. En una app
        // nativa no aplica, así que lo desactivamos.
        detectSessionInUrl: false,
      },
    }
  );

  getClient(): SupabaseClient {
    return this.client;
  }
}