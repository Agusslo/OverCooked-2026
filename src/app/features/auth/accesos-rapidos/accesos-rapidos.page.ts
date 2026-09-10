import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonSpinner, IonText } from '@ionic/angular';
import { AuthService } from '../../../core/services/auth.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AccesoRapido } from '../auth.interfaces';
import { CLAVE_PRUEBA } from '../login/login.page';

@Component({
  selector: 'app-accesos-rapidos',
  templateUrl: './accesos-rapidos.page.html',
  styleUrls: ['./accesos-rapidos.page.scss'],
  imports: [IonContent, IonSpinner, IonText],
})
export class AccesosRapidosPage {
  private authService = inject(AuthService);
  private supabaseService = inject(SupabaseService);
  private router = inject(Router);

  cargando = signal(false);
  errorLogin = signal<string | null>(null);

  // Foto de perfil de cada acceso rápido (email → URL pública de Storage),
  // que se carga desde la tabla 'usuarios' al abrir la pantalla. Si la
  // consulta no trae la foto (RLS, usuario sin foto, etc.) se muestra la
  // inicial del perfil como fallback.
  fotos = signal<Record<string, string>>({});

  accesosRapidos: AccesoRapido[] = [
    { perfil: 'Dueño', email: 'dueno@restaurante.com', icono: 'person-circle', descripcion: 'Gestión del restaurante' },
    { perfil: 'Supervisor', email: 'supervisor@restaurante.com', icono: 'shield-checkmark', descripcion: 'Control de operaciones' },
    { perfil: 'Metre', email: 'metre@restaurante.com', icono: 'people', descripcion: 'Recepción y coordinación' },
    { perfil: 'Mozo', email: 'mozo@restaurante.com', icono: 'restaurant', descripcion: 'Atención al cliente' },
    { perfil: 'Cantinero', email: 'cantinero@restaurante.com', icono: 'wine', descripcion: 'Bebidas y servicio' },
    { perfil: 'Cocinero', email: 'cocinero@restaurante.com', icono: 'flame', descripcion: 'Preparación de platos' },
    { perfil: 'Cliente', email: 'cliente@restaurante.com', icono: 'person', descripcion: 'Cliente registrado de prueba' },
  ];

  constructor() {
    void this.cargarFotos();
  }

  // Inicial del perfil para el círculo cuando todavía no hay foto.
  inicial(acceso: AccesoRapido): string {
    return acceso.perfil.charAt(0).toUpperCase();
  }

  private async cargarFotos(): Promise<void> {
    try {
      const emails = this.accesosRapidos.map((a) => a.email);
      const { data, error } = await this.supabaseService
        .getClient()
        .from('usuarios')
        .select('email, foto_url')
        .in('email', emails);

      if (error || !data) {
        return;
      }

      const mapa: Record<string, string> = {};
      for (const fila of data) {
        if (fila.foto_url) {
          mapa[fila.email] = fila.foto_url;
        }
      }
      this.fotos.set(mapa);
    } catch (error) {
      console.warn('No se pudieron cargar las fotos de los accesos rápidos:', error);
    }
  }

  async accederRapido(acceso: AccesoRapido): Promise<void> {
    this.errorLogin.set(null);
    this.cargando.set(true);

    try {
      await this.authService.login(acceso.email, CLAVE_PRUEBA);
      this.router.navigateByUrl('/inicio');
    } catch (error) {
      this.errorLogin.set(
        error instanceof Error ? error.message : 'No se pudo iniciar sesión.'
      );
    } finally {
      this.cargando.set(false);
    }
  }
}
