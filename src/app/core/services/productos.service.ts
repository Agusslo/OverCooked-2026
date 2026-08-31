import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Producto, TipoProducto, SectorProducto } from '../models/producto.model';

export interface DatosNuevoProducto {
  nombre: string;
  descripcion: string;
  tiempoElaboracion: number; // minutos
  precio: number;
  tipo: TipoProducto;
  sector: SectorProducto;
  // Las 3 fotos llegan como dataUrl (base64), igual que en alta-empleado,
  // porque así es como Capacitor Camera devuelve la imagen apenas se
  // toma o se elige de la galería. Acá es donde las subimos de verdad.
  fotosDataUrl: [string, string, string];
}

const BUCKET = 'productos-fotos';

@Injectable({
  providedIn: 'root',
})
export class ProductosService {
  constructor(private supabaseService: SupabaseService) {}

  // "Se verifica la existencia en la carta (menú)": antes de guardar,
  // chequeamos que no haya ya un producto con ese nombre (sin importar
  // mayúsculas/minúsculas) para no duplicar platos por error de carga.
  async existeEnCarta(nombre: string): Promise<boolean> {
    const client = this.supabaseService.getClient();

    const { data, error } = await client
      .from('productos')
      .select('id')
      .ilike('nombre', nombre.trim())
      .maybeSingle();

    if (error) {
      throw new Error('No se pudo verificar si el producto ya existe en la carta.');
    }

    return !!data;
  }

  async crearProducto(datos: DatosNuevoProducto): Promise<Producto> {
    const client = this.supabaseService.getClient();

    // Subimos las 3 fotos en paralelo (no una atrás de la otra) para no
    // hacer esperar de más al usuario. Si alguna falla, cortamos acá:
    // no tiene sentido guardar el producto con fotos a medias.
    const [foto_url, foto_url_2, foto_url_3] = await Promise.all(
      datos.fotosDataUrl.map((dataUrl, indice) =>
        this.subirFoto(dataUrl, `${datos.tipo}-${Date.now()}-${indice}`)
      )
    );

    const { data: productoCreado, error } = await client
      .from('productos')
      .insert({
        nombre: datos.nombre,
        descripcion: datos.descripcion,
        tiempo_elaboracion_minutos: datos.tiempoElaboracion,
        precio: datos.precio,
        tipo: datos.tipo,
        sector: datos.sector,
        disponible: true,
        foto_url,
        foto_url_2,
        foto_url_3,
      })
      .select()
      .single();

    if (error || !productoCreado) {
      throw new Error(error?.message || 'No se pudo guardar el producto en la base de datos.');
    }

    return productoCreado as Producto;
  }

  // Convierte el dataUrl (base64) que devuelve la cámara/galería en un
  // archivo real, lo sube al bucket de Storage, y devuelve la URL pública
  // para guardar en la tabla. Es lo mismo para las 3 fotos, por eso está
  // separado en su propio método.
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
      throw new Error(`No se pudo subir una de las fotos: ${errorSubida.message}`);
    }

    const { data: urlPublica } = client.storage.from(BUCKET).getPublicUrl(ruta);
    return urlPublica.publicUrl;
  }
}