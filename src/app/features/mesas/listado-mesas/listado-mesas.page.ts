import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Haptics, NotificationType } from '@capacitor/haptics';
import * as QRCode from 'qrcode';
import { MesasService } from '../../../core/services/mesas';
import { Mesa, EstadoMesa } from '../../../core/models/mesa.model';

@Component({
  selector: 'app-listado-mesas',
  standalone: true,
  templateUrl: './listado-mesas.page.html',
  styleUrls: ['./listado-mesas.page.scss'],
  imports: [CommonModule, RouterLink],
})
export class ListadoMesasPage implements OnInit {
  private mesasService = inject(MesasService);

  mesas = signal<Mesa[]>([]);
  cargando = signal(true);
  mensajeError = signal('');

  estadosDisponibles: { valor: EstadoMesa; etiqueta: string }[] = [
    { valor: 'libre', etiqueta: 'Libre' },
    { valor: 'ocupada', etiqueta: 'Ocupada' },
    { valor: 'reservada', etiqueta: 'Reservada' },
  ];

  // Mesa cuyo QR se está mostrando (null = modal cerrado)
  mesaQrAbierta = signal<Mesa | null>(null);
  qrImagenUrl = signal<string | null>(null);

  // id de la mesa que se está actualizando ahora mismo (deshabilita sus chips)
  actualizandoId = signal<string | null>(null);

  ngOnInit() {
    this.cargarMesas();
  }

  async cargarMesas() {
    this.cargando.set(true);
    this.mensajeError.set('');
    try {
      const mesas = await this.mesasService.listarMesas();
      this.mesas.set(mesas);
    } catch (error) {
      await this.dispararError(
        error instanceof Error ? error.message : 'No se pudieron cargar las mesas.',
      );
    } finally {
      this.cargando.set(false);
    }
  }

  // Acá se dibuja el QR: usa el mismo texto que ya está guardado en
  // 'qr_code' desde que se creó la mesa (no se genera nada nuevo).
  async verQR(mesa: Mesa) {
    this.mesaQrAbierta.set(mesa);
    this.qrImagenUrl.set(null);
    try {
      const dataUrl = await QRCode.toDataURL(mesa.qr_code, {
        width: 240,
        margin: 1,
        color: { dark: '#a83820', light: '#f9bfa0' },
      });
      this.qrImagenUrl.set(dataUrl);
    } catch {
      await this.dispararError('No se pudo generar el código QR.');
      this.mesaQrAbierta.set(null);
    }
  }

  cerrarQR() {
    this.mesaQrAbierta.set(null);
    this.qrImagenUrl.set(null);
  }

  async cambiarEstado(mesa: Mesa, nuevoEstado: EstadoMesa) {
    if (mesa.estado === nuevoEstado || this.actualizandoId()) return;

    this.actualizandoId.set(mesa.id);
    try {
      await this.mesasService.actualizarEstado(mesa.id, nuevoEstado);
      this.mesas.update((lista) =>
        lista.map((m) => (m.id === mesa.id ? { ...m, estado: nuevoEstado } : m)),
      );
    } catch (error) {
      await this.dispararError(
        error instanceof Error ? error.message : 'No se pudo actualizar la disponibilidad.',
      );
    } finally {
      this.actualizandoId.set(null);
    }
  }

  private async dispararError(texto: string) {
    this.mensajeError.set(texto);
    try {
      await Haptics.notification({ type: NotificationType.Error });
    } catch {}
  }
}