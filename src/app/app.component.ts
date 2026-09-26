import { Component, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { SplashComponent } from './features/splash/splash.component';
import { TecladoService } from './core/services/teclado.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet, SplashComponent],
})
export class AppComponent {
  constructor() {
    inject(TecladoService).iniciar();
  }
}
