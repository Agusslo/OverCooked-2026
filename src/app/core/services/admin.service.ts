import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { MailService } from './mail.service';
import { Usuario, PerfilUsuario } from '../models/usuario.model';

// Datos mínimos que necesita el módulo de clientes pendientes
// para actualizar el estado y disparar el correo correspondiente.
export type DatosClienteMail = Pick<Usuario, 'id' | 'nombre' | 'email'>;

//BUCKET para las fotos de los empleados (usuarios con perfil distinto a cliente).
const BUCKET_USUARIOS = 'usuarios-fotos';


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

export class AdminService {
  private mailService = inject(MailService);
  private supabaseService = inject(SupabaseService);

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

    // Si el mail ya tiene cuenta en Auth, Supabase devuelve un usuario
    // "falso" (identities vacío) o el error 'User already registered'.
    // Puede ser un alta anterior que falló después del signUp (foto o
    // insert): intentamos recuperarla con las mismas credenciales.
    const cuentaYaExiste =
      altaAuth?.user?.identities?.length === 0 ||
      errorAuth?.message === 'User already registered';

    let userId: string;

    if (cuentaYaExiste) {
      const { data: loginData, error: errorLogin } =
        await client.auth.signInWithPassword({
          email: datos.correo,
          password: datos.clave,
        });

      if (errorLogin || !loginData.user) {
        await this.restaurarSesionAdmin(sesionAdmin);
        throw new Error('Ya existe una cuenta con ese correo.');
      }
      userId = loginData.user.id;
    } else if (errorAuth || !altaAuth.user) {
      throw new Error(errorAuth?.message || 'No se pudo crear la cuenta del empleado.');
    } else {
      userId = altaAuth.user.id;
    }

    // Apenas tenemos el id del nuevo usuario, restauramos la
    // sesión del admin. De acá en adelante, cualquier operación
    // (incluyendo la subida de la foto y el insert de abajo) se
    // hace como el admin, no como el empleado recién creado.
    await this.restaurarSesionAdmin(sesionAdmin);

    if (cuentaYaExiste) {
      const { data: perfilExistente } = await client
        .from('usuarios')
        .select('id')
        .eq('id', userId)
        .maybeSingle();

      if (perfilExistente) {
        throw new Error('Ya existe un empleado registrado con ese correo.');
      }
    }

    // La foto se sube a Storage (nunca en base64 en la tabla),
    // mismo mecanismo que ProductosService y MesasService.
    const foto_url = await this.subirFoto(datos.fotoDataUrl, `empleado-${userId}`);

    const { data: usuarioCreado, error: errorInsert } = await client
      .from('usuarios')
      .insert({
        id: userId,
        nombre: datos.nombre,
        apellido: datos.apellido,
        dni: datos.dni,
        cuil: datos.cuil,
        email: datos.correo,
        perfil: datos.perfil,
        foto_url,
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

  // signUp/signInWithPassword reemplazan la sesión activa por la del
  // empleado: se vuelve a la del admin que está haciendo el alta.
  private async restaurarSesionAdmin(
    sesionAdmin: { access_token: string; refresh_token: string } | null,
  ): Promise<void> {
    if (!sesionAdmin) {
      return;
    }

    const { error } = await this.supabaseService.getClient().auth.setSession({
      access_token: sesionAdmin.access_token,
      refresh_token: sesionAdmin.refresh_token,
    });

    if (error) {
      throw new Error('El empleado se creó, pero no se pudo restaurar tu sesión.');
    }
  }

  // Convierte el dataUrl (base64) que devuelve la cámara en un
  // archivo real y lo sube al bucket de fotos de usuarios.
  private async subirFoto(dataUrl: string, nombreArchivo: string): Promise<string> {
    const client = this.supabaseService.getClient();

    const respuesta = await fetch(dataUrl);
    const blob = await respuesta.blob();
    const extension = blob.type.split('/')[1] || 'jpeg';
    const ruta = `${nombreArchivo}.${extension}`;

    const { error: errorSubida } = await client.storage
      .from(BUCKET_USUARIOS)
      // upsert: el nombre es determinístico (empleado-<userId>) y un alta
      // que quedó a medias puede reintentar la subida para el mismo id.
      .upload(ruta, blob, { contentType: blob.type, upsert: true, cacheControl: '31536000' });

    if (errorSubida) {
      throw new Error(`No se pudo subir la foto: ${errorSubida.message}`);
    }

    // Caché de 1 año + ?v=<timestamp>: como el upsert reutiliza el nombre,
    // la versión en la URL evita que se siga viendo una foto anterior.
    const { data: urlPublica } = client.storage.from(BUCKET_USUARIOS).getPublicUrl(ruta);
    return `${urlPublica.publicUrl}?v=${Date.now()}`;
  }

  // Punto 6/7/8 del PDF: el dueño o supervisor aprueba o
  // rechaza a un cliente que se registró solo (queda en
  // 'pendiente' hasta que alguien decida). login() ya bloquea a
  // cualquiera que no esté en 'aprobado', así que con solo
  // cambiar el estado acá alcanza para habilitar o no el acceso.
  async aprobarCliente(cliente: DatosClienteMail): Promise<void> {
    const { error } = await this.supabaseService
      .getClient()
      .from('usuarios')
      .update({ estado: 'aprobado' })
      .eq('id', cliente.id);

    if (error) {
      throw new Error('No se pudo aprobar al cliente.');
    }

    // Punto 8 del PDF: correo automático de aprobación. Si el
    // envío falla no revertimos el estado — el cliente ya quedó
    // habilitado y el correo se puede reintentar.
    try {
      await this.mailService.enviarClienteAprobado(
        cliente.email,
        cliente.nombre,
      );
    } catch (error) {
      console.warn('No se pudo enviar el correo de aprobación:', error);
    }
  }

  async rechazarCliente(
    cliente: DatosClienteMail,
    motivo?: string,
  ): Promise<void> {
    const { error } = await this.supabaseService
      .getClient()
      .from('usuarios')
      .update({ estado: 'rechazado' })
      .eq('id', cliente.id);

    if (error) {
      throw new Error('No se pudo rechazar al cliente.');
    }

    // Punto 7 del PDF: correo automático de rechazo.
    try {
      await this.mailService.enviarClienteRechazado(
        cliente.email,
        cliente.nombre,
        motivo,
      );
    } catch (error) {
      console.warn('No se pudo enviar el correo de rechazo:', error);
    }
  }

  // Lista de clientes esperando aprobación — la va a necesitar
  // la pantalla donde el dueño/supervisor los ve y decide
  // (punto 6 del PDF).
  async obtenerClientesPendientes(): Promise<Usuario[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('usuarios')
      .select('*')
      .eq('perfil', 'cliente')
      .eq('estado', 'pendiente');

    if (error) {
      throw new Error('No se pudieron obtener los clientes pendientes.');
    }

    return (data ?? []) as Usuario[];
  }
}