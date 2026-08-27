import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  BarcodeScanner,
  BarcodeFormat,
} from '@capacitor-mlkit/barcode-scanning';
import { Haptics, NotificationType } from '@capacitor/haptics';

export interface DatosDni {
  tramite: string;
  apellidos: string;
  nombres: string;
  sexo: string;
  dni: string;
  ejemplar: string;
  fechaNacimiento: string;
}

export interface ResultadoQr {
  tipo: 'LOCAL' | 'MESA' | 'PROPINA' | 'DNI' | 'DESCONOCIDO';
  valor: any;
}

@Injectable({
  providedIn: 'root',
})
export class QrScannerService {
  async solicitarPermisos(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      return true;
    }
    const { camera } = await BarcodeScanner.requestPermissions();
    return camera === 'granted' || camera === 'limited';
  }

  async escanear(): Promise<ResultadoQr | null> {
    if (!Capacitor.isNativePlatform()) {
      console.warn(
        'El escáner de DNI requiere ejecutar la aplicación en Android o iOS.',
      );
      return null;
    }

    try {
      const permiso = await this.solicitarPermisos();
      if (!permiso) {
        await Haptics.notification({ type: NotificationType.Error }).catch(
          () => {},
        );
        return null;
      }

      const { barcodes } = await BarcodeScanner.scan({
        formats: [BarcodeFormat.QrCode, BarcodeFormat.Pdf417],
      });

      if (barcodes.length > 0 && barcodes[0].rawValue) {
        await Haptics.notification({ type: NotificationType.Success }).catch(
          () => {},
        );
        return this.procesarQr(barcodes[0].rawValue);
      }

      return null;
    } catch (error) {
      console.warn('Error en escaneo nativo:', error);
      return null;
    }
  }

  private procesarQr(codigo: string): ResultadoQr {
    const valorLimpio = codigo.trim().toUpperCase();

    if (valorLimpio === 'LOCAL_INGRESO') {
      return { tipo: 'LOCAL', valor: 'LOCAL_INGRESO' };
    }

    if (valorLimpio.startsWith('MESA_')) {
      const numeroMesa = parseInt(valorLimpio.replace('MESA_', ''), 10);
      return { tipo: 'MESA', valor: numeroMesa };
    }

    if (codigo.includes('@') || codigo.includes('"')) {
      const partes = codigo.split(codigo.includes('@') ? '@' : '"');
      if (partes.length >= 5) {
        const datosDni: DatosDni = {
          tramite: partes[0] || '',
          apellidos: partes[1] || '',
          nombres: partes[2] || '',
          sexo: partes[3] || '',
          dni: partes[4] || '',
          ejemplar: partes[5] || '',
          fechaNacimiento: partes[6] || '',
        };
        return { tipo: 'DNI', valor: datosDni };
      }
    }

    return { tipo: 'DESCONOCIDO', valor: codigo };
  }
}