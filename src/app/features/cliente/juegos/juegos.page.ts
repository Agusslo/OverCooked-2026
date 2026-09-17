import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { MesasService } from '../../../core/services/mesas.service';
import { JuegosService } from '../../../core/services/juegos.service';
import { JUEGOS_DISPONIBLES, ResultadoJuego } from '../../../core/models/juego.model';

@Component({
  selector: 'app-juegos',
  standalone: true,
  templateUrl: './juegos.page.html',
  styleUrls: ['./juegos.page.scss'],
})
export class JuegosPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);
  private mesasService = inject(MesasService);
  private juegosService = inject(JuegosService);

  juegos = JUEGOS_DISPONIBLES;
  resultados = signal<ResultadoJuego[]>([]);
  mejorDescuento = signal(0);
  cargando = signal(true);
  numeroMesa = 0;

  async ngOnInit(): Promise<void> {
    this.numeroMesa = Number(this.route.snapshot.paramMap.get('numero'));
    const clienteId = this.authService.usuarioActual?.id;
    if (!clienteId) return;

    try {
      const mesa = await this.mesasService.obtenerPorNumero(this.numeroMesa);
      const resultados = await this.juegosService.listarResultados(clienteId, mesa.id);
      this.resultados.set(resultados);
      this.mejorDescuento.set(await this.juegosService.obtenerMejorDescuento(clienteId, mesa.id));
    } finally {
      this.cargando.set(false);
    }
  }

  yaJugado(juego: string): boolean {
    return this.resultados().some((r) => r.juego === juego);
  }

  jugar(ruta: string): void {
    if (!ruta) return;
    this.router.navigate(['/cliente/juegos', this.numeroMesa, ruta]);
  }

  volver(): void {
    this.router.navigate(['/cliente/menu', this.numeroMesa]);
  }
}