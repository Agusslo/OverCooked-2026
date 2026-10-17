// Módulo compartido por las Edge Functions de push notification.
// -------------------------------------------------------------
// Concentra la autenticación OAuth2 (service account de Firebase)
// y el envío por FCM HTTP v1, que antes estaba copiado en cada
// función notificar-*. Un fix acá aplica a todas.
//
// Variables de entorno necesarias (supabase secrets set ...):
//   FCM_PROJECT_ID    -> project_id del service account de Firebase
//   FCM_CLIENT_EMAIL  -> client_email del service account
//   FCM_PRIVATE_KEY   -> private_key del service account (PEM)
//
// Usa FCM HTTP v1 (OAuth2 con service account) porque Google dio
// de baja la API legacy (fcm.googleapis.com/fcm/send + server key).
//
// enviarPushLote() además borra de push_tokens cualquier token que
// FCM rechace como NotRegistered/UNREGISTERED (app desinstalada,
// token vencido, datos borrados): sin esto la tabla sólo crece y
// cada notificación reintenta para siempre contra tokens muertos.

const FCM_PROJECT_ID = Deno.env.get('FCM_PROJECT_ID') ?? '';
const FCM_CLIENT_EMAIL = Deno.env.get('FCM_CLIENT_EMAIL') ?? '';
// Los secrets suelen guardar los saltos de línea del PEM como "\n"
// literal (dos caracteres) en vez de un salto de línea real.
const FCM_PRIVATE_KEY = (Deno.env.get('FCM_PRIVATE_KEY') ?? '').replace(/\\n/g, '\n');

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const FCM_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export interface MensajePush {
  title: string;
  body: string;
  data: Record<string, string>;
}

export function firebaseConfigurado(): boolean {
  return Boolean(FCM_PROJECT_ID && FCM_CLIENT_EMAIL && FCM_PRIVATE_KEY);
}

// La API v1 no soporta multicast (registration_ids): hay que mandar
// un request por token.
export async function enviarPush(
  accessToken: string,
  token: string,
  mensaje: MensajePush,
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

// Cliente mínimo (sólo lo que usamos acá) para no atar este módulo
// a una versión puntual del tipo SupabaseClient.
interface ClienteBorradoTokens {
  from(tabla: string): {
    delete(): { in(columna: string, valores: string[]): Promise<{ error: { message: string } | null }> };
  };
}

// Manda un push a cada token de la lista (un request por token, la
// API v1 no soporta multicast) y borra de push_tokens los que FCM
// rechazó como NotRegistered/UNREGISTERED: son dispositivos que
// desinstalaron la app, perdieron el token o borraron datos, y
// reintentarles en cada notificación futura es trabajo desperdiciado.
export async function enviarPushLote(
  supabase: ClienteBorradoTokens,
  accessToken: string,
  tokens: string[],
  mensaje: MensajePush,
): Promise<{ enviados: number; fallidos: string[] }> {
  const resultados = await Promise.allSettled(
    tokens.map((token) => enviarPush(accessToken, token, mensaje)),
  );

  const fallidos: string[] = [];
  const tokensInvalidos: string[] = [];

  resultados.forEach((resultado, i) => {
    if (resultado.status === 'rejected') {
      const razon = String(resultado.reason);
      fallidos.push(razon);
      if (razon.includes('NotRegistered') || razon.includes('UNREGISTERED')) {
        tokensInvalidos.push(tokens[i]);
      }
    }
  });

  if (tokensInvalidos.length > 0) {
    const { error } = await supabase.from('push_tokens').delete().in('token', tokensInvalidos);
    if (error) {
      console.log('[enviarPushLote] no se pudieron borrar tokens inválidos:', error.message);
    }
  }

  return { enviados: resultados.length - fallidos.length, fallidos };
}

// --- Autenticación OAuth2 con service account (JWT Bearer flow) ---
// https://developers.google.com/identity/protocols/oauth2/service-account

export async function obtenerAccessToken(): Promise<string> {
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

export function json(cuerpo: unknown, status: number): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
