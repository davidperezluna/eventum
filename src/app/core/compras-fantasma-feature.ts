import { supabaseConfig } from '../config/supabase.config';

const COMPRAS_FANTASMA_URLS = new Set([
  'https://modctxrsohemzlzlvlih.supabase.co', // DEV
  'https://jiknhvnaavhfguqfqbod.supabase.co', // PROD
]);

/** Menú, ruta y RPCs solo en proyectos Supabase autorizados. */
export const comprasFantasmaEnabled = COMPRAS_FANTASMA_URLS.has(
  supabaseConfig.url.replace(/\/$/, '')
);
