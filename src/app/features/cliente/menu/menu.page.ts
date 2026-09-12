import {
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { AuthService } from '../../../core/services/auth.service';
import { MesasService } from '../../../core/services/mesas.service';
import { ProductosService } from '../../../core/services/productos.service';
import { PedidosService, LineaCarrito } from '../../../core/services/pedidos.service';
import { Mesa } from '../../../core/models/mesa.model';
import { Producto } from '../../../core/models/producto.model';
import { Pedido, ESTADO_PEDIDO_RECHAZADO } from '../../../core/models/pedido.model';
import { environment } from '../../../../environments/environment';
import { BurbujaMozoComponent } from '../../chat/burbuja-mozo/burbuja-mozo.component';

// Punto 12 del PDF: el cliente arma el pedido para toda la mesa.
//  - Vista "menú": un plato por vez. Se desliza a los costados (estilo
//    Tinder) para cambiar de plato, y las 3 fotos se pasan tocando la
//    foto (avanza a la siguiente y vuelve a la primera al llegar al
//    final). Primero se elige la cantidad con los botones + / − y recién
//    al tocar "Agregar" entra al pedido.
//  - Se desliza hacia ARRIBA (o el botón "Mi pedido") para pasar a la
//    vista "Mi Pedido"; hacia ABAJO se vuelve al menú.
@Component({
  selector: 'app-menu',
  standalone: true,
  templateUrl: './menu.page.html',
  styleUrls: ['./menu.page.scss'],
  imports: [CommonModule, RouterLink],
})
export class MenuPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);
  private mesasService = inject(MesasService);
  private productosService = inject(ProductosService);
  private pedidosService = inject(PedidosService);

  readonly restaurante = environment.nombreRestaurante;

  mesa = signal<Mesa | null>(null);
  productos = signal<Producto[]>([]);
  cargando = signal(true);
  mensajeError = signal('');
  confirmando = signal(false);
  pedidoEnCurso = signal<Pedido | null>(null);
  // Punto 13: true cuando el pedido en curso fue rechazado por el mozo y
  // el cliente lo está modificando para reenviarlo (en vez de armar uno
  // nuevo desde cero).
  modoEdicion = signal(false);
  motivoRechazo = signal('');

  // 0 = vista menú, 1 = vista "Mi Pedido".
  vista = signal<0 | 1>(0);

  indiceProducto = signal(0);
  indiceFoto = signal(0);

  // Cantidad elegida para el plato actual (todavía NO agregada al pedido).
  cantidadElegida = signal(1);

  private carrito = signal<Record<string, number>>({});

  // Gesto de arrastre sobre el plato.
  arrastreX = signal(0);
  arrastreY = signal(0);
  arrastrando = signal(false);
  private inicioX = 0;
  private inicioY = 0;
  private eje: 'x' | 'y' | null = null;
  // True cuando el gesto actual movió el dedo de verdad: sirve para que
  // el click que dispara el navegador tras un swipe no pase la foto.
  private arrastroReal = false;

  private readonly UMBRAL_X = 90;
  private readonly UMBRAL_Y = 110;

  productoActual = computed<Producto | null>(
    () => this.productos()[this.indiceProducto()] ?? null,
  );

  lineasCarrito = computed<{ producto: Producto; cantidad: number }[]>(() => {
    const mapa = this.carrito();
    return this.productos()
      .filter((p) => mapa[p.id] > 0)
      .map((p) => ({ producto: p, cantidad: mapa[p.id] }));
  });

  cantidadTotal = computed(() =>
    this.lineasCarrito().reduce((acum, l) => acum + l.cantidad, 0),
  );

  total = computed(() =>
    this.lineasCarrito().reduce(
      (acum, l) => acum + l.producto.precio * l.cantidad,
      0,
    ),
  );

  tiempoTotal = computed(() =>
    this.lineasCarrito().reduce(
      (acum, l) => acum + l.producto.tiempo_elaboracion_minutos * l.cantidad,
      0,
    ),
  );

  // translateY de la pista de las dos vistas. En el DOM la vista "menú"
  // va primera y "Mi Pedido" segunda (debajo): por eso se sube para ver
  // el pedido y se baja para volver al menú.
  desplazamientoY = computed(() => {
    const base = this.vista() === 0 ? '0px' : '-100dvh';
    return `translateY(calc(${base} + ${this.arrastreY()}px))`;
  });

  ngOnInit(): void {
    const numero = Number(this.route.snapshot.paramMap.get('numero'));
    this.cargarDatos(numero);
  }

  private async cargarDatos(numero: number): Promise<void> {
    this.cargando.set(true);
    this.mensajeError.set('');

    try {
      const usuario = this.authService.usuarioActual;
      if (!usuario) {
        this.router.navigateByUrl('/auth/login');
        return;
      }
      const esAnonimo = usuario.perfil === 'anonimo';

      const [mesa, productos] = await Promise.all([
        this.mesasService.obtenerPorNumero(numero),
        this.productosService.listarDisponibles(),
      ]);

      // El cliente (registrado o invitado) sólo puede pedir en SU mesa
      // asignada, aunque entre directo por la URL (punto 10).
      const mesaAsignada = await this.mesasService.obtenerMesaAsignadaA(
        usuario.id,
        esAnonimo,
      );
      if (!mesaAsignada || mesaAsignada.numero !== numero) {
        const detalle = mesaAsignada
          ? `Tu mesa asignada es la Nº ${mesaAsignada.numero}.`
          : 'Todavía no tenés una mesa asignada.';
        await this.dispararError(`Esa no es tu mesa. ${detalle}`);
        return;
      }

      const pedidoActivo = await this.pedidosService.obtenerPedidoActivo(mesa.id, {
        clienteId: esAnonimo ? undefined : usuario.id,
        clienteAnonimoId: esAnonimo ? usuario.id : undefined,
      });
      this.pedidoEnCurso.set(pedidoActivo);

      // Punto 13: si el mozo rechazó el pedido, se precarga el carrito
      // con lo que ya tenía para que el cliente lo modifique (agregar,
      // quitar o cambiar cantidades) en vez de arrancar de cero.
      if (pedidoActivo?.estado === ESTADO_PEDIDO_RECHAZADO) {
        const pedidoConItems = await this.pedidosService.obtenerPedidoConItems(
          pedidoActivo.id,
        );
        this.motivoRechazo.set(pedidoConItems.motivo_rechazo ?? '');
        this.carrito.set(
          Object.fromEntries(
            (pedidoConItems.items ?? []).map((i) => [i.producto_id, i.cantidad]),
          ),
        );
        this.modoEdicion.set(true);
        this.vista.set(1);
      }

      this.mesa.set(mesa);
      this.productos.set(productos);
    } catch (error) {
      await this.dispararError(
        error instanceof Error ? error.message : 'No se pudo cargar el menú.',
      );
    } finally {
      this.cargando.set(false);
    }
  }

  // --- Fotos del plato actual: se pasan tocando la foto ---

  // Avanza a la siguiente foto del plato y vuelve a la primera al final.
  async siguienteFoto(): Promise<void> {
    if (this.arrastroReal) return;
    const total = this.fotosActuales().length;
    if (total <= 1) return;
    this.indiceFoto.update((i) => (i + 1) % total);
    await Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  }

  fotosActuales(): string[] {
    const p = this.productoActual();
    if (!p) return [];
    return [p.foto_url, p.foto_url_2, p.foto_url_3].filter((u) => !!u);
  }

  fotoActual(): string {
    const fotos = this.fotosActuales();
    return fotos[this.indiceFoto() % (fotos.length || 1)] ?? '';
  }

  // --- Recorrido de platos + cambio de vista ---

  siguienteProducto(): void {
    const total = this.productos().length;
    if (total <= 1) return;
    this.indiceProducto.update((i) => (i + 1) % total);
    this.indiceFoto.set(0);
    this.cantidadElegida.set(1);
  }

  anteriorProducto(): void {
    const total = this.productos().length;
    if (total <= 1) return;
    this.indiceProducto.update((i) => (i - 1 + total) % total);
    this.indiceFoto.set(0);
    this.cantidadElegida.set(1);
  }

  verPedido(): void {
    this.vista.set(1);
  }

  verMenu(): void {
    this.vista.set(0);
  }

  alPresionar(ev: PointerEvent): void {
    this.arrastrando.set(true);
    this.inicioX = ev.clientX;
    this.inicioY = ev.clientY;
    this.eje = null;
    this.arrastroReal = false;
    (ev.currentTarget as HTMLElement | null)?.setPointerCapture?.(ev.pointerId);
  }

  alMover(ev: PointerEvent): void {
    if (!this.arrastrando()) return;
    const dx = ev.clientX - this.inicioX;
    const dy = ev.clientY - this.inicioY;

    if (this.eje === null) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      this.eje = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      this.arrastroReal = true;
    }

    if (this.eje === 'x' && this.vista() === 0) {
      this.arrastreX.set(dx);
    } else if (this.eje === 'y') {
      // vista menú: sólo hacia arriba; vista pedido: sólo hacia abajo.
      this.arrastreY.set(this.vista() === 0 ? Math.min(0, dy) : Math.max(0, dy));
    }
  }

  alSoltar(): void {
    if (!this.arrastrando()) return;
    this.arrastrando.set(false);

    if (this.eje === 'x') {
      const dx = this.arrastreX();
      if (dx <= -this.UMBRAL_X) this.siguienteProducto();
      else if (dx >= this.UMBRAL_X) this.anteriorProducto();
    } else if (this.eje === 'y') {
      const dy = this.arrastreY();
      if (this.vista() === 0 && dy <= -this.UMBRAL_Y) this.vista.set(1);
      else if (this.vista() === 1 && dy >= this.UMBRAL_Y) this.vista.set(0);
    }

    this.arrastreX.set(0);
    this.arrastreY.set(0);
    this.eje = null;
  }

  // --- Cantidad a elegir (antes de agregar) ---

  masCantidad(): void {
    this.cantidadElegida.update((n) => Math.min(n + 1, 99));
  }

  menosCantidad(): void {
    this.cantidadElegida.update((n) => Math.max(n - 1, 1));
  }

  // Recién acá el plato entra al pedido, con la cantidad elegida.
  async agregarAlPedido(producto: Producto): Promise<void> {
    const cantidad = this.cantidadElegida();
    this.carrito.update((mapa) => ({
      ...mapa,
      [producto.id]: (mapa[producto.id] ?? 0) + cantidad,
    }));
    this.cantidadElegida.set(1);
    await Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
  }

  // --- Carrito (edición en la vista "Mi Pedido") ---

  async agregar(producto: Producto): Promise<void> {
    this.carrito.update((mapa) => ({
      ...mapa,
      [producto.id]: (mapa[producto.id] ?? 0) + 1,
    }));
    await Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  }

  quitarUno(producto: Producto): void {
    this.carrito.update((mapa) => {
      const actual = mapa[producto.id] ?? 0;
      const copia = { ...mapa };
      if (actual <= 1) {
        delete copia[producto.id];
      } else {
        copia[producto.id] = actual - 1;
      }
      return copia;
    });
  }

  async confirmar(): Promise<void> {
    const mesa = this.mesa();
    const usuario = this.authService.usuarioActual;
    if (!mesa || !usuario || this.confirmando()) return;

    const enCurso = this.pedidoEnCurso();
    // Punto 13: si el pedido en curso NO es el que se está reenviando
    // (rechazado), no se deja arrancar uno nuevo para la misma mesa.
    if (enCurso && !this.modoEdicion()) {
      await this.dispararError('Ya tenés un pedido en curso para esta mesa.');
      this.router.navigate(['/cliente/estado-pedido', enCurso.id]);
      return;
    }

    if (this.cantidadTotal() === 0) {
      await this.dispararError('Agregá al menos un producto antes de confirmar.');
      return;
    }

    this.confirmando.set(true);
    this.mensajeError.set('');
    const esAnonimo = usuario.perfil === 'anonimo';

    const lineas: LineaCarrito[] = this.lineasCarrito().map((l) => ({
      producto: l.producto,
      cantidad: l.cantidad,
    }));

    try {
      if (this.modoEdicion() && enCurso) {
        await this.pedidosService.reenviarPedido(enCurso.id, lineas);
      } else {
        await this.pedidosService.crearPedido({
          mesaId: mesa.id,
          clienteId: esAnonimo ? undefined : usuario.id,
          clienteAnonimoId: esAnonimo ? usuario.id : undefined,
          lineas,
        });
      }
      await Haptics.notification({ type: NotificationType.Success }).catch(() => {});
      // Al confirmar, el cliente vuelve al inicio, que ahora muestra la
      // card del pedido en curso + los juegos (mockup punto 12).
      this.router.navigateByUrl('/inicio');
    } catch (error) {
      await this.dispararError(
        error instanceof Error ? error.message : 'No se pudo confirmar el pedido.',
      );
    } finally {
      this.confirmando.set(false);
    }
  }

  private async dispararError(texto: string): Promise<void> {
    this.mensajeError.set(texto);
    try {
      await Haptics.notification({ type: NotificationType.Error });
    } catch {}
  }
}
