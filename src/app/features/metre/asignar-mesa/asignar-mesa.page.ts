import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { ListaEsperaService } from '../../../core/services/lista-espera.service';
import { MesasService } from '../../../core/services/mesas.service';
import { ClienteEnEspera } from '../../../core/models/lista-espera.model';
import { Mesa } from '../../../core/models/mesa.model';

@Component({
  selector: 'app-asignar-mesa',
  standalone: true,
  templateUrl: './asignar-mesa.page.html',
  styleUrls: ['./asignar-mesa.page.scss'],
  imports: [RouterLink],
})
export class AsignarMesaPage implements OnInit {
  private listaEsperaService = inject(ListaEsperaService);
  private mesasService = inject(MesasService);

  clientes = signal<ClienteEnEspera[]>([]);
  mesasLibres = signal<Mesa[]>([]);
  cargando = signal(true);
  mensajeError = signal('');

  // Cliente elegido para asignarle una mesa (null = ninguno).
  clienteSeleccionado = signal<ClienteEnEspera | null>(null);
  // id de la mesa que se está confirmando ahora mismo.
  asignando = signal<string | null>(null);

  ngOnInit(): void {
    this.cargarDatos();
  }

  async cargarDatos(): Promise<void> {
    this.cargando.set(true);
    this.mensajeError.set('');
    try {
      const [clientes, mesasLibres] = await Promise.all([
        // Punto 9/10: el metre asigna mesa tanto a clientes registrados
        // como a invitados (anónimos).
        this.listaEsperaService.listarEsperando(),
        this.mesasService.listarLibres(),
      ]);
      this.clientes.set(clientes);
      this.mesasLibres.set(mesasLibres);
    } catch (error) {
      await this.dispararError(
        error instanceof Error ? error.message : 'No se pudo cargar la información.',
      );
    } finally {
      this.cargando.set(false);
    }
  }

  seleccionarCliente(cliente: ClienteEnEspera): void {
    this.clienteSeleccionado.set(
      this.clienteSeleccionado()?.id === cliente.id ? null : cliente,
    );
  }

  async asignarMesa(mesa: Mesa): Promise<void> {
    const cliente = this.clienteSeleccionado();
    if (!cliente || this.asignando()) return;

    this.asignando.set(mesa.id);
    try {
      await this.listaEsperaService.asignarMesa(cliente, mesa.id);

      this.clientes.update((lista) => lista.filter((c) => c.id !== cliente.id));
      this.mesasLibres.update((lista) => lista.filter((m) => m.id !== mesa.id));
      this.clienteSeleccionado.set(null);

      try {
        await Haptics.notification({ type: NotificationType.Success });
      } catch {}
    } catch (error) {
      await this.dispararError(
        error instanceof Error ? error.message : 'No se pudo asignar la mesa.',
      );
    } finally {
      this.asignando.set(null);
    }
  }

  private async dispararError(texto: string): Promise<void> {
    this.mensajeError.set(texto);
    try {
      await Haptics.notification({ type: NotificationType.Error });
    } catch {}
  }
}
