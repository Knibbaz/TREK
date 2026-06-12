import type { NotificationLocale } from '../externalNotifications/types';

const uk: NotificationLocale = {
  email: {
    footer: 'Ви отримали це, оскільки увімкнули сповіщення в ROUTD.',
    manage: 'Керувати налаштуваннями у Налаштуваннях',
    madeWith: 'Made with',
    openTrek: 'Відкрити ROUTD',
  },
  events: {
    trip_invite: (p) => ({
      title: `Запрошення до "${p.trip}"`,
      body: `${p.actor} запросив ${p.invitee || 'учасника'} до подорожі "${p.trip}".`,
    }),
    booking_change: (p) => ({
      title: `Нове бронювання: ${p.booking}`,
      body: `${p.actor} додав бронювання "${p.booking}" (${p.type}) до "${p.trip}".`,
    }),
    trip_reminder: (p) => ({
      title: `Нагадування про подорож: ${p.trip}`,
      body: `Ваша подорож "${p.trip}" наближається!`,
    }),
    todo_due: (p) => ({
      title: `Завдання з терміном: ${p.todo}`,
      body: `"${p.todo}" у "${p.trip}" — термін ${p.due}.`,
    }),
    vacay_invite: (p) => ({
      title: 'Запрошення Vacay Fusion',
      body: `${p.actor} запрошує вас об'єднати плани відпустки. Відкрийте ROUTD, щоб прийняти або відхилити.`,
    }),
    photos_shared: (p) => ({
      title: `${p.count} фото поділились`,
      body: `${p.actor} поділився ${p.count} фото у "${p.trip}".`,
    }),
    collab_message: (p) => ({
      title: `Нове повідомлення у "${p.trip}"`,
      body: `${p.actor}: ${p.preview}`,
    }),
    packing_tagged: (p) => ({
      title: `Пакування: ${p.category}`,
      body: `${p.actor} призначив вас до категорії "${p.category}" у "${p.trip}".`,
    }),
    version_available: (p) => ({
      title: 'Доступна нова версія ROUTD',
      body: `ROUTD ${p.version} тепер доступний. Перейдіть до панелі адміністратора для оновлення.`,
    }),
    synology_session_cleared: () => ({
      title: 'Сеанс Synology скинуто',
      body: 'Ваш обліковий запис або URL Synology змінився. Ви вийшли з Synology Photos.',
    }),
    date_proposal_created: p => ({ title: 'Availability poll: ' + p.proposal, body: `${p.actor} created an availability poll "${p.proposal}" in group "${p.group}". Please fill in your availability.` }),
    date_proposal_confirmed: p => ({ title: 'Dates confirmed: ' + p.proposal, body: `The dates for "${p.proposal}" have been confirmed: ${p.confirmed_start} to ${p.confirmed_end}.` }),
    date_proposal_deadline: p => ({ title: 'Availability deadline: ' + p.proposal + '', body: 'The availability poll "' + p.proposal + '" in group "' + p.group + '" closes on ' + p.deadline + '. Please fill in your availability before then.' }),
    date_proposal_ping: p => ({ title: 'Reminder: fill in your availability', body: `${p.actor} asks you to fill in your availability for "${p.proposal}" in group "${p.group}". Currently ${p.filled} members have responded.` }),
    date_proposal_threshold_reached: p => ({ title: `Availability threshold reached: ${p.proposal}`, body: `${p.respondents} of ${p.members} members have filled in their availability for "${p.proposal}" in group "${p.group}".` }),
  },
  passwordReset: {
    subject: 'Скидання пароля',
    greeting: 'Привіт',
    body: 'Ми отримали запит на скидання пароля вашого облікового запису ROUTD. Натисніть кнопку нижче, щоб встановити новий пароль.',
    ctaIntro: 'Скинути пароль',
    expiry: 'Це посилання дійсне протягом 60 хвилин.',
    ignore:
      'Якщо ви не надсилали цей запит, просто проігноруйте цей лист — ваш пароль залишиться незмінним.',
  },
};

export default uk;
