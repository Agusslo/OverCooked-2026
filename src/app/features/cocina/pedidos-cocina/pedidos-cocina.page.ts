import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { RealtimeChannel } from '@supabase/supabase-js';
import { PedidosService, PedidoPorSector } from '../../../core/services/pedidos.service';

// Punto 14 del PDF: una vez que el mozo confirma un pedido, cada item
// queda derivado a su sector (ya lo trae guardado desde que el cliente
// lo armó, punto 12). Esta pantalla es la mitad "cocina": lista, para
// cada pedido confirmado, únicamente los items de sector 'cocina',
// agrupados por pedido/mesa.
@Component({
  selector: 'app-pedidos-cocina',
  standalone: true,
  templateUrl: './pedidos-cocina.page.html',
  styleUrls: ['./pedidos-cocina.page.scss'],
  imports: [CommonModule],
})
export class PedidosCocinaPage implements OnInit, OnDestroy {
  private pedidosService = inject(PedidosService);
  private router = inject(Router);

  pedidos = signal<PedidoPorSector[]>([]);
  cargando = signal(true);
  mensajeError = signal('');

  private canal?: RealtimeChannel;

  ngOnInit(): void {
    void this.cargar();
    this.canal = this.pedidosService.escucharPedidosSector('cocina', () => void this.cargar());
  }

  ngOnDestroy(): void {
    if (this.canal) this.pedidosService.dejarDeEscuchar(this.canal);
  }

  async cargar(): Promise<void> {
    try {
      const pedidos = await this.pedidosService.listarPorSector('cocina');
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
