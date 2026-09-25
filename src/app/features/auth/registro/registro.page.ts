import {
  Component,
  ElementRef,
  ViewChild,
  ChangeDetectorRef,
  OnInit,
  AfterViewInit,
  OnDestroy,
  inject,
  signal,
  computed,
} from '@angular/core';
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
  IonText,
} from '@ionic/angular';
import { Camera, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { Keyboard } from '@capacitor/keyboard';
import type { PluginListenerHandle } from '@capacitor/core';
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
    IonText,
  ],
})
export class RegistroPage implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('videoCamara') videoCamara?: ElementRef<HTMLVideoElement>;
  @ViewChild('shell') shell?: ElementRef<HTMLDivElement>;

  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private qrScannerService = inject(QrScannerService);
  private router = inject(Router);
  private changeDetectorRef = inject(ChangeDetectorRef);

  paso = signal<1 | 2>(1);
  cargando = signal(false);
  errorRegistro = signal<string | null>(null);
  fotoUrl = signal<string | null>(null);
  fotoIntentada = signal(false);
  camaraActiva = signal(false);
  // El scroll de la página sólo se habilita mientras el teclado está
  // abierto (para poder llegar a los campos que tapa); el resto del
  // tiempo la pantalla no tiene que scrollear. El plugin Keyboard no
  // tiene implementación web (tira error en navegador), así que ahí
  // se deja scrollear siempre — la restricción es sólo para la app nativa.
  tecladoAbierto = signal(!Capacitor.isNativePlatform());
  // Red de seguridad: si por lo que sea el contenido no entra en la
  // pantalla (ej. se muestran varios errores de validación a la vez),
  // se habilita el scroll igual aunque el teclado esté cerrado, para
  // que nunca quede algo inalcanzable.
  mostrarPassword = signal(false);
  mostrarRepetirPassword = signal(false);
  private contenidoDesborda = signal(false);
  permitirScroll = computed(() => this.tecladoAbierto() || this.contenidoDesborda());

  private abriendoCamara = false;
  private streamCamara?: MediaStream;
  private listenerTecladoShow?: PluginListenerHandle;
  private listenerTecladoHide?: PluginListenerHandle;
  private resizeObserver?: ResizeObserver;

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

  form = this.fb.group(
    {
      nombre: ['', [Validators.required]],
      apellido: ['', [Validators.required]],
      dni: ['', [Validators.required, Validators.pattern(/^\d{7,8}$/)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      repetirPassword: ['', [Validators.required]],
    },
    {
      validators: [this.passwordsIgualesValidator],
    },
  );

  private readonly camposPaso1 = ['nombre', 'apellido', 'dni'] as const;

  async ngOnInit(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    this.listenerTecladoShow = await Keyboard.addListener('keyboardWillShow', () => {
      this.tecladoAbierto.set(true);
    });
    this.listenerTecladoHide = await Keyboard.addListener('keyboardWillHide', () => {
      this.tecladoAbierto.set(false);
    });
  }

  ngAfterViewInit(): void {
    const el = this.shell?.nativeElement;
    if (!el) {
      return;
    }

    const chequearDesborde = () => {
      this.contenidoDesborda.set(el.scrollHeight > window.innerHeight);
    };

    this.resizeObserver = new ResizeObserver(chequearDesborde);
    this.resizeObserver.observe(el);
    chequearDesborde();
  }

  ngOnDestroy() {
    this.detenerCamara();
    this.listenerTecladoShow?.remove();
    this.listenerTecladoHide?.remove();
    this.resizeObserver?.disconnect();
  }

  sanitizarDni(event: CustomEvent<{ value?: string | null }>): void {
    const valor = event.detail?.value ?? '';
    const dni = valor.replace(/\D/g, '').slice(0, 8);

    if (dni !== valor) {
      this.form.controls.dni.setValue(dni, { emitEvent: false });
    }
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
      await this.dispararError(
        'No se detectó un formato válido de DNI argentino.',
      );
    }
  }

  async tomarFoto() {
    try {
      if (!Capacitor.isNativePlatform()) {
        await this.abrirCamaraWeb();
        return;
      }

      const image = await Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: 'dataUrl' as any,
        source: CameraSource.Camera,
      });

      this.fotoUrl.set(image.dataUrl || null);
    } catch (error) {
      console.warn('Captura cancelada:', error);
    }
  }

  private async abrirCamaraWeb() {
    if (this.abriendoCamara || this.camaraActiva()) {
      return;
    }

    this.abriendoCamara = true;
    try {
      this.streamCamara = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      this.camaraActiva.set(true);
      this.changeDetectorRef.detectChanges();

      const video = this.videoCamara?.nativeElement;
      if (video) {
        video.srcObject = this.streamCamara;
        await video.play();
      }
    } catch (error) {
      console.warn('No se pudo acceder a la cámara:', error);
      await this.dispararError('No se pudo acceder a la cámara.');
    } finally {
      this.abriendoCamara = false;
    }
  }

  capturarFoto() {
    const video = this.videoCamara?.nativeElement;
    if (!video || !video.videoWidth || !video.videoHeight) {
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    this.fotoUrl.set(canvas.toDataURL('image/jpeg', 0.85));
    this.detenerCamara();
  }

  cancelarCamara() {
    this.detenerCamara();
  }

  private detenerCamara() {
    this.streamCamara?.getTracks().forEach((track) => track.stop());
    this.streamCamara = undefined;
    this.camaraActiva.set(false);
  }

  async irACredenciales(): Promise<void> {
    this.errorRegistro.set(null);
    this.fotoIntentada.set(true);

    for (const campo of this.camposPaso1) {
      this.form.get(campo)?.markAsTouched();
    }

    const camposInvalidos = this.camposPaso1.some(
      (campo) => this.form.get(campo)?.invalid,
    );

    if (camposInvalidos || !this.fotoUrl()) {
      await Haptics.notification({ type: NotificationType.Error }).catch(
        () => {},
      );
      return;
    }

    this.paso.set(2);
  }

  volverADatos(): void {
    this.errorRegistro.set(null);
    this.paso.set(1);
  }

  toggleMostrarPassword(): void {
    this.mostrarPassword.update((valor) => !valor);
  }

  toggleMostrarRepetirPassword(): void {
    this.mostrarRepetirPassword.update((valor) => !valor);
  }

  async registrarse(): Promise<void> {
    if (this.form.invalid || !this.fotoUrl()) {
      this.form.markAllAsTouched();
      this.fotoIntentada.set(true);
      await Haptics.notification({ type: NotificationType.Error }).catch(
        () => {},
      );
      return;
    }

    const { nombre, apellido, dni, email, password } = this.form.getRawValue();

    const datos: IRegistro = {
      nombre: nombre!,
      apellido: apellido!,
      dni: Number(dni),
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
      await this.dispararError(
        error instanceof Error
          ? error.message
          : 'No se pudo completar el registro.',
      );
    } finally {
      this.cargando.set(false);
    }
  }

  private async dispararError(texto: string) {
    this.errorRegistro.set(texto);
    try {
      await Haptics.notification({ type: NotificationType.Error });
    } catch {}
  }
}
