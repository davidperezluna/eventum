import { Injectable } from '@angular/core';
import { supabaseConfig } from '../config/supabase.config';
import { SupabaseService } from './supabase.service';

export type WompiDiagnosticoNivel = 'ok' | 'warning' | 'error' | 'info';

export interface WompiDiagnosticoItem {
  nivel: WompiDiagnosticoNivel;
  codigo: string;
  mensaje: string;
}

export interface WompiLookupSummary {
  id?: string;
  status?: string;
  reference?: string;
  amount_in_cents?: number;
  currency?: string;
  payment_method_type?: string;
  customer_email?: string | null;
  created_at?: string;
  finalized_at?: string;
}

export interface WompiReconcileCheckout {
  id: number;
  tipo?: string;
  estado?: string;
  wompi_status?: string | null;
  wompi_reference?: string | null;
  wompi_transaction_id?: string | null;
  materializado?: boolean;
  compra_id?: number | null;
  compra_producto_id?: number | null;
  compra_cover_id?: number | null;
  total?: number;
  moneda?: string | null;
  numero_intento?: string;
  fecha_creacion?: string | null;
  cliente?: {
    id: number;
    nombre?: string | null;
    apellido?: string | null;
    email?: string | null;
  } | null;
  evento?: { id: number; titulo?: string | null } | null;
}

export interface WompiReconcileLookupResult {
  success: boolean;
  version?: string;
  error?: string;
  lookup_source?: 'transaction_id' | 'reference' | null;
  wompi_environment?: string;
  wompi_cuenta_id?: number | null;
  requiere_accion?: boolean;
  diagnostico?: WompiDiagnosticoItem[];
  wompi?: WompiLookupSummary | null;
  checkout?: WompiReconcileCheckout | null;
  transaccion_producto?: Record<string, unknown> | null;
  compras?: Record<string, unknown>;
}

export interface WompiReconcileOrphanRow extends WompiReconcileCheckout {
  requiere_accion?: boolean;
  diagnostico?: WompiDiagnosticoItem[];
}

export interface WompiLookupParams {
  reference?: string;
  wompi_transaction_id?: string;
  transaccion_checkout_id?: number;
  compra_id?: number;
  compra_producto_id?: number;
  transaccion_producto_id?: number;
}

@Injectable({ providedIn: 'root' })
export class WompiReconcileService {
  constructor(private supabase: SupabaseService) {}

  async lookup(params: WompiLookupParams): Promise<WompiReconcileLookupResult> {
    return this.invokeFunction({ action: 'lookup', ...params });
  }

  async listOrphans(): Promise<{ success: boolean; orphans: WompiReconcileOrphanRow[]; total: number; error?: string }> {
    const result = await this.invokeFunction({ action: 'list_orphans' });
    return {
      success: !!result.success,
      orphans: (result as { orphans?: WompiReconcileOrphanRow[] }).orphans || [],
      total: (result as { total?: number }).total || 0,
      error: result.error,
    };
  }

  async sincronizar(transaccionCheckoutId: number): Promise<{
    success: boolean;
    error?: string;
    wompi_status?: string;
    webhook?: Record<string, unknown>;
    already_synced?: boolean;
  }> {
    const accessToken = await this.getAccessToken();
    if (!accessToken) {
      return { success: false, error: 'Sesión expirada' };
    }

    const response = await fetch(`${supabaseConfig.url}/functions/v1/wompi-sync-status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        apikey: supabaseConfig.anonKey,
      },
      body: JSON.stringify({ transaccion_checkout_id: transaccionCheckoutId }),
    });

    const data = await response.json();
    if (!response.ok || data.success === false) {
      return {
        success: false,
        error: data.error || data.message || 'No se pudo sincronizar',
        wompi_status: data.wompi_status,
      };
    }

    return {
      success: true,
      wompi_status: data.wompi_status,
      webhook: data.webhook,
      already_synced: data.already_synced,
    };
  }

  private async invokeFunction(body: Record<string, unknown>): Promise<WompiReconcileLookupResult> {
    const accessToken = await this.getAccessToken();
    if (!accessToken) {
      return { success: false, error: 'Sesión expirada' };
    }

    const response = await fetch(`${supabaseConfig.url}/functions/v1/wompi-reconcile-lookup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        apikey: supabaseConfig.anonKey,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (!response.ok) {
      return { success: false, error: data.error || `HTTP ${response.status}` };
    }
    return data as WompiReconcileLookupResult;
  }

  private async getAccessToken(): Promise<string | null> {
    const { data: { session } } = await this.supabase.getClient().auth.getSession();
    return session?.access_token ?? null;
  }
}
