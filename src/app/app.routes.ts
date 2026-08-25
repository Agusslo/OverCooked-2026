import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'alta-empleado',
    pathMatch: 'full',
  },
  {
    path: 'splash',
    loadComponent: () =>
      import('./features/splash/splash.component').then((m) => m.SplashComponent),
  },
  {
    path: 'alta-empleado',
    loadComponent: () =>
      import('./features/admin/alta-empleado/alta-empleado.page').then((m) => m.AltaEmpleadoPage),
  },
];