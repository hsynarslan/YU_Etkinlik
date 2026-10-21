/**
 * Google Apps Script servislerinin bellek içi sahte sürümü.
 * Sunucu kodunu Node.js'te uçtan uca denemek için kullanılır (tests/akis.test.js).
 * Yalnızca projede kullanılan API yüzeyini taklit eder.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

function sahteSayfa(ad) {
  const veri = []; // satır dizileri
  const genislik = () => veri.reduce((m, r) => Math.max(m, r.length), 0);
  const hucre = (r, c) => (veri[r] && veri[r][c] !== undefined ? veri[r][c] : '');
  const aralik = (satir, sutun, n = 1, m = 1) => ({
    getValues: () => Array.from({ length: n }, (_, i) => Array.from({ length: m }, (_, j) => hucre(satir - 1 + i, sutun - 1 + j))),
    setValues: (degerler) => {
      degerler.forEach((r, i) => r.forEach((v, j) => {
        while (veri.length < satir + i) veri.push([]);
        veri[satir - 1 + i][sutun - 1 + j] = v;
      }));
      return aralik(satir, sutun, n, m);
    },
    setNumberFormat() { return this; },
    setFontWeight() { return this; },
    setBackground() { return this; },
    setDataValidation() { return this; }
  });
  return {
    _veri: veri,
    getName: () => ad,
    getLastRow: () => {
      for (let i = veri.length - 1; i >= 0; i--) if (veri[i].some((x) => x !== '' && x !== undefined)) return i + 1;
      return 0;
    },
    getLastColumn: () => genislik(),
    getMaxRows: () => Math.max(1000, veri.length),
    getMaxColumns: () => Math.max(26, genislik()),
    getDataRange() { return aralik(1, 1, Math.max(this.getLastRow(), 1), Math.max(genislik(), 1)); },
    getRange: (r, c, n, m) => aralik(r, c, n, m),
    appendRow(satir) { veri.push(satir.slice()); },
    setFrozenRows() {}
  };
}

function sahteTablo() {
  const sayfalar = [sahteSayfa('Sheet1')];
  return {
    getId: () => 'SAHTE_TABLO',
    getUrl: () => 'https://docs.google.com/spreadsheets/d/SAHTE_TABLO',
    setSpreadsheetTimeZone() {},
    getSheetByName: (ad) => sayfalar.find((s) => s.getName() === ad) || null,
    insertSheet: (ad) => { const s = sahteSayfa(ad); sayfalar.push(s); return s; },
    getSheets: () => sayfalar.slice(),
    deleteSheet: (s) => sayfalar.splice(sayfalar.indexOf(s), 1)
  };
}

function bicimle(tarih, tz, kalip) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(tarih).map((x) => [x.type, x.value]));
  return kalip.replace(/'([^']*)'/g, '\u0000$1\u0000').split('\u0000').map((parca, i) => (i % 2 ? parca : parca
    .replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day)
    .replace('HH', p.hour).replace('mm', p.minute).replace('ss', p.second))).join('');
}

/** Apps Script kodunu sahte servislerle yükler; bağlamı ve gözlem kayıtlarını döndürür. */
function yukle() {
  const props = {};
  const gonderilenler = [];
  const dosyalar = [];
  const oturum = { eposta: '' };
  let tablo = null;

  const ctx = {
    console: { log() {}, error() {} },
    Logger: { log() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    SpreadsheetApp: {
      create: () => (tablo = sahteTablo()),
      openById: () => tablo,
      flush() {},
      newDataValidation: () => { const b = { requireValueInList: () => b, setAllowInvalid: () => b, build: () => ({}) }; return b; }
    },
    Session: { getActiveUser: () => ({ getEmail: () => oturum.eposta }), getEffectiveUser: () => ({ getEmail: () => 'kurucu@yasar.edu.tr' }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: {
      formatDate: bicimle,
      getUuid: () => crypto.randomUUID(),
      base64Decode: (s) => Array.from(Buffer.from(s, 'base64')),
      newBlob: (bytes, tur, ad) => ({ bytes, tur, ad })
    },
    DriveApp: {
      Access: { DOMAIN_WITH_LINK: 'DOMAIN_WITH_LINK' },
      Permission: { VIEW: 'VIEW' },
      createFolder: () => ({ getId: () => 'KLASOR1' }),
      getFolderById: () => ({ createFile: (blob) => { dosyalar.push(blob); return { getUrl: () => 'https://drive.google.com/file/' + blob.ad, setSharing() {} }; } })
    },
    MailApp: { sendEmail: (o) => gonderilenler.push(o) },
    ScriptApp: {
      getProjectTriggers: () => [],
      deleteTrigger() {},
      newTrigger: () => { const t = { timeBased: () => t, everyDays: () => t, atHour: () => t, inTimezone: () => t, create: () => t }; return t; }
    },
    HtmlService: {}
  };
  vm.createContext(ctx);
  const kok = path.join(__dirname, '..', 'apps-script');
  for (const f of fs.readdirSync(kok).filter((x) => x.endsWith('.js'))) {
    vm.runInContext(fs.readFileSync(path.join(kok, f), 'utf8'), ctx, { filename: f });
  }
  return { ctx, oturum, gonderilenler, dosyalar, tablo: () => tablo };
}

module.exports = { yukle };
