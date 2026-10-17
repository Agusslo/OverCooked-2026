import { Injectable, inject } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { MesasService } from './mesas.service';
import { conTimeout } from '../utils/con-timeout.util';
import { ImportesCuenta, Pago, QrPropina } from '../models/cuenta.model';
import { ESTADO_PEDIDO_CERRADO } from '../models/pedido.model';

// Fila de 'pagos' con pedido/mesa/cliente embebidos (join), tal como la
// devuelve Supabase para la lista de pagos pendientes del mozo.
interface FilaPagoPendiente extends Pago {
  pedidos: {
    mesa_id: string;
    mesas: { numero: number } | null;
    usuarios: { nombre: string; apellido: string } | null;
    clientes_anonimos: { nombre: string } | null;
  } | null;
}

export interface PagoPendiente extends Pago {
  mesaId: string;
  numeroMesa: number;
  nombreCliente: string;
}

const redondear = (valor: number): number => Math.round(valor * 100) / 100;

// Punto 21 del PDF: pedir la cuenta, elegir la propina leyendo su QR y
// registrar el pago (simulado) que después confirma el mozo.
@Injectable({
  providedIn: 'root',
})
export class CuentaService {
  private supabaseService = inject(SupabaseService);
  private mesasService = inject(MesasService);

  // Avisa al mozo (un trigger de la base dispara la push notification
  // cuando 'cuenta_solicitada' pasa a true).
  async solicitarCuenta(pedidoId: string): Promise<void> {
    const { error } = await this.supabaseService
      .getClient()
      .from('pedidos')
      .update({ cuenta_solicitada: true })
      .eq('id', pedidoId);

    if (error) {
      throw new Error('No se pudo pedir la cuenta.');
    }
  }

  // Busca el nivel de propina que representa el QR escaneado.
  async obtenerPropinaPorQr(codigo: string): Promise<QrPropina> {
    const { data, error } = await conTimeout(
      this.supabaseService
        .getClient()
        .from('qr_propinas')
        .select('*')
        .eq('qr_code', codigo)
        .maybeSingle(),
      8000,
    );

    if (error) {
      throw new Error('No se pudo verificar el código de propina.');
    }
    if (!data) {
      throw new Error('Ese QR de propina no es válido.');
    }

    return data as QrPropina;
  }

  // Todos los niveles: se usan para simular el escaneo en la versión web.
  async listarNivelesPropina(): Promise<QrPropina[]> {
    const { data, error } = await conTimeout(
      this.supabaseService
        .getClient()
        .from('qr_propinas')
        .select('*')
        .order('porcentaje', { ascending: false }),
      8000,
    );

    if (error) {
      throw new Error('No se pudieron cargar los niveles de propina.');
    }

    return (data ?? []) as QrPropina[];
  }

  // Descuento: se aplica sobre el subtotal; la propina, sobre el importe
  // ya descontado (se da propina por lo que efectivamente se paga).
  calcularImportes(
    subtotal: number,
    descuentoPorcentaje: number,
    propinaPorcentaje: number,
  ): ImportesCuenta {
    const montoDescuento = redondear((subtotal * descuentoPorcentaje) / 100);
    const base = subtotal - montoDescuento;
    const montoPropina = redondear((base * propinaPorcentaje) / 100);

    return {
      subtotal: redondear(subtotal),
      descuentoPorcentaje,
      montoDescuento,
      propinaPorcentaje,
      montoPropina,
      total: redondear(base + montoPropina),
    };
  }

  async obtenerPago(pedidoId: string): Promise<Pago | null> {
    const { data, error } = await conTimeout(
      this.supabaseService
        .getClient()
        .from('pagos')
        .select('*')
        .eq('pedido_id', pedidoId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      8000,
    );

    if (error) {
      throw new Error('No se pudo verificar el pago del pedido.');
    }

    return (data as Pago | null) ?? null;
  }

  // Pago simulado: sólo se guarda el registro, queda pendiente de que el
  // mozo lo confirme. La push a mozo, dueño y supervisor la dispara un
  // trigger de la base al insertar.
  async registrarPago(pedidoId: string, importes: ImportesCuenta): Promise<Pago> {
    const existente = await this.obtenerPago(pedidoId);
    if (existente) {
      return existente;
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('pagos')
      .insert({
        pedido_id: pedidoId,
        subtotal: importes.subtotal,
        descuento_porcentaje: importes.descuentoPorcentaje,
        propina_porcentaje: importes.propinaPorcentaje,
        total: importes.total,
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error('No se pudo registrar el pago.');
    }

    return data as Pago;
  }

  // Avisa cuando el mozo confirma el pago (confirmado_por_mozo = true).
  escucharPago(pedidoId: string, alCambiar: (pago: Pago) => void): RealtimeChannel {
    return this.supabaseService
      .getClient()
      .channel(`pago-${pedidoId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pagos',
          filter: `pedido_id=eq.${pedidoId}`,
        },
        (payload) => alCambiar(payload.new as Pago),
      )
      .subscribe();
  }

  // Punto 22: pagos que el cliente ya hizo y el mozo todavía tiene que
  // confirmar, con mesa y cliente embebidos para armar la lista.
  async listarPagosPendientes(): Promise<PagoPendiente[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('pagos')
      .select(
        '*, pedidos(mesa_id, mesas(numero), usuarios(nombre, apellido), clientes_anonimos(nombre))',
      )
      .eq('confirmado_por_mozo', false)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error('No se pudieron cargar los pagos pendientes.');
    }

    return ((data ?? []) as FilaPagoPendiente[]).map((f) => ({
      id: f.id,
      pedido_id: f.pedido_id,
      subtotal: f.subtotal,
      descuento_porcentaje: f.descuento_porcentaje,
      propina_porcentaje: f.propina_porcentaje,
      total: f.total,
      confirmado_por_mozo: f.confirmado_por_mozo,
      created_at: f.created_at,
      mesaId: f.pedidos?.mesa_id ?? '',
      numeroMesa: f.pedidos?.mesas?.numero ?? 0,
      nombreCliente: f.pedidos?.usuarios
        ? `${f.pedidos.usuarios.nombre} ${f.pedidos.usuarios.apellido}`
        : (f.pedidos?.clientes_anonimos?.nombre ?? 'Invitado'),
    }));
  }

  // Punto 22: el mozo confirma el pago y se libera la mesa. El pago se
  // marca confirmado AL FINAL: si algún paso anterior falla, el pago
  // sigue en la lista del mozo y puede reintentar sin dejar la mesa a
  // medias.
  async confirmarPago(pago: PagoPendiente): Promise<void> {
    const client = this.supabaseService.getClient();

    const { error: errorPedido } = await client
      .from('pedidos')
      .update({ estado: ESTADO_PEDIDO_CERRADO })
      .eq('id', pago.pedido_id);

    if (errorPedido) {
      throw new Error('No se pudo cerrar el pedido.');
    }

    // Libera la mesa (y cierra la asignación del cliente, ver
    // MesasService.actualizarEstado).
    await this.mesasService.actualizarEstado(pago.mesaId, 'libre');

    const { error: errorPago } = await client
      .from('pagos')
      .update({ confirmado_por_mozo: true })
      .eq('id', pago.id);

    if (errorPago) {
      throw new Error('No se pudo confirmar el pago.');
    }
  }

  // Refresca la lista del mozo cuando entra o se confirma un pago.
  escucharPagosPendientes(alCambiar: () => void): RealtimeChannel {
    return this.supabaseService
      .getClient()
      .channel('pagos-pendientes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pagos' },
        () => alCambiar(),
      )
      .subscribe();
  }

  dejarDeEscuchar(canal: RealtimeChannel): void {
    this.supabaseService.getClient().removeChannel(canal);
  }
}
