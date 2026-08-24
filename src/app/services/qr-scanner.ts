import { Injectable } from '@angular/core';
import { BarcodeScanner, BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';
import { Haptics, NotificationType } from '@capacitor/haptics';

@Injectable({
  providedIn: 'root'
})
export class QrScannerService {

  constructor() { }

  async solicitarPermisos(): Promise<boolean> {
    const { camera } = await BarcodeScanner.requestPermissions();
    return camera === 'granted' || camera === 'limited';
  }

  async escanear(): Promise<string | null> {
    try {
      const permiso = await this.solicitarPermisos();
      if (!permiso) {
        await Haptics.notification({ type: NotificationType.Error }).catch(() => {});
        return null;
      }

      // Inicia el escaneo nativo
      const { barcodes } = await BarcodeScanner.scan({
        formats: [BarcodeFormat.QrCode, BarcodeFormat.Pdf417]
      });

      if (barcodes.length > 0 && barcodes[0].rawValue) {
        await Haptics.notification({ type: NotificationType.Success }).catch(() => {});
        return barcodes[0].rawValue;
      }

      return null;
    } catch (error) {
      console.warn('Escaneo cancelado o error:', error);
      return null;
    }
  }

  // Parser para interpretar el resultado del QR escaneado
  procesarQr(codigo: string): { tipo: 'LOCAL' | 'MESA' | 'PROPINA' | 'DNI' | 'DESCONOCIDO'; valor: any } {
    const valorLimpio = codigo.trim().toUpperCase();

    // 1. QR Ingreso al Local
    if (valorLimpio === 'LOCAL_INGRESO') {
      return { tipo: 'LOCAL', valor: 'LOCAL_INGRESO' };
    }

    // 2. QR de Mesas (ej: MESA_1)
    if (valorLimpio.startsWith('MESA_')) {
      const numeroMesa = parseInt(valorLimpio.replace('MESA_', ''), 10);
      return { tipo: 'MESA', valor: numeroMesa };
    }

    // 3. QR de Propinas
    const mapaPropinas: { [key: string]: number } = {
      'EXCELENTE': 20,
      'MUY_BUENO': 15,
      'BUENO': 10,
      'REGULAR': 5,
      'MALO': 0
    };
    if (mapaPropinas[valorLimpio] !== undefined) {
      return { tipo: 'PROPINA', valor: mapaPropinas[valorLimpio] };
    }

    // 4. Parser DNI Argentino (Formato estándar PDF417 separado por arrobas o espacios)
    if (codigo.includes('@') || codigo.includes('"')) {
      const partes = codigo.split('@');
      if (partes.length >= 5) {
        return {
          tipo: 'DNI',
          valor: {
            tramite: partes[0] || '',
            apellidos: partes[1] || '',
            nombres: partes[2] || '',
            sexo: partes[3] || '',
            dni: partes[4] || '',
            ejemplar: partes[5] || '',
            fechaNacimiento: partes[6] || ''
          }
        };
      }
    }

    return { tipo: 'DESCONOCIDO', valor: codigo };
  }
}