import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { IRegistro, Usuario } from '../models/usuario.model';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
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

  async registrarUser({ nombre, apellido, dni, cuil, email, password, foto_url }: IRegistro): Promise<Usuario> {
    const { data, error } = await this.supabaseService.getClient().auth.signUp({
      options: {
        data: {
          nombre: nombre,
          apellido: apellido,
          dni: dni,
          cuil: cuil,
          foto_url: foto_url,
        }
      },
      email: email,
      password: password,
    });

    if (error || !data.user) {
      throw error ?? new Error('No se pudo registrar el usuario.');
    }

    const usuario = await this.obtenerUsuarioPorId(data.user.id);
    this.usuarioActualSubject.next(usuario);

    return usuario;
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