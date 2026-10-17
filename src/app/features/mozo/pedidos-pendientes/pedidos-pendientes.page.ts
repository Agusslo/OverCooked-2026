import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { PedidosService, PedidoPendiente } from '../../../core/services/pedidos.service';

// Puntos 13 y 14 del PDF: el mozo revisa los pedidos que están esperando
// su confirmación (recién armados por el cliente o reenviados tras un
// rechazo). Puede rechazar alguno con un motivo para que el cliente lo
// modifique (13), o confirmarlo para derivarlo a cocina/bar (14).
@Component({
  selector: 'app-pedidos-pendientes',
  standalone: true,
  templateUrl: './pedidos-pendientes.page.html',
  styleUrls: ['./pedidos-pendientes.page.scss'],
  imports: [CommonModule, ReactiveFormsModule],
})
export class PedidosPendientesPage implements OnInit, OnDestroy {
  private pedidosService = inject(PedidosService);
  private router = inject(Router);

  pedidos = signal<PedidoPendiente[]>([]);
  cargando = signal(true);
  mensajeError = signal('');

  // Id del pedido cuyo formulario de rechazo está abierto (uno solo a
  // la vez, para no ensuciar la lista).
  pedidoARechazar = signal<string | null>(null);
  enviandoRechazo = signal(false);
  motivo = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(5)],
  });

  // Punto 14: pedido que se está confirmando en este momento (para
  // deshabilitar el botón y no mandar la confirmación dos veces).
  confirmandoId = signal<string | null>(null);

  private canal?: RealtimeChannel;

  ngOnInit(): void {
    void this.cargar();
    this.canal = this.pedidosService.escucharPedidosPendientes(() => void this.cargar());
  }

  ngOnDestroy(): void {
    if (this.canal) this.pedidosService.dejarDeEscuchar(this.canal);
  }

  async cargar(): Promise<void> {
    try {
      const pedidos = await this.pedidosService.listarPendientes();
      this.pedidos.set(pedidos);
    } catch (error) {
      await this.dispararError(
        error instanceof Error ? error.message : 'No se pudieron cargar los pedidos.',
      );
    } finally {
      this.cargando.set(false);
    }
  }

  volver(): void {
    this.router.navigateByUrl('/inicio');
  }

  abrirRechazo(pedido: PedidoPendiente): void {
    this.pedidoARechazar.set(pedido.id);
    this.motivo.reset('');
  }

  cancelarRechazo(): void {
    this.pedidoARechazar.set(null);
    this.motivo.reset('');
  }

  async confirmarRechazo(pedido: PedidoPendiente): Promise<void> {
    if (this.motivo.invalid || this.enviandoRechazo()) {
      this.motivo.markAsTouched();
      return;
    }

    this.enviandoRechazo.set(true);
    this.mensajeError.set('');

    try {
      await this.pedidosService.rechazarPedido(pedido.id, this.motivo.value);
      await Haptics.notification({ type: NotificationType.Warning }).catch(() => {});
      this.pedidos.update((lista) => lista.filter((p) => p.id !== pedido.id));
      this.pedidoARechazar.set(null);
      this.motivo.reset('');
    } catch (error) {
      await this.dispararError(
        error instanceof Error ? error.message : 'No se pudo rechazar el pedido.',
      );
    } finally {
      this.enviandoRechazo.set(false);
    }
  }

  // Punto 14: el mozo confirma el pedido y queda derivado a cocina/bar.
  async confirmarPedido(pedido: PedidoPendiente): Promise<void> {
    if (this.confirmandoId()) return;

    this.confirmandoId.set(pedido.id);
    this.mensajeError.set('');

    try {
      await this.pedidosService.confirmarPedido(pedido.id);
      await Haptics.notification({ type: NotificationType.Success }).catch(() => {});
      this.pedidos.update((lista) => lista.filter((p) => p.id !== pedido.id));
    } catch (error) {
      await this.dispararError(
        error instanceof Error ? error.message : 'No se pudo confirmar el pedido.',
      );
    } finally {
      this.confirmandoId.set(null);
    }
  }

  private async dispararError(texto: string): Promise<void> {
    this.mensajeError.set(texto);
    try {
      await Haptics.notification({ type: NotificationType.Error });
    } catch {}
  }
}
