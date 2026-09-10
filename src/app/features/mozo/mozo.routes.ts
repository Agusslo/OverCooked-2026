import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';

export const mozoRoutes: Routes = [
  {
    path: 'consultas',
    loadComponent: () =>
      import('./consultas/consultas.page').then((m) => m.ConsultasPage),
    canActivate: [authGuard],
    data: { perfiles: ['mozo'] },
  },
  // Lista de conversaciones abiertas de una mesa puntual (puede haber
  // más de un comensal escribiendo por separado).
  {
    path: 'hilos/:numero',
    loadComponent: () =>
      import('./hilos/hilos.page').then((m) => m.HilosPage),
    canActivate: [authGuard],
    data: { perfiles: ['mozo'] },
  },
  {
    path: 'chat/:numero/:hilo',
    loadComponent: () =>
      import('../chat/chat-mesa/chat-mesa.page').then((m) => m.ChatMesaPage),
    canActivate: [authGuard],
    data: { perfiles: ['mozo'] },
  },
];