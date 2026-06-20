#!/usr/bin/env python3
"""Access veritabanını SQLite'a aktarır ve stok takip şemasını oluşturur."""

import os
import sqlite3
from datetime import datetime

from access_parser import AccessParser

ACCDB_PATH = os.environ.get(
    "ACCDB_PATH",
    os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "Database2.accdb")),
)
DB_PATH = os.environ.get(
    "DB_PATH",
    os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "data", "malzeme.db")),
)

TABLES = [
    "TB_Birim",
    "TB_Degerleme",
    "TB_Depo_Kodlari",
    "TB_Mal_Grubu",
    "TB_Malzeme",
    "TB_Proje_Listesi",
    "TB_Tedas_Kod",
    "TB_Uretim_Yeri",
]


def get_conn():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def create_schema(conn):
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS TB_Uretim_Yeri (
            Uretim_Yeri TEXT PRIMARY KEY,
            Uretim_Yeri_Tanimi TEXT
        );

        CREATE TABLE IF NOT EXISTS TB_Birim (
            Birim TEXT PRIMARY KEY,
            Tanim TEXT
        );

        CREATE TABLE IF NOT EXISTS TB_Degerleme (
            Tur TEXT PRIMARY KEY,
            Tanim TEXT
        );

        CREATE TABLE IF NOT EXISTS TB_Mal_Grubu (
            Mal_grubu TEXT PRIMARY KEY,
            Mal_Gurubu_Tanimi TEXT,
            Mal_Gurubu_Tanimi_2 TEXT
        );

        CREATE TABLE IF NOT EXISTS TB_Depo_Kodlari (
            ID TEXT PRIMARY KEY,
            UY REAL,
            Depo_yeri TEXT,
            Depo_Yeri_Tanimi TEXT,
            Depo_Turu TEXT,
            Sozlesme_No TEXT,
            Sozlesme_Adi TEXT,
            Firma_Adi TEXT,
            Sozlesme_Tutar TEXT,
            MLZ_Teminat TEXT,
            Ek_Teminat TEXT,
            Olur_Atisi TEXT,
            Proje_Kod TEXT
        );

        CREATE TABLE IF NOT EXISTS TB_Malzeme (
            Malzeme_Kodu TEXT PRIMARY KEY,
            Malzmeme_Tanimi TEXT,
            KG_Bilgi REAL,
            YDS_Fiyat REAL,
            Birim TEXT,
            Mal_Grubu TEXT,
            TDS_Kod TEXT,
            Aktif INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS TB_Proje_Listesi (
            IS_Kod TEXT PRIMARY KEY,
            IS_listesi TEXT,
            Il_Kodu TEXT,
            Durum TEXT DEFAULT 'AKTIF',
            Baslangic_Tarihi TEXT,
            Bitis_Tarihi TEXT
        );

        CREATE TABLE IF NOT EXISTS TB_Tedas_Kod (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            TDS_Kod TEXT,
            TDS_Tanim TEXT,
            TDS_Fiyat REAL,
            TDS_Montaj REAL
        );

        CREATE TABLE IF NOT EXISTS TB_Hareket_Tipi (
            Hareket_Tipi TEXT PRIMARY KEY,
            Tanim TEXT NOT NULL,
            Kaynak_Zorunlu INTEGER DEFAULT 0,
            Hedef_Zorunlu INTEGER DEFAULT 0,
            Proje_Zorunlu INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS TB_Proje_Depo (
            Proje_Depo_ID INTEGER PRIMARY KEY AUTOINCREMENT,
            Proje_Kod TEXT NOT NULL,
            Depo_ID TEXT NOT NULL,
            Il_Kodu TEXT NOT NULL,
            Aktif INTEGER DEFAULT 1,
            Aciklama TEXT,
            FOREIGN KEY (Proje_Kod) REFERENCES TB_Proje_Listesi(IS_Kod),
            FOREIGN KEY (Depo_ID) REFERENCES TB_Depo_Kodlari(ID),
            FOREIGN KEY (Il_Kodu) REFERENCES TB_Uretim_Yeri(Uretim_Yeri)
        );

        CREATE TABLE IF NOT EXISTS TB_Stok_Hareket (
            HareketID INTEGER PRIMARY KEY AUTOINCREMENT,
            Tarih TEXT NOT NULL,
            Hareket_Tipi TEXT NOT NULL,
            Malzeme_Kodu TEXT NOT NULL,
            Miktar REAL NOT NULL,
            Birim TEXT,
            Kaynak_Depo_ID TEXT,
            Hedef_Depo_ID TEXT,
            Proje_Kod TEXT,
            Degerleme_Tur TEXT,
            Belge_No TEXT,
            Aciklama TEXT,
            Kullanici TEXT,
            Kayit_Tarihi TEXT,
            Onay_Durumu TEXT DEFAULT 'ONAYLANDI',
            FOREIGN KEY (Malzeme_Kodu) REFERENCES TB_Malzeme(Malzeme_Kodu),
            FOREIGN KEY (Kaynak_Depo_ID) REFERENCES TB_Depo_Kodlari(ID),
            FOREIGN KEY (Hedef_Depo_ID) REFERENCES TB_Depo_Kodlari(ID),
            FOREIGN KEY (Proje_Kod) REFERENCES TB_Proje_Listesi(IS_Kod),
            FOREIGN KEY (Hareket_Tipi) REFERENCES TB_Hareket_Tipi(Hareket_Tipi)
        );

        CREATE INDEX IF NOT EXISTS idx_hareket_tarih ON TB_Stok_Hareket(Tarih);
        CREATE INDEX IF NOT EXISTS idx_hareket_malzeme ON TB_Stok_Hareket(Malzeme_Kodu);
        CREATE INDEX IF NOT EXISTS idx_hareket_kaynak ON TB_Stok_Hareket(Kaynak_Depo_ID);
        CREATE INDEX IF NOT EXISTS idx_hareket_hedef ON TB_Stok_Hareket(Hedef_Depo_ID);
        CREATE INDEX IF NOT EXISTS idx_hareket_proje ON TB_Stok_Hareket(Proje_Kod);
        """
    )


def seed_hareket_tipleri(conn):
    rows = [
        ("GIRIS", "Malzeme Girişi", 0, 1, 0),
        ("CIKIS", "Malzeme Çıkışı", 1, 0, 0),
        ("NAKIL", "Depolar Arası Nakil", 1, 1, 0),
        ("HARCAMA", "Proje Harcaması", 1, 0, 1),
        ("IADE", "İade", 0, 1, 0),
        ("SAYIM", "Sayım Düzeltmesi", 1, 0, 0),
    ]
    conn.executemany(
        "INSERT OR IGNORE INTO TB_Hareket_Tipi VALUES (?,?,?,?,?)",
        rows,
    )


def import_table(conn, db, table_name):
    data = db.parse_table(table_name)
    if not data:
        return 0

    columns = list(data.keys())
    row_count = len(data[columns[0]])
    placeholders = ",".join("?" * len(columns))
    col_names = ",".join(columns)
    seen_keys = set()

    conn.execute(f"DELETE FROM {table_name}")
    inserted = 0
    for i in range(row_count):
        values = []
        for col in columns:
            val = data[col][i]
            if isinstance(val, float) and col in ("UY",):
                val = int(val) if val == int(val) else val
            values.append(val)

        if table_name == "TB_Tedas_Kod":
            key = values[0]
            if key in seen_keys:
                continue
            seen_keys.add(key)

        conn.execute(
            f"INSERT INTO {table_name} ({col_names}) VALUES ({placeholders})",
            values,
        )
        inserted += 1
    return inserted


def seed_proje_depo(conn):
    """Her ilin PROJE deposunu tüm projelere varsayılan bağla."""
    conn.execute("DELETE FROM TB_Proje_Depo")
    projeler = conn.execute("SELECT IS_Kod FROM TB_Proje_Listesi").fetchall()
    depolar = {
        row["Uretim_Yeri"]: f"{row['Uretim_Yeri']}-PROJ"
        for row in conn.execute("SELECT Uretim_Yeri FROM TB_Uretim_Yeri").fetchall()
    }
    # 6510=Samsun varsayılan il
    default_il = "6510"
    for proje in projeler:
        depo_id = depolar.get(default_il, "6510-PROJ")
        conn.execute(
            """
            INSERT INTO TB_Proje_Depo (Proje_Kod, Depo_ID, Il_Kodu, Aktif, Aciklama)
            VALUES (?, ?, ?, 1, 'Varsayılan proje-depo eşlemesi')
            """,
            (proje["IS_Kod"], depo_id, default_il),
        )
    conn.execute(
        "UPDATE TB_Proje_Listesi SET Il_Kodu = COALESCE(Il_Kodu, ?)",
        (default_il,),
    )


def seed_demo_hareketler(conn):
    """Çalışan demo verisi."""
    if conn.execute("SELECT COUNT(*) c FROM TB_Stok_Hareket").fetchone()["c"] > 0:
        return

    now = datetime.now().isoformat(timespec="seconds")
    demo = [
        ("GIRIS", "50000073", 100, "ADT", None, "6510-0006", None, "DEMO-001", "Samsun merkez depo giriş"),
        ("GIRIS", "50000073", 50, "ADT", None, "6520-0006", None, "DEMO-002", "Ordu merkez depo giriş"),
        ("NAKIL", "50000073", 30, "ADT", "6510-0006", "6520-0006", None, "DEMO-003", "Samsun -> Ordu nakil"),
        ("HARCAMA", "50000073", 20, "ADT", "6510-0006", None, "Y222-1", "DEMO-004", "Proje harcaması"),
    ]
    for tip, malzeme, miktar, birim, kaynak, hedef, proje, belge, aciklama in demo:
        conn.execute(
            """
            INSERT INTO TB_Stok_Hareket
            (Tarih, Hareket_Tipi, Malzeme_Kodu, Miktar, Birim,
             Kaynak_Depo_ID, Hedef_Depo_ID, Proje_Kod, Belge_No, Aciklama,
             Kullanici, Kayit_Tarihi, Onay_Durumu)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'demo', ?, 'ONAYLANDI')
            """,
            (now, tip, malzeme, miktar, birim, kaynak, hedef, proje, belge, aciklama, now),
        )


def main():
    if not os.path.exists(ACCDB_PATH):
        raise FileNotFoundError(f"Access dosyası bulunamadı: {ACCDB_PATH}")

    print(f"Kaynak: {ACCDB_PATH}")
    print(f"Hedef:  {DB_PATH}")

    db = AccessParser(ACCDB_PATH)
    conn = get_conn()
    create_schema(conn)
    seed_hareket_tipleri(conn)

    for table in TABLES:
        count = import_table(conn, db, table)
        print(f"  {table}: {count} kayıt")

    seed_proje_depo(conn)
    seed_demo_hareketler(conn)
    conn.commit()
    conn.close()
    print("İçe aktarma tamamlandı.")


if __name__ == "__main__":
    main()
