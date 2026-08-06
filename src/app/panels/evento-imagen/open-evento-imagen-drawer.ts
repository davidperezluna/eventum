import { DrawerRef, DrawerService } from '../../core/drawer';
import { Evento } from '../../types';
import { EventoImagenPanel } from './evento-imagen-panel';
import { EventoImagenDrawerResult, EventoImagenPanelData } from './evento-imagen.types';

export function openEventoImagenDrawer(
  drawerService: DrawerService,
  evento: Pick<Evento, 'id' | 'titulo' | 'imagen_principal'>,
): DrawerRef<EventoImagenDrawerResult> {
  return drawerService.open<EventoImagenPanel, EventoImagenPanelData, EventoImagenDrawerResult>(
    EventoImagenPanel,
    {
      title: 'Imagen del evento',
      description: evento.titulo,
      icon: 'image',
      size: 'md',
      data: {
        eventoId: evento.id,
        eventoTitulo: evento.titulo,
        imagenActual: evento.imagen_principal ?? null,
      },
    },
  );
}
