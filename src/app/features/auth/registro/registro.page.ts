import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonContent,
  IonItem,
  IonInput,
  IonButton,
  IonSpinner,
  IonText,
} from '@ionic/angular';
import { AuthService } from '../../../core/services/auth.service';
import { IRegistro } from '../../../core/models/usuario.model';

@Component({
  selector: 'app-registro',
  standalone: true,
  templateUrl: './registro.page.html',
  styleUrls: ['./registro.page.scss'],
  imports: [ReactiveFormsModule, IonContent, IonItem, IonInput, IonButton, IonSpinner, IonText],
})
export class RegistroPage {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  cargando = signal(false);
  errorRegistro = signal<string | null>(null);

  private passwordsIgualesValidator: ValidatorFn = (
    group: AbstractControl
  ): ValidationErrors | null => {
    const password = group.get('password');
    const repetirPassword = group.get('repetirPassword');

    if (!password || !repetirPassword) {
      return null;
    }

    if (repetirPassword.value && password.value !== repetirPassword.value) {
      repetirPassword.setErrors({ ...repetirPassword.errors, passwordsNoCoinciden: true });
    } else if (repetirPassword.hasError('passwordsNoCoinciden')) {
      const { passwordsNoCoinciden, ...otrosErrores } = repetirPassword.errors ?? {};
      repetirPassword.setErrors(Object.keys(otrosErrores).length ? otrosErrores : null);
    }

    return null;
  };

  form = this.fb.group(
    {
      nombre: ['', [Validators.required]],
      apellido: ['', [Validators.required]],
      dni: ['', [Validators.required, Validators.pattern(/^\d{7,8}$/)]],
      cuil: ['', [Validators.required, Validators.pattern(/^\d{11}$/)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      repetirPassword: ['', [Validators.required]],
      foto_url: [''], // Revisar que onda
    },
    { validators: this.passwordsIgualesValidator }
  );

  async registrarse(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { nombre, apellido, dni, cuil, email, password, foto_url } = this.form.getRawValue();

    const datos: IRegistro = {
      nombre: nombre!,
      apellido: apellido!,
      dni: Number(dni),
      cuil: Number(cuil),
      email: email!,
      password: password!,
      foto_url: foto_url ?? '', // Revisar que onda
    };

    await this.intentarRegistro(datos);
  }

  volverAlLogin(): void {
    this.router.navigateByUrl('/auth/login');
  }

  private async intentarRegistro(datos: IRegistro): Promise<void> {
    this.errorRegistro.set(null);
    this.cargando.set(true);

    try {
      await this.authService.registrarUser(datos);
      this.router.navigateByUrl('/auth/login');
    } catch (error) {
      this.errorRegistro.set(
        error instanceof Error ? error.message : 'No se pudo completar el registro.'
      );
    } finally {
      this.cargando.set(false);
    }
  }
}
