/**
 * yonetim.js — Yönetim ekranı: kullanıcı, mekân, birim ve ayar düzenleme (yalnızca YONETICI).
 * Doğrulama kuralları logic.js'tedir; burada yalnızca okuma/yazma ve yetki vardır.
 */
const Logic = require('./logic');
const { SAYFA, VARSAYILAN_AYARLAR } = require('./config');
const db = require('./db');
const { aktifKullanici } = require('./auth');
const { api } = require('./ortak');
const sifre = require('./sifre');

async function yoneticiGerekli(eposta) {
  const k = await aktifKullanici(eposta);
  if (!Logic.rolVar(k, Logic.ROLLER.YONETICI)) throw new Error('Bu işlem yalnızca yöneticiler içindir.');
  return k;
}

async function birimKodlari() {
  return (await db.hepsi(SAYFA.BIRIMLER)).map((b) => b.BirimID);
}

function yoneticiMi(k) { return Logic.listeAyristir(k.Roller).indexOf(Logic.ROLLER.YONETICI) !== -1 && String(k.Aktif).toUpperCase() !== 'HAYIR'; }

function api_yonetimVeri(eposta) {
  return api(async () => {
    await yoneticiGerekli(eposta);
    const simdi = db.simdiMs();
    const ayarlar = await db.hepsi(SAYFA.AYARLAR);
    return {
      kullanicilar: (await db.hepsi(SAYFA.KULLANICILAR)).map((k) => ({
        Eposta: k.Eposta, AdSoyad: k.AdSoyad, Birim: k.Birim, Roller: Logic.listeAyristir(k.Roller),
        OnayBirimleri: Logic.listeAyristir(k.OnayBirimleri), Aktif: k.Aktif,
        sifreVar: !!k.SifreHash, kilitli: Number(k.KilitBitis || 0) > simdi
      })),
      mekanlar: (await db.hepsi(SAYFA.MEKANLAR)).map((m) => ({ MekanID: m.MekanID, Ad: m.Ad, Bina: m.Bina, Kapasite: m.Kapasite, SorumluBirim: m.SorumluBirim, Aktif: m.Aktif })),
      birimler: (await db.hepsi(SAYFA.BIRIMLER)).map((b) => ({ BirimID: b.BirimID, Ad: b.Ad, Tur: b.Tur, Eposta: b.Eposta })),
      ayarlar: VARSAYILAN_AYARLAR.map((a) => {
        const kayit = ayarlar.filter((x) => x.Anahtar === a[0])[0];
        return { Anahtar: a[0], Deger: kayit && kayit.Deger !== '' ? kayit.Deger : a[1], Aciklama: a[2] };
      }),
      roller: Object.keys(Logic.ROLLER),
      hizmetBirimleri: Object.keys(Logic.HIZMET_BIRIMLERI)
    };
  });
}

function api_kullaniciKaydet(eposta, form) {
  return api(() => db.kilitle(async () => {
    const y = await yoneticiGerekli(eposta);
    const { hatalar, kayit } = Logic.kullaniciDogrula(form, { birimler: await birimKodlari() });
    if (hatalar.length) throw new Error(hatalar.join(' '));

    const mevcut = await db.bul(SAYFA.KULLANICILAR, 'Eposta', kayit.Eposta);
    const yoneticiOlacak = Logic.listeAyristir(kayit.Roller).indexOf(Logic.ROLLER.YONETICI) !== -1 && kayit.Aktif !== 'HAYIR';
    if (kayit.Eposta === y.eposta && !yoneticiOlacak) throw new Error('Kendi yönetici yetkinizi veya hesabınızı kapatamazsınız.');
    if (mevcut && yoneticiMi(mevcut) && !yoneticiOlacak) {
      const digerleri = (await db.hepsi(SAYFA.KULLANICILAR)).filter((k) => k.Eposta !== mevcut.Eposta && yoneticiMi(k));
      if (!digerleri.length) throw new Error('Sistemde en az bir aktif yönetici kalmalıdır.');
    }
    if (mevcut) await db.guncelle(SAYFA.KULLANICILAR, 'Eposta', kayit.Eposta, kayit);
    else await db.ekle(SAYFA.KULLANICILAR, kayit);
    await db.logYaz(y.eposta, '', mevcut ? 'YONETIM_KULLANICI_GUNCELLENDI' : 'YONETIM_KULLANICI_EKLENDI', kayit.Eposta + ' · ' + kayit.Roller + ' · ' + kayit.Aktif);
    return { mesaj: mevcut ? 'Kullanıcı güncellendi.' : 'Kullanıcı eklendi.', yeni: !mevcut, eposta: kayit.Eposta };
  }));
}

/** sifreMetni boşsa rastgele şifre üretilir ve yanıtta bir kez döndürülür. */
function api_sifreBelirle(eposta, hedef, sifreMetni) {
  return api(async () => {
    const y = await yoneticiGerekli(eposta);
    hedef = String(hedef || '').toLowerCase().trim();
    const uretilen = !String(sifreMetni || '').length;
    const yeni = uretilen ? sifre.rastgele(12) : String(sifreMetni);
    await sifre.sifreBelirle(hedef, yeni);
    await db.kilitle(() => db.logYaz(y.eposta, '', 'YONETIM_SIFRE_BELIRLENDI', hedef));
    return { mesaj: 'Şifre belirlendi.', eposta: hedef, sifre: uretilen ? yeni : '' };
  });
}

function api_mekanKaydet(eposta, form) {
  return api(() => db.kilitle(async () => {
    const y = await yoneticiGerekli(eposta);
    const { hatalar, kayit } = Logic.mekanDogrula(form, { birimler: await birimKodlari() });
    if (hatalar.length) throw new Error(hatalar.join(' '));
    const mevcut = await db.bul(SAYFA.MEKANLAR, 'MekanID', kayit.MekanID);
    if (mevcut) await db.guncelle(SAYFA.MEKANLAR, 'MekanID', kayit.MekanID, kayit);
    else await db.ekle(SAYFA.MEKANLAR, kayit);
    await db.logYaz(y.eposta, '', mevcut ? 'YONETIM_MEKAN_GUNCELLENDI' : 'YONETIM_MEKAN_EKLENDI', kayit.MekanID + ' · ' + kayit.Aktif);
    return { mesaj: mevcut ? 'Mekân güncellendi.' : 'Mekân eklendi.' };
  }));
}

function api_birimKaydet(eposta, form) {
  return api(() => db.kilitle(async () => {
    const y = await yoneticiGerekli(eposta);
    const { hatalar, kayit } = Logic.birimDogrula(form);
    if (hatalar.length) throw new Error(hatalar.join(' '));
    const mevcut = await db.bul(SAYFA.BIRIMLER, 'BirimID', kayit.BirimID);
    if (mevcut) await db.guncelle(SAYFA.BIRIMLER, 'BirimID', kayit.BirimID, kayit);
    else await db.ekle(SAYFA.BIRIMLER, kayit);
    await db.logYaz(y.eposta, '', mevcut ? 'YONETIM_BIRIM_GUNCELLENDI' : 'YONETIM_BIRIM_EKLENDI', kayit.BirimID);
    return { mesaj: mevcut ? 'Birim güncellendi.' : 'Birim eklendi.' };
  }));
}

function api_ayarKaydet(eposta, anahtar, deger) {
  return api(() => db.kilitle(async () => {
    const y = await yoneticiGerekli(eposta);
    const { hatalar, kayit } = Logic.ayarDogrula(anahtar, deger, VARSAYILAN_AYARLAR.map((a) => a[0]));
    if (hatalar.length) throw new Error(hatalar.join(' '));
    await db.ayarYaz(kayit.Anahtar, kayit.Deger);
    await db.logYaz(y.eposta, '', 'YONETIM_AYAR_GUNCELLENDI', kayit.Anahtar + ' = ' + kayit.Deger);
    return { mesaj: 'Ayar kaydedildi.' };
  }));
}

module.exports = { api_yonetimVeri, api_kullaniciKaydet, api_sifreBelirle, api_mekanKaydet, api_birimKaydet, api_ayarKaydet };
