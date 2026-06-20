-- ============================================================
-- ADIM 1B: MEVCUT TABLOLARA EK ALANLAR
-- TB_Malzeme tablosuna eksik alanları ekler
-- ============================================================

-- Malzeme tablosuna Birim alanı
ALTER TABLE TB_Malzeme ADD COLUMN Birim TEXT(10);

-- Malzeme tablosuna Mal_Grubu alanı
ALTER TABLE TB_Malzeme ADD COLUMN Mal_Grubu TEXT(10);

-- Malzeme tablosuna TDS_Kod alanı (TEDAŞ kodu eşleşmesi)
ALTER TABLE TB_Malzeme ADD COLUMN TDS_Kod TEXT(20);

-- Malzeme aktif/pasif durumu
ALTER TABLE TB_Malzeme ADD COLUMN Aktif YESNO DEFAULT True;

-- Proje listesine il kodu (hangi ilde yapılıyor)
ALTER TABLE TB_Proje_Listesi ADD COLUMN Il_Kodu TEXT(10);

-- Proje listesine durum
ALTER TABLE TB_Proje_Listesi ADD COLUMN Durum TEXT(20) DEFAULT 'AKTIF';
-- AKTIF | TAMAMLANDI | IPTAL

-- Proje listesine başlangıç/bitiş tarihi
ALTER TABLE TB_Proje_Listesi ADD COLUMN Baslangic_Tarihi DATETIME;
ALTER TABLE TB_Proje_Listesi ADD COLUMN Bitis_Tarihi DATETIME;

-- Depo kodlarına proje bağlantısı (proje deposu ise)
ALTER TABLE TB_Depo_Kodlari ADD COLUMN Proje_Kod TEXT(20);
