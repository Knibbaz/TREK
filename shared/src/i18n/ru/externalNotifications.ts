import type { NotificationLocale } from '../externalNotifications/types';

const ru: NotificationLocale = {
  email: {
    footer: 'Вы получили это, потому что у вас включены уведомления в ROUTD.',
    manage: 'Управление настройками',
    madeWith: 'Made with',
    openTrek: 'Открыть ROUTD',
  },
  events: {
    trip_invite: (p) => ({
      title: `Приглашение в "${p.trip}"`,
      body: `${p.actor} пригласил ${p.invitee || 'участника'} в поездку "${p.trip}".`,
    }),
    booking_change: (p) => ({
      title: `Новое бронирование: ${p.booking}`,
      body: `${p.actor} добавил бронирование "${p.booking}" (${p.type}) в "${p.trip}".`,
    }),
    trip_reminder: (p) => ({
      title: `Напоминание: ${p.trip}`,
      body: `Ваша поездка "${p.trip}" скоро начнётся!`,
    }),
    todo_due: (p) => ({
      title: `Задача к сроку: ${p.todo}`,
      body: `"${p.todo}" в поездке "${p.trip}" — срок ${p.due}.`,
    }),
    vacay_invite: (p) => ({
      title: 'Приглашение Vacay Fusion',
      body: `${p.actor} приглашает вас объединить планы отпуска. Откройте ROUTD для подтверждения.`,
    }),
    photos_shared: (p) => ({
      title: `${p.count} фото`,
      body: `${p.actor} поделился ${p.count} фото в "${p.trip}".`,
    }),
    collab_message: (p) => ({
      title: `Новое сообщение в "${p.trip}"`,
      body: `${p.actor}: ${p.preview}`,
    }),
    packing_tagged: (p) => ({
      title: `Список вещей: ${p.category}`,
      body: `${p.actor} назначил вас в категорию "${p.category}" в "${p.trip}".`,
    }),
    version_available: (p) => ({
      title: 'Доступна новая версия ROUTD',
      body: `ROUTD ${p.version} теперь доступен. Перейдите в панель администратора для обновления.`,
    }),
    synology_session_cleared: () => ({
      title: 'Сессия Synology сброшена',
      body: 'Ваш аккаунт или URL Synology изменился. Вы вышли из Synology Photos.',
    }),
    explore_update: (p) => ({ title: 'Trip update available', body: `A new version (v${p.version}) of a trip you saved from Explore is available.` }),
    date_proposal_created: p => ({ title: 'Опрос доступности: ' + p.proposal, body: `${p.actor} создал опрос доступности "${p.proposal}" в группе "${p.group}". Пожалуйста, укажите свою доступность.` }),
    date_proposal_confirmed: p => ({ title: 'Даты подтверждены: ' + p.proposal, body: `Даты для "${p.proposal}" подтверждены: ${p.confirmed_start} по ${p.confirmed_end}.` }),
    date_proposal_deadline: p => ({ title: 'Srok dostupnosti: ' + p.proposal, body: 'Opros "' + p.proposal + '" v gruppe "' + p.group + '" zakryvaetsya ' + p.deadline + '.' }),
    date_proposal_ping: p => ({ title: 'Напоминание: укажите свою доступность', body: `${p.actor} просит вас указать вашу доступность для "${p.proposal}" в группе "${p.group}". В настоящее время ${p.filled} членов ответили.` }),
    date_proposal_threshold_reached: p => ({ title: `Порог достигнут: ${p.proposal}`, body: `${p.respondents} из ${p.members} членов указали свою доступность для "${p.proposal}" в группе "${p.group}".` }),
  },
  passwordReset: {
    subject: 'Сброс пароля',
    greeting: 'Здравствуйте',
    body: 'Мы получили запрос на сброс пароля вашего аккаунта ROUTD. Нажмите кнопку ниже, чтобы установить новый пароль.',
    ctaIntro: 'Сбросить пароль',
    expiry: 'Ссылка действительна 60 минут.',
    ignore:
      'Если вы не запрашивали сброс — просто проигнорируйте это письмо, пароль останется прежним.',
  },
};

export default ru;
