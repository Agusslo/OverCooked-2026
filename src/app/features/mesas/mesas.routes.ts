import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';

export const mesasRoutes: Routes = [
  {
    path: 'alta-mesa',
    loadComponent: () =>
      import('./alta-mesa/alta-mesa.page').then((m) => m.AltaMesaPage),
    canActivate: [authGuard],
    data: { perfiles: ['dueño', 'supervisor'] },
  },
  {
    path: 'listado-mesas',
    loadComponent: () =>
      import('./listado-mesas/listado-mesas.page').then((m) => m.ListadoMesasPage),
    canActivate: [authGuard],
    data: { perfiles: ['dueño', 'supervisor'] },
  },
];