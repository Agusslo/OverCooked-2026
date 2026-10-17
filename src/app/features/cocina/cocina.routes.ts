import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';

export const cocinaRoutes: Routes = [
  {
    path: 'alta-plato',
    loadComponent: () => import('./alta-plato/alta-plato.page').then((m) => m.AltaPlatoPage),
    canActivate: [authGuard],
    data: { perfiles: ['cocinero', 'dueño'] },
  },
  {
    path: 'pedidos',
    loadComponent: () =>
      import('./pedidos-cocina/pedidos-cocina.page').then((m) => m.PedidosCocinaPage),
    canActivate: [authGuard],
    data: { perfiles: ['cocinero', 'dueño'] },
  },
];
