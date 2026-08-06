import { DrawerRef, DrawerService } from '../../core/drawer';
import { EventoInformacionPanel } from './evento-informacion-panel';
import {
  EventoInformacionDrawerResult,
  EventoInformacionPanelData,
  EventoInformacionSource,
} from './evento-informacion.types';

export function openEventoInformacionDrawer(
  drawerService: DrawerService,
  evento: EventoInformacionSource,
): DrawerRef<EventoInformacionDrawerResult> {
  return drawerService.open<EventoInformacionPanel, EventoInformacionPanelData, EventoInformacionDrawerResult>(
    EventoInformacionPanel,
    {
      title: 'Información del evento',
      description: evento.titulo,
      icon: 'info',
      size: 'md',
      data: {
        eventoId: evento.id,
        eventoTitulo: evento.titulo,
        titulo: evento.titulo,
        categoria_id: evento.categoria_id ?? null,
        tags: evento.tags ?? null,
        descripcion_corta: evento.descripcion_corta ?? null,
        descripcion: evento.descripcion ?? null,
      },
    },
  );
}
