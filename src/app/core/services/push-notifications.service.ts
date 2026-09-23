import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import {
  ActionPerformed,
  PushNotifications,
  PushNotificationSchema,
  Token,
} from '@capacitor/push-notifications';
import {
  ActionPerformed as LocalActionPerformed,
  LocalNotifications,
} from '@capacitor/local-notifications';
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
  // Token del dispositivo actual (si se registró en esta sesión de la
  // app). Se usa para borrar SOLO esta fila al hacer logout, sin tocar
  // los tokens de otros dispositivos del mismo usuario.
  private tokenActual: string | null = null;

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
      // corresponda según el tipo que viaja en el "data" del push. Esto
      // cubre el caso "app cerrada/en background" (push real, tocada
      // desde la bandeja del sistema).
      PushNotifications.addListener(
        'pushNotificationActionPerformed',
        (accion: ActionPerformed) => this.navegarSegunTipo(accion.notification.data ?? {}),
      );

      // Mismo caso pero para cuando la notificación se mostró como local
      // (app en primer plano, ver mostrarNotificacionEnPrimerPlano): sin
      // este listener, tocar esa notificación no navegaba a ningún lado.
      LocalNotifications.addListener(
        'localNotificationActionPerformed',
        (accion: LocalActionPerformed) => this.navegarSegunTipo(accion.notification.extra ?? {}),
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
            // Date.now() no entra en un int de 32 bits (lo que espera el
            // plugin del lado nativo): sin el & se pasaba de rango y
            // Android truncaba todos los ids al mismo valor, así que una
            // notificación nueva pisaba a la anterior en vez de sumarse.
            id: Date.now() & 0x7fffffff,
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

  // Misma lógica de navegación sin importar si la notificación llegó
  // como push real (app cerrada/background) o como local (app abierta):
  // el "data"/"extra" que viaja es el mismo objeto en los dos casos.
  private navegarSegunTipo(data: Record<string, unknown>): void {
    const tipo = data['tipo'];
    const numeroMesa = data['numeroMesa'];
    if (tipo === 'mesa-asignada') {
      this.router.navigateByUrl('/inicio');
    } else if (tipo === 'lista-espera') {
      this.router.navigateByUrl('/metre/lista-espera');
    } else if (tipo === 'pedido-nuevo') {
      // Punto 12: el mozo recibe el aviso de un pedido nuevo.
      this.router.navigateByUrl('/mozo/pedidos-pendientes');
    } else if (tipo === 'pedido-confirmado' || tipo === 'pedido-rechazado') {
      // Puntos 13/14: el cliente vuelve al estado de su pedido.
      const pedidoId = data['pedidoId'];
      this.router.navigateByUrl(pedidoId ? `/cliente/estado-pedido/${pedidoId}` : '/inicio');
    } else if (tipo === 'pedido-confirmado-sector') {
      // Punto 14: a cocina/bar les llega el pedido derivado a su propio
      // sector.
      const sector = data['sector'];
      this.router.navigateByUrl(sector === 'bar' ? '/bar/pedidos' : '/cocina/pedidos');
    } else if (tipo === 'cuenta-solicitada' || tipo === 'pago-realizado') {
      // Punto 21: el mozo ve el pago por confirmar (dueño y supervisor,
      // sin acceso a esa pantalla, caen en /inicio por el guard).
      this.router.navigateByUrl('/mozo/pagos-pendientes');
    } else if (tipo === 'pago-confirmado') {
      // Punto 22: dueño y supervisor sólo se enteran del cobro.
      this.router.navigateByUrl('/inicio');
    } else if (tipo === 'pedido-listo') {
      // Punto 18: cocina y bar terminaron todos los productos del
      // pedido; el mozo lo va a retirar.
      this.router.navigateByUrl('/mozo/pedidos-en-curso');
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
  }

  private async guardarToken(usuarioId: string, token: string): Promise<void> {
    const client = this.supabaseService.getClient();

    // Si el token quedó a nombre de otro usuario (el anterior no cerró
    // sesión bien), el upsert directo lo rechaza la RLS. La función
    // registrar_push_token (supabase/sql/push-token-rpc.sql) lo reasigna
    // al usuario logueado con SECURITY DEFINER.
    const { error: errorRpc } = await client.rpc('registrar_push_token', {
      p_token: token,
      p_plataforma: Capacitor.getPlatform(),
    });

    if (!errorRpc) {
      this.tokenActual = token;
      return;
    }

    // Si la función todavía no está creada en la base, caemos al upsert
    // directo (sólo funciona si el token es nuevo o ya es de este usuario).
    const { error } = await client.from(TABLA_TOKENS).upsert(
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
    } else {
      this.tokenActual = token;
    }
  }

  // Se llama antes de auth.signOut() (ver AuthService.logout): borra
  // la fila de push_tokens de este dispositivo para que un usuario que
  // cerró sesión deje de recibir las notificaciones del que inicie
  // sesión después en el mismo teléfono. Si nunca se registró un token
  // en esta sesión no hace nada.
  async eliminarTokenActual(): Promise<void> {
    const token = this.tokenActual;
    this.tokenActual = null;

    // Se resetea siempre (aunque no haya token guardado: permiso denegado,
    // falló el guardado, etc.) para que el próximo usuario que inicie
    // sesión en este dispositivo pueda registrarse de nuevo.
    const estabaInicializado = this.inicializado;
    this.inicializado = false;

    if (token) {
      const { error } = await this.supabaseService
        .getClient()
        .from(TABLA_TOKENS)
        .delete()
        .eq('token', token);

      if (error) {
        console.warn('No se pudo borrar el token de notificaciones push:', error);
      }
    }

    // Los listeners quedan atados al usuario que inicializó (el de
    // 'registration' guarda su usuarioId): si no se quitan, el próximo
    // login los duplica y cada push se muestra/navega varias veces.
    if (estabaInicializado) {
      try {
        await PushNotifications.removeAllListeners();
        await LocalNotifications.removeAllListeners();
      } catch (error) {
        console.warn('No se pudieron quitar los listeners de push:', error);
      }
    }
  }
}
