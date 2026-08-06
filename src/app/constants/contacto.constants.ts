/**
 * Canales de contacto públicos de Eventum.
 * Fuente única para landings y páginas de contacto.
 */
export const EVENTUM_CONTACTO = {
  email: 'eventumeventum1@gmail.com',
  whatsappE164: '573336126974',
  instagramUrl: 'https://www.instagram.com/eventumcol?igsh=MTFwMDNhbjI4aHZ2OQ==',
  defaultWhatsappMessage: 'Hola, quiero recibir información sobre Eventum.',
  demoWhatsappMessage:
    'Hola, quiero solicitar una demostración de Eventum para organizadores de eventos.',
} as const;

export function buildWhatsappUrl(message: string = EVENTUM_CONTACTO.defaultWhatsappMessage): string {
  const params = new URLSearchParams({ text: message });
  return `https://wa.me/${EVENTUM_CONTACTO.whatsappE164}?${params.toString()}`;
}

export function buildGmailComposeUrl(subject: string, body: string): string {
  const params = new URLSearchParams({
    view: 'cm',
    fs: '1',
    to: EVENTUM_CONTACTO.email,
    su: subject,
    body,
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}
