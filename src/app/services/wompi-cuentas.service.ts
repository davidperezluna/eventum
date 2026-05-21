/* ============================================
   WOMPI CUENTAS SERVICE
   ============================================ */

import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WompiCuenta } from '../types';

@Injectable({
  providedIn: 'root'
})
export class WompiCuentasService {
  private tableName = 'wompi_cuentas';

  constructor(private supabase: SupabaseService) {}

  async getCuentasActivas(): Promise<WompiCuenta[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('id, nombre, private_key_env, public_key_env, events_secret_env, integrity_key_env, environment_env, activo, fecha_creacion, fecha_actualizacion')
      .eq('activo', true)
      .order('nombre', { ascending: true });

    if (error) {
      throw error;
    }

    return (data || []) as WompiCuenta[];
  }
}
