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
];