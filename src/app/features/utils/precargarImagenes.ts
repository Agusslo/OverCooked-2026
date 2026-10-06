// Precarga de fotos remotas (Storage de Supabase) en la caché del
// navegador, para que al cambiar de plato o rotar la foto la imagen ya
// esté descargada y no se espere el viaje al servidor.

// Se guardan las <img> creadas para no pedir dos veces la misma URL y
// para que el navegador no descarte la descarga antes de terminar.
const precargadas = new Map<string, HTMLImageElement>();

/**
 * Pide al navegador las imágenes indicadas (ignora vacías y repetidas).
 */
export function precargarImagenes(urls: (string | null | undefined)[]): void {
  for (const url of urls) {
    if (!url || precargadas.has(url)) continue;
    const imagen = new Image();
    imagen.decoding = 'async';
    imagen.src = url;
    precargadas.set(url, imagen);
    // decode() deja la imagen ya decodificada: al ponerla en el <img> no
    // queda un cuadro vacío mientras se procesa. Si la descarga falla se
    // saca del mapa para que la próxima precarga la vuelva a intentar.
    imagen.decode?.().catch(() => precargadas.delete(url));
  }
}
