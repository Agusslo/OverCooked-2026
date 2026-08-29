import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';

export const adminRoutes: Routes = [
    {
        path: 'alta-empleado', loadComponent: () => import('./alta-empleado/alta-empleado.page').then((m) => m.AltaEmpleadoPage),
        canActivate: [authGuard],
        data: { perfiles: ['dueño', 'supervisor'] }
    }
]