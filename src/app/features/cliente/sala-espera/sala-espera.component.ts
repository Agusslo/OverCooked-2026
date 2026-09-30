import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ViewWillEnter } from '@ionic/angular';
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

const ESTADOS_CORTOS: Record<string, string> = {
  pendiente_mozo: 'POR CONFIRMAR',
  pendiente: 'POR CONFIRMAR',
  rechazado: 'A MODIFICAR',
  confirmado: 'CONFIRMADO',
  en_preparacion: 'EN COCINA',
  en_preparación: 'EN COCINA',
  listo: 'LISTO',
  entregado: 'ENTREGADO',
};

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
  imports: [BurbujaMozoComponent, HeaderInicioComponent, RouterLink],
})
export class SalaEsperaComponent implements OnInit, OnDestroy, ViewWillEnter {
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

  esAnonimo(): boolean {
    return this.authService.usuarioActual?.perfil === 'anonimo';
  }

  // Chip corto del estado para la card del pedido (el texto largo va en
  // la pantalla de estado-pedido).
  estadoCorto = computed(() => {
    const estado = this.pedidoActivo()?.estado ?? '';
    return ESTADOS_CORTOS[estado] ?? estado.replace(/_/g, ' ').toUpperCase();
  });

  async ngOnInit(): Promise<void> {
    await this.cargar();

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

  // Ionic mantiene esta pantalla en caché al navegar a /cliente/entrada
  // (no destruye el componente ni vuelve a correr ngOnInit): sin este
  // hook, al volver de escanear el QR quedaba pegada en "Cargando…"
  // para siempre, aunque ya hubiera quedado anotado en la lista de espera.
  ionViewWillEnter(): void {
    void this.cargar();
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
    // Ionic deja esta pantalla viva en el stack al navegar a otra (p. ej.
    // resultados de encuestas) y el setInterval sigue corriendo: si no
    // cortamos acá, la redirección a /cliente/entrada de más abajo saca
    // al cliente de la pantalla que está viendo a los pocos segundos.
    if (!this.router.url.startsWith('/inicio')) return;

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
    } finally {
      // Se resuelve siempre acá (no en ngOnInit): Ionic cachea esta
      // pantalla al ir a /cliente/entrada y no vuelve a correr
      // ngOnInit al volver, así que "cargando" tiene que actualizarse
      // en cada pasada de cargar(), no solo en la primera.
      this.cargando.set(false);
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

  irAJuegos(ruta?: string): void {
    const mesa = this.mesaAsignada();
    if (!mesa) return;
    // Punto 15: los juegos son sólo para clientes registrados (las rutas
    // /cliente/juegos tienen perfiles: ['cliente']). Sin este aviso el
    // guard rebotaba al invitado a /inicio y parecía que no pasaba nada;
    // ahora las cards se ven atenuadas con un aviso encima.
    if (this.esAnonimo()) {
      void Haptics.notification({ type: NotificationType.Warning }).catch(() => {});
      return;
    }
    const destino: (string | number)[] = ['/cliente/juegos', mesa.numero];
    if (ruta) destino.push(ruta);
    this.router.navigate(destino);
  }
}
