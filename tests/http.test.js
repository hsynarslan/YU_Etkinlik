// HTTP katmanı: giriş zorunluluğu, işlev izin listesi, oturum çerezi, cron anahtarı.
const test = require('node:test');
const assert = require('node:assert/strict');
const { ortam, talep } = require('./ortam');
const { uygulamaOlustur } = require('../sunucu/uygulama');
const oturum = require('../sunucu/oturum');

async function sunucu() {
  const o = await ortam();
  const srv = uygulamaOlustur().listen(0);
  const taban = 'http://127.0.0.1:' + srv.address().port;
  const kapat = async () => { await new Promise((r) => srv.close(r)); await o.kapat(); };
  return { o, taban, kapat };
}

const cerez = (eposta) => 'oturum=' + encodeURIComponent(oturum.imzala({ e: eposta, son: Math.floor(Date.now() / 1000) + 600 }));
const post = (taban, fn, args, eposta) => fetch(`${taban}/api/${fn}`, {
  method: 'POST', redirect: 'manual',
  headers: Object.assign({ 'Content-Type': 'application/json' }, eposta ? { Cookie: cerez(eposta) } : {}),
  body: JSON.stringify({ args })
});

test('oturumsuz istek reddedilir; ana sayfa giriş sayfasına yönlendirir', async () => {
  const { taban, kapat } = await sunucu();
  try {
    assert.equal((await post(taban, 'api_baslangic', [])).status, 401);
    const r = await fetch(taban + '/', { redirect: 'manual' });
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), '/giris');
    assert.equal((await fetch(taban + '/api/dosya/x')).status, 401);
  } finally { await kapat(); }
});

test('geçerli oturumla api çalışır; sahte veya bozuk çerez kabul edilmez', async () => {
  const { taban, kapat } = await sunucu();
  try {
    const r = await post(taban, 'api_baslangic', [], 'talep@yasar.edu.tr');
    const j = await r.json();
    assert.equal(j.ok, true);
    assert.equal(j.kullanici.eposta, 'talep@yasar.edu.tr');
    const sahte = await fetch(taban + '/api/api_baslangic', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 'oturum=' + Buffer.from('{"e":"kurucu@yasar.edu.tr","son":9999999999}').toString('base64url') + '.sahte' }, body: '{}' });
    assert.equal(sahte.status, 401);
    const eskimis = 'oturum=' + encodeURIComponent(oturum.imzala({ e: 'talep@yasar.edu.tr', son: 1 }));
    assert.equal((await fetch(taban + '/api/api_baslangic', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: eskimis }, body: '{}' })).status, 401);
  } finally { await kapat(); }
});

test('yalnızca izin listesindeki işlevler çağrılabilir', async () => {
  const { taban, kapat } = await sunucu();
  try {
    for (const ad of ['constructor', '__proto__', 'toString', 'gunlukSureKontrolu', 'kurulum', 'db_hepsi', 'api_yok']) {
      const r = await post(taban, ad, [], 'kurucu@yasar.edu.tr');
      assert.equal(r.status, 404, ad);
    }
  } finally { await kapat(); }
});

test('api, oturumdaki kullanıcıyla çalışır (istemci başka e-posta gönderemez)', async () => {
  const { o, taban, kapat } = await sunucu();
  try {
    // İlk argüman e-posta sanılıp ezilmemeli: talep eden kullanıcı yönetici işlemi yapamaz
    const r = await (await post(taban, 'api_durumDegistir', ['kurucu@yasar.edu.tr', 'X', 'IPTAL', 'deneme'], 'talep@yasar.edu.tr')).json();
    assert.equal(r.ok, false);
    const ok = await (await post(taban, 'api_onRezervasyonOlustur', [talep(o.ileri)], 'talep@yasar.edu.tr')).json();
    assert.equal(ok.ok, true, ok.mesaj);
    assert.equal(ok.etkinlik.SorumluEposta, 'talep@yasar.edu.tr');
  } finally { await kapat(); }
});

test('cron adresi yalnızca doğru anahtarla çalışır', async () => {
  const { taban, kapat } = await sunucu();
  const eski = process.env.CRON_SECRET;
  try {
    delete process.env.CRON_SECRET;
    assert.equal((await fetch(taban + '/api/cron/gunluk')).status, 401);
    assert.equal((await fetch(taban + '/api/cron/gunluk', { headers: { Authorization: 'Bearer ' } })).status, 401, 'boş anahtar kabul edilmez');
    process.env.CRON_SECRET = 'gizli-anahtar-123';
    assert.equal((await fetch(taban + '/api/cron/gunluk', { headers: { Authorization: 'Bearer yanlis' } })).status, 401);
    const r = await fetch(taban + '/api/cron/gunluk', { headers: { Authorization: 'Bearer gizli-anahtar-123' } });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).ok, true);
  } finally {
    if (eski === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = eski;
    await kapat();
  }
});

test('geliştirme girişi yalnızca açıkça etkinleştirilince ve Vercel dışında çalışır', async () => {
  const { taban, kapat } = await sunucu();
  const eski = { g: process.env.GELISTIRME_GIRISI, v: process.env.VERCEL };
  try {
    delete process.env.GELISTIRME_GIRISI; delete process.env.VERCEL;
    assert.equal((await fetch(taban + '/giris/gelistirme?eposta=kurucu@yasar.edu.tr', { redirect: 'manual' })).status, 404);
    process.env.GELISTIRME_GIRISI = 'EVET';
    const r = await fetch(taban + '/giris/gelistirme?eposta=talep@yasar.edu.tr', { redirect: 'manual' });
    assert.equal(r.status, 302);
    assert.match(r.headers.get('set-cookie'), /oturum=/);
    assert.match(r.headers.get('set-cookie'), /HttpOnly/);
    assert.equal((await fetch(taban + '/giris/gelistirme?eposta=yok@yasar.edu.tr', { redirect: 'manual' })).status, 200, 'tanımsız kullanıcıya oturum verilmez');
    process.env.VERCEL = '1';
    assert.equal((await fetch(taban + '/giris/gelistirme?eposta=talep@yasar.edu.tr', { redirect: 'manual' })).status, 404, 'Vercel üzerinde kapalı');
  } finally {
    if (eski.g === undefined) delete process.env.GELISTIRME_GIRISI; else process.env.GELISTIRME_GIRISI = eski.g;
    if (eski.v === undefined) delete process.env.VERCEL; else process.env.VERCEL = eski.v;
    await kapat();
  }
});

test('ana sayfa oturumlu kullanıcıya arayüzü verir', async () => {
  const { taban, kapat } = await sunucu();
  try {
    const r = await fetch(taban + '/', { headers: { Cookie: cerez('talep@yasar.edu.tr') } });
    const html = await r.text();
    assert.equal(r.status, 200);
    assert.match(html, /Etkinlik Yönetim Sistemi/);
    assert.ok(!html.includes('{{'), 'şablon yer tutucuları doldurulmalı');
    assert.ok(!/google\.script/.test(html));
  } finally { await kapat(); }
});

test('giriş formu: doğru şifre oturum çerezi verir, yanlış şifre girişe döner', async () => {
  const sifre = require('../sunucu/sifre');
  const { o, taban, kapat } = await sunucu();
  try {
    await sifre.sifreBelirle('talep@yasar.edu.tr', 'GucluSifre123');
    const gonder = (eposta, s) => fetch(taban + '/giris', {
      method: 'POST', redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ eposta, sifre: s }).toString()
    });
    const kotu = await gonder('talep@yasar.edu.tr', 'yanlis');
    assert.equal(kotu.status, 303);
    assert.match(decodeURIComponent(kotu.headers.get('location')), /^\/giris\?hata=E-posta veya şifre hatalı/);
    assert.equal(kotu.headers.get('set-cookie'), null);

    const iyi = await gonder('talep@yasar.edu.tr', 'GucluSifre123');
    assert.equal(iyi.status, 303);
    assert.equal(iyi.headers.get('location'), '/');
    const ck = iyi.headers.get('set-cookie');
    assert.match(ck, /HttpOnly/);
    assert.match(ck, /SameSite=Lax/);
    const j = await (await fetch(taban + '/api/api_baslangic', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: ck.split(';')[0] }, body: '{}' })).json();
    assert.equal(j.ok, true);
    assert.equal(j.kullanici.eposta, 'talep@yasar.edu.tr');

    const sayfa = await (await fetch(taban + '/giris')).text();
    assert.match(sayfa, /name="sifre" type="password"/);
    assert.ok(!/google/i.test(sayfa));
    assert.ok(o);
  } finally { await kapat(); }
});
