function Invoke-MiUnlockErrorClassify {
    param([string]$Msg)
    if ([string]::IsNullOrWhiteSpace($Msg)) {
        return [pscustomobject]@{ Category = "Belirtilmedi"; Reason = "Kullanıcı hata mesajı/kodu vermedi" }
    }
    $m = $Msg.ToLowerInvariant()

    if ($m -match 'wait|hour|saat|day|gün|72|168|binding|bind time|please wait|bekle') {
        return [pscustomobject]@{ Category = "Bekleme süresi devam ediyor"; Reason = $Msg }
    }
    if ($m -match 'not bound|not bind|eşleştir|eslestir|add account|account.*device|device.*account|86006|86012') {
        return [pscustomobject]@{ Category = "Hesap cihazla eşleştirilmemiş"; Reason = $Msg }
    }
    if ($m -match 'region|bölge|bolge|country|ülke|ulke|locale|server.*mismatch|place where the account is registered|place where the phone is sold|does not match the place|kilidi açılamadı|86005|\b200\b') {
        # Not: yalnız "200" belirsiz olabilir; ekran metniyle birlikte bölge uyuşmazlığı kabul edilir.
        return [pscustomobject]@{ Category = "Hesap veya cihaz bölgesi uyuşmuyor"; Reason = $Msg }
    }
    if ($m -match 'sim|mobile data|mobil veri|network|find device|couldn.?t verify|verify.*phone|86015|86016') {
        return [pscustomobject]@{ Category = "SIM veya mobil veri doğrulaması başarısız"; Reason = $Msg }
    }
    if ($m -match 'usb|driver|sürücü|surucu|device not found|no device|cannot find|timeout.*usb|interface') {
        return [pscustomobject]@{ Category = "USB sürücüsü sorunu"; Reason = $Msg }
    }
    if ($m -match 'not login|login|sign in|mi account|mi hesab|cloud.*lock|find my device|86001') {
        return [pscustomobject]@{ Category = "Cihaz Mi hesabına bağlı değil"; Reason = $Msg }
    }
    if ($m -match 'not allowed|forbidden|denied|unauthorized|server|permission|86031|86017|current account.*unlocked') {
        return [pscustomobject]@{ Category = "Xiaomi sunucusu cihaz için kilit açmaya izin vermiyor"; Reason = $Msg }
    }

    return [pscustomobject]@{
        Category = "Sınıflandırılamadı — kullanıcı mesajını netleştirin"
        Reason = $Msg
    }
}
