import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
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
import { Haptics, NotificationType } from '@capacitor/haptics';
import { AuthService } from '../../../core/services/auth.service';
import { QrScannerService } from '../../../core/services/qr-scanner';
import { IRegistro } from '../../../core/models/usuario.model';

@Component({
  selector: 'app-registro',
  standalone: true,
  templateUrl: './registro.page.html',
  styleUrls: ['./registro.page.scss'],
  imports: [
    ReactiveFormsModule,
    IonContent,
    IonItem,
    IonInput,
    IonButton,
    IonSpinner,
    IonText,
  ],
})
export class RegistroPage {
  @ViewChild('inputFoto') inputFoto?: ElementRef<HTMLInputElement>;

  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private qrScannerService = inject(QrScannerService);
  private router = inject(Router);

  // Paso 1 = datos personales, paso 2 = credenciales.
  paso = signal<1 | 2>(1);
  cargando = signal(false);
  errorRegistro = signal<string | null>(null);
  fotoUrl = signal<string | null>(null);
  fotoIntentada = signal(false);

  private passwordsIgualesValidator: ValidatorFn = (
    group: AbstractControl,
  ): ValidationErrors | null => {
    const password = group.get('password');
    const repetirPassword = group.get('repetirPassword');

    if (!password || !repetirPassword) {
      return null;
    }

    if (repetirPassword.value && password.value !== repetirPassword.value) {
      repetirPassword.setErrors({
        ...repetirPassword.errors,
        passwordsNoCoinciden: true,
      });
    } else if (repetirPassword.hasError('passwordsNoCoinciden')) {
      const { passwordsNoCoinciden, ...otrosErrores } =
        repetirPassword.errors ?? {};
      repetirPassword.setErrors(
        Object.keys(otrosErrores).length ? otrosErrores : null,
      );
    }

    return null;
  };

  // Validador cross-field: verifica que los 8 dígitos del DNI
  // coincidan con las posiciones 2–9 del CUIL.
  // Estructura CUIL: XX + DNI(8 dígitos) + dígito verificador = 11 dígitos.
  private cuilMatchDniValidator: ValidatorFn = (
    group: AbstractControl,
  ): ValidationErrors | null => {
    const dni = (group.get('dni')?.value || '') as string;
    const cuil = (group.get('cuil')?.value || '') as string;

    if (!dni || !cuil || cuil.length !== 11 || !/^\d{8}$/.test(dni)) {
      return null;
    }

    const dniEnCuil = cuil.substring(2, 10);
    return dniEnCuil === dni ? null : { cuilNoMatchDni: true };
  };

  form = this.fb.group(
    {
      nombre: ['', [Validators.required]],
      apellido: ['', [Validators.required]],
      dni: ['', [Validators.required, Validators.pattern(/^\d{8}$/)]],
      cuil: ['', [Validators.required, Validators.pattern(/^\d{11}$/)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      repetirPassword: ['', [Validators.required]],
    },
    {
      validators: [this.passwordsIgualesValidator, this.cuilMatchDniValidator],
    },
  );

  // Controles que se piden en el paso 1 (datos personales).
  private readonly camposPaso1 = ['nombre', 'apellido', 'dni', 'cuil'] as const;

  elegirFoto(): void {
    this.inputFoto?.nativeElement.click();
  }

  onFotoSeleccionada(evento: Event): void {
    const archivo = (evento.target as HTMLInputElement).files?.[0];
    if (!archivo) {
      return;
    }

    const lector = new FileReader();
    lector.onload = () => this.fotoUrl.set(lector.result as string);
    lector.readAsDataURL(archivo);
  }

  async escanearDni(): Promise<void> {
    this.errorRegistro.set(null);
    const resultado = await this.qrScannerService.escanear();

    if (resultado && resultado.tipo === 'DNI') {
      const datos = resultado.valor;
      this.form.patchValue({
        apellido: datos.apellidos || '',
        nombre: datos.nombres || '',
        dni: datos.dni || '',
      });
      await Haptics.notification({ type: NotificationType.Success }).catch(
        () => {},
      );
    } else {
      this.errorRegistro.set(
        'No se detectó un formato válido de DNI argentino.',
      );
      await Haptics.notification({ type: NotificationType.Error }).catch(
        () => {},
      );
    }
  }

  // Valida solo los campos del paso 1 (incluida la foto y el
  // cruce DNI/CUIL) antes de habilitar el paso de credenciales.
  irACredenciales(): void {
    this.errorRegistro.set(null);
    this.fotoIntentada.set(true);

    for (const campo of this.camposPaso1) {
      this.form.get(campo)?.markAsTouched();
    }

    const camposInvalidos = this.camposPaso1.some(
      (campo) => this.form.get(campo)?.invalid,
    );
    const cuilNoCoincide = this.form.hasError('cuilNoMatchDni');

    if (camposInvalidos || cuilNoCoincide || !this.fotoUrl()) {
      return;
    }

    this.paso.set(2);
  }

  volverADatos(): void {
    this.errorRegistro.set(null);
    this.paso.set(1);
  }

  async registrarse(): Promise<void> {
    if (this.form.invalid || !this.fotoUrl()) {
      this.form.markAllAsTouched();
      this.fotoIntentada.set(true);
      return;
    }

    const { nombre, apellido, dni, cuil, email, password } =
      this.form.getRawValue();

    const datos: IRegistro = {
      nombre: nombre!,
      apellido: apellido!,
      dni: Number(dni),
      cuil: Number(cuil),
      email: email!,
      password: password!,
      foto_url: this.fotoUrl()!,
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
      await this.authService.registrarUsuario(datos);
      this.router.navigateByUrl('/auth/login');
    } catch (error) {
      this.errorRegistro.set(
        error instanceof Error
          ? error.message
          : 'No se pudo completar el registro.',
      );
    } finally {
      this.cargando.set(false);
    }
  }
}
