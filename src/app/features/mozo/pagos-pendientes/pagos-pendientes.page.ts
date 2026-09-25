import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { CuentaService, PagoPendiente } from '../../../core/services/cuenta.service';

// Punto 22 del PDF: el mozo confirma el pago que hizo el cliente (punto
// 21). Al confirmar se cierra el pedido y se libera la mesa; el cliente lo
// ve en su pantalla y dueño y supervisor reciben la push (ver
// supabase/functions/notificar-cuenta).
@Component({
  selector: 'app-pagos-pendientes',
  standalone: true,
  templateUrl: './pagos-pendientes.page.html',
  styleUrls: ['./pagos-pendientes.page.scss'],
  imports: [CommonModule],
})
export class PagosPendientesPage implements OnInit, OnDestroy {
  private cuentaService = inject(CuentaService);
  private router = inject(Router);

  pagos = signal<PagoPendiente[]>([]);
  cargando = signal(true);
  mensajeError = signal('');
  mensajeExito = signal('');

  // Pago que se está confirmando (deshabilita el botón y evita el doble envío).
  confirmandoId = signal<string | null>(null);

  private canal?: RealtimeChannel;

  ngOnInit(): void {
    void this.cargar();
    this.canal = this.cuentaService.escucharPagosPendientes(() => void this.cargar());
  }

  ngOnDestroy(): void {
    if (this.canal) this.cuentaService.dejarDeEscuchar(this.canal);
  }

  async cargar(): Promise<void> {
    try {
      this.pagos.set(await this.cuentaService.listarPagosPendientes());
    } catch (error) {
      this.mensajeError.set(
        error instanceof Error ? error.message : 'No se pudieron cargar los pagos.',
      );
    } finally {
      this.cargando.set(false);
    }
  }

  volver(): void {
    this.router.navigateByUrl('/inicio');
  }

  async confirmar(pago: PagoPendiente): Promise<void> {
    if (this.confirmandoId()) return;

    this.mensajeError.set('');
    this.mensajeExito.set('');
    this.confirmandoId.set(pago.id);

    try {
      await this.cuentaService.confirmarPago(pago);
      this.pagos.update((lista) => lista.filter((p) => p.id !== pago.id));
      this.mensajeExito.set(`Pago de la mesa ${pago.numeroMesa} confirmado. La mesa quedó libre.`);
      await Haptics.notification({ type: NotificationType.Success }).catch(() => {});
    } catch (error) {
      this.mensajeError.set(
        error instanceof Error ? error.message : 'No se pudo confirmar el pago.',
      );
      await Haptics.notification({ type: NotificationType.Error }).catch(() => {});
    } finally {
      this.confirmandoId.set(null);
    }
  }
}
