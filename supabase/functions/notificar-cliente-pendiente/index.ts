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
// Variables de entorno necesarias (supabase secrets set ...):
//   FCM_SERVER_KEY          -> Server key del proyecto de Firebase (Cloud Messaging)
//   SUPABASE_URL             -> Inyectada automáticamente por Supabase
//   SUPABASE_SERVICE_ROLE_KEY -> Inyectada automáticamente por Supabase

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FCM_SERVER_KEY = Deno.env.get('FCM_SERVER_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

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

  if (!FCM_SERVER_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Faltan variables de entorno.' }, 500);
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

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

  const resp = await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: {
      Authorization: `key=${FCM_SERVER_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      registration_ids: tokens,
      notification: {
        title: 'Nuevo cliente pendiente de aprobación',
        body: `${cliente.apellido}, ${cliente.nombre} se registró y está esperando aprobación.`,
      },
      data: {
        tipo: 'cliente-pendiente',
        clienteId: cliente.id,
      },
    }),
  });

  if (!resp.ok) {
    const detalle = await resp.text();
    return json({ error: 'FCM rechazó el envío.', detalle }, 502);
  }

  return json({ ok: true, enviados: tokens.length }, 200);
});

function json(cuerpo: unknown, status: number): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
