import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
import { AltaPlatoPage } from './alta-plato/alta-plato.component';

export const cocinaRoutes: Routes = [
  {
    path: 'alta-plato',
    component: AltaPlatoPage,
    canActivate: [authGuard],
    data: { perfiles: ['cocinero'] },
  },
];
