import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { RealtimeChannel } from '@supabase/supabase-js';
import { PedidosService, PedidoPorSector } from '../../../core/services/pedidos.service';

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
}
