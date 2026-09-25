// Edge Function: notificar-mesa-asignada
// -------------------------------------------------------------
// Punto 10 del PDF: cuando el metre le asigna una mesa a un
// cliente registrado, ese cliente tiene que enterarse por push
// notification para ir a escanear el QR de su mesa.
//
// Esta función NO la llama el front — la dispara un Database
// Webhook de Supabase (Database → Webhooks) sobre INSERT en la
// tabla 'asignaciones_mesa'.
//
// Usa FCM HTTP v1 (OAuth2 con service account), igual que
// notificar-cliente-pendiente.
//
// Variables de entorno necesarias (ya configuradas para la otra
// función, se reutilizan):
//   FCM_PROJECT_ID            -> project_id del service account de Firebase
//   FCM_CLIENT_EMAIL          -> client_email del service account
//   FCM_PRIVATE_KEY           -> private_key del service account (PEM)
//   SUPABASE_URL              -> Inyectada automáticamente por Supabase
//   SUPABASE_SERVICE_ROLE_KEY -> Inyectada automáticamente por Supabase

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enviarPushLote, firebaseConfigurado, json, obtenerAccessToken } from '../_shared/fcm.ts';

interface FilaAsignacion {
  id: string;
  mesa_id: string;
  cliente_id: string | null;
  cliente_anonimo_id: string | null;
  lista_espera_id: string | null;
}

interface PayloadWebhook {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: FilaAsignacion | null;
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

  const asignacion = payload.record;
  // Cliente registrado o invitado: push_tokens.usuario_id referencia
  // auth.users, y el id del invitado (clientes_anonimos.id) es el de su
  // sesión anónima de Auth.
  const destinatario = asignacion?.cliente_id ?? asignacion?.cliente_anonimo_id ?? null;

  if (!asignacion || !destinatario) {
    console.log('[notificar-mesa-asignada] omitido: la asignación no tiene cliente.');
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
    .eq('id', asignacion.mesa_id)
    .single();

  if (errorMesa || !mesa) {
    console.log('[notificar-mesa-asignada] error consultando la mesa:', errorMesa?.message);
    return json({ error: 'No se pudo obtener la mesa asignada.' }, 500);
  }

  const { data: filas, error: errorTokens } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('usuario_id', destinatario);

  if (errorTokens) {
    console.log('[notificar-mesa-asignada] error consultando push_tokens:', errorTokens.message);
    return json({ error: 'No se pudieron obtener los tokens.', detalle: errorTokens.message }, 500);
  }

  const tokens = (filas ?? []).map((fila: { token: string }) => fila.token).filter(Boolean);

  if (tokens.length === 0) {
    console.log('[notificar-mesa-asignada] el cliente no tiene ningún dispositivo registrado.');
    return json({ ok: true, enviados: 0 }, 200);
  }

  let accessToken: string;
  try {
    accessToken = await obtenerAccessToken();
  } catch (err) {
    return json({ error: 'No se pudo autenticar contra Firebase.', detalle: String(err) }, 500);
  }

  const { enviados, fallidos } = await enviarPushLote(supabase, accessToken, tokens, {
    title: 'Tu mesa está lista',
    body: `Se te asignó la mesa Nº ${mesa.numero}. Escaneá su código QR para entrar.`,
    data: { tipo: 'mesa-asignada', numeroMesa: String(mesa.numero) },
  });

  console.log('[notificar-mesa-asignada] resultado envío FCM:', JSON.stringify({ enviados, fallidos }));

  return json({ ok: true, enviados, fallidos: fallidos.length, detalleFallidos: fallidos }, 200);
});
