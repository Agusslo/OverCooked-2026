import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminService } from '../../../core/services/admin.service';
import { Usuario } from '../../../core/models/usuario.model';

type AccionPendiente = 'aprobar' | 'rechazar';

@Component({
  selector: 'app-clientes-pendientes',
  standalone: true,
  templateUrl: './clientes-pendientes.page.html',
  styleUrls: ['./clientes-pendientes.page.scss'],
  imports: [RouterLink],
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

  // Cliente + acción que está esperando confirmación en el modal.
  // null = modal cerrado.
  confirmacion = signal<{ cliente: Usuario; accion: AccionPendiente } | null>(null);

  // Mensaje de éxito que se muestra tras aprobar/rechazar.
  mensajeExito = signal<string | null>(null);

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

  // Abre el modal de confirmación para la acción elegida.
  pedirConfirmacion(cliente: Usuario, accion: AccionPendiente): void {
    this.mensajeExito.set(null);
    this.confirmacion.set({ cliente, accion });
  }

  cancelarConfirmacion(): void {
    this.confirmacion.set(null);
  }

  // Ejecuta la acción confirmada en el modal.
  async confirmar(): Promise<void> {
    const pendiente = this.confirmacion();
    if (!pendiente) return;

    const { cliente, accion } = pendiente;
    this.confirmacion.set(null);
    this.procesando.set(cliente.id);
    this.error.set(null);

    try {
      if (accion === 'aprobar') {
        await this.adminService.aprobarCliente(cliente);
        this.mensajeExito.set(`Se aprobó a ${cliente.nombre} ${cliente.apellido}.`);
      } else {
        await this.adminService.rechazarCliente(cliente);
        this.mensajeExito.set(`Se rechazó a ${cliente.nombre} ${cliente.apellido}.`);
      }
      this.quitarDeLista(cliente.id);
    } catch (err) {
      const generico =
        accion === 'aprobar'
          ? 'No se pudo aprobar al cliente.'
          : 'No se pudo rechazar al cliente.';
      this.error.set(err instanceof Error ? err.message : generico);
    } finally {
      this.procesando.set(null);
    }
  }

  cerrarExito(): void {
    this.mensajeExito.set(null);
  }

  private quitarDeLista(id: string): void {
    // signal.update() recibe una función que toma el valor
    // actual y devuelve el nuevo valor — acá filtramos al
    // cliente ya decidido. Es más rápido que volver a pedirle
    // toda la lista a Supabase después de cada aprobación.
    this.clientes.update((lista) => lista.filter((c) => c.id !== id));
  }
}
