import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';

export const adminRoutes: Routes = [
    {
        path: 'alta-empleado', loadComponent: () => import('./alta-empleado/alta-empleado.page').then((m) => m.AltaEmpleadoPage),
        canActivate: [authGuard],
        data: { perfiles: ['dueño', 'supervisor'] }
    },
    {
        path: 'clientes-pendientes', loadComponent: () => import('./clientes-pendientes/clientes-pendientes.page').then((m) => m.ClientesPendientesPage),
        canActivate: [authGuard],
        data: { perfiles: ['dueño', 'supervisor'] }
    }
]