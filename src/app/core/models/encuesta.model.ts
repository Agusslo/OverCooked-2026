export type TipoControlPregunta = 'escala' | 'opcion_multiple' | 'si_no' | 'texto_libre';

export interface OpcionPregunta {
  id: string;
  pregunta_id: string;
  texto: string;
  orden: number;
}

export interface PreguntaEncuesta {
  id: string;
  encuesta_id: string;
  texto: string;
  tipo_control: TipoControlPregunta;
  orden: number;
  opciones?: OpcionPregunta[]; // solo viene cargado si tipo_control === 'opcion_multiple'
}

export interface Encuesta {
  id: string;
  titulo: string;
  activa: boolean;
  created_at: string;
  preguntas: PreguntaEncuesta[];
}

export interface RespuestaEncuesta {
  id: string;
  pedido_id: string;
  pregunta_id: string;
  valor: string;
  created_at: string;
}