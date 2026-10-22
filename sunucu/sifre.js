/**
 * sifre.js — Şifre üretme, doğrulama ve hatalı giriş kilidi.
 *
 * Şifreler scrypt ile tuzlanıp özetlenir (`scrypt$tuz$özet`); düz şifre hiçbir yerde saklanmaz.
 * 5 hatalı denemeden sonra hesap 15 dakika kilitlenir (sayaç ve kilit Kullanicilar tablosunda tutulur).
 */
const crypto = require('crypto');
const { SAYFA } = require('./config');
const db = require('./db');

const EN_AZ_UZUNLUK = 8;
const EN_COK_DENEME = 5;
const KILIT_DAKIKA = 15;
const GENEL_HATA = 'E-posta veya şifre hatalı.';
const KILIT_HATASI = 'Çok fazla hatalı deneme. ' + KILIT_DAKIKA + ' dakika sonra tekrar deneyin.';
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function ozetle(sifre) {
  const tuz = crypto.randomBytes(16);
  const ozet = crypto.scryptSync(String(sifre), tuz, 32, SCRYPT);
  return 'scrypt$' + tuz.toString('base64') + '$' + ozet.toString('base64');
}

function ozetDogrula(sifre, kayitli) {
  const p = String(kayitli || '').split('$');
  if (p.length !== 3 || p[0] !== 'scrypt') return false;
  const tuz = Buffer.from(p[1], 'base64');
  const beklenen = Buffer.from(p[2], 'base64');
  const ozet = crypto.scryptSync(String(sifre), tuz, beklenen.length, SCRYPT);
  return crypto.timingSafeEqual(ozet, beklenen);
}

/** Şifre kuralı: en az 8 karakter. Hata mesajı döndürür (geçerliyse ''). */
function kuralHatasi(sifre) {
  const s = String(sifre || '');
  if (s.length < EN_AZ_UZUNLUK) return 'Şifre en az ' + EN_AZ_UZUNLUK + ' karakter olmalıdır.';
  if (s.length > 200) return 'Şifre çok uzun.';
  return '';
}

/** Karışabilecek karakterler (0/O, 1/l/I) olmadan rastgele şifre. */
function rastgele(uzunluk) {
  const alfabe = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < (uzunluk || 12); i++) s += alfabe[crypto.randomInt(alfabe.length)];
  return s;
}

const SAHTE_OZET = ozetle('sahte-sifre-zamanlama-icin');

/**
 * E-posta ve şifreyi doğrular; başarılıysa e-postayı döndürür, değilse hata fırlatır.
 * Kullanıcı yoksa da aynı süreyi harcar ve aynı mesajı verir (kullanıcı varlığı sızmasın).
 */
async function girisYap(eposta, sifre) {
  eposta = String(eposta || '').toLowerCase().trim();
  sifre = String(sifre || '');
  // Hata, işlem BİTTİKTEN sonra fırlatılır: kilitle() içinde fırlatılırsa sayaç güncellemesi geri alınır.
  const sonuc = await db.kilitle(async () => {
    const k = eposta ? await db.bul(SAYFA.KULLANICILAR, 'Eposta', eposta) : null;
    const aktif = k && String(k.Aktif).toUpperCase() !== 'HAYIR' && k.SifreHash;
    if (!aktif) {
      ozetDogrula(sifre, SAHTE_OZET);
      return { hata: GENEL_HATA };
    }
    if (Number(k.KilitBitis || 0) > db.simdiMs()) return { hata: KILIT_HATASI };
    if (!ozetDogrula(sifre, k.SifreHash)) {
      const deneme = Number(k.BasarisizDeneme || 0) + 1;
      if (deneme >= EN_COK_DENEME) {
        await db.guncelle(SAYFA.KULLANICILAR, 'Eposta', eposta, { BasarisizDeneme: '0', KilitBitis: String(db.simdiMs() + KILIT_DAKIKA * 60000) });
        await db.logYaz('sistem', '', 'HESAP_KILITLENDI', eposta);
        return { hata: KILIT_HATASI };
      }
      await db.guncelle(SAYFA.KULLANICILAR, 'Eposta', eposta, { BasarisizDeneme: String(deneme) });
      return { hata: GENEL_HATA };
    }
    if (Number(k.BasarisizDeneme || 0) > 0 || k.KilitBitis) {
      await db.guncelle(SAYFA.KULLANICILAR, 'Eposta', eposta, { BasarisizDeneme: '0', KilitBitis: '' });
    }
    return { eposta };
  });
  if (sonuc.hata) throw new Error(sonuc.hata);
  return sonuc.eposta;
}

/** Yönetici işlemi (komut satırı): kullanıcının şifresini belirler, kilidi açar. */
async function sifreBelirle(eposta, sifre) {
  const hata = kuralHatasi(sifre);
  if (hata) throw new Error(hata);
  eposta = String(eposta || '').toLowerCase().trim();
  return db.kilitle(async () => {
    if (!(await db.bul(SAYFA.KULLANICILAR, 'Eposta', eposta))) throw new Error('Kullanıcı bulunamadı: ' + eposta);
    await db.guncelle(SAYFA.KULLANICILAR, 'Eposta', eposta, { SifreHash: ozetle(sifre), BasarisizDeneme: '0', KilitBitis: '' });
    await db.logYaz('sistem', '', 'SIFRE_BELIRLENDI', eposta);
  });
}

/** Şifresi olmayan her aktif kullanıcıya rastgele şifre verir; [{ eposta, sifre }] döndürür. */
async function eksikSifreleriUret() {
  return db.kilitle(async () => {
    const sonuc = [];
    for (const k of await db.hepsi(SAYFA.KULLANICILAR)) {
      if (k.SifreHash || String(k.Aktif).toUpperCase() === 'HAYIR') continue;
      const sifre = rastgele(12);
      await db.guncelle(SAYFA.KULLANICILAR, 'Eposta', k.Eposta, { SifreHash: ozetle(sifre) });
      await db.logYaz('sistem', '', 'SIFRE_BELIRLENDI', k.Eposta);
      sonuc.push({ eposta: k.Eposta, sifre });
    }
    return sonuc;
  });
}

module.exports = { ozetle, ozetDogrula, kuralHatasi, rastgele, girisYap, sifreBelirle, eksikSifreleriUret, GENEL_HATA };
