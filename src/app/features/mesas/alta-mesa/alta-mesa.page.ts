import {
  Component,
  ElementRef,
  ViewChild,
  inject,
  signal,
  CUSTOM_ELEMENTS_SCHEMA,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Camera, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { RouterLink } from '@angular/router';
import { MesasService } from '../../../core/services/mesas.service';
import { TipoMesa } from '../../../core/models/mesa.model';
import { SpinnerOverlayComponent } from '../../../shared/spinner-overlay/spinner-overlay.component';

@Component({
  selector: 'app-alta-mesa',
  standalone: true,
  templateUrl: './alta-mesa.page.html',
  styleUrls: ['./alta-mesa.page.scss'],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    SpinnerOverlayComponent,
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AltaMesaPage {
  @ViewChild('videoCamara') videoCamara?: ElementRef<HTMLVideoElement>;

  private fb = inject(FormBuilder);
  private mesasService = inject(MesasService);

  // Los 3 tipos exactos del enum, para dibujar el <select> sin
  // escribirlos a mano en el HTML (y sin arriesgarnos a un typo ahí).
  tiposDisponibles: { valor: TipoMesa; etiqueta: string }[] = [
    { valor: 'estandar', etiqueta: 'Estándar' },
    { valor: 'vip', etiqueta: 'VIP' },
    { valor: 'movilidad_reducida', etiqueta: 'Movilidad reducida' },
  ];

  mesaForm = this.fb.group({
    numero: ['', [Validators.required, Validators.min(1)]],
    capacidad: [
      '',
      [Validators.required, Validators.min(1), Validators.max(20)],
    ],
    tipo: ['', [Validators.required]],
  });

  // Una sola foto, no un array de 3 como en productos.
  foto = signal<string | null>(null);
  camaraActiva = signal(false);
  cargando = signal(false);
  formIntentado = signal(false);
  mensajeError = signal('');
  mensajeExito = signal('');
  dropdownAbierto = signal(false);

  private abriendoCamara = false;
  private streamCamara?: MediaStream;

  // --- Dropdown custom de tipo de mesa ---

  tipoSeleccionadoLabel(): string {
    const valor = this.mesaForm.get('tipo')?.value;
    if (!valor) return 'Tipo de mesa';
    const opcion = this.tiposDisponibles.find((o) => o.valor === valor);
    return opcion?.etiqueta ?? 'Tipo de mesa';
  }

  toggleDropdown() {
    this.dropdownAbierto.update((v) => !v);
  }

  seleccionarTipo(valor: TipoMesa) {
    this.mesaForm.get('tipo')?.setValue(valor);
    this.mesaForm.get('tipo')?.markAsTouched();
    this.dropdownAbierto.set(false);
  }

  // --- Captura de foto: SOLO cámara, sin galería (así lo pide el punto 4) ---

  async tomarFoto() {
    this.mensajeError.set('');

    try {
      // En el navegador (desarrollo, sin compilar a Android) no existe
      // la cámara nativa de Capacitor, así que usamos la cámara web
      // como reemplazo.
      if (!Capacitor.isNativePlatform()) {
        await this.abrirCamaraWeb();
        return;
      }

      const image = await Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: 'dataUrl' as any,
        source: CameraSource.Camera, // sin opción de galería
      });

      if (image.dataUrl) {
        this.foto.set(image.dataUrl);
      }
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
        video: { facingMode: 'environment' },
        audio: false,
      });
      this.camaraActiva.set(true);

      setTimeout(async () => {
        const video = this.videoCamara?.nativeElement;
        if (video) {
          video.srcObject = this.streamCamara!;
          await video.play();
        }
      });
    } catch (error) {
      console.warn('No se pudo acceder a la cámara:', error);
      this.mensajeError.set('No se pudo acceder a la cámara');
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
    this.foto.set(canvas.toDataURL('image/jpeg', 0.85));

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

  // --- Guardado ---

  async guardarMesa() {
    this.formIntentado.set(true);
    this.mensajeError.set('');
    this.mensajeExito.set('');

    if (this.mesaForm.invalid || !this.foto()) {
      this.mesaForm.markAllAsTouched();
      await this.dispararError(
        'Revise los campos en rojo y saque la foto de la mesa',
      );
      return;
    }

    this.cargando.set(true);
    const valores = this.mesaForm.getRawValue();
    const numero = Number(valores.numero);

    try {
      const yaExiste = await this.mesasService.existeNumero(numero);
      if (yaExiste) {
        await this.dispararError(`Ya existe una mesa con el número ${numero}`);
        return;
      }

      await this.mesasService.crearMesa({
        numero,
        capacidad: Number(valores.capacidad),
        tipo: valores.tipo as TipoMesa,
        fotoDataUrl: this.foto()!,
      });

      this.mensajeExito.set('¡Mesa agregada con éxito!');
      await Haptics.notification({ type: NotificationType.Success }).catch(
        () => {},
      );

      this.mesaForm.reset();
      this.foto.set(null);
      this.formIntentado.set(false);
    } catch (error) {
      await this.dispararError(
        error instanceof Error
          ? error.message
          : 'No se pudo registrar la mesa.',
      );
    } finally {
      this.cargando.set(false);
    }
  }

  private async dispararError(texto: string) {
    this.mensajeError.set(texto);
    try {
      await Haptics.notification({ type: NotificationType.Error });
    } catch {}
  }
}
