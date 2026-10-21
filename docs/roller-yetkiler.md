# Roller ve yetkiler

Yetkiler kişiye değil **role** bağlıdır. Bir kişinin birden fazla rolü olabilir (Kullanicilar > Roller sütununda virgülle). Yetki kuralları `apps-script/Logic.js` > `yetkiVarMi` içindedir ve testlerle güvence altındadır.

| Rol | Ne yapabilir |
| --- | --- |
| `TALEP_EDEN` | Ön rezervasyon açar; kendi talebine EBYS girer, uzatır, iptal eder, detay formunu doldurur |
| `BIRIM_ONAYCI` | **OnayBirimleri** sütunundaki birimlerin EBYS kayıtlarını onaylar veya gerekçeyle iade eder |
| `HIZMET_BIRIMI` | Yalnızca **kendi biriminin** görevlerini görür ve günceller |
| `EBYS_MUAF` | EBYS onayı olmadan etkinlik açar (gerekçe zorunlu), başka birim adına açabilir, sonradan EBYS bağlar |
| `YONETICI` | Her şeyi görür ve yapar; elle durum değiştirir; veri tablosuna erişir |

## İşlem bazlı tablo

| İşlem | TALEP_EDEN | BIRIM_ONAYCI | HIZMET_BIRIMI | EBYS_MUAF | YONETICI |
| --- | --- | --- | --- | --- | --- |
| Ön rezervasyon açma | Evet | — | — | Evet | Evet |
| EBYS'siz etkinlik açma | — | — | — | Evet | Evet |
| Kendi talebini yönetme | Evet | — | — | Evet | Evet (tümü) |
| EBYS onaylama / iade | — | Kendi onay birimleri | — | — | Tümü |
| Görev güncelleme | — | — | Kendi birimi | — | Tümü |
| Elle durum değiştirme | — | — | — | — | Evet |

## Giriş

- Yalnızca `IZINLI_ALAN_ADI` (varsayılan `yasar.edu.tr`) hesapları girebilir.
- Kullanicilar sayfasında olmayan veya `Aktif = HAYIR` olan kişi giremez.
- `kurulum()` çalıştıran kişi, liste boşsa otomatik `YONETICI` olarak eklenir.

## Kullanıcı listesi

Etkinlik talebi açabilecek ve onaylayabilecek kullanıcı listesi üniversiteden gelecek. Gelince:

1. `data/kullanicilar.ornek.csv` biçiminde hazırlayın.
2. `npm run kullanici-kontrol -- data/kullanicilar.csv` ile denetleyin.
3. Google Sheets'te Kullanicilar sayfasına **Dosya > İçe aktar > Geçerli sayfayı değiştir** ile yükleyin (başlık satırı aynı kalmalı).

Claude Code'da `/kullanici-ekle` komutu bu adımları sizin için yürütür.
