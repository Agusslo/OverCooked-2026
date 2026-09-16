import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';

export const mozoRoutes: Routes = [
  {
    path: 'pedidos-pendientes',
    loadComponent: () =>
      import('./pedidos-pendientes/pedidos-pendientes.page').then(
        (m) => m.PedidosPendientesPage,
      ),
    canActivate: [authGuard],
    data: { perfiles: ['mozo'] },
  },
  {
    path: 'pedidos-en-curso',
    loadComponent: () =>
      import('./pedidos-en-curso/pedidos-en-curso.page').then(
        (m) => m.PedidosEnCursoPage,
      ),
    canActivate: [authGuard],
    data: { perfiles: ['mozo'] },
  },
  {
    path: 'consultas',
    loadComponent: () =>
      import('./consultas/consultas.page').then((m) => m.ConsultasPage),
    canActivate: [authGuard],
    data: { perfiles: ['mozo'] },
  },
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