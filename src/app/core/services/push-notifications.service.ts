import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import {
  ActionPerformed,
  PushNotifications,
  Token,
} from '@capacitor/push-notifications';
import { SupabaseService } from './supabase.service';
import { environment } from '../../../environments/environment';

// Tabla donde se guarda el token de push de cada dispositivo, asociado
// al usuario logueado (ver CAMBIAR.md: hay que crear esta tabla en
// Supabase antes de que esto funcione de punta a punta).
const TABLA_TOKENS = 'push_tokens';

// Punto 6 del PDF: cuando un cliente nuevo queda pendiente de
// aprobación, dueño/supervisor tienen que enterarse por push
// notification. Este servicio sólo se ocupa de la mitad "cliente":
// pedir permiso, registrar el dispositivo y guardar su token. El envío
// de la notificación en sí lo dispara un trigger de la base de datos
// (ver supabase/functions/notificar-cliente-pendiente y CAMBIAR.md).
@Injectable({
  providedIn: 'root',
})
export class PushNotificationsService {
  private supabaseService = inject(SupabaseService);
  private router = inject(Router);

  private inicializado = false;

  async inicializar(usuarioId: string): Promise<void> {
    // En navegador (desarrollo) no hay push notifications nativas —
    // el plugin sólo funciona compilado a Android/iOS. Tampoco se puede
    // habilitar sin android/app/google-services.json: PushNotifications
    // .register() llama a Firebase, y sin ese archivo la llamada nativa
    // tira una excepción que no se puede atrapar desde JS y cierra la
    // app (ver environment.pushNotificationsHabilitadas).
    if (
      this.inicializado ||
      !Capacitor.isNativePlatform() ||
      !environment.pushNotificationsHabilitadas
    ) {
      return;
    }
    this.inicializado = true;

    try {
      let permiso = await PushNotifications.checkPermissions();
      if (permiso.receive === 'prompt') {
        permiso = await PushNotifications.requestPermissions();
      }
      if (permiso.receive !== 'granted') {
        return;
      }

      PushNotifications.addListener('registration', (token: Token) => {
        void this.guardarToken(usuarioId, token.value);
      });

      PushNotifications.addListener('registrationError', (error) => {
        console.warn('No se pudo registrar el dispositivo para push:', error);
      });

      // Notificación recibida con la app abierta: no hace falta hacer
      // nada especial, el sistema operativo ya la muestra sola cuando
      // llega en segundo plano.
      PushNotifications.addListener('pushNotificationReceived', () => {});

      // El usuario tocó la notificación: lo llevamos directo al
      // listado de clientes pendientes.
      PushNotifications.addListener(
        'pushNotificationActionPerformed',
        (accion: ActionPerformed) => {
          void accion;
          this.router.navigateByUrl('/admin/clientes-pendientes');
        },
      );

      await PushNotifications.register();
    } catch (error) {
      console.warn('No se pudo inicializar las notificaciones push:', error);
    }
  }

  private async guardarToken(usuarioId: string, token: string): Promise<void> {
    const { error } = await this.supabaseService
      .getClient()
      .from(TABLA_TOKENS)
      .upsert(
        {
          usuario_id: usuarioId,
          token,
          plataforma: Capacitor.getPlatform(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'token' },
      );

    if (error) {
      console.warn('No se pudo guardar el token de notificaciones push:', error);
    }
  }
}
