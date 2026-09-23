// Edge Function: notificar-lista-espera
// -------------------------------------------------------------
// Punto 9 del PDF: cuando un cliente (anónimo o registrado)
// escanea el QR de ingreso y queda anotado en la lista de espera,
// el metre tiene que enterarse por push notification (además de
// verlo en /metre/lista-espera).
//
// Esta función NO la llama el front — la dispara un Database
// Webhook de Supabase (Database → Webhooks) sobre INSERT en la
// tabla 'lista_espera'. Mismo mecanismo que
// notificar-cliente-pendiente (punto 6), solo cambia la tabla
// origen y a quién se le avisa.
//
// Variables de entorno: las mismas que notificar-cliente-pendiente
// (FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY) — no hace
// falta configurarlas de nuevo si ya están cargadas para esa otra
// función, son las mismas credenciales de Firebase para todo el
// proyecto.

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enviarPushLote, firebaseConfigurado, json, obtenerAccessToken } from '../_shared/fcm.ts';

// Punto 9: al metre le avisamos cuando alguien se anota en la
// lista de espera.
const PERFILES_A_NOTIFICAR = ['metre'];

interface FilaListaEspera {
  id: string;
  nombre: string;
  estado: string;
}

interface PayloadWebhook {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: FilaListaEspera | null;
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

  const espera = payload.record;

  // Sólo nos interesa cuando alguien queda 'esperando' recién
  // anotado (el webhook está configurado para INSERT).
  if (!espera || espera.estado !== 'esperando') {
    console.log('[notificar-lista-espera] omitido: estado no coincide.');
    return json({ ok: true, omitido: true }, 200);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return json({ error: 'Faltan variables de entorno de Supabase.' }, 500);
  }
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

  // Tokens de los dispositivos con perfil 'metre'.
  const { data: filas, error } = await supabase
    .from('push_tokens')
    .select('token, usuarios!inner(perfil)')
    .in('usuarios.perfil', PERFILES_A_NOTIFICAR);

  if (error) {
    console.log('[notificar-lista-espera] error consultando push_tokens:', error.message);
    return json({ error: 'No se pudieron obtener los tokens.', detalle: error.message }, 500);
  }

  const tokens = (filas ?? []).map((fila: { token: string }) => fila.token).filter(Boolean);

  if (tokens.length === 0) {
    console.log('[notificar-lista-espera] no hay tokens para metre.');
    return json({ ok: true, enviados: 0 }, 200);
  }

  let accessToken: string;
  try {
    accessToken = await obtenerAccessToken();
  } catch (err) {
    return json({ error: 'No se pudo autenticar contra Firebase.', detalle: String(err) }, 500);
  }

  const { enviados, fallidos } = await enviarPushLote(supabase, accessToken, tokens, {
    title: 'Nuevo cliente en la lista de espera',
    body: `${espera.nombre} se anotó y está esperando para ingresar.`,
    data: { tipo: 'lista-espera', listaEsperaId: espera.id },
  });

  console.log('[notificar-lista-espera] resultado envío FCM:', JSON.stringify({ enviados, fallidos }));

  return json({ ok: true, enviados, fallidos: fallidos.length, detalleFallidos: fallidos }, 200);
});
