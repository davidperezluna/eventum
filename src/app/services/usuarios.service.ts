/* ============================================
   USUARIOS SERVICE
   ============================================ */

import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { TimezoneService } from './timezone.service';
import { Usuario, TipoUsuario, PaginatedResponse, BaseFilters } from '../types';

export interface UsuarioFilters extends BaseFilters {
  tipo_usuario_id?: number;
  activo?: boolean;
  email_verificado?: boolean;
  search?: string;
}

@Injectable({
  providedIn: 'root'
})
export class UsuariosService {
  constructor(
    private supabase: SupabaseService,
    private timezoneService: TimezoneService
  ) {}

  /**
   * Obtiene todos los usuarios con filtros opcionales
   */
  async getUsuarios(filters?: UsuarioFilters): Promise<PaginatedResponse<Usuario>> {
    try {
      let query = this.supabase.from('usuarios').select('*', { count: 'exact' });

      // Aplicar filtros
      if (filters?.tipo_usuario_id) {
        query = query.eq('tipo_usuario_id', filters.tipo_usuario_id);
      }
      if (filters?.activo !== undefined) {
        query = query.eq('activo', filters.activo);
      }
      if (filters?.email_verificado !== undefined) {
        query = query.eq('email_verificado', filters.email_verificado);
      }
      if (filters?.search) {
        query = query.or(`email.ilike.%${filters.search}%,nombre.ilike.%${filters.search}%,apellido.ilike.%${filters.search}%`);
      }

      // Ordenamiento
      const sortBy = filters?.sortBy || 'fecha_creacion';
      const sortOrder = filters?.sortOrder || 'desc';
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });

      // Paginación
      const page = filters?.page || 1;
      const limit = filters?.limit || 10;
      const fromIndex = (page - 1) * limit;
      const toIndex = fromIndex + limit - 1;
      query = query.range(fromIndex, toIndex);

      const { data, error, count } = await query;
      
      if (error) {
        console.error('Error en getUsuarios:', error);
        throw error;
      }
      
      const total = count || 0;
      const usuarios = (data as Usuario[]) || [];
      console.log('Usuarios cargados:', usuarios.length, 'de', total);
      
      return {
        data: usuarios,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      console.error('Error catch en getUsuarios:', error);
      throw error;
    }
  }

  /**
   * Obtiene un usuario por ID
   */
  async getUsuarioById(id: number): Promise<Usuario> {
    try {
      const { data, error } = await this.supabase
        .from('usuarios')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data as Usuario;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Crea un nuevo usuario con Supabase Auth
   */
  async createUsuario(usuarioData: { email: string; password: string; nombre?: string; apellido?: string; tipo_usuario_id: number; telefono?: string; activo?: boolean }): Promise<Usuario> {
    try {
      console.log('Creando usuario en Supabase Auth:', usuarioData.email);
      
      const { data: authData, error: authError } = await this.supabase.auth.signUp({
        email: usuarioData.email,
        password: usuarioData.password,
        options: {
          data: {
            nombre: usuarioData.nombre || '',
            apellido: usuarioData.apellido || ''
          }
        }
      });

      if (authError || !authData?.user) {
        console.error('Error creando usuario en Auth:', authError);
        throw authError || { message: 'Error al crear usuario en Auth' };
      }

      console.log('Usuario creado en Auth:', authData.user.id);

      // Crear registro en tabla usuarios
      const usuarioRecord: Partial<Usuario> = {
        email: usuarioData.email,
        nombre: usuarioData.nombre,
        apellido: usuarioData.apellido,
        telefono: usuarioData.telefono,
        tipo_usuario_id: usuarioData.tipo_usuario_id,
        activo: usuarioData.activo !== undefined ? usuarioData.activo : true,
        email_verificado: authData.user.email_confirmed_at ? true : false,
        auth_user_id: authData.user.id
      };

      const { data, error } = await this.supabase
        .from('usuarios')
        .insert(usuarioRecord)
        .select()
        .single();

      if (error) {
        console.error('Error creando registro en tabla usuarios:', error);
        throw error;
      }

      console.log('Usuario creado exitosamente:', data);
      return data as Usuario;
    } catch (error: any) {
      console.error('Error catch en createUsuario:', error);
      throw error;
    }
  }

  /**
   * Actualiza un usuario
   */
  async updateUsuario(id: number, usuario: Partial<Usuario>): Promise<Usuario> {
    try {
      const { data, error } = await this.supabase
        .from('usuarios')
        .update({ ...usuario, fecha_actualizacion: this.timezoneService.getCurrentDateISO() })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data as Usuario;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Cambia la contraseña de un usuario (solo para administradores)
   */
  async changePassword(authUserId: string, newPassword: string): Promise<void> {
    try {
      console.log('Solicitando cambio de contraseña para:', authUserId);
      const { data, error } = await this.supabase.functions.invoke('admin-change-password', {
        body: { authUserId, newPassword }
      });

      if (error) {
        console.error('Error invocando función admin-change-password:', error);
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      console.log('Contraseña actualizada exitosamente');
    } catch (error: any) {
      console.error('Error en changePassword:', error);
      throw error;
    }
  }

  /**
   * Elimina un usuario (soft delete)
   */
  async deleteUsuario(id: number): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('usuarios')
        .update({ activo: false })
        .eq('id', id);
      
      if (error) throw error;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Obtiene todos los tipos de usuario
   */
  async getTiposUsuario(): Promise<TipoUsuario[]> {
    try {
      const { data, error } = await this.supabase
        .from('tipos_usuario')
        .select('*')
        .eq('activo', true)
        .order('id');
      
      if (error) throw error;
      return (data as TipoUsuario[]) || [];
    } catch (error) {
      throw error;
    }
  }

  /**
   * Obtiene todos los organizadores (tipo_usuario_id = 2)
   */
  async getOrganizadores(): Promise<Usuario[]> {
    try {
      console.log('Ejecutando consulta de organizadores con tipo_usuario_id = 2...');
      
      const query = this.supabase
        .from('usuarios')
        .select('*')
        .eq('tipo_usuario_id', 2)
        .eq('activo', true)
        .order('nombre', { ascending: true });
      
      console.log('Query preparada, ejecutando...');
      const startTime = Date.now();
      const { data, error } = await query;
      const elapsedTime = Date.now() - startTime;
      console.log(`Consulta completada en ${elapsedTime}ms`);
      
      if (error) {
        console.error('Error en getOrganizadores:', error);
        
        // Si hay error de RLS o permisos, intentar sin filtro de activo
        if (error.code === 'PGRST116' || error.message?.includes('permission') || error.message?.includes('RLS')) {
          console.log('Error de permisos detectado, intentando consulta alternativa...');
          const { data: dataAlt, error: errorAlt } = await this.supabase
            .from('usuarios')
            .select('*')
            .eq('tipo_usuario_id', 2)
            .order('nombre', { ascending: true });
          
          if (errorAlt) {
            console.error('Error en consulta alternativa:', errorAlt);
            throw errorAlt;
          }
          
          const organizadores = (dataAlt as Usuario[]) || [];
          console.log('Organizadores encontrados (sin filtro activo):', organizadores.length);
          return organizadores;
        }
        
        throw error;
      }
      
      const organizadores = (data as Usuario[]) || [];
      console.log('Organizadores procesados:', organizadores.length);
      if (organizadores.length === 0) {
        console.warn('No se encontraron organizadores con tipo_usuario_id = 2 y activo = true');
      }
      
      return organizadores;
    } catch (error: any) {
      console.error('Error catch en getOrganizadores:', error);
      throw error;
    }
  }
}
