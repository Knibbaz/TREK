import type { TranslationStrings } from '../types';

const trips: TranslationStrings = {
  'trips.memberRemoved': '{username} تمت إزالته',
  'trips.memberRemoveError': 'فشل في الإزالة',
  'trips.memberAdded': '{username} تمت إضافته',
  'trips.memberAddError': 'فشل في الإضافة',
  'trips.reminder': 'تذكير',
  'trips.reminderNone': 'بدون',
  'trips.reminderDay': 'يوم',
  'trips.reminderDays': 'أيام',
  'trips.reminderCustom': 'مخصص',
  'trips.reminderDaysBefore': 'أيام قبل المغادرة',
  'trips.reminderDisabledHint':
    'تذكيرات الرحلة معطلة. قم بتفعيلها من الإدارة > الإعدادات > الإشعارات.',
  'trips.shrinkWarning': 'Shortening the trip will permanently remove {days} day(s). Places remain visible in the planning panel.',
  'trips.shrinkConfirm': 'I understand — content on removed days will be permanently deleted',
};
export default trips;
