import type { TranslationStrings } from '../types';

const trips: TranslationStrings = {
  'trips.memberRemoved': '{username} rimosso',
  'trips.memberRemoveError': 'Rimozione non riuscita',
  'trips.memberAdded': '{username} aggiunto',
  'trips.memberAddError': 'Aggiunta non riuscita',
  'trips.reminder': 'Promemoria',
  'trips.reminderNone': 'Nessuno',
  'trips.reminderDay': 'giorno',
  'trips.reminderDays': 'giorni',
  'trips.reminderCustom': 'Personalizzato',
  'trips.reminderDaysBefore': 'giorni prima della partenza',
  'trips.reminderDisabledHint':
    'I promemoria dei viaggi sono disabilitati. Abilitali in Admin > Impostazioni > Notifiche.',
  'trips.shrinkWarning': 'Shortening the trip will permanently remove {days} day(s). Places remain visible in the planning panel.',
  'trips.shrinkConfirm': 'I understand — content on removed days will be permanently deleted',
};
export default trips;
