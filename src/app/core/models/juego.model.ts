export type NombreJuego = 'higher_lower' | 'simon' | 'memotest';

export interface ResultadoJuego {
  id: string;
  cliente_id: string;
  mesa_id: string;
  juego: NombreJuego;
  puntaje: number;
  descuento_pct: number;
  created_at: string;
}

export const JUEGOS_DISPONIBLES: { juego: NombreJuego; nombre: string; ruta: string; descuentoPct: number }[] = [
  { juego: 'higher_lower', nombre: 'Mayor o Menor', ruta: 'higher-lower', descuentoPct: 20 },
  { juego: 'simon', nombre: 'Simón', ruta: 'simon', descuentoPct: 10 },
  { juego: 'memotest', nombre: 'Memotest', ruta: 'memotest', descuentoPct: 15 },
];