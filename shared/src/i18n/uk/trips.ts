import type { TranslationStrings } from '../types';

const trips: TranslationStrings = {
  'trips.memberRemoved': '{username} видалений',
  'trips.memberRemoveError': 'Не вдалося видалити',
  'trips.memberAdded': '{username} доданий',
  'trips.memberAddError': 'Не вдалося додати',
  'trips.reminder': 'Нагадування',
  'trips.reminderNone': 'Немає',
  'trips.reminderDay': 'день',
  'trips.reminderDays': 'днів',
  'trips.reminderCustom': 'Інше',
  'trips.reminderDaysBefore': "днів до від'їзду",
  'trips.reminderDisabledHint':
    'Нагадування про поїздки вимкнено. Увімкніть їх в Адмін > Налаштування > Сповіщення.',
  'trips.shrinkWarning': 'Shortening the trip will permanently remove {days} day(s). Places remain visible in the planning panel.',
  'trips.shrinkConfirm': 'I understand — content on removed days will be permanently deleted',
};
export default trips;
