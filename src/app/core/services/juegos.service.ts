import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { NombreJuego, ResultadoJuego } from '../models/juego.model';

@Injectable({ providedIn: 'root' })
export class JuegosService {
  private supabaseService = inject(SupabaseService);

  async listarResultados(clienteId: string, mesaId: string): Promise<ResultadoJuego[]> {
    const client = this.supabaseService.getClient();
    const { data, error } = await client
      .from('juegos_resultados')
      .select('*')
      .eq('cliente_id', clienteId)
      .eq('mesa_id', mesaId);

    if (error) throw new Error('No se pudieron cargar los juegos.');
    return (data ?? []) as ResultadoJuego[];
  }

  async yaJugo(clienteId: string, mesaId: string, juego: NombreJuego): Promise<boolean> {
    const resultados = await this.listarResultados(clienteId, mesaId);
    return resultados.some((r) => r.juego === juego);
  }

  // "no acumulativos": se toma el mejor resultado entre los juegos jugados.
  async obtenerMejorDescuento(clienteId: string, mesaId: string): Promise<number> {
    const resultados = await this.listarResultados(clienteId, mesaId);
    return resultados.reduce((max, r) => Math.max(max, r.descuento_pct), 0);
  }

  async registrarResultado(
    clienteId: string,
    mesaId: string,
    juego: NombreJuego,
    puntaje: number,
    descuentoPct: number,
  ): Promise<void> {
    const client = this.supabaseService.getClient();
    const { error } = await client.from('juegos_resultados').insert({
      cliente_id: clienteId,
      mesa_id: mesaId,
      juego,
      puntaje,
      descuento_pct: descuentoPct,
    });

    // Si ya jugó ese juego (choca con el unique), no lo tratamos como
    // error fatal: simplemente no se sobreescribe, ya vale el primero.
    if (error && !error.message.includes('duplicate')) {
      throw new Error('No se pudo guardar el resultado del juego.');
    }
  }
}