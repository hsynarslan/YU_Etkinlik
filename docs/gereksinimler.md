# Gereksinimler

Yaşar Üniversitesi kampüsünde yapılan etkinliklerin talep, onay ve hazırlık sürecini tek yerden yöneten web uygulaması.

## Temel ilkeler

- Etkinlik yapmak için fakülte ve birimler önceden **EBYS'den onay** alır. Sistem bu onayı yok saymaz, ona bağlanır.
- EBYS onayı beklenirken mekânın başkasına verilmemesi için önce **ön rezervasyon** açılır.
- EBYS onayı çıkınca **EBYS numarası ve onay yazısı (PDF)** girilerek süreç devam eder.
- Üst düzey etkinlikler bazen EBYS onayı olmadan yapılır. Bu adımı yalnızca **yetkilendirilmiş birimler** kullanabilir; gerekçe zorunludur ve kayıt altına alınır.
- Veri bir **PostgreSQL** veritabanında tutulur (Neon, Vercel üzerinden); tablolar CSV olarak dışa aktarılabilir.

## Ön rezervasyon

| Kural | Varsayılan | Ayar anahtarı |
| --- | --- | --- |
| Geçerlilik süresi | 10 iş günü | `ON_REZ_SURE_GUN` |
| Uzatma | 1 kez, 5 iş günü, gerekçeli | `MAX_UZATMA`, `UZATMA_GUN` |
| Hatırlatma | Bitişten 2 iş günü önce e-posta | `HATIRLATMA_GUN` |
| Süre dolunca | Otomatik düşer, mekân serbest kalır | gece görevi |
| Çakışma | Reddedilmez; kullanıcı onaylarsa **yedek sıraya** alınır | — |
| Yedek terfisi | Mekân boşalınca en eski uygun yedek otomatik ön rezervasyona geçer | — |
| Asgari başvuru | Standart 10 gün, üst düzey protokol 20 gün önceden | `ASGARI_BASVURU_GUN`, `ASGARI_BASVURU_UST_DUZEY_GUN` |

Ön rezervasyon bitişi hiçbir zaman etkinlik tarihini geçmez. Resmî tatiller `RESMI_TATILLER` ayarına girilirse iş günü hesabında atlanır.

## EBYS numarası

Sistem EBYS'ye doğrudan bağlanmaz. Üçlü kontrol yapılır:

1. Numara biçimi (`EBYS_NO_REGEX`, gerçek biçime göre güncellenmeli)
2. Aynı numaranın başka aktif etkinlikte kullanılmamış olması
3. EBYS onay yazısının PDF olarak eklenmesi ve **birim onaycısının** kontrolü (onay veya gerekçeli iade)

## EBYS muafiyeti (üst düzey etkinlikler)

- Yetki kişiye değil role verilir (`EBYS_MUAF`), ör. Rektörlük, Genel Sekreterlik, Protokol.
- Gerekçe zorunludur; asgari başvuru süresi aranmaz; yöneticilere e-posta gider.
- EBYS numarası sonradan bağlanabilir.
- Mekân doluysa sistem mevcut kaydı ezmez: muaf talep yedeğe alınır, yöneticiye bildirim gider, karar insandadır.

## Detaylı etkinlik formu

EBYS onaylandıktan (veya muaf etkinlik açıldıktan) sonra doldurulur. Cevaplara göre hizmet birimlerine otomatik görev açılır:

| Bölüm | Alanlar | Görev açılan birim |
| --- | --- | --- |
| Tanıtım | Afiş (yok/dijital/basılı), tasarımı kim yapacak, duyuru kanalları, basın daveti, fotoğraf/video | Kurumsal İletişim |
| Teknik destek | Ses, mikrofon sayısı, projeksiyon, ışık, canlı yayın, kayıt, hibrit, simultane çeviri, misafir Wi-Fi | Bilgi İşlem |
| Mekân | Oturma düzeni, kurulum ihtiyacı | Yapı ve Teknik İşler |
| Lojistik | İkram türü ve kişi sayısı, ulaşım/konaklama | İdari İşler |
| Güvenlik | Güvenlik görevlisi, VIP otopark | Güvenlik |
| Protokol | Protokol listesi (üst düzeyde zorunlu görev) | Rektörlük Protokol + Güvenlik |
| Bütçe ve program | Tahmini bütçe, kaynak, program akışı, açıklama | (kayıt için) |

Hiç hizmet talebi yoksa etkinlik doğrudan kesinleşir. Tüm görevler kabul edilince etkinlik **kesinleşir** ve takvimde görünür.

## Katılımcıların önem düzeyi

| Düzey | Etkisi |
| --- | --- |
| Standart | İç katılımcılar |
| Dış konuk | Dış konuşmacı/konuk var |
| Üst düzey protokol | Asgari başvuru 20 gün; Güvenlik ve Protokol görevleri otomatik |

## Kapsam dışı (ilk sürüm)

- EBYS ile doğrudan entegrasyon
- Etkinlik sonrası değerlendirme formu ve raporlama ekranı
- Katılımcı kaydı ve katılım belgesi
- Bütçe/satın alma iş akışı

Bunlar için bkz. `CLAUDE.md` > Yol haritası.
