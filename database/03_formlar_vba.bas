' ============================================================
' ADIM 3: FORM VBA MODÜLLERİ
' Database2.accdb - Stok Takip Sistemi
'
' Kurulum:
'   1. Access'te Alt+F11 ile VBA editörünü açın
'   2. Ekle > Modül
'   3. Bu dosyadaki kodları modüllere yapıştırın
'   4. modStokIslemleri, modBakiyeKontrol, modNakilIslemleri olarak kaydedin
' ============================================================

' ============================================================
' MODÜL: modStokIslemleri
' Genel stok işlem fonksiyonları
' ============================================================

Option Compare Database
Option Explicit

' --- Bakiye sorgulama ---
Public Function BakiyeGetir(malzemeKodu As String, depoID As String, _
                            Optional projeKod As String = "") As Double
    Dim rs As DAO.Recordset
    Dim sql As String
    Dim bakiye As Double
    
    sql = "SELECT " & _
          "Nz(Sum(IIf(Hareket_Tipi IN ('GIRIS','IADE'), Miktar, 0)), 0) AS Giris, " & _
          "Nz(Sum(IIf(Hareket_Tipi IN ('CIKIS','HARCAMA'), Miktar, 0)), 0) AS Cikis, " & _
          "Nz(Sum(IIf(Hareket_Tipi='NAKIL' AND Kaynak_Depo_ID='" & depoID & "', Miktar, 0)), 0) AS Nakil_Cikan, " & _
          "Nz(Sum(IIf(Hareket_Tipi='NAKIL' AND Hedef_Depo_ID='" & depoID & "', Miktar, 0)), 0) AS Nakil_Giren " & _
          "FROM TB_Stok_Hareket " & _
          "WHERE Malzeme_Kodu='" & malzemeKodu & "' " & _
          "AND (Kaynak_Depo_ID='" & depoID & "' OR Hedef_Depo_ID='" & depoID & "')"
    
    If projeKod <> "" Then
        sql = sql & " AND Proje_Kod='" & projeKod & "'"
    End If
    
    Set rs = CurrentDb.OpenRecordset(sql, dbOpenSnapshot)
    
    If Not rs.EOF Then
        bakiye = rs!Giris + rs!Nakil_Giren - rs!Cikis - rs!Nakil_Cikan
    Else
        bakiye = 0
    End If
    
    rs.Close
    Set rs = Nothing
    BakiyeGetir = bakiye
End Function

' --- Negatif stok kontrolü ---
Public Function StokYeterliMi(malzemeKodu As String, depoID As String, _
                               miktar As Double, Optional projeKod As String = "") As Boolean
    Dim mevcutBakiye As Double
    mevcutBakiye = BakiyeGetir(malzemeKodu, depoID, projeKod)
    StokYeterliMi = (mevcutBakiye >= miktar)
End Function

' --- Hareket kaydet ---
Public Function HareketKaydet(hareketTipi As String, malzemeKodu As String, _
                              miktar As Double, birim As String, _
                              kaynakDepo As String, hedefDepo As String, _
                              projeKod As String, belgeNo As String, _
                              aciklama As String) As Long
    Dim rs As DAO.Recordset
    Dim yeniID As Long
    
    ' Çıkış ve harcama için stok kontrolü
    If hareketTipi = "CIKIS" Or hareketTipi = "HARCAMA" Or hareketTipi = "NAKIL" Then
        If Not StokYeterliMi(malzemeKodu, kaynakDepo, miktar) Then
            MsgBox "Yetersiz stok! Mevcut bakiye: " & BakiyeGetir(malzemeKodu, kaynakDepo), vbExclamation
            HareketKaydet = 0
            Exit Function
        End If
    End If
    
    Set rs = CurrentDb.OpenRecordset("TB_Stok_Hareket", dbOpenDynaset)
    rs.AddNew
    rs!Tarih = Now()
    rs!Hareket_Tipi = hareketTipi
    rs!Malzeme_Kodu = malzemeKodu
    rs!Miktar = miktar
    rs!Birim = birim
    rs!Kaynak_Depo_ID = NullIfEmpty(kaynakDepo)
    rs!Hedef_Depo_ID = NullIfEmpty(hedefDepo)
    rs!Proje_Kod = NullIfEmpty(projeKod)
    rs!Belge_No = belgeNo
    rs!Aciklama = aciklama
    rs!Kullanici = Environ("USERNAME")
    rs!Kayit_Tarihi = Now()
    rs!Onay_Durumu = "ONAYLANDI"
    rs.Update
    
    yeniID = rs!HareketID
    rs.Close
    Set rs = Nothing
    
    HareketKaydet = yeniID
End Function

' --- Boş string'i Null'a çevir ---
Private Function NullIfEmpty(deger As String) As Variant
    If Trim(deger) = "" Then
        NullIfEmpty = Null
    Else
        NullIfEmpty = deger
    End If
End Function


' ============================================================
' MODÜL: modNakilIslemleri
' Depolar arası nakil işlemleri
' ============================================================

' --- Nakil işlemi: tek satır NAKIL kaydı ---
Public Function NakilYap(kaynakDepo As String, hedefDepo As String, _
                         malzemeKodu As String, miktar As Double, _
                         birim As String, belgeNo As String, _
                         aciklama As String) As Boolean
    
    If kaynakDepo = hedefDepo Then
        MsgBox "Kaynak ve hedef depo aynı olamaz!", vbExclamation
        NakilYap = False
        Exit Function
    End If
    
    If Not StokYeterliMi(malzemeKodu, kaynakDepo, miktar) Then
        MsgBox "Kaynak depoda yetersiz stok!", vbExclamation
        NakilYap = False
        Exit Function
    End If
    
    Dim hareketID As Long
    hareketID = HareketKaydet("NAKIL", malzemeKodu, miktar, birim, _
                              kaynakDepo, hedefDepo, "", belgeNo, aciklama)
    
    If hareketID > 0 Then
        MsgBox "Nakil başarılı. Hareket No: " & hareketID, vbInformation
        NakilYap = True
    Else
        NakilYap = False
    End If
End Function


' ============================================================
' MODÜL: modHarcamaIslemleri
' Proje bazlı harcama işlemleri
' ============================================================

' --- Proje harcaması ---
Public Function HarcamaYap(depoID As String, projeKod As String, _
                           malzemeKodu As String, miktar As Double, _
                           birim As String, belgeNo As String, _
                           aciklama As String) As Boolean
    
    If projeKod = "" Then
        MsgBox "Proje kodu zorunludur!", vbExclamation
        HarcamaYap = False
        Exit Function
    End If
    
    If Not StokYeterliMi(malzemeKodu, depoID, miktar) Then
        MsgBox "Depoda yetersiz stok! Mevcut: " & BakiyeGetir(malzemeKodu, depoID), vbExclamation
        HarcamaYap = False
        Exit Function
    End If
    
    Dim hareketID As Long
    hareketID = HareketKaydet("HARCAMA", malzemeKodu, miktar, birim, _
                              depoID, "", projeKod, belgeNo, aciklama)
    
    If hareketID > 0 Then
        MsgBox "Harcama kaydedildi. Hareket No: " & hareketID, vbInformation
        HarcamaYap = True
    Else
        HarcamaYap = False
    End If
End Function


' ============================================================
' FORM: FRM_Malzeme_Giris - Form olayları
' Form özellikleri: Veri Kaynağı = TB_Stok_Hareket
' ============================================================

' --- FRM_Malzeme_Giris.Form_BeforeInsert ---
' Private Sub Form_BeforeInsert(Cancel As Integer)
'     Me.Hareket_Tipi = "GIRIS"
'     Me.Tarih = Now()
'     Me.Kullanici = Environ("USERNAME")
'     Me.Kayit_Tarihi = Now()
'     Me.Onay_Durumu = "ONAYLANDI"
' End Sub

' --- FRM_Malzeme_Giris.Kaydet_Btn_Click ---
' Private Sub Kaydet_Btn_Click()
'     If IsNull(Me.Hedef_Depo_ID) Or IsNull(Me.Malzeme_Kodu) Or IsNull(Me.Miktar) Then
'         MsgBox "Depo, malzeme ve miktar zorunludur!", vbExclamation
'         Exit Sub
'     End If
'     Me.Hareket_Tipi = "GIRIS"
'     DoCmd.RunCommand acCmdSaveRecord
'     MsgBox "Giriş kaydedildi.", vbInformation
' End Sub


' ============================================================
' FORM: FRM_Nakil - Form olayları
' ============================================================

' --- FRM_Nakil.Nakil_Btn_Click ---
' Private Sub Nakil_Btn_Click()
'     Dim sonuc As Boolean
'     sonuc = NakilYap( _
'         Nz(Me.Kaynak_Depo_ID, ""), _
'         Nz(Me.Hedef_Depo_ID, ""), _
'         Nz(Me.Malzeme_Kodu, ""), _
'         Nz(Me.Miktar, 0), _
'         Nz(Me.Birim, ""), _
'         Nz(Me.Belge_No, ""), _
'         Nz(Me.Aciklama, ""))
'     If sonuc Then
'         Me.Miktar = Null
'         Me.Aciklama = Null
'     End If
' End Sub

' --- FRM_Nakil.Malzeme_Kodu_AfterUpdate ---
' Private Sub Malzeme_Kodu_AfterUpdate()
'     If Not IsNull(Me.Malzeme_Kodu) And Not IsNull(Me.Kaynak_Depo_ID) Then
'         Me.Mevcut_Bakiye = BakiyeGetir(Me.Malzeme_Kodu, Me.Kaynak_Depo_ID)
'     End If
' End Sub

' --- FRM_Nakil.Kaynak_Depo_ID_AfterUpdate ---
' Private Sub Kaynak_Depo_ID_AfterUpdate()
'     If Not IsNull(Me.Malzeme_Kodu) And Not IsNull(Me.Kaynak_Depo_ID) Then
'         Me.Mevcut_Bakiye = BakiyeGetir(Me.Malzeme_Kodu, Me.Kaynak_Depo_ID)
'     End If
' End Sub


' ============================================================
' FORM: FRM_Harcama - Form olayları
' ============================================================

' --- FRM_Harcama.Harcama_Btn_Click ---
' Private Sub Harcama_Btn_Click()
'     Dim sonuc As Boolean
'     sonuc = HarcamaYap( _
'         Nz(Me.Kaynak_Depo_ID, ""), _
'         Nz(Me.Proje_Kod, ""), _
'         Nz(Me.Malzeme_Kodu, ""), _
'         Nz(Me.Miktar, 0), _
'         Nz(Me.Birim, ""), _
'         Nz(Me.Belge_No, ""), _
'         Nz(Me.Aciklama, ""))
'     If sonuc Then
'         Me.Miktar = Null
'         Me.Aciklama = Null
'     End If
' End Sub

' --- FRM_Harcama.Proje_Kod_AfterUpdate ---
' Private Sub Proje_Kod_AfterUpdate()
'     ' Projeye bağlı depoyu otomatik getir
'     Dim rs As DAO.Recordset
'     Set rs = CurrentDb.OpenRecordset( _
'         "SELECT Depo_ID FROM TB_Proje_Depo WHERE Proje_Kod='" & Me.Proje_Kod & "' AND Aktif=True", _
'         dbOpenSnapshot)
'     If Not rs.EOF Then
'         Me.Kaynak_Depo_ID = rs!Depo_ID
'     End If
'     rs.Close
' End Sub


' ============================================================
' FORM: FRM_Bakiye_Sorgu - Anlık bakiye görüntüleme
' Veri kaynağı: QRY_Depo_Bakiye (Adım 4'teki sorgu)
' ============================================================

' --- FRM_Bakiye_Sorgu.Il_Filtre_AfterUpdate ---
' Private Sub Il_Filtre_AfterUpdate()
'     Me.Depo_Filtre.RowSource = _
'         "SELECT ID, Depo_Yeri_Tanimi FROM TB_Depo_Kodlari " & _
'         "WHERE UY=" & Me.Il_Filtre & " ORDER BY Depo_Yeri_Tanimi"
'     Me.Depo_Filtre = Null
' End Sub

' --- FRM_Bakiye_Sorgu.Filtrele_Btn_Click ---
' Private Sub Filtrele_Btn_Click()
'     Dim filtre As String
'     filtre = "1=1"
'     If Not IsNull(Me.Il_Filtre) Then
'         filtre = filtre & " AND Il_Kodu='" & Me.Il_Filtre & "'"
'     End If
'     If Not IsNull(Me.Depo_Filtre) Then
'         filtre = filtre & " AND Depo_ID='" & Me.Depo_Filtre & "'"
'     End If
'     Me.RecordSource = "SELECT * FROM QRY_Depo_Bakiye WHERE " & filtre
' End Sub
