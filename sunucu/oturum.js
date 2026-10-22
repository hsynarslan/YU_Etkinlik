/**
 * oturum.js — Giriş ve oturum çerezi.
 *
 * Canlıda: "Google ile giriş" (OpenID Connect). Yalnızca IZINLI_ALAN_ADI alanındaki, doğrulanmış
 * e-postalar kabul edilir; ayrıca kullanıcının Kullanicilar tablosunda tanımlı olması gerekir.
 * Yerelde: GELISTIRME_GIRISI=EVET ise listeden kullanıcı seçilerek girilir (Vercel'de asla açılmaz).
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

function googleAyarli() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function adres(req) {
  if (process.env.UYGULAMA_URL) return process.env.UYGULAMA_URL.replace(/\/+$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  return proto + '://' + req.headers.host;
}

/** Google yönlendirmesi için adres ve CSRF koruması (state) üretir. */
function googleBaslat(req, res, izinliAlan) {
  const state = crypto.randomBytes(16).toString('hex');
  cerezYaz(res, req, 'gstate', imzala({ s: state, son: Math.floor(Date.now() / 1000) + 600 }), 600);
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: adres(req) + '/giris/google/donus',
    response_type: 'code',
    scope: 'openid email',
    state,
    prompt: 'select_account'
  });
  if (izinliAlan) p.set('hd', izinliAlan);
  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + p.toString());
}

/** Google'dan dönen kodu doğrular, doğrulanmış e-postayı döndürür. */
async function googleDonus(req, res, izinliAlan) {
  const kayitli = dogrula(cerezOku(req, 'gstate'));
  cerezYaz(res, req, 'gstate', '', 0);
  if (!kayitli || !req.query.state || kayitli.s !== req.query.state) throw new Error('Giriş isteği geçersiz veya süresi dolmuş. Lütfen tekrar deneyin.');
  if (!req.query.code) throw new Error('Google girişi tamamlanmadı.');
  const yanit = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: String(req.query.code),
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: adres(req) + '/giris/google/donus',
      grant_type: 'authorization_code'
    })
  });
  if (!yanit.ok) throw new Error('Google girişi doğrulanamadı.');
  const { id_token: idToken } = await yanit.json();
  // Jeton, Google'dan doğrudan TLS üzerinden alındığı için imza ayrıca doğrulanmaz (OIDC §3.1.3.7).
  const yuk = JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString('utf8'));
  if (yuk.aud !== process.env.GOOGLE_CLIENT_ID || !/^https:\/\/accounts\.google\.com$|^accounts\.google\.com$/.test(yuk.iss)) {
    throw new Error('Google girişi doğrulanamadı.');
  }
  const eposta = String(yuk.email || '').toLowerCase();
  if (!eposta || yuk.email_verified !== true) throw new Error('Google hesabının e-postası doğrulanmamış.');
  if (izinliAlan && eposta.split('@')[1] !== izinliAlan) throw new Error('Yalnızca @' + izinliAlan + ' hesapları sisteme giriş yapabilir.');
  return eposta;
}

module.exports = {
  oturumAc, oturumKapat, oturumEposta, gelistirmeGirisiAcik, googleAyarli, googleBaslat, googleDonus,
  imzala, dogrula
};
