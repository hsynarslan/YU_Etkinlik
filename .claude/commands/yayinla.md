---
description: Testleri çalıştırır, sürümü günceller ve değişikliği Vercel'e yayınlamak için hazırlar
argument-hint: <sürüm açıklaması, ör. v0.2.0 - takvim filtresi>
---

Değişiklikleri canlıya al. Açıklama: $ARGUMENTS

1. `npm run dogrula` çalıştır. Herhangi bir test veya kontrol başarısızsa DUR ve sorunu düzelt; yayınlama.
2. `git status` ile commit edilmemiş değişiklik varsa kullanıcıya söyle ve önce commit etmeyi öner.
3. `package.json` ve `sunucu/config.js` > `APP.SURUM` değerini açıklamadaki sürümle eşitle (sürüm verilmediyse sor).
4. Değişikliği ana dala birleştirmek için pull request öner; Vercel ana daldaki her birleşmeyi otomatik yayınlar, her pull request için de deneme adresi üretir.
5. Yeni sütun eklendiyse kullanıcıya yayından sonra `DATABASE_URL="..." npm run kurulum` çalıştırmasını hatırlat.
