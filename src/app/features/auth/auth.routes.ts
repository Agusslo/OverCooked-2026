import { Routes } from '@angular/router';
import { environment } from '../../../environments/environment';

export const authRoutes: Routes = [
    { path: 'login', loadComponent: () => import('./login/login.page').then((m) => m.LoginPage) },
    { path: 'registro', loadComponent: () => import('./registro/registro.page').then((m) => m.RegistroPage) },
    // Accesos rápidos: sólo en dev. En producción la ruta no se registra.
    ...(environment.production
        ? []
        : [{ path: 'accesos-rapidos', loadComponent: () => import('./accesos-rapidos/accesos-rapidos.page').then(m => m.AccesosRapidosPage) }]),
    { path: 'invitado', loadComponent: () => import('./invitado/invitado.page').then(m => m.InvitadoPage) }
]