import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { MesasService } from '../../../core/services/mesas.service';
import { MensajesService, HiloActivo } from '../../../core/services/mensajes.service';
import { Mesa } from '../../../core/models/mesa.model';

@Component({
  selector: 'app-hilos',
  standalone: true,
  templateUrl: './hilos.page.html',
  styleUrls: ['./hilos.page.scss'],
  imports: [CommonModule],
})
export class HilosPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private mesasService = inject(MesasService);
  private mensajesService = inject(MensajesService);

  mesa = signal<Mesa | null>(null);
  hilos = signal<HiloActivo[]>([]);
  cargando = signal(true);
  mensajeError = signal('');

  private canal?: RealtimeChannel;

  async ngOnInit(): Promise<void> {
    const numero = Number(this.route.snapshot.paramMap.get('numero'));
    await this.cargarDatos(numero);
  }

  ngOnDestroy(): void {
    if (this.canal) {
      this.mensajesService.dejarDeEscuchar(this.canal);
    }
  }

  private async cargarDatos(numero: number): Promise<void> {
    this.cargando.set(true);
    this.mensajeError.set('');
    try {
      const mesa = await this.mesasService.obtenerPorNumero(numero);
      this.mesa.set(mesa);
      await this.refrescarHilos(mesa.id);

      // Cualquier mensaje nuevo de esta mesa (cliente O mozo) dispara
      // un recálculo completo: así la vista previa y el puntito
      // siempre reflejan el último estado real, sin importar quién
      // escribió ni desde qué pantalla.
      this.canal = this.mensajesService.escucharMensajesDeMesa(mesa.id, () => {
        void this.refrescarHilos(mesa.id);
      });
    } catch (error) {
      await this.dispararError(
        error instanceof Error ? error.message : 'No se pudieron cargar las conversaciones.',
      );
    } finally {
      this.cargando.set(false);
    }
  }

  private async refrescarHilos(mesaId: string): Promise<void> {
    try {
      const hilos = await this.mensajesService.listarHilosDeMesa(mesaId);
      this.hilos.set(hilos);
    } catch (error) {
      console.warn('No se pudo refrescar la lista de conversaciones:', error);
    }
  }

  volver(): void {
    this.router.navigateByUrl('/mozo/consultas');
  }

  abrirHilo(hilo: HiloActivo): void {
    const mesa = this.mesa();
    if (mesa) {
      this.router.navigate(['/mozo/chat', mesa.numero, hilo.hiloClienteId]);
    }
  }

  private async dispararError(texto: string): Promise<void> {
    this.mensajeError.set(texto);
    try {
      await Haptics.notification({ type: NotificationType.Error });
    } catch {}
  }
}