import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonSpinner, IonText } from '@ionic/angular';
import { AuthService } from '../../../core/services/auth.service';
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
  private router = inject(Router);

  cargando = signal(false);
  errorLogin = signal<string | null>(null);

  accesosRapidos: AccesoRapido[] = [
    { perfil: 'Dueño', email: 'dueno@restaurante.com', icono: 'person-circle', descripcion: 'Gestión del restaurante' },
    { perfil: 'Supervisor', email: 'supervisor@restaurante.com', icono: 'shield-checkmark', descripcion: 'Control de operaciones' },
    { perfil: 'Metre', email: 'metre@restaurante.com', icono: 'people', descripcion: 'Recepción y coordinación' },
    { perfil: 'Mozo', email: 'mozo@restaurante.com', icono: 'restaurant', descripcion: 'Atención al cliente' },
    { perfil: 'Cantinero', email: 'cantinero@restaurante.com', icono: 'wine', descripcion: 'Bebidas y servicio' },
    { perfil: 'Cocinero', email: 'cocinero@restaurante.com', icono: 'flame', descripcion: 'Preparación de platos' },
  ];

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
