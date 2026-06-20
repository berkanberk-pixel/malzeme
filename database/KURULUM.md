# Database2.accdb - Stok Takip Sistemi Kurulum Kılavuzu

Bu kılavuz, mevcut referans veritabanınıza stok hareketi, harcama ve nakil takibi eklemeniz için adım adım talimatlar içerir.

## Ön Koşullar

- Microsoft Access 2016 veya üzeri
- `Database2.accdb` dosyasının yedeği alınmış olmalı

## Kurulum Sırası

### Adım 1: Yedek Alın

```
Database2.accdb → Database2_YEDEK.accdb olarak kopyalayın
```

### Adım 2: Yeni Tabloları Oluşturun

1. Access'te `Database2.accdb` dosyasını açın
2. **Oluştur** → **Sorgu Tasarımı** → **SQL Görünümü**'ne geçin
3. `database/01_tablolar.sql` dosyasındaki her `CREATE TABLE` bloğunu **tek tek** yapıştırıp çalıştırın
4. `INSERT INTO TB_Hareket_Tipi` satırlarını da tek tek çalıştırın

Oluşacak tablolar:
- `TB_Stok_Hareket` — Ana hareket defteri
- `TB_Proje_Depo` — Proje-depo eşlemesi
- `TB_Hareket_Tipi` — Hareket tipi referansı

### Adım 3: Mevcut Tabloları Güncelleyin

1. Yine SQL Görünümü'nde `database/01b_mevcut_tablo_guncellemeleri.sql` dosyasındaki her `ALTER TABLE` satırını tek tek çalıştırın

Eklenen alanlar:
- `TB_Malzeme`: Birim, Mal_Grubu, TDS_Kod, Aktif
- `TB_Proje_Listesi`: Il_Kodu, Durum, Baslangic_Tarihi, Bitis_Tarihi
- `TB_Depo_Kodlari`: Proje_Kod

### Adım 4: İlişkileri Kurun

1. **Veritabanı Araçları** → **İlişkiler**
2. Tüm tabloları ekleyin
3. `database/02_iliskiler.md` dosyasındaki 12 ilişkiyi kurun
4. Her ilişkide **Bütünlüğü Tümle** işaretleyin
5. İndeks SQL'lerini çalıştırın

### Adım 5: VBA Modüllerini Ekleyin

1. **Alt+F11** ile VBA editörünü açın
2. **Ekle** → **Modül** (3 kez, 3 modül için):
   - `modStokIslemleri`
   - `modNakilIslemleri`
   - `modHarcamaIslemleri`
3. `database/03_formlar_vba.bas` dosyasındaki ilgili bölümleri modüllere yapıştırın

### Adım 6: Formları Oluşturun

| Form Adı | Veri Kaynağı | Açıklama |
|----------|-------------|----------|
| `FRM_Malzeme_Giris` | TB_Stok_Hareket | Malzeme giriş formu |
| `FRM_Nakil` | (bağımsız) | Depolar arası nakil |
| `FRM_Harcama` | (bağımsız) | Proje harcama formu |
| `FRM_Bakiye_Sorgu` | QRY_Depo_Bakiye | Bakiye sorgulama |

Her form için alanlar ve VBA olayları `database/03_formlar_vba.bas` dosyasında açıklanmıştır.

### Adım 7: Sorguları Oluşturun

1. **Oluştur** → **Sorgu Tasarımı** → **SQL Görünümü**
2. `database/04_sorgular.sql` dosyasındaki her sorguyu ayrı ayrı oluşturun
3. Sorguları şu isimlerle kaydedin:

| Sorgu Adı | Açıklama |
|-----------|----------|
| `QRY_Depo_Bakiye` | İl depo bazlı anlık bakiye |
| `QRY_Proje_Harcama` | Proje bazlı tüketim özeti |
| `QRY_Nakil_Ozeti` | Transfer listesi |
| `QRY_Hareket_Dokumu` | Tüm hareketler (audit) |
| `QRY_Il_Bakiye_Ozet` | İl bazlı yönetici özeti |
| `QRY_Negatif_Stok` | Negatif bakiye uyarısı |

### Adım 8: Başlangıç Verilerini Girin

1. **Proje-İl eşlemesi**: `TB_Proje_Listesi.Il_Kodu` alanını doldurun
2. **Proje-Depo eşlemesi**: `TB_Proje_Depo` tablosuna kayıtlar ekleyin
3. **Malzeme birimleri**: `TB_Malzeme.Birim` alanını doldurun

## Dosya Yapısı

```
database/
├── 01_tablolar.sql              # Yeni tablo oluşturma
├── 01b_mevcut_tablo_guncellemeleri.sql  # Mevcut tablo alan ekleme
├── 02_iliskiler.md              # İlişki diyagramı ve kurulum
├── 03_formlar_vba.bas           # Form VBA kodları
├── 04_sorgular.sql              # Bakiye ve rapor sorguları
└── KURULUM.md                   # Bu dosya
```

## Test Senaryosu

Kurulum sonrası şu akışı test edin:

1. **Giriş**: Samsun Merkez Depo'ya 100 adet malzeme girişi yapın
2. **Bakiye**: `QRY_Depo_Bakiye` ile bakiyenin 100 göründüğünü doğrulayın
3. **Nakil**: Samsun → Ordu arası 30 adet nakil yapın
4. **Bakiye**: Samsun'da 70, Ordu'da 30 görünmeli
5. **Harcama**: Bir projeye 20 adet harcama yapın
6. **Rapor**: `QRY_Proje_Harcama` ile proje tüketimini kontrol edin

## Sorun Giderme

| Sorun | Çözüm |
|-------|-------|
| CREATE TABLE hata veriyor | Tablo zaten varsa önce silin veya atlayın |
| ALTER TABLE hata veriyor | Alan zaten varsa atlayın |
| İlişki kurulamıyor | Veri tiplerinin eşleştiğini kontrol edin |
| Negatif stok uyarısı | Önce giriş yapın, sonra çıkış/nakil deneyin |
| VBA çalışmıyor | Makro güvenliğini "Tüm Makroları Etkinleştir" yapın |
