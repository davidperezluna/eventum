/* ============================================
   CUPONES SERVICE
   Servicio para gestionar cupones de descuento
   ============================================ */

import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { CuponDescuento } from '../types';

@Injectable({
  providedIn: 'root'
})
export class CuponesService {
  private tableName = 'cupones_descuento';

  constructor(private supabase: SupabaseService) {}

  /**
   * Obtiene todos los cupones de un evento
   */
  async getCuponesByEvento(eventoId: number): Promise<CuponDescuento[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('evento_id', eventoId)
      .order('fecha_creacion', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Crea un nuevo cupón
   */
  async crearCupon(cupon: Partial<CuponDescuento>): Promise<CuponDescuento> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .insert(cupon)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Actualiza un cupón
   */
  async actualizarCupon(id: number, cambios: Partial<CuponDescuento>): Promise<CuponDescuento> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .update(cambios)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Elimina un cupón
   */
  async eliminarCupon(id: number): Promise<void> {
    const { error } = await this.supabase
      .from(this.tableName)
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * Valida un código de cupón para un evento específico
   */
  async validarCupon(codigo: string, eventoId: number): Promise<CuponDescuento | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('codigo', codigo.trim().toUpperCase())
      .eq('evento_id', eventoId)
      .eq('activo', true)
      .maybeSingle();

    if (error) {
      console.error('Error validando cupón:', error);
      return null;
    }

    if (!data) return null;

    // Validar expiración
    if (data.fecha_expiracion) {
      const expiracion = new Date(data.fecha_expiracion);
      if (expiracion < new Date()) {
        return null;
      }
    }

    // Validar usos
    if (data.usos_actuales >= data.max_usos) {
      return null;
    }

    return data;
  }
}
