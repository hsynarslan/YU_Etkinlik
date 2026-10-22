/**
 * api.js — İstemcinin ilk yüklemede ve her işlemden sonra aldığı veri.
 *
 * İstemciden çağrılan tüm sunucu fonksiyonları `api_` ile başlar, ilk parametre oturumdaki
 * kullanıcının e-postasıdır ve { ok: true, ... } ya da { ok: false, mesaj } döndürür.
 */
const Logic = require('./logic');
const { SAYFA, ETKINLIK_TURLERI } = require('./config');
const db = require('./db');
const { aktifKullanici } = require('./auth');
const { api, istemciEtkinlik } = require('./ortak');

function api_baslangic(eposta) {
  return api(async () => {
    const k = await aktifKullanici(eposta);
    const R = Logic.ROLLER;
    const D = Logic.DURUM;
    const gun = db.bugun();
    const etkinlikler = await db.hepsi(SAYFA.ETKINLIKLER);
    const gorevler = await db.hepsi(SAYFA.GOREVLER);
    const mekanTablosu = await db.hepsi(SAYFA.MEKANLAR);
    const mekanAd = {};
    mekanTablosu.forEach((m) => { mekanAd[m.MekanID] = m.Ad; });
    const ie = (e) => istemciEtkinlik(e, mekanAd);

    const temizGorev = (g) => ({ GorevID: g.GorevID, EtkinlikID: g.EtkinlikID, Birim: g.Birim, Tur: g.Tur,
      Aciklama: g.Aciklama, Durum: g.Durum, Not: g.Not, GuncellemeZamani: g.GuncellemeZamani });
    const yeniOnce = (a, b) => String(b.OlusturmaZamani).localeCompare(String(a.OlusturmaZamani));

    const etkinliklerim = etkinlikler
      .filter((e) => Logic.sahibiMi(k, e))
      .sort(yeniOnce)
      .map((e) => {
        const o = ie(e);
        o.Gorevler = gorevler.filter((g) => g.EtkinlikID === e.EtkinlikID).map(temizGorev);
        return o;
      });

    const onayBekleyenler = etkinlikler
      .filter((e) => e.Durum === D.EBYS_KONTROL && Logic.yetkiVarMi(k, 'EBYS_ONAYLA', e))
      .map(ie);

    const etkinlikMap = {};
    etkinlikler.forEach((e) => { etkinlikMap[e.EtkinlikID] = e; });
    const gorevlerim = gorevler
      .filter((g) => {
        const e = etkinlikMap[g.EtkinlikID];
        return e && e.Durum !== D.IPTAL && Logic.yetkiVarMi(k, 'GOREV_GUNCELLE', g);
      })
      .map((g) => {
        const e = etkinlikMap[g.EtkinlikID];
        const o = temizGorev(g);
        o.Etkinlik = { Ad: e.Ad, Tarih: e.Tarih, Saat: e.BaslangicSaati + '–' + e.BitisSaati,
          MekanAd: mekanAd[e.MekanID] || e.MekanID, Sorumlu: e.SorumluEposta, DurumEtiket: Logic.DURUM_ETIKET[e.Durum] };
        return o;
      })
      .sort((a, b) => String(a.Etkinlik.Tarih).localeCompare(String(b.Etkinlik.Tarih)));

    const takvim = etkinlikler
      .filter((e) => e.Tarih >= gun && Logic.AKTIF_DURUMLAR.indexOf(e.Durum) !== -1)
      .map((e) => ({ EtkinlikID: e.EtkinlikID, Ad: e.Ad, Tur: e.Tur, DuzenleyenBirim: e.DuzenleyenBirim,
        MekanID: e.MekanID, MekanAd: mekanAd[e.MekanID] || e.MekanID, Tarih: e.Tarih,
        BaslangicSaati: e.BaslangicSaati, BitisSaati: e.BitisSaati,
        Durum: e.Durum, DurumEtiket: Logic.DURUM_ETIKET[e.Durum] }))
      .sort((a, b) => (a.Tarih + a.BaslangicSaati).localeCompare(b.Tarih + b.BaslangicSaati));

    const yonetici = Logic.rolVar(k, R.YONETICI);
    return {
      kullanici: k,
      bugun: gun,
      mekanlar: mekanTablosu
        .filter((m) => String(m.Aktif).toUpperCase() !== 'HAYIR')
        .map((m) => ({ MekanID: m.MekanID, Ad: m.Ad, Bina: m.Bina, Kapasite: m.Kapasite })),
      birimler: (await db.hepsi(SAYFA.BIRIMLER)).map((b) => ({ BirimID: b.BirimID, Ad: b.Ad, Tur: b.Tur })),
      turler: ETKINLIK_TURLERI,
      durumEtiket: Logic.DURUM_ETIKET,
      gecisler: Logic.GECISLER,
      ayarlar: {
        asgariGun: await db.ayarSayi('ASGARI_BASVURU_GUN'),
        asgariUstDuzeyGun: await db.ayarSayi('ASGARI_BASVURU_UST_DUZEY_GUN'),
        maxUzatma: await db.ayarSayi('MAX_UZATMA'),
        pdfMaxMb: (await db.ayarSayi('EBYS_PDF_MAX_MB')) || 3
      },
      etkinliklerim,
      onayBekleyenler,
      gorevlerim,
      takvim,
      tumu: yonetici ? etkinlikler.slice().sort(yeniOnce).slice(0, 300).map(ie) : []
    };
  });
}

module.exports = { api_baslangic };
