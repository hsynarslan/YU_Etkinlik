# CLAUDE.md — Yaşar Üniversitesi Etkinlik Yönetim Sistemi

Bu dosya Claude Code'un proje bağlamıdır. Her oturumda okunur; kısa ve güncel tutun.

## Proje

Kampüste yapılacak etkinliklerin talep → EBYS onayı → hizmet birimi hazırlığı → takvim sürecini yöneten web uygulaması.

- **Sunucu:** Node.js + Express (`sunucu/`); Vercel'de tek bir sunucusuz işlev (`api/index.js`), yerelde `npm run dev`
- **Veri tabanı:** PostgreSQL (canlıda Neon; yerelde ve testlerde PGlite = bellekte/diskte gerçek PostgreSQL)
- **Arayüz:** Tek sayfa, vanilla JS (`sunucu/arayuz/`)
- **Giriş:** E-posta + şifre; kullanıcıları ve şifreleri yönetici tanımlar (`npm run sifre`), 5 hatalı denemede 15 dk kilit; yerelde şifresiz geliştirme girişi
- **Zamanlanmış iş:** Vercel Cron → `/api/cron/gunluk` (her gece 02:00 İstanbul)
- **Dil:** Kod tanımlayıcıları, arayüz ve dokümanlar Türkçe (ASCII tanımlayıcı: `Etkinlik`, `onayBirimleri`)

İş kuralları için önce `docs/` klasörünü okuyun:

| Dosya | İçerik |
| --- | --- |
| `docs/gereksinimler.md` | Ön rezervasyon, EBYS, muafiyet, detay formu kuralları |
| `docs/is-akisi.md` | Durumlar, geçişler, gece görevi |
| `docs/veri-modeli.md` | Tablolar ve sütunlar |
| `docs/roller-yetkiler.md` | Roller ve işlem bazlı yetkiler |
| `docs/kurulum.md` | Yerel çalıştırma, Vercel/Neon kurulumu |

## Komutlar

```bash
npm test               # Node testleri: saf kurallar + bellekte PostgreSQL ile uçtan uca akış + HTTP katmanı
# gerçek PostgreSQL'e karşı: TEST_DATABASE_URL=postgres://... node --test --test-concurrency=1 "tests/**/*.test.js"
npm run kontrol        # sözdizimi, istemci→sunucu çağrı eşleşmesi, API izin listesi, vercel.json
npm run dogrula        # ikisi birden; her değişiklikten sonra çalıştırın
npm run dev            # http://localhost:3000 (yerel PostgreSQL, geliştirme girişi, örnek veri)
npm run onizleme       # onizleme/index.html: örnek veriyle arayüz (sunucu gerektirmez)
npm run kurulum        # tabloları/ayarları kurar (DATABASE_URL ile canlı veritabanında)
npm run aktar -- data  # CSV'leri veritabanına yükler
npm run gece-gorevi    # gece görevini elle çalıştırır
npm run kullanici-kontrol -- data/kullanicilar.csv
```

Proje komutları: `/kullanici-ekle`, `/yeni-alan`, `/yayinla`.

## Mimari

```
sunucu/
  logic.js        Saf iş kuralları + sabitler (DURUM, ROLLER, GECISLER). Veritabanı/ağ YOK; Node'da test edilir.
  config.js       Tablo adları, HEADERS (sütunlar), VARSAYILAN_AYARLAR, etkinlik türleri
  db.js           PostgreSQL: hepsi/bul/ekle/guncelle, kilitle() (işlem + kilit), ayar(), logYaz(), bugun()/simdi()
  auth.js         aktifKullanici(eposta), yetkiGerekli(), rol/birime göre e-posta listeleri
  oturum.js       İmzalı oturum çerezi, geliştirme girişi
  sifre.js        Şifre özetleme (scrypt), girişYap (kilitli), şifre belirleme
  hesap.js        api_sifreDegistir
  bildirim.js     E-posta (Resend; anahtar yoksa günlüğe yazar; BILDIRIM_AKTIF=HAYIR ise sessiz)
  rezervasyon.js  Ön rezervasyon, uzatma, iptal, yedek terfisi, gunlukSureKontrolu
  ebys.js         EBYS no + PDF (Dosyalar tablosu), onaycı kararı, muaf etkinliğe sonradan EBYS bağlama
  etkinlik.js     Detay formu → görevler, görev güncelleme, yönetici durum değişikliği
  api.js          api_baslangic (istemcinin tüm verisi)
  ortak.js        api() sarmalayıcı, istemciEtkinlik()
  uygulama.js     Express: rotalar ve API izin listesi (API)
  yerel.js, komut.js, kurulum.js   Yerel sunucu, komut satırı işleri, tablo kurulumu
  arayuz/         index.html, stil.html, uygulama.html
api/index.js      Vercel giriş noktası
vercel.json       Bölge (fra1), yönlendirme, cron
tests/            node:test; ortam.js bellekte PostgreSQL (PGlite) kurar
tools/            kontrol.js, onizleme.js, kullanici-kontrol.js
data/             *.ornek.csv (gerçek listeler .gitignore'da)
```

## Kurallar (bunlara uyun)

1. **İş kuralı logic.js'e.** Yeni bir kural, doğrulama veya yetki önce `logic.js`'e saf fonksiyon olarak yazılır ve `tests/logic.test.js`'te test edilir. Diğer dosyalar yalnızca veritabanı/ağla konuşur.
2. **Her yazma `db.kilitle()` içinde.** Tek veritabanı işlemi + genel kilit açar; eşzamanlı rezervasyonda çifte kayıt olmaz, hata olursa her şey geri alınır. Kilit içinde önce oku, kontrol et, sonra yaz. E-postalar işlem başarıyla bitince gider (`bildir` bunu kendisi ayarlar); kilit içinde başka ağ çağrısı yapmayın.
3. **Durum değişikliği `Logic.gecisKontrol(eski, yeni)` ile** ve her değişiklik `db.logYaz()` ile kayda geçer.
4. **İstemciden çağrılan fonksiyonlar `api_` ile başlar,** ilk parametresi oturumdaki kullanıcının e-postasıdır (sunucu çerezden koyar, istemci gönderemez), `api()` ile sarılır, `{ ok, mesaj, ... }` döner ve ilk iş `aktifKullanici(eposta)` + `yetkiGerekli()` çağırır. Yeni bir `api_` fonksiyonu `uygulama.js` > `API` izin listesine de eklenmelidir; listede olmayan hiçbir şey HTTP'den çağrılamaz. `npm run kontrol` eşleşmeyi denetler.
5. **Hücreler düz metin (TEXT).** Tarih `YYYY-AA-GG`, saat `SS:DD`, zaman `YYYY-AA-GGTSS:DD:SS` (Europe/Istanbul).
6. **Sütun eklerken** `HEADERS` listesinin sonuna ekleyin, sırayı bozmayın, `docs/veri-modeli.md`'yi güncelleyin; canlıda `npm run kurulum` çalıştırılmalı.
7. **Arayüz metinleri Türkçe**, kullanıcıya gösterilen her şey `esc()` ile kaçırılır.
8. **Kişisel veri (KVKK):** Gerçek kullanıcı listeleri, e-postalar, gizli anahtarlar (`DATABASE_URL`, `OTURUM_SIRRI`, `RESEND_API_KEY`, üretilen şifreler…) repoya girmez (`data/*.csv`, `.env*` yok sayılır). Test ve önizlemede yalnızca örnek veri.
9. **Vercel sınırları:** diske kalıcı yazılmaz (dosyalar veritabanına), istek gövdesi en fazla 4,5 MB (PDF 3 MB), işlev kısa ömürlüdür (bellekte durum tutulmaz).
10. Değişiklikten sonra `npm run dogrula`; arayüz değiştiyse `npm run onizleme` veya `npm run dev` ile bakın.

## Bilinen sınırlar

- Bu sürümde mekân/kullanıcı/ayar düzenleme ekranı yok; CSV (`npm run aktar`) veya Neon SQL editörü kullanılır. Yönetim ekranı yol haritasında.
- `api_baslangic` her çağrıda tüm tabloları okur; yılda birkaç bin etkinlik için yeterli, yavaşlarsa önce burada filtre/önbellek düşünün.
- EBYS ile doğrudan entegrasyon yok; kontrol PDF + onaycıyla yapılır.
- Vercel Hobby planı ticari olmayan kullanım içindir; Cron günde bir kez ve saat içinde herhangi bir dakikada çalışır.

## Açık sorular (kullanıcıdan bekleniyor)

- [ ] Etkinlik talebi açabilecek / onaylayabilecek **kullanıcı listesi** (gelince `/kullanici-ekle`)
- [ ] Şifremi unuttum akışı gerekir mi? (Şimdilik yönetici `npm run sifre` ile yeniden belirler)
- [ ] Gerçek **EBYS numarası biçimi** (`EBYS_NO_REGEX`)
- [ ] Gerçek **mekân listesi** ve kapasiteler; akademik/idari **birim kodları**
- [ ] Ön rezervasyon süresi (varsayılan 10 iş günü) EBYS onayının gerçek süresine uygun mu?
- [ ] Hangi birimler `EBYS_MUAF` yetkisi alacak?

## Yol haritası

1. Pilot: bir fakülte + hizmet birimleriyle 1–2 ay
2. Etkinlik sonrası değerlendirme formu (katılım sayısı, fotoğraflar, sorunlar)
3. Raporlama: birim/mekân/ay bazında etkinlik sayıları (ayrı bir rapor sayfası veya Looker Studio)
4. Yönetim ekranı (mekân, kullanıcı, ayar düzenleme)
5. Google Takvim'e kesinleşen etkinlikleri yazma (salon takvimleri)
6. Herkese açık kampüs etkinlik takvimi sayfası
