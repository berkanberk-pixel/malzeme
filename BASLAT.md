# Çalışan Stok Takip Uygulaması - Başlatma Kılavuzu

Bu proje, `Database2.accdb` verisini kullanan **çalışan bir web uygulamasıdır**.
Giriş, nakil, harcama ve raporlar tarayıcıdan yapılır.

---

## Gereksinimler

- Python 3.10 veya üzeri
- `Database2.accdb` dosyası (proje kökünde)

---

## Kurulum (Windows)

### 1. Projeyi indirin

GitHub'dan branch'i çekin:

```bash
git clone https://github.com/berkanberk-pixel/malzeme.git
cd malzeme
git checkout cursor/stok-takip-implementasyon-1b19
```

### 2. Database2.accdb dosyasını ekleyin

`Database2.accdb` dosyasını proje kök klasörüne kopyalayın:

```
malzeme/
├── Database2.accdb    ← buraya
├── run.py
├── app/
└── scripts/
```

### 3. Python paketlerini kurun

```bash
pip install -r requirements.txt
```

### 4. Uygulamayı başlatın

**Kolay yol (Windows):** `baslat.bat` dosyasına çift tıklayın.

**Manuel yol:**

```bash
python run.py
```

İlk çalıştırmada Access verisi otomatik olarak `data/malzeme.db` dosyasına aktarılır.

### 5. Tarayıcıda açın

```
http://localhost:5000
```

(`baslat.bat` tarayıcıyı otomatik açar.)

---

## Kullanım

| Sayfa | Adres | İşlev |
|-------|-------|-------|
| Ana Sayfa | `/` | Özet istatistikler ve son hareketler |
| Malzeme Girişi | `/giris` | İl depoya malzeme girişi |
| Nakil | `/nakil` | Depolar arası transfer |
| Harcama | `/harcama` | Proje bazlı malzeme tüketimi |
| Depo Bakiye | `/bakiye` | İl/depo bazlı anlık stok |
| Raporlar | `/raporlar` | Harcama, nakil ve hareket dökümü |

---

## Demo verisi

İlk kurulumda otomatik demo hareketleri eklenir:

1. Samsun Merkez Depo → 100 adet giriş
2. Ordu Merkez Depo → 50 adet giriş
3. Samsun → Ordu nakil → 30 adet
4. Proje Y222-1 harcama → 20 adet

**Beklenen bakiyeler:**
- Samsun Merkez (6510-0006): 50 adet
- Ordu Merkez (6520-0006): 80 adet

---

## Dosya yapısı

```
malzeme/
├── baslat.bat             # Windows: çift tıkla çalıştır
├── kurulum.bat            # Windows: ilk kurulum
├── run.py                 # Uygulamayı başlat
├── requirements.txt       # Python bağımlılıkları
├── Database2.accdb        # Access kaynak (siz eklersiniz)
├── data/
│   └── malzeme.db         # SQLite veritabanı (otomatik oluşur)
├── app/
│   ├── app.py             # Flask web uygulaması
│   ├── db.py              # Veritabanı işlemleri
│   └── templates/         # HTML sayfaları
├── scripts/
│   └── import_access.py   # Access → SQLite aktarım
└── database/              # Access SQL scriptleri (opsiyonel)
```

---

## Veritabanını yeniden oluşturma

```bash
# SQLite dosyasını silin
del data\malzeme.db

# Uygulamayı tekrar başlatın (otomatik içe aktarır)
python run.py
```

---

## Sorun giderme

| Sorun | Çözüm |
|-------|-------|
| `Database2.accdb bulunamadı` | Dosyayı proje köküne kopyalayın |
| `pip install` hata | `python -m pip install -r requirements.txt` deneyin |
| Port 5000 meşgul | `run.py` içinde portu değiştirin |
| Sayfa açılmıyor | `http://127.0.0.1:5000` deneyin |

---

## Access ile karşılaştırma

| Özellik | Access (database/) | Web Uygulama (app/) |
|---------|-------------------|---------------------|
| Kurulum | Access gerekli | Python yeterli |
| Çok kullanıcı | Zor | Tarayıcıdan erişim |
| Giriş/Nakil/Harcama | Form + VBA | Web formları |
| Raporlar | SQL sorguları | Hazır rapor sayfaları |
| Veri kaynağı | .accdb | SQLite (accdb'den aktarılır) |

Her iki yapı da aynı `TB_Stok_Hareket` mantığını kullanır.
