import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { MesasService } from '../../../core/services/mesas.service';
import { MensajesService } from '../../../core/services/mensajes.service';
import { Mesa } from '../../../core/models/mesa.model';

@Component({
  selector: 'app-consultas',
  standalone: true,
  templateUrl: './consultas.page.html',
  styleUrls: ['./consultas.page.scss'],
})
export class ConsultasPage implements OnInit, OnDestroy {
  private mesasService = inject(MesasService);
  private mensajesService = inject(MensajesService);
  private router = inject(Router);

  mesas = signal<Mesa[]>([]);
  cargando = signal(true);
  mensajeError = signal('');
  mesasConNovedad = signal<Set<string>>(new Set());

  private canal?: RealtimeChannel;

  ngOnInit(): void {
    this.cargarMesas();
  }

  ngOnDestroy(): void {
    if (this.canal) {
      this.mensajesService.dejarDeEscuchar(this.canal);
    }
  }

  async cargarMesas(): Promise<void> {
    this.cargando.set(true);
    this.mensajeError.set('');
    try {
      const mesas = await this.mesasService.listarOcupadas();
      this.mesas.set(mesas);

      const novedades = await this.mensajesService.listarMesasConMensajeNuevo(
        mesas.map((m) => m.id),
      );
      this.mesasConNovedad.set(novedades);

      // NUEVO: apenas se sabe qué mesas hay, nos suscribimos a
      // cualquier mensaje nuevo de cliente para prender el puntito
      // en vivo, sin depender de recargar la pantalla.
      this.canal = this.mensajesService.escucharTodosLosMensajes((mensaje) => {
        const perteneceALaLista = this.mesas().some((m) => m.id === mensaje.mesa_id);
        if (perteneceALaLista) {
          void this.recalcularNovedades();
        }
      });
    } catch (error) {
      await this.dispararError(
        error instanceof Error ? error.message : 'No se pudieron cargar las mesas.',
      );
    } finally {
      this.cargando.set(false);
    }
  }

  private async recalcularNovedades(): Promise<void> {
    try {
      const novedades = await this.mensajesService.listarMesasConMensajeNuevo(
        this.mesas().map((m) => m.id),
      );
      this.mesasConNovedad.set(novedades);
    } catch (error) {
      console.warn('No se pudo recalcular las novedades:', error);
    }
  }

  tieneNovedad(mesa: Mesa): boolean {
    return this.mesasConNovedad().has(mesa.id);
  }

  abrirMesa(mesa: Mesa): void {

    this.mesasConNovedad.update((set) => {
      const copia = new Set(set);
      copia.delete(mesa.id);
      return copia;
    });
    this.router.navigate(['/mozo/hilos', mesa.numero]);
  }

  private async dispararError(texto: string): Promise<void> {
    this.mensajeError.set(texto);
    try {
      await Haptics.notification({ type: NotificationType.Error });
    } catch {}
  }
}