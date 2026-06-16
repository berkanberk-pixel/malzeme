#!/usr/bin/env python3
"""
Firma Malzeme Takip Veritabanı - Kurulum Scripti
Kullanım: python scripts/init_db.py [--seed] [--db yol/veritabani.db]
"""

import argparse
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_DIR = ROOT / "database"
DEFAULT_DB = ROOT / "data" / "malzeme_takip.db"

SQL_FILES = [
  "schema.sql",
  "views.sql",
  "triggers.sql",
]


def run_sql_file(conn: sqlite3.Connection, path: Path) -> None:
    sql = path.read_text(encoding="utf-8")
    conn.executescript(sql)


def init_database(db_path: Path, with_seed: bool = False) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)

    if db_path.exists():
        db_path.unlink()

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")

    try:
        for filename in SQL_FILES:
            run_sql_file(conn, DB_DIR / filename)

        if with_seed:
            run_sql_file(conn, DB_DIR / "seed.sql")

        conn.commit()
        print(f"Veritabanı oluşturuldu: {db_path}")

        if with_seed:
            print("\n--- Örnek Rapor: Firma Limit Takibi ---")
            rows = conn.execute(
                "SELECT proje_kodu, firma_adi, malzeme_adi, limit_miktari, "
                "kullanilan_miktar, kalan_limit, limit_durumu "
                "FROM v_proje_firma_limit_takibi"
            ).fetchall()
            for row in rows:
                print(" | ".join(str(c) for c in row))

    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Malzeme takip veritabanını oluşturur")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB, help="Veritabanı dosya yolu")
    parser.add_argument("--seed", action="store_true", help="Örnek verileri yükle")
    args = parser.parse_args()
    init_database(args.db, with_seed=args.seed)


if __name__ == "__main__":
    main()
