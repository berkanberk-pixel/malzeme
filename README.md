# malzeme

YEDAŞ bölge dağıtım şirketi malzeme stok takip sistemi.

## Çalışan Uygulama (Web)

**Hemen kullanmak için:** [BASLAT.md](BASLAT.md)

**Windows:** `baslat.bat` dosyasına çift tıklayın.

**Manuel:**
```bash
pip install -r requirements.txt
# Database2.accdb dosyasını proje köküne koyun
python run.py
# Tarayıcı: http://localhost:5000
```

### Özellikler

- Malzeme girişi (il depo)
- Depolar arası nakil
- Proje bazlı harcama
- İl/depo bakiye sorgulama
- Harcama, nakil ve hareket raporları

### Dosya Yapısı

```
malzeme/
├── run.py              ← Uygulamayı başlat
├── BASLAT.md           ← Kurulum kılavuzu
├── Database2.accdb     ← Access kaynak (siz eklersiniz)
├── app/                ← Web uygulaması
├── scripts/            ← Access → SQLite aktarım
└── database/           ← Access SQL scriptleri (opsiyonel)
```

---

## Access SQL Scriptleri (Opsiyonel)

Access içinde doğrudan kurmak isterseniz: [database/KURULUM.md](database/KURULUM.md)

1. `01_tablolar.sql` — Yeni tablolar
2. `01b_mevcut_tablo_guncellemeleri.sql` — Ek alanlar
3. `02_iliskiler.md` — İlişkiler
4. `03_formlar_vba.bas` — VBA formları
5. `04_sorgular.sql` — Rapor sorguları
