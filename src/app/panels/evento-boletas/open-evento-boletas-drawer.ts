import { DrawerRef, DrawerService } from '../../core/drawer';
import { Evento } from '../../types';
import { EventoBoletasPanel } from './evento-boletas-panel';
import { EventoBoletasDrawerResult, EventoBoletasPanelData } from './evento-boletas.types';

export interface OpenEventoBoletasDrawerOptions {
  onChanged?: EventoBoletasPanelData['onChanged'];
}

export function openEventoBoletasDrawer(
  drawerService: DrawerService,
  evento: Pick<Evento, 'id' | 'titulo' | 'fecha_venta_inicio' | 'fecha_venta_fin'>,
  options?: OpenEventoBoletasDrawerOptions,
): DrawerRef<EventoBoletasDrawerResult> {
  return drawerService.open<EventoBoletasPanel, EventoBoletasPanelData, EventoBoletasDrawerResult>(
    EventoBoletasPanel,
    {
      title: 'Boletas',
      description: evento.titulo,
      icon: 'confirmation_number',
      size: 'lg',
      data: {
        eventoId: evento.id,
        eventoTitulo: evento.titulo,
        eventoFechaVentaInicio: evento.fecha_venta_inicio,
        eventoFechaVentaFin: evento.fecha_venta_fin,
        onChanged: options?.onChanged,
      },
    },
  );
}
