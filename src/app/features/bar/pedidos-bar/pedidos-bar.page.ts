import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { PedidosService, PedidoPorSector } from '../../../core/services/pedidos.service';
import { PedidoItem, ESTADO_ITEM_LISTO } from '../../../core/models/pedido.model';

// Punto 14 del PDF: una vez que el mozo confirma un pedido, cada item
// queda derivado a su sector (ya lo trae guardado desde que el cliente
// lo armó, punto 12). Esta pantalla es la mitad "bar": lista, para cada
// pedido confirmado, únicamente los items de sector 'bar', agrupados
// por pedido/mesa.
@Component({
  selector: 'app-pedidos-bar',
  standalone: true,
  templateUrl: './pedidos-bar.page.html',
  styleUrls: ['./pedidos-bar.page.scss'],
  imports: [CommonModule],
})
export class PedidosBarPage implements OnInit, OnDestroy {
  private pedidosService = inject(PedidosService);
  private router = inject(Router);

  pedidos = signal<PedidoPorSector[]>([]);
  cargando = signal(true);
  mensajeError = signal('');

  // Punto 18: item que se está marcando como listo en este momento
  // (para deshabilitar su botón y no mandar la marca dos veces).
  marcandoId = signal<string | null>(null);

  private canal?: RealtimeChannel;

  ngOnInit(): void {
    void this.cargar();
    this.canal = this.pedidosService.escucharPedidosSector('bar', () => void this.cargar());
  }

  ngOnDestroy(): void {
    if (this.canal) this.pedidosService.dejarDeEscuchar(this.canal);
  }

  async cargar(): Promise<void> {
    try {
      const pedidos = await this.pedidosService.listarPorSector('bar');
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

  // Punto 18: bar marca un producto como listo. El trigger de la base
  // se encarga de detectar el pedido completo (ver
  // supabase/sql/punto-18-setup.sql); acá sólo reflejamos el cambio.
  async marcarListo(item: PedidoItem): Promise<void> {
    if (this.marcandoId()) return;

    this.marcandoId.set(item.id);
    this.mensajeError.set('');

    try {
      await this.pedidosService.marcarItemListo(item.id);
      await Haptics.notification({ type: NotificationType.Success }).catch(() => {});
      this.pedidos.update((lista) =>
        lista.map((p) =>
          p.id !== item.pedido_id
            ? p
            : {
                ...p,
                items: p.items?.map((i) =>
                  i.id === item.id ? { ...i, estado: ESTADO_ITEM_LISTO } : i,
                ),
              },
        ),
      );
    } catch (error) {
      this.mensajeError.set(
        error instanceof Error ? error.message : 'No se pudo marcar el producto como listo.',
      );
    } finally {
      this.marcandoId.set(null);
    }
  }
}
