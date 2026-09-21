// Edge Function: notificar-mensaje-mesa
// -------------------------------------------------------------
// Punto 11 del PDF: cuando un cliente (registrado o anónimo)
// manda un mensaje en el chat de su mesa, todos los mozos tienen
// que enterarse por push notification, incluso con la app cerrada.
//
// También cubre la mitad final de ese mismo punto: cuando un MOZO
// responde esa consulta, el cliente dueño del hilo tiene que
// enterarse por push. Los clientes anónimos nunca tienen push
// registrado (ver PERFILES_NOTIFICABLES en inicio.page.ts, que
// excluye 'anonimo'), así que para ellos esto no manda nada — el
// aviso les sigue llegando por Realtime en pantalla.
//
// Esta función NO la llama el front — la dispara un Database
// Webhook de Supabase (Database → Webhooks) sobre INSERT en la
// tabla 'mensajes_mesa' (el mismo webhook para ambas direcciones:
// el autor puede ser cliente/anonimo o mozo, y acá se distingue).
//
// Usa FCM HTTP v1 (OAuth2 con service account), igual que
// notificar-mesa-asignada y notificar-cliente-pendiente.
//
// Variables de entorno necesarias (ya configuradas para las otras
// funciones, se reutilizan):
//   FCM_PROJECT_ID            -> project_id del service account de Firebase
//   FCM_CLIENT_EMAIL          -> client_email del service account
//   FCM_PRIVATE_KEY           -> private_key del service account (PEM)
//   SUPABASE_URL              -> Inyectada automáticamente por Supabase
//   SUPABASE_SERVICE_ROLE_KEY -> Inyectada automáticamente por Supabase

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enviarPush, firebaseConfigurado, json, obtenerAccessToken } from '../_shared/fcm.ts';

interface FilaMensaje {
  id: string;
  mesa_id: string;
  hilo_cliente_id: string; // NUEVO
  autor_id: string;
  autor_nombre: string;
  autor_perfil: 'cliente' | 'anonimo' | 'mozo';
  contenido: string;
}

interface PayloadWebhook {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: FilaMensaje | null;
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'Método no permitido.' }, 405);
  }

  if (!firebaseConfigurado()) {
    return json({ error: 'Faltan variables de entorno de Firebase.' }, 500);
  }

  let payload: PayloadWebhook;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'El cuerpo debe ser JSON válido.' }, 400);
  }

  const mensaje = payload.record;

  if (!mensaje) {
    console.log('[notificar-mensaje-mesa] omitido: sin registro.');
    return json({ ok: true, omitido: true }, 200);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return json({ error: 'Faltan variables de entorno de Supabase.' }, 500);
  }
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

  const { data: mesa, error: errorMesa } = await supabase
    .from('mesas')
    .select('numero')
    .eq('id', mensaje.mesa_id)
    .single();

  if (errorMesa || !mesa) {
    console.log('[notificar-mensaje-mesa] error consultando la mesa:', errorMesa?.message);
    return json({ error: 'No se pudo obtener la mesa del mensaje.' }, 500);
  }

  // El mozo respondió: le avisamos sólo al cliente dueño del hilo (no
  // a los demás mozos, que ya vieron la respuesta en su propia pantalla).
  if (mensaje.autor_perfil === 'mozo') {
    const { data: filas, error: errorTokens } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('usuario_id', mensaje.hilo_cliente_id);

    if (errorTokens) {
      console.log('[notificar-mensaje-mesa] error consultando push_tokens del cliente:', errorTokens.message);
      return json({ error: 'No se pudieron obtener los tokens.', detalle: errorTokens.message }, 500);
    }

    const tokens = (filas ?? []).map((fila: { token: string }) => fila.token).filter(Boolean);

    if (tokens.length === 0) {
      // Esperable si el hilo es de un cliente anónimo (nunca registra
      // push) o si el cliente registrado no tiene el dispositivo dado
      // de alta todavía.
      console.log('[notificar-mensaje-mesa] el cliente no tiene ningún dispositivo registrado.');
      return json({ ok: true, enviados: 0 }, 200);
    }

    let accessToken: string;
    try {
      accessToken = await obtenerAccessToken();
    } catch (err) {
      return json({ error: 'No se pudo autenticar contra Firebase.', detalle: String(err) }, 500);
    }

    const resultados = await Promise.allSettled(
      tokens.map((token: string) =>
        enviarPush(accessToken, token, {
          title: `Mesa ${mesa.numero} · ${mensaje.autor_nombre}`,
          body: mensaje.contenido,
          data: {
            tipo: 'respuesta-mozo',
            numeroMesa: String(mesa.numero),
          },
        }),
      ),
    );

    const enviados = resultados.filter((r) => r.status === 'fulfilled').length;
    const fallidos = resultados
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r) => String(r.reason));

    console.log('[notificar-mensaje-mesa] resultado envío FCM (a cliente):', JSON.stringify({ enviados, fallidos }));

    return json({ ok: true, enviados, fallidos: fallidos.length, detalleFallidos: fallidos }, 200);
  }

  // El que escribió fue un cliente (registrado o anónimo): le avisamos
  // a TODOS los mozos. Primero traemos sus ids, y con eso sus tokens.
  const { data: mozos, error: errorMozos } = await supabase
    .from('usuarios')
    .select('id')
    .eq('perfil', 'mozo');

  if (errorMozos) {
    console.log('[notificar-mensaje-mesa] error consultando mozos:', errorMozos.message);
    return json({ error: 'No se pudieron obtener los mozos.', detalle: errorMozos.message }, 500);
  }

  const idsMozos = (mozos ?? []).map((m: { id: string }) => m.id);

  if (idsMozos.length === 0) {
    console.log('[notificar-mensaje-mesa] no hay ningún mozo registrado.');
    return json({ ok: true, enviados: 0 }, 200);
  }

  const { data: filas, error: errorTokens } = await supabase
    .from('push_tokens')
    .select('token')
    .in('usuario_id', idsMozos);

  if (errorTokens) {
    console.log('[notificar-mensaje-mesa] error consultando push_tokens:', errorTokens.message);
    return json({ error: 'No se pudieron obtener los tokens.', detalle: errorTokens.message }, 500);
  }

  const tokens = (filas ?? []).map((fila: { token: string }) => fila.token).filter(Boolean);

  if (tokens.length === 0) {
    console.log('[notificar-mensaje-mesa] ningún mozo tiene un dispositivo registrado.');
    return json({ ok: true, enviados: 0 }, 200);
  }

  let accessToken: string;
  try {
    accessToken = await obtenerAccessToken();
  } catch (err) {
    return json({ error: 'No se pudo autenticar contra Firebase.', detalle: String(err) }, 500);
  }

  const resultados = await Promise.allSettled(
    tokens.map((token: string) =>
      enviarPush(accessToken, token, {
        title: `Mesa ${mesa.numero} · ${mensaje.autor_nombre}`,
        body: mensaje.contenido,
        data: {
          tipo: 'mensaje-mesa',
          numeroMesa: String(mesa.numero),
          hiloClienteId: mensaje.hilo_cliente_id,
        },
      }),
    ),
  );

  const enviados = resultados.filter((r) => r.status === 'fulfilled').length;
  const fallidos = resultados
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map((r) => String(r.reason));

  console.log('[notificar-mensaje-mesa] resultado envío FCM:', JSON.stringify({ enviados, fallidos }));

  return json({ ok: true, enviados, fallidos: fallidos.length, detalleFallidos: fallidos }, 200);
});
