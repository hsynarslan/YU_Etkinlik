/**
 * Auth.js — Oturumdaki kullanıcıyı tanıma ve yetki kontrolü.
 *
 * Web uygulaması "Execute as: Me (USER_DEPLOYING)" ve "Access: DOMAIN" ile yayınlanır.
 * Bu durumda Session.getActiveUser() aynı Workspace alanındaki kullanıcının e-postasını verir.
 * Kullanıcı Kullanicilar sayfasında yoksa sisteme giremez.
 */

function aktifKullanici_() {
  var eposta = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!eposta) {
    throw new Error('Oturum e-postası alınamadı. Üniversite Google hesabınızla giriş yaptığınızdan emin olun.');
  }
  var alan = String(ayar_('IZINLI_ALAN_ADI') || '').toLowerCase().trim();
  if (alan && eposta.split('@')[1] !== alan) {
    throw new Error('Yalnızca @' + alan + ' hesapları sisteme giriş yapabilir.');
  }
  return kullaniciBul_(eposta);
}

function kullaniciBul_(eposta) {
  var e = String(eposta).toLowerCase();
  var k = db_hepsi_(SAYFA.KULLANICILAR).filter(function (x) {
    return String(x.Eposta).toLowerCase() === e && String(x.Aktif).toUpperCase() !== 'HAYIR';
  })[0];
  if (!k) throw new Error(e + ' sistemde tanımlı değil. Yetki için sistem yöneticisine başvurun.');
  return {
    eposta: e,
    adSoyad: k.AdSoyad,
    birim: String(k.Birim || '').toUpperCase(),
    roller: Logic.listeAyristir(k.Roller),
    onayBirimleri: Logic.listeAyristir(k.OnayBirimleri)
  };
}

/** Yetki yoksa hata fırlatır. */
function yetkiGerekli_(kullanici, islem, hedef) {
  if (!Logic.yetkiVarMi(kullanici, islem, hedef)) {
    throw new Error('Bu işlem için yetkiniz yok.');
  }
}

/** Rol veya birime göre kullanıcı e-postaları. */
function epostalar_(filtre) {
  return db_hepsi_(SAYFA.KULLANICILAR).filter(function (x) {
    if (String(x.Aktif).toUpperCase() === 'HAYIR') return false;
    var roller = Logic.listeAyristir(x.Roller);
    if (filtre.rol && roller.indexOf(filtre.rol) === -1) return false;
    if (filtre.birim && String(x.Birim).toUpperCase() !== String(filtre.birim).toUpperCase()) return false;
    if (filtre.onayBirimi && Logic.listeAyristir(x.OnayBirimleri).indexOf(String(filtre.onayBirimi).toUpperCase()) === -1) return false;
    return true;
  }).map(function (x) { return String(x.Eposta).toLowerCase(); });
}

function yoneticiler_() {
  return epostalar_({ rol: Logic.ROLLER.YONETICI });
}
