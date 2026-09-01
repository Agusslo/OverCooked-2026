import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

type TipoMail = 'registro-pendiente' | 'cliente-aprobado' | 'cliente-rechazado';

// Correos automáticos de la app. Toda la lógica de envío vive en
// la Edge Function 'enviar-mail' (supabase/functions/enviar-mail),
// que es la única que conoce la API key del proveedor. Acá solo
// la invocamos.
@Injectable({
  providedIn: 'root',
})
export class MailService {
  private supabaseService = inject(SupabaseService);

  // Punto 5 del PDF: al crear el cliente registrado se le avisa
  // que su registro quedó 'pendiente de aprobación'.
  enviarRegistroPendiente(para: string, nombre: string): Promise<void> {
    return this.invocar('registro-pendiente', para, nombre);
  }

  // Punto 8 del PDF: el dueño/supervisor aprueba al cliente.
  enviarClienteAprobado(para: string, nombre: string): Promise<void> {
    return this.invocar('cliente-aprobado', para, nombre);
  }

  // Punto 7 del PDF: el dueño/supervisor rechaza al cliente.
  enviarClienteRechazado(
    para: string,
    nombre: string,
    motivo?: string,
  ): Promise<void> {
    return this.invocar('cliente-rechazado', para, nombre, motivo);
  }

  private async invocar(
    tipo: TipoMail,
    para: string,
    nombre: string,
    motivo?: string,
  ): Promise<void> {
    const { error } = await this.supabaseService
      .getClient()
      .functions.invoke('enviar-mail', {
        body: { tipo, para, nombre, motivo },
      });

    if (error) {
      throw new Error(error.message ?? 'No se pudo enviar el correo.');
    }
  }
}
