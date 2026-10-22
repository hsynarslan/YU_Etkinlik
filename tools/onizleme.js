#!/usr/bin/env node
/**
 * Arayüzü sunucusuz, tarayıcıda görmek için: npm run onizleme
 *
 * Bellekte bir PostgreSQL (PGlite) kurar, örnek bir senaryo yükler (her durumda birkaç etkinlik),
 * api_baslangic çıktısını alır ve onizleme/index.html dosyasına gömer. Butonlar sunucuya gitmez;
 * yalnızca "önizleme" mesajı gösterir. Gerçek uygulama için: npm run dev
 */
const fs = require('fs');
const path = require('path');
const { ortam, PDF } = require('../tests/ortam');
const { ornekVerileriYukle } = require('../sunucu/kurulum');

(async () => {
  const o = await ortam();
  const { c, db, Logic, giris } = o;
  await db.sorgu('DELETE FROM "Mekanlar"');
  await ornekVerileriYukle();
  await db.ekle('Kullanicilar', { Eposta: 'ayse.yilmaz@yasar.edu.tr', AdSoyad: 'Ayşe Yılmaz', Birim: 'ORNEK_FAKULTE', Roller: 'TALEP_EDEN', OnayBirimleri: '', Aktif: 'EVET' });
  await db.guncelle('Kullanicilar', 'Eposta', 'kurucu@yasar.edu.tr', { AdSoyad: 'Deneme Yöneticisi', Birim: 'ORNEK_FAKULTE' });

  const bugun = db.bugun();
  const gun = (n) => Logic.isGunuEkle(bugun, n);
  const ac = async (ad, tarih, bas, bit, ek) => {
    const r = await c.api_onRezervasyonOlustur(Object.assign({ ad, tur: 'Seminer', mekanId: 'ORNEK-KS', tarih,
      baslangic: bas, bitis: bit, katilimciSayisi: '120', protokolDuzeyi: 'STANDART' }, ek));
    if (!r.ok) throw new Error(ad + ': ' + r.mesaj);
    return r.etkinlik.EtkinlikID;
  };

  giris('kurucu@yasar.edu.tr');
  await ac('Yapay Zekâ ve Etik Paneli', gun(15), '10:00', '12:00', { tur: 'Panel' });
  const kontrol = await ac('Kariyer Günleri 2026', gun(16), '09:30', '17:00', { tur: 'Konferans', katilimciSayisi: '250' });
  await c.api_ebysGonder(kontrol, { ebysNo: 'E-48213577', ebysTarih: bugun, dosya: PDF });
  const detay = await ac('Mezunlar Buluşması', gun(18), '18:00', '21:00', { tur: 'Sosyal / kültürel', mekanId: 'ORNEK-FUAYE' });
  await c.api_ebysGonder(detay, { ebysNo: 'E-48213999', ebysTarih: bugun, dosya: PDF });
  await c.api_ebysKarar(detay, true, '');
  const hazirlik = await ac('Sürdürülebilirlik Çalıştayı', gun(20), '13:00', '16:00', { tur: 'Çalıştay', mekanId: 'ORNEK-SEM1', katilimciSayisi: '40' });
  await c.api_ebysGonder(hazirlik, { ebysNo: 'E-48214101', ebysTarih: bugun, dosya: PDF });
  await c.api_ebysKarar(hazirlik, true, '');
  await c.api_detayKaydet(hazirlik, { afis: 'DIJITAL', afisTasarim: 'KURUMSAL_ILETISIM', duyuru: ['SOSYAL_MEDYA', 'WEB'], ses: true, mikrofonSayisi: '2', projeksiyon: true, ikram: 'CAY_KAHVE', ikramKisi: '40', oturmaDuzeni: 'YUVARLAK_MASA' });
  const gorevler = (await db.hepsi('Gorevler')).filter((x) => x.EtkinlikID === hazirlik);
  giris('bi@yasar.edu.tr');
  await c.api_gorevGuncelle(gorevler.find((x) => x.Birim === 'BILGI_ISLEM').GorevID, 'KABUL', 'Teknisyen 12:30\'da salonda');
  giris('ayse.yilmaz@yasar.edu.tr');
  await ac('Robotik Kulübü Tanıtım', gun(15), '11:00', '13:00', { tur: 'Kulüp etkinliği', yedegeAl: true });
  giris('kurucu@yasar.edu.tr');
  await ac('Rektörlük Protokol Ziyareti', gun(2), '14:00', '15:00', { ebysMuaf: true, muafGerekce: 'Valilik ziyareti kısa sürede planlandı', protokolDuzeyi: 'UST_DUZEY', tur: 'Diğer', mekanId: 'ORNEK-SEM1', katilimciSayisi: '30' });

  const veri = await c.api_baslangic();
  if (!veri.ok) throw new Error(veri.mesaj);
  await o.kapat();

  const arayuz = path.join(__dirname, '..', 'sunucu', 'arayuz');
  const oku = (f) => fs.readFileSync(path.join(arayuz, f), 'utf8');
  const sahteFetch = `<script>
  window.__VERI = ${JSON.stringify(veri).replace(/</g, '\\u003c')};
  window.fetch = function (adres) {
    var ad = decodeURIComponent(String(adres).split('/').pop());
    var yanit = ad === 'api_baslangic' ? window.__VERI : { ok: true, mesaj: 'Önizleme: ' + ad + ' sunucuya gönderilmedi.' };
    return new Promise(function (coz) {
      setTimeout(function () { coz({ status: 200, json: function () { return Promise.resolve(yanit); } }); }, 120);
    });
  };
</script>`;
  const html = oku('index.html')
    .replace('{{STIL}}', () => oku('stil.html'))
    .replace('{{UYGULAMA}}', () => sahteFetch + oku('uygulama.html'));
  const hedef = path.join(__dirname, '..', 'onizleme');
  fs.mkdirSync(hedef, { recursive: true });
  fs.writeFileSync(path.join(hedef, 'index.html'), html);
  console.log('Önizleme hazır: ' + path.join(hedef, 'index.html'));
})().catch((e) => { console.error(e); process.exit(1); });
