import { Injectable, inject } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { Producto } from '../models/producto.model';
import { Pedido, PedidoItem, ESTADOS_PEDIDO_TERMINADOS } from '../models/pedido.model';

// Lo que arma el cliente en la pantalla del menú antes de confirmar:
// para cada producto elegido, cuántas unidades quiere.
export interface LineaCarrito {
  producto: Producto;
  cantidad: number;
}

export interface DatosNuevoPedido {
  mesaId: string;
  clienteId?: string;        // cliente registrado
  clienteAnonimoId?: string; // invitado
  lineas: LineaCarrito[];
}

// Fila de pedido_items con el producto embebido (join), tal como la
// devuelve Supabase con select('*, productos(*)').
interface FilaItemConProducto {
  id: string;
  pedido_id: string;
  producto_id: string;
  cantidad: number;
  precio_unitario: number;
  sector: PedidoItem['sector'];
  estado: string;
  productos: Producto | null;
}

@Injectable({
  providedIn: 'root',
})
export class PedidosService {
  private supabaseService = inject(SupabaseService);

  // Punto 12: el cliente termina el pedido. Se crea la cabecera (queda
  // en el estado inicial del enum, 'pendiente_mozo': espera que el mozo
  // lo confirme) y sus renglones. El pedido NO se deriva a los sectores
  // hasta que el mozo lo confirme (punto 14).
  async crearPedido(datos: DatosNuevoPedido): Promise<Pedido> {
    const client = this.supabaseService.getClient();

    if (datos.lineas.length === 0) {
      throw new Error('Agregá al menos un producto antes de confirmar el pedido.');
    }

    const total = datos.lineas.reduce(
      (acum, l) => acum + l.producto.precio * l.cantidad,
      0,
    );

    const { data: pedidoCreado, error: errorPedido } = await client
      .from('pedidos')
      .insert({
        mesa_id: datos.mesaId,
        cliente_id: datos.clienteId ?? null,
        cliente_anonimo_id: datos.clienteAnonimoId ?? null,
        total,
      })
      .select()
      .single();

    if (errorPedido || !pedidoCreado) {
      throw new Error(errorPedido?.message || 'No se pudo registrar el pedido.');
    }

    const pedido = pedidoCreado as Pedido;

    const filasItems = datos.lineas.map((l) => ({
      pedido_id: pedido.id,
      producto_id: l.producto.id,
      cantidad: l.cantidad,
      precio_unitario: l.producto.precio,
      sector: l.producto.sector,
    }));

    const { error: errorItems } = await client
      .from('pedido_items')
      .insert(filasItems);

    if (errorItems) {
      // El pedido quedó sin renglones: lo borramos para no dejar basura.
      await client.from('pedidos').delete().eq('id', pedido.id);
      throw new Error('No se pudieron guardar los productos del pedido.');
    }

    // Devolvemos el detalle armado con lo que ya teníamos en memoria.
    pedido.items = datos.lineas.map((l, i) => ({
      id: `${pedido.id}-${i}`,
      pedido_id: pedido.id,
      producto_id: l.producto.id,
      cantidad: l.cantidad,
      precio_unitario: l.producto.precio,
      sector: l.producto.sector,
      estado: 'pendiente',
      nombre: l.producto.nombre,
      descripcion: l.producto.descripcion,
      foto_url: l.producto.foto_url,
      tiempo_elaboracion_minutos: l.producto.tiempo_elaboracion_minutos,
    }));

    return pedido;
  }

  // Pedido "en curso" de esta mesa para este cliente (si lo hay). Se usa
  // para no dejar que arranque dos pedidos a la vez y para poder volver
  // a la pantalla de estado si sale y entra. Cuando la mesa se libera
  // (punto 22) la asignación termina y esta pantalla deja de mostrarse.
  async obtenerPedidoActivo(
    mesaId: string,
    cliente: { clienteId?: string; clienteAnonimoId?: string },
  ): Promise<Pedido | null> {
    const client = this.supabaseService.getClient();

    let query = client
      .from('pedidos')
      .select('*')
      .eq('mesa_id', mesaId)
      .order('created_at', { ascending: false })
      .limit(1);

    query = cliente.clienteId
      ? query.eq('cliente_id', cliente.clienteId)
      : query.eq('cliente_anonimo_id', cliente.clienteAnonimoId!);

    const { data, error } = await query.maybeSingle();

    if (error) {
      // No bloqueamos el menú por esto: si no se pudo verificar, se
      // asume que no hay pedido en curso (el peor caso es que, si de
      // verdad había uno, se cree otro).
      console.warn('[obtenerPedidoActivo] no se pudo verificar:', error);
      return null;
    }

    const pedido = (data as Pedido | null) ?? null;
    // Si el último pedido ya está cerrado (pago o cancelado), la mesa
    // arranca de cero: no hay pedido "en curso".
    if (pedido && ESTADOS_PEDIDO_TERMINADOS.includes(pedido.estado)) {
      return null;
    }
    return pedido;
  }

  async obtenerPedidoConItems(pedidoId: string): Promise<Pedido> {
    const client = this.supabaseService.getClient();

    const { data: pedido, error: errorPedido } = await client
      .from('pedidos')
      .select('*')
      .eq('id', pedidoId)
      .single();

    if (errorPedido || !pedido) {
      throw new Error('No se encontró el pedido.');
    }

    // Traemos los renglones con el producto embebido para poder mostrar
    // nombre, foto y tiempo de elaboración.
    const { data: filas, error: errorItems } = await client
      .from('pedido_items')
      .select('*, productos(*)')
      .eq('pedido_id', pedidoId);

    if (errorItems) {
      throw new Error('No se pudo cargar el detalle del pedido.');
    }

    const items: PedidoItem[] = ((filas ?? []) as FilaItemConProducto[]).map((f) => ({
      id: f.id,
      pedido_id: f.pedido_id,
      producto_id: f.producto_id,
      cantidad: f.cantidad,
      precio_unitario: f.precio_unitario,
      sector: f.sector,
      estado: f.estado,
      nombre: f.productos?.nombre ?? 'Producto',
      descripcion: f.productos?.descripcion ?? '',
      foto_url: f.productos?.foto_url ?? '',
      tiempo_elaboracion_minutos: f.productos?.tiempo_elaboracion_minutos ?? 0,
    }));

    return { ...(pedido as Pedido), items };
  }

  // Realtime: avisa cuando cambia el estado del pedido (lo cambia el
  // mozo en los puntos 13/14). Devuelve el canal para cerrarlo al salir.
  escucharPedido(
    pedidoId: string,
    alCambiar: (pedido: Pedido) => void,
  ): RealtimeChannel {
    const client = this.supabaseService.getClient();

    return client
      .channel(`pedido-${pedidoId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pedidos',
          filter: `id=eq.${pedidoId}`,
        },
        (payload) => alCambiar(payload.new as Pedido),
      )
      .subscribe();
  }

  dejarDeEscuchar(canal: RealtimeChannel): void {
    this.supabaseService.getClient().removeChannel(canal);
  }
}
