/**
 * Logic.js — Saf iş kuralları.
 *
 * Bu dosya veritabanına, ağa veya saate ERİŞMEZ; her şey parametreyle gelir.
 * Böylece sunucuda ve testlerde aynen çalışır.
 * Tüm sabitler (durumlar, roller) burada tanımlıdır; diğer dosyalar bunlara
 * yalnızca fonksiyonların İÇİNDEN `Logic.DURUM.X` şeklinde erişir.
 */
var Logic = (function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Sabitler
  // ---------------------------------------------------------------------------

  var DURUM = {
    YEDEK: 'YEDEK',                       // Mekân dolu, sırada bekliyor
    ON_REZERVASYON: 'ON_REZERVASYON',     // Mekân geçici tutuluyor, EBYS no bekleniyor
    EBYS_KONTROL: 'EBYS_KONTROL',         // EBYS no + PDF girildi, onaycı kontrol ediyor
    DETAY_BEKLENIYOR: 'DETAY_BEKLENIYOR', // Onaylandı (veya muaf), detaylı form bekleniyor
    HAZIRLIK: 'HAZIRLIK',                 // Görevler birimlere dağıtıldı
    KESINLESTI: 'KESINLESTI',             // Tüm görevler kabul edildi, takvimde yayında
    TAMAMLANDI: 'TAMAMLANDI',             // Etkinlik gerçekleşti
    IPTAL: 'IPTAL',
    SURESI_DOLDU: 'SURESI_DOLDU'          // Ön rezervasyon süresi içinde EBYS no girilmedi
  };

  var DURUM_ETIKET = {
    YEDEK: 'Yedek sırada',
    ON_REZERVASYON: 'Ön rezervasyon',
    EBYS_KONTROL: 'EBYS kontrolünde',
    DETAY_BEKLENIYOR: 'Detay formu bekleniyor',
    HAZIRLIK: 'Hazırlık',
    KESINLESTI: 'Kesinleşti',
    TAMAMLANDI: 'Tamamlandı',
    IPTAL: 'İptal',
    SURESI_DOLDU: 'Süresi doldu'
  };

  /** Mekânı fiilen meşgul eden durumlar (çakışma kontrolü bunlara bakar). */
  var AKTIF_DURUMLAR = [
    DURUM.ON_REZERVASYON,
    DURUM.EBYS_KONTROL,
    DURUM.DETAY_BEKLENIYOR,
    DURUM.HAZIRLIK,
    DURUM.KESINLESTI
  ];

  /** İzin verilen durum geçişleri. Burada olmayan geçiş reddedilir. */
  var GECISLER = {
    YEDEK: [DURUM.ON_REZERVASYON, DURUM.DETAY_BEKLENIYOR, DURUM.IPTAL],
    ON_REZERVASYON: [DURUM.EBYS_KONTROL, DURUM.SURESI_DOLDU, DURUM.IPTAL],
    EBYS_KONTROL: [DURUM.DETAY_BEKLENIYOR, DURUM.ON_REZERVASYON, DURUM.IPTAL],
    DETAY_BEKLENIYOR: [DURUM.HAZIRLIK, DURUM.KESINLESTI, DURUM.IPTAL],
    HAZIRLIK: [DURUM.KESINLESTI, DURUM.IPTAL],
    KESINLESTI: [DURUM.TAMAMLANDI, DURUM.IPTAL],
    TAMAMLANDI: [],
    IPTAL: [],
    SURESI_DOLDU: []
  };

  var ROLLER = {
    TALEP_EDEN: 'TALEP_EDEN',       // Etkinlik talebi açabilir
    BIRIM_ONAYCI: 'BIRIM_ONAYCI',   // Kendi onay birimlerinin EBYS kontrolünü yapar
    HIZMET_BIRIMI: 'HIZMET_BIRIMI', // Kendi birimine düşen görevleri günceller
    EBYS_MUAF: 'EBYS_MUAF',         // EBYS onayı olmadan etkinlik açabilir (gerekçeyle)
    YONETICI: 'YONETICI'            // Her şeyi görür ve yapar
  };

  var GOREV_DURUM = {
    BEKLIYOR: 'BEKLIYOR',
    KABUL: 'KABUL',
    BILGI_ISTENDI: 'BILGI_ISTENDI',
    RED: 'RED',
    TAMAMLANDI: 'TAMAMLANDI'
  };

  /** Hizmet birimi kodları. Birimler sayfasındaki BirimID'lerle aynı olmalıdır. */
  var HIZMET_BIRIMLERI = {
    KURUMSAL_ILETISIM: 'KURUMSAL_ILETISIM',
    BILGI_ISLEM: 'BILGI_ISLEM',
    TEKNIK_ISLER: 'TEKNIK_ISLER',
    IDARI_ISLER: 'IDARI_ISLER',
    GUVENLIK: 'GUVENLIK',
    PROTOKOL: 'PROTOKOL'
  };

  var PROTOKOL_DUZEYI = {
    STANDART: 'STANDART',
    DIS_KONUK: 'DIS_KONUK',
    UST_DUZEY: 'UST_DUZEY'
  };

  // ---------------------------------------------------------------------------
  // Tarih / saat yardımcıları (tarih: 'YYYY-MM-DD', saat: 'HH:MM')
  // ---------------------------------------------------------------------------

  function tarihGecerliMi(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var d = new Date(s + 'T00:00:00Z');
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }

  function saatGecerliMi(s) {
    return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  }

  function saatDakika(s) {
    if (!saatGecerliMi(s)) throw new Error('Geçersiz saat: ' + s);
    return Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  }

  function tarihUtc(s) {
    if (!tarihGecerliMi(s)) throw new Error('Geçersiz tarih: ' + s);
    return new Date(s + 'T00:00:00Z');
  }

  function utcTarih(d) {
    return d.toISOString().slice(0, 10);
  }

  /** b - a, takvim günü olarak. */
  function gunFarki(a, b) {
    return Math.round((tarihUtc(b).getTime() - tarihUtc(a).getTime()) / 864e5);
  }

  function isGunuMu(s, tatiller) {
    var gun = tarihUtc(s).getUTCDay(); // 0 pazar, 6 cumartesi
    if (gun === 0 || gun === 6) return false;
    return !(tatiller || []).some(function (t) { return t === s; });
  }

  /** `s` tarihine `n` iş günü ekler (hafta sonu ve verilen tatiller atlanır). */
  function isGunuEkle(s, n, tatiller) {
    var d = tarihUtc(s);
    var kalan = n;
    while (kalan > 0) {
      d = new Date(d.getTime() + 864e5);
      if (isGunuMu(utcTarih(d), tatiller)) kalan--;
    }
    return utcTarih(d);
  }

  // ---------------------------------------------------------------------------
  // Çakışma ve yedek sıra
  // ---------------------------------------------------------------------------

  /** [aBas, aBit) ile [bBas, bBit) kesişiyor mu? Uç uca eklenen etkinlikler çakışmaz. */
  function zamanCakisiyor(aBas, aBit, bBas, bBit) {
    return saatDakika(aBas) < saatDakika(bBit) && saatDakika(bBas) < saatDakika(aBit);
  }

  /**
   * `yeni` kaydı ile aynı mekân/tarihte, zamanı kesişen ve aktif durumdaki kayıtları döndürür.
   * Kayıt alanları: EtkinlikID, MekanID, Tarih, BaslangicSaati, BitisSaati, Durum
   */
  function cakismaBul(yeni, kayitlar, aktifDurumlar) {
    var aktif = aktifDurumlar || AKTIF_DURUMLAR;
    return (kayitlar || []).filter(function (k) {
      return k.EtkinlikID !== yeni.EtkinlikID &&
        String(k.MekanID) === String(yeni.MekanID) &&
        k.Tarih === yeni.Tarih &&
        aktif.indexOf(k.Durum) !== -1 &&
        zamanCakisiyor(yeni.BaslangicSaati, yeni.BitisSaati, k.BaslangicSaati, k.BitisSaati);
    });
  }

  /**
   * Bir kayıt mekânı boşalttığında (iptal / süre doldu) sıradaki yedek kaydı bulur.
   * Kural: boşalan kayıtla çakışan, kendisi artık hiçbir aktif kayıtla çakışmayan,
   * en erken oluşturulmuş YEDEK kayıt. Yoksa null.
   */
  function siradakiYedek(bosalan, kayitlar) {
    var adaylar = (kayitlar || []).filter(function (k) {
      return k.Durum === DURUM.YEDEK &&
        String(k.MekanID) === String(bosalan.MekanID) &&
        k.Tarih === bosalan.Tarih &&
        zamanCakisiyor(k.BaslangicSaati, k.BitisSaati, bosalan.BaslangicSaati, bosalan.BitisSaati);
    });
    adaylar.sort(function (a, b) {
      return String(a.OlusturmaZamani).localeCompare(String(b.OlusturmaZamani));
    });
    var digerleri = (kayitlar || []).filter(function (k) { return k.EtkinlikID !== bosalan.EtkinlikID; });
    for (var i = 0; i < adaylar.length; i++) {
      if (cakismaBul(adaylar[i], digerleri).length === 0) return adaylar[i];
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Durum geçişleri
  // ---------------------------------------------------------------------------

  function gecisGecerliMi(eski, yeni) {
    return Array.isArray(GECISLER[eski]) && GECISLER[eski].indexOf(yeni) !== -1;
  }

  function gecisKontrol(eski, yeni) {
    if (!gecisGecerliMi(eski, yeni)) {
      throw new Error('Bu işlem şu anki durumda yapılamaz (' +
        (DURUM_ETIKET[eski] || eski) + ' → ' + (DURUM_ETIKET[yeni] || yeni) + ').');
    }
  }

  // ---------------------------------------------------------------------------
  // Kullanıcı ve yetki
  // ---------------------------------------------------------------------------

  /** "TALEP_EDEN, birim_onayci" → ['TALEP_EDEN', 'BIRIM_ONAYCI'] */
  function listeAyristir(s) {
    if (Array.isArray(s)) return s;
    return String(s || '').split(/[,;]/).map(function (x) {
      return x.trim().toUpperCase();
    }).filter(Boolean);
  }

  function rolVar(kullanici, rol) {
    return !!kullanici && (kullanici.roller || []).indexOf(rol) !== -1;
  }

  function sahibiMi(kullanici, etkinlik) {
    if (!kullanici || !etkinlik) return false;
    var e = String(kullanici.eposta).toLowerCase();
    return String(etkinlik.SorumluEposta).toLowerCase() === e ||
      String(etkinlik.OlusturanEposta).toLowerCase() === e;
  }

  /**
   * İşlem bazlı yetki kontrolü.
   * kullanici: { eposta, roller[], birim, onayBirimleri[] }
   * hedef: işleme göre etkinlik veya görev kaydı
   */
  function yetkiVarMi(kullanici, islem, hedef) {
    if (!kullanici) return false;
    if (rolVar(kullanici, ROLLER.YONETICI)) return true;
    switch (islem) {
      case 'ON_REZ_OLUSTUR':
        return rolVar(kullanici, ROLLER.TALEP_EDEN) || rolVar(kullanici, ROLLER.EBYS_MUAF);
      case 'EBYS_MUAF_KULLAN':
        return rolVar(kullanici, ROLLER.EBYS_MUAF);
      case 'ETKINLIK_SAHIBI':
        return sahibiMi(kullanici, hedef);
      case 'EBYS_ONAYLA':
        return rolVar(kullanici, ROLLER.BIRIM_ONAYCI) && !!hedef &&
          (kullanici.onayBirimleri || []).indexOf(String(hedef.DuzenleyenBirim).toUpperCase()) !== -1;
      case 'EBYS_SONRADAN_BAGLA':
        return sahibiMi(kullanici, hedef) || rolVar(kullanici, ROLLER.EBYS_MUAF);
      case 'GOREV_GUNCELLE':
        return rolVar(kullanici, ROLLER.HIZMET_BIRIMI) && !!hedef &&
          String(kullanici.birim).toUpperCase() === String(hedef.Birim).toUpperCase();
      case 'YONETIM':
        return false;
      default:
        return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Doğrulamalar
  // ---------------------------------------------------------------------------

  function ebysNoGecerliMi(no, regexStr) {
    if (typeof no !== 'string' || !no.trim()) return false;
    return new RegExp(regexStr || '^[A-Za-z0-9./\\-]{4,40}$').test(no.trim());
  }

  /**
   * Ön rezervasyon formunu doğrular. Hata mesajları dizisi döndürür (boş = geçerli).
   * f: { ad, tur, mekanId, tarih, baslangic, bitis, katilimciSayisi, protokolDuzeyi, ebysMuaf, muafGerekce }
   * ctx: { bugun, mekan (veya null), asgariGun, asgariUstDuzeyGun }
   */
  function onRezervasyonDogrula(f, ctx) {
    var h = [];
    if (!f || !String(f.ad || '').trim()) h.push('Etkinlik adı zorunludur.');
    if (!String(f.tur || '').trim()) h.push('Etkinlik türü zorunludur.');
    if (!ctx.mekan) h.push('Geçerli bir mekân seçilmelidir.');
    if (!tarihGecerliMi(f.tarih)) h.push('Tarih YYYY-AA-GG biçiminde olmalıdır.');
    if (!saatGecerliMi(f.baslangic) || !saatGecerliMi(f.bitis)) {
      h.push('Başlangıç ve bitiş saatleri SS:DD biçiminde olmalıdır.');
    } else if (saatDakika(f.bitis) <= saatDakika(f.baslangic)) {
      h.push('Bitiş saati başlangıçtan sonra olmalıdır.');
    }
    var sayi = Number(f.katilimciSayisi);
    if (!(sayi > 0)) h.push('Tahmini katılımcı sayısı girilmelidir.');
    if (ctx.mekan && sayi > Number(ctx.mekan.Kapasite || 0) && Number(ctx.mekan.Kapasite) > 0) {
      h.push('Katılımcı sayısı mekân kapasitesini (' + ctx.mekan.Kapasite + ') aşıyor.');
    }
    if (f.protokolDuzeyi && !PROTOKOL_DUZEYI[f.protokolDuzeyi]) h.push('Geçersiz protokol düzeyi.');
    if (f.ebysMuaf && !String(f.muafGerekce || '').trim()) h.push('EBYS\'siz etkinlik için gerekçe zorunludur.');

    if (tarihGecerliMi(f.tarih) && tarihGecerliMi(ctx.bugun)) {
      var kalan = gunFarki(ctx.bugun, f.tarih);
      if (kalan < 0) {
        h.push('Geçmiş bir tarihe talep açılamaz.');
      } else if (!f.ebysMuaf) {
        var asgari = f.protokolDuzeyi === PROTOKOL_DUZEYI.UST_DUZEY ? ctx.asgariUstDuzeyGun : ctx.asgariGun;
        if (asgari && kalan < Number(asgari)) {
          h.push('Bu tür etkinlik için en az ' + asgari + ' gün önceden başvurulmalıdır.');
        }
      }
    }
    return h;
  }

  // ---------------------------------------------------------------------------
  // Detaylı formdan hizmet birimi görevleri
  // ---------------------------------------------------------------------------

  function evet(v) {
    return v === true || v === 'true' || v === 'EVET' || v === 'on';
  }

  /** Formdaki seçenek kodlarının görev açıklamalarında görünecek adları. */
  var SECENEK_ETIKET = {
    DIJITAL: 'dijital', BASILI: 'basılı', DIJITAL_VE_BASILI: 'dijital ve basılı',
    SOSYAL_MEDYA: 'sosyal medya', WEB: 'web sitesi', E_POSTA: 'e-posta', EKRANLAR: 'kampüs ekranları',
    MEVCUT: 'mevcut düzen', TIYATRO: 'tiyatro', SINIF: 'sınıf', YUVARLAK_MASA: 'yuvarlak masa', KOKTEYL: 'kokteyl',
    CAY_KAHVE: 'çay / kahve', YEMEK: 'yemek'
  };

  function etiket(kod) {
    return SECENEK_ETIKET[kod] || String(kod || '').toLowerCase();
  }

  /**
   * Detaylı etkinlik formuna göre birimlere açılacak görevleri üretir.
   * Dönen öğe: { Birim, Tur, Aciklama }
   */
  function gorevleriOlustur(detay, protokolDuzeyi) {
    var d = detay || {};
    var g = [];
    var B = HIZMET_BIRIMLERI;

    // Kurumsal İletişim
    if (d.afis && d.afis !== 'YOK') {
      g.push({ Birim: B.KURUMSAL_ILETISIM, Tur: 'AFIS',
        Aciklama: 'Afiş (' + etiket(d.afis) + ') · Tasarım: ' + (d.afisTasarim === 'BIRIM' ? 'düzenleyen birim, kurumsal kimlik onayı gerekli' : 'Kurumsal İletişim') });
    }
    var duyuru = listeAyristir(d.duyuru);
    if (duyuru.length) {
      g.push({ Birim: B.KURUMSAL_ILETISIM, Tur: 'DUYURU', Aciklama: 'Duyuru: ' + duyuru.map(etiket).join(', ') });
    }
    if (evet(d.basinDaveti) || evet(d.fotoVideo)) {
      var bf = [];
      if (evet(d.basinDaveti)) bf.push('basın daveti');
      if (evet(d.fotoVideo)) bf.push('fotoğraf/video çekimi');
      g.push({ Birim: B.KURUMSAL_ILETISIM, Tur: 'BASIN_FOTO', Aciklama: bf.join(', ') });
    }

    // Bilgi İşlem / görsel-işitsel teknik
    var teknik = [];
    if (evet(d.ses)) teknik.push('ses sistemi');
    if (Number(d.mikrofonSayisi) > 0) teknik.push(Number(d.mikrofonSayisi) + ' mikrofon');
    if (evet(d.projeksiyon)) teknik.push('projeksiyon/ekran');
    if (evet(d.isik)) teknik.push('ışık');
    if (evet(d.canliYayin)) teknik.push('canlı yayın');
    if (evet(d.kayit)) teknik.push('kayıt');
    if (evet(d.hibrit)) teknik.push('hibrit katılım');
    if (evet(d.simultane)) teknik.push('simultane çeviri');
    if (evet(d.misafirWifi)) teknik.push('misafir Wi-Fi');
    if (teknik.length) {
      g.push({ Birim: B.BILGI_ISLEM, Tur: 'TEKNIK', Aciklama: teknik.join(', ') });
    }

    // Teknik İşler: mekân kurulumu
    var kurulum = String(d.kurulumIhtiyaci || '').trim();
    if (kurulum || (d.oturmaDuzeni && d.oturmaDuzeni !== 'MEVCUT')) {
      g.push({ Birim: B.TEKNIK_ISLER, Tur: 'MEKAN_KURULUM',
        Aciklama: 'Oturma düzeni: ' + etiket(d.oturmaDuzeni || 'MEVCUT') + (kurulum ? ' · ' + kurulum : '') });
    }

    // İdari İşler
    if (d.ikram && d.ikram !== 'YOK') {
      g.push({ Birim: B.IDARI_ISLER, Tur: 'IKRAM',
        Aciklama: 'İkram: ' + etiket(d.ikram) + (Number(d.ikramKisi) > 0 ? ' · ' + Number(d.ikramKisi) + ' kişi' : '') });
    }
    if (String(d.konaklamaUlasim || '').trim()) {
      g.push({ Birim: B.IDARI_ISLER, Tur: 'ULASIM_KONAKLAMA', Aciklama: String(d.konaklamaUlasim).trim() });
    }

    // Güvenlik ve protokol
    var ustDuzey = protokolDuzeyi === PROTOKOL_DUZEYI.UST_DUZEY;
    if (evet(d.guvenlik) || evet(d.vipOtopark) || ustDuzey) {
      var gv = [];
      if (evet(d.guvenlik)) gv.push('güvenlik görevlisi');
      if (evet(d.vipOtopark) || ustDuzey) gv.push('VIP otopark');
      if (ustDuzey) gv.push('üst düzey protokol önlemi');
      g.push({ Birim: B.GUVENLIK, Tur: 'GUVENLIK', Aciklama: gv.join(', ') });
    }
    if (ustDuzey) {
      g.push({ Birim: B.PROTOKOL, Tur: 'PROTOKOL',
        Aciklama: 'Protokol listesi: ' + (String(d.protokolListesi || '').trim() || 'belirtilmedi') });
    }
    return g;
  }

  function tumGorevlerTamamMi(gorevler) {
    return (gorevler || []).length > 0 && gorevler.every(function (g) {
      return g.Durum === GOREV_DURUM.KABUL || g.Durum === GOREV_DURUM.TAMAMLANDI;
    });
  }

  // ---------------------------------------------------------------------------
  // Yönetim ekranı doğrulamaları (kullanıcı, mekân, birim, ayar)
  // Hepsi { hatalar: [...], kayit: {...} } döndürür; kayit düzeltilmiş (büyük/küçük harf, liste) hâlidir.
  // ---------------------------------------------------------------------------

  var EPOSTA_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var BIRIM_TURLERI = ['AKADEMIK', 'IDARI', 'HIZMET'];

  function metin(v) { return String(v == null ? '' : v).trim(); }
  function listeye(v) {
    return Array.isArray(v) ? v.map(function (x) { return metin(x).toUpperCase(); }).filter(Boolean) : listeAyristir(v);
  }
  function evetHayir(v) { return String(v).toUpperCase() === 'HAYIR' ? 'HAYIR' : 'EVET'; }

  /** ctx: { birimler: [BirimID, ...] } */
  function kullaniciDogrula(k, ctx) {
    k = k || {};
    var birimler = (ctx && ctx.birimler) || [];
    var h = [];
    var eposta = metin(k.Eposta).toLowerCase();
    if (!EPOSTA_RE.test(eposta)) h.push('Geçerli bir e-posta girin.');
    var ad = metin(k.AdSoyad);
    if (!ad) h.push('Ad soyad zorunludur.');
    if (ad.length > 100) h.push('Ad soyad en fazla 100 karakter olabilir.');
    var birim = metin(k.Birim).toUpperCase();
    if (!birim) h.push('Birim seçin.');
    else if (birim !== 'YONETIM' && birimler.indexOf(birim) === -1) h.push('Tanımsız birim: ' + birim);
    var roller = listeye(k.Roller);
    var gecerliRoller = Object.keys(ROLLER);
    roller.forEach(function (r) { if (gecerliRoller.indexOf(r) === -1) h.push('Tanımsız rol: ' + r); });
    if (!roller.length) h.push('En az bir rol seçin.');
    var onay = listeye(k.OnayBirimleri);
    onay.forEach(function (b) { if (birimler.indexOf(b) === -1) h.push('Tanımsız onay birimi: ' + b); });
    if (roller.indexOf(ROLLER.BIRIM_ONAYCI) !== -1 && !onay.length) h.push('Birim onaycısı için en az bir onay birimi seçin.');
    if (roller.indexOf(ROLLER.HIZMET_BIRIMI) !== -1 && !HIZMET_BIRIMLERI[birim]) h.push('Hizmet birimi rolü için birim bir hizmet birimi olmalıdır.');
    return { hatalar: h, kayit: { Eposta: eposta, AdSoyad: ad, Birim: birim, Roller: roller.join(', '), OnayBirimleri: onay.join(', '), Aktif: evetHayir(k.Aktif) } };
  }

  function mekanDogrula(m, ctx) {
    m = m || {};
    var birimler = (ctx && ctx.birimler) || [];
    var h = [];
    var id = metin(m.MekanID).toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{1,29}$/.test(id)) h.push('Mekân kodu 2-30 karakter olmalı; yalnızca harf, rakam, - ve _ kullanın (Türkçe karakter olmadan).');
    var ad = metin(m.Ad);
    if (!ad) h.push('Mekân adı zorunludur.');
    if (ad.length > 100) h.push('Mekân adı en fazla 100 karakter olabilir.');
    var bina = metin(m.Bina);
    if (bina.length > 100) h.push('Bina en fazla 100 karakter olabilir.');
    var kap = metin(m.Kapasite);
    if (!/^\d+$/.test(kap) || Number(kap) < 1 || Number(kap) > 100000) h.push('Kapasite 1 ile 100000 arasında bir tam sayı olmalıdır.');
    var sorumlu = metin(m.SorumluBirim).toUpperCase();
    if (sorumlu && birimler.indexOf(sorumlu) === -1) h.push('Tanımsız sorumlu birim: ' + sorumlu);
    return { hatalar: h, kayit: { MekanID: id, Ad: ad, Bina: bina, Kapasite: kap, SorumluBirim: sorumlu, Aktif: evetHayir(m.Aktif) } };
  }

  function birimDogrula(b) {
    b = b || {};
    var h = [];
    var id = metin(b.BirimID).toUpperCase();
    if (!/^[A-Z][A-Z0-9_]{1,39}$/.test(id)) h.push('Birim kodu 2-40 karakter olmalı, harfle başlamalı; yalnızca büyük harf, rakam ve _ kullanın (Türkçe karakter olmadan).');
    var ad = metin(b.Ad);
    if (!ad) h.push('Birim adı zorunludur.');
    if (ad.length > 100) h.push('Birim adı en fazla 100 karakter olabilir.');
    var tur = metin(b.Tur).toUpperCase();
    if (BIRIM_TURLERI.indexOf(tur) === -1) h.push('Tür AKADEMIK, IDARI veya HIZMET olmalıdır.');
    if (tur === 'HIZMET' && !HIZMET_BIRIMLERI[id]) h.push('Hizmet birimleri sabittir (' + Object.keys(HIZMET_BIRIMLERI).join(', ') + '); yenisi eklenemez.');
    if (tur !== 'HIZMET' && HIZMET_BIRIMLERI[id]) h.push(id + ' bir hizmet birimi kodudur; türü HIZMET olmalıdır.');
    var eposta = metin(b.Eposta).toLowerCase();
    if (eposta && !EPOSTA_RE.test(eposta)) h.push('Birim e-postası geçerli değil.');
    return { hatalar: h, kayit: { BirimID: id, Ad: ad, Tur: tur, Eposta: eposta } };
  }

  var AYAR_SAYI_ARALIK = {
    ON_REZ_SURE_GUN: [1, 60], UZATMA_GUN: [1, 60], MAX_UZATMA: [0, 10],
    ASGARI_BASVURU_GUN: [0, 365], ASGARI_BASVURU_UST_DUZEY_GUN: [0, 365],
    HATIRLATMA_GUN: [0, 30], EBYS_PDF_MAX_MB: [1, 3]
  };

  /** anahtarlar: bilinen ayar anahtarları dizisi. */
  function ayarDogrula(anahtar, deger, anahtarlar) {
    var h = [];
    anahtar = metin(anahtar);
    deger = metin(deger);
    if ((anahtarlar || []).indexOf(anahtar) === -1) return { hatalar: ['Tanımsız ayar: ' + anahtar], kayit: null };
    if (AYAR_SAYI_ARALIK[anahtar]) {
      var a = AYAR_SAYI_ARALIK[anahtar];
      if (!/^\d+$/.test(deger) || Number(deger) < a[0] || Number(deger) > a[1]) h.push(anahtar + ' ' + a[0] + ' ile ' + a[1] + ' arasında bir tam sayı olmalıdır.');
    } else if (anahtar === 'BILDIRIM_AKTIF') {
      if (deger !== 'EVET' && deger !== 'HAYIR') h.push('BILDIRIM_AKTIF EVET veya HAYIR olmalıdır.');
    } else if (anahtar === 'EBYS_NO_REGEX') {
      try { new RegExp(deger); } catch (e) { h.push('EBYS numarası düzenli ifadesi geçersiz.'); }
      if (!deger) h.push('EBYS numarası düzenli ifadesi boş olamaz.');
    } else if (anahtar === 'RESMI_TATILLER') {
      listeAyristir(deger).forEach(function (t) { if (!tarihGecerliMi(t)) h.push('Geçersiz tatil tarihi: ' + t + ' (YYYY-AA-GG olmalı).'); });
      deger = listeAyristir(deger).join(',');
    } else if (anahtar === 'UYGULAMA_URL') {
      if (deger && !/^https?:\/\/[^\s]+$/.test(deger)) h.push('Adres http:// veya https:// ile başlamalıdır.');
    }
    return { hatalar: h, kayit: { Anahtar: anahtar, Deger: deger } };
  }

  return {
    DURUM: DURUM,
    DURUM_ETIKET: DURUM_ETIKET,
    AKTIF_DURUMLAR: AKTIF_DURUMLAR,
    GECISLER: GECISLER,
    ROLLER: ROLLER,
    GOREV_DURUM: GOREV_DURUM,
    HIZMET_BIRIMLERI: HIZMET_BIRIMLERI,
    PROTOKOL_DUZEYI: PROTOKOL_DUZEYI,
    tarihGecerliMi: tarihGecerliMi,
    saatGecerliMi: saatGecerliMi,
    saatDakika: saatDakika,
    gunFarki: gunFarki,
    isGunuMu: isGunuMu,
    isGunuEkle: isGunuEkle,
    zamanCakisiyor: zamanCakisiyor,
    cakismaBul: cakismaBul,
    siradakiYedek: siradakiYedek,
    gecisGecerliMi: gecisGecerliMi,
    gecisKontrol: gecisKontrol,
    listeAyristir: listeAyristir,
    rolVar: rolVar,
    sahibiMi: sahibiMi,
    yetkiVarMi: yetkiVarMi,
    ebysNoGecerliMi: ebysNoGecerliMi,
    onRezervasyonDogrula: onRezervasyonDogrula,
    gorevleriOlustur: gorevleriOlustur,
    tumGorevlerTamamMi: tumGorevlerTamamMi,
    kullaniciDogrula: kullaniciDogrula,
    mekanDogrula: mekanDogrula,
    birimDogrula: birimDogrula,
    ayarDogrula: ayarDogrula
  };
})();

// Node.js (sunucu ve testler) için.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Logic;
}
