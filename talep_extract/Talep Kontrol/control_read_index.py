"""FIX28N local disposable SQLite read index for immutable CSV control bundles.

Canonical authority: validated COMMITTED bundles (or historical legacy CSV pairs)
under KAYIT_KLASORU; NEVER the local index. SQLite never resides on UNC.
Source metadata is checked on every request; content hashes are verified when a
source first appears/changes and at a periodic interval. Any index failure must
fall back to verified CSV reads in server.py; no silent stale cache reads.
"""
from __future__ import annotations
import csv
import contextlib
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import threading
import time

_LOCK=threading.RLock()
_LAST_SCAN = {'key':None,'at':0,'result':None}
VERIFY_INTERVAL = 120.0  # verify data content even when timestamps do not change


def local_db_path(app_dir:Path)->Path:
    # The index is a per-user performance cache, never an SMB-writable shared DB.
    override=os.environ.get('TALEP_CONTROL_READ_INDEX_DB','').strip()
    p=Path(override) if override else (Path(os.environ['LOCALAPPDATA'])/'YEDAS_TalepKontrol'/'control_read_index.sqlite' if os.environ.get('LOCALAPPDATA') else (Path(os.environ.get('XDG_CACHE_HOME') or (Path.home()/'.cache'))/'YEDAS_TalepKontrol'/'control_read_index.sqlite'))
    if str(p).startswith('\\\\') or str(p).startswith('//'):
        raise ValueError('Kontrol okuma indeksi ağ paylaşımında tutulamaz.')
    return p


def _source_fingerprint(paths):
    sig=[]
    for p in paths:
        try:
            s=p.stat();sig.append((p.name,int(s.st_size),int(s.st_mtime_ns)))
        except OSError:return None
    return json.dumps(sig,ensure_ascii=False,separators=(',',':'))


def _inventory(root:Path):
    # Only a complete legacy pair is visible. STAGING is intentionally excluded.
    sources={}
    legacy_header=root/'KONTROL_BASLIK';legacy_material=root/'KONTROL_MALZEME';legacy_project=root/'KONTROL_PROJE'
    if legacy_header.is_dir():
        for hp in legacy_header.glob('*.csv'):
            mp=legacy_material/hp.name
            if not mp.is_file():continue
            cid=hp.stem
            if not re.fullmatch(r'KD-[A-Za-z0-9-]+',cid):continue
            pp=legacy_project/hp.name
            paths={'header':hp,'materials':mp}
            if pp.is_file():paths['projects']=pp
            sig=_source_fingerprint([paths[k] for k in ('header','materials','projects') if k in paths])
            if sig is not None:sources['L/'+cid]={'kind':'legacy','id':cid,'paths':paths,'stamp':sig}
    for committed, names, tag in ((root/'KAYIT'/'COMMITTED', ('H','M','P'), 'N'),
                                  (root/'KONTROL_PAKETLERI'/'COMMITTED',('KONTROL_BASLIK','KONTROL_MALZEME','KONTROL_PROJE'),'B')):
        if committed.is_dir():
            for bundle in committed.iterdir():
                cid=bundle.name
                if not bundle.is_dir() or not re.fullmatch(r'KD-[A-Za-z0-9-]+',cid):continue
                hp=bundle/names[0]/(cid+'.csv');mp=bundle/names[1]/(cid+'.csv');pp=bundle/names[2]/(cid+'.csv')
                paths={'header':hp,'materials':mp}
                if pp.is_file():paths['projects']=pp
                manifest=bundle/'manifest.json'
                sig=_source_fingerprint([manifest]+[paths[k] for k in ('header','materials','projects') if k in paths])
                if sig is not None:sources[tag+'/'+cid]={'kind':'committed','id':cid,'paths':paths,'bundle':bundle,'stamp':sig}
    return sources


def _connect(db:Path):
    db.parent.mkdir(parents=True,exist_ok=True)
    cx=sqlite3.connect(db,timeout=12)
    cx.execute('PRAGMA busy_timeout=12000')
    cx.execute('PRAGMA journal_mode=WAL')
    cx.executescript('''
    CREATE TABLE IF NOT EXISTS sources (
        root_key TEXT NOT NULL, source_key TEXT NOT NULL, control_id TEXT NOT NULL,
        signature TEXT NOT NULL, verified_at REAL NOT NULL,
        PRIMARY KEY(root_key,source_key));
    CREATE TABLE IF NOT EXISTS record_rows (
        root_key TEXT NOT NULL,source_key TEXT NOT NULL,control_id TEXT NOT NULL,
        kind TEXT NOT NULL,ordinal INTEGER NOT NULL,payload TEXT NOT NULL,
        PRIMARY KEY(root_key,source_key,kind,ordinal));
    CREATE INDEX IF NOT EXISTS idx_records_by_control ON record_rows(root_key,kind,control_id);
    CREATE INDEX IF NOT EXISTS idx_records_by_kind ON record_rows(root_key,kind);
    ''')
    return cx


def _parse_source(source):
    rows=[]
    for kind,path in source['paths'].items():
        with path.open('r',encoding='utf-8-sig',newline='') as fh:
            items=list(csv.DictReader(fh,delimiter=';'))
        for i,r in enumerate(items):
            r=dict(r)
            if kind=='header':
                r['_file']=path.name
                r['_mtime_ns']=path.stat().st_mtime_ns
            rows.append((kind,i,json.dumps(r,ensure_ascii=False,separators=(',',':'))))
    return rows


def query(app_dir:Path,root:Path,kind:str,verify_bundle,control_ids=None,force=False):
    """Read rows from local index. Raises on cache failure (caller must fallback)."""
    if kind not in ('header','materials','projects'):raise ValueError('Geçersiz kontrol okuma türü')
    root=Path(root).resolve();rootkey=hashlib.sha256(os.path.normcase(str(root)).encode('utf-8')).hexdigest()
    now=time.time()
    with _LOCK:
        db=local_db_path(Path(app_dir))
        with contextlib.closing(_connect(db)) as cx:
            sources=_inventory(root)
            stored={r[0]:(r[1],r[2]) for r in cx.execute('SELECT source_key,signature,verified_at FROM sources WHERE root_key=?',(rootkey,))}
            with cx:
                disappeared=set(stored)-set(sources)
                for name in disappeared:
                    cx.execute('DELETE FROM record_rows WHERE root_key=? AND source_key=?',(rootkey,name))
                    cx.execute('DELETE FROM sources WHERE root_key=? AND source_key=?',(rootkey,name))
                for name,source in sources.items():
                    old=stored.get(name)
                    same=bool(old and old[0]==source['stamp'])
                    # On unchanged data, avoid re-reading CSV bodies on every dashboard refresh.
                    if same and not force and now-float(old[1])<VERIFY_INTERVAL:continue
                    if source['kind']=='committed' and not verify_bundle(source['bundle']):
                        cx.execute('DELETE FROM record_rows WHERE root_key=? AND source_key=?',(rootkey,name))
                        cx.execute('DELETE FROM sources WHERE root_key=? AND source_key=?',(rootkey,name))
                        continue
                    # When only the verification interval expires, update validation time
                    # without materializing the CSV again. Content was hashed above.
                    if same:
                        cx.execute('UPDATE sources SET verified_at=? WHERE root_key=? AND source_key=?',(now,rootkey,name))
                        continue
                    rows=_parse_source(source)
                    # Guard against mid-read replacement; never publish a partial index.
                    after=_source_fingerprint(([source['bundle']/'manifest.json'] if source['kind']=='committed' else [])+
                          [source['paths'][k] for k in ('header','materials','projects') if k in source['paths']])
                    if after!=source['stamp']:
                        cx.execute('DELETE FROM record_rows WHERE root_key=? AND source_key=?',(rootkey,name))
                        cx.execute('DELETE FROM sources WHERE root_key=? AND source_key=?',(rootkey,name))
                        continue
                    cx.execute('DELETE FROM record_rows WHERE root_key=? AND source_key=?',(rootkey,name))
                    cx.executemany('INSERT INTO record_rows(root_key,source_key,control_id,kind,ordinal,payload) VALUES (?,?,?,?,?,?)',
                        ((rootkey,name,source['id'],k,i,payload) for k,i,payload in rows))
                    cx.execute('INSERT OR REPLACE INTO sources(root_key,source_key,control_id,signature,verified_at) VALUES (?,?,?,?,?)',
                        (rootkey,name,source['id'],source['stamp'],now))
            ids=None if control_ids is None else set(map(str,control_ids))
            if ids is not None and not ids:return []
            if ids is None:
                raw=cx.execute('SELECT payload FROM record_rows WHERE root_key=? AND kind=? ORDER BY source_key,ordinal',(rootkey,kind))
            else:
                marks=','.join('?' for _ in ids)
                raw=cx.execute(f'SELECT payload FROM record_rows WHERE root_key=? AND kind=? AND control_id IN ({marks}) ORDER BY source_key,ordinal',
                    [rootkey,kind,*sorted(ids)])
            return [json.loads(x[0]) for x in raw]


def stats(app_dir:Path,root:Path):
    p=local_db_path(app_dir)
    if not p.is_file():return {'database':str(p),'exists':False}
    key=hashlib.sha256(os.path.normcase(str(Path(root).resolve())).encode('utf-8')).hexdigest()
    with contextlib.closing(_connect(p)) as cx:
        a=cx.execute('SELECT COUNT(*),MIN(verified_at),MAX(verified_at) FROM sources WHERE root_key=?',(key,)).fetchone()
        b=cx.execute('SELECT kind,COUNT(*) FROM record_rows WHERE root_key=? GROUP BY kind',(key,)).fetchall()
    return {'database':str(p),'exists':True,'sources':a[0],'lastVerifiedAt':a[2],'rows':dict(b)}


def repair_local_index(app_dir:Path):
    """Quarantine only a broken, disposable *local* SQLite cache; never canonical CSVs."""
    db=local_db_path(app_dir)
    with _LOCK:
        if not db.exists():return None
        suffix='.corrupt-'+time.strftime('%Y%m%d-%H%M%S')+'-'+str(os.getpid())
        target=db.with_name(db.name+suffix)
        db.replace(target)
        # Old WAL/SHM may belong to the damaged DB and must not be reused.
        for ext in ('-wal','-shm'):
            child=Path(str(db)+ext)
            if child.exists():child.replace(Path(str(target)+ext))
        return str(target)
