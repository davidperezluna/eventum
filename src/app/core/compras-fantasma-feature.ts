import { supabaseConfig } from '../config/supabase.config';

/** El módulo se habilita inicialmente solo en el proyecto DEV autorizado. */
export const comprasFantasmaEnabled =
  supabaseConfig.url.replace(/\/$/, '') === 'https://modctxrsohemzlzlvlih.supabase.co';
