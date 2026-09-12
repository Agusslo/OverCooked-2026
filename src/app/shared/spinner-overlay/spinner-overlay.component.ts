import { Component, Input, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';

// Overlay de carga a pantalla completa: tapa toda la pantalla con un
// z-index alto para que no se pueda tocar nada de fondo mientras
// `visible` es true. Se usa en las altas (empleado, plato, bebida, mesa).
@Component({
  selector: 'app-spinner-overlay',
  standalone: true,
  templateUrl: './spinner-overlay.component.html',
  styleUrls: ['./spinner-overlay.component.scss'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class SpinnerOverlayComponent {
  @Input() visible = false;
}
