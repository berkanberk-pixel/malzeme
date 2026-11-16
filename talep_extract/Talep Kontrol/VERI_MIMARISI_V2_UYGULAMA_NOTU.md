# Veri Mimarisi v2 Uygulama Notu

Bu paket, onaylı V3.13.0 Talep Kontrol ve Karar Destek uygulamasını koruyarak Veri Mimarisi v2 altyapısını ekler.

## Eklenenler
- `data_v2/00_INBOX ... 08_BACKUP` yaşam döngüsü klasörleri (pakette hazır; eksikler ilk çalıştırmada da tamamlanır)
- SQLite metadata/audit kataloğu (`data_v2/07_AUDIT/data_architecture.sqlite`)
- Veri Merkezi ekranı: Sistem Sağlığı, Kaynak Güncelliği, Snapshot Geçmişi, Arşiv, Aksiyon Takibi, Raporlar
- Kaynak güncellik eşikleri: ZMM098=4 saat; ZMM048/MB51/MB52/keşif=24 saat
- Saklama politikası metadata tanımları
- `parquet/ACTIVE` ve `cache/` çalışma katmanı: ilk başarılı indeks derlemesinde oluşur; mevcut snapshot’lar v2 kataloğuna otomatik tanıtılır

## Korunanlar
- Mevcut Karar Destek arayüzü ve kontrol akışı
- 127.0.0.1:8765 servis yapısı
- `VERI_KLASORU.txt`, `KAYIT_KLASORU.txt`, içerik tabanlı kaynak tanıma
- Mevcut CSV / Parquet veri motoru ve kontrol geçmişi

## Kapsam
Bu paket bağımsız Talep Kontrol Verileri koludur. MPYP içindeki Talep Kontrol modülüyle otomatik olarak birleştirilmemiştir.
