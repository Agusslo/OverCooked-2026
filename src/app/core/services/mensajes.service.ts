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

  // Sufijo random para que dos canales nunca choquen de nombre, ni
  // siquiera si el anterior todavía no terminó de cerrarse (pasa al
  // navegar rápido entre pantallas). Como siempre guardamos la
  // referencia al canal en la variable 'canal' del componente, nunca
  // necesitamos encontrarlo por nombre después — así que un nombre
  // único por cada suscripción no tiene ninguna desventaja.
  private nombreCanalUnico(base: string): string {
    return `${base}-${crypto.randomUUID()}`;
  }

  escucharHilo(
    mesaId: string,
    hiloClienteId: string,
    alRecibir: (mensaje: MensajeMesa) => void,
  ): RealtimeChannel {
    const client = this.supabaseService.getClient();

    return client
      .channel(this.nombreCanalUnico(`mensajes-hilo-${mesaId}-${hiloClienteId}`))
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

  // Para "Consultas de mesas" (listado general): cualquier mensaje
  // nuevo, sin importar mesa ni autor. Con eso alcanza para saber que
  // algo cambió y hay que recalcular qué mesas tienen novedad — el
  // cálculo en sí lo hace listarMesasConMensajeNuevo, no este método.
  escucharTodosLosMensajes(alRecibir: (mensaje: MensajeMesa) => void): RealtimeChannel {
    const client = this.supabaseService.getClient();

    return client
      .channel(this.nombreCanalUnico('mensajes-todos'))
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensajes_mesa' },
        (payload) => alRecibir(payload.new as MensajeMesa),
      )
      .subscribe();
  }

  // Para "Conversaciones abiertas" de una mesa puntual: cualquier
  // mensaje de ESA mesa, sea de cliente o de mozo, dispara un
  // recálculo completo de la lista de hilos (vista previa + puntito).
  escucharMensajesDeMesa(
    mesaId: string,
    alRecibir: (mensaje: MensajeMesa) => void,
  ): RealtimeChannel {
    const client = this.supabaseService.getClient();

    return client
      .channel(this.nombreCanalUnico(`mensajes-mesa-${mesaId}`))
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

    // Recorremos una sola vez (vienen ordenados de más nuevo a más
    // viejo). Por cada hilo guardamos: el mensaje más reciente en
    // general (para la vista previa, sea de quien sea) Y el mensaje
    // de CLIENTE más reciente por separado (para decidir la novedad
    // — la propia respuesta del mozo no cuenta como "mensaje nuevo").
    const previewPorHilo = new Map<string, { nombre: string; contenido: string; fecha: string }>();
    const ultimoClientePorHilo = new Map<string, string>();

    for (const fila of mensajes ?? []) {
      if (!previewPorHilo.has(fila.hilo_cliente_id)) {
        previewPorHilo.set(fila.hilo_cliente_id, {
          nombre: fila.autor_nombre,
          contenido: fila.contenido,
          fecha: fila.created_at,
        });
      }
      if (fila.autor_perfil !== 'mozo' && !ultimoClientePorHilo.has(fila.hilo_cliente_id)) {
        ultimoClientePorHilo.set(fila.hilo_cliente_id, fila.created_at);
      }
    }

    // El nombre a mostrar siempre es el del cliente dueño del hilo,
    // aunque el último mensaje en pantalla lo haya escrito el mozo.
    const nombreClientePorHilo = new Map<string, string>();
    for (const fila of mensajes ?? []) {
      if (fila.autor_perfil !== 'mozo' && !nombreClientePorHilo.has(fila.hilo_cliente_id)) {
        nombreClientePorHilo.set(fila.hilo_cliente_id, fila.autor_nombre);
      }
    }

    const resultado: HiloActivo[] = [];
    for (const [hiloClienteId, preview] of previewPorHilo) {
      const fechaLectura = lecturaPorHilo.get(hiloClienteId);
      const fechaUltimoCliente = ultimoClientePorHilo.get(hiloClienteId);

      resultado.push({
        hiloClienteId,
        clienteNombre: nombreClientePorHilo.get(hiloClienteId) ?? preview.nombre,
        ultimoMensaje: preview.contenido,
        ultimaFecha: preview.fecha,
        tieneNovedad:
          !!fechaUltimoCliente &&
          (!fechaLectura || new Date(fechaUltimoCliente).getTime() > new Date(fechaLectura).getTime()),
      });
    }

    return resultado.sort(
      (a, b) => new Date(b.ultimaFecha).getTime() - new Date(a.ultimaFecha).getTime(),
    );
  }

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
      if (!fechaLectura || new Date(fechaMensaje).getTime() > new Date(fechaLectura).getTime()) {
        mesasConNovedad.add(mesaId);
      }
    }

    return mesasConNovedad;
  }
}