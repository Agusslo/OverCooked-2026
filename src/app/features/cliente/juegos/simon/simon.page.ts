import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { AuthService } from '../../../../core/services/auth.service';
import { MesasService } from '../../../../core/services/mesas.service';
import { JuegosService } from '../../../../core/services/juegos.service';

type Color = 'rojo' | 'azul' | 'verde' | 'amarillo';

const COLORES: Color[] = ['rojo', 'azul', 'verde', 'amarillo'];
const TIEMPO_POR_RONDA = 5; // segundos que tiene el jugador para repetir la secuencia
const META_RONDAS = 8;

@Component({
  selector: 'app-simon',
  standalone: true,
  templateUrl: './simon.page.html',
  styleUrls: ['./simon.page.scss'],
})
export class SimonPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);
  private mesasService = inject(MesasService);
  private juegosService = inject(JuegosService);

  colores = COLORES;

  // Estado del juego
  juegoIniciado = signal(false);
  juegoTerminado = signal(false);
  victoria = signal(false);
  turnoJugador = signal(false);
  colorActivo = signal<Color | null>(null);
  score = signal(0);
  vidas = signal(3);
  rondaActual = signal(0);
  tiempoRestante = signal(TIEMPO_POR_RONDA);
  mensajeRonda = signal('');
  descuentoGanado = signal(0);

  // Estado de carga/guardado
  yaJugadoAntes = signal(false);
  cargando = signal(true);
  mensajeError = signal('');

  private secuencia: Color[] = [];
  private indiceJugador = 0;
  private intervaloTimer?: ReturnType<typeof setInterval>;
  private timeoutSecuencia?: ReturnType<typeof setTimeout>;

  private numeroMesa = 0;
  private mesaId = '';
  private clienteId = '';

  async ngOnInit(): Promise<void> {
    this.numeroMesa = Number(this.route.snapshot.paramMap.get('numero'));
    this.clienteId = this.authService.usuarioActual?.id ?? '';

    try {
      const mesa = await this.mesasService.obtenerPorNumero(this.numeroMesa);
      this.mesaId = mesa.id;

      const yaJugo = await this.juegosService.yaJugo(
        this.clienteId,
        this.mesaId,
        'simon',
      );
      this.yaJugadoAntes.set(yaJugo);
    } catch (error) {
      this.mensajeError.set(
        error instanceof Error ? error.message : 'No se pudo cargar el juego.',
      );
    } finally {
      this.cargando.set(false);
    }
  }

  ngOnDestroy(): void {
    this.limpiarTimers();
  }

  iniciarJuego(): void {
    if (this.yaJugadoAntes()) return;
    this.secuencia = [];
    this.indiceJugador = 0;
    this.score.set(0);
    this.vidas.set(3);
    this.rondaActual.set(0);
    this.mensajeRonda.set('');
    this.juegoTerminado.set(false);
    this.juegoIniciado.set(true);
    this.siguienteRonda();
  }

  private siguienteRonda(): void {
    this.rondaActual.update((r) => r + 1);

    if (this.rondaActual() > META_RONDAS) {
      void this.terminarJuego(true);
      return;
    }

    this.indiceJugador = 0;
    this.turnoJugador.set(false);
    this.mensajeRonda.set('');

    const colorNuevo = COLORES[Math.floor(Math.random() * COLORES.length)];
    this.secuencia.push(colorNuevo);

    this.mostrarSecuencia();
  }

  private mostrarSecuencia(): void {
    let i = 0;
    const mostrarSiguiente = () => {
      if (i >= this.secuencia.length) {
        // Terminó de mostrar la secuencia, turno del jugador
        this.turnoJugador.set(true);
        this.iniciarTimer();
        return;
      }
      this.colorActivo.set(this.secuencia[i]);
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
      // Cada color se ilumina 500ms y apaga 300ms antes del siguiente
      this.timeoutSecuencia = setTimeout(() => {
        this.colorActivo.set(null);
        this.timeoutSecuencia = setTimeout(() => {
          i++;
          mostrarSiguiente();
        }, 300);
      }, 500);
    };

    // Pequeña pausa antes de empezar la secuencia nueva
    this.timeoutSecuencia = setTimeout(mostrarSiguiente, 800);
  }

  private iniciarTimer(): void {
    this.tiempoRestante.set(TIEMPO_POR_RONDA);
    this.intervaloTimer = setInterval(() => {
      this.tiempoRestante.update((t) => t - 1);
      if (this.tiempoRestante() <= 0) {
        this.limpiarTimers();
        void this.erroCometido('Tiempo agotado');
      }
    }, 1000);
  }

  async clickColor(color: Color): Promise<void> {
    if (!this.turnoJugador() || this.juegoTerminado()) return;

    this.colorActivo.set(color);
    setTimeout(() => this.colorActivo.set(null), 200);

    if (color === this.secuencia[this.indiceJugador]) {
      this.indiceJugador++;
      await Haptics.notification({ type: NotificationType.Success }).catch(() => {});

      if (this.indiceJugador === this.secuencia.length) {
        // Completó la secuencia
        this.limpiarTimers();
        this.score.update((s) => s + this.rondaActual() * 10);
        this.mensajeRonda.set('¡Correcto!');
        this.turnoJugador.set(false);
        // Pausa antes de la siguiente ronda
        this.timeoutSecuencia = setTimeout(() => this.siguienteRonda(), 1200);
      }
    } else {
      this.limpiarTimers();
      await this.erroCometido('Secuencia incorrecta');
    }
  }

  private async erroCometido(motivo: string): Promise<void> {
    this.vidas.update((v) => v - 1);
    this.mensajeRonda.set(`${motivo}. Vidas: ${this.vidas()} / 3`);
    await Haptics.notification({ type: NotificationType.Error }).catch(() => {});

    if (this.vidas() === 0) {
      await this.terminarJuego();
    } else {
      // Sigue jugando: muestra la misma secuencia de nuevo
      this.turnoJugador.set(false);
      this.indiceJugador = 0;
      this.timeoutSecuencia = setTimeout(() => this.mostrarSecuencia(), 1200);
    }
  }

  private async terminarJuego(gano = false): Promise<void> {
    this.limpiarTimers();
    this.juegoTerminado.set(true);
    this.victoria.set(gano);
    this.turnoJugador.set(false);

    const descuento = gano ? 10 : 0;
    this.descuentoGanado.set(descuento);

    if (!this.yaJugadoAntes()) {
      try {
        await this.juegosService.registrarResultado(
          this.clienteId,
          this.mesaId,
          'simon',
          this.score(),
          descuento,
        );
      } catch {
        this.mensajeError.set('El juego terminó, pero no se pudo guardar el resultado.');
      }
    }
  }

  private limpiarTimers(): void {
    if (this.intervaloTimer) {
      clearInterval(this.intervaloTimer);
      this.intervaloTimer = undefined;
    }
    if (this.timeoutSecuencia) {
      clearTimeout(this.timeoutSecuencia);
      this.timeoutSecuencia = undefined;
    }
  }

  volver(): void {
    this.limpiarTimers();
    this.router.navigate(['/cliente/juegos', this.numeroMesa]);
  }
}