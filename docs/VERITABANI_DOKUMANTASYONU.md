# Firma Malzeme Takip Veritabanı

Yüklenici firmaların depo stok, malzeme aktarımı, teminat, proje ve limit takibini yapmak için tasarlanmış ilişkisel veritabanı.

## Kapsam

| Modül | Açıklama |
|-------|----------|
| **Depo Stok** | Depolardaki malzeme miktarları, minimum stok uyarıları |
| **Malzeme Aktarımı** | Depo → firma, firma → proje transferleri |
| **Teminat Takibi** | Firma/proje bazında teminat kayıtları ve vade takibi |
| **Proje Takibi** | Proje tanımları, firma atamaları |
| **Keşif & Limit** | Firma + proje + malzeme bazında keşif ve limit tanımları |
| **Saha Harcama** | Montaj yapılan malzemelerin sahada harcanması |
| **Raporlama** | Hazır view'lar ve örnek sorgular |

## Veritabanı Şeması

```
firmalar ──┬── proje_firmalar ── projeler
           ├── proje_kesifleri (firma + proje + malzeme → limit)
           ├── teminatlar
           └── malzeme_islemleri ── saha_harcamalari

malzemeler ── depo_stok ── depolar
           └── malzeme_islemleri
```

### İşlem Tipleri (`malzeme_islemleri`)

| Tip | Açıklama |
|-----|----------|
| `depo_giris` | Depoya malzeme girişi |
| `depo_cikis` | Depodan genel çıkış |
| `firma_cikis` | Depodan firmaya malzeme verme (alındı) |
| `firma_iade` | Firmadan depoya iade |
| `proje_transfer` | Projeye malzeme aktarımı |
| `saha_harcama` | Sahada montaj/harcama |

### Otomatik Kontroller

- **Limit kontrolü:** `proje_transfer` ve `saha_harcama` işlemlerinde tanımlı limit aşılamaz
- **Stok kontrolü:** Depo çıkışlarında yetersiz stok engellenir
- **Stok güncelleme:** Onaylanan işlemler depo stokunu otomatik günceller

## Kurulum

```bash
# Veritabanını oluştur (örnek verilerle)
python3 scripts/init_db.py --seed

# Sadece şema (boş veritabanı)
python3 scripts/init_db.py
```

Veritabanı dosyası: `data/malzeme_takip.db`

## Raporlama View'ları

| View | Kullanım |
|------|----------|
| `v_depo_stok_ozet` | Depo stok durumu ve kritik stok uyarıları |
| `v_firma_malzeme_hareketleri` | Firma bazında alınan/iade/harcanan/kalan |
| `v_proje_firma_limit_takibi` | Keşif, limit, kullanılan, kalan limit |
| `v_proje_malzeme_ozet` | Proje bazında malzeme kullanımı |
| `v_teminat_ozet` | Teminat durumu ve vade takibi |
| `v_saha_harcama_detay` | Saha montaj harcama detayları |
| `v_malzeme_aktarim_ozet` | Tüm aktarım işlemleri |

Örnek sorgular: `database/ornek_sorgular.sql`

## Tipik İş Akışı

1. **Tanımlar:** Firma, malzeme, depo, proje kayıtları oluşturulur
2. **Keşif/Limit:** Her proje-firma-malzeme için keşif ve limit girilir
3. **Teminat:** Firma teminatları kaydedilir
4. **Malzeme Çıkışı:** Depodan firmaya malzeme verilir (`firma_cikis`)
5. **Saha Harcama:** Montaj yapıldıkça harcama kaydedilir (`saha_harcama`)
6. **İade:** Kullanılmayan malzeme firmadan iade alınır (`firma_iade`)
7. **Raporlama:** View'lar ve sorgularla limit/stok/harcama raporları alınır

## Excel Entegrasyonu

Mevcut `DataBase.xlsx` dosyanızı bu yapıya aktarmak için:

1. Excel'deki her sayfayı ilgili tabloya eşleyin (firmalar, malzemeler, projeler vb.)
2. CSV olarak dışa aktarın
3. SQLite'a import edin:

```bash
sqlite3 data/malzeme_takip.db
.mode csv
.import firmalar.csv firmalar
```

## Dosya Yapısı

```
database/
  schema.sql        # Tablo tanımları
  views.sql         # Raporlama view'ları
  triggers.sql      # Otomatik stok ve limit kontrolleri
  seed.sql          # Örnek veriler
  ornek_sorgular.sql
scripts/
  init_db.py        # Kurulum scripti
data/
  malzeme_takip.db  # Oluşturulan veritabanı (kurulum sonrası)
```

## Notlar

- SQLite kullanılmaktadır; taşınabilir ve kurulum gerektirmez
- Üretim ortamı için PostgreSQL/MySQL'e geçiş mümkündür
- `onay_durumu = 'beklemede'` ile onay akışı eklenebilir
