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

  private usuarioActualSubject = new BehaviorSubject<Usuario | null>(null);
  usuarioActual$ = this.usuarioActualSubject.asObservable();

  readonly sesionLista: Promise<void>;

  constructor(private supabaseService: SupabaseService) {
    this.sesionLista = this.restaurarSesion();
  }

  private async restaurarSesion(): Promise<void> {
    const { data } = await this.supabaseService.getClient().auth.getSession();

    if (data.session) {
      const usuario = await this.obtenerUsuarioPorId(data.session.user.id);
      this.usuarioActualSubject.next(usuario);
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

    if (error || !data.user) {
      throw error ?? new Error('No se pudo registrar el usuario.');
    }

    // La foto se sube a Storage (nunca en base64 en la tabla),
    // mismo mecanismo que productos, mesas y alta de empleados.
    const fotoUrlSubida = await this.subirFoto(foto_url, `cliente-${data.user.id}`);

    // El registro público siempre crea un perfil 'cliente', sin
    // CUIL (el punto 5 del PDF no lo pide, solo DNI), y arranca
    // en 'pendiente' — login() ya rechaza a los que no estén
    // en estado 'aprobado'.
    const { data: usuarioCreado, error: errorInsert } = await this.supabaseService
      .getClient()
      .from('usuarios')
      .insert({
        id: data.user.id,
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

  async registrarAnonimo({ nombre, apellido, foto_url }: IRegistroAnonimo) {
    const { data, error } = await this.supabaseService.getClient().auth.signInAnonymously({
      options: {
        data: { nombre, apellido, foto_url },
      },
    });

    if (error || !data.user) {
      throw error ?? new Error('No se pudo registrar el usuario.');
    }
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

    const { error: errorSubida } = await client.storage
      .from(BUCKET_USUARIOS)
      .upload(ruta, blob, { contentType: blob.type });

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