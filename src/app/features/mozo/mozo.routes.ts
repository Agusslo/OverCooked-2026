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
  {
    path: 'chat/:numero',
    loadComponent: () =>
      import('../chat/chat-mesa/chat-mesa.page').then((m) => m.ChatMesaPage),
    canActivate: [authGuard],
    data: { perfiles: ['mozo'] },
  },
];