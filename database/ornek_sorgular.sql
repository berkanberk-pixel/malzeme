-- ============================================================
-- Örnek Raporlama Sorguları
-- ============================================================

-- 1) Depo stok durumu (kritik stoklar)
SELECT * FROM v_depo_stok_ozet
WHERE stok_durumu IN ('kritik', 'dusuk')
ORDER BY stok_durumu, depo_adi, malzeme_adi;

-- 2) Belirli bir firmanın malzeme bakiyesi
SELECT *
FROM v_firma_malzeme_hareketleri
WHERE firma_kodu = 'FRM-001';

-- 3) Proje bazında limit aşımı veya yaklaşan limitler
SELECT *
FROM v_proje_firma_limit_takibi
WHERE limit_durumu IN ('limit_asildi', 'limit_yakin')
ORDER BY proje_kodu, firma_adi;

-- 4) Proje malzeme kullanım özeti
SELECT *
FROM v_proje_malzeme_ozet
WHERE proje_kodu = 'PRJ-2024-001';

-- 5) Süresi dolmuş veya yakında bitecek teminatlar
SELECT *
FROM v_teminat_ozet
WHERE teminat_durumu IN ('suresi_dolmus', 'yakinda_bitecek');

-- 6) Saha montaj harcamaları (tarih aralığı)
SELECT *
FROM v_saha_harcama_detay
WHERE montaj_tarihi BETWEEN '2024-01-01' AND '2024-12-31'
ORDER BY montaj_tarihi DESC;

-- 7) Malzeme aktarım geçmişi
SELECT *
FROM v_malzeme_aktarim_ozet
ORDER BY islem_tarihi DESC;

-- 8) Firmaya malzeme çıkışı kaydetme
-- INSERT INTO malzeme_islemleri (
--     islem_no, islem_tipi, malzeme_id, miktar, birim,
--     depo_id, firma_id, proje_id, belge_no, aciklama
-- ) VALUES (
--     'ISL-2024-0100', 'firma_cikis', 1, 200, 'metre',
--     1, 1, 1, 'IRS-100', 'Ek kablo teslimi'
-- );

-- 9) Firmadan iade kaydetme
-- INSERT INTO malzeme_islemleri (
--     islem_no, islem_tipi, malzeme_id, miktar, birim,
--     depo_id, firma_id, proje_id, belge_no, aciklama
-- ) VALUES (
--     'ISL-2024-0101', 'firma_iade', 1, 30, 'metre',
--     1, 1, 1, 'IAD-100', 'Fazla malzeme iadesi'
-- );

-- 10) Saha harcama kaydetme (limit kontrolü otomatik yapılır)
-- INSERT INTO malzeme_islemleri (
--     islem_no, islem_tipi, malzeme_id, miktar, birim,
--     firma_id, proje_id, lokasyon, belge_no, aciklama
-- ) VALUES (
--     'ISL-2024-0102', 'saha_harcama', 1, 150, 'metre',
--     1, 1, 'B Blok 2. Kat', 'SH-100', 'Montaj tamamlandı'
-- );

-- 11) Yeni proje keşif/limit tanımlama
-- INSERT INTO proje_kesifleri (
--     proje_id, firma_id, malzeme_id,
--     kesif_miktari, limit_miktari, birim_fiyat
-- ) VALUES (1, 1, 3, 500, 600, 8.00);

-- 12) Aylık harcama raporu
SELECT
    strftime('%Y-%m', mi.islem_tarihi) AS ay,
    p.proje_adi,
    f.firma_adi,
    m.malzeme_adi,
    SUM(mi.miktar) AS toplam_harcama,
    m.birim
FROM malzeme_islemleri mi
JOIN projeler p ON p.id = mi.proje_id
JOIN firmalar f ON f.id = mi.firma_id
JOIN malzemeler m ON m.id = mi.malzeme_id
WHERE mi.islem_tipi = 'saha_harcama'
  AND mi.onay_durumu = 'onaylandi'
GROUP BY ay, p.proje_adi, f.firma_adi, m.malzeme_adi, m.birim
ORDER BY ay DESC, p.proje_adi;
