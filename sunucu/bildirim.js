/**
 * bildirim.js — E-posta bildirimleri.
 *
 * - Ayarlar > BILDIRIM_AKTIF = HAYIR ise hiçbir e-posta gönderilmez.
 * - RESEND_API_KEY tanımlıysa e-posta Resend ile gönderilir; değilse yalnızca sunucu günlüğüne yazılır
 *   (yerel geliştirme). Testler postaKanaliAyarla() ile gönderilenleri yakalar.
 * - E-postalar işlem başarıyla kaydedildikten sonra gönderilir; hata asıl işlemi bozmaz, Log'a yazılır.
 */
const { APP, SAYFA } = require('./config');
const db = require('./db');

async function resendGonder(posta) {
  const yanit = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EPOSTA_GONDEREN || APP.AD + ' <onboarding@resend.dev>',
      to: posta.to,
      subject: posta.subject,
      html: posta.html
    })
  });
  if (!yanit.ok) throw new Error('Resend ' + yanit.status + ': ' + (await yanit.text()).slice(0, 300));
}

async function gunlugeYaz(posta) {
  console.log('[e-posta] ' + posta.to.join(', ') + ' · ' + posta.subject);
}

let kanal = null;
/** Testler için: gönderilecek e-postaları yakalayan fonksiyon (null = varsayılan). */
function postaKanaliAyarla(fn) { kanal = fn; }

function varsayilanKanal() {
  return process.env.RESEND_API_KEY ? resendGonder : gunlugeYaz;
}

async function bildir(alicilar, konu, mesaj, etkinlikId) {
  const liste = (Array.isArray(alicilar) ? alicilar : [alicilar])
    .filter(Boolean)
    .filter((x, i, a) => a.indexOf(x) === i);
  if (!liste.length) return;
  if (String(await db.ayar('BILDIRIM_AKTIF')).toUpperCase() !== 'EVET') return;

  const url = (await db.ayar('UYGULAMA_URL')) || process.env.UYGULAMA_URL || '';
  const html = '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">' +
    '<p>' + mesaj + '</p>' +
    (url ? '<p><a href="' + htmlKacis(url) + '">Etkinlik Yönetim Sistemini aç</a></p>' : '') +
    '<p style="color:#777;font-size:12px">' + APP.AD + ' — otomatik bildirim</p></div>';
  const posta = { to: liste, subject: '[Etkinlik] ' + konu, html };
  const gonder = kanal || varsayilanKanal();

  await db.islemSonrasi(async () => {
    try {
      await gonder(posta);
    } catch (e) {
      console.error(e);
      try { await db.logYaz('', etkinlikId, 'BILDIRIM_HATASI', konu + ' → ' + e.message); } catch (ignore) { /* yoksay */ }
    }
  });
}

async function etkinlikOzeti(e) {
  return '<b>' + htmlKacis(e.Ad) + '</b> · ' + e.Tarih + ' ' + e.BaslangicSaati + '–' + e.BitisSaati +
    ' · ' + htmlKacis(await mekanAdi(e.MekanID));
}

function htmlKacis(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function mekanAdi(mekanId) {
  const m = await db.bul(SAYFA.MEKANLAR, 'MekanID', mekanId);
  return m ? m.Ad : mekanId;
}

module.exports = { bildir, etkinlikOzeti, htmlKacis, mekanAdi, postaKanaliAyarla };
