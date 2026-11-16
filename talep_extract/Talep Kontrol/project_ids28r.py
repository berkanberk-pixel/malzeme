"""FIX28R: local, stable, collision-free TESIS codes for unlinked discovery projects.

Authoritative source master is never modified.  Code assignments live in an atomic
local JSON overlay and must undergo master-data approval before central publication.
"""
from __future__ import annotations
import json
import os
import re
import threading
import uuid
from pathlib import Path

_LOCK=threading.RLock()
_PATTERN=re.compile(r"^([A-Za-z][A-Za-z0-9]*)-([1-9][0-9]*)$")

def _read(path: Path):
    try:
        data=json.loads(path.read_text(encoding='utf-8'))
        if isinstance(data,dict) and isinstance(data.get('assignments'),dict):return data['assignments']
    except (OSError,ValueError):pass
    return {}

def _write(path: Path, values: dict):
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_name(path.name+'.'+uuid.uuid4().hex[:8]+'.tmp')
    try:
        with temp.open('w',encoding='utf-8') as f:
            json.dump({'schema':1,'status':'LOCAL_UNAPPROVED','assignments':values},f,ensure_ascii=False,indent=2)
            f.flush();os.fsync(f.fileno())
        os.replace(temp,path)
    finally:
        if temp.exists():temp.unlink()

def _key(depot,normalized):return str(depot).strip()+'|'+str(normalized).strip()

def _next(depot,used):
    # New codes always extend the highest known number; do not recycle old numbers.
    maximum=max((int(m.group(2)) for v in used if (m:=_PATTERN.fullmatch(str(v))) and m.group(1)==depot),default=0)
    return f'{depot}-{maximum+1}'

def assign(rows:list,master:list,manual:list,path:Path):
    """Add local IDs only to rows which have no master/project ID."""
    with _LOCK:
        assigned=_read(path)
        taken={str(x.get('projectCode') or '') for x in rows+manual}
        taken.update(str(r.get('project_id') or '') for r in master)
        taken.update(str(v) for v in assigned.values())
        # Every code has exactly one owner.  Source-master IDs win over an older
        # local auto-assignment when the two later collide.
        owners={}
        for r in master:
            code=str(r.get('project_id') or '').strip()
            if code:owners[code]=_key(r.get('dy'),r.get('project_norm'))
        for r in rows+manual:
            code=str(r.get('projectCode') or '').strip()
            if code:owners[code]=_key(r.get('dy') or r.get('depot'),r.get('projectNorm'))
        changed=False;newly=0
        for r in sorted(rows,key=lambda x:(str(x.get('dy') or ''),str(x.get('projectNorm') or ''),str(x.get('projectName') or ''))):
            if str(r.get('projectCode') or '').strip():
                r['projectCodeOrigin']='MASTER' if not r.get('manualProject') else 'MANUAL'
                continue
            depot=str(r.get('dy') or '').strip();normalized=str(r.get('projectNorm') or '').strip()
            if not depot or not normalized:continue
            k=_key(depot,normalized)
            code=assigned.get(k)
            if not code or (code in owners and owners[code]!=k):
                code=_next(depot,taken)
                assigned[k]=code;changed=True;newly+=1
            taken.add(code);owners[code]=k
            r['projectCode']=code;r['projectCodeOrigin']='AUTO_LOCAL_UNAPPROVED'
        if changed:_write(path,assigned)
        return {'newlyAssigned':newly,'localCount':sum(1 for x in rows if x.get('projectCodeOrigin')=='AUTO_LOCAL_UNAPPROVED')}

def preview_next(depot:str,master:list,manual:list,path:Path):
    depot=str(depot or '').strip().upper()
    if not re.fullmatch(r'[A-Z][A-Z0-9]{1,11}',depot):raise ValueError('Depo kodu geçerli değil.')
    with _LOCK:
        used=set(_read(path).values())
        used.update(str(r.get('project_id') or '') for r in master)
        used.update(str(r.get('projectCode') or '') for r in manual)
        return _next(depot,used)

# A small, self-contained test hook, not a source-data mutation.
