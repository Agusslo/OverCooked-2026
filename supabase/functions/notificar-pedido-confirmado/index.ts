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

const FCM_PROJECT_ID = Deno.env.get('FCM_PROJECT_ID') ?? '';
const FCM_CLIENT_EMAIL = Deno.env.get('FCM_CLIENT_EMAIL') ?? '';
const FCM_PRIVATE_KEY = (Deno.env.get('FCM_PRIVATE_KEY') ?? '').replace(/\\n/g, '\n');

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const FCM_TOKEN_URL = 'https://oauth2.googleapis.com/token';

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

  if (!FCM_PROJECT_ID || !FCM_CLIENT_EMAIL || !FCM_PRIVATE_KEY) {
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
  console.log('[notificar-pedido-confirmado] payload recibido:', JSON.stringify(payload));

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

    const { data: filas, error } = await supabase
      .from('push_tokens')
      .select('token, usuarios!inner(perfil)')
      .eq('usuarios.perfil', perfil);

    if (error) {
      console.log(`[notificar-pedido-confirmado] error consultando push_tokens (${sector}):`, error.message);
      continue;
    }

    const tokens = (filas ?? []).map((f: { token: string }) => f.token).filter(Boolean);
    const resultados = await Promise.allSettled(
      tokens.map((token: string) =>
        enviarPush(accessToken, token, {
          title: 'Pedido confirmado para tu sector',
          body: `Mesa Nº ${numeroMesa}: el mozo confirmó el pedido, ya lo tenés para preparar.`,
          data: { tipo: 'pedido-confirmado-sector', pedidoId: pedido.id, sector },
        }),
      ),
    );
    enviados += resultados.filter((r) => r.status === 'fulfilled').length;
    fallidos.push(
      ...resultados
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map((r) => String(r.reason)),
    );
  }

  // Aviso al cliente (si es un cliente registrado, no invitado): su
  // pedido ya fue derivado y ya puede entrar a la sección de juegos.
  if (pedido.cliente_id) {
    const { data: filasCliente, error: errorCliente } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('usuario_id', pedido.cliente_id);

    if (errorCliente) {
      console.log('[notificar-pedido-confirmado] error consultando push_tokens del cliente:', errorCliente.message);
    } else {
      const tokensCliente = (filasCliente ?? []).map((f: { token: string }) => f.token).filter(Boolean);
      const resultados = await Promise.allSettled(
        tokensCliente.map((token: string) =>
          enviarPush(accessToken, token, {
            title: 'Confirmaron tu pedido',
            body: `Mesa Nº ${numeroMesa}: tu pedido ya se envió a cocina/bar. Mientras esperás, ¡probá los juegos!`,
            data: { tipo: 'pedido-confirmado', pedidoId: pedido.id },
          }),
        ),
      );
      enviados += resultados.filter((r) => r.status === 'fulfilled').length;
      fallidos.push(
        ...resultados
          .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
          .map((r) => String(r.reason)),
      );
    }
  }

  console.log('[notificar-pedido-confirmado] resultado envío FCM:', JSON.stringify({ enviados, fallidos }));

  return json({ ok: true, enviados, fallidos: fallidos.length, detalleFallidos: fallidos }, 200);
});

async function enviarPush(
  accessToken: string,
  token: string,
  mensaje: { title: string; body: string; data: Record<string, string> },
): Promise<void> {
  const resp = await fetch(
    `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: mensaje.title, body: mensaje.body },
          data: mensaje.data,
        },
      }),
    },
  );

  if (!resp.ok) {
    const detalle = await resp.text();
    throw new Error(`FCM rechazó el envío a un token: ${detalle}`);
  }
}

// --- Autenticación OAuth2 con service account (idéntico a las otras funciones) ---

async function obtenerAccessToken(): Promise<string> {
  const ahora = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: FCM_CLIENT_EMAIL,
    scope: FCM_SCOPE,
    aud: FCM_TOKEN_URL,
    iat: ahora,
    exp: ahora + 3600,
  };

  const encoder = new TextEncoder();
  const encabezadoB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const claimsB64 = base64UrlEncode(encoder.encode(JSON.stringify(claims)));
  const entrada = `${encabezadoB64}.${claimsB64}`;

  const clavePrivada = await importarClavePrivada(FCM_PRIVATE_KEY);
  const firma = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    clavePrivada,
    encoder.encode(entrada),
  );
  const jwt = `${entrada}.${base64UrlEncode(new Uint8Array(firma))}`;

  const resp = await fetch(FCM_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!resp.ok) {
    throw new Error(`Google rechazó el JWT: ${await resp.text()}`);
  }

  const datos = await resp.json();
  return datos.access_token as string;
}

async function importarClavePrivada(pem: string): Promise<CryptoKey> {
  const cuerpoPem = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const bytes = Uint8Array.from(atob(cuerpoPem), (c) => c.charCodeAt(0));

  return crypto.subtle.importKey(
    'pkcs8',
    bytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binario = '';
  for (const byte of bytes) {
    binario += String.fromCharCode(byte);
  }
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function json(cuerpo: unknown, status: number): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
