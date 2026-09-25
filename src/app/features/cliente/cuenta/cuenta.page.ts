import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { AuthService } from '../../../core/services/auth.service';
import { CuentaService } from '../../../core/services/cuenta.service';
import { JuegosService } from '../../../core/services/juegos.service';
import { MesasService } from '../../../core/services/mesas.service';
import { PedidosService } from '../../../core/services/pedidos.service';
import { QrScannerService } from '../../../core/services/qr-scanner';
import {
  ETIQUETAS_SATISFACCION,
  ImportesCuenta,
  Pago,
  QrPropina,
} from '../../../core/models/cuenta.model';
import {
  Pedido,
  ESTADO_PEDIDO_CERRADO,
  ESTADO_PEDIDO_ENTREGADO,
} from '../../../core/models/pedido.model';

type FaseCuenta =
  | 'sin-solicitar'
  | 'propina'
  | 'detalle'
  | 'esperando'
  | 'confirmado';

// Punto 21 del PDF: el cliente pide la cuenta, lee el QR de propina (no se
// puede generar la cuenta sin elegir el porcentaje), ve el detalle
// (estilo Mercado Pago) y hace el pago simulado. Después espera que el
// mozo lo confirme (punto 22).
@Component({
  selector: 'app-cuenta',
  standalone: true,
  templateUrl: './cuenta.page.html',
  styleUrls: ['./cuenta.page.scss'],
  imports: [CommonModule, RouterLink],
})
export class CuentaPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private authService = inject(AuthService);
  private cuentaService = inject(CuentaService);
  private juegosService = inject(JuegosService);
  private mesasService = inject(MesasService);
  private pedidosService = inject(PedidosService);
  private qrScannerService = inject(QrScannerService);

  pedido = signal<Pedido | null>(null);
  pago = signal<Pago | null>(null);
  propina = signal<QrPropina | null>(null);
  descuentoPct = signal(0);
  numeroMesa = signal<number | null>(null);
  nivelesSimulacion = signal<QrPropina[]>([]);
  cargando = signal(true);
  procesando = signal(false);
  mensajeError = signal('');

  esWeb = !Capacitor.isNativePlatform();
  etiquetasSatisfaccion = ETIQUETAS_SATISFACCION;

  private canalPago?: RealtimeChannel;

  fase = computed<FaseCuenta>(() => {
    const pago = this.pago();
    if (pago) {
      return pago.confirmado_por_mozo ? 'confirmado' : 'esperando';
    }
    if (this.propina()) {
      return 'detalle';
    }
    return this.pedido()?.cuenta_solicitada ? 'propina' : 'sin-solicitar';
  });

  subtotal = computed(() =>
    (this.pedido()?.items ?? []).reduce(
      (acum, i) => acum + i.precio_unitario * i.cantidad,
      0,
    ),
  );

  // Con el pago ya registrado se muestran los importes guardados; antes,
  // los calculados con el descuento de los juegos y la propina elegida.
  importes = computed<ImportesCuenta | null>(() => {
    const pago = this.pago();
    if (pago) {
      const montoDescuento = (pago.subtotal * pago.descuento_porcentaje) / 100;
      return {
        subtotal: pago.subtotal,
        descuentoPorcentaje: pago.descuento_porcentaje,
        montoDescuento,
        propinaPorcentaje: pago.propina_porcentaje,
        montoPropina:
          ((pago.subtotal - montoDescuento) * pago.propina_porcentaje) / 100,
        total: pago.total,
      };
    }

    const propina = this.propina();
    if (!propina) {
      return null;
    }
    return this.cuentaService.calcularImportes(
      this.subtotal(),
      this.descuentoPct(),
      propina.porcentaje,
    );
  });

  nivelElegido = computed(() => {
    const pago = this.pago();
    const propina = this.propina();
    if (propina) return propina;
    if (pago) {
      return this.nivelesSimulacion().find(
        (n) => n.porcentaje === pago.propina_porcentaje,
      );
    }
    return undefined;
  });

  // "Excelente · " antes del porcentaje (grado de satisfacción del cliente).
  etiquetaPropina = computed(() => {
    const nivel = this.nivelElegido();
    return nivel ? `${ETIQUETAS_SATISFACCION[nivel.nivel]} · ` : '';
  });

  async ngOnInit(): Promise<void> {
    const pedidoId = this.route.snapshot.paramMap.get('pedidoId');
    if (!pedidoId) {
      this.mensajeError.set('No se indicó de qué pedido es la cuenta.');
      this.cargando.set(false);
      return;
    }

    try {
      const pedido = await this.pedidosService.obtenerPedidoConItems(pedidoId);

      // 'cerrado': el mozo ya confirmó el pago (punto 22), se sigue mostrando la cuenta.
      const puedeVerCuenta =
        pedido.estado === ESTADO_PEDIDO_ENTREGADO || pedido.estado === ESTADO_PEDIDO_CERRADO;
      if (!puedeVerCuenta || !pedido.confirmado_por_cliente) {
        throw new Error(
          'Primero tenés que recibir y confirmar tu pedido para pedir la cuenta.',
        );
      }
      this.pedido.set(pedido);

      const [mesa, pago, descuento, niveles] = await Promise.all([
        this.mesasService.obtenerPorId(pedido.mesa_id).catch(() => null),
        this.cuentaService.obtenerPago(pedidoId),
        this.obtenerDescuento(pedido),
        this.cuentaService.listarNivelesPropina().catch(() => []),
      ]);

      if (mesa) this.numeroMesa.set(mesa.numero);
      this.descuentoPct.set(descuento);
      this.nivelesSimulacion.set(niveles);
      this.pago.set(pago);

      // Pago hecho pero sin confirmar: escuchamos al mozo.
      this.escucharConfirmacion(pedidoId);
    } catch (error) {
      this.mensajeError.set(
        error instanceof Error ? error.message : 'No se pudo cargar la cuenta.',
      );
    } finally {
      this.cargando.set(false);
    }
  }

  ngOnDestroy(): void {
    if (this.canalPago) this.cuentaService.dejarDeEscuchar(this.canalPago);
  }

  // Los descuentos de los juegos son sólo para clientes registrados.
  private async obtenerDescuento(pedido: Pedido): Promise<number> {
    if (!pedido.cliente_id) {
      return 0;
    }
    try {
      return await this.juegosService.obtenerMejorDescuento(
        pedido.cliente_id,
        pedido.mesa_id,
      );
    } catch {
      return 0;
    }
  }

  private escucharConfirmacion(pedidoId: string): void {
    this.canalPago = this.cuentaService.escucharPago(pedidoId, (pago) => {
      this.pago.set(pago);
      if (pago.confirmado_por_mozo) {
        void Haptics.notification({ type: NotificationType.Success }).catch(() => {});
      }
    });
  }

  async pedirCuenta(): Promise<void> {
    const pedido = this.pedido();
    if (!pedido || this.procesando()) return;

    this.mensajeError.set('');
    this.procesando.set(true);
    try {
      await this.cuentaService.solicitarCuenta(pedido.id);
      this.pedido.set({ ...pedido, cuenta_solicitada: true });
      await Haptics.notification({ type: NotificationType.Success }).catch(() => {});
    } catch (error) {
      await this.dispararError(
        error instanceof Error ? error.message : 'No se pudo pedir la cuenta.',
      );
    } finally {
      this.procesando.set(false);
    }
  }

  async escanearPropina(): Promise<void> {
    if (this.procesando()) return;

    this.mensajeError.set('');
    this.procesando.set(true);
    try {
      const resultado = await this.qrScannerService.escanear();
      if (!resultado) {
        await this.dispararError(
          'No se pudo escanear. Revisá los permisos de cámara y volvé a intentar.',
        );
        return;
      }
      if (resultado.tipo !== 'PROPINA') {
        await this.dispararError('Ese QR no es uno de propina. Buscá el QR de propina de la mesa.');
        return;
      }

      this.propina.set(await this.cuentaService.obtenerPropinaPorQr(resultado.valor));
      await Haptics.notification({ type: NotificationType.Success }).catch(() => {});
    } catch (error) {
      await this.dispararError(
        error instanceof Error ? error.message : 'No se pudo leer el QR de propina.',
      );
    } finally {
      this.procesando.set(false);
    }
  }

  // Sólo navegador: no hay cámara para escanear, se elige el nivel a mano.
  elegirNivelSimulado(nivel: QrPropina): void {
    this.propina.set(nivel);
  }

  cambiarPropina(): void {
    this.propina.set(null);
  }

  async pagar(): Promise<void> {
    const pedido = this.pedido();
    const importes = this.importes();
    if (!pedido || !importes || !this.propina() || this.procesando()) return;

    this.mensajeError.set('');
    this.procesando.set(true);
    try {
      const pago = await this.cuentaService.registrarPago(pedido.id, importes);
      this.pago.set(pago);
      await Haptics.notification({ type: NotificationType.Success }).catch(() => {});
    } catch (error) {
      await this.dispararError(
        error instanceof Error ? error.message : 'No se pudo registrar el pago.',
      );
    } finally {
      this.procesando.set(false);
    }
  }

  private async dispararError(texto: string): Promise<void> {
    this.mensajeError.set(texto);
    try {
      await Haptics.notification({ type: NotificationType.Error });
    } catch {}
  }

  get usuario() {
    return this.authService.usuarioActual;
  }
}
