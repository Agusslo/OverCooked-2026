import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { PedidosService, PedidoPorSector } from '../../../core/services/pedidos.service';

// Punto 18 del PDF: el mozo ve, para cada pedido que ya confirmó, cómo
// van cocina y bar con sus productos, y cuándo el pedido queda
// completo (todos los sectores intervinientes en 'listo') para poder
// ir a retirarlo. El aviso de "completo" también le llega por push
// (ver supabase/functions/notificar-pedido-listo).
//
// Punto 19: cuando el pedido está 'listo', el mozo lo entrega acá
// mismo. Al pasar a 'entregado' deja de aparecer en este listado (ya
// no es un pedido "en curso" para cocina/bar).
@Component({
  selector: 'app-pedidos-en-curso',
  standalone: true,
  templateUrl: './pedidos-en-curso.page.html',
  styleUrls: ['./pedidos-en-curso.page.scss'],
  imports: [CommonModule],
})
export class PedidosEnCursoPage implements OnInit, OnDestroy {
  private pedidosService = inject(PedidosService);
  private router = inject(Router);

  pedidos = signal<PedidoPorSector[]>([]);
  cargando = signal(true);
  mensajeError = signal('');

  // Punto 19: pedido que se está marcando como entregado en este
  // momento (para deshabilitar el botón y no mandarlo dos veces).
  entregandoId = signal<string | null>(null);

  private canal?: RealtimeChannel;

  ngOnInit(): void {
    void this.cargar();
    this.canal = this.pedidosService.escucharPedidosEnCurso(() => void this.cargar());
  }

  ngOnDestroy(): void {
    if (this.canal) this.pedidosService.dejarDeEscuchar(this.canal);
  }

  async cargar(): Promise<void> {
    try {
      const pedidos = await this.pedidosService.listarEnCurso();
      this.pedidos.set(pedidos);
    } catch (error) {
      this.mensajeError.set(
        error instanceof Error ? error.message : 'No se pudieron cargar los pedidos.',
      );
    } finally {
      this.cargando.set(false);
    }
  }

  volver(): void {
    this.router.navigateByUrl('/inicio');
  }

  // Agrupa los items del pedido por sector para mostrar "Cocina" y
  // "Bar" por separado dentro de la misma tarjeta.
  itemsPorSector(pedido: PedidoPorSector, sector: 'cocina' | 'bar') {
    return (pedido.items ?? []).filter((i) => i.sector === sector);
  }

  // Punto 19: el mozo retira el pedido completo y lo entrega. Al
  // cambiar el estado, la propia suscripción de Realtime saca la
  // tarjeta del listado (ya no está en ESTADOS_PEDIDO_EN_SECTOR).
  async entregarPedido(pedido: PedidoPorSector): Promise<void> {
    if (this.entregandoId()) return;

    this.entregandoId.set(pedido.id);
    this.mensajeError.set('');

    try {
      await this.pedidosService.marcarPedidoEntregado(pedido.id);
      await Haptics.notification({ type: NotificationType.Success }).catch(() => {});
    } catch (error) {
      this.mensajeError.set(
        error instanceof Error ? error.message : 'No se pudo entregar el pedido.',
      );
      try {
        await Haptics.notification({ type: NotificationType.Error });
      } catch {}
    } finally {
      this.entregandoId.set(null);
    }
  }
}
