import { Injectable, inject } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { conTimeout } from '../utils/con-timeout.util';
import { Producto, SectorProducto } from '../models/producto.model';
import {
  Pedido,
  PedidoItem,
  ESTADOS_PEDIDO_TERMINADOS,
  ESTADOS_PEDIDO_EN_SECTOR,
  ESTADO_PEDIDO_INICIAL,
  ESTADO_PEDIDO_RECHAZADO,
  ESTADO_PEDIDO_CONFIRMADO,
  ESTADO_PEDIDO_ENTREGADO,
  ESTADO_ITEM_LISTO,
} from '../models/pedido.model';

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

// Punto 13: fila de 'pedidos' con mesa/cliente/items embebidos (join),
// tal como la devuelve Supabase para armar la lista del mozo.
interface FilaPedidoPendiente {
  id: string;
  mesa_id: string;
  cliente_id: string | null;
  cliente_anonimo_id: string | null;
  estado: string;
  total: number;
  created_at: string;
  mesas: { numero: number } | null;
  usuarios: { nombre: string; apellido: string } | null;
  clientes_anonimos: { nombre: string } | null;
  pedido_items: {
    id: string;
    producto_id: string;
    cantidad: number;
    precio_unitario: number;
    sector: PedidoItem['sector'];
    productos: { nombre: string } | null;
  }[];
}

export interface PedidoPendiente extends Pedido {
  numeroMesa: number;
  nombreCliente: string;
}

// Punto 14: fila de 'pedidos' con mesa + items del sector embebidos,
// tal como la devuelve Supabase para armar la lista de cocina/bar.
interface FilaPedidoSector {
  id: string;
  mesa_id: string;
  cliente_id: string | null;
  cliente_anonimo_id: string | null;
  estado: string;
  total: number;
  created_at: string;
  mesas: { numero: number } | null;
  pedido_items: {
    id: string;
    producto_id: string;
    cantidad: number;
    precio_unitario: number;
    sector: PedidoItem['sector'];
    estado: string;
    productos: {
      nombre: string;
      descripcion: string;
      foto_url: string;
      tiempo_elaboracion_minutos: number;
    } | null;
  }[];
}

export interface PedidoPorSector extends Pedido {
  numeroMesa: number;
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

    const { data, error } = await conTimeout(query.maybeSingle(), 8000);

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

    const { data: pedido, error: errorPedido } = await conTimeout(
      client.from('pedidos').select('*').eq('id', pedidoId).single(),
      8000,
    );

    if (errorPedido || !pedido) {
      throw new Error('No se encontró el pedido.');
    }

    // Traemos los renglones con el producto embebido para poder mostrar
    // nombre, foto y tiempo de elaboración.
    const { data: filas, error: errorItems } = await conTimeout(
      client.from('pedido_items').select('*, productos(*)').eq('pedido_id', pedidoId),
      8000,
    );

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

  // Punto 13: pedidos que el mozo tiene para revisar (recién armados o
  // reenviados tras un rechazo). Se trae mesa, cliente e items en el
  // mismo select para no hacer una consulta por tarjeta.
  async listarPendientes(): Promise<PedidoPendiente[]> {
    const client = this.supabaseService.getClient();

    const { data, error } = await client
      .from('pedidos')
      .select(
        '*, mesas(numero), usuarios(nombre, apellido), clientes_anonimos(nombre), pedido_items(id, producto_id, cantidad, precio_unitario, sector, productos(nombre))',
      )
      .eq('estado', ESTADO_PEDIDO_INICIAL)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error('No se pudieron cargar los pedidos pendientes.');
    }

    return ((data ?? []) as FilaPedidoPendiente[]).map((f) => ({
      id: f.id,
      mesa_id: f.mesa_id,
      cliente_id: f.cliente_id,
      cliente_anonimo_id: f.cliente_anonimo_id,
      estado: f.estado,
      total: f.total,
      created_at: f.created_at,
      numeroMesa: f.mesas?.numero ?? 0,
      nombreCliente: f.usuarios
        ? `${f.usuarios.nombre} ${f.usuarios.apellido}`
        : (f.clientes_anonimos?.nombre ?? 'Invitado'),
      items: f.pedido_items.map((i) => ({
        id: i.id,
        pedido_id: f.id,
        producto_id: i.producto_id,
        cantidad: i.cantidad,
        precio_unitario: i.precio_unitario,
        sector: i.sector,
        estado: 'pendiente',
        nombre: i.productos?.nombre ?? 'Producto',
      })),
    }));
  }

  // Punto 13: el mozo rechaza el pedido para que el cliente lo modifique.
  async rechazarPedido(pedidoId: string, motivo: string): Promise<void> {
    const client = this.supabaseService.getClient();
    const motivoLimpio = motivo.trim();

    if (!motivoLimpio) {
      throw new Error('Ingresá el motivo del rechazo.');
    }

    const { error } = await client
      .from('pedidos')
      .update({ estado: ESTADO_PEDIDO_RECHAZADO, motivo_rechazo: motivoLimpio })
      .eq('id', pedidoId);

    if (error) {
      throw new Error('No se pudo rechazar el pedido.');
    }
  }

  // Punto 14: el mozo confirma el pedido. El "derivado a los sectores"
  // ya está resuelto desde que se creó (cada item guarda su 'sector'):
  // acá sólo cambia el estado, que es lo que hace que las vistas de
  // cocina/bar (listarPorSector) empiecen a mostrarlo.
  async confirmarPedido(pedidoId: string): Promise<void> {
    const client = this.supabaseService.getClient();

    const { error } = await client
      .from('pedidos')
      .update({ estado: ESTADO_PEDIDO_CONFIRMADO })
      .eq('id', pedidoId);

    if (error) {
      throw new Error('No se pudo confirmar el pedido.');
    }
  }

  // Punto 14: pedidos confirmados (o en curso) que tienen al menos un
  // item de este sector, con sólo los items de ese sector embebidos.
  // Cocina y bar usan esto mismo, cambiando el sector.
  async listarPorSector(sector: SectorProducto): Promise<PedidoPorSector[]> {
    const client = this.supabaseService.getClient();

    const { data, error } = await client
      .from('pedidos')
      .select(
        '*, mesas(numero), pedido_items!inner(id, producto_id, cantidad, precio_unitario, sector, estado, productos(nombre, descripcion, foto_url, tiempo_elaboracion_minutos))',
      )
      .in('estado', ESTADOS_PEDIDO_EN_SECTOR)
      .eq('pedido_items.sector', sector)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error('No se pudieron cargar los pedidos de este sector.');
    }

    return ((data ?? []) as FilaPedidoSector[]).map((f) => ({
      id: f.id,
      mesa_id: f.mesa_id,
      cliente_id: f.cliente_id,
      cliente_anonimo_id: f.cliente_anonimo_id,
      estado: f.estado,
      total: f.total,
      created_at: f.created_at,
      numeroMesa: f.mesas?.numero ?? 0,
      items: f.pedido_items
        .filter((i) => i.sector === sector)
        .map((i) => ({
          id: i.id,
          pedido_id: f.id,
          producto_id: i.producto_id,
          cantidad: i.cantidad,
          precio_unitario: i.precio_unitario,
          sector: i.sector,
          estado: i.estado,
          nombre: i.productos?.nombre ?? 'Producto',
          descripcion: i.productos?.descripcion ?? '',
          foto_url: i.productos?.foto_url ?? '',
          tiempo_elaboracion_minutos: i.productos?.tiempo_elaboracion_minutos ?? 0,
        })),
    }));
  }

  // Punto 14/18: cocina/bar escuchan cambios en 'pedidos' (nuevo pedido
  // derivado) y en 'pedido_items' (algún producto marcado listo, propio
  // o del otro sector) para refrescar su lista sin recargar a mano.
  escucharPedidosSector(sector: SectorProducto, alCambiar: () => void): RealtimeChannel {
    const client = this.supabaseService.getClient();

    return client
      .channel(`pedidos-sector-${sector}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedidos' },
        () => alCambiar(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedido_items' },
        () => alCambiar(),
      )
      .subscribe();
  }

  // Punto 18: cocina/bar marcan un producto como listo. Cuando es el
  // último item pendiente del pedido (contando todos los sectores que
  // intervienen), un trigger en la base pasa el pedido a 'listo' y
  // dispara el aviso al mozo (ver supabase/sql/punto-18-setup.sql).
  async marcarItemListo(itemId: string): Promise<void> {
    const client = this.supabaseService.getClient();

    const { error } = await client
      .from('pedido_items')
      .update({ estado: ESTADO_ITEM_LISTO })
      .eq('id', itemId);

    if (error) {
      throw new Error('No se pudo marcar el producto como listo.');
    }
  }

  // Punto 18: pedidos confirmados (o en curso) con TODOS sus items sin
  // filtrar por sector, para que el mozo vea el progreso de cocina y
  // bar en un mismo listado y sepa cuándo el pedido está completo.
  async listarEnCurso(): Promise<PedidoPorSector[]> {
    const client = this.supabaseService.getClient();

    const { data, error } = await client
      .from('pedidos')
      .select(
        '*, mesas(numero), pedido_items(id, producto_id, cantidad, precio_unitario, sector, estado, productos(nombre, descripcion, foto_url, tiempo_elaboracion_minutos))',
      )
      .in('estado', ESTADOS_PEDIDO_EN_SECTOR)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error('No se pudieron cargar los pedidos en curso.');
    }

    return ((data ?? []) as FilaPedidoSector[]).map((f) => ({
      id: f.id,
      mesa_id: f.mesa_id,
      cliente_id: f.cliente_id,
      cliente_anonimo_id: f.cliente_anonimo_id,
      estado: f.estado,
      total: f.total,
      created_at: f.created_at,
      numeroMesa: f.mesas?.numero ?? 0,
      items: f.pedido_items.map((i) => ({
        id: i.id,
        pedido_id: f.id,
        producto_id: i.producto_id,
        cantidad: i.cantidad,
        precio_unitario: i.precio_unitario,
        sector: i.sector,
        estado: i.estado,
        nombre: i.productos?.nombre ?? 'Producto',
        descripcion: i.productos?.descripcion ?? '',
        foto_url: i.productos?.foto_url ?? '',
        tiempo_elaboracion_minutos: i.productos?.tiempo_elaboracion_minutos ?? 0,
      })),
    }));
  }

  // Punto 18: el mozo escucha cambios en 'pedidos' y en 'pedido_items'
  // (cocina/bar marcando productos listos) para ver el progreso sin
  // recargar a mano.
  escucharPedidosEnCurso(alCambiar: () => void): RealtimeChannel {
    const client = this.supabaseService.getClient();

    return client
      .channel('pedidos-en-curso')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedidos' },
        () => alCambiar(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedido_items' },
        () => alCambiar(),
      )
      .subscribe();
  }

  // Punto 19: el mozo entrega el pedido completo (ya estaba 'listo').
  async marcarPedidoEntregado(pedidoId: string): Promise<void> {
    const client = this.supabaseService.getClient();

    const { error } = await client
      .from('pedidos')
      .update({ estado: ESTADO_PEDIDO_ENTREGADO })
      .eq('id', pedidoId);

    if (error) {
      throw new Error('No se pudo marcar el pedido como entregado.');
    }
  }

  // Punto 19: el cliente confirma que recibió el pedido que el mozo
  // marcó como entregado. Recién con esto se habilita, en su pantalla,
  // el acceso a la encuesta y a la opción de pedir la cuenta.
  async confirmarRecepcionPedido(pedidoId: string): Promise<void> {
    const client = this.supabaseService.getClient();

    const { error } = await client
      .from('pedidos')
      .update({ confirmado_por_cliente: true })
      .eq('id', pedidoId);

    if (error) {
      throw new Error('No se pudo confirmar la recepción del pedido.');
    }
  }

  // Punto 13: el cliente modifica un pedido rechazado (agrega, quita o
  // cambia cantidades) y lo reenvía. Se reemplazan los renglones y el
  // pedido vuelve al estado inicial para que el mozo lo vea de nuevo.
  async reenviarPedido(pedidoId: string, lineas: LineaCarrito[]): Promise<Pedido> {
    const client = this.supabaseService.getClient();

    if (lineas.length === 0) {
      throw new Error('Agregá al menos un producto antes de reenviar el pedido.');
    }

    const total = lineas.reduce(
      (acum, l) => acum + l.producto.precio * l.cantidad,
      0,
    );

    // Para no dejar el pedido sin renglones si algo falla a mitad de camino,
    // primero se insertan los nuevos y recién después se borran los viejos.
    const { data: itemsViejos, error: errorViejos } = await client
      .from('pedido_items')
      .select('id')
      .eq('pedido_id', pedidoId);

    if (errorViejos) {
      throw new Error('No se pudo actualizar el detalle del pedido.');
    }

    const idsViejos = (itemsViejos ?? []).map((i) => i.id as string);

    const filasItems = lineas.map((l) => ({
      pedido_id: pedidoId,
      producto_id: l.producto.id,
      cantidad: l.cantidad,
      precio_unitario: l.producto.precio,
      sector: l.producto.sector,
    }));

    const { data: itemsNuevos, error: errorItems } = await client
      .from('pedido_items')
      .insert(filasItems)
      .select('id');
    if (errorItems) {
      throw new Error('No se pudieron guardar los productos del pedido.');
    }

    if (idsViejos.length > 0) {
      const { error: errorBorrar } = await client
        .from('pedido_items')
        .delete()
        .in('id', idsViejos);

      if (errorBorrar) {
        // Revertimos: se quitan los nuevos y el pedido queda como estaba.
        await client
          .from('pedido_items')
          .delete()
          .in('id', (itemsNuevos ?? []).map((i) => i.id as string));
        throw new Error('No se pudo actualizar el detalle del pedido.');
      }
    }

    const { data: pedidoActualizado, error: errorUpdate } = await client
      .from('pedidos')
      .update({ estado: ESTADO_PEDIDO_INICIAL, motivo_rechazo: null, total })
      .eq('id', pedidoId)
      .select()
      .single();

    if (errorUpdate || !pedidoActualizado) {
      throw new Error('No se pudo reenviar el pedido.');
    }

    return pedidoActualizado as Pedido;
  }

  // Punto 13: el mozo escucha cualquier cambio en 'pedidos' para
  // refrescar su lista de pendientes sin recargar a mano (pedido nuevo
  // o reenviado tras un rechazo).
  escucharPedidosPendientes(alCambiar: () => void): RealtimeChannel {
    const client = this.supabaseService.getClient();

    return client
      .channel('pedidos-pendientes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedidos' },
        () => alCambiar(),
      )
      .subscribe();
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
