import { DrawerRef, DrawerService } from '../../core/drawer';
import { ReservarPalcosOrganizador } from '../../pages/reservar-palcos-organizador/reservar-palcos-organizador';
import { Evento } from '../../types';
import { EventoPalcosDrawerResult, EventoPalcosPanelData } from './evento-palcos.types';

export function openEventoPalcosDrawer(
  drawerService: DrawerService,
  evento: Pick<Evento, 'id' | 'titulo'>,
): DrawerRef<EventoPalcosDrawerResult> {
  return drawerService.open<ReservarPalcosOrganizador, EventoPalcosPanelData, EventoPalcosDrawerResult>(
    ReservarPalcosOrganizador,
    {
      title: 'Reservar palcos',
      description: evento.titulo,
      icon: 'table_restaurant',
      size: 'xl',
      loading: true,
      data: {
        eventoId: evento.id,
        eventoTitulo: evento.titulo,
      },
    },
  );
}
