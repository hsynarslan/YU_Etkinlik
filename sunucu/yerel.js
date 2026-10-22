/**
 * yerel.js — Bilgisayarınızda çalıştırmak için: npm run dev  (http://localhost:3000)
 * DATABASE_URL yoksa data/yerel-veritabani klasöründe yerel PostgreSQL (PGlite) kullanılır.
 */
process.env.GELISTIRME_GIRISI = process.env.GELISTIRME_GIRISI || 'EVET';
const db = require('./db');
const { kurulum, ornekVerileriYukle } = require('./kurulum');
const { uygulamaOlustur } = require('./uygulama');

(async () => {
  const yonetici = await kurulum({ yonetici: process.env.ILK_YONETICI_EPOSTA || 'yonetici@yasar.edu.tr' });
  if (yonetici) console.log(`İlk yönetici: ${yonetici.eposta}  şifre: ${yonetici.sifre}  (ya da giriş sayfasındaki geliştirme girişi)`);
  if (process.env.ORNEK_VERI !== 'HAYIR') await ornekVerileriYukle();
  const port = Number(process.env.PORT) || 3000;
  uygulamaOlustur().listen(port, () => {
    console.log(`Etkinlik Yönetim Sistemi: http://localhost:${port}  (veritabanı: ${process.env.DATABASE_URL ? 'DATABASE_URL' : 'yerel PGlite'})`);
  });
})().catch((e) => { console.error(e); process.exit(1); });
