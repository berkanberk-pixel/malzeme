# Talep Kontrol Veri Yaşam Döngüsü — v2.0

00_INBOX → 01_RAW → 02_STANDARD → 03_ACTIVE → 04_HISTORY → 05_ARCHIVE

Hatalı/şüpheli veri: 06_QUARANTINE
Denetim/metadata: 07_AUDIT
Yedek: 08_BACKUP

Bu klasörler pakette hazır gelir. Eksik bir katman varsa `DataArchitectureV2.ensure_layout()` ilk çalıştırmada tamamlar.

Kurallar:
- RAW süresiz ve değişmezdir.
- Her kaynakta aynı anda tek ACTIVE snapshot vardır.
- Yeni sağlıklı ACTIVE, önceki ACTIVE'i HISTORY'ye geçirir.
- Fiziksel silme yapılmaz.
- Büyük operasyonel veri Parquet + Snappy; metadata/audit SQLite kullanır.
- ZMM098 güncellik limiti 4 saat; ZMM048/MB51/MB52/keşif 24 saattir.

FIX5 uygulama sertleştirmesi:
- Kaynak snapshot ile kullanılan indeks build ayrı izlenir.
- ACTIVE indeks geçişi `cache/ACTIVE_BUILD.json` pointer'ı ile atomiktir.
- CRITICAL kalite bulgusunda yeni build ACTIVE olmaz.
- ACTIVE bütünlük günlük, HISTORY haftalık, ARCHIVE aylık SHA-256 ile doğrulanır.
- QUARANTINE yeniden işleme eski kaydı silmeden yeni INBOX girdisi oluşturur.
- Kontrol kayıtları Ruleset sürümü/hash'i, kaynak snapshot ID'leri ve index build ID ile izlenebilir.
