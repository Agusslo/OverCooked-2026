import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { AuthService } from '../../../../core/services/auth.service';
import { MesasService } from '../../../../core/services/mesas.service';
import { JuegosService } from '../../../../core/services/juegos.service';

interface ICarta {
  nombre: string;
  valor: number;
  imagen: string;
}

// Punto 15: Mayor o Menor. Se juega UNA sola vez por estadía (lo pide
// el PDF: "solo si se gana en el primer intento"), así que no hay
// "jugar de nuevo" una vez que el resultado quedó registrado.
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

  cartas: ICarta[] = [
    { nombre: '2', valor: 2, imagen: 'assets/cartas/carta2.png' },
    { nombre: '3', valor: 3, imagen: 'assets/cartas/carta3.png' },
    { nombre: '4', valor: 4, imagen: 'assets/cartas/carta4.png' },
    { nombre: '5', valor: 5, imagen: 'assets/cartas/carta5.png' },
    { nombre: '6', valor: 6, imagen: 'assets/cartas/carta6.png' },
    { nombre: '7', valor: 7, imagen: 'assets/cartas/carta7.png' },
    { nombre: '8', valor: 8, imagen: 'assets/cartas/carta8.png' },
    { nombre: '9', valor: 9, imagen: 'assets/cartas/carta9.png' },
    { nombre: '10', valor: 10, imagen: 'assets/cartas/carta10.png' },
    { nombre: 'J', valor: 11, imagen: 'assets/cartas/cartaj.png' },
    { nombre: 'Q', valor: 12, imagen: 'assets/cartas/cartaq.png' },
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

  async ngOnInit(): Promise<void> {
    this.numeroMesa = Number(this.route.snapshot.paramMap.get('numero'));
    this.clienteId = this.authService.usuarioActual?.id ?? '';

    try {
      const mesa = await this.mesasService.obtenerPorNumero(this.numeroMesa);
      this.mesaId = mesa.id;

      const yaJugo = await this.juegosService.yaJugo(
        this.clienteId,
        this.mesaId,
        'higher_lower',
      );
      this.yaJugadoAntes.set(yaJugo);

      if (!yaJugo) {
        this.cartaAleatoria();
      }
    } catch (error) {
      this.mensajeError.set(
        error instanceof Error ? error.message : 'No se pudo cargar el juego.',
      );
    } finally {
      this.cargando.set(false);
    }
  }

  private cartaAleatoria(): void {
    const index = Math.floor(Math.random() * this.cartas.length);
    this.cartaActual.set(this.cartas[index]);
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

    // Mapeo de aciertos a descuento. Ganar la partida completa (7
    // aciertos) da el máximo; quedarse a mitad de camino da algo menor.
    const aciertos = this.rondasGanadas();
    const descuento = gano ? 20 : aciertos >= 5 ? 15 : aciertos >= 3 ? 10 : 0;
    this.descuentoGanado.set(descuento);

    try {
      await this.juegosService.registrarResultado(
        this.clienteId,
        this.mesaId,
        'higher_lower',
        aciertos,
        descuento,
      );
    } catch (error) {
      this.mensajeError.set('El juego terminó, pero no se pudo guardar el resultado.');
    }
  }

  volver(): void {
    this.router.navigate(['/cliente/juegos', this.numeroMesa]);
  }
}