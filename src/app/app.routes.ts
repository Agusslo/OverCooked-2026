import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { sesionPersistidaGuard } from './core/guards/sesion-persistida.guard';
import { authRoutes } from './features/auth/auth.routes';
import { adminRoutes } from './features/admin/admin.routes';
import { cocinaRoutes } from './features/cocina/cocina.routes';
import { barRoutes } from './features/bar/bar.routes';
import { mesasRoutes } from './features/mesas/mesas.routes';

export const routes: Routes = [
  {
    // Angular no permite combinar canActivate con redirectTo en la
    // misma ruta (los redirects se resuelven antes que los guards) —
    // por eso acá no hay redirectTo: el guard mismo decide, siempre,
    // hacia dónde redirigir (parseUrl), según haya o no sesión guardada.
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
];