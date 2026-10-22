// Saf iş kuralları testleri. Çalıştırma: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const Logic = require('../sunucu/logic.js');

const D = Logic.DURUM;

function kayit(o) {
  return Object.assign({
    EtkinlikID: 'E1', MekanID: 'KS', Tarih: '2026-11-10',
    BaslangicSaati: '10:00', BitisSaati: '12:00', Durum: D.ON_REZERVASYON,
    OlusturmaZamani: '2026-10-21T10:00:00'
  }, o);
}

test('tarih ve saat doğrulama', () => {
  assert.equal(Logic.tarihGecerliMi('2026-02-28'), true);
  assert.equal(Logic.tarihGecerliMi('2026-02-30'), false);
  assert.equal(Logic.tarihGecerliMi('30.10.2026'), false);
  assert.equal(Logic.saatGecerliMi('09:30'), true);
  assert.equal(Logic.saatGecerliMi('24:00'), false);
  assert.equal(Logic.saatDakika('01:30'), 90);
});

test('iş günü ekleme hafta sonunu ve tatilleri atlar', () => {
  // 2026-10-23 Cuma
  assert.equal(Logic.isGunuEkle('2026-10-23', 1), '2026-10-26');
  assert.equal(Logic.isGunuEkle('2026-10-21', 10), '2026-11-04');
  // 29 Ekim Cumhuriyet Bayramı tatil verilirse bir gün kayar
  assert.equal(Logic.isGunuEkle('2026-10-21', 10, ['2026-10-29']), '2026-11-05');
  assert.equal(Logic.gunFarki('2026-10-21', '2026-11-04'), 14);
});

test('zaman çakışması: uç uca etkinlikler çakışmaz', () => {
  assert.equal(Logic.zamanCakisiyor('10:00', '12:00', '11:00', '13:00'), true);
  assert.equal(Logic.zamanCakisiyor('10:00', '12:00', '12:00', '13:00'), false);
  assert.equal(Logic.zamanCakisiyor('10:00', '12:00', '09:00', '10:00'), false);
  assert.equal(Logic.zamanCakisiyor('10:00', '12:00', '09:00', '15:00'), true);
});

test('cakismaBul yalnızca aynı mekân, tarih ve aktif durumlara bakar', () => {
  const mevcut = [
    kayit({ EtkinlikID: 'A' }),
    kayit({ EtkinlikID: 'B', MekanID: 'SEM1' }),
    kayit({ EtkinlikID: 'C', Tarih: '2026-11-11' }),
    kayit({ EtkinlikID: 'D', Durum: D.IPTAL }),
    kayit({ EtkinlikID: 'E', Durum: D.YEDEK }),
    kayit({ EtkinlikID: 'F', Durum: D.KESINLESTI, BaslangicSaati: '11:30', BitisSaati: '14:00' })
  ];
  const sonuc = Logic.cakismaBul(kayit({ EtkinlikID: 'YENI' }), mevcut).map((k) => k.EtkinlikID);
  assert.deepEqual(sonuc, ['A', 'F']);
});

test('siradakiYedek en eski ve artık çakışmayan yedeği seçer', () => {
  const bosalan = kayit({ EtkinlikID: 'A', Durum: D.IPTAL });
  const kayitlar = [
    bosalan,
    kayit({ EtkinlikID: 'Y2', Durum: D.YEDEK, OlusturmaZamani: '2026-10-21T12:00:00' }),
    kayit({ EtkinlikID: 'Y1', Durum: D.YEDEK, OlusturmaZamani: '2026-10-21T11:00:00', BitisSaati: '15:00' }),
    // Y1 15:00'e kadar sürüyor ve 14:00'te başka aktif etkinlik var → Y1 seçilemez
    kayit({ EtkinlikID: 'X', Durum: D.KESINLESTI, BaslangicSaati: '14:00', BitisSaati: '16:00' })
  ];
  assert.equal(Logic.siradakiYedek(bosalan, kayitlar).EtkinlikID, 'Y2');
  assert.equal(Logic.siradakiYedek(kayit({ EtkinlikID: 'Z', MekanID: 'BASKA' }), kayitlar), null);
});

test('durum geçişleri', () => {
  assert.equal(Logic.gecisGecerliMi(D.ON_REZERVASYON, D.EBYS_KONTROL), true);
  assert.equal(Logic.gecisGecerliMi(D.ON_REZERVASYON, D.KESINLESTI), false);
  assert.equal(Logic.gecisGecerliMi(D.EBYS_KONTROL, D.ON_REZERVASYON), true); // iade
  assert.equal(Logic.gecisGecerliMi(D.IPTAL, D.ON_REZERVASYON), false);
  assert.throws(() => Logic.gecisKontrol(D.TAMAMLANDI, D.IPTAL), /yapılamaz/);
});

test('yetki kontrolü', () => {
  const talepEden = { eposta: 'a@yasar.edu.tr', roller: ['TALEP_EDEN'], birim: 'MUH', onayBirimleri: [] };
  const onayci = { eposta: 'b@yasar.edu.tr', roller: ['BIRIM_ONAYCI'], birim: 'MUH', onayBirimleri: ['MUH'] };
  const hizmet = { eposta: 'c@yasar.edu.tr', roller: ['HIZMET_BIRIMI'], birim: 'BILGI_ISLEM', onayBirimleri: [] };
  const muaf = { eposta: 'd@yasar.edu.tr', roller: ['EBYS_MUAF'], birim: 'GENEL_SEKRETERLIK', onayBirimleri: [] };
  const yonetici = { eposta: 'y@yasar.edu.tr', roller: ['YONETICI'], birim: 'YONETIM', onayBirimleri: [] };
  const etkinlik = { DuzenleyenBirim: 'MUH', SorumluEposta: 'A@yasar.edu.tr', OlusturanEposta: 'a@yasar.edu.tr' };

  assert.equal(Logic.yetkiVarMi(talepEden, 'ON_REZ_OLUSTUR'), true);
  assert.equal(Logic.yetkiVarMi(onayci, 'ON_REZ_OLUSTUR'), false);
  assert.equal(Logic.yetkiVarMi(talepEden, 'EBYS_MUAF_KULLAN'), false);
  assert.equal(Logic.yetkiVarMi(muaf, 'EBYS_MUAF_KULLAN'), true);
  assert.equal(Logic.yetkiVarMi(talepEden, 'ETKINLIK_SAHIBI', etkinlik), true, 'e-posta büyük/küçük harf duyarsız');
  assert.equal(Logic.yetkiVarMi(onayci, 'EBYS_ONAYLA', etkinlik), true);
  assert.equal(Logic.yetkiVarMi(onayci, 'EBYS_ONAYLA', { DuzenleyenBirim: 'IIBF' }), false);
  assert.equal(Logic.yetkiVarMi(hizmet, 'GOREV_GUNCELLE', { Birim: 'BILGI_ISLEM' }), true);
  assert.equal(Logic.yetkiVarMi(hizmet, 'GOREV_GUNCELLE', { Birim: 'GUVENLIK' }), false);
  assert.equal(Logic.yetkiVarMi(yonetici, 'EBYS_ONAYLA', { DuzenleyenBirim: 'IIBF' }), true);
  assert.equal(Logic.yetkiVarMi(null, 'ON_REZ_OLUSTUR'), false);
});

test('listeAyristir', () => {
  assert.deepEqual(Logic.listeAyristir(' talep_eden, birim_onayci ;'), ['TALEP_EDEN', 'BIRIM_ONAYCI']);
  assert.deepEqual(Logic.listeAyristir(''), []);
});

test('EBYS numarası biçimi', () => {
  assert.equal(Logic.ebysNoGecerliMi('E-12345678-051.04-1234'), true);
  assert.equal(Logic.ebysNoGecerliMi('ab'), false);
  assert.equal(Logic.ebysNoGecerliMi(''), false);
  assert.equal(Logic.ebysNoGecerliMi('12345', '^\\d{8}$'), false);
});

test('ön rezervasyon doğrulama', () => {
  const ctx = { bugun: '2026-10-21', mekan: { MekanID: 'KS', Kapasite: '100' }, asgariGun: 10, asgariUstDuzeyGun: 20 };
  const f = { ad: 'Kariyer Günü', tur: 'Panel', mekanId: 'KS', tarih: '2026-11-10', baslangic: '10:00', bitis: '12:00',
    katilimciSayisi: 80, protokolDuzeyi: 'STANDART' };
  assert.deepEqual(Logic.onRezervasyonDogrula(f, ctx), []);
  assert.match(Logic.onRezervasyonDogrula({ ...f, katilimciSayisi: 150 }, ctx).join(), /kapasite/);
  assert.match(Logic.onRezervasyonDogrula({ ...f, bitis: '09:00' }, ctx).join(), /Bitiş/);
  assert.match(Logic.onRezervasyonDogrula({ ...f, tarih: '2026-10-25' }, ctx).join(), /en az 10 gün/);
  assert.match(Logic.onRezervasyonDogrula({ ...f, tarih: '2026-11-05', protokolDuzeyi: 'UST_DUZEY' }, ctx).join(), /en az 20 gün/);
  assert.deepEqual(Logic.onRezervasyonDogrula({ ...f, protokolDuzeyi: 'UST_DUZEY' }, ctx), [], 'tam 20 gün kala kabul');
  assert.match(Logic.onRezervasyonDogrula({ ...f, tarih: '2026-10-01' }, ctx).join(), /Geçmiş/);
  // EBYS muaf etkinlikte asgari süre aranmaz ama gerekçe zorunludur
  assert.deepEqual(Logic.onRezervasyonDogrula({ ...f, tarih: '2026-10-23', ebysMuaf: true, muafGerekce: 'Bakan ziyareti' }, ctx), []);
  assert.match(Logic.onRezervasyonDogrula({ ...f, ebysMuaf: true }, ctx).join(), /gerekçe/);
});

test('detaylı formdan görev üretimi', () => {
  const bos = Logic.gorevleriOlustur({ afis: 'YOK', ikram: 'YOK', oturmaDuzeni: 'MEVCUT', duyuru: [] }, 'STANDART');
  assert.deepEqual(bos, []);

  const g = Logic.gorevleriOlustur({
    afis: 'DIJITAL', afisTasarim: 'KURUMSAL_ILETISIM', duyuru: ['SOSYAL_MEDYA', 'WEB'],
    fotoVideo: true, ses: true, mikrofonSayisi: '3', canliYayin: true,
    oturmaDuzeni: 'TIYATRO', ikram: 'CAY_KAHVE', ikramKisi: '120', vipOtopark: false
  }, 'STANDART');
  const turler = g.map((x) => x.Birim + ':' + x.Tur);
  assert.deepEqual(turler, [
    'KURUMSAL_ILETISIM:AFIS', 'KURUMSAL_ILETISIM:DUYURU', 'KURUMSAL_ILETISIM:BASIN_FOTO',
    'BILGI_ISLEM:TEKNIK', 'TEKNIK_ISLER:MEKAN_KURULUM', 'IDARI_ISLER:IKRAM'
  ]);
  assert.match(g.find((x) => x.Tur === 'TEKNIK').Aciklama, /3 mikrofon/);

  const ust = Logic.gorevleriOlustur({ afis: 'YOK', ikram: 'YOK', protokolListesi: 'Vali' }, 'UST_DUZEY');
  assert.deepEqual(ust.map((x) => x.Tur), ['GUVENLIK', 'PROTOKOL']);
});

test('tüm görevler kabul edilince tamam', () => {
  assert.equal(Logic.tumGorevlerTamamMi([]), false);
  assert.equal(Logic.tumGorevlerTamamMi([{ Durum: 'KABUL' }, { Durum: 'TAMAMLANDI' }]), true);
  assert.equal(Logic.tumGorevlerTamamMi([{ Durum: 'KABUL' }, { Durum: 'BEKLIYOR' }]), false);
});
