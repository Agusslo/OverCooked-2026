import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { AuthService } from '../../../../core/services/auth.service';
import { MesasService } from '../../../../core/services/mesas.service';
import { JuegosService } from '../../../../core/services/juegos.service';

const PALOS = ['♠', '♥', '♦', '♣'];
const VALORES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]; // 11=J,12=Q,13=K,14=A

function cartaAleatoria() {
  const valor = VALORES[Math.floor(Math.random() * VALORES.length)];
  const palo = PALOS[Math.floor(Math.random() * PALOS.length)];
  return { valor, palo };
}

function etiquetaValor(v: number): string {
  if (v === 11) return 'J';
  if (v === 12) return 'Q';
  if (v === 13) return 'K';
  if (v === 14) return 'A';
  return String(v);
}

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

  cartaActual = signal(cartaAleatoria());
  puntaje = signal(0);
  terminado = signal(false);
  descuentoGanado = signal(0);
  yaJugadoAntes = signal(false);
  cargando = signal(true);

  private numeroMesa = 0;
  private mesaId = '';
  private clienteId = '';

  etiquetaValor = etiquetaValor;

  async ngOnInit(): Promise<void> {
    this.numeroMesa = Number(this.route.snapshot.paramMap.get('numero'));
    this.clienteId = this.authService.usuarioActual?.id ?? '';

    const mesa = await this.mesasService.obtenerPorNumero(this.numeroMesa);
    this.mesaId = mesa.id;

    const yaJugo = await this.juegosService.yaJugo(this.clienteId, this.mesaId, 'higher_lower');
    this.yaJugadoAntes.set(yaJugo);
    this.cargando.set(false);
  }

  async elegir(mayor: boolean): Promise<void> {
    if (this.terminado() || this.yaJugadoAntes()) return;

    const anterior = this.cartaActual();
    const nueva = cartaAleatoria();
    const acerto = mayor ? nueva.valor >= anterior.valor : nueva.valor <= anterior.valor;

    this.cartaActual.set(nueva);

    if (acerto) {
      this.puntaje.update((p) => p + 1);
      await Haptics.notification({ type: NotificationType.Success }).catch(() => {});
    } else {
      await this.terminarJuego();
    }
  }

  private async terminarJuego(): Promise<void> {
    this.terminado.set(true);
    const puntaje = this.puntaje();
    // Umbrales de descuento (definir junto al grupo si quieren otros valores)
    const descuento = puntaje >= 5 ? 20 : puntaje >= 3 ? 15 : puntaje >= 1 ? 10 : 0;
    this.descuentoGanado.set(descuento);

    await this.juegosService.registrarResultado(
      this.clienteId,
      this.mesaId,
      'higher_lower',
      puntaje,
      descuento,
    );
    await Haptics.notification({ type: NotificationType.Error }).catch(() => {});
  }

  volver(): void {
    this.router.navigate(['/cliente/juegos', this.numeroMesa]);
  }
}