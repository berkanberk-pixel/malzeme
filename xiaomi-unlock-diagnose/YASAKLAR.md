# Yasaklı yöntemler ve komutlar

Bu teşhis ajanı **yalnızca salt okunur** çalışır. Aşağıdakiler araştırılmaz, önerilmez ve çalıştırılmaz.

## Yasaklı yöntemler
- Mi hesap bypass
- FRP bypass
- Xiaomi auth bypass
- Exploit veya CVE tarama
- EDL auth bypass
- Test point ile yetkilendirme aşma
- Patched firehose veya programmer
- Sızdırılmış servis hesabı
- Brute force
- Token, sertifika veya kimlik bilgisi ele geçirme
- Üçüncü taraf crack aracı

## Yasaklı fastboot komutları
- `fastboot erase`
- `fastboot format`
- `fastboot flash`
- `fastboot update`
- `fastboot flashall`
- `fastboot oem unlock`
- `fastboot flashing unlock`
- `fastboot flashing unlock_critical`
- `fastboot reboot-edl`
- `fastboot set_active`

## İzin verilen komutlar
- `fastboot devices`
- `fastboot --version`
- `fastboot getvar product`
- `fastboot getvar unlocked`
- `fastboot getvar secure`
- `fastboot getvar anti`
- `fastboot getvar current-slot`
- `fastboot oem device-info`

Desteklenmeyen komut hata verirse işlem durdurulmaz; log ve rapora yazılır.
