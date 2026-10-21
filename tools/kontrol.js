#!/usr/bin/env node
/**
 * Apps Script kodunu yerelde kontrol eder (clasp push öncesi çalıştırın): npm run kontrol
 *
 * 1) Her .js dosyasının ve HTML içindeki <script> bloklarının sözdizimi
 * 2) Tüm .js dosyaları HERHANGİ bir sırayla yüklendiğinde üst düzeyde hata vermemesi
 *    (Apps Script dosya sırasını garanti etmez; dosyalar arası bağımlılık yalnızca fonksiyon içinde olmalı)
 * 3) App.html'deki cagir('api_x') çağrılarının sunucuda karşılığı olması
 * 4) Şablonlardaki include_('X') dosyalarının var olması
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const kok = path.join(__dirname, '..', 'apps-script');
const dosyalar = fs.readdirSync(kok);
const jsDosyalari = dosyalar.filter((f) => f.endsWith('.js'));
const htmlDosyalari = dosyalar.filter((f) => f.endsWith('.html'));
const hatalar = [];

// 1) Sözdizimi
for (const f of jsDosyalari) {
  try { new vm.Script(fs.readFileSync(path.join(kok, f), 'utf8'), { filename: f }); }
  catch (e) { hatalar.push(`${f}: ${e.message}`); }
}
for (const f of htmlDosyalari) {
  const html = fs.readFileSync(path.join(kok, f), 'utf8');
  const bloklar = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  bloklar.forEach((kod, i) => {
    try { new vm.Script(kod, { filename: `${f}#script${i}` }); }
    catch (e) { hatalar.push(`${f} <script> #${i}: ${e.message}`); }
  });
}

// 2) Üst düzey yükleme, ters sırada da denenir
const sunucuFonksiyonlari = new Set();
for (const sira of [jsDosyalari, [...jsDosyalari].reverse()]) {
  const ctx = vm.createContext({ console });
  for (const f of sira) {
    try { vm.runInContext(fs.readFileSync(path.join(kok, f), 'utf8'), ctx, { filename: f }); }
    catch (e) { hatalar.push(`${f} üst düzeyde yüklenirken hata (sıra: ${sira[0]} ile başlayan): ${e.message}`); }
  }
  Object.keys(ctx).forEach((k) => { if (typeof ctx[k] === 'function') sunucuFonksiyonlari.add(k); });
}

// 3) İstemci → sunucu çağrıları
const app = fs.readFileSync(path.join(kok, 'App.html'), 'utf8');
const cagrilar = new Set([...app.matchAll(/cagir\(\s*(?:sonra \? )?'(\w+)'(?:\s*:\s*'(\w+)')?/g)].flatMap((m) => [m[1], m[2]]).filter(Boolean));
for (const ad of cagrilar) {
  if (!sunucuFonksiyonlari.has(ad)) hatalar.push(`App.html "${ad}" çağırıyor ama sunucuda böyle bir fonksiyon yok.`);
  if (ad.endsWith('_')) hatalar.push(`App.html "${ad}" çağırıyor; sonu _ ile biten fonksiyonlar istemciden çağrılamaz.`);
}

// 4) include_ hedefleri
for (const f of htmlDosyalari) {
  const html = fs.readFileSync(path.join(kok, f), 'utf8');
  for (const m of html.matchAll(/include_\('(\w+)'\)/g)) {
    if (!htmlDosyalari.includes(m[1] + '.html')) hatalar.push(`${f}: include_('${m[1]}') için ${m[1]}.html yok.`);
  }
}

if (hatalar.length) {
  console.error('Kontrol BAŞARISIZ:\n- ' + hatalar.join('\n- '));
  process.exit(1);
}
console.log(`Kontrol tamam: ${jsDosyalari.length} JS, ${htmlDosyalari.length} HTML dosyası; ${cagrilar.size} istemci çağrısının hepsi sunucuda tanımlı.`);
