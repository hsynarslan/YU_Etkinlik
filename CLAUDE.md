# CLAUDE.md — Yaşar Üniversitesi Etkinlik Yönetim Sistemi

Bu dosya Claude Code'un proje bağlamıdır. Her oturumda okunur; kısa ve güncel tutun.

## Proje

Kampüste yapılacak etkinliklerin talep → EBYS onayı → hizmet birimi hazırlığı → takvim sürecini yöneten web uygulaması.

- **Arayüz ve sunucu:** Google Apps Script web uygulaması (`apps-script/`)
- **Veri tabanı:** Google Drive'da bir Google Sheets dosyası (7 sayfa)
- **Dağıtım:** `clasp` ile push; web uygulaması üniversite Workspace hesabıyla, alan içine yayınlanır
- **Dil:** Kod tanımlayıcıları, arayüz ve dokümanlar Türkçe (ASCII tanımlayıcı: `Etkinlik`, `onayBirimleri`)

İş kuralları için önce `docs/` klasörünü okuyun:

| Dosya | İçerik |
| --- | --- |
| `docs/gereksinimler.md` | Ön rezervasyon, EBYS, muafiyet, detay formu kuralları |
| `docs/is-akisi.md` | Durumlar, geçişler, gece görevi |
| `docs/veri-modeli.md` | Sheets sayfaları ve sütunlar |
| `docs/roller-yetkiler.md` | Roller ve işlem bazlı yetkiler |
| `docs/kurulum.md` | clasp, kurulum(), yayınlama |

## Komutlar

```bash
npm test               # Node testleri: saf kurallar + sahte Google servisleriyle uçtan uca akış
npm run kontrol        # Apps Script sözdizimi, dosya yükleme sırası, istemci→sunucu çağrı eşleşmesi
npm run dogrula        # ikisi birden; her değişiklikten sonra çalıştırın
npm run onizleme       # onizleme/index.html: örnek veriyle arayüz (deploy gerektirmez)
npm run kullanici-kontrol -- data/kullanicilar.csv
npx clasp push         # Apps Script'e gönderir (kullanıcı onayıyla)
```

Proje komutları: `/kullanici-ekle`, `/yeni-alan`, `/yayinla`.

## Mimari

```
apps-script/
  Logic.js       Saf iş kuralları + sabitler (DURUM, ROLLER, GECISLER). Google API'si YOK; Node'da test edilir.
  Config.js      Sayfa adları, HEADERS (sütunlar), VARSAYILAN_AYARLAR, etkinlik türleri
  Db.js          Sheets okuma/yazma, kilitle(), ayar(), logYaz(), bugun()/simdi()
  Auth.js        aktifKullanici(), yetkiGerekli(), rol/birime göre e-posta listeleri
  Bildirim.js    E-posta (BILDIRIM_AKTIF=HAYIR ise sessiz)
  Rezervasyon.js Ön rezervasyon, uzatma, iptal, yedek terfisi, gunlukSureKontrolu (gece 02:00)
  Ebys.js        EBYS no + PDF, onaycı kararı, muaf etkinliğe sonradan EBYS bağlama
  Etkinlik.js    Detay formu → görevler, görev güncelleme, yönetici durum değişikliği
  Main.js        doGet, api_ sarmalayıcı, api_baslangic (istemcinin tüm verisi)
  Setup.js       kurulum(), ornekVerileriYukle() — editörden elle çalıştırılır
  Index.html / Styles.html / App.html   Tek sayfa arayüz (vanilla JS)
tests/           node:test; gas-mock.js Google servislerini bellekte taklit eder
tools/           kontrol.js, onizleme.js, kullanici-kontrol.js
data/            *.ornek.csv (gerçek listeler .gitignore'da)
```

## Kurallar (bunlara uyun)

1. **İş kuralı Logic.js'e.** Yeni bir kural, doğrulama veya yetki önce `Logic.js`'e saf fonksiyon olarak yazılır ve `tests/logic.test.js`'te test edilir. Diğer dosyalar yalnızca Google servisleriyle konuşur.
2. **Üst düzeyde dosyalar arası bağımlılık yok.** Apps Script dosya yükleme sırasını garanti etmez. Başka dosyadaki bir şeye (`Logic.DURUM`, `SAYFA`) yalnızca fonksiyon içinden erişin. `npm run kontrol` bunu iki sırada yükleyerek denetler.
3. **Her yazma `kilitle()` içinde.** Eşzamanlı rezervasyonda çifte kayıt olmasın diye. Kilit içinde önce oku, kontrol et, sonra yaz.
4. **Durum değişikliği `Logic.gecisKontrol(eski, yeni)` ile** ve her değişiklik `logYaz()` ile kayda geçer.
5. **İstemciden çağrılan fonksiyonlar `api_` ile başlar,** `api_(fn)` ile sarılır, `{ ok, mesaj, ... }` döner ve ilk iş `aktifKullanici()` + `yetkiGerekli()` çağırır. Sonu `_` ile biten fonksiyonlar istemciye kapalıdır.
6. **Hücreler düz metin.** Tarih `YYYY-AA-GG`, saat `SS:DD`, zaman `YYYY-AA-GGTSS:DD:SS` (Europe/Istanbul). Sheets'in otomatik tarihe çevirmesine güvenmeyin.
7. **Sütun eklerken** `HEADERS` listesinin sonuna ekleyin, sırayı bozmayın, `docs/veri-modeli.md`'yi güncelleyin; canlıda `kurulum()` çalıştırılmalı.
8. **Arayüz metinleri Türkçe**, kullanıcıya gösterilen her şey `esc()` ile kaçırılır.
9. **Kişisel veri (KVKK):** Gerçek kullanıcı listeleri ve e-postalar repoya girmez (`data/*.csv` yok sayılır). Test ve önizlemede yalnızca örnek veri.
10. Değişiklikten sonra `npm run dogrula`; arayüz değiştiyse `npm run onizleme` ile bakın.

## Bilinen sınırlar

- Sheets yılda birkaç bin etkinlik için yeterli. `api_baslangic` her çağrıda tüm sayfaları okur; yavaşlarsa önce burada önbellek/filtre düşünün.
- EBYS ile doğrudan entegrasyon yok; kontrol PDF + onaycıyla yapılır.
- Apps Script web uygulaması iframe içinde çalışır; `localStorage` güvenilir değildir.
- Gece görevi `kurulum()` ile kurulur; script sahibinin hesabıyla çalışır.

## Açık sorular (kullanıcıdan bekleniyor)

- [ ] Etkinlik talebi açabilecek / onaylayabilecek **kullanıcı listesi** (gelince `/kullanici-ekle`)
- [ ] Personelin tamamı `@yasar.edu.tr` Google Workspace hesabıyla mı giriş yapıyor? (Değilse `IZINLI_ALAN_ADI` ve yayın ayarı değişir)
- [ ] Gerçek **EBYS numarası biçimi** (`EBYS_NO_REGEX`)
- [ ] Gerçek **mekân listesi** ve kapasiteler; akademik/idari **birim kodları**
- [ ] Ön rezervasyon süresi (varsayılan 10 iş günü) EBYS onayının gerçek süresine uygun mu?
- [ ] Hangi birimler `EBYS_MUAF` yetkisi alacak?

## Yol haritası

1. Pilot: bir fakülte + hizmet birimleriyle 1–2 ay
2. Etkinlik sonrası değerlendirme formu (katılım sayısı, fotoğraflar, sorunlar)
3. Raporlama: birim/mekân/ay bazında etkinlik sayıları (Sheets üzerinde ayrı sayfa veya Looker Studio)
4. Google Takvim'e kesinleşen etkinlikleri yazma (salon takvimleri)
5. Herkese açık kampüs etkinlik takvimi sayfası
