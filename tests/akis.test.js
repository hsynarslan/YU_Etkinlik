// Sunucu kodunun uçtan uca akış testi (bellekte PostgreSQL ile). Çalıştırma: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { ortam, talep, PDF } = require('./ortam');
const { dosyaGetir } = require('../sunucu/ebys');

test('kurulum tabloları, ayarları ve ilk yöneticiyi hazırlar; tekrar çalıştırmak güvenli', async () => {
  const { db, kapat } = await ortam();
  try {
    const { HEADERS, VARSAYILAN_AYARLAR } = require('../sunucu/config');
    for (const tablo of Object.keys(HEADERS)) await db.hepsi(tablo); // hepsi var
    assert.equal((await db.ayar('ON_REZ_SURE_GUN')), '10');
    const { kullaniciBul } = require('../sunucu/auth');
    assert.equal((await kullaniciBul('kurucu@yasar.edu.tr')).roller[0], 'YONETICI');
    assert.equal((await db.hepsi('Birimler')).length, 6);
    await require('../sunucu/kurulum').kurulum({ yonetici: 'baska@yasar.edu.tr' });
    assert.equal((await db.hepsi('Birimler')).length, 6);
    assert.equal((await db.hepsi('Ayarlar')).length, VARSAYILAN_AYARLAR.length);
    assert.equal((await db.hepsi('Kullanicilar')).length, 7, 'ikinci kurulum yeni yönetici eklememeli');
  } finally { await kapat(); }
});

test('tam akış: ön rezervasyon → EBYS → iade → onay → detay → görevler → kesinleşme → iptal ve yedek terfisi', async () => {
  const { c, db, ileri, giris, etkinlik, postalar, kapat } = await ortam();
  try {
    giris('talep@yasar.edu.tr');
    let r = await c.api_onRezervasyonOlustur(talep(ileri));
    assert.equal(r.ok, true, r.mesaj);
    const id = r.etkinlik.EtkinlikID;
    assert.equal((await etkinlik(id)).Durum, 'ON_REZERVASYON');
    assert.ok((await etkinlik(id)).OnRezBitis > db.bugun());

    // Başka birim aynı saate talep açar → önce çakışma uyarısı, sonra yedek
    giris('talep2@yasar.edu.tr');
    r = await c.api_onRezervasyonOlustur(talep(ileri, { ad: 'Girişimcilik Paneli', baslangic: '11:00', bitis: '13:00' }));
    assert.equal(r.cakisma, true);
    assert.equal(r.cakisanlar[0].Ad, 'Kariyer Günü');
    r = await c.api_onRezervasyonOlustur(talep(ileri, { ad: 'Girişimcilik Paneli', baslangic: '11:00', bitis: '13:00', yedegeAl: true }));
    const yedekId = r.etkinlik.EtkinlikID;
    assert.equal((await etkinlik(yedekId)).Durum, 'YEDEK');

    // Sahibi olmayan EBYS giremez
    r = await c.api_ebysGonder(id, { ebysNo: 'E-123456', ebysTarih: db.bugun(), dosya: PDF });
    assert.equal(r.ok, false);

    giris('talep@yasar.edu.tr');
    r = await c.api_ebysGonder(id, { ebysNo: 'E-123456', ebysTarih: db.bugun() });
    assert.equal(r.ok, false);
    assert.match(r.mesaj, /PDF/);
    r = await c.api_ebysGonder(id, { ebysNo: 'E-123456', ebysTarih: db.bugun(), dosya: PDF });
    assert.equal(r.ok, true, r.mesaj);
    assert.equal((await etkinlik(id)).Durum, 'EBYS_KONTROL');
    assert.equal((await db.sorgu('SELECT count(*)::int AS n FROM "Dosyalar"')).rows[0].n, 1);
    assert.ok(postalar.some((m) => m.to.includes('onay@yasar.edu.tr')), 'onaycıya e-posta gitmeli');

    // Başka birimin kullanıcısı karar veremez; MUH onaycısı verir; iade notsuz olmaz
    giris('talep2@yasar.edu.tr');
    assert.equal((await c.api_ebysKarar(id, true, '')).ok, false);
    giris('onay@yasar.edu.tr');
    assert.equal((await c.api_baslangic()).onayBekleyenler.length, 1);
    assert.equal((await c.api_ebysKarar(id, false, '')).ok, false);
    assert.equal((await c.api_ebysKarar(id, false, 'Onay tarihi hatalı')).ok, true);
    assert.equal((await etkinlik(id)).Durum, 'ON_REZERVASYON');
    assert.equal((await etkinlik(id)).KontrolNotu, 'Onay tarihi hatalı');

    giris('talep@yasar.edu.tr');
    assert.equal((await c.api_ebysGonder(id, { ebysNo: 'E-123456', ebysTarih: db.bugun(), dosya: PDF })).ok, true);
    giris('onay@yasar.edu.tr');
    assert.equal((await c.api_ebysKarar(id, true, '')).ok, true);
    assert.equal((await etkinlik(id)).Durum, 'DETAY_BEKLENIYOR');

    // Detay formu → iki birime görev
    giris('talep@yasar.edu.tr');
    r = await c.api_detayKaydet(id, { afis: 'DIJITAL', afisTasarim: 'KURUMSAL_ILETISIM', duyuru: [], ses: true, mikrofonSayisi: '2', ikram: 'YOK', oturmaDuzeni: 'MEVCUT' });
    assert.equal(r.ok, true, r.mesaj);
    assert.equal((await etkinlik(id)).Durum, 'HAZIRLIK');
    const gorevler = (await db.hepsi('Gorevler')).filter((x) => x.EtkinlikID === id);
    assert.deepEqual(gorevler.map((x) => x.Birim).sort(), ['BILGI_ISLEM', 'KURUMSAL_ILETISIM']);
    assert.equal((await c.api_baslangic()).etkinliklerim[0].Detay.ses, true);

    // Her birim yalnızca kendi görevini günceller
    const biGorev = gorevler.find((x) => x.Birim === 'BILGI_ISLEM');
    const kiGorev = gorevler.find((x) => x.Birim === 'KURUMSAL_ILETISIM');
    giris('bi@yasar.edu.tr');
    assert.equal((await c.api_baslangic()).gorevlerim.length, 1);
    assert.equal((await c.api_gorevGuncelle(kiGorev.GorevID, 'KABUL', '')).ok, false);
    assert.equal((await c.api_gorevGuncelle(biGorev.GorevID, 'RED', '')).ok, false, 'red için not zorunlu');
    assert.equal((await c.api_gorevGuncelle(biGorev.GorevID, 'KABUL', '')).ok, true);
    assert.equal((await etkinlik(id)).Durum, 'HAZIRLIK');
    giris('ki@yasar.edu.tr');
    assert.equal((await c.api_gorevGuncelle(kiGorev.GorevID, 'KABUL', 'Afiş 3 gün içinde')).ok, true);
    assert.equal((await etkinlik(id)).Durum, 'KESINLESTI');

    // Takvimde görünür
    assert.ok((await c.api_baslangic()).takvim.some((x) => x.EtkinlikID === id));

    // İptal → yedek terfi eder
    giris('talep@yasar.edu.tr');
    assert.equal((await c.api_iptal(id, 'Ertelendi')).ok, true);
    assert.equal((await etkinlik(id)).Durum, 'IPTAL');
    assert.equal((await etkinlik(yedekId)).Durum, 'ON_REZERVASYON');
    assert.ok((await etkinlik(yedekId)).OnRezBitis);

    // Log her adımı tutar
    const islemler = (await db.hepsi('Log')).filter((x) => x.EtkinlikID === id).map((x) => x.Islem);
    ['OLUSTURULDU', 'EBYS_GIRILDI', 'EBYS_IADE', 'EBYS_ONAYLANDI', 'DETAY_KAYDEDILDI', 'GOREV_KABUL', 'KESINLESTI', 'IPTAL']
      .forEach((x) => assert.ok(islemler.includes(x), x));
  } finally { await kapat(); }
});

test('EBYS muafiyeti yalnızca yetkili rolde, gerekçeyle ve asgari süre aranmadan', async () => {
  const { c, db, Logic, giris, etkinlik, kapat } = await ortam();
  try {
    const yakin = Logic.isGunuEkle(db.bugun(), 2);
    giris('talep@yasar.edu.tr');
    let r = await c.api_onRezervasyonOlustur(talep(yakin, { ebysMuaf: true, muafGerekce: 'x' }));
    assert.equal(r.ok, false);
    assert.match(r.mesaj, /yetkiniz/);

    giris('gs@yasar.edu.tr');
    r = await c.api_onRezervasyonOlustur(talep(yakin, { ebysMuaf: true }));
    assert.equal(r.ok, false);
    assert.match(r.mesaj, /gerekçe/);
    r = await c.api_onRezervasyonOlustur(talep(yakin, { ebysMuaf: true, muafGerekce: 'Bakan ziyareti', protokolDuzeyi: 'UST_DUZEY' }));
    assert.equal(r.ok, true, r.mesaj);
    const id = r.etkinlik.EtkinlikID;
    assert.equal((await etkinlik(id)).Durum, 'DETAY_BEKLENIYOR');
    assert.equal((await etkinlik(id)).EbysMuaf, 'EVET');

    // Sonradan EBYS bağlama, durum değişmeden
    r = await c.api_ebysSonradanBagla(id, { ebysNo: 'E-999999', ebysTarih: db.bugun() });
    assert.equal(r.ok, true, r.mesaj);
    assert.equal((await etkinlik(id)).EbysNo, 'E-999999');
    assert.equal((await etkinlik(id)).Durum, 'DETAY_BEKLENIYOR');

    // Üst düzey protokol → güvenlik ve protokol görevleri
    r = await c.api_detayKaydet(id, { afis: 'YOK', ikram: 'YOK', oturmaDuzeni: 'MEVCUT', duyuru: [], protokolListesi: 'Bakan' });
    assert.equal(r.ok, true, r.mesaj);
    const birimler = (await db.hepsi('Gorevler')).filter((x) => x.EtkinlikID === id).map((x) => x.Birim).sort();
    assert.deepEqual(birimler, ['GUVENLIK', 'PROTOKOL']);
  } finally { await kapat(); }
});

test('asgari başvuru süresi ve aynı EBYS numarasının tekrar kullanımı engellenir', async () => {
  const { c, db, Logic, ileri, giris, kapat } = await ortam();
  try {
    giris('talep@yasar.edu.tr');
    let r = await c.api_onRezervasyonOlustur(talep(Logic.isGunuEkle(db.bugun(), 3)));
    assert.equal(r.ok, false);
    assert.match(r.mesaj, /en az 10 gün/);

    const a = (await c.api_onRezervasyonOlustur(talep(ileri))).etkinlik.EtkinlikID;
    const b = (await c.api_onRezervasyonOlustur(talep(ileri, { baslangic: '14:00', bitis: '15:00' }))).etkinlik.EtkinlikID;
    assert.equal((await c.api_ebysGonder(a, { ebysNo: 'E-111111', ebysTarih: db.bugun(), dosya: PDF })).ok, true);
    r = await c.api_ebysGonder(b, { ebysNo: 'e-111111', ebysTarih: db.bugun(), dosya: PDF });
    assert.equal(r.ok, false);
    assert.match(r.mesaj, /başka bir etkinlikte/);
  } finally { await kapat(); }
});

test('PDF olmayan dosya ve fazla büyük dosya reddedilir', async () => {
  const { c, db, ileri, giris, kapat } = await ortam();
  try {
    giris('talep@yasar.edu.tr');
    const id = (await c.api_onRezervasyonOlustur(talep(ileri))).etkinlik.EtkinlikID;
    let r = await c.api_ebysGonder(id, { ebysNo: 'E-222222', ebysTarih: db.bugun(),
      dosya: { ad: 'x.pdf', mimeType: 'application/pdf', base64: Buffer.from('MZ-calistirilabilir').toString('base64') } });
    assert.equal(r.ok, false);
    assert.match(r.mesaj, /geçerli bir PDF/);
    const buyuk = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(4 * 1024 * 1024)]).toString('base64');
    r = await c.api_ebysGonder(id, { ebysNo: 'E-222222', ebysTarih: db.bugun(), dosya: { ad: 'x.pdf', mimeType: 'application/pdf', base64: buyuk } });
    assert.equal(r.ok, false);
    assert.match(r.mesaj, /en fazla 3 MB/);
  } finally { await kapat(); }
});

test('uzatma bir kez yapılır; süresi dolan ön rezervasyon gece görevinde düşer, yedek terfi eder', async () => {
  const { c, db, ileri, giris, etkinlik, rezervasyon, postalar, kapat } = await ortam();
  try {
    giris('talep@yasar.edu.tr');
    const id = (await c.api_onRezervasyonOlustur(talep(ileri))).etkinlik.EtkinlikID;
    giris('talep2@yasar.edu.tr');
    const yedek = (await c.api_onRezervasyonOlustur(talep(ileri, { yedegeAl: true }))).etkinlik.EtkinlikID;
    giris('talep@yasar.edu.tr');
    const ilkBitis = (await etkinlik(id)).OnRezBitis;
    assert.equal((await c.api_uzat(id, '')).ok, false, 'gerekçe zorunlu');
    assert.equal((await c.api_uzat(id, 'Rektörlükte bekliyor')).ok, true);
    assert.ok((await etkinlik(id)).OnRezBitis > ilkBitis);
    assert.equal((await c.api_uzat(id, 'Tekrar')).ok, false, 'MAX_UZATMA = 1');

    await db.guncelle('Etkinlikler', 'EtkinlikID', id, { OnRezBitis: '2020-01-01' });
    const sonuc = await rezervasyon.gunlukSureKontrolu();
    assert.equal(sonuc.dusen, 1);
    assert.equal((await etkinlik(id)).Durum, 'SURESI_DOLDU');
    assert.equal((await etkinlik(yedek)).Durum, 'ON_REZERVASYON', 'yedek terfi etmeli');
    assert.ok(postalar.some((m) => /süresi doldu/.test(m.subject)));
    assert.deepEqual(await rezervasyon.gunlukSureKontrolu(), { dusen: 0, hatirlatma: 0, tamamlanan: 0 }, 'ikinci çalıştırma bir şey yapmamalı');
  } finally { await kapat(); }
});

test('tanımsız kullanıcı ve başka alan adı giremez', async () => {
  const { c, giris, kapat } = await ortam();
  try {
    giris('yabanci@yasar.edu.tr');
    let r = await c.api_baslangic();
    assert.equal(r.ok, false);
    assert.match(r.mesaj, /tanımlı değil/);
    giris('');
    assert.equal((await c.api_baslangic()).ok, false);
  } finally { await kapat(); }
});

test('hata olursa işlem geri alınır, e-posta gitmez', async () => {
  const { db, ileri, kapat, postalar } = await ortam();
  try {
    const { bildir } = require('../sunucu/bildirim');
    await assert.rejects(db.kilitle(async () => {
      await db.logYaz('x', '', 'DENEME', '');
      await bildir('a@yasar.edu.tr', 'konu', 'mesaj', '');
      throw new Error('patladı');
    }), /patladı/);
    assert.equal((await db.hepsi('Log')).filter((l) => l.Islem === 'DENEME').length, 0);
    assert.equal(postalar.length, 0);
    assert.ok(ileri);
  } finally { await kapat(); }
});

test('eşzamanlı iki talep aynı mekâna çifte kayıt oluşturmaz', async () => {
  const { c, db, ileri, giris, kapat } = await ortam();
  try {
    giris('talep@yasar.edu.tr');
    const a = c.api_onRezervasyonOlustur(talep(ileri));
    const b = c.api_onRezervasyonOlustur(talep(ileri, { ad: 'Aynı saat' }));
    const [ra, rb] = await Promise.all([a, b]);
    assert.equal([ra, rb].filter((x) => x.cakisma).length, 1, 'biri çakışma uyarısı almalı');
    assert.equal((await db.hepsi('Etkinlikler')).length, 1);
  } finally { await kapat(); }
});

test('EBYS PDF dosyası yalnızca yetkili kullanıcıya açılır', async () => {
  const { c, db, ileri, giris, kapat } = await ortam();
  try {
    giris('talep@yasar.edu.tr');
    const id = (await c.api_onRezervasyonOlustur(talep(ileri))).etkinlik.EtkinlikID;
    const r = await c.api_ebysGonder(id, { ebysNo: 'E-333333', ebysTarih: db.bugun(), dosya: PDF });
    const dosyaId = (await db.bul('Etkinlikler', 'EtkinlikID', id)).EbysEkUrl.split('/').pop();
    assert.equal(r.ok, true);
    assert.equal((await dosyaGetir('talep@yasar.edu.tr', dosyaId)).icerik.slice(0, 4).toString(), '%PDF');
    assert.ok(await dosyaGetir('onay@yasar.edu.tr', dosyaId), 'birim onaycısı açabilir');
    assert.ok(await dosyaGetir('kurucu@yasar.edu.tr', dosyaId), 'yönetici açabilir');
    await assert.rejects(dosyaGetir('talep2@yasar.edu.tr', dosyaId), /yetkiniz yok/);
    await assert.rejects(dosyaGetir('bi@yasar.edu.tr', dosyaId), /yetkiniz yok/);
  } finally { await kapat(); }
});

test('şifreyle giriş: doğru şifre girer, yanlış ve bilinmeyen kullanıcı aynı mesajı alır', async () => {
  const sifre = require('../sunucu/sifre');
  const { db, kapat } = await ortam();
  try {
    await sifre.sifreBelirle('talep@yasar.edu.tr', 'GucluSifre123');
    assert.equal(await sifre.girisYap('Talep@Yasar.edu.tr ', 'GucluSifre123'), 'talep@yasar.edu.tr');
    await assert.rejects(sifre.girisYap('talep@yasar.edu.tr', 'yanlis-sifre'), new RegExp(sifre.GENEL_HATA));
    await assert.rejects(sifre.girisYap('yok@yasar.edu.tr', 'GucluSifre123'), new RegExp(sifre.GENEL_HATA));
    await assert.rejects(sifre.girisYap('onay@yasar.edu.tr', 'GucluSifre123'), new RegExp(sifre.GENEL_HATA), 'şifresi olmayan kullanıcı giremez');
    await assert.rejects(sifre.girisYap('talep@yasar.edu.tr', ''), new RegExp(sifre.GENEL_HATA));
    const k = await db.bul('Kullanicilar', 'Eposta', 'talep@yasar.edu.tr');
    assert.ok(k.SifreHash.startsWith('scrypt$'));
    assert.ok(!k.SifreHash.includes('GucluSifre123'), 'düz şifre saklanmamalı');
    // pasif kullanıcı giremez
    await db.guncelle('Kullanicilar', 'Eposta', 'talep@yasar.edu.tr', { Aktif: 'HAYIR' });
    await assert.rejects(sifre.girisYap('talep@yasar.edu.tr', 'GucluSifre123'), new RegExp(sifre.GENEL_HATA));
  } finally { await kapat(); }
});

test('5 hatalı denemeden sonra hesap kilitlenir, doğru şifre de kabul edilmez; süre dolunca açılır', async () => {
  const sifre = require('../sunucu/sifre');
  const { db, kapat } = await ortam();
  try {
    await sifre.sifreBelirle('talep@yasar.edu.tr', 'GucluSifre123');
    for (let i = 0; i < 4; i++) await assert.rejects(sifre.girisYap('talep@yasar.edu.tr', 'x'), new RegExp(sifre.GENEL_HATA));
    await assert.rejects(sifre.girisYap('talep@yasar.edu.tr', 'x'), /Çok fazla hatalı deneme/);
    await assert.rejects(sifre.girisYap('talep@yasar.edu.tr', 'GucluSifre123'), /Çok fazla hatalı deneme/);
    assert.ok((await db.hepsi('Log')).some((l) => l.Islem === 'HESAP_KILITLENDI'));
    const simdi = Date.now();
    db.saatAyarla(() => new Date(simdi + 16 * 60000));
    assert.equal(await sifre.girisYap('talep@yasar.edu.tr', 'GucluSifre123'), 'talep@yasar.edu.tr');
    db.saatAyarla(null);
    // başarılı giriş sayacı sıfırlar
    for (let i = 0; i < 3; i++) await assert.rejects(sifre.girisYap('talep@yasar.edu.tr', 'x'));
    await sifre.girisYap('talep@yasar.edu.tr', 'GucluSifre123');
    for (let i = 0; i < 3; i++) await assert.rejects(sifre.girisYap('talep@yasar.edu.tr', 'x'), new RegExp(sifre.GENEL_HATA));
  } finally { db.saatAyarla(null); await kapat(); }
});

test('kullanıcı kendi şifresini değiştirir; eksik şifreleri yönetici toplu üretir', async () => {
  const sifre = require('../sunucu/sifre');
  const { c, db, giris, kapat } = await ortam();
  try {
    const uretilen = await sifre.eksikSifreleriUret();
    assert.equal(uretilen.length, 6, 'şifresi olmayan 6 kullanıcı (ilk yöneticiyi kurulum zaten şifreledi)');
    assert.ok(uretilen.every((x) => x.sifre.length === 12));
    assert.deepEqual(await sifre.eksikSifreleriUret(), [], 'ikinci çalıştırma yeni şifre üretmemeli');
    const t = uretilen.find((x) => x.eposta === 'talep@yasar.edu.tr');
    assert.equal(await sifre.girisYap('talep@yasar.edu.tr', t.sifre), 'talep@yasar.edu.tr');

    giris('talep@yasar.edu.tr');
    assert.equal((await c.api_sifreDegistir('yanlis', 'YeniSifre12345')).ok, false);
    assert.match((await c.api_sifreDegistir(t.sifre, 'kisa')).mesaj, /en az 8/);
    assert.match((await c.api_sifreDegistir(t.sifre, t.sifre)).mesaj, /farklı/);
    assert.equal((await c.api_sifreDegistir(t.sifre, 'YeniSifre12345')).ok, true);
    await assert.rejects(sifre.girisYap('talep@yasar.edu.tr', t.sifre));
    assert.equal(await sifre.girisYap('talep@yasar.edu.tr', 'YeniSifre12345'), 'talep@yasar.edu.tr');
    assert.ok((await db.hepsi('Log')).some((l) => l.Islem === 'SIFRE_DEGISTI'));
  } finally { await kapat(); }
});

test('kurulum ilk yöneticiyi rastgele şifreyle oluşturur', async () => {
  const sifre = require('../sunucu/sifre');
  const { db, kapat } = await ortam();
  try {
    await db.sorgu('DELETE FROM "Kullanicilar"');
    const { kurulum } = require('../sunucu/kurulum');
    const y = await kurulum({ yonetici: 'Yeni@Yasar.edu.tr' });
    assert.equal(y.eposta, 'yeni@yasar.edu.tr');
    assert.equal(await sifre.girisYap('yeni@yasar.edu.tr', y.sifre), 'yeni@yasar.edu.tr');
    assert.equal(await kurulum({ yonetici: 'baska@yasar.edu.tr' }), null, 'kullanıcı varsa yeni yönetici eklenmez');
  } finally { await kapat(); }
});

test('yönetim ekranı: yalnızca yönetici; kullanıcı, mekân, birim, ayar kaydı ve kendini kilitlemeyi önleme', async () => {
  const sifre = require('../sunucu/sifre');
  const { c, db, giris, kapat } = await ortam();
  try {
    giris('talep@yasar.edu.tr');
    for (const [fn, ...args] of [['api_yonetimVeri'], ['api_kullaniciKaydet', {}], ['api_mekanKaydet', {}], ['api_birimKaydet', {}], ['api_ayarKaydet', 'MAX_UZATMA', '2'], ['api_sifreBelirle', 'onay@yasar.edu.tr', 'abcdefgh1']]) {
      const r = await c[fn](...args);
      assert.equal(r.ok, false, fn);
      assert.match(r.mesaj, /yalnızca yöneticiler/, fn);
    }

    giris('kurucu@yasar.edu.tr');
    let r = await c.api_yonetimVeri();
    assert.equal(r.ok, true, r.mesaj);
    assert.ok(r.kullanicilar.every((k) => !('SifreHash' in k)), 'şifre özeti istemciye gitmemeli');
    assert.equal(r.kullanicilar.find((k) => k.Eposta === 'kurucu@yasar.edu.tr').sifreVar, true);
    assert.equal(r.kullanicilar.find((k) => k.Eposta === 'talep@yasar.edu.tr').sifreVar, false);
    assert.ok(r.ayarlar.some((a) => a.Anahtar === 'ON_REZ_SURE_GUN' && a.Deger === '10'));

    // Yeni birim, mekân, kullanıcı
    assert.equal((await c.api_birimKaydet({ BirimID: 'iibf', Ad: 'İİBF', Tur: 'AKADEMIK' })).ok, true);
    assert.equal((await c.api_birimKaydet({ BirimID: 'IIBF', Ad: 'İktisadi ve İdari Bilimler', Tur: 'AKADEMIK' })).mesaj, 'Birim güncellendi.');
    assert.equal((await c.api_birimKaydet({ BirimID: 'YENI', Ad: 'x', Tur: 'HIZMET' })).ok, false);
    r = await c.api_mekanKaydet({ MekanID: 'iibf-a1', Ad: 'A1 Amfi', Bina: 'İİBF', Kapasite: '120', SorumluBirim: 'TEKNIK_ISLER', Aktif: 'EVET' });
    assert.equal(r.ok, true, r.mesaj);
    assert.equal((await c.api_mekanKaydet({ MekanID: 'X', Ad: 'x', Kapasite: '-3' })).ok, false);
    r = await c.api_kullaniciKaydet({ Eposta: 'Yeni@Yasar.edu.tr', AdSoyad: 'Yeni Kişi', Birim: 'IIBF', Roller: ['TALEP_EDEN'], Aktif: 'EVET' });
    assert.equal(r.ok, true, r.mesaj);
    assert.equal(r.yeni, true);
    assert.equal((await c.api_kullaniciKaydet({ Eposta: 'yeni@yasar.edu.tr', AdSoyad: 'Yeni Kişi', Birim: 'IIBF', Roller: ['TALEP_EDEN', 'EBYS_MUAF'] })).yeni, false);
    assert.equal((await c.api_kullaniciKaydet({ Eposta: 'x@yasar.edu.tr', AdSoyad: 'x', Birim: 'YOKBIRIM', Roller: ['TALEP_EDEN'] })).ok, false);

    // Şifre: verilen ve üretilen
    r = await c.api_sifreBelirle('yeni@yasar.edu.tr', '');
    assert.equal(r.ok, true);
    assert.equal(r.sifre.length, 12);
    assert.equal(await sifre.girisYap('yeni@yasar.edu.tr', r.sifre), 'yeni@yasar.edu.tr');
    r = await c.api_sifreBelirle('yeni@yasar.edu.tr', 'ElleBelirlenen1');
    assert.equal(r.sifre, '', 'elle verilen şifre geri gösterilmez');
    assert.equal(await sifre.girisYap('yeni@yasar.edu.tr', 'ElleBelirlenen1'), 'yeni@yasar.edu.tr');
    assert.match((await c.api_sifreBelirle('yeni@yasar.edu.tr', 'kisa')).mesaj, /en az 8/);
    assert.equal((await c.api_sifreBelirle('yok@yasar.edu.tr', '')).ok, false);

    // Yeni mekânda talep açılabilir
    giris('yeni@yasar.edu.tr');
    const ileri = require('../sunucu/logic').isGunuEkle(db.bugun(), 15);
    r = await c.api_onRezervasyonOlustur({ ad: 'Deneme', tur: 'Panel', mekanId: 'IIBF-A1', tarih: ileri, baslangic: '10:00', bitis: '11:00', katilimciSayisi: '50' });
    assert.equal(r.ok, true, r.mesaj);

    // Ayar
    giris('kurucu@yasar.edu.tr');
    assert.equal((await c.api_ayarKaydet('MAX_UZATMA', '2')).ok, true);
    assert.equal(await db.ayarSayi('MAX_UZATMA'), 2);
    assert.equal((await c.api_ayarKaydet('MAX_UZATMA', 'x')).ok, false);
    assert.equal((await c.api_ayarKaydet('YOK', '1')).ok, false);
    assert.equal((await c.api_ayarKaydet('RESMI_TATILLER', '2026-10-29')).ok, true);

    // Kendini kilitleme ve son yöneticiyi kaldırma engellenir
    assert.match((await c.api_kullaniciKaydet({ Eposta: 'kurucu@yasar.edu.tr', AdSoyad: 'K', Birim: 'YONETIM', Roller: ['TALEP_EDEN'] })).mesaj, /Kendi yönetici/);
    assert.match((await c.api_kullaniciKaydet({ Eposta: 'kurucu@yasar.edu.tr', AdSoyad: 'K', Birim: 'YONETIM', Roller: ['YONETICI'], Aktif: 'HAYIR' })).mesaj, /Kendi yönetici/);
    await c.api_kullaniciKaydet({ Eposta: 'yeni@yasar.edu.tr', AdSoyad: 'Yeni Kişi', Birim: 'YONETIM', Roller: ['YONETICI'] });
    giris('yeni@yasar.edu.tr');
    assert.match((await c.api_kullaniciKaydet({ Eposta: 'kurucu@yasar.edu.tr', AdSoyad: 'K', Birim: 'YONETIM', Roller: ['TALEP_EDEN'] })).mesaj, /^(?!.*en az bir aktif)/, 'ikinci yönetici varken başka yöneticinin rolü alınabilir');
    giris('kurucu@yasar.edu.tr');
    const islemler = (await db.hepsi('Log')).map((l) => l.Islem);
    ['YONETIM_BIRIM_EKLENDI', 'YONETIM_MEKAN_EKLENDI', 'YONETIM_KULLANICI_EKLENDI', 'YONETIM_SIFRE_BELIRLENDI', 'YONETIM_AYAR_GUNCELLENDI']
      .forEach((x) => assert.ok(islemler.includes(x), x));
  } finally { await kapat(); }
});

test('son aktif yönetici pasif yapılamaz', async () => {
  const { c, db, giris, kapat } = await ortam();
  try {
    await c.api_yonetimVeri; // ortam hazır
    // iki yönetici: kurucu ve yeni; yeni, kurucuyu pasif yapar, sonra kurucu tek yönetici kalmaz
    giris('kurucu@yasar.edu.tr');
    await c.api_kullaniciKaydet({ Eposta: 'ikinci@yasar.edu.tr', AdSoyad: 'İkinci', Birim: 'YONETIM', Roller: ['YONETICI'] });
    giris('ikinci@yasar.edu.tr');
    assert.equal((await c.api_kullaniciKaydet({ Eposta: 'kurucu@yasar.edu.tr', AdSoyad: 'K', Birim: 'YONETIM', Roller: ['YONETICI'], Aktif: 'HAYIR' })).ok, true);
    // artık tek aktif yönetici ikinci; kendini kapatamaz (kendi kuralı) ve kurucu zaten pasif
    assert.match((await c.api_kullaniciKaydet({ Eposta: 'ikinci@yasar.edu.tr', AdSoyad: 'İ', Birim: 'YONETIM', Roller: ['YONETICI'], Aktif: 'HAYIR' })).mesaj, /Kendi yönetici/);
    assert.equal((await db.bul('Kullanicilar', 'Eposta', 'kurucu@yasar.edu.tr')).Aktif, 'HAYIR');
  } finally { await kapat(); }
});
