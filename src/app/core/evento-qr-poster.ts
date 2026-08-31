import QRCode from 'qrcode';

const POSTER_WIDTH = 600;
const PADDING = 40;
const QR_SIZE = 400;
const TITLE_FONT = '700 28px system-ui, -apple-system, "Segoe UI", sans-serif';
const TITLE_LINE_HEIGHT = 36;
const TITLE_QR_GAP = 28;

export function getEventoPublicUrl(eventoId: number, origin = window.location.origin): string {
  return `${origin}/detalle-evento/${eventoId}`;
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ['Evento'];

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }

  if (current) lines.push(current);
  return lines;
}

export async function buildEventoQrPosterDataUrl(titulo: string, url: string): Promise<string> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo preparar la imagen del QR.');
  }

  const contentWidth = POSTER_WIDTH - PADDING * 2;
  ctx.font = TITLE_FONT;
  const titleLines = wrapLines(ctx, titulo, contentWidth);
  const titleBlockHeight = titleLines.length * TITLE_LINE_HEIGHT;

  canvas.width = POSTER_WIDTH;
  canvas.height = PADDING + titleBlockHeight + TITLE_QR_GAP + QR_SIZE + PADDING;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#0f172a';
  ctx.font = TITLE_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  titleLines.forEach((line, index) => {
    ctx.fillText(line, canvas.width / 2, PADDING + index * TITLE_LINE_HEIGHT);
  });

  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, url, {
    width: QR_SIZE,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#0f172a', light: '#ffffff' },
  });

  const qrX = (canvas.width - QR_SIZE) / 2;
  const qrY = PADDING + titleBlockHeight + TITLE_QR_GAP;
  ctx.drawImage(qrCanvas, qrX, qrY, QR_SIZE, QR_SIZE);

  return canvas.toDataURL('image/png');
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

export function sanitizeEventoFileName(titulo: string): string {
  const base = titulo
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'evento';
}

export function downloadBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

export async function shareEventoQrPoster(
  titulo: string,
  dataUrl: string,
): Promise<'shared' | 'downloaded'> {
  const blob = await dataUrlToBlob(dataUrl);
  const filename = `${sanitizeEventoFileName(titulo)}-qr.png`;
  const file = new File([blob], filename, { type: 'image/png' });

  if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      title: titulo,
      text: titulo,
      files: [file],
    });
    return 'shared';
  }

  downloadBlob(blob, filename);
  return 'downloaded';
}
