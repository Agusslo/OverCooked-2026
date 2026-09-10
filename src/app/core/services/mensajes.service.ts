import { Injectable, inject } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { MensajeMesa, AutorMensaje } from '../models/mensaje.model';

export interface DatosNuevoMensaje {
  mesaId: string;
  hiloClienteId: string;
  autorId: string;
  autorNombre: string;
  autorPerfil: AutorMensaje;
  contenido: string;
}

export interface HiloActivo {
  hiloClienteId: string;
  clienteNombre: string;
  ultimoMensaje: string;
  ultimaFecha: string;
  tieneNovedad: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class MensajesService {
  private supabaseService = inject(SupabaseService);

  async listarPorHilo(mesaId: string, hiloClienteId: string): Promise<MensajeMesa[]> {
    const client = this.supabaseService.getClient();

    const { data, error } = await client
      .from('mensajes_mesa')
      .select('*')
      .eq('mesa_id', mesaId)
      .eq('hilo_cliente_id', hiloClienteId)
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
        hilo_cliente_id: datos.hiloClienteId,
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

  // Escucha SOLO los mensajes de un hilo puntual. El filtro de
  // Realtime sólo admite una condición por canal, así que filtramos
  // por mesa acá y descartamos en el callback los mensajes que sean
  // de un hilo distinto al que nos interesa.
  escucharHilo(
    mesaId: string,
    hiloClienteId: string,
    alRecibir: (mensaje: MensajeMesa) => void,
  ): RealtimeChannel {
    const client = this.supabaseService.getClient();

    return client
      .channel(`mensajes-hilo-${mesaId}-${hiloClienteId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensajes_mesa',
          filter: `mesa_id=eq.${mesaId}`,
        },
        (payload) => {
          const mensaje = payload.new as MensajeMesa;
          if (mensaje.hilo_cliente_id === hiloClienteId) {
            alRecibir(mensaje);
          }
        },
      )
      .subscribe();
  }

  // Para el listado del mozo: cualquier mensaje nuevo de cliente en
  // CUALQUIER mesa/hilo, para prender los avisos en vivo.
  escucharMensajesDeClientes(alRecibir: (mensaje: MensajeMesa) => void): RealtimeChannel {
    const client = this.supabaseService.getClient();

    return client
      .channel('mensajes-mesa-clientes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensajes_mesa',
          filter: 'autor_perfil=neq.mozo',
        },
        (payload) => alRecibir(payload.new as MensajeMesa),
      )
      .subscribe();
  }

  dejarDeEscuchar(canal: RealtimeChannel): void {
    this.supabaseService.getClient().removeChannel(canal);
  }

  async marcarLeidoGlobal(mesaId: string, hiloClienteId: string): Promise<void> {
    const client = this.supabaseService.getClient();

    const { error } = await client.from('mesas_chat_leido').upsert(
      { mesa_id: mesaId, hilo_cliente_id: hiloClienteId, ultima_lectura: new Date().toISOString() },
      { onConflict: 'mesa_id,hilo_cliente_id' },
    );

    if (error) {
      console.warn('No se pudo marcar el chat como leído:', error.message);
    }
  }

  // Para la pantalla intermedia del mozo: lista, para una mesa
  // puntual, todas las conversaciones (hilos) que tiene abiertas, con
  // el nombre de cada cliente, su último mensaje y si hay novedad.
  async listarHilosDeMesa(mesaId: string): Promise<HiloActivo[]> {
    const client = this.supabaseService.getClient();

    const [{ data: mensajes, error: errorMensajes }, { data: leidos, error: errorLeidos }] =
      await Promise.all([
        client
          .from('mensajes_mesa')
          .select('hilo_cliente_id, autor_nombre, autor_perfil, contenido, created_at')
          .eq('mesa_id', mesaId)
          .order('created_at', { ascending: false }),
        client
          .from('mesas_chat_leido')
          .select('hilo_cliente_id, ultima_lectura')
          .eq('mesa_id', mesaId),
      ]);

    if (errorMensajes || errorLeidos) {
      throw new Error('No se pudieron cargar las conversaciones de la mesa.');
    }

    const lecturaPorHilo = new Map<string, string>(
      (leidos ?? []).map((f) => [f.hilo_cliente_id, f.ultima_lectura]),
    );

    // Venimos ordenados de más nuevo a más viejo, así que el primer
    // mensaje que aparece por cada hilo ya es el más reciente.
    const porHilo = new Map<string, HiloActivo>();
    for (const fila of mensajes ?? []) {
      if (porHilo.has(fila.hilo_cliente_id)) continue;

      // El nombre a mostrar es el del CLIENTE dueño del hilo, aunque
      // el último mensaje lo haya escrito el mozo.
      const autorCliente = (mensajes ?? []).find(
        (m) => m.hilo_cliente_id === fila.hilo_cliente_id && m.autor_perfil !== 'mozo',
      );

      const fechaLectura = lecturaPorHilo.get(fila.hilo_cliente_id);

      porHilo.set(fila.hilo_cliente_id, {
        hiloClienteId: fila.hilo_cliente_id,
        clienteNombre: autorCliente?.autor_nombre ?? fila.autor_nombre,
        ultimoMensaje: fila.contenido,
        ultimaFecha: fila.created_at,
        tieneNovedad: !fechaLectura || fila.created_at > fechaLectura,
      });
    }

    return Array.from(porHilo.values()).sort(
      (a, b) => new Date(b.ultimaFecha).getTime() - new Date(a.ultimaFecha).getTime(),
    );
  }

  // Para el listado principal de mesas: una mesa tiene novedad si
  // ALGUNO de sus hilos tiene un mensaje de cliente sin leer.
  async listarMesasConMensajeNuevo(mesaIds: string[]): Promise<Set<string>> {
    if (mesaIds.length === 0) {
      return new Set();
    }

    const client = this.supabaseService.getClient();

    const [{ data: mensajes, error: errorMensajes }, { data: leidos, error: errorLeidos }] =
      await Promise.all([
        client
          .from('mensajes_mesa')
          .select('mesa_id, hilo_cliente_id, autor_perfil, created_at')
          .in('mesa_id', mesaIds)
          .neq('autor_perfil', 'mozo')
          .order('created_at', { ascending: false }),
        client
          .from('mesas_chat_leido')
          .select('mesa_id, hilo_cliente_id, ultima_lectura')
          .in('mesa_id', mesaIds),
      ]);

    if (errorMensajes || errorLeidos) {
      throw new Error('No se pudo verificar qué mesas tienen mensajes nuevos.');
    }

    const ultimoPorHilo = new Map<string, string>();
    for (const fila of mensajes ?? []) {
      const clave = `${fila.mesa_id}|${fila.hilo_cliente_id}`;
      if (!ultimoPorHilo.has(clave)) {
        ultimoPorHilo.set(clave, fila.created_at);
      }
    }

    const lecturaPorHilo = new Map<string, string>(
      (leidos ?? []).map((f) => [`${f.mesa_id}|${f.hilo_cliente_id}`, f.ultima_lectura]),
    );

    const mesasConNovedad = new Set<string>();
    for (const [clave, fechaMensaje] of ultimoPorHilo) {
      const [mesaId] = clave.split('|');
      const fechaLectura = lecturaPorHilo.get(clave);
      if (!fechaLectura || fechaMensaje > fechaLectura) {
        mesasConNovedad.add(mesaId);
      }
    }

    return mesasConNovedad;
  }
}