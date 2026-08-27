import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { PerfilUsuario } from '../models/usuario.model';

// Un guard es una función que Angular ejecuta ANTES de dejar entrar
// a una ruta. Si devuelve true, la navegación sigue. Si devuelve
// false, la navegación se cancela (acá, redirigiendo a otro lado).
//
// Este guard sirve para dos casos, según cómo se configure la ruta:
//   1. Rutas que solo piden estar logueado (cualquier perfil).
//   2. Rutas que además piden un perfil específico, pasado en
//      `data: { perfiles: [...] }` dentro de app.routes.ts.
export const authGuard: CanActivateFn = async (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Esperamos a que termine el chequeo inicial de sesión (el que
  // se dispara al arrancar la app, por si había una sesión
  // guardada). Sin este await, un F5 en la página podría rebotar
  // a alguien que en realidad sí está logueado, solo porque la
  // consulta a Supabase todavía no terminó.
  await authService.sesionLista;

  const usuario = authService.usuarioActual;

  if (!usuario) {
    router.navigateByUrl('/login');
    return false;
  }

  const perfilesPermitidos = route.data['perfiles'] as
    | PerfilUsuario[]
    | undefined;

  if (perfilesPermitidos && !perfilesPermitidos.includes(usuario.perfil)) {
    router.navigateByUrl('/inicio');
    return false;
  }

  return true;
};