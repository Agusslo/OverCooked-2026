import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { EncuestasService } from '../../../core/services/encuestas.service';
import { PedidosService } from '../../../core/services/pedidos.service';
import { Encuesta } from '../../../core/models/encuesta.model';
import { precargarImagenes } from '../../utils/precargarImagenes';

// Imágenes de respaldo para acompañar cada pregunta si no se pueden
// traer las fotos de los platos del pedido.
const ILUSTRACIONES = [
  'assets/juegos/memotest/pizza.webp',
  'assets/juegos/memotest/bife.webp',
  'assets/juegos/memotest/torta.png',
  'assets/juegos/memotest/palta.webp',
  'assets/juegos/memotest/tomate.webp',
];

@Component({
  selector: 'app-encuesta',
  standalone: true,
  templateUrl: './encuesta.page.html',
  styleUrls: ['./encuesta.page.scss'],
  imports: [CommonModule, FormsModule, RouterLink],
})
export class EncuestaPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private encuestasService = inject(EncuestasService);
  private pedidosService = inject(PedidosService);

  private pedidoId = this.route.snapshot.paramMap.get('pedidoId')!;

  // Fotos de los platos que pidió el cliente: cada pregunta se acompaña
  // con una (punto 20), así la encuesta se relaciona con su estadía.
  fotosPedido = signal<string[]>([]);

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

  // Sin fotos del pedido se usan las ilustraciones (con fondo
  // transparente, por eso se muestran enteras y no recortadas).
  esIlustracion = computed(() => this.fotosPedido().length === 0);

  imagenActual = computed(() => {
    const fotos = this.esIlustracion() ? ILUSTRACIONES : this.fotosPedido();
    return fotos[this.indice() % fotos.length];
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

      const [encuesta, fotos] = await Promise.all([
        this.encuestasService.obtenerEncuestaActiva(),
        this.obtenerFotosPedido(),
      ]);
      if (!encuesta || encuesta.preguntas.length === 0) {
        this.mensajeError.set('No hay ninguna encuesta disponible en este momento.');
        return;
      }
      this.fotosPedido.set(fotos);
      precargarImagenes(this.esIlustracion() ? ILUSTRACIONES : fotos);
      this.encuesta.set(encuesta);
    } catch (error) {
      await this.dispararError(
        error instanceof Error ? error.message : 'No se pudo cargar la encuesta.',
      );
    } finally {
      this.cargando.set(false);
    }
  }

  // Las fotos sólo decoran la encuesta: si no se pueden traer no se
  // corta la carga, se muestran las ilustraciones de respaldo.
  private async obtenerFotosPedido(): Promise<string[]> {
    try {
      const pedido = await this.pedidosService.obtenerPedidoConItems(this.pedidoId);
      const fotos = (pedido.items ?? [])
        .map((i) => i.foto_url ?? '')
        .filter((u) => !!u);
      return [...new Set(fotos)];
    } catch {
      return [];
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