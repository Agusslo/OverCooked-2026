import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { EncuestasService } from '../../../core/services/encuestas.service';
import { Encuesta } from '../../../core/models/encuesta.model';

@Component({
  selector: 'app-encuesta',
  standalone: true,
  templateUrl: './encuesta.page.html',
  styleUrls: ['./encuesta.page.scss'],
  imports: [CommonModule, FormsModule],
})
export class EncuestaPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private encuestasService = inject(EncuestasService);

  private pedidoId = this.route.snapshot.paramMap.get('pedidoId')!;

  cargando = signal(true);
  enviando = signal(false);
  mensajeError = signal('');
  yaRespondida = signal(false);

  encuesta = signal<Encuesta | null>(null);
  indice = signal(0);

  // Mapa preguntaId -> valor cargado por el cliente.
  respuestas = signal<Record<string, string>>({});

  preguntaActual = computed(() => {
    const enc = this.encuesta();
    return enc ? enc.preguntas[this.indice()] ?? null : null;
  });

  esUltima = computed(() => {
    const enc = this.encuesta();
    return !!enc && this.indice() === enc.preguntas.length - 1;
  });

  progreso = computed(() => {
    const enc = this.encuesta();
    if (!enc || enc.preguntas.length === 0) return 0;
    return ((this.indice() + 1) / enc.preguntas.length) * 100;
  });

  ngOnInit(): void {
    this.cargarEncuesta();
  }

  async cargarEncuesta(): Promise<void> {
    this.cargando.set(true);
    this.mensajeError.set('');
    try {
      const yaRespondio = await this.encuestasService.yaRespondio(this.pedidoId);
      if (yaRespondio) {
        this.yaRespondida.set(true);
        return;
      }

      const encuesta = await this.encuestasService.obtenerEncuestaActiva();
      if (!encuesta || encuesta.preguntas.length === 0) {
        this.mensajeError.set('No hay ninguna encuesta disponible en este momento.');
        return;
      }
      this.encuesta.set(encuesta);
    } catch (error) {
      await this.dispararError(
        error instanceof Error ? error.message : 'No se pudo cargar la encuesta.',
      );
    } finally {
      this.cargando.set(false);
    }
  }

  responderActual(valor: string): void {
    const pregunta = this.preguntaActual();
    if (!pregunta) return;
    this.respuestas.update((r) => ({ ...r, [pregunta.id]: valor }));
  }

  valorActual(): string {
    const pregunta = this.preguntaActual();
    if (!pregunta) return '';
    return this.respuestas()[pregunta.id] ?? '';
  }

  async siguiente(): Promise<void> {
    const pregunta = this.preguntaActual();
    if (!pregunta) return;

    if (!this.valorActual().trim()) {
      await this.dispararError('Respondé esta pregunta antes de seguir.');
      return;
    }

    if (this.esUltima()) {
      await this.enviar();
      return;
    }

    this.indice.update((i) => i + 1);
  }

  volver(): void {
    if (this.indice() > 0) {
      this.indice.update((i) => i - 1);
    }
  }

  private async enviar(): Promise<void> {
    const enc = this.encuesta();
    if (!enc) return;

    this.enviando.set(true);
    this.mensajeError.set('');
    try {
      const respuestasAEnviar = enc.preguntas.map((p) => ({
        preguntaId: p.id,
        valor: this.respuestas()[p.id] ?? '',
      }));

      await this.encuestasService.guardarRespuestas(this.pedidoId, respuestasAEnviar);
      await Haptics.notification({ type: NotificationType.Success }).catch(() => {});
      this.router.navigateByUrl(`/cliente/estado-pedido/${this.pedidoId}`);
    } catch (error) {
      await this.dispararError(
        error instanceof Error ? error.message : 'No se pudieron enviar tus respuestas.',
      );
    } finally {
      this.enviando.set(false);
    }
  }

  private async dispararError(texto: string): Promise<void> {
    this.mensajeError.set(texto);
    try {
      await Haptics.notification({ type: NotificationType.Error });
    } catch {}
  }
}