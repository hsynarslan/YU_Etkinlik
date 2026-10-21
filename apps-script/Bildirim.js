/**
 * Bildirim.js — E-posta bildirimleri.
 * Ayarlar > BILDIRIM_AKTIF = HAYIR ise hiçbir e-posta gönderilmez (test için).
 * Bildirim hatası asıl işlemi bozmaz; yalnızca Log'a yazılır.
 */

function bildir(alicilar, konu, mesaj, etkinlikId) {
  var liste = (Array.isArray(alicilar) ? alicilar : [alicilar])
    .filter(Boolean)
    .filter(function (x, i, a) { return a.indexOf(x) === i; });
  if (!liste.length) return;
  if (String(ayar('BILDIRIM_AKTIF')).toUpperCase() !== 'EVET') return;

  var url = ayar('UYGULAMA_URL');
  var html = '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">' +
    '<p>' + mesaj + '</p>' +
    (url ? '<p><a href="' + url + '">Etkinlik Yönetim Sistemini aç</a></p>' : '') +
    '<p style="color:#777;font-size:12px">' + APP.AD + ' — otomatik bildirim</p></div>';
  try {
    MailApp.sendEmail({
      to: liste.join(','),
      subject: '[Etkinlik] ' + konu,
      htmlBody: html,
      name: APP.AD
    });
  } catch (e) {
    try { logYaz('', etkinlikId, 'BILDIRIM_HATASI', konu + ' → ' + e.message); } catch (ignore) {}
  }
}

function etkinlikOzeti(e) {
  return '<b>' + htmlKacis(e.Ad) + '</b> · ' + e.Tarih + ' ' + e.BaslangicSaati + '–' + e.BitisSaati +
    ' · ' + htmlKacis(mekanAdi(e.MekanID));
}

function htmlKacis(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function mekanAdi(mekanId) {
  var m = db_bul(SAYFA.MEKANLAR, 'MekanID', mekanId);
  return m ? m.Ad : mekanId;
}
