import { ElementRef } from '@angular/core';
import { Camera, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

// Utilidades de captura de foto exclusivamente desde la cámara.
// No permiten seleccionar imágenes desde la galería (CameraSource.Camera).

export interface CameraCaptureResult {
  dataUrl: string | null;
  stream?: MediaStream;
}

// Tamaño máximo (lado mayor, en px) de las fotos que se suben a Storage.
// Una foto de cámara sin reducir pesa 2-5 MB y se muestra como avatar o
// tarjeta: con 1080 px queda en ~100-200 KB y se ve igual de bien.
export const LADO_MAXIMO_FOTO = 1080;
const CALIDAD_FOTO = 80;

// Opciones de tamaño/calidad para Camera.getPhoto: width y height juntos
// encajan la foto en un cuadrado de LADO_MAXIMO_FOTO respetando la
// proporción original.
export const OPCIONES_TAMANIO_FOTO = {
  quality: CALIDAD_FOTO,
  width: LADO_MAXIMO_FOTO,
  height: LADO_MAXIMO_FOTO,
} as const;

/**
 * Toma una foto usando la cámara nativa (Capacitor) si está disponible.
 * Si no hay plataforma nativa, se debe usar abrirCamaraWeb + capturarFotoWeb.
 */
export async function tomarFotoNativa(): Promise<string | null> {
  const image = await Camera.getPhoto({
    ...OPCIONES_TAMANIO_FOTO,
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

  return frameDeVideoADataUrl(video);
}

/**
 * Dibuja el frame actual del video en un canvas reducido a
 * LADO_MAXIMO_FOTO (lado mayor) y lo devuelve como dataUrl JPEG.
 */
export function frameDeVideoADataUrl(video: HTMLVideoElement): string {
  const escala = Math.min(
    1,
    LADO_MAXIMO_FOTO / Math.max(video.videoWidth, video.videoHeight),
  );
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * escala);
  canvas.height = Math.round(video.videoHeight * escala);
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', CALIDAD_FOTO / 100);
}

/**
 * Detiene todas las pistas del stream de la cámara web.
 */
export function detenerCamaraWeb(stream?: MediaStream): void {
  stream?.getTracks().forEach((track) => track.stop());
}
