import type { TranslationStrings } from '../types';

const trips: TranslationStrings = {
  'trips.memberRemoved': '{username} διαγράφηκε',
  'trips.memberRemoveError': 'Αποτυχία διαγραφής',
  'trips.memberAdded': '{username} προστέθηκε',
  'trips.memberAddError': 'Αποτυχία προσθήκης',
  'trips.reminder': 'Ειδοποίηση',
  'trips.reminderNone': 'Κανένα',
  'trips.reminderDay': 'ημέρα',
  'trips.reminderDays': 'ημέρες',
  'trips.reminderCustom': 'Προσαρμοσμένη',
  'trips.reminderDaysBefore': 'ημέρες πριν από την αναχώση',
  'trips.reminderDisabledHint':
    'Η ειδοποίηση για τις υπενθυμήσεις είναι απενεργοποιημένη. Ενεργοποιήστε την στο Διαχείριση > Ρυθμίσεις > Ανακοινώσεις.',
  'trips.shrinkWarning': 'Shortening the trip will permanently remove {days} day(s). Places remain visible in the planning panel.',
  'trips.shrinkConfirm': 'I understand — content on removed days will be permanently deleted',
};
export default trips;
