// Punto 12 del PDF: el cliente arma un pedido para la mesa. Un pedido
// tiene una cabecera (tabla 'pedidos') y varios renglones ('pedido_items'),
// uno por producto elegido con su cantidad.
//
// Las columnas coinciden con el esquema real de Supabase:
//  - pedidos:      id, mesa_id, cliente_id, cliente_anonimo_id, estado,
//                  total, created_at
//  - pedido_items: id, pedido_id, producto_id, cantidad, precio_unitario,
//                  sector, estado
// El nombre / la foto / el tiempo de cada ítem NO se guardan en la fila:
// se traen con un join a 'productos' cuando hace falta mostrarlos.

import { SectorProducto } from './producto.model';

// El enum estado_pedido de la base arranca en 'pendiente_mozo' (el
// cliente terminó el pedido y espera que el mozo lo confirme, punto 12).
// El resto de los valores los define el mozo en los puntos 13+.
export type EstadoPedido = string;

export const ESTADO_PEDIDO_INICIAL = 'pendiente_mozo';

export interface PedidoItem {
  id: string;
  pedido_id: string;
  producto_id: string;
  cantidad: number;
  precio_unitario: number;
  sector: SectorProducto;
  estado: string;
  // Se completan al traer el pedido con join a 'productos'.
  nombre?: string;
  descripcion?: string;
  foto_url?: string;
  tiempo_elaboracion_minutos?: number;
}

export interface Pedido {
  id: string;
  mesa_id: string;
  cliente_id: string | null;
  cliente_anonimo_id: string | null;
  estado: EstadoPedido;
  total: number;
  created_at: string;
  // Se completa cuando se trae el pedido con su detalle.
  items?: PedidoItem[];
}

// Estados en los que el pedido ya está cerrado y la mesa quedó libre.
export const ESTADOS_PEDIDO_TERMINADOS = ['pagado', 'cancelado'];

// Texto para mostrarle al cliente en la pantalla de estado del pedido.
// Se resuelve por función para tolerar valores del enum que todavía no
// estén contemplados acá.
const ETIQUETAS: Record<string, string> = {
  pendiente_mozo: 'Esperando que el mozo confirme tu pedido',
  pendiente: 'Esperando que el mozo confirme tu pedido',
  rechazado: 'El mozo te devolvió el pedido para que lo modifiques',
  confirmado: 'El mozo confirmó tu pedido y ya lo mandó a preparar',
  en_preparacion: 'Cocina y bar están preparando tu pedido',
  en_preparación: 'Cocina y bar están preparando tu pedido',
  listo: 'Tu pedido está listo, el mozo ya lo va a llevar',
  entregado: 'Pedido entregado. ¡Buen provecho!',
  pagado: 'Cuenta paga. ¡Gracias por tu visita!',
  cancelado: 'El pedido fue cancelado',
};

export function etiquetaEstadoPedido(estado: EstadoPedido): string {
  return ETIQUETAS[estado] ?? `Estado del pedido: ${estado}`;
}
