// Test ortamı: bellekte gerçek bir PostgreSQL (PGlite) ile sunucu kodunu uçtan uca çalıştırır.
const { PGlite } = require('@electric-sql/pglite');
const db = require('../sunucu/db');
const Logic = require('../sunucu/logic');
const bildirim = require('../sunucu/bildirim');
const { kurulum } = require('../sunucu/kurulum');
const { API } = require('../sunucu/uygulama');
const rezervasyon = require('../sunucu/rezervasyon');

const PDF = { ad: 'onay.pdf', mimeType: 'application/pdf', base64: Buffer.from('%PDF-1.4 deneme').toString('base64') };

async function ortam() {
  // TEST_DATABASE_URL verilirse gerçek bir PostgreSQL'e karşı çalışır (şema her seferinde sıfırlanır).
  let pg = null;
  if (process.env.TEST_DATABASE_URL) {
    const ad = db.pgAdaptor(process.env.TEST_DATABASE_URL);
    await ad.query('DROP SCHEMA public CASCADE');
    await ad.query('CREATE SCHEMA public');
    db.baglan(ad);
  } else {
    pg = new PGlite();
    db.baglan(db.pgliteAdaptor(pg));
  }
  const postalar = [];
  bildirim.postaKanaliAyarla(async (p) => { postalar.push(p); });
  await kurulum({ yonetici: 'kurucu@yasar.edu.tr' });

  const kullanicilar = [
    ['talep@yasar.edu.tr', 'Ayşe Talep', 'MUH', 'TALEP_EDEN', ''],
    ['talep2@yasar.edu.tr', 'Can Talep', 'IIBF', 'TALEP_EDEN', ''],
    ['onay@yasar.edu.tr', 'Oya Onay', 'MUH', 'BIRIM_ONAYCI', 'MUH'],
    ['bi@yasar.edu.tr', 'Bilgi İşlem', 'BILGI_ISLEM', 'HIZMET_BIRIMI', ''],
    ['ki@yasar.edu.tr', 'Kurumsal İletişim', 'KURUMSAL_ILETISIM', 'HIZMET_BIRIMI', ''],
    ['gs@yasar.edu.tr', 'Genel Sekreterlik', 'GENEL_SEKRETERLIK', 'EBYS_MUAF', '']
  ];
  for (const [Eposta, AdSoyad, Birim, Roller, OnayBirimleri] of kullanicilar) {
    await db.ekle('Kullanicilar', { Eposta, AdSoyad, Birim, Roller, OnayBirimleri, Aktif: 'EVET' });
  }
  await db.ekle('Mekanlar', { MekanID: 'KS', Ad: 'Konferans Salonu', Bina: 'A', Kapasite: '200', SorumluBirim: 'TEKNIK_ISLER', Aktif: 'EVET' });

  const bugun = db.bugun();
  const ileri = Logic.isGunuEkle(bugun, 15);
  let aktif = '';
  const giris = (eposta) => { aktif = eposta; };
  // c.api_xxx(...) → oturumdaki kullanıcıyla çağırır
  const c = new Proxy({}, { get: (_, ad) => (...args) => API[ad](aktif, ...args) });
  const etkinlik = (id) => db.bul('Etkinlikler', 'EtkinlikID', id);
  const kapat = async () => { bildirim.postaKanaliAyarla(null); await db.kapat(); };
  return { c, db, Logic, bugun, ileri, giris, etkinlik, postalar, kapat, rezervasyon, pg };
}

function talep(ileri, ek) {
  return Object.assign({ ad: 'Kariyer Günü', tur: 'Panel', mekanId: 'KS', tarih: ileri,
    baslangic: '10:00', bitis: '12:00', katilimciSayisi: '120', protokolDuzeyi: 'STANDART' }, ek);
}

module.exports = { ortam, talep, PDF };
