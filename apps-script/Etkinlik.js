/**
 * Etkinlik.js — Detaylı etkinlik formu, hizmet birimi görevleri ve yönetici durum değişikliği.
 */

/** Detaylı formu kaydeder, cevaplara göre birimlere görev açar. */
function api_detayKaydet(etkinlikId, detay) {
  return api_(function () {
    return kilitle(function () {
      var k = aktifKullanici();
      var e = db_bul(SAYFA.ETKINLIKLER, 'EtkinlikID', etkinlikId);
      if (!e) throw new Error('Etkinlik bulunamadı.');
      yetkiGerekli(k, 'ETKINLIK_SAHIBI', e);
      if (e.Durum !== Logic.DURUM.DETAY_BEKLENIYOR) throw new Error('Detay formu bu aşamada doldurulamaz.');

      var json = JSON.stringify(detay || {});
      if (json.length > 40000) throw new Error('Form içeriği çok uzun. Lütfen açıklamaları kısaltın.');

      var gorevler = Logic.gorevleriOlustur(detay, e.ProtokolDuzeyi);
      var D = Logic.DURUM;
      var yeniDurum = gorevler.length ? D.HAZIRLIK : D.KESINLESTI;
      Logic.gecisKontrol(e.Durum, yeniDurum);

      gorevler.forEach(function (g) {
        db_ekle(SAYFA.GOREVLER, {
          GorevID: yeniId('GRV'),
          EtkinlikID: etkinlikId,
          Birim: g.Birim,
          Tur: g.Tur,
          Aciklama: g.Aciklama,
          Durum: Logic.GOREV_DURUM.BEKLIYOR,
          Not: '',
          GuncelleyenEposta: '',
          GuncellemeZamani: simdi()
        });
      });
      db_guncelle(SAYFA.ETKINLIKLER, 'EtkinlikID', etkinlikId, { Detay: json, Durum: yeniDurum });
      logYaz(k.eposta, etkinlikId, 'DETAY_KAYDEDILDI', gorevler.length + ' görev açıldı');

      // Her birime kendi görevlerini bildir
      var birimler = gorevler.map(function (g) { return g.Birim; })
        .filter(function (b, i, a) { return a.indexOf(b) === i; });
      birimler.forEach(function (b) {
        var alicilar = epostalar({ rol: Logic.ROLLER.HIZMET_BIRIMI, birim: b });
        var satirlar = gorevler.filter(function (g) { return g.Birim === b; })
          .map(function (g) { return '• ' + htmlKacis(g.Aciklama); }).join('<br>');
        bildir(alicilar.length ? alicilar : yoneticiler(), 'Biriminize yeni etkinlik görevi',
          etkinlikOzeti(e) + '<br>' + satirlar, etkinlikId);
      });
      if (yeniDurum === D.KESINLESTI) {
        bildir(e.SorumluEposta, 'Etkinliğiniz kesinleşti', etkinlikOzeti(e), etkinlikId);
      }
      return {
        mesaj: gorevler.length
          ? gorevler.length + ' görev ilgili birimlere iletildi.'
          : 'Hizmet talebi olmadığı için etkinlik doğrudan kesinleşti.'
      };
    });
  });
}

/** Hizmet birimi kendi görevinin durumunu günceller. Tüm görevler kabul edilince etkinlik kesinleşir. */
function api_gorevGuncelle(gorevId, durum, not) {
  return api_(function () {
    return kilitle(function () {
      var k = aktifKullanici();
      var g = db_bul(SAYFA.GOREVLER, 'GorevID', gorevId);
      if (!g) throw new Error('Görev bulunamadı.');
      yetkiGerekli(k, 'GOREV_GUNCELLE', g);
      if (!Logic.GOREV_DURUM[durum]) throw new Error('Geçersiz görev durumu.');
      not = String(not || '').trim();
      var GD = Logic.GOREV_DURUM;
      if ((durum === GD.RED || durum === GD.BILGI_ISTENDI) && !not) throw new Error('Bu durum için açıklama zorunludur.');

      var e = db_bul(SAYFA.ETKINLIKLER, 'EtkinlikID', g.EtkinlikID);
      if (!e || e.Durum === Logic.DURUM.IPTAL) throw new Error('İptal edilmiş etkinliğin görevi güncellenemez.');

      db_guncelle(SAYFA.GOREVLER, 'GorevID', gorevId, { Durum: durum, Not: not, GuncelleyenEposta: k.eposta });
      logYaz(k.eposta, g.EtkinlikID, 'GOREV_' + durum, g.Birim + ' · ' + g.Tur + (not ? ' · ' + not : ''));

      if (durum === GD.RED || durum === GD.BILGI_ISTENDI) {
        bildir(e.SorumluEposta, durum === GD.RED ? 'Hizmet talebiniz reddedildi' : 'Hizmet birimi bilgi istiyor',
          etkinlikOzeti(e) + '<br>' + htmlKacis(g.Birim) + ' · ' + htmlKacis(g.Aciklama) + '<br>Not: ' + htmlKacis(not),
          g.EtkinlikID);
      }

      var gorevler = db_hepsi(SAYFA.GOREVLER).filter(function (x) { return x.EtkinlikID === g.EtkinlikID; });
      if (e.Durum === Logic.DURUM.HAZIRLIK && Logic.tumGorevlerTamamMi(gorevler)) {
        db_guncelle(SAYFA.ETKINLIKLER, 'EtkinlikID', e.EtkinlikID, { Durum: Logic.DURUM.KESINLESTI });
        logYaz('sistem', e.EtkinlikID, 'KESINLESTI', 'Tüm görevler kabul edildi');
        bildir(e.SorumluEposta, 'Etkinliğiniz kesinleşti',
          etkinlikOzeti(e) + '<br>Tüm hizmet birimleri talebinizi kabul etti.', e.EtkinlikID);
      }
      return { mesaj: 'Görev güncellendi.' };
    });
  });
}

/** Yalnızca yönetici: izin verilen bir durum geçişini elle yapar. */
function api_durumDegistir(etkinlikId, yeniDurum, not) {
  return api_(function () {
    return kilitle(function () {
      var k = aktifKullanici();
      if (!Logic.rolVar(k, Logic.ROLLER.YONETICI)) throw new Error('Bu işlem yalnızca yöneticiler içindir.');
      var e = db_bul(SAYFA.ETKINLIKLER, 'EtkinlikID', etkinlikId);
      if (!e) throw new Error('Etkinlik bulunamadı.');
      Logic.gecisKontrol(e.Durum, yeniDurum);
      if (!String(not || '').trim()) throw new Error('Elle durum değişikliği için açıklama zorunludur.');

      var yama = { Durum: yeniDurum };
      if (yeniDurum === Logic.DURUM.ON_REZERVASYON) {
        yama.OnRezBitis = onRezBitisHesapla_(bugun(), ayarSayi('ON_REZ_SURE_GUN'), e.Tarih);
      }
      db_guncelle(SAYFA.ETKINLIKLER, 'EtkinlikID', etkinlikId, yama);
      logYaz(k.eposta, etkinlikId, 'ELLE_DURUM', e.Durum + ' → ' + yeniDurum + ' · ' + not);
      bildir(e.SorumluEposta, 'Etkinlik durumu güncellendi',
        etkinlikOzeti(e) + '<br>Yeni durum: ' + Logic.DURUM_ETIKET[yeniDurum] + '<br>Açıklama: ' + htmlKacis(not), etkinlikId);
      if (yeniDurum === Logic.DURUM.IPTAL || yeniDurum === Logic.DURUM.SURESI_DOLDU) mekanBosaldi_(e);
      return { mesaj: 'Durum güncellendi.' };
    });
  });
}
