import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

// Burbuja flotante de "Consultar a mozo" (punto 11). Aparece en casi
// todas las pantallas del cliente que están dentro de una mesa: menú,
// estado del pedido, etc. Lleva al chat de esa mesa.
@Component({
  selector: 'app-burbuja-mozo',
  standalone: true,
  imports: [RouterLink],
  template: `
    <a class="burbuja-mozo" [routerLink]="['/cliente/chat', numeroMesa]">
      <span class="burbuja-mozo__texto">Consultar a mozo</span>
      <span class="burbuja-mozo__icono">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </span>
    </a>
  `,
  styles: [`
    .burbuja-mozo {
      position: fixed;
      right: 16px;
      bottom: 20px;
      z-index: 40;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 8px 8px 16px;
      background: #f0c060;
      color: #8c2e14;
      border-radius: 999px;
      text-decoration: none;
      font-weight: 700;
      font-size: 13px;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
    }
    .burbuja-mozo__icono {
      width: 40px;
      height: 40px;
      flex: none;
      border-radius: 999px;
      background: #a83820;
      color: #fef5ee;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .burbuja-mozo__icono svg { width: 20px; height: 20px; }
  `],
})
export class BurbujaMozoComponent {
  @Input({ required: true }) numeroMesa!: number;
}
