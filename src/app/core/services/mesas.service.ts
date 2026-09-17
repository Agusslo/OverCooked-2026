import { Injectable, inject } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { Mesa, TipoMesa, EstadoMesa} from '../models/mesa.model';
import { conTimeout } from '../utils/con-timeout.util';

export interface DatosNuevaMesa {
  numero: number;
  capacidad: number;
  tipo: TipoMesa;
  fotoDataUrl: string; // una sola foto, a diferencia de productos que llevan 3
}

const BUCKET = 'mesas-fotos';

@Injectable({
  providedIn: 'root',
})
export class MesasService {
  private supabaseService = inject(SupabaseService);

  // "Se verifica la existencia de la nueva mesa": antes de crear, chequeamos
  // que no haya ya una mesa con ese número (el número identifica la mesa
  // para el mozo/metre, no puede haber dos mesas "3").
  async existeNumero(numero: number): Promise<boolean> {
    const client = this.supabaseService.getClient();

    const { data, error } = await client
      .from('mesas')
      .select('id')
      .eq('numero', numero)
      .maybeSingle();

    if (error) {
      throw new Error('No se pudo verificar si el número de mesa ya existe.');
    }

    return !!data;
  }

  async crearMesa(datos: DatosNuevaMesa): Promise<Mesa> {
    const client = this.supabaseService.getClient();

    const id = crypto.randomUUID();
    const foto_url = await this.subirFoto(datos.fotoDataUrl, `mesa-${id}`);

  // El código QR usa el NÚMERO de mesa (formato "MESA_5"), no el id.
  // Así lo reconoce el QrScannerService que ya está armado para
  // el escaneo de mesas en los puntos 9-11.
    const qr_code = `MESA_${datos.numero}`;

    const { data: mesaCreada, error } = await client
      .from('mesas')
      .insert({
        id,
        numero: datos.numero,
        capacidad: datos.capacidad,
        tipo: datos.tipo,
        estado: 'libre',
        foto_url,
        qr_code,
      })
      .select()
      .single();

    if (error || !mesaCreada) {
      throw new Error(error?.message || 'No se pudo guardar la mesa en la base de datos.');
    }

  return mesaCreada as Mesa;
}

  // NUEVO para el punto 11: cuando el cliente escanea el QR de la mesa
  // (o el punto 10 lo asigna a una), necesitamos los datos completos
  // de esa mesa (capacidad, etc.) a partir de su número.
  async obtenerPorNumero(numero: number): Promise<Mesa> {
    const client = this.supabaseService.getClient();

    const { data, error } = await client
      .from('mesas')
      .select('*')
      .eq('numero', numero)
      .single();

    if (error || !data) {
      throw new Error(`No se encontró la mesa número ${numero}.`);
    }

    return data as Mesa;
  }

  // Como obtenerPorNumero pero a partir del id (lo usa la pantalla de
  // estado del pedido, que tiene el mesa_id del pedido, no el número).
  async obtenerPorId(id: string): Promise<Mesa> {
    const client = this.supabaseService.getClient();

    const { data, error } = await client
      .from('mesas')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new Error('No se encontró la mesa del pedido.');
    }

    return data as Mesa;
  }

  // Mismo mecanismo que ProductosService.subirFoto: convierte el dataUrl
  // (base64) que devuelve la cámara en un archivo real y lo sube a Storage.
  private async subirFoto(dataUrl: string, nombreArchivo: string): Promise<string> {
    const client = this.supabaseService.getClient();

    const respuesta = await fetch(dataUrl);
    const blob = await respuesta.blob();
    const extension = blob.type.split('/')[1] || 'jpeg';
    const ruta = `${nombreArchivo}.${extension}`;

    const { error: errorSubida } = await client.storage
      .from(BUCKET)
      .upload(ruta, blob, { contentType: blob.type });

    if (errorSubida) {
      throw new Error(`No se pudo subir la foto de la mesa: ${errorSubida.message}`);
    }

    const { data: urlPublica } = client.storage.from(BUCKET).getPublicUrl(ruta);
    return urlPublica.publicUrl;
  }

    // Trae todas las mesas para el listado, ordenadas por número.
  async listarMesas(): Promise<Mesa[]> {
    const client = this.supabaseService.getClient();

    const { data, error } = await client
      .from('mesas')
      .select('*')
      .order('numero', { ascending: true });

    if (error) {
      throw new Error('No se pudieron cargar las mesas.');
    }

    return (data ?? []) as Mesa[];
  }

  // Para la pantalla de asignación del metre (punto 10): sólo las
  // mesas libres, que son las únicas que se le pueden dar a alguien.
  async listarLibres(): Promise<Mesa[]> {
    const client = this.supabaseService.getClient();

    const { data, error } = await client
      .from('mesas')
      .select('*')
      .eq('estado', 'libre')
      .order('numero', { ascending: true });

    if (error) {
      throw new Error('No se pudieron cargar las mesas libres.');
    }

    return (data ?? []) as Mesa[];
  }

  // Para el panel del mozo (punto 11): las mesas con clientes sentados,
  // que son las que pueden tener una consulta activa.
  async listarOcupadas(): Promise<Mesa[]> {
    const client = this.supabaseService.getClient();

    const { data, error } = await client
      .from('mesas')
      .select('*')
      .eq('estado', 'ocupada')
      .order('numero', { ascending: true });

    if (error) {
      throw new Error('No se pudieron cargar las mesas ocupadas.');
    }

    return (data ?? []) as Mesa[];
  }

  // Punto 10: mesa que el metre le asignó a este cliente registrado
  // (la asignación "vigente", es decir sin fecha_fin). Devuelve null
  // si todavía no tiene ninguna. Se usa tanto para validar el QR que
  // escanea el cliente como para que no pueda "vincularse" a otra
  // mesa distinta de la suya.
  async obtenerMesaAsignadaA(
    id: string,
    esAnonimo = false,
  ): Promise<Mesa | null> {
    const client = this.supabaseService.getClient();

    const columna = esAnonimo ? 'cliente_anonimo_id' : 'cliente_id';

    const { data, error } = await conTimeout(
      client
        .from('asignaciones_mesa')
        .select('mesas(*)')
        .eq(columna, id)
        .is('fecha_fin', null)
        .order('fecha_inicio', { ascending: false })
        .limit(1)
        .maybeSingle(),
      8000,
    );

    if (error) {
      throw new Error('No se pudo verificar la mesa asignada.');
    }

    return (data?.['mesas'] as Mesa | undefined) ?? null;
  }

  // Punto 12 (sala de espera del cliente): escucha en vivo cuando el
  // metre le asigna una mesa a este cliente, para cambiar solo el
  // botón de "ESPERANDO MESA" a "REALIZAR PEDIDO" sin recargar.
  escucharAsignacionDe(
    clienteId: string,
    alAsignar: () => void,
  ): RealtimeChannel {
    const client = this.supabaseService.getClient();

    return client
      .channel(`asignacion-mesa-${clienteId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'asignaciones_mesa',
          filter: `cliente_id=eq.${clienteId}`,
        },
        () => alAsignar(),
      )
      .subscribe();
  }

  dejarDeEscuchar(canal: RealtimeChannel): void {
    this.supabaseService.getClient().removeChannel(canal);
  }

  // Cambia SOLO el estado (disponibilidad) de una mesa ya creada.
  async actualizarEstado(id: string, estado: EstadoMesa): Promise<void> {
    const client = this.supabaseService.getClient();

    const { error } = await client
      .from('mesas')
      .update({ estado })
      .eq('id', id);

    if (error) {
      throw new Error('No se pudo actualizar la disponibilidad de la mesa.');
    }

    // Al liberar la mesa termina el ciclo de esa ocupación: se borran
    // todas las conversaciones que tuvo (todos los hilos), así el
    // próximo comensal que se siente ahí arranca de cero, sin ver
    // charlas de gente que ya se fue.
    if (estado === 'libre') {
      await client.from('mensajes_mesa').delete().eq('mesa_id', id);
      await client.from('mesas_chat_leido').delete().eq('mesa_id', id);
      await client.from('juegos_resultados').delete().eq('mesa_id', id);
    }
  }
}