import type { NotificationLocale } from '../externalNotifications/types';

const gr: NotificationLocale = {
  email: {
    footer:
      'Λάβατε αυτό το μήνυμα επειδή έχετε ενεργοποιήσει τις ειδοποιήσεις στο ROUTD.',
    manage: 'Διαχείριση προτιμήσεων στις Ρυθμίσεις',
    madeWith: 'Δημιουργήθηκε με',
    openTrek: 'Άνοιγμα ROUTD',
  },
  events: {
    trip_invite: (p) => ({
      title: `Πρόσκληση ταξιδιού: "${p.trip}"`,
      body: `Ο/Η ${p.actor} προσκάλεσε ${p.invitee || 'ένα μέλος'} στο ταξίδι "${p.trip}".`,
    }),
    booking_change: (p) => ({
      title: `Νέα κράτηση: ${p.booking}`,
      body: `Ο/Η ${p.actor} πρόσθεσε μια νέα κράτηση "${p.booking}" (${p.type}) στο "${p.trip}".`,
    }),
    trip_reminder: (p) => ({
      title: `Υπενθύμιση ταξιδιού: ${p.trip}`,
      body: `Το ταξίδι σας "${p.trip}" πλησιάζει!`,
    }),
    todo_due: (p) => ({
      title: `Εκκρεμότητα προς εκτέλεση: ${p.todo}`,
      body: `Η εκκρεμότητα "${p.todo}" στο "${p.trip}" λήγει στις ${p.due}.`,
    }),
    vacay_invite: (p) => ({
      title: 'Πρόσκληση συγχώνευσης διακοπών',
      body: `Ο/Η ${p.actor} σας προσκάλεσε να συγχωνεύσετε τα σχέδια διακοπών σας. Ανοίξτε το ROUTD για να αποδεχτείτε ή να απορρίψετε.`,
    }),
    photos_shared: (p) => ({
      title: `${p.count} φωτογραφίες κοινοποιήθηκαν`,
      body: `Ο/Η ${p.actor} κοινοποίησε ${p.count} φωτογραφία/ες στο "${p.trip}".`,
    }),
    collab_message: (p) => ({
      title: `Νέο μήνυμα στο "${p.trip}"`,
      body: `${p.actor}: ${p.preview}`,
    }),
    packing_tagged: (p) => ({
      title: `Λίστα συσκευασίας: ${p.category}`,
      body: `Ο/Η ${p.actor} σας ανέθεσε στην κατηγορία "${p.category}" της λίστας συσκευασίας στο "${p.trip}".`,
    }),
    version_available: (p) => ({
      title: 'Νέα έκδοση ROUTD διαθέσιμη',
      body: `Η έκδοση ROUTD ${p.version} είναι τώρα διαθέσιμη. Επισκεφθείτε τον πίνακα διαχείρισης για να ενημερώσετε.`,
    }),
    synology_session_cleared: () => ({
      title: 'Η σύνδεση Synology τερματίστηκε',
      body: 'Ο λογαριασμός σας Synology ή το URL άλλαξε. Έχετε αποσυνδεθεί από το Synology Photos.',
    }),
    explore_update: (p) => ({ title: 'Trip update available', body: `A new version (v${p.version}) of a trip you saved from Explore is available.` }),
    date_proposal_created: p => ({ title: 'Availability poll: ' + p.proposal, body: `${p.actor} created an availability poll "${p.proposal}" in group "${p.group}". Please fill in your availability.` }),
    date_proposal_confirmed: p => ({ title: 'Dates confirmed: ' + p.proposal, body: `The dates for "${p.proposal}" have been confirmed: ${p.confirmed_start} to ${p.confirmed_end}.` }),
    date_proposal_deadline: p => ({ title: 'Availability deadline: ' + p.proposal + '', body: 'The availability poll "' + p.proposal + '" in group "' + p.group + '" closes on ' + p.deadline + '. Please fill in your availability before then.' }),
    date_proposal_ping: p => ({ title: 'Reminder: fill in your availability', body: `${p.actor} asks you to fill in your availability for "${p.proposal}" in group "${p.group}". Currently ${p.filled} members have responded.` }),
    date_proposal_threshold_reached: p => ({ title: `Availability threshold reached: ${p.proposal}`, body: `${p.respondents} of ${p.members} members have filled in their availability for "${p.proposal}" in group "${p.group}".` }),
  },
  passwordReset: {
    subject: 'Επαναφορά κωδικού πρόσβασης',
    greeting: 'Γεια σας',
    body: 'Λάβαμε ένα αίτημα επαναφοράς του κωδικού πρόσβασης για τον λογαριασμό σας στο ROUTD. Κάντε κλικ στο παρακάτω κουμπί για να ορίσετε νέο κωδικό πρόσβασης.',
    ctaIntro: 'Επαναφορά κωδικού',
    expiry: 'Αυτός ο σύνδεσμος λήγει σε 60 λεπτά.',
    ignore:
      'Εάν δεν ζητήσατε αυτή την αλλαγή, μπορείτε να αγνοήσετε αυτό το μήνυμα — ο κωδικός σας δεν θα αλλάξει.',
  },
};

export default gr;
