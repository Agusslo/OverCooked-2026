export type AutorMensaje = 'cliente' | 'anonimo' | 'mozo';

export interface MensajeMesa {
  id: string;
  mesa_id: string;
  hilo_cliente_id: string;
  autor_id: string;
  autor_nombre: string;
  autor_perfil: AutorMensaje;
  contenido: string;
  created_at: string;
}