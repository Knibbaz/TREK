import type { TranslationStrings } from '../types';

const trips: TranslationStrings = {
  'trips.memberRemoved': '{username} eltávolítva',
  'trips.memberRemoveError': 'Eltávolítás sikertelen',
  'trips.memberAdded': '{username} hozzáadva',
  'trips.memberAddError': 'Hozzáadás sikertelen',
  'trips.reminder': 'Emlékeztető',
  'trips.reminderNone': 'Nincs',
  'trips.reminderDay': 'nap',
  'trips.reminderDays': 'nap',
  'trips.reminderCustom': 'Egyéni',
  'trips.reminderDaysBefore': 'nappal indulás előtt',
  'trips.reminderDisabledHint':
    'Az utazási emlékeztetők ki vannak kapcsolva. Kapcsold be az Admin > Beállítások > Értesítések menüben.',
  'trips.shrinkWarning': 'Shortening the trip will permanently remove {days} day(s). Places remain visible in the planning panel.',
  'trips.shrinkConfirm': 'I understand — content on removed days will be permanently deleted',
};
export default trips;
