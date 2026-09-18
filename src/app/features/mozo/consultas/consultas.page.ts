import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { MesasService } from '../../../core/services/mesas.service';
import { MensajesService, HiloActivo } from '../../../core/services/mensajes.service';
import { Mesa } from '../../../core/models/mesa.model';

@Component({
  selector: 'app-consultas',
  standalone: true,
  templateUrl: './consultas.page.html',
  styleUrls: ['./consultas.page.scss'],
  imports: [CommonModule],
})
export class ConsultasPage implements OnInit, OnDestroy {
  private mesasService = inject(MesasService);
  private mensajesService = inject(MensajesService);
  private router = inject(Router);

  mesas = signal<Mesa[]>([]);
  cargando = signal(true);
  mensajeError = signal('');
  mesasConNovedad = signal<Set<string>>(new Set());

  // Vista previa (último mensaje del hilo más reciente) por mesa, para
  // mostrar la lista de conversaciones con nombre + último texto, como
  // en cualquier app de chat.
  previews = signal<Map<string, HiloActivo>>(new Map());

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

      await this.refrescarListado();

      // Cualquier mensaje nuevo (de cliente o mozo) recalcula tanto el
      // puntito de novedad como la vista previa de esa mesa, sin
      // depender de recargar la pantalla.
      this.canal = this.mensajesService.escucharTodosLosMensajes((mensaje) => {
        const perteneceALaLista = this.mesas().some((m) => m.id === mensaje.mesa_id);
        if (perteneceALaLista) {
          void this.refrescarListado();
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

  private async refrescarListado(): Promise<void> {
    try {
      const mesas = this.mesas();

      const novedades = await this.mensajesService.listarMesasConMensajeNuevo(
        mesas.map((m) => m.id),
      );
      this.mesasConNovedad.set(novedades);

      const entradas = await Promise.all(
        mesas.map(async (mesa) => {
          try {
            const hilos = await this.mensajesService.listarHilosDeMesa(mesa.id);
            const masReciente = [...hilos].sort((a, b) =>
              a.ultimaFecha < b.ultimaFecha ? 1 : -1,
            )[0];
            return [mesa.id, masReciente] as const;
          } catch {
            return [mesa.id, undefined] as const;
          }
        }),
      );

      const mapa = new Map<string, HiloActivo>();
      for (const [mesaId, hilo] of entradas) {
        if (hilo) {
          mapa.set(mesaId, hilo);
        }
      }
      this.previews.set(mapa);
    } catch (error) {
      console.warn('No se pudo refrescar el listado de conversaciones:', error);
    }
  }

  previewDe(mesa: Mesa): HiloActivo | undefined {
    return this.previews().get(mesa.id);
  }

  tieneNovedad(mesa: Mesa): boolean {
    return this.mesasConNovedad().has(mesa.id);
  }

  volver(): void {
    this.router.navigateByUrl('/inicio');
  }

  async abrirMesa(mesa: Mesa): Promise<void> {
    this.mesasConNovedad.update((set) => {
      const copia = new Set(set);
      copia.delete(mesa.id);
      return copia;
    });

    try {
      const hilos = await this.mensajesService.listarHilosDeMesa(mesa.id);
      if (hilos.length === 1) {
        // Un solo comensal escribiendo: vamos directo al chat, sin
        // la parada intermedia de la lista de conversaciones.
        this.router.navigate(['/mozo/chat', mesa.numero, hilos[0].hiloClienteId]);
      } else {
        this.router.navigate(['/mozo/hilos', mesa.numero]);
      }
    } catch {
      // Si falla la consulta, no bloqueamos al mozo: lo mandamos a
      // la lista igual, que ya maneja sus propios errores.
      this.router.navigate(['/mozo/hilos', mesa.numero]);
    }
  }

  private async dispararError(texto: string): Promise<void> {
    this.mensajeError.set(texto);
    try {
      await Haptics.notification({ type: NotificationType.Error });
    } catch {}
  }
}
