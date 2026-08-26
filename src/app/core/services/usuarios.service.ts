import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Usuario, PerfilUsuario } from '../models/usuario.model';

export interface DatosNuevoEmpleado {
  nombre: string;
  apellido: string;
  dni: string;
  cuil: string;
  correo: string;
  clave: string;
  perfil: PerfilUsuario;
  fotoDataUrl: string;
}

@Injectable({
  providedIn: 'root',
})
export class UsuariosService {
  constructor(private supabaseService: SupabaseService) {}

  async crearEmpleado(datos: DatosNuevoEmpleado): Promise<Usuario> {
    const client = this.supabaseService.getClient();

    // Guardamos la sesión de quien está dando de alta al empleado
    // (dueño o supervisor) ANTES de crear la cuenta nueva. La
    // necesitamos para restaurarla después, porque signUp()
    // reemplaza automáticamente la sesión activa por la del
    // usuario recién creado.
    const { data: sesionActual } = await client.auth.getSession();
    const sesionAdmin = sesionActual.session;

    const { data: altaAuth, error: errorAuth } = await client.auth.signUp({
      email: datos.correo,
      password: datos.clave,
    });

    if (errorAuth || !altaAuth.user) {
      throw new Error(errorAuth?.message || 'No se pudo crear la cuenta del empleado.');
    }

    // Apenas tenemos el id del nuevo usuario, restauramos la
    // sesión del admin. De acá en adelante, cualquier operación
    // (incluyendo el insert de abajo) se hace como el admin, no
    // como el empleado recién creado.
    if (sesionAdmin) {
      const { error: errorSesion } = await client.auth.setSession({
        access_token: sesionAdmin.access_token,
        refresh_token: sesionAdmin.refresh_token,
      });

      if (errorSesion) {
        throw new Error('El empleado se creó, pero no se pudo restaurar tu sesión.');
      }
    }

    const { data: usuarioCreado, error: errorInsert } = await client
      .from('usuarios')
      .insert({
        id: altaAuth.user.id,
        nombre: datos.nombre,
        apellido: datos.apellido,
        dni: datos.dni,
        cuil: datos.cuil,
        email: datos.correo,
        perfil: datos.perfil,
        foto_url: datos.fotoDataUrl,
        estado: 'aprobado',
      })
      .select()
      .single();

    if (errorInsert || !usuarioCreado) {
      throw new Error(
        errorInsert?.message || 'No se pudo guardar el empleado en la base de datos.'
      );
    }

    return usuarioCreado as Usuario;
  }
}