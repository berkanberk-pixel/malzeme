# Talep Kontrol 3.13.0

Uygulamayı `Talep Kontrol.vbs` (veya `BASLAT.bat`) ile başlatın. Hata düzeltme özeti: `HATA_DUZELTMELERI_3.13.0.md`. Açılış penceresi ekranın ortasında küçük ve kenarlıksızdır. Logo altında yavaş, yumuşak üç nokta animasyonu gösterilir. Ana uygulama hazır olduğunda, görev çubuğunu kapatmayan normal boyutlu çalışma penceresi açılır.

Windows'un standart başlık çubuğu yoktur. Bunun yerine uygulamanın üst kısmında simge durumuna küçült, büyüt / önceki boyuta getir ve kapat düğmeleri bulunur. Üst çubuk sürüklenerek pencere taşınabilir; kenar veya köşelerinden boyutu değiştirilebilir. Uygulama açılışta tam ekran yapılmaz. **Alt+F4** ile de kapatılabilir. Uygulama yalnızca kendi başlattığı yerel servisi kapatır; diğer Python işlemlerine müdahale etmez.

## Açılış hatası

Hata günlüğünüzde yerel Python servisinin başarıyla başlatıldığı, ancak WebView2'nin `0x80070005 (E_ACCESSDENIED)` ile açılmadığı görülüyor. WebView2 kullanıcı verileri artık Windows'un korumalı PowerShell klasörü yerine `%LOCALAPPDATA%\TalepKontrol\WebView2UserData` altında tutulur. Bu klasör ilk açılışta oluşturulur ve yazılabilirliği test edilir.

Bu işlem yalnızca WebView2 veri dizininin izin sorununu hedefler. Kurumsal uç nokta koruması WebView2'yi engelliyorsa BT onayı gerekir; güvenlik kısıtları aşılmaya çalışılmaz. Sorun sürerse, yeni logun en son bölümünü paylaşın.

## Notlar

- Kaynak CSV/Excel dosyalarının ve ağdaki `0-Database` klasörünün konumları değiştirilmedi.
- Bu paket yalnızca uygulama dosyalarını içerir; NSIS veya diğer kurulum projeleri bulunmaz.
- Gerçek Windows bilgisayarında GUI açılışı, WebView2 başlatma ve kapanış kontrolü ayrıca doğrulanmalıdır.

## Menü yerleşimi

Pencere genişlediğinde veya daraldığında soldaki menü için gereken alan korunur; içerik panelinin üzerine binmez. Çok dar pencerelerde menü açılır/kapanır. Geniş tablolar kendi yatay kaydırma alanını kullanır.
