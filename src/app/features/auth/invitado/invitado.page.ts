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
import { QrScannerService } from '../../../core/services/qr-scanner';
import { ListaEsperaService } from '../../../core/services/lista-espera.service';
import { IRegistroAnonimo, Usuario } from '../../../core/models/usuario.model';
import { Capacitor } from '@capacitor/core';
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
  private qrScannerService = inject(QrScannerService);
  private listaEsperaService = inject(ListaEsperaService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  // paso 1 = datos personales, paso 2 = escanear el QR de ingreso
  paso = signal<1 | 2>(1);
  cargando = signal(false);
  errorInvitado = signal<string | null>(null);
  fotoUrl = signal<string | null>(null);
  camaraActiva = signal(false);

  private usuarioAnonimo: Usuario | null = null;

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

  // Paso 1 -> paso 2: registra la cuenta anónima y pasa a pedir el
  // escaneo del QR de ingreso. Todavía no lo anota en la lista de
  // espera — eso pasa recién cuando escanea (siguiente método).
  async continuar(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      await Haptics.notification({ type: NotificationType.Error }).catch(() => {});
      return;
    }

    const { nombre, apellido } = this.form.getRawValue();

    const datos: IRegistroAnonimo = {
      nombre: nombre!,
      apellido: apellido!,
      foto_url: this.fotoUrl() ?? '',
      perfil: 'anonimo',
    };

    this.errorInvitado.set(null);
    this.cargando.set(true);

    try {
      this.usuarioAnonimo = await this.authService.registrarAnonimo(datos);
      this.paso.set(2);
    } catch (error) {
      await this.dispararError(
        error instanceof Error ? error.message : 'No se pudo continuar como invitado.',
      );
    } finally {
      this.cargando.set(false);
    }
  }

  // Punto 9: escanea el QR fijo de ingreso al local y recién ahí
  // queda anotado en la lista de espera del metre.
  async escanearIngreso(): Promise<void> {
    this.errorInvitado.set(null);
    this.cargando.set(true);

    try {
      const resultado = await this.qrScannerService.escanear();

      console.log('[escanearIngreso] resultado:', JSON.stringify(resultado));

      if (!resultado) {
        await this.dispararError(
          'No se pudo escanear. Asegurate de que la app tenga permisos de cámara y volvé a intentar.',
        );
        return;
      }

      if (resultado.tipo !== 'LOCAL') {
        await this.dispararError(
          `Ese QR no es el de ingreso al local. Se leyó: "${resultado.tipo}" → "${resultado.valor}"`,
        );
        return;
      }

      if (!this.usuarioAnonimo) {
        await this.dispararError('Se perdió la sesión, volvé a intentar desde el principio.');
        return;
      }

      await this.listaEsperaService.anotarse({
        clienteAnonimoId: this.usuarioAnonimo.id,
        nombre: `${this.usuarioAnonimo.nombre} ${this.usuarioAnonimo.apellido}`.trim(),
        fotoUrl: this.usuarioAnonimo.foto_url,
      });
      await Haptics.notification({ type: NotificationType.Success }).catch(() => {});
      this.router.navigateByUrl('/inicio');
    } catch (error) {
      console.error('[escanearIngreso] error:', error);
      await this.dispararError(
        error instanceof Error ? error.message : 'No se pudo completar el escaneo.',
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