# Roller ve yetkiler

Yetkiler kişiye değil **role** bağlıdır. Bir kişinin birden fazla rolü olabilir (Kullanicilar > Roller sütununda virgülle). Yetki kuralları `sunucu/logic.js` > `yetkiVarMi` içindedir ve testlerle güvence altındadır.

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

- Giriş e-posta + şifreyle yapılır. Kullanıcıları ve şifrelerini yönetici tanımlar; kendi kendine kayıt yoktur.
- Kullanicilar tablosunda olmayan, şifresi belirlenmemiş veya `Aktif = HAYIR` olan kişi giremez.
- 5 hatalı denemeden sonra hesap 15 dakika kilitlenir.
- Şifreler tuzlanıp özetlenerek saklanır (düz şifre tutulmaz). Yönetici şifreyi `npm run sifre` ile belirler; kullanıcı Hesabım sekmesinden değiştirebilir.
- `npm run kurulum`, liste boşsa `ILK_YONETICI_EPOSTA` adresini `YONETICI` olarak ekler ve rastgele şifresini bir kez yazar.

## Kullanıcı listesi

Etkinlik talebi açabilecek ve onaylayabilecek kullanıcı listesi üniversiteden gelecek. Gelince:

1. `data/kullanicilar.ornek.csv` biçiminde hazırlayın.
2. `npm run kullanici-kontrol -- data/kullanicilar.csv` ile denetleyin.
3. `data/kullanicilar.csv` olarak kaydedip `npm run aktar -- data` ile veritabanına yükleyin (`DATABASE_URL` tanımlı olmalı; var olan e-postalar atlanır), ardından `npm run sifre -- --hepsi` ile şifresi olmayan herkese rastgele şifre üretip listeyi her kullanıcıya ayrı ayrı iletin. Tek kullanıcı eklemek/değiştirmek için Neon panelindeki SQL editörünü kullanabilirsiniz.

Claude Code'da `/kullanici-ekle` komutu bu adımları sizin için yürütür.
