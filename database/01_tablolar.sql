-- ============================================================
-- ADIM 1: YENİ TABLOLAR
-- Database2.accdb - Stok Takip Sistemi
-- Access'te: Oluştur > Sorgu Tasarımı > SQL Görünümü > Yapıştır > Çalıştır
-- ============================================================

-- ------------------------------------------------------------
-- 1A. TB_Stok_Hareket - Ana hareket defteri (ledger)
-- Tüm giriş, çıkış, nakil, harcama, iade ve sayım burada
-- ------------------------------------------------------------
CREATE TABLE TB_Stok_Hareket (
    HareketID       AUTOINCREMENT   CONSTRAINT PK_Stok_Hareket PRIMARY KEY,
    Tarih           DATETIME        NOT NULL,
    Hareket_Tipi    TEXT(10)        NOT NULL,
    -- GIRIS | CIKIS | NAKIL | HARCAMA | IADE | SAYIM
    Malzeme_Kodu    TEXT(20)        NOT NULL,
    Miktar          DOUBLE          NOT NULL,
    Birim           TEXT(10),
    Kaynak_Depo_ID  TEXT(20),
    Hedef_Depo_ID   TEXT(20),
    Proje_Kod       TEXT(20),
    Degerleme_Tur   TEXT(20),
    Belge_No        TEXT(50),
    Aciklama        MEMO,
    Kullanici       TEXT(50),
    Kayit_Tarihi    DATETIME,
    Onay_Durumu     TEXT(10)        DEFAULT 'BEKLIYOR',
    -- BEKLIYOR | ONAYLANDI | IPTAL
    Onaylayan       TEXT(50),
    Onay_Tarihi     DATETIME
);

-- Hareket tipi kısıtlaması (Access'te tablo tasarımından veya formdan kontrol edilir)
-- Geçerli değerler: GIRIS, CIKIS, NAKIL, HARCAMA, IADE, SAYIM

-- ------------------------------------------------------------
-- 1B. TB_Proje_Depo - Proje ile depo eşlemesi
-- Her projenin hangi ilde ve hangi depoda takip edileceği
-- ------------------------------------------------------------
CREATE TABLE TB_Proje_Depo (
    Proje_Depo_ID   AUTOINCREMENT   CONSTRAINT PK_Proje_Depo PRIMARY KEY,
    Proje_Kod       TEXT(20)        NOT NULL,
    Depo_ID         TEXT(20)        NOT NULL,
    Il_Kodu         TEXT(10)        NOT NULL,
    Aktif           YESNO           DEFAULT True,
    Aciklama        TEXT(100)
);

-- ------------------------------------------------------------
-- 1C. TB_Hareket_Tipi - Hareket tipi referans tablosu (opsiyonel)
-- Formlarda combo box için
-- ------------------------------------------------------------
CREATE TABLE TB_Hareket_Tipi (
    Hareket_Tipi    TEXT(10)        CONSTRAINT PK_Hareket_Tipi PRIMARY KEY,
    Tanim           TEXT(50)        NOT NULL,
    Kaynak_Zorunlu  YESNO           DEFAULT False,
    Hedef_Zorunlu   YESNO           DEFAULT False,
    Proje_Zorunlu   YESNO           DEFAULT False
);

-- Hareket tipi başlangıç verileri
INSERT INTO TB_Hareket_Tipi (Hareket_Tipi, Tanim, Kaynak_Zorunlu, Hedef_Zorunlu, Proje_Zorunlu)
VALUES ('GIRIS', 'Malzeme Girişi', False, True, False);

INSERT INTO TB_Hareket_Tipi (Hareket_Tipi, Tanim, Kaynak_Zorunlu, Hedef_Zorunlu, Proje_Zorunlu)
VALUES ('CIKIS', 'Malzeme Çıkışı', True, False, False);

INSERT INTO TB_Hareket_Tipi (Hareket_Tipi, Tanim, Kaynak_Zorunlu, Hedef_Zorunlu, Proje_Zorunlu)
VALUES ('NAKIL', 'Depolar Arası Nakil', True, True, False);

INSERT INTO TB_Hareket_Tipi (Hareket_Tipi, Tanim, Kaynak_Zorunlu, Hedef_Zorunlu, Proje_Zorunlu)
VALUES ('HARCAMA', 'Proje Harcaması', True, False, True);

INSERT INTO TB_Hareket_Tipi (Hareket_Tipi, Tanim, Kaynak_Zorunlu, Hedef_Zorunlu, Proje_Zorunlu)
VALUES ('IADE', 'İade', False, True, False);

INSERT INTO TB_Hareket_Tipi (Hareket_Tipi, Tanim, Kaynak_Zorunlu, Hedef_Zorunlu, Proje_Zorunlu)
VALUES ('SAYIM', 'Sayım Düzeltmesi', True, False, False);
