# Xiaomi Mi Max 2 — Güvenli Mi Unlock Teşhis Ajanı

Salt okunur teşhis aracı. **Flash, erase, unlock, EDL veya bypass yapmaz.**

Hedef cihaz: Xiaomi Mi Max 2 (codename: `oxygen`).

## Ne yapar?

1. Android Platform Tools (`fastboot`) ve Xiaomi/Android USB sürücü ipuçlarını kontrol eder.
2. Yalnızca şu komutları çalıştırır:
   - `fastboot devices`
   - `fastboot --version`
   - `fastboot getvar product|unlocked|secure|anti|current-slot`
   - `fastboot oem device-info`
3. Desteklenmeyen komutları loglar, teşhisi durdurmaz.
4. Ürün kodunu bilinen Mi Max 2 kodlarıyla karşılaştırır (eşleşme yoksa tahmin etmez).
5. ROM bölgesini yalnızca cihazdan güvenilir okunursa yazar (fastboot’ta genelde yoktur).
6. Mi Unlock hata mesajını kategorilere ayırır.
7. Her adımı tarih/saat damgalı log dosyasına yazar.
8. Seri / IMEI benzeri kimliklerde yalnızca son 4 karakteri gösterir.
9. Mi Unlock’u yalnızca `-LaunchMiUnlock` açık onayıyla başlatır.

## Windows’ta çalıştırma

```powershell
cd xiaomi-unlock-diagnose
powershell -ExecutionPolicy Bypass -File .\Diagnose-MiUnlock.ps1
```

Hata mesajıyla:

```powershell
powershell -ExecutionPolicy Bypass -File .\Diagnose-MiUnlock.ps1 `
  -MiUnlockErrorMessage "Couldn't verify device, please wait 168 hours"
```

Telefon açılabiliyorsa kontrol listesini rapora eklemek için:

```powershell
powershell -ExecutionPolicy Bypass -File .\Diagnose-MiUnlock.ps1 -AssumeBootable
```

Yalnızca hata sınıflandırma:

```powershell
powershell -ExecutionPolicy Bypass -File .\Classify-MiUnlockError.ps1 `
  -Message "account not bound to device"
```

## Çıktılar

- `logs/diagnose-*.log` — adım adım teşhis günlüğü
- `reports/report-*.md` — özet rapor (algılama, product, unlocked, secure, engel, kanıt, sonraki adım)

## Güvenlik

Ayrıntılar: [`YASAKLAR.md`](YASAKLAR.md)  
Açılabilir telefon kontrol listesi: [`KONTROL-LISTESI.md`](KONTROL-LISTESI.md)
