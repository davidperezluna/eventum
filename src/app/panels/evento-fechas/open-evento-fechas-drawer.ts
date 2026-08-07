import { DrawerRef, DrawerService } from '../../core/drawer';
import { EventoFechasPanel } from './evento-fechas-panel';
import { EventoFechasDrawerResult, EventoFechasPanelData, EventoFechasSource } from './evento-fechas.types';

export function openEventoFechasDrawer(
  drawerService: DrawerService,
  evento: EventoFechasSource,
): DrawerRef<EventoFechasDrawerResult> {
  return drawerService.open<EventoFechasPanel, EventoFechasPanelData, EventoFechasDrawerResult>(
    EventoFechasPanel,
    {
      title: 'Fechas',
      description: evento.titulo,
      icon: 'event',
      size: 'md',
      data: {
        eventoId: evento.id,
        eventoTitulo: evento.titulo,
        edad_minima: evento.edad_minima ?? null,
        fecha_inicio: evento.fecha_inicio,
        fecha_fin: evento.fecha_fin,
        fecha_venta_inicio: evento.fecha_venta_inicio,
        fecha_venta_fin: evento.fecha_venta_fin,
      },
    },
  );
}
