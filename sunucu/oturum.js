/**
 * oturum.js — Oturum çerezi.
 *
 * Giriş e-posta + şifre ile yapılır (bkz. sifre.js); başarılı girişte bu dosyadaki oturumAc() çerezi verir.
 * Yerelde: GELISTIRME_GIRISI=EVET ise şifresiz, listeden kullanıcı seçilerek girilir (Vercel'de asla açılmaz).
 *
 * Oturum, HMAC ile imzalanmış bir çerezdir (OTURUM_SIRRI ile). Sunucuda oturum verisi tutulmaz.
 */
const crypto = require('crypto');

const OTURUM_SURESI_SN = 12 * 60 * 60;
const CEREZ = 'oturum';

function sir() {
  const s = process.env.OTURUM_SIRRI;
  if (s && s.length >= 16) return s;
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    throw new Error('OTURUM_SIRRI tanımlı değil (en az 16 karakter). Bkz. docs/kurulum.md.');
  }
  return 'yerel-gelistirme-sirri-degistirin';
}

const b64 = (b) => Buffer.from(b).toString('base64url');
const imza = (veri) => crypto.createHmac('sha256', sir()).update(veri).digest('base64url');

function imzala(nesne) {
  const veri = b64(JSON.stringify(nesne));
  return veri + '.' + imza(veri);
}

function dogrula(deger) {
  if (!deger || deger.indexOf('.') === -1) return null;
  const [veri, im] = deger.split('.');
  const beklenen = imza(veri);
  const a = Buffer.from(im), b = Buffer.from(beklenen);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const o = JSON.parse(Buffer.from(veri, 'base64url').toString('utf8'));
    return o && o.son > Date.now() / 1000 ? o : null;
  } catch (e) { return null; }
}

function cerezOku(req, ad) {
  const h = req.headers.cookie || '';
  for (const parca of h.split(/;\s*/)) {
    const i = parca.indexOf('=');
    if (i > 0 && parca.slice(0, i) === ad) return decodeURIComponent(parca.slice(i + 1));
  }
  return '';
}

function guvenliMi(req) {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

function cerezYaz(res, req, ad, deger, sure) {
  res.append('Set-Cookie', `${ad}=${encodeURIComponent(deger)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sure}${guvenliMi(req) ? '; Secure' : ''}`);
}

function oturumAc(req, res, eposta) {
  cerezYaz(res, req, CEREZ, imzala({ e: String(eposta).toLowerCase(), son: Math.floor(Date.now() / 1000) + OTURUM_SURESI_SN }), OTURUM_SURESI_SN);
}

function oturumKapat(req, res) {
  cerezYaz(res, req, CEREZ, '', 0);
}

/** İstekteki oturumun e-postasını döndürür (yoksa ''). */
function oturumEposta(req) {
  const o = dogrula(cerezOku(req, CEREZ));
  return o ? o.e : '';
}

function gelistirmeGirisiAcik() {
  return process.env.GELISTIRME_GIRISI === 'EVET' && !process.env.VERCEL;
}

module.exports = { oturumAc, oturumKapat, oturumEposta, gelistirmeGirisiAcik, imzala, dogrula };
