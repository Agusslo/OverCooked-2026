import { inject, Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { MailService } from './mail.service';
import { IRegistro, IRegistroAnonimo, Usuario } from '../models/usuario.model';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  router = inject(Router);
  private mailService = inject(MailService);

  private usuarioActualSubject = new BehaviorSubject<Usuario | null>(null);
  usuarioActual$ = this.usuarioActualSubject.asObservable();

  // Se resuelve cuando termina el chequeo inicial de sesión (al
  // arrancar la app). Los guards lo esperan (`await`) antes de
  // decidir si dejan pasar a una ruta, para no rechazar por error
  // a alguien que en realidad sí tiene sesión activa pero cuya
  // consulta a Supabase todavía estaba en curso.
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

  async registrarUsuario({ nombre, apellido, dni, cuil, email, password, foto_url }: IRegistro): Promise<Usuario> {
    const { data, error } = await this.supabaseService.getClient().auth.signUp({
      email,
      password,
    });

    if (error || !data.user) {
      throw error ?? new Error('No se pudo registrar el usuario.');
    }

    // El registro público siempre crea un perfil 'cliente', y
    // arranca en 'pendiente' — coincide con lo que pide el PDF:
    // un cliente registrado necesita que el dueño o supervisor
    // lo apruebe antes de poder loguearse (login() ya rechaza a
    // los que no están en estado 'aprobado').
    const { data: usuarioCreado, error: errorInsert } = await this.supabaseService
      .getClient()
      .from('usuarios')
      .insert({
        id: data.user.id,
        nombre,
        apellido,
        dni: String(dni),
        cuil: String(cuil),
        email,
        perfil: 'cliente',
        foto_url,
        estado: 'pendiente',
      })
      .select()
      .single();

    if (errorInsert || !usuarioCreado) {
      throw new Error(
        errorInsert?.message ?? 'No se pudo guardar el usuario en la base de datos.'
      );
    }

    // Aviso automático de "registro pendiente de aprobación".
    // Si el correo falla, no queremos tirar abajo el registro:
    // el usuario ya quedó creado y el dueño/supervisor lo va a
    // ver igual en la lista de pendientes.
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
        data: {
          nombre: nombre,
          apellido: apellido,
          foto_url: foto_url
        }
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

  get usuarioActual(): Usuario | null {
    return this.usuarioActualSubject.value;
  }
}