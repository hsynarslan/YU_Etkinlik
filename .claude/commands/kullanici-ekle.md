---
description: Üniversiteden gelen kullanıcı listesini Kullanicilar tablosu biçimine çevirir ve denetler
argument-hint: <liste dosyası veya yapıştırılan liste>
---

Üniversiteden gelen etkinlik talebi açabilecek / onaylayabilecek kullanıcı listesini sisteme hazırla.

Girdi: $ARGUMENTS

Adımlar:

1. Girdiyi oku (CSV, Excel veya düz metin olabilir). Excel ise önce CSV'ye çevir.
2. `docs/roller-yetkiler.md` ve `docs/veri-modeli.md` > Kullanicilar bölümüne göre şu sütunlara eşle:
   `Eposta,AdSoyad,Birim,Roller,OnayBirimleri,Aktif`
   - E-postaları küçük harfe çevir.
   - Birim adlarını büyük harf, Türkçe karaktersiz BirimID koduna çevir (ör. "Mühendislik Fakültesi" → `MUHENDISLIK`). Kullandığın kodları bir tabloyla kullanıcıya göster.
   - "Onaylayabilir" denilen kişilere `BIRIM_ONAYCI` ver ve hangi birimleri onayladığını `OnayBirimleri`'ne yaz. Belirsizse tahmin etme, kullanıcıya sor.
   - Hizmet birimi personelinin Birim'i şu kodlardan biri olmalı: `KURUMSAL_ILETISIM, BILGI_ISLEM, TEKNIK_ISLER, IDARI_ISLER, GUVENLIK, PROTOKOL`.
3. Sonucu `data/kullanicilar.csv` olarak yaz (bu dosya .gitignore'da; kişisel veri repoya girmez). Yeni akademik/idari birimler varsa `data/birimler.csv` dosyasını da hazırla.
4. `npm run kullanici-kontrol -- data/kullanicilar.csv --birimler data/birimler.csv` çalıştır. Hata kalmayana kadar düzelt; uyarıları kullanıcıya açıkla.
5. Kullanıcıya yükleme adımını söyle: `DATABASE_URL="<Neon bağlantı adresi>" npm run aktar -- data` (dosya adları `kullanicilar.csv`, `birimler.csv`; var olan e-postalar atlanır). Kurulumu yapan yönetici satırının listede kalması gerektiğini hatırlat. Bağlantı adresini asla repoya yazma.
