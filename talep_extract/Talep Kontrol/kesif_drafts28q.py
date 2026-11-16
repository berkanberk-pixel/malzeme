"""FIX28Q: local-only keşif draft staging. NEVER publishes to ACTIVE/UNC.
No master data files, authoritative CSVs, or already-approved discovery records are changed.
"""
import json, os, re, tempfile, uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path

_ALLOWED={'TESIS','BAKIM','KET','LED'}

def _root(app_dir):
    root=Path(app_dir)/'data_v2'/'02_STANDARD'/'KESIF_TASLAKLARI_FIX28Q'
    root.mkdir(parents=True,exist_ok=True)
    return root

def _text(data,key,limit=200):
    val=str(data.get(key) or '').strip()
    if len(val)>limit:raise ValueError(key+' alanı çok uzun')
    return val

def store(app_dir,payload,user):
    if not isinstance(payload,dict):raise ValueError('Geçersiz taslak')
    kind=_text(payload,'workType',10).upper()
    if kind not in _ALLOWED:raise ValueError('İş türü TESİS, BAKIM, KET veya LED olmalı')
    depot=_text(payload,'depot',30).upper();material=_text(payload,'materialCode',40)
    tedas=_text(payload,'tedasCode',80);project=_text(payload,'projectId',100)
    if not depot:raise ValueError('Depo kodu gerekli')
    if not (material or tedas):raise ValueError('Malzeme kodu veya TEDAŞ pozu gerekli')
    if kind=='TESIS' and not project:raise ValueError('TESİS proje kodu veya proje adı gerekli')
    operation=_text(payload,'operation',15).upper() or 'NEW'
    if operation not in ('NEW','REVISION'):raise ValueError('Geçersiz işlem')
    if operation=='REVISION' and not _text(payload,'reason',500):raise ValueError('Revizyonda açıklama gerekli')
    qty_text=_text(payload,'quantity',35).replace(',','.')
    try:qty=Decimal(qty_text)
    except InvalidOperation:raise ValueError('Miktar sayısal olmalı')
    if not qty.is_finite() or abs(qty)>Decimal('999999999999.999') or qty.as_tuple().exponent < -3:raise ValueError('Miktar geçersiz (en fazla 3 ondalık)')
    if operation=='NEW' and qty<0:raise ValueError('Yeni keşif miktarı negatif olamaz')
    item={
      'id':'KS-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')+'-'+uuid.uuid4().hex[:12].upper(),
      'status':'LOCAL_DRAFT_ONLY','operation':operation,'workType':kind,'depot':depot,'plant':_text(payload,'plant',20),
      'projectId':project,'projectName':_text(payload,'projectName',200),'materialCode':material,'tedasCode':tedas,'quantity':str(qty),
      'unit':_text(payload,'unit',25),'reason':_text(payload,'reason',500),'sourceRecordId':_text(payload,'sourceRecordId',100),
      'createdAt':datetime.now(timezone.utc).isoformat(),'createdBy':str(user or 'LOCAL_USER')[:100],
      'canPublish':False,'source':'MANUAL_LOCAL_DRAFT'
    }
    dest=_root(app_dir)/(item['id']+'.json')
    fd,tmp=tempfile.mkstemp(dir=str(dest.parent),prefix='.stage-',suffix='.tmp')
    try:
        with os.fdopen(fd,'w',encoding='utf-8') as f:
            json.dump(item,f,ensure_ascii=False,indent=2);f.flush();os.fsync(f.fileno())
        os.replace(tmp,dest)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)
    return item

def list_items(app_dir,limit=100):
    items=[]
    for f in sorted(_root(app_dir).glob('KS-*.json'),reverse=True):
        if len(items)>=limit:break
        try:
            data=json.loads(f.read_text(encoding='utf-8'))
            if data.get('status')=='LOCAL_DRAFT_ONLY':items.append(data)
        except (OSError,ValueError):continue
    return items
