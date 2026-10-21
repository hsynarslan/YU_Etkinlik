---
description: Testleri çalıştırır, kodu Apps Script'e gönderir ve mevcut web uygulaması dağıtımını günceller
argument-hint: <sürüm açıklaması, ör. v0.2.0 - takvim filtresi>
---

Değişiklikleri canlı web uygulamasına al. Açıklama: $ARGUMENTS

1. `npm run dogrula` çalıştır. Herhangi bir test veya kontrol başarısızsa DUR ve sorunu düzelt; yayınlama.
2. `git status` ile commit edilmemiş değişiklik varsa kullanıcıya söyle ve önce commit etmeyi öner.
3. `package.json` ve `apps-script/Config.js` > `APP.SURUM` değerini açıklamadaki sürümle eşitle (sürüm verilmediyse sor).
4. `npx clasp push` (kullanıcı onayı gerekir).
5. `npx clasp list-deployments` ile web uygulaması dağıtımının kimliğini bul (`@HEAD` olmayan). Yoksa `npx clasp create-deployment --description "<açıklama>"` ile oluştur ve çıkan adresi Ayarlar > UYGULAMA_URL'ye yazmasını kullanıcıya hatırlat.
6. Varsa `npx clasp update-deployment <id> --description "<açıklama>"` ile aynı adresi güncelle.
7. Yeni sütun eklendiyse kullanıcıya Apps Script editöründen `kurulum()` çalıştırmasını hatırlat.
