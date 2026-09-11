import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';

export const barRoutes: Routes = [
  {
    path: 'alta-bebida',
    loadComponent: () =>
      import('./alta-bebida/alta-bebida.page').then((m) => m.AltaBebidaPage),
    canActivate: [authGuard],
    data: { perfiles: ['cantinero'] },
  },
  // Punto 14: pedidos confirmados por el mozo, sólo los items de sector
  // 'bar', agrupados por pedido.
  {
    path: 'pedidos',
    loadComponent: () =>
      import('./pedidos-bar/pedidos-bar.page').then((m) => m.PedidosBarPage),
    canActivate: [authGuard],
    data: { perfiles: ['cantinero'] },
  },
];
