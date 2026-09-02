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
    | 'plato'
    | 'bebida';
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

/*
 * Dueño, supervisor, cocinero y cantinero ya tienen accesos definidos.
 * Mozo, metre y cliente todavía no tienen pantallas propias en la app:
 * caen en un panel "vacío" (sólo encabezado + cerrar sesión) hasta que
 * se las implemente.
 */
export const PANELES_INICIO: Partial<Record<PerfilUsuario, PanelInicio>> = {
  dueño: PANEL_DUENIO,
  supervisor: PANEL_SUPERVISOR,
  cocinero: PANEL_COCINERO,
  cantinero: PANEL_CANTINERO,
};

export function panelPara(perfil: PerfilUsuario | undefined): PanelInicio | null {
  if (!perfil) return null;
  return PANELES_INICIO[perfil] ?? null;
}
