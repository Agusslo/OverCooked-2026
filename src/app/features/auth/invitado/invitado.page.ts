import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
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
import { IRegistroAnonimo } from '../../../core/models/usuario.model';

@Component({
  selector: 'app-invitado',
  standalone: true,
  templateUrl: './invitado.page.html',
  styleUrls: ['./invitado.page.scss'],
  imports: [ReactiveFormsModule, IonContent, IonItem, IonInput, IonButton, IonSpinner, IonText],
})
export class InvitadoPage {
  @ViewChild('inputFoto') inputFoto?: ElementRef<HTMLInputElement>;

  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  cargando = signal(false);
  errorInvitado = signal<string | null>(null);
  fotoUrl = signal<string | null>(null);

  form = this.fb.group({
    nombre: ['', [Validators.required]],
    apellido: ['', [Validators.required]],
  });

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

  async continuar(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { nombre, apellido } = this.form.getRawValue();

    const datos: IRegistroAnonimo = {
      nombre: nombre!,
      apellido: apellido!,
      foto_url: this.fotoUrl() ?? '',
      perfil: "anonimo"
    };

    await this.intentarRegistroAnonimo(datos);
  }

  volverAlLogin(): void {
    this.router.navigateByUrl('/auth/login');
  }

  private async intentarRegistroAnonimo(datos: IRegistroAnonimo): Promise<void> {
    this.errorInvitado.set(null);
    this.cargando.set(true);

    try {
      await this.authService.registrarAnonimo(datos);
      this.router.navigateByUrl('/inicio');
    } catch (error) {
      this.errorInvitado.set(
        error instanceof Error ? error.message : 'No se pudo continuar como invitado.'
      );
    } finally {
      this.cargando.set(false);
    }
  }
}
