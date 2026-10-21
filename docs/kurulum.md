# Kurulum ve yayınlama

## Önemli: hangi hesapla?

Web uygulaması **üniversitenin Google Workspace hesabıyla** (ör. `@yasar.edu.tr`) oluşturulup yayınlanmalıdır. `appsscript.json` içindeki `"access": "DOMAIN"` ayarı yalnızca Workspace hesaplarında çalışır ve kullanıcının e-postası ancak aynı alan adında okunabilir. Kişisel Gmail hesabıyla yayınlanırsa giriş yapan kişiyi tanıyamaz.

Tercihen kişiye bağlı olmayan bir **servis/birim hesabı** kullanın (ör. `etkinlik@yasar.edu.tr`). Veri tablosu ve EBYS PDF klasörü bu hesabın Drive'ında oluşur.

## Gerekenler

- Node.js 18+ ve npm
- Apps Script API açık olmalı: https://script.google.com/home/usersettings

## Adımlar

```bash
npm install
npx clasp login                      # üniversite hesabıyla
npx clasp create-script --type standalone --title "Etkinlik Yönetim Sistemi" --rootDir apps-script
npm test && npm run kontrol
npx clasp push
npx clasp open-script
```

`clasp create-script` proje kökünde `.clasp.json` oluşturur (örnek: `.clasp.json.example`). Bu dosya script kimliğini içerir; `.gitignore`'da değildir, ekip içinde paylaşılabilir.

`clasp create-script` yeni projenin varsayılan `appsscript.json` dosyasını indirip bizimkinin üzerine yazabilir. Push etmeden önce `git checkout apps-script/appsscript.json` ile geri alın (saat dilimi, web uygulaması erişimi ve izinler bu dosyadadır).

Apps Script editöründe:

1. `kurulum` fonksiyonunu seçip **Çalıştır**. İzinleri onaylayın. Günlükte veri tablosunun adresi yazar.
2. İsteğe bağlı: `ornekVerileriYukle` ile deneme mekânları ekleyin.
3. Veri tablosunda **Kullanicilar**, **Mekanlar** ve akademik **Birimler** sayfalarını doldurun.
4. **Ayarlar** sayfasında `EBYS_NO_REGEX` değerini gerçek EBYS numarası biçimine göre düzeltin; `RESMI_TATILLER`'i girin.

## Yayınlama

```bash
npx clasp create-deployment --description "v0.1.0"
```

veya editörde **Dağıt > Yeni dağıtım > Web uygulaması** (Yürütme: Ben, Erişim: Alan adınızdaki herkes). Çıkan adresi **Ayarlar > UYGULAMA_URL**'ye yazın; e-postalardaki bağlantı bunu kullanır.

Sonraki güncellemelerde aynı adresi korumak için:

```bash
npx clasp push
npx clasp list-deployments
npx clasp update-deployment <deploymentId> --description "v0.1.1"
```

## EBYS PDF'leri

PDF'ler kurulumun oluşturduğu "Etkinlik Yönetim Sistemi - EBYS Ekleri" klasörüne kaydedilir ve alan içinde bağlantıyla görüntülenebilir yapılır. Kurum politikası buna izin vermiyorsa klasörü onaycılarla elle paylaşın.

## Test ortamı

Canlıya almadan önce ayrı bir Apps Script projesi ve ayrı veri tablosuyla denemek için `Ayarlar > BILDIRIM_AKTIF = HAYIR` yapın; e-posta gitmez.
