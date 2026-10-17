import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonItem, IonInput, IonButton, IonText } from '@ionic/angular';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  imports: [ReactiveFormsModule, IonContent, IonItem, IonInput, IonButton, IonText],
})
export class LoginPage {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  cargando = signal(false);
  errorLogin = signal<string | null>(null);

  mostrarClave = signal(false);

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    clave: ['', [Validators.required, Validators.minLength(6)]],
  });



  async iniciarSesion(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { email, clave } = this.form.getRawValue();
    await this.intentarLogin(email!, clave!);
  }

  toggleMostrarClave(): void {
    this.mostrarClave.update((valor) => !valor);
  }

  irAccesosRapidos(): void {
    this.router.navigateByUrl('/auth/accesos-rapidos');
  }

  irRegistro(): void {
    this.router.navigateByUrl('/auth/registro');
  }
  
  irAnonimo(): void {
    this.router.navigateByUrl('/auth/invitado');
  }

  ionViewWillLeave(): void {
    this.form.reset();
    this.errorLogin.set(null);
    this.mostrarClave.set(false);
  }

  private async intentarLogin(email: string, clave: string): Promise<void> {
    this.errorLogin.set(null);
    this.cargando.set(true);

    try {
      await this.authService.login(email, clave);
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