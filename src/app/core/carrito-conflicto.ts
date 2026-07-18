import { CarritoCompraService } from '../services/carrito-compra.service';
import { ClientConfirmDialogService } from '../services/client-confirm-dialog.service';

function etiquetaEvento(carrito: CarritoCompraService): string {
  const evento = carrito.getEventoSnapshot();
  if (evento?.titulo) {
    return `«${evento.titulo}»`;
  }
  if (carrito.getItemsProductosSnapshot().length > 0) {
    return 'productos de un evento';
  }
  return 'un evento';
}

function etiquetaCover(carrito: CarritoCompraService): string {
  const lugar = carrito.getLugarCoverSnapshot();
  return lugar?.nombre ? `covers de «${lugar.nombre}»` : 'covers';
}

export async function confirmarCambioCarritoACovers(
  confirmDialog: ClientConfirmDialogService,
  carrito: CarritoCompraService,
  clubNombre: string,
  conflicto: 'evento' | 'otro_lugar',
): Promise<boolean> {
  const message =
    conflicto === 'evento'
      ? `Tu carrito tiene entradas de ${etiquetaEvento(carrito)}. Si continúas, se vaciará para agregar covers de «${clubNombre}».`
      : `Tu carrito tiene ${etiquetaCover(carrito)}. Si continúas, se vaciará para agregar covers de «${clubNombre}».`;

  return confirmDialog.confirm({
    title: 'Cambiar carrito',
    message,
    confirmText: 'Vaciar y continuar',
    cancelText: 'Cancelar',
    icon: 'local_bar',
  });
}

export async function confirmarCambioCarritoAEvento(
  confirmDialog: ClientConfirmDialogService,
  carrito: CarritoCompraService,
  eventoTitulo: string,
): Promise<boolean> {
  return confirmDialog.confirm({
    title: 'Cambiar carrito',
    message: `Tienes ${etiquetaCover(carrito)} en el carrito. Si continúas, se vaciará para comprar en «${eventoTitulo}».`,
    confirmText: 'Vaciar y continuar',
    cancelText: 'Cancelar',
    icon: 'confirmation_number',
  });
}

export async function resolverConflictoCoverAntesDeAgregar(
  confirmDialog: ClientConfirmDialogService,
  carrito: CarritoCompraService,
  lugarId: number,
  clubNombre: string,
): Promise<boolean> {
  const conflicto = carrito.detectarConflictoAlAgregarCover(lugarId);
  if (!conflicto) {
    return true;
  }

  const confirmado = await confirmarCambioCarritoACovers(confirmDialog, carrito, clubNombre, conflicto);
  if (!confirmado) {
    return false;
  }

  if (conflicto === 'evento') {
    carrito.limpiarContenidoEvento();
  } else {
    carrito.limpiarContenidoCover();
  }

  return true;
}

export async function resolverConflictoEventoAntesDeAgregar(
  confirmDialog: ClientConfirmDialogService,
  carrito: CarritoCompraService,
  eventoTitulo: string,
): Promise<boolean> {
  if (!carrito.tieneContenidoCover()) {
    return true;
  }

  const confirmado = await confirmarCambioCarritoAEvento(confirmDialog, carrito, eventoTitulo);
  if (!confirmado) {
    return false;
  }

  carrito.limpiarContenidoCover();
  return true;
}
