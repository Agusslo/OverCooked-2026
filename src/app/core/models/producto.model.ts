// Mismo producto sirve para el punto 2 (platos, perfil cocinero, sector cocina)
// y el punto 3 (bebidas, perfil cantinero, sector bar). Lo que cambia entre
// uno y otro es 'tipo' y 'sector', no la estructura.

export type TipoProducto = 'plato' | 'bebida';
export type SectorProducto = 'cocina' | 'bar';

export interface Producto {
  id: string;
  nombre: string;
  descripcion: string;
  tiempo_elaboracion_minutos: number;
  precio: number;
  tipo: TipoProducto;
  sector: SectorProducto;
  disponible: boolean;
  foto_url: string;
  foto_url_2: string;
  foto_url_3: string;
  created_at: string;
}