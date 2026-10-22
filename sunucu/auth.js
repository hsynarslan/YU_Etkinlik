/**
 * auth.js — Oturumdaki kullanıcıyı tanıma ve yetki kontrolü.
 *
 * Giriş e-posta + şifre ile yapılır (bkz. sifre.js, oturum.js). Oturum çerezinden gelen e-posta
 * Kullanicilar tablosunda aktif bir kayıt olmalıdır; kullanıcıları yönetici tanımlar.
 */
const Logic = require('./logic');
const { SAYFA } = require('./config');
const db = require('./db');

async function aktifKullanici(eposta) {
  eposta = String(eposta || '').toLowerCase().trim();
  if (!eposta) throw new Error('Oturum bulunamadı. Lütfen yeniden giriş yapın.');
  return kullaniciBul(eposta);
}

async function kullaniciBul(eposta) {
  const e = String(eposta).toLowerCase();
  const k = (await db.hepsi(SAYFA.KULLANICILAR)).filter((x) =>
    String(x.Eposta).toLowerCase() === e && String(x.Aktif).toUpperCase() !== 'HAYIR')[0];
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
function yetkiGerekli(kullanici, islem, hedef) {
  if (!Logic.yetkiVarMi(kullanici, islem, hedef)) {
    throw new Error('Bu işlem için yetkiniz yok.');
  }
}

/** Rol veya birime göre kullanıcı e-postaları. */
async function epostalar(filtre) {
  return (await db.hepsi(SAYFA.KULLANICILAR)).filter((x) => {
    if (String(x.Aktif).toUpperCase() === 'HAYIR') return false;
    const roller = Logic.listeAyristir(x.Roller);
    if (filtre.rol && roller.indexOf(filtre.rol) === -1) return false;
    if (filtre.birim && String(x.Birim).toUpperCase() !== String(filtre.birim).toUpperCase()) return false;
    if (filtre.onayBirimi && Logic.listeAyristir(x.OnayBirimleri).indexOf(String(filtre.onayBirimi).toUpperCase()) === -1) return false;
    return true;
  }).map((x) => String(x.Eposta).toLowerCase());
}

function yoneticiler() {
  return epostalar({ rol: Logic.ROLLER.YONETICI });
}

module.exports = { aktifKullanici, kullaniciBul, yetkiGerekli, epostalar, yoneticiler };
