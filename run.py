#!/usr/bin/env python3
"""Malzeme Stok Takip uygulamasını başlatır."""

import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(ROOT, "data", "malzeme.db")
ACCDB_PATH = os.path.join(ROOT, "Database2.accdb")


def ensure_db():
    if not os.path.exists(DB_PATH):
        print("Veritabanı bulunamadı, içe aktarma başlıyor...")
        if not os.path.exists(ACCDB_PATH):
            print(f"HATA: {ACCDB_PATH} dosyası gerekli!")
            print("Database2.accdb dosyasını proje köküne koyun.")
            sys.exit(1)
        env = os.environ.copy()
        env["ACCDB_PATH"] = ACCDB_PATH
        env["DB_PATH"] = DB_PATH
        subprocess.check_call([sys.executable, os.path.join(ROOT, "scripts", "import_access.py")], env=env)
        print("İçe aktarma tamamlandı.")


if __name__ == "__main__":
    ensure_db()
    os.environ["DB_PATH"] = DB_PATH
    sys.path.insert(0, os.path.join(ROOT, "app"))
    from app import app  # noqa: E402

    print("\n" + "=" * 50)
    print("  Malzeme Stok Takip Sistemi")
    print("  http://localhost:5000")
    print("=" * 50 + "\n")
    app.run(host="0.0.0.0", port=5000, debug=False)
