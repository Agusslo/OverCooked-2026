// Edge Function: notificar-pedido-confirmado
// -------------------------------------------------------------
// Punto 14 del PDF: cuando el mozo confirma el pedido, éste queda
// derivado a los sectores correspondientes (cocina y/o bar, según el
// 'sector' que ya tiene guardado cada pedido_item desde que se creó,
// punto 12). Cocina/bar tienen que enterarse por push notification, y
// también avisamos al cliente que su pedido ya fue derivado.
//
// Esta función NO la llama el front — la dispara un Database
// Webhook de Supabase (Database → Webhooks) sobre UPDATE en la
// tabla 'pedidos' (ver supabase/sql/punto-14-setup.sql). Mismo
// mecanismo que notificar-pedido-nuevo/notificar-pedido-rechazado.
//
// Variables de entorno: las mismas de Firebase que el resto de las
// funciones de push (FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY).

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enviarPushLote, firebaseConfigurado, json, obtenerAccessToken } from '../_shared/fcm.ts';

// Sector del producto -> perfil que tiene que enterarse en ese sector.
const PERFIL_POR_SECTOR: Record<string, string> = {
  cocina: 'cocinero',
  bar: 'cantinero',
};

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

  // Sólo cuando el pedido ACABA de pasar a 'confirmado' (no en cada
  // UPDATE de la tabla).
  if (!pedido || pedido.estado !== 'confirmado' || anterior?.estado === 'confirmado') {
    console.log('[notificar-pedido-confirmado] omitido: no aplica.');
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

  const { data: items, error: errorItems } = await supabase
    .from('pedido_items')
    .select('sector')
    .eq('pedido_id', pedido.id);

  if (errorItems) {
    console.log('[notificar-pedido-confirmado] error consultando pedido_items:', errorItems.message);
    return json({ error: 'No se pudo leer el detalle del pedido.', detalle: errorItems.message }, 500);
  }

  const filasItems = (items ?? []) as { sector: string }[];
  const sectores: string[] = [...new Set(filasItems.map((i) => i.sector))];
  const numeroMesa = mesa?.numero ?? '?';

  let accessToken: string;
  try {
    accessToken = await obtenerAccessToken();
  } catch (err) {
    return json({ error: 'No se pudo autenticar contra Firebase.', detalle: String(err) }, 500);
  }

  let enviados = 0;
  const fallidos: string[] = [];

  // Un push por sector derivado, sólo al personal de ese sector.
  for (const sector of sectores) {
    const perfil = PERFIL_POR_SECTOR[sector];
    if (!perfil) continue;

    // En dos pasos (ids y después tokens) porque push_tokens.usuario_id
    // referencia auth.users (también hay invitados), no 'usuarios', y no
    // se puede embeber.
    const { data: personal, error: errorPersonal } = await supabase
      .from('usuarios')
      .select('id')
      .eq('perfil', perfil);

    if (errorPersonal) {
      console.log(`[notificar-pedido-confirmado] error consultando usuarios (${sector}):`, errorPersonal.message);
      continue;
    }

    const ids = (personal ?? []).map((u: { id: string }) => u.id);
    if (ids.length === 0) continue;

    const { data: filas, error } = await supabase
      .from('push_tokens')
      .select('token')
      .in('usuario_id', ids);

    if (error) {
      console.log(`[notificar-pedido-confirmado] error consultando push_tokens (${sector}):`, error.message);
      continue;
    }

    const tokens = (filas ?? []).map((f: { token: string }) => f.token).filter(Boolean);
    const resultado = await enviarPushLote(supabase, accessToken, tokens, {
      title: 'Pedido confirmado para tu sector',
      body: `Mesa Nº ${numeroMesa}: el mozo confirmó el pedido, ya lo tenés para preparar.`,
      data: { tipo: 'pedido-confirmado-sector', pedidoId: pedido.id, sector },
    });
    enviados += resultado.enviados;
    fallidos.push(...resultado.fallidos);
  }

  // Aviso al cliente (registrado o invitado: el id del invitado es el de
  // su sesión anónima de Auth): su pedido ya fue derivado y ya puede
  // entrar a la sección de juegos.
  const destinatarioCliente = pedido.cliente_id ?? pedido.cliente_anonimo_id;
  if (destinatarioCliente) {
    const { data: filasCliente, error: errorCliente } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('usuario_id', destinatarioCliente);

    if (errorCliente) {
      console.log('[notificar-pedido-confirmado] error consultando push_tokens del cliente:', errorCliente.message);
    } else {
      const tokensCliente = (filasCliente ?? []).map((f: { token: string }) => f.token).filter(Boolean);
      const resultado = await enviarPushLote(supabase, accessToken, tokensCliente, {
        title: 'Confirmaron tu pedido',
        body: `Mesa Nº ${numeroMesa}: tu pedido ya se envió a cocina/bar. Mientras esperás, ¡probá los juegos!`,
        data: { tipo: 'pedido-confirmado', pedidoId: pedido.id },
      });
      enviados += resultado.enviados;
      fallidos.push(...resultado.fallidos);
    }
  }

  console.log('[notificar-pedido-confirmado] resultado envío FCM:', JSON.stringify({ enviados, fallidos }));

  return json({ ok: true, enviados, fallidos: fallidos.length, detalleFallidos: fallidos }, 200);
});
