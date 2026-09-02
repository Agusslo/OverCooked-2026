import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { authRoutes } from './features/auth/auth.routes';
import { adminRoutes } from './features/admin/admin.routes';
import { cocinaRoutes } from './features/cocina/cocina.routes';
import { barRoutes } from './features/bar/bar.routes';
import { mesasRoutes } from './features/mesas/mesas.routes';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'auth/login',
    pathMatch: 'full',
  },
  {
    path: 'inicio',
    loadComponent: () =>
      import('./features/homes/inicio/inicio.page').then((m) => m.InicioPage),
    canActivate: [authGuard],
  },
  { path: 'auth', children: authRoutes },
  { path: 'admin', children: adminRoutes },
  { path: 'cocina', children: cocinaRoutes },
  { path: 'bar', children: barRoutes },
  { path: 'mesas', children: mesasRoutes },
];