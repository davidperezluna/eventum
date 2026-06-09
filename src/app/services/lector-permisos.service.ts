import { Injectable } from '@angular/core';

import { SupabaseService } from './supabase.service';

import { BoletaComprada } from '../types';



export type PermisoEscaneo = {

  id: number;

  scope: 'evento' | 'cover';

  evento_id: number | null;

  lugar_id: number | null;

  tipo_boleta_id: number | null;

  tipo_cover_id: number | null;

  titulo_contexto: string;

  nombre_tipo: string;

  categoria: 'boleta' | 'producto' | 'cover';

};



type RowEventoDb = {

  id: number;

  evento_id: number;

  tipo_boleta_id: number | string | null;

};



type RowCoverDb = {

  id: number;

  lugar_id: number;

  tipo_cover_id: number;

};



export function buildPermisoKey(eventoId: number, tipoBoletaId: number): string {

  return `${eventoId}:${tipoBoletaId}`;

}



export function buildPermisoCoverKey(lugarId: number, tipoCoverId: number): string {

  return `cover:${lugarId}:${tipoCoverId}`;

}



@Injectable({ providedIn: 'root' })

export class LectorPermisosService {

  constructor(private supabase: SupabaseService) {}



  private normalizarTipoBoletaId(raw: number | string | null | undefined): number | null {

    if (raw == null) {

      return null;

    }

    if (typeof raw === 'string') {

      const clean = raw.trim().toLowerCase();

      if (!clean || clean === 'null' || clean === 'undefined') {

        return null;

      }

    }

    const parsed = Number(raw);

    if (!Number.isFinite(parsed) || parsed <= 0) {

      return null;

    }

    return parsed;

  }



  /** Permisos del lector autenticado (eventos + covers por lugar). */

  async fetchMisPermisosEscaneo(): Promise<PermisoEscaneo[]> {

    const [eventoRes, coverRes] = await Promise.all([

      this.supabase

        .from('lector_evento_tipo_boleta')

        .select('id, evento_id, tipo_boleta_id')

        .order('evento_id', { ascending: true }),

      this.supabase

        .from('lector_lugar_tipo_cover')

        .select('id, lugar_id, tipo_cover_id')

        .order('lugar_id', { ascending: true }),

    ]);



    if (eventoRes.error) {

      console.error('fetchMisPermisosEscaneo (evento):', eventoRes.error);

      throw eventoRes.error;

    }

    if (coverRes.error) {

      console.error('fetchMisPermisosEscaneo (cover):', coverRes.error);

      throw coverRes.error;

    }



    const permisosEvento = await this.enriquecerPermisosEvento((eventoRes.data as RowEventoDb[]) || []);

    const permisosCover = await this.enriquecerPermisosCover((coverRes.data as RowCoverDb[]) || []);

    return [...permisosEvento, ...permisosCover];

  }



  private async enriquecerPermisosEvento(rows: RowEventoDb[]): Promise<PermisoEscaneo[]> {

    const filasNormalizadas = rows.map((r) => ({

      id: Number(r.id || 0),

      evento_id: Number(r.evento_id),

      tipo_boleta_id: this.normalizarTipoBoletaId(r.tipo_boleta_id),

    }));



    const eventoIds = [...new Set(filasNormalizadas.map((r) => r.evento_id).filter((id) => id > 0))];

    const tipoIds = [

      ...new Set(

        filasNormalizadas

          .map((r) => r.tipo_boleta_id)

          .filter((id): id is number => typeof id === 'number'),

      ),

    ];



    const nombresEvento = new Map<number, string>();

    const nombresTipo = new Map<number, string>();



    if (eventoIds.length > 0) {

      const { data: eventosData, error: eventosError } = await this.supabase

        .from('eventos')

        .select('id, titulo')

        .in('id', eventoIds);

      if (!eventosError && Array.isArray(eventosData)) {

        for (const ev of eventosData as Array<{ id: number; titulo?: string }>) {

          if (typeof ev.id === 'number' && ev.titulo) {

            nombresEvento.set(ev.id, ev.titulo);

          }

        }

      }

    }



    if (tipoIds.length > 0) {

      const { data: tiposData, error: tiposError } = await this.supabase

        .from('tipos_boleta')

        .select('id, nombre')

        .in('id', tipoIds);

      if (!tiposError && Array.isArray(tiposData)) {

        for (const tb of tiposData as Array<{ id: number; nombre?: string }>) {

          if (typeof tb.id === 'number' && tb.nombre) {

            nombresTipo.set(tb.id, tb.nombre);

          }

        }

      }

    }



    return filasNormalizadas

      .map((r) => {

        const eventoId = Number(r.evento_id);

        if (!Number.isFinite(eventoId) || eventoId <= 0) {

          return null;

        }



        const esProducto = r.tipo_boleta_id == null;

        const tipoId = esProducto ? null : r.tipo_boleta_id;

        const tipoValido = typeof tipoId === 'number' && Number.isFinite(tipoId) && tipoId > 0;



        return {

          id: r.id,

          scope: 'evento' as const,

          evento_id: eventoId,

          lugar_id: null,

          tipo_boleta_id: esProducto ? null : tipoValido ? tipoId : null,

          tipo_cover_id: null,

          titulo_contexto: nombresEvento.get(eventoId) || `Evento ${eventoId}`,

          nombre_tipo: esProducto

            ? 'Productos del evento'

            : tipoValido

              ? nombresTipo.get(tipoId!) || `Tipo ${tipoId}`

              : 'Tipo de boleta',

          categoria: esProducto ? ('producto' as const) : ('boleta' as const),

        };

      })

      .filter((p) => p !== null);

  }



  private async enriquecerPermisosCover(rows: RowCoverDb[]): Promise<PermisoEscaneo[]> {

    const filas = rows.map((r) => ({

      id: Number(r.id || 0),

      lugar_id: Number(r.lugar_id),

      tipo_cover_id: Number(r.tipo_cover_id),

    }));



    const lugarIds = [...new Set(filas.map((r) => r.lugar_id).filter((id) => id > 0))];

    const tipoIds = [...new Set(filas.map((r) => r.tipo_cover_id).filter((id) => id > 0))];



    const nombresLugar = new Map<number, string>();

    const nombresTipo = new Map<number, string>();



    if (lugarIds.length > 0) {

      const { data, error } = await this.supabase.from('lugares').select('id, nombre').in('id', lugarIds);

      if (!error && Array.isArray(data)) {

        for (const l of data as Array<{ id: number; nombre?: string }>) {

          if (l.id && l.nombre) nombresLugar.set(l.id, l.nombre);

        }

      }

    }



    if (tipoIds.length > 0) {

      const { data, error } = await this.supabase.from('tipos_cover').select('id, nombre').in('id', tipoIds);

      if (!error && Array.isArray(data)) {

        for (const t of data as Array<{ id: number; nombre?: string }>) {

          if (t.id && t.nombre) nombresTipo.set(t.id, t.nombre);

        }

      }

    }



    return filas

      .filter((r) => r.lugar_id > 0 && r.tipo_cover_id > 0)

      .map((r) => ({

        id: r.id,

        scope: 'cover' as const,

        evento_id: null,

        lugar_id: r.lugar_id,

        tipo_boleta_id: null,

        tipo_cover_id: r.tipo_cover_id,

        titulo_contexto: nombresLugar.get(r.lugar_id) || `Lugar ${r.lugar_id}`,

        nombre_tipo: nombresTipo.get(r.tipo_cover_id) || `Cover ${r.tipo_cover_id}`,

        categoria: 'cover' as const,

      }));

  }



  /** Filtra boletas según evento + tipo asignados al lector. */

  async filtrarBoletasConPermisos(

    boletas: BoletaComprada[],

    permisoKeys: Set<string>,

  ): Promise<BoletaComprada[]> {

    const filtradas: BoletaComprada[] = [];

    for (const boleta of boletas) {

      const { data: tipoBoleta, error } = await this.supabase

        .from('tipos_boleta')

        .select('evento_id')

        .eq('id', boleta.tipo_boleta_id)

        .single();

      if (error || !tipoBoleta) continue;

      const key = buildPermisoKey(tipoBoleta.evento_id, boleta.tipo_boleta_id);

      if (permisoKeys.has(key)) {

        filtradas.push(boleta);

      }

    }

    return filtradas;

  }

}


