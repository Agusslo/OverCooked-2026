import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { IonButton, IonSpinner } from '@ionic/angular';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { AuthService } from '../../../core/services/auth.service';
import { QrScannerService } from '../../../core/services/qr-scanner';
import { MesasService } from '../../../core/services/mesas.service';
import { Mesa } from '../../../core/models/mesa.model';

// Punto 10 del PDF: el cliente (registrado o invitado) escanea el QR de
// la mesa que el metre le asignó. Si escanea otra mesa (o todavía no
// tiene ninguna) se lo bloquea indicando cuál es la suya. Con el escaneo
// correcto entra al menú.
@Component({
  selector: 'app-escanear-mesa',
  standalone: true,
  templateUrl: './escanear-mesa.page.html',
  styleUrls: ['./escanear-mesa.page.scss'],
  imports: [IonButton, IonSpinner],
})
export class EscanearMesaPage implements OnInit {
  private authService = inject(AuthService);
  private qrScannerService = inject(QrScannerService);
  private mesasService = inject(MesasService);
  private router = inject(Router);

  cargando = signal(false);
  mensajeError = signal('');
  mesaAsignada = signal<Mesa | null>(null);
  esWeb = !Capacitor.isNativePlatform();

  async ngOnInit(): Promise<void> {
    const usuario = this.authService.usuarioActual;
    if (!usuario) return;
    try {
      const mesa = await this.mesasService.obtenerMesaAsignadaA(
        usuario.id,
        usuario.perfil === 'anonimo',
      );
      this.mesaAsignada.set(mesa);
      if (!mesa) {
        this.mensajeError.set(
          'Todavía no tenés una mesa asignada. Esperá a que el metre te asigne una.',
        );
      }
    } catch {
      // Si falla, el escaneo la vuelve a chequear.
    }
  }

  async escanear(): Promise<void> {
    this.mensajeError.set('');
    this.cargando.set(true);

    try {
      const usuario = this.authService.usuarioActual;
      if (!usuario) {
        await this.dispararError('Se perdió la sesión, volvé a iniciar sesión.');
        return;
      }

      const resultado = await this.qrScannerService.escanear();
      if (!resultado) {
        await this.dispararError(
          'No se pudo escanear. Asegurate de que la app tenga permisos de cámara y volvé a intentar.',
        );
        return;
      }

      if (resultado.tipo !== 'MESA') {
        await this.dispararError(
          `Ese QR no es el de una mesa. Se leyó: "${resultado.tipo}".`,
        );
        return;
      }

      const mesaAsignada = await this.mesasService.obtenerMesaAsignadaA(
        usuario.id,
        usuario.perfil === 'anonimo',
      );
      if (!mesaAsignada) {
        await this.dispararError(
          'Todavía no tenés una mesa asignada. Esperá a que el metre te asigne una.',
        );
        return;
      }

      const numeroEscaneado = resultado.valor as number;
      if (mesaAsignada.numero !== numeroEscaneado) {
        await this.dispararError(
          `Esa no es tu mesa. Tu mesa asignada es la Nº ${mesaAsignada.numero}.`,
        );
        return;
      }

      await this.entrar(mesaAsignada.numero);
    } catch (error) {
      await this.dispararError(
        error instanceof Error ? error.message : 'No se pudo completar el escaneo.',
      );
    } finally {
      this.cargando.set(false);
    }
  }

  // Atajo de desarrollo (solo navegador): entra directo a la mesa asignada.
  async simular(): Promise<void> {
    const mesa = this.mesaAsignada();
    if (!mesa) {
      await this.dispararError('Todavía no tenés una mesa asignada.');
      return;
    }
    await this.entrar(mesa.numero);
  }

  private async entrar(numero: number): Promise<void> {
    await Haptics.notification({ type: NotificationType.Success }).catch(() => {});
    this.router.navigateByUrl(`/cliente/menu/${numero}`);
  }

  volver(): void {
    this.router.navigateByUrl('/inicio');
  }

  private async dispararError(texto: string): Promise<void> {
    this.mensajeError.set(texto);
    try {
      await Haptics.notification({ type: NotificationType.Error });
    } catch {}
  }
}
