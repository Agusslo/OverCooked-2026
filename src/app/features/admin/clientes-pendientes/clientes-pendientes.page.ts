import { Component, inject, OnInit, signal } from '@angular/core';
import {
  IonContent,
  IonList,
  IonItem,
  IonAvatar,
  IonLabel,
  IonButton,
  IonSpinner,
  IonText,
} from '@ionic/angular';
import { AdminService } from '../../../core/services/admin.service';
import { Usuario } from '../../../core/models/usuario.model';

@Component({
  selector: 'app-clientes-pendientes',
  standalone: true,
  templateUrl: './clientes-pendientes.page.html',
  styleUrls: ['./clientes-pendientes.page.scss'],
  imports: [IonContent, IonList, IonItem, IonAvatar, IonLabel, IonButton, IonSpinner, IonText],
})
export class ClientesPendientesPage implements OnInit {
  private adminService = inject(AdminService);

  clientes = signal<Usuario[]>([]);
  cargando = signal(true);
  error = signal<string | null>(null);
  // Guarda el id del cliente que se está aprobando/rechazando en
  // este momento, para poder deshabilitar solo SUS botones
  // mientras se procesa (y no los de toda la lista).
  procesando = signal<string | null>(null);

  ngOnInit(): void {
    this.cargarClientes();
  }

  private async cargarClientes(): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      const clientes = await this.adminService.obtenerClientesPendientes();
      this.clientes.set(clientes);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'No se pudo cargar la lista.');
    } finally {
      this.cargando.set(false);
    }
  }

  async aprobar(cliente: Usuario): Promise<void> {
    this.procesando.set(cliente.id);
    try {
      await this.adminService.aprobarCliente(cliente);
      this.quitarDeLista(cliente.id);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'No se pudo aprobar al cliente.');
    } finally {
      this.procesando.set(null);
    }
  }

  async rechazar(cliente: Usuario): Promise<void> {
    this.procesando.set(cliente.id);
    try {
      await this.adminService.rechazarCliente(cliente);
      this.quitarDeLista(cliente.id);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'No se pudo rechazar al cliente.');
    } finally {
      this.procesando.set(null);
    }
  }

  private quitarDeLista(id: string): void {
    // signal.update() recibe una función que toma el valor
    // actual y devuelve el nuevo valor — acá filtramos al
    // cliente ya decidido. Es más rápido que volver a pedirle
    // toda la lista a Supabase después de cada aprobación.
    this.clientes.update((lista) => lista.filter((c) => c.id !== id));
  }
}