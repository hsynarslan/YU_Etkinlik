/**
 * Config.js — Sayfa adları, sütun başlıkları ve varsayılan ayarlar.
 *
 * Sütun eklerken: HEADERS'a ekleyin, docs/veri-modeli.md'yi güncelleyin,
 * sonra Apps Script editöründen `kurulum()` çalıştırın (eksik sütunları ekler).
 * Mevcut sütunların SIRASINI değiştirmeyin; yeni sütunu sona ekleyin.
 */

var APP = {
  AD: 'Yaşar Üniversitesi Etkinlik Yönetim Sistemi',
  SURUM: '0.1.0',
  SAAT_DILIMI: 'Europe/Istanbul'
};

var SAYFA = {
  ETKINLIKLER: 'Etkinlikler',
  MEKANLAR: 'Mekanlar',
  BIRIMLER: 'Birimler',
  KULLANICILAR: 'Kullanicilar',
  GOREVLER: 'Gorevler',
  LOG: 'Log',
  AYARLAR: 'Ayarlar'
};

var HEADERS = {
  Etkinlikler: [
    'EtkinlikID', 'Durum', 'Ad', 'Tur', 'DuzenleyenBirim', 'SorumluEposta',
    'MekanID', 'Tarih', 'BaslangicSaati', 'BitisSaati', 'KatilimciSayisi', 'ProtokolDuzeyi',
    'OnRezBitis', 'UzatmaSayisi',
    'EbysNo', 'EbysTarih', 'EbysEkUrl', 'EbysMuaf', 'MuafGerekce', 'KontrolNotu',
    'Detay', 'OlusturanEposta', 'OlusturmaZamani', 'GuncellemeZamani'
  ],
  Mekanlar: ['MekanID', 'Ad', 'Bina', 'Kapasite', 'SorumluBirim', 'Aktif'],
  Birimler: ['BirimID', 'Ad', 'Tur', 'Eposta'],
  Kullanicilar: ['Eposta', 'AdSoyad', 'Birim', 'Roller', 'OnayBirimleri', 'Aktif'],
  Gorevler: ['GorevID', 'EtkinlikID', 'Birim', 'Tur', 'Aciklama', 'Durum', 'Not', 'GuncelleyenEposta', 'GuncellemeZamani'],
  Log: ['Zaman', 'Eposta', 'EtkinlikID', 'Islem', 'Detay'],
  Ayarlar: ['Anahtar', 'Deger', 'Aciklama']
};

/** Ayarlar sayfasında değer yoksa kullanılacak varsayılanlar. */
var VARSAYILAN_AYARLAR = [
  ['ON_REZ_SURE_GUN', '10', 'Ön rezervasyonun geçerli olduğu iş günü sayısı'],
  ['UZATMA_GUN', '5', 'Bir uzatmada eklenecek iş günü'],
  ['MAX_UZATMA', '1', 'Bir ön rezervasyon en fazla kaç kez uzatılabilir'],
  ['ASGARI_BASVURU_GUN', '10', 'Standart etkinlikte etkinlik tarihine en az kaç gün kala başvurulmalı'],
  ['ASGARI_BASVURU_UST_DUZEY_GUN', '20', 'Üst düzey protokollü etkinlikte asgari başvuru süresi (gün)'],
  ['HATIRLATMA_GUN', '2', 'Ön rezervasyon bitişinden kaç iş günü önce hatırlatma gönderilsin'],
  ['IZINLI_ALAN_ADI', 'yasar.edu.tr', 'Yalnızca bu alan adındaki hesaplar giriş yapabilir (boş = kontrol yok)'],
  ['EBYS_NO_REGEX', '^[A-Za-z0-9./\\-]{4,40}$', 'EBYS numarası biçimi (düzenli ifade). Gerçek biçime göre güncelleyin.'],
  ['EBYS_PDF_KLASOR_ID', '', 'EBYS onay yazılarının kaydedileceği Drive klasörü (kurulum doldurur)'],
  ['EBYS_PDF_MAX_MB', '10', 'Yüklenebilecek en büyük PDF boyutu (MB)'],
  ['RESMI_TATILLER', '', 'Virgülle ayrılmış YYYY-AA-GG tarihleri; iş günü hesabında atlanır'],
  ['BILDIRIM_AKTIF', 'EVET', 'EVET ise e-posta bildirimleri gönderilir'],
  ['UYGULAMA_URL', '', 'Web uygulamasının adresi (e-postalardaki bağlantı için)']
];

var ETKINLIK_TURLERI = [
  'Konferans', 'Seminer', 'Panel', 'Çalıştay', 'Söyleşi', 'Kulüp etkinliği',
  'Mezuniyet / tören', 'Sportif', 'Sosyal / kültürel', 'Diğer'
];
