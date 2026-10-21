const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { csvOku, denetle } = require('../tools/kullanici-kontrol');

test('örnek kullanıcı listesi hatasız', () => {
  const satirlar = csvOku(fs.readFileSync(path.join(__dirname, '..', 'data', 'kullanicilar.ornek.csv'), 'utf8'));
  const birimler = csvOku(fs.readFileSync(path.join(__dirname, '..', 'data', 'birimler.ornek.csv'), 'utf8')).slice(1).map((r) => r[0]);
  const s = denetle(satirlar, { birimler });
  assert.deepEqual(s.hatalar, []);
  assert.equal(s.kayitlar.length, 6);
  assert.equal(s.kayitlar[1].Roller, 'TALEP_EDEN, BIRIM_ONAYCI');
});

test('hatalı satırlar yakalanır', () => {
  const csv = [
    'Eposta;AdSoyad;Birim;Roller;OnayBirimleri;Aktif',
    'a@gmail.com;A;MUH;TALEP_EDEN;;EVET',
    'b@yasar.edu.tr;B;MUH;BIRIM_ONAYCI;;EVET',
    'c@yasar.edu.tr;C;MUH;HIZMET_BIRIMI;;EVET',
    'd@yasar.edu.tr;D;MUH;SUPER_ADMIN;;EVET',
    'D@yasar.edu.tr;D2;MUH;TALEP_EDEN;;evet'
  ].join('\n');
  const s = denetle(csvOku(csv));
  const metin = s.hatalar.join('\n');
  assert.match(metin, /Satır 2.*@yasar\.edu\.tr değil/);
  assert.match(metin, /Satır 3.*OnayBirimleri dolu olmalı/);
  assert.match(metin, /Satır 4.*hizmet birimi olmalı/);
  assert.match(metin, /Satır 5.*bilinmeyen rol "SUPER_ADMIN"/);
  assert.match(metin, /Satır 6.*tekrar eden e-posta/);
  assert.ok(s.uyarilar.some((u) => /aktif YONETICI yok/.test(u)));
});

test('eksik başlık', () => {
  const s = denetle(csvOku('Eposta,Ad\nx@yasar.edu.tr,X\n'));
  assert.match(s.hatalar[0], /Eksik başlık/);
});
