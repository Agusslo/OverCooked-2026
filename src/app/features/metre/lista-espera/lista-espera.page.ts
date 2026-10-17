import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { ListaEsperaService } from '../../../core/services/lista-espera.service';
import { ClienteEnEspera } from '../../../core/models/lista-espera.model';

@Component({
    selector: 'app-lista-espera-metre',
    standalone: true,
    templateUrl: './lista-espera.page.html',
    styleUrl: './lista-espera.page.scss',
    imports: [RouterLink],
})
export class ListaEsperaMetrePage implements OnInit {
private listaEsperaService = inject(ListaEsperaService);

clientes = signal<ClienteEnEspera[]>([]);
cargando = signal(true);
mensajeError = signal('');
quitando = signal<string | null>(null);

ngOnInit(): void {
    this.cargarLista();
}

async cargarLista(): Promise<void> {
    this.cargando.set(true);
    this.mensajeError.set('');
    try {
    const clientes = await this.listaEsperaService.listarEsperando();
    this.clientes.set(clientes);
    } catch (error) {
    await this.dispararError(
        error instanceof Error ? error.message : 'No se pudo cargar la lista de espera.',
    );
    } finally {
    this.cargando.set(false);
    }
}

// Punto 9: "eliminado del listado" — el service ya lo marca como
// 'cancelado' internamente, acá solo lo sacamos de la vista local.
async sacarDeLaLista(cliente: ClienteEnEspera): Promise<void> {
    if (this.quitando()) return;

    this.quitando.set(cliente.id);
    try {
    await this.listaEsperaService.eliminar(cliente.id);
    this.clientes.update((lista) => lista.filter((c) => c.id !== cliente.id));
    try {
        await Haptics.notification({ type: NotificationType.Success });
    } catch {}
    } catch (error) {
    await this.dispararError(
        error instanceof Error ? error.message : 'No se pudo sacar al cliente de la lista.',
    );
    } finally {
    this.quitando.set(null);
    }
}

private async dispararError(texto: string): Promise<void> {
    this.mensajeError.set(texto);
    try {
    await Haptics.notification({ type: NotificationType.Error });
    } catch {}
}
}