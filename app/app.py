import os
import sys

from flask import Flask, flash, redirect, render_template, request, url_for

sys.path.insert(0, os.path.dirname(__file__))
from db import (
    bakiye_getir,
    depo_bakiye_listesi,
    get_db,
    hareket_dokumu,
    hareket_kaydet,
    nakil_listesi,
    ozet_istatistik,
    proje_harcama_listesi,
)

app = Flask(__name__)
app.secret_key = "malzeme-stok-takip-2026"


@app.context_processor
def inject_menu():
    return {
        "menu": [
            ("dashboard", "Ana Sayfa", "/"),
            ("giris", "Malzeme Girişi", "/giris"),
            ("nakil", "Nakil", "/nakil"),
            ("harcama", "Harcama", "/harcama"),
            ("bakiye", "Depo Bakiye", "/bakiye"),
            ("raporlar", "Raporlar", "/raporlar"),
        ]
    }


def _iller(conn):
    return conn.execute(
        "SELECT Uretim_Yeri, Uretim_Yeri_Tanimi FROM TB_Uretim_Yeri ORDER BY Uretim_Yeri_Tanimi"
    ).fetchall()


def _depolar(conn, il_kodu=None):
    if il_kodu:
        return conn.execute(
            """
            SELECT ID, Depo_Yeri_Tanimi, Depo_Turu
            FROM TB_Depo_Kodlari
            WHERE CAST(UY AS TEXT) = ?
            ORDER BY Depo_Yeri_Tanimi
            """,
            (str(il_kodu),),
        ).fetchall()
    return conn.execute(
        "SELECT ID, Depo_Yeri_Tanimi, Depo_Turu FROM TB_Depo_Kodlari ORDER BY Depo_Yeri_Tanimi"
    ).fetchall()


def _malzemeler(conn, q=""):
    if q:
        return conn.execute(
            """
            SELECT Malzeme_Kodu, Malzmeme_Tanimi
            FROM TB_Malzeme
            WHERE Malzeme_Kodu LIKE ? OR Malzmeme_Tanimi LIKE ?
            ORDER BY Malzmeme_Tanimi
            LIMIT 200
            """,
            (f"%{q}%", f"%{q}%"),
        ).fetchall()
    return conn.execute(
        "SELECT Malzeme_Kodu, Malzmeme_Tanimi FROM TB_Malzeme ORDER BY Malzmeme_Tanimi LIMIT 200"
    ).fetchall()


def _projeler(conn, q=""):
    if q:
        return conn.execute(
            """
            SELECT IS_Kod, IS_listesi
            FROM TB_Proje_Listesi
            WHERE IS_Kod LIKE ? OR IS_listesi LIKE ?
            ORDER BY IS_Kod
            LIMIT 200
            """,
            (f"%{q}%", f"%{q}%"),
        ).fetchall()
    return conn.execute(
        "SELECT IS_Kod, IS_listesi FROM TB_Proje_Listesi ORDER BY IS_Kod LIMIT 200"
    ).fetchall()


def _birimler(conn):
    return conn.execute("SELECT Birim, Tanim FROM TB_Birim ORDER BY Tanim").fetchall()


@app.route("/")
def dashboard():
    conn = get_db()
    stats = ozet_istatistik(conn)
    bakiyeler = depo_bakiye_listesi(conn)[:10]
    son_hareketler = hareket_dokumu(conn, limit=10)
    conn.close()
    return render_template(
        "dashboard.html",
        stats=stats,
        bakiyeler=bakiyeler,
        son_hareketler=son_hareketler,
        active="dashboard",
    )


@app.route("/giris", methods=["GET", "POST"])
def giris():
    conn = get_db()
    if request.method == "POST":
        try:
            hid = hareket_kaydet(
                conn,
                "GIRIS",
                request.form["malzeme_kodu"],
                request.form["miktar"],
                request.form.get("birim") or "ADT",
                hedef_depo=request.form["hedef_depo"],
                belge_no=request.form.get("belge_no", ""),
                aciklama=request.form.get("aciklama", ""),
            )
            conn.commit()
            flash(f"Giriş kaydedildi. Hareket No: {hid}", "success")
            return redirect(url_for("giris"))
        except Exception as e:
            flash(str(e), "error")

    ctx = {
        "active": "giris",
        "iller": _iller(conn),
        "depolar": _depolar(conn),
        "malzemeler": _malzemeler(conn, request.args.get("q", "")),
        "birimler": _birimler(conn),
        "il_secili": request.args.get("il", ""),
        "q": request.args.get("q", ""),
    }
    if ctx["il_secili"]:
        ctx["depolar"] = _depolar(conn, ctx["il_secili"])
    conn.close()
    return render_template("giris.html", **ctx)


@app.route("/nakil", methods=["GET", "POST"])
def nakil():
    conn = get_db()
    if request.method == "POST":
        try:
            hid = hareket_kaydet(
                conn,
                "NAKIL",
                request.form["malzeme_kodu"],
                request.form["miktar"],
                request.form.get("birim") or "ADT",
                kaynak_depo=request.form["kaynak_depo"],
                hedef_depo=request.form["hedef_depo"],
                belge_no=request.form.get("belge_no", ""),
                aciklama=request.form.get("aciklama", ""),
            )
            conn.commit()
            flash(f"Nakil kaydedildi. Hareket No: {hid}", "success")
            return redirect(url_for("nakil"))
        except Exception as e:
            flash(str(e), "error")

    malzeme = request.form.get("malzeme_kodu") or request.args.get("malzeme", "")
    kaynak = request.form.get("kaynak_depo") or request.args.get("kaynak", "")
    mevcut_bakiye = None
    if malzeme and kaynak:
        mevcut_bakiye = bakiye_getir(conn, malzeme, kaynak)

    ctx = {
        "active": "nakil",
        "iller": _iller(conn),
        "kaynak_depolar": _depolar(conn, request.args.get("kaynak_il")),
        "hedef_depolar": _depolar(conn, request.args.get("hedef_il")),
        "malzemeler": _malzemeler(conn, request.args.get("q", "")),
        "birimler": _birimler(conn),
        "mevcut_bakiye": mevcut_bakiye,
        "q": request.args.get("q", ""),
    }
    conn.close()
    return render_template("nakil.html", **ctx)


@app.route("/harcama", methods=["GET", "POST"])
def harcama():
    conn = get_db()
    if request.method == "POST":
        try:
            hid = hareket_kaydet(
                conn,
                "HARCAMA",
                request.form["malzeme_kodu"],
                request.form["miktar"],
                request.form.get("birim") or "ADT",
                kaynak_depo=request.form["kaynak_depo"],
                proje_kod=request.form["proje_kod"],
                belge_no=request.form.get("belge_no", ""),
                aciklama=request.form.get("aciklama", ""),
            )
            conn.commit()
            flash(f"Harcama kaydedildi. Hareket No: {hid}", "success")
            return redirect(url_for("harcama"))
        except Exception as e:
            flash(str(e), "error")

    malzeme = request.form.get("malzeme_kodu") or request.args.get("malzeme", "")
    kaynak = request.form.get("kaynak_depo") or request.args.get("kaynak", "")
    mevcut_bakiye = None
    if malzeme and kaynak:
        mevcut_bakiye = bakiye_getir(conn, malzeme, kaynak)

    ctx = {
        "active": "harcama",
        "iller": _iller(conn),
        "depolar": _depolar(conn, request.args.get("il")),
        "malzemeler": _malzemeler(conn, request.args.get("mq", "")),
        "projeler": _projeler(conn, request.args.get("pq", "")),
        "birimler": _birimler(conn),
        "mevcut_bakiye": mevcut_bakiye,
        "mq": request.args.get("mq", ""),
        "pq": request.args.get("pq", ""),
    }
    conn.close()
    return render_template("harcama.html", **ctx)


@app.route("/bakiye")
def bakiye():
    conn = get_db()
    il = request.args.get("il", "")
    depo = request.args.get("depo", "")
    rows = depo_bakiye_listesi(conn, il or None, depo or None)
    ctx = {
        "active": "bakiye",
        "iller": _iller(conn),
        "depolar": _depolar(conn, il) if il else [],
        "rows": rows,
        "il_secili": il,
        "depo_secili": depo,
    }
    conn.close()
    return render_template("bakiye.html", **ctx)


@app.route("/raporlar")
def raporlar():
    conn = get_db()
    ctx = {
        "active": "raporlar",
        "harcamalar": proje_harcama_listesi(conn),
        "nakiller": nakil_listesi(conn),
        "hareketler": hareket_dokumu(conn, limit=50),
    }
    conn.close()
    return render_template("raporlar.html", **ctx)


@app.route("/api/bakiye")
def api_bakiye():
    malzeme = request.args.get("malzeme", "")
    depo = request.args.get("depo", "")
    if not malzeme or not depo:
        return {"bakiye": None}
    conn = get_db()
    b = bakiye_getir(conn, malzeme, depo)
    conn.close()
    return {"bakiye": b}


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
