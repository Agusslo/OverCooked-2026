import { Component, Input, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

// Encabezado común de todas las pantallas de inicio (avatar + rol +
// nombre + cerrar sesión). El diseño es el del panel del dueño; el
// resto de los inicios lo reusan para que se vea igual en todos.
@Component({
  selector: 'app-header-inicio',
  standalone: true,
  templateUrl: './header-inicio.component.html',
  styleUrls: ['./header-inicio.component.scss'],
})
export class HeaderInicioComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  // Rótulo chico arriba del nombre ("Dueño", "Cliente"…). Si no se pasa,
  // se usa el perfil del usuario.
  @Input() rol = '';

  get usuario() {
    return this.authService.usuarioActual;
  }

  get rolMostrado(): string {
    return this.rol || (this.usuario?.perfil ?? '');
  }

  get nombre(): string {
    return this.usuario?.nombre ?? '';
  }

  get fotoUrl(): string {
    return this.usuario?.foto_url ?? '';
  }

  get iniciales(): string {
    const u = this.usuario;
    return `${u?.nombre?.[0] ?? ''}${u?.apellido?.[0] ?? ''}`.toUpperCase();
  }

  async cerrarSesion(): Promise<void> {
    await this.authService.logout();
    this.router.navigateByUrl('/auth/login');
  }
}
