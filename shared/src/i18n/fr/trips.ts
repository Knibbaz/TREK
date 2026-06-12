import type { TranslationStrings } from '../types';

const trips: TranslationStrings = {
  'trips.memberRemoved': '{username} supprimé',
  'trips.memberRemoveError': 'Échec de la suppression',
  'trips.memberAdded': '{username} ajouté',
  'trips.memberAddError': "Échec de l'ajout",
  'trips.reminder': 'Rappel',
  'trips.reminderNone': 'Aucun',
  'trips.reminderDay': 'jour',
  'trips.reminderDays': 'jours',
  'trips.reminderCustom': 'Personnalisé',
  'trips.reminderDaysBefore': 'jours avant le départ',
  'trips.reminderDisabledHint':
    'Les rappels de voyage sont désactivés. Activez-les dans Admin > Paramètres > Notifications.',
  'trips.shrinkWarning': 'Shortening the trip will permanently remove {days} day(s). Places remain visible in the planning panel.',
  'trips.shrinkConfirm': 'I understand — content on removed days will be permanently deleted',
};
export default trips;
