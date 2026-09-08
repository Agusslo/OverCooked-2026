import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { MesasService } from '../../../core/services/mesas.service';
import { Mesa } from '../../../core/models/mesa.model';

@Component({
  selector: 'app-consultas',
  standalone: true,
  templateUrl: './consultas.page.html',
  styleUrls: ['./consultas.page.scss'],
})
export class ConsultasPage implements OnInit {
  private mesasService = inject(MesasService);
  private router = inject(Router);

  mesas = signal<Mesa[]>([]);
  cargando = signal(true);
  mensajeError = signal('');

  ngOnInit(): void {
    this.cargarMesas();
  }

  async cargarMesas(): Promise<void> {
    this.cargando.set(true);
    this.mensajeError.set('');
    try {
      const mesas = await this.mesasService.listarOcupadas();
      this.mesas.set(mesas);
    } catch (error) {
      await this.dispararError(
        error instanceof Error ? error.message : 'No se pudieron cargar las mesas.',
      );
    } finally {
      this.cargando.set(false);
    }
  }

  abrirChat(mesa: Mesa): void {
    this.router.navigate(['/mozo/chat', mesa.numero]);
  }

  private async dispararError(texto: string): Promise<void> {
    this.mensajeError.set(texto);
    try {
      await Haptics.notification({ type: NotificationType.Error });
    } catch {}
  }
}