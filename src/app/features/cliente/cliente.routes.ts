import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';

export const clienteRoutes: Routes = [
  {
    path: 'entrada',
    loadComponent: () =>
      import('./entrada/entrada.page').then((m) => m.EntradaPage),
    canActivate: [authGuard],
    data: { perfiles: ['cliente', 'anonimo'] },
  },
  {
    path: 'menu/:numero',
    loadComponent: () =>
      import('./menu/menu.page').then((m) => m.MenuPage),
    canActivate: [authGuard],
    data: { perfiles: ['cliente', 'anonimo'] },
  },
  {
    path: 'estado-pedido/:id',
    loadComponent: () =>
      import('./estado-pedido/estado-pedido.page').then((m) => m.EstadoPedidoPage),
    canActivate: [authGuard],
    data: { perfiles: ['cliente', 'anonimo'] },
  },
  {
    path: 'cuenta/:pedidoId',
    loadComponent: () =>
      import('./cuenta/cuenta.page').then((m) => m.CuentaPage),
    canActivate: [authGuard],
    data: { perfiles: ['cliente', 'anonimo'] },
  },
  {
    path: 'escanear-mesa',
    loadComponent: () =>
      import('./escanear-mesa/escanear-mesa.page').then((m) => m.EscanearMesaPage),
    canActivate: [authGuard],
    data: { perfiles: ['cliente', 'anonimo'] },
  },
  {
    path: 'chat/:numero',
    loadComponent: () =>
      import('../chat/chat-mesa/chat-mesa.page').then((m) => m.ChatMesaPage),
    canActivate: [authGuard],
    data: { perfiles: ['cliente', 'anonimo'] },
  },
  {
    path: 'encuesta/:pedidoId',
    loadComponent: () =>
      import('./encuesta/encuesta.page').then((m) => m.EncuestaPage),
    canActivate: [authGuard],
    data: { perfiles: ['cliente', 'anonimo'] },
  },
  {
    path: 'encuesta-resultados',
    loadComponent: () =>
      import('./encuesta/resultados/resultados-encuesta.page').then(
        (m) => m.ResultadosEncuestaPage,
      ),
    canActivate: [authGuard],
    data: { perfiles: ['cliente', 'anonimo'] },
  },
  {
    path: 'juegos/:numero',
    loadComponent: () =>
      import('./juegos/juegos.page').then((m) => m.JuegosPage),
    canActivate: [authGuard],
    data: { perfiles: ['cliente'] },
  },
  {
    path: 'juegos/:numero/higher-lower',
    loadComponent: () =>
      import('./juegos/higher-lower/higher-lower.page').then((m) => m.HigherLowerPage),
    canActivate: [authGuard],
    data: { perfiles: ['cliente'] },
  },
  {
    path: 'juegos/:numero/simon',
    loadComponent: () =>
      import('./juegos/simon/simon.page').then((m) => m.SimonPage),
    canActivate: [authGuard],
    data: { perfiles: ['cliente'] },
  },
];