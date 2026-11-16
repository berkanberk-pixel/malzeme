from __future__ import annotations

import csv, hashlib, json, os, sqlite3, tempfile, time, unicodedata, re, shutil
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

from parquet_minimal import csv_to_parquet, verify_parquet_container, quick_hash, detect_encoding

ENGINE_VERSION='3.13.0-integrity'
INDEX_SCHEMA_VERSION=5


def norm(v:Any)->str:
    s=str(v or '').strip().lower().replace('ı','i')
    s=unicodedata.normalize('NFD',s)
    s=''.join(ch for ch in s if unicodedata.category(ch)!='Mn')
    return re.sub(r'[^a-z0-9]+','',s)

ALIASES={
 'reservation':['Rezervasyon','Rezervasyon No','Rezervasyon Numarası'],
 'material':['Malzeme','Malzeme Kodu'],
 'material_desc':['Malzeme kısa metni','Malzeme Tanımı','Malzeme_Tanimi','Malzeme Açıklaması'],
 'qty':['Miktar','Rezervasyon Miktari','Rezervasyon Miktarı','Talep Miktarı'],
 'uom':['Giriş ölçü birimi','Temel ölçü birimi','Birim','Ölçü'],
 'plant':['Üretim yeri','UY'],
 'storage':['Depo yeri','DY','Depo Kodu','Depo_Yeri','Depo_yeri'],
 'storage_desc':['Depo yeri tanımı','Depo Yeri Tanımı','Depo_Yeri_Tanimi','Depo Tanımı','Depo Tanimi'],
 'movement':['İşlem türü','Hareket türü'],
 'material_doc':['Malzeme belgesi','Malzeme Belgesi'],
 'doc_date':['Belge tarihi','Belge Tarihi','Giriş Tarihi'],
 'posting_date':['Kayıt tarihi','Kayıt Tarihi'],
 'amount_upb':['Tutar (UPB)','Tutar UPB'],
 'pyp':['PYP öğesi','PYP Öğesi','PYP'],
 'target_storage':['Teslim alan DY','TESLİM ALAN DY','Hedef Depo'],
 'target_plant':['Alan üretim yeri','Alan Üretim Yeri','Hedef ÜY'],
 'material_group':['Mal grubu','Mal Grubu','Malzeme grubu','Malzeme Grubu'],
 'material_group_desc':['Mal grubu tanımı','Mal Grubu Tanımı','Malzeme grubu tanımı','Malzeme Grubu Tanımı'],
 'unrestricted':['Tahditsiz klnb.','Tahditsiz kullanılabilir','Tahditsiz'],
 'total_value':['Toplam değer','Toplam Değer'],
 'unrestricted_value':['Değer thds.klnb.','Değer thd.s.klnb.','Değer thd.s.kullanılabilir'],
 'valuation_type':['Parti','Değerleme türü','Değerleme Türü'],
 'guarantee_main':['Güvence Teminat Tutarı','Mlz Teminat','Malzeme Teminatı'],
 'guarantee_cash':['Nakdi Teminat Tutarı','Ek Teminat'],
 'guarantee_manual':['Manuel Artış Tutarı','Olur Artışı'],
 'z98_stock_value':['Depo Stok Tutarı (Toplam)','Depo Stok Tutarı Toplam'],
 'z98_available':['Rez.Yapılabilir Tutar (Açık Rez.Dahil)','Rezervasyon Yapılabilir Tutar'],
 'depot_code':['Depo Kodu'],
 'group_no':['Grup No'],
 'group_desc':['Grup Tanımı'],
 'company':['Yüklenici','Firma Adı','Firma_Adi'],
 'project':['Proje','Proje Adı','Proje_Adi'],
 'planned':['Teslim Edilen'],
 'given':['Verilen Malzeme Toplamı'],
 'remaining':['Teslim Edilen - Verilen Fark'],
 'source_uy':['TESLİM EDEN ÜY','Kaynak ÜY'],
 'source_dy':['TESLİM EDEN DY','Kaynak Depo'],
 'target_uy':['TESLİM ALAN ÜY','Hedef ÜY'],
 'target_dy':['Teslim alan DY','TESLİM ALAN DY','Hedef Depo'],
 'project_id':['Proje ID','Proje_ID'],
 'work_type':['İş Türü','İş Türü Kodu','Is_Turu','Is_Turu_Kodu'],
 'depot_type':['Depo Türü','Depo_Turu'],
 'contract':['Sözleşme Adı','Sozlesme_Adi'],
 'active':['Aktif'],
 'islem_code':['Islem_Turu','İşlem Türü'],
 'islem_desc':['Islem_Tanimi','İşlem Tanımı'],
 'tds_code':['TDS_Kod','TDS Kod'],
 'tds_desc':['TDS_Tanim','TDS Tanım','TDS Tanimi'],
}
ALIASES={k:{norm(x) for x in vals} for k,vals in ALIASES.items()}


def idx(headers:List[str], group:str)->int:
    a=ALIASES.get(group,set())
    for i,h in enumerate(headers):
        if norm(h) in a:return i
    return -1

def cell(row:List[str],i:int)->str:
    return row[i] if i>=0 and i<len(row) else ''

def number(v:Any)->float:
    if isinstance(v,(int,float)):return float(v)
    t=str(v or '').strip().replace(' ','')
    if not t:return 0.0
    if ',' in t and '.' in t:
        if t.rfind(',')>t.rfind('.'):
            t=t.replace('.','').replace(',','.')
        else:
            t=t.replace(',','')
    elif ',' in t:
        t=t.replace(',','.')
    elif '.' in t and re.fullmatch(r'[+-]?\d{1,3}(?:\.\d{3})+',t):
        # SAP/TR biçiminde nokta binlik ayırıcıdır: 1.106 -> 1106.
        t=t.replace('.','')
    try:return float(t)
    except:return 0.0

def work_code(v:Any)->str:
    n=norm(v)
    if n=='t' or 'tesis' in n:return 'T'
    if n=='k' or 'ket' in n:return 'K'
    if n=='b' or 'bakim' in n:return 'B'
    if n=='l' or 'led' in n:return 'L'
    return str(v or '').strip().upper()

def _open(file_info:Dict[str,Any]):
    p=Path(file_info['path'])
    enc=file_info.get('encoding') or detect_encoding(p)
    # content detector may report utf-8 for cp1254 if sample does not reach problematic bytes.
    try:
        f=p.open('r',encoding=enc,errors='strict',newline='')
        # force decode of first block only; later errors handled by reopen fallback below
        f.read(8192); f.seek(0); return f
    except Exception:
        try:f.close()
        except:pass
        enc=detect_encoding(p)
        return p.open('r',encoding=enc,errors='replace',newline='')

def _iter_rows(file_info:Dict[str,Any]):
    fh=_open(file_info)
    try:
        r=csv.reader(fh,delimiter=file_info.get('delimiter') or ';')
        start=max(0,int(file_info.get('headerRow') or 0)); headers=None
        for i,row in enumerate(r):
            if i<start:continue
            if headers is None:
                headers=row;yield ('__HEADER__',headers,i+1);continue
            if any(str(x or '').strip() for x in row):yield ('__ROW__',row,i+1)
    finally:fh.close()


def _selected_files(sources:Dict[str,Any])->List[Tuple[str,Dict[str,Any]]]:
    # Yalniz SQLite/Parquet motorunun gercekten kullandigi dosyalar motor
    # imzasina girer. SITE_MALZEMELER gibi tarayici tarafinda okunan kucuk
    # master dosyalari degistiginde 100+ MB MB51 indeksinin gereksiz yere
    # bastan kurulmasini engeller.
    indexed_master_roles={'SITE_DEPOLAR','SITE_PROJELER','TB_ISLEM_TURU','TB_TEDAS_KOD'}
    out=[]
    for source,info in (sources or {}).items():
        if not info:continue
        for f in info.get('files') or []:
            role=str(f.get('role') or '').upper()
            if source=='TANIMLAR' and role not in indexed_master_roles:
                continue
            out.append((source,f))
    return out


def current_signature(sources:Dict[str,Any])->Dict[str,Any]:
    files=[]
    for source,f in _selected_files(sources):
        p=Path(f['path'])
        files.append({'source':source,'name':p.name,'role':str(f.get('role') or ''),'size':p.stat().st_size,'quick_hash':quick_hash(p)})
    files.sort(key=lambda x:(x['source'],x['role'],x['name']))
    digest=hashlib.sha256(json.dumps(files,ensure_ascii=False,sort_keys=True).encode('utf-8')).hexdigest()
    return {'engine_version':ENGINE_VERSION,'schema_version':INDEX_SCHEMA_VERSION,'digest':digest,'files':files}


def load_manifest(path:Path)->Dict[str,Any]:
    try:return json.loads(path.read_text(encoding='utf-8-sig'))
    except:return {}

def engine_ready(index_db:Path,manifest_path:Path,sources:Dict[str,Any])->bool:
    if not index_db.exists() or not manifest_path.exists():return False
    m=load_manifest(manifest_path)
    if m.get('engine_version')!=ENGINE_VERSION or int(m.get('schema_version') or 0)!=INDEX_SCHEMA_VERSION:return False
    try:return m.get('digest')==current_signature(sources).get('digest')
    except:return False

def file_sha256(path:Path)->str:
    h=hashlib.sha256()
    with Path(path).open('rb') as fh:
        for chunk in iter(lambda:fh.read(1024*1024),b''):
            h.update(chunk)
    return h.hexdigest()


def _ruleset_info(app_dir:Path)->Dict[str,str]:
    path=Path(app_dir)/'CURRENT_RULES.json';raw=b'';data={}
    try:
        raw=path.read_bytes();data=json.loads(raw.decode('utf-8-sig'))
    except Exception:pass
    h=hashlib.sha256(raw).hexdigest() if raw else ''
    return {'name':str(data.get('ruleset') or 'CURRENT_RULES'),'version':str(data.get('version') or data.get('ruleset') or 'UNVERSIONED'),'hash':h}


def _active_pointer(app_dir:Path)->Path:
    return Path(app_dir)/'cache'/'ACTIVE_BUILD.json'


def resolve_active_build(app_dir:Path)->Dict[str,Any]:
    app_dir=Path(app_dir);pointer=_active_pointer(app_dir)
    if pointer.exists():
        try:
            data=json.loads(pointer.read_text(encoding='utf-8-sig'))
            def rp(k):
                raw=str(data.get(k) or '')
                return (app_dir/raw).resolve() if raw else None
            index_db=rp('index_db');manifest=rp('manifest');parquet_root=rp('parquet_root')
            if index_db and manifest and index_db.exists() and manifest.exists():
                return {**data,'indexDb':str(index_db),'manifestPath':str(manifest),'parquetRoot':str(parquet_root) if parquet_root else ''}
        except Exception:pass
    index_db=app_dir/'cache'/'talep_index.sqlite';manifest=app_dir/'cache'/'INDEX_MANIFEST.json';pq=app_dir/'parquet'/'ACTIVE'
    if index_db.exists() and manifest.exists():
        m=load_manifest(manifest)
        return {'build_id':m.get('build_id') or 'LEGACY','source_digest':m.get('digest',''),'index_db':str(index_db.relative_to(app_dir)),'manifest':str(manifest.relative_to(app_dir)),'parquet_root':str(pq.relative_to(app_dir)),'indexDb':str(index_db),'manifestPath':str(manifest),'parquetRoot':str(pq),'legacy':True}
    return {}


def active_index_db(app_dir:Path)->Path:
    b=resolve_active_build(app_dir);return Path(b.get('indexDb') or (Path(app_dir)/'cache'/'talep_index.sqlite'))


def active_manifest_path(app_dir:Path)->Path:
    b=resolve_active_build(app_dir);return Path(b.get('manifestPath') or (Path(app_dir)/'cache'/'INDEX_MANIFEST.json'))


def active_build_state(app_dir:Path,sources:Dict[str,Any])->Dict[str,Any]:
    app_dir=Path(app_dir);b=resolve_active_build(app_dir);sig=current_signature(sources or {})
    if not b:
        return {'ready':False,'status':'MISSING','buildId':'','sourceDigest':sig.get('digest',''),'indexSourceDigest':'','sourceIndexMatch':False}
    index_db=Path(b['indexDb']);manifest_path=Path(b['manifestPath']);m=load_manifest(manifest_path)
    schema_ok=m.get('engine_version')==ENGINE_VERSION and int(m.get('schema_version') or 0)==INDEX_SCHEMA_VERSION
    digest_match=m.get('digest')==sig.get('digest')
    usable=index_db.exists() and manifest_path.exists() and (schema_ok or bool(b.get('legacy')))
    ready=usable and schema_ok and digest_match
    parquet_files=[]
    p_root=Path(b.get('parquetRoot') or '') if b.get('parquetRoot') else None
    for name,info in (m.get('parquet') or {}).items():
        fp=(p_root/info.get('file','')) if p_root else Path(info.get('path') or '')
        parquet_files.append({'sourceFile':name,'path':str(fp),'sha256':info.get('sha256',''),'rows':info.get('rows',0)})
    return {
        'ready':bool(ready),'usable':bool(usable),'status':'READY' if ready else ('STALE' if usable else 'MISSING'),
        'buildId':m.get('build_id') or b.get('build_id') or 'LEGACY','sourceDigest':sig.get('digest',''),
        'indexSourceDigest':m.get('digest',''),'sourceIndexMatch':bool(digest_match),'indexDb':str(index_db),
        'manifestPath':str(manifest_path),'parquetRoot':str(p_root) if p_root else '',
        'builtAt':m.get('built_at',''),'indexHash':m.get('index_sha256',''),'manifestHash':b.get('manifest_sha256') or '',
        'parquetFiles':parquet_files,'rulesetVersion':(m.get('ruleset') or {}).get('version',''),
        'rulesetHash':(m.get('ruleset') or {}).get('hash',''),'quality':m.get('quality') or {},
        'engineVersion':m.get('engine_version',''),'schemaVersion':m.get('schema_version',0),'legacy':bool(b.get('legacy'))
    }



def _create_schema(c:sqlite3.Connection):
    c.executescript('''
    CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT);
    CREATE TABLE mb51(
      id INTEGER PRIMARY KEY, doc TEXT,date TEXT,posting_date TEXT,movement TEXT,material_code TEXT,material_desc TEXT,
      material_group TEXT,material_group_desc TEXT,qty REAL,uom TEXT,plant TEXT,dy TEXT,reservation TEXT,
      amount_upb REAL,pyp TEXT,target_dy TEXT,target_plant TEXT,search_text TEXT
    );
    CREATE TABLE mb52(
      id INTEGER PRIMARY KEY,plant TEXT,dy TEXT,dy_desc TEXT,material_group TEXT,material_group_desc TEXT,
      material_code TEXT,material_desc TEXT,uom TEXT,qty REAL,total_value REAL,unrestricted_value REAL,valuation_type TEXT,depot_type TEXT,search_text TEXT
    );
    CREATE TABLE zmm098(
      id INTEGER PRIMARY KEY,uy TEXT,dy TEXT,dy_desc TEXT,main REAL,cash REAL,manual REAL,stock_value REAL,available REAL,search_text TEXT
    );
    CREATE TABLE zmm048(
      id INTEGER PRIMARY KEY,reservation_no TEXT,material_code TEXT,material_desc TEXT,qty REAL,uom TEXT,source_uy TEXT,source_dy TEXT,target_uy TEXT,target_dy TEXT
    );
    CREATE TABLE kesif(
      id INTEGER PRIMARY KEY,work_code TEXT,sheet TEXT,row_no INTEGER,dy TEXT,group_no TEXT,group_desc TEXT,contractor TEXT,project TEXT,project_norm TEXT,
      material_code TEXT,material_desc TEXT,uom TEXT,planned REAL,given REAL,remaining REAL,reported_remaining REAL,mismatch INTEGER DEFAULT 0,duplicate INTEGER DEFAULT 0,issue INTEGER DEFAULT 0,search_text TEXT
    );
    CREATE TABLE depots(uy TEXT,dy TEXT,dy_desc TEXT,depot_type TEXT,work_type TEXT,contract TEXT,company TEXT,active TEXT,PRIMARY KEY(uy,dy));
    CREATE TABLE projects(project_id TEXT,project_name TEXT,project_norm TEXT,uy TEXT,dy TEXT,work_type TEXT,active TEXT,PRIMARY KEY(project_id,dy));
    CREATE TABLE islem_turu(code TEXT PRIMARY KEY,description TEXT,stock_effect TEXT);
    CREATE TABLE tedas_kod(code TEXT PRIMARY KEY,description TEXT);
    ''')


def _iso_date_text(v):
    t=str(v or '').strip()
    if not t:return ''
    for fmt in ('%d.%m.%Y','%d/%m/%Y','%Y-%m-%d','%Y%m%d'):
        try:return time.strftime('%Y-%m-%d',time.strptime(t,fmt))
        except Exception:pass
    return t

def _insert_mb51(c,f):
    hdr=None;ix={};buf=[];count=0
    for kind,row,rowno in _iter_rows(f):
        if kind=='__HEADER__':
            hdr=row;ix={g:idx(hdr,g) for g in ['material_doc','doc_date','posting_date','movement','material','material_desc','material_group','material_group_desc','qty','uom','plant','storage','reservation','amount_upb','pyp','target_storage','target_plant']};continue
        d=(str(cell(row,ix['material_doc'])).strip(),str(cell(row,ix['doc_date'])).strip(),_iso_date_text(cell(row,ix['posting_date']) or cell(row,ix['doc_date'])),str(cell(row,ix['movement'])).strip(),str(cell(row,ix['material'])).strip(),str(cell(row,ix['material_desc'])).strip(),str(cell(row,ix['material_group'])).strip(),str(cell(row,ix['material_group_desc'])).strip(),number(cell(row,ix['qty'])),str(cell(row,ix['uom'])).strip(),str(cell(row,ix['plant'])).strip(),str(cell(row,ix['storage'])).strip(),str(cell(row,ix['reservation'])).strip(),number(cell(row,ix['amount_upb'])),str(cell(row,ix['pyp'])).strip(),str(cell(row,ix['target_storage'])).strip(),str(cell(row,ix['target_plant'])).strip())
        if not (d[0] or d[4]):continue
        search=norm(' '.join(map(str,[d[0],d[1],d[2],d[3],d[4],d[5],d[6],d[7],d[10],d[11],d[12],d[14],d[15],d[16]])))
        buf.append(d+(search,));count+=1
        if len(buf)>=5000:c.executemany('INSERT INTO mb51(doc,date,posting_date,movement,material_code,material_desc,material_group,material_group_desc,qty,uom,plant,dy,reservation,amount_upb,pyp,target_dy,target_plant,search_text) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',buf);buf=[]
    if buf:c.executemany('INSERT INTO mb51(doc,date,posting_date,movement,material_code,material_desc,material_group,material_group_desc,qty,uom,plant,dy,reservation,amount_upb,pyp,target_dy,target_plant,search_text) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',buf)
    return count

def _insert_mb52(c,f):
    hdr=None;ix={};buf=[];count=0
    for kind,row,rowno in _iter_rows(f):
        if kind=='__HEADER__':
            hdr=row;ix={g:idx(hdr,g) for g in ['plant','storage','storage_desc','material_group','material_group_desc','material','material_desc','uom','unrestricted','total_value','unrestricted_value','valuation_type','depot_type']};continue
        plant=str(cell(row,ix['plant'])).strip();dy=str(cell(row,ix['storage'])).strip();mc=str(cell(row,ix['material'])).strip()
        if not (plant and dy and mc):continue
        vals=(plant,dy,str(cell(row,ix['storage_desc'])).strip(),str(cell(row,ix['material_group'])).strip(),str(cell(row,ix['material_group_desc'])).strip(),mc,str(cell(row,ix['material_desc'])).strip(),str(cell(row,ix['uom'])).strip(),number(cell(row,ix['unrestricted'])),number(cell(row,ix['total_value'])),number(cell(row,ix['unrestricted_value'])),str(cell(row,ix['valuation_type'])).strip(),str(cell(row,ix['depot_type'])).strip())
        search=norm(' '.join(map(str,[*vals[:8],vals[11],vals[12]])))
        buf.append(vals+(search,));count+=1
        if len(buf)>=5000:c.executemany('INSERT INTO mb52(plant,dy,dy_desc,material_group,material_group_desc,material_code,material_desc,uom,qty,total_value,unrestricted_value,valuation_type,depot_type,search_text) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',buf);buf=[]
    if buf:c.executemany('INSERT INTO mb52(plant,dy,dy_desc,material_group,material_group_desc,material_code,material_desc,uom,qty,total_value,unrestricted_value,valuation_type,depot_type,search_text) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',buf)
    return count

def _insert_z98(c,f):
    hdr=None;ix={};buf=[];count=0
    for kind,row,rowno in _iter_rows(f):
        if kind=='__HEADER__':
            hdr=row;ix={g:idx(hdr,g) for g in ['plant','storage','storage_desc','guarantee_main','guarantee_cash','guarantee_manual','z98_stock_value','z98_available']}
            preferred=norm('Rez.Yapılabilir Tutar (Açık Rez.Dahil)')
            for i,h in enumerate(hdr):
                if norm(h)==preferred:ix['z98_available']=i;break
            continue
        uy=str(cell(row,ix['plant'])).strip();dy=str(cell(row,ix['storage'])).strip()
        if not (uy and dy):continue
        desc=str(cell(row,ix['storage_desc'])).strip();vals=(uy,dy,desc,number(cell(row,ix['guarantee_main'])),number(cell(row,ix['guarantee_cash'])),number(cell(row,ix['guarantee_manual'])),number(cell(row,ix['z98_stock_value'])),number(cell(row,ix['z98_available'])),norm(' '.join([uy,dy,desc])))
        buf.append(vals);count+=1
    c.executemany('INSERT INTO zmm098(uy,dy,dy_desc,main,cash,manual,stock_value,available,search_text) VALUES(?,?,?,?,?,?,?,?,?)',buf)
    return count

def _insert_z048(c,f):
    hdr=None;ix={};buf=[];count=0
    for kind,row,rowno in _iter_rows(f):
        if kind=='__HEADER__':hdr=row;ix={g:idx(hdr,g) for g in ['reservation','material','material_desc','qty','uom','source_uy','source_dy','target_uy','target_dy']};continue
        rn=str(cell(row,ix['reservation'])).strip();mc=str(cell(row,ix['material'])).strip()
        if not (rn and mc):continue
        buf.append((rn,mc,str(cell(row,ix['material_desc'])).strip(),number(cell(row,ix['qty'])),str(cell(row,ix['uom'])).strip(),str(cell(row,ix['source_uy'])).strip(),str(cell(row,ix['source_dy'])).strip(),str(cell(row,ix['target_uy'])).strip(),str(cell(row,ix['target_dy'])).strip()));count+=1
        if len(buf)>=5000:c.executemany('INSERT INTO zmm048(reservation_no,material_code,material_desc,qty,uom,source_uy,source_dy,target_uy,target_dy) VALUES(?,?,?,?,?,?,?,?,?)',buf);buf=[]
    if buf:c.executemany('INSERT INTO zmm048(reservation_no,material_code,material_desc,qty,uom,source_uy,source_dy,target_uy,target_dy) VALUES(?,?,?,?,?,?,?,?,?)',buf)
    return count

def _insert_kesif(c,f):
    hdr=None;ix={};buf=[];count=0;role=str(f.get('role') or '').upper();sheet=str(f.get('sheet') or role or 'KESIFLER')
    for kind,row,rowno in _iter_rows(f):
        if kind=='__HEADER__':hdr=row;ix={g:idx(hdr,g) for g in ['depot_code','storage','group_no','group_desc','company','project','material','material_desc','uom','planned','given','remaining','work_type']};continue
        dy=str(cell(row,ix['depot_code']) or cell(row,ix['storage'])).strip();mc=str(cell(row,ix['material'])).strip()
        if not mc:continue
        code=role if role in ('T','K','B','L') else work_code(cell(row,ix['work_type']))
        if code not in ('T','K','B','L'):continue
        project=str(cell(row,ix['project'])).strip();planned=number(cell(row,ix['planned']));given=number(cell(row,ix['given']));reported=number(cell(row,ix['remaining']));remaining=planned-given;mismatch=1 if abs(remaining-reported)>0.001 else 0
        group_no=str(cell(row,ix['group_no'])).strip();group_desc=str(cell(row,ix['group_desc'])).strip();contractor=str(cell(row,ix['company'])).strip();md=str(cell(row,ix['material_desc'])).strip();uom=str(cell(row,ix['uom'])).strip();search=norm(' '.join([dy,group_no,group_desc,contractor,project,mc,md]))
        buf.append((code,sheet,rowno,dy,group_no,group_desc,contractor,project,norm(project),mc,md,uom,planned,given,remaining,reported,mismatch,search));count+=1
        if len(buf)>=5000:c.executemany('INSERT INTO kesif(work_code,sheet,row_no,dy,group_no,group_desc,contractor,project,project_norm,material_code,material_desc,uom,planned,given,remaining,reported_remaining,mismatch,search_text) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',buf);buf=[]
    if buf:c.executemany('INSERT INTO kesif(work_code,sheet,row_no,dy,group_no,group_desc,contractor,project,project_norm,material_code,material_desc,uom,planned,given,remaining,reported_remaining,mismatch,search_text) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',buf)
    return count

def _insert_master(c,f):
    role=str(f.get('role') or '').upper();hdr=None;ix={};count=0
    for kind,row,rowno in _iter_rows(f):
        if kind=='__HEADER__':
            hdr=row;ix={g:idx(hdr,g) for g in ['plant','storage','storage_desc','depot_type','work_type','contract','company','active','project_id','project','islem_code','islem_desc','tds_code','tds_desc']};continue
        if role=='SITE_DEPOLAR':
            uy=str(cell(row,ix['plant'])).strip();dy=str(cell(row,ix['storage'])).strip()
            if not (uy and dy):continue
            c.execute('INSERT OR REPLACE INTO depots(uy,dy,dy_desc,depot_type,work_type,contract,company,active) VALUES(?,?,?,?,?,?,?,?)',(uy,dy,str(cell(row,ix['storage_desc'])).strip(),str(cell(row,ix['depot_type'])).strip(),str(cell(row,ix['work_type'])).strip(),str(cell(row,ix['contract'])).strip(),str(cell(row,ix['company'])).strip(),str(cell(row,ix['active'])).strip()));count+=1
        elif role=='SITE_PROJELER':
            pid=str(cell(row,ix['project_id'])).strip();dy=str(cell(row,ix['storage'])).strip();pn=str(cell(row,ix['project'])).strip()
            if not (pid and dy):continue
            c.execute('INSERT OR REPLACE INTO projects(project_id,project_name,project_norm,uy,dy,work_type,active) VALUES(?,?,?,?,?,?,?)',(pid,pn,norm(pn),str(cell(row,ix['plant'])).strip(),dy,str(cell(row,ix['work_type'])).strip(),str(cell(row,ix['active'])).strip()));count+=1
        elif role=='TB_ISLEM_TURU':
            code=str(cell(row,ix['islem_code'])).strip();desc=str(cell(row,ix['islem_desc'])).strip();
            if code:c.execute('INSERT OR REPLACE INTO islem_turu(code,description,stock_effect) VALUES(?,?,?)',(code,desc,str(row[2] if len(row)>2 else '').strip()));count+=1
        elif role=='TB_TEDAS_KOD':
            code=str(cell(row,ix['tds_code'])).strip();desc=str(cell(row,ix['tds_desc'])).strip();
            if code:c.execute('INSERT OR IGNORE INTO tedas_kod(code,description) VALUES(?,?)',(code,desc));count+=1
    return count


def _finalize(c:sqlite3.Connection):
    # Duplicate semantics: TESIS uses Depo+Proje+Malzeme, K/B/L uses Depo+Malzeme.
    c.executescript('''
    CREATE TEMP TABLE kesif_dup AS
      SELECT work_code,dy,project_norm AS p,material_code,COUNT(*) cnt
      FROM kesif WHERE work_code='T' GROUP BY work_code,dy,project_norm,material_code HAVING COUNT(*)>1;
    CREATE INDEX ix_kesif_dup ON kesif_dup(work_code,dy,p,material_code);
    UPDATE kesif SET duplicate=1 WHERE work_code='T' AND EXISTS(
      SELECT 1 FROM kesif_dup d WHERE d.work_code=kesif.work_code AND d.dy=kesif.dy AND d.material_code=kesif.material_code
      AND d.p=kesif.project_norm
    );
    UPDATE kesif SET issue=CASE WHEN mismatch=1 OR remaining<0 OR duplicate=1 THEN 1 ELSE 0 END;

    CREATE INDEX ix_mb51_depot ON mb51(plant,dy);
    CREATE INDEX ix_mb51_mat ON mb51(material_code);
    CREATE INDEX ix_mb51_group ON mb51(plant,dy,material_group,material_group_desc);
    CREATE INDEX ix_mb51_posting ON mb51(posting_date,movement,dy);
    CREATE INDEX ix_mb51_flow ON mb51(dy,movement,posting_date);
    CREATE INDEX ix_mb51_pyp ON mb51(pyp,dy,posting_date);
    CREATE INDEX ix_mb52_depot ON mb52(plant,dy);
    CREATE INDEX ix_mb52_mat ON mb52(material_code);
    CREATE INDEX ix_z98_depot ON zmm098(uy,dy);
    CREATE INDEX ix_z048_res ON zmm048(reservation_no,material_code);
    CREATE INDEX ix_kesif_main ON kesif(work_code,dy,material_code);
    CREATE INDEX ix_kesif_project ON kesif(work_code,dy,project_norm,material_code);
    CREATE INDEX ix_kesif_status ON kesif(work_code,issue,mismatch,duplicate,remaining);
    CREATE INDEX ix_project_depot ON projects(dy,project_norm);

    CREATE TABLE mb51_material_group AS
      SELECT material_code,MAX(material_group) material_group,MAX(material_group_desc) material_group_desc
      FROM mb51 WHERE material_code<>'' GROUP BY material_code;
    CREATE UNIQUE INDEX ix_mg_mat ON mb51_material_group(material_code);
    CREATE TABLE mb51_depots AS SELECT DISTINCT plant,dy FROM mb51 WHERE dy<>'';
    CREATE INDEX ix_mbd ON mb51_depots(plant,dy);
    CREATE TABLE mb51_groups AS
      SELECT DISTINCT plant,dy,CASE WHEN material_group<>'' THEN material_group ELSE lower(replace(replace(replace(replace(replace(replace(replace(material_group_desc,' ',''),'ı','i'),'ş','s'),'ğ','g'),'ü','u'),'ö','o'),'ç','c')) END token
      FROM mb51 WHERE dy<>'' AND (material_group<>'' OR material_group_desc<>'');
    CREATE INDEX ix_mbg ON mb51_groups(plant,dy,token);

    CREATE TABLE kesif_stats AS
      SELECT work_code,
             COUNT(*) rows,
             COUNT(DISTINCT dy) depots,
             SUM(CASE WHEN remaining>0 THEN 1 ELSE 0 END) positive,
             SUM(CASE WHEN remaining=0 THEN 1 ELSE 0 END) zero,
             SUM(CASE WHEN remaining<0 THEN 1 ELSE 0 END) negative,
             SUM(mismatch) mismatch,
             SUM(duplicate) duplicateRows,
             SUM(issue) issues,
             0 projects,
             0 duplicateKeys
      FROM kesif GROUP BY work_code;
    UPDATE kesif_stats SET projects=(SELECT COUNT(*) FROM (SELECT 1 FROM kesif WHERE work_code='T' AND project<>'' GROUP BY dy,project_norm)) WHERE work_code='T';
    UPDATE kesif_stats SET duplicateKeys=(SELECT COUNT(*) FROM (SELECT 1 FROM kesif WHERE work_code='T' GROUP BY dy,project_norm,material_code HAVING COUNT(*)>1)) WHERE work_code='T';
    CREATE UNIQUE INDEX ix_kesif_stats ON kesif_stats(work_code);
    ANALYZE;
    ''')


def _quality_checks(c:sqlite3.Connection, expected_sources:Dict[str,Any])->Dict[str,Any]:
    c.executescript("""
    CREATE TABLE IF NOT EXISTS data_quality_findings(
      id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT,source TEXT,severity TEXT,count INTEGER,description TEXT,details_json TEXT
    );
    CREATE TABLE IF NOT EXISTS data_quality_summary(
      source TEXT PRIMARY KEY,critical INTEGER DEFAULT 0,warning INTEGER DEFAULT 0,info INTEGER DEFAULT 0,total INTEGER DEFAULT 0
    );
    DELETE FROM data_quality_findings;DELETE FROM data_quality_summary;
    """)
    findings=[]
    def scalar(sql,args=()):
        try:return int(c.execute(sql,args).fetchone()[0] or 0)
        except Exception:return 0
    def sample_rows(sql,args=()):
        try:
            cur=c.execute(sql,args);cols=[d[0] for d in cur.description]
            return [dict(zip(cols,r)) for r in cur.fetchmany(5)]
        except Exception:return []
    def add(code,source,severity,count,description,sample_sql=None,sample_args=()):
        count=int(count or 0)
        if count<=0:return
        det={'samples':sample_rows(sample_sql,sample_args) if sample_sql else []}
        c.execute('INSERT INTO data_quality_findings(code,source,severity,count,description,details_json) VALUES(?,?,?,?,?,?)',(code,source,severity,count,description,json.dumps(det,ensure_ascii=False)))
        findings.append({'code':code,'source':source,'severity':severity,'count':count,'description':description,**det})

    table_by_source={'MB51':'mb51','MB52':'mb52','ZMM098':'zmm098','ZMM048':'zmm048','KESIFLER':'kesif'}
    for src,table in table_by_source.items():
        if expected_sources.get(src) and scalar(f'SELECT COUNT(*) FROM {table}')==0:
            add('EMPTY_SOURCE',src,'CRITICAL',1,'Kaynak bulundu ancak indekslenebilir veri satırı oluşmadı.')

    add('MB51_DUPLICATE_EVENT','MB51','WARNING',scalar('SELECT COUNT(*) FROM (SELECT doc,date,movement,material_code,qty,plant,dy,reservation,COUNT(*) c FROM mb51 GROUP BY doc,date,movement,material_code,qty,plant,dy,reservation HAVING c>1)'),'Aynı MB51 olay anahtarında birden fazla satır bulundu.','SELECT doc,date,movement,material_code,qty,plant,dy,reservation,COUNT(*) count FROM mb51 GROUP BY doc,date,movement,material_code,qty,plant,dy,reservation HAVING count>1 LIMIT 5')
    add('MB51_REQUIRED_GAP','MB51','WARNING',scalar("SELECT COUNT(*) FROM mb51 WHERE material_code='' OR movement='' OR dy=''"),'MB51 kritik alanlarından en az biri boş.',"SELECT doc,date,movement,material_code,plant,dy,reservation FROM mb51 WHERE material_code='' OR movement='' OR dy='' LIMIT 5")
    allowed=('301','302','303','311','312','411','412','415','416','221','222','Z22','980','990');ph=','.join('?' for _ in allowed)
    add('MB51_UNKNOWN_MOVEMENT','MB51','WARNING',scalar(f"SELECT COUNT(*) FROM mb51 WHERE movement<>'' AND upper(movement) NOT IN ({ph})",allowed),'Tanımlı hareket sözlüğü dışında MB51 hareket türü bulundu.',f"SELECT movement,COUNT(*) count FROM mb51 WHERE movement<>'' AND upper(movement) NOT IN ({ph}) GROUP BY movement LIMIT 5",allowed)

    add('ZMM098_DUPLICATE_DEPOT','ZMM098','WARNING',scalar('SELECT COUNT(*) FROM (SELECT uy,dy,COUNT(*) c FROM zmm098 GROUP BY uy,dy HAVING c>1)'),'Aynı ZMM098 ÜY+depo anahtarında mükerrer kayıt bulundu.','SELECT uy,dy,COUNT(*) count FROM zmm098 GROUP BY uy,dy HAVING count>1 LIMIT 5')
    add('ZMM098_ORPHAN_DEPOT','ZMM098','WARNING',scalar("SELECT COUNT(*) FROM zmm098 z WHERE z.dy<>'' AND NOT EXISTS(SELECT 1 FROM depots d WHERE d.dy=z.dy)"),'ZMM098 deposu depo ana verisinde eşleşmedi.',"SELECT uy,dy,dy_desc FROM zmm098 z WHERE z.dy<>'' AND NOT EXISTS(SELECT 1 FROM depots d WHERE d.dy=z.dy) LIMIT 5")

    add('ZMM048_DUPLICATE_RES_MAT','ZMM048','WARNING',scalar('SELECT COUNT(*) FROM (SELECT reservation_no,material_code,COUNT(*) c FROM zmm048 GROUP BY reservation_no,material_code HAVING c>1)'),'Aynı Rezervasyon+Malzeme anahtarında birden fazla ZMM048 satırı bulundu. Kalem no kaynağı ayrıca doğrulanmalıdır.','SELECT reservation_no,material_code,COUNT(*) count FROM zmm048 GROUP BY reservation_no,material_code HAVING count>1 LIMIT 5')
    add('ZMM048_NONPOSITIVE_QTY','ZMM048','WARNING',scalar('SELECT COUNT(*) FROM zmm048 WHERE qty<=0'),'ZMM048 rezervasyon miktarı sıfır veya negatif.','SELECT reservation_no,material_code,qty,target_dy FROM zmm048 WHERE qty<=0 LIMIT 5')
    add('ZMM048_ORPHAN_TARGET','ZMM048','WARNING',scalar("SELECT COUNT(*) FROM zmm048 z WHERE z.target_dy<>'' AND NOT EXISTS(SELECT 1 FROM depots d WHERE d.dy=z.target_dy)"),'ZMM048 hedef deposu depo ana verisinde eşleşmedi.',"SELECT reservation_no,material_code,target_uy,target_dy FROM zmm048 z WHERE z.target_dy<>'' AND NOT EXISTS(SELECT 1 FROM depots d WHERE d.dy=z.target_dy) LIMIT 5")

    add('MB52_MISSING_VALUATION','MB52','WARNING',scalar("SELECT COUNT(*) FROM mb52 WHERE valuation_type=''"),'MB52 değerleme türü boş.',"SELECT plant,dy,material_code,qty,total_value FROM mb52 WHERE valuation_type='' LIMIT 5")
    add('MB52_YENI_ZERO_QTY_VALUE','MB52','WARNING',scalar("SELECT COUNT(*) FROM mb52 WHERE lower(valuation_type)='yeni' AND abs(qty)<0.000001 AND abs(total_value)>0.01"),'YENİ değerleme türünde miktar sıfırken toplam değer sıfır değil.',"SELECT plant,dy,material_code,qty,total_value FROM mb52 WHERE lower(valuation_type)='yeni' AND abs(qty)<0.000001 AND abs(total_value)>0.01 LIMIT 5")

    add('KESIF_DUPLICATE','KESIFLER','WARNING',scalar('SELECT COUNT(*) FROM kesif WHERE duplicate=1'),'Keşif benzersizlik anahtarında mükerrer satırlar bulundu.','SELECT work_code,dy,project,material_code,COUNT(*) count FROM kesif WHERE duplicate=1 GROUP BY work_code,dy,project,material_code LIMIT 5')
    add('KESIF_REMAINING_MISMATCH','KESIFLER','WARNING',scalar('SELECT COUNT(*) FROM kesif WHERE mismatch=1'),'Keşif bildirilen kalan değeri hesaplanan kalanla uyuşmuyor.','SELECT work_code,dy,project,material_code,planned,given,reported_remaining,remaining FROM kesif WHERE mismatch=1 LIMIT 5')
    add('KESIF_NEGATIVE_REMAINING','KESIFLER','WARNING',scalar('SELECT COUNT(*) FROM kesif WHERE remaining<0'),'Keşif kalan miktarı negatif.','SELECT work_code,dy,project,material_code,planned,given,remaining FROM kesif WHERE remaining<0 LIMIT 5')
    add('KESIF_ORPHAN_DEPOT','KESIFLER','WARNING',scalar("SELECT COUNT(*) FROM kesif k WHERE k.dy<>'' AND NOT EXISTS(SELECT 1 FROM depots d WHERE d.dy=k.dy)"),'Keşif deposu depo ana verisinde eşleşmedi.',"SELECT DISTINCT work_code,dy FROM kesif k WHERE k.dy<>'' AND NOT EXISTS(SELECT 1 FROM depots d WHERE d.dy=k.dy) LIMIT 5")
    add('PROJECT_ORPHAN_DEPOT','TANIMLAR','WARNING',scalar("SELECT COUNT(*) FROM projects p WHERE p.dy<>'' AND NOT EXISTS(SELECT 1 FROM depots d WHERE d.dy=p.dy)"),'Proje depo kodu depo ana verisinde eşleşmedi.',"SELECT project_id,project_name,uy,dy FROM projects p WHERE p.dy<>'' AND NOT EXISTS(SELECT 1 FROM depots d WHERE d.dy=p.dy) LIMIT 5")

    # MB51 tarih domain kontrolü: yaygın SAP tarih biçimlerini güvenli biçimde doğrula.
    future_dates=0;invalid_dates=0;future_samples=[];invalid_samples=[];now_ts=time.time()+86400
    for raw_date,cnt in c.execute("SELECT date,COUNT(*) FROM mb51 WHERE date<>'' GROUP BY date").fetchall():
        text=str(raw_date or '').strip();parsed=None
        for fmt in ('%d.%m.%Y','%Y-%m-%d','%d/%m/%Y','%d.%m.%y','%Y%m%d'):
            try: parsed=time.mktime(time.strptime(text,fmt));break
            except Exception: pass
        if parsed is None:
            invalid_dates+=int(cnt or 0)
            if len(invalid_samples)<5: invalid_samples.append({'date':text,'count':int(cnt or 0)})
        elif parsed>now_ts:
            future_dates+=int(cnt or 0)
            if len(future_samples)<5: future_samples.append({'date':text,'count':int(cnt or 0)})
    if invalid_dates:
        det={'samples':invalid_samples};c.execute('INSERT INTO data_quality_findings(code,source,severity,count,description,details_json) VALUES(?,?,?,?,?,?)',('MB51_INVALID_DATE','MB51','WARNING',invalid_dates,'MB51 belge tarihi tanınan tarih formatlarından biri değil.',json.dumps(det,ensure_ascii=False)));findings.append({'code':'MB51_INVALID_DATE','source':'MB51','severity':'WARNING','count':invalid_dates,'description':'MB51 belge tarihi tanınan tarih formatlarından biri değil.',**det})
    if future_dates:
        det={'samples':future_samples};c.execute('INSERT INTO data_quality_findings(code,source,severity,count,description,details_json) VALUES(?,?,?,?,?,?)',('MB51_FUTURE_DATE','MB51','WARNING',future_dates,'MB51 belge tarihi gelecekte görünüyor.',json.dumps(det,ensure_ascii=False)));findings.append({'code':'MB51_FUTURE_DATE','source':'MB51','severity':'WARNING','count':future_dates,'description':'MB51 belge tarihi gelecekte görünüyor.',**det})

    by={}
    for f in findings:
        x=by.setdefault(f['source'],{'critical':0,'warning':0,'info':0,'total':0});k=f['severity'].lower();x[k]=x.get(k,0)+f['count'];x['total']+=f['count']
    for source,x in by.items():
        c.execute('INSERT OR REPLACE INTO data_quality_summary(source,critical,warning,info,total) VALUES(?,?,?,?,?)',(source,x['critical'],x['warning'],x['info'],x['total']))
    critical=sum(f['count'] for f in findings if f['severity']=='CRITICAL');warning=sum(f['count'] for f in findings if f['severity']=='WARNING')
    return {'level':'CRITICAL' if critical else ('WARNING' if warning else 'NORMAL'),'critical':critical,'warning':warning,'findingTypes':len(findings),'bySource':by,'findings':findings}


def quality_summary(index_db:Path)->Dict[str,Any]:
    if not Path(index_db).exists():return {'level':'CRITICAL','critical':1,'warning':0,'findingTypes':1,'findings':[{'code':'INDEX_MISSING','severity':'CRITICAL','count':1}]}
    try:
        with connect(Path(index_db)) as c:
            rows=c.execute("SELECT code,source,severity,count,description,details_json FROM data_quality_findings ORDER BY CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'WARNING' THEN 1 ELSE 2 END,count DESC").fetchall()
        findings=[]
        for r in rows:
            d=dict(r)
            try:d.update(json.loads(d.pop('details_json') or '{}'))
            except Exception:d.pop('details_json',None)
            findings.append(d)
        critical=sum(int(x['count']) for x in findings if x['severity']=='CRITICAL');warning=sum(int(x['count']) for x in findings if x['severity']=='WARNING')
        return {'level':'CRITICAL' if critical else ('WARNING' if warning else 'NORMAL'),'critical':critical,'warning':warning,'findingTypes':len(findings),'findings':findings}
    except Exception as exc:return {'level':'WARNING','critical':0,'warning':1,'findingTypes':1,'error':str(exc),'findings':[]}


def build_engine(app_dir:Path,sources:Dict[str,Any],build_parquet:bool=True)->Dict[str,Any]:
    """Yeni motoru staging alanda kurar; ACTIVE pointer yalnız tam doğrulama sonrası değişir."""
    app_dir=Path(app_dir);cache=app_dir/'cache';cache.mkdir(parents=True,exist_ok=True)
    sig=current_signature(sources);rules=_ruleset_info(app_dir);stamp=time.strftime('%Y%m%dT%H%M%S');build_id=f"IDX-{stamp}-{sig['digest'][:10]}"
    build_dir=cache/'builds'/build_id;build_dir.mkdir(parents=True,exist_ok=True);pqroot=app_dir/'parquet'/'BUILDS'/build_id;pqroot.mkdir(parents=True,exist_ok=True)
    index_db=build_dir/'talep_index.sqlite';manifest_path=build_dir/'INDEX_MANIFEST.json'
    stats={'sources':{},'started_at':time.time(),'engine_version':ENGINE_VERSION,'schema_version':INDEX_SCHEMA_VERSION,'build_id':build_id};quality={}
    c=sqlite3.connect(index_db)
    try:
        c.execute('PRAGMA journal_mode=OFF');c.execute('PRAGMA synchronous=OFF');c.execute('PRAGMA temp_store=MEMORY');c.execute('PRAGMA cache_size=-131072')
        _create_schema(c)
        for source,info in (sources or {}).items():
            if not info:continue
            for f in info.get('files') or []:
                role=str(f.get('role') or '')
                if source=='MB51':n=_insert_mb51(c,f)
                elif source=='MB52':n=_insert_mb52(c,f)
                elif source=='ZMM098':n=_insert_z98(c,f)
                elif source=='ZMM048':n=_insert_z048(c,f)
                elif source=='KESIFLER':n=_insert_kesif(c,f)
                elif source=='TANIMLAR':n=_insert_master(c,f)
                else:n=0
                stats['sources'][Path(f['path']).name]={'source':source,'role':role,'rows_indexed':n}
        _finalize(c);quality=_quality_checks(c,sources or {})
        for k,v in [('engine_version',ENGINE_VERSION),('schema_version',str(INDEX_SCHEMA_VERSION)),('source_digest',sig['digest']),('build_id',build_id),('ruleset_version',rules['version']),('ruleset_hash',rules['hash']),('built_at',time.strftime('%Y-%m-%dT%H:%M:%S'))]:c.execute('INSERT INTO meta(key,value) VALUES(?,?)',(k,v))
        c.commit()
    finally:c.close()
    if quality.get('level')=='CRITICAL':
        shutil.rmtree(build_dir,ignore_errors=True);shutil.rmtree(pqroot,ignore_errors=True)
        raise RuntimeError('Yeni indeks CRITICAL veri kalite kontrolünden geçemedi; mevcut ACTIVE indeks korunuyor.')

    parquet_stats={}
    if build_parquet:
        op_names={'ZMM048','MB51','MB52','ZMM098','KESIFLER'}
        for source,info in (sources or {}).items():
            if source not in op_names or not info:continue
            for f in info.get('files') or []:
                p=Path(f['path']);target=pqroot/(p.stem+'.parquet')
                res=csv_to_parquet(p,target,source_version=sig['digest'][:12],row_group_size=65536);verify_parquet_container(target);res['sha256']=file_sha256(target);parquet_stats[p.name]=res

    index_hash=file_sha256(index_db)
    manifest={**sig,'build_id':build_id,'built_at':time.strftime('%Y-%m-%dT%H:%M:%S'),'index_db':index_db.name,'index_sha256':index_hash,'ruleset':rules,'quality':quality,'parquet':{k:{'file':Path(v['parquet']).name,'rows':v['rows'],'columns':v['columns'],'source_hash':v['source_hash'],'size':v['size'],'sha256':v.get('sha256','')} for k,v in parquet_stats.items()},'stats':stats['sources']}
    tmp_manifest=manifest_path.with_suffix('.json.next');tmp_manifest.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8');os.replace(tmp_manifest,manifest_path);manifest_hash=file_sha256(manifest_path)
    pointer={'build_id':build_id,'source_digest':sig['digest'],'created_at':time.strftime('%Y-%m-%dT%H:%M:%S'),'index_db':str(index_db.relative_to(app_dir)),'manifest':str(manifest_path.relative_to(app_dir)),'parquet_root':str(pqroot.relative_to(app_dir)),'index_sha256':index_hash,'manifest_sha256':manifest_hash,'ruleset_version':rules['version'],'ruleset_hash':rules['hash']}
    pointer_path=_active_pointer(app_dir);tmp_pointer=pointer_path.with_suffix('.json.next');tmp_pointer.write_text(json.dumps(pointer,ensure_ascii=False,indent=2),encoding='utf-8');os.replace(tmp_pointer,pointer_path)
    try:
        builds=sorted([x for x in (cache/'builds').iterdir() if x.is_dir()],key=lambda x:x.stat().st_mtime,reverse=True)
        for old in builds[3:]:
            if old.name!=build_id:shutil.rmtree(old,ignore_errors=True);shutil.rmtree(app_dir/'parquet'/'BUILDS'/old.name,ignore_errors=True)
    except Exception:pass
    stats.update({'finished_at':time.time(),'index_db':str(index_db),'manifest':str(manifest_path),'parquet':parquet_stats,'digest':sig['digest'],'build_id':build_id,'quality':quality,'pointer':str(pointer_path),'index_hash':index_hash,'manifest_hash':manifest_hash})
    return stats


def connect(index_db:Path)->sqlite3.Connection:
    c=sqlite3.connect(index_db,timeout=30);c.row_factory=sqlite3.Row;c.execute('PRAGMA query_only=ON');c.execute('PRAGMA temp_store=MEMORY');return c

def _page(page,size):
    size=max(25,min(500,int(size or 100)));page=max(1,int(page or 1));return page,size,(page-1)*size

# FIX28Q: full-data column filters for indexed grids; SQL keys hard whitelisted.
def _q28_grid_predicates(filters, fields):
    if not isinstance(filters,dict):raise ValueError('Sütun filtreleri nesne olmalı')
    if len(filters)>8:raise ValueError('En fazla 8 sütun filtresi')
    cond=[];params=[]
    for key,rule in filters.items():
        if key not in fields or not isinstance(rule,dict):raise ValueError('Geçersiz sütun filtresi')
        v=str(rule.get('value') or '').strip()[:120]
        if not v:continue
        op=str(rule.get('op') or 'contains');col=fields[key]
        if op=='contains':cond.append("LOWER(COALESCE(CAST("+col+" AS TEXT),'')) LIKE ?");params.append('%'+v.lower()+'%')
        elif op=='equals':cond.append("LOWER(COALESCE(CAST("+col+" AS TEXT),'')) = ?");params.append(v.lower())
        elif op in ('gt','lt','gte','lte'):
            if key not in ('qty','planned','given','remaining','main','available','totalValue'):raise ValueError('Bu sütun sayısal filtrelenemez')
            try:n=float(v.replace(',','.'))
            except ValueError:raise ValueError('Sayısal filtre hatası')
            op_sql={'gt':'>','lt':'<','gte':'>=','lte':'<='}[op]
            cond.append('CAST('+col+' AS REAL) '+op_sql+' ?');params.append(n)
        elif op in ('date_from','date_to') and key in ('date','postingDate'):
            import datetime as _dt
            try:_dt.date.fromisoformat(v)
            except ValueError:raise ValueError('Tarih YYYY-MM-DD olmalı')
            cond.append(col+(' >= ?' if op=='date_from' else ' <= ?'));params.append(v)
        else:raise ValueError('Filtre karşılaştırması desteklenmiyor')
    return cond,params

def _q28_grid_order(fields,key,dir,default='id'):
    col=fields.get(str(key)) or default
    direction='DESC' if str(dir).lower()=='desc' else 'ASC'
    return ' ORDER BY '+col+' '+direction+', id'

def grid_movements(index_db:Path,q:str,page:int,size:int,column_filters=None,sort_by="",sort_dir="asc"):
    page,size,off=_page(page,size);nq=norm(q);where='';args=[]
    if nq:where=' WHERE search_text LIKE ?';args=['%'+nq+'%']
    fields={'doc':'doc','date':'date','postingDate':'posting_date','movement':'movement','materialCode':'material_code','materialDesc':'material_desc','qty':'qty','uom':'uom','plant':'plant','dy':'dy','reservation':'reservation'}
    more,vals=_q28_grid_predicates(column_filters or {},fields)
    where+=(' AND ' if where else ' WHERE ')+' AND '.join(more) if more else ''
    args+=vals
    with connect(index_db) as c:
        total=c.execute('SELECT COUNT(*) FROM mb51'+where,args).fetchone()[0];rows=c.execute('SELECT doc,date,posting_date postingDate,movement,material_code materialCode,material_desc materialDesc,material_group materialGroupDesc,qty,uom,plant,dy,reservation,amount_upb amount,pyp,target_dy targetDy,target_plant targetPlant FROM mb51'+where+_q28_grid_order(fields,sort_by,sort_dir)+' LIMIT ? OFFSET ?',args+[size,off]).fetchall()
    pages=max(1,(total+size-1)//size);return {'rows':[dict(r) for r in rows],'total':total,'page':min(page,pages),'pages':pages,'pageSize':size,'source':'MB51','engine':'SQLITE_INDEX'}

def grid_guarantee(index_db:Path,q:str,page:int,size:int,column_filters=None,sort_by="",sort_dir="asc"):
    page,size,off=_page(page,size);nq=norm(q);where='';args=[]
    if nq:where=' WHERE search_text LIKE ?';args=['%'+nq+'%']
    fields={'uy':'uy','dy':'dy','dyDesc':'dy_desc','main':'main','cash':'cash','manual':'manual','available':'available'}
    more,vals=_q28_grid_predicates(column_filters or {},fields)
    where+=(' AND ' if where else ' WHERE ')+' AND '.join(more) if more else ''
    args+=vals
    with connect(index_db) as c:
        total=c.execute('SELECT COUNT(*) FROM zmm098'+where,args).fetchone()[0];rows=c.execute('SELECT uy,dy,dy_desc dyDesc,main,cash,manual,stock_value stockValue,available FROM zmm098'+where+_q28_grid_order(fields,sort_by,sort_dir)+' LIMIT ? OFFSET ?',args+[size,off]).fetchall()
    pages=max(1,(total+size-1)//size);return {'rows':[dict(r) for r in rows],'total':total,'page':min(page,pages),'pages':pages,'pageSize':size,'source':'ZMM098','engine':'SQLITE_INDEX'}

def grid_stocks(index_db:Path,q:str,page:int,size:int,scope:str='mb51_group',column_filters=None,sort_by='',sort_dir='asc'):
    page,size,off=_page(page,size);nq=norm(q);scope=str(scope or 'mb51_group');conds=[];args=[]
    if nq:conds.append('s.search_text LIKE ?');args.append('%'+nq+'%')
    fields={'plant':'s.plant','dy':'s.dy','dyDesc':'s.dy_desc','materialCode':'s.material_code','materialDesc':'s.material_desc','uom':'s.uom','qty':'s.qty','valuationType':'s.valuation_type','totalValue':'s.total_value'}
    more,vals=_q28_grid_predicates(column_filters or {},fields);conds+=more;args+=vals
    if scope=='mb51_depot':
        conds.append("EXISTS(SELECT 1 FROM mb51_depots d WHERE d.dy=s.dy AND (d.plant=s.plant OR d.plant=''))")
        label='Hareket Görülen Depolar / Tüm Mal Grupları'
    elif scope=='mb51_group':
        # material group fallback from MB51 if MB52 group is blank
        conds.append("EXISTS(SELECT 1 FROM mb51_groups g WHERE g.dy=s.dy AND (g.plant=s.plant OR g.plant='') AND g.token=(CASE WHEN COALESCE(NULLIF(s.material_group,''),mg.material_group,'')<>'' THEN COALESCE(NULLIF(s.material_group,''),mg.material_group,'') ELSE lower(replace(replace(replace(replace(replace(replace(replace(COALESCE(NULLIF(s.material_group_desc,''),mg.material_group_desc,''),' ',''),'ı','i'),'ş','s'),'ğ','g'),'ü','u'),'ö','o'),'ç','c')) END))")
        label='Hareket Görülen Depo + Mal Grubu'
    else:label='Tüm Stoklar'
    where=(' WHERE '+' AND '.join(conds)) if conds else ''
    base=' FROM mb52 s LEFT JOIN mb51_material_group mg ON mg.material_code=s.material_code '
    with connect(index_db) as c:
        total=c.execute('SELECT COUNT(*)'+base+where,args).fetchone()[0]
        sql='''SELECT s.plant,s.dy,s.dy_desc dyDesc,s.material_group materialGroup,s.material_group_desc materialGroupDesc,
        COALESCE(NULLIF(s.material_group,''),mg.material_group,'') displayMaterialGroup,
        COALESCE(NULLIF(s.material_group_desc,''),mg.material_group_desc,'') displayMaterialGroupDesc,
        s.material_code materialCode,s.material_desc materialDesc,s.uom,s.qty,s.total_value totalValue,s.unrestricted_value unrestrictedValue,s.valuation_type valuationType,s.depot_type depotType'''+base+where+_q28_grid_order(fields,sort_by,sort_dir,'s.id').replace(', id',', s.id')+' LIMIT ? OFFSET ?'
        rows=c.execute(sql,args+[size,off]).fetchall()
    pages=max(1,(total+size-1)//size);return {'rows':[dict(r) for r in rows],'total':total,'page':min(page,pages),'pages':pages,'pageSize':size,'source':'MB52','scopeLabel':label,'note':'','engine':'SQLITE_INDEX'}

def grid_kesif(index_db:Path,q:str,page:int,size:int,code:str='T',status:str='',depot:str='',column_filters=None,sort_by='',sort_dir='asc'):
    page,size,off=_page(page,size);code=str(code or 'T').upper();nq=norm(q);conds=['work_code=?'];args=[code]
    if nq:conds.append('search_text LIKE ?');args.append('%'+nq+'%')
    if depot:conds.append('dy=?');args.append(str(depot))
    if status=='issues':conds.append('issue=1')
    elif status=='negative':conds.append('remaining<0')
    elif status=='mismatch':conds.append('mismatch=1')
    elif status=='duplicate':conds.append('duplicate=1')
    elif status=='positive':conds.append('remaining>0')
    elif status=='zero':conds.append('remaining=0')
    fields={'rowNo':'row_no','dy':'dy','groupNo':'group_no','contractor':'contractor','project':'project','materialCode':'material_code','materialDesc':'material_desc','uom':'uom','planned':'planned','given':'given','remaining':'remaining'}
    more,vals=_q28_grid_predicates(column_filters or {},fields);conds+=more;args+=vals
    where=' WHERE '+' AND '.join(conds)
    with connect(index_db) as c:
        total=c.execute('SELECT COUNT(*) FROM kesif'+where,args).fetchone()[0]
        rows=c.execute('''SELECT work_code workCode,sheet,row_no rowNo,dy,group_no groupNo,group_desc groupDesc,contractor,project,material_code materialCode,material_desc materialDesc,uom,planned,given,remaining,mismatch,duplicate,issue FROM kesif'''+where+_q28_grid_order(fields,sort_by,sort_dir)+' LIMIT ? OFFSET ?',args+[size,off]).fetchall()
        s=c.execute('SELECT rows,depots,positive,zero,negative,mismatch,duplicateRows,issues,projects,duplicateKeys FROM kesif_stats WHERE work_code=?',[code]).fetchone()
        deps=[r[0] for r in c.execute('SELECT DISTINCT dy FROM kesif WHERE work_code=? AND dy<>\'\' ORDER BY dy',[code]).fetchall()]
    stats=dict(s) if s else {'rows':0,'depots':0,'positive':0,'zero':0,'negative':0,'mismatch':0,'duplicateRows':0,'issues':0,'projects':0,'duplicateKeys':0}
    pages=max(1,(total+size-1)//size);return {'rows':[dict(r) for r in rows],'total':total,'page':min(page,pages),'pages':pages,'pageSize':size,'source':'KESIFLER','stats':stats,'depots':deps,'engine':'SQLITE_INDEX'}

def operations_metrics(index_db:Path,depot:str='',months:int=12,depots_filter=None):
    depot=str(depot or '').strip();months=max(1,min(36,int(months or 12)))
    scope=[str(x).strip() for x in (depots_filter or []) if str(x).strip()]
    if depot:scope=[depot]
    scope=list(dict.fromkeys(scope))
    def scoped(base,args=None):
        args=list(args or [])
        if not scope:return base,args
        qs=','.join('?' for _ in scope);return base+f' AND dy IN ({qs})',args+scope
    with connect(index_db) as c:
        depots=[dict(r) for r in c.execute("SELECT d.uy,d.dy,d.dy_desc dyDesc,d.work_type workType,d.company,d.contract FROM depots d WHERE d.dy<>'' ORDER BY d.dy").fetchall()]
        if not depots:
            depots=[{'uy':r['plant'],'dy':r['dy'],'dyDesc':'','workType':'','company':'','contract':''} for r in c.execute("SELECT DISTINCT plant,dy FROM mb51 WHERE dy<>'' ORDER BY dy").fetchall()]
        if scope:
            qs=','.join('?' for _ in scope);guarantee_rows=[dict(r) for r in c.execute(f'SELECT uy,dy,dy_desc dyDesc,main,cash,manual,stock_value stockValue,available FROM zmm098 WHERE dy IN ({qs}) ORDER BY uy,dy',scope).fetchall()]
        else:guarantee_rows=[dict(r) for r in c.execute('SELECT uy,dy,dy_desc dyDesc,main,cash,manual,stock_value stockValue,available FROM zmm098 ORDER BY uy,dy').fetchall()]
        cond="movement IN ('221','222','Z22') AND posting_date<>''";args=[];cond,args=scoped(cond,args)
        monthly=[dict(r) for r in c.execute(f"""SELECT substr(posting_date,1,7) month,
              SUM(CASE WHEN movement='221' THEN -amount_upb ELSE 0 END) grossSpend,
              SUM(CASE WHEN movement='222' THEN amount_upb ELSE 0 END) reversal222,
              SUM(CASE WHEN movement='Z22' THEN amount_upb ELSE 0 END) returnZ22,
              -SUM(amount_upb) netSpend,
              SUM(CASE WHEN movement='221' THEN 1 ELSE 0 END) spendEvents,
              SUM(CASE WHEN movement IN ('222','Z22') THEN 1 ELSE 0 END) reverseEvents
            FROM mb51 WHERE {cond} GROUP BY substr(posting_date,1,7) ORDER BY month DESC LIMIT ?""",args+[months]).fetchall()]
        monthly.reverse();current_month=(monthly[-1]['month'] if monthly else '')
        by_depot=[]
        if current_month:
            bd_where="movement IN ('221','222','Z22') AND substr(posting_date,1,7)=? AND dy<>''";bd_args=[current_month];bd_where,bd_args=scoped(bd_where,bd_args)
            by_depot=[dict(r) for r in c.execute(f"""SELECT dy,
              SUM(CASE WHEN movement='221' THEN -amount_upb ELSE 0 END) grossSpend,
              SUM(CASE WHEN movement='222' THEN amount_upb ELSE 0 END) reversal222,
              SUM(CASE WHEN movement='Z22' THEN amount_upb ELSE 0 END) returnZ22,
              -SUM(amount_upb) netSpend,COUNT(*) events
              FROM mb51 WHERE {bd_where} GROUP BY dy ORDER BY netSpend DESC""",bd_args).fetchall()]
        # Tüm aylar x depo kırılımı dinamik aylık harcama tablosu ve depo tıklaması için tutulur.
        md_where="movement IN ('221','222','Z22') AND posting_date<>'' AND dy<>''";md_args=[];md_where,md_args=scoped(md_where,md_args)
        monthly_by_depot=[dict(r) for r in c.execute(f"""SELECT substr(posting_date,1,7) month,dy,
          SUM(CASE WHEN movement='221' THEN -amount_upb ELSE 0 END) grossSpend,
          SUM(CASE WHEN movement='222' THEN amount_upb ELSE 0 END) reversal222,
          SUM(CASE WHEN movement='Z22' THEN amount_upb ELSE 0 END) returnZ22,
          -SUM(amount_upb) netSpend,COUNT(*) events,
          SUM(CASE WHEN movement='221' THEN 1 ELSE 0 END) spendEvents,
          SUM(CASE WHEN movement IN ('222','Z22') THEN 1 ELSE 0 END) reverseEvents
          FROM mb51 WHERE {md_where} GROUP BY substr(posting_date,1,7),dy ORDER BY month DESC,netSpend DESC""",md_args).fetchall()]
        allowed_months={x.get('month') for x in monthly}
        monthly_by_depot=[x for x in monthly_by_depot if x.get('month') in allowed_months]
        def flow(moves):
            qs=','.join('?' for _ in moves);where='movement IN ('+qs+')';a=list(moves);where,a=scoped(where,a)
            row=c.execute(f"""SELECT COUNT(*) events,COUNT(DISTINCT doc) documents,COUNT(DISTINCT material_code) materials,
              MIN(posting_date) firstDate,MAX(posting_date) lastDate FROM mb51 WHERE {where}""",a).fetchone()
            return dict(row) if row else {'events':0,'documents':0,'materials':0,'firstDate':'','lastDate':''}
        flows={'mainToContractor':flow(('301','302','311','312')),'contractorTransfer':flow(('411','412')),'contractorToPyp':flow(('415','416')),'expense':flow(('221','222','Z22')),'returns':flow(('980','990'))}
        pyp=[]
        if scope:
            qs=','.join('?' for _ in scope);pyp=[dict(r) for r in c.execute(f"""SELECT pyp,COUNT(*) events,-SUM(amount_upb) netSpend
              FROM mb51 WHERE dy IN ({qs}) AND pyp<>'' AND movement IN ('221','222','Z22') GROUP BY pyp ORDER BY netSpend DESC LIMIT 30""",scope).fetchall()]
    return {'depot':depot,'scopeDepots':scope,'depots':depots,'guaranteeRows':guarantee_rows,'monthlySpend':monthly,'monthlyByDepot':monthly_by_depot,'currentMonth':current_month,'currentMonthByDepot':by_depot,'flows':flows,'pypSpend':pyp}

def kesif_context(index_db:Path,dy:str,materials:List[str]):
    dy=str(dy or '').strip();mats=[str(x).strip() for x in materials if str(x).strip()]
    if not dy or not mats:return []
    qs=','.join('?' for _ in mats)
    sql=f'''SELECT work_code workCode,dy,CASE WHEN work_code='T' THEN project ELSE '' END projectName,material_code materialCode,
      SUM(planned) planned,SUM(given) given,SUM(planned)-SUM(given) remaining,COUNT(*) rowCount,
      MAX(group_no) groupNo,MAX(group_desc) groupDesc,MAX(contractor) contractor
      FROM kesif WHERE dy=? AND material_code IN ({qs})
      GROUP BY work_code,dy,CASE WHEN work_code='T' THEN project ELSE '' END,material_code
      ORDER BY work_code,dy,projectName,materialCode'''
    with connect(index_db) as c:rows=c.execute(sql,[dy]+mats).fetchall()
    return [dict(r) for r in rows]



def worktype_operations(index_db:Path,code:str='T',months:int=12):
    """İş türü operasyon sayfası için hızlı özet snapshot."""
    code=str(code or 'T').upper().strip()
    if code not in ('T','K','B','L'):
        raise ValueError('Geçersiz iş türü kodu.')
    months=max(1,min(36,int(months or 12)))
    with connect(index_db) as c:
        depots=[str(r[0]) for r in c.execute(
            "SELECT DISTINCT dy FROM kesif WHERE work_code=? AND dy<>'' ORDER BY dy",[code]
        ).fetchall()]
        depot_meta=[]
        if depots:
            qs=','.join('?' for _ in depots)
            depot_meta=[dict(r) for r in c.execute(
                f"SELECT uy,dy,dy_desc dyDesc,company,contract FROM depots WHERE dy IN ({qs}) ORDER BY dy",depots
            ).fetchall()]
        materials=[dict(r) for r in c.execute('''
            SELECT dy,material_code materialCode,MAX(material_desc) materialDesc,MAX(uom) uom,
                   SUM(planned) planned,SUM(given) given,SUM(remaining) remaining,
                   COUNT(*) sourceRows,COUNT(DISTINCT NULLIF(project_norm,'')) projectCount,
                   SUM(CASE WHEN remaining<0 THEN 1 ELSE 0 END) negativeRows,
                   SUM(CASE WHEN issue=1 THEN 1 ELSE 0 END) issueRows
            FROM kesif WHERE work_code=?
            GROUP BY dy,material_code ORDER BY dy,material_code
        ''',[code]).fetchall()]
        # Keşif kaynakları tanım/birim taşımayabiliyor; MB52, sonra MB51 ana bilgisini fallback kullan.
        material_meta={}
        for r in c.execute("SELECT material_code,MAX(material_desc) materialDesc,MAX(uom) uom FROM mb52 WHERE material_code<>'' GROUP BY material_code").fetchall():
            material_meta[str(r['material_code'])]=(str(r['materialDesc'] or ''),str(r['uom'] or ''))
        for r in c.execute("SELECT material_code,MAX(material_desc) materialDesc,MAX(uom) uom FROM mb51 WHERE material_code<>'' GROUP BY material_code").fetchall():
            k=str(r['material_code']);oldm=material_meta.get(k,('',''));material_meta[k]=(oldm[0] or str(r['materialDesc'] or ''),oldm[1] or str(r['uom'] or ''))
        for r in materials:
            md,mu=material_meta.get(str(r.get('materialCode') or ''),('',''))
            if not r.get('materialDesc'):r['materialDesc']=md
            if not r.get('uom'):r['uom']=mu
        depot_discovery=[dict(r) for r in c.execute('''
            SELECT dy,COUNT(*) sourceRows,COUNT(DISTINCT material_code) materialCount,
                   COUNT(DISTINCT NULLIF(project_norm,'')) projectCount,
                   SUM(CASE WHEN remaining>0 THEN 1 ELSE 0 END) positiveRows,
                   SUM(CASE WHEN remaining=0 THEN 1 ELSE 0 END) zeroRows,
                   SUM(CASE WHEN remaining<0 THEN 1 ELSE 0 END) negativeRows,
                   SUM(CASE WHEN issue=1 THEN 1 ELSE 0 END) issueRows
            FROM kesif WHERE work_code=? GROUP BY dy ORDER BY dy
        ''',[code]).fetchall()]
        projects=[]
        if code=='T':
            pmap={(str(r['dy']),str(r['project_norm'])):str(r['projectCode'] or '') for r in c.execute('''
                SELECT dy,project_norm,MIN(project_id) projectCode FROM projects GROUP BY dy,project_norm
            ''').fetchall()}
            projects=[dict(r) for r in c.execute('''
                SELECT dy,project_norm projectNorm,MAX(project) projectName,
                       COUNT(DISTINCT material_code) materialCount,
                       SUM(CASE WHEN remaining>0 THEN 1 ELSE 0 END) positiveRows,
                       SUM(CASE WHEN remaining=0 THEN 1 ELSE 0 END) zeroRows,
                       SUM(CASE WHEN remaining<0 THEN 1 ELSE 0 END) negativeRows,
                       SUM(CASE WHEN issue=1 THEN 1 ELSE 0 END) issueRows
                FROM kesif WHERE work_code='T'
                GROUP BY dy,project_norm ORDER BY dy,projectName
            ''').fetchall()]
            for r in projects:
                r['projectCode']=pmap.get((str(r.get('dy') or ''),str(r.get('projectNorm') or '')),'')
    ops=operations_metrics(index_db,'',months,depots)
    monthly_material=[]
    if depots:
        qs=','.join('?' for _ in depots)
        with connect(index_db) as c:
            monthly_material=[dict(r) for r in c.execute(f'''
                SELECT substr(posting_date,1,7) month,dy,material_code materialCode,
                       MAX(material_desc) materialDesc,MAX(uom) uom,
                       -SUM(amount_upb) netSpend
                FROM mb51
                WHERE dy IN ({qs}) AND posting_date<>'' AND movement IN ('221','222','Z22')
                GROUP BY substr(posting_date,1,7),dy,material_code
                ORDER BY month DESC,dy,material_code
            ''',depots).fetchall()]
    return {
        'workCode':code,'depots':depot_meta,'depotCodes':depots,
        'materials':materials,'depotDiscovery':depot_discovery,
        'projects':projects,'projectMaterials':[],
        'guaranteeRows':ops.get('guaranteeRows') or [],
        'monthlySpend':ops.get('monthlySpend') or [],
        'monthlyByDepot':ops.get('monthlyByDepot') or [],
        'monthlyMaterialSpend':monthly_material,
        'currentMonth':ops.get('currentMonth') or '',
        'flows':ops.get('flows') or {},'pypSpend':ops.get('pypSpend') or []
    }


def worktype_project_materials(index_db:Path,depot:str,project_norm:str):
    """TESİS proje malzemelerini yalnız seçilen proje için getirir."""
    depot=str(depot or '').strip();project_norm=str(project_norm or '').strip()
    if not depot or not project_norm:return []
    with connect(index_db) as c:
        prow=c.execute('SELECT MIN(project_id) projectCode FROM projects WHERE dy=? AND project_norm=?',[depot,project_norm]).fetchone()
        project_code=str(prow['projectCode'] or '') if prow else ''
        rows=[dict(r) for r in c.execute('''
            SELECT dy,project_norm projectNorm,MAX(project) projectName,material_code materialCode,
                   MAX(material_desc) materialDesc,MAX(uom) uom,
                   SUM(planned) planned,SUM(given) given,SUM(remaining) remaining,
                   SUM(CASE WHEN remaining<0 THEN 1 ELSE 0 END) negativeRows,
                   SUM(CASE WHEN issue=1 THEN 1 ELSE 0 END) issueRows
            FROM kesif WHERE work_code='T' AND dy=? AND project_norm=?
            GROUP BY dy,project_norm,material_code ORDER BY material_code
        ''',[depot,project_norm]).fetchall()]
        material_meta={}
        for r in c.execute("SELECT material_code,MAX(material_desc) materialDesc,MAX(uom) uom FROM mb52 WHERE material_code<>'' GROUP BY material_code").fetchall():
            material_meta[str(r['material_code'])]=(str(r['materialDesc'] or ''),str(r['uom'] or ''))
        for r in c.execute("SELECT material_code,MAX(material_desc) materialDesc,MAX(uom) uom FROM mb51 WHERE material_code<>'' GROUP BY material_code").fetchall():
            k=str(r['material_code']);oldm=material_meta.get(k,('',''));material_meta[k]=(oldm[0] or str(r['materialDesc'] or ''),oldm[1] or str(r['uom'] or ''))
    for r in rows:
        r['projectCode']=project_code;md,mu=material_meta.get(str(r.get('materialCode') or ''),('',''))
        if not r.get('materialDesc'):r['materialDesc']=md
        if not r.get('uom'):r['uom']=mu
    return rows
