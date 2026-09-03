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

const FCM_PROJECT_ID = Deno.env.get('FCM_PROJECT_ID') ?? '';
const FCM_CLIENT_EMAIL = Deno.env.get('FCM_CLIENT_EMAIL') ?? '';
// Los secrets suelen guardar los saltos de línea del PEM como "\n"
// literal (dos caracteres) en vez de un salto de línea real.
const FCM_PRIVATE_KEY = (Deno.env.get('FCM_PRIVATE_KEY') ?? '').replace(/\\n/g, '\n');

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const FCM_TOKEN_URL = 'https://oauth2.googleapis.com/token';

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

  if (!FCM_PROJECT_ID || !FCM_CLIENT_EMAIL || !FCM_PRIVATE_KEY) {
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
    return json({ error: 'No se pudieron obtener los tokens.', detalle: error.message }, 500);
  }

  const tokens = (filas ?? []).map((fila: { token: string }) => fila.token).filter(Boolean);

  if (tokens.length === 0) {
    return json({ ok: true, enviados: 0 }, 200);
  }

  let accessToken: string;
  try {
    accessToken = await obtenerAccessToken();
  } catch (err) {
    return json({ error: 'No se pudo autenticar contra Firebase.', detalle: String(err) }, 500);
  }

  // La API v1 no soporta multicast (registration_ids): hay que mandar
  // un request por token.
  const resultados = await Promise.allSettled(
    tokens.map((token: string) => enviarPush(accessToken, token, cliente)),
  );

  const enviados = resultados.filter((r) => r.status === 'fulfilled').length;
  const fallidos = resultados
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map((r) => String(r.reason));

  return json({ ok: true, enviados, fallidos: fallidos.length, detalleFallidos: fallidos }, 200);
});

async function enviarPush(accessToken: string, token: string, cliente: FilaUsuario): Promise<void> {
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
          notification: {
            title: 'Nuevo cliente pendiente de aprobación',
            body: `${cliente.apellido}, ${cliente.nombre} se registró y está esperando aprobación.`,
          },
          data: {
            tipo: 'cliente-pendiente',
            clienteId: cliente.id,
          },
        },
      }),
    },
  );

  if (!resp.ok) {
    const detalle = await resp.text();
    throw new Error(`FCM rechazó el envío a un token: ${detalle}`);
  }
}

// --- Autenticación OAuth2 con service account (JWT Bearer flow) ---
// https://developers.google.com/identity/protocols/oauth2/service-account

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
