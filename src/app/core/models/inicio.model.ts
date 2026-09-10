import { PerfilUsuario } from './usuario.model';

/*
 * La pantalla de inicio interna es siempre la misma (encabezado con
 * avatar + nombre + rol, y una lista de accesos). Lo único que cambia
 * es QUÉ accesos ve cada perfil. Ese mapeo vive acá.
 *
 * `icono` es una clave que el template resuelve a un SVG concreto
 * (ver el @switch en inicio.page.html).
 */
export interface AccionInicio {
  titulo: string;
  detalle: string;
  ruta: string;
  icono:
    | 'empleado'
    | 'cliente'
    | 'mesas'
    | 'mesa-nueva'
    | 'asignar-mesa'
    | 'escanear-mesa'
    | 'lista-espera'
    | 'plato'
    | 'bebida'
    | 'chat';
}

export interface PanelInicio {
  // Rótulo que va arriba del nombre en el encabezado ("Dueño", "Mozo"...).
  rol: string;
  // Texto grande debajo del avatar.
  titulo: string;
  // Bajada del título.
  subtitulo: string;
  acciones: AccionInicio[];
}

// Acciones administrativas: las mismas para dueño y supervisor, ya que
// ambos perfiles tienen los mismos permisos en las rutas (ver
// admin.routes.ts y mesas.routes.ts: data.perfiles: ['dueño', 'supervisor']).
const ACCIONES_ADMIN: AccionInicio[] = [
  {
    titulo: 'Alta de empleado',
    detalle: 'Registrar y dar de alta al personal',
    ruta: '/admin/alta-empleado',
    icono: 'empleado',
  },
  {
    titulo: 'Clientes pendientes',
    detalle: 'Aprobar o rechazar nuevos registros',
    ruta: '/admin/clientes-pendientes',
    icono: 'cliente',
  },
  {
    titulo: 'Gestión de mesas',
    detalle: 'Ver el listado y cambiar la disponibilidad',
    ruta: '/mesas/listado-mesas',
    icono: 'mesas',
  },
  {
    titulo: 'Alta de mesa',
    detalle: 'Crear una mesa nueva y su código QR',
    ruta: '/mesas/alta-mesa',
    icono: 'mesa-nueva',
  },
  {
    titulo: 'Lista de espera',
    detalle: 'Ver quién está esperando ingresar',
    ruta: '/metre/lista-espera',
    icono: 'lista-espera',
  },
];

const PANEL_DUENIO: PanelInicio = {
  rol: 'Dueño',
  titulo: 'Panel del restaurante',
  subtitulo: 'Gestión de personal, clientes y mesas',
  acciones: ACCIONES_ADMIN,
};

const PANEL_SUPERVISOR: PanelInicio = {
  rol: 'Supervisor',
  titulo: 'Panel del restaurante',
  subtitulo: 'Gestión de personal, clientes y mesas',
  acciones: ACCIONES_ADMIN,
};

const PANEL_COCINERO: PanelInicio = {
  rol: 'Cocinero',
  titulo: 'Panel de cocina',
  subtitulo: 'Carta de platos',
  acciones: [
    {
      titulo: 'Nuevo plato',
      detalle: 'Agregar un plato a la carta',
      ruta: '/cocina/alta-plato',
      icono: 'plato',
    },
  ],
};

const PANEL_CANTINERO: PanelInicio = {
  rol: 'Cantinero',
  titulo: 'Panel de bar',
  subtitulo: 'Carta de bebidas',
  acciones: [
    {
      titulo: 'Nueva bebida',
      detalle: 'Agregar una bebida a la carta',
      ruta: '/bar/alta-bebida',
      icono: 'bebida',
    },
  ],
};

const PANEL_METRE: PanelInicio = {
  rol: 'Metre',
  titulo: 'Panel del salón',
  subtitulo: 'Asignación de mesas',
  acciones: [
    {
      titulo: 'Lista de espera',
      detalle: 'Ver quién está esperando ingresar',
      ruta: '/metre/lista-espera',
      icono: 'lista-espera',
    },
    {
      titulo: 'Asignar mesa',
      detalle: 'Ubicar a un cliente que está esperando',
      ruta: '/metre/asignar-mesa',
      icono: 'asignar-mesa',
    },
  ],
};

const PANEL_MOZO: PanelInicio = {
  rol: 'Mozo',
  titulo: 'Panel del mozo',
  subtitulo: 'Consultas de las mesas',
  acciones: [
    {
      titulo: 'Consultas de mesas',
      detalle: 'Ver y responder a los clientes',
      ruta: '/mozo/consultas',
      icono: 'chat',
    },
  ],
};

// Punto 10 del PDF: el cliente registrado escanea el QR de la mesa
// que le asignó el metre para entrar al menú.
// El cliente y el invitado NO usan este panel: su /inicio es la sala de
// espera (ver InicioPage + SalaEsperaComponent, punto 12). Se deja
// definido por compatibilidad con panelPara().
const PANEL_CLIENTE: PanelInicio = {
  rol: 'Cliente',
  titulo: 'Bienvenido',
  subtitulo: 'Tu mesa',
  acciones: [
    {
      titulo: 'Escanear mi mesa',
      detalle: 'Entrar a la mesa que te asignó el metre',
      ruta: '/cliente/escanear-mesa',
      icono: 'escanear-mesa',
    },
  ],
};

/*
 * Dueño, supervisor, cocinero, cantinero, metre y cliente ya tienen
 * accesos definidos. Mozo todavía no tiene pantalla propia en la app:
 * cae en un panel "vacío" (sólo encabezado + cerrar sesión) hasta que
 * se la implemente.
 */
export const PANELES_INICIO: Partial<Record<PerfilUsuario, PanelInicio>> = {
  dueño: PANEL_DUENIO,
  supervisor: PANEL_SUPERVISOR,
  cocinero: PANEL_COCINERO,
  cantinero: PANEL_CANTINERO,
  metre: PANEL_METRE,
  cliente: PANEL_CLIENTE,
  mozo: PANEL_MOZO,
};

export function panelPara(
  perfil: PerfilUsuario | undefined,
): PanelInicio | null {
  if (!perfil) return null;
  return PANELES_INICIO[perfil] ?? null;
}
