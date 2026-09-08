import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { AuthService } from '../../../core/services/auth.service';
import { MesasService } from '../../../core/services/mesas.service';
import { MensajesService } from '../../../core/services/mensajes.service';
import { Mesa } from '../../../core/models/mesa.model';
import { MensajeMesa } from '../../../core/models/mensaje.model';

@Component({
  selector: 'app-chat-mesa',
  standalone: true,
  templateUrl: './chat-mesa.page.html',
  styleUrls: ['./chat-mesa.page.scss'],
  imports: [FormsModule],
})
export class ChatMesaPage implements OnInit, OnDestroy {
  @ViewChild('scrollMensajes') scrollMensajes?: ElementRef<HTMLDivElement>;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);
  private mesasService = inject(MesasService);
  private mensajesService = inject(MensajesService);

  mesa = signal<Mesa | null>(null);
  mensajes = signal<MensajeMesa[]>([]);
  cargando = signal(true);
  enviando = signal(false);
  mensajeError = signal('');
  textoNuevo = signal('');

  private canal?: RealtimeChannel;

  get miId(): string {
    return this.authService.usuarioActual?.id ?? '';
  }

  async ngOnInit(): Promise<void> {
    const numero = Number(this.route.snapshot.paramMap.get('numero'));
    await this.cargarDatos(numero);
  }

  ngOnDestroy(): void {
    if (this.canal) {
      this.mensajesService.dejarDeEscuchar(this.canal);
    }
  }

  private async cargarDatos(numero: number): Promise<void> {
    this.cargando.set(true);
    this.mensajeError.set('');

    try {
      const mesa = await this.mesasService.obtenerPorNumero(numero);
      this.mesa.set(mesa);

      const mensajes = await this.mensajesService.listarPorMesa(mesa.id);
      this.mensajes.set(mensajes);
      this.scrollAlFinal();

      // Apenas entra alguien nuevo a la conversación (cualquier mozo,
      // o el cliente de esa mesa), se suma en vivo sin recargar.
      this.canal = this.mensajesService.escucharMesa(mesa.id, (mensajeNuevo) => {
        this.mensajes.update((lista) => [...lista, mensajeNuevo]);
        this.scrollAlFinal();
      });
    } catch (error) {
      await this.dispararError(
        error instanceof Error ? error.message : 'No se pudo abrir la consulta.',
      );
    } finally {
      this.cargando.set(false);
    }
  }

  async enviarMensaje(): Promise<void> {
    const texto = this.textoNuevo().trim();
    const mesa = this.mesa();
    const usuario = this.authService.usuarioActual;

    if (!texto || !mesa || !usuario || this.enviando()) {
      return;
    }

    this.enviando.set(true);
    try {
      await this.mensajesService.enviar({
        mesaId: mesa.id,
        autorId: usuario.id,
        autorNombre: `${usuario.nombre} ${usuario.apellido}`.trim(),
        // El mozo escribe como 'mozo'; cliente y anónimo escriben cada
        // uno con su propio perfil (así se distingue visualmente quién
        // dijo qué, aunque los dos aparezcan "del lado del cliente").
        autorPerfil: usuario.perfil === 'mozo' ? 'mozo' : (usuario.perfil as 'cliente' | 'anonimo'),
        contenido: texto,
      });
      this.textoNuevo.set('');
      // No hace falta agregar el mensaje a mano a la lista: el canal
      // de Realtime que ya está escuchando lo va a traer solo, apenas
      // Supabase confirme el insert.
    } catch (error) {
      await this.dispararError(
        error instanceof Error ? error.message : 'No se pudo enviar el mensaje.',
      );
    } finally {
      this.enviando.set(false);
    }
  }

  esMio(mensaje: MensajeMesa): boolean {
    return mensaje.autor_id === this.miId;
  }

  volver(): void {
    this.router.navigateByUrl(
      this.authService.usuarioActual?.perfil === 'mozo' ? '/mozo/consultas' : '/inicio',
    );
  }

  private scrollAlFinal(): void {
    // setTimeout(0) espera a que Angular termine de dibujar el mensaje
    // nuevo en el DOM antes de intentar scrollear, si no scrollHeight
    // todavía tendría el valor de antes de agregar la fila.
    setTimeout(() => {
      const el = this.scrollMensajes?.nativeElement;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    });
  }

  private async dispararError(texto: string): Promise<void> {
    this.mensajeError.set(texto);
    try {
      await Haptics.notification({ type: NotificationType.Error });
    } catch {}
  }
}