// Edge Function: enviar-mail
// -------------------------------------------------------------
// Envía los correos automáticos de la aplicación usando Resend.
// La API key vive solo acá (variable de entorno del proyecto de
// Supabase), nunca en el front. El cliente Angular la invoca con
// supabase.functions.invoke('enviar-mail', { body: {...} }).
//
// Variables de entorno necesarias (supabase secrets set ...):
//   RESEND_API_KEY  -> API key de https://resend.com
//   MAIL_FROM       -> Remitente verificado, ej: "OverCooked <hola@tudominio.com>"
//   MAIL_LOGO_URL   -> URL pública del logo para los mails (opcional)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY -> Inyectadas automáticamente por Supabase

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const MAIL_FROM = Deno.env.get('MAIL_FROM') ?? 'OverCooked <onboarding@resend.dev>';
const MAIL_LOGO_URL =
  Deno.env.get('MAIL_LOGO_URL') ??
  'https://ydpukgjowtmoxbeyhncz.supabase.co/storage/v1/object/public/assets/logo.png';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type TipoMail = 'registro-pendiente' | 'cliente-aprobado' | 'cliente-rechazado';

const TIPOS_VALIDOS: TipoMail[] = [
  'registro-pendiente',
  'cliente-aprobado',
  'cliente-rechazado',
];

interface SolicitudMail {
  tipo: TipoMail;
  para: string;
  nombre: string;
  motivo?: string;
}

interface Plantilla {
  asunto: string;
  html: string;
}

// Eje de diseño común a los 3 correos: logo arriba, tarjeta
// redondeada centrada y pie "correo automático". Lo que cambia
// entre tipos (requisito del PDF, puntos 7 y 8): paleta de
// colores, tipografías y tamaños del título.
interface Tema {
  fondo: string;
  tarjeta: string;
  titulo: string;
  textoFuerte: string;
  textoSuave: string;
  borde: string;
  pie: string;
  fontTitulo: string;
  fontCuerpo: string;
  tamTitulo: string;
  tamCuerpo: string;
}

function envolver(tema: Tema, titulo: string, cuerpo: string): string {
  return `
  <div style="margin:0;padding:0;background:${tema.fondo};font-family:${tema.fontCuerpo};">
    <div style="max-width:520px;margin:0 auto;padding:24px 16px;">
      <div style="text-align:center;padding:8px 0 20px;">
        <img src="${MAIL_LOGO_URL}" alt="OverCooked" width="120" style="display:inline-block;" />
      </div>
      <div style="background:${tema.tarjeta};border-radius:24px;padding:28px 26px;color:${tema.textoFuerte};">
        <h1 style="margin:0 0 14px;font-size:${tema.tamTitulo};line-height:1.2;color:${tema.titulo};font-family:${tema.fontTitulo};letter-spacing:0.5px;">
          ${titulo}
        </h1>
        <div style="border-left:5px solid ${tema.borde};padding-left:14px;font-size:${tema.tamCuerpo};">
          ${cuerpo}
        </div>
        <p style="margin:24px 0 0;font-size:13px;color:${tema.pie};font-family:${tema.fontTitulo};">
          Equipo OverCooked · Este es un correo automático, no respondas a esta dirección.
        </p>
      </div>
    </div>
  </div>`;
}

function armarPlantilla(
  tipo: TipoMail,
  nombre: string,
  motivo?: string,
): Plantilla {
  const nombreSeguro = escaparHtml(nombre || 'cliente');
  const motivoSeguro = motivo ? escaparHtml(motivo) : '';

  switch (tipo) {
    // ---- PENDIENTE: paleta cálida original, serif + Verdana ----
    case 'registro-pendiente': {
      const tema: Tema = {
        fondo: '#ee7a4f',
        tarjeta: '#c45030',
        titulo: '#f0c060',
        textoFuerte: '#ffffff',
        textoSuave: '#ffe9dd',
        borde: '#f0c060',
        pie: '#f9bfa0',
        fontTitulo: "Verdana, Geneva, sans-serif",
        fontCuerpo: "Georgia, 'Times New Roman', serif",
        tamTitulo: '26px',
        tamCuerpo: '16px',
      };
      return {
        asunto: 'Recibimos tu registro en OverCooked',
        html: envolver(
          tema,
          `¡Hola, ${nombreSeguro}!`,
          `
            <p style="margin:0 0 12px;line-height:1.5;">
              Tu solicitud de registro como <strong style="color:${tema.titulo};">cliente</strong>
              quedó <strong>pendiente de aprobación</strong>.
            </p>
            <p style="margin:0 0 12px;line-height:1.5;color:${tema.textoSuave};">
              El dueño o un supervisor del restaurante va a revisar tus datos.
              Te vamos a avisar por este mismo medio apenas haya una respuesta.
            </p>
            <p style="margin:0;line-height:1.5;color:${tema.textoSuave};">
              Hasta entonces no vas a poder ingresar a la aplicación con este usuario.
            </p>
          `,
        ),
      };
    }

    // ---- APROBADO: paleta verde "éxito", títulos grandes,
    //      Trebuchet MS + Palatino ----
    case 'cliente-aprobado': {
      const tema: Tema = {
        fondo: '#2f9e6e',
        tarjeta: '#1f6f4e',
        titulo: '#ffe08a',
        textoFuerte: '#ffffff',
        textoSuave: '#ddf6ea',
        borde: '#ffe08a',
        pie: '#a9dcc4',
        fontTitulo: "'Trebuchet MS', 'Segoe UI', sans-serif",
        fontCuerpo: "'Palatino Linotype', Palatino, Georgia, serif",
        tamTitulo: '32px',
        tamCuerpo: '17px',
      };
      return {
        asunto: '¡Tu cuenta de OverCooked fue aprobada!',
        html: envolver(
          tema,
          `¡Bienvenido/a, ${nombreSeguro}!`,
          `
            <p style="margin:0 0 12px;line-height:1.6;">
              El restaurante <strong style="color:${tema.titulo};">aprobó tu registro</strong>.
              Ya podés iniciar sesión en la aplicación con tu correo y contraseña.
            </p>
            <p style="margin:0;line-height:1.6;color:${tema.textoSuave};">
              Te esperamos en la mesa. ¡Que lo disfrutes!
            </p>
          `,
        ),
      };
    }

    // ---- RECHAZADO: paleta sobria bordó, título chico y formal,
    //      Courier + Cambria ----
    case 'cliente-rechazado': {
      const tema: Tema = {
        fondo: '#8a4a3a',
        tarjeta: '#5f2a20',
        titulo: '#f2b8a6',
        textoFuerte: '#f7e6e0',
        textoSuave: '#e7c3b8',
        borde: '#c0654f',
        pie: '#c99a8d',
        fontTitulo: "'Courier New', Courier, monospace",
        fontCuerpo: "Cambria, 'Hoefler Text', Georgia, serif",
        tamTitulo: '21px',
        tamCuerpo: '15px',
      };
      return {
        asunto: 'Novedades sobre tu registro en OverCooked',
        html: envolver(
          tema,
          `Hola, ${nombreSeguro}`,
          `
            <p style="margin:0 0 12px;line-height:1.6;">
              Lamentamos informarte que el restaurante <strong style="color:${tema.titulo};">no aprobó tu solicitud</strong>
              de registro como cliente.
            </p>
            ${
              motivoSeguro
                ? `<p style="margin:0 0 12px;line-height:1.6;color:${tema.textoSuave};">
                     Motivo indicado: <em>${motivoSeguro}</em>
                   </p>`
                : ''
            }
            <p style="margin:0;line-height:1.6;color:${tema.textoSuave};">
              No vas a poder ingresar a la aplicación con este usuario.
              Si creés que es un error, podés comunicarte con el restaurante.
            </p>
          `,
        ),
      };
    }
  }
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function esEmailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Método no permitido.' }, 405);
  }

  if (!RESEND_API_KEY) {
    return json({ error: 'Falta configurar RESEND_API_KEY.' }, 500);
  }

  let cuerpo: SolicitudMail;
  try {
    cuerpo = await req.json();
  } catch {
    return json({ error: 'El cuerpo debe ser JSON válido.' }, 400);
  }

  const { tipo, para, nombre, motivo } = cuerpo ?? ({} as SolicitudMail);

  if (!TIPOS_VALIDOS.includes(tipo)) {
    return json({ error: `Tipo de mail no soportado: ${tipo}` }, 400);
  }
  if (!para || !esEmailValido(para)) {
    return json({ error: 'Destinatario inválido.' }, 400);
  }

  // Sólo se manda a usuarios reales de la app (evita que la función se
  // use para spamear desde el dominio remitente). Todos los flujos que
  // envían mail lo hacen después de insertar la fila en 'usuarios'.
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return json({ error: 'Faltan variables de entorno de Supabase.' }, 500);
  }
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

  // ilike para ignorar mayúsculas; se escapan los comodines de LIKE
  // (% y _, este último muy común en mails) para que sea una igualdad.
  const emailEscapado = para.replace(/[\\%_]/g, '\\$&');
  const { data: usuario, error: errorUsuario } = await supabase
    .from('usuarios')
    .select('id, estado')
    .ilike('email', emailEscapado)
    .limit(1)
    .maybeSingle();

  if (errorUsuario) {
    return json({ error: 'No se pudo validar al destinatario.' }, 500);
  }
  if (!usuario) {
    return json({ error: 'El destinatario no es un usuario registrado.' }, 403);
  }

  // verify_jwt está en false (el registro público no siempre tiene sesión),
  // así que la autorización se hace acá según el tipo de mail:
  if (tipo === 'registro-pendiente') {
    // Texto fijo, sin contenido libre: sólo se permite mientras el
    // destinatario siga 'pendiente' (o sea, justo después de registrarse).
    if (usuario.estado !== 'pendiente') {
      return json({ error: 'El destinatario no tiene un registro pendiente.' }, 403);
    }
  } else {
    // Aprobado/rechazado (este último con 'motivo' libre): sólo los
    // puede disparar un dueño o supervisor autenticado.
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: authData } = await supabase.auth.getUser(token);
    if (!token || !authData?.user) {
      return json({ error: 'Se requiere iniciar sesión.' }, 401);
    }

    const { data: llamador } = await supabase
      .from('usuarios')
      .select('perfil')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (!llamador || !['dueño', 'supervisor'].includes(llamador.perfil)) {
      return json({ error: 'No tenés permiso para enviar este correo.' }, 403);
    }
  }

  const plantilla = armarPlantilla(tipo, nombre, motivo);

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: MAIL_FROM,
      to: [para],
      subject: plantilla.asunto,
      html: plantilla.html,
    }),
  });

  if (!resp.ok) {
    const detalle = await resp.text();
    return json({ error: 'Resend rechazó el envío.', detalle }, 502);
  }

  const data = await resp.json();
  return json({ ok: true, id: data.id ?? null }, 200);
});

function json(cuerpo: unknown, status: number): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
