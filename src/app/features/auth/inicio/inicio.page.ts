import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonContent,
  IonButton,
  IonIcon,
  IonAvatar,
} from '@ionic/angular';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-inicio',
  standalone: true,
  templateUrl: './inicio.page.html',
  styleUrls: ['./inicio.page.scss'],
  imports: [CommonModule, IonContent, IonButton, IonIcon, IonAvatar],
})
export class InicioPage {
  private authService = inject(AuthService);
  private router = inject(Router);

  // "usuarioActual" es un getter del AuthService (no un método):
  // se lee como una propiedad normal (this.authService.usuarioActual)
  // en vez de con paréntesis, y siempre devuelve el usuario más
  // reciente que haya guardado el servicio.
  get usuario() {
    return this.authService.usuarioActual;
  }

  async cerrarSesion(): Promise<void> {
    await this.authService.logout();
    this.router.navigateByUrl('/login');
  }
}