import { DrawerRef, DrawerService } from '../../core/drawer';
import { Evento } from '../../types';
import { EventoCobrosPanel } from './evento-cobros-panel';
import { EventoCobrosDrawerResult, EventoCobrosPanelData } from './evento-cobros.types';

export function openEventoCobrosDrawer(
  drawerService: DrawerService,
  evento: Pick<Evento, 'id' | 'titulo' | 'es_gratis' | 'porcentaje_servicio' | 'wompi_cuenta_id'>,
): DrawerRef<EventoCobrosDrawerResult> {
  return drawerService.open<EventoCobrosPanel, EventoCobrosPanelData, EventoCobrosDrawerResult>(
    EventoCobrosPanel,
    {
      title: 'Cobros',
      description: evento.titulo,
      icon: 'payments',
      size: 'md',
      data: {
        eventoId: evento.id,
        eventoTitulo: evento.titulo,
        es_gratis: !!evento.es_gratis,
        porcentaje_servicio: evento.porcentaje_servicio ?? 0,
        wompi_cuenta_id: evento.wompi_cuenta_id != null ? Number(evento.wompi_cuenta_id) : null,
      },
    },
  );
}

