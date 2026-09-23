// Edge Function: notificar-pedido-rechazado
// -------------------------------------------------------------
// Punto 13 del PDF: cuando el mozo rechaza el pedido, el cliente
// tiene que enterarse por push notification para poder modificarlo.
//
// Esta función NO la llama el front — la dispara un Database
// Webhook de Supabase (Database → Webhooks) sobre UPDATE en la
// tabla 'pedidos' (ver supabase/sql/punto-13-setup.sql).
//
// Mientras el cliente tiene la pantalla de estado del pedido
// abierta, el cambio ya le llega por Supabase Realtime
// (PedidosService.escucharPedido) sin depender de esta función: es
// el mismo patrón que puntos 6/7/8/10 (Realtime + push como refuerzo
// para cuando la app está en background o cerrada).
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
  motivo_rechazo: string | null;
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

  // Sólo cuando el pedido ACABA de pasar a 'rechazado' (no en cada
  // UPDATE de la tabla) y tiene cliente registrado: los clientes
  // anónimos no tienen fila en 'usuarios' ni token en 'push_tokens'.
  if (
    !pedido ||
    pedido.estado !== 'rechazado' ||
    anterior?.estado === 'rechazado' ||
    !pedido.cliente_id
  ) {
    console.log('[notificar-pedido-rechazado] omitido: no aplica.');
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
    .select('token')
    .eq('usuario_id', pedido.cliente_id);

  if (error) {
    console.log('[notificar-pedido-rechazado] error consultando push_tokens:', error.message);
    return json({ error: 'No se pudieron obtener los tokens.', detalle: error.message }, 500);
  }

  const tokens = (filas ?? []).map((fila: { token: string }) => fila.token).filter(Boolean);

  if (tokens.length === 0) {
    console.log('[notificar-pedido-rechazado] no hay tokens para este cliente.');
    return json({ ok: true, enviados: 0 }, 200);
  }

  let accessToken: string;
  try {
    accessToken = await obtenerAccessToken();
  } catch (err) {
    return json({ error: 'No se pudo autenticar contra Firebase.', detalle: String(err) }, 500);
  }

  const numeroMesa = mesa?.numero ?? '?';
  const { enviados, fallidos } = await enviarPushLote(supabase, accessToken, tokens, {
    title: 'El mozo rechazó tu pedido',
    body: pedido.motivo_rechazo
      ? `Mesa Nº ${numeroMesa}: ${pedido.motivo_rechazo}`
      : `Mesa Nº ${numeroMesa}: modificá tu pedido y volvé a enviarlo.`,
    data: { tipo: 'pedido-rechazado', pedidoId: pedido.id },
  });

  console.log('[notificar-pedido-rechazado] resultado envío FCM:', JSON.stringify({ enviados, fallidos }));

  return json({ ok: true, enviados, fallidos: fallidos.length, detalleFallidos: fallidos }, 200);
});
