import {
  Component,
  ElementRef,
  ChangeDetectorRef,
  OnDestroy,
  OnInit,
  ViewChild,
  CUSTOM_ELEMENTS_SCHEMA,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { Camera, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { QrScannerService } from '../../../core/services/qr-scanner';
import { UsuariosService } from '../../../core/services/usuarios.service';

// Validador cross-field: verifica que los dígitos del DNI
// coincidan con las posiciones 2–9 del CUIL.
// Estructura CUIL: XX + DNI(8 dígitos) + dígito verificador = 11 dígitos.
function cuilMatchDni(form: AbstractControl): ValidationErrors | null {
  const dni = (form.get('dni')?.value || '') as string;
  const cuil = (form.get('cuil')?.value || '') as string;

  // Solo validar cuando ambos campos tienen formato correcto
  if (!dni || !cuil || cuil.length !== 11 || !/^\d{7,8}$/.test(dni)) {
    return null;
  }

  const dniPadded = dni.padStart(8, '0');
  const dniEnCuil = cuil.substring(2, 10);

  return dniEnCuil === dniPadded ? null : { cuilNoMatchDni: true };
}

@Component({
  selector: 'app-alta-empleado',
  templateUrl: './alta-empleado.page.html',
  styleUrls: ['./alta-empleado.page.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AltaEmpleadoPage implements OnInit, OnDestroy {
  @ViewChild('videoCamara') videoCamara?: ElementRef<HTMLVideoElement>;

  empleadoForm!: FormGroup;
  fotoPersonal: string | null = null;
  camaraActiva = false;
  private abriendoCamara = false;
  private streamCamara?: MediaStream;
  cargando = false;
  formIntentado = false;
  mensajeError = '';
  mensajeExito = '';

  constructor(
    private fb: FormBuilder,
    private qrScannerService: QrScannerService,
    private usuariosService: UsuariosService,
    private changeDetectorRef: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.empleadoForm = this.fb.group(
      {
        nombre: [
          '',
          [
            Validators.required,
            Validators.minLength(2),
            Validators.pattern('^[a-zA-ZáéíóúÁÉÍÓÚñÑ ]+$'),
          ],
        ],
        apellido: [
          '',
          [
            Validators.required,
            Validators.minLength(2),
            Validators.pattern('^[a-zA-ZáéíóúÁÉÍÓÚñÑ ]+$'),
          ],
        ],
        dni: ['', [Validators.required, Validators.pattern('^[0-9]{7,8}$')]],
        cuil: ['', [Validators.required, Validators.pattern('^[0-9]{11}$')]],
        correo: ['', [Validators.required, Validators.email]],
        clave: ['', [Validators.required, Validators.minLength(6)]],
        perfil: ['', [Validators.required]],
      },
      { validators: cuilMatchDni },
    );
  }

  ngOnDestroy() {
    this.detenerCamara();
  }

  async escanearDni() {
    this.mensajeError = '';
    const resultado = await this.qrScannerService.escanear();

    if (resultado && resultado.tipo === 'DNI') {
      const datos = resultado.valor;
      this.empleadoForm.patchValue({
        apellido: datos.apellidos || '',
        nombre: datos.nombres || '',
        dni: datos.dni || '',
      });
      await Haptics.notification({ type: NotificationType.Success }).catch(
        () => {},
      );
    } else {
      await this.dispararError(
        'No se detectó un formato válido de DNI Argentino',
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

      this.fotoPersonal = image.dataUrl || null;
      this.mensajeError = '';
    } catch (error) {
      console.warn('Captura cancelada:', error);
    }
  }

  private async abrirCamaraWeb() {
    if (this.abriendoCamara || this.camaraActiva) {
      return;
    }

    this.abriendoCamara = true;
    try {
      this.streamCamara = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      this.camaraActiva = true;
      this.changeDetectorRef.detectChanges();

      const video = this.videoCamara?.nativeElement;
      if (video) {
        video.srcObject = this.streamCamara;
        await video.play();
      }
    } catch (error) {
      console.warn('No se pudo acceder a la cámara:', error);
      this.mensajeError = 'No se pudo acceder a la cámara';
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
    this.fotoPersonal = canvas.toDataURL('image/jpeg', 0.85);
    this.mensajeError = '';
    this.detenerCamara();
  }

  cancelarCamara() {
    this.detenerCamara();
  }

  private detenerCamara() {
    this.streamCamara?.getTracks().forEach((track) => track.stop());
    this.streamCamara = undefined;
    this.camaraActiva = false;
  }

  async guardarEmpleado() {
    this.formIntentado = true;
    this.mensajeError = '';
    this.mensajeExito = '';

    if (this.empleadoForm.invalid || !this.fotoPersonal) {
      this.empleadoForm.markAllAsTouched();
      await this.dispararError(
        'Revise los campos en rojo y asegúrese de tomar la foto personal',
      );
      return;
    }

    this.cargando = true;
    const valores = this.empleadoForm.value;

    try {
      await this.usuariosService.crearEmpleado({
        nombre: valores.nombre,
        apellido: valores.apellido,
        dni: valores.dni,
        cuil: valores.cuil,
        correo: valores.correo,
        clave: valores.clave,
        perfil: valores.perfil,
        fotoDataUrl: this.fotoPersonal,
      });

      this.mensajeExito = '¡Empleado registrado con éxito!';
      await Haptics.notification({ type: NotificationType.Success }).catch(
        () => {},
      );

      this.empleadoForm.reset({ perfil: '' });
      this.fotoPersonal = null;
      this.formIntentado = false;
    } catch (error) {
      await this.dispararError(
        error instanceof Error
          ? error.message
          : 'No se pudo registrar el empleado.',
      );
    } finally {
      this.cargando = false;
    }
  }

  private async dispararError(texto: string) {
    this.mensajeError = texto;
    try {
      await Haptics.notification({ type: NotificationType.Error });
    } catch {}
  }
}
