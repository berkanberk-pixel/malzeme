V3.13.0 paket içi CSV veri seti / yedek kökü

Bu klasör giriş/kaynak verisidir. Uygulamanın büyük veri çalışma katmanı JSON değildir.
Akış: CSV -> Parquet + yerel SQLite indeks -> sayfalı/filtreli ekran sorgusu.

strict_external_sources=false iken kurumsal ağ klasörü erişilemezse bu klasör yedek kaynak olarak taranır.

Operasyonel kaynaklar (kurumsal paylaşım veya bu klasöre kopyalanır):
- ZMM048.csv
- ZMM098.csv
- MB51.csv
- MB52.csv
- Tesis_Verileri.csv
- KET_Verileri.csv
- BAKIM_Verileri.csv
- LED_Verileri.csv

Master kaynaklar (pakette başlık şablonları bulunur):
- SITE_MALZEMELER.csv
- TB_Depo_Kodlari.csv
- SITE_PROJELER.csv
- TB_Islem_Turu.csv
- TB_Tedas_Kod.csv

Çalışma katmanı (ilk başarılı derlemede oluşur):
- parquet/ACTIVE
- cache/talep_index.sqlite

Kaynak CSV değişmediği sürece paket açılışında yeniden oluşturma yapılmaz.

Muafiyet ayar dosyası:
- MUAF_LISTESI.csv (Keşif / Teminat muafiyetleri; veri kaynağı taramasına dahil edilmez)
