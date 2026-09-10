import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { AuthService } from '../../../core/services/auth.service';
import { MesasService } from '../../../core/services/mesas.service';
import { ListaEsperaService } from '../../../core/services/lista-espera.service';
import { PedidosService } from '../../../core/services/pedidos.service';
import { Mesa } from '../../../core/models/mesa.model';
import { Pedido } from '../../../core/models/pedido.model';
import { environment } from '../../../../environments/environment';
import { BurbujaMozoComponent } from '../../chat/burbuja-mozo/burbuja-mozo.component';
import { HeaderInicioComponent } from '../../../shared/header-inicio/header-inicio.component';

type EstadoBoton = 'esperando' | 'con-mesa' | 'con-pedido';

// Punto 12: el "inicio" del cliente (registrado o invitado) una vez que
// está anotado en la lista de espera. Se muestra dentro de InicioPage.
//  - Anotado, sin mesa   -> "ESPERANDO MESA".
//  - El metre asignó mesa -> "REALIZAR PEDIDO" -> escanea el QR de la mesa.
//  - Ya confirmó un pedido -> card del pedido + juegos.
// Si el cliente todavía NO está anotado, esta pantalla lo manda a
// /cliente/entrada a escanear el QR de la entrada.
@Component({
  selector: 'app-sala-espera',
  standalone: true,
  templateUrl: './sala-espera.component.html',
  styleUrls: ['./sala-espera.component.scss'],
  imports: [BurbujaMozoComponent, HeaderInicioComponent],
})
export class SalaEsperaComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private mesasService = inject(MesasService);
  private listaEsperaService = inject(ListaEsperaService);
  private pedidosService = inject(PedidosService);
  private router = inject(Router);

  cargando = signal(true);
  mensajeError = signal('');
  mesaAsignada = signal<Mesa | null>(null);
  pedidoActivo = signal<Pedido | null>(null);
  indiceFoto = signal(0);

  private canal?: RealtimeChannel;
  private intervalo?: ReturnType<typeof setInterval>;
  private intervaloFotos?: ReturnType<typeof setInterval>;
  private mesaAsignadaPrevia = false;
  private redirigido = false;

  estadoBoton = computed<EstadoBoton>(() => {
    if (this.pedidoActivo()) return 'con-pedido';
    if (this.mesaAsignada()) return 'con-mesa';
    return 'esperando';
  });

  fotosPedido = computed<string[]>(() =>
    (this.pedidoActivo()?.items ?? [])
      .map((i) => i.foto_url ?? '')
      .filter((u) => !!u),
  );

  nombresItems = computed(() =>
    (this.pedidoActivo()?.items ?? []).map((i) => i.nombre ?? 'Producto').join(' · '),
  );

  tiempoPedido = computed(() =>
    (this.pedidoActivo()?.items ?? []).reduce(
      (acum, i) => acum + (i.tiempo_elaboracion_minutos ?? 0) * i.cantidad,
      0,
    ),
  );

  async ngOnInit(): Promise<void> {
    await this.cargar();
    if (!this.redirigido) this.cargando.set(false);

    const usuario = this.authService.usuarioActual;
    if (usuario && usuario.perfil !== 'anonimo') {
      this.canal = this.mesasService.escucharAsignacionDe(usuario.id, () => {
        void this.cargar();
      });
    }

    this.intervalo = setInterval(() => void this.cargar(), 6000);
    this.intervaloFotos = setInterval(() => {
      const total = this.fotosPedido().length;
      if (total > 1) this.indiceFoto.update((i) => (i + 1) % total);
    }, environment.menuFotosIntervaloMs);
  }

  ngOnDestroy(): void {
    if (this.canal) this.mesasService.dejarDeEscuchar(this.canal);
    if (this.intervalo) clearInterval(this.intervalo);
    if (this.intervaloFotos) clearInterval(this.intervaloFotos);
  }

  fotoActual(): string {
    const fotos = this.fotosPedido();
    return fotos[this.indiceFoto() % (fotos.length || 1)] ?? '';
  }

  private async cargar(): Promise<void> {
    const usuario = this.authService.usuarioActual;
    if (!usuario) {
      this.router.navigateByUrl('/auth/login');
      return;
    }

    const esAnonimo = usuario.perfil === 'anonimo';

    try {
      const [mesa, esperando] = await Promise.all([
        this.mesasService.obtenerMesaAsignadaA(usuario.id, esAnonimo),
        this.listaEsperaService.estaEsperando(
          esAnonimo ? undefined : usuario.id,
          esAnonimo ? usuario.id : undefined,
        ),
      ]);

      // Todavía no está anotado ni tiene mesa: primero el QR de entrada.
      if (!mesa && !esperando) {
        this.redirigido = true;
        this.router.navigateByUrl('/cliente/entrada');
        return;
      }

      this.mesaAsignada.set(mesa);

      if (mesa) {
        const pedido = await this.pedidosService.obtenerPedidoActivo(mesa.id, {
          clienteId: esAnonimo ? undefined : usuario.id,
          clienteAnonimoId: esAnonimo ? usuario.id : undefined,
        });
        this.pedidoActivo.set(
          pedido ? await this.pedidosService.obtenerPedidoConItems(pedido.id) : null,
        );

        if (!this.mesaAsignadaPrevia) {
          this.mesaAsignadaPrevia = true;
          await Haptics.notification({ type: NotificationType.Success }).catch(() => {});
        }
      } else {
        this.pedidoActivo.set(null);
      }

      this.mensajeError.set('');
    } catch (error) {
      this.mensajeError.set(
        error instanceof Error ? error.message : 'No se pudo actualizar el estado.',
      );
    }
  }

  accionPrincipal(): void {
    const pedido = this.pedidoActivo();
    if (pedido) {
      this.router.navigate(['/cliente/estado-pedido', pedido.id]);
    } else if (this.mesaAsignada()) {
      // Punto 10: para entrar a la mesa hay que escanear su QR.
      this.router.navigateByUrl('/cliente/escanear-mesa');
    }
  }
}
