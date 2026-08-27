import { Component, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLinkActive } from '@angular/router';

const FADE_OUT_DELAY_MS = 1800;
const REMOVE_DELAY_MS = 2300;

@Component({
  selector: 'app-splash',
  templateUrl: './splash.component.html',
  styleUrls: ['./splash.component.scss'],
  imports: [],
})
export class SplashComponent implements OnInit {
  // Signals, no propiedades planas: esta app no tiene zone.js, así que un
  // setTimeout que mute una propiedad normal nunca dispararía change detection.
  fadingOut = signal(false);
  hidden = signal(false);

  router: Router= inject(Router);

  ngOnInit() {
    setTimeout(() => this.fadingOut.set(true), FADE_OUT_DELAY_MS);
    setTimeout(() => this.hidden.set(true), REMOVE_DELAY_MS)
    this.router.navigateByUrl('/login')
  }
}
