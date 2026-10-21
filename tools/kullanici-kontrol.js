#!/usr/bin/env node
/**
 * Kullanıcı listesini Google Sheets'e yüklemeden önce denetler.
 * Kullanım: npm run kullanici-kontrol -- data/kullanicilar.csv [--birimler data/birimler.csv]
 *
 * Beklenen başlık: Eposta,AdSoyad,Birim,Roller,OnayBirimleri,Aktif
 */
const fs = require('fs');

const BASLIKLAR = ['Eposta', 'AdSoyad', 'Birim', 'Roller', 'OnayBirimleri', 'Aktif'];
const ROLLER = ['TALEP_EDEN', 'BIRIM_ONAYCI', 'HIZMET_BIRIMI', 'EBYS_MUAF', 'YONETICI'];
const HIZMET = ['KURUMSAL_ILETISIM', 'BILGI_ISLEM', 'TEKNIK_ISLER', 'IDARI_ISLER', 'GUVENLIK', 'PROTOKOL'];

/** Basit CSV ayrıştırıcı: tırnaklı alanlar, virgül veya noktalı virgül ayırıcı. */
function csvOku(metin) {
  metin = metin.replace(/^﻿/, '');
  const ayirici = (metin.split(/\r?\n/)[0].match(/;/g) || []).length > (metin.split(/\r?\n/)[0].match(/,/g) || []).length ? ';' : ',';
  const satirlar = [];
  let satir = [], alan = '', tirnak = false;
  for (let i = 0; i < metin.length; i++) {
    const ch = metin[i];
    if (tirnak) {
      if (ch === '"' && metin[i + 1] === '"') { alan += '"'; i++; }
      else if (ch === '"') tirnak = false;
      else alan += ch;
    } else if (ch === '"') tirnak = true;
    else if (ch === ayirici) { satir.push(alan); alan = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && metin[i + 1] === '\n') i++;
      satir.push(alan); satirlar.push(satir); satir = []; alan = '';
    } else alan += ch;
  }
  if (alan !== '' || satir.length) { satir.push(alan); satirlar.push(satir); }
  return satirlar.filter((r) => r.some((x) => x.trim() !== ''));
}

const liste = (s) => String(s || '').split(/[,;]/).map((x) => x.trim().toUpperCase()).filter(Boolean);

/** Satırları denetler; { hatalar, uyarilar, kayitlar } döndürür. */
function denetle(satirlar, opts = {}) {
  const alan = (opts.alanAdi || 'yasar.edu.tr').toLowerCase();
  const birimler = opts.birimler ? new Set(opts.birimler.map((b) => b.toUpperCase())) : null;
  const hatalar = [], uyarilar = [], kayitlar = [];
  const [baslik, ...veri] = satirlar;
  const eksik = BASLIKLAR.filter((b) => !(baslik || []).map((x) => x.trim()).includes(b));
  if (eksik.length) return { hatalar: ['Eksik başlık: ' + eksik.join(', ') + ' (beklenen: ' + BASLIKLAR.join(',') + ')'], uyarilar, kayitlar };
  const idx = Object.fromEntries(BASLIKLAR.map((b) => [b, baslik.map((x) => x.trim()).indexOf(b)]));
  const gorulen = new Map();
  let yonetici = 0;

  veri.forEach((r, i) => {
    const no = i + 2;
    const k = Object.fromEntries(BASLIKLAR.map((b) => [b, String(r[idx[b]] || '').trim()]));
    k.Eposta = k.Eposta.toLowerCase();
    k.Birim = k.Birim.toUpperCase();
    k.Aktif = (k.Aktif || 'EVET').toUpperCase();
    const roller = liste(k.Roller);
    const onay = liste(k.OnayBirimleri);
    const h = (m) => hatalar.push(`Satır ${no} (${k.Eposta || 'e-posta yok'}): ${m}`);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(k.Eposta)) h('geçersiz e-posta');
    else if (alan && k.Eposta.split('@')[1] !== alan) h(`e-posta @${alan} değil`);
    if (gorulen.has(k.Eposta)) h(`tekrar eden e-posta (ilk: satır ${gorulen.get(k.Eposta)})`);
    gorulen.set(k.Eposta, no);
    if (!k.AdSoyad) h('AdSoyad boş');
    if (!k.Birim) h('Birim boş');
    else if (!/^[A-Z0-9_]+$/.test(k.Birim)) h(`Birim kodu yalnızca büyük harf, rakam ve _ içermeli: "${k.Birim}"`);
    if (!roller.length) h('Roller boş');
    roller.filter((x) => !ROLLER.includes(x)).forEach((x) => h(`bilinmeyen rol "${x}" (geçerli: ${ROLLER.join(', ')})`));
    if (roller.includes('BIRIM_ONAYCI') && !onay.length) h('BIRIM_ONAYCI için OnayBirimleri dolu olmalı');
    if (onay.length && !roller.includes('BIRIM_ONAYCI')) uyarilar.push(`Satır ${no}: OnayBirimleri dolu ama BIRIM_ONAYCI rolü yok`);
    if (roller.includes('HIZMET_BIRIMI') && !HIZMET.includes(k.Birim)) h(`HIZMET_BIRIMI rolündeki kişinin birimi hizmet birimi olmalı (${HIZMET.join(', ')})`);
    if (!['EVET', 'HAYIR'].includes(k.Aktif)) h('Aktif EVET veya HAYIR olmalı');
    if (birimler) {
      [k.Birim, ...onay].filter((b) => !birimler.has(b) && !HIZMET.includes(b))
        .forEach((b) => uyarilar.push(`Satır ${no}: "${b}" Birimler listesinde yok`));
    }
    if (roller.includes('YONETICI') && k.Aktif === 'EVET') yonetici++;
    kayitlar.push({ ...k, Roller: roller.join(', '), OnayBirimleri: onay.join(', ') });
  });

  if (!yonetici) uyarilar.push('Listede aktif YONETICI yok (kurulum yapan kişi zaten yönetici olarak eklidir; listeyi yüklerken onu silmeyin).');
  const onayBirimleri = new Set(kayitlar.flatMap((k) => liste(k.OnayBirimleri)));
  new Set(kayitlar.filter((k) => liste(k.Roller).includes('TALEP_EDEN')).map((k) => k.Birim))
    .forEach((b) => { if (!onayBirimleri.has(b)) uyarilar.push(`"${b}" biriminden talep açılabilir ama bu birimin onaycısı yok (yalnızca yönetici onaylayabilir).`); });
  return { hatalar, uyarilar, kayitlar };
}

function csvYaz(kayitlar) {
  const kac = (v) => (/[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
  return [BASLIKLAR.join(','), ...kayitlar.map((k) => BASLIKLAR.map((b) => kac(String(k[b] || ''))).join(','))].join('\n') + '\n';
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const dosya = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--birimler' && args[args.indexOf(a) - 1] !== '--cikti');
  if (!dosya) { console.error('Kullanım: npm run kullanici-kontrol -- kullanicilar.csv [--birimler birimler.csv] [--cikti temiz.csv]'); process.exit(2); }
  const deger = (ad) => (args.includes(ad) ? args[args.indexOf(ad) + 1] : null);
  const birimDosyasi = deger('--birimler');
  const birimler = birimDosyasi ? csvOku(fs.readFileSync(birimDosyasi, 'utf8')).slice(1).map((r) => r[0].trim()) : null;
  const sonuc = denetle(csvOku(fs.readFileSync(dosya, 'utf8')), { birimler });

  sonuc.uyarilar.forEach((u) => console.warn('UYARI  ' + u));
  sonuc.hatalar.forEach((h) => console.error('HATA   ' + h));
  console.log(`\n${sonuc.kayitlar.length} kullanıcı · ${sonuc.hatalar.length} hata · ${sonuc.uyarilar.length} uyarı`);
  const cikti = deger('--cikti');
  if (cikti && !sonuc.hatalar.length) { fs.writeFileSync(cikti, csvYaz(sonuc.kayitlar)); console.log('Temizlenmiş liste: ' + cikti); }
  process.exit(sonuc.hatalar.length ? 1 : 0);
}

module.exports = { csvOku, denetle, csvYaz };
