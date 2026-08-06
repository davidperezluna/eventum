export type EvNoticeVariant = 'info' | 'success' | 'warning' | 'danger';

export type EvNoticeDensity = 'default' | 'compact' | 'inline';

export const EV_NOTICE_DEFAULT_ICONS: Record<EvNoticeVariant, string> = {
  info: 'info',
  success: 'check_circle',
  warning: 'lightbulb',
  danger: 'error_outline',
};
