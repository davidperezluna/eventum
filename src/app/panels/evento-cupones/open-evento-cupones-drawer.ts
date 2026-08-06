import { DrawerRef, DrawerService } from '../../core/drawer';
import { Evento } from '../../types';
import { EventoCuponesPanel, EventoCuponesPanelData } from './evento-cupones-panel';

/** Resultado al cerrar: true si hubo cambios en cupones */
export type EventoCuponesDrawerResult = boolean;

export function openEventoCuponesDrawer(
  drawerService: DrawerService,
  evento: Pick<Evento, 'id' | 'titulo'>,
): DrawerRef<EventoCuponesDrawerResult> {
  return drawerService.open<EventoCuponesPanel, EventoCuponesPanelData, EventoCuponesDrawerResult>(
    EventoCuponesPanel,
    {
      title: 'Cupones de descuento',
      description: evento.titulo,
      icon: 'sell',
      size: 'lg',
      loading: true,
      data: {
        eventoId: evento.id,
        eventoTitulo: evento.titulo,
      },
    },
  );
}
