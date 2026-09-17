export type NombreJuego = 'higher_lower' | 'simon' | 'tercero';

export interface ResultadoJuego {
  id: string;
  cliente_id: string;
  mesa_id: string;
  juego: NombreJuego;
  puntaje: number;
  descuento_pct: number;
  created_at: string;
}

export const JUEGOS_DISPONIBLES: { juego: NombreJuego; nombre: string; ruta: string }[] = [
  { juego: 'higher_lower', nombre: 'Mayor o Menor', ruta: 'higher-lower' },
  { juego: 'simon', nombre: 'Simón', ruta: 'simon' },
  { juego: 'tercero', nombre: 'Próximamente', ruta: '' },
];