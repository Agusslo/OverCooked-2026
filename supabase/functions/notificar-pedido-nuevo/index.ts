// Edge Function: notificar-pedido-nuevo
// -------------------------------------------------------------
// Punto 12 del PDF: cuando el cliente termina el pedido, todos los
// mozos tienen que enterarse por push notification para poder
// confirmarlo (o rechazarlo, puntos 13/14).
//
// Esta función NO la llama el front — la dispara un Database
// Webhook de Supabase (Database → Webhooks) sobre INSERT en la
// tabla 'pedidos'. Mismo mecanismo que notificar-lista-espera.
//
// Variables de entorno: las mismas de Firebase que el resto de las
// funciones de push (FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY).

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enviarPush, firebaseConfigurado, json, obtenerAccessToken } from '../_shared/fcm.ts';

// A los mozos les avisamos cuando entra un pedido nuevo.
const PERFILES_A_NOTIFICAR = ['mozo'];

interface FilaPedido {
  id: string;
  mesa_id: string;
  estado: string;
  total: number;
}

interface PayloadWebhook {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: FilaPedido | null;
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

  const pedido = payload.record;

  // Sólo cuando el cliente terminó el pedido y espera confirmación
  // ('pendiente_mozo' es el valor inicial del enum estado_pedido).
  if (!pedido || pedido.estado !== 'pendiente_mozo') {
    console.log('[notificar-pedido-nuevo] omitido: estado no coincide.');
    return json({ ok: true, omitido: true }, 200);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return json({ error: 'Faltan variables de entorno de Supabase.' }, 500);
  }
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

  const { data: mesa } = await supabase
    .from('mesas')
    .select('numero')
    .eq('id', pedido.mesa_id)
    .single();

  const { data: filas, error } = await supabase
    .from('push_tokens')
    .select('token, usuarios!inner(perfil)')
    .in('usuarios.perfil', PERFILES_A_NOTIFICAR);

  if (error) {
    console.log('[notificar-pedido-nuevo] error consultando push_tokens:', error.message);
    return json({ error: 'No se pudieron obtener los tokens.', detalle: error.message }, 500);
  }

  const tokens = (filas ?? []).map((fila: { token: string }) => fila.token).filter(Boolean);

  if (tokens.length === 0) {
    console.log('[notificar-pedido-nuevo] no hay tokens para mozo.');
    return json({ ok: true, enviados: 0 }, 200);
  }

  let accessToken: string;
  try {
    accessToken = await obtenerAccessToken();
  } catch (err) {
    return json({ error: 'No se pudo autenticar contra Firebase.', detalle: String(err) }, 500);
  }

  const numeroMesa = mesa?.numero ?? '?';
  const resultados = await Promise.allSettled(
    tokens.map((token: string) =>
      enviarPush(accessToken, token, {
        title: 'Nuevo pedido para confirmar',
        body: `La mesa Nº ${numeroMesa} terminó su pedido ($${pedido.total}). Revisalo y confirmalo.`,
        data: { tipo: 'pedido-nuevo', pedidoId: pedido.id },
      }),
    ),
  );

  const enviados = resultados.filter((r) => r.status === 'fulfilled').length;
  const fallidos = resultados
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map((r) => String(r.reason));

  console.log('[notificar-pedido-nuevo] resultado envío FCM:', JSON.stringify({ enviados, fallidos }));

  return json({ ok: true, enviados, fallidos: fallidos.length, detalleFallidos: fallidos }, 200);
});
