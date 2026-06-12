import type { TranslationStrings } from '../types';

const trips: TranslationStrings = {
  'trips.memberRemoved': '{username} verwijderd',
  'trips.memberRemoveError': 'Verwijderen mislukt',
  'trips.memberAdded': '{username} toegevoegd',
  'trips.memberAddError': 'Toevoegen mislukt',
  'trips.reminder': 'Herinnering',
  'trips.reminderNone': 'Geen',
  'trips.reminderDay': 'dag',
  'trips.reminderDays': 'dagen',
  'trips.reminderCustom': 'Aangepast',
  'trips.reminderDaysBefore': 'dagen voor vertrek',
  'trips.reminderDisabledHint':
    'Reisherinneringen zijn uitgeschakeld. Schakel ze in via Admin > Instellingen > Meldingen.',
  'trips.shrinkWarning': 'De trip verkorten verwijdert permanent {days} dag(en). Plaatsen blijven zichtbaar in het planpanel.',
  'trips.shrinkConfirm': 'Ik begrijp het — de inhoud van verwijderde dagen wordt permanent verwijderd',
};
export default trips;
