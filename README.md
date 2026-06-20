# malzeme

YEDAŞ bölge dağıtım şirketi malzeme stok takip sistemi.

## Veritabanı

`Database2.accdb` — Access referans veritabanı (il depoları, malzemeler, projeler, TEDAŞ kodları).

## Stok Takip Implementasyonu

`database/` klasöründe stok hareketi, harcama ve nakil takibi için SQL, VBA ve sorgu dosyaları bulunur.

Kurulum için: [database/KURULUM.md](database/KURULUM.md)

### Adımlar

1. `01_tablolar.sql` — TB_Stok_Hareket, TB_Proje_Depo, TB_Hareket_Tipi tabloları
2. `01b_mevcut_tablo_guncellemeleri.sql` — Mevcut tablolara ek alanlar
3. `02_iliskiler.md` — İlişki diyagramı ve kurulum
4. `03_formlar_vba.bas` — Giriş, nakil, harcama form VBA kodları
5. `04_sorgular.sql` — Bakiye ve rapor sorguları
