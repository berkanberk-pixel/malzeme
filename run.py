#!/usr/bin/env python3
"""Malzeme Stok Takip uygulamasını başlatır."""

import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.normpath(os.path.join(ROOT, "data", "malzeme.db"))
ACCDB_PATH = os.path.normpath(os.path.join(ROOT, "Database2.accdb"))


def ensure_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

    if os.path.exists(DB_PATH):
        return

    print("Veritabani bulunamadi, ice aktarma basliyor...")
    if not os.path.exists(ACCDB_PATH):
        print(f"HATA: {ACCDB_PATH} dosyasi gerekli!")
        print("Database2.accdb dosyasini proje kokune koyun.")
        sys.exit(1)

    env = os.environ.copy()
    env["ACCDB_PATH"] = ACCDB_PATH
    env["DB_PATH"] = DB_PATH
    script = os.path.join(ROOT, "scripts", "import_access.py")
    result = subprocess.run([sys.executable, script], env=env)
    if result.returncode != 0:
        print("HATA: Veri aktarimi basarisiz!")
        sys.exit(1)
    print("Ice aktarma tamamlandi.")


def main():
    ensure_db()
    os.environ["DB_PATH"] = DB_PATH

    app_dir = os.path.join(ROOT, "app")
    if app_dir not in sys.path:
        sys.path.insert(0, app_dir)

    try:
        from app import app as flask_app  # noqa: E402
    except ImportError as exc:
        print(f"HATA: Uygulama yuklenemedi: {exc}")
        print("Paketleri kurun: pip install -r requirements.txt")
        sys.exit(1)

    print("\n" + "=" * 50)
    print("  Malzeme Stok Takip Sistemi")

    for port in (5000, 5001, 8080):
        try:
            print(f"  http://127.0.0.1:{port}")
            print("=" * 50 + "\n")
            flask_app.run(host="127.0.0.1", port=port, debug=False)
            return
        except OSError:
            continue

    print("HATA: Uygun port bulunamadi (5000, 5001, 8080 dolu).")
    sys.exit(1)


if __name__ == "__main__":
    main()
