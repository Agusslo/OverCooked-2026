import { Injectable, inject } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { MensajeMesa, AutorMensaje } from '../models/mensaje.model';

export interface DatosNuevoMensaje {
  mesaId: string;
  autorId: string;
  autorNombre: string;
  autorPerfil: AutorMensaje;
  contenido: string;
}

@Injectable({
  providedIn: 'root',
})
export class MensajesService {
  private supabaseService = inject(SupabaseService);

  async listarPorMesa(mesaId: string): Promise<MensajeMesa[]> {
    const client = this.supabaseService.getClient();

    const { data, error } = await client
      .from('mensajes_mesa')
      .select('*')
      .eq('mesa_id', mesaId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error('No se pudieron cargar los mensajes.');
    }

    return (data ?? []) as MensajeMesa[];
  }

  async enviar(datos: DatosNuevoMensaje): Promise<MensajeMesa> {
    const client = this.supabaseService.getClient();

    const { data, error } = await client
      .from('mensajes_mesa')
      .insert({
        mesa_id: datos.mesaId,
        autor_id: datos.autorId,
        autor_nombre: datos.autorNombre,
        autor_perfil: datos.autorPerfil,
        contenido: datos.contenido,
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(error?.message || 'No se pudo enviar el mensaje.');
    }

    return data as MensajeMesa;
  }

  // Un "canal" de Realtime es una suscripción en vivo a cambios en la
  // base: en vez de nosotros preguntar "¿hay mensajes nuevos?" cada
  // tantos segundos (polling), Supabase nos avisa apenas se inserta
  // una fila nueva que cumple el filtro. alRecibir() se ejecuta cada
  // vez que eso pasa, con el mensaje recién insertado.
  escucharMesa(mesaId: string, alRecibir: (mensaje: MensajeMesa) => void): RealtimeChannel {
    const client = this.supabaseService.getClient();

    return client
      .channel(`mensajes-mesa-${mesaId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensajes_mesa',
          filter: `mesa_id=eq.${mesaId}`,
        },
        (payload) => alRecibir(payload.new as MensajeMesa),
      )
      .subscribe();
  }

  // Hay que cerrar el canal cuando se sale de la pantalla del chat
  // (en ngOnDestroy), o si no la suscripción queda escuchando para
  // siempre en segundo plano, gastando conexión de más.
  dejarDeEscuchar(canal: RealtimeChannel): void {
    this.supabaseService.getClient().removeChannel(canal);
  }
}