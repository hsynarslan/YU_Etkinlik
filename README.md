# Yaşar Üniversitesi Etkinlik Yönetim Sistemi

Kampüs etkinliklerinin ön rezervasyon, EBYS onayı, hizmet birimi hazırlığı ve takvim sürecini yöneten web uygulaması. Google Apps Script ile çalışır, veriyi Google Drive'daki bir Google Sheets tablosunda tutar.

## Akış

1. **Ön rezervasyon:** Talep eden mekân ve tarihi seçer; mekân 10 iş günü geçici olarak tutulur. Mekân doluysa yedek sıraya girilebilir.
2. **EBYS:** EBYS onayı çıkınca numara ve onay yazısı (PDF) girilir; birim onaycısı kontrol edip onaylar veya iade eder.
3. **EBYS muafiyeti:** Yetkili birimler üst düzey etkinlikleri gerekçe yazarak EBYS'siz açabilir.
4. **Detaylı form:** Afiş, duyuru, teknik destek, kurulum, ikram, güvenlik, protokol. Cevaplara göre ilgili birimlere otomatik görev açılır.
5. **Kesinleşme:** Tüm birimler kabul edince etkinlik kesinleşir ve takvimde görünür.

Süresi dolan ön rezervasyonlar her gece otomatik düşer, sıradaki yedek terfi eder.

## Hızlı başlangıç

```bash
npm install
npm run dogrula      # testler + statik kontrol
npm run onizleme     # onizleme/index.html dosyasını tarayıcıda açın
```

Google'a kurulum ve yayınlama: [docs/kurulum.md](docs/kurulum.md)

## Claude Code ile çalışma

Klasörü Claude Code'da açın; `CLAUDE.md` proje bağlamını ve kuralları verir.

- `/kullanici-ekle <liste>` — üniversiteden gelen kullanıcı listesini hazırlar ve denetler
- `/yeni-alan <alan>` — forma alan ekler (kural, arayüz, test, doküman)
- `/yayinla <sürüm>` — test eder, push eder, dağıtımı günceller

`.mcp.json` içindeki `clasp` MCP sunucusu, Claude Code'un Apps Script projesiyle doğrudan çalışmasını sağlar (ilk açılışta onay ister).

## Klasörler

| Klasör | İçerik |
| --- | --- |
| `apps-script/` | Apps Script kaynak kodu (clasp `rootDir`) |
| `docs/` | Gereksinimler, iş akışı, veri modeli, roller, kurulum |
| `tests/` | Node testleri ve sahte Google servisleri |
| `tools/` | Statik kontrol, önizleme, kullanıcı listesi denetimi |
| `data/` | Örnek CSV'ler (gerçek listeler repoya girmez) |

## Lisans

MIT. Ayrıntılar için [LICENSE](LICENSE).
