-- ============================================================
-- Raporlama View'ları
-- ============================================================

-- Depo stok özeti (kritik stok uyarısı dahil)
CREATE VIEW IF NOT EXISTS v_depo_stok_ozet AS
SELECT
    d.depo_kodu,
    d.depo_adi,
    m.malzeme_kodu,
    m.malzeme_adi,
    mk.kategori_adi,
    m.birim,
    ds.miktar,
    ds.min_stok,
    CASE
        WHEN ds.miktar <= ds.min_stok THEN 'kritik'
        WHEN ds.miktar <= ds.min_stok * 1.5 THEN 'dusuk'
        ELSE 'normal'
    END AS stok_durumu,
    ds.son_guncelleme
FROM depo_stok ds
JOIN depolar d ON d.id = ds.depo_id
JOIN malzemeler m ON m.id = ds.malzeme_id
LEFT JOIN malzeme_kategorileri mk ON mk.id = m.kategori_id;

-- Firma bazında alınan / iade edilen malzemeler
CREATE VIEW IF NOT EXISTS v_firma_malzeme_hareketleri AS
SELECT
    f.firma_kodu,
    f.firma_adi,
    m.malzeme_kodu,
    m.malzeme_adi,
    m.birim,
    COALESCE(SUM(CASE WHEN mi.islem_tipi = 'firma_cikis' THEN mi.miktar END), 0) AS alinan_miktar,
    COALESCE(SUM(CASE WHEN mi.islem_tipi = 'firma_iade' THEN mi.miktar END), 0) AS iade_miktar,
    COALESCE(SUM(CASE WHEN mi.islem_tipi = 'firma_cikis' THEN mi.miktar END), 0)
        - COALESCE(SUM(CASE WHEN mi.islem_tipi = 'firma_iade' THEN mi.miktar END), 0) AS net_alinan,
    COALESCE(SUM(CASE WHEN mi.islem_tipi = 'saha_harcama' THEN mi.miktar END), 0) AS harcanan_miktar,
    COALESCE(SUM(CASE WHEN mi.islem_tipi = 'firma_cikis' THEN mi.miktar END), 0)
        - COALESCE(SUM(CASE WHEN mi.islem_tipi = 'firma_iade' THEN mi.miktar END), 0)
        - COALESCE(SUM(CASE WHEN mi.islem_tipi = 'saha_harcama' THEN mi.miktar END), 0) AS elde_kalan
FROM firmalar f
CROSS JOIN malzemeler m
LEFT JOIN malzeme_islemleri mi
    ON mi.firma_id = f.id
    AND mi.malzeme_id = m.id
    AND mi.onay_durumu = 'onaylandi'
    AND mi.islem_tipi IN ('firma_cikis', 'firma_iade', 'saha_harcama')
GROUP BY f.id, f.firma_kodu, f.firma_adi, m.id, m.malzeme_kodu, m.malzeme_adi, m.birim
HAVING alinan_miktar > 0 OR iade_miktar > 0 OR harcanan_miktar > 0;

-- Proje + firma keşif limit takibi
CREATE VIEW IF NOT EXISTS v_proje_firma_limit_takibi AS
SELECT
    p.proje_kodu,
    p.proje_adi,
    f.firma_kodu,
    f.firma_adi,
    m.malzeme_kodu,
    m.malzeme_adi,
    m.birim,
    pk.kesif_miktari,
    pk.limit_miktari,
    pk.birim_fiyat,
    COALESCE(SUM(CASE
        WHEN mi.islem_tipi IN ('proje_transfer', 'saha_harcama')
             AND mi.onay_durumu = 'onaylandi'
        THEN mi.miktar
    END), 0) AS kullanilan_miktar,
    pk.limit_miktari - COALESCE(SUM(CASE
        WHEN mi.islem_tipi IN ('proje_transfer', 'saha_harcama')
             AND mi.onay_durumu = 'onaylandi'
        THEN mi.miktar
    END), 0) AS kalan_limit,
    ROUND(
        COALESCE(SUM(CASE
            WHEN mi.islem_tipi IN ('proje_transfer', 'saha_harcama')
                 AND mi.onay_durumu = 'onaylandi'
            THEN mi.miktar
        END), 0) * 100.0 / NULLIF(pk.limit_miktari, 0),
        2
    ) AS limit_kullanim_yuzdesi,
    CASE
        WHEN COALESCE(SUM(CASE
            WHEN mi.islem_tipi IN ('proje_transfer', 'saha_harcama')
                 AND mi.onay_durumu = 'onaylandi'
            THEN mi.miktar
        END), 0) > pk.limit_miktari THEN 'limit_asildi'
        WHEN COALESCE(SUM(CASE
            WHEN mi.islem_tipi IN ('proje_transfer', 'saha_harcama')
                 AND mi.onay_durumu = 'onaylandi'
            THEN mi.miktar
        END), 0) >= pk.limit_miktari * 0.9 THEN 'limit_yakin'
        ELSE 'normal'
    END AS limit_durumu
FROM proje_kesifleri pk
JOIN projeler p ON p.id = pk.proje_id
JOIN firmalar f ON f.id = pk.firma_id
JOIN malzemeler m ON m.id = pk.malzeme_id
LEFT JOIN malzeme_islemleri mi
    ON mi.proje_id = pk.proje_id
    AND mi.firma_id = pk.firma_id
    AND mi.malzeme_id = pk.malzeme_id
GROUP BY
    p.proje_kodu, p.proje_adi,
    f.firma_kodu, f.firma_adi,
    m.malzeme_kodu, m.malzeme_adi, m.birim,
    pk.kesif_miktari, pk.limit_miktari, pk.birim_fiyat;

-- Proje malzeme kullanım özeti
CREATE VIEW IF NOT EXISTS v_proje_malzeme_ozet AS
SELECT
    p.proje_kodu,
    p.proje_adi,
    m.malzeme_kodu,
    m.malzeme_adi,
    m.birim,
    COALESCE(SUM(CASE WHEN mi.islem_tipi = 'proje_transfer' THEN mi.miktar END), 0) AS transfer_miktari,
    COALESCE(SUM(CASE WHEN mi.islem_tipi = 'saha_harcama' THEN mi.miktar END), 0) AS saha_harcama_miktari,
    COALESCE(SUM(CASE WHEN mi.islem_tipi IN ('proje_transfer', 'saha_harcama') THEN mi.miktar END), 0) AS toplam_kullanim
FROM projeler p
CROSS JOIN malzemeler m
LEFT JOIN malzeme_islemleri mi
    ON mi.proje_id = p.id
    AND mi.malzeme_id = m.id
    AND mi.onay_durumu = 'onaylandi'
GROUP BY p.proje_kodu, p.proje_adi, m.malzeme_kodu, m.malzeme_adi, m.birim
HAVING toplam_kullanim > 0;

-- Teminat özeti
CREATE VIEW IF NOT EXISTS v_teminat_ozet AS
SELECT
    f.firma_kodu,
    f.firma_adi,
    p.proje_kodu,
    p.proje_adi,
    t.teminat_turu,
    t.teminat_no,
    t.tutar,
    t.para_birimi,
    t.baslangic_tarihi,
    t.bitis_tarihi,
    t.durum,
    CASE
        WHEN t.bitis_tarihi IS NOT NULL AND t.bitis_tarihi < DATE('now') AND t.durum = 'aktif'
        THEN 'suresi_dolmus'
        WHEN t.bitis_tarihi IS NOT NULL AND t.bitis_tarihi <= DATE('now', '+30 days') AND t.durum = 'aktif'
        THEN 'yakinda_bitecek'
        ELSE 'gecerli'
    END AS teminat_durumu
FROM teminatlar t
JOIN firmalar f ON f.id = t.firma_id
LEFT JOIN projeler p ON p.id = t.proje_id;

-- Saha montaj harcama detayı
CREATE VIEW IF NOT EXISTS v_saha_harcama_detay AS
SELECT
    sh.id,
    p.proje_kodu,
    p.proje_adi,
    f.firma_kodu,
    f.firma_adi,
    m.malzeme_kodu,
    m.malzeme_adi,
    sh.harcanan_miktar,
    m.birim,
    sh.montaj_tarihi,
    sh.saha_lokasyonu,
    sh.montaj_elemani,
    mi.islem_no,
    mi.belge_no,
    sh.aciklama
FROM saha_harcamalari sh
JOIN malzeme_islemleri mi ON mi.id = sh.islem_id
JOIN projeler p ON p.id = sh.proje_id
JOIN firmalar f ON f.id = sh.firma_id
JOIN malzemeler m ON m.id = sh.malzeme_id;

-- Malzeme aktarım özeti
CREATE VIEW IF NOT EXISTS v_malzeme_aktarim_ozet AS
SELECT
    mi.islem_no,
    mi.islem_tipi,
    mi.islem_tarihi,
    m.malzeme_kodu,
    m.malzeme_adi,
    mi.miktar,
    mi.birim,
    d.depo_adi AS kaynak_depo,
    f.firma_adi,
    p.proje_adi,
    mi.belge_no,
    mi.onay_durumu,
    mi.aciklama
FROM malzeme_islemleri mi
JOIN malzemeler m ON m.id = mi.malzeme_id
LEFT JOIN depolar d ON d.id = mi.depo_id
LEFT JOIN firmalar f ON f.id = mi.firma_id
LEFT JOIN projeler p ON p.id = mi.proje_id
WHERE mi.islem_tipi IN ('firma_cikis', 'firma_iade', 'proje_transfer', 'saha_harcama');
