import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { IonButton } from '@ionic/angular';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { AuthService } from '../../../core/services/auth.service';
import { QrScannerService } from '../../../core/services/qr-scanner';
import { ListaEsperaService } from '../../../core/services/lista-espera.service';
import { MesasService } from '../../../core/services/mesas.service';

// Punto 9: primera pantalla del cliente (registrado o invitado) al
// iniciar sesión. Escanea el QR fijo de la entrada del local y queda
// anotado en la lista de espera del metre. Es el mismo flujo para los
// dos perfiles.
@Component({
  selector: 'app-entrada',
  standalone: true,
  templateUrl: './entrada.page.html',
  styleUrls: ['./entrada.page.scss'],
  imports: [IonButton],
})
export class EntradaPage implements OnInit {
  private authService = inject(AuthService);
  private qrScannerService = inject(QrScannerService);
  private listaEsperaService = inject(ListaEsperaService);
  private mesasService = inject(MesasService);
  private router = inject(Router);

  cargando = signal(true);
  procesando = signal(false);
  mensajeError = signal('');
  esWeb = !Capacitor.isNativePlatform();

  async ngOnInit(): Promise<void> {
    // Si ya está anotado o ya tiene mesa, esta pantalla no va: al inicio.
    const usuario = this.authService.usuarioActual;
    if (!usuario) {
      this.router.navigateByUrl('/auth/login');
      return;
    }

    const esAnonimo = usuario.perfil === 'anonimo';
    try {
      const [esperando, mesa] = await Promise.all([
        this.listaEsperaService.estaEsperando(
          esAnonimo ? undefined : usuario.id,
          esAnonimo ? usuario.id : undefined,
        ),
        this.mesasService.obtenerMesaAsignadaA(usuario.id, esAnonimo),
      ]);
      if (esperando || mesa) {
        this.router.navigateByUrl('/inicio');
        return;
      }
    } catch {
      // Si no se pudo verificar, mostramos igual la pantalla de escaneo.
    }
    this.cargando.set(false);
  }

  async escanear(): Promise<void> {
    this.mensajeError.set('');
    this.procesando.set(true);
    try {
      const resultado = await this.qrScannerService.escanear();
      if (!resultado) {
        await this.dispararError(
          'No se pudo escanear. Revisá los permisos de cámara y volvé a intentar.',
        );
        return;
      }
      if (resultado.tipo !== 'LOCAL') {
        await this.dispararError(
          `Ese QR no es el de la entrada del local. Se leyó: "${resultado.tipo}".`,
        );
        return;
      }
      await this.anotarse();
    } catch (error) {
      await this.dispararError(
        error instanceof Error ? error.message : 'No se pudo completar el escaneo.',
      );
    } finally {
      this.procesando.set(false);
    }
  }

  // Atajo de desarrollo (solo navegador): salta el escaneo.
  async simular(): Promise<void> {
    this.mensajeError.set('');
    this.procesando.set(true);
    try {
      await this.anotarse();
    } catch (error) {
      await this.dispararError(
        error instanceof Error ? error.message : 'No se pudo anotar en la lista de espera.',
      );
    } finally {
      this.procesando.set(false);
    }
  }

  private async anotarse(): Promise<void> {
    const usuario = this.authService.usuarioActual;
    if (!usuario) {
      await this.dispararError('Se perdió la sesión, volvé a iniciar sesión.');
      return;
    }
    const esAnonimo = usuario.perfil === 'anonimo';

    const yaEsperando = await this.listaEsperaService.estaEsperando(
      esAnonimo ? undefined : usuario.id,
      esAnonimo ? usuario.id : undefined,
    );
    if (!yaEsperando) {
      await this.listaEsperaService.anotarse({
        clienteId: esAnonimo ? undefined : usuario.id,
        clienteAnonimoId: esAnonimo ? usuario.id : undefined,
        nombre: `${usuario.nombre} ${usuario.apellido}`.trim(),
        fotoUrl: usuario.foto_url,
      });
    }

    await Haptics.notification({ type: NotificationType.Success }).catch(() => {});
    this.router.navigateByUrl('/inicio');
  }

  verResultados(): void {
    // Le avisamos a resultados que vuelva acá y no a /inicio: sin el QR
    // escaneado, /inicio mostraba la sala de espera unos segundos antes
    // de redirigir, como si ya estuviera anotado.
    this.router.navigate(['/cliente/encuesta-resultados'], {
      queryParams: { volver: 'entrada' },
    });
  }

  async salir(): Promise<void> {
    await this.authService.logout();
    this.router.navigateByUrl('/auth/login');
  }

  private async dispararError(texto: string): Promise<void> {
    this.mensajeError.set(texto);
    try {
      await Haptics.notification({ type: NotificationType.Error });
    } catch {}
  }
}
