import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';

/**
 * Mantiene visible el input con foco cuando se abre el teclado en Android.
 *
 * Ionic desactiva su "scroll assist" en Android nativo y confía en que el
 * WebView lo resuelva solo, cosa que en varios equipos (ej. Moto E6s) no
 * pasa: la pantalla se achica pero el input queda detrás del teclado.
 * Acá, cada vez que cambia el alto de la ventana (se abrió el teclado) o se
 * pasa de un campo a otro, se scrollea lo justo para que el campo activo
 * quede visible (sin centrarlo ni mover el resto de la pantalla de más).
 */
@Injectable({ providedIn: 'root' })
export class TecladoService {
  private iniciado = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  iniciar(): void {
    if (this.iniciado || Capacitor.getPlatform() !== 'android') {
      return;
    }
    this.iniciado = true;

    // Se abrió/cerró el teclado → el WebView cambió de alto.
    window.addEventListener('resize', () => this.programarScroll(50));
    // Cambio de campo con el teclado ya abierto (no hay resize).
    document.addEventListener('focusin', () => this.programarScroll(300));
  }

  private programarScroll(demoraMs: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.mostrarCampoActivo(), demoraMs);
  }

  private mostrarCampoActivo(): void {
    const el = document.activeElement as HTMLElement | null;
    if (!el || !el.matches('input, textarea, [contenteditable="true"]')) {
      return;
    }

    const rect = el.getBoundingClientRect();
    const margen = 16;
    const visible = rect.top >= margen && rect.bottom <= window.innerHeight - margen;
    if (!visible) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
}
