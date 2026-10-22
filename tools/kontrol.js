#!/usr/bin/env node
/**
 * Sunucu ve arayüz kodunu yerelde kontrol eder: npm run kontrol
 *
 * 1) sunucu/*.js ve api/*.js dosyalarının, arayüzdeki <script> bloklarının sözdizimi
 * 2) uygulama.html'deki cagir('api_x') çağrılarının sunucudaki izin listesinde (API) karşılığı olması
 * 3) İzin listesindeki her fonksiyonun adının api_ ile başlaması ve ilk parametresinin oturum e-postası olması
 * 4) Arayüz şablonundaki yer tutucuların ({{STIL}}, {{UYGULAMA}}) bulunması
 * 5) Eski Google Apps Script API'lerine (google.script, SpreadsheetApp vb.) kalıntı referans olmaması
 * 6) vercel.json: işlev, yönlendirme ve cron tanımları
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const kok = path.join(__dirname, '..');
const sunucu = path.join(kok, 'sunucu');
const arayuz = path.join(sunucu, 'arayuz');
const hatalar = [];

const jsDosyalari = [
  ...fs.readdirSync(sunucu).filter((f) => f.endsWith('.js')).map((f) => path.join(sunucu, f)),
  ...fs.readdirSync(path.join(kok, 'api')).filter((f) => f.endsWith('.js')).map((f) => path.join(kok, 'api', f))
];
const htmlDosyalari = fs.readdirSync(arayuz).filter((f) => f.endsWith('.html'));

// 1) Sözdizimi
for (const f of jsDosyalari) {
  try { new vm.Script(`(function(exports, require, module, __filename, __dirname){${fs.readFileSync(f, 'utf8')}\n})`, { filename: f }); }
  catch (e) { hatalar.push(`${path.relative(kok, f)}: ${e.message}`); }
}
for (const f of htmlDosyalari) {
  const html = fs.readFileSync(path.join(arayuz, f), 'utf8');
  [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].forEach((m, i) => {
    try { new vm.Script(m[1], { filename: `${f}#script${i}` }); }
    catch (e) { hatalar.push(`${f} <script> #${i}: ${e.message}`); }
  });
}

// 2-3) İstemci → sunucu çağrıları ve izin listesi
let API = {};
try { API = require('../sunucu/uygulama').API; }
catch (e) { hatalar.push('sunucu/uygulama.js yüklenemedi: ' + e.message); }

const app = fs.readFileSync(path.join(arayuz, 'uygulama.html'), 'utf8');
const cagrilar = new Set([...app.matchAll(/cagir\(\s*(?:sonra \? )?'(\w+)'(?:\s*:\s*'(\w+)')?/g)].flatMap((m) => [m[1], m[2]]).filter(Boolean));
for (const ad of cagrilar) {
  if (!Object.prototype.hasOwnProperty.call(API, ad)) hatalar.push(`uygulama.html "${ad}" çağırıyor ama sunucudaki izin listesinde (API) yok.`);
}
for (const [ad, fn] of Object.entries(API)) {
  if (!ad.startsWith('api_')) hatalar.push(`API izin listesinde "${ad}" api_ ile başlamıyor.`);
  if (typeof fn !== 'function' || fn.length < 1) hatalar.push(`"${ad}" ilk parametre olarak oturum e-postasını almalı.`);
}

// 4) Şablon
const sablon = fs.readFileSync(path.join(arayuz, 'index.html'), 'utf8');
['{{STIL}}', '{{UYGULAMA}}'].forEach((y) => { if (!sablon.includes(y)) hatalar.push(`index.html'de ${y} yok.`); });

// 5) Eski Google referansları
const ESKI = /google\.script|SpreadsheetApp|LockService|PropertiesService|MailApp|DriveApp|HtmlService|ScriptApp|Session\.getActiveUser/;
for (const f of [...jsDosyalari, ...htmlDosyalari.map((x) => path.join(arayuz, x))]) {
  const metin = fs.readFileSync(f, 'utf8').split('\n').filter((s) => !/^\s*(\/\/|\*|\/\*)/.test(s)).join('\n');
  if (ESKI.test(metin)) hatalar.push(`${path.relative(kok, f)} eski Google Apps Script API'sine başvuruyor.`);
}

// 6) vercel.json
try {
  const v = JSON.parse(fs.readFileSync(path.join(kok, 'vercel.json'), 'utf8'));
  if (!(v.rewrites || []).some((r) => r.destination === '/api')) hatalar.push('vercel.json: tüm istekleri /api işlevine yönlendiren rewrite yok.');
  if (!(v.crons || []).some((c) => c.path === '/api/cron/gunluk')) hatalar.push('vercel.json: gece görevi (cron) tanımlı değil.');
  if (!v.functions || !v.functions['api/index.js']) hatalar.push('vercel.json: api/index.js işlev ayarı yok.');
} catch (e) { hatalar.push('vercel.json okunamadı: ' + e.message); }

if (hatalar.length) {
  console.error('Kontrol BAŞARISIZ:\n- ' + hatalar.join('\n- '));
  process.exit(1);
}
console.log(`Kontrol tamam: ${jsDosyalari.length} JS, ${htmlDosyalari.length} HTML dosyası; ${cagrilar.size} istemci çağrısının hepsi izin listesinde (${Object.keys(API).length} işlev).`);
