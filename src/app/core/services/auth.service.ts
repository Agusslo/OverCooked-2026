import { inject, Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { MailService } from './mail.service';
import { IRegistro, IRegistroAnonimo, Usuario } from '../models/usuario.model';
import { Router } from '@angular/router';

const BUCKET_USUARIOS = 'usuarios-fotos';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  router = inject(Router);
  private mailService = inject(MailService);
  private supabaseService = inject(SupabaseService);

  private usuarioActualSubject = new BehaviorSubject<Usuario | null>(null);
  usuarioActual$ = this.usuarioActualSubject.asObservable();

  readonly sesionLista: Promise<void> = this.restaurarSesion();

  private async restaurarSesion(): Promise<void> {
    try {
      const { data } = await this.supabaseService.getClient().auth.getSession();

      if (!data.session) {
        return;
      }

      // Los invitados (signInAnonymously) no tienen fila en 'usuarios' —
      // su identidad vive en el user_metadata de la sesión anónima.
      if (data.session.user.is_anonymous) {
        this.usuarioActualSubject.next(this.usuarioDesdeSesionAnonima(data.session.user));
        return;
      }

      const usuario = await this.obtenerUsuarioPorId(data.session.user.id);
      this.usuarioActualSubject.next(usuario);
    } catch (error) {
      // Una sesión que no se puede resolver (usuario borrado, fila
      // faltante, etc.) no debe tirar abajo el arranque de la app:
      // sesionLista tiene que resolver siempre, nunca rechazar.
      console.warn('No se pudo restaurar la sesión:', error);
    }
  }

  async login(email: string, clave: string): Promise<Usuario> {
    const { data, error } = await this.supabaseService
      .getClient()
      .auth.signInWithPassword({ email, password: clave });

    if (error || !data.user) {
      throw new Error('Correo o contraseña incorrectos.');
    }

    const usuario = await this.obtenerUsuarioPorId(data.user.id);

    if (usuario.estado === 'rechazado') {
      await this.logout();
      throw new Error(
        'Tu solicitud de registro fue rechazada por el restaurante. No podés ingresar con este usuario.'
      );
    }

    if (usuario.estado !== 'aprobado') {
      await this.logout();
      throw new Error(
        'Tu registro todavía no fue aprobado por el restaurante.'
      );
    }

    this.usuarioActualSubject.next(usuario);
    return usuario;
  }

  async registrarUsuario({ nombre, apellido, dni, email, password, foto_url }: IRegistro): Promise<Usuario> {
    const { data, error } = await this.supabaseService.getClient().auth.signUp({
      email,
      password,
    });

    // Caso normal: signUp exitoso y el usuario tiene identities (es realmente nuevo).
    // Caso fake: Supabase devuelve user con identities vacío cuando el email ya existe
    // y la confirmación está habilitada (protección contra enumeración de emails).
    const esUsuarioFalso = data?.user?.identities?.length === 0;

    if (esUsuarioFalso || (error && error.message === 'User already registered')) {
      // El auth user ya existe. Puede ser un registro previo que falló
      // después de signUp (foto, insert en usuarios, etc.). Intentamos
      // recuperar: si el perfil en la tabla 'usuarios' no existe, lo creamos.
      return this.recuperarRegistroIncompleto({ nombre, apellido, dni, email, password, foto_url });
    }

    if (error || !data.user) {
      throw error ?? new Error('No se pudo registrar el usuario.');
    }

    return this.completarRegistro(data.user.id, { nombre, apellido, dni, email, foto_url });
  }

  /**
   * Intenta completar un registro cuyo auth.user ya existe pero cuyo
   * perfil en la tabla 'usuarios' no fue creado (registro previo fallido).
   */
  private async recuperarRegistroIncompleto(
    { nombre, apellido, dni, email, password, foto_url }: IRegistro,
  ): Promise<Usuario> {
    // Necesitamos el user.id → intentamos loguearnos con las credenciales.
    const { data: loginData, error: loginError } = await this.supabaseService
      .getClient()
      .auth.signInWithPassword({ email, password });

    if (loginError || !loginData.user) {
      // Si las credenciales no coinciden, el email existe pero con otra
      // contraseña → es realmente un usuario duplicado, no un retry.
      throw new Error('User already registered');
    }

    const userId = loginData.user.id;

    // Verificar si ya tiene perfil en la tabla 'usuarios'.
    const { data: perfilExistente } = await this.supabaseService
      .getClient()
      .from('usuarios')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (perfilExistente) {
      // El perfil ya existe → es un usuario genuinamente duplicado.
      await this.logout();
      throw new Error('User already registered');
    }

    // No tiene perfil → completar el registro que quedó a medias.
    try {
      const usuario = await this.completarRegistro(userId, { nombre, apellido, dni, email, foto_url });
      // Cerramos sesión para que el flujo siga siendo: registrarse → esperar
      // aprobación del dueño → login.
      await this.logout();
      return usuario;
    } catch (err) {
      await this.logout();
      throw err;
    }
  }

  /**
   * Sube la foto, crea la fila en 'usuarios' y envía el mail de registro
   * pendiente. Se usa tanto en el registro nuevo como en la recuperación.
   */
  private async completarRegistro(
    userId: string,
    { nombre, apellido, dni, email, foto_url }: Omit<IRegistro, 'password'>,
  ): Promise<Usuario> {
    // La foto se sube a Storage (nunca en base64 en la tabla),
    // mismo mecanismo que productos, mesas y alta de empleados.
    const fotoUrlSubida = await this.subirFoto(foto_url, `cliente-${userId}`);

    // El registro público siempre crea un perfil 'cliente', sin
    // CUIL (el punto 5 del PDF no lo pide, solo DNI), y arranca
    // en 'pendiente' — login() ya rechaza a los que no estén
    // en estado 'aprobado'.
    const { data: usuarioCreado, error: errorInsert } = await this.supabaseService
      .getClient()
      .from('usuarios')
      .insert({
        id: userId,
        nombre,
        apellido,
        dni: String(dni),
        cuil: null,
        email,
        perfil: 'cliente',
        foto_url: fotoUrlSubida,
        estado: 'pendiente',
      })
      .select()
      .single();

    if (errorInsert || !usuarioCreado) {
      throw new Error(
        errorInsert?.message ?? 'No se pudo guardar el usuario en la base de datos.'
      );
    }

    try {
      await this.mailService.enviarRegistroPendiente(email, nombre);
    } catch (error) {
      console.warn('No se pudo enviar el correo de registro pendiente:', error);
    }

    return usuarioCreado as Usuario;
  }

  async registrarAnonimo({ nombre, apellido, foto_url }: IRegistroAnonimo): Promise<Usuario> {
    const client = this.supabaseService.getClient();

    const { data, error } = await client.auth.signInAnonymously();

    if (error || !data.user) {
      throw error ?? new Error('No se pudo registrar el usuario.');
    }

    // Igual que en el resto de la app, la foto (si se sacó) se sube a
    // Storage y sólo se guarda la URL pública — nunca el dataUrl base64.
    const fotoUrlSubida = foto_url
      ? await this.subirFoto(foto_url, `anonimo-${data.user.id}`)
      : '';

    const { data: actualizado, error: errorUpdate } = await client.auth.updateUser({
      data: { nombre, apellido, foto_url: fotoUrlSubida },
    });

    if (errorUpdate) {
      throw new Error('No se pudieron guardar los datos del invitado.');
    }

    const usuario = this.usuarioDesdeSesionAnonima(actualizado.user ?? data.user);
    this.usuarioActualSubject.next(usuario);
    return usuario;
  }

  // Los invitados (signInAnonymously) no tienen fila en 'usuarios': se
  // arma un Usuario "liviano" con lo que hay en el user_metadata de la
  // sesión anónima, tanto acá como al restaurar sesión.
  private usuarioDesdeSesionAnonima(authUser: {
    id: string;
    user_metadata?: Record<string, unknown>;
    created_at?: string;
  }): Usuario {
    const metadata = authUser.user_metadata ?? {};
    return {
      id: authUser.id,
      nombre: (metadata['nombre'] as string) ?? '',
      apellido: (metadata['apellido'] as string) ?? '',
      dni: '',
      cuil: null,
      email: '',
      perfil: 'anonimo',
      foto_url: (metadata['foto_url'] as string) ?? '',
      estado: 'aprobado',
      created_at: authUser.created_at ?? new Date().toISOString(),
    };
  }

  async logout(): Promise<void> {
    await this.supabaseService.getClient().auth.signOut();
    this.usuarioActualSubject.next(null);
  }

  private async obtenerUsuarioPorId(id: string): Promise<Usuario> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('usuarios')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new Error('No se encontró el usuario en la base de datos.');
    }

    return data as Usuario;
  }

  private async subirFoto(dataUrl: string, nombreArchivo: string): Promise<string> {
    const client = this.supabaseService.getClient();

    const respuesta = await fetch(dataUrl);
    const blob = await respuesta.blob();
    const extension = blob.type.split('/')[1] || 'jpeg';
    const ruta = `${nombreArchivo}.${extension}`;

    // upsert: true porque el nombre de archivo es determinístico
    // (cliente-<userId>) y un registro que quedó a medias (ver
    // recuperarRegistroIncompleto) puede reintentar subir la foto para
    // el mismo userId — sin esto, la segunda subida choca con la
    // primera y falla con 400 "The resource already exists".
    const { error: errorSubida } = await client.storage
      .from(BUCKET_USUARIOS)
      .upload(ruta, blob, { contentType: blob.type, upsert: true });

    if (errorSubida) {
      throw new Error(`No se pudo subir la foto: ${errorSubida.message}`);
    }

    const { data: urlPublica } = client.storage.from(BUCKET_USUARIOS).getPublicUrl(ruta);
    return urlPublica.publicUrl;
  }

  get usuarioActual(): Usuario | null {
    return this.usuarioActualSubject.value;
  }
}