#!/usr/bin/env node
/**
 * Arayüzü Google'a yüklemeden tarayıcıda görmek için: npm run onizleme
 *
 * Sahte Google servisleriyle örnek bir senaryo kurar (her durumda birkaç etkinlik),
 * api_baslangic çıktısını alır ve onizleme/index.html dosyasına gömer.
 * Dosyayı tarayıcıda açın. Butonlar sunucuya gitmez; yalnızca "önizleme" mesajı gösterir.
 */
const fs = require('fs');
const path = require('path');
const { yukle } = require('../tests/gas-mock');

const g = yukle();
const c = g.ctx;
c.kurulum();

const kisiler = [
  ['ayse.yilmaz@yasar.edu.tr', 'Ayşe Yılmaz', 'ORNEK_FAKULTE', 'TALEP_EDEN', ''],
  ['bi@yasar.edu.tr', 'Bilgi İşlem', 'BILGI_ISLEM', 'HIZMET_BIRIMI', ''],
  ['ki@yasar.edu.tr', 'Kurumsal İletişim', 'KURUMSAL_ILETISIM', 'HIZMET_BIRIMI', '']
];
kisiler.forEach(([Eposta, AdSoyad, Birim, Roller, OnayBirimleri]) =>
  c.db_ekle('Kullanicilar', { Eposta, AdSoyad, Birim, Roller, OnayBirimleri, Aktif: 'EVET' }));
c.db_guncelle('Kullanicilar', 'Eposta', 'kurucu@yasar.edu.tr', { AdSoyad: 'Deneme Yöneticisi', Birim: 'ORNEK_FAKULTE' });
c.ornekVerileriYukle();

const PDF = { ad: 'onay.pdf', mimeType: 'application/pdf', base64: Buffer.from('%PDF').toString('base64') };
const bugun = c.bugun();
const gun = (n) => c.Logic.isGunuEkle(bugun, n);
const ac = (ad, tarih, bas, bit, ek) => {
  const r = c.api_onRezervasyonOlustur(Object.assign({ ad, tur: 'Seminer', mekanId: 'ORNEK-KS', tarih,
    baslangic: bas, bitis: bit, katilimciSayisi: '120', protokolDuzeyi: 'STANDART' }, ek));
  if (!r.ok) throw new Error(ad + ': ' + r.mesaj);
  return r.etkinlik.EtkinlikID;
};

g.oturum.eposta = 'kurucu@yasar.edu.tr';
ac('Yapay Zekâ ve Etik Paneli', gun(15), '10:00', '12:00', { tur: 'Panel' });
const kontrol = ac('Kariyer Günleri 2026', gun(16), '09:30', '17:00', { tur: 'Konferans', katilimciSayisi: '250' });
c.api_ebysGonder(kontrol, { ebysNo: 'E-48213577', ebysTarih: bugun, dosya: PDF });
const detay = ac('Mezunlar Buluşması', gun(18), '18:00', '21:00', { tur: 'Sosyal / kültürel', mekanId: 'ORNEK-FUAYE' });
c.api_ebysGonder(detay, { ebysNo: 'E-48213999', ebysTarih: bugun, dosya: PDF });
c.api_ebysKarar(detay, true, '');
const hazirlik = ac('Sürdürülebilirlik Çalıştayı', gun(20), '13:00', '16:00', { tur: 'Çalıştay', mekanId: 'ORNEK-SEM1', katilimciSayisi: '40' });
c.api_ebysGonder(hazirlik, { ebysNo: 'E-48214101', ebysTarih: bugun, dosya: PDF });
c.api_ebysKarar(hazirlik, true, '');
c.api_detayKaydet(hazirlik, { afis: 'DIJITAL', afisTasarim: 'KURUMSAL_ILETISIM', duyuru: ['SOSYAL_MEDYA', 'WEB'], ses: true, mikrofonSayisi: '2', projeksiyon: true, ikram: 'CAY_KAHVE', ikramKisi: '40', oturmaDuzeni: 'YUVARLAK_MASA' });
const gorevler = c.db_hepsi('Gorevler').filter((x) => x.EtkinlikID === hazirlik);
g.oturum.eposta = 'bi@yasar.edu.tr';
c.api_gorevGuncelle(gorevler.find((x) => x.Birim === 'BILGI_ISLEM').GorevID, 'KABUL', 'Teknisyen 12:30\'da salonda');

g.oturum.eposta = 'ayse.yilmaz@yasar.edu.tr';
ac('Robotik Kulübü Tanıtım', gun(15), '11:00', '13:00', { tur: 'Kulüp etkinliği', yedegeAl: true });
g.oturum.eposta = 'kurucu@yasar.edu.tr';
ac('Rektörlük Protokol Ziyareti', gun(2), '14:00', '15:00', { ebysMuaf: true, muafGerekce: 'Valilik ziyareti kısa sürede planlandı', protokolDuzeyi: 'UST_DUZEY', tur: 'Diğer', mekanId: 'ORNEK-SEM1', katilimciSayisi: '30' });

const veri = c.api_baslangic();
if (!veri.ok) throw new Error(veri.mesaj);

const kok = path.join(__dirname, '..', 'apps-script');
const oku = (f) => fs.readFileSync(path.join(kok, f), 'utf8');
const sahteRun = `<script>
  window.__VERI = ${JSON.stringify(veri)};
  (function () {
    function kosucu(basari, hata) {
      return new Proxy({}, { get: function (_, ad) {
        if (ad === 'withSuccessHandler') return function (f) { return kosucu(f, hata); };
        if (ad === 'withFailureHandler') return function (f) { return kosucu(basari, f); };
        return function () {
          setTimeout(function () {
            basari && basari(ad === 'api_baslangic' ? window.__VERI : { ok: true, mesaj: 'Önizleme: ' + ad + ' sunucuya gönderilmedi.' });
          }, 120);
        };
      } });
    }
    window.google = { script: { run: kosucu() } };
  })();
</script>`;
const html = oku('Index.html')
  .replace("<?!= include_('Styles') ?>", oku('Styles.html'))
  .replace("<?!= include_('App') ?>", sahteRun + oku('App.html'));

const hedef = path.join(__dirname, '..', 'onizleme');
fs.mkdirSync(hedef, { recursive: true });
fs.writeFileSync(path.join(hedef, 'index.html'), html);
console.log('Önizleme hazır: ' + path.join(hedef, 'index.html'));
