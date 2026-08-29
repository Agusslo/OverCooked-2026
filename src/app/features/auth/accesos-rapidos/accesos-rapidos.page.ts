import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonChip, IonIcon, IonLabel, IonSpinner, IonText } from '@ionic/angular';
import { AuthService } from '../../../core/services/auth.service';
import { AccesoRapido } from '../auth.interfaces';
import { CLAVE_PRUEBA } from '../login/login.page';

@Component({
  selector: 'app-accesos-rapidos',
  templateUrl: './accesos-rapidos.page.html',
  styleUrls: ['./accesos-rapidos.page.scss'],
  imports: [IonContent, IonChip, IonIcon, IonLabel, IonSpinner, IonText],
})
export class AccesosRapidosPage {
  private authService = inject(AuthService);
  private router = inject(Router);

  cargando = signal(false);
  errorLogin = signal<string | null>(null);

  accesosRapidos: AccesoRapido[] = [
    { perfil: 'Dueño', email: 'dueno@restaurante.com', icono: 'person-circle' },
    { perfil: 'Supervisor', email: 'supervisor@restaurante.com', icono: 'shield-checkmark' },
    { perfil: 'Metre', email: 'metre@restaurante.com', icono: 'people' },
    { perfil: 'Mozo', email: 'mozo@restaurante.com', icono: 'restaurant' },
    { perfil: 'Cantinero', email: 'cantinero@restaurante.com', icono: 'wine' },
    { perfil: 'Cocinero', email: 'cocinero@restaurante.com', icono: 'flame' },
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
