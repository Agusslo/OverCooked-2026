import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

// Se usa en la ruta raíz ('') de app.routes.ts, que no tiene
// redirectTo (Angular no permite combinarlo con canActivate: los
// redirects se resuelven antes que los guards). Este guard reemplaza
// ese redirectTo: siempre devuelve una URL. Supabase persiste la
// sesión sola (localStorage), así que si ya hay un usuario logueado
// (por ejemplo, se cerró la app y se volvió a abrir en el celular) no
// tiene sentido mandarlo al login: lo mandamos directo a /inicio.
export const sesionPersistidaGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await authService.sesionLista;

  return router.parseUrl(authService.usuarioActual ? '/inicio' : '/auth/login');
};
