---
description: Etkinlik formuna yeni bir alan ekler (veri modeli, iş kuralı, arayüz, doküman ve testlerle birlikte)
argument-hint: <alan adı ve amacı, ör. "simultane çeviri dili - hangi diller">
---

Yeni alan: $ARGUMENTS

Önce alanın nereye ait olduğuna karar ver ve kullanıcıya bir cümleyle söyle:

- **Ön rezervasyon alanı** (mekân/tarih kararını etkiliyorsa): `sunucu/config.js` > `HEADERS.Etkinlikler` sonuna sütun ekle, `Logic.onRezervasyonDogrula`'yı ve `sunucu/rezervasyon.js` > `api_onRezervasyonOlustur` içindeki kayıt nesnesini güncelle, `sunucu/arayuz/uygulama.html` > `yeniTalep()` formuna ekle.
- **Detay formu alanı** (çoğu durum): sütun ekleme; değer `Detay` JSON'unda saklanır. `sunucu/arayuz/uygulama.html` > `detayFormu()`'na ekle. Bir hizmet birimine görev doğuracaksa `Logic.gorevleriOlustur`'u güncelle.

Her durumda:

1. `tests/logic.test.js`'e kuralın testini ekle; gerekirse `tests/akis.test.js`'i güncelle.
2. `docs/gereksinimler.md` ve (sütun eklendiyse) `docs/veri-modeli.md`'yi güncelle.
3. `npm run dogrula` ve `npm run onizleme` çalıştır; önizlemeyi kontrol et.
4. Sütun eklendiyse canlıda `npm run kurulum` çalıştırılması gerektiğini not et.
