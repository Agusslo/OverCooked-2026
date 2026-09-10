import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { MesasService } from './mesas.service';
import { ClienteEnEspera } from '../models/lista-espera.model';

export interface DatosAnotarse {
  clienteId?: string;         // id de 'usuarios', si es cliente registrado
  clienteAnonimoId?: string;  // id de auth, si es cliente anónimo
  nombre: string;
  fotoUrl: string;
}

@Injectable({
  providedIn: 'root',
})
export class ListaEsperaService {
  private mesasService = inject(MesasService);
  private supabaseService = inject(SupabaseService);

  // Corta una promesa que no responde en 'ms' milisegundos, para que
  // nunca se quede colgada para siempre (le pasó al WebView de Android
  // más de una vez con llamadas a Supabase justo después de otra).
  private conTimeout<T>(promesa: PromiseLike<T>, ms: number): Promise<T> {
    return Promise.race([
      Promise.resolve(promesa),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('La conexión tardó demasiado, probá de nuevo.')), ms),
      ),
    ]);
  }

  // Punto 9: al escanear el QR de ingreso, el cliente (anónimo o
  // registrado) queda anotado en la lista de espera del metre.
  // Reintenta hasta 3 veces por si la llamada se cuelga o falla por
  // un corte de red pasajero.
  async anotarse(datos: DatosAnotarse): Promise<void> {
    const client = this.supabaseService.getClient();
    let ultimoError: unknown = null;

    for (let intento = 1; intento <= 3; intento++) {
      try {
        const { error } = await this.conTimeout(
          client.from('lista_espera').insert({
            cliente_id: datos.clienteId ?? null,
            cliente_anonimo_id: datos.clienteAnonimoId ?? null,
            nombre: datos.nombre,
            foto_url: datos.fotoUrl,
            estado: 'esperando',
          }),
          8000,
        );

        if (error) {
          throw error;
        }

        return; // éxito, cortamos acá
      } catch (error) {
        ultimoError = error;
        console.warn(`[anotarse] Intento ${intento} de 3 falló:`, error);

        if (intento < 3) {
          await new Promise((resolve) => setTimeout(resolve, intento * 300));
        }
      }
    }

    console.error('[anotarse] Los 3 intentos fallaron:', ultimoError);
    throw new Error(
      ultimoError instanceof Error
        ? `No se pudo anotar en la lista de espera: ${ultimoError.message}`
        : 'No se pudo anotar en la lista de espera.',
    );
  }

  // Para la pantalla del metre (punto 9/10): solo los que siguen
  // esperando, más antiguos primero (orden de llegada).
  async listarEsperando(): Promise<ClienteEnEspera[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('lista_espera')
      .select('*')
      .eq('estado', 'esperando')
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error('No se pudo cargar la lista de espera.');
    }

    return (data ?? []) as ClienteEnEspera[];
  }

  // Para la pantalla del metre de asignación de mesas: sólo clientes
  // REGISTRADOS (cliente_id no nulo) que siguen esperando. Los
  // anónimos no entran acá porque la asignación pide un cliente
  // registrado.
  async listarEsperandoRegistrados(): Promise<ClienteEnEspera[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('lista_espera')
      .select('*')
      .eq('estado', 'esperando')
      .not('cliente_id', 'is', null)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error('No se pudo cargar la lista de espera.');
    }

    return (data ?? []) as ClienteEnEspera[];
  }

  // Punto 10: el metre asigna una mesa libre a un cliente registrado
  // que está esperando. Queda el historial en 'asignaciones_mesa'
  // (tabla ya prevista en la base para esto: liga mesa + cliente +
  // la fila de lista_espera de origen), se marca esa fila de espera
  // como 'asignado' y la mesa pasa a ocupada.
  async asignarMesa(espera: ClienteEnEspera, mesaId: string): Promise<void> {
    const client = this.supabaseService.getClient();

    const { error: errorAsignacion } = await client.from('asignaciones_mesa').insert({
      mesa_id: mesaId,
      cliente_id: espera.cliente_id,
      cliente_anonimo_id: espera.cliente_anonimo_id,
      lista_espera_id: espera.id,
    });

    if (errorAsignacion) {
      throw new Error('No se pudo asignar la mesa al cliente.');
    }

    const { error: errorEspera } = await client
      .from('lista_espera')
      .update({ estado: 'asignado' })
      .eq('id', espera.id);

    if (errorEspera) {
      throw new Error('La mesa se asignó, pero no se pudo actualizar la lista de espera.');
    }

    await this.mesasService.actualizarEstado(mesaId, 'ocupada');
  }

  // "Eliminado del listado": no se borra la fila, se marca como
  // cancelado (así queda historial y el enum ya contempla este caso).
  async eliminar(id: string): Promise<void> {
    const { error } = await this.supabaseService
      .getClient()
      .from('lista_espera')
      .update({ estado: 'cancelado' })
      .eq('id', id);

    if (error) {
      throw new Error('No se pudo sacar al cliente de la lista de espera.');
    }
  }

  // Punto 10: nadie puede recibir una mesa si no está esperando.
  async estaEsperando(clienteId?: string, clienteAnonimoId?: string): Promise<boolean> {
    const client = this.supabaseService.getClient();
    let query = client.from('lista_espera').select('id').eq('estado', 'esperando');

    query = clienteId ? query.eq('cliente_id', clienteId) : query.eq('cliente_anonimo_id', clienteAnonimoId!);

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw new Error('No se pudo verificar la lista de espera.');
    }

    return !!data;
  }
}