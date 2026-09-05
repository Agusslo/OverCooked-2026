    import { Injectable } from '@angular/core';
    import { SupabaseService } from './supabase.service';
    import { ClienteEnEspera } from '../models/lista-espera.model';

    export interface DatosAnotarse {
    clienteId?: string;         // id de 'usuarios', si es cliente registrado
    clienteAnonimoId?: string;  // id de auth, si es cliente anónimo
    nombre: string;
    fotoUrl: string;
    }

    @Injectable({
    providedIn: 'root',
    })
    export class ListaEsperaService {
    constructor(private supabaseService: SupabaseService) {}

    // Punto 9: al escanear el QR de ingreso, el cliente (anónimo o
    // registrado) queda anotado en la lista de espera del metre.
    async anotarse(datos: DatosAnotarse): Promise<void> {
    const client = this.supabaseService.getClient();

    const { error } = await client.from('lista_espera').insert({
        cliente_id: datos.clienteId ?? null,
        cliente_anonimo_id: datos.clienteAnonimoId ?? null,
        nombre: datos.nombre,
        foto_url: datos.fotoUrl,
        estado: 'esperando',
    });

    if (error) {
        throw new Error('No se pudo anotar en la lista de espera.');
    }
    }

    // Para la pantalla del metre (punto 9/10): solo los que siguen
    // esperando, más antiguos primero (orden de llegada).
    async listarEsperando(): Promise<ClienteEnEspera[]> {
    const { data, error } = await this.supabaseService
        .getClient()
        .from('lista_espera')
        .select('*')
        .eq('estado', 'esperando')
        .order('created_at', { ascending: true });

    if (error) {
        throw new Error('No se pudo cargar la lista de espera.');
    }

    return (data ?? []) as ClienteEnEspera[];
    }

    // "Eliminado del listado": no se borra la fila, se marca como
    // cancelado (así queda historial y el enum ya contempla este caso).
    async eliminar(id: string): Promise<void> {
    const { error } = await this.supabaseService
        .getClient()
        .from('lista_espera')
        .update({ estado: 'cancelado' })
        .eq('id', id);

    if (error) {
        throw new Error('No se pudo sacar al cliente de la lista de espera.');
    }
    }

    // Punto 10: nadie puede recibir una mesa si no está esperando.
    async estaEsperando(clienteId?: string, clienteAnonimoId?: string): Promise<boolean> {
    const client = this.supabaseService.getClient();
    let query = client.from('lista_espera').select('id').eq('estado', 'esperando');

    query = clienteId ? query.eq('cliente_id', clienteId) : query.eq('cliente_anonimo_id', clienteAnonimoId!);

    const { data, error } = await query.maybeSingle();

    if (error) {
        throw new Error('No se pudo verificar la lista de espera.');
    }

    return !!data;
    }
    }