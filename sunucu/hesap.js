/**
 * hesap.js — Kullanıcının kendi hesabı: şifre değiştirme.
 */
const { SAYFA } = require('./config');
const db = require('./db');
const { aktifKullanici } = require('./auth');
const { api } = require('./ortak');
const sifre = require('./sifre');

function api_sifreDegistir(eposta, eski, yeni) {
  return api(() => db.kilitle(async () => {
    const k = await aktifKullanici(eposta);
    const kayit = await db.bul(SAYFA.KULLANICILAR, 'Eposta', k.eposta);
    if (!kayit.SifreHash || !sifre.ozetDogrula(String(eski || ''), kayit.SifreHash)) throw new Error('Mevcut şifre hatalı.');
    const hata = sifre.kuralHatasi(yeni);
    if (hata) throw new Error(hata);
    if (String(yeni) === String(eski)) throw new Error('Yeni şifre eskisinden farklı olmalıdır.');
    await db.guncelle(SAYFA.KULLANICILAR, 'Eposta', k.eposta, { SifreHash: sifre.ozetle(yeni) });
    await db.logYaz(k.eposta, '', 'SIFRE_DEGISTI', '');
    return { mesaj: 'Şifreniz değiştirildi.' };
  }));
}

module.exports = { api_sifreDegistir };
