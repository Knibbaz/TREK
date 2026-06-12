import type { NotificationLocale } from '../externalNotifications/types';

const tr: NotificationLocale = {
  email: {
    footer: "ROUTD'te bildirimleri etkinleştirdiğiniz için bunu aldınız.",
    manage: 'Ayarlarda tercihleri yönetin',
    madeWith: 'Made with',
    openTrek: "ROUTD'i aç",
  },
  events: {
    trip_invite: (p) => ({
      title: `"${p.trip}" seyahatine davet`,
      body: `${p.actor}, ${p.invitee || 'bir üyeyi'} "${p.trip}" seyahatine davet etti.`,
    }),
    booking_change: (p) => ({
      title: `Yeni rezervasyon: ${p.booking}`,
      body: `${p.actor}, "${p.trip}" seyahatine "${p.booking}" (${p.type}) rezervasyonu ekledi.`,
    }),
    trip_reminder: (p) => ({
      title: `Seyahat hatırlatıcısı: ${p.trip}`,
      body: `"${p.trip}" seyahatiniz yaklaşıyor!`,
    }),
    todo_due: (p) => ({
      title: `Görev süresi dolmak üzere: ${p.todo}`,
      body: `"${p.trip}" içindeki "${p.todo}" görevi ${p.due} tarihinde bitiyor.`,
    }),
    vacay_invite: (p) => ({
      title: 'Vacay Fusion Daveti',
      body: `${p.actor} sizi tatil planlarını birleştirmeye davet etti. Kabul etmek veya reddetmek için ROUTD'i açın.`,
    }),
    photos_shared: (p) => ({
      title: `${p.count} fotoğraf paylaşıldı`,
      body: `${p.actor}, "${p.trip}" içinde ${p.count} fotoğraf paylaştı.`,
    }),
    collab_message: (p) => ({
      title: `"${p.trip}" içinde yeni mesaj`,
      body: `${p.actor}: ${p.preview}`,
    }),
    packing_tagged: (p) => ({
      title: `Bagaj: ${p.category}`,
      body: `${p.actor}, sizi "${p.trip}" içindeki "${p.category}" bagaj kategorisine atadı.`,
    }),
    version_available: (p) => ({
      title: 'Yeni ROUTD sürümü mevcut',
      body: `ROUTD ${p.version} artık mevcut. Güncellemek için yönetici panelini ziyaret edin.`,
    }),
    synology_session_cleared: () => ({
      title: 'Synology oturumu temizlendi',
      body: 'Synology hesabınız veya URL değişti. Synology Photos oturumunuz kapatıldı.',
    }),
    date_proposal_created: p => ({ title: 'Availability poll: ' + p.proposal, body: `${p.actor} created an availability poll "${p.proposal}" in group "${p.group}". Please fill in your availability.` }),
    date_proposal_confirmed: p => ({ title: 'Dates confirmed: ' + p.proposal, body: `The dates for "${p.proposal}" have been confirmed: ${p.confirmed_start} to ${p.confirmed_end}.` }),
    date_proposal_deadline: p => ({ title: 'Availability deadline: ' + p.proposal + '', body: 'The availability poll "' + p.proposal + '" in group "' + p.group + '" closes on ' + p.deadline + '. Please fill in your availability before then.' }),
    date_proposal_ping: p => ({ title: 'Reminder: fill in your availability', body: `${p.actor} asks you to fill in your availability for "${p.proposal}" in group "${p.group}". Currently ${p.filled} members have responded.` }),
    date_proposal_threshold_reached: p => ({ title: `Availability threshold reached: ${p.proposal}`, body: `${p.respondents} of ${p.members} members have filled in their availability for "${p.proposal}" in group "${p.group}".` }),
  },
  passwordReset: {
    subject: 'Şifrenizi sıfırlayın',
    greeting: 'Merhaba',
    body: 'ROUTD hesabınızın şifresini sıfırlamak için bir istek aldık. Yeni bir şifre belirlemek için aşağıdaki butona tıklayın.',
    ctaIntro: 'Şifreyi sıfırla',
    expiry: 'Bu bağlantı 60 dakika içinde sona erer.',
    ignore:
      'Bu isteği siz yapmadıysanız, bu e-postayı güvenle yok sayabilirsiniz — şifreniz değişmeyecektir.',
  },
};

export default tr;
