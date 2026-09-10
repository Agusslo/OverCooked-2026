import { Component, OnInit, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { AuthService } from '../../../core/services/auth.service';
import { PushNotificationsService } from '../../../core/services/push-notifications.service';
import { panelPara } from '../../../core/models/inicio.model';
import { SalaEsperaComponent } from '../../cliente/sala-espera/sala-espera.component';
import { HeaderInicioComponent } from '../../../shared/header-inicio/header-inicio.component';

// Perfiles que reciben alguna push notification: dueño/supervisor por
// los clientes pendientes (punto 6), cliente por la asignación de su
// mesa (punto 10) y el pedido (punto 12), metre por la lista de espera
// y mozo por los pedidos nuevos.
const PERFILES_NOTIFICABLES = ['dueño', 'supervisor', 'cliente', 'metre', 'mozo'];

// Perfiles cuyo "inicio" es la sala de espera / pedido (punto 12), no el
// panel de accesos.
const PERFILES_SALA_ESPERA = ['cliente', 'anonimo'];


@Component({
  selector: 'app-inicio',
  standalone: true,
  templateUrl: './inicio.page.html',
  styleUrls: ['./inicio.page.scss'],
  imports: [IonContent, RouterLink, SalaEsperaComponent, HeaderInicioComponent],
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

  // El cliente (registrado o anónimo) ve la sala de espera; el resto de
  // los perfiles ve el panel de accesos.
  get esClienteOAnonimo(): boolean {
    return !!this.usuario && PERFILES_SALA_ESPERA.includes(this.usuario.perfil);
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
