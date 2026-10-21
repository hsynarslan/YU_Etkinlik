/**
 * Rezervasyon.js — Ön rezervasyon, uzatma, iptal, yedek sıra ve günlük süre kontrolü.
 */

/**
 * Yeni ön rezervasyon (veya yetkili birim için EBYS'siz etkinlik) açar.
 * Mekân doluysa `yedegeAl` gönderilmediği sürece { cakisma: true } döner; istemci kullanıcıya sorar.
 */
function api_onRezervasyonOlustur(form) {
  return api_(function () {
    return kilitle(function () {
      var k = aktifKullanici();
      yetkiGerekli(k, 'ON_REZ_OLUSTUR');
      var muaf = form.ebysMuaf === true || form.ebysMuaf === 'true';
      if (muaf) yetkiGerekli(k, 'EBYS_MUAF_KULLAN');

      var mekan = db_bul(SAYFA.MEKANLAR, 'MekanID', form.mekanId);
      if (mekan && String(mekan.Aktif).toUpperCase() === 'HAYIR') mekan = null;

      var f = {
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
      var hatalar = Logic.onRezervasyonDogrula(f, {
        bugun: bugun(),
        mekan: mekan,
        asgariGun: ayarSayi('ASGARI_BASVURU_GUN'),
        asgariUstDuzeyGun: ayarSayi('ASGARI_BASVURU_UST_DUZEY_GUN')
      });
      if (hatalar.length) throw new Error(hatalar.join(' '));

      // Düzenleyen birim: varsayılan kullanıcının birimi; yönetici ve EBYS muaf yetkilisi başka birim adına açabilir.
      var birim = k.birim;
      var digerBirim = String(form.duzenleyenBirim || '').trim().toUpperCase();
      if (digerBirim && digerBirim !== birim &&
          (Logic.rolVar(k, Logic.ROLLER.YONETICI) || Logic.rolVar(k, Logic.ROLLER.EBYS_MUAF))) {
        birim = digerBirim;
      }

      var kayit = {
        EtkinlikID: yeniId('ETK'),
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
        OlusturmaZamani: simdi(),
        GuncellemeZamani: simdi()
      };

      var cakisanlar = Logic.cakismaBul(kayit, db_hepsi(SAYFA.ETKINLIKLER));
      if (cakisanlar.length && !form.yedegeAl) {
        return {
          cakisma: true,
          mesaj: 'Seçilen mekân bu saat aralığında dolu.',
          cakisanlar: cakisanlar.map(function (c) {
            return { Ad: c.Ad, Saat: c.BaslangicSaati + '–' + c.BitisSaati, Durum: Logic.DURUM_ETIKET[c.Durum] };
          })
        };
      }

      var D = Logic.DURUM;
      if (cakisanlar.length) kayit.Durum = D.YEDEK;
      else kayit.Durum = muaf ? D.DETAY_BEKLENIYOR : D.ON_REZERVASYON;
      if (kayit.Durum === D.ON_REZERVASYON) kayit.OnRezBitis = onRezBitisHesapla_(bugun(), ayarSayi('ON_REZ_SURE_GUN'), kayit.Tarih);

      db_ekle(SAYFA.ETKINLIKLER, kayit);
      logYaz(k.eposta, kayit.EtkinlikID, 'OLUSTURULDU',
        kayit.Durum + (muaf ? ' · EBYS muaf · Gerekçe: ' + kayit.MuafGerekce : ''));

      if (muaf) {
        bildir(yoneticiler(), 'EBYS\'siz etkinlik açıldı',
          etkinlikOzeti(kayit) + '<br>Açan: ' + htmlKacis(k.adSoyad) + '<br>Gerekçe: ' + htmlKacis(kayit.MuafGerekce) +
          (kayit.Durum === D.YEDEK ? '<br><b>Mekân dolu olduğu için yedek sıraya alındı; öncelik kararı yöneticide.</b>' : ''),
          kayit.EtkinlikID);
      }

      var mesaj = kayit.Durum === D.YEDEK ? 'Talebiniz yedek sıraya alındı. Mekân boşalırsa bilgilendirileceksiniz.'
        : kayit.Durum === D.ON_REZERVASYON ? 'Ön rezervasyon oluşturuldu. EBYS numarasını ' + kayit.OnRezBitis + ' tarihine kadar girmelisiniz.'
        : 'Etkinlik oluşturuldu. Şimdi detaylı etkinlik formunu doldurabilirsiniz.';
      return { etkinlik: istemciEtkinlik_(kayit), mesaj: mesaj };
    });
  });
}

/** Ön rezervasyon süresini bir kez (MAX_UZATMA kadar) uzatır. */
function api_uzat(etkinlikId, gerekce) {
  return api_(function () {
    return kilitle(function () {
      var k = aktifKullanici();
      var e = db_bul(SAYFA.ETKINLIKLER, 'EtkinlikID', etkinlikId);
      if (!e) throw new Error('Etkinlik bulunamadı.');
      yetkiGerekli(k, 'ETKINLIK_SAHIBI', e);
      if (e.Durum !== Logic.DURUM.ON_REZERVASYON) throw new Error('Yalnızca ön rezervasyon aşamasında süre uzatılabilir.');
      if (Number(e.UzatmaSayisi || 0) >= ayarSayi('MAX_UZATMA')) throw new Error('Uzatma hakkınız kalmadı.');
      if (!String(gerekce || '').trim()) throw new Error('Uzatma gerekçesi zorunludur.');

      var baz = e.OnRezBitis && e.OnRezBitis >= bugun() ? e.OnRezBitis : bugun();
      var yeniBitis = onRezBitisHesapla_(baz, ayarSayi('UZATMA_GUN'), e.Tarih);
      var g = db_guncelle(SAYFA.ETKINLIKLER, 'EtkinlikID', etkinlikId, {
        OnRezBitis: yeniBitis,
        UzatmaSayisi: String(Number(e.UzatmaSayisi || 0) + 1)
      });
      logYaz(k.eposta, etkinlikId, 'SURE_UZATILDI', e.OnRezBitis + ' → ' + yeniBitis + ' · ' + gerekce);
      return { etkinlik: istemciEtkinlik_(g), mesaj: 'Süre ' + yeniBitis + ' tarihine uzatıldı.' };
    });
  });
}

/** Etkinliği iptal eder; mekân boşalırsa sıradaki yedeği terfi ettirir. */
function api_iptal(etkinlikId, gerekce) {
  return api_(function () {
    return kilitle(function () {
      var k = aktifKullanici();
      var e = db_bul(SAYFA.ETKINLIKLER, 'EtkinlikID', etkinlikId);
      if (!e) throw new Error('Etkinlik bulunamadı.');
      yetkiGerekli(k, 'ETKINLIK_SAHIBI', e);
      Logic.gecisKontrol(e.Durum, Logic.DURUM.IPTAL);
      db_guncelle(SAYFA.ETKINLIKLER, 'EtkinlikID', etkinlikId, { Durum: Logic.DURUM.IPTAL });
      logYaz(k.eposta, etkinlikId, 'IPTAL', gerekce || '');

      // Görev açılmış birimlere haber ver
      var birimler = db_hepsi(SAYFA.GOREVLER)
        .filter(function (g) { return g.EtkinlikID === etkinlikId; })
        .map(function (g) { return g.Birim; });
      var alicilar = [];
      birimler.forEach(function (b) { alicilar = alicilar.concat(epostalar({ rol: Logic.ROLLER.HIZMET_BIRIMI, birim: b })); });
      bildir(alicilar, 'Etkinlik iptal edildi', etkinlikOzeti(e) + '<br>Gerekçe: ' + htmlKacis(gerekce || '-'), etkinlikId);

      mekanBosaldi_(e);
      return { mesaj: 'Etkinlik iptal edildi.' };
    });
  });
}

/** Ön rezervasyon bitişi: bazdan n iş günü sonrası, ama etkinlik tarihinden sonra olamaz. */
function onRezBitisHesapla_(baz, isGunu, etkinlikTarihi) {
  var hesap = Logic.isGunuEkle(baz, isGunu, resmiTatiller());
  return hesap > etkinlikTarihi ? etkinlikTarihi : hesap;
}

/** Bir kayıt mekânı boşalttığında sıradaki yedeği terfi ettirir. Kilit içinde çağrılmalıdır. */
function mekanBosaldi_(bosalan) {
  var sira = Logic.siradakiYedek(bosalan, db_hepsi(SAYFA.ETKINLIKLER));
  if (!sira) return null;
  var D = Logic.DURUM;
  var yeniDurum = sira.EbysMuaf === 'EVET' ? D.DETAY_BEKLENIYOR : D.ON_REZERVASYON;
  var yama = { Durum: yeniDurum };
  if (yeniDurum === D.ON_REZERVASYON) yama.OnRezBitis = onRezBitisHesapla_(bugun(), ayarSayi('ON_REZ_SURE_GUN'), sira.Tarih);
  db_guncelle(SAYFA.ETKINLIKLER, 'EtkinlikID', sira.EtkinlikID, yama);
  logYaz('sistem', sira.EtkinlikID, 'YEDEKTEN_TERFI', 'Boşalan: ' + bosalan.EtkinlikID);
  bildir(sira.SorumluEposta, 'Mekân size açıldı',
    etkinlikOzeti(sira) + '<br>Yedek sıradaki talebiniz için mekân boşaldı.' +
    (yama.OnRezBitis ? ' EBYS numarasını ' + yama.OnRezBitis + ' tarihine kadar girmelisiniz.' : ''),
    sira.EtkinlikID);
  return sira;
}

/**
 * Zamanlanmış görev (her gece 02:00, kurulum() kurar):
 * - Süresi dolan ön rezervasyonları düşürür ve yedeği terfi ettirir
 * - Bitişi yaklaşanlara hatırlatma gönderir
 * - Tarihi geçmiş kesinleşmiş etkinlikleri TAMAMLANDI yapar
 */
function gunlukSureKontrolu() {
  kilitle(function () {
    var D = Logic.DURUM;
    var gun = bugun();
    var hatirlatmaTarihi = Logic.isGunuEkle(gun, ayarSayi('HATIRLATMA_GUN') || 2, resmiTatiller());
    var liste = db_hepsi(SAYFA.ETKINLIKLER).slice();

    liste.forEach(function (e) {
      if (e.Durum === D.ON_REZERVASYON && e.OnRezBitis) {
        if (e.OnRezBitis < gun) {
          db_guncelle(SAYFA.ETKINLIKLER, 'EtkinlikID', e.EtkinlikID, { Durum: D.SURESI_DOLDU });
          logYaz('sistem', e.EtkinlikID, 'SURESI_DOLDU', 'Bitiş: ' + e.OnRezBitis);
          bildir(e.SorumluEposta, 'Ön rezervasyon süresi doldu',
            etkinlikOzeti(e) + '<br>EBYS numarası girilmediği için ön rezervasyon düştü ve mekân serbest bırakıldı.',
            e.EtkinlikID);
          mekanBosaldi_(e);
        } else if (e.OnRezBitis === hatirlatmaTarihi) {
          bildir(e.SorumluEposta, 'Ön rezervasyon süresi yaklaşıyor',
            etkinlikOzeti(e) + '<br>EBYS numarasını en geç ' + e.OnRezBitis + ' tarihine kadar girmelisiniz.',
            e.EtkinlikID);
        }
      } else if (e.Durum === D.KESINLESTI && e.Tarih < gun) {
        db_guncelle(SAYFA.ETKINLIKLER, 'EtkinlikID', e.EtkinlikID, { Durum: D.TAMAMLANDI });
        logYaz('sistem', e.EtkinlikID, 'TAMAMLANDI', '');
      }
    });
  });
}
