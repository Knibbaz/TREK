import type { NotificationLocale } from '../externalNotifications/types';

const id: NotificationLocale = {
  email: {
    footer:
      'Anda menerima ini karena Anda telah mengaktifkan notifikasi di ROUTD.',
    manage: 'Kelola preferensi di Pengaturan',
    madeWith: 'Dibuat dengan',
    openTrek: 'Buka ROUTD',
  },
  events: {
    trip_invite: (p) => ({
      title: `Undangan perjalanan: "${p.trip}"`,
      body: `${p.actor} mengundang ${p.invitee || 'seorang anggota'} ke perjalanan "${p.trip}".`,
    }),
    booking_change: (p) => ({
      title: `Pemesanan baru: ${p.booking}`,
      body: `${p.actor} menambahkan "${p.booking}" (${p.type}) baru ke "${p.trip}".`,
    }),
    trip_reminder: (p) => ({
      title: `Pengingat perjalanan: ${p.trip}`,
      body: `Perjalanan Anda "${p.trip}" akan segera tiba!`,
    }),
    todo_due: (p) => ({
      title: `Tugas jatuh tempo: ${p.todo}`,
      body: `"${p.todo}" di "${p.trip}" jatuh tempo pada ${p.due}.`,
    }),
    vacay_invite: (p) => ({
      title: 'Undangan Penggabungan Vacay',
      body: `${p.actor} mengundang Anda untuk menggabungkan rencana liburan. Buka ROUTD untuk menerima atau menolak.`,
    }),
    photos_shared: (p) => ({
      title: `${p.count} foto dibagikan`,
      body: `${p.actor} membagikan ${p.count} foto di "${p.trip}".`,
    }),
    collab_message: (p) => ({
      title: `Pesan baru di "${p.trip}"`,
      body: `${p.actor}: ${p.preview}`,
    }),
    packing_tagged: (p) => ({
      title: `Pengepakan: ${p.category}`,
      body: `${p.actor} menugaskan Anda ke kategori "${p.category}" di "${p.trip}".`,
    }),
    version_available: (p) => ({
      title: 'Versi ROUTD baru tersedia',
      body: `ROUTD ${p.version} sekarang tersedia. Kunjungi panel admin untuk memperbarui.`,
    }),
    synology_session_cleared: () => ({
      title: 'Sesi Synology dihapus',
      body: 'Akun atau URL Synology Anda berubah. Anda telah keluar dari Synology Photos.',
    }),
    date_proposal_created: p => ({ title: 'Availability poll: ' + p.proposal, body: `${p.actor} created an availability poll "${p.proposal}" in group "${p.group}". Please fill in your availability.` }),
    date_proposal_confirmed: p => ({ title: 'Dates confirmed: ' + p.proposal, body: `The dates for "${p.proposal}" have been confirmed: ${p.confirmed_start} to ${p.confirmed_end}.` }),
    date_proposal_deadline: p => ({ title: 'Availability deadline: ' + p.proposal + '', body: 'The availability poll "' + p.proposal + '" in group "' + p.group + '" closes on ' + p.deadline + '. Please fill in your availability before then.' }),
    date_proposal_ping: p => ({ title: 'Reminder: fill in your availability', body: `${p.actor} asks you to fill in your availability for "${p.proposal}" in group "${p.group}". Currently ${p.filled} members have responded.` }),
    date_proposal_threshold_reached: p => ({ title: `Ambang tercapai: ${p.proposal}`, body: `${p.respondents} dari ${p.members} anggota grup "${p.group}" telah mengisi ketersediaan untuk "${p.proposal}".` }),
  },
  passwordReset: {
    subject: 'Setel ulang kata sandi Anda',
    greeting: 'Halo',
    body: 'Kami menerima permintaan untuk menyetel ulang kata sandi akun ROUTD Anda. Klik tombol di bawah untuk menetapkan kata sandi baru.',
    ctaIntro: 'Setel ulang kata sandi',
    expiry: 'Tautan ini kedaluwarsa dalam 60 menit.',
    ignore:
      'Jika Anda tidak meminta ini, Anda dapat mengabaikan email ini — kata sandi Anda tidak akan berubah.',
  },
};

export default id;
