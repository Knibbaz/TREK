import type { TranslationStrings } from '../types';

const trips: TranslationStrings = {
  'trips.memberRemoved': '{username} kaldırıldı',
  'trips.memberRemoveError': 'Kaldırılamadı',
  'trips.memberAdded': '{username} eklendi',
  'trips.memberAddError': 'Eklenemedi',
  'trips.reminder': 'Hatırlatıcı',
  'trips.reminderNone': 'Yok',
  'trips.reminderDay': 'gün',
  'trips.reminderDays': 'gün',
  'trips.reminderCustom': 'Özel',
  'trips.reminderDaysBefore': 'hareketten önce gün',
  'trips.reminderDisabledHint':
    'Seyahat hatırlatıcıları kapalı. Yönetici > Ayarlar > Bildirimler bölümünden açın.',
  'trips.shrinkWarning': 'Shortening the trip will permanently remove {days} day(s). Places remain visible in the planning panel.',
  'trips.shrinkConfirm': 'I understand — content on removed days will be permanently deleted',
};
export default trips;
