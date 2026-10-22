# Kurulum ve yayınlama (Vercel)

Uygulama Vercel'de çalışır; veriler Neon'daki bir PostgreSQL veritabanında tutulur. Önce kendi bilgisayarınızda deneyebilirsiniz, hesap gerekmez.

## 1. Kendi bilgisayarınızda deneme

```bash
npm install
npm run dev          # http://localhost:3000
```

Veritabanı otomatik olarak `data/yerel-veritabani` klasöründe oluşur, örnek mekânlar yüklenir ve giriş sayfasındaki "Geliştirme girişi" bağlantısıyla şifresiz, listeden kullanıcı seçersiniz. Bu giriş yalnızca yerelde açıktır; Vercel'de çalışmaz. E-postalar gönderilmez, terminale yazılır. Sıfırlamak için `data/yerel-veritabani` klasörünü silin.

Gerekenler: Node.js 22+ ve npm.

## 2. Canlıya alma (Vercel)

Toplam yaklaşık 30 dakika. Tek seferlik.

### a) Vercel ve veritabanı

1. https://vercel.com adresinde hesap açın, **Add New > Project** ile bu GitHub deposunu bağlayın. Framework: *Other*; başka ayar gerekmez (`vercel.json` hazır).
2. Projede **Storage > Create Database > Neon (Postgres)** ekleyin. Bölge: **Frankfurt (eu-central-1)**. Bu, `DATABASE_URL` değişkenini otomatik tanımlar.

### b) E-posta (isteğe bağlı, sonradan da yapılabilir)

https://resend.com hesabı açıp bir **API key** alın. `@yasar.edu.tr` adresinden göndermek için üniversite BT'nin alan adına Resend'in verdiği DNS kayıtlarını eklemesi gerekir; o zamana kadar Resend'in deneme gönderen adresi kullanılır. API anahtarı girilmezse e-posta gitmez, yalnızca Vercel günlüğüne yazılır.

### c) Ortam değişkenleri

Vercel > Settings > Environment Variables bölümüne ([.env.example](../.env.example) dosyasındaki açıklamalarla):

| Değişken | Değer |
| --- | --- |
| `OTURUM_SIRRI` | `openssl rand -hex 32` çıktısı |
| `CRON_SECRET` | `openssl rand -hex 32` çıktısı (gece görevini korur) |
| `UYGULAMA_URL` | Canlı adres, ör. `https://etkinlik-yasar.vercel.app` |
| `RESEND_API_KEY`, `EPOSTA_GONDEREN` | b adımından (isteğe bağlı) |

Değişkenleri ekledikten sonra projeyi yeniden dağıtın (**Deployments > Redeploy**).

### d) Tabloları kurma ve ilk yönetici

Vercel > Storage > Neon > **.env.local** sekmesinden `DATABASE_URL` değerini kopyalayıp kendi bilgisayarınızda:

```bash
DATABASE_URL="postgres://..." ILK_YONETICI_EPOSTA="siz@yasar.edu.tr" npm run kurulum
```

Bu komut tabloları, varsayılan ayarları, hizmet birimlerini ve ilk yöneticiyi oluşturur ve **ilk yöneticinin rastgele şifresini bir kez ekrana yazar** (not alın; girişte Hesabım sekmesinden değiştirin). Tekrar çalıştırmak güvenlidir.

### e) Veriyi girme

- **Kullanıcılar:** `/kullanici-ekle` komutuyla `data/kullanicilar.csv` hazırlanır, sonra `DATABASE_URL="..." npm run aktar -- data`. (Dosya adları tablo adıdır: `kullanicilar.csv`, `mekanlar.csv`, `birimler.csv`; var olan kayıtlar atlanır.)
- **Şifreler:** `DATABASE_URL="..." npm run sifre -- --hepsi` şifresi olmayan her kullanıcıya rastgele şifre üretir ve listeler (bir kez gösterilir; her kişiye kendi şifresini ayrıca iletin). Tek kişi için: `npm run sifre -- ornek@yasar.edu.tr` (rastgele şifre yazar) veya `npm run sifre -- ornek@yasar.edu.tr YeniSifre123`. Unutulan şifre de aynı komutla yeniden belirlenir; kilitli hesabın kilidi de açılır.
- **Mekânlar ve birimler:** aynı şekilde `mekanlar.csv`, `birimler.csv`.
- **Ayarlar** (ör. `EBYS_NO_REGEX`, `RESMI_TATILLER`): Neon panelindeki **SQL Editor**'de, ör. `UPDATE "Ayarlar" SET "Deger" = '...' WHERE "Anahtar" = 'RESMI_TATILLER';`
- Tek kayıt düzeltmeleri de aynı SQL editöründen yapılır. (İleride yönetim ekranı eklenebilir.)

## Gece görevi

`vercel.json` içindeki Cron her gece 23:00 UTC'de (İstanbul 02:00) `/api/cron/gunluk` adresini çağırır: süresi dolan ön rezervasyonları düşürür, yedeği terfi ettirir, hatırlatma ve tamamlandı işlemlerini yapar. Hobby planda Cron günde bir kez ve saat içinde herhangi bir dakikada çalışabilir. Elle çalıştırmak için: `DATABASE_URL="..." npm run gece-gorevi`.

## EBYS PDF'leri

PDF'ler veritabanındaki `Dosyalar` tablosunda saklanır ve yalnızca etkinlik sahibi, ilgili birim onaycısı ve yöneticiler açabilir. Vercel istek sınırı nedeniyle PDF en fazla **3 MB** olabilir (`EBYS_PDF_MAX_MB` ayarı bunu aşamaz).

## Güncelleme

Ana dala birleşen her değişiklik Vercel tarafından otomatik yayınlanır; her pull request için ayrı bir deneme adresi çıkar. Veritabanı sütunu eklendiyse yayından sonra `npm run kurulum` yeniden çalıştırılır.

## Eski sistemden (Google Sheets) veri taşıma

Her sayfayı CSV olarak indirin (`Etkinlikler.csv`, `Mekanlar.csv`, `Birimler.csv`, `Kullanicilar.csv`, `Gorevler.csv`, `Log.csv`, `Ayarlar.csv`), bir klasöre koyun ve `DATABASE_URL="..." npm run aktar -- <klasör>` çalıştırın. Eski EBYS PDF bağlantıları (Drive) çalışmaya devam eder ama dosyalar yeni sisteme taşınmaz.

## Lisans ve plan notu

Vercel'in ücretsiz Hobby planı kişisel ve ticari olmayan kullanım içindir; üniversite resmi olarak kullanacaksa Pro plan veya kurumsal hesap gerekebilir. Veriler AB'de (Frankfurt) tutulur; KVKK açısından üniversitenin veri sorumlusuna danışın.
