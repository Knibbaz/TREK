import type { NotificationLocale } from '../externalNotifications/types';

const nl: NotificationLocale = {
  email: {
    footer: 'Je ontvangt dit omdat je meldingen hebt ingeschakeld in ROUTD.',
    manage: 'Voorkeuren beheren',
    madeWith: 'Made with',
    openTrek: 'ROUTD openen',
  },
  events: {
    trip_invite: (p) => ({
      title: `Uitnodiging voor "${p.trip}"`,
      body: `${p.actor} heeft ${p.invitee || 'een lid'} uitgenodigd voor de reis "${p.trip}".`,
    }),
    booking_change: (p) => ({
      title: `Nieuwe boeking: ${p.booking}`,
      body: `${p.actor} heeft een boeking "${p.booking}" (${p.type}) toegevoegd aan "${p.trip}".`,
    }),
    trip_reminder: (p) => ({
      title: `Reisherinnering: ${p.trip}`,
      body: `Je reis "${p.trip}" komt eraan!`,
    }),
    todo_due: (p) => ({
      title: `Taak verloopt: ${p.todo}`,
      body: `"${p.todo}" in "${p.trip}" verloopt op ${p.due}.`,
    }),
    vacay_invite: (p) => ({
      title: 'Vacay Fusion uitnodiging',
      body: `${p.actor} nodigt je uit om vakantieplannen te fuseren. Open ROUTD om te accepteren of af te wijzen.`,
    }),
    photos_shared: (p) => ({
      title: `${p.count} foto's gedeeld`,
      body: `${p.actor} heeft ${p.count} foto('s) gedeeld in "${p.trip}".`,
    }),
    collab_message: (p) => ({
      title: `Nieuw bericht in "${p.trip}"`,
      body: `${p.actor}: ${p.preview}`,
    }),
    packing_tagged: (p) => ({
      title: `Paklijst: ${p.category}`,
      body: `${p.actor} heeft je toegewezen aan de categorie "${p.category}" in "${p.trip}".`,
    }),
    version_available: (p) => ({
      title: 'Nieuwe ROUTD-versie beschikbaar',
      body: `ROUTD ${p.version} is nu beschikbaar. Bezoek het beheerderspaneel om bij te werken.`,
    }),
    synology_session_cleared: () => ({
      title: 'Synology-sessie gewist',
      body: 'Je Synology-account of URL is gewijzigd. Je bent uitgelogd bij Synology Photos.',
    }),
    date_proposal_created: p => ({ title: 'Beschikbaarheidspoll: ' + p.proposal, body: `${p.actor} heeft een beschikbaarheidspoll "${p.proposal}" in groep "${p.group}" aangemaakt. Vul alstublieft je beschikbaarheid in.` }),
    date_proposal_confirmed: p => ({ title: 'Datums bevestigd: ' + p.proposal, body: `De datums voor "${p.proposal}" zijn bevestigd: ${p.confirmed_start} tot ${p.confirmed_end}.` }),
    date_proposal_deadline: p => ({ title: 'Beschikbaarheid invullen: ' + p.proposal + '', body: 'De peilingsvraag "' + p.proposal + '" in groep "' + p.group + '" sluit op ' + p.deadline + '. Vul je beschikbaarheid nog in voor die datum.' }),
    date_proposal_ping: p => ({ title: 'Herinnering: vul je beschikbaarheid in', body: `${p.actor} vraagt je je beschikbaarheid in te vullen voor "${p.proposal}" in groep "${p.group}". Momenteel hebben ${p.filled} leden gereageerd.` }),
    date_proposal_threshold_reached: p => ({ title: `Drempel bereikt: ${p.proposal}`, body: `${p.respondents} van ${p.members} leden hebben hun beschikbaarheid ingevuld voor "${p.proposal}" in groep "${p.group}".` }),
  },
  passwordReset: {
    subject: 'Reset je wachtwoord',
    greeting: 'Hallo',
    body: 'We hebben een verzoek ontvangen om het wachtwoord voor je ROUTD-account te resetten. Klik op de knop hieronder om een nieuw wachtwoord in te stellen.',
    ctaIntro: 'Wachtwoord resetten',
    expiry: 'Deze link verloopt over 60 minuten.',
    ignore:
      'Als jij dit niet hebt aangevraagd, kun je deze e-mail negeren — je wachtwoord blijft ongewijzigd.',
  },
};

export default nl;
