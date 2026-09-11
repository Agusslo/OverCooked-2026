import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';

export const cocinaRoutes: Routes = [
  {
    path: 'alta-plato',
    loadComponent: () => import('./alta-plato/alta-plato.page').then((m) => m.AltaPlatoPage),
    canActivate: [authGuard],
    data: { perfiles: ['cocinero', 'dueño'] },
  },
  // Punto 14: pedidos confirmados por el mozo, sólo los items de sector
  // 'cocina', agrupados por pedido.
  {
    path: 'pedidos',
    loadComponent: () =>
      import('./pedidos-cocina/pedidos-cocina.page').then((m) => m.PedidosCocinaPage),
    canActivate: [authGuard],
    data: { perfiles: ['cocinero', 'dueño'] },
  },
];
