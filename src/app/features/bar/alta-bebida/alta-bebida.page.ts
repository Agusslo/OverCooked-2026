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
import { RouterLink } from '@angular/router';
import { Camera, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { ProductosService } from '../../../core/services/productos.service';

type IndiceFoto = 0 | 1 | 2;
// Las 3 fotos, en posiciones fijas: null = todavía no se cargó esa foto.
type Fotos = [string | null, string | null, string | null];

@Component({
  selector: 'app-alta-bebida',
  standalone: true,
  templateUrl: './alta-bebida.page.html',
  styleUrls: ['./alta-bebida.page.scss'],
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AltaBebidaPage {
  @ViewChild('videoCamara') videoCamara?: ElementRef<HTMLVideoElement>;

  private fb = inject(FormBuilder);
  private productosService = inject(ProductosService);

  bebidaForm = this.fb.group({
    nombre: ['', [Validators.required, Validators.minLength(2)]],
    descripcion: ['', [Validators.required, Validators.minLength(10)]],
    tiempoElaboracion: [
      '',
      [Validators.required, Validators.min(1), Validators.max(240)],
    ],
    precio: ['', [Validators.required, Validators.min(1)]],
  });

  // Signals: cuando cambian con .set(), Angular actualiza sola la
  // parte de la pantalla que las usa (mismo patrón que login.page.ts).
  fotos = signal<Fotos>([null, null, null]);
  slotActivo = signal<IndiceFoto | null>(null);
  camaraActiva = signal(false);
  cargando = signal(false);
  formIntentado = signal(false);
  mensajeError = signal('');
  mensajeExito = signal('');

  private abriendoCamara = false;
  private streamCamara?: MediaStream;

  todasLasFotosCargadas(): boolean {
    return this.fotos().every((foto) => foto !== null);
  }

  // --- Captura de fotos: cámara nativa o galería ---

  async tomarFoto(indice: number, fuente: 'camara' | 'galeria') {
    // Validar que el índice es válido (0, 1 o 2)
    if (indice < 0 || indice > 2) {
      console.warn('Índice de foto inválido');
      return;
    }

    const indiceFoto = indice as IndiceFoto;
    this.mensajeError.set('');

    try {
      // En el navegador (durante el desarrollo, sin compilar a Android)
      // no existe la cámara nativa de Capacitor, así que usamos la
      // cámara web como reemplazo solo para la opción "cámara".
      if (!Capacitor.isNativePlatform() && fuente === 'camara') {
        this.slotActivo.set(indiceFoto);
        await this.abrirCamaraWeb();
        return;
      }

      const image = await Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: 'dataUrl' as any,
        source: fuente === 'camara' ? CameraSource.Camera : CameraSource.Photos,
      });

      if (image.dataUrl) {
        const fotosActuales = [...this.fotos()] as Fotos;
        fotosActuales[indiceFoto] = image.dataUrl;
        this.fotos.set(fotosActuales);
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

      // Esperamos un tick para que el <video> ya esté en el DOM
      // (recién aparece cuando camaraActiva pasa a true).
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
      this.slotActivo.set(null);
    } finally {
      this.abriendoCamara = false;
    }
  }

  capturarFoto() {
    const video = this.videoCamara?.nativeElement;
    const indice = this.slotActivo();
    if (!video || !video.videoWidth || !video.videoHeight || indice === null) {
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);

    const fotosActuales = [...this.fotos()] as Fotos;
    fotosActuales[indice] = canvas.toDataURL('image/jpeg', 0.85);
    this.fotos.set(fotosActuales);

    this.detenerCamara();
  }

  cancelarCamara() {
    this.detenerCamara();
  }

  private detenerCamara() {
    this.streamCamara?.getTracks().forEach((track) => track.stop());
    this.streamCamara = undefined;
    this.camaraActiva.set(false);
    this.slotActivo.set(null);
  }

  // --- Guardado ---

  async guardarBebida() {
    this.formIntentado.set(true);
    this.mensajeError.set('');
    this.mensajeExito.set('');

    if (this.bebidaForm.invalid || !this.todasLasFotosCargadas()) {
      this.bebidaForm.markAllAsTouched();
      await this.dispararError(
        'Revise los campos en rojo y asegúrese de cargar las 3 fotos',
      );
      return;
    }

    this.cargando.set(true);
    const valores = this.bebidaForm.getRawValue();

    try {
      const yaExiste = await this.productosService.existeEnCarta(
        valores.nombre!,
      );
      if (yaExiste) {
        await this.dispararError(
          'Ya existe una bebida con ese nombre en la carta',
        );
        return;
      }

      await this.productosService.crearProducto({
        nombre: valores.nombre!,
        descripcion: valores.descripcion!,
        tiempoElaboracion: Number(valores.tiempoElaboracion),
        precio: Number(valores.precio),
        tipo: 'bebida',
        sector: 'bar',
        fotosDataUrl: this.fotos() as [string, string, string],
      });

      this.mensajeExito.set('¡Bebida agregada a la carta con éxito!');
      await Haptics.notification({ type: NotificationType.Success }).catch(
        () => {},
      );

      this.bebidaForm.reset();
      this.fotos.set([null, null, null]);
      this.formIntentado.set(false);
    } catch (error) {
      await this.dispararError(
        error instanceof Error
          ? error.message
          : 'No se pudo registrar la bebida.',
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