import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { PedidosService } from '../../../core/services/pedidos.service';
import { MesasService } from '../../../core/services/mesas.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  Pedido,
  EstadoPedido,
  etiquetaEstadoPedido,
  ESTADO_PEDIDO_RECHAZADO,
  ESTADO_PEDIDO_ENTREGADO,
} from '../../../core/models/pedido.model';
import { environment } from '../../../../environments/environment';
import { BurbujaMozoComponent } from '../../chat/burbuja-mozo/burbuja-mozo.component';
import { precargarImagenes } from '../../utils/precargarImagenes';

@Component({
  selector: 'app-estado-pedido',
  standalone: true,
  templateUrl: './estado-pedido.page.html',
  styleUrls: ['./estado-pedido.page.scss'],
  imports: [CommonModule, RouterLink, BurbujaMozoComponent],
})
export class EstadoPedidoPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private pedidosService = inject(PedidosService);
  private mesasService = inject(MesasService);
  private authService = inject(AuthService);

  get usuario() {
    return this.authService.usuarioActual;
  }
  get iniciales(): string {
    const u = this.usuario;
    return `${u?.nombre?.[0] ?? ''}${u?.apellido?.[0] ?? ''}`.toUpperCase();
  }

  pedido = signal<Pedido | null>(null);
  numeroMesa = signal<number | null>(null);
  cargando = signal(true);
  mensajeError = signal('');
  indiceFoto = signal(0);
  confirmandoRecepcion = signal(false);

  private pedidoId = '';
  private canal?: RealtimeChannel;
  private intervaloFotos?: ReturnType<typeof setInterval>;
  private intervaloEstado?: ReturnType<typeof setInterval>;

  fotos = computed<string[]>(() =>
    (this.pedido()?.items ?? [])
      .map((i) => i.foto_url ?? '')
      .filter((u) => !!u),
  );

  // Precarga todas las fotos del pedido (son pocas) para que la rotación
  // no espere la descarga de cada una.
  private precargaFotos = effect(() => precargarImagenes(this.fotos()));

  etiquetaEstado = computed(() => {
    const estado = this.pedido()?.estado;
    return estado ? etiquetaEstadoPedido(estado) : 'PENDIENTE MOZO';
  });

  // Punto 13: el mozo rechazó el pedido, hay que ofrecerle al cliente
  // modificarlo (no puede quedarse esperando sin hacer nada).
  esRechazado = computed(
    () => this.pedido()?.estado === ESTADO_PEDIDO_RECHAZADO,
  );

  // Punto 19: el mozo ya entregó el pedido; falta que el cliente
  // confirme la recepción para habilitar la encuesta y pedir la cuenta.
  fuePedidoEntregado = computed(() => this.pedido()?.estado === ESTADO_PEDIDO_ENTREGADO);
  confirmoRecepcion = computed(() => this.pedido()?.confirmado_por_cliente === true);

  // Punto 19: recién cuando el cliente confirma haber recibido el
  // pedido, puede acceder a la encuesta y a pedir la cuenta.
  puedeAccederEncuesta = computed(
    () => this.fuePedidoEntregado() && this.confirmoRecepcion(),
  );
  puedeAccederCuenta = computed(
    () => this.fuePedidoEntregado() && this.confirmoRecepcion(),
  );

  // "Tiempo total estimado de realización del pedido completo" (punto 12).
  tiempoTotal = computed(() =>
    (this.pedido()?.items ?? []).reduce(
      (acum, i) => acum + (i.tiempo_elaboracion_minutos ?? 0) * i.cantidad,
      0,
    ),
  );

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.mensajeError.set('No se indicó qué pedido mostrar.');
      this.cargando.set(false);
      return;
    }
    this.pedidoId = id;

    try {
      await this.recargar();

      const mesa = await this.mesasService
        .obtenerPorId(this.pedido()!.mesa_id)
        .catch(() => null);
      if (mesa) this.numeroMesa.set(mesa.numero);

      this.arrancarRotacionFotos();

      // Realtime + un refresco periódico de respaldo por si Realtime no
      // está habilitado para la tabla 'pedidos'.
      this.canal = this.pedidosService.escucharPedido(id, (actualizado) => {
        void this.alCambiarEstado(actualizado.estado);
        this.pedido.update((p) =>
          p ? { ...p, ...actualizado, items: p.items } : p,
        );
      });
      this.intervaloEstado = setInterval(() => void this.recargar(), 8000);
    } catch (error) {
      this.mensajeError.set(
        error instanceof Error ? error.message : 'No se pudo cargar el pedido.',
      );
    } finally {
      this.cargando.set(false);
    }
  }

  ngOnDestroy(): void {
    if (this.canal) this.pedidosService.dejarDeEscuchar(this.canal);
    if (this.intervaloFotos) clearInterval(this.intervaloFotos);
    if (this.intervaloEstado) clearInterval(this.intervaloEstado);
  }

  private async recargar(): Promise<void> {
    const anterior = this.pedido()?.estado;
    const actualizado = await this.pedidosService.obtenerPedidoConItems(
      this.pedidoId,
    );
    this.pedido.set(actualizado);
    if (anterior && anterior !== actualizado.estado) {
      void this.alCambiarEstado(actualizado.estado);
    }
  }

  private async alCambiarEstado(estado: EstadoPedido): Promise<void> {
    try {
      await Haptics.notification({
        type:
          estado === 'rechazado'
            ? NotificationType.Warning
            : NotificationType.Success,
      });
    } catch {}
  }

  private arrancarRotacionFotos(): void {
    if (this.intervaloFotos) clearInterval(this.intervaloFotos);
    this.intervaloFotos = setInterval(() => {
      const total = this.fotos().length;
      if (total > 1) {
        this.indiceFoto.update((i) => (i + 1) % total);
      }
    }, environment.menuFotosIntervaloMs);
  }

  fotoActual(): string {
    const fotos = this.fotos();
    return fotos[this.indiceFoto() % (fotos.length || 1)] ?? '';
  }

  // Punto 13: el cliente va a modificar el pedido rechazado; el menú
  // detecta el pedido en estado 'rechazado' y precarga el carrito.
  modificarPedido(): void {
    const numero = this.numeroMesa();
    if (numero) this.router.navigate(['/cliente/menu', numero]);
  }

  // Punto 19: el cliente confirma que recibió el pedido que el mozo
  // entregó. Habilita la encuesta y la opción de pedir la cuenta.
  async confirmarRecepcion(): Promise<void> {
    if (this.confirmandoRecepcion() || this.confirmoRecepcion()) return;

    this.confirmandoRecepcion.set(true);

    try {
      await this.pedidosService.confirmarRecepcionPedido(this.pedidoId);
      this.pedido.update((p) => (p ? { ...p, confirmado_por_cliente: true } : p));
      await Haptics.notification({ type: NotificationType.Success }).catch(() => {});
    } catch (error) {
      this.mensajeError.set(
        error instanceof Error
          ? error.message
          : 'No se pudo confirmar la recepción del pedido.',
      );
    } finally {
      this.confirmandoRecepcion.set(false);
    }
  }
}
