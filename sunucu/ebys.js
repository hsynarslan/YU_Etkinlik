/**
 * ebys.js — EBYS numarası girişi, onaycı kontrolü ve muaf etkinliklere sonradan EBYS bağlama.
 *
 * Sistem EBYS'ye doğrudan bağlanmaz. Doğrulama üç adımlıdır:
 *   1) Numara biçimi (Ayarlar > EBYS_NO_REGEX)
 *   2) Aynı numaranın başka aktif etkinlikte kullanılmamış olması
 *   3) EBYS onay yazısının PDF olarak eklenmesi + birim onaycısının kontrolü
 * PDF'ler veritabanındaki Dosyalar tablosunda saklanır; yalnızca yetkili kullanıcılar açabilir.
 */
const Logic = require('./logic');
const { SAYFA } = require('./config');
const db = require('./db');
const { aktifKullanici, yetkiGerekli, epostalar, yoneticiler } = require('./auth');
const { bildir, etkinlikOzeti, htmlKacis } = require('./bildirim');
const { api, istemciEtkinlikTek } = require('./ortak');
const { onRezBitisHesapla } = require('./rezervasyon');

/** veri: { ebysNo, ebysTarih, dosya: { ad, mimeType, base64 } } */
function api_ebysGonder(eposta, etkinlikId, veri) {
  return api(() => db.kilitle(async () => {
    const k = await aktifKullanici(eposta);
    veri = veri || {};
    const e = await db.bul(SAYFA.ETKINLIKLER, 'EtkinlikID', etkinlikId);
    if (!e) throw new Error('Etkinlik bulunamadı.');
    yetkiGerekli(k, 'ETKINLIK_SAHIBI', e);
    Logic.gecisKontrol(e.Durum, Logic.DURUM.EBYS_KONTROL);

    const no = await ebysNoKontrol(veri.ebysNo, etkinlikId);
    if (!Logic.tarihGecerliMi(veri.ebysTarih)) throw new Error('EBYS onay tarihi geçerli değil.');
    if (!veri.dosya || !veri.dosya.base64) throw new Error('EBYS onay yazısını PDF olarak eklemelisiniz.');
    const url = await ebysPdfKaydet(etkinlikId, no, veri.dosya, k.eposta);

    const g = await db.guncelle(SAYFA.ETKINLIKLER, 'EtkinlikID', etkinlikId, {
      EbysNo: no, EbysTarih: veri.ebysTarih, EbysEkUrl: url, KontrolNotu: '',
      Durum: Logic.DURUM.EBYS_KONTROL
    });
    await db.logYaz(k.eposta, etkinlikId, 'EBYS_GIRILDI', no);

    const onaycilar = await epostalar({ rol: Logic.ROLLER.BIRIM_ONAYCI, onayBirimi: e.DuzenleyenBirim });
    await bildir(onaycilar.length ? onaycilar : await yoneticiler(), 'EBYS kontrolü bekleyen etkinlik',
      (await etkinlikOzeti(e)) + '<br>EBYS no: ' + htmlKacis(no) + ' (onay yazısı sistemde)', etkinlikId);
    return { etkinlik: await istemciEtkinlikTek(g), mesaj: 'EBYS bilgileri gönderildi; onaycı kontrolü bekleniyor.' };
  }));
}

/** Birim onaycısı (veya yönetici) EBYS kaydını onaylar ya da düzeltme için iade eder. */
function api_ebysKarar(eposta, etkinlikId, onay, not) {
  return api(() => db.kilitle(async () => {
    const k = await aktifKullanici(eposta);
    const e = await db.bul(SAYFA.ETKINLIKLER, 'EtkinlikID', etkinlikId);
    if (!e) throw new Error('Etkinlik bulunamadı.');
    yetkiGerekli(k, 'EBYS_ONAYLA', e);
    const D = Logic.DURUM;
    not = String(not || '').trim();

    if (onay) {
      Logic.gecisKontrol(e.Durum, D.DETAY_BEKLENIYOR);
      await db.guncelle(SAYFA.ETKINLIKLER, 'EtkinlikID', etkinlikId, { Durum: D.DETAY_BEKLENIYOR, KontrolNotu: not });
      await db.logYaz(k.eposta, etkinlikId, 'EBYS_ONAYLANDI', not);
      await bildir(e.SorumluEposta, 'EBYS kaydınız onaylandı',
        (await etkinlikOzeti(e)) + '<br>Şimdi detaylı etkinlik formunu doldurabilirsiniz.', etkinlikId);
      return { mesaj: 'Onaylandı.' };
    }

    if (!not) throw new Error('İade için açıklama zorunludur.');
    Logic.gecisKontrol(e.Durum, D.ON_REZERVASYON);
    const yama = { Durum: D.ON_REZERVASYON, KontrolNotu: not };
    // Kontrol sırasında süre dolduysa düzeltme için 2 iş günü tanı
    if (!e.OnRezBitis || e.OnRezBitis < db.bugun()) yama.OnRezBitis = await onRezBitisHesapla(db.bugun(), 2, e.Tarih);
    await db.guncelle(SAYFA.ETKINLIKLER, 'EtkinlikID', etkinlikId, yama);
    await db.logYaz(k.eposta, etkinlikId, 'EBYS_IADE', not);
    await bildir(e.SorumluEposta, 'EBYS kaydınız iade edildi',
      (await etkinlikOzeti(e)) + '<br>Açıklama: ' + htmlKacis(not) + '<br>Lütfen düzeltip yeniden gönderin.', etkinlikId);
    return { mesaj: 'Düzeltme için iade edildi.' };
  }));
}

/** EBYS'siz açılmış etkinliğe sonradan EBYS numarası bağlar (durum değişmez). */
function api_ebysSonradanBagla(eposta, etkinlikId, veri) {
  return api(() => db.kilitle(async () => {
    const k = await aktifKullanici(eposta);
    veri = veri || {};
    const e = await db.bul(SAYFA.ETKINLIKLER, 'EtkinlikID', etkinlikId);
    if (!e) throw new Error('Etkinlik bulunamadı.');
    yetkiGerekli(k, 'EBYS_SONRADAN_BAGLA', e);
    if (e.EbysMuaf !== 'EVET') throw new Error('Bu işlem yalnızca EBYS\'siz açılmış etkinlikler içindir.');
    if (e.EbysNo) throw new Error('Bu etkinliğin EBYS numarası zaten var.');
    if (Logic.DURUM.IPTAL === e.Durum) throw new Error('İptal edilmiş etkinliğe EBYS bağlanamaz.');

    const no = await ebysNoKontrol(veri.ebysNo, etkinlikId);
    const yama = { EbysNo: no, EbysTarih: Logic.tarihGecerliMi(veri.ebysTarih) ? veri.ebysTarih : '' };
    if (veri.dosya && veri.dosya.base64) yama.EbysEkUrl = await ebysPdfKaydet(etkinlikId, no, veri.dosya, k.eposta);
    const g = await db.guncelle(SAYFA.ETKINLIKLER, 'EtkinlikID', etkinlikId, yama);
    await db.logYaz(k.eposta, etkinlikId, 'EBYS_SONRADAN_BAGLANDI', no);
    return { etkinlik: await istemciEtkinlikTek(g), mesaj: 'EBYS numarası etkinliğe bağlandı.' };
  }));
}

async function ebysNoKontrol(ebysNo, etkinlikId) {
  const no = String(ebysNo || '').trim();
  if (!Logic.ebysNoGecerliMi(no, await db.ayar('EBYS_NO_REGEX'))) throw new Error('EBYS numarası geçerli biçimde değil.');
  const D = Logic.DURUM;
  const kullanilmis = (await db.hepsi(SAYFA.ETKINLIKLER)).some((x) =>
    x.EtkinlikID !== etkinlikId &&
    String(x.EbysNo).toLowerCase() === no.toLowerCase() &&
    x.Durum !== D.IPTAL && x.Durum !== D.SURESI_DOLDU);
  if (kullanilmis) throw new Error('Bu EBYS numarası başka bir etkinlikte kullanılıyor.');
  return no;
}

/** PDF'i veritabanına yazar, etkinlikte saklanacak indirme adresini döndürür. */
async function ebysPdfKaydet(etkinlikId, no, dosya, yukleyen) {
  if (dosya.mimeType !== 'application/pdf') throw new Error('Yalnızca PDF dosyası yüklenebilir.');
  const bayt = Buffer.from(String(dosya.base64), 'base64');
  const sinir = (await db.ayarSayi('EBYS_PDF_MAX_MB')) || 3;
  if (bayt.length > sinir * 1024 * 1024) throw new Error('PDF en fazla ' + sinir + ' MB olabilir.');
  if (bayt.slice(0, 4).toString() !== '%PDF') throw new Error('Dosya geçerli bir PDF değil.');
  const id = db.yeniId('DSY');
  await db.sorgu(
    'INSERT INTO "Dosyalar" ("DosyaID","EtkinlikID","Ad","Icerik","Boyut","YukleyenEposta","Zaman") VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [id, etkinlikId, (etkinlikId + '_' + no).replace(/[^A-Za-z0-9.-]/g, '_') + '.pdf', bayt, bayt.length, yukleyen, db.simdi()]
  );
  return '/api/dosya/' + id;
}

/** PDF'i yalnızca yetkili kullanıcıya verir: etkinlik sahibi, ilgili birim onaycısı veya yönetici. */
async function dosyaGetir(eposta, dosyaId) {
  const k = await aktifKullanici(eposta);
  const r = await db.sorgu('SELECT "EtkinlikID","Ad","Icerik" FROM "Dosyalar" WHERE "DosyaID" = $1', [String(dosyaId)]);
  if (!r.rows.length) throw new Error('Dosya bulunamadı.');
  const e = await db.bul(SAYFA.ETKINLIKLER, 'EtkinlikID', r.rows[0].EtkinlikID);
  if (!e || !(Logic.yetkiVarMi(k, 'ETKINLIK_SAHIBI', e) || Logic.yetkiVarMi(k, 'EBYS_ONAYLA', e))) {
    throw new Error('Bu dosyayı açma yetkiniz yok.');
  }
  return { ad: r.rows[0].Ad, icerik: Buffer.from(r.rows[0].Icerik) };
}

module.exports = { api_ebysGonder, api_ebysKarar, api_ebysSonradanBagla, dosyaGetir };
