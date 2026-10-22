/**
 * db.js — PostgreSQL veri katmanı.
 *
 * Canlıda (Vercel) DATABASE_URL ile Neon/PostgreSQL'e bağlanır.
 * Yerelde ve testlerde DATABASE_URL yoksa PGlite (bellekte/diskte çalışan PostgreSQL) kullanılır.
 *
 * Kurallar:
 * - Tüm yazma işlemleri `kilitle()` içinde yapılır. kilitle() bir veritabanı işlemi (transaction) açar
 *   ve genel bir kilit alır; ayrıca hata olursa yapılan her şey geri alınır.
 * - Hücreler düz metindir (TEXT). Nesne değerler (ör. Detay) JSON metni olarak saklanır.
 * - E-postalar işlem başarıyla bittikten SONRA gönderilir (bkz. islemSonrasi).
 */
const path = require('path');
const crypto = require('crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
const { APP, SAYFA, HEADERS, VARSAYILAN_AYARLAR } = require('./config');
const Logic = require('./logic');

const KILIT_NO = 727274; // pg_advisory_xact_lock anahtarı (tüm uygulama için tek kilit)
const baglam = new AsyncLocalStorage();
let havuz = null;

// -----------------------------------------------------------------------------
// Bağlantı
// -----------------------------------------------------------------------------

function pgAdaptor(baglantiAdresi) {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: baglantiAdresi, max: 3, idleTimeoutMillis: 10000 });
  return {
    tur: 'postgres',
    query: (sql, p) => pool.query(sql, p),
    async transaction(fn) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const r = await fn(c);
        await c.query('COMMIT');
        return r;
      } catch (e) {
        await c.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        c.release();
      }
    },
    end: () => pool.end()
  };
}

function pgliteAdaptor(pglite) {
  return {
    tur: 'pglite',
    query: (sql, p) => pglite.query(sql, p),
    transaction: (fn) => pglite.transaction(fn),
    end: () => pglite.close()
  };
}

/** Testlerde veya yerelde belirli bir bağlantı kullanmak için. */
function baglan(adaptor) { havuz = adaptor; }

function havuz_() {
  if (havuz) return havuz;
  const adres = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (adres) {
    havuz = pgAdaptor(adres);
  } else if (process.env.VERCEL) {
    throw new Error('Veritabanı tanımlı değil. Vercel ayarlarına DATABASE_URL ekleyin (bkz. docs/kurulum.md).');
  } else {
    const { PGlite } = require('@electric-sql/pglite');
    const klasor = process.env.YEREL_VERITABANI || path.join(__dirname, '..', 'data', 'yerel-veritabani');
    havuz = pgliteAdaptor(new PGlite(klasor === ':bellek:' ? undefined : klasor));
  }
  return havuz;
}

async function kapat() {
  if (havuz) await havuz.end();
  havuz = null;
}

/** O anki işlem (kilitle içindeysek) veya havuz üzerinden sorgu çalıştırır. */
async function sorgu(sql, params) {
  const store = baglam.getStore();
  const hedef = store && store.tx ? store.tx : havuz_();
  return hedef.query(sql, params || []);
}

// -----------------------------------------------------------------------------
// Tablo şeması
// -----------------------------------------------------------------------------

const q = (ad) => '"' + String(ad).replace(/"/g, '""') + '"';

/** Eksik tabloları ve sütunları oluşturur. Var olan veriye dokunmaz; tekrar çalıştırmak güvenlidir. */
async function semaHazirla() {
  for (const tablo of Object.keys(HEADERS)) {
    await sorgu(`CREATE TABLE IF NOT EXISTS ${q(tablo)} ("_sira" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY)`);
    for (const sutun of HEADERS[tablo]) {
      await sorgu(`ALTER TABLE ${q(tablo)} ADD COLUMN IF NOT EXISTS ${q(sutun)} TEXT NOT NULL DEFAULT ''`);
    }
  }
  // EBYS onay yazıları (PDF) ayrı tabloda, ikili veri olarak.
  await sorgu(`CREATE TABLE IF NOT EXISTS "Dosyalar" (
    "DosyaID" TEXT PRIMARY KEY, "EtkinlikID" TEXT NOT NULL, "Ad" TEXT NOT NULL,
    "Icerik" BYTEA NOT NULL, "Boyut" INTEGER NOT NULL, "YukleyenEposta" TEXT NOT NULL, "Zaman" TEXT NOT NULL)`);
  const indeksler = [
    ['Etkinlikler', 'EtkinlikID', true], ['Gorevler', 'GorevID', true], ['Gorevler', 'EtkinlikID', false],
    ['Mekanlar', 'MekanID', true], ['Birimler', 'BirimID', true], ['Kullanicilar', 'Eposta', true],
    ['Ayarlar', 'Anahtar', true], ['Log', 'EtkinlikID', false]
  ];
  for (const [tablo, sutun, tekil] of indeksler) {
    await sorgu(`CREATE ${tekil ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS ${q('ix_' + tablo + '_' + sutun)} ON ${q(tablo)} (${q(sutun)})`);
  }
}

// -----------------------------------------------------------------------------
// Okuma / yazma
// -----------------------------------------------------------------------------

function satirNormalize(satir) {
  const o = {};
  Object.keys(satir).forEach((k) => {
    const v = satir[k];
    o[k] = v === null || v === undefined ? '' : k === '_sira' ? Number(v) : String(v);
  });
  return o;
}

function hucre(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Tablodaki tüm satırları { sütun: değer } nesneleri olarak, eklenme sırasıyla döndürür. */
async function hepsi(tablo) {
  if (!HEADERS[tablo]) throw new Error('Bilinmeyen tablo: ' + tablo);
  const r = await sorgu(`SELECT * FROM ${q(tablo)} ORDER BY "_sira"`);
  return r.rows.map(satirNormalize);
}

async function bul(tablo, idSutun, id) {
  if (!HEADERS[tablo] || HEADERS[tablo].indexOf(idSutun) === -1) throw new Error('Bilinmeyen sütun: ' + tablo + '.' + idSutun);
  const r = await sorgu(`SELECT * FROM ${q(tablo)} WHERE ${q(idSutun)} = $1 ORDER BY "_sira" LIMIT 1`, [String(id)]);
  return r.rows.length ? satirNormalize(r.rows[0]) : null;
}

async function ekle(tablo, nesne) {
  const sutunlar = HEADERS[tablo];
  if (!sutunlar) throw new Error('Bilinmeyen tablo: ' + tablo);
  const degerler = sutunlar.map((s) => hucre(nesne[s]).trim());
  await sorgu(
    `INSERT INTO ${q(tablo)} (${sutunlar.map(q).join(', ')}) VALUES (${sutunlar.map((_, i) => '$' + (i + 1)).join(', ')})`,
    degerler
  );
  return nesne;
}

/** id ile bulunan satırı `yama` alanlarıyla günceller, güncel kaydı döndürür. */
async function guncelle(tablo, idSutun, id, yama) {
  const kayit = await bul(tablo, idSutun, id);
  if (!kayit) throw new Error('Kayıt bulunamadı: ' + id);
  const sutunlar = HEADERS[tablo];
  const degisen = Object.assign({}, yama);
  if (sutunlar.indexOf('GuncellemeZamani') !== -1) degisen.GuncellemeZamani = simdi();
  const alanlar = Object.keys(degisen).filter((k) => sutunlar.indexOf(k) !== -1);
  if (alanlar.length) {
    const params = alanlar.map((k) => hucre(degisen[k]));
    params.push(kayit._sira);
    await sorgu(
      `UPDATE ${q(tablo)} SET ${alanlar.map((k, i) => q(k) + ' = $' + (i + 1)).join(', ')} WHERE "_sira" = $${params.length}`,
      params
    );
  }
  const yeni = Object.assign({}, kayit);
  alanlar.forEach((k) => { yeni[k] = hucre(degisen[k]); });
  return yeni;
}

/**
 * Eşzamanlı yazmaları sıraya sokar ve hepsini tek işlemde yapar.
 * İçeride hata olursa hiçbir değişiklik kaydedilmez ve bekleyen e-postalar gönderilmez.
 */
async function kilitle(fn) {
  const mevcut = baglam.getStore();
  if (mevcut && mevcut.tx) return fn();
  const sonra = [];
  let sonuc;
  try {
    sonuc = await havuz_().transaction(async (tx) => {
      if (havuz_().tur === 'postgres') await tx.query("SET LOCAL lock_timeout = '20s'");
      await tx.query('SELECT pg_advisory_xact_lock($1)', [KILIT_NO]);
      return baglam.run({ tx, sonra }, fn);
    });
  } catch (e) {
    if (e && e.code === '55P03') throw new Error('Sistem şu anda yoğun, lütfen birkaç saniye sonra tekrar deneyin.');
    throw e;
  }
  for (const is of sonra) {
    try { await is(); } catch (e) { console.error(e); }
  }
  return sonuc;
}

/** İşlem başarıyla kaydedildikten sonra çalışacak işi ekler (işlem dışındaysak hemen çalıştırır). */
async function islemSonrasi(is) {
  const store = baglam.getStore();
  if (store && store.sonra) store.sonra.push(is);
  else await is();
}

// -----------------------------------------------------------------------------
// Zaman ve kimlik
// -----------------------------------------------------------------------------

function parcalar(tarih) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: APP.SAAT_DILIMI, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(tarih).map((x) => [x.type, x.value]));
}

/** Testlerde "bugün"ü sabitlemek için değiştirilebilir. */
let saat = () => new Date();
function saatAyarla(fn) { saat = fn || (() => new Date()); }

function bugun() {
  const p = parcalar(saat());
  return `${p.year}-${p.month}-${p.day}`;
}

function simdi() {
  const p = parcalar(saat());
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

function yeniId(onek) {
  return onek + '-' + bugun().replace(/-/g, '') + '-' + crypto.randomUUID().slice(0, 6).toUpperCase();
}

// -----------------------------------------------------------------------------
// Ayarlar ve log
// -----------------------------------------------------------------------------

async function ayar(anahtar) {
  const kayit = await bul(SAYFA.AYARLAR, 'Anahtar', anahtar);
  if (kayit && kayit.Deger !== '') return kayit.Deger;
  const v = VARSAYILAN_AYARLAR.filter((x) => x[0] === anahtar)[0];
  return v ? v[1] : '';
}

async function ayarSayi(anahtar) {
  const n = Number(await ayar(anahtar));
  return isNaN(n) ? 0 : n;
}

async function ayarYaz(anahtar, deger) {
  const kayit = await bul(SAYFA.AYARLAR, 'Anahtar', anahtar);
  if (kayit) return guncelle(SAYFA.AYARLAR, 'Anahtar', anahtar, { Deger: deger });
  return ekle(SAYFA.AYARLAR, { Anahtar: anahtar, Deger: deger, Aciklama: '' });
}

async function resmiTatiller() {
  return Logic.listeAyristir(await ayar('RESMI_TATILLER'));
}

async function logYaz(eposta, etkinlikId, islem, detay) {
  await ekle(SAYFA.LOG, {
    Zaman: simdi(),
    Eposta: eposta || '',
    EtkinlikID: etkinlikId || '',
    Islem: islem,
    Detay: detay || ''
  });
}

module.exports = {
  baglan, pgAdaptor, pgliteAdaptor, kapat, sorgu, semaHazirla,
  hepsi, bul, ekle, guncelle, kilitle, islemSonrasi,
  bugun, simdi, yeniId, saatAyarla,
  ayar, ayarSayi, ayarYaz, resmiTatiller, logYaz
};
