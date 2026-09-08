import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { sesionPersistidaGuard } from './core/guards/sesion-persistida.guard';
import { authRoutes } from './features/auth/auth.routes';
import { adminRoutes } from './features/admin/admin.routes';
import { cocinaRoutes } from './features/cocina/cocina.routes';
import { barRoutes } from './features/bar/bar.routes';
import { mesasRoutes } from './features/mesas/mesas.routes';
import { clienteRoutes } from './features/cliente/cliente.routes';
import { metreRoutes } from './features/metre/metre.routes';
import { mozoRoutes } from './features/mozo/mozo.routes';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [sesionPersistidaGuard],
    children: [],
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
  { path: 'cliente', children: clienteRoutes },
  { path: 'metre', children: metreRoutes },
  { path: 'mozo', children: mozoRoutes },
];