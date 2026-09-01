import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Mesa, TipoMesa } from '../models/mesa.model';

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
  constructor(private supabaseService: SupabaseService) {}

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

    // Generamos el id ACÁ, en el teléfono, antes de guardar nada.
    // Así podemos mandar 'id' y 'qr_code' con el mismo valor en un solo
    // insert, en vez de crear la mesa y después hacer un segundo viaje
    // a la base para agregarle el QR.
    const id = crypto.randomUUID();

    const foto_url = await this.subirFoto(datos.fotoDataUrl, `mesa-${id}`);

    const { data: mesaCreada, error } = await client
      .from('mesas')
      .insert({
        id,
        numero: datos.numero,
        capacidad: datos.capacidad,
        tipo: datos.tipo,
        estado: 'libre', // "vacía" en el PDF = 'libre' en la base, por defecto
        foto_url,
        qr_code: id,
      })
      .select()
      .single();

    if (error || !mesaCreada) {
      throw new Error(error?.message || 'No se pudo guardar la mesa en la base de datos.');
    }

    return mesaCreada as Mesa;
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
}