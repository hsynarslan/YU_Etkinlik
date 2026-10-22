# Veri modeli (PostgreSQL)

Yedi tablo ve bir dosya tablosu. Sütun adları `sunucu/config.js` > `HEADERS` ile birebir aynıdır. Tüm sütunlar **metin** (`TEXT`) tipindedir (tarih `YYYY-AA-GG`, saat `SS:DD`, zaman `YYYY-AA-GGTSS:DD:SS`, İstanbul saati). Her tabloda ayrıca eklenme sırasını tutan `_sira` sütunu vardır.

Kullanıcılar veritabanına doğrudan erişmez; yalnızca sunucu bağlanır ve her işlemde oturumdaki kullanıcının yetkisini denetler.

`Dosyalar` tablosu EBYS onay yazılarını (PDF) tutar: `DosyaID, EtkinlikID, Ad, Icerik (BYTEA), Boyut, YukleyenEposta, Zaman`.

## Etkinlikler

| Sütun | Açıklama |
| --- | --- |
| EtkinlikID | `ETK-YYYYAAGG-XXXXXX` |
| Durum | `Logic.DURUM` kodlarından biri (bkz. is-akisi.md) |
| Ad, Tur | Etkinlik adı ve türü (`ETKINLIK_TURLERI`) |
| DuzenleyenBirim | BirimID |
| SorumluEposta | Talebi açan kişi |
| MekanID | Mekanlar.MekanID |
| Tarih, BaslangicSaati, BitisSaati | `2026-11-10`, `10:00`, `12:00` |
| KatilimciSayisi | Tahmini sayı |
| ProtokolDuzeyi | `STANDART`, `DIS_KONUK`, `UST_DUZEY` |
| OnRezBitis | Ön rezervasyonun son günü |
| UzatmaSayisi | Kaç kez uzatıldı |
| EbysNo, EbysTarih, EbysEkUrl | EBYS numarası, onay tarihi, PDF adresi (`/api/dosya/<DosyaID>`) |
| EbysMuaf, MuafGerekce | `EVET`/`HAYIR` ve gerekçe |
| KontrolNotu | Onaycının onay/iade notu |
| Detay | Detaylı formun JSON hâli |
| OlusturanEposta, OlusturmaZamani, GuncellemeZamani | İz bilgileri |

## Mekanlar

| Sütun | Açıklama |
| --- | --- |
| MekanID | Kısa kod, ör. `MUH-KS` |
| Ad, Bina | Görünen ad ve bina |
| Kapasite | Kişi sayısı; katılımcı sayısı bunu aşamaz |
| SorumluBirim | BirimID |
| Aktif | `EVET` / `HAYIR` |

## Birimler

| Sütun | Açıklama |
| --- | --- |
| BirimID | Büyük harf kod. Hizmet birimleri sabit: `KURUMSAL_ILETISIM`, `BILGI_ISLEM`, `TEKNIK_ISLER`, `IDARI_ISLER`, `GUVENLIK`, `PROTOKOL` |
| Ad | Görünen ad |
| Tur | `AKADEMIK`, `IDARI`, `HIZMET` |
| Eposta | Birimin ortak adresi (isteğe bağlı) |

## Kullanicilar

| Sütun | Açıklama |
| --- | --- |
| Eposta | Google (üniversite) hesabıyla birebir aynı, küçük harf |
| AdSoyad | |
| Birim | BirimID |
| Roller | Virgülle: `TALEP_EDEN, BIRIM_ONAYCI, HIZMET_BIRIMI, EBYS_MUAF, YONETICI` |
| OnayBirimleri | Onaycının EBYS kontrolünü yaptığı BirimID'ler, virgülle |
| Aktif | `EVET` / `HAYIR` |

Rollerin anlamı için bkz. roller-yetkiler.md. Liste `data/kullanicilar.ornek.csv` biçiminde hazırlanıp `npm run kullanici-kontrol -- dosya.csv` ile denetlenebilir.

## Gorevler

| Sütun | Açıklama |
| --- | --- |
| GorevID | `GRV-…` |
| EtkinlikID | |
| Birim | Hizmet birimi BirimID |
| Tur | `AFIS`, `DUYURU`, `BASIN_FOTO`, `TEKNIK`, `MEKAN_KURULUM`, `IKRAM`, `ULASIM_KONAKLAMA`, `GUVENLIK`, `PROTOKOL` |
| Aciklama | Formdan üretilen özet |
| Durum | `BEKLIYOR`, `KABUL`, `BILGI_ISTENDI`, `RED`, `TAMAMLANDI` |
| Not, GuncelleyenEposta, GuncellemeZamani | |

## Log

Her durum değişikliği ve önemli işlem: `Zaman`, `Eposta` (`sistem` = gece görevi), `EtkinlikID`, `Islem`, `Detay`.

## Ayarlar

`Anahtar`, `Deger`, `Aciklama`. Varsayılanlar `config.js` > `VARSAYILAN_AYARLAR`; `npm run kurulum` eksik anahtarları ekler, var olanlara dokunmaz.

## Sütun eklemek

1. `sunucu/config.js` > `HEADERS` listesinin **sonuna** ekleyin (sırayı değiştirmeyin).
2. Bu dosyayı güncelleyin.
3. Canlıda `npm run kurulum` çalıştırın; eksik sütun `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` ile eklenir, veriye dokunulmaz.
