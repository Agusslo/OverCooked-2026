// Corta una promesa que no responde en 'ms' milisegundos, para que nunca
// se quede colgada para siempre (le pasó al WebView de Android más de una
// vez con llamadas a Supabase justo después de otra, por ejemplo justo
// después de un signIn/signInAnonymously).
export function conTimeout<T>(
  promesa: PromiseLike<T>,
  ms = 8000,
  mensaje = 'La conexión tardó demasiado, probá de nuevo.',
): Promise<T> {
  return Promise.race([
    Promise.resolve(promesa),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(mensaje)), ms)),
  ]);
}
