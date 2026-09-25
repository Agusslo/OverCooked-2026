// Punto 21 del PDF: la cuenta del cliente. Las columnas de 'pagos' y
// 'qr_propinas' coinciden con el esquema real de Supabase.

// Enum nivel_satisfaccion de la base (letra por letra).
export type NivelSatisfaccion =
  | 'excelente'
  | 'muy_bueno'
  | 'bueno'
  | 'regular'
  | 'malo';

export interface QrPropina {
  id: string;
  nivel: NivelSatisfaccion;
  porcentaje: number;
  qr_code: string;
}

export interface Pago {
  id: string;
  pedido_id: string;
  subtotal: number;
  descuento_porcentaje: number;
  propina_porcentaje: number;
  total: number;
  confirmado_por_mozo: boolean;
  created_at: string;
}

// Importes ya calculados, listos para mostrar y para guardar en 'pagos'.
export interface ImportesCuenta {
  subtotal: number;
  descuentoPorcentaje: number;
  montoDescuento: number;
  propinaPorcentaje: number;
  montoPropina: number;
  total: number;
}

export const ETIQUETAS_SATISFACCION: Record<NivelSatisfaccion, string> = {
  excelente: 'Excelente',
  muy_bueno: 'Muy bueno',
  bueno: 'Bueno',
  regular: 'Regular',
  malo: 'Malo',
};
