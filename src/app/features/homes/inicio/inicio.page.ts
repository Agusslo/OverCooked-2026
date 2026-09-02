import { Component, OnInit, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { AuthService } from '../../../core/services/auth.service';
import { PushNotificationsService } from '../../../core/services/push-notifications.service';
import { panelPara } from '../../../core/models/inicio.model';

// Perfiles que ven "Clientes pendientes" y por lo tanto son quienes
// tienen que enterarse por push cuando llega un registro nuevo
// (punto 6 del PDF).
const PERFILES_NOTIFICABLES = ['dueño', 'supervisor'];

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
