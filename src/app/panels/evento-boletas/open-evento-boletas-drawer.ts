import { DrawerRef, DrawerService } from '../../core/drawer';
import { Evento } from '../../types';
import { EventoBoletasPanel } from './evento-boletas-panel';
import { EventoBoletasDrawerResult, EventoBoletasPanelData } from './evento-boletas.types';

export function openEventoBoletasDrawer(
  drawerService: DrawerService,
  evento: Pick<Evento, 'id' | 'titulo'>,
): DrawerRef<EventoBoletasDrawerResult> {
  return drawerService.open<EventoBoletasPanel, EventoBoletasPanelData, EventoBoletasDrawerResult>(
    EventoBoletasPanel,
    {
      title: 'Boletas',
      description: evento.titulo,
      icon: 'confirmation_number',
      size: 'xl',
      data: {
        eventoId: evento.id,
        eventoTitulo: evento.titulo,
      },
    },
  );
}
