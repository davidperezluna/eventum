/* ============================================
   SUPABASE SERVICE
   ============================================ */

import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabaseConfig } from '../config/supabase.config';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);
  }

  /**
   * Obtiene el cliente de Supabase
   */
  getClient(): SupabaseClient {
    return this.supabase;
  }

  /**
   * Obtiene la tabla de la base de datos
   */
  from(table: string) {
    return this.supabase.from(table);
  }

  /**
   * Autenticación
   */
  get auth() {
    return this.supabase.auth;
  }

  /**
   * Storage
   */
  get storage() {
    return this.supabase.storage;
  }

  /**
   * Realtime
   */
  get realtime() {
    return this.supabase.realtime;
  }
}

