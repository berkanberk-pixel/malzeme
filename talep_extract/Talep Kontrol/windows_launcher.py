from __future__ import annotations

import json
import os
import shutil
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parent
CONFIG = ROOT / "config.json"
TEMP = Path(tempfile.gettempdir())
LOG = TEMP / "YEDAS_TalepKontrol_STARTUP.log"
PORT_FILE = TEMP / "YEDAS_TalepKontrol_PORT.txt"
PORTS = range(8765, 8770)
GUI_SESSION = os.environ.get('TALEP_GUI_SESSION', '').strip()
GUI_STATUS = os.environ.get('TALEP_GUI_STATUS', '').strip()


def _write_gui_status(port: int = 0, pid: int = 0, error: str = '') -> None:
    if not GUI_STATUS or not GUI_SESSION:
        return
    path = Path(GUI_STATUS)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {'sessionId': GUI_SESSION, 'port': int(port), 'pid': int(pid), 'error': error}
        tmp = path.with_suffix('.tmp')
        tmp.write_text(json.dumps(payload), encoding='utf-8')
        os.replace(tmp, path)
    except Exception as exc:
        _log(f'Oturum durumu kaydedilemedi: {exc}')


def _config() -> dict:
    try:
        return json.loads(CONFIG.read_text(encoding="utf-8-sig"))
    except Exception:
        return {"app_version": "3.13.0", "build": ""}


def _log(msg: str) -> None:
    stamp = time.strftime("%Y-%m-%d %H:%M:%S")
    try:
        with LOG.open("a", encoding="utf-8", errors="replace") as fh:
            fh.write(f"{stamp} | WINDOWS_LAUNCHER | {msg}\n")
    except Exception:
        pass


def _json_request(port: int, path: str, method: str = "GET", timeout: float = 1.0):
    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode("utf-8", errors="replace")
            return json.loads(raw)
    except Exception:
        return None


def _matching_health(port: int, version: str, build: str) -> bool:
    data = _json_request(port, "/api/health", timeout=0.7)
    if not isinstance(data, dict) or not data.get("ok"):
        return False
    if GUI_SESSION and data.get("sessionId") != GUI_SESSION:
        return False
    if str(data.get("version") or "") != version:
        return False
    if build and str(data.get("build") or "") != build:
        return False
    return True


def _is_talep_service(port: int) -> bool:
    data = _json_request(port, "/api/health", timeout=0.5)
    if not isinstance(data, dict):
        return False
    return "Talep Kontrol" in str(data.get("app") or "")


def _port_available(port: int) -> bool:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind(("127.0.0.1", port))
        return True
    except OSError:
        return False
    finally:
        s.close()


def _open_browser(url: str) -> bool:
    if os.environ.get('TALEP_LAUNCHER_FORCE_BROWSER_FAIL', '').strip().lower() in ('1','true','yes'):
        _log('Browser failure test modu aktif')
        return False
    if os.environ.get("TALEP_LAUNCHER_NO_BROWSER", "").strip().lower() in ("1", "true", "yes"):
        print(f"[TEST] Tarayici acilmadi: {url}")
        return True
    # Edge application mode provides a clean standalone Talep Kontrol window
    # without a command prompt or a visible localhost URL bar.
    if os.name == "nt":
        edge_paths = [
            shutil.which('msedge.exe'),
            os.path.join(os.environ.get('ProgramFiles(x86)', ''), 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
            os.path.join(os.environ.get('ProgramFiles', ''), 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
            os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        ]
        for edge in edge_paths:
            if edge and os.path.isfile(edge):
                try:
                    subprocess.Popen([edge, '--app=' + url],
                        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
                    return True
                except Exception as exc:
                    _log(f'Edge uygulama penceresi baslatilamadi: {exc}')
    try:
        if os.name == "nt":
            os.startfile(url)  # type: ignore[attr-defined]
            return True
    except Exception as exc:
        _log(f"os.startfile browser hatasi: {exc}")
    if os.name == 'nt':
        try:
            rc = subprocess.run(['cmd.exe', '/d', '/c', 'start', '', url], timeout=5, check=False, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0)).returncode
            if rc == 0:
                return True
            _log(f'cmd start browser returncode={rc}')
        except Exception as exc:
            _log(f'cmd start browser hatasi: {exc}')
    try:
        return bool(webbrowser.open_new_tab(url))
    except Exception as exc:
        _log(f"webbrowser hatasi: {exc}")
        return False


def _tail(path: Path, lines: int = 18) -> str:
    try:
        data = path.read_text(encoding="utf-8", errors="replace").splitlines()
        return "\n".join(data[-lines:])
    except Exception:
        return ""


def _write_port(port: int) -> None:
    try:
        PORT_FILE.write_text(str(port), encoding="ascii")
    except Exception:
        pass


def _stop_old_service(port: int) -> None:
    if not _is_talep_service(port):
        return
    _log(f"Eski Talep Kontrol servisi kapatiliyor: {port}")
    _json_request(port, "/api/shutdown", method="POST", timeout=1.0)
    for _ in range(20):
        if _port_available(port):
            return
        time.sleep(0.15)


def _spawn(port: int) -> subprocess.Popen:
    env = os.environ.copy()
    env["TALEP_NO_BROWSER"] = "1"
    env["TALEP_PORT"] = str(port)
    env["TALEP_STARTUP_LOG"] = str(LOG)
    status = TEMP / f"YEDAS_TalepKontrol_START_{port}.status"
    env["TALEP_STARTUP_STATUS"] = str(status)
    try:
        status.unlink(missing_ok=True)
    except Exception:
        pass
    flags = 0
    if os.name == "nt":
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    cmd = [sys.executable, str(ROOT / "startup_runner.py"), str(ROOT / "server.py")]
    _log(f"Child start port={port} python={sys.executable} cmd={cmd!r}")
    return subprocess.Popen(
        cmd,
        cwd=str(ROOT),
        env=env,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=flags,
    )


def main() -> int:
    cfg = _config()
    version = str(cfg.get("app_version") or "3.13.0")
    build = str(cfg.get("build") or "")
    print(f"[1/4] Python: {sys.executable}")
    print(f"      Surum : {sys.version.split()[0]}")
    print(f"[2/4] Talep Kontrol V{version} / {build}")
    _log("=" * 68)
    _log(f"Baslatma. root={ROOT} version={version} build={build} python={sys.executable}")

    if sys.version_info < (3, 10):
        print("[HATA] Python 3.10 veya daha yeni bir surum gerekli.")
        _log("Python surumu yetersiz")
        return 10
    for needed in (ROOT / "server.py", ROOT / "startup_runner.py", ROOT / "index.html", CONFIG):
        if not needed.exists():
            print(f"[HATA] Gerekli dosya bulunamadi: {needed.name}")
            _log(f"Eksik dosya: {needed}")
            return 11

    # Aynı build zaten çalışıyorsa yeniden servis açma.
    for port in ([] if GUI_SESSION else PORTS):
        if _matching_health(port, version, build):
            url = f"http://127.0.0.1:{port}/"
            _write_port(port)
            print(f"[3/4] Mevcut servis bulundu: {port}")
            if _open_browser(url):
                print(f"[4/4] Tarayici acildi: {url}")
                return 0
            print(f"[UYARI] Servis calisiyor fakat tarayici otomatik acilamadi.")
            print(f"        Elle acin: {url}")
            _log(f"Browser acilamadi; servis calisiyor: {url}")
            return 5

    # Eski/uyumsuz Talep Kontrol servislerinin tuttuğu portları serbest bırak.
    last_error = ""
    for port in PORTS:
        if not _port_available(port):
            if _is_talep_service(port) and not _matching_health(port, version, build):
                _stop_old_service(port)
                if not _port_available(port):
                    _log(f"Eski servis kapatilamadi / port dolu: {port}")
                    continue
            else:
                _log(f"Port baska uygulama tarafindan kullaniliyor: {port}")
                continue
        print(f"[3/4] Yerel servis baslatiliyor: port {port}")
        try:
            proc = _spawn(port)
        except Exception as exc:
            last_error = f"Python child baslatilamadi: {type(exc).__name__}: {exc}"
            _log(last_error)
            continue

        deadline = time.monotonic() + 60.0
        while time.monotonic() < deadline:
            if _matching_health(port, version, build):
                url = f"http://127.0.0.1:{port}/"
                _write_port(port)
                _write_gui_status(port=port, pid=proc.pid)
                _log(f"Health OK port={port} pid={proc.pid}")
                if _open_browser(url):
                    print(f"[4/4] Uygulama hazir. Tarayici acildi: {url}")
                    return 0
                print(f"[UYARI] Servis hazir fakat tarayici otomatik acilamadi.")
                print(f"        Elle acin: {url}")
                _log(f"Browser otomatik acilamadi; servis calisiyor: {url}")
                return 5
            rc = proc.poll()
            if rc is not None:
                last_error = f"Sunucu sureci erken sonlandi. ExitCode={rc} Port={port}"
                _log(last_error)
                break
            time.sleep(0.25)
        else:
            last_error = f"Health kontrolu 60 saniyede tamamlanmadi. Port={port}"
            _log(last_error)
            try:
                proc.terminate()
            except Exception:
                pass

    _write_gui_status(error=last_error or "Yerel hizmet başlatılamadı.")
    print("[HATA] Talep Kontrol servisi baslatilamadi.")
    if last_error:
        print("       " + last_error)
    print(f"       Log: {LOG}")
    tail = _tail(LOG)
    if tail:
        print("\n--- SON BASLATMA KAYDI ---")
        print(tail)
        print("--- KAYIT SONU ---")
    return 20


if __name__ == "__main__":
    raise SystemExit(main())
