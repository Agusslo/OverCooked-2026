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

const PANEL_DUENIO: PanelInicio = {
  rol: 'Dueño',
  titulo: 'Panel del restaurante',
  subtitulo: 'Gestión de personal, clientes y mesas',
  acciones: [
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
  ],
};

/*
 * Por ahora sólo está implementado el panel del dueño. Los demás
 * perfiles caen en un panel "vacío" (sólo encabezado + cerrar sesión)
 * hasta que se defina su set de accesos.
 */
export const PANELES_INICIO: Partial<Record<PerfilUsuario, PanelInicio>> = {
  dueño: PANEL_DUENIO,
};

export function panelPara(perfil: PerfilUsuario | undefined): PanelInicio | null {
  if (!perfil) return null;
  return PANELES_INICIO[perfil] ?? null;
}
