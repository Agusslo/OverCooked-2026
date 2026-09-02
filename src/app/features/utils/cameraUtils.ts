import { ElementRef } from '@angular/core';
import { Camera, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

// Utilidades de captura de foto exclusivamente desde la cámara.
// No permiten seleccionar imágenes desde la galería (CameraSource.Camera).

export interface CameraCaptureResult {
  dataUrl: string | null;
  stream?: MediaStream;
}

/**
 * Toma una foto usando la cámara nativa (Capacitor) si está disponible.
 * Si no hay plataforma nativa, se debe usar abrirCamaraWeb + capturarFotoWeb.
 */
export async function tomarFotoNativa(): Promise<string | null> {
  const image = await Camera.getPhoto({
    quality: 85,
    allowEditing: false,
    resultType: 'dataUrl' as any,
    source: CameraSource.Camera,
  });

  return image.dataUrl || null;
}

export function esPlataformaNativa(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Abre el stream de la cámara web (getUserMedia) y lo asocia al elemento de video.
 */
export async function abrirCamaraWeb(
  videoRef?: ElementRef<HTMLVideoElement>,
): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user' },
    audio: false,
  });

  const video = videoRef?.nativeElement;
  if (video) {
    video.srcObject = stream;
    await video.play();
  }

  return stream;
}

/**
 * Captura un frame del video de la cámara web activa y lo convierte a dataUrl.
 */
export function capturarFotoWeb(
  videoRef?: ElementRef<HTMLVideoElement>,
): string | null {
  const video = videoRef?.nativeElement;
  if (!video || !video.videoWidth || !video.videoHeight) {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d')?.drawImage(video, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.85);
}

/**
 * Detiene todas las pistas del stream de la cámara web.
 */
export function detenerCamaraWeb(stream?: MediaStream): void {
  stream?.getTracks().forEach((track) => track.stop());
}
