// Edge Function: notificar-pedido-listo
// -------------------------------------------------------------
// Punto 18 del PDF: cocina y bar van marcando cada producto como
// listo (ver PedidosService.marcarItemListo). Cuando el último item
// pendiente de un pedido queda listo, un trigger en la base
// (ver supabase/sql/punto-18-setup.sql) pasa 'pedidos.estado' a
// 'listo' SOLO si ya están listos todos los items de los sectores
// intervinientes. A todos los mozos les llega el aviso por push para
// que vayan a retirar el pedido completo.
//
// Esta función NO la llama el front — la dispara un Database
// Webhook de Supabase (Database → Webhooks) sobre UPDATE en la
// tabla 'pedidos'. Mismo mecanismo que notificar-pedido-confirmado.
//
// Variables de entorno: las mismas de Firebase que el resto de las
// funciones de push (FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY).

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enviarPushLote, firebaseConfigurado, json, obtenerAccessToken } from '../_shared/fcm.ts';

interface FilaPedido {
  id: string;
  mesa_id: string;
  cliente_id: string | null;
  cliente_anonimo_id: string | null;
  estado: string;
  total: number;
}

interface PayloadWebhook {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: FilaPedido | null;
  old_record: FilaPedido | null;
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
  const anterior = payload.old_record;

  // Sólo cuando el pedido ACABA de pasar a 'listo' (no en cada UPDATE
  // de la tabla).
  if (!pedido || pedido.estado !== 'listo' || anterior?.estado === 'listo') {
    console.log('[notificar-pedido-listo] omitido: no aplica.');
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

  const numeroMesa = mesa?.numero ?? '?';

  // A TODOS los mozos, igual que notificar-mensaje-mesa: todavía no hay
  // un mozo asignado por mesa/pedido.
  const { data: mozos, error: errorMozos } = await supabase
    .from('usuarios')
    .select('id')
    .eq('perfil', 'mozo');

  if (errorMozos) {
    console.log('[notificar-pedido-listo] error consultando mozos:', errorMozos.message);
    return json({ error: 'No se pudieron obtener los mozos.', detalle: errorMozos.message }, 500);
  }

  const idsMozos = (mozos ?? []).map((m: { id: string }) => m.id);
  if (idsMozos.length === 0) {
    console.log('[notificar-pedido-listo] no hay ningún mozo registrado.');
    return json({ ok: true, enviados: 0 }, 200);
  }

  const { data: filas, error: errorTokens } = await supabase
    .from('push_tokens')
    .select('token')
    .in('usuario_id', idsMozos);

  if (errorTokens) {
    console.log('[notificar-pedido-listo] error consultando push_tokens:', errorTokens.message);
    return json({ error: 'No se pudieron obtener los tokens.', detalle: errorTokens.message }, 500);
  }

  const tokens = (filas ?? []).map((f: { token: string }) => f.token).filter(Boolean);
  if (tokens.length === 0) {
    console.log('[notificar-pedido-listo] ningún mozo tiene un dispositivo registrado.');
    return json({ ok: true, enviados: 0 }, 200);
  }

  let accessToken: string;
  try {
    accessToken = await obtenerAccessToken();
  } catch (err) {
    return json({ error: 'No se pudo autenticar contra Firebase.', detalle: String(err) }, 500);
  }

  const { enviados, fallidos } = await enviarPushLote(supabase, accessToken, tokens, {
    title: 'Pedido completo',
    body: `Mesa Nº ${numeroMesa}: cocina y bar ya terminaron, podés ir a retirarlo.`,
    data: { tipo: 'pedido-listo', pedidoId: pedido.id },
  });

  console.log('[notificar-pedido-listo] resultado envío FCM:', JSON.stringify({ enviados, fallidos }));

  return json({ ok: true, enviados, fallidos: fallidos.length, detalleFallidos: fallidos }, 200);
});
