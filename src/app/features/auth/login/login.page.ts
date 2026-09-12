import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonItem, IonInput, IonButton, IonSpinner, IonText } from '@ionic/angular';
import { AuthService } from '../../../core/services/auth.service';

// Contraseña compartida por los usuarios de PRUEBA que van a
// cargar en la base de datos (dueño, supervisor, metre, etc.).
// Cuando armen ese script de datos iniciales, tiene que usar
// esta misma contraseña para que los accesos rápidos funcionen.
export const CLAVE_PRUEBA = 'Password123';

@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  imports: [ReactiveFormsModule, IonContent, IonItem, IonInput, IonButton, IonSpinner, IonText],
})
export class LoginPage {
  // "inject()" es una forma alternativa de pedirle a Angular
  // que te dé una instancia de un servicio, sin tener que
  // declararlo como parámetro del constructor. Hace lo mismo
  // que el constructor tradicional, es solo otra sintaxis.
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  // Un "signal" es una variable especial de Angular: cuando su
  // valor cambia (con .set()), Angular actualiza sola la parte
  // de la pantalla que lo usa, sin que vos tengas que avisarle.
  // Para leer el valor actual se lo llama como función: cargando().
  cargando = signal(false);
  errorLogin = signal<string | null>(null);

  mostrarClave = signal(false);
  // Un FormGroup junta varios campos de formulario (FormControl)
  // bajo un mismo objeto. El array de cada campo es
  // [valorInicial, listaDeValidadores]. Validators.required
  // exige que no esté vacío; Validators.email exige formato de
  // correo válido; Validators.minLength(6) exige un mínimo de
  // caracteres en la contraseña.
  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    clave: ['', [Validators.required, Validators.minLength(6)]],
  });



  async iniciarSesion(): Promise<void> {
    if (this.form.invalid) {
      // markAllAsTouched() hace que Angular muestre los mensajes
      // de error de todos los campos, aunque el usuario todavía
      // no haya hecho clic en ellos. Sin esto, si alguien aprieta
      // "Ingresar" con el formulario recién abierto, no vería
      // ningún error hasta tocar cada campo a mano.
      this.form.markAllAsTouched();
      return;
    }

    const { email, clave } = this.form.getRawValue();
    // El "!" le dice a TypeScript "confío en que esto no es
    // null acá". Es seguro usarlo en este punto porque ya
    // verificamos arriba que el formulario es válido, así que
    // los campos obligatorios no pueden estar vacíos.
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

  // Ionic llama a este hook cada vez que la página deja de estar
  // visible (se navega a otra pestaña/ruta o se vuelve atrás),
  // incluso si la instancia del componente se mantiene viva en el
  // stack. Lo usamos para limpiar los datos ingresados y que no
  // queden expuestos al volver a entrar a /auth/login.
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