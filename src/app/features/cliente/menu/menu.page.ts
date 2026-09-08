import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { AuthService } from '../../../core/services/auth.service';
import { MesasService } from '../../../core/services/mesas.service';
import { ProductosService } from '../../../core/services/productos.service';
import { Mesa } from '../../../core/models/mesa.model';
import { Producto } from '../../../core/models/producto.model';


@Component({
  selector: 'app-menu',
  standalone: true,
  templateUrl: './menu.page.html',
  styleUrls: ['./menu.page.scss'],
  imports: [CommonModule],
})
export class MenuPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);
  private mesasService = inject(MesasService);
  private productosService = inject(ProductosService);

  mesa = signal<Mesa | null>(null);
  productos = signal<Producto[]>([]);
  cargando = signal(true);
  mensajeError = signal('');

  // Cada producto puede tener hasta 3 fotos. Acá guardamos, para cada
  // producto (por su id), cuál de esas 3 se está mostrando ahora mismo.
  // Un Record<string, number> es un objeto donde las claves son texto
  // (el id del producto) y los valores son número (el índice de la foto).
  private indicesFoto = signal<Record<string, number>>({});

  ngOnInit(): void {
    const numero = Number(this.route.snapshot.paramMap.get('numero'));
    this.cargarDatos(numero);
  }

  private async cargarDatos(numero: number): Promise<void> {
    this.cargando.set(true);
    this.mensajeError.set('');

    try {
      // Pedimos la mesa y el menú al mismo tiempo (no una atrás de la
      // otra) porque no dependen una de la otra: Promise.all espera a
      // que las dos terminen y devuelve ambos resultados juntos.
      const [mesa, productos] = await Promise.all([
        this.mesasService.obtenerPorNumero(numero),
        this.productosService.listarDisponibles(),
      ]);

      // Punto 10: un cliente registrado sólo puede ver el menú de SU
      // mesa asignada, aunque entre directo por la URL sin pasar por
      // el escaneo (ver EscanearMesaPage, que hace la misma validación
      // antes de llegar acá).
      const usuario = this.authService.usuarioActual;
      if (usuario?.perfil === 'cliente') {
        const mesaAsignada = await this.mesasService.obtenerMesaAsignadaA(usuario.id);
        if (!mesaAsignada || mesaAsignada.numero !== numero) {
          const detalle = mesaAsignada
            ? `Tu mesa asignada es la Nº ${mesaAsignada.numero}.`
            : 'Todavía no tenés una mesa asignada.';
          await this.dispararError(`Esa no es tu mesa. ${detalle}`);
          return;
        }
      }

      this.mesa.set(mesa);
      this.productos.set(productos);
    } catch (error) {
      await this.dispararError(
        error instanceof Error ? error.message : 'No se pudo cargar el menú.',
      );
    } finally {
      this.cargando.set(false);
    }
  }

  // Las 3 fotos de un producto, descartando cualquiera que venga vacía
  // (por si algún producto viejo se cargó con menos de 3 en su momento).
  fotosDe(producto: Producto): string[] {
    return [producto.foto_url, producto.foto_url_2, producto.foto_url_3].filter(
      (url) => !!url,
    );
  }

  indiceActual(producto: Producto): number {
    return this.indicesFoto()[producto.id] ?? 0;
  }

  fotoActual(producto: Producto): string {
    const fotos = this.fotosDe(producto);
    return fotos[this.indiceActual(producto)] ?? '';
  }

  siguienteFoto(producto: Producto): void {
    const total = this.fotosDe(producto).length;
    if (total <= 1) return;

    // El operador de propagación (...) copia todas las claves del
    // objeto anterior en uno nuevo, y después sobreescribimos solo
    // la del producto actual. Así no perdemos el índice guardado
    // de los demás productos de la lista.
    this.indicesFoto.update((mapa) => ({
      ...mapa,
      [producto.id]: (this.indiceActual(producto) + 1) % total,
    }));
  }

  anteriorFoto(producto: Producto): void {
    const total = this.fotosDe(producto).length;
    if (total <= 1) return;

    this.indicesFoto.update((mapa) => ({
      ...mapa,
      [producto.id]: (this.indiceActual(producto) - 1 + total) % total,
    }));
  }

  irAConsulta(): void {
    const mesa = this.mesa();
    if (mesa) {
      this.router.navigate(['/cliente/chat', mesa.numero]);
    }
  }

  private async dispararError(texto: string): Promise<void> {
    this.mensajeError.set(texto);
    try {
      await Haptics.notification({ type: NotificationType.Error });
    } catch {}
  }

}