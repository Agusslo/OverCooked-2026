import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
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
  imports: [CommonModule, FormsModule],
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
  private hiloClienteId = '';

  get miId(): string {
    return this.authService.usuarioActual?.id ?? '';
  }

  get esMozo(): boolean {
    return this.authService.usuarioActual?.perfil === 'mozo';
  }

  async ngOnInit(): Promise<void> {
    const numero = Number(this.route.snapshot.paramMap.get('numero'));

    // Si es el mozo, el hilo viene en la URL (lo eligió en la
    // pantalla anterior). Si es cliente/anónimo, el hilo es siempre
    // el suyo propio.
    const hiloDeRuta = this.route.snapshot.paramMap.get('hilo');
    this.hiloClienteId = hiloDeRuta ?? this.miId;

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

      const mensajes = await this.mensajesService.listarPorHilo(mesa.id, this.hiloClienteId);
      this.mensajes.set(mensajes);
      this.scrollAlFinal();

      if (this.esMozo) {
        await this.mensajesService.marcarLeidoGlobal(mesa.id, this.hiloClienteId);
      }

      this.canal = this.mensajesService.escucharHilo(
        mesa.id,
        this.hiloClienteId,
        (mensajeNuevo) => {
          this.mensajes.update((lista) => [...lista, mensajeNuevo]);
          this.scrollAlFinal();
          if (this.esMozo) {
            void this.mensajesService.marcarLeidoGlobal(mesa.id, this.hiloClienteId);
          }
        },
      );
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
        hiloClienteId: this.hiloClienteId,
        autorId: usuario.id,
        autorNombre: `${usuario.nombre} ${usuario.apellido}`.trim(),
        autorPerfil: usuario.perfil === 'mozo' ? 'mozo' : (usuario.perfil as 'cliente' | 'anonimo'),
        contenido: texto,
      });
      this.textoNuevo.set('');
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

  // Título/subtítulo del header: el mozo ve el nombre de quien escribe
  // (lo tomamos del primer mensaje ajeno ya cargado, sin pedir datos
  // extra); el cliente/anónimo siempre ve el mismo encabezado fijo.
  tituloChat(): string {
    if (!this.esMozo) {
      return 'Consulta al mozo';
    }
    const deLaOtraParte = this.mensajes().find((m) => m.autor_id !== this.miId);
    return deLaOtraParte?.autor_nombre ?? 'Cliente';
  }

  subtituloChat(): string {
    const mesa = this.mesa();
    if (!mesa) {
      return '';
    }
    return this.esMozo ? `Mesa ${mesa.numero} · ${mesa.capacidad} personas` : `Mesa ${mesa.numero}`;
  }

  async volver(): Promise<void> {
    if (!this.esMozo) {
      this.router.navigateByUrl('/inicio');
      return;
    }

    const mesa = this.mesa();
    if (!mesa) {
      this.router.navigateByUrl('/mozo/consultas');
      return;
    }

    try {
      const hilos = await this.mensajesService.listarHilosDeMesa(mesa.id);
      if (hilos.length <= 1) {
        // Si entraste directo (un solo hilo), salís directo también.
        this.router.navigateByUrl('/mozo/consultas');
      } else {
        this.router.navigate(['/mozo/hilos', mesa.numero]);
      }
    } catch {
      this.router.navigateByUrl('/mozo/consultas');
    }
  }

  private scrollAlFinal(): void {
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