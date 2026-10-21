/**
 * Main.js — Web uygulaması giriş noktası ve istemcinin ilk yüklemede aldığı veri.
 *
 * İstemciden çağrılan tüm sunucu fonksiyonları `api_` ile başlar ve
 * { ok: true, ... } ya da { ok: false, mesaj } döndürür (bkz. api_).
 * Sonu `_` ile biten fonksiyonlar istemciden çağrılamaz (Apps Script kuralı).
 */

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Etkinlik Yönetim Sistemi')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/** HTML şablonlarında <?!= include_('Styles') ?> için. */
function include_(ad) {
  return HtmlService.createHtmlOutputFromFile(ad).getContent();
}

/** Tüm api_* fonksiyonlarının ortak hata sarmalayıcısı. */
function api_(fn) {
  try {
    var sonuc = fn() || {};
    sonuc.ok = true;
    return sonuc;
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return { ok: false, mesaj: (err && err.message) || String(err) };
  }
}

/** İstemciye gönderilecek etkinlik nesnesi (iç alanlar temizlenir, Detay çözülür). */
function istemciEtkinlik_(e) {
  var o = {};
  Object.keys(e).forEach(function (k) { if (k.charAt(0) !== '_') o[k] = e[k]; });
  try { o.Detay = e.Detay ? JSON.parse(e.Detay) : null; } catch (ignore) { o.Detay = null; }
  o.DurumEtiket = Logic.DURUM_ETIKET[e.Durum] || e.Durum;
  o.MekanAd = mekanAdi(e.MekanID);
  return o;
}

/** İlk yükleme ve her işlemden sonra yenileme için tek çağrı. */
function api_baslangic() {
  return api_(function () {
    var k = aktifKullanici();
    var R = Logic.ROLLER;
    var D = Logic.DURUM;
    var gun = bugun();
    var etkinlikler = db_hepsi(SAYFA.ETKINLIKLER);
    var gorevler = db_hepsi(SAYFA.GOREVLER);
    var temizGorev = function (g) {
      return { GorevID: g.GorevID, EtkinlikID: g.EtkinlikID, Birim: g.Birim, Tur: g.Tur,
        Aciklama: g.Aciklama, Durum: g.Durum, Not: g.Not, GuncellemeZamani: g.GuncellemeZamani };
    };
    var yeniOnce = function (a, b) { return String(b.OlusturmaZamani).localeCompare(String(a.OlusturmaZamani)); };

    var etkinliklerim = etkinlikler
      .filter(function (e) { return Logic.sahibiMi(k, e); })
      .sort(yeniOnce)
      .map(function (e) {
        var o = istemciEtkinlik_(e);
        o.Gorevler = gorevler.filter(function (g) { return g.EtkinlikID === e.EtkinlikID; }).map(temizGorev);
        return o;
      });

    var onayBekleyenler = etkinlikler
      .filter(function (e) { return e.Durum === D.EBYS_KONTROL && Logic.yetkiVarMi(k, 'EBYS_ONAYLA', e); })
      .map(istemciEtkinlik_);

    var etkinlikMap = {};
    etkinlikler.forEach(function (e) { etkinlikMap[e.EtkinlikID] = e; });
    var gorevlerim = gorevler
      .filter(function (g) {
        var e = etkinlikMap[g.EtkinlikID];
        return e && e.Durum !== D.IPTAL && Logic.yetkiVarMi(k, 'GOREV_GUNCELLE', g);
      })
      .map(function (g) {
        var e = etkinlikMap[g.EtkinlikID];
        var o = temizGorev(g);
        o.Etkinlik = { Ad: e.Ad, Tarih: e.Tarih, Saat: e.BaslangicSaati + '–' + e.BitisSaati,
          MekanAd: mekanAdi(e.MekanID), Sorumlu: e.SorumluEposta, DurumEtiket: Logic.DURUM_ETIKET[e.Durum] };
        return o;
      })
      .sort(function (a, b) { return String(a.Etkinlik.Tarih).localeCompare(String(b.Etkinlik.Tarih)); });

    var takvim = etkinlikler
      .filter(function (e) { return e.Tarih >= gun && Logic.AKTIF_DURUMLAR.indexOf(e.Durum) !== -1; })
      .map(function (e) {
        return { EtkinlikID: e.EtkinlikID, Ad: e.Ad, Tur: e.Tur, DuzenleyenBirim: e.DuzenleyenBirim,
          MekanID: e.MekanID, MekanAd: mekanAdi(e.MekanID), Tarih: e.Tarih,
          BaslangicSaati: e.BaslangicSaati, BitisSaati: e.BitisSaati,
          Durum: e.Durum, DurumEtiket: Logic.DURUM_ETIKET[e.Durum] };
      })
      .sort(function (a, b) { return (a.Tarih + a.BaslangicSaati).localeCompare(b.Tarih + b.BaslangicSaati); });

    var yonetici = Logic.rolVar(k, R.YONETICI);
    return {
      kullanici: k,
      bugun: gun,
      mekanlar: db_hepsi(SAYFA.MEKANLAR)
        .filter(function (m) { return String(m.Aktif).toUpperCase() !== 'HAYIR'; })
        .map(function (m) { return { MekanID: m.MekanID, Ad: m.Ad, Bina: m.Bina, Kapasite: m.Kapasite }; }),
      birimler: db_hepsi(SAYFA.BIRIMLER).map(function (b) { return { BirimID: b.BirimID, Ad: b.Ad, Tur: b.Tur }; }),
      turler: ETKINLIK_TURLERI,
      durumEtiket: Logic.DURUM_ETIKET,
      gecisler: Logic.GECISLER,
      ayarlar: {
        asgariGun: ayarSayi('ASGARI_BASVURU_GUN'),
        asgariUstDuzeyGun: ayarSayi('ASGARI_BASVURU_UST_DUZEY_GUN'),
        maxUzatma: ayarSayi('MAX_UZATMA'),
        pdfMaxMb: ayarSayi('EBYS_PDF_MAX_MB') || 10
      },
      etkinliklerim: etkinliklerim,
      onayBekleyenler: onayBekleyenler,
      gorevlerim: gorevlerim,
      takvim: takvim,
      tumu: yonetici ? etkinlikler.slice().sort(yeniOnce).slice(0, 300).map(istemciEtkinlik_) : [],
      veriUrl: yonetici ? db_ss().getUrl() : ''
    };
  });
}
