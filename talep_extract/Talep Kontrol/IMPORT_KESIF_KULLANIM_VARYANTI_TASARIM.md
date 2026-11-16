# Şablon Merkezi – Malzeme talep ve revize keşif (tasarım, henüz geliştirilmedi)

Kurumun asıl Excel talep/revize keşif şablonları kullanıcı tarafından sağlandığında mevcut görünümleri esas alınacaktır; bu dosya yeni şablon düzeni uydurmaz.

## Import sözleşmesi (öneri)

- Şablon türü / sürümü (`FORM_TYPE`, `FORM_VERSION`), kayıt kapsamı (depo, iş türü, proje, sözleşme, yüklenici), belge ID, belge revizyonu, satır ID, malzeme kodu metin olarak, miktar, birim, kullanım varyantı ID, not.
- İlk adım **yerelde** şema, tür, referans ve kaynak sürümü doğrulaması; çift satır ve belirsiz kimlikler hata.
- Mevcut onaylı sürümle karşılaştırma: EKLENDİ, MİKTAR DEĞİŞTİ, TANIM/KULLANIM DEĞİŞTİ, İPTAL TALEBİ, DEĞİŞMEDİ, ÇAKIŞMA.
- Import şablonunda satırın bulunmaması tek başına silme sayılmaz; silme/iptal açık işlem ve onay gerektirir.
- Sonuç kullanıcıya **önizleme**; kesin revizyon ancak merkezi güvenli kuyruğa teslim, yetki, bağımlılık ve onaydan sonra yayınlanır.
- Aynı dosyanın tekrar import edilmesi `Import ID + kaynak hash + form revizyon kimliği` ile tespit edilir; mükerrer kesinleşme engellenir.
- Orijinal kaynak ve önceki keşif sürümü değişmez; yeni revizyon öncekinin yerine geçer, eskiyi toplamaz.

## Aynı SAP kodunun farklı kullanım yeri

**SAP malzeme kodu değişmez.** Malzeme ana kimliği ile kullanım varyantı ayrı alanlardır:

- `MalzemeKodu`: SAP kodu (örneğin aynı hücre).
- `KullanimVaryantiID`: yetkili sözlükte tanımlı ayrı ID (ör. PALET_USTU, KOSK_ICI).
- `GenelMalzemeNotu`: SAP malzeme ana tanımına bağlı açıklama.
- `VaryantTeknikNotu`: belirli kullanım türüne ait teknik not.
- `KesifSatirNotu`: yalnız proje/keşif/satır bağlamına ait açıklama.

Keşif tarafında kapsam kimliği, iş türüne göre ilgili depo/proje + malzeme kodu + `KullanimVaryantiID` + kalıcı satır ID ile sürümlenir. Keşif miktarları varyanta göre ayrı kalır; SAP fiziksel stok/MB51 malzeme kodu bazında birleştirilebilir, ama kullanım varyantına fiili dağılım **kanıt olmadan tahmin edilmez**. Kullanım varyantı belirtilmeyen eski satırlar `BELIRTILMEMIS` olarak korunur; otomatik palet/köşk sınıflaması yapılamaz.

Bu tasarım henüz uygulama koduna eklenmedi. Kullanıcının gerçek formları geldikten sonra alanlar, eşleştirme ve testler kesinleştirilir.
