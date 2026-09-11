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
          const data = accion.notification.data ?? {};
          const tipo = data['tipo'];
          const numeroMesa = data['numeroMesa'];
          if (tipo === 'mesa-asignada') {
            this.router.navigateByUrl('/inicio');
          } else if (tipo === 'lista-espera') {
            this.router.navigateByUrl('/metre/lista-espera');
          } else if (tipo === 'pedido-nuevo') {
            // Punto 12: el mozo recibe el aviso de un pedido nuevo.
            this.router.navigateByUrl('/mozo/consultas');
          } else if (tipo === 'pedido-confirmado' || tipo === 'pedido-rechazado') {
            // Puntos 13/14: el cliente vuelve al estado de su pedido.
            const pedidoId = data['pedidoId'];
            this.router.navigateByUrl(
              pedidoId ? `/cliente/estado-pedido/${pedidoId}` : '/inicio',
            );
          } else if (tipo === 'pedido-confirmado-sector') {
            // Punto 14: a cocina/bar les llega el pedido derivado a su
            // propio sector.
            const sector = data['sector'];
            this.router.navigateByUrl(sector === 'bar' ? '/bar/pedidos' : '/cocina/pedidos');
          } else if (tipo === 'mensaje-mesa' && numeroMesa) {
            const hiloClienteId = data['hiloClienteId'];
            if (hiloClienteId) {
              this.router.navigateByUrl(`/mozo/chat/${numeroMesa}/${hiloClienteId}`);
            } else {
              this.router.navigateByUrl(`/mozo/hilos/${numeroMesa}`);
            }
          } else if (tipo === 'respuesta-mozo' && numeroMesa) {
            // Punto 11: el mozo respondió la consulta del cliente.
            this.router.navigateByUrl(`/cliente/chat/${numeroMesa}`);
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
