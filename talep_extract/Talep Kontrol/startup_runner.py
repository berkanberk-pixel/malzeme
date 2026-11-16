from __future__ import annotations

import contextlib
import datetime as _dt
import os
from pathlib import Path
import runpy
import sys
import tempfile
import traceback


def _safe_status(text: str) -> str:
    return str(text or '').encode('ascii', 'backslashreplace').decode('ascii')[:1600]


def _write_status(kind: str, detail: str = '') -> None:
    path = os.environ.get('TALEP_STARTUP_STATUS', '').strip()
    if not path:
        return
    try:
        Path(path).write_text(kind + ('|' + _safe_status(detail) if detail else ''), encoding='ascii', errors='replace')
    except Exception:
        pass


def main() -> int:
    server_path = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).with_name('server.py').resolve()
    log_path = Path(os.environ.get('TALEP_STARTUP_LOG') or (Path(tempfile.gettempdir()) / 'YEDAS_TalepKontrol_STARTUP.log'))
    try:
        log_path.parent.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass
    try:
        log = log_path.open('a', encoding='utf-8', errors='replace', buffering=1)
    except Exception:
        log = open(os.devnull, 'w', encoding='utf-8')
    with log, contextlib.redirect_stdout(log), contextlib.redirect_stderr(log):
        print('=' * 76, flush=True)
        print(f"{_dt.datetime.now().astimezone().isoformat()} | STARTUP_RUNNER", flush=True)
        print(f"Python={sys.executable}", flush=True)
        print(f"Version={sys.version}", flush=True)
        print(f"Server={server_path}", flush=True)
        print(f"CWD={os.getcwd()}", flush=True)
        print(f"Port={os.environ.get('TALEP_PORT','')}", flush=True)
        if not server_path.exists():
            msg=f'server.py bulunamadi: {server_path}'
            print(msg, flush=True); _write_status('FAILED', msg); return 31
        _write_status('STARTED', str(sys.executable))
        try:
            runpy.run_path(str(server_path), run_name='__main__')
        except SystemExit as exc:
            code = exc.code if isinstance(exc.code, int) else 1
            print(f'SystemExit={exc.code!r}', flush=True)
            _write_status('FAILED', f'SystemExit {exc.code!r}')
            return int(code or 1)
        except BaseException as exc:
            traceback.print_exc()
            _write_status('FAILED', f'{type(exc).__name__}: {exc}')
            return 32
        print('Yerel hizmet kapatıldı.', flush=True)
        _write_status('STOPPED', 'Normal çıkış')
        return 0


if __name__ == '__main__':
    raise SystemExit(main())
