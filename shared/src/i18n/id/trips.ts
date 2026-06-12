import type { TranslationStrings } from '../types';

const trips: TranslationStrings = {
  'trips.memberRemoved': '{username} dihapus',
  'trips.memberRemoveError': 'Gagal menghapus',
  'trips.memberAdded': '{username} ditambahkan',
  'trips.memberAddError': 'Gagal menambahkan',
  'trips.reminder': 'Pengingat',
  'trips.reminderNone': 'Tidak ada',
  'trips.reminderDay': 'hari',
  'trips.reminderDays': 'hari',
  'trips.reminderCustom': 'Kustom',
  'trips.reminderDaysBefore': 'hari sebelum keberangkatan',
  'trips.reminderDisabledHint':
    'Pengingat perjalanan dinonaktifkan. Aktifkan di Admin > Pengaturan > Notifikasi.',
  'trips.shrinkWarning': 'Shortening the trip will permanently remove {days} day(s). Places remain visible in the planning panel.',
  'trips.shrinkConfirm': 'I understand — content on removed days will be permanently deleted',
};
export default trips;
