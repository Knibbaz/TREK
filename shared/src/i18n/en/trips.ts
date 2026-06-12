import type { TranslationStrings } from '../types';

const trips: TranslationStrings = {
  'trips.memberRemoved': '{username} removed',
  'trips.memberRemoveError': 'Failed to remove',
  'trips.memberAdded': '{username} added',
  'trips.memberAddError': 'Failed to add',
  'trips.reminder': 'Reminder',
  'trips.reminderNone': 'None',
  'trips.reminderDay': 'day',
  'trips.reminderDays': 'days',
  'trips.reminderCustom': 'Custom',
  'trips.reminderDaysBefore': 'days before departure',
  'trips.reminderDisabledHint':
    'Trip reminders are disabled. Enable them in Admin > Settings > Notifications.',
  'trips.shrinkWarning': 'Shortening the trip will permanently remove {days} day(s). Places remain visible in the planning panel.',
  'trips.shrinkConfirm': 'I understand — content on removed days will be permanently deleted',
};
export default trips;
