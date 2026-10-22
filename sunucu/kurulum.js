/**
 * kurulum.js — Kurulum ve bakım. `npm run kurulum` ile çalıştırılır.
 *
 * kurulum()            : Tabloları, ayarları, hizmet birimlerini ve ilk yöneticiyi hazırlar.
 *                        Tekrar çalıştırmak güvenlidir; var olanı silmez, eksikleri tamamlar.
 * ornekVerileriYukle() : Boş Mekanlar/Birimler tablolarına deneme verisi ekler.
 */
const Logic = require('./logic');
const { SAYFA, VARSAYILAN_AYARLAR } = require('./config');
const db = require('./db');

async function kurulum(opts) {
  opts = opts || {};
  await db.semaHazirla();
  await db.kilitle(async () => {
    await ayarlariTamamla();
    await hizmetBirimleriniTohumla();
    await ilkYoneticiyiEkle(opts.yonetici || process.env.ILK_YONETICI_EPOSTA);
  });
}

async function ayarlariTamamla() {
  const mevcut = (await db.hepsi(SAYFA.AYARLAR)).map((k) => k.Anahtar);
  for (const a of VARSAYILAN_AYARLAR) {
    if (mevcut.indexOf(a[0]) === -1) await db.ekle(SAYFA.AYARLAR, { Anahtar: a[0], Deger: a[1], Aciklama: a[2] });
  }
}

async function hizmetBirimleriniTohumla() {
  if ((await db.hepsi(SAYFA.BIRIMLER)).length) return;
  const adlar = {
    KURUMSAL_ILETISIM: 'Kurumsal İletişim',
    BILGI_ISLEM: 'Bilgi İşlem / Görsel-İşitsel',
    TEKNIK_ISLER: 'Yapı ve Teknik İşler',
    IDARI_ISLER: 'İdari İşler',
    GUVENLIK: 'Güvenlik',
    PROTOKOL: 'Rektörlük Protokol'
  };
  for (const kod of Object.keys(Logic.HIZMET_BIRIMLERI)) {
    await db.ekle(SAYFA.BIRIMLER, { BirimID: kod, Ad: adlar[kod] || kod, Tur: 'HIZMET', Eposta: '' });
  }
}

async function ilkYoneticiyiEkle(eposta) {
  if ((await db.hepsi(SAYFA.KULLANICILAR)).length) return;
  eposta = String(eposta || '').toLowerCase().trim();
  if (!eposta) return;
  await db.ekle(SAYFA.KULLANICILAR, {
    Eposta: eposta, AdSoyad: 'Sistem Yöneticisi', Birim: 'YONETIM',
    Roller: 'YONETICI', OnayBirimleri: '', Aktif: 'EVET'
  });
}

/** Deneme için örnek mekân ve akademik birim ekler. Gerçek verileri girince bu kayıtları silin. */
async function ornekVerileriYukle() {
  await db.kilitle(async () => {
    if (!(await db.hepsi(SAYFA.MEKANLAR)).length) {
      for (const m of [
        ['ORNEK-KS', 'ÖRNEK Konferans Salonu', 'ÖRNEK Bina', '300'],
        ['ORNEK-SEM1', 'ÖRNEK Seminer Odası 1', 'ÖRNEK Bina', '60'],
        ['ORNEK-FUAYE', 'ÖRNEK Fuaye Alanı', 'ÖRNEK Bina', '150']
      ]) {
        await db.ekle(SAYFA.MEKANLAR, { MekanID: m[0], Ad: m[1], Bina: m[2], Kapasite: m[3], SorumluBirim: 'TEKNIK_ISLER', Aktif: 'EVET' });
      }
    }
    const birimler = (await db.hepsi(SAYFA.BIRIMLER)).map((b) => b.BirimID);
    if (birimler.indexOf('ORNEK_FAKULTE') === -1) {
      await db.ekle(SAYFA.BIRIMLER, { BirimID: 'ORNEK_FAKULTE', Ad: 'ÖRNEK Fakülte', Tur: 'AKADEMIK', Eposta: '' });
    }
  });
}

module.exports = { kurulum, ornekVerileriYukle };
