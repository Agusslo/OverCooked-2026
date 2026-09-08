import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';

// El menú es visible tanto para clientes registrados como anónimos,
// por eso el guard acepta los dos perfiles.
export const clienteRoutes: Routes = [
  {
    path: 'menu/:numero',
    loadComponent: () =>
      import('./menu/menu.page').then((m) => m.MenuPage),
    canActivate: [authGuard],
    data: { perfiles: ['cliente', 'anonimo'] },
  },
  // Punto 10: sólo el cliente registrado pasa por acá para escanear
  // el QR de la mesa que le asignó el metre.
  {
    path: 'escanear-mesa',
    loadComponent: () =>
      import('./escanear-mesa/escanear-mesa.page').then((m) => m.EscanearMesaPage),
    canActivate: [authGuard],
    data: { perfiles: ['cliente'] },
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