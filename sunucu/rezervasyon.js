/**
 * rezervasyon.js — Ön rezervasyon, uzatma, iptal, yedek sıra ve günlük süre kontrolü.
 */
const Logic = require('./logic');
const { SAYFA } = require('./config');
const db = require('./db');
const { aktifKullanici, yetkiGerekli, epostalar, yoneticiler } = require('./auth');
const { bildir, etkinlikOzeti, htmlKacis } = require('./bildirim');
const { api, istemciEtkinlikTek } = require('./ortak');

/**
 * Yeni ön rezervasyon (veya yetkili birim için EBYS'siz etkinlik) açar.
 * Mekân doluysa `yedegeAl` gönderilmediği sürece { cakisma: true } döner; istemci kullanıcıya sorar.
 */
function api_onRezervasyonOlustur(eposta, form) {
  return api(() => db.kilitle(async () => {
    const k = await aktifKullanici(eposta);
    yetkiGerekli(k, 'ON_REZ_OLUSTUR');
    form = form || {};
    const muaf = form.ebysMuaf === true || form.ebysMuaf === 'true';
    if (muaf) yetkiGerekli(k, 'EBYS_MUAF_KULLAN');

    let mekan = await db.bul(SAYFA.MEKANLAR, 'MekanID', form.mekanId || '');
    if (mekan && String(mekan.Aktif).toUpperCase() === 'HAYIR') mekan = null;

    const f = {
      ad: String(form.ad || '').trim(),
      tur: String(form.tur || '').trim(),
      mekanId: form.mekanId,
      tarih: form.tarih,
      baslangic: form.baslangic,
      bitis: form.bitis,
      katilimciSayisi: form.katilimciSayisi,
      protokolDuzeyi: form.protokolDuzeyi || Logic.PROTOKOL_DUZEYI.STANDART,
      ebysMuaf: muaf,
      muafGerekce: String(form.muafGerekce || '').trim()
    };
    const hatalar = Logic.onRezervasyonDogrula(f, {
      bugun: db.bugun(),
      mekan,
      asgariGun: await db.ayarSayi('ASGARI_BASVURU_GUN'),
      asgariUstDuzeyGun: await db.ayarSayi('ASGARI_BASVURU_UST_DUZEY_GUN')
    });
    if (hatalar.length) throw new Error(hatalar.join(' '));

    // Düzenleyen birim: varsayılan kullanıcının birimi; yönetici ve EBYS muaf yetkilisi başka birim adına açabilir.
    let birim = k.birim;
    const digerBirim = String(form.duzenleyenBirim || '').trim().toUpperCase();
    if (digerBirim && digerBirim !== birim &&
        (Logic.rolVar(k, Logic.ROLLER.YONETICI) || Logic.rolVar(k, Logic.ROLLER.EBYS_MUAF))) {
      birim = digerBirim;
    }

    const kayit = {
      EtkinlikID: db.yeniId('ETK'),
      Durum: '',
      Ad: f.ad,
      Tur: f.tur,
      DuzenleyenBirim: birim,
      SorumluEposta: k.eposta,
      MekanID: String(mekan.MekanID),
      Tarih: f.tarih,
      BaslangicSaati: f.baslangic,
      BitisSaati: f.bitis,
      KatilimciSayisi: String(Number(f.katilimciSayisi)),
      ProtokolDuzeyi: f.protokolDuzeyi,
      OnRezBitis: '',
      UzatmaSayisi: '0',
      EbysNo: '', EbysTarih: '', EbysEkUrl: '',
      EbysMuaf: muaf ? 'EVET' : 'HAYIR',
      MuafGerekce: muaf ? f.muafGerekce : '',
      KontrolNotu: '',
      Detay: '',
      OlusturanEposta: k.eposta,
      OlusturmaZamani: db.simdi(),
      GuncellemeZamani: db.simdi()
    };

    const cakisanlar = Logic.cakismaBul(kayit, await db.hepsi(SAYFA.ETKINLIKLER));
    if (cakisanlar.length && !form.yedegeAl) {
      return {
        cakisma: true,
        mesaj: 'Seçilen mekân bu saat aralığında dolu.',
        cakisanlar: cakisanlar.map((c) => ({ Ad: c.Ad, Saat: c.BaslangicSaati + '–' + c.BitisSaati, Durum: Logic.DURUM_ETIKET[c.Durum] }))
      };
    }

    const D = Logic.DURUM;
    if (cakisanlar.length) kayit.Durum = D.YEDEK;
    else kayit.Durum = muaf ? D.DETAY_BEKLENIYOR : D.ON_REZERVASYON;
    if (kayit.Durum === D.ON_REZERVASYON) kayit.OnRezBitis = await onRezBitisHesapla(db.bugun(), await db.ayarSayi('ON_REZ_SURE_GUN'), kayit.Tarih);

    await db.ekle(SAYFA.ETKINLIKLER, kayit);
    await db.logYaz(k.eposta, kayit.EtkinlikID, 'OLUSTURULDU',
      kayit.Durum + (muaf ? ' · EBYS muaf · Gerekçe: ' + kayit.MuafGerekce : ''));

    if (muaf) {
      await bildir(await yoneticiler(), 'EBYS\'siz etkinlik açıldı',
        (await etkinlikOzeti(kayit)) + '<br>Açan: ' + htmlKacis(k.adSoyad) + '<br>Gerekçe: ' + htmlKacis(kayit.MuafGerekce) +
        (kayit.Durum === D.YEDEK ? '<br><b>Mekân dolu olduğu için yedek sıraya alındı; öncelik kararı yöneticide.</b>' : ''),
        kayit.EtkinlikID);
    }

    const mesaj = kayit.Durum === D.YEDEK ? 'Talebiniz yedek sıraya alındı. Mekân boşalırsa bilgilendirileceksiniz.'
      : kayit.Durum === D.ON_REZERVASYON ? 'Ön rezervasyon oluşturuldu. EBYS numarasını ' + kayit.OnRezBitis + ' tarihine kadar girmelisiniz.'
        : 'Etkinlik oluşturuldu. Şimdi detaylı etkinlik formunu doldurabilirsiniz.';
    return { etkinlik: await istemciEtkinlikTek(kayit), mesaj };
  }));
}

/** Ön rezervasyon süresini bir kez (MAX_UZATMA kadar) uzatır. */
function api_uzat(eposta, etkinlikId, gerekce) {
  return api(() => db.kilitle(async () => {
    const k = await aktifKullanici(eposta);
    const e = await db.bul(SAYFA.ETKINLIKLER, 'EtkinlikID', etkinlikId);
    if (!e) throw new Error('Etkinlik bulunamadı.');
    yetkiGerekli(k, 'ETKINLIK_SAHIBI', e);
    if (e.Durum !== Logic.DURUM.ON_REZERVASYON) throw new Error('Yalnızca ön rezervasyon aşamasında süre uzatılabilir.');
    if (Number(e.UzatmaSayisi || 0) >= await db.ayarSayi('MAX_UZATMA')) throw new Error('Uzatma hakkınız kalmadı.');
    if (!String(gerekce || '').trim()) throw new Error('Uzatma gerekçesi zorunludur.');

    const baz = e.OnRezBitis && e.OnRezBitis >= db.bugun() ? e.OnRezBitis : db.bugun();
    const yeniBitis = await onRezBitisHesapla(baz, await db.ayarSayi('UZATMA_GUN'), e.Tarih);
    const g = await db.guncelle(SAYFA.ETKINLIKLER, 'EtkinlikID', etkinlikId, {
      OnRezBitis: yeniBitis,
      UzatmaSayisi: String(Number(e.UzatmaSayisi || 0) + 1)
    });
    await db.logYaz(k.eposta, etkinlikId, 'SURE_UZATILDI', e.OnRezBitis + ' → ' + yeniBitis + ' · ' + gerekce);
    return { etkinlik: await istemciEtkinlikTek(g), mesaj: 'Süre ' + yeniBitis + ' tarihine uzatıldı.' };
  }));
}

/** Etkinliği iptal eder; mekân boşalırsa sıradaki yedeği terfi ettirir. */
function api_iptal(eposta, etkinlikId, gerekce) {
  return api(() => db.kilitle(async () => {
    const k = await aktifKullanici(eposta);
    const e = await db.bul(SAYFA.ETKINLIKLER, 'EtkinlikID', etkinlikId);
    if (!e) throw new Error('Etkinlik bulunamadı.');
    yetkiGerekli(k, 'ETKINLIK_SAHIBI', e);
    Logic.gecisKontrol(e.Durum, Logic.DURUM.IPTAL);
    await db.guncelle(SAYFA.ETKINLIKLER, 'EtkinlikID', etkinlikId, { Durum: Logic.DURUM.IPTAL });
    await db.logYaz(k.eposta, etkinlikId, 'IPTAL', gerekce || '');

    // Görev açılmış birimlere haber ver
    const birimler = (await db.hepsi(SAYFA.GOREVLER))
      .filter((g) => g.EtkinlikID === etkinlikId)
      .map((g) => g.Birim);
    let alicilar = [];
    for (const b of birimler) alicilar = alicilar.concat(await epostalar({ rol: Logic.ROLLER.HIZMET_BIRIMI, birim: b }));
    await bildir(alicilar, 'Etkinlik iptal edildi', (await etkinlikOzeti(e)) + '<br>Gerekçe: ' + htmlKacis(gerekce || '-'), etkinlikId);

    await mekanBosaldi(e);
    return { mesaj: 'Etkinlik iptal edildi.' };
  }));
}

/** Ön rezervasyon bitişi: bazdan n iş günü sonrası, ama etkinlik tarihinden sonra olamaz. */
async function onRezBitisHesapla(baz, isGunu, etkinlikTarihi) {
  const hesap = Logic.isGunuEkle(baz, isGunu, await db.resmiTatiller());
  return hesap > etkinlikTarihi ? etkinlikTarihi : hesap;
}

/** Bir kayıt mekânı boşalttığında sıradaki yedeği terfi ettirir. kilitle() içinde çağrılmalıdır. */
async function mekanBosaldi(bosalan) {
  const sira = Logic.siradakiYedek(bosalan, await db.hepsi(SAYFA.ETKINLIKLER));
  if (!sira) return null;
  const D = Logic.DURUM;
  const yeniDurum = sira.EbysMuaf === 'EVET' ? D.DETAY_BEKLENIYOR : D.ON_REZERVASYON;
  const yama = { Durum: yeniDurum };
  if (yeniDurum === D.ON_REZERVASYON) yama.OnRezBitis = await onRezBitisHesapla(db.bugun(), await db.ayarSayi('ON_REZ_SURE_GUN'), sira.Tarih);
  await db.guncelle(SAYFA.ETKINLIKLER, 'EtkinlikID', sira.EtkinlikID, yama);
  await db.logYaz('sistem', sira.EtkinlikID, 'YEDEKTEN_TERFI', 'Boşalan: ' + bosalan.EtkinlikID);
  await bildir(sira.SorumluEposta, 'Mekân size açıldı',
    (await etkinlikOzeti(sira)) + '<br>Yedek sıradaki talebiniz için mekân boşaldı.' +
    (yama.OnRezBitis ? ' EBYS numarasını ' + yama.OnRezBitis + ' tarihine kadar girmelisiniz.' : ''),
    sira.EtkinlikID);
  return sira;
}

/**
 * Gece görevi (Vercel Cron her gece 02:00'de /api/cron/gunluk adresini çağırır):
 * - Süresi dolan ön rezervasyonları düşürür ve yedeği terfi ettirir
 * - Bitişi yaklaşanlara hatırlatma gönderir
 * - Tarihi geçmiş kesinleşmiş etkinlikleri TAMAMLANDI yapar
 * İstemciden çağrılamaz; yalnızca Cron (CRON_SECRET) ve `npm run gece-gorevi` çalıştırır.
 */
function gunlukSureKontrolu() {
  return db.kilitle(async () => {
    const D = Logic.DURUM;
    const gun = db.bugun();
    const hatirlatmaTarihi = Logic.isGunuEkle(gun, (await db.ayarSayi('HATIRLATMA_GUN')) || 2, await db.resmiTatiller());
    const liste = await db.hepsi(SAYFA.ETKINLIKLER);
    const sayac = { dusen: 0, hatirlatma: 0, tamamlanan: 0 };

    for (const e of liste) {
      if (e.Durum === D.ON_REZERVASYON && e.OnRezBitis) {
        // Önceki adımda (yedek terfisi) değişmiş olabilir; güncel kaydı oku.
        const guncel = await db.bul(SAYFA.ETKINLIKLER, 'EtkinlikID', e.EtkinlikID);
        if (guncel.Durum !== D.ON_REZERVASYON) continue;
        if (guncel.OnRezBitis < gun) {
          await db.guncelle(SAYFA.ETKINLIKLER, 'EtkinlikID', e.EtkinlikID, { Durum: D.SURESI_DOLDU });
          await db.logYaz('sistem', e.EtkinlikID, 'SURESI_DOLDU', 'Bitiş: ' + guncel.OnRezBitis);
          await bildir(e.SorumluEposta, 'Ön rezervasyon süresi doldu',
            (await etkinlikOzeti(e)) + '<br>EBYS numarası girilmediği için ön rezervasyon düştü ve mekân serbest bırakıldı.',
            e.EtkinlikID);
          await mekanBosaldi(e);
          sayac.dusen++;
        } else if (guncel.OnRezBitis === hatirlatmaTarihi) {
          await bildir(e.SorumluEposta, 'Ön rezervasyon süresi yaklaşıyor',
            (await etkinlikOzeti(e)) + '<br>EBYS numarasını en geç ' + guncel.OnRezBitis + ' tarihine kadar girmelisiniz.',
            e.EtkinlikID);
          sayac.hatirlatma++;
        }
      } else if (e.Durum === D.KESINLESTI && e.Tarih < gun) {
        await db.guncelle(SAYFA.ETKINLIKLER, 'EtkinlikID', e.EtkinlikID, { Durum: D.TAMAMLANDI });
        await db.logYaz('sistem', e.EtkinlikID, 'TAMAMLANDI', '');
        sayac.tamamlanan++;
      }
    }
    return sayac;
  });
}

module.exports = {
  api_onRezervasyonOlustur, api_uzat, api_iptal,
  onRezBitisHesapla, mekanBosaldi, gunlukSureKontrolu
};
