import type { NotificationLocale } from '../externalNotifications/types';

const cs: NotificationLocale = {
  email: {
    footer: 'Toto jsi obdržel/a, protože máš povoleny upozornění v ROUTD.',
    manage: 'Spravovat předvolby v nastavení',
    madeWith: 'Made with',
    openTrek: 'Otevřít ROUTD',
  },
  events: {
    trip_invite: (p) => ({
      title: `Pozvánka do "${p.trip}"`,
      body: `${p.actor} pozval ${p.invitee || 'člena'} na výlet "${p.trip}".`,
    }),
    booking_change: (p) => ({
      title: `Nová rezervace: ${p.booking}`,
      body: `${p.actor} přidal rezervaci "${p.booking}" (${p.type}) k "${p.trip}".`,
    }),
    trip_reminder: (p) => ({
      title: `Připomínka výletu: ${p.trip}`,
      body: `Váš výlet "${p.trip}" se blíží!`,
    }),
    todo_due: (p) => ({
      title: `Úkol se blíží: ${p.todo}`,
      body: `"${p.todo}" ve výletě "${p.trip}" má termín ${p.due}.`,
    }),
    vacay_invite: (p) => ({
      title: 'Pozvánka Vacay Fusion',
      body: `${p.actor} vás pozval ke spojení dovolenkových plánů. Otevřete ROUTD pro přijetí nebo odmítnutí.`,
    }),
    photos_shared: (p) => ({
      title: `${p.count} sdílených fotek`,
      body: `${p.actor} sdílel ${p.count} foto v "${p.trip}".`,
    }),
    collab_message: (p) => ({
      title: `Nová zpráva v "${p.trip}"`,
      body: `${p.actor}: ${p.preview}`,
    }),
    packing_tagged: (p) => ({
      title: `Balení: ${p.category}`,
      body: `${p.actor} vás přiřadil do kategorie "${p.category}" v "${p.trip}".`,
    }),
    version_available: (p) => ({
      title: 'Nová verze ROUTD dostupná',
      body: `ROUTD ${p.version} je nyní dostupný. Navštivte administrátorský panel pro aktualizaci.`,
    }),
    synology_session_cleared: () => ({
      title: 'Relace Synology byla zrušena',
      body: 'Váš účet nebo URL Synology se změnil. Byli jste odhlášeni ze Synology Photos.',
    }),
    date_proposal_created: p => ({ title: 'Availability poll: ' + p.proposal, body: `${p.actor} created an availability poll "${p.proposal}" in group "${p.group}". Please fill in your availability.` }),
    date_proposal_confirmed: p => ({ title: 'Data potvrzena: ' + p.proposal, body: `Termíny pro "${p.proposal}" byly potvrzeny: ${p.confirmed_start} až ${p.confirmed_end}.` }),
    date_proposal_deadline: p => ({ title: 'Dostupnost: ' + p.proposal, body: 'Hlasovani "' + p.proposal + '" ve skupin\u011b "' + p.group + '" konci ' + p.deadline + '. Prosim, vyplnte svou dostupnost.' }),
    date_proposal_ping: p => ({ title: 'Připomenutí: vyplňte svou dostupnost', body: `${p.actor} vás žádá o vyplnění vaší dostupnosti pro "${p.proposal}" ve skupině "${p.group}". Dosud odpovědělo ${p.filled} členů.` }),
    date_proposal_threshold_reached: p => ({ title: `Dosažen práh: ${p.proposal}`, body: `${p.respondents} z ${p.members} členů skupiny "${p.group}" vyplnilo dostupnost pro "${p.proposal}".` }),
  },
  passwordReset: {
    subject: 'Obnovení hesla',
    greeting: 'Ahoj',
    body: 'Obdrželi jsme žádost o obnovení hesla k tvému účtu ROUTD. Klikni na tlačítko níže a nastav nové heslo.',
    ctaIntro: 'Obnovit heslo',
    expiry: 'Odkaz vyprší za 60 minut.',
    ignore:
      'Pokud jsi o obnovení nežádal/a, tento e-mail ignoruj — heslo zůstane beze změny.',
  },
};

export default cs;
