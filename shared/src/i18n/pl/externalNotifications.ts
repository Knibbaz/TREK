import type { NotificationLocale } from '../externalNotifications/types';

const pl: NotificationLocale = {
  email: {
    footer:
      'Otrzymałeś/aś tę wiadomość, ponieważ masz włączone powiadomienia w ROUTD.',
    manage: 'Zarządzaj preferencjami w ustawieniach',
    madeWith: 'Made with',
    openTrek: 'Otwórz ROUTD',
  },
  events: {
    trip_invite: (p) => ({
      title: `Zaproszenie do "${p.trip}"`,
      body: `${p.actor} zaprosił ${p.invitee || 'członka'} do podróży "${p.trip}".`,
    }),
    booking_change: (p) => ({
      title: `Nowa rezerwacja: ${p.booking}`,
      body: `${p.actor} dodał rezerwację "${p.booking}" (${p.type}) do "${p.trip}".`,
    }),
    trip_reminder: (p) => ({
      title: `Przypomnienie o podróży: ${p.trip}`,
      body: `Twoja podróż "${p.trip}" zbliża się!`,
    }),
    todo_due: (p) => ({
      title: `Zadanie z terminem: ${p.todo}`,
      body: `"${p.todo}" w "${p.trip}" — termin ${p.due}.`,
    }),
    vacay_invite: (p) => ({
      title: 'Zaproszenie Vacay Fusion',
      body: `${p.actor} zaprosił Cię do połączenia planów urlopowych. Otwórz ROUTD, aby zaakceptować lub odrzucić.`,
    }),
    photos_shared: (p) => ({
      title: `${p.count} zdjęć udostępnionych`,
      body: `${p.actor} udostępnił ${p.count} zdjęcie/zdjęcia w "${p.trip}".`,
    }),
    collab_message: (p) => ({
      title: `Nowa wiadomość w "${p.trip}"`,
      body: `${p.actor}: ${p.preview}`,
    }),
    packing_tagged: (p) => ({
      title: `Pakowanie: ${p.category}`,
      body: `${p.actor} przypisał Cię do kategorii "${p.category}" w "${p.trip}".`,
    }),
    version_available: (p) => ({
      title: 'Nowa wersja ROUTD dostępna',
      body: `ROUTD ${p.version} jest teraz dostępny. Odwiedź panel administracyjny, aby zaktualizować.`,
    }),
    synology_session_cleared: () => ({
      title: 'Sesja Synology wyczyszczona',
      body: 'Twoje konto lub URL Synology uległo zmianie. Zostałeś wylogowany z Synology Photos.',
    }),
    explore_update: (p) => ({ title: 'Trip update available', body: `A new version (v${p.version}) of a trip you saved from Explore is available.` }),
    date_proposal_created: p => ({ title: 'Availability poll: ' + p.proposal, body: `${p.actor} created an availability poll "${p.proposal}" in group "${p.group}". Please fill in your availability.` }),
    date_proposal_confirmed: p => ({ title: 'Dates confirmed: ' + p.proposal, body: `The dates for "${p.proposal}" have been confirmed: ${p.confirmed_start} to ${p.confirmed_end}.` }),
    date_proposal_deadline: p => ({ title: 'Termin dostępności: ' + p.proposal, body: 'Ankieta "' + p.proposal + '" w grupie "' + p.group + '" zamyka się ' + p.deadline + '.' }),
    date_proposal_ping: p => ({ title: 'Przypomnienie: podaj swoją dostępność', body: `${p.actor} prosi cię o podanie dostępności dla "${p.proposal}" w grupie "${p.group}". Obecnie odpowiedziało ${p.filled} członków.` }),
    date_proposal_threshold_reached: p => ({ title: `Osiągnięto próg: ${p.proposal}`, body: `${p.respondents} z ${p.members} członków grupy "${p.group}" podało dostępność dla "${p.proposal}".` }),
  },
  passwordReset: {
    subject: 'Zresetuj hasło',
    greeting: 'Cześć',
    body: 'Otrzymaliśmy prośbę o zresetowanie hasła do Twojego konta ROUTD. Kliknij przycisk poniżej, aby ustawić nowe hasło.',
    ctaIntro: 'Zresetuj hasło',
    expiry: 'Link wygaśnie za 60 minut.',
    ignore:
      'Jeśli to nie Ty, zignoruj tę wiadomość — Twoje hasło pozostanie bez zmian.',
  },
};

export default pl;
