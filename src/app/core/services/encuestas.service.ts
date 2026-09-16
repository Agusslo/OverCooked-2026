import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Encuesta, PreguntaEncuesta, OpcionPregunta } from '../models/encuesta.model';
import { conTimeout } from '../utils/con-timeout.util';

export interface RespuestaAEnviar {
  preguntaId: string;
  valor: string;
}

@Injectable({
  providedIn: 'root',
})
export class EncuestasService {
  constructor(private supabaseService: SupabaseService) {}

  // Punto 20: trae la encuesta activa con sus preguntas (y las
  // opciones de las que sean 'opcion_multiple'), ordenadas por
  // 'orden' en cada nivel.
  async obtenerEncuestaActiva(): Promise<Encuesta | null> {
    const client = this.supabaseService.getClient();

    const { data: encuesta, error: errorEncuesta } = await conTimeout(
      client.from('encuestas').select('*').eq('activa', true).maybeSingle(),
    );

    if (errorEncuesta) {
      throw new Error('No se pudo cargar la encuesta.');
    }
    if (!encuesta) {
      return null;
    }

    const { data: preguntas, error: errorPreguntas } = await conTimeout(
      client
        .from('preguntas_encuesta')
        .select('*')
        .eq('encuesta_id', encuesta.id)
        .order('orden', { ascending: true }),
    );

    if (errorPreguntas) {
      throw new Error('No se pudieron cargar las preguntas de la encuesta.');
    }

    const preguntasConOpciones: PreguntaEncuesta[] = [];

    for (const pregunta of preguntas ?? []) {
      if (pregunta.tipo_control === 'opcion_multiple') {
        const { data: opciones, error: errorOpciones } = await conTimeout(
          client
            .from('opciones_pregunta')
            .select('*')
            .eq('pregunta_id', pregunta.id)
            .order('orden', { ascending: true }),
        );

        if (errorOpciones) {
          throw new Error('No se pudieron cargar las opciones de una pregunta.');
        }

        preguntasConOpciones.push({
          ...pregunta,
          opciones: (opciones ?? []) as OpcionPregunta[],
        });
      } else {
        preguntasConOpciones.push(pregunta as PreguntaEncuesta);
      }
    }

    return { ...encuesta, preguntas: preguntasConOpciones } as Encuesta;
  }

  // "Una encuesta por estadía": tomamos una estadía = un pedido.
  // Si ya hay respuestas guardadas para este pedido, no se puede
  // cargar otra.
  async yaRespondio(pedidoId: string): Promise<boolean> {
    const { data, error } = await conTimeout(
      this.supabaseService
        .getClient()
        .from('respuestas_encuesta')
        .select('id')
        .eq('pedido_id', pedidoId)
        .limit(1)
        .maybeSingle(),
    );

    if (error) {
      throw new Error('No se pudo verificar si ya respondiste la encuesta.');
    }

    return !!data;
  }

  async guardarRespuestas(pedidoId: string, respuestas: RespuestaAEnviar[]): Promise<void> {
    const filas = respuestas.map((r) => ({
      pedido_id: pedidoId,
      pregunta_id: r.preguntaId,
      valor: r.valor,
    }));

    const { error } = await conTimeout(
      this.supabaseService.getClient().from('respuestas_encuesta').insert(filas),
    );

    if (error) {
      throw new Error('No se pudieron guardar tus respuestas.');
    }
  }

    // Punto 20 (segunda mitad): resultados agregados de una pregunta,
  // contando cuántas veces se repite cada 'valor' de respuesta.
    async obtenerResultados(pregunta: PreguntaEncuesta,): Promise<{ etiqueta: string; cantidad: number }[]> {
    const { data, error } = await conTimeout(
      this.supabaseService
        .getClient()
        .from('respuestas_encuesta')
        .select('valor')
        .eq('pregunta_id', pregunta.id),
    );

    if (error) {
      throw new Error('No se pudieron cargar los resultados.');
    }

    const conteo = new Map<string, number>();
    for (const fila of data ?? []) {
      conteo.set(fila.valor, (conteo.get(fila.valor) ?? 0) + 1);
    }

    // Para 'escala' siempre mostramos el 1 al 5 en orden, aunque
    // alguno no tenga ninguna respuesta todavía (queda en 0) — si no,
    // el gráfico salta valores y queda desordenado.
    if (pregunta.tipo_control === 'escala') {
      return ['1', '2', '3', '4', '5'].map((valor) => ({
        etiqueta: valor,
        cantidad: conteo.get(valor) ?? 0,
      }));
    }

    return Array.from(conteo.entries()).map(([etiqueta, cantidad]) => ({ etiqueta, cantidad }));
  }

  // Para el texto libre no tiene sentido un gráfico (es texto, no
  // datos agrupables) — se muestran los comentarios tal cual.
  async obtenerComentarios(preguntaId: string): Promise<string[]> {
    const { data, error } = await conTimeout(
      this.supabaseService
        .getClient()
        .from('respuestas_encuesta')
        .select('valor')
        .eq('pregunta_id', preguntaId)
        .order('created_at', { ascending: false }),
    );

    if (error) {
      throw new Error('No se pudieron cargar los comentarios.');
    }

    return (data ?? []).map((fila) => fila.valor).filter((v) => v && v.trim().length > 0);
  }
}