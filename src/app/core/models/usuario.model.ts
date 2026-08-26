/*
type con | (unión): PerfilUsuario no es una clase ni un enum
de TypeScript, es un "tipo unión" — le dice al editor que esa
variable solo puede valer una de esas 7 palabras exactas
*/ 

export type PerfilUsuario =
  | 'dueño'
  | 'supervisor'
  | 'metre'
  | 'mozo'
  | 'cocinero'
  | 'cantinero'
  | 'cliente';

export type EstadoUsuario = 'pendiente' | 'aprobado' | 'rechazado';

export interface Usuario {
  id: string;
  nombre: string;
  apellido: string;
  dni: string;
  cuil: string | null;
  email: string;
  perfil: PerfilUsuario;
  foto_url: string;
  estado: EstadoUsuario;
  created_at: string;
}