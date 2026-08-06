import { DrawerRef, DrawerService } from '../../core/drawer';
import { Evento } from '../../types';
import { EventoProductosPanel } from './evento-productos-panel';
import { EventoProductosDrawerResult, EventoProductosPanelData } from './evento-productos.types';

export function openEventoProductosDrawer(
  drawerService: DrawerService,
  evento: Pick<Evento, 'id' | 'titulo'>,
): DrawerRef<EventoProductosDrawerResult> {
  return drawerService.open<EventoProductosPanel, EventoProductosPanelData, EventoProductosDrawerResult>(
    EventoProductosPanel,
    {
      title: 'Ventas adicionales',
      description: evento.titulo,
      icon: 'local_mall',
      size: 'xl',
      data: {
        eventoId: evento.id,
        eventoTitulo: evento.titulo,
      },
    },
  );
}
