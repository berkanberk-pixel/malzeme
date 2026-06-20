import os
import sqlite3
from datetime import datetime

DB_PATH = os.path.normpath(os.environ.get(
    "DB_PATH",
    os.path.join(os.path.dirname(__file__), "..", "data", "malzeme.db"),
))


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def bakiye_getir(conn, malzeme_kodu, depo_id):
    row = conn.execute(
        """
        SELECT
            COALESCE(SUM(CASE
                WHEN Hareket_Tipi IN ('GIRIS','IADE') AND Hedef_Depo_ID = ? THEN Miktar
                WHEN Hareket_Tipi IN ('CIKIS','HARCAMA') AND Kaynak_Depo_ID = ? THEN -Miktar
                WHEN Hareket_Tipi = 'NAKIL' AND Kaynak_Depo_ID = ? THEN -Miktar
                WHEN Hareket_Tipi = 'NAKIL' AND Hedef_Depo_ID = ? THEN Miktar
                WHEN Hareket_Tipi = 'SAYIM' AND Kaynak_Depo_ID = ? THEN Miktar
                ELSE 0
            END), 0) AS bakiye
        FROM TB_Stok_Hareket
        WHERE Malzeme_Kodu = ?
        """,
        (depo_id, depo_id, depo_id, depo_id, depo_id, malzeme_kodu),
    ).fetchone()
    return row["bakiye"] if row else 0


def hareket_kaydet(conn, hareket_tipi, malzeme_kodu, miktar, birim,
                   kaynak_depo=None, hedef_depo=None, proje_kod=None,
                   belge_no="", aciklama="", kullanici="web"):
    miktar = float(miktar)
    if miktar <= 0:
        raise ValueError("Miktar sıfırdan büyük olmalıdır.")

    if hareket_tipi in ("CIKIS", "HARCAMA", "NAKIL"):
        if not kaynak_depo:
            raise ValueError("Kaynak depo zorunludur.")
        mevcut = bakiye_getir(conn, malzeme_kodu, kaynak_depo)
        if mevcut < miktar:
            raise ValueError(f"Yetersiz stok. Mevcut bakiye: {mevcut}")

    if hareket_tipi == "NAKIL":
        if not hedef_depo:
            raise ValueError("Hedef depo zorunludur.")
        if kaynak_depo == hedef_depo:
            raise ValueError("Kaynak ve hedef depo aynı olamaz.")

    if hareket_tipi in ("GIRIS", "IADE"):
        if not hedef_depo:
            raise ValueError("Hedef depo zorunludur.")

    if hareket_tipi == "HARCAMA" and not proje_kod:
        raise ValueError("Proje kodu zorunludur.")

    now = datetime.now().isoformat(timespec="seconds")
    cur = conn.execute(
        """
        INSERT INTO TB_Stok_Hareket
        (Tarih, Hareket_Tipi, Malzeme_Kodu, Miktar, Birim,
         Kaynak_Depo_ID, Hedef_Depo_ID, Proje_Kod, Belge_No, Aciklama,
         Kullanici, Kayit_Tarihi, Onay_Durumu)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ONAYLANDI')
        """,
        (now, hareket_tipi, malzeme_kodu, miktar, birim,
         kaynak_depo, hedef_depo, proje_kod, belge_no, aciklama,
         kullanici, now),
    )
    return cur.lastrowid


def depo_bakiye_listesi(conn, il_kodu=None, depo_id=None):
    sql = """
        WITH hareketler AS (
            SELECT
                d.ID AS depo_id,
                d.UY AS il_kodu,
                u.Uretim_Yeri_Tanimi AS il_adi,
                d.Depo_Yeri_Tanimi AS depo_adi,
                h.Malzeme_Kodu AS malzeme_kodu,
                m.Malzmeme_Tanimi AS malzeme_adi,
                COALESCE(m.Birim, h.Birim, '-') AS birim,
                CASE
                    WHEN h.Hareket_Tipi IN ('GIRIS','IADE') AND h.Hedef_Depo_ID = d.ID THEN h.Miktar
                    WHEN h.Hareket_Tipi IN ('CIKIS','HARCAMA') AND h.Kaynak_Depo_ID = d.ID THEN -h.Miktar
                    WHEN h.Hareket_Tipi = 'NAKIL' AND h.Kaynak_Depo_ID = d.ID THEN -h.Miktar
                    WHEN h.Hareket_Tipi = 'NAKIL' AND h.Hedef_Depo_ID = d.ID THEN h.Miktar
                    WHEN h.Hareket_Tipi = 'SAYIM' AND h.Kaynak_Depo_ID = d.ID THEN h.Miktar
                    ELSE 0
                END AS degisim
            FROM TB_Depo_Kodlari d
            JOIN TB_Stok_Hareket h
                ON h.Kaynak_Depo_ID = d.ID OR h.Hedef_Depo_ID = d.ID
            LEFT JOIN TB_Malzeme m ON m.Malzeme_Kodu = h.Malzeme_Kodu
            LEFT JOIN TB_Uretim_Yeri u ON CAST(d.UY AS TEXT) = u.Uretim_Yeri
        )
        SELECT
            il_kodu, il_adi, depo_id, depo_adi,
            malzeme_kodu, malzeme_adi, birim,
            SUM(degisim) AS bakiye
        FROM hareketler
        WHERE 1=1
    """
    params = []
    if il_kodu:
        sql += " AND CAST(il_kodu AS TEXT) = ?"
        params.append(str(il_kodu))
    if depo_id:
        sql += " AND depo_id = ?"
        params.append(depo_id)
    sql += """
        GROUP BY il_kodu, il_adi, depo_id, depo_adi, malzeme_kodu, malzeme_adi, birim
        HAVING ABS(SUM(degisim)) > 0.0001
        ORDER BY il_adi, depo_adi, malzeme_adi
    """
    return conn.execute(sql, params).fetchall()


def proje_harcama_listesi(conn):
    return conn.execute(
        """
        SELECT
            h.Proje_Kod AS proje_kod,
            p.IS_listesi AS proje_adi,
            pd.Il_Kodu AS il_kodu,
            u.Uretim_Yeri_Tanimi AS il_adi,
            h.Malzeme_Kodu AS malzeme_kodu,
            m.Malzmeme_Tanimi AS malzeme_adi,
            COALESCE(m.Birim, h.Birim, '-') AS birim,
            SUM(h.Miktar) AS toplam_harcama,
            COUNT(h.HareketID) AS hareket_sayisi
        FROM TB_Stok_Hareket h
        JOIN TB_Proje_Listesi p ON p.IS_Kod = h.Proje_Kod
        LEFT JOIN TB_Malzeme m ON m.Malzeme_Kodu = h.Malzeme_Kodu
        LEFT JOIN TB_Proje_Depo pd ON pd.Proje_Kod = h.Proje_Kod
        LEFT JOIN TB_Uretim_Yeri u ON u.Uretim_Yeri = pd.Il_Kodu
        WHERE h.Hareket_Tipi = 'HARCAMA'
        GROUP BY h.Proje_Kod, p.IS_listesi, pd.Il_Kodu, u.Uretim_Yeri_Tanimi,
                 h.Malzeme_Kodu, m.Malzmeme_Tanimi, m.Birim, h.Birim
        ORDER BY p.IS_listesi, malzeme_adi
        """
    ).fetchall()


def nakil_listesi(conn):
    return conn.execute(
        """
        SELECT
            h.HareketID, h.Tarih, h.Belge_No,
            h.Kaynak_Depo_ID, dk.Depo_Yeri_Tanimi AS kaynak_depo,
            uk.Uretim_Yeri_Tanimi AS kaynak_il,
            h.Hedef_Depo_ID, dh.Depo_Yeri_Tanimi AS hedef_depo,
            uh.Uretim_Yeri_Tanimi AS hedef_il,
            h.Malzeme_Kodu, m.Malzmeme_Tanimi AS malzeme_adi,
            h.Miktar, h.Birim, h.Aciklama, h.Kullanici
        FROM TB_Stok_Hareket h
        LEFT JOIN TB_Depo_Kodlari dk ON dk.ID = h.Kaynak_Depo_ID
        LEFT JOIN TB_Uretim_Yeri uk ON uk.Uretim_Yeri = CAST(dk.UY AS TEXT)
        LEFT JOIN TB_Depo_Kodlari dh ON dh.ID = h.Hedef_Depo_ID
        LEFT JOIN TB_Uretim_Yeri uh ON uh.Uretim_Yeri = CAST(dh.UY AS TEXT)
        LEFT JOIN TB_Malzeme m ON m.Malzeme_Kodu = h.Malzeme_Kodu
        WHERE h.Hareket_Tipi = 'NAKIL'
        ORDER BY h.Tarih DESC, h.HareketID DESC
        """
    ).fetchall()


def hareket_dokumu(conn, limit=100):
    return conn.execute(
        """
        SELECT
            h.HareketID, h.Tarih, h.Hareket_Tipi, ht.Tanim AS hareket_tanimi,
            h.Malzeme_Kodu, m.Malzmeme_Tanimi AS malzeme_adi,
            h.Miktar, h.Birim,
            h.Kaynak_Depo_ID, dk.Depo_Yeri_Tanimi AS kaynak_depo,
            h.Hedef_Depo_ID, dh.Depo_Yeri_Tanimi AS hedef_depo,
            h.Proje_Kod, p.IS_listesi AS proje_adi,
            h.Belge_No, h.Aciklama, h.Kullanici
        FROM TB_Stok_Hareket h
        LEFT JOIN TB_Hareket_Tipi ht ON ht.Hareket_Tipi = h.Hareket_Tipi
        LEFT JOIN TB_Malzeme m ON m.Malzeme_Kodu = h.Malzeme_Kodu
        LEFT JOIN TB_Depo_Kodlari dk ON dk.ID = h.Kaynak_Depo_ID
        LEFT JOIN TB_Depo_Kodlari dh ON dh.ID = h.Hedef_Depo_ID
        LEFT JOIN TB_Proje_Listesi p ON p.IS_Kod = h.Proje_Kod
        ORDER BY h.Tarih DESC, h.HareketID DESC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()


def ozet_istatistik(conn):
    return {
        "depo": conn.execute("SELECT COUNT(*) c FROM TB_Depo_Kodlari").fetchone()["c"],
        "malzeme": conn.execute("SELECT COUNT(*) c FROM TB_Malzeme").fetchone()["c"],
        "proje": conn.execute("SELECT COUNT(*) c FROM TB_Proje_Listesi").fetchone()["c"],
        "hareket": conn.execute("SELECT COUNT(*) c FROM TB_Stok_Hareket").fetchone()["c"],
    }
