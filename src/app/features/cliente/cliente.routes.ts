import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';

// El menú es visible tanto para clientes registrados como anónimos,
// por eso el guard acepta los dos perfiles.
export const clienteRoutes: Routes = [
  // Punto 9: primera pantalla del cliente (registrado o invitado) al
  // iniciar sesión: escanear el QR de la entrada del local.
  {
    path: 'entrada',
    loadComponent: () =>
      import('./entrada/entrada.page').then((m) => m.EntradaPage),
    canActivate: [authGuard],
    data: { perfiles: ['cliente', 'anonimo'] },
  },
  {
    path: 'menu/:numero',
    loadComponent: () =>
      import('./menu/menu.page').then((m) => m.MenuPage),
    canActivate: [authGuard],
    data: { perfiles: ['cliente', 'anonimo'] },
  },
  // Punto 12: estado del pedido ya confirmado (espera la confirmación
  // del mozo y sigue el resto de los estados).
  {
    path: 'estado-pedido/:id',
    loadComponent: () =>
      import('./estado-pedido/estado-pedido.page').then((m) => m.EstadoPedidoPage),
    canActivate: [authGuard],
    data: { perfiles: ['cliente', 'anonimo'] },
  },
  // Punto 10: el cliente (registrado o invitado) escanea el QR de la
  // mesa que le asignó el metre para entrar al menú.
  {
    path: 'escanear-mesa',
    loadComponent: () =>
      import('./escanear-mesa/escanear-mesa.page').then((m) => m.EscanearMesaPage),
    canActivate: [authGuard],
    data: { perfiles: ['cliente', 'anonimo'] },
  },
  // Punto 11: consulta al mozo, misma pantalla que usa el mozo del
  // otro lado (ver mozo.routes.ts).
  {
    path: 'chat/:numero',
    loadComponent: () =>
      import('../chat/chat-mesa/chat-mesa.page').then((m) => m.ChatMesaPage),
    canActivate: [authGuard],
    data: { perfiles: ['cliente', 'anonimo'] },
  },
];
