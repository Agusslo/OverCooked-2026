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
  // Punto 13: motivo que carga el mozo al rechazar el pedido. Sólo
  // tiene valor mientras estado === 'rechazado'.
  motivo_rechazo?: string | null;
  // Punto 19: el cliente confirma haber recibido el pedido que el mozo
  // marcó como entregado. Recién ahí se habilita el acceso a la
  // encuesta y a pedir la cuenta.
  confirmado_por_cliente?: boolean;
  // Se completa cuando se trae el pedido con su detalle.
  items?: PedidoItem[];
}

// Punto 13: el mozo rechaza el pedido para que el cliente lo modifique.
export const ESTADO_PEDIDO_RECHAZADO = 'rechazado';

// Punto 14: el mozo confirma el pedido. A partir de acá queda derivado
// a cocina/bar (cada item ya tiene su 'sector' guardado desde que se
// creó, punto 12) y el cliente puede acceder a los juegos.
export const ESTADO_PEDIDO_CONFIRMADO = 'confirmado';

// Punto 18: estados del enum estado_item_pedido que usan cocina/bar
// para marcar cada producto. 'en_preparacion' y 'entregado' quedan
// para puntos posteriores (todavía nada los asigna).
export const ESTADO_ITEM_PENDIENTE = 'pendiente';
export const ESTADO_ITEM_LISTO = 'listo';

// Punto 18: todos los items de los sectores intervinientes están
// 'listo' -> un trigger en la base marca el pedido con este mismo
// estado y el mozo ya lo puede retirar completo.
export const ESTADO_PEDIDO_LISTO = 'listo';

// Punto 19: el mozo entrega el pedido completo (ya estaba 'listo').
export const ESTADO_PEDIDO_ENTREGADO = 'entregado';

// Estados en los que un pedido confirmado sigue "vivo" para el sector
// (cocina/bar) que lo tiene que preparar: ya fue derivado pero todavía
// no se entregó. Point 14 sólo necesita listar acá; el detalle de que
// cocina/bar cambien el estado de cada item es de un punto posterior.
export const ESTADOS_PEDIDO_EN_SECTOR = ['confirmado', 'en_preparacion', 'listo'];

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
