import type { NotificationLocale } from '../externalNotifications/types';

const ar: NotificationLocale = {
  email: {
    footer: 'تلقيت هذا لأنك قمت بتفعيل الإشعارات في ROUTD.',
    manage: 'إدارة التفضيلات',
    madeWith: 'Made with',
    openTrek: 'فتح ROUTD',
  },
  events: {
    trip_invite: (p) => ({
      title: `دعوة إلى "${p.trip}"`,
      body: `${p.actor} دعا ${p.invitee || 'عضو'} إلى الرحلة "${p.trip}".`,
    }),
    booking_change: (p) => ({
      title: `حجز جديد: ${p.booking}`,
      body: `${p.actor} أضاف حجز "${p.booking}" (${p.type}) إلى "${p.trip}".`,
    }),
    trip_reminder: (p) => ({
      title: `تذكير: ${p.trip}`,
      body: `رحلتك "${p.trip}" تقترب!`,
    }),
    todo_due: (p) => ({
      title: `مهمة مستحقة: ${p.todo}`,
      body: `"${p.todo}" في "${p.trip}" مستحقة في ${p.due}.`,
    }),
    vacay_invite: (p) => ({
      title: 'دعوة دمج الإجازة',
      body: `${p.actor} يدعوك لدمج خطط الإجازة. افتح ROUTD للقبول أو الرفض.`,
    }),
    photos_shared: (p) => ({
      title: `${p.count} صور مشتركة`,
      body: `${p.actor} شارك ${p.count} صورة في "${p.trip}".`,
    }),
    collab_message: (p) => ({
      title: `رسالة جديدة في "${p.trip}"`,
      body: `${p.actor}: ${p.preview}`,
    }),
    packing_tagged: (p) => ({
      title: `قائمة التعبئة: ${p.category}`,
      body: `${p.actor} عيّنك في فئة "${p.category}" في "${p.trip}".`,
    }),
    version_available: (p) => ({
      title: 'إصدار ROUTD جديد متاح',
      body: `ROUTD ${p.version} متاح الآن. تفضل بزيارة لوحة الإدارة للتحديث.`,
    }),
    synology_session_cleared: () => ({
      title: 'تمت إعادة تعيين جلسة Synology',
      body: 'تغيّر حسابك أو رابط Synology. تم تسجيل خروجك من Synology Photos.',
    }),
    explore_update: (p) => ({ title: 'Trip update available', body: `A new version (v${p.version}) of a trip you saved from Explore is available.` }),
    date_proposal_created: p => ({ title: 'Availability poll: ' + p.proposal, body: `${p.actor} created an availability poll "${p.proposal}" in group "${p.group}". Please fill in your availability.` }),
    date_proposal_confirmed: p => ({ title: 'Dates confirmed: ' + p.proposal, body: `The dates for "${p.proposal}" have been confirmed: ${p.confirmed_start} to ${p.confirmed_end}.` }),
    date_proposal_deadline: p => ({ title: 'Availability deadline: ' + p.proposal, body: 'Poll "' + p.proposal + '" in group "' + p.group + '" closes ' + p.deadline + '.' }),
    date_proposal_ping: p => ({ title: 'تذكير: حدد توفرك', body: `${p.actor} يطلب منك تحديد توفرك لـ "${p.proposal}" في مجموعة "${p.group}". حالياً ${p.filled} من الأعضاء ردوا.` }),
    date_proposal_threshold_reached: p => ({ title: `تم الوصول إلى الحد: ${p.proposal}`, body: `أجاب ${p.respondents} من أصل ${p.members} من أعضاء مجموعة "${p.group}" عن "${p.proposal}".` }),
  },
  passwordReset: {
    subject: 'إعادة تعيين كلمة المرور',
    greeting: 'مرحبا',
    body: 'تلقينا طلبًا لإعادة تعيين كلمة المرور لحسابك في ROUTD. انقر على الزر أدناه لتعيين كلمة مرور جديدة.',
    ctaIntro: 'إعادة تعيين كلمة المرور',
    expiry: 'تنتهي صلاحية هذا الرابط خلال 60 دقيقة.',
    ignore:
      'إذا لم تطلب هذا، يمكنك تجاهل هذه الرسالة — لن تتغير كلمة المرور الخاصة بك.',
  },
};

export default ar;
