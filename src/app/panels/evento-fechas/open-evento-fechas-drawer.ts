import { DrawerRef, DrawerService } from '../../core/drawer';
import { Evento } from '../../types';
import { EventoFechasPanel } from './evento-fechas-panel';
import { EventoFechasDrawerResult, EventoFechasPanelData } from './evento-fechas.types';

export function openEventoFechasDrawer(
  drawerService: DrawerService,
  evento: Pick<
    Evento,
    | 'id'
    | 'titulo'
    | 'lugar_id'
    | 'edad_minima'
    | 'fecha_inicio'
    | 'fecha_fin'
    | 'fecha_venta_inicio'
    | 'fecha_venta_fin'
    | 'lugar'
  >,
): DrawerRef<EventoFechasDrawerResult> {
  return drawerService.open<EventoFechasPanel, EventoFechasPanelData, EventoFechasDrawerResult>(
    EventoFechasPanel,
    {
      title: 'Fechas y lugar',
      description: evento.titulo,
      icon: 'event',
      size: 'md',
      data: {
        eventoId: evento.id,
        eventoTitulo: evento.titulo,
        lugar_id: evento.lugar_id ?? null,
        edad_minima: evento.edad_minima ?? null,
        fecha_inicio: evento.fecha_inicio,
        fecha_fin: evento.fecha_fin,
        fecha_venta_inicio: evento.fecha_venta_inicio,
        fecha_venta_fin: evento.fecha_venta_fin,
        lugar: evento.lugar ?? null,
      },
    },
  );
}
