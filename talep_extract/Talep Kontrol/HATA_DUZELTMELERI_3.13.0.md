# Talep Kontrol 3.13.0 — Hata Düzeltmeleri (2026-11-16)

## Düzeltilenler

1. **Sürüm birleştirildi:** `config.json`, `server.py`, UI, kayıt CSV, kurulum ve kurallar artık **3.13.0** / `20261116-v3.13.0-error-fixes`.
2. **Kesin kayıt açıldı:** `shared_writes_enabled=true` — “Kontrolü Onayla ve Kaydet” çalışır.
3. **Paket CSV yedeği:** `strict_external_sources=false` — ağ yoksa paket `csv/` taranır; Ayarlar metni bayrağa göre güncellenir.
4. **Klasör değiştirme:** `enforce_source_root` / `enforce_shared_record_root` kapatıldı; kilit yeniden açılırsa butonlar UI’de “Kilitli” olur.
5. **Eski servis yanlış uyarısı:** Ayarlar artık beklenen sürümü `APP_VERSION` ile karşılaştırır (sabit `1.0.0` değil).
6. **`source_subfolders`:** Strict modda klasör adları `config.json` üzerinden okunur.
7. **Offline Python ZIP adı:** `_runtime_packages/README.txt` → `python-3.13.17-embed-*.zip`.
8. **`data_v2` yaşam döngüsü:** 00–08 klasörleri pakete eklendi; `parquet/` ve `cache/` yer tutucuları eklendi.
9. **Master CSV şablonları:** `TB_Depo_Kodlari.csv` ve diğer master başlık dosyaları eklendi.
10. **Kaynak Durumu paneli:** `#dataHealth`, `#fixedRoots`, `#sourceCards`, `#diagnostics` HTML’e geri alındı.
11. **Launcher:** Uyumsuz eski Talep Kontrol servisleri portları serbest bırakır.
12. **`KLASOR_KONTROL.bat`:** UNC yolları `pushd` ile güvenli kontrol edilir.
13. **`__pycache__`:** Linux bytecode paketten çıkarıldı.

## Dağıtım notu

Kurumsal kilidi yeniden açmak için `config.json` içinde:
- `enforce_source_root: true`
- `enforce_shared_record_root: true`
- isteğe bağlı `strict_external_sources: true`
- isteğe bağlı `shared_writes_enabled: false`
