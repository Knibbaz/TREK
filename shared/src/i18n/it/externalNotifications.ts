import type { NotificationLocale } from '../externalNotifications/types';

const it: NotificationLocale = {
  email: {
    footer:
      'Hai ricevuto questa email perché hai le notifiche abilitate in ROUTD.',
    manage: 'Gestisci le preferenze nelle impostazioni',
    madeWith: 'Made with',
    openTrek: 'Apri ROUTD',
  },
  events: {
    trip_invite: (p) => ({
      title: `Invito a "${p.trip}"`,
      body: `${p.actor} ha invitato ${p.invitee || 'un membro'} al viaggio "${p.trip}".`,
    }),
    booking_change: (p) => ({
      title: `Nuova prenotazione: ${p.booking}`,
      body: `${p.actor} ha aggiunto una prenotazione "${p.booking}" (${p.type}) a "${p.trip}".`,
    }),
    trip_reminder: (p) => ({
      title: `Promemoria viaggio: ${p.trip}`,
      body: `Il tuo viaggio "${p.trip}" si avvicina!`,
    }),
    todo_due: (p) => ({
      title: `Attività in scadenza: ${p.todo}`,
      body: `"${p.todo}" in "${p.trip}" scade il ${p.due}.`,
    }),
    vacay_invite: (p) => ({
      title: 'Invito Vacay Fusion',
      body: `${p.actor} ti ha invitato a fondere i piani vacanza. Apri ROUTD per accettare o rifiutare.`,
    }),
    photos_shared: (p) => ({
      title: `${p.count} foto condivise`,
      body: `${p.actor} ha condiviso ${p.count} foto in "${p.trip}".`,
    }),
    collab_message: (p) => ({
      title: `Nuovo messaggio in "${p.trip}"`,
      body: `${p.actor}: ${p.preview}`,
    }),
    packing_tagged: (p) => ({
      title: `Bagagli: ${p.category}`,
      body: `${p.actor} ti ha assegnato alla categoria "${p.category}" in "${p.trip}".`,
    }),
    version_available: (p) => ({
      title: 'Nuova versione ROUTD disponibile',
      body: `ROUTD ${p.version} è ora disponibile. Visita il pannello di amministrazione per aggiornare.`,
    }),
    synology_session_cleared: () => ({
      title: 'Sessione Synology rimossa',
      body: 'Il tuo account o URL Synology è cambiato. Sei stato disconnesso da Synology Photos.',
    }),
    explore_update: (p) => ({ title: 'Trip update available', body: `A new version (v${p.version}) of a trip you saved from Explore is available.` }),
    date_proposal_created: p => ({ title: 'Availability poll: ' + p.proposal, body: `${p.actor} created an availability poll "${p.proposal}" in group "${p.group}". Please fill in your availability.` }),
    date_proposal_confirmed: p => ({ title: 'Date confermate: ' + p.proposal, body: `Le date per "${p.proposal}" sono state confermate: da ${p.confirmed_start} a ${p.confirmed_end}.` }),
    date_proposal_deadline: p => ({ title: 'Disponibilità in scadenza: ' + p.proposal, body: 'Il sondaggio "' + p.proposal + '" nel gruppo "' + p.group + '" chiude il ' + p.deadline + '. Inserisci la tua disponibilità.' }),
    date_proposal_ping: p => ({ title: 'Promemoria: inserisci la tua disponibilità', body: `${p.actor} ti chiede di inserire la tua disponibilità per "${p.proposal}" nel gruppo "${p.group}". Attualmente ${p.filled} membri hanno risposto.` }),
    date_proposal_threshold_reached: p => ({ title: `Soglia raggiunta: ${p.proposal}`, body: `${p.respondents} su ${p.members} membri del gruppo "${p.group}" hanno indicato la disponibilità per "${p.proposal}".` }),
  },
  passwordReset: {
    subject: 'Reimposta la tua password',
    greeting: 'Ciao',
    body: 'Abbiamo ricevuto una richiesta di reimpostazione della password per il tuo account ROUTD. Clicca il pulsante qui sotto per impostare una nuova password.',
    ctaIntro: 'Reimposta password',
    expiry: 'Questo link scade tra 60 minuti.',
    ignore:
      'Se non hai richiesto questa operazione, ignora questa email — la tua password non cambierà.',
  },
};

export default it;
