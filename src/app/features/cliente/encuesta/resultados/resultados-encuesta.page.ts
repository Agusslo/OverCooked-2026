import {
  Component,
  OnInit,
  AfterViewInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  inject,
  signal,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Chart, registerables } from 'chart.js';
import { EncuestasService } from '../../../../core/services/encuestas.service';
import {
  Encuesta,
  PreguntaEncuesta,
} from '../../../../core/models/encuesta.model';

Chart.register(...registerables);

@Component({
  selector: 'app-resultados-encuesta',
  standalone: true,
  templateUrl: './resultados-encuesta.page.html',
  styleUrls: ['./resultados-encuesta.page.scss'],
  imports: [CommonModule, RouterLink],
})
export class ResultadosEncuestaPage
  implements OnInit, AfterViewInit, OnDestroy
{
  @ViewChild('canvasGrafico') canvasGrafico?: ElementRef<HTMLCanvasElement>;

  private encuestasService = inject(EncuestasService);
  private route = inject(ActivatedRoute);
  private chart?: Chart;

  // Si se llegó desde la entrada (todavía sin escanear el QR del local),
  // volver a /inicio dejaría ver la sala de espera; se vuelve a la entrada.
  rutaVolver =
    this.route.snapshot.queryParamMap.get('volver') === 'entrada'
      ? '/cliente/entrada'
      : '/inicio';

  cargando = signal(true);
  mensajeError = signal('');
  encuesta = signal<Encuesta | null>(null);
  indice = signal(0);

  comentarios = signal<string[]>([]);
  private vistaLista = false;

  constructor() {
    // Cada vez que cambia la pregunta actual, redibuja el gráfico
    // (o carga los comentarios, si es de texto libre).
    effect(() => {
      const pregunta = this.preguntaActual();
      if (pregunta) {
        this.cargarPregunta(pregunta);
      }
    });
  }

  ngOnInit(): void {
    this.cargarEncuesta();
  }

  ngAfterViewInit(): void {}

  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  preguntaActual(): PreguntaEncuesta | null {
    const enc = this.encuesta();
    return enc ? (enc.preguntas[this.indice()] ?? null) : null;
  }

  async cargarEncuesta(): Promise<void> {
    this.cargando.set(true);
    this.mensajeError.set('');
    try {
      const encuesta = await this.encuestasService.obtenerEncuestaActiva();
      if (!encuesta || encuesta.preguntas.length === 0) {
        this.mensajeError.set(
          'No hay ninguna encuesta con resultados todavía.',
        );
        return;
      }
      this.encuesta.set(encuesta);
    } catch (error) {
      this.mensajeError.set(
        error instanceof Error
          ? error.message
          : 'No se pudieron cargar los resultados.',
      );
    } finally {
      this.cargando.set(false);
    }
  }

  private async cargarPregunta(pregunta: PreguntaEncuesta): Promise<void> {
    this.chart?.destroy();
    this.chart = undefined;

    if (pregunta.tipo_control === 'texto_libre') {
      this.vistaLista = true;
      try {
        const comentarios = await this.encuestasService.obtenerComentarios(
          pregunta.id,
        );
        this.comentarios.set(comentarios);
      } catch (error) {
        this.mensajeError.set('No se pudieron cargar los comentarios.');
      }
      return;
    }

    this.vistaLista = false;

    try {
      const resultados =
        await this.encuestasService.obtenerResultados(pregunta);
      // Esperamos al próximo ciclo para que el <canvas> ya esté
      // renderizado en el DOM (cambió el @switch del html).
      setTimeout(() => this.dibujarGrafico(pregunta, resultados), 0);
    } catch (error) {
      this.mensajeError.set('No se pudieron cargar los resultados.');
    }
  }

  private dibujarGrafico(
    pregunta: PreguntaEncuesta,
    resultados: { etiqueta: string; cantidad: number }[],
  ): void {
    const canvas = this.canvasGrafico?.nativeElement;
    if (!canvas) return;

    const paleta = ['#f0c060', '#d4603a', '#f9bfa0', '#8c2e14', '#a83820'];

    // Variedad de tipos de gráfico según el control (torta, barra, lineal).
    const tipo =
      pregunta.tipo_control === 'si_no'
        ? 'pie'
        : pregunta.tipo_control === 'escala'
          ? 'line'
          : 'bar';

    this.chart = new Chart(canvas, {
      type: tipo,
      data: {
        labels: resultados.map((r) => r.etiqueta),
        datasets: [
          {
            label: 'Respuestas',
            data: resultados.map((r) => r.cantidad),
            backgroundColor: paleta,
            borderColor: tipo === 'line' ? '#f0c060' : paleta,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: tipo === 'pie',
            labels: { color: '#fef5ee' },
          },
        },
        scales:
          tipo === 'pie'
            ? {}
            : {
                x: {
                  ticks: { color: '#fef5ee' },
                  grid: { color: 'rgba(254,245,238,0.1)' },
                },
                y: {
                  beginAtZero: true,
                  ticks: { color: '#fef5ee', stepSize: 1 },
                  grid: { color: 'rgba(254,245,238,0.1)' },
                },
              },
      },
    });
  }

  esVistaLista(): boolean {
    return this.vistaLista;
  }

  siguiente(): void {
    const enc = this.encuesta();
    if (!enc) return;
    if (this.indice() < enc.preguntas.length - 1) {
      this.indice.update((i) => i + 1);
    }
  }

  anterior(): void {
    if (this.indice() > 0) {
      this.indice.update((i) => i - 1);
    }
  }
}
