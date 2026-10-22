/**
 * ortak.js — API fonksiyonlarının ortak yardımcıları.
 */
const Logic = require('./logic');
const { mekanAdi } = require('./bildirim');

/**
 * Tüm api_* fonksiyonlarının ortak hata sarmalayıcısı.
 * { ok: true, ... } ya da { ok: false, mesaj } döndürür.
 */
async function api(fn) {
  try {
    const sonuc = (await fn()) || {};
    sonuc.ok = true;
    return sonuc;
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return { ok: false, mesaj: (err && err.message) || String(err) };
  }
}

/** İstemciye gönderilecek etkinlik nesnesi (iç alanlar temizlenir, Detay çözülür). */
function istemciEtkinlik(e, mekanlar) {
  const o = {};
  Object.keys(e).forEach((k) => { if (k.charAt(0) !== '_') o[k] = e[k]; });
  try { o.Detay = e.Detay ? JSON.parse(e.Detay) : null; } catch (ignore) { o.Detay = null; }
  o.DurumEtiket = Logic.DURUM_ETIKET[e.Durum] || e.Durum;
  o.MekanAd = mekanlar && mekanlar[e.MekanID] ? mekanlar[e.MekanID] : e.MekanID;
  return o;
}

/** Tek bir etkinliği istemci biçimine çevirir (mekân adını veritabanından alır). */
async function istemciEtkinlikTek(e) {
  return istemciEtkinlik(e, { [e.MekanID]: await mekanAdi(e.MekanID) });
}

module.exports = { api, istemciEtkinlik, istemciEtkinlikTek };
