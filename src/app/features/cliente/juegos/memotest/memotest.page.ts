import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { AuthService } from '../../../../core/services/auth.service';
import { MesasService } from '../../../../core/services/mesas.service';
import { JuegosService } from '../../../../core/services/juegos.service';

interface Ficha {
  id: number;
  ingrediente: string;
  imagen: string;
  vuelta: boolean;
  encontrada: boolean;
}

// Las 6 imágenes de ingredientes — confirmá que los nombres de archivo
// coincidan exactamente con lo que tenés en assets/comidas/
const INGREDIENTES = [
  { nombre: 'tomate',    imagen: 'assets/comidas-juegos/tomate.png' },
  { nombre: 'lechuga',   imagen: 'assets/comidas-juegos/lechuga.png' },
  { nombre: 'zanahoria', imagen: 'assets/comidas-juegos/zanahoria.png' },
  { nombre: 'bife',      imagen: 'assets/comidas-juegos/bife.png' },
  { nombre: 'pizza',     imagen: 'assets/comidas-juegos/pizza.png' },
  { nombre: 'torta',     imagen: 'assets/comidas-juegos/torta.png' },
];

function mezclar<T>(arr: T[]): T[] {
  // Fisher-Yates: algoritmo estándar para mezclar un array de forma
  // uniforme (cada permutación tiene la misma probabilidad).
  const copia = [...arr];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

@Component({
  selector: 'app-memotest',
  standalone: true,
  templateUrl: './memotest.page.html',
  styleUrls: ['./memotest.page.scss'],
  imports: [CommonModule],
})
export class MemotestPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);
  private mesasService = inject(MesasService);
  private juegosService = inject(JuegosService);

  fichas = signal<Ficha[]>([]);
  vidas = signal(3);
  pares = signal(0);
  juegoTerminado = signal(false);
  victoria = signal(false);
  descuentoGanado = signal(0);
  mensajeError = signal('');
  yaJugadoAntes = signal(false);
  cargando = signal(true);

  // Fichas actualmente dadas vuelta (máximo 2 a la vez)
  private seleccionadas: Ficha[] = [];
  // Bloqueo temporal mientras se muestran dos fichas que no matchean
  private bloqueado = false;
  private timeoutComparacion?: ReturnType<typeof setTimeout>;

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
        'memotest',
      );
      this.yaJugadoAntes.set(yaJugo);

      if (!yaJugo) {
        this.armarTablero();
      }
    } catch (error) {
      this.mensajeError.set(
        error instanceof Error ? error.message : 'No se pudo cargar el juego.',
      );
    } finally {
      this.cargando.set(false);
    }
  }

  ngOnDestroy(): void {
    if (this.timeoutComparacion) {
      clearTimeout(this.timeoutComparacion);
    }
  }

  private armarTablero(): void {
    // Generamos 2 fichas por ingrediente (un par) y las mezclamos
    const fichasBase: Ficha[] = INGREDIENTES.flatMap((ing, i) => [
      { id: i * 2,     ingrediente: ing.nombre, imagen: ing.imagen, vuelta: false, encontrada: false },
      { id: i * 2 + 1, ingrediente: ing.nombre, imagen: ing.imagen, vuelta: false, encontrada: false },
    ]);
    this.fichas.set(mezclar(fichasBase));
    this.seleccionadas = [];
    this.bloqueado = false;
  }

  clickFicha(ficha: Ficha): void {
    // Ignoramos clicks cuando: está bloqueado, la ficha ya está vuelta
    // o encontrada, o ya hay 2 seleccionadas esperando comparación.
    if (
      this.bloqueado ||
      ficha.vuelta ||
      ficha.encontrada ||
      this.seleccionadas.length >= 2 ||
      this.juegoTerminado()
    ) {
      return;
    }

    // Damos vuelta la ficha
    this.fichas.update((lista) =>
      lista.map((f) => (f.id === ficha.id ? { ...f, vuelta: true } : f)),
    );
    this.seleccionadas.push({ ...ficha, vuelta: true });

    if (this.seleccionadas.length === 2) {
      this.bloqueado = true;
      this.comparar();
    }
  }

  private comparar(): void {
    const [a, b] = this.seleccionadas;

    if (a.ingrediente === b.ingrediente) {
      // Par correcto
      void Haptics.notification({ type: NotificationType.Success }).catch(() => {});
      this.fichas.update((lista) =>
        lista.map((f) =>
          f.ingrediente === a.ingrediente ? { ...f, encontrada: true } : f,
        ),
      );
      this.pares.update((p) => p + 1);
      this.seleccionadas = [];
      this.bloqueado = false;

      if (this.pares() === INGREDIENTES.length) {
        void this.terminarJuego(true);
      }
    } else {
      // Par incorrecto: mostramos las fichas 800ms y las volvemos a tapar
      void Haptics.notification({ type: NotificationType.Error }).catch(() => {});
      this.timeoutComparacion = setTimeout(() => {
        this.fichas.update((lista) =>
          lista.map((f) =>
            f.id === a.id || f.id === b.id ? { ...f, vuelta: false } : f,
          ),
        );
        this.seleccionadas = [];
        this.vidas.update((v) => v - 1);
        this.bloqueado = false;

        if (this.vidas() === 0) {
          void this.terminarJuego(false);
        }
      }, 800);
    }
  }

  private async terminarJuego(gano: boolean): Promise<void> {
    this.juegoTerminado.set(true);
    this.victoria.set(gano);

    // Descuento según vidas restantes al ganar (si perdió, 0%)
    const descuento = !gano ? 0 : this.vidas() === 3 ? 20 : this.vidas() === 2 ? 15 : 10;
    this.descuentoGanado.set(descuento);

    try {
      await this.juegosService.registrarResultado(
        this.clienteId,
        this.mesaId,
        'memotest',
        this.pares(),
        descuento,
      );
    } catch {
      this.mensajeError.set('El juego terminó, pero no se pudo guardar el resultado.');
    }
  }

  volver(): void {
    this.router.navigate(['/cliente/juegos', this.numeroMesa]);
  }
}