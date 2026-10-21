// Sunucu kodunun uçtan uca akış testi (sahte Google servisleriyle). Çalıştırma: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { yukle } = require('./gas-mock');

const PDF = { ad: 'onay.pdf', mimeType: 'application/pdf', base64: Buffer.from('%PDF-1.4 deneme').toString('base64') };

function ortam() {
  const g = yukle();
  const c = g.ctx;
  c.kurulum();
  const kullanicilar = [
    ['talep@yasar.edu.tr', 'Ayşe Talep', 'MUH', 'TALEP_EDEN', ''],
    ['talep2@yasar.edu.tr', 'Can Talep', 'IIBF', 'TALEP_EDEN', ''],
    ['onay@yasar.edu.tr', 'Oya Onay', 'MUH', 'BIRIM_ONAYCI', 'MUH'],
    ['bi@yasar.edu.tr', 'Bilgi İşlem', 'BILGI_ISLEM', 'HIZMET_BIRIMI', ''],
    ['ki@yasar.edu.tr', 'Kurumsal İletişim', 'KURUMSAL_ILETISIM', 'HIZMET_BIRIMI', ''],
    ['gs@yasar.edu.tr', 'Genel Sekreterlik', 'GENEL_SEKRETERLIK', 'EBYS_MUAF', '']
  ];
  kullanicilar.forEach(([Eposta, AdSoyad, Birim, Roller, OnayBirimleri]) =>
    c.db_ekle('Kullanicilar', { Eposta, AdSoyad, Birim, Roller, OnayBirimleri, Aktif: 'EVET' }));
  c.db_ekle('Mekanlar', { MekanID: 'KS', Ad: 'Konferans Salonu', Bina: 'A', Kapasite: '200', SorumluBirim: 'TEKNIK_ISLER', Aktif: 'EVET' });
  const bugun = c.bugun();
  const ileri = c.Logic.isGunuEkle(bugun, 15);
  const giris = (eposta) => { g.oturum.eposta = eposta; };
  const etkinlik = (id) => c.db_bul('Etkinlikler', 'EtkinlikID', id);
  return { g, c, bugun, ileri, giris, etkinlik };
}

function talep(ileri, ek) {
  return Object.assign({ ad: 'Kariyer Günü', tur: 'Panel', mekanId: 'KS', tarih: ileri,
    baslangic: '10:00', bitis: '12:00', katilimciSayisi: '120', protokolDuzeyi: 'STANDART' }, ek);
}

test('kurulum sayfaları, ayarları ve ilk yöneticiyi hazırlar', () => {
  const { c, g } = ortam();
  const sayfalar = g.tablo().getSheets().map((s) => s.getName());
  ['Etkinlikler', 'Mekanlar', 'Birimler', 'Kullanicilar', 'Gorevler', 'Log', 'Ayarlar'].forEach((s) => assert.ok(sayfalar.includes(s), s));
  assert.ok(!sayfalar.includes('Sheet1'));
  assert.equal(c.ayar('ON_REZ_SURE_GUN'), '10');
  assert.equal(c.ayar('EBYS_PDF_KLASOR_ID'), 'KLASOR1');
  assert.equal(c.kullaniciBul('kurucu@yasar.edu.tr').roller[0], 'YONETICI');
  assert.equal(c.db_hepsi('Birimler').length, 6);
  c.kurulum(); // ikinci kez çalıştırmak güvenli olmalı
  assert.equal(c.db_hepsi('Birimler').length, 6);
  assert.equal(c.db_hepsi('Ayarlar').length, c.VARSAYILAN_AYARLAR.length);
});

test('tam akış: ön rezervasyon → EBYS → iade → onay → detay → görevler → kesinleşme → iptal ve yedek terfisi', () => {
  const { c, g, ileri, giris, etkinlik } = ortam();

  giris('talep@yasar.edu.tr');
  let r = c.api_onRezervasyonOlustur(talep(ileri));
  assert.equal(r.ok, true, r.mesaj);
  const id = r.etkinlik.EtkinlikID;
  assert.equal(etkinlik(id).Durum, 'ON_REZERVASYON');
  assert.ok(etkinlik(id).OnRezBitis > c.bugun());

  // Başka birim aynı saate talep açar → önce çakışma uyarısı, sonra yedek
  giris('talep2@yasar.edu.tr');
  r = c.api_onRezervasyonOlustur(talep(ileri, { ad: 'Girişimcilik Paneli', baslangic: '11:00', bitis: '13:00' }));
  assert.equal(r.cakisma, true);
  assert.equal(r.cakisanlar[0].Ad, 'Kariyer Günü');
  r = c.api_onRezervasyonOlustur(talep(ileri, { ad: 'Girişimcilik Paneli', baslangic: '11:00', bitis: '13:00', yedegeAl: true }));
  const yedekId = r.etkinlik.EtkinlikID;
  assert.equal(etkinlik(yedekId).Durum, 'YEDEK');

  // Sahibi olmayan EBYS giremez
  r = c.api_ebysGonder(id, { ebysNo: 'E-123456', ebysTarih: c.bugun(), dosya: PDF });
  assert.equal(r.ok, false);

  giris('talep@yasar.edu.tr');
  r = c.api_ebysGonder(id, { ebysNo: 'E-123456', ebysTarih: c.bugun() });
  assert.equal(r.ok, false);
  assert.match(r.mesaj, /PDF/);
  r = c.api_ebysGonder(id, { ebysNo: 'E-123456', ebysTarih: c.bugun(), dosya: PDF });
  assert.equal(r.ok, true, r.mesaj);
  assert.equal(etkinlik(id).Durum, 'EBYS_KONTROL');
  assert.equal(g.dosyalar.length, 1);
  assert.ok(g.gonderilenler.some((m) => m.to.includes('onay@yasar.edu.tr')), 'onaycıya e-posta gitmeli');

  // Başka birimin onaycısı değil, MUH onaycısı karar verir; iade notsuz olmaz
  giris('talep2@yasar.edu.tr');
  assert.equal(c.api_ebysKarar(id, true, '').ok, false);
  giris('onay@yasar.edu.tr');
  assert.equal(c.api_baslangic().onayBekleyenler.length, 1);
  assert.equal(c.api_ebysKarar(id, false, '').ok, false);
  assert.equal(c.api_ebysKarar(id, false, 'Onay tarihi hatalı').ok, true);
  assert.equal(etkinlik(id).Durum, 'ON_REZERVASYON');
  assert.equal(etkinlik(id).KontrolNotu, 'Onay tarihi hatalı');

  giris('talep@yasar.edu.tr');
  assert.equal(c.api_ebysGonder(id, { ebysNo: 'E-123456', ebysTarih: c.bugun(), dosya: PDF }).ok, true);
  giris('onay@yasar.edu.tr');
  assert.equal(c.api_ebysKarar(id, true, '').ok, true);
  assert.equal(etkinlik(id).Durum, 'DETAY_BEKLENIYOR');

  // Detay formu → iki birime görev
  giris('talep@yasar.edu.tr');
  r = c.api_detayKaydet(id, { afis: 'DIJITAL', afisTasarim: 'KURUMSAL_ILETISIM', duyuru: [], ses: true, mikrofonSayisi: '2', ikram: 'YOK', oturmaDuzeni: 'MEVCUT' });
  assert.equal(r.ok, true, r.mesaj);
  assert.equal(etkinlik(id).Durum, 'HAZIRLIK');
  const gorevler = c.db_hepsi('Gorevler').filter((x) => x.EtkinlikID === id);
  assert.deepEqual(Array.from(gorevler, (x) => x.Birim).sort(), ['BILGI_ISLEM', 'KURUMSAL_ILETISIM']);
  assert.equal(c.api_baslangic().etkinliklerim[0].Detay.ses, true);

  // Her birim yalnızca kendi görevini günceller
  const biGorev = gorevler.find((x) => x.Birim === 'BILGI_ISLEM');
  const kiGorev = gorevler.find((x) => x.Birim === 'KURUMSAL_ILETISIM');
  giris('bi@yasar.edu.tr');
  assert.equal(c.api_baslangic().gorevlerim.length, 1);
  assert.equal(c.api_gorevGuncelle(kiGorev.GorevID, 'KABUL', '').ok, false);
  assert.equal(c.api_gorevGuncelle(biGorev.GorevID, 'RED', '').ok, false, 'red için not zorunlu');
  assert.equal(c.api_gorevGuncelle(biGorev.GorevID, 'KABUL', '').ok, true);
  assert.equal(etkinlik(id).Durum, 'HAZIRLIK');
  giris('ki@yasar.edu.tr');
  assert.equal(c.api_gorevGuncelle(kiGorev.GorevID, 'KABUL', 'Afiş 3 gün içinde').ok, true);
  assert.equal(etkinlik(id).Durum, 'KESINLESTI');

  // Takvimde görünür
  assert.ok(c.api_baslangic().takvim.some((x) => x.EtkinlikID === id));

  // İptal → yedek terfi eder
  giris('talep@yasar.edu.tr');
  assert.equal(c.api_iptal(id, 'Ertelendi').ok, true);
  assert.equal(etkinlik(id).Durum, 'IPTAL');
  assert.equal(etkinlik(yedekId).Durum, 'ON_REZERVASYON');
  assert.ok(etkinlik(yedekId).OnRezBitis);

  // Log her adımı tutar
  const islemler = c.db_hepsi('Log').filter((x) => x.EtkinlikID === id).map((x) => x.Islem);
  ['OLUSTURULDU', 'EBYS_GIRILDI', 'EBYS_IADE', 'EBYS_ONAYLANDI', 'DETAY_KAYDEDILDI', 'GOREV_KABUL', 'KESINLESTI', 'IPTAL']
    .forEach((x) => assert.ok(islemler.includes(x), x));
});

test('EBYS muafiyeti yalnızca yetkili rolde, gerekçeyle ve asgari süre aranmadan', () => {
  const { c, bugun, giris, etkinlik } = ortam();
  const yakin = c.Logic.isGunuEkle(bugun, 2);

  giris('talep@yasar.edu.tr');
  let r = c.api_onRezervasyonOlustur(talep(yakin, { ebysMuaf: true, muafGerekce: 'x' }));
  assert.equal(r.ok, false);
  assert.match(r.mesaj, /yetkiniz/);

  giris('gs@yasar.edu.tr');
  r = c.api_onRezervasyonOlustur(talep(yakin, { ebysMuaf: true }));
  assert.equal(r.ok, false);
  assert.match(r.mesaj, /gerekçe/);
  r = c.api_onRezervasyonOlustur(talep(yakin, { ebysMuaf: true, muafGerekce: 'Bakan ziyareti', protokolDuzeyi: 'UST_DUZEY' }));
  assert.equal(r.ok, true, r.mesaj);
  const id = r.etkinlik.EtkinlikID;
  assert.equal(etkinlik(id).Durum, 'DETAY_BEKLENIYOR');
  assert.equal(etkinlik(id).EbysMuaf, 'EVET');

  // Sonradan EBYS bağlama, durum değişmeden
  r = c.api_ebysSonradanBagla(id, { ebysNo: 'E-999999', ebysTarih: bugun });
  assert.equal(r.ok, true, r.mesaj);
  assert.equal(etkinlik(id).EbysNo, 'E-999999');
  assert.equal(etkinlik(id).Durum, 'DETAY_BEKLENIYOR');

  // Üst düzey protokol → güvenlik ve protokol görevleri
  r = c.api_detayKaydet(id, { afis: 'YOK', ikram: 'YOK', oturmaDuzeni: 'MEVCUT', duyuru: [], protokolListesi: 'Bakan' });
  assert.equal(r.ok, true, r.mesaj);
  const birimler = Array.from(c.db_hepsi('Gorevler').filter((x) => x.EtkinlikID === id), (x) => x.Birim).sort();
  assert.deepEqual(birimler, ['GUVENLIK', 'PROTOKOL']);
});

test('asgari başvuru süresi ve aynı EBYS numarasının tekrar kullanımı engellenir', () => {
  const { c, bugun, ileri, giris } = ortam();
  giris('talep@yasar.edu.tr');
  let r = c.api_onRezervasyonOlustur(talep(c.Logic.isGunuEkle(bugun, 3)));
  assert.equal(r.ok, false);
  assert.match(r.mesaj, /en az 10 gün/);

  const a = c.api_onRezervasyonOlustur(talep(ileri)).etkinlik.EtkinlikID;
  const b = c.api_onRezervasyonOlustur(talep(ileri, { baslangic: '14:00', bitis: '15:00' })).etkinlik.EtkinlikID;
  assert.equal(c.api_ebysGonder(a, { ebysNo: 'E-111111', ebysTarih: bugun, dosya: PDF }).ok, true);
  r = c.api_ebysGonder(b, { ebysNo: 'e-111111', ebysTarih: bugun, dosya: PDF });
  assert.equal(r.ok, false);
  assert.match(r.mesaj, /başka bir etkinlikte/);
});

test('uzatma bir kez yapılır; süresi dolan ön rezervasyon gece görevinde düşer', () => {
  const { c, ileri, giris, etkinlik } = ortam();
  giris('talep@yasar.edu.tr');
  const id = c.api_onRezervasyonOlustur(talep(ileri)).etkinlik.EtkinlikID;
  const ilkBitis = etkinlik(id).OnRezBitis;
  assert.equal(c.api_uzat(id, '').ok, false, 'gerekçe zorunlu');
  assert.equal(c.api_uzat(id, 'Rektörlükte bekliyor').ok, true);
  assert.ok(etkinlik(id).OnRezBitis > ilkBitis);
  assert.equal(c.api_uzat(id, 'Tekrar').ok, false, 'MAX_UZATMA = 1');

  c.db_guncelle('Etkinlikler', 'EtkinlikID', id, { OnRezBitis: '2020-01-01' });
  c.gunlukSureKontrolu();
  assert.equal(etkinlik(id).Durum, 'SURESI_DOLDU');
});

test('tanımsız kullanıcı ve başka alan adı giremez', () => {
  const { c, giris } = ortam();
  giris('yabanci@yasar.edu.tr');
  let r = c.api_baslangic();
  assert.equal(r.ok, false);
  assert.match(r.mesaj, /tanımlı değil/);
  giris('biri@gmail.com');
  r = c.api_baslangic();
  assert.equal(r.ok, false);
  assert.match(r.mesaj, /yasar\.edu\.tr/);
});
