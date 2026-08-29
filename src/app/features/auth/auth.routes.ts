import { Routes } from '@angular/router';

export const authRoutes: Routes = [
    { path: 'login', loadComponent: () => import('./login/login.page').then((m) => m.LoginPage) },
    { path: 'register', loadComponent: () => import('./registro/registro.page').then((m) => m.RegistroPage) },
    { path: 'accesos-rapidos', loadComponent: () => import('./accesos-rapidos/accesos-rapidos.page').then(m => m.AccesosRapidosPage) }
]