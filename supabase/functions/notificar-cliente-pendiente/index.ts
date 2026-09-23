// Edge Function: notificar-cliente-pendiente
// -------------------------------------------------------------
// Punto 6 del PDF: cuando un cliente se registra y queda
// 'pendiente de aprobación', dueño/supervisor tienen que
// enterarse por push notification (además del listado en
// admin/clientes-pendientes).
//
// Esta función NO la llama el front — la dispara un Database
// Webhook de Supabase configurado en el dashboard (Database →
// Webhooks) sobre INSERT en la tabla 'usuarios'. Ver CAMBIAR.md
// para la configuración del webhook, la tabla 'push_tokens' y
// las credenciales de Firebase Cloud Messaging que hacen falta.
//
// Usa FCM HTTP v1 (OAuth2 con service account) porque Google dio
// de baja la API legacy (fcm.googleapis.com/fcm/send + server key).
//
// Variables de entorno necesarias (supabase secrets set ...):
//   FCM_PROJECT_ID            -> project_id del service account de Firebase
//   FCM_CLIENT_EMAIL          -> client_email del service account
//   FCM_PRIVATE_KEY           -> private_key del service account (PEM)
//   SUPABASE_URL              -> Inyectada automáticamente por Supabase
//   SUPABASE_SERVICE_ROLE_KEY -> Inyectada automáticamente por Supabase

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enviarPushLote, firebaseConfigurado, json, obtenerAccessToken } from '../_shared/fcm.ts';

// Perfiles que tienen que enterarse de un cliente nuevo pendiente
// (los mismos que ven la pantalla clientes-pendientes en el front).
const PERFILES_A_NOTIFICAR = ['dueño', 'supervisor'];

interface FilaUsuario {
  id: string;
  nombre: string;
  apellido: string;
  perfil: string;
  estado: string;
}

interface PayloadWebhook {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: FilaUsuario | null;
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

  const cliente = payload.record;

  // Sólo nos interesa el alta de un cliente que arranca pendiente
  // (el webhook está configurado para INSERT, pero validamos igual
  // por si algún día se agrega también UPDATE).
  if (!cliente || cliente.perfil !== 'cliente' || cliente.estado !== 'pendiente') {
    console.log('[notificar-cliente-pendiente] omitido: perfil/estado no coinciden.');
    return json({ ok: true, omitido: true }, 200);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return json({ error: 'Faltan variables de entorno de Supabase.' }, 500);
  }
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

  // Tokens de los dispositivos de dueño/supervisor (ver CAMBIAR.md
  // para la tabla push_tokens).
  const { data: filas, error } = await supabase
    .from('push_tokens')
    .select('token, usuarios!inner(perfil)')
    .in('usuarios.perfil', PERFILES_A_NOTIFICAR);

  if (error) {
    console.log('[notificar-cliente-pendiente] error consultando push_tokens:', error.message);
    return json({ error: 'No se pudieron obtener los tokens.', detalle: error.message }, 500);
  }

  const tokens = (filas ?? []).map((fila: { token: string }) => fila.token).filter(Boolean);

  if (tokens.length === 0) {
    console.log('[notificar-cliente-pendiente] no hay tokens para dueño/supervisor.');
    return json({ ok: true, enviados: 0 }, 200);
  }

  let accessToken: string;
  try {
    accessToken = await obtenerAccessToken();
  } catch (err) {
    return json({ error: 'No se pudo autenticar contra Firebase.', detalle: String(err) }, 500);
  }

  const { enviados, fallidos } = await enviarPushLote(supabase, accessToken, tokens, {
    title: 'Nuevo cliente pendiente de aprobación',
    body: `${cliente.apellido}, ${cliente.nombre} se registró y está esperando aprobación.`,
    data: { tipo: 'cliente-pendiente', clienteId: cliente.id },
  });

  console.log('[notificar-cliente-pendiente] resultado envío FCM:', JSON.stringify({ enviados, fallidos }));

  return json({ ok: true, enviados, fallidos: fallidos.length, detalleFallidos: fallidos }, 200);
});
