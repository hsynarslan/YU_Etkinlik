/**
 * Db.js — Google Sheets veri katmanı.
 *
 * Kurallar:
 * - Tüm yazma işlemleri `kilitle_()` içinde yapılır (eşzamanlı yazmaya karşı).
 * - Hücreler metin olarak tutulur; okurken Date nesneleri metne çevrilir.
 * - Nesne değerler (ör. Detay) JSON olarak saklanır.
 */

var _ssOnbellek = null;
var _okumaOnbellek = {};

function db_ss_() {
  if (_ssOnbellek) return _ssOnbellek;
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Sistem kurulmamış. Apps Script editöründen kurulum() fonksiyonunu çalıştırın.');
  _ssOnbellek = SpreadsheetApp.openById(id);
  return _ssOnbellek;
}

function db_sayfa_(ad) {
  var sh = db_ss_().getSheetByName(ad);
  if (!sh) throw new Error('"' + ad + '" sayfası bulunamadı. kurulum() fonksiyonunu çalıştırın.');
  return sh;
}

function db_normalize_(baslik, v) {
  if (v instanceof Date) {
    if (/Saati$/.test(baslik)) return Utilities.formatDate(v, APP.SAAT_DILIMI, 'HH:mm');
    if (/Zaman/.test(baslik)) return Utilities.formatDate(v, APP.SAAT_DILIMI, "yyyy-MM-dd'T'HH:mm:ss");
    return Utilities.formatDate(v, APP.SAAT_DILIMI, 'yyyy-MM-dd');
  }
  if (v === null || v === undefined) return '';
  return typeof v === 'string' ? v.trim() : String(v);
}

/** Sayfadaki tüm satırları { başlık: değer } nesneleri olarak döndürür. */
function db_hepsi_(ad) {
  if (_okumaOnbellek[ad]) return _okumaOnbellek[ad];
  var sh = db_sayfa_(ad);
  var degerler = sh.getDataRange().getValues();
  if (degerler.length < 2) { _okumaOnbellek[ad] = []; return []; }
  var basliklar = degerler[0].map(String);
  var sonuc = [];
  for (var r = 1; r < degerler.length; r++) {
    var satir = degerler[r];
    if (satir.every(function (x) { return x === '' || x === null; })) continue;
    var o = { _satir: r + 1 };
    for (var c = 0; c < basliklar.length; c++) {
      if (basliklar[c]) o[basliklar[c]] = db_normalize_(basliklar[c], satir[c]);
    }
    sonuc.push(o);
  }
  _okumaOnbellek[ad] = sonuc;
  return sonuc;
}

function db_bul_(ad, idSutun, id) {
  var hedef = String(id);
  return db_hepsi_(ad).filter(function (k) { return k[idSutun] === hedef; })[0] || null;
}

function db_basliklar_(ad) {
  var sh = db_sayfa_(ad);
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
}

function db_hucre_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

function db_ekle_(ad, nesne) {
  var basliklar = db_basliklar_(ad);
  var satir = basliklar.map(function (b) { return db_hucre_(nesne[b]); });
  var sh = db_sayfa_(ad);
  // Düz metin biçimi: Sheets "2026-11-05" veya "09:30" gibi değerleri tarihe çevirmesin.
  sh.getRange(sh.getLastRow() + 1, 1, 1, satir.length).setNumberFormat('@').setValues([satir]);
  delete _okumaOnbellek[ad];
  return nesne;
}

/** id ile bulunan satırı `yama` alanlarıyla günceller, güncel kaydı döndürür. */
function db_guncelle_(ad, idSutun, id, yama) {
  var kayit = db_bul_(ad, idSutun, id);
  if (!kayit) throw new Error('Kayıt bulunamadı: ' + id);
  var basliklar = db_basliklar_(ad);
  var yeni = {};
  basliklar.forEach(function (b) { yeni[b] = kayit[b]; });
  Object.keys(yama).forEach(function (k) { yeni[k] = yama[k]; });
  if (basliklar.indexOf('GuncellemeZamani') !== -1) yeni.GuncellemeZamani = simdi_();
  var satir = basliklar.map(function (b) { return db_hucre_(yeni[b]); });
  db_sayfa_(ad).getRange(kayit._satir, 1, 1, satir.length).setNumberFormat('@').setValues([satir]);
  delete _okumaOnbellek[ad];
  yeni._satir = kayit._satir;
  return yeni;
}

/** Eşzamanlı yazmaları sıraya sokar. */
function kilitle_(fn) {
  var kilit = LockService.getScriptLock();
  if (!kilit.tryLock(20000)) throw new Error('Sistem şu anda yoğun, lütfen birkaç saniye sonra tekrar deneyin.');
  try {
    _okumaOnbellek = {}; // kilit altında her zaman taze oku
    return fn();
  } finally {
    SpreadsheetApp.flush();
    kilit.releaseLock();
  }
}

function yeniId_(onek) {
  var tarih = Utilities.formatDate(new Date(), APP.SAAT_DILIMI, 'yyyyMMdd');
  return onek + '-' + tarih + '-' + Utilities.getUuid().slice(0, 6).toUpperCase();
}

function bugun_() {
  return Utilities.formatDate(new Date(), APP.SAAT_DILIMI, 'yyyy-MM-dd');
}

function simdi_() {
  return Utilities.formatDate(new Date(), APP.SAAT_DILIMI, "yyyy-MM-dd'T'HH:mm:ss");
}

// -----------------------------------------------------------------------------
// Ayarlar
// -----------------------------------------------------------------------------

function ayar_(anahtar) {
  var kayit = db_hepsi_(SAYFA.AYARLAR).filter(function (k) { return k.Anahtar === anahtar; })[0];
  if (kayit && kayit.Deger !== '') return kayit.Deger;
  var v = VARSAYILAN_AYARLAR.filter(function (x) { return x[0] === anahtar; })[0];
  return v ? v[1] : '';
}

function ayarSayi_(anahtar) {
  var n = Number(ayar_(anahtar));
  return isNaN(n) ? 0 : n;
}

function resmiTatiller_() {
  return Logic.listeAyristir(ayar_('RESMI_TATILLER'));
}

// -----------------------------------------------------------------------------
// Log
// -----------------------------------------------------------------------------

function logYaz_(eposta, etkinlikId, islem, detay) {
  db_ekle_(SAYFA.LOG, {
    Zaman: simdi_(),
    Eposta: eposta || '',
    EtkinlikID: etkinlikId || '',
    Islem: islem,
    Detay: detay || ''
  });
}
