/**
 * uygulama.js — Express uygulaması (Vercel'de sunucusuz işlev, yerelde normal sunucu).
 *
 * Adresler:
 *   GET  /                        arayüz (oturum yoksa giriş sayfası)
 *   GET  /giris, POST /giris        e-posta + şifre ile giriş
 *   GET  /giris/gelistirme, /cikis  (geliştirme girişi yalnızca yerelde)
 *   GET/POST /kurulum             ilk kurulum sayfası (KURULUM_ANAHTARI ile; tablolar + ilk yönetici)
 *   POST /api/:fonksiyon          { args: [...] } → api_* fonksiyonları (oturumdaki kullanıcıyla)
 *   GET  /api/dosya/:id           EBYS onay yazısı (yetkili kullanıcılara)
 *   GET  /api/cron/gunluk         gece görevi (Vercel Cron, CRON_SECRET ile)
 *   GET  /saglik                  çalışıyor mu kontrolü
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const db = require('./db');
const oturum = require('./oturum');
const { SAYFA } = require('./config');
const kurulumIslemleri = require('./kurulum');
const sifre = require('./sifre');
const hesap = require('./hesap');
const yonetim = require('./yonetim');

const rezervasyon = require('./rezervasyon');
const ebys = require('./ebys');
const etkinlik = require('./etkinlik');
const apiBaslangic = require('./api');

/** İstemciden çağrılabilen tek tek izin verilen fonksiyonlar (başka hiçbir şey çağrılamaz). */
const API = Object.assign({},
  { api_baslangic: apiBaslangic.api_baslangic },
  pick(rezervasyon, ['api_onRezervasyonOlustur', 'api_uzat', 'api_iptal']),
  pick(ebys, ['api_ebysGonder', 'api_ebysKarar', 'api_ebysSonradanBagla']),
  pick(etkinlik, ['api_detayKaydet', 'api_gorevGuncelle', 'api_durumDegistir']),
  pick(hesap, ['api_sifreDegistir']),
  pick(yonetim, ['api_yonetimVeri', 'api_kullaniciKaydet', 'api_sifreBelirle', 'api_mekanKaydet', 'api_birimKaydet', 'api_ayarKaydet'])
);

function pick(nesne, anahtarlar) {
  const o = {};
  anahtarlar.forEach((a) => { o[a] = nesne[a]; });
  return o;
}

const arayuzKlasoru = path.join(__dirname, 'arayuz');
let sayfaOnbellek = null;
function anaSayfa() {
  if (sayfaOnbellek) return sayfaOnbellek;
  const oku = (f) => fs.readFileSync(path.join(arayuzKlasoru, f), 'utf8');
  sayfaOnbellek = oku('index.html')
    .replace('{{STIL}}', () => oku('stil.html'))
    .replace('{{UYGULAMA}}', () => oku('uygulama.html'));
  return sayfaOnbellek;
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function girisSayfasi(mesaj) {
  const stil = fs.readFileSync(path.join(arayuzKlasoru, 'stil.html'), 'utf8');
  const gelistirme = oturum.gelistirmeGirisiAcik();
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Giriş — Etkinlik Yönetim Sistemi</title>${stil}</head><body>
<header class="ust"><div class="marka"><span class="marka-ad">Etkinlik Yönetim Sistemi</span><span class="marka-alt">Yaşar Üniversitesi</span></div></header>
<main class="icerik" style="max-width:420px">
${mesaj ? `<div class="hata-kutu">${esc(mesaj)}</div>` : ''}
<form method="post" action="/giris" class="kart" style="padding:20px">
  <h2>Giriş</h2>
  <label>E-posta<input name="eposta" type="email" autocomplete="username" required autofocus></label>
  <label>Şifre<input name="sifre" type="password" autocomplete="current-password" required></label>
  <div class="eylemler"><button class="btn" type="submit">Giriş yap</button></div>
  <p class="meta">Hesabınız yoksa veya şifrenizi unuttuysanız sistem yöneticisine başvurun.</p>
</form>
${gelistirme ? '<p><a href="/giris/gelistirme">Geliştirme girişi (yalnızca yerel)</a></p>' : ''}
</main></body></html>`;
}

function uygulamaOlustur() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
      'Cache-Control': 'no-store'
    });
    next();
  });

  app.get('/saglik', (req, res) => res.json({ ok: true }));

  // --- Giriş ---------------------------------------------------------------
  app.get('/giris', (req, res) => res.type('html').send(girisSayfasi(req.query.hata)));

  app.post('/giris', express.urlencoded({ extended: false, limit: '10kb' }), async (req, res) => {
    try {
      const eposta = await sifre.girisYap(req.body && req.body.eposta, req.body && req.body.sifre);
      oturum.oturumAc(req, res, eposta);
      res.redirect(303, '/');
    } catch (e) {
      const kurulmamis = e && e.code === '42P01'; // tablo yok
      res.redirect(303, '/giris?hata=' + encodeURIComponent(kurulmamis ? 'Sistem henüz kurulmamış. /kurulum sayfasını açın.' : e.message));
    }
  });

  // --- İlk kurulum -----------------------------------------------------------
  const kurulumAnahtari = () => process.env.KURULUM_ANAHTARI || '';
  const kurulumSayfasi = (govde) => {
    const stil = fs.readFileSync(path.join(arayuzKlasoru, 'stil.html'), 'utf8');
    return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Kurulum</title>${stil}</head><body>
<header class="ust"><div class="marka"><span class="marka-ad">Etkinlik Yönetim Sistemi</span><span class="marka-alt">İlk kurulum</span></div></header>
<main class="icerik" style="max-width:480px">${govde}</main></body></html>`;
  };

  app.get('/kurulum', (req, res) => {
    if (kurulumAnahtari().length < 16) {
      return res.status(404).type('html').send(kurulumSayfasi('<div class="hata-kutu">KURULUM_ANAHTARI tanımlı değil veya 16 karakterden kısa. Vercel ayarlarına ekleyip yeniden dağıtın (bkz. docs/kurulum.md).</div>'));
    }
    res.type('html').send(kurulumSayfasi(`<form method="post" action="/kurulum" class="kart" style="padding:20px">
  <h2>İlk kurulum</h2>
  <p class="meta">Veritabanı tablolarını ve varsayılan ayarları hazırlar, ilk yöneticiyi oluşturur. Tekrar çalıştırmak güvenlidir; var olan veriye dokunmaz.</p>
  <label>Kurulum anahtarı (Vercel'deki KURULUM_ANAHTARI)<input name="anahtar" type="password" autocomplete="off" required></label>
  <label>İlk yöneticinin e-postası<input name="eposta" type="email" autocomplete="off" required></label>
  <label style="display:flex;flex-direction:row;gap:8px;align-items:center"><input name="ornek" type="checkbox" value="evet" style="width:auto"> Deneme için örnek mekân ve birim ekle</label>
  <div class="eylemler"><button class="btn" type="submit">Kurulumu çalıştır</button></div>
</form>`));
  });

  app.post('/kurulum', express.urlencoded({ extended: false, limit: '10kb' }), async (req, res) => {
    const beklenen = kurulumAnahtari();
    const gelen = String((req.body && req.body.anahtar) || '');
    const esit = beklenen.length >= 16 && gelen.length === beklenen.length && crypto.timingSafeEqual(Buffer.from(gelen), Buffer.from(beklenen));
    if (!esit) return res.status(403).type('html').send(kurulumSayfasi('<div class="hata-kutu">Kurulum anahtarı hatalı.</div><p><a href="/kurulum">Geri dön</a></p>'));
    try {
      const yonetici = await kurulumIslemleri.kurulum({ yonetici: req.body.eposta });
      if (req.body.ornek === 'evet') await kurulumIslemleri.ornekVerileriYukle();
      res.type('html').send(kurulumSayfasi(`<div class="kart" style="padding:20px"><h2>Kurulum tamam</h2>
${yonetici
    ? `<p>İlk yönetici oluşturuldu:</p><p><b>${esc(yonetici.eposta)}</b><br>Şifre: <b style="font-family:monospace;font-size:18px">${esc(yonetici.sifre)}</b></p><div class="uyari-kutu">Bu şifre yalnızca şimdi gösterilir. Not alın, girişte <b>Hesabım</b> sekmesinden değiştirin.</div>`
    : '<p>Tablolar güncel. Sistemde zaten kullanıcı tanımlı olduğu için yeni yönetici eklenmedi.</p>'}
<p><a href="/giris">Giriş sayfasına git</a></p></div>`));
    } catch (e) {
      console.error(e);
      res.status(500).type('html').send(kurulumSayfasi(`<div class="hata-kutu">Kurulum başarısız: ${esc(e.message)}</div><p><a href="/kurulum">Geri dön</a></p>`));
    }
  });

  app.get('/giris/gelistirme', async (req, res) => {
    if (!oturum.gelistirmeGirisiAcik()) return res.status(404).type('text').send('Bulunamadı');
    const eposta = String(req.query.eposta || '').toLowerCase();
    const kullanicilar = (await db.hepsi(SAYFA.KULLANICILAR)).filter((k) => String(k.Aktif).toUpperCase() !== 'HAYIR');
    if (eposta && kullanicilar.some((k) => String(k.Eposta).toLowerCase() === eposta)) {
      oturum.oturumAc(req, res, eposta);
      return res.redirect('/');
    }
    const stil = fs.readFileSync(path.join(arayuzKlasoru, 'stil.html'), 'utf8');
    res.type('html').send(`<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Geliştirme girişi</title>${stil}</head><body>
<main class="icerik" style="max-width:520px"><h2>Geliştirme girişi</h2><p class="meta">Yalnızca yerelde açıktır. Kullanıcı seçin:</p>
<ul>${kullanicilar.map((k) => `<li><a href="/giris/gelistirme?eposta=${encodeURIComponent(k.Eposta)}">${esc(k.AdSoyad)} — ${esc(k.Eposta)} <span class="meta">(${esc(k.Roller)})</span></a></li>`).join('')}</ul></main></body></html>`);
  });

  app.get('/cikis', (req, res) => { oturum.oturumKapat(req, res); res.redirect('/giris'); });

  // --- Arayüz --------------------------------------------------------------
  app.get('/', (req, res) => {
    if (!oturum.oturumEposta(req)) return res.redirect('/giris');
    res.type('html').send(anaSayfa());
  });

  // --- API -----------------------------------------------------------------
  app.get('/api/cron/gunluk', async (req, res) => {
    const gizli = process.env.CRON_SECRET || '';
    const gelen = String(req.headers.authorization || '');
    const beklenen = 'Bearer ' + gizli;
    const esit = gizli && gelen.length === beklenen.length && crypto.timingSafeEqual(Buffer.from(gelen), Buffer.from(beklenen));
    if (!esit) return res.status(401).json({ ok: false, mesaj: 'Yetkisiz.' });
    try {
      res.json({ ok: true, sonuc: await rezervasyon.gunlukSureKontrolu() });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, mesaj: e.message });
    }
  });

  app.get('/api/dosya/:id', async (req, res) => {
    const eposta = oturum.oturumEposta(req);
    if (!eposta) return res.status(401).type('text').send('Oturum yok.');
    try {
      const d = await ebys.dosyaGetir(eposta, req.params.id);
      res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${d.ad}"` });
      res.send(d.icerik);
    } catch (e) {
      res.status(403).type('text').send(e.message);
    }
  });

  app.post('/api/:fn', express.json({ limit: '4mb' }), async (req, res) => {
    const eposta = oturum.oturumEposta(req);
    if (!eposta) return res.status(401).json({ ok: false, mesaj: 'Oturum bulunamadı. Lütfen yeniden giriş yapın.' });
    if (!Object.prototype.hasOwnProperty.call(API, req.params.fn)) return res.status(404).json({ ok: false, mesaj: 'Böyle bir işlem yok.' });
    const args = Array.isArray(req.body && req.body.args) ? req.body.args : [];
    res.json(await API[req.params.fn](eposta, ...args));
  });

  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    const buyuk = err && err.type === 'entity.too.large';
    res.status(buyuk ? 413 : 400).json({ ok: false, mesaj: buyuk ? 'Gönderilen veri çok büyük (PDF en fazla 3 MB olabilir).' : 'Geçersiz istek.' });
  });

  return app;
}

module.exports = { uygulamaOlustur, API };
