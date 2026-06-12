import type { TranslationStrings } from '../types';

const trips: TranslationStrings = {
  'trips.reminder': 'Recordatorio',
  'trips.reminderNone': 'Ninguno',
  'trips.reminderDay': 'día',
  'trips.reminderDays': 'días',
  'trips.reminderCustom': 'Personalizado',
  'trips.memberRemoved': '{username} eliminado',
  'trips.memberRemoveError': 'Error al eliminar',
  'trips.memberAdded': '{username} añadido',
  'trips.memberAddError': 'Error al añadir',
  'trips.reminderDaysBefore': 'días antes de la salida',
  'trips.reminderDisabledHint':
    'Los recordatorios de viaje están desactivados. Actívalos en Admin > Configuración > Notificaciones.',
  'trips.shrinkWarning': 'Shortening the trip will permanently remove {days} day(s). Places remain visible in the planning panel.',
  'trips.shrinkConfirm': 'I understand — content on removed days will be permanently deleted',
};
export default trips;
