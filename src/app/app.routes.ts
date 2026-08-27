import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

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
    canActivate: [authGuard],
    data: { perfiles: ['dueño', 'supervisor'] },
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'inicio',
    loadComponent: () =>
      import('./features/auth/inicio/inicio.page').then((m) => m.InicioPage),
    canActivate: [authGuard],
  },
];