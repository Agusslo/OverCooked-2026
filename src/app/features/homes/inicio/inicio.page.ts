import { Component, OnInit, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { AuthService } from '../../../core/services/auth.service';
import { PushNotificationsService } from '../../../core/services/push-notifications.service';
import { panelPara } from '../../../core/models/inicio.model';

// Perfiles que reciben alguna push notification: dueño/supervisor por
// los clientes pendientes (punto 6) y cliente por la asignación de su
// mesa (punto 10). El resto de los perfiles todavía no tiene ningún
// push propio.
const PERFILES_NOTIFICABLES = ['dueño', 'supervisor', 'cliente'];

@Component({
  selector: 'app-inicio',
  standalone: true,
  templateUrl: './inicio.page.html',
  styleUrls: ['./inicio.page.scss'],
  imports: [IonContent, RouterLink],
})
export class InicioPage implements OnInit {
  private authService = inject(AuthService);
  private pushNotificationsService = inject(PushNotificationsService);
  private router = inject(Router);

  ngOnInit(): void {
    const usuario = this.usuario;
    if (usuario && PERFILES_NOTIFICABLES.includes(usuario.perfil)) {
      void this.pushNotificationsService.inicializar(usuario.id);
    }
  }

  // "usuarioActual" es un getter del AuthService (no un método):
  // se lee como una propiedad normal (this.authService.usuarioActual)
  // en vez de con paréntesis, y siempre devuelve el usuario más
  // reciente que haya guardado el servicio.
  get usuario() {
    return this.authService.usuarioActual;
  }

  // Panel (rol, título y accesos) que corresponde al perfil del
  // usuario logueado. Si el perfil todavía no tiene panel definido,
  // devuelve null y el template muestra sólo el encabezado.
  get panel() {
    return panelPara(this.usuario?.perfil);
  }

  // Iniciales para el avatar cuando no hay foto de perfil.
  get iniciales(): string {
    const u = this.usuario;
    if (!u) return '';
    return `${u.nombre?.[0] ?? ''}${u.apellido?.[0] ?? ''}`.toUpperCase();
  }

  async cerrarSesion(): Promise<void> {
    await this.authService.logout();
    this.router.navigateByUrl('/auth/login');
  }
}
