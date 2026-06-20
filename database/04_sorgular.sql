-- ============================================================
-- ADIM 4: BAKİYE VE RAPOR SORGULARI
-- Database2.accdb - Stok Takip Sistemi
-- Access'te: Oluştur > Sorgu Tasarımı > SQL Görünümü
-- ============================================================

-- ------------------------------------------------------------
-- QRY_Depo_Bakiye
-- İl depo bazlı anlık stok bakiyesi
-- ------------------------------------------------------------
SELECT
    D.UY AS Il_Kodu,
    U.Uretim_Yeri_Tanimi AS Il_Adi,
    H.Kaynak_Depo_ID AS Depo_ID,
    D.Depo_Yeri_Tanimi AS Depo_Adi,
    H.Malzeme_Kodu,
    M.Malzmeme_Tanimi AS Malzeme_Adi,
    M.Birim,
    Sum(IIf(H.Hareket_Tipi IN ('GIRIS','IADE'), H.Miktar, 0)) AS Toplam_Giris,
    Sum(IIf(H.Hareket_Tipi IN ('CIKIS','HARCAMA'), H.Miktar, 0)) AS Toplam_Cikis,
    Sum(IIf(H.Hareket_Tipi='NAKIL' AND H.Kaynak_Depo_ID=D.ID, H.Miktar, 0)) AS Nakil_Cikan,
    Sum(IIf(H.Hareket_Tipi='NAKIL' AND H.Hedef_Depo_ID=D.ID, H.Miktar, 0)) AS Nakil_Giren,
    Sum(IIf(H.Hareket_Tipi IN ('GIRIS','IADE'), H.Miktar, 0))
      - Sum(IIf(H.Hareket_Tipi IN ('CIKIS','HARCAMA'), H.Miktar, 0))
      - Sum(IIf(H.Hareket_Tipi='NAKIL' AND H.Kaynak_Depo_ID=D.ID, H.Miktar, 0))
      + Sum(IIf(H.Hareket_Tipi='NAKIL' AND H.Hedef_Depo_ID=D.ID, H.Miktar, 0)) AS Bakiye
FROM
    ((TB_Stok_Hareket AS H
    INNER JOIN TB_Depo_Kodlari AS D
        ON H.Kaynak_Depo_ID = D.ID OR H.Hedef_Depo_ID = D.ID)
    LEFT JOIN TB_Malzeme AS M
        ON H.Malzeme_Kodu = M.Malzeme_Kodu)
    LEFT JOIN TB_Uretim_Yeri AS U
        ON D.UY = U.Uretim_Yeri
GROUP BY
    D.UY, U.Uretim_Yeri_Tanimi,
    H.Kaynak_Depo_ID, D.Depo_Yeri_Tanimi,
    H.Malzeme_Kodu, M.Malzmeme_Tanimi, M.Birim, D.ID
HAVING
    Sum(IIf(H.Hareket_Tipi IN ('GIRIS','IADE'), H.Miktar, 0))
      - Sum(IIf(H.Hareket_Tipi IN ('CIKIS','HARCAMA'), H.Miktar, 0))
      - Sum(IIf(H.Hareket_Tipi='NAKIL' AND H.Kaynak_Depo_ID=D.ID, H.Miktar, 0))
      + Sum(IIf(H.Hareket_Tipi='NAKIL' AND H.Hedef_Depo_ID=D.ID, H.Miktar, 0)) <> 0;


-- ------------------------------------------------------------
-- QRY_Proje_Harcama
-- Proje bazlı malzeme tüketim özeti
-- ------------------------------------------------------------
SELECT
    H.Proje_Kod,
    P.IS_listesi AS Proje_Adi,
    PD.Il_Kodu,
    U.Uretim_Yeri_Tanimi AS Il_Adi,
    H.Malzeme_Kodu,
    M.Malzmeme_Tanimi AS Malzeme_Adi,
    M.Birim,
    Sum(H.Miktar) AS Toplam_Harcama,
    Count(H.HareketID) AS Hareket_Sayisi,
    Min(H.Tarih) AS Ilk_Harcama,
    Max(H.Tarih) AS Son_Harcama
FROM
    (((TB_Stok_Hareket AS H
    INNER JOIN TB_Proje_Listesi AS P
        ON H.Proje_Kod = P.IS_Kod)
    LEFT JOIN TB_Malzeme AS M
        ON H.Malzeme_Kodu = M.Malzeme_Kodu)
    LEFT JOIN TB_Proje_Depo AS PD
        ON H.Proje_Kod = PD.Proje_Kod)
    LEFT JOIN TB_Uretim_Yeri AS U
        ON PD.Il_Kodu = U.Uretim_Yeri
WHERE
    H.Hareket_Tipi = 'HARCAMA'
GROUP BY
    H.Proje_Kod, P.IS_listesi, PD.Il_Kodu,
    U.Uretim_Yeri_Tanimi, H.Malzeme_Kodu,
    M.Malzmeme_Tanimi, M.Birim;


-- ------------------------------------------------------------
-- QRY_Nakil_Ozeti
-- Depolar arası transfer listesi
-- ------------------------------------------------------------
SELECT
    H.HareketID,
    H.Tarih,
    H.Belge_No,
    H.Kaynak_Depo_ID,
    DK.Depo_Yeri_Tanimi AS Kaynak_Depo_Adi,
    UK.Uretim_Yeri_Tanimi AS Kaynak_Il,
    H.Hedef_Depo_ID,
    DH.Depo_Yeri_Tanimi AS Hedef_Depo_Adi,
    UH.Uretim_Yeri_Tanimi AS Hedef_Il,
    H.Malzeme_Kodu,
    M.Malzmeme_Tanimi AS Malzeme_Adi,
    H.Miktar,
    H.Birim,
    H.Aciklama,
    H.Kullanici
FROM
    ((((TB_Stok_Hareket AS H
    LEFT JOIN TB_Depo_Kodlari AS DK
        ON H.Kaynak_Depo_ID = DK.ID)
    LEFT JOIN TB_Uretim_Yeri AS UK
        ON DK.UY = UK.Uretim_Yeri)
    LEFT JOIN TB_Depo_Kodlari AS DH
        ON H.Hedef_Depo_ID = DH.ID)
    LEFT JOIN TB_Uretim_Yeri AS UH
        ON DH.UY = UH.Uretim_Yeri)
    LEFT JOIN TB_Malzeme AS M
        ON H.Malzeme_Kodu = M.Malzeme_Kodu
WHERE
    H.Hareket_Tipi = 'NAKIL'
ORDER BY
    H.Tarih DESC;


-- ------------------------------------------------------------
-- QRY_Hareket_Dokumu
-- Tüm hareketlerin detaylı dökümü (audit trail)
-- Parametre: [Tarih_Baslangic], [Tarih_Bitis], [Il_Kodu] (opsiyonel)
-- ------------------------------------------------------------
SELECT
    H.HareketID,
    H.Tarih,
    H.Hareket_Tipi,
    HT.Tanim AS Hareket_Tanimi,
    H.Malzeme_Kodu,
    M.Malzmeme_Tanimi AS Malzeme_Adi,
    H.Miktar,
    H.Birim,
    H.Kaynak_Depo_ID,
    DK.Depo_Yeri_Tanimi AS Kaynak_Depo,
    H.Hedef_Depo_ID,
    DH.Depo_Yeri_Tanimi AS Hedef_Depo,
    H.Proje_Kod,
    P.IS_listesi AS Proje_Adi,
    H.Belge_No,
    H.Aciklama,
    H.Kullanici,
    H.Onay_Durumu,
    H.Kayit_Tarihi
FROM
    (((((TB_Stok_Hareket AS H
    LEFT JOIN TB_Hareket_Tipi AS HT
        ON H.Hareket_Tipi = HT.Hareket_Tipi)
    LEFT JOIN TB_Malzeme AS M
        ON H.Malzeme_Kodu = M.Malzeme_Kodu)
    LEFT JOIN TB_Depo_Kodlari AS DK
        ON H.Kaynak_Depo_ID = DK.ID)
    LEFT JOIN TB_Depo_Kodlari AS DH
        ON H.Hedef_Depo_ID = DH.ID)
    LEFT JOIN TB_Proje_Listesi AS P
        ON H.Proje_Kod = P.IS_Kod)
WHERE
    H.Tarih >= [Tarih_Baslangic]
    AND H.Tarih <= [Tarih_Bitis]
ORDER BY
    H.Tarih DESC, H.HareketID DESC;


-- ------------------------------------------------------------
-- QRY_Il_Bakiye_Ozet
-- İl bazlı toplam stok özeti (yönetici raporu)
-- ------------------------------------------------------------
SELECT
    D.UY AS Il_Kodu,
    U.Uretim_Yeri_Tanimi AS Il_Adi,
    Count(DISTINCT H.Malzeme_Kodu) AS Malzeme_Cesidi,
    Count(H.HareketID) AS Toplam_Hareket,
    Sum(IIf(H.Hareket_Tipi IN ('GIRIS','IADE'), H.Miktar, 0)) AS Toplam_Giris,
    Sum(IIf(H.Hareket_Tipi IN ('CIKIS','HARCAMA'), H.Miktar, 0)) AS Toplam_Cikis
FROM
    ((TB_Stok_Hareket AS H
    INNER JOIN TB_Depo_Kodlari AS D
        ON H.Kaynak_Depo_ID = D.ID OR H.Hedef_Depo_ID = D.ID)
    LEFT JOIN TB_Uretim_Yeri AS U
        ON D.UY = U.Uretim_Yeri)
GROUP BY
    D.UY, U.Uretim_Yeri_Tanimi
ORDER BY
    D.UY;


-- ------------------------------------------------------------
-- QRY_Negatif_Stok
-- Negatif bakiyeli malzemeler (uyarı raporu)
-- ------------------------------------------------------------
SELECT
    D.UY AS Il_Kodu,
    U.Uretim_Yeri_Tanimi AS Il_Adi,
    D.ID AS Depo_ID,
    D.Depo_Yeri_Tanimi AS Depo_Adi,
    H.Malzeme_Kodu,
    M.Malzmeme_Tanimi AS Malzeme_Adi,
    Sum(IIf(H.Hareket_Tipi IN ('GIRIS','IADE'), H.Miktar, 0))
      - Sum(IIf(H.Hareket_Tipi IN ('CIKIS','HARCAMA'), H.Miktar, 0))
      - Sum(IIf(H.Hareket_Tipi='NAKIL' AND H.Kaynak_Depo_ID=D.ID, H.Miktar, 0))
      + Sum(IIf(H.Hareket_Tipi='NAKIL' AND H.Hedef_Depo_ID=D.ID, H.Miktar, 0)) AS Bakiye
FROM
    ((TB_Stok_Hareket AS H
    INNER JOIN TB_Depo_Kodlari AS D
        ON H.Kaynak_Depo_ID = D.ID OR H.Hedef_Depo_ID = D.ID)
    LEFT JOIN TB_Malzeme AS M
        ON H.Malzeme_Kodu = M.Malzeme_Kodu)
    LEFT JOIN TB_Uretim_Yeri AS U
        ON D.UY = U.Uretim_Yeri
GROUP BY
    D.UY, U.Uretim_Yeri_Tanimi, D.ID, D.Depo_Yeri_Tanimi,
    H.Malzeme_Kodu, M.Malzmeme_Tanimi
HAVING
    Sum(IIf(H.Hareket_Tipi IN ('GIRIS','IADE'), H.Miktar, 0))
      - Sum(IIf(H.Hareket_Tipi IN ('CIKIS','HARCAMA'), H.Miktar, 0))
      - Sum(IIf(H.Hareket_Tipi='NAKIL' AND H.Kaynak_Depo_ID=D.ID, H.Miktar, 0))
      + Sum(IIf(H.Hareket_Tipi='NAKIL' AND H.Hedef_Depo_ID=D.ID, H.Miktar, 0)) < 0;
