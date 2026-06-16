-- ============================================================
-- Firma Malzeme Takip Veritabanı
-- Depo stok, malzeme aktarımı, teminat, proje ve limit takibi
-- ============================================================

PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------
-- Temel Tanımlar
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS firmalar (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    firma_kodu      TEXT NOT NULL UNIQUE,
    firma_adi       TEXT NOT NULL,
    vergi_no        TEXT UNIQUE,
    yetkili_kisi    TEXT,
    telefon         TEXT,
    email           TEXT,
    adres           TEXT,
    durum           TEXT NOT NULL DEFAULT 'aktif'
                    CHECK (durum IN ('aktif', 'pasif', 'askida')),
    olusturma_tarihi DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    guncelleme_tarihi DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS malzeme_kategorileri (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    kategori_kodu   TEXT NOT NULL UNIQUE,
    kategori_adi    TEXT NOT NULL,
    aciklama        TEXT
);

CREATE TABLE IF NOT EXISTS malzemeler (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    malzeme_kodu    TEXT NOT NULL UNIQUE,
    malzeme_adi     TEXT NOT NULL,
    kategori_id     INTEGER REFERENCES malzeme_kategorileri(id),
    birim           TEXT NOT NULL DEFAULT 'adet',
    aciklama        TEXT,
    durum           TEXT NOT NULL DEFAULT 'aktif'
                    CHECK (durum IN ('aktif', 'pasif')),
    olusturma_tarihi DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS depolar (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    depo_kodu       TEXT NOT NULL UNIQUE,
    depo_adi        TEXT NOT NULL,
    konum           TEXT,
    sorumlu_kisi    TEXT,
    durum           TEXT NOT NULL DEFAULT 'aktif'
                    CHECK (durum IN ('aktif', 'pasif'))
);

-- ------------------------------------------------------------
-- Depo Stok
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS depo_stok (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    depo_id         INTEGER NOT NULL REFERENCES depolar(id),
    malzeme_id      INTEGER NOT NULL REFERENCES malzemeler(id),
    miktar          REAL NOT NULL DEFAULT 0 CHECK (miktar >= 0),
    min_stok        REAL NOT NULL DEFAULT 0 CHECK (min_stok >= 0),
    son_guncelleme  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (depo_id, malzeme_id)
);

-- ------------------------------------------------------------
-- Proje Takibi
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS projeler (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    proje_kodu      TEXT NOT NULL UNIQUE,
    proje_adi       TEXT NOT NULL,
    lokasyon        TEXT,
    baslangic_tarihi DATE,
    bitis_tarihi    DATE,
    durum           TEXT NOT NULL DEFAULT 'planlama'
                    CHECK (durum IN ('planlama', 'devam', 'tamamlandi', 'iptal')),
    aciklama        TEXT,
    olusturma_tarihi DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS proje_firmalar (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    proje_id        INTEGER NOT NULL REFERENCES projeler(id),
    firma_id        INTEGER NOT NULL REFERENCES firmalar(id),
    sozlesme_no     TEXT,
    sozlesme_tutari  REAL CHECK (sozlesme_tutari IS NULL OR sozlesme_tutari >= 0),
    baslangic_tarihi DATE,
    bitis_tarihi    DATE,
    durum           TEXT NOT NULL DEFAULT 'aktif'
                    CHECK (durum IN ('aktif', 'pasif', 'tamamlandi')),
    UNIQUE (proje_id, firma_id)
);

-- Firma + proje bazında malzeme keşif ve limit tanımları
CREATE TABLE IF NOT EXISTS proje_kesifleri (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    proje_id        INTEGER NOT NULL REFERENCES projeler(id),
    firma_id        INTEGER NOT NULL REFERENCES firmalar(id),
    malzeme_id      INTEGER NOT NULL REFERENCES malzemeler(id),
    kesif_miktari   REAL NOT NULL CHECK (kesif_miktari >= 0),
    limit_miktari   REAL NOT NULL CHECK (limit_miktari >= 0),
    birim_fiyat     REAL CHECK (birim_fiyat IS NULL OR birim_fiyat >= 0),
    aciklama        TEXT,
    olusturma_tarihi DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (proje_id, firma_id, malzeme_id),
    CHECK (limit_miktari >= kesif_miktari)
);

-- ------------------------------------------------------------
-- Teminat Takibi
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS teminatlar (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    firma_id        INTEGER NOT NULL REFERENCES firmalar(id),
    proje_id        INTEGER REFERENCES projeler(id),
    teminat_turu    TEXT NOT NULL
                    CHECK (teminat_turu IN ('nakit', 'banka_teminati', 'cek', 'senet', 'diger')),
    teminat_no      TEXT,
    tutar           REAL NOT NULL CHECK (tutar > 0),
    para_birimi     TEXT NOT NULL DEFAULT 'TRY',
    baslangic_tarihi DATE NOT NULL,
    bitis_tarihi    DATE,
    durum           TEXT NOT NULL DEFAULT 'aktif'
                    CHECK (durum IN ('aktif', 'iade_edildi', 'tahsil_edildi', 'iptal')),
    aciklama        TEXT,
    olusturma_tarihi DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- Malzeme İşlemleri (Merkezi Hareket Tablosu)
-- islem_tipi:
--   depo_giris   : depoya malzeme girişi
--   depo_cikis   : depodan çıkış (genel)
--   firma_cikis  : depodan firmaya malzeme verme (alındı)
--   firma_iade   : firmadan depoya iade
--   proje_transfer: firmadan projeye / depodan projeye aktarım
--   saha_harcama : sahada montaj/harcama
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS malzeme_islemleri (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    islem_no        TEXT NOT NULL UNIQUE,
    islem_tipi      TEXT NOT NULL
                    CHECK (islem_tipi IN (
                        'depo_giris', 'depo_cikis', 'firma_cikis',
                        'firma_iade', 'proje_transfer', 'saha_harcama'
                    )),
    malzeme_id      INTEGER NOT NULL REFERENCES malzemeler(id),
    miktar          REAL NOT NULL CHECK (miktar > 0),
    birim           TEXT NOT NULL,
    depo_id         INTEGER REFERENCES depolar(id),
    firma_id        INTEGER REFERENCES firmalar(id),
    proje_id        INTEGER REFERENCES projeler(id),
    islem_tarihi    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    belge_no        TEXT,
    lokasyon        TEXT,
    aciklama        TEXT,
    olusturan       TEXT,
    onay_durumu     TEXT NOT NULL DEFAULT 'onaylandi'
                    CHECK (onay_durumu IN ('beklemede', 'onaylandi', 'reddedildi', 'iptal'))
);

-- ------------------------------------------------------------
-- Saha Montaj / Harcama Detayı
-- (malzeme_islemleri ile bire-bir; saha_harcama tipi için ek bilgi)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS saha_harcamalari (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    islem_id        INTEGER NOT NULL UNIQUE REFERENCES malzeme_islemleri(id),
    proje_id        INTEGER NOT NULL REFERENCES projeler(id),
    firma_id        INTEGER NOT NULL REFERENCES firmalar(id),
    malzeme_id      INTEGER NOT NULL REFERENCES malzemeler(id),
    harcanan_miktar REAL NOT NULL CHECK (harcanan_miktar > 0),
    montaj_tarihi   DATE NOT NULL,
    saha_lokasyonu  TEXT,
    montaj_elemani  TEXT,
    aciklama        TEXT
);

-- ------------------------------------------------------------
-- Stok Hareket Log (Denetim İzi)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS stok_hareket_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    islem_id        INTEGER REFERENCES malzeme_islemleri(id),
    depo_id         INTEGER REFERENCES depolar(id),
    malzeme_id      INTEGER NOT NULL REFERENCES malzemeler(id),
    onceki_miktar   REAL NOT NULL,
    hareket_miktari REAL NOT NULL,
    yeni_miktar     REAL NOT NULL,
    hareket_tipi    TEXT NOT NULL,
    log_tarihi      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- İndeksler
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_depo_stok_depo ON depo_stok(depo_id);
CREATE INDEX IF NOT EXISTS idx_depo_stok_malzeme ON depo_stok(malzeme_id);
CREATE INDEX IF NOT EXISTS idx_proje_kesif_proje ON proje_kesifleri(proje_id);
CREATE INDEX IF NOT EXISTS idx_proje_kesif_firma ON proje_kesifleri(firma_id);
CREATE INDEX IF NOT EXISTS idx_malzeme_islem_tarih ON malzeme_islemleri(islem_tarihi);
CREATE INDEX IF NOT EXISTS idx_malzeme_islem_firma ON malzeme_islemleri(firma_id);
CREATE INDEX IF NOT EXISTS idx_malzeme_islem_proje ON malzeme_islemleri(proje_id);
CREATE INDEX IF NOT EXISTS idx_malzeme_islem_tip ON malzeme_islemleri(islem_tipi);
CREATE INDEX IF NOT EXISTS idx_teminat_firma ON teminatlar(firma_id);
CREATE INDEX IF NOT EXISTS idx_saha_harcama_proje ON saha_harcamalari(proje_id);
