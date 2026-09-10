import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';

export const metreRoutes: Routes = [
  {
    path: 'asignar-mesa',
    loadComponent: () =>
      import('./asignar-mesa/asignar-mesa.page').then((m) => m.AsignarMesaPage),
    canActivate: [authGuard],
    data: { perfiles: ['metre', 'dueño', 'supervisor'] },
  },
  {
    path: 'lista-espera',
    loadComponent: () =>
      import('./lista-espera/lista-espera.page').then(
        (m) => m.ListaEsperaMetrePage,
      ),
    canActivate: [authGuard],
    data: { perfiles: ['metre', 'dueño', 'supervisor'] },
  },
];