-- ============================================================
-- Tetikleyiciler: Stok güncelleme ve limit kontrolü
-- ============================================================

-- Depo stok güncelleme (malzeme işlemi eklendiğinde)
CREATE TRIGGER IF NOT EXISTS trg_stok_guncelle_insert
AFTER INSERT ON malzeme_islemleri
WHEN NEW.onay_durumu = 'onaylandi'
BEGIN
    -- Depo girişi: stok artır
    INSERT INTO depo_stok (depo_id, malzeme_id, miktar, son_guncelleme)
    SELECT NEW.depo_id, NEW.malzeme_id, NEW.miktar, CURRENT_TIMESTAMP
    WHERE NEW.islem_tipi = 'depo_giris' AND NEW.depo_id IS NOT NULL
    ON CONFLICT(depo_id, malzeme_id) DO UPDATE SET
        miktar = miktar + NEW.miktar,
        son_guncelleme = CURRENT_TIMESTAMP;

    -- Depo çıkışı / firmaya verme: stok azalt
    UPDATE depo_stok
    SET miktar = miktar - NEW.miktar,
        son_guncelleme = CURRENT_TIMESTAMP
    WHERE depo_id = NEW.depo_id
      AND malzeme_id = NEW.malzeme_id
      AND NEW.islem_tipi IN ('depo_cikis', 'firma_cikis')
      AND NEW.depo_id IS NOT NULL;

    -- Firmadan iade: stok artır
    UPDATE depo_stok
    SET miktar = miktar + NEW.miktar,
        son_guncelleme = CURRENT_TIMESTAMP
    WHERE depo_id = NEW.depo_id
      AND malzeme_id = NEW.malzeme_id
      AND NEW.islem_tipi = 'firma_iade'
      AND NEW.depo_id IS NOT NULL;

    -- Stok hareket logu
    INSERT INTO stok_hareket_log (islem_id, depo_id, malzeme_id, onceki_miktar, hareket_miktari, yeni_miktar, hareket_tipi)
    SELECT
        NEW.id,
        NEW.depo_id,
        NEW.malzeme_id,
        COALESCE((SELECT miktar FROM depo_stok WHERE depo_id = NEW.depo_id AND malzeme_id = NEW.malzeme_id), 0),
        CASE
            WHEN NEW.islem_tipi IN ('depo_giris', 'firma_iade') THEN NEW.miktar
            WHEN NEW.islem_tipi IN ('depo_cikis', 'firma_cikis') THEN -NEW.miktar
            ELSE 0
        END,
        COALESCE((SELECT miktar FROM depo_stok WHERE depo_id = NEW.depo_id AND malzeme_id = NEW.malzeme_id), 0)
            + CASE
                WHEN NEW.islem_tipi IN ('depo_giris', 'firma_iade') THEN NEW.miktar
                WHEN NEW.islem_tipi IN ('depo_cikis', 'firma_cikis') THEN -NEW.miktar
                ELSE 0
            END,
        NEW.islem_tipi
    WHERE NEW.depo_id IS NOT NULL
      AND NEW.islem_tipi IN ('depo_giris', 'depo_cikis', 'firma_cikis', 'firma_iade');
END;

-- Limit aşımı kontrolü (saha harcama ve proje transferi)
CREATE TRIGGER IF NOT EXISTS trg_limit_kontrol
BEFORE INSERT ON malzeme_islemleri
WHEN NEW.islem_tipi IN ('proje_transfer', 'saha_harcama')
     AND NEW.proje_id IS NOT NULL
     AND NEW.firma_id IS NOT NULL
     AND NEW.onay_durumu = 'onaylandi'
BEGIN
    SELECT RAISE(ABORT, 'Limit aşıldı: Bu malzeme için tanımlı limit yetersiz')
    WHERE EXISTS (
        SELECT 1
        FROM proje_kesifleri pk
        WHERE pk.proje_id = NEW.proje_id
          AND pk.firma_id = NEW.firma_id
          AND pk.malzeme_id = NEW.malzeme_id
          AND (
              SELECT COALESCE(SUM(mi.miktar), 0)
              FROM malzeme_islemleri mi
              WHERE mi.proje_id = NEW.proje_id
                AND mi.firma_id = NEW.firma_id
                AND mi.malzeme_id = NEW.malzeme_id
                AND mi.islem_tipi IN ('proje_transfer', 'saha_harcama')
                AND mi.onay_durumu = 'onaylandi'
          ) + NEW.miktar > pk.limit_miktari
    );
END;

-- Yetersiz depo stoku kontrolü
CREATE TRIGGER IF NOT EXISTS trg_depo_stok_kontrol
BEFORE INSERT ON malzeme_islemleri
WHEN NEW.islem_tipi IN ('depo_cikis', 'firma_cikis')
     AND NEW.depo_id IS NOT NULL
     AND NEW.onay_durumu = 'onaylandi'
BEGIN
    SELECT RAISE(ABORT, 'Yetersiz depo stoku')
    WHERE COALESCE(
        (SELECT miktar FROM depo_stok WHERE depo_id = NEW.depo_id AND malzeme_id = NEW.malzeme_id),
        0
    ) < NEW.miktar;
END;

-- Saha harcama kaydı otomatik oluşturma
CREATE TRIGGER IF NOT EXISTS trg_saha_harcama_olustur
AFTER INSERT ON malzeme_islemleri
WHEN NEW.islem_tipi = 'saha_harcama'
     AND NEW.proje_id IS NOT NULL
     AND NEW.firma_id IS NOT NULL
BEGIN
    INSERT INTO saha_harcamalari (
        islem_id, proje_id, firma_id, malzeme_id,
        harcanan_miktar, montaj_tarihi, saha_lokasyonu, aciklama
    ) VALUES (
        NEW.id, NEW.proje_id, NEW.firma_id, NEW.malzeme_id,
        NEW.miktar, DATE(NEW.islem_tarihi), NEW.lokasyon, NEW.aciklama
    );
END;
