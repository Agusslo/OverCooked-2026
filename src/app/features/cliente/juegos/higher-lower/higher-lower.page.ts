import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { AuthService } from '../../../../core/services/auth.service';
import { MesasService } from '../../../../core/services/mesas.service';
import { JuegosService } from '../../../../core/services/juegos.service';

interface IPalo {
  nombre: 'Tomate' | 'Zanahoria' | 'Lechuga' | 'Cebolla';
  icono: string;
  clase: string;
}

interface ICarta {
  nombre: string;
  valor: number;
  palo: IPalo;
}

const PALOS: IPalo[] = [
  { nombre: 'Tomate', icono: '🍅', clase: 'carta--tomate' },
  { nombre: 'Zanahoria', icono: '🥕', clase: 'carta--zanahoria' },
  { nombre: 'Lechuga', icono: '🥬', clase: 'carta--lechuga' },
  { nombre: 'Cebolla', icono: '🧅', clase: 'carta--cebolla' },
];

@Component({
  selector: 'app-higher-lower',
  standalone: true,
  templateUrl: './higher-lower.page.html',
  styleUrls: ['./higher-lower.page.scss'],
})
export class HigherLowerPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);
  private mesasService = inject(MesasService);
  private juegosService = inject(JuegosService);

  private readonly META_ACIERTOS = 7;

  // Valores de la carta; el palo se sortea aparte en cada ronda.
  private readonly valores: { nombre: string; valor: number }[] = [
    { nombre: 'A', valor: 1 },
    { nombre: '2', valor: 2 },
    { nombre: '3', valor: 3 },
    { nombre: '4', valor: 4 },
    { nombre: '5', valor: 5 },
    { nombre: '6', valor: 6 },
    { nombre: '7', valor: 7 },
    { nombre: '8', valor: 8 },
    { nombre: '9', valor: 9 },
    { nombre: '10', valor: 10 },
    { nombre: 'J', valor: 11 },
    { nombre: 'Q', valor: 12 },
    { nombre: 'K', valor: 13 }
  ];

  cartaActual = signal<ICarta | null>(null);
  vidas = signal(3);
  rondasGanadas = signal(0);
  juegoTerminado = signal(false);
  victoria = signal(false);
  mensajeRonda = signal('');
  descuentoGanado = signal(0);

  yaJugadoAntes = signal(false);
  cargando = signal(true);
  mensajeError = signal('');

  private numeroMesa = 0;
  private mesaId = '';
  private clienteId = '';

  // El invitado (anónimo) puede jugar, pero sin descuento: no se
  // guarda su resultado ni se limita a una partida por mesa.
  esAnonimo = false;

  async ngOnInit(): Promise<void> {
    this.numeroMesa = Number(this.route.snapshot.paramMap.get('numero'));
    this.clienteId = this.authService.usuarioActual?.id ?? '';
    this.esAnonimo = this.authService.usuarioActual?.perfil === 'anonimo';

    try {
      const mesa = await this.mesasService.obtenerPorNumero(this.numeroMesa);
      this.mesaId = mesa.id;

      const yaJugo = !this.esAnonimo && await this.juegosService.yaJugo(
        this.clienteId,
        this.mesaId,
        'higher_lower',
      );
      this.yaJugadoAntes.set(yaJugo);

      this.cartaAleatoria();
    } catch (error) {
      this.mensajeError.set(
        error instanceof Error ? error.message : 'No se pudo cargar el juego.',
      );
    } finally {
      this.cargando.set(false);
    }
  }

  private cartaAleatoria(): void {
    const valor = this.valores[Math.floor(Math.random() * this.valores.length)];
    const palo = PALOS[Math.floor(Math.random() * PALOS.length)];
    this.cartaActual.set({ ...valor, palo });
  }

  async adivinar(eleccion: 'mayor' | 'menor'): Promise<void> {
    if (this.juegoTerminado() || this.yaJugadoAntes()) return;

    const cartaAnterior = this.cartaActual()!;
    this.cartaAleatoria();
    const cartaNueva = this.cartaActual()!;

    const esCorrecta =
      eleccion === 'mayor'
        ? cartaNueva.valor > cartaAnterior.valor
        : cartaNueva.valor < cartaAnterior.valor;

    if (esCorrecta) {
      this.mensajeRonda.set('¡Correcto!');
      this.rondasGanadas.update((r) => r + 1);
      await Haptics.notification({ type: NotificationType.Success }).catch(() => {});

      if (this.rondasGanadas() === this.META_ACIERTOS) {
        await this.terminar(true);
      }
    } else {
      this.mensajeRonda.set('¡Incorrecto!');
      this.vidas.update((v) => v - 1);
      await Haptics.notification({ type: NotificationType.Error }).catch(() => {});

      if (this.vidas() === 0) {
        await this.terminar(false);
      }
    }
  }

  private async terminar(gano: boolean): Promise<void> {
    this.juegoTerminado.set(true);
    this.victoria.set(gano);

    const descuento = gano && !this.esAnonimo ? 20 : 0;
    this.descuentoGanado.set(descuento);

    if (!this.esAnonimo && !this.yaJugadoAntes()) {
      try {
        await this.juegosService.registrarResultado(
          this.clienteId,
          this.mesaId,
          'higher_lower',
          this.rondasGanadas(),
          descuento,
        );
      } catch (error) {
        this.mensajeError.set('El juego terminó, pero no se pudo guardar el resultado.');
      }
    }
  }

  volver(): void {
    this.router.navigateByUrl('/inicio');
  }

}