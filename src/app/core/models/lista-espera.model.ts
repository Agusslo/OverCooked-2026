export type EstadoListaEspera = 'esperando' | 'asignado' | 'cancelado';

export interface ClienteEnEspera {
    id: string;
    cliente_id: string | null;          // si es un cliente registrado
    cliente_anonimo_id: string | null;  // si es un cliente anónimo
    nombre: string;
    foto_url: string;
    estado: EstadoListaEspera;
    created_at: string;
}