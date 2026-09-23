// Edge Function: notificar-cuenta
// -------------------------------------------------------------
// Puntos 21 y 22 del PDF. Manda push notifications en tres momentos:
//   1. El cliente pide la cuenta (pedidos.cuenta_solicitada pasa a true)
//      -> a TODOS los mozos.
//   2. El cliente realiza el pago simulado (INSERT en 'pagos')
//      -> a los mozos, al dueño y a los supervisores.
//   3. El mozo confirma el pago (pagos.confirmado_por_mozo pasa a true)
//      -> al dueño y a los supervisores.
//
// Esta función NO la llama el front: la dispara un trigger/Database
// Webhook de Supabase sobre 'pedidos' (UPDATE) y 'pagos' (INSERT/UPDATE),
// ver supabase/sql/punto-21-setup.sql y punto-22-setup.sql. Mismo mecanismo que
// notificar-pedido-listo.
//
// Variables de entorno: las mismas de Firebase que el resto de las
// funciones de push (FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY).

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enviarPushLote, firebaseConfigurado, json, obtenerAccessToken } from '../_shared/fcm.ts';

interface FilaPedido {
  id: string;
  mesa_id: string;
  cuenta_solicitada: boolean;
}

interface FilaPago {
  id: string;
  pedido_id: string;
  total: number;
}

interface PayloadWebhook {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return json({ error: 'Faltan variables de entorno de Supabase.' }, 500);
  }
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

  let pedidoId: string;
  let perfiles: string[];
  let titulo: string;
  let cuerpoTemplate: (numeroMesa: number | string) => string;
  let tipo: string;

  if (payload.table === 'pedidos' && payload.type === 'UPDATE') {
    const pedido = payload.record as FilaPedido | null;
    const anterior = payload.old_record as FilaPedido | null;

    // Sólo cuando la cuenta ACABA de pedirse (no en cada UPDATE del pedido).
    if (!pedido || !pedido.cuenta_solicitada || anterior?.cuenta_solicitada) {
      return json({ ok: true, omitido: true }, 200);
    }

    pedidoId = pedido.id;
    perfiles = ['mozo'];
    titulo = 'Cuenta solicitada';
    cuerpoTemplate = (mesa) => `La mesa Nº ${mesa} pidió la cuenta.`;
    tipo = 'cuenta-solicitada';
  } else if (payload.table === 'pagos' && payload.type === 'UPDATE') {
    // Punto 22: el mozo confirmó el pago -> aviso a dueño y supervisores.
    const pago = payload.record as (FilaPago & { confirmado_por_mozo: boolean }) | null;
    const anterior = payload.old_record as { confirmado_por_mozo: boolean } | null;

    if (!pago || !pago.confirmado_por_mozo || anterior?.confirmado_por_mozo) {
      return json({ ok: true, omitido: true }, 200);
    }

    pedidoId = pago.pedido_id;
    perfiles = ['dueño', 'supervisor'];
    titulo = 'Pago confirmado';
    cuerpoTemplate = (mesa) =>
      `El mozo confirmó el pago de la mesa Nº ${mesa} por $${pago.total}. La mesa quedó libre.`;
    tipo = 'pago-confirmado';
  } else if (payload.table === 'pagos' && payload.type === 'INSERT') {
    const pago = payload.record as FilaPago | null;
    if (!pago) {
      return json({ ok: true, omitido: true }, 200);
    }

    pedidoId = pago.pedido_id;
    perfiles = ['mozo', 'dueño', 'supervisor'];
    titulo = 'Pago realizado';
    cuerpoTemplate = (mesa) =>
      `La mesa Nº ${mesa} realizó el pago por $${pago.total}. Falta la confirmación del mozo.`;
    tipo = 'pago-realizado';
  } else {
    return json({ ok: true, omitido: true }, 200);
  }

  const { data: pedidoDb } = await supabase
    .from('pedidos')
    .select('mesa_id')
    .eq('id', pedidoId)
    .maybeSingle();

  const { data: mesa } = pedidoDb
    ? await supabase.from('mesas').select('numero').eq('id', pedidoDb.mesa_id).maybeSingle()
    : { data: null };

  const numeroMesa = mesa?.numero ?? '?';

  const { data: destinatarios, error: errorDest } = await supabase
    .from('usuarios')
    .select('id')
    .in('perfil', perfiles);

  if (errorDest) {
    console.log('[notificar-cuenta] error consultando usuarios:', errorDest.message);
    return json({ error: 'No se pudieron obtener los destinatarios.', detalle: errorDest.message }, 500);
  }

  const ids = (destinatarios ?? []).map((u: { id: string }) => u.id);
  if (ids.length === 0) {
    return json({ ok: true, enviados: 0 }, 200);
  }

  const { data: filas, error: errorTokens } = await supabase
    .from('push_tokens')
    .select('token')
    .in('usuario_id', ids);

  if (errorTokens) {
    console.log('[notificar-cuenta] error consultando push_tokens:', errorTokens.message);
    return json({ error: 'No se pudieron obtener los tokens.', detalle: errorTokens.message }, 500);
  }

  const tokens = (filas ?? []).map((f: { token: string }) => f.token).filter(Boolean);
  if (tokens.length === 0) {
    console.log('[notificar-cuenta] ningún destinatario tiene un dispositivo registrado.');
    return json({ ok: true, enviados: 0 }, 200);
  }

  let accessToken: string;
  try {
    accessToken = await obtenerAccessToken();
  } catch (err) {
    return json({ error: 'No se pudo autenticar contra Firebase.', detalle: String(err) }, 500);
  }

  const { enviados, fallidos } = await enviarPushLote(supabase, accessToken, tokens, {
    title: titulo,
    body: cuerpoTemplate(numeroMesa),
    data: { tipo, pedidoId, numeroMesa: String(numeroMesa) },
  });

  console.log('[notificar-cuenta] resultado envío FCM:', JSON.stringify({ enviados, fallidos }));

  return json({ ok: true, enviados, fallidos: fallidos.length, detalleFallidos: fallidos }, 200);
});
