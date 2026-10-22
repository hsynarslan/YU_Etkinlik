/**
 * komut.js — Komut satırı işleri:
 *   npm run kurulum            tabloları ve ayarları hazırlar (ILK_YONETICI_EPOSTA ilk yönetici olur, şifresi bir kez yazılır)
 *   npm run sifre -- <e-posta> [yeni şifre]   şifre belirler (şifre verilmezse rastgele üretilir ve yazılır)
 *   npm run sifre -- --hepsi   şifresi olmayan tüm aktif kullanıcılara rastgele şifre üretir ve listeler
 *   npm run ornek-veri         deneme için örnek mekân/birim ekler
 *   npm run gece-gorevi        gece görevini elle çalıştırır
 *   npm run aktar -- <klasör>  CSV dosyalarından (Etkinlikler.csv vb.) veri yükler
 * DATABASE_URL tanımlıysa o veritabanına bağlanır.
 */
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { kurulum, ornekVerileriYukle } = require('./kurulum');
const { gunlukSureKontrolu } = require('./rezervasyon');
const sifre = require('./sifre');
const { HEADERS } = require('./config');
const { csvOku } = require('../tools/kullanici-kontrol');

async function aktar(klasor) {
  if (!klasor) throw new Error('Kullanım: npm run aktar -- <csv klasörü>');
  await db.semaHazirla();
  await db.kilitle(async () => {
    for (const tablo of Object.keys(HEADERS)) {
      const dosya = [tablo + '.csv', tablo.toLowerCase() + '.csv'].map((a) => path.join(klasor, a)).find((a) => fs.existsSync(a));
      if (!dosya) { console.log('Atlandı (dosya yok): ' + tablo); continue; }
      const satirlar = csvOku(fs.readFileSync(dosya, 'utf8'));
      const basliklar = satirlar[0].map((x) => x.trim());
      const idSutun = require('./config').ID_SUTUN[tablo];
      const mevcut = idSutun ? new Set((await db.hepsi(tablo)).map((r) => r[idSutun])) : null;
      let n = 0;
      for (const s of satirlar.slice(1)) {
        const o = {};
        basliklar.forEach((b, i) => { if (HEADERS[tablo].includes(b)) o[b] = s[i] || ''; });
        if (mevcut && mevcut.has(o[idSutun])) continue;
        await db.ekle(tablo, o);
        n++;
      }
      console.log(tablo + ': ' + n + ' satır eklendi');
    }
  });
}

(async () => {
  const [, , komut, ...args] = process.argv;
  if (komut === 'kurulum') {
    const y = await kurulum();
    console.log('Kurulum tamam.');
    if (y) console.log(`\nİlk yönetici: ${y.eposta}\nŞifre: ${y.sifre}\n(Bu şifre bir daha gösterilmez; girişte Hesabım sekmesinden değiştirin.)`);
  } else if (komut === 'sifre') {
    if (args[0] === '--hepsi') {
      const liste = await sifre.eksikSifreleriUret();
      if (!liste.length) console.log('Şifresi olmayan aktif kullanıcı yok.');
      else {
        console.log('Üretilen şifreler (bir kez gösterilir; her kullanıcıya kendi şifresini ayrıca iletin):\n');
        liste.forEach((x) => console.log(x.eposta + '\t' + x.sifre));
      }
    } else if (args[0]) {
      const yeni = args[1] || sifre.rastgele(12);
      await sifre.sifreBelirle(args[0], yeni);
      console.log('Şifre belirlendi: ' + args[0].toLowerCase() + (args[1] ? '' : '\nŞifre: ' + yeni));
    } else throw new Error('Kullanım: npm run sifre -- <e-posta> [yeni şifre]   veya   npm run sifre -- --hepsi');
  }
  else if (komut === 'ornek-veri') { await ornekVerileriYukle(); console.log('Örnek veriler eklendi.'); }
  else if (komut === 'gece-gorevi') { console.log(await gunlukSureKontrolu()); }
  else if (komut === 'aktar') { await aktar(args[0]); }
  else throw new Error('Bilinmeyen komut: ' + komut);
  await db.kapat();
})().catch((e) => { console.error(e.message); process.exit(1); });
