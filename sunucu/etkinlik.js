/**
 * etkinlik.js — Detaylı etkinlik formu, hizmet birimi görevleri ve yönetici durum değişikliği.
 */
const Logic = require('./logic');
const { SAYFA } = require('./config');
const db = require('./db');
const { aktifKullanici, yetkiGerekli, epostalar, yoneticiler } = require('./auth');
const { bildir, etkinlikOzeti, htmlKacis } = require('./bildirim');
const { api } = require('./ortak');
const { onRezBitisHesapla, mekanBosaldi } = require('./rezervasyon');

/** Detaylı formu kaydeder, cevaplara göre birimlere görev açar. */
function api_detayKaydet(eposta, etkinlikId, detay) {
  return api(() => db.kilitle(async () => {
    const k = await aktifKullanici(eposta);
    const e = await db.bul(SAYFA.ETKINLIKLER, 'EtkinlikID', etkinlikId);
    if (!e) throw new Error('Etkinlik bulunamadı.');
    yetkiGerekli(k, 'ETKINLIK_SAHIBI', e);
    if (e.Durum !== Logic.DURUM.DETAY_BEKLENIYOR) throw new Error('Detay formu bu aşamada doldurulamaz.');

    const json = JSON.stringify(detay || {});
    if (json.length > 40000) throw new Error('Form içeriği çok uzun. Lütfen açıklamaları kısaltın.');

    const gorevler = Logic.gorevleriOlustur(detay, e.ProtokolDuzeyi);
    const D = Logic.DURUM;
    const yeniDurum = gorevler.length ? D.HAZIRLIK : D.KESINLESTI;
    Logic.gecisKontrol(e.Durum, yeniDurum);

    for (const g of gorevler) {
      await db.ekle(SAYFA.GOREVLER, {
        GorevID: db.yeniId('GRV'),
        EtkinlikID: etkinlikId,
        Birim: g.Birim,
        Tur: g.Tur,
        Aciklama: g.Aciklama,
        Durum: Logic.GOREV_DURUM.BEKLIYOR,
        Not: '',
        GuncelleyenEposta: '',
        GuncellemeZamani: db.simdi()
      });
    }
    await db.guncelle(SAYFA.ETKINLIKLER, 'EtkinlikID', etkinlikId, { Detay: json, Durum: yeniDurum });
    await db.logYaz(k.eposta, etkinlikId, 'DETAY_KAYDEDILDI', gorevler.length + ' görev açıldı');

    // Her birime kendi görevlerini bildir
    const birimler = gorevler.map((g) => g.Birim).filter((b, i, a) => a.indexOf(b) === i);
    for (const b of birimler) {
      const alicilar = await epostalar({ rol: Logic.ROLLER.HIZMET_BIRIMI, birim: b });
      const satirlar = gorevler.filter((g) => g.Birim === b)
        .map((g) => '• ' + htmlKacis(g.Aciklama)).join('<br>');
      await bildir(alicilar.length ? alicilar : await yoneticiler(), 'Biriminize yeni etkinlik görevi',
        (await etkinlikOzeti(e)) + '<br>' + satirlar, etkinlikId);
    }
    if (yeniDurum === D.KESINLESTI) {
      await bildir(e.SorumluEposta, 'Etkinliğiniz kesinleşti', await etkinlikOzeti(e), etkinlikId);
    }
    return {
      mesaj: gorevler.length
        ? gorevler.length + ' görev ilgili birimlere iletildi.'
        : 'Hizmet talebi olmadığı için etkinlik doğrudan kesinleşti.'
    };
  }));
}

/** Hizmet birimi kendi görevinin durumunu günceller. Tüm görevler kabul edilince etkinlik kesinleşir. */
function api_gorevGuncelle(eposta, gorevId, durum, not) {
  return api(() => db.kilitle(async () => {
    const k = await aktifKullanici(eposta);
    const g = await db.bul(SAYFA.GOREVLER, 'GorevID', gorevId);
    if (!g) throw new Error('Görev bulunamadı.');
    yetkiGerekli(k, 'GOREV_GUNCELLE', g);
    if (!Logic.GOREV_DURUM[durum]) throw new Error('Geçersiz görev durumu.');
    not = String(not || '').trim();
    const GD = Logic.GOREV_DURUM;
    if ((durum === GD.RED || durum === GD.BILGI_ISTENDI) && !not) throw new Error('Bu durum için açıklama zorunludur.');

    const e = await db.bul(SAYFA.ETKINLIKLER, 'EtkinlikID', g.EtkinlikID);
    if (!e || e.Durum === Logic.DURUM.IPTAL) throw new Error('İptal edilmiş etkinliğin görevi güncellenemez.');

    await db.guncelle(SAYFA.GOREVLER, 'GorevID', gorevId, { Durum: durum, Not: not, GuncelleyenEposta: k.eposta });
    await db.logYaz(k.eposta, g.EtkinlikID, 'GOREV_' + durum, g.Birim + ' · ' + g.Tur + (not ? ' · ' + not : ''));

    if (durum === GD.RED || durum === GD.BILGI_ISTENDI) {
      await bildir(e.SorumluEposta, durum === GD.RED ? 'Hizmet talebiniz reddedildi' : 'Hizmet birimi bilgi istiyor',
        (await etkinlikOzeti(e)) + '<br>' + htmlKacis(g.Birim) + ' · ' + htmlKacis(g.Aciklama) + '<br>Not: ' + htmlKacis(not),
        g.EtkinlikID);
    }

    const gorevler = (await db.hepsi(SAYFA.GOREVLER)).filter((x) => x.EtkinlikID === g.EtkinlikID);
    if (e.Durum === Logic.DURUM.HAZIRLIK && Logic.tumGorevlerTamamMi(gorevler)) {
      await db.guncelle(SAYFA.ETKINLIKLER, 'EtkinlikID', e.EtkinlikID, { Durum: Logic.DURUM.KESINLESTI });
      await db.logYaz('sistem', e.EtkinlikID, 'KESINLESTI', 'Tüm görevler kabul edildi');
      await bildir(e.SorumluEposta, 'Etkinliğiniz kesinleşti',
        (await etkinlikOzeti(e)) + '<br>Tüm hizmet birimleri talebinizi kabul etti.', e.EtkinlikID);
    }
    return { mesaj: 'Görev güncellendi.' };
  }));
}

/** Yalnızca yönetici: izin verilen bir durum geçişini elle yapar. */
function api_durumDegistir(eposta, etkinlikId, yeniDurum, not) {
  return api(() => db.kilitle(async () => {
    const k = await aktifKullanici(eposta);
    if (!Logic.rolVar(k, Logic.ROLLER.YONETICI)) throw new Error('Bu işlem yalnızca yöneticiler içindir.');
    const e = await db.bul(SAYFA.ETKINLIKLER, 'EtkinlikID', etkinlikId);
    if (!e) throw new Error('Etkinlik bulunamadı.');
    Logic.gecisKontrol(e.Durum, yeniDurum);
    if (!String(not || '').trim()) throw new Error('Elle durum değişikliği için açıklama zorunludur.');

    const yama = { Durum: yeniDurum };
    if (yeniDurum === Logic.DURUM.ON_REZERVASYON) {
      yama.OnRezBitis = await onRezBitisHesapla(db.bugun(), await db.ayarSayi('ON_REZ_SURE_GUN'), e.Tarih);
    }
    await db.guncelle(SAYFA.ETKINLIKLER, 'EtkinlikID', etkinlikId, yama);
    await db.logYaz(k.eposta, etkinlikId, 'ELLE_DURUM', e.Durum + ' → ' + yeniDurum + ' · ' + not);
    await bildir(e.SorumluEposta, 'Etkinlik durumu güncellendi',
      (await etkinlikOzeti(e)) + '<br>Yeni durum: ' + Logic.DURUM_ETIKET[yeniDurum] + '<br>Açıklama: ' + htmlKacis(not), etkinlikId);
    if (yeniDurum === Logic.DURUM.IPTAL || yeniDurum === Logic.DURUM.SURESI_DOLDU) await mekanBosaldi(e);
    return { mesaj: 'Durum güncellendi.' };
  }));
}

module.exports = { api_detayKaydet, api_gorevGuncelle, api_durumDegistir };
