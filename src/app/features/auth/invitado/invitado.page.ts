import {
  Component,
  ElementRef,
  ViewChild,
  ChangeDetectorRef,
  OnDestroy,
  inject,
  signal,
} from '@angular/core';
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
import { Haptics, NotificationType } from '@capacitor/haptics';
import { AuthService } from '../../../core/services/auth.service';
import { IRegistroAnonimo } from '../../../core/models/usuario.model';
import {
  abrirCamaraWeb,
  capturarFotoWeb,
  detenerCamaraWeb,
  esPlataformaNativa,
  tomarFotoNativa,
} from '../../utils/cameraUtils';

@Component({
  selector: 'app-invitado',
  standalone: true,
  templateUrl: './invitado.page.html',
  styleUrls: ['./invitado.page.scss'],
  imports: [ReactiveFormsModule, IonContent, IonItem, IonInput, IonButton, IonSpinner, IonText],
})
export class InvitadoPage implements OnDestroy {
  @ViewChild('videoCamara') videoCamara?: ElementRef<HTMLVideoElement>;

  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  cargando = signal(false);
  errorInvitado = signal<string | null>(null);
  fotoUrl = signal<string | null>(null);
  camaraActiva = signal(false);
  fotoIntentada = signal(false);

  private abriendoCamara = false;
  private streamCamara?: MediaStream;

  form = this.fb.group({
    nombre: ['', [Validators.required]],
    apellido: ['', [Validators.required]],
  });

  ngOnDestroy(): void {
    this.detenerCamara();
  }

  async tomarFoto(): Promise<void> {
    try {
      if (!esPlataformaNativa()) {
        await this.iniciarCamaraWeb();
        return;
      }

      const foto = await tomarFotoNativa();
      if (foto) {
        this.fotoUrl.set(foto);
      }
    } catch (error) {
      console.warn('Captura cancelada o error al tomar foto:', error);
    }
  }

  elegirFoto(): Promise<void> {
    return this.tomarFoto();
  }

  private async iniciarCamaraWeb(): Promise<void> {
    if (this.abriendoCamara || this.camaraActiva()) {
      return;
    }

    this.abriendoCamara = true;
    try {
      this.camaraActiva.set(true);
      this.cdr.detectChanges();

      this.streamCamara = await abrirCamaraWeb(this.videoCamara);
    } catch (error) {
      console.warn('No se pudo acceder a la cámara:', error);
      this.errorInvitado.set('No se pudo acceder a la cámara.');
      this.detenerCamara();
    } finally {
      this.abriendoCamara = false;
    }
  }

  capturarFoto(): void {
    const dataUrl = capturarFotoWeb(this.videoCamara);
    if (dataUrl) {
      this.fotoUrl.set(dataUrl);
    }
    this.detenerCamara();
  }

  cancelarCamara(): void {
    this.detenerCamara();
  }

  private detenerCamara(): void {
    detenerCamaraWeb(this.streamCamara);
    this.streamCamara = undefined;
    this.camaraActiva.set(false);
  }

  async continuar(): Promise<void> {
    // La foto es obligatoria para ingresar como invitado.
    if (this.form.invalid || !this.fotoUrl()) {
      this.form.markAllAsTouched();
      this.fotoIntentada.set(true);
      await Haptics.notification({ type: NotificationType.Error }).catch(() => {});
      return;
    }

    const { nombre, apellido } = this.form.getRawValue();

    const datos: IRegistroAnonimo = {
      nombre: nombre!,
      apellido: apellido!,
      foto_url: this.fotoUrl()!,
      perfil: 'anonimo',
    };

    this.errorInvitado.set(null);
    this.cargando.set(true);

    try {
      await this.authService.registrarAnonimo(datos);
      this.router.navigateByUrl('/inicio');
    } catch (error) {
      await this.dispararError(
        error instanceof Error ? error.message : 'No se pudo continuar como invitado.',
      );
    } finally {
      this.cargando.set(false);
    }
  }

  volverAlLogin(): void {
    this.router.navigateByUrl('/auth/login');
  }

  private async dispararError(texto: string): Promise<void> {
    this.errorInvitado.set(texto);
    try {
      await Haptics.notification({ type: NotificationType.Error });
    } catch {}
  }
}