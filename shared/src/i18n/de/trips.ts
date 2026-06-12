import type { TranslationStrings } from '../types';

const trips: TranslationStrings = {
  'trips.reminder': 'Erinnerung',
  'trips.reminderNone': 'Keine',
  'trips.reminderDay': 'Tag',
  'trips.reminderDays': 'Tage',
  'trips.reminderCustom': 'Benutzerdefiniert',
  'trips.memberRemoved': '{username} entfernt',
  'trips.memberRemoveError': 'Entfernen fehlgeschlagen',
  'trips.memberAdded': '{username} hinzugefügt',
  'trips.memberAddError': 'Hinzufügen fehlgeschlagen',
  'trips.reminderDaysBefore': 'Tage vor Abreise',
  'trips.reminderDisabledHint':
    'Reiseerinnerungen sind deaktiviert. Aktivieren Sie sie unter Admin > Einstellungen > Benachrichtigungen.',
  'trips.shrinkWarning': 'Shortening the trip will permanently remove {days} day(s). Places remain visible in the planning panel.',
  'trips.shrinkConfirm': 'I understand — content on removed days will be permanently deleted',
};
export default trips;
