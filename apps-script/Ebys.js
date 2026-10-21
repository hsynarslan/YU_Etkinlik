/**
 * Ebys.js — EBYS numarası girişi, onaycı kontrolü ve muaf etkinliklere sonradan EBYS bağlama.
 *
 * Sistem EBYS'ye doğrudan bağlanmaz. Doğrulama üç adımlıdır:
 *   1) Numara biçimi (Ayarlar > EBYS_NO_REGEX)
 *   2) Aynı numaranın başka aktif etkinlikte kullanılmamış olması
 *   3) EBYS onay yazısının PDF olarak eklenmesi + birim onaycısının kontrolü
 */

/**
 * veri: { ebysNo, ebysTarih, dosya: { ad, mimeType, base64 } }
 */
function api_ebysGonder(etkinlikId, veri) {
  return api_(function () {
    return kilitle(function () {
      var k = aktifKullanici();
      var e = db_bul(SAYFA.ETKINLIKLER, 'EtkinlikID', etkinlikId);
      if (!e) throw new Error('Etkinlik bulunamadı.');
      yetkiGerekli(k, 'ETKINLIK_SAHIBI', e);
      Logic.gecisKontrol(e.Durum, Logic.DURUM.EBYS_KONTROL);

      var no = ebysNoKontrol_(veri && veri.ebysNo, etkinlikId);
      if (!Logic.tarihGecerliMi(veri.ebysTarih)) throw new Error('EBYS onay tarihi geçerli değil.');
      if (!veri.dosya || !veri.dosya.base64) throw new Error('EBYS onay yazısını PDF olarak eklemelisiniz.');
      var url = ebysPdfKaydet_(etkinlikId, no, veri.dosya);

      var g = db_guncelle(SAYFA.ETKINLIKLER, 'EtkinlikID', etkinlikId, {
        EbysNo: no, EbysTarih: veri.ebysTarih, EbysEkUrl: url, KontrolNotu: '',
        Durum: Logic.DURUM.EBYS_KONTROL
      });
      logYaz(k.eposta, etkinlikId, 'EBYS_GIRILDI', no);

      var onaycilar = epostalar({ rol: Logic.ROLLER.BIRIM_ONAYCI, onayBirimi: e.DuzenleyenBirim });
      bildir(onaycilar.length ? onaycilar : yoneticiler(), 'EBYS kontrolü bekleyen etkinlik',
        etkinlikOzeti(e) + '<br>EBYS no: ' + htmlKacis(no) + ' · <a href="' + url + '">Onay yazısı</a>', etkinlikId);
      return { etkinlik: istemciEtkinlik_(g), mesaj: 'EBYS bilgileri gönderildi; onaycı kontrolü bekleniyor.' };
    });
  });
}

/** Birim onaycısı (veya yönetici) EBYS kaydını onaylar ya da düzeltme için iade eder. */
function api_ebysKarar(etkinlikId, onay, not) {
  return api_(function () {
    return kilitle(function () {
      var k = aktifKullanici();
      var e = db_bul(SAYFA.ETKINLIKLER, 'EtkinlikID', etkinlikId);
      if (!e) throw new Error('Etkinlik bulunamadı.');
      yetkiGerekli(k, 'EBYS_ONAYLA', e);
      var D = Logic.DURUM;
      not = String(not || '').trim();

      if (onay) {
        Logic.gecisKontrol(e.Durum, D.DETAY_BEKLENIYOR);
        db_guncelle(SAYFA.ETKINLIKLER, 'EtkinlikID', etkinlikId, { Durum: D.DETAY_BEKLENIYOR, KontrolNotu: not });
        logYaz(k.eposta, etkinlikId, 'EBYS_ONAYLANDI', not);
        bildir(e.SorumluEposta, 'EBYS kaydınız onaylandı',
          etkinlikOzeti(e) + '<br>Şimdi detaylı etkinlik formunu doldurabilirsiniz.', etkinlikId);
        return { mesaj: 'Onaylandı.' };
      }

      if (!not) throw new Error('İade için açıklama zorunludur.');
      Logic.gecisKontrol(e.Durum, D.ON_REZERVASYON);
      var yama = { Durum: D.ON_REZERVASYON, KontrolNotu: not };
      // Kontrol sırasında süre dolduysa düzeltme için 2 iş günü tanı
      if (!e.OnRezBitis || e.OnRezBitis < bugun()) yama.OnRezBitis = onRezBitisHesapla_(bugun(), 2, e.Tarih);
      db_guncelle(SAYFA.ETKINLIKLER, 'EtkinlikID', etkinlikId, yama);
      logYaz(k.eposta, etkinlikId, 'EBYS_IADE', not);
      bildir(e.SorumluEposta, 'EBYS kaydınız iade edildi',
        etkinlikOzeti(e) + '<br>Açıklama: ' + htmlKacis(not) + '<br>Lütfen düzeltip yeniden gönderin.', etkinlikId);
      return { mesaj: 'Düzeltme için iade edildi.' };
    });
  });
}

/** EBYS'siz açılmış etkinliğe sonradan EBYS numarası bağlar (durum değişmez). */
function api_ebysSonradanBagla(etkinlikId, veri) {
  return api_(function () {
    return kilitle(function () {
      var k = aktifKullanici();
      var e = db_bul(SAYFA.ETKINLIKLER, 'EtkinlikID', etkinlikId);
      if (!e) throw new Error('Etkinlik bulunamadı.');
      yetkiGerekli(k, 'EBYS_SONRADAN_BAGLA', e);
      if (e.EbysMuaf !== 'EVET') throw new Error('Bu işlem yalnızca EBYS\'siz açılmış etkinlikler içindir.');
      if (e.EbysNo) throw new Error('Bu etkinliğin EBYS numarası zaten var.');
      if (Logic.DURUM.IPTAL === e.Durum) throw new Error('İptal edilmiş etkinliğe EBYS bağlanamaz.');

      var no = ebysNoKontrol_(veri && veri.ebysNo, etkinlikId);
      var yama = { EbysNo: no, EbysTarih: Logic.tarihGecerliMi(veri.ebysTarih) ? veri.ebysTarih : '' };
      if (veri.dosya && veri.dosya.base64) yama.EbysEkUrl = ebysPdfKaydet_(etkinlikId, no, veri.dosya);
      var g = db_guncelle(SAYFA.ETKINLIKLER, 'EtkinlikID', etkinlikId, yama);
      logYaz(k.eposta, etkinlikId, 'EBYS_SONRADAN_BAGLANDI', no);
      return { etkinlik: istemciEtkinlik_(g), mesaj: 'EBYS numarası etkinliğe bağlandı.' };
    });
  });
}

function ebysNoKontrol_(ebysNo, etkinlikId) {
  var no = String(ebysNo || '').trim();
  if (!Logic.ebysNoGecerliMi(no, ayar('EBYS_NO_REGEX'))) throw new Error('EBYS numarası geçerli biçimde değil.');
  var D = Logic.DURUM;
  var kullanilmis = db_hepsi(SAYFA.ETKINLIKLER).some(function (x) {
    return x.EtkinlikID !== etkinlikId &&
      String(x.EbysNo).toLowerCase() === no.toLowerCase() &&
      x.Durum !== D.IPTAL && x.Durum !== D.SURESI_DOLDU;
  });
  if (kullanilmis) throw new Error('Bu EBYS numarası başka bir etkinlikte kullanılıyor.');
  return no;
}

function ebysPdfKaydet_(etkinlikId, no, dosya) {
  if (dosya.mimeType !== 'application/pdf') throw new Error('Yalnızca PDF dosyası yüklenebilir.');
  var boyutMb = (dosya.base64.length * 3 / 4) / (1024 * 1024);
  var sinir = ayarSayi('EBYS_PDF_MAX_MB') || 10;
  if (boyutMb > sinir) throw new Error('PDF en fazla ' + sinir + ' MB olabilir.');

  var klasorId = ayar('EBYS_PDF_KLASOR_ID');
  if (!klasorId) throw new Error('EBYS klasörü tanımlı değil. kurulum() fonksiyonunu çalıştırın.');
  var adi = etkinlikId + '_' + no.replace(/[^A-Za-z0-9.-]/g, '_') + '.pdf';
  var blob = Utilities.newBlob(Utilities.base64Decode(dosya.base64), 'application/pdf', adi);
  var file = DriveApp.getFolderById(klasorId).createFile(blob);
  try {
    // Onaycılar açabilsin diye alan içinde bağlantıyla görüntüleme. Kurum politikası engellerse klasör paylaşımı kullanılır.
    file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (ignore) {}
  return file.getUrl();
}
