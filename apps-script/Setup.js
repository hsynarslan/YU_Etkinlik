/**
 * Setup.js — Kurulum ve bakım fonksiyonları. Apps Script editöründen elle çalıştırılır.
 *
 * kurulum()            : Veri tablosunu, sayfaları, ayarları, EBYS klasörünü ve gece görevini hazırlar.
 *                        Tekrar çalıştırmak güvenlidir; var olanı silmez, eksikleri tamamlar.
 * ornekVerileriYukle() : Boş Mekanlar/Birimler sayfalarına deneme verisi ekler.
 */

function kurulum() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SPREADSHEET_ID');
  var ss;
  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    ss = SpreadsheetApp.create('Etkinlik Yönetim Sistemi - Veri');
    props.setProperty('SPREADSHEET_ID', ss.getId());
  }
  ss.setSpreadsheetTimeZone(APP.SAAT_DILIMI);
  _ssOnbellek = ss;
  _okumaOnbellek = {};

  Object.keys(HEADERS).forEach(function (ad) { sayfaHazirla_(ss, ad, HEADERS[ad]); });
  varsayilanSayfayiSil_(ss);
  ayarlariTamamla_();
  ebysKlasoruHazirla_();
  hizmetBirimleriniTohumla_();
  ilkYoneticiyiEkle_();
  dogrulamalariKur_(ss);
  tetikleyiciKur_();

  Logger.log('Kurulum tamam. Veri tablosu: ' + ss.getUrl());
  Logger.log('Sonraki adım: Kullanicilar ve Mekanlar sayfalarını doldurun, sonra web uygulamasını yayınlayın.');
}

function sayfaHazirla_(ss, ad, basliklar) {
  var sh = ss.getSheetByName(ad) || ss.insertSheet(ad);
  var mevcut = sh.getLastColumn() > 0
    ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String).filter(Boolean)
    : [];
  var eksik = basliklar.filter(function (b) { return mevcut.indexOf(b) === -1; });
  if (eksik.length) {
    sh.getRange(1, mevcut.length + 1, 1, eksik.length).setValues([eksik]);
  }
  var toplam = mevcut.length + eksik.length;
  sh.getRange(1, 1, 1, toplam).setFontWeight('bold').setBackground('#eef2f7');
  sh.setFrozenRows(1);
  // Tüm hücreler düz metin: tarih/saat/EBYS no otomatik dönüştürülmesin.
  sh.getRange(1, 1, sh.getMaxRows(), Math.max(toplam, 1)).setNumberFormat('@');
}

function varsayilanSayfayiSil_(ss) {
  ['Sheet1', 'Sayfa1'].forEach(function (ad) {
    var sh = ss.getSheetByName(ad);
    if (sh && ss.getSheets().length > 1 && sh.getLastRow() === 0) ss.deleteSheet(sh);
  });
}

function ayarlariTamamla_() {
  var mevcut = db_hepsi(SAYFA.AYARLAR).map(function (k) { return k.Anahtar; });
  VARSAYILAN_AYARLAR.forEach(function (a) {
    if (mevcut.indexOf(a[0]) === -1) db_ekle(SAYFA.AYARLAR, { Anahtar: a[0], Deger: a[1], Aciklama: a[2] });
  });
}

function ayarYaz_(anahtar, deger) {
  var kayit = db_hepsi(SAYFA.AYARLAR).filter(function (k) { return k.Anahtar === anahtar; })[0];
  if (kayit) db_guncelle(SAYFA.AYARLAR, 'Anahtar', anahtar, { Deger: deger });
  else db_ekle(SAYFA.AYARLAR, { Anahtar: anahtar, Deger: deger, Aciklama: '' });
}

function ebysKlasoruHazirla_() {
  var id = ayar('EBYS_PDF_KLASOR_ID');
  if (id) {
    try { DriveApp.getFolderById(id); return; } catch (e) { /* silinmiş: yeniden oluştur */ }
  }
  var klasor = DriveApp.createFolder('Etkinlik Yönetim Sistemi - EBYS Ekleri');
  ayarYaz_('EBYS_PDF_KLASOR_ID', klasor.getId());
}

function hizmetBirimleriniTohumla_() {
  if (db_hepsi(SAYFA.BIRIMLER).length) return;
  var adlar = {
    KURUMSAL_ILETISIM: 'Kurumsal İletişim',
    BILGI_ISLEM: 'Bilgi İşlem / Görsel-İşitsel',
    TEKNIK_ISLER: 'Yapı ve Teknik İşler',
    IDARI_ISLER: 'İdari İşler',
    GUVENLIK: 'Güvenlik',
    PROTOKOL: 'Rektörlük Protokol'
  };
  Object.keys(Logic.HIZMET_BIRIMLERI).forEach(function (kod) {
    db_ekle(SAYFA.BIRIMLER, { BirimID: kod, Ad: adlar[kod] || kod, Tur: 'HIZMET', Eposta: '' });
  });
}

function ilkYoneticiyiEkle_() {
  if (db_hepsi(SAYFA.KULLANICILAR).length) return;
  var eposta = Session.getEffectiveUser().getEmail();
  if (!eposta) return;
  db_ekle(SAYFA.KULLANICILAR, {
    Eposta: eposta.toLowerCase(), AdSoyad: 'Sistem Yöneticisi', Birim: 'YONETIM',
    Roller: 'YONETICI', OnayBirimleri: '', Aktif: 'EVET'
  });
}

function dogrulamalariKur_(ss) {
  var liste = function (sayfa, sutun, degerler) {
    var sh = ss.getSheetByName(sayfa);
    var c = HEADERS[sayfa].indexOf(sutun) + 1;
    if (!sh || c < 1) return;
    var kural = SpreadsheetApp.newDataValidation().requireValueInList(degerler, true).setAllowInvalid(false).build();
    sh.getRange(2, c, sh.getMaxRows() - 1, 1).setDataValidation(kural);
  };
  liste(SAYFA.KULLANICILAR, 'Aktif', ['EVET', 'HAYIR']);
  liste(SAYFA.MEKANLAR, 'Aktif', ['EVET', 'HAYIR']);
  liste(SAYFA.ETKINLIKLER, 'Durum', Object.keys(Logic.DURUM));
  liste(SAYFA.GOREVLER, 'Durum', Object.keys(Logic.GOREV_DURUM));
  liste(SAYFA.BIRIMLER, 'Tur', ['AKADEMIK', 'IDARI', 'HIZMET']);
}

function tetikleyiciKur_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'gunlukSureKontrolu') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('gunlukSureKontrolu')
    .timeBased().everyDays(1).atHour(2).inTimezone(APP.SAAT_DILIMI).create();
}

/** Deneme için örnek mekân ve akademik birim ekler. Gerçek verileri girince bu kayıtları silin. */
function ornekVerileriYukle() {
  if (!db_hepsi(SAYFA.MEKANLAR).length) {
    [
      ['ORNEK-KS', 'ÖRNEK Konferans Salonu', 'ÖRNEK Bina', '300'],
      ['ORNEK-SEM1', 'ÖRNEK Seminer Odası 1', 'ÖRNEK Bina', '60'],
      ['ORNEK-FUAYE', 'ÖRNEK Fuaye Alanı', 'ÖRNEK Bina', '150']
    ].forEach(function (m) {
      db_ekle(SAYFA.MEKANLAR, { MekanID: m[0], Ad: m[1], Bina: m[2], Kapasite: m[3], SorumluBirim: 'TEKNIK_ISLER', Aktif: 'EVET' });
    });
  }
  var birimler = db_hepsi(SAYFA.BIRIMLER).map(function (b) { return b.BirimID; });
  if (birimler.indexOf('ORNEK_FAKULTE') === -1) {
    db_ekle(SAYFA.BIRIMLER, { BirimID: 'ORNEK_FAKULTE', Ad: 'ÖRNEK Fakülte', Tur: 'AKADEMIK', Eposta: '' });
  }
  Logger.log('Örnek veriler eklendi.');
}

/** Gece görevini elle denemek için. */
function gunlukSureKontroluCalistir() {
  gunlukSureKontrolu();
  Logger.log('Günlük kontrol çalıştı. Log sayfasına bakın.');
}
