import type { TranslationStrings } from '../types';

const trips: TranslationStrings = {
  'trips.reminder': 'Lembrete',
  'trips.reminderNone': 'Nenhum',
  'trips.reminderDay': 'dia',
  'trips.reminderDays': 'dias',
  'trips.reminderCustom': 'Personalizado',
  'trips.memberRemoved': '{username} removido',
  'trips.memberRemoveError': 'Falha ao remover',
  'trips.memberAdded': '{username} adicionado',
  'trips.memberAddError': 'Falha ao adicionar',
  'trips.reminderDaysBefore': 'dias antes da partida',
  'trips.reminderDisabledHint':
    'Os lembretes de viagem estão desativados. Ative-os em Admin > Configurações > Notificações.',
  'trips.shrinkWarning': 'Shortening the trip will permanently remove {days} day(s). Places remain visible in the planning panel.',
  'trips.shrinkConfirm': 'I understand — content on removed days will be permanently deleted',
};
export default trips;
