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
| `KURULUM_ANAHTARI` | Üçüncü bir rastgele dizi, en az 16 karakter (`/kurulum` sayfasını korur) |
| `RESEND_API_KEY`, `EPOSTA_GONDEREN` | b adımından (isteğe bağlı) |

Veritabanı adresi (`DATABASE_URL`) Neon'u projeye bağlayınca zaten eklenmiş olur.

### d) Tabloları kurma ve ilk yönetici (tarayıcıdan)

1. Projeyi yeniden dağıtın (**Deployments > … > Redeploy**) ki değişkenler devreye girsin.
2. Tarayıcıda `https://<proje-adresiniz>/kurulum` adresini açın.
3. **Kurulum anahtarı** kutusuna `KURULUM_ANAHTARI` değerini, **e-posta** kutusuna kendi e-postanızı yazın. Deneme için örnek mekân isterseniz kutuyu işaretleyin. **Kurulumu çalıştır** deyin.
4. Ekranda ilk yönetici şifresi **bir kez** görünür. Not alın, `/giris` sayfasından girin ve **Hesabım** sekmesinden değiştirin.

Kurulum tekrar çalıştırılabilir; var olan veriye dokunmaz. Yeni sürümde veritabanına sütun eklendiyse aynı sayfayı yeniden çalıştırmak yeter.

### e) Veriyi girme (Yönetim sekmesi)

Yönetici olarak girince **Yönetim** sekmesinde şu bölümler vardır:

- **Birimler:** fakülte, enstitü, idari birimler. (Hizmet birimleri hazır gelir.)
- **Mekânlar:** salonlar ve kapasiteleri.
- **Kullanıcılar:** e-posta, ad, birim, roller. Yeni kullanıcı eklenince rastgele şifresi ekranda bir kez gösterilir; kişiye ayrıca iletin. **Şifre belirle** düğmesiyle şifresi unutulanlara yenisi verilir (kilitli hesabın kilidi de açılır).
- **Ayarlar:** süreler, `EBYS_NO_REGEX`, `RESMI_TATILLER`, bildirimler.

Çok sayıda kullanıcıyı tek seferde yüklemek için komut satırı yolu da vardır (isteğe bağlı, aşağıda).

### Komut satırı (isteğe bağlı)

Node.js 22+ kurulu bir bilgisayarda, Neon'daki `DATABASE_URL` değeriyle:

```bash
DATABASE_URL="postgres://..." npm run kurulum                 # tabloları kurar (ILK_YONETICI_EPOSTA ile ilk yönetici)
DATABASE_URL="postgres://..." npm run aktar -- data           # CSV'lerden toplu yükleme (kullanicilar.csv, mekanlar.csv, birimler.csv)
DATABASE_URL="postgres://..." npm run sifre -- --hepsi        # şifresi olmayan herkese rastgele şifre üretir ve listeler
DATABASE_URL="postgres://..." npm run sifre -- ornek@yasar.edu.tr   # tek kullanıcıya rastgele şifre
```

`/kullanici-ekle` komutu üniversiteden gelen listeyi `data/kullanicilar.csv` biçimine çevirip denetler.

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
