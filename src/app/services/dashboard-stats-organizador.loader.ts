/* ============================================
   DASHBOARD STATS — alcance organizador
   Invocado únicamente desde DashboardService
   ============================================ */

import { SupabaseService } from './supabase.service';
import { TimezoneService } from './timezone.service';
import { DashboardStats } from '../types';
import { agregarFinanzasDesdeComprasCompletadas, repartoWompiPorCompra } from '../utils/wompi-finanzas';
import { DateTimeUtil } from '../utils/date-time.util';

export async function loadDashboardStatsForOrganizador(
  supabase: SupabaseService,
  timezoneService: TimezoneService,
  organizadorId: number,
  eventoId?: number
): Promise<DashboardStats> {
    const now = timezoneService.getCurrentDateISO();

    // Función helper para manejar errores
    const safeExecute = async <T>(fn: () => Promise<T>, defaultValue: T): Promise<T> => {
      try {
        return await fn();
      } catch (error) {
        console.error('Error en consulta:', error);
        return defaultValue;
      }
    };

    const withEventFilter = (query: any, column = 'evento_id') =>
      eventoId ? query.eq(column, eventoId) : query;

    // Eventos activos del organizador (misma regla que dashboard admin)
    const eventosActivos = safeExecute(async () => {
      const base = () =>
        withEventFilter(
          supabase
          .from('eventos')
          .select('id', { count: 'exact', head: true })
          .eq('organizador_id', organizadorId)
          .eq('activo', true)
          .eq('estado', 'publicado'),
          'id'
        );

      const [sinFechaFin, conFechaFinVigente] = await Promise.all([
        base().is('fecha_fin', null),
        base().gte('fecha_fin', now)
      ]);

      if (sinFechaFin.error) {
        console.error('Error en eventos activos (sin fecha_fin):', sinFechaFin.error);
        return 0;
      }
      if (conFechaFinVigente.error) {
        console.error('Error en eventos activos (fecha_fin vigente):', conFechaFinVigente.error);
        return 0;
      }
      return (sinFechaFin.count ?? 0) + (conFechaFinVigente.count ?? 0);
    }, 0);

    // Boletas vendidas de eventos del organizador (solo con pago completado)
    const boletasVendidas = safeExecute(async () => {
      try {
        // Obtener todos los tipos de boleta de eventos del organizador
        const { data: tiposData, error: tiposError } = await withEventFilter(supabase
          .from('tipos_boleta')
          .select('id, evento_id, eventos!inner(organizador_id)')
          .eq('eventos.organizador_id', organizadorId));

        if (tiposError || !tiposData || tiposData.length === 0) {
          return 0;
        }

        const tiposIds = tiposData.map((t: any) => t.id);
        
        // Contar boletas compradas de esos tipos con pago completado
        const { count, error } = await supabase
          .from('boletas_compradas')
          .select('*, compras!inner(estado_pago)', { count: 'exact' })
          .in('tipo_boleta_id', tiposIds)
          .eq('compras.estado_pago', 'completado');

        if (error) {
          console.error('Error en boletas vendidas:', error);
          return 0;
        }
        return count || 0;
      } catch (error) {
        console.error('Error en boletas vendidas:', error);
        return 0;
      }
    }, 0);

    // Aforo histórico: incluye tipos inactivos (siguen aportando capacidad/ventas a métricas).
    const aforoTotal = safeExecute(async () => {
      const { data, error } = await withEventFilter(supabase
        .from('tipos_boleta')
        .select('cantidad_total, eventos!inner(organizador_id, activo, estado, fecha_fin)')
        .eq('eventos.organizador_id', organizadorId));
      if (error || !Array.isArray(data)) return 0;
      const now = Date.now();
      return data.reduce((sum: number, tipo: any) => {
        const evento = Array.isArray(tipo.eventos) ? tipo.eventos[0] : tipo.eventos;
        const vigente = evento?.activo === true && evento?.estado === 'publicado' &&
          (!evento.fecha_fin || new Date(evento.fecha_fin).getTime() >= now);
        if (!vigente) return sum;
        return sum + Math.max(0, Number(tipo.cantidad_total ?? 0));
      }, 0);
    }, 0);

    const eventosDelOrganizadorIds = safeExecute(async () => {
      const response = await withEventFilter(supabase
        .from('eventos')
        .select('id')
        .eq('organizador_id', organizadorId), 'id');

      if (response.error || !Array.isArray(response.data)) {
        return [] as number[];
      }
      return response.data
        .map((e: any) => Number(e.id))
        .filter((id: number) => Number.isFinite(id) && id > 0);
    }, [] as number[]);

    // Unidades de productos vendidas de eventos del organizador (solo pago completado)
    const productosVendidos = safeExecute(async () => {
      const eventosIds = await eventosDelOrganizadorIds;
      if (eventosIds.length === 0) return 0;

      const response = await withEventFilter(supabase
        .from('compras_productos_items')
        .select('cantidad, compra:compras_productos!inner(estado_pago, evento_id)')
        .eq('compra.estado_pago', 'completado')
        .in('compra.evento_id', eventosIds), 'compra.evento_id');

      if (response.error) {
        console.error('Error en productos vendidos del organizador:', response.error);
        return 0;
      }
      if (!Array.isArray(response.data)) return 0;
      return response.data.reduce((sum: number, item: any) => sum + Number(item.cantidad || 0), 0);
    }, 0);

    // Pedidos de productos completados del organizador
    const pedidosProductos = safeExecute(async () => {
      const eventosIds = await eventosDelOrganizadorIds;
      if (eventosIds.length === 0) return 0;

      const response = await withEventFilter(supabase
        .from('compras_productos')
        .select('id', { count: 'exact', head: true })
        .eq('estado_pago', 'completado')
        .in('evento_id', eventosIds));

      if (response.error) {
        console.error('Error en pedidos de productos del organizador:', response.error);
        return 0;
      }
      return response.count || 0;
    }, 0);

    // Disponibilidad de productos configurados en los eventos del organizador
    const tieneProductos = safeExecute(async () => {
      const eventosIds = await eventosDelOrganizadorIds;
      if (eventosIds.length === 0) return false;

      const response = await withEventFilter(supabase
        .from('productos')
        .select('id', { count: 'exact', head: true })
        .eq('activo', true)
        .in('evento_id', eventosIds));

      if (response.error) {
        console.error('Error validando productos configurados del organizador:', response.error);
        return false;
      }
      return (response.count || 0) > 0;
    }, false);

    // Ingresos, servicio y estimación Wompi (misma lógica que dashboard admin):
    // compras completadas de cualquier evento del organizador, incl. finalizados/pasados.
    const ingresosYServicioTotales = safeExecute(async () => {
      const response = await withEventFilter(supabase
        .from('compras')
        .select('total, valor_servicio, porcentaje_servicio, evento_id, eventos!inner(organizador_id)')
        .eq('estado_pago', 'completado')
        .eq('eventos.organizador_id', organizadorId));

      if (response.error) {
        console.error('Error en ingresos/agregados financieros:', response.error);
        return {
          ingresos: 0,
          valorServicioTotal: 0,
          porcentajeServicioPromedio: 0,
          wompiTotalEstimado: 0,
          wompiVentasTotal: 0,
          wompiServicioTotal: 0,
          netoVentasPostWompiTotal: 0,
          netoServicioPostWompiTotal: 0,
          ingresosVentasBrutoTotal: 0,
        };
      }
      if (response.data && Array.isArray(response.data)) {
        const filas = response.data as any[];
        const a = agregarFinanzasDesdeComprasCompletadas(filas);
        return {
          ingresos: a.ingresos,
          valorServicioTotal: a.valorServicioTotal,
          porcentajeServicioPromedio: a.porcentajeServicioPromedio,
          wompiTotalEstimado: a.wompi_total_estimado,
          wompiVentasTotal: a.wompi_ventas_total,
          wompiServicioTotal: a.wompi_servicio_total,
          netoVentasPostWompiTotal: a.neto_ventas_post_wompi_total,
          netoServicioPostWompiTotal: a.neto_servicio_post_wompi_total,
          ingresosVentasBrutoTotal: a.ingresos_ventas_bruto_total,
        };
      }
      return {
        ingresos: 0,
        valorServicioTotal: 0,
        porcentajeServicioPromedio: 0,
        wompiTotalEstimado: 0,
        wompiVentasTotal: 0,
        wompiServicioTotal: 0,
        netoVentasPostWompiTotal: 0,
        netoServicioPostWompiTotal: 0,
        ingresosVentasBrutoTotal: 0,
      };
    }, {
      ingresos: 0,
      valorServicioTotal: 0,
      porcentajeServicioPromedio: 0,
      wompiTotalEstimado: 0,
      wompiVentasTotal: 0,
      wompiServicioTotal: 0,
      netoVentasPostWompiTotal: 0,
      netoServicioPostWompiTotal: 0,
      ingresosVentasBrutoTotal: 0,
    });

    // Ingresos, servicio y Wompi para productos: histórico completo (sin filtrar por vigencia).
    const ingresosYServicioProductos = safeExecute(async () => {
      const response = await withEventFilter(supabase
        .from('compras_productos')
        .select('total, valor_servicio, porcentaje_servicio, evento_id, eventos!inner(organizador_id)')
        .eq('estado_pago', 'completado')
        .eq('eventos.organizador_id', organizadorId));

      if (response.error) {
        console.error('Error en ingresos/agregados de productos:', response.error);
        return {
          ingresos: 0,
          valorServicioTotal: 0,
          porcentajeServicioPromedio: 0,
          wompiTotalEstimado: 0,
          wompiVentasTotal: 0,
          wompiServicioTotal: 0,
          netoVentasPostWompiTotal: 0,
          netoServicioPostWompiTotal: 0,
          ingresosVentasBrutoTotal: 0,
        };
      }
      if (Array.isArray(response.data)) {
        const a = agregarFinanzasDesdeComprasCompletadas(response.data as any[]);
        return {
          ingresos: a.ingresos,
          valorServicioTotal: a.valorServicioTotal,
          porcentajeServicioPromedio: a.porcentajeServicioPromedio,
          wompiTotalEstimado: a.wompi_total_estimado,
          wompiVentasTotal: a.wompi_ventas_total,
          wompiServicioTotal: a.wompi_servicio_total,
          netoVentasPostWompiTotal: a.neto_ventas_post_wompi_total,
          netoServicioPostWompiTotal: a.neto_servicio_post_wompi_total,
          ingresosVentasBrutoTotal: a.ingresos_ventas_bruto_total,
        };
      }
      return {
        ingresos: 0,
        valorServicioTotal: 0,
        porcentajeServicioPromedio: 0,
        wompiTotalEstimado: 0,
        wompiVentasTotal: 0,
        wompiServicioTotal: 0,
        netoVentasPostWompiTotal: 0,
        netoServicioPostWompiTotal: 0,
        ingresosVentasBrutoTotal: 0,
      };
    }, {
      ingresos: 0,
      valorServicioTotal: 0,
      porcentajeServicioPromedio: 0,
      wompiTotalEstimado: 0,
      wompiVentasTotal: 0,
      wompiServicioTotal: 0,
      netoVentasPostWompiTotal: 0,
      netoServicioPostWompiTotal: 0,
      ingresosVentasBrutoTotal: 0,
    });

    // Clientes únicos que compraron eventos del organizador (solo con pago completado)
    const clientes = safeExecute(async () => {
      const response = await withEventFilter(supabase
        .from('compras')
        .select('cliente_id, evento_id, eventos!inner(organizador_id)')
        .eq('eventos.organizador_id', organizadorId)
        .eq('estado_pago', 'completado'));
      
      if (response.error) {
        console.error('Error en clientes:', response.error);
        return 0;
      }
      if (response.data && Array.isArray(response.data)) {
        const uniqueClients = new Set((response.data as any[]).map((c: any) => c.cliente_id));
        return uniqueClients.size;
      }
      return 0;
    }, 0);

    // Ventas recientes del organizador (boletas + productos)
    const ventasRecientes = safeExecute(async () => {
      const [comprasRes, comprasProductosRes] = await Promise.all([
        withEventFilter(supabase
          .from('compras')
          .select('id, cliente_id, evento_id, numero_transaccion, total, subtotal, descuento_total, estado_pago, fecha_compra, evento:eventos!inner(id, titulo, organizador_id), cliente:usuarios(id, nombre, apellido, email), boletas_compradas(id, grupo_palco_id, palco_id, palcos(numero), tipos_boleta(nombre, personas_por_unidad, es_palco))')
          .eq('evento.organizador_id', organizadorId)
          .eq('estado_pago', 'completado')
          .order('fecha_compra', { ascending: false })
          .limit(1000)),
        withEventFilter(supabase
          .from('compras_productos')
          .select('id, cliente_id, evento_id, numero_pedido, total, subtotal, descuento_total, estado_pago, fecha_compra, evento:eventos!inner(id, titulo, organizador_id), cliente:usuarios(id, nombre, apellido, email)')
          .eq('evento.organizador_id', organizadorId)
          .eq('estado_pago', 'completado')
          .order('fecha_compra', { ascending: false })
          .limit(1000))
      ]);

      if (comprasRes.error) {
        console.error('Error en ventas recientes (boletas):', comprasRes.error);
      }
      if (comprasProductosRes.error) {
        console.error('Error en ventas recientes (productos):', comprasProductosRes.error);
      }

      const boletas = Array.isArray(comprasRes.data) ? comprasRes.data : [];
      const productos = Array.isArray(comprasProductosRes.data) ? comprasProductosRes.data : [];

      const normalizarFecha = (v: any): number => {
        const t = new Date(v || 0).getTime();
        return Number.isFinite(t) ? t : 0;
      };
      const extractSeed = (value: unknown): number => {
        const raw = String(value || '');
        const m = raw.match(/(\d{10,})/);
        if (!m) return 0;
        const n = Number(m[1]);
        return Number.isFinite(n) ? n : 0;
      };
      const pickEvent = (raw: any): any => Array.isArray(raw) ? (raw[0] || null) : raw;
      const pickCliente = (raw: any): any => Array.isArray(raw) ? (raw[0] || null) : raw;
      const datosCliente = (raw: any): { nombre: string; email: string } => {
        const cliente = pickCliente(raw);
        if (!cliente) return { nombre: '', email: '' };
        return {
          nombre: [cliente.nombre, cliente.apellido].filter(Boolean).join(' ').trim(),
          email: String(cliente.email || '').trim(),
        };
      };
      const formatTiposEntrada = (boletasCompra: any[]): string => {
        const counts = new Map<string, number>();
        for (const boleta of boletasCompra || []) {
          const tipoRaw = boleta?.tipos_boleta;
          const tipo = Array.isArray(tipoRaw) ? tipoRaw[0] : tipoRaw;
          const nombre = String(tipo?.nombre || 'Entrada').trim() || 'Entrada';
          counts.set(nombre, (counts.get(nombre) || 0) + 1);
        }
        return [...counts.entries()]
          .map(([nombre, cantidad]) => (cantidad > 1 ? `${nombre} ×${cantidad}` : nombre))
          .join(' · ');
      };
      const esVentaManual = (total: number, subtotal: number, descuento: number): boolean =>
        total <= 0 || (subtotal > 0 && descuento >= subtotal);

      const rows = [
        ...boletas.map((c: any) => {
          const total = Number(c.total || 0);
          const subtotal = Number(c.subtotal || 0);
          const descuento = Number(c.descuento_total || 0);
          const manual = esVentaManual(total, subtotal, descuento);
          const cliente = datosCliente(c.cliente);
          return {
            source: 'ventas' as const,
            id: c.id,
            cliente_id: c.cliente_id,
            cliente_nombre: cliente.nombre,
            cliente_email: cliente.email,
            tipos_entrada: formatTiposEntrada(c.boletas_compradas),
            evento_id: c.evento_id,
            fecha_compra: c.fecha_compra,
            total,
            subtotal,
            descuento_total: descuento,
            es_manual: manual,
            valor_lista: manual ? Math.max(subtotal, 0) : total,
            boletas_vendidas: Array.isArray(c.boletas_compradas) ? c.boletas_compradas.length : 0,
            palcos_vendidos: Array.isArray(c.boletas_compradas)
              ? new Set(c.boletas_compradas.filter((b: any) => b.grupo_palco_id || b.palco_id || b.tipos_boleta?.es_palco || b.tipos_boleta?.personas_por_unidad > 1).map((b: any) => b.grupo_palco_id || b.palco_id || b.id)).size
              : 0,
            palcos_numeros: Array.isArray(c.boletas_compradas)
              ? [...new Set(c.boletas_compradas.map((b: any) => (Array.isArray(b.palcos) ? b.palcos[0]?.numero : b.palcos?.numero) ?? b.palco_id).filter((n: any) => n != null))]
              : [],
            estado_pago: c.estado_pago || 'completado',
            numero_transaccion: String(c.numero_transaccion || `COMP-${c.id}`),
            seed: extractSeed(c.numero_transaccion),
            evento: pickEvent(c.evento)
          };
        }),
        ...productos.map((c: any) => {
          const total = Number(c.total || 0);
          const subtotal = Number(c.subtotal || 0);
          const descuento = Number(c.descuento_total || 0);
          const manual = esVentaManual(total, subtotal, descuento);
          const cliente = datosCliente(c.cliente);
          return {
            source: 'productos' as const,
            id: c.id,
            cliente_id: c.cliente_id,
            cliente_nombre: cliente.nombre,
            cliente_email: cliente.email,
            tipos_entrada: '',
            evento_id: c.evento_id,
            fecha_compra: c.fecha_compra,
            total,
            subtotal,
            descuento_total: descuento,
            es_manual: manual,
            valor_lista: manual ? Math.max(subtotal, 0) : total,
            estado_pago: c.estado_pago || 'completado',
            numero_transaccion: String(c.numero_pedido || `PROD-${c.id}`),
            seed: extractSeed(c.numero_pedido),
            evento: pickEvent(c.evento)
          };
        })
      ];

      const merged: any[] = [];
      const sorted = [...rows].sort(
        (a, b) => normalizarFecha(b.fecha_compra) - normalizarFecha(a.fecha_compra),
      );
      const used = new Array(sorted.length).fill(false);
      const mergeWindowMs = 2 * 60 * 1000; // 2 minutos

      for (let i = 0; i < sorted.length; i++) {
        if (used[i]) continue;
        used[i] = true;
        const base = sorted[i];
        const arr = [base];
        const baseTs = normalizarFecha(base.fecha_compra);
        const baseCliente = Number(base.cliente_id || 0);
        const baseEvento = Number(base.evento_id || 0);

        for (let j = i + 1; j < sorted.length; j++) {
          if (used[j]) continue;
          const cand = sorted[j];
          if (Number(cand.evento_id || 0) !== baseEvento) continue;
          // Solo unir boletas + productos del mismo checkout.
          if (cand.source === base.source) continue;
          const candTs = normalizarFecha(cand.fecha_compra);
          const sameCliente = baseCliente > 0 && Number(cand.cliente_id || 0) === baseCliente;
          if (!sameCliente) continue;
          const sameTimeWindow = Math.abs(baseTs - candTs) <= mergeWindowMs;
          const sameSeedWindow =
            Number(base.seed || 0) > 0 &&
            Number(cand.seed || 0) > 0 &&
            Math.abs(Number(base.seed || 0) - Number(cand.seed || 0)) <= mergeWindowMs;
          if (!(sameTimeWindow || sameSeedWindow)) continue;
          used[j] = true;
          arr.push(cand);
        }

        const hasVentas = arr.some((r) => r.source === 'ventas');
        const hasProductos = arr.some((r) => r.source === 'productos');
        const latest = [...arr].sort((a, b) => normalizarFecha(b.fecha_compra) - normalizarFecha(a.fecha_compra))[0];
        const ventaBase = arr.find((r) => r.source === 'ventas') || latest;
        const total = arr.reduce((sum, r) => sum + Number(r.total || 0), 0);
        const valorLista = arr.reduce((sum, r) => sum + Number(r.valor_lista || 0), 0);
        const esManual = arr.every((r) => !!r.es_manual);
        merged.push({
          ...latest,
          cliente_id: ventaBase.cliente_id ?? latest.cliente_id,
          cliente_nombre:
            ventaBase.cliente_nombre ||
            latest.cliente_nombre ||
            arr.find((r) => r.cliente_nombre)?.cliente_nombre ||
            '',
          cliente_email:
            ventaBase.cliente_email ||
            latest.cliente_email ||
            arr.find((r) => r.cliente_email)?.cliente_email ||
            '',
          tipos_entrada: arr
            .map((r) => String(r.tipos_entrada || '').trim())
            .filter(Boolean)
            .join(' · '),
          numero_transaccion: ventaBase.numero_transaccion || latest.numero_transaccion,
          total,
          valor_lista: valorLista,
          es_manual: esManual,
          boletas_vendidas: arr.reduce((sum, r) => sum + Number(r.boletas_vendidas || 0), 0),
          palcos_vendidos: arr.reduce((sum, r) => sum + Number(r.palcos_vendidos || 0), 0),
          palcos_numeros: [...new Set(arr.flatMap((r) => Array.isArray(r.palcos_numeros) ? r.palcos_numeros : []))],
          tipo_venta: hasVentas && hasProductos ? 'mixta' : hasProductos ? 'productos' : 'ventas',
        });
      }

      return merged.sort(
        (a, b) => normalizarFecha(b.fecha_compra) - normalizarFecha(a.fecha_compra),
      );
    }, []);

    // Eventos en cartelera del organizador (todos los vigentes)
    const eventosProximos = safeExecute(async () => {
      const response = await withEventFilter(supabase
        .from('eventos')
        .select('id, titulo, imagen_principal, estado, fecha_inicio, fecha_fin')
        .eq('organizador_id', organizadorId)
        .eq('activo', true)
        .neq('estado', 'finalizado')
        .order('fecha_inicio', { ascending: true }), 'id');

      if (response.error) {
        console.error('Error en eventos próximos:', response.error);
        return [];
      }

      const ahora = new Date();
      const vigentes = (response.data || []).filter((evento: any) =>
        !evento.fecha_fin || new Date(evento.fecha_fin) >= ahora
      );
      return vigentes;
    }, []);

    // Eventos totales del organizador
    const eventosTotales = safeExecute(async () => {
      const response = await withEventFilter(supabase
        .from('eventos')
        .select('*', { count: 'exact' })
        .eq('organizador_id', organizadorId)
        .eq('activo', true)
        .neq('estado', 'finalizado')
        .gte('fecha_fin', now), 'id');
      
      return response.error ? 0 : (response.count || 0);
    }, 0);

    // Ingresos mes actual
    const ingresosMesActual = safeExecute(async () => {
      const inicioMes = new Date();
      inicioMes.setDate(1);
      inicioMes.setHours(0, 0, 0, 0);
      
      const response = await withEventFilter(supabase
        .from('compras')
        .select('total, evento_id, eventos!inner(organizador_id)')
        .eq('estado_pago', 'completado')
        .eq('eventos.organizador_id', organizadorId)
        .gte('fecha_compra', inicioMes.toISOString()));
      
      if (response.error) return 0;
      if (response.data && Array.isArray(response.data)) {
        return (response.data as any[]).reduce((sum: number, compra: any) => sum + Number(compra.total || 0), 0);
      }
      return 0;
    }, 0);

    // Ingresos mes anterior
    const ingresosMesAnterior = safeExecute(async () => {
      const inicioMesAnterior = new Date();
      inicioMesAnterior.setMonth(inicioMesAnterior.getMonth() - 1);
      inicioMesAnterior.setDate(1);
      inicioMesAnterior.setHours(0, 0, 0, 0);
      
      const finMesAnterior = new Date();
      finMesAnterior.setDate(0);
      finMesAnterior.setHours(23, 59, 59, 999);
      
      const response = await withEventFilter(supabase
        .from('compras')
        .select('total, evento_id, eventos!inner(organizador_id)')
        .eq('estado_pago', 'completado')
        .eq('eventos.organizador_id', organizadorId)
        .gte('fecha_compra', inicioMesAnterior.toISOString())
        .lte('fecha_compra', finMesAnterior.toISOString()));
      
      if (response.error) return 0;
      if (response.data && Array.isArray(response.data)) {
        return (response.data as any[]).reduce((sum: number, compra: any) => sum + Number(compra.total || 0), 0);
      }
      return 0;
    }, 0);

    const ingresosDiaActual = safeExecute(async () => {
      const response = await withEventFilter(supabase
        .from('compras')
        .select('total, evento_id, eventos!inner(organizador_id)')
        .eq('estado_pago', 'completado')
        .eq('eventos.organizador_id', organizadorId)
        .gte('fecha_compra', DateTimeUtil.dayStartDaysAgo(0))
        .lte('fecha_compra', DateTimeUtil.dayEndDaysAgo(0)));

      if (response.error) return 0;
      if (response.data && Array.isArray(response.data)) {
        return (response.data as any[]).reduce((sum: number, compra: any) => sum + Number(compra.total || 0), 0);
      }
      return 0;
    }, 0);

    const ingresosDiaAnterior = safeExecute(async () => {
      const response = await withEventFilter(supabase
        .from('compras')
        .select('total, evento_id, eventos!inner(organizador_id)')
        .eq('estado_pago', 'completado')
        .eq('eventos.organizador_id', organizadorId)
        .gte('fecha_compra', DateTimeUtil.dayStartDaysAgo(1))
        .lte('fecha_compra', DateTimeUtil.dayEndDaysAgo(1)));

      if (response.error) return 0;
      if (response.data && Array.isArray(response.data)) {
        return (response.data as any[]).reduce((sum: number, compra: any) => sum + Number(compra.total || 0), 0);
      }
      return 0;
    }, 0);

    // Boletas por estado del organizador (solo con pago completado; incluye eventos finalizados)
    const boletasPorEstado = safeExecute(async () => {
      try {
        // Obtener tipos de boleta de eventos del organizador
        const { data: tiposData, error: tiposError } = await withEventFilter(supabase
          .from('tipos_boleta')
          .select('id, evento_id, eventos!inner(organizador_id)')
        .eq('eventos.organizador_id', organizadorId));

        if (tiposError || !tiposData || tiposData.length === 0) {
          return [];
        }

        const tiposIds = tiposData.map((t: any) => t.id);
        
        // Obtener boletas compradas (solo con pago completado)
        const { data, error } = await supabase
          .from('boletas_compradas')
          .select('estado, compras!inner(estado_pago)')
          .in('tipo_boleta_id', tiposIds)
          .eq('compras.estado_pago', 'completado');

        if (error) return [];
        if (data) {
          const estados: { [key: string]: number } = {};
          data.forEach((boleta: any) => {
            const estado = boleta.estado || 'pendiente';
            estados[estado] = (estados[estado] || 0) + 1;
          });
          return Object.entries(estados).map(([estado, cantidad]) => ({ estado, cantidad }));
        }
        return [];
      } catch (error) {
        return [];
      }
    }, []);

    // Top eventos por lo que el organizador recibirá aprox. (neto ventas post Wompi)
    const topEventos = safeExecute(async () => {
      try {
        const { data: eventosData, error: eventosError } = await withEventFilter(supabase
          .from('eventos')
          .select('id, titulo, imagen_principal, estado, fecha_fin')
          .eq('organizador_id', organizadorId)
          .eq('activo', true)
          .neq('estado', 'finalizado'), 'id');

        if (eventosError || !eventosData || eventosData.length === 0) {
          return [];
        }

        const ahora = new Date();
        const eventosVigentes = eventosData.filter((evento: any) =>
          !evento.fecha_fin || new Date(evento.fecha_fin) >= ahora
        );

        if (eventosVigentes.length === 0) {
          return [];
        }

        const eventoIds = eventosVigentes.map((e: any) => e.id);

        const [comprasRes, boletasRes] = await Promise.all([
          supabase
            .from('compras')
            .select('total, valor_servicio, evento_id')
            .eq('estado_pago', 'completado')
            .in('evento_id', eventoIds),
          supabase
            .from('boletas_compradas')
            .select('id, compras!inner(estado_pago, evento_id)')
            .eq('compras.estado_pago', 'completado')
            .in('compras.evento_id', eventoIds),
        ]);

        if (comprasRes.error) {
          console.error('Error en ingresos top eventos:', comprasRes.error);
        }
        if (boletasRes.error) {
          console.error('Error en boletas top eventos:', boletasRes.error);
        }

        const recibirasPorEvento: Record<number, number> = {};
        const servicioPorEvento: Record<number, number> = {};
        const wompiPorEvento: Record<number, number> = {};
        const clientesPagaronPorEvento: Record<number, number> = {};
        for (const compra of comprasRes.data || []) {
          const id = Number((compra as any).evento_id);
          if (!Number.isFinite(id)) continue;
          const total = Number((compra as any).total || 0);
          const vs = Number((compra as any).valor_servicio || 0);
          const r = repartoWompiPorCompra(total, vs);
          recibirasPorEvento[id] =
            (recibirasPorEvento[id] || 0) + r.neto_ventas_post_wompi;
          servicioPorEvento[id] = (servicioPorEvento[id] || 0) + vs;
          wompiPorEvento[id] = (wompiPorEvento[id] || 0) + r.wompi_ventas;
          clientesPagaronPorEvento[id] = (clientesPagaronPorEvento[id] || 0) + total;
        }

        const boletasPorEvento: Record<number, number> = {};
        for (const boleta of boletasRes.data || []) {
          const compra = (boleta as any).compras;
          const compraRow = Array.isArray(compra) ? compra[0] : compra;
          const id = Number(compraRow?.evento_id);
          if (!Number.isFinite(id)) continue;
          boletasPorEvento[id] = (boletasPorEvento[id] || 0) + 1;
        }

        const eventosConVentas = eventosVigentes.map((evento: any) => ({
          ...evento,
          /** Neto estimado a recibir (boletas − Wompi sobre ventas), misma fórmula del hero. */
          recibiras_aprox: recibirasPorEvento[evento.id] || 0,
          valor_servicio: servicioPorEvento[evento.id] || 0,
          wompi_ventas: wompiPorEvento[evento.id] || 0,
          /** ∑ total de compras completadas (lo que pagaron los clientes). */
          clientes_pagaron: clientesPagaronPorEvento[evento.id] || 0,
          boletas_vendidas: boletasPorEvento[evento.id] || 0,
        }));

        eventosConVentas.sort((a: any, b: any) => {
          if (b.recibiras_aprox !== a.recibiras_aprox) {
            return b.recibiras_aprox - a.recibiras_aprox;
          }
          return b.boletas_vendidas - a.boletas_vendidas;
        });
        return eventosConVentas;
      } catch (error: any) {
        console.error('Error en top eventos:', error);
        return [];
      }
    }, []);

    // Ejecutar todas las consultas en paralelo
    const [
      eventos_activos,
      boletas_vendidas,
      aforo_total,
      productos_vendidos,
      pedidos_productos,
      tiene_productos,
      ingresos_agg,
      ingresos_productos_agg,
      clientes_count,
      ventas_recientes,
      eventos_proximos,
      eventos_totales,
      ingresos_mes_actual,
      ingresos_mes_anterior,
      ingresos_dia_actual,
      ingresos_dia_anterior,
      boletas_por_estado,
      top_eventos
    ] = await Promise.all([
      eventosActivos,
      boletasVendidas,
      aforoTotal,
      productosVendidos,
      pedidosProductos,
      tieneProductos,
      ingresosYServicioTotales,
      ingresosYServicioProductos,
      clientes,
      ventasRecientes,
      eventosProximos,
      eventosTotales,
      ingresosMesActual,
      ingresosMesAnterior,
      ingresosDiaActual,
      ingresosDiaAnterior,
      boletasPorEstado,
      topEventos
    ]);

    return {
      eventos_activos,
      boletas_vendidas,
      aforo_total,
      productos_vendidos,
      pedidos_productos,
      tiene_productos,
      ingresos_totales: ingresos_agg.ingresos,
      ingresos_productos_totales: ingresos_productos_agg.ingresos,
      clientes: clientes_count,
      ventas_recientes: ventas_recientes as any[],
      eventos_proximos: eventos_proximos as any[],
      eventos_totales,
      categorias_activas: 0,
      lugares_activos: 0,
      ingresos_mes_actual,
      ingresos_mes_anterior,
      ingresos_dia_actual,
      ingresos_dia_anterior,
      porcentaje_servicio_promedio: ingresos_agg.porcentajeServicioPromedio,
      valor_servicio_total: ingresos_agg.valorServicioTotal,
      porcentaje_servicio_productos_promedio: ingresos_productos_agg.porcentajeServicioPromedio,
      valor_servicio_productos_total: ingresos_productos_agg.valorServicioTotal,
      ingresos_ventas_bruto_total: ingresos_agg.ingresosVentasBrutoTotal,
      ingresos_productos_bruto_total: ingresos_productos_agg.ingresosVentasBrutoTotal,
      wompi_total_estimado: ingresos_agg.wompiTotalEstimado,
      wompi_productos_total_estimado: ingresos_productos_agg.wompiTotalEstimado,
      wompi_ventas_total: ingresos_agg.wompiVentasTotal,
      wompi_productos_ventas_total: ingresos_productos_agg.wompiVentasTotal,
      wompi_servicio_total: ingresos_agg.wompiServicioTotal,
      wompi_productos_servicio_total: ingresos_productos_agg.wompiServicioTotal,
      neto_ventas_post_wompi_total: ingresos_agg.netoVentasPostWompiTotal,
      neto_productos_ventas_post_wompi_total: ingresos_productos_agg.netoVentasPostWompiTotal,
      neto_servicio_post_wompi_total: ingresos_agg.netoServicioPostWompiTotal,
      neto_productos_servicio_post_wompi_total: ingresos_productos_agg.netoServicioPostWompiTotal,
      neto_total_post_wompi_total: ingresos_agg.ingresos - ingresos_agg.wompiTotalEstimado,
      neto_productos_total_post_wompi_total:
        ingresos_productos_agg.ingresos - ingresos_productos_agg.wompiTotalEstimado,
      boletas_por_estado: boletas_por_estado as any[],
      top_eventos: top_eventos as any[]
    };
}
