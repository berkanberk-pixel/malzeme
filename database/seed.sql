-- ============================================================
-- Örnek Veriler (Test ve Demo)
-- ============================================================

INSERT INTO malzeme_kategorileri (kategori_kodu, kategori_adi) VALUES
    ('ELK', 'Elektrik Malzemeleri'),
    ('MEK', 'Mekanik Malzemeleri'),
    ('INS', 'İnşaat Malzemeleri');

INSERT INTO malzemeler (malzeme_kodu, malzeme_adi, kategori_id, birim) VALUES
    ('KBL-3x2.5', 'Kablo 3x2.5 mm', 1, 'metre'),
    ('PANO-400', 'Elektrik Panosu 400A', 1, 'adet'),
    ('BORU-PVC32', 'PVC Boru 32mm', 2, 'metre'),
    ('VANA-2', 'Vana 2 inç', 2, 'adet'),
    ('DEMIR-12', 'Demir 12mm', 3, 'ton');

INSERT INTO depolar (depo_kodu, depo_adi, konum) VALUES
    ('DEPO-01', 'Ana Depo', 'İstanbul'),
    ('DEPO-02', 'Saha Deposu', 'Ankara');

INSERT INTO depo_stok (depo_id, malzeme_id, miktar, min_stok) VALUES
    (1, 1, 5000, 500),
    (1, 2, 25, 5),
    (1, 3, 2000, 200),
    (1, 4, 100, 10),
    (1, 5, 50, 5);

INSERT INTO firmalar (firma_kodu, firma_adi, vergi_no, yetkili_kisi, telefon) VALUES
    ('FRM-001', 'ABC Elektrik Ltd.', '1234567890', 'Ahmet Yılmaz', '0532 111 2233'),
    ('FRM-002', 'XYZ Mekanik A.Ş.', '0987654321', 'Mehmet Kaya', '0533 444 5566'),
    ('FRM-003', 'Delta İnşaat', '1122334455', 'Ali Demir', '0534 777 8899');

INSERT INTO projeler (proje_kodu, proje_adi, lokasyon, baslangic_tarihi, durum) VALUES
    ('PRJ-2024-001', 'Merkez Ofis Elektrik Tesisatı', 'İstanbul', '2024-01-15', 'devam'),
    ('PRJ-2024-002', 'Fabrika Mekanik Hat', 'Kocaeli', '2024-03-01', 'devam'),
    ('PRJ-2024-003', 'Depo İnşaatı', 'Ankara', '2024-06-01', 'planlama');

INSERT INTO proje_firmalar (proje_id, firma_id, sozlesme_no, sozlesme_tutari, baslangic_tarihi, durum) VALUES
    (1, 1, 'SZL-2024-001', 1500000, '2024-01-15', 'aktif'),
    (2, 2, 'SZL-2024-002', 2800000, '2024-03-01', 'aktif'),
    (3, 3, 'SZL-2024-003', 5000000, '2024-06-01', 'aktif');

INSERT INTO proje_kesifleri (proje_id, firma_id, malzeme_id, kesif_miktari, limit_miktari, birim_fiyat) VALUES
    (1, 1, 1, 3000, 3500, 12.50),
    (1, 1, 2, 10, 12, 8500.00),
    (2, 2, 3, 1500, 1800, 8.00),
    (2, 2, 4, 50, 60, 450.00),
    (3, 3, 5, 30, 35, 25000.00);

INSERT INTO teminatlar (firma_id, proje_id, teminat_turu, teminat_no, tutar, baslangic_tarihi, bitis_tarihi, durum) VALUES
    (1, 1, 'banka_teminati', 'BT-2024-001', 150000, '2024-01-15', '2025-01-15', 'aktif'),
    (2, 2, 'banka_teminati', 'BT-2024-002', 280000, '2024-03-01', '2025-03-01', 'aktif'),
    (3, 3, 'cek', 'CK-2024-001', 500000, '2024-06-01', '2024-12-01', 'aktif');

-- Örnek malzeme işlemleri
INSERT INTO malzeme_islemleri (islem_no, islem_tipi, malzeme_id, miktar, birim, depo_id, firma_id, proje_id, belge_no, aciklama) VALUES
    ('ISL-2024-0001', 'firma_cikis', 1, 1000, 'metre', 1, 1, 1, 'IRS-001', 'Firmaya kablo teslimi'),
    ('ISL-2024-0002', 'firma_cikis', 2, 5, 'adet', 1, 1, 1, 'IRS-002', 'Firmaya pano teslimi'),
    ('ISL-2024-0003', 'saha_harcama', 1, 800, 'metre', NULL, 1, 1, 'SH-001', 'Saha montajı - 1. kat'),
    ('ISL-2024-0004', 'firma_iade', 1, 50, 'metre', 1, 1, 1, 'IAD-001', 'Kullanılmayan kablo iadesi'),
    ('ISL-2024-0005', 'firma_cikis', 3, 500, 'metre', 1, 2, 2, 'IRS-003', 'PVC boru teslimi'),
    ('ISL-2024-0006', 'saha_harcama', 3, 400, 'metre', NULL, 2, 2, 'SH-002', 'Hat montajı');
