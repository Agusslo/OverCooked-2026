import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import {
  ActionPerformed,
  PushNotifications,
  PushNotificationSchema,
  Token,
} from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { SupabaseService } from './supabase.service';
import { environment } from '../../../environments/environment';

// Tabla donde se guarda el token de push de cada dispositivo, asociado
// al usuario logueado (ver CAMBIAR.md: hay que crear esta tabla en
// Supabase antes de que esto funcione de punta a punta).
const TABLA_TOKENS = 'push_tokens';

// Puntos 6 y 10 del PDF: dueño/supervisor se enteran por push cuando
// hay un cliente pendiente de aprobación, y el cliente se entera por
// push cuando el metre le asigna una mesa. Este servicio sólo se
// ocupa de la mitad "dispositivo": pedir permiso, registrar el
// dispositivo y guardar su token. El envío de la notificación en sí
// lo dispara un trigger de la base de datos (ver
// supabase/functions/notificar-cliente-pendiente y
// supabase/functions/notificar-mesa-asignada).
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
      // No comparamos sólo contra 'prompt': Android también puede
      // devolver 'prompt-with-rationale', y si sólo mirábamos 'prompt'
      // nunca se llegaba a pedir el permiso en ese caso.
      let permiso = await PushNotifications.checkPermissions();
      if (permiso.receive !== 'granted') {
        permiso = await PushNotifications.requestPermissions();
      }
      if (permiso.receive !== 'granted') {
        console.warn('Permiso de notificaciones push no concedido:', permiso.receive);
        return;
      }

      PushNotifications.addListener('registration', (token: Token) => {
        void this.guardarToken(usuarioId, token.value);
      });

      PushNotifications.addListener('registrationError', (error) => {
        console.warn('No se pudo registrar el dispositivo para push:', error);
      });

      // Con la app en segundo plano/cerrada, Android muestra la
      // notificación solo. Con la app abierta en primer plano NO lo hace
      // (es comportamiento normal del sistema operativo), así que acá
      // la disparamos nosotros como notificación local.
      PushNotifications.addListener(
        'pushNotificationReceived',
        (notificacion: PushNotificationSchema) => {
          void this.mostrarNotificacionEnPrimerPlano(notificacion);
        },
      );

      // El usuario tocó la notificación: la llevamos a la pantalla que
      // corresponda según el tipo que viaja en el "data" del push.
      PushNotifications.addListener(
        'pushNotificationActionPerformed',
        (accion: ActionPerformed) => {
          const tipo = accion.notification.data?.['tipo'];
          if (tipo === 'mesa-asignada') {
            this.router.navigateByUrl('/cliente/escanear-mesa');
          } else {
            this.router.navigateByUrl('/admin/clientes-pendientes');
          }
        },
      );

      await PushNotifications.register();
    } catch (error) {
      console.warn('No se pudo inicializar las notificaciones push:', error);
    }
  }

  private async mostrarNotificacionEnPrimerPlano(
    notificacion: PushNotificationSchema,
  ): Promise<void> {
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Date.now(),
            title: notificacion.title ?? '',
            body: notificacion.body ?? '',
            extra: notificacion.data,
          },
        ],
      });
    } catch (error) {
      console.warn('No se pudo mostrar la notificación en primer plano:', error);
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
