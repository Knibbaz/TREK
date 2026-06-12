import type { NotificationLocale } from '../externalNotifications/types';

const de: NotificationLocale = {
  email: {
    footer:
      'Du erhältst diese E-Mail, weil du Benachrichtigungen in ROUTD aktiviert hast.',
    manage: 'Einstellungen verwalten',
    madeWith: 'Made with',
    openTrek: 'ROUTD öffnen',
  },
  events: {
    trip_invite: (p) => ({
      title: `Einladung zu "${p.trip}"`,
      body: `${p.actor} hat ${p.invitee || 'ein Mitglied'} zur Reise "${p.trip}" eingeladen.`,
    }),
    booking_change: (p) => ({
      title: `Neue Buchung: ${p.booking}`,
      body: `${p.actor} hat eine neue Buchung "${p.booking}" (${p.type}) zu "${p.trip}" hinzugefügt.`,
    }),
    trip_reminder: (p) => ({
      title: `Reiseerinnerung: ${p.trip}`,
      body: `Deine Reise "${p.trip}" steht bald an!`,
    }),
    todo_due: (p) => ({
      title: `Aufgabe fällig: ${p.todo}`,
      body: `"${p.todo}" in "${p.trip}" ist am ${p.due} fällig.`,
    }),
    vacay_invite: (p) => ({
      title: 'Vacay Fusion-Einladung',
      body: `${p.actor} hat dich eingeladen, Urlaubspläne zu fusionieren. Öffne ROUTD um anzunehmen oder abzulehnen.`,
    }),
    photos_shared: (p) => ({
      title: `${p.count} Fotos geteilt`,
      body: `${p.actor} hat ${p.count} Foto(s) in "${p.trip}" geteilt.`,
    }),
    collab_message: (p) => ({
      title: `Neue Nachricht in "${p.trip}"`,
      body: `${p.actor}: ${p.preview}`,
    }),
    packing_tagged: (p) => ({
      title: `Packliste: ${p.category}`,
      body: `${p.actor} hat dich der Kategorie "${p.category}" in der Packliste von "${p.trip}" zugewiesen.`,
    }),
    version_available: (p) => ({
      title: 'Neue ROUTD-Version verfügbar',
      body: `ROUTD ${p.version} ist jetzt verfügbar. Besuche das Admin-Panel zum Aktualisieren.`,
    }),
    synology_session_cleared: () => ({
      title: 'Synology-Sitzung beendet',
      body: 'Dein Synology-Konto oder die URL hat sich geändert. Du wurdest von Synology Photos abgemeldet.',
    }),
    explore_update: (p) => ({ title: 'Trip update available', body: `A new version (v${p.version}) of a trip you saved from Explore is available.` }),
    date_proposal_created: p => ({ title: 'Verfügbarkeitsumfrage: ' + p.proposal, body: `${p.actor} hat eine Verfügbarkeitsumfrage "${p.proposal}" in der Gruppe "${p.group}" erstellt. Bitte trage deine Verfügbarkeit ein.` }),
    date_proposal_confirmed: p => ({ title: 'Daten bestätigt: ' + p.proposal, body: `Die Daten für "${p.proposal}" wurden bestätigt: ${p.confirmed_start} bis ${p.confirmed_end}.` }),
    date_proposal_deadline: p => ({ title: 'Verfuegbarkeit: Frist laeuft ab - ' + p.proposal + '', body: 'Die Umfrage "' + p.proposal + '" in der Gruppe "' + p.group + '" endet am ' + p.deadline + '. Bitte trage deine Verfuegbarkeit noch ein.' }),
    date_proposal_ping: p => ({ title: 'Erinnerung: Trage deine Verfügbarkeit ein', body: `${p.actor} fragt dich, deine Verfügbarkeit für "${p.proposal}" in der Gruppe "${p.group}" einzutragen. Derzeit haben ${p.filled} Mitglieder geantwortet.` }),
    date_proposal_threshold_reached: p => ({ title: `Schwelle erreicht: ${p.proposal}`, body: `${p.respondents} von ${p.members} Mitgliedern haben ihre Verfügbarkeit für "${p.proposal}" in der Gruppe "${p.group}" eingetragen.` }),
  },
  passwordReset: {
    subject: 'Passwort zurücksetzen',
    greeting: 'Hallo',
    body: 'Wir haben eine Anfrage erhalten, das Passwort für dein ROUTD-Konto zurückzusetzen. Klicke auf den Button unten, um ein neues Passwort festzulegen.',
    ctaIntro: 'Passwort zurücksetzen',
    expiry: 'Dieser Link ist 60 Minuten gültig.',
    ignore:
      'Wenn du das nicht warst, ignoriere diese E-Mail — dein Passwort bleibt unverändert.',
  },
};

export default de;
