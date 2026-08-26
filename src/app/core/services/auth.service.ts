import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { Usuario } from '../models/usuario.model';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  // Un BehaviorSubject es una "caja" que guarda el último valor
  // conocido y avisa a quien esté escuchando cada vez que ese
  // valor cambia. Lo usamos para que cualquier parte de la app
  // (por ejemplo, un guard que proteja rutas) pueda saber en
  // todo momento quién es el usuario logueado, sin tener que
  // volver a consultar la base cada vez.
  private usuarioActualSubject = new BehaviorSubject<Usuario | null>(null);
  usuarioActual$ = this.usuarioActualSubject.asObservable();

  constructor(private supabaseService: SupabaseService) {
    this.restaurarSesion();
  }

  // Si el usuario ya tenía una sesión abierta (por ejemplo,
  // cerró la app sin desloguearse), Supabase la guarda en el
  // dispositivo. Al arrancar la app, recuperamos esos datos acá.
  private async restaurarSesion(): Promise<void> {
    const { data } = await this.supabaseService.getClient().auth.getSession();

    if (data.session) {
      const usuario = await this.obtenerUsuarioPorId(data.session.user.id);
      this.usuarioActualSubject.next(usuario);
    }
  }

  // async/await es la forma de trabajar con operaciones que
  // tardan (como pedirle algo a Supabase por internet) sin
  // bloquear el resto de la app mientras se espera la
  // respuesta. "await" pausa esta función puntual hasta que la
  // operación termina, pero el resto de la aplicación sigue
  // funcionando mientras tanto.
  async login(email: string, clave: string): Promise<Usuario> {
    const { data, error } = await this.supabaseService
      .getClient()
      .auth.signInWithPassword({ email, password: clave });

    // Cuando Supabase devuelve un error (por ejemplo, contraseña
    // incorrecta), "error" viene con datos y "data" viene vacío.
    // "throw" corta la ejecución acá mismo y le pasa el error a
    // quien llamó a login(), para que el componente lo muestre.
    if (error || !data.user) {
      throw new Error('Correo o contraseña incorrectos.');
    }

    const usuario = await this.obtenerUsuarioPorId(data.user.id);

    // Un cliente registrado que todavía no fue aprobado (o que
    // fue rechazado) no puede entrar a la app, aunque el login
    // en sí haya sido correcto (puntos 5 a 8 del PDF).
    if (usuario.estado !== 'aprobado') {
      await this.logout();
      throw new Error(
        'Tu registro todavía no fue aprobado por el restaurante.'
      );
    }

    this.usuarioActualSubject.next(usuario);
    return usuario;
  }

  async logout(): Promise<void> {
    await this.supabaseService.getClient().auth.signOut();
    this.usuarioActualSubject.next(null);
  }

  // Trae de la tabla "usuarios" los datos del perfil que
  // corresponden al id que devuelve Supabase Auth. El login de
  // Auth solo confirma la contraseña; los datos de negocio
  // (nombre, perfil, estado) viven en nuestra propia tabla.
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