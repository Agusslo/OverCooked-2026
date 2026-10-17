// Valores EXACTOS de los enums tipo_mesa y estado_mesa en Supabase. / Si esto no coincide letra por letra con la base, el insert falla.
export type TipoMesa = 'vip' | 'estandar' | 'movilidad_reducida';
export type EstadoMesa = 'libre' | 'ocupada' | 'reservada';

export interface Mesa {
  id: string;
  numero: number;
  capacidad: number;
  tipo: TipoMesa;
  estado: EstadoMesa;
  foto_url: string;
  qr_code: string; // mismo valor que 'id': el QR codifica el id de la mesa
  created_at: string;
}