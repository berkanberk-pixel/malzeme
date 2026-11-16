from __future__ import annotations
import sys

import base64
import csv
import hashlib
import hmac
import tempfile
import form_excel
import codecs
from collections import Counter, defaultdict
from datetime import datetime, timedelta
import json
import uuid
import mimetypes
import re
import unicodedata
import os
import sqlite3
import socket
import subprocess
import shutil
import threading
import time
import urllib.parse
import webbrowser
import zipfile
import xml.etree.ElementTree as ET
import indexed_engine as indexed_engine
import control_read_index as control_read_index
import f604_summary as f604_summary
import project_ids28r as project_ids28r
from data_architecture_v2 import DataArchitectureV2
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
CONFIG_PATH = APP_DIR / 'config.json'
DATA_ROOT_PATH = APP_DIR / 'VERI_KLASORU.txt'
RECORD_ROOT_PATH = APP_DIR / 'KAYIT_KLASORU.txt'
BUNDLED_ROOT = APP_DIR / 'csv'
EXEMPTION_PATH = BUNDLED_ROOT / 'MUAF_LISTESI.csv'
DEFAULT_RECORD_ROOT = APP_DIR / 'kayitlar'
INDEX_DB_PATH = APP_DIR / 'cache' / 'talep_index.sqlite'
INDEX_MANIFEST_PATH = APP_DIR / 'cache' / 'INDEX_MANIFEST.json'
PARQUET_ROOT = APP_DIR / 'parquet' / 'ACTIVE'
SOURCE_ACTIVE_STATE_PATH = APP_DIR / 'data_v2' / '07_AUDIT' / 'active_source_state.json'
SOURCE_PENDING_OVERRIDE_PATH = APP_DIR / 'data_v2' / '07_AUDIT' / 'pending_source_overrides.json'
SOURCE_UPDATE_PREF_PATH = APP_DIR / 'data_v2' / '07_AUDIT' / 'source_update_preferences.json'
SOURCE_ACTIVE_SHADOW_ROOT = APP_DIR / 'data_v2' / '03_ACTIVE' / '_SOURCE_FILES'
SMALL_SHADOW_SOURCES = {'ZMM048','MB51','MB52','ZMM098','TANIMLAR','KESIFLER'}
_ENGINE_BUILD_LOCK = threading.RLock()
_ENGINE_LAST_ERROR = ''
_ENGINE_LAST_BUILD = None
HOST = '127.0.0.1'
PORT = int(os.environ.get('TALEP_PORT', '8765'))
# FIX28H / FIX-ERR: Tek sürüm otoritesi config.json. Launcher, UI ve /api/health aynı ID'yi okur.
try:
    _BOOT_CFG = json.loads(CONFIG_PATH.read_text(encoding='utf-8-sig'))
    APP_VERSION = str(_BOOT_CFG.get('app_version') or '3.13.0').strip() or '3.13.0'
    APP_BUILD = str(_BOOT_CFG.get('build') or '').strip()
except (OSError, ValueError, TypeError):
    APP_VERSION = '3.13.0'
    APP_BUILD = ''

DEFAULT_EXTERNAL_ROOT = '\\\\10.55.2.238\\paylasim\\GM_Planlama_Tesis_Direktorlugu\\MALZEME YÖNETİMİ MÜDÜRLÜĞÜ\\3 - Müdürlük Ortak Alan\\1-Ortak Döküman Alanı\\8-Talep Kontrol'
SOURCE_NAMES = ('ZMM048','MB51','MB52','ZMM098','TANIMLAR','KESIFLER')
DATA_ARCH_V2 = DataArchitectureV2(APP_DIR)
USER_RESP_PATH = APP_DIR / 'data_v2' / '07_AUDIT' / 'user_responsibilities.json'
NOTIFICATION_PATH = APP_DIR / 'data_v2' / '07_AUDIT' / 'notifications.json'
MANUAL_TESIS_PROJECT_PATH = APP_DIR / 'data_v2' / '07_AUDIT' / 'tesis_manual_projects.json'
PROJECT_IDS28R_PATH = APP_DIR / 'data_v2' / '07_AUDIT' / 'tesis_auto_project_ids28r.json'
SESSION_STARTED_AT = datetime.now().astimezone().isoformat()
_SESSION_AUDITED = False
DATA_PREP_ROOT = APP_DIR / 'data_v2' / '02_STANDARD' / 'VERI_HAZIRLA'
FORM_IMPORT_STAGING_ROOT = APP_DIR / 'data_v2' / '02_STANDARD' / 'FORM_IMPORT_STAGING'
_FORM_IMPORT_STAGING_LOCK = threading.RLock()
DATA_PREP_HISTORY_PATH = APP_DIR / 'data_v2' / '07_AUDIT' / 'data_prep_history.json'
_DATA_PREP_SELECTIONS = {}
_DATA_PREP_TEMPLATE_CACHE = {}
_DATA_PREP_LOCK = threading.RLock()

DATA_PREP_TEMPLATES = {
    'MB51': {'label':'Stok Hareketleri (MB51)','filename':'MB51.csv','logical':'MB51'},
    'MB52': {'label':'Stok Bilgileri (MB52)','filename':'MB52.csv','logical':'MB52'},
    'ZMM048': {'label':'Rezervasyon (ZMM048)','filename':'ZMM048.csv','logical':'ZMM048'},
    'ZMM098': {'label':'Teminat (ZMM098)','filename':'ZMM098.csv','logical':'ZMM098'},
    'TESIS': {'label':'TESİS Keşif','filename':'Tesis_Verileri.csv','logical':'TESIS'},
    'KET': {'label':'KET&YB Keşif','filename':'KET_Verileri.csv','logical':'KET'},
    'BAKIM': {'label':'BAKIM Keşif','filename':'BAKIM_Verileri.csv','logical':'BAKIM'},
    'LED': {'label':'LED Keşif','filename':'LED_Verileri.csv','logical':'LED'},
    'DEPO_KODLARI': {'label':'Depo Kodları','filename':'TB_Depo_Kodlari.csv','logical':''},
    'SITE_PROJELER': {'label':'Proje Ana Verisi','filename':'SITE_PROJELER.csv','logical':''},
    'SITE_MALZEMELER': {'label':'Malzeme Ana Verisi','filename':'SITE_MALZEMELER.csv','logical':''},
    'ISLEM_TURU': {'label':'İşlem Türü','filename':'TB_Islem_Turu.csv','logical':''},
    'TEDAS_KOD': {'label':'TEDAŞ Kodları','filename':'TB_Tedas_Kod.csv','logical':''},
}

DEFAULT_CONFIG = {
    'external_root': DEFAULT_EXTERNAL_ROOT,
    'recursive': False,
    'csv_only': False,
    'csv_detection_min_confidence': 0.72
}

# CSV klasör taraması pahalı olabilir. Aynı açılışta /api/files ve her /api/file
# isteğinde tekrar taramak yerine tek bir snapshot paylaşılır. Kullanıcı yenile dediğinde
# veya veri klasörü değiştiğinde cache açıkça geçersiz kılınır.
_SNAPSHOT_CACHE = {'value': None, 'created': 0.0}
_SNAPSHOT_LOCK = threading.RLock()

def invalidate_source_snapshot():
    with _SNAPSHOT_LOCK:
        _SNAPSHOT_CACHE['value'] = None
        _SNAPSHOT_CACHE['created'] = 0.0

def source_snapshot_cached(force=False):
    with _SNAPSHOT_LOCK:
        if not force and _SNAPSHOT_CACHE.get('value') is not None:
            return _SNAPSHOT_CACHE['value']
        value = managed_source_snapshot()
        _SNAPSHOT_CACHE['value'] = value
        _SNAPSHOT_CACHE['created'] = time.time()
        return value



def _bool_text(value, default=False):
    s=str(value if value is not None else '').strip().lower()
    if s in ('1','true','evet','e','x','yes','aktif','on'): return True
    if s in ('0','false','hayir','hayır','h','no','pasif','off'): return False
    return bool(default)


def load_exemptions():
    if not EXEMPTION_PATH.exists():
        return []
    raw=EXEMPTION_PATH.read_bytes()
    decoded=None
    for enc in ('utf-8-sig','utf-8','cp1254','cp1252','latin-1'):
        try:
            decoded=raw.decode(enc);break
        except UnicodeDecodeError:
            continue
    if decoded is None:
        decoded=raw.decode('utf-8',errors='replace')
    sample=decoded[:4096]
    delimiter=';'
    try:
        delimiter=csv.Sniffer().sniff(sample,delimiters=';,\t|').delimiter
    except Exception:
        if '\t' in sample: delimiter='\t'
        elif ';' in sample: delimiter=';'
        else: delimiter=','
    rows=[]
    reader=csv.DictReader(decoded.splitlines(),delimiter=delimiter)
    for row in reader:
        if not isinstance(row,dict): continue
        code=str(row.get('Malzeme Kodu') or row.get('Malzeme_Kodu') or row.get('materialCode') or '').strip().replace('.0','')
        if not code: continue
        rows.append({
            'materialCode':code,
            'discoveryExempt':_bool_text(row.get('Keşif Muaf') if 'Keşif Muaf' in row else row.get('Kesif Muaf') if 'Kesif Muaf' in row else row.get('Kesif_Muaf')),
            'guaranteeExempt':_bool_text(row.get('Teminat Muaf') if 'Teminat Muaf' in row else row.get('Teminat_Muaf')),
            'active':_bool_text(row.get('Aktif'),True),
            'description':str(row.get('Açıklama') or row.get('Aciklama') or '').strip(),
        })
    # Son kayıt aynı malzeme kodu için geçerlidir.
    merged={}
    for item in rows: merged[item['materialCode']]=item
    return list(merged.values())


def save_exemptions(items):
    if not isinstance(items,list):
        raise ValueError('Muaf listesi dizi biçiminde olmalıdır.')
    cleaned=[];seen=set()
    for raw in items:
        if not isinstance(raw,dict): continue
        code=str(raw.get('materialCode') or raw.get('Malzeme Kodu') or '').strip().replace('.0','')
        if not code: continue
        if code in seen: continue
        seen.add(code)
        cleaned.append({
            'materialCode':code,
            'discoveryExempt':_bool_text(raw.get('discoveryExempt')),
            'guaranteeExempt':_bool_text(raw.get('guaranteeExempt')),
            'active':_bool_text(raw.get('active'),True),
            'description':str(raw.get('description') or '').strip()[:500],
        })
    BUNDLED_ROOT.mkdir(parents=True,exist_ok=True)
    with EXEMPTION_PATH.open('w',encoding='utf-8-sig',newline='') as fh:
        w=csv.writer(fh,delimiter=';',lineterminator='\n')
        w.writerow(['Malzeme Kodu','Keşif Muaf','Teminat Muaf','Aktif','Açıklama'])
        for item in cleaned:
            w.writerow([item['materialCode'],'Evet' if item['discoveryExempt'] else 'Hayır','Evet' if item['guaranteeExempt'] else 'Hayır','Evet' if item['active'] else 'Hayır',item['description']])
    return cleaned

def load_config():
    cfg = json.loads(json.dumps(DEFAULT_CONFIG, ensure_ascii=False))
    config_error = ''
    if CONFIG_PATH.exists():
        try:
            disk = json.loads(CONFIG_PATH.read_text(encoding='utf-8-sig'))
            if isinstance(disk, dict):
                cfg.update(disk)
        except Exception as exc:
            config_error = f'config.json okunamadı: {exc}'

    locked=bool(cfg.get('enforce_source_root')) and os.environ.get('TALEP_TEST_MODE','')!='1'
    external = str(cfg.get('external_root') or DEFAULT_EXTERNAL_ROOT) if locked else os.environ.get('TALEP_DATA_ROOT', '').strip()
    if not external and DATA_ROOT_PATH.exists() and not locked:
        try:
            external = DATA_ROOT_PATH.read_text(encoding='utf-8-sig').splitlines()[0].strip()
        except Exception:
            external = ''
    if not external:
        external = str(cfg.get('external_root') or DEFAULT_EXTERNAL_ROOT)

    cfg['external_root'] = external
    cfg['roots'] = [external] if cfg.get('strict_external_sources') else [external, str(BUNDLED_ROOT)]
    cfg.setdefault('recursive', False)
    cfg.setdefault('csv_only', False)
    cfg.setdefault('csv_detection_min_confidence', 0.72)
    cfg['_config_error'] = config_error
    return cfg


def iter_candidates(root: Path, recursive: bool):
    if not root.exists() or not root.is_dir():
        return []
    try:
        items = (root.rglob('*') if recursive else root.iterdir())
        out=[]
        blocked={'kontrol_baslik','kontrol_malzeme','kontrol_proje','kayitlar'}
        for p in items:
            if not p.is_file() or p.name.startswith('~$') or p.suffix.lower() not in ('.csv','.xlsx','.xlsm','.xls','.xlsb'):
                continue
            if p.name.lower() == 'muaf_listesi.csv':
                continue
            if any(part.lower() in blocked for part in p.parts):
                continue
            out.append(p)
        return out
    except Exception:
        return []


def _norm_header(value):
    text=str(value or '').strip().lower().replace('ı','i')
    text=unicodedata.normalize('NFD',text)
    text=''.join(ch for ch in text if unicodedata.category(ch)!='Mn')
    return re.sub(r'[^a-z0-9]+','',text)


def _aset(*items):
    return {_norm_header(x) for x in items if x}

FIELD_ALIASES={
    'reservation':_aset('Rezervasyon','Rezervasyon No','Rezervasyon Numarası'),
    'material':_aset('Malzeme','Malzeme Kodu'),
    'material_code_exact':_aset('Malzeme Kodu','Malzeme_Kodu'),
    'material_desc':_aset('Malzeme kısa metni','Malzeme Tanımı','Malzeme_Tanimi','Malzeme Açıklaması'),
    'qty':_aset('Miktar','Rezervasyon Miktarı','Talep Miktarı'),
    'uom':_aset('Birim','Ölçü','Giriş ölçü birimi'),
    'source_uy':_aset('TESLİM EDEN ÜY','Kaynak ÜY'),
    'source_dy':_aset('TESLİM EDEN DY','Kaynak Depo'),
    'target_uy':_aset('TESLİM ALAN ÜY','Hedef ÜY'),
    'target_dy':_aset('Teslim alan DY','Hedef Depo'),
    'plant':_aset('Üretim yeri','UY'),
    'storage':_aset('Depo yeri','DY','Depo Kodu','Depo_Yeri'),
    'depot_code':_aset('Depo Kodu'),
    'unrestricted':_aset('Tahditsiz klnb.','Tahditsiz kullanılabilir','Tahditsiz'),
    'total_value':_aset('Toplam değer','Toplam Değer'),
    'unrestricted_value':_aset('Değer thd.s.klnb.','Değer thd.s.klnb','Değer thd.s.kullanılabilir'),
    'movement':_aset('İşlem türü','Hareket türü'),
    'material_doc':_aset('Malzeme belgesi','Malzeme Belgesi'),
    'guarantee_main':_aset('Güvence Teminat Tutarı','Mlz Teminat','Malzeme Teminatı'),
    'guarantee_cash':_aset('Nakdi Teminat Tutarı','Ek Teminat'),
    'guarantee_manual':_aset('Manuel Artış Tutarı','Olur Artışı'),
    'project_id':_aset('Proje ID','Proje_ID'),
    'project_name':_aset('Proje','Proje Adı','Proje_Adi'),
    'work_type':_aset('İş Türü','İş Türü Kodu','Is_Turu','Is_Turu_Kodu'),
    'depot_type':_aset('Depo Türü','Depo_Turu'),
    'company':_aset('Firma Adı','Firma_Adi','Yüklenici'),
    'contract':_aset('Sözleşme Adı','Sozlesme_Adi'),
    'active':_aset('Aktif'),
    'planned':_aset('Teslim Edilen'),
    'given':_aset('Verilen Malzeme Toplamı'),
    'remaining':_aset('Teslim Edilen - Verilen Fark'),
    'group_no':_aset('Grup No'),
    'group_desc':_aset('Grup Tanımı'),
    'storage_desc':_aset('Depo Yeri Tanımı','Depo_Yeri_Tanimi','Depo Tanımı','Depo Tanimi'),
    'material_group':_aset('Mal grubu','Mal Grubu','Malzeme grubu','Malzeme Grubu'),
    'material_group_desc':_aset('Mal grubu tanımı','Mal Grubu Tanımı','Malzeme grubu tanımı','Malzeme Grubu Tanımı'),
    'doc_date':_aset('Belge tarihi','Belge Tarihi','Kayıt Tarihi','Giriş Tarihi'),
    'valuation_type':_aset('Parti','Değerleme türü','Değerleme Türü'),
    'z98_stock_value':_aset('Depo Stok Tutarı Toplam','Depo stok tutarı toplam'),
    'z98_available':_aset('Rezervasyon Yapılabilir Tutar','Rezervasyon yapılabilir tutar','Rez.Yapılabilir Tutar (Açık Rez.Dahil)'),
    'islem_master_code':_aset('Islem_Turu','İşlem Türü'),
    'islem_master_desc':_aset('Islem_Tanimi','İşlem Tanımı'),
    'tds_code':_aset('TDS_Kod','TDS Kod'),
    'tds_desc':_aset('TDS_Tanim','TDS Tanım','TDS Tanimi')
}

SIGNATURES=[
    {'source':'KESIFLER','role':'KESIF_DATA','required':['depot_code','material_code_exact','planned','given','remaining'],'optional':['project_name','work_type','company','group_no','group_desc']},
    {'source':'ZMM048','role':'ZMM048','required':['reservation','material','source_uy','source_dy','target_uy','target_dy'],'optional':['qty','uom']},
    {'source':'MB52','role':'MB52','required':['material','plant','storage','unrestricted'],'optional':['total_value','unrestricted_value','material_desc','uom','depot_type']},
    {'source':'ZMM098','role':'ZMM098','required':['plant','storage','guarantee_main'],'optional':['guarantee_cash','guarantee_manual']},
    {'source':'MB51','role':'MB51','required':['material','movement','qty'],'optional':['material_doc','reservation','plant','storage']},
    {'source':'TANIMLAR','role':'SITE_PROJELER','required':['project_id','project_name','storage'],'optional':['plant','work_type','active']},
    {'source':'TANIMLAR','role':'SITE_DEPOLAR','required':['plant','storage'],'optional':['depot_type','work_type','company','contract','active'],'min_optional':1},
    {'source':'TANIMLAR','role':'SITE_MALZEMELER','required':['material_code_exact','material_desc','uom'],'optional':['active']},
    {'source':'TANIMLAR','role':'TB_ISLEM_TURU','required':['islem_master_code','islem_master_desc'],'optional':[]},
    {'source':'TANIMLAR','role':'TB_TEDAS_KOD','required':['tds_code','tds_desc'],'optional':[]}
]


def _has_group(headers, group):
    return bool(headers & FIELD_ALIASES[group])


def _signature_score(headers, sig):
    req=sig['required']; opt=sig.get('optional',[])
    req_hits=sum(1 for g in req if _has_group(headers,g))
    if req_hits < len(req):
        return 0.0
    opt_hits=sum(1 for g in opt if _has_group(headers,g))
    if opt_hits < int(sig.get('min_optional',0)):
        return 0.0
    opt_ratio=(opt_hits/len(opt)) if opt else 1.0
    return min(1.0,0.88+0.12*opt_ratio)


def _detect_encoding_bytes(raw: bytes):
    # Örnek blok UTF-8 çok baytlı bir karakterin ortasında bitebilir. Incremental
    # decoder final=False ile yalnız kesilmiş son karakteri tolere eder; dosyanın
    # geri kalanındaki gerçek kodlama hatalarını gizlemez.
    for enc in ('utf-8-sig','utf-8','cp1254','cp1252','latin-1'):
        try:
            dec=codecs.getincrementaldecoder(enc)(errors='strict')
            dec.decode(raw,final=False)
            return enc
        except UnicodeDecodeError:
            continue
    return 'utf-8'


def _decode_sample(path: Path, max_bytes=512*1024):
    # Büyük CSV'nin tamamını belleğe alma; sınıflandırma için yalnız ilk örnek blok yeterlidir.
    with path.open('rb') as fh:
        raw=fh.read(max_bytes)
    enc=_detect_encoding_bytes(raw)
    try:
        dec=codecs.getincrementaldecoder(enc)(errors='strict')
        return dec.decode(raw,final=False),enc
    except Exception:
        return raw.decode(enc,errors='replace'),enc


def _detect_delimiter(text):
    sample=text[:65536]
    try:
        return csv.Sniffer().sniff(sample,delimiters=';,\t|').delimiter
    except Exception:
        lines=[ln for ln in sample.splitlines() if ln.strip()][:8]
        if not lines:return ';'
        candidates=[';',',','\t','|']
        return max(candidates,key=lambda d:sum(line.count(d) for line in lines))


def _sample_rows(text, delimiter, limit=80):
    rows=[]
    try:
        for row in csv.reader(text.splitlines(),delimiter=delimiter):
            rows.append(row)
            if len(rows)>=limit:break
    except Exception:
        return []
    return rows


def _best_header(rows):
    best=None
    for idx,row in enumerate(rows[:20]):
        headers={_norm_header(v) for v in row if str(v or '').strip()}
        if len(headers)<2:continue
        scored=[]
        for sig in SIGNATURES:
            score=_signature_score(headers,sig)
            if score:
                # Daha fazla zorunlu alan isteyen imza daha özgüldür. Örn. gerçek MB52
                # dosyasında 'Depo Türü' bulunsa bile genel SITE_DEPOLAR imzasına yenilmez.
                scored.append((len(sig.get('required',[])),score,sig))
        if not scored:continue
        scored.sort(key=lambda x:(x[0],x[1]),reverse=True)
        specificity,score,sig=scored[0]
        second=0.0
        for sp,sc,other in scored[1:]:
            if sp!=specificity:
                break
            if other['source']!=sig['source']:
                second=sc
                break
        cand={'header_row':idx,'headers':headers,'score':score,'second':second,'specificity':specificity,'signature':sig}
        if best is None or cand['score']>best['score'] or (cand['score']==best['score'] and idx<best['header_row']):best=cand
    return best


def _scan_csv(path: Path, origin: str, min_conf: float):
    try:
        text,encoding=_decode_sample(path)
        delimiter=_detect_delimiter(text)
        rows=_sample_rows(text,delimiter)
        best=_best_header(rows)
        if not best:
            return {'path':path,'origin':origin,'classified':False,'reason':'Tanımlayıcı sütun başlığı bulunamadı.'}
        score=float(best['score']); second=float(best['second'])
        if score<min_conf:
            return {'path':path,'origin':origin,'classified':False,'reason':f'Eşleşme güveni düşük (%{round(score*100)}).'}
        if second and score-second<0.05:
            return {'path':path,'origin':origin,'classified':False,'reason':'Birden fazla kaynak yapısına benzer bulundu.'}
        st=path.stat();sig=best['signature']
        return {
            'path':path,'origin':origin,'classified':True,'source':sig['source'],'role':sig['role'],
            'score':score,'confidence':round(score*100),'headerRow':best['header_row'],'headers':best['headers'],
            'delimiter':delimiter,'encoding':encoding,'sampleRows':rows,'size':st.st_size,'mtime':st.st_mtime,'mtime_ns':st.st_mtime_ns
        }
    except Exception as exc:
        return {'path':path,'origin':origin,'classified':False,'reason':f'CSV okunamadı: {exc}'}


# Source Excel files are materialized as validated local CSV cache files.
# Original corporate workbooks remain unmodified and are never opened for writing.
_EXCEL_SOURCE_CACHE_ROOT = Path(os.environ.get('LOCALAPPDATA') or tempfile.gettempdir()) / 'TalepKontrol' / 'ExcelSourceCache'

def _excel_safe_name(text):
    return re.sub(r'[^a-zA-Z0-9_\-]+', '_', unicodedata.normalize('NFKD', str(text or 'Sheet')))[:48] or 'Sheet'

def _legacy_excel_to_xlsx(path, temp_dir):
    if os.name != 'nt':
        raise ValueError('Eski Excel .xls/.xlsb için Windows ve Microsoft Excel gereklidir.')
    ps = APP_DIR / 'EXCEL_ESKI_DONUSTUR.ps1'
    if not ps.is_file():
        raise ValueError('Eski Excel dönüşüm bileşeni kurulu değil.')
    target=temp_dir / 'legacy_source.xlsx'
    env=os.environ.copy();env['TALEP_EXCEL_SOURCE']=str(path);env['TALEP_EXCEL_TARGET']=str(target)
    cmd=['powershell.exe','-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',str(ps)]
    proc=subprocess.run(cmd,capture_output=True,text=True,timeout=240,env=env,
         creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    if proc.returncode or not target.is_file():
        raise ValueError('Microsoft Excel dönüşümü başarısız (Excel kurulu olmalıdır): '+(proc.stderr or proc.stdout)[-500:])
    return target

def _excel_scan(path, origin, min_conf, expected=None):
    # Cache key changes whenever the original file size or modification timestamp changes.
    # Concurrent file edits are rejected instead of exposing a partial import.
    workpath=None
    try:
        stat_before=path.stat()
        import hashlib as _hashlib
        import contextlib
        with tempfile.TemporaryDirectory(prefix='talep_excel_') as td:
            workpath=path
            if path.suffix.lower() in ('.xls','.xlsb'):
                workpath=_legacy_excel_to_xlsx(path,Path(td))
            sheets,_=_xlsx_workbook_info(workpath)
            if not sheets:
                raise ValueError('Excel çalışma sayfası bulunamadı.')
            out=[]
            _EXCEL_SOURCE_CACHE_ROOT.mkdir(parents=True,exist_ok=True)
            for sh in sheets[:60]:
                name=sh.get('name','Sheet')
                try:
                    sample=list(_xlsx_rows(workpath,name,limit=40))
                    best=_best_header(sample)
                    if not best:
                        continue
                    group=best['signature']['source']
                    if expected and group not in (expected, 'ZMM098'):
                        continue
                    key=_hashlib.sha256((str(path).lower()+'|'+name+'|'+str(stat_before.st_size)+'|'+str(stat_before.st_mtime_ns)).encode('utf-8')).hexdigest()[:24]
                    cache=_EXCEL_SOURCE_CACHE_ROOT / (_excel_safe_name(path.stem)+'__'+_excel_safe_name(name)+'__'+key+'.csv')
                    if not cache.is_file() or cache.stat().st_size==0:
                        stage=cache.with_name(cache.name + '.' + uuid.uuid4().hex + '.partial')
                        try:
                            with stage.open('w',encoding='utf-8-sig',newline='') as f:
                                writer=csv.writer(f,delimiter=';',lineterminator='\n')
                                for row in _xlsx_rows(workpath,name):writer.writerow(row)
                            if (path.stat().st_size,path.stat().st_mtime_ns)!=(stat_before.st_size,stat_before.st_mtime_ns):
                                raise RuntimeError('Excel dosyası okuma sırasında değişti; veri alınmadı.')
                            if stage.stat().st_size<4:raise ValueError('Boş Excel sayfası')
                            os.replace(stage,cache)
                            os.utime(cache,ns=(stat_before.st_atime_ns,stat_before.st_mtime_ns))
                        finally:
                            stage.unlink(missing_ok=True)
                    meta=_scan_csv(cache,origin,min_conf)
                    if meta.get('classified'):
                        meta.update({'originOriginal':str(path),'originalName':path.name+' / '+name,
                                     'sourceFormat':path.suffix.lower().lstrip('.'),
                                     'mtime':stat_before.st_mtime,'mtime_ns':stat_before.st_mtime_ns})
                        out.append(meta)
                except Exception as sh_exc:
                    out.append({'path':path,'origin':origin,'classified':False,'reason':f'Excel sayfası {name}: {sh_exc}'})
            if not out:
                return [{'path':path,'origin':origin,'classified':False,'reason':'Excel sayfalarında tanınan kaynak başlığı bulunamadı.'}]
            return out
    except Exception as exc:
        return [{'path':path,'origin':origin,'classified':False,'reason':f'Excel okunamadı: {exc}'}]

def _source_scan_candidate(path,origin,min_conf,expected=None):
    if path.suffix.lower()=='.csv':
        return [_scan_csv(path,origin,min_conf)]
    return _excel_scan(path,origin,min_conf,expected)

def _work_code(value):
    n=_norm_header(value)
    if n=='t' or 'tesis' in n:return 'T'
    if n=='b' or 'bakim' in n:return 'B'
    if n=='k' or 'ket' in n:return 'K'
    if n=='l' or 'led' in n:return 'L'
    return ''


def _column_index(headers, group):
    for i,v in enumerate(headers):
        if _norm_header(v) in FIELD_ALIASES[group]:return i
    return -1


def _read_rows_for_meta(meta, max_rows=1500):
    path=meta['path'];encoding=meta['encoding'];delimiter=meta['delimiter']
    try:
        with path.open('r',encoding=encoding,errors='replace',newline='') as fh:
            reader=csv.reader(fh,delimiter=delimiter)
            out=[]
            for i,row in enumerate(reader):
                if i<meta['headerRow']:continue
                out.append(row)
                if len(out)>=max_rows:break
            return out
    except Exception:return []


def _build_depot_work_map(candidates):
    dep=[c for c in candidates if c.get('classified') and c.get('source')=='TANIMLAR' and c.get('role')=='SITE_DEPOLAR']
    if not dep:return {}
    preferred=[c for c in dep if c['origin']=='external'] or dep
    meta=max(preferred,key=lambda x:x['mtime_ns'])
    rows=_read_rows_for_meta(meta,100000)
    if not rows:return {}
    header=rows[0];dy_i=_column_index(header,'storage');wt_i=_column_index(header,'work_type')
    if dy_i<0 or wt_i<0:return {}
    out={}
    for row in rows[1:]:
        if dy_i>=len(row) or wt_i>=len(row):continue
        dy=str(row[dy_i] or '').strip();code=_work_code(row[wt_i])
        if dy and code:out[dy]=code
    return out


def _kesif_role_from_text(value):
    n=_norm_header(value)
    if not n:return ''
    # En ayırt edici ifadeler önce kontrol edilir. Dört keşif CSV'si aynı
    # kolon şemasını kullandığı için yalnız kolon adına bakarak tür seçilemez.
    if 'led' in n or 'armaturdonusum' in n:return 'L'
    if 'bakim' in n:return 'B'
    if 'ket' in n or 'yapibaglanti' in n or re.search(r'(^|[^a-z])yb([^a-z]|$)', str(value or '').lower()):return 'K'
    if 'tesis' in n:return 'T'
    return ''


def _infer_kesif_role(meta,depot_work):
    rows=meta.get('sampleRows') or []
    if not rows:return 'UNKNOWN'
    header=rows[meta['headerRow']] if meta['headerRow']<len(rows) else []
    wt_i=_column_index(header,'work_type');dy_i=_column_index(header,'depot_code')
    # Grup Tanımı ve Proje tüm güncel keşif CSV'lerinde vardır ve iş türünü
    # dosya adından bağımsız ayırmak için en güvenilir içerik alanlarıdır.
    text_indexes=[]
    for group in ('group_desc','project_name'):
        idx=_column_index(header,group)
        if idx>=0:text_indexes.append(idx)
    counts=Counter()
    for row in rows[meta['headerRow']+1:]:
        code=''
        if wt_i>=0 and wt_i<len(row):
            c=_work_code(row[wt_i])
            if c in ('T','K','B','L'):code=c
        if not code:
            for idx in text_indexes:
                if idx<len(row):
                    code=_kesif_role_from_text(row[idx])
                    if code:break
        if not code and dy_i>=0 and dy_i<len(row):
            dy=str(row[dy_i] or '').strip()
            # Bxxx depolar bakım için güçlü bir içerik göstergesidir.
            if dy.upper().startswith('B') and len(dy)>=2:code='B'
            if not code:code=depot_work.get(dy,'')
        if code:counts[code]+=1
    if counts:
        total=sum(counts.values());code,n=counts.most_common(1)[0]
        if len(counts)==1 or n/max(1,total)>=0.70:return code
        return 'MIXED'
    return 'UNKNOWN'


def _choose_latest(cands):
    if not cands:return None
    preferred=[c for c in cands if c['origin']=='external'] or cands
    return max(preferred,key=lambda x:x['mtime_ns'])


def _sheet_name(source,role,path):
    if source=='TANIMLAR':return role
    if source=='KESIFLER':
        return {'T':'Tesis_Verileri','K':'KET_Verileri','B':'BAKIM_Verileri','L':'LED_Verileri','MIXED':'KESIF_KARMA','UNKNOWN':'KESIF_TANIMSIZ'}.get(role,'KESIF_TANIMSIZ')
    return source


def _public_file(meta,source,index):
    p=meta['path'];st=p.stat();role=meta.get('role') or source
    return {
        'name':meta.get('originalName') or p.name,'format':meta.get('sourceFormat') or 'csv','sourceOriginal':meta.get('originOriginal') or str(p),'path':str(p),'size':st.st_size,'lastModified':int(st.st_mtime*1000),
        'modifiedIso':time.strftime('%Y-%m-%dT%H:%M:%S',time.localtime(st.st_mtime)),
        'origin':meta['origin'],'role':role,'sheet':_sheet_name(source,role,p),
        'confidence':meta.get('confidence',0),'delimiter':meta.get('delimiter',';'),'encoding':'utf-8',
        'headerRow':int(meta.get('headerRow',0)),
        'url':'/api/file?source='+urllib.parse.quote(source)+'&index='+str(index)
    }


def source_snapshot():
    cfg=load_config();min_conf=float(cfg.get('csv_detection_min_confidence',0.72) or 0.72)
    recursive=bool(cfg.get('recursive',False));all_scan=[]
    external_raw=str(cfg.get('external_root') or '').strip()
    external_root=_resolve_setting_path(external_raw,BUNDLED_ROOT) if external_raw else BUNDLED_ROOT.resolve()
    if cfg.get('strict_external_sources'):
        # Read only the explicitly authorised corporate source folders from config.
        # 0-Database must NEVER be scanned as SAP/keşif source data.
        folder_cfg=cfg.get('source_subfolders') if isinstance(cfg.get('source_subfolders'),dict) else {}
        mapping={
            str(folder_cfg.get('ZMM048') or '1-ZMM048'):'ZMM048',
            str(folder_cfg.get('MB51') or '2-MB51'):'MB51',
            str(folder_cfg.get('MB52') or '3-MB52'):'MB52',
            str(folder_cfg.get('KESIFLER') or '4-Keşifler'):'KESIFLER',
            str(folder_cfg.get('TANIMLAR') or '5-Tanımlar'):'TANIMLAR',
        }
        for dirname, expected in mapping.items():
            directory=external_root / dirname
            for path in iter_candidates(directory,False):
                for meta in _source_scan_candidate(path,'external',min_conf,expected):
                    detected=meta.get('source')
                    if meta.get('classified') and detected not in (expected,'ZMM098'):
                        meta={'path':path,'origin':'external','classified':False,
                              'reason':f'Klasör kaynak türü uyumsuz: beklenen {expected}, dosya {detected}'}
                    all_scan.append(meta)
    else:
        roots=[external_root,BUNDLED_ROOT.resolve()]
        for idx,root in enumerate(roots):
            root=root.resolve()
            origin='bundled' if root==BUNDLED_ROOT.resolve() else 'external'
            if idx and roots[0].resolve()==root:continue
            for path in iter_candidates(root,recursive if origin=='external' else False):
                all_scan.extend(_source_scan_candidate(path,origin,min_conf))
    classified=[c for c in all_scan if c.get('classified')]
    depot_work=_build_depot_work_map(classified)
    for c in classified:
        if c.get('source')=='KESIFLER':c['role']=_infer_kesif_role(c,depot_work)

    selected={k:[] for k in SOURCE_NAMES};ignored=[]
    for source in ('ZMM048','MB51','MB52','ZMM098'):
        cs=[c for c in classified if c.get('source')==source]
        pick=_choose_latest(cs)
        if pick:selected[source]=[pick]
        for c in cs:
            if pick is not None and c is not pick:ignored.append((c,f'{source} için daha güncel içerik bulundu.'))

    for role in ('SITE_DEPOLAR','SITE_PROJELER','SITE_MALZEMELER','TB_ISLEM_TURU','TB_TEDAS_KOD'):
        cs=[c for c in classified if c.get('source')=='TANIMLAR' and c.get('role')==role]
        pick=_choose_latest(cs)
        if pick:selected['TANIMLAR'].append(pick)
        for c in cs:
            if pick is not None and c is not pick:ignored.append((c,f'TANIMLAR/{role} için daha güncel içerik bulundu.'))

    for role in ('T','K','B','L','MIXED','UNKNOWN'):
        cs=[c for c in classified if c.get('source')=='KESIFLER' and c.get('role')==role]
        pick=_choose_latest(cs)
        if pick:selected['KESIFLER'].append(pick)
        for c in cs:
            if pick is not None and c is not pick:ignored.append((c,f'KESIFLER/{role} için daha güncel içerik bulundu.'))

    result={};missing=[]
    for source in SOURCE_NAMES:
        chosen=sorted(selected[source],key=lambda x:(x['mtime_ns'],x['path'].name.lower()))
        if not chosen:
            result[source]=None;missing.append(source);continue
        files=[_public_file(meta,source,i) for i,meta in enumerate(chosen)]
        size=sum(x['size'] for x in files);lm=max(x['lastModified'] for x in files)
        origins={x['origin'] for x in files};origin='external' if 'external' in origins else 'bundled'
        conf=round(sum(x['confidence'] for x in files)/len(files))
        result[source]={
            'name':files[0]['name'] if len(files)==1 else f'{len(files)} kaynak dosyası',
            'path':files[0]['path'] if len(files)==1 else ' | '.join(x['name'] for x in files),
            'size':size,'lastModified':lm,'modifiedIso':time.strftime('%Y-%m-%dT%H:%M:%S',time.localtime(lm/1000)),
            'origin':origin,'confidence':conf,'detection':'content','files':files
        }

    diagnostics=[]
    for c in all_scan:
        if not c.get('classified'):
            diagnostics.append({'level':'warn','text':f"Kaynak tanınamadı: {c['path'].name} — {c.get('reason','yapı eşleşmedi')}"})
    for c,reason in ignored:
        diagnostics.append({'level':'warn','text':f"Kaynak yedek/eskimiş olarak atlandı: {c['path'].name} — {reason}"})
    unknown=[x for x in selected['KESIFLER'] if x.get('role')=='UNKNOWN']
    if unknown:
        diagnostics.append({'level':'warn','text':'Bazı keşif CSV dosyaları TESİS/KET/BAKIM/LED alt türüne kesin ayrılamadı; satırlar TANIMLAR depo iş türü üzerinden değerlendirilecek.'})
    cfg['_scan_diagnostics']=diagnostics;cfg['_scan_count']=len(all_scan)
    return cfg,result,missing



def _source_digest(info):
    if not info:return ''
    rows=[]
    for f in (info.get('files') or []):
        path=Path(f.get('path') or '')
        try:
            st=path.stat(); qh=indexed_engine.quick_hash(path) if hasattr(indexed_engine,'quick_hash') else ''
        except Exception:
            st=None; qh=''
        rows.append({'name':str(f.get('name') or path.name),'role':str(f.get('role') or ''),'size':int(st.st_size if st else f.get('size') or 0),'mtime':int(st.st_mtime_ns if st else 0),'quick':qh})
    rows.sort(key=lambda x:(x['role'],x['name']))
    import hashlib
    return hashlib.sha256(json.dumps(rows,ensure_ascii=False,sort_keys=True).encode('utf-8')).hexdigest()


def _file_quick_hash(path):
    try:return indexed_engine.quick_hash(Path(path))
    except Exception:
        try:
            import hashlib
            h=hashlib.sha256(); p=Path(path); h.update(str(p.stat().st_size).encode())
            with p.open('rb') as fh:
                h.update(fh.read(1024*1024))
            return h.hexdigest()
        except Exception:return ''


def _json_load(path, default):
    try:return json.loads(Path(path).read_text(encoding='utf-8-sig'))
    except Exception:return default


def _json_save(path, obj):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True);tmp=path.with_suffix(path.suffix+'.next')
    tmp.write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf-8');os.replace(tmp,path)


def _current_windows_identity():
    user=(os.environ.get('USERNAME') or os.environ.get('USER') or 'unknown').strip()
    domain=(os.environ.get('USERDOMAIN') or '').strip()
    computer=(os.environ.get('COMPUTERNAME') or socket.gethostname() or '').strip()
    login=(f'{domain}\\{user}' if domain and '\\' not in user else user) or 'unknown'
    ip=''
    try: ip=socket.gethostbyname(socket.gethostname())
    except Exception: pass
    return {'login':login,'username':user,'domain':domain,'computerName':computer,'ip':ip,'sessionStartedAt':SESSION_STARTED_AT,'appVersion':APP_VERSION,'appBuild':APP_BUILD}

def load_user_responsibilities():
    data=_json_load(USER_RESP_PATH,{'users':{}})
    if not isinstance(data,dict): data={'users':{}}
    if not isinstance(data.get('users'),dict): data['users']={}
    return data

def save_user_responsibilities(payload, actor='ADMIN'):
    users=payload.get('users') if isinstance(payload,dict) else None
    if not isinstance(users,dict): raise ValueError('Kullanıcı sorumluluk listesi geçersiz.')
    clean={}
    for k,v in users.items():
        login=str(k or '').strip()
        if not login or not isinstance(v,dict): continue
        clean[login.lower()]={
            'login':login,
            'displayName':str(v.get('displayName') or '').strip(),
            'role':str(v.get('role') or 'NORMAL_USER').strip().upper(),
            'primaryProvinces':[str(x).strip() for x in (v.get('primaryProvinces') or []) if str(x).strip()],
            'backupProvinces':[str(x).strip() for x in (v.get('backupProvinces') or []) if str(x).strip()],
            'workTypes':[str(x).strip().upper() for x in (v.get('workTypes') or []) if str(x).strip()],
            'depots':[str(x).strip() for x in (v.get('depots') or []) if str(x).strip()],
            'active':bool(v.get('active',True))
        }
    out={'users':clean,'updatedAt':datetime.now().astimezone().isoformat(),'updatedBy':actor}
    _json_save(USER_RESP_PATH,out)
    DATA_ARCH_V2.audit('USER','RESPONSIBILITIES_UPDATED',actor,'USER_RESPONSIBILITIES','ALL',{'count':len(clean)})
    return out

def user_context(audit=False):
    global _SESSION_AUDITED
    ident=_current_windows_identity(); users=load_user_responsibilities().get('users',{})
    resp=users.get(ident['login'].lower()) or users.get(ident['username'].lower()) or {
        'login':ident['login'],'displayName':'','role':'NORMAL_USER','primaryProvinces':[],'backupProvinces':[],'workTypes':[],'depots':[],'active':True
    }
    result={**ident,'responsibility':resp}
    if audit and not _SESSION_AUDITED:
        try: DATA_ARCH_V2.audit('SESSION','SESSION_OPENED',ident['login'],'COMPUTER',ident['computerName'],result)
        except Exception: pass
        _SESSION_AUDITED=True
    return result

def _notif_state():
    d=_json_load(NOTIFICATION_PATH,{'items':{}})
    if not isinstance(d,dict): d={'items':{}}
    if not isinstance(d.get('items'),dict): d['items']={}
    return d

def _save_notif_state(d): _json_save(NOTIFICATION_PATH,d)

def _notif_signature(title,message,severity,category,meta):
    raw=json.dumps({'title':title,'message':message,'severity':severity,'category':category,'meta':meta or {}},ensure_ascii=False,sort_keys=True,default=str).encode('utf-8')
    return hashlib.sha256(raw).hexdigest()[:24]

def _notif_upsert(d,nid,title,message,severity='INFO',category='SYSTEM',meta=None,actions=None):
    now=datetime.now().astimezone().isoformat(); old=d['items'].get(nid) or {}; sig=_notif_signature(title,message,severity,category,meta)
    status=old.get('status') or 'OPEN'; read=bool(old.get('read',False))
    # Kullanıcı tarafından temizlenen aynı olay tekrar görünmez; olayın içeriği değişirse yeni olay gibi yeniden açılır.
    if status=='CLEARED' and str(old.get('signature') or '')!=sig:
        status='OPEN'; read=False
    item={
        'id':nid,'title':title,'message':message,'severity':severity,'category':category,
        'meta':meta or {},'actions':actions or [],'createdAt':old.get('createdAt') or now,'updatedAt':now,
        'status':status,'read':read,'signature':sig
    }
    for k in ('resolvedAt','resolvedBy','clearedAt','clearedBy'):
        if old.get(k): item[k]=old.get(k)
    d['items'][nid]=item; return item

def _mb51_reconcile(reservation_no, material_code, approved_qty=0):
    res=str(reservation_no or '').strip(); mat=str(material_code or '').strip()
    if not res or not mat:return {'found':False,'actualQty':0.0,'events':0,'status':'NOT_APPLICABLE'}
    try:
        with indexed_engine.connect(_active_index_db()) as c:
            r=c.execute("""SELECT COUNT(*) events,COALESCE(SUM(CASE WHEN movement IN ('301','311') THEN abs(qty) WHEN movement IN ('302','312') THEN -abs(qty) ELSE 0 END),0) actualQty,MAX(posting_date) lastDate FROM mb51 WHERE reservation=? AND material_code=? AND movement IN ('301','302','311','312')""",[res,mat]).fetchone()
        actual=float(r['actualQty'] or 0); events=int(r['events'] or 0); approved=float(approved_qty or 0)
        if not events: status='MB51_BEKLENIYOR'
        elif abs(actual-approved)<=1e-7: status='MUTABIK'
        else: status='FIILI_MIKTAR_FARKI'
        return {'found':bool(events),'actualQty':actual,'events':events,'lastDate':str(r['lastDate'] or ''),'status':status}
    except Exception as exc:return {'found':False,'actualQty':0.0,'events':0,'status':'KONTROL_EDILEMEDI','error':str(exc)}

def load_manual_tesis_projects():
    d=_json_load(MANUAL_TESIS_PROJECT_PATH,{'projects':[]})
    if not isinstance(d,dict): d={'projects':[]}
    if not isinstance(d.get('projects'),list): d['projects']=[]
    return d

def add_manual_tesis_project(payload, actor=None):
    actor=actor or user_context().get('login') or 'USER'
    depot=str(payload.get('depot') or '').strip().upper(); code=str(payload.get('projectCode') or '').strip(); name=str(payload.get('projectName') or '').strip()
    rows=payload.get('discoveryRows') or []
    if not depot or not name: raise ValueError('Depo ve proje adı zorunludur.')
    # Pull all current TESIS rows; allocates missing *local* IDs before previewing next number.
    known=operations_work_snapshot('T').get('projects') or []
    if any(str(r.get('dy') or '')==depot and str(r.get('projectNorm') or '')==indexed_engine.norm(name) for r in known):
        raise ValueError('Bu depoda aynı isimde bir proje zaten mevcut; mükerrer kayıt oluşturulmadı.')
    with indexed_engine.connect(_active_index_db()) as dbc:
        master=[dict(r) for r in dbc.execute('SELECT dy,project_id,project_norm FROM projects').fetchall()]
    existing=load_manual_tesis_projects().get('projects') or []
    if not code:code=project_ids28r.preview_next(depot,master,existing,PROJECT_IDS28R_PATH)
    if any(str(r.get('projectCode') or '')==code and str(r.get('dy') or r.get('depot') or '')==depot for r in known+existing):
        raise ValueError('Proje kodu başka bir projede kullanılıyor.')
    if not isinstance(rows,list) or not rows: raise ValueError('Yeni TESİS projesi için en az bir keşif malzeme satırı girilmelidir.')
    clean=[]
    for r in rows:
        mc=str((r or {}).get('materialCode') or '').strip(); qty=float((r or {}).get('planned') or 0); uom=str((r or {}).get('uom') or '').strip(); desc=str((r or {}).get('materialDesc') or '').strip()
        if not mc or qty<=0: raise ValueError('Keşif satırlarında malzeme kodu ve sıfırdan büyük keşif miktarı zorunludur.')
        clean.append({'materialCode':mc,'materialDesc':desc,'uom':uom,'planned':qty,'given':0.0,'remaining':qty})
    data=load_manual_tesis_projects(); pid='TMP-'+datetime.now().strftime('%Y%m%d%H%M%S')+'-'+uuid.uuid4().hex[:5].upper(); now=datetime.now().astimezone().isoformat()
    item={'id':pid,'depot':depot,'projectCode':code,'projectName':name,'projectNorm':indexed_engine.norm(name or code),'discoveryRows':clean,'status':'AKTIF','createdAt':now,'createdBy':actor}
    data['projects'].append(item); _json_save(MANUAL_TESIS_PROJECT_PATH,data)
    DATA_ARCH_V2.audit('PROJECT','TESIS_PROJECT_CREATED',actor,'TESIS_PROJECT',pid,item)
    d=_notif_state();_notif_upsert(d,'NEWPROJ-'+pid,'Yeni TESİS projesi eklendi',f'{depot} deposuna {name or code} projesi ve {len(clean)} keşif kalemi eklendi.','INFO','PROJE',{'depot':depot,'projectCode':code,'projectName':name},[{'label':'TESİS ekranına git','action':'OPEN_TESIS','depot':depot}]);_save_notif_state(d)
    return item

def _manual_project_rows(depot,project_norm):
    out=[]
    for p in load_manual_tesis_projects().get('projects',[]):
        if str(p.get('depot') or '')!=str(depot or ''):continue
        if str(p.get('projectNorm') or '')!=str(project_norm or ''):continue
        for r in p.get('discoveryRows') or []:
            out.append({'dy':depot,'projectNorm':p.get('projectNorm'),'projectName':p.get('projectName'),'projectCode':p.get('projectCode'),'materialCode':r.get('materialCode'),'materialDesc':r.get('materialDesc'),'uom':r.get('uom'),'planned':r.get('planned',0),'given':r.get('given',0),'remaining':r.get('remaining',0),'negativeRows':1 if float(r.get('remaining') or 0)<0 else 0,'issueRows':0,'manualProject':True})
    return out

def build_notifications():
    d=_notif_state()
    # Kaynak değişiklikleri
    try:
        cfg,_,missing=source_snapshot_cached(force=False)
        for p in cfg.get('_pending_source_updates',[]) or []:
            src=str(p.get('source') or 'KAYNAK'); _notif_upsert(d,'SRC-'+src,f'Yeni {src} kaynak verisi algılandı','Yeni kaynak verisi kullanıcı onayı bekliyor.','INFO','VERI_KAYNAKLARI',p,[{'label':'Veri Merkezine Git','action':'OPEN_DATA_CENTER'}])
        for src in missing or []:_notif_upsert(d,'MISS-'+str(src),f'{src} kaynak verisi eksik','Zorunlu kaynak dosyası bulunamadı.','CRITICAL','VERI_KAYNAKLARI',{'source':src},[{'label':'Veri Merkezine Git','action':'OPEN_DATA_CENTER'}])
    except Exception: pass
    # Veri kalitesi ve keşif sorunları
    try:
        eng=_engine_snapshot(); q=eng.get('quality') or {}
        for f in (q.get('findings') or [])[:50]:
            cnt=int(f.get('count') or 0)
            if cnt<=0:continue
            sev=str(f.get('severity') or 'WARNING').upper(); code=str(f.get('code') or 'QUALITY'); src=str(f.get('source') or '')
            _notif_upsert(d,'Q-'+code,f'{src} veri kalitesi: {code}',str(f.get('message') or f.get('description') or 'Veri kalite bulgusu tespit edildi.'),sev,'VERI_KALITESI',f,[{'label':'Veri Merkezine Git','action':'OPEN_DATA_CENTER'}])
        with indexed_engine.connect(_active_index_db()) as c:
            for wc,label in [('T','TESİS'),('K','KET&YB'),('B','BAKIM'),('L','LED')]:
                r=c.execute('SELECT COUNT(*) c FROM kesif WHERE work_code=? AND (remaining<0 OR issue=1)',[wc]).fetchone(); cnt=int(r['c'] or 0)
                if cnt:_notif_upsert(d,'KESIF-'+wc,f'{label} keşif kontrolü gerekli',f'{cnt} keşif/malzeme satırında negatif veya hatalı durum tespit edildi.','WARNING','KESIF',{'workCode':wc,'count':cnt},[{'label':label+' ekranına git','action':'OPEN_WORK','workCode':wc}])
    except Exception: pass
    # Kaydedilmiş kalemleri güncel MB51 ile karşılaştır
    try:
        root=load_record_root(); dirs=record_dir_paths(root); files=sorted(record_visible_paths('materials',root),key=lambda x:x.stat().st_mtime,reverse=True)[:120]
        for path in files:
            try:
                rows=_read_csv_dict(path)
            except Exception: continue
            for r in rows[:150]:
                res=str(r.get('RezervasyonNo') or '').strip(); mat=str(r.get('MalzemeKodu') or '').strip(); decision=str(r.get('KalemKarari') or '').strip().upper(); approved=float(_dashboard_num(r.get('OnaylananMiktar')))
                if not res or not mat:continue
                rec=_mb51_reconcile(res,mat,approved)
                cid=str(r.get('KontrolID') or path.stem)
                if decision!='ONAYLA' and rec.get('found') and float(rec.get('actualQty') or 0)>0:
                    _notif_upsert(d,f'UNAPPROVED-{cid}-{mat}','Onaylanmamış kalemde MB51 hareketi tespit edildi',f'{res} rezervasyonunda {mat} malzemesi onaylanmamış olmasına rağmen MB51 fiili hareketi bulundu.','CRITICAL','MB51',{'controlId':cid,'reservationNo':res,'materialCode':mat,**rec},[{'label':'Kontrol kaydına git','action':'OPEN_RECORDS'}])
                elif decision=='ONAYLA' and rec.get('found') and rec.get('status')=='FIILI_MIKTAR_FARKI':
                    is_tesis=str(r.get('IsTuru') or '').strip().upper() in ('TESIS','TESİS','T')
                    target=str(r.get('HedefDepo') or '').strip()
                    title='TESİS proje dağılımı bekliyor' if is_tesis else 'MB51 miktarı onaydan farklı'
                    actions=[{'label':'TESİS ekranına git','action':'OPEN_TESIS','depot':target},{'label':'Kontrol kaydına git','action':'OPEN_RECORDS'}] if is_tesis else [{'label':'Kontrol kaydına git','action':'OPEN_RECORDS'}]
                    _notif_upsert(d,f'MISMATCH-{cid}-{mat}',title,f'{mat}: onay {approved:g}, MB51 fiili {float(rec.get("actualQty") or 0):g}. '+('Fiili miktar proje/projelere yeniden dağıtılmalıdır.' if is_tesis else ''),'WARNING','MB51',{'controlId':cid,'reservationNo':res,'materialCode':mat,'depot':target,'approvedQty':approved,'requiresProjectRedistribution':is_tesis,**rec},actions)
    except Exception: pass
    _save_notif_state(d)
    items=list(d['items'].values());items.sort(key=lambda x:(x.get('status')!='OPEN',x.get('read',False),x.get('updatedAt','')),reverse=False)
    return items

def notification_action(payload, actor=None):
    actor=actor or user_context().get('login') or 'USER'; nid=str(payload.get('id') or '').strip(); action=str(payload.get('action') or '').upper().strip()
    d=_notif_state(); item=d['items'].get(nid)
    if not item: raise ValueError('Bildirim bulunamadı.')
    if action=='READ': item['read']=True
    elif action=='RESOLVE': item['status']='RESOLVED';item['read']=True;item['resolvedAt']=datetime.now().astimezone().isoformat();item['resolvedBy']=actor
    elif action=='REOPEN': item['status']='OPEN'
    else: raise ValueError('Geçersiz bildirim işlemi.')
    item['updatedAt']=datetime.now().astimezone().isoformat(); d['items'][nid]=item; _save_notif_state(d);DATA_ARCH_V2.audit('NOTIFICATION',action,actor,'NOTIFICATION',nid,item);return item

def clear_notifications(payload=None, actor=None):
    actor=actor or user_context().get('login') or 'USER'; payload=payload or {}; mode=str(payload.get('mode') or 'SAFE').upper().strip()
    if mode!='SAFE': raise ValueError('Geçersiz temizleme modu.')
    d=_notif_state(); now=datetime.now().astimezone().isoformat(); cleared=[]; protected=[]
    for nid,item in list(d.get('items',{}).items()):
        sev=str(item.get('severity') or 'INFO').upper(); status=str(item.get('status') or 'OPEN').upper()
        if status=='OPEN' and sev in ('CRITICAL','WARNING'):
            protected.append(nid); continue
        if status=='CLEARED': continue
        item['status']='CLEARED'; item['read']=True; item['clearedAt']=now; item['clearedBy']=actor; item['updatedAt']=now
        d['items'][nid]=item; cleared.append(nid)
    _save_notif_state(d)
    DATA_ARCH_V2.audit('NOTIFICATION','BULK_CLEAR',actor,'NOTIFICATION','SAFE',{'clearedCount':len(cleared),'protectedCount':len(protected),'clearedIds':cleared[:100],'protectedIds':protected[:100]})
    return {'cleared':len(cleared),'protected':len(protected)}


def _source_info_from_files(source, files, origin='active'):
    files=[dict(x) for x in (files or []) if x and Path(x.get('path') or '').exists()]
    if not files:return None
    for i,f in enumerate(files):
        path=Path(f['path']);st=path.stat();f['name']=f.get('name') or path.name;f['size']=st.st_size;f['lastModified']=int(st.st_mtime*1000);f['modifiedIso']=time.strftime('%Y-%m-%dT%H:%M:%S',time.localtime(st.st_mtime));f['origin']=origin;f['url']='/api/file?source='+urllib.parse.quote(source)+'&index='+str(i)
    size=sum(int(x.get('size') or 0) for x in files);lm=max(int(x.get('lastModified') or 0) for x in files)
    return {'name':files[0]['name'] if len(files)==1 else f'{len(files)} CSV dosyası','path':files[0]['path'] if len(files)==1 else ' | '.join(x['name'] for x in files),'size':size,'lastModified':lm,'modifiedIso':time.strftime('%Y-%m-%dT%H:%M:%S',time.localtime(lm/1000)),'origin':origin,'confidence':100,'detection':'managed','files':files}


def _shadow_small_source(source, info):
    if source not in SMALL_SHADOW_SOURCES or not info:return info
    target_dir=SOURCE_ACTIVE_SHADOW_ROOT/source;target_dir.mkdir(parents=True,exist_ok=True);out=[]
    # Tek seferlik ACTIVE kaynak gölgesi: eski veriyle devam seçeneği kaynak dosya üstüne yazılsa bile korunur.
    for i,f in enumerate(info.get('files') or []):
        src=Path(f.get('path') or '')
        if not src.exists():continue
        role=str(f.get('role') or source)
        # Kaynak motoru imzası dosya adını da kullanıyor. Gölge kopyada orijinal adı koru.
        dst=target_dir/src.name
        if not dst.exists() or dst.stat().st_size!=src.stat().st_size or _file_quick_hash(dst)!=_file_quick_hash(src):
            shutil.copy2(src,dst)
        nf=dict(f);nf['path']=str(dst);nf['origin']='active-shadow';out.append(nf)
    return _source_info_from_files(source,out,'active-shadow') or info


def _serialize_source_info(info):
    if not info:return None
    keep=[]
    for f in info.get('files') or []:
        keep.append({k:f.get(k) for k in ('name','path','role','sheet','delimiter','encoding','headerRow','origin')})
    return {'files':keep,'acceptedDigest':_source_digest(info),'acceptedAt':datetime.now().astimezone().isoformat()}


def _deserialize_source_info(source, rec):
    if not rec:return None
    files=[];relocated=False
    for raw in rec.get('files') or []:
        f=dict(raw or {});path=Path(f.get('path') or '')
        if not path.exists():
            # Paket farklı bilgisayara/klasöre taşındığında eski mutlak yol geçersiz olabilir.
            # ACTIVE gölge dosyası paket içinde kaynak + dosya adıyla yeniden çözülür.
            local=SOURCE_ACTIVE_SHADOW_ROOT/str(source)/str(f.get('name') or path.name)
            if local.exists():f['path']=str(local);f['origin']='active-shadow-relocated';relocated=True
        files.append(f)
    return _source_info_from_files(source,files,'active-shadow-relocated' if relocated else 'active')


def _source_content_digest(info):
    if not info:return ''
    rows=[]
    for f in (info.get('files') or []):
        path=Path(f.get('path') or '')
        try:st=path.stat();qh=_file_quick_hash(path)
        except Exception:st=None;qh=''
        rows.append({'name':str(f.get('name') or path.name),'role':str(f.get('role') or ''),'size':int(st.st_size if st else f.get('size') or 0),'quick':qh})
    rows.sort(key=lambda x:(x['role'],x['name']))
    return hashlib.sha256(json.dumps(rows,ensure_ascii=False,sort_keys=True).encode('utf-8')).hexdigest()


def _logical_to_underlying(logical):
    u=str(logical or '').upper()
    return ('KESIFLER',{'TESIS':'T','KET':'K','BAKIM':'B','LED':'L'}.get(u)) if u in ('TESIS','KET','BAKIM','LED') else (u,None)


def _candidate_with_overrides():
    cfg,candidates,missing=source_snapshot()
    overrides=_json_load(SOURCE_PENDING_OVERRIDE_PATH,{})
    if not isinstance(overrides,dict):overrides={}
    for logical,odata in list(overrides.items()):
        path=Path((odata or {}).get('path') or '')
        if not path.exists():continue
        source,role=_logical_to_underlying(logical)
        meta=_scan_csv(path,'external',float(cfg.get('csv_detection_min_confidence',0.72) or 0.72))
        if not meta.get('classified'):continue
        meta['source']=source
        if source=='KESIFLER' and role:meta['role']=role
        f=_public_file(meta,source,0)
        if source=='KESIFLER' and role:
            base=candidates.get('KESIFLER') or {'files':[]}
            files=[dict(x) for x in base.get('files') or [] if str(x.get('role') or '').upper()!=role]
            f['role']=role;f['sheet']=_sheet_name(source,role,path);files.append(f);files.sort(key=lambda x:str(x.get('role') or ''))
            candidates['KESIFLER']=_source_info_from_files('KESIFLER',files,'candidate')
        else:
            candidates[source]=_source_info_from_files(source,[f],'candidate')
    return cfg,candidates,missing


def _active_state_init(candidates):
    state=_json_load(SOURCE_ACTIVE_STATE_PATH,{})
    if not isinstance(state,dict):state={}
    changed=False
    for source in SOURCE_NAMES:
        if source in state:continue
        info=(candidates or {}).get(source)
        if not info:continue
        active_info=_shadow_small_source(source,info)
        state[source]=_serialize_source_info(active_info);changed=True
    if changed:_json_save(SOURCE_ACTIVE_STATE_PATH,state)
    return state


def _pending_source_updates(active_sources,candidates):
    prefs=_json_load(SOURCE_UPDATE_PREF_PATH,{})
    out=[]
    logicals=['MB51','MB52','ZMM048','ZMM098','TESIS','KET','BAKIM','LED']
    for logical in logicals:
        source,role=_logical_to_underlying(logical)
        ai=(active_sources or {}).get(source);ci=(candidates or {}).get(source);active_origin=str((ai or {}).get('origin') or 'active')
        if role:
            af=[x for x in (ai or {}).get('files') or [] if str(x.get('role') or '').upper()==role]
            cf=[x for x in (ci or {}).get('files') or [] if str(x.get('role') or '').upper()==role]
            ai=_source_info_from_files(source,af,active_origin) if af else None;ci=_source_info_from_files(source,cf,'candidate') if cf else None
        if not ci:continue
        ad=_source_digest(ai);cd=_source_digest(ci)
        if ad==cd:continue
        # ZIP başka klasöre açıldığında gölge ve paket CSV zaman damgaları birkaç saniye
        # değişebilir. İçerik aynıysa bunu yeni veri olarak göstermeyiz.
        if str((ai or {}).get('origin') or '').startswith('active-shadow-relocated') and _source_content_digest(ai)==_source_content_digest(ci):continue
        old_size=int((ai or {}).get('size') or 0);new_size=int(ci.get('size') or 0)
        item={'source':logical,'underlyingSource':source,'role':role or '','activeDigest':ad,'candidateDigest':cd,'oldName':(ai or {}).get('name') or '—','newName':ci.get('name') or '—','oldSize':old_size,'newSize':new_size,'oldModified':(ai or {}).get('modifiedIso') or '','newModified':ci.get('modifiedIso') or '','oldFileCount':len((ai or {}).get('files') or []),'newFileCount':len(ci.get('files') or []),'deferred':str((prefs.get(logical) or {}).get('deferredDigest') or '')==cd}
        out.append(item)
    return out


def managed_source_snapshot():
    cfg,candidates,_=_candidate_with_overrides();state=_active_state_init(candidates);active={};missing=[]
    for source in SOURCE_NAMES:
        info=_deserialize_source_info(source,state.get(source))
        if not info:
            info=(candidates or {}).get(source)
        active[source]=info
        if not info:missing.append(source)
    pending=_pending_source_updates(active,candidates)
    cfg['_pending_source_updates']=pending
    cfg['_candidate_sources']=candidates
    return cfg,active,missing


def source_pending_updates(force=True):
    if force:invalidate_source_snapshot()
    cfg,active,missing=source_snapshot_cached(force=force)
    return cfg.get('_pending_source_updates') or []


def _source_state_proposed(logical):
    cfg,candidates,_=_candidate_with_overrides();state=_active_state_init(candidates)
    source,role=_logical_to_underlying(logical);candidate=candidates.get(source)
    if not candidate:raise ValueError(f'{logical} için yeni kaynak adayı bulunamadı.')
    active={s:_deserialize_source_info(s,state.get(s)) or candidates.get(s) for s in SOURCE_NAMES}
    if role:
        cfiles=[dict(x) for x in candidate.get('files') or [] if str(x.get('role') or '').upper()==role]
        if not cfiles:raise ValueError(f'{logical} keşif dosyası bulunamadı.')
        afiles=[dict(x) for x in (active.get('KESIFLER') or {}).get('files') or [] if str(x.get('role') or '').upper()!=role]
        afiles.extend(cfiles);active['KESIFLER']=_source_info_from_files('KESIFLER',afiles,'candidate')
    else:active[source]=candidate
    return active,state,candidate,source,role


def source_update_choice(logical,choice,actor='DATA_MANAGER'):
    logical=str(logical or '').upper();choice=str(choice or '').lower()
    pending=source_pending_updates(force=True);item=next((x for x in pending if x.get('source')==logical),None)
    if not item:return {'source':logical,'status':'NO_PENDING','message':'Bu kaynak için bekleyen yeni veri yok.'}
    prefs=_json_load(SOURCE_UPDATE_PREF_PATH,{})
    if choice=='keep':
        prefs[logical]={'deferredDigest':item.get('candidateDigest'),'deferredAt':datetime.now().astimezone().isoformat()};_json_save(SOURCE_UPDATE_PREF_PATH,prefs)
        DATA_ARCH_V2.audit('SOURCE','UPDATE_DEFERRED',actor,'SOURCE',logical,item)
        return {'source':logical,'status':'DEFERRED','message':'Mevcut sağlıklı ACTIVE veri kullanılmaya devam edecek.','pending':item}
    if choice!='accept':raise ValueError('Geçersiz kaynak güncelleme seçeneği.')
    proposed,state,candidate,source,role=_source_state_proposed(logical)
    # Önce yeni kaynak seti staging indeksinde doğrulanır. CRITICAL ise ACTIVE pointer değişmez.
    result=_rebuild_engine(proposed)
    # Build başarıyla ACTIVE olduktan sonra kaynak dosya seçimi de atomik şekilde yeni adaya taşınır.
    if role:
        active_k=_deserialize_source_info('KESIFLER',state.get('KESIFLER')) or proposed.get('KESIFLER')
        active_files=[dict(x) for x in (active_k or {}).get('files') or [] if str(x.get('role') or '').upper()!=role]
        cfiles=[dict(x) for x in (candidate or {}).get('files') or [] if str(x.get('role') or '').upper()==role]
        active_files.extend(cfiles);new_info=_source_info_from_files('KESIFLER',active_files,'active')
        new_info=_shadow_small_source('KESIFLER',new_info)
        state['KESIFLER']=_serialize_source_info(new_info)
    else:
        new_info=proposed.get(source)
        if source in SMALL_SHADOW_SOURCES:new_info=_shadow_small_source(source,new_info)
        state[source]=_serialize_source_info(new_info)
    _json_save(SOURCE_ACTIVE_STATE_PATH,state)
    if logical in prefs:prefs.pop(logical,None);_json_save(SOURCE_UPDATE_PREF_PATH,prefs)
    # Kullanıcı dosya seçiciden bir kaynak belirlediyse, kabulden sonra da o dosya
    # izlenen kaynak olarak kalır. Böylece sonraki içerik değişiklikleri tekrar algılanır.
    overrides=_json_load(SOURCE_PENDING_OVERRIDE_PATH,{})
    accepted_override=overrides.get(logical) if isinstance(overrides,dict) else None
    selected_from=Path((accepted_override or {}).get('selectedFrom') or '') if accepted_override else None
    if selected_from and str(selected_from) not in ('','.') and selected_from.exists():
        overrides[logical]={**accepted_override,'path':str(selected_from),'acceptedAt':datetime.now().astimezone().isoformat(),'accepted':True}
    elif logical in overrides:
        overrides.pop(logical,None)
    _json_save(SOURCE_PENDING_OVERRIDE_PATH,overrides)
    invalidate_source_snapshot();cfg,active,_=source_snapshot_cached(force=True);DATA_ARCH_V2.observe_sources(active or {})
    DATA_ARCH_V2.audit('SOURCE','UPDATE_ACCEPTED',actor,'SOURCE',logical,{**item,'buildId':result.get('build_id')})
    return {'source':logical,'status':'ACTIVE','message':'Yeni kaynak kalite ve bütünlük kontrollerinden geçerek ACTIVE yapıldı.','buildId':result.get('build_id'),'pending':item}



def _read_text_auto(path: Path):
    raw=path.read_bytes()
    enc=_detect_encoding_bytes(raw[:512*1024])
    try:return raw.decode(enc),enc
    except Exception:return raw.decode(enc,errors='replace'),enc


def _data_prep_template(source_key):
    key=str(source_key or '').upper().strip()
    cached=_DATA_PREP_TEMPLATE_CACHE.get(key)
    if cached:return key,dict(cached)
    cfg=DATA_PREP_TEMPLATES.get(key)
    if not cfg:raise ValueError('Geçersiz kaynak CSV şablonu.')
    path=BUNDLED_ROOT/cfg['filename']
    if not path.exists():raise ValueError(f'Kaynak CSV şablonu bulunamadı: {cfg["filename"]}')
    text,_=_decode_sample(path,max_bytes=512*1024);delim=_detect_delimiter(text)
    first=next(csv.reader(text.splitlines(),delimiter=delim),[])
    headers=[str(x or '').strip() for x in first]
    if not headers:raise ValueError(f'{cfg["filename"]} başlık satırı okunamadı.')
    result={**cfg,'headers':headers,'headerCount':len(headers)};_DATA_PREP_TEMPLATE_CACHE[key]=dict(result)
    return key,result


def _data_prep_templates_public():
    out=[]
    for key in DATA_PREP_TEMPLATES:
        try:
            k,cfg=_data_prep_template(key);out.append({'key':k,'label':cfg['label'],'filename':cfg['filename'],'logical':cfg['logical'],'headerCount':cfg['headerCount']})
        except Exception as exc:out.append({'key':key,'label':DATA_PREP_TEMPLATES[key]['label'],'filename':DATA_PREP_TEMPLATES[key]['filename'],'logical':DATA_PREP_TEMPLATES[key].get('logical',''),'headerCount':0,'error':str(exc)})
    return out


def _xlsx_col_index(ref):
    letters=''.join(ch for ch in str(ref or '') if ch.isalpha()).upper();n=0
    for ch in letters:n=n*26+(ord(ch)-64)
    return max(0,n-1)


def _xlsx_shared_strings(zf):
    name='xl/sharedStrings.xml'
    if name not in zf.namelist():return []
    out=[]
    try:
        for _,el in ET.iterparse(zf.open(name),events=('end',)):
            if el.tag.endswith('}si'):
                out.append(''.join((x.text or '') for x in el.iter() if x.tag.endswith('}t')));el.clear()
    except Exception:return out
    return out


def _xlsx_date_styles(zf):
    name='xl/styles.xml'
    if name not in zf.namelist():return set()
    built={14,15,16,17,18,19,20,21,22,45,46,47};custom={};date_styles=set()
    try:
        root=ET.fromstring(zf.read(name))
        for el in root.iter():
            if el.tag.endswith('}numFmt'):
                try:custom[int(el.attrib.get('numFmtId','0'))]=el.attrib.get('formatCode','')
                except Exception:pass
        xfs=next((x for x in root.iter() if x.tag.endswith('}cellXfs')),None)
        if xfs is not None:
            for idx,xf in enumerate(list(xfs)):
                try:n=int(xf.attrib.get('numFmtId','0'))
                except Exception:n=0
                fmt=custom.get(n,'').lower();clean=re.sub(r'"[^"]*"|\\.|\[[^\]]*\]','',fmt)
                if n in built or (clean and any(ch in clean for ch in ('y','d','h','s')) and '0.00' not in clean):date_styles.add(idx)
    except Exception:pass
    return date_styles


def _xlsx_serial_text(value):
    try:
        n=float(value);dt=datetime(1899,12,30)+timedelta(days=n)
        if abs(n-round(n))<1e-10:return dt.strftime('%d.%m.%Y')
        return dt.strftime('%d.%m.%Y %H:%M:%S')
    except Exception:return str(value or '')


def _xlsx_workbook_info(path: Path):
    if path.suffix.lower() not in ('.xlsx','.xlsm'):raise ValueError('Yalnız .xlsx ve .xlsm Excel dosyaları desteklenir.')
    with zipfile.ZipFile(path,'r') as zf:
        wb=ET.fromstring(zf.read('xl/workbook.xml'));rels=ET.fromstring(zf.read('xl/_rels/workbook.xml.rels'))
        rmap={r.attrib.get('Id'):r.attrib.get('Target') for r in rels}
        date1904=False
        pr=next((x for x in wb.iter() if x.tag.endswith('}workbookPr')),None)
        if pr is not None:date1904=str(pr.attrib.get('date1904','')).lower() in ('1','true')
        sheets=[]
        for sh in wb.iter():
            if not sh.tag.endswith('}sheet'):continue
            rid=sh.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id');target=rmap.get(rid,'')
            if not target:continue
            target=target.lstrip('/')
            if not target.startswith('xl/'):target='xl/'+target.lstrip('./')
            target=re.sub(r'/+','/',target)
            sheets.append({'name':sh.attrib.get('name','Sheet'),'path':target})
        return sheets,date1904


def _xlsx_rows(path: Path, sheet_name: str, limit=None):
    with zipfile.ZipFile(path,'r') as zf:
        sheets,date1904=_xlsx_workbook_info(path);sh=next((x for x in sheets if x['name']==sheet_name),None)
        if not sh:raise ValueError(f'Excel sayfası bulunamadı: {sheet_name}')
        shared=_xlsx_shared_strings(zf);date_styles=_xlsx_date_styles(zf);ns='}'
        count=0
        with zf.open(sh['path']) as fh:
            for _,row in ET.iterparse(fh,events=('end',)):
                if not row.tag.endswith('}row'):continue
                values={};max_col=-1
                for c in list(row):
                    if not c.tag.endswith('}c'):continue
                    idx=_xlsx_col_index(c.attrib.get('r',''));max_col=max(max_col,idx);typ=c.attrib.get('t','');style=int(c.attrib.get('s','0') or 0);val=''
                    if typ=='inlineStr':val=''.join((x.text or '') for x in c.iter() if x.tag.endswith('}t'))
                    else:
                        v=next((x for x in c if x.tag.endswith('}v')),None);raw=(v.text if v is not None and v.text is not None else '')
                        if typ=='s':
                            try:val=shared[int(raw)]
                            except Exception:val=raw
                        elif typ=='b':val='TRUE' if raw=='1' else 'FALSE'
                        elif style in date_styles and raw:
                            if date1904:
                                try:
                                    n=float(raw);dt=datetime(1904,1,1)+timedelta(days=n);val=dt.strftime('%d.%m.%Y') if abs(n-round(n))<1e-10 else dt.strftime('%d.%m.%Y %H:%M:%S')
                                except Exception:val=raw
                            else:val=_xlsx_serial_text(raw)
                        else:
                            if raw:
                                try:
                                    f=float(raw);val=str(int(f)) if f.is_integer() else format(f,'.15g')
                                except Exception:val=raw
                    values[idx]=str(val or '').replace('\r\n','\n').replace('\r','\n')
                if max_col>=0:
                    arr=['']*(max_col+1)
                    for idx,val in values.items():arr[idx]=val
                    yield arr;count+=1
                    if limit is not None and count>=limit:return
                row.clear()


def _data_prep_detect_header(rows, source_key):
    _,cfg=_data_prep_template(source_key);wanted={_norm_header(h) for h in cfg['headers'] if _norm_header(h)};best={'rowIndex':-1,'matches':0,'ratio':0.0,'mapping':{},'inputHeaders':[]}
    for idx,row in enumerate(rows[:35]):
        mapping={};hits=0
        for ci,val in enumerate(row):
            n=_norm_header(val)
            if n and n not in mapping:mapping[n]=ci
            if n in wanted:hits+=1
        ratio=(hits/len(wanted)) if wanted else 0
        if hits>best['matches'] or (hits==best['matches'] and ratio>best['ratio']):best={'rowIndex':idx,'matches':hits,'ratio':ratio,'mapping':mapping,'inputHeaders':list(row)}
    return best


def _data_prep_detect_source(rows, file_name='', sheet_name=''):
    scores=[]
    for key in DATA_PREP_TEMPLATES:
        d=_data_prep_detect_header(rows,key);score=d['ratio'];matches=d['matches']
        if key in ('TESIS','KET','BAKIM','LED'):
            txt=_norm_header(f'{file_name} {sheet_name}')
            tokens={'TESIS':['tesis'],'KET':['ket','yb'],'BAKIM':['bakim'],'LED':['led']}
            if any(t in txt for t in tokens[key]):score+=0.25
        scores.append((score,matches,key,d))
    scores.sort(reverse=True,key=lambda x:(x[0],x[1]));score,matches,key,d=scores[0] if scores else (0,0,'',{})
    # Keşif şablonları birebir aynıysa dosya/sayfa adında tür yoksa kullanıcı seçimi gerektirir.
    if key in ('TESIS','KET','BAKIM','LED'):
        txt=_norm_header(f'{file_name} {sheet_name}')
        found=[k for k,toks in {'TESIS':['tesis'],'KET':['ket','yb'],'BAKIM':['bakim'],'LED':['led']}.items() if any(t in txt for t in toks)]
        if not found:key='TESIS' if 'tesis' in txt else key
    return {'source':key,'confidence':round(min(score,1.0),3),'headerRow':int(d.get('rowIndex',-1))+1,'matches':matches}


def _data_prep_sheet_info(path: Path, sheet):
    rows=list(_xlsx_rows(path,sheet['name'],limit=35));det=_data_prep_detect_source(rows,path.name,sheet['name'])
    dim_rows=0;dim_cols=0
    try:
        with zipfile.ZipFile(path,'r') as zf:
            root=ET.fromstring(zf.read(sheet['path']));dim=next((x for x in root.iter() if x.tag.endswith('}dimension')),None);ref=(dim.attrib.get('ref','') if dim is not None else '')
            tail=ref.split(':')[-1];letters=''.join(x for x in tail if x.isalpha());nums=''.join(x for x in tail if x.isdigit());dim_rows=int(nums or 0);dim_cols=_xlsx_col_index(letters)+1 if letters else 0
    except Exception:pass
    preview=[r[:20] for r in rows[:12]]
    return {'name':sheet['name'],'estimatedRows':dim_rows,'estimatedCols':dim_cols,'detectedSource':det['source'],'confidence':det['confidence'],'headerRow':det['headerRow'],'preview':preview}


def _pick_excel_files_windows(initial: Path, title: str):
    if os.name!='nt':raise RuntimeError('Excel seçim penceresi yalnız Windows yerel çalıştırmada kullanılabilir.')
    ps=shutil.which('powershell.exe') or shutil.which('powershell')
    if not ps:raise RuntimeError('Windows PowerShell bulunamadı.')
    env=os.environ.copy();env['TALEP_PICKER_INITIAL']=str(initial);env['TALEP_PICKER_TITLE']=title
    script="$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Windows.Forms; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $owner=New-Object System.Windows.Forms.Form; $owner.TopMost=$true; $owner.ShowInTaskbar=$false; $owner.Opacity=0; $d=New-Object System.Windows.Forms.OpenFileDialog; $d.Title=$env:TALEP_PICKER_TITLE; $d.Filter='Excel dosyaları (*.xlsx;*.xlsm)|*.xlsx;*.xlsm|Excel çalışma kitabı (*.xlsx)|*.xlsx|Excel makrolu çalışma kitabı (*.xlsm)|*.xlsm'; $d.Multiselect=$true; if(Test-Path -LiteralPath $env:TALEP_PICKER_INITIAL -PathType Container){$d.InitialDirectory=$env:TALEP_PICKER_INITIAL}; $owner.Show(); $owner.Activate(); $r=$d.ShowDialog($owner); $owner.Close(); if($r -eq [System.Windows.Forms.DialogResult]::OK){$d.FileNames | ForEach-Object { Write-Output $_ }}"
    flags=getattr(subprocess,'CREATE_NO_WINDOW',0);res=subprocess.run([ps,'-NoProfile','-STA','-WindowStyle','Hidden','-Command',script],capture_output=True,text=True,encoding='utf-8',errors='replace',env=env,creationflags=flags,timeout=300)
    if res.returncode!=0:raise RuntimeError((res.stderr or res.stdout or 'Excel seçim penceresi açılamadı.').strip())
    out=[]
    for line in (res.stdout or '').splitlines():
        line=line.strip().lstrip('\ufeff')
        if line:out.append(Path(line))
    return out


def data_prep_select_excel():
    initial=_settings_folder_path('data');paths=_pick_excel_files_windows(initial,'Kaynak CSV oluşturulacak Excel dosyalarını seçin')
    if not paths:return {'cancelled':True,'items':[],'templates':_data_prep_templates_public()}
    items=[]
    with _DATA_PREP_LOCK:
        # Eski seçim tokenlarını sınırlı tut.
        if len(_DATA_PREP_SELECTIONS)>100:_DATA_PREP_SELECTIONS.clear()
        for path in paths:
            if not path.exists():continue
            sheets,_=_xlsx_workbook_info(path);infos=[_data_prep_sheet_info(path,sh) for sh in sheets];best=max(infos,key=lambda x:(x.get('confidence',0),x.get('estimatedRows',0)),default={})
            token=uuid.uuid4().hex;_DATA_PREP_SELECTIONS[token]={'path':str(path),'selectedAt':time.time()}
            items.append({'token':token,'fileName':path.name,'path':str(path),'size':path.stat().st_size,'sheets':infos,'suggestedSheet':best.get('name',''),'detectedSource':best.get('detectedSource',''),'confidence':best.get('confidence',0),'headerRow':best.get('headerRow',0)})
    actor=user_context().get('login') or 'DATA_MANAGER';DATA_ARCH_V2.audit('DATA_PREP','EXCEL_SELECTED',actor,'DATA_PREP','BATCH',{'files':[x['fileName'] for x in items],'count':len(items)})
    return {'cancelled':False,'items':items,'templates':_data_prep_templates_public(),'outputRoot':str(DATA_PREP_ROOT)}


def _data_prep_selected_path(token):
    with _DATA_PREP_LOCK:item=_DATA_PREP_SELECTIONS.get(str(token or ''))
    if not item:raise ValueError('Excel seçim oturumu bulunamadı. Dosyaları yeniden seçin.')
    path=Path(item.get('path') or '')
    if not path.exists():raise ValueError('Seçilen Excel dosyası artık bulunamıyor.')
    return path


def _data_prep_history():
    raw=_json_load(DATA_PREP_HISTORY_PATH,[]);return raw if isinstance(raw,list) else []


def _data_prep_save_history(item):
    hist=_data_prep_history();hist.insert(0,item);_json_save(DATA_PREP_HISTORY_PATH,hist[:100]);return hist[:100]


def _data_prep_convert_one(path: Path, sheet_name: str, source_key: str, out_path: Path):
    source_key,cfg=_data_prep_template(source_key);sample=list(_xlsx_rows(path,sheet_name,limit=35));best=_data_prep_detect_header(sample,source_key)
    if best['rowIndex']<0 or best['matches']<max(2,min(5,len(cfg['headers'])//3)):
        raise ValueError(f'{path.name} / {sheet_name}: {cfg["label"]} başlıkları yeterli düzeyde eşleşmedi ({best["matches"]}/{len(cfg["headers"])}).')
    input_headers=best['inputHeaders'];norm_to_cols=defaultdict(list)
    for i,h in enumerate(input_headers):
        n=_norm_header(h)
        if n:norm_to_cols[n].append(i)
    seen=defaultdict(int);mapping=[]
    for h in cfg['headers']:
        n=_norm_header(h);pos=seen[n];cols=norm_to_cols.get(n) or [];mapping.append(cols[pos] if pos<len(cols) else (cols[0] if cols else None));seen[n]+=1
    missing=[h for h,i in zip(cfg['headers'],mapping) if str(h or '').strip() and i is None]
    template_norm={_norm_header(h) for h in cfg['headers']};extra=[h for h in input_headers if h and _norm_header(h) not in template_norm]
    out_path.parent.mkdir(parents=True,exist_ok=True);tmp=out_path.with_suffix(out_path.suffix+'.tmp');written=0
    with tmp.open('w',encoding='utf-8-sig',newline='') as fh:
        w=csv.writer(fh,delimiter=';',quoting=csv.QUOTE_MINIMAL,lineterminator='\n');w.writerow(cfg['headers'])
        for ridx,row in enumerate(_xlsx_rows(path,sheet_name),start=0):
            if ridx<=best['rowIndex']:continue
            vals=[];nonempty=False
            for ci in mapping:
                v=(row[ci] if ci is not None and ci<len(row) else '');v=str(v or '').strip();vals.append(v);nonempty=nonempty or bool(v)
            if not nonempty:continue
            w.writerow(vals);written+=1
    os.replace(tmp,out_path)
    meta=_scan_csv(out_path,'prepared',float(load_config().get('csv_detection_min_confidence',0.72) or 0.72));underlying,role=_logical_to_underlying(cfg.get('logical') or source_key)
    expected_underlying=underlying if cfg.get('logical') else ('TANIMLAR' if source_key in ('DEPO_KODLARI','SITE_PROJELER','SITE_MALZEMELER','ISLEM_TURU','TEDAS_KOD') else '')
    valid=bool(meta.get('classified')) and (not expected_underlying or str(meta.get('source') or '').upper()==expected_underlying)
    if source_key in ('TESIS','KET','BAKIM','LED') and valid:
        inferred=_infer_kesif_role(meta,{})
        expected={'TESIS':'T','KET':'K','BAKIM':'B','LED':'L'}[source_key]
        valid=inferred in (expected,'UNKNOWN')
    return {'source':source_key,'label':cfg['label'],'outputFile':out_path.name,'outputPath':str(out_path),'rows':written,'headerRow':best['rowIndex']+1,'matchedColumns':sum(1 for h,i in zip(cfg['headers'],mapping) if str(h or '').strip() and i is not None),'templateColumns':sum(1 for h in cfg['headers'] if str(h or '').strip()),'missingColumns':missing,'extraColumns':extra,'validation':'OK' if valid else 'UYUMSUZ','classifiedAs':meta.get('source',''),'logical':cfg.get('logical','')}


def data_prep_convert(payload):
    items=payload.get('items') if isinstance(payload,dict) else None
    if not isinstance(items,list) or not items:raise ValueError('Dönüştürülecek Excel dosyası bulunamadı.')
    stamp=datetime.now().strftime('%Y%m%d_%H%M%S');batch_id=f'PREP-{stamp}-{uuid.uuid4().hex[:6].upper()}';batch_dir=DATA_PREP_ROOT/batch_id;batch_dir.mkdir(parents=True,exist_ok=True)
    outputs=[];used={}
    for raw in items:
        path=_data_prep_selected_path(raw.get('token'));sheet=str(raw.get('sheet') or '').strip();source=str(raw.get('source') or '').upper().strip()
        if not sheet:raise ValueError(f'{path.name}: Excel sayfası seçilmedi.')
        key,cfg=_data_prep_template(source);base=cfg['filename'];count=used.get(base,0)+1;used[base]=count
        name=base if count==1 else f'{Path(base).stem}_{count}{Path(base).suffix}'
        result=_data_prep_convert_one(path,sheet,key,batch_dir/name);result.update({'inputFile':path.name,'sheet':sheet,'batchId':batch_id});outputs.append(result)
    actor=user_context().get('login') or 'DATA_MANAGER';record={'batchId':batch_id,'createdAt':datetime.now().astimezone().isoformat(),'actor':actor,'outputDir':str(batch_dir),'files':outputs}
    _data_prep_save_history(record);DATA_ARCH_V2.audit('DATA_PREP','CSV_CREATED',actor,'DATA_PREP',batch_id,{'outputDir':str(batch_dir),'files':[{'source':x['source'],'file':x['outputFile'],'rows':x['rows'],'validation':x['validation']} for x in outputs]})
    return record


def _data_prep_find_output(batch_id,file_name):
    batch=str(batch_id or '').strip();name=Path(str(file_name or '')).name
    if not batch or not name:raise ValueError('Çıktı dosyası bilgisi eksik.')
    path=(DATA_PREP_ROOT/batch/name).resolve();base=(DATA_PREP_ROOT/batch).resolve()
    try:path.relative_to(base)
    except Exception:raise ValueError('Geçersiz çıktı yolu.')
    if not path.exists():raise ValueError('Hazırlanan CSV bulunamadı.')
    return path


def data_prep_stage_source(payload):
    logical=str(payload.get('source') or '').upper().strip();allowed={'MB51','MB52','ZMM048','ZMM098','TESIS','KET','BAKIM','LED'}
    if logical not in allowed:raise ValueError('Bu çıktı doğrudan operasyonel kaynak olarak kullanılamaz.')
    selected=_data_prep_find_output(payload.get('batchId'),payload.get('fileName'));cfg=load_config();meta=_scan_csv(selected,'prepared',float(cfg.get('csv_detection_min_confidence',0.72) or 0.72));underlying,role=_logical_to_underlying(logical)
    if not meta.get('classified') or str(meta.get('source') or '').upper()!=underlying:raise ValueError(f'Hazırlanan CSV {logical} olarak doğrulanamadı. Algılanan: {meta.get("source") or "TANIMSIZ"}.')
    if underlying=='KESIFLER':
        inferred=_infer_kesif_role(meta,{})
        if inferred not in (role,'UNKNOWN'):raise ValueError(f'Hazırlanan keşif CSV {logical} yerine {inferred} olarak algılandı.')
    inbox=APP_DIR/'data_v2'/'00_INBOX'/underlying;stamp=datetime.now().strftime('%Y%m%d_%H%M%S');stage_dir=inbox/f'{logical}_{stamp}';stage_dir.mkdir(parents=True,exist_ok=True);target=stage_dir/selected.name;shutil.copy2(selected,target)
    actor=user_context().get('login') or 'DATA_MANAGER';overrides=_json_load(SOURCE_PENDING_OVERRIDE_PATH,{});overrides[logical]={'path':str(target),'selectedFrom':str(selected),'selectedAt':datetime.now().astimezone().isoformat(),'actor':actor,'preparedCsv':True};_json_save(SOURCE_PENDING_OVERRIDE_PATH,overrides)
    prefs=_json_load(SOURCE_UPDATE_PREF_PATH,{});prefs.pop(logical,None);_json_save(SOURCE_UPDATE_PREF_PATH,prefs);invalidate_source_snapshot();DATA_ARCH_V2.audit('DATA_PREP','PREPARED_SOURCE_STAGED',actor,'SOURCE',logical,{'prepared':str(selected),'staged':str(target)})
    pending=source_pending_updates(force=True);return {'source':logical,'selected':str(selected),'staged':str(target),'pending':next((x for x in pending if x.get('source')==logical),None)}


def data_prep_open_folder():
    DATA_PREP_ROOT.mkdir(parents=True,exist_ok=True)
    if os.name=='nt':os.startfile(str(DATA_PREP_ROOT))
    else:
        opener=shutil.which('xdg-open') or shutil.which('open')
        if opener:subprocess.Popen([opener,str(DATA_PREP_ROOT)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    return {'path':str(DATA_PREP_ROOT)}

def _pick_file_windows(initial: Path, title: str):
    if os.name!='nt':raise RuntimeError('Dosya seçim penceresi yalnız Windows yerel çalıştırmada kullanılabilir.')
    ps=shutil.which('powershell.exe') or shutil.which('powershell')
    if not ps:raise RuntimeError('Windows PowerShell bulunamadı.')
    env=os.environ.copy();env['TALEP_PICKER_INITIAL']=str(initial);env['TALEP_PICKER_TITLE']=title
    script="$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Windows.Forms; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $owner=New-Object System.Windows.Forms.Form; $owner.TopMost=$true; $owner.ShowInTaskbar=$false; $owner.Opacity=0; $d=New-Object System.Windows.Forms.OpenFileDialog; $d.Title=$env:TALEP_PICKER_TITLE; $d.Filter='CSV dosyaları (*.csv)|*.csv|Tüm dosyalar (*.*)|*.*'; if(Test-Path -LiteralPath $env:TALEP_PICKER_INITIAL -PathType Container){$d.InitialDirectory=$env:TALEP_PICKER_INITIAL}; $owner.Show(); $owner.Activate(); $r=$d.ShowDialog($owner); $owner.Close(); if($r -eq [System.Windows.Forms.DialogResult]::OK){Write-Output $d.FileName}"
    flags=getattr(subprocess,'CREATE_NO_WINDOW',0);result=subprocess.run([ps,'-NoProfile','-STA','-WindowStyle','Hidden','-Command',script],capture_output=True,text=True,encoding='utf-8',errors='replace',env=env,creationflags=flags,timeout=300)
    if result.returncode!=0:raise RuntimeError((result.stderr or result.stdout or 'Dosya seçim penceresi açılamadı.').strip())
    selected=(result.stdout or '').strip().lstrip('\ufeff');return Path(selected) if selected else None


def stage_source_file(logical,actor='DATA_MANAGER'):
    logical=str(logical or '').upper();allowed={'MB51','MB52','ZMM048','ZMM098','TESIS','KET','BAKIM','LED'}
    if logical not in allowed:raise ValueError('Bu kaynak bu ekrandan değiştirilemez.')
    current=_settings_folder_path('data');selected=_pick_file_windows(current,f'{logical} için yeni kaynak CSV dosyasını seçin')
    if selected is None:return {'cancelled':True,'source':logical}
    cfg=load_config();meta=_scan_csv(selected,'external',float(cfg.get('csv_detection_min_confidence',0.72) or 0.72))
    underlying,role=_logical_to_underlying(logical)
    if not meta.get('classified') or str(meta.get('source') or '').upper()!=underlying:
        raise ValueError(f'Seçilen dosya {logical} kaynağı olarak tanınmadı. Algılanan: {meta.get("source") or "TANIMSIZ"}.')
    if underlying=='KESIFLER':
        inferred=_infer_kesif_role(meta,{})
        if inferred not in (role,'UNKNOWN'):
            raise ValueError(f'Seçilen keşif dosyası {logical} yerine {inferred} türü olarak algılandı.')
    inbox=APP_DIR/'data_v2'/'00_INBOX'/underlying;stamp=datetime.now().strftime('%Y%m%d_%H%M%S');stage_dir=inbox/f'{logical}_{stamp}';stage_dir.mkdir(parents=True,exist_ok=True);target=stage_dir/selected.name;shutil.copy2(selected,target)
    overrides=_json_load(SOURCE_PENDING_OVERRIDE_PATH,{});overrides[logical]={'path':str(target),'selectedFrom':str(selected),'selectedAt':datetime.now().astimezone().isoformat(),'actor':actor};_json_save(SOURCE_PENDING_OVERRIDE_PATH,overrides)
    prefs=_json_load(SOURCE_UPDATE_PREF_PATH,{});prefs.pop(logical,None);_json_save(SOURCE_UPDATE_PREF_PATH,prefs);invalidate_source_snapshot()
    DATA_ARCH_V2.audit('SOURCE','NEW_SOURCE_FILE_STAGED',actor,'SOURCE',logical,{'selectedFrom':str(selected),'stagedPath':str(target)})
    pending=source_pending_updates(force=True);return {'cancelled':False,'source':logical,'selected':str(selected),'staged':str(target),'pending':next((x for x in pending if x.get('source')==logical),None)}


HEADER_FIELDS = [
    'KontrolID','KontrolZamani','KontrolTuru','RezervasyonNo','RezervasyonKontrolSira','TekrarKontrol','OncekiKontrolID','RezervasyonDurumu','RezervasyonOnayDurumu','KaynakUY','KaynakDepo','KaynakDepoTanimi','HedefUY','HedefDepo','HedefDepoTanimi','DepoTuru','IsTuru','Firma','Sozlesme','ToplamListeSatiri','FarkliMalzemeSayisi','OnaylananKalemSayisi','OnaylanmayanKalemSayisi','BekletilenKalemSayisi','KararVerilmemisKalemSayisi','KalemKararModeli','ToplamTeminat','MevcutDepoStokDegeri','TalepTeminatDegeri','TeminatKullanimOraniYuzde','TeminatSonrasiKalan','TeminatSonucu','KesifSonucu','ProjeDagilimSonucu','GenelSonuc','HataSayisi','UyariSayisi','Hatalar','Uyarilar','ZMM048Kaynak','ZMM048Degisim','MB52Kaynak','MB52Degisim','ZMM098Kaynak','ZMM098Degisim','KESIFLERKaynak','KESIFLERDegisim','TANIMLARKaynak','TANIMLARDegisim','UygulamaSurumu','KayitIslemi','SAPOnayiDegildir','RuleSetVersion','RuleSetHash','DataSourceDigest','IndexBuildID','IndexSourceDigest','IndexStatus','ZMM048SnapshotID','MB51SnapshotID','MB52SnapshotID','ZMM098SnapshotID','KESIFLERSnapshotID','TANIMLARSnapshotID','WindowsKullanici','BilgisayarAdi','OturumBaslangici','KullaniciRolu','BirincilSorumluIller','YedekSorumluIller','KullaniciOverride','OverrideNedenleri','OverrideDetayi','OverrideOnayZamani','MB51MutabakatOzeti','MB51OnKontrolUyarisi','MB51OnKontrolOnayi'
]
MATERIAL_FIELDS = ['KontrolID','KontrolZamani','KontrolTuru','RezervasyonNo','KaynakUY','KaynakDepo','HedefUY','HedefDepo','IsTuru','Firma','Sozlesme','SiraNo','RezervasyonKalemNo','KaynakSatirNo','MalzemeKodu','MalzemeTanimi','Miktar','OnaylananMiktar','Birim','KaynakSatirSayisi','KalemKarari','KararGerekcesi','KararAciklamasi','TaahhutDurumu','BirimFiyat','TalepTutari','MevcutHedefDepoStogu','KesifKontrolTipi','ToplamKesif','DahaOnceVerilen','MevcutKalanKesif','KullanilabilirKesif','KesifDurumu','TeminatDurumu','KontrolNotu','MB51FiiliMiktar','MB51MutabakatDurumu','MB51SonHareketTarihi']
PROJECT_FIELDS = ['KontrolID','KontrolZamani','KontrolTuru','RezervasyonNo','KaynakUY','KaynakDepo','HedefUY','HedefDepo','IsTuru','Firma','Sozlesme','SiraNo','MalzemeKodu','MalzemeTanimi','Birim','ProjeKodu','ProjeAdi','ProjeKesfi','DahaOnceVerilen','MevcutKalanKesif','DagitilanMiktar','DagitilmamisMiktar','ProjeKalani','MalzemeKalani','Durum']
RECORD_SUBDIRS = {'header':'KONTROL_BASLIK','materials':'KONTROL_MALZEME','projects':'KONTROL_PROJE'}

# FIX28: A final control is a validated, self-contained immutable bundle.
# STAGING is never visible. Only same-filesystem directory rename into
# COMMITTED makes the header/material/project set visible as one operation.
# Do not share a writable SQLite database across SMB clients.
BUNDLE_BASE_DIR = 'KAYIT'
BUNDLE_COMPONENTS = {'header':'H','materials':'M','projects':'P'}


def _control_bundle_root(root: Path) -> Path:
    return root / BUNDLE_BASE_DIR


def _bundle_final(root: Path, control_id: str) -> Path:
    return _control_bundle_root(root) / 'COMMITTED' / control_id


def _bundle_file(bundle: Path, kind: str, control_id: str) -> Path:
    # Backward-compatible legacy read; new packets use much shorter paths.
    old=bundle.parent.parent.name.upper()=='KONTROL_PAKETLERI'
    folder=RECORD_SUBDIRS[kind] if old else BUNDLE_COMPONENTS[kind]
    return bundle / folder / (control_id + '.csv')


def _bundle_verify(bundle: Path) -> bool:
    # A missing/altered manifest or data file is a hard read block.
    try:
        manifest_path = bundle / 'manifest.json'
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        cid = bundle.name
        if manifest.get('schema') != 'TALEP_CONTROL_BUNDLE_V1' or manifest.get('controlId') != cid:
            return False
        entries = manifest.get('files')
        if not isinstance(entries, dict) or not {'header','materials'} <= set(entries):
            return False
        if not set(entries).issubset(BUNDLE_COMPONENTS):
            return False
        for kind, info in entries.items():
            if not isinstance(info,dict): return False
            path = _bundle_file(bundle, kind, cid)
            if not path.is_file(): return False
            raw = path.read_bytes()
            if len(raw) != info.get('bytes') or hashlib.sha256(raw).hexdigest() != info.get('sha256'):
                return False
        return True
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return False


def record_visible_paths(kind: str, root: Path | None = None) -> list[Path]:
    """Only complete legacy pairs or VERIFIED committed bundles are visible.

    Legacy 3-file records have no authoritative manifest: the caller should
    schedule their reconciliation/migration; do not treat their history as proof
    of transaction integrity. Staging and corrupted bundles never leak to UI.
    """
    if kind not in BUNDLE_COMPONENTS:raise ValueError('Geçersiz kayıt türü.')
    root = Path(root) if root is not None else load_record_root()
    legacy = root / RECORD_SUBDIRS[kind]
    paths=[]
    if legacy.is_dir():
        for p in legacy.glob('*.csv'):
            if (root/'KONTROL_BASLIK'/p.name).is_file() and (root/'KONTROL_MALZEME'/p.name).is_file():
                paths.append(p)
    for committed in (_control_bundle_root(root)/'COMMITTED', root/'KONTROL_PAKETLERI'/'COMMITTED'):
        if committed.is_dir():
            for bundle in committed.iterdir():
                if bundle.is_dir() and re.fullmatch(r'KD-[A-Za-z0-9-]+',bundle.name) and _bundle_verify(bundle):
                    path=_bundle_file(bundle,kind,bundle.name)
                    if path.is_file():paths.append(path)
    return paths


def record_visible_file(kind: str, control_id: str, root: Path | None = None) -> Path | None:
    root=Path(root) if root is not None else load_record_root()
    for bundle in (_bundle_final(root,control_id), root/'KONTROL_PAKETLERI'/'COMMITTED'/control_id):
        if bundle.is_dir():
            return _bundle_file(bundle,kind,control_id) if _bundle_verify(bundle) and _bundle_file(bundle,kind,control_id).is_file() else None
    legacy=root / RECORD_SUBDIRS[kind] / (control_id+'.csv')
    return legacy if legacy.is_file() and (root/'KONTROL_BASLIK'/(control_id+'.csv')).is_file() and (root/'KONTROL_MALZEME'/(control_id+'.csv')).is_file() else None


def publish_control_bundle(root: Path, control_id: str, targets, audit_actor: str) -> list[Path]:
    """One all-or-nothing commit marker: directory rename after checksums.

    All content is staged inside the same share/volume. SMB atomicity and ACL
    enforcement remain a mandatory test in the customer's actual UNC share.
    """
    base=_control_bundle_root(root)
    staging=base/'STAGING';committed=base/'COMMITTED'
    staging.mkdir(parents=True,exist_ok=True);committed.mkdir(parents=True,exist_ok=True)
    # FIX28M: Windows legacy MAX_PATH can reject long filename paths as Errno 2.
    # Keep staging's random *directory* short while preserving full ControlID in
    # the committed directory, CSV names and manifest. Same-volume rename is
    # still the single atomic commit point. Do not flatten the record bundle.
    stage=staging/('S-'+uuid.uuid4().hex[:12])
    stage.mkdir()
    info={}
    # Crash before rename intentionally leaves an invisible staged package.
    for kind, fields, rows in targets:
        dest=_bundle_file(stage,kind,control_id)
        dest.parent.mkdir(parents=True,exist_ok=True)
        write_csv_atomic(dest,fields,rows)
        raw=dest.read_bytes()
        info[kind]={'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'rows':len(rows)}
    manifest={'schema':'TALEP_CONTROL_BUNDLE_V1','controlId':control_id,
        'committedBy':audit_actor,'preparedAt':datetime.now().astimezone().isoformat(),
        'files':info,'auditEvent':'CONTROL_BUNDLE_COMMIT'}
    mpath=stage/'manifest.json'
    with mpath.open('w',encoding='utf-8') as fh:
        json.dump(manifest,fh,ensure_ascii=False,sort_keys=True,indent=2)
        fh.flush();os.fsync(fh.fileno())
    for kind,info0 in info.items():
        data=_bundle_file(stage,kind,control_id).read_bytes()
        if hashlib.sha256(data).hexdigest()!=info0['sha256']:
            raise RuntimeError('Kayıt paketi bütünlük kontrolü başarısız.')
    final=committed/control_id
    if os.name=='nt' and any(len(str(_bundle_file(final,kind,control_id)))>=245 for kind in info):
        raise ValueError('Kesin kayıt yolu Windows için çok uzun. Ayarlar > CSV Kayıt Klasörü '
                         'bölümünden daha kısa bir klasör veya UNC paylaşım yolu seçin. '
                         'Hazırlanan paket yayınlanmadı.')
    if final.exists():raise FileExistsError('Kontrol paketi zaten kesinleşmiş: '+control_id)
    # Single rename is the commit point. No individual CSV is ever published.
    os.rename(stage,final)
    if not _bundle_verify(final):
        raise RuntimeError('Kesin kayıt dosyaları doğrulanamadı; paket kullanıma kapalı.')
    return [_bundle_file(final,kind,control_id) for kind in info]


def load_record_root():
    # The local client must not silently switch its authoritative record store.
    cfg=load_config()
    if cfg.get('enforce_shared_record_root') and os.environ.get('TALEP_TEST_MODE','')!='1':
        shared=str(cfg.get('shared_record_root') or '').strip()
        if not shared:raise RuntimeError('Merkezi kayıt yolu tanımlı değil.')
        return Path(shared).resolve()
    raw = os.environ.get('TALEP_RECORD_ROOT', '').strip()
    if not raw and RECORD_ROOT_PATH.exists():
        try:
            for line in RECORD_ROOT_PATH.read_text(encoding='utf-8-sig').splitlines():
                line=line.strip()
                if line:
                    raw=line;break
        except Exception:
            raw=''
    if not raw:return DEFAULT_RECORD_ROOT
    raw=os.path.expandvars(os.path.expanduser(raw));p=Path(raw)
    if not p.is_absolute():p=APP_DIR/p
    return p.resolve()

def record_dir_paths(root: Path):
    # Read operations must never mutate corporate SMB folders.
    return {key: root / folder for key,folder in RECORD_SUBDIRS.items()}

def ensure_record_dirs(root: Path):
    root.mkdir(parents=True,exist_ok=True);dirs={}
    for key_name,folder in RECORD_SUBDIRS.items():
        d=root/folder;d.mkdir(parents=True,exist_ok=True);dirs[key_name]=d
    return dirs

class MissingReservationNumberError(ValueError):
    """Final control records must carry a real reservation number."""
    code='RESERVATION_NO_REQUIRED'


def validate_final_reservation_number(payload):
    """FIX27: manual Excel analysis may be numberless; final CSV records may not.

    This is the server-side authority, not a frontend-only check. The caller
    must reject the request *before* creating a final control record.
    """
    if not isinstance(payload,dict):
        raise ValueError('Kayıt verisi geçersiz.')
    header=payload.get('header')
    if not isinstance(header,dict):
        raise ValueError('Kontrol başlık verisi bulunamadı.')
    control_type=_csv_cell(header.get('KontrolTuru')).strip().upper()
    # These are the two types created by the FIX26D decision interface.
    if control_type not in ('REZERVASYON','MANUEL'):
        raise ValueError('Kontrol türü REZERVASYON veya MANUEL olmalıdır.')
    reservation_no=_csv_cell(header.get('RezervasyonNo')).strip()
    if not reservation_no or reservation_no.casefold() in ('-', '--', 'null', 'none', 'undefined', 'yok'):
        raise MissingReservationNumberError(
            'Nihai kontrol kaydında Rezervasyon No zorunludur. '
            'Manuel/Excel listesini numarasız analiz edebilirsiniz; kayıt için numarayı girin.'
        )
    return reservation_no


class DuplicateReservationError(Exception):
    def __init__(self,reservation_no,history):
        self.reservation_no=str(reservation_no or '').strip();self.history=history or {}
        latest=(self.history.get('latest') or {}).get('KontrolID') or ''
        super().__init__(f'Rezervasyon {self.reservation_no} daha önce kontrol edilip kaydedilmiş'+(f' ({latest})' if latest else '')+'.')

_RECORD_HEADERS_CACHE={'signature':None,'rows':[]}

def _record_header_signature(folder: Path):
    try:
        items=[]
        for f in record_visible_paths('header',folder.parent):
            try:
                st=f.stat();items.append((f.name,st.st_size,st.st_mtime_ns))
            except OSError:pass
        return tuple(sorted(items))
    except Exception:return ()

def _control_index_rows(kind, control_ids=None, force=False, root=None):
    """FIX28N: disposable local SQLite read index; canonical CSV authority.

    Local corruption can be quarantined and rebuilt. Other index failures
    automatically fall back to the existing verified CSV read path.
    """
    root=Path(root) if root is not None else load_record_root()
    try:
        return control_read_index.query(APP_DIR, root, kind, _bundle_verify,
                                        control_ids=control_ids, force=force)
    except sqlite3.DatabaseError:
        # The index is only a derivative; quarantine and reconstruct it.
        try:
            control_read_index.repair_local_index(APP_DIR)
            return control_read_index.query(APP_DIR, root, kind, _bundle_verify,
                                            control_ids=control_ids, force=force)
        except (OSError, ValueError, RuntimeError, sqlite3.DatabaseError):pass
    except (OSError, ValueError, RuntimeError):pass
    # Verified source fallback: no cache corruption may hide a real record.
    rows=[]
    paths=record_visible_paths(kind,root)
    targets=None if control_ids is None else set(str(x) for x in control_ids)
    for path in sorted(paths):
        if targets is not None and path.stem not in targets:continue
        try:
            with path.open('r',encoding='utf-8-sig',newline='') as fh:
                for r in csv.DictReader(fh,delimiter=';'):
                    row=dict(r)
                    if kind=='header':
                        row['_file']=path.name
                        row['_mtime_ns']=path.stat().st_mtime_ns
                    rows.append(row)
        except (OSError, UnicodeError, csv.Error):pass
    return rows

def record_header_rows(force=False):
    rows=_control_index_rows('header',force=force)
    rows.sort(key=lambda r:(str(r.get('KontrolZamani') or ''),int(r.get('_mtime_ns') or 0),str(r.get('KontrolID') or '')),reverse=True)
    return rows

def reservation_control_history(reservation_no):
    no=str(reservation_no or '').strip()
    if not no:return {'reservationNo':'','count':0,'controlled':False,'latest':None,'items':[]}
    items=[r for r in record_header_rows() if str(r.get('KontrolTuru') or '').strip().upper()=='REZERVASYON' and str(r.get('RezervasyonNo') or '').strip()==no]
    items.sort(key=lambda r:(str(r.get('KontrolZamani') or ''),int(r.get('_mtime_ns') or 0),str(r.get('KontrolID') or '')),reverse=True)
    slim=[]
    for idx,r in enumerate(items):
        slim.append({
            'KontrolID':str(r.get('KontrolID') or ''),'KontrolZamani':str(r.get('KontrolZamani') or ''),'RezervasyonNo':no,
            'Firma':str(r.get('Firma') or ''),'HedefDepo':str(r.get('HedefDepo') or ''),'HedefDepoTanimi':str(r.get('HedefDepoTanimi') or ''),
            'IsTuru':str(r.get('IsTuru') or ''),'GenelSonuc':str(r.get('GenelSonuc') or ''),'TalepTeminatDegeri':str(r.get('TalepTeminatDegeri') or ''),
            'RezervasyonKontrolSira':str(r.get('RezervasyonKontrolSira') or max(1,len(items)-idx)),'TekrarKontrol':str(r.get('TekrarKontrol') or ('EVET' if len(items)-idx>1 else 'HAYIR'))
        })
    return {'reservationNo':no,'count':len(slim),'controlled':bool(slim),'latest':slim[0] if slim else None,'items':slim}

def control_records_snapshot(query='',control_type='',result='',page=1,page_size=50):
    q=str(query or '').strip().casefold();ctype=str(control_type or '').strip().upper();result=str(result or '').strip().upper()
    try:page=max(1,int(page))
    except Exception:page=1
    try:page_size=max(10,min(200,int(page_size)))
    except Exception:page_size=50
    all_rows=record_header_rows()
    groups={}
    for r in all_rows:
        no=str(r.get('RezervasyonNo') or '').strip()
        if no and str(r.get('KontrolTuru') or '').strip().upper()=='REZERVASYON':groups.setdefault(no,[]).append(r)
    revision_map={};count_map={}
    for no,items0 in groups.items():
        ordered=sorted(items0,key=lambda r:(str(r.get('KontrolZamani') or ''),int(r.get('_mtime_ns') or 0),str(r.get('KontrolID') or '')))
        count_map[no]=len(ordered)
        for idx,r in enumerate(ordered,1):revision_map[str(r.get('KontrolID') or '')]=idx
    rows=list(all_rows)
    if ctype:rows=[r for r in rows if str(r.get('KontrolTuru') or '').strip().upper()==ctype]
    if result:rows=[r for r in rows if str(r.get('GenelSonuc') or '').strip().upper()==result]
    if q:
        fields=('KontrolID','KontrolZamani','KontrolTuru','RezervasyonNo','Firma','Sozlesme','HedefDepo','HedefDepoTanimi','IsTuru','GenelSonuc')
        rows=[r for r in rows if q in ' '.join(str(r.get(f) or '') for f in fields).casefold()]
    total=len(rows);start=(page-1)*page_size;subset=rows[start:start+page_size]
    items=[]
    for r in subset:
        no=str(r.get('RezervasyonNo') or '').strip();cid=str(r.get('KontrolID') or '')
        rev=str(r.get('RezervasyonKontrolSira') or (revision_map.get(cid,'') if no else ''))
        repeat=str(r.get('TekrarKontrol') or ('EVET' if no and (revision_map.get(cid,1)>1 or count_map.get(no,0)>1) else 'HAYIR'))
        items.append({
            'controlId':cid,'time':str(r.get('KontrolZamani') or ''),'type':str(r.get('KontrolTuru') or ''),
            'reservationNo':no,'revision':rev,'repeat':repeat,
            'company':str(r.get('Firma') or ''),'contract':str(r.get('Sozlesme') or ''),'sourceDepot':str(r.get('KaynakDepo') or ''),
            'targetDepot':str(r.get('HedefDepo') or ''),'targetDepotDesc':str(r.get('HedefDepoTanimi') or ''),'workType':str(r.get('IsTuru') or ''),
            'generalResult':str(r.get('GenelSonuc') or ''),'guaranteeResult':str(r.get('TeminatSonucu') or ''),'discoveryResult':str(r.get('KesifSonucu') or ''),
            'projectResult':str(r.get('ProjeDagilimSonucu') or ''),'demandValue':str(r.get('TalepTeminatDegeri') or ''),'materialCount':str(r.get('FarkliMalzemeSayisi') or ''),'approvedItemCount':str(r.get('OnaylananKalemSayisi') or ''),'rejectedItemCount':str(r.get('OnaylanmayanKalemSayisi') or ''),'heldItemCount':str(r.get('BekletilenKalemSayisi') or ''),
            'errorCount':str(r.get('HataSayisi') or ''),'warningCount':str(r.get('UyariSayisi') or '')
        })
    return {'page':page,'pageSize':page_size,'total':total,'pages':max(1,(total+page_size-1)//page_size),'items':items,'recordRoot':str(load_record_root())}

def control_record_detail(control_id):
    cid=str(control_id or '').strip()
    if not cid or not re.fullmatch(r'KD-[A-Za-z0-9-]+',cid):raise ValueError('Kontrol ID geçersiz.')
    root=load_record_root();dirs=record_dir_paths(root)
    def read_one(folder):
        kind=next((k for k,v in dirs.items() if v==folder),None)
        path=record_visible_file(kind,cid,root) if kind else None
        if path is None:return []
        with path.open('r',encoding='utf-8-sig',newline='') as fh:return list(csv.DictReader(fh,delimiter=';'))
    headers=read_one(dirs['header'])
    if not headers:raise ValueError('Kontrol kaydı bulunamadı: '+cid)
    return {'header':headers[0],'materials':read_one(dirs['materials']),'projects':read_one(dirs['projects']),'recordRoot':str(root)}

def _first_setting_line(path: Path, default=''):
    try:
        if path.exists():
            for line in path.read_text(encoding='utf-8-sig').splitlines():
                line=line.strip()
                if line:return line
    except Exception:
        pass
    return default

def _resolve_setting_path(raw: str, default_path: Path | None = None):
    raw=(raw or '').strip()
    if not raw and default_path is not None:return default_path.resolve()
    expanded=os.path.expandvars(os.path.expanduser(raw))
    p=Path(expanded)
    if not p.is_absolute():p=APP_DIR/p
    return p.resolve()

def _write_text_atomic(path: Path, value: str):
    tmp=path.with_name(path.name+'.'+uuid.uuid4().hex+'.tmp')
    try:
        tmp.write_text(value.rstrip()+"\n",encoding='utf-8')
        os.replace(tmp,path)
    finally:
        try:
            if tmp.exists():tmp.unlink()
        except Exception:pass

def settings_snapshot():
    cfg=load_config()
    data_text=_first_setting_line(DATA_ROOT_PATH,str(cfg.get('external_root') or DEFAULT_EXTERNAL_ROOT))
    record_resolved=load_record_root()
    record_text=str(record_resolved) if cfg.get('enforce_shared_record_root') else _first_setting_line(RECORD_ROOT_PATH,'kayitlar')
    data_resolved=_resolve_setting_path(data_text)
    record_error=''
    dirs=record_dir_paths(record_resolved)
    folders={k:str(v) for k,v in dirs.items()}
    if not record_resolved.is_dir():
        record_error='Merkezi 0-Database klasörüne erişilemiyor; kesin kayıt devre dışı.'
    folder_locked=bool(cfg.get('enforce_shared_record_root') or cfg.get('enforce_source_root'))
    return {
        'dataRoot':data_text,'dataResolved':str(data_resolved),'dataExists':data_resolved.exists() and data_resolved.is_dir(),
        'recordRoot':record_text,'recordResolved':str(record_resolved),'recordReady':not bool(record_error),'recordError':record_error,
        'folders':folders,'bundledRoot':str(BUNDLED_ROOT),
        'dataEnvOverride':bool(os.environ.get('TALEP_DATA_ROOT','').strip()),
        'recordEnvOverride':bool(os.environ.get('TALEP_RECORD_ROOT','').strip()),
        'appVersion':APP_VERSION,'appBuild':APP_BUILD,
        'strictExternalSources':bool(cfg.get('strict_external_sources')),
        'sharedWritesEnabled':bool(cfg.get('shared_writes_enabled')),
        'enforceSourceRoot':bool(cfg.get('enforce_source_root')),
        'enforceSharedRecordRoot':bool(cfg.get('enforce_shared_record_root')),
        'folderChangeLocked':folder_locked,
        'bundledCsvFallback':not bool(cfg.get('strict_external_sources')),
    }

def save_settings_payload(payload):
    if load_config().get('enforce_shared_record_root'):
        raise PermissionError('Dağıtım kaynak ve kayıt yolları merkezi yapılandırmadan yönetilir; kullanıcı tarafından değiştirilemez.')
    if not isinstance(payload,dict):raise ValueError('Ayar verisi geçersiz.')
    data_raw=str(payload.get('dataRoot') or '').strip()
    record_raw=str(payload.get('recordRoot') or '').strip() or 'kayitlar'
    if not data_raw:raise ValueError('Veri kaynak klasörü boş bırakılamaz.')
    if any(ch in data_raw for ch in '\r\n') or any(ch in record_raw for ch in '\r\n'):
        raise ValueError('Klasör yolu tek satır olmalıdır.')
    data_path=_resolve_setting_path(data_raw)
    if not data_path.exists() or not data_path.is_dir():
        raise ValueError('Veri kaynak klasörü bulunamadı veya klasör değil: '+str(data_path))
    record_path=_resolve_setting_path(record_raw,DEFAULT_RECORD_ROOT)
    if load_config().get('enforce_shared_record_root') and str(record_path).casefold()!=str(load_record_root()).casefold():
        raise ValueError('Merkezi kayıt klasörü bu dağıtımda sabittir: 0-Database')
    try:
        ensure_record_dirs(record_path)
        test_file=record_path/('.write-test-'+uuid.uuid4().hex+'.tmp')
        test_file.write_text('ok',encoding='utf-8');test_file.unlink()
    except Exception as exc:
        raise ValueError('CSV kayıt klasörüne yazılamıyor: '+str(exc))
    _write_text_atomic(DATA_ROOT_PATH,data_raw)
    _write_text_atomic(RECORD_ROOT_PATH,record_raw)
    invalidate_source_snapshot()
    return settings_snapshot()

def _settings_folder_path(kind: str) -> Path:
    kind=(kind or '').strip().lower()
    snap=settings_snapshot()
    if kind=='data': return Path(snap['dataResolved'])
    if kind=='record': return Path(snap['recordResolved'])
    folders=snap.get('folders') or {}
    if kind in ('header','materials','projects') and folders.get(kind): return Path(folders[kind])
    if kind=='bundled': return BUNDLED_ROOT
    raise ValueError('Geçersiz klasör türü.')


def _pick_folder_windows(initial: Path, title: str):
    if os.name!='nt':
        raise RuntimeError('Klasör seçim penceresi yalnız Windows yerel çalıştırmada kullanılabilir.')
    ps=shutil.which('powershell.exe') or shutil.which('powershell')
    if not ps: raise RuntimeError('Windows PowerShell bulunamadı.')
    env=os.environ.copy()
    env['TALEP_PICKER_INITIAL']=str(initial)
    env['TALEP_PICKER_TITLE']=title
    script="$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Windows.Forms; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $owner=New-Object System.Windows.Forms.Form; $owner.TopMost=$true; $owner.ShowInTaskbar=$false; $owner.Opacity=0; $owner.Width=1; $owner.Height=1; $owner.StartPosition='CenterScreen'; $d=New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description=$env:TALEP_PICKER_TITLE; $d.ShowNewFolderButton=$true; if(Test-Path -LiteralPath $env:TALEP_PICKER_INITIAL -PathType Container){$d.SelectedPath=$env:TALEP_PICKER_INITIAL}; $owner.Show(); $owner.Activate(); $r=$d.ShowDialog($owner); $owner.Close(); if($r -eq [System.Windows.Forms.DialogResult]::OK){Write-Output $d.SelectedPath}"
    flags=getattr(subprocess,'CREATE_NO_WINDOW',0)
    result=subprocess.run([ps,'-NoProfile','-STA','-WindowStyle','Hidden','-Command',script],capture_output=True,text=True,encoding='utf-8',errors='replace',env=env,creationflags=flags,timeout=300)
    if result.returncode!=0:
        raise RuntimeError((result.stderr or result.stdout or 'Klasör seçim penceresi açılamadı.').strip())
    selected=(result.stdout or '').strip().lstrip('\ufeff')
    return Path(selected) if selected else None


def select_settings_folder(kind: str):
    kind=(kind or '').strip().lower()
    if kind not in ('data','record'): raise ValueError('Yalnız veri veya CSV kayıt klasörü değiştirilebilir.')
    if load_config().get('enforce_shared_record_root'):
        raise ValueError('Merkezi veri ve kayıt klasörü dağıtımda kilitlidir.')
    if kind=='data' and os.environ.get('TALEP_DATA_ROOT','').strip():
        raise ValueError('TALEP_DATA_ROOT ortam değişkeni aktif olduğu için klasör bu ekrandan değiştirilemez.')
    if kind=='record' and os.environ.get('TALEP_RECORD_ROOT','').strip():
        raise ValueError('TALEP_RECORD_ROOT ortam değişkeni aktif olduğu için klasör bu ekrandan değiştirilemez.')
    current=_settings_folder_path(kind)
    if not current.exists(): current=APP_DIR
    title='CSV veri kaynak klasörünü seçin' if kind=='data' else 'CSV kontrol kayıtlarının saklanacağı klasörü seçin'
    selected=_pick_folder_windows(current,title)
    if selected is None: return {'cancelled':True,**settings_snapshot()}
    selected=selected.resolve()
    if not selected.exists() or not selected.is_dir(): raise ValueError('Seçilen yol geçerli bir klasör değil: '+str(selected))
    if kind=='record':
        try:
            ensure_record_dirs(selected)
            test_file=selected/('.write-test-'+uuid.uuid4().hex+'.tmp')
            test_file.write_text('ok',encoding='utf-8');test_file.unlink()
        except Exception as exc: raise ValueError('CSV kayıt klasörüne yazılamıyor: '+str(exc))
        _write_text_atomic(RECORD_ROOT_PATH,str(selected))
    else:
        _write_text_atomic(DATA_ROOT_PATH,str(selected))
        invalidate_source_snapshot()
    return {'cancelled':False,**settings_snapshot()}


def open_settings_folder(kind: str):
    path=_settings_folder_path(kind)
    if not path.exists() or not path.is_dir(): raise ValueError('Klasör bulunamadı: '+str(path))
    if os.name=='nt':
        os.startfile(str(path))
    else:
        opener=shutil.which('xdg-open') or shutil.which('open')
        if not opener: raise RuntimeError('Bu işletim sisteminde klasör açma komutu bulunamadı.')
        subprocess.Popen([opener,str(path)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    return {'path':str(path)}


def _csv_cell(value):
    if value is None:return ''
    return str(value).replace('\r',' ').replace('\n',' ').strip()

def write_csv_atomic(path: Path, fields, rows):
    # Distinct short sibling temp reduces MAX_PATH exposure on Windows.
    # The target .csv is never visible before os.replace succeeds.
    tmp=path.with_name(path.name+f'.{uuid.uuid4().hex[:12]}.tmp')
    if os.name=='nt' and len(str(tmp))>=245:
        raise ValueError('CSV kayıt klasörü dosya yolu Windows için çok uzun. '
                         'Ayarlar > CSV Kayıt Klasörü bölümünden daha kısa '
                         'bir klasör veya kısa UNC paylaşım yolu seçin. '
                         'Mevcut kayıtlar değiştirilmedi.')
    try:
        with tmp.open('w',encoding='utf-8-sig',newline='') as fh:
            writer=csv.DictWriter(fh,fieldnames=fields,delimiter=';',quoting=csv.QUOTE_MINIMAL,extrasaction='ignore',lineterminator='\n');writer.writeheader()
            for raw in rows:writer.writerow({field:_csv_cell((raw or {}).get(field,'')) for field in fields})
            fh.flush();os.fsync(fh.fileno())
        os.replace(tmp,path)
    finally:
        try:
            if tmp.exists():tmp.unlink()
        except Exception:pass

def save_control_payload(payload,allow_repeat=False):
    if not isinstance(payload,dict):raise ValueError('Kayıt verisi geçersiz.')
    header=payload.get('header');materials=payload.get('materials');projects=payload.get('projects') or []
    if not isinstance(header,dict):raise ValueError('Kontrol başlık verisi bulunamadı.')
    if not isinstance(materials,list) or not materials:raise ValueError('Kaydedilecek malzeme detayı bulunamadı.')
    if not isinstance(projects,list):raise ValueError('Proje dağılım verisi geçersiz.')
    # Revalidate inside the unlocked implementation as defense in depth.
    reservation_no=validate_final_reservation_number(payload)
    control_type=_csv_cell(header.get('KontrolTuru')).upper();history={'count':0,'latest':None,'items':[]}
    if control_type=='REZERVASYON' and reservation_no:
        history=reservation_control_history(reservation_no)
        if history.get('controlled') and not allow_repeat:raise DuplicateReservationError(reservation_no,history)
    now=time.localtime();timestamp=time.strftime('%Y-%m-%d %H:%M:%S',now);stamp=time.strftime('%Y%m%d-%H%M%S',now);control_id=f'KD-{stamp}-{uuid.uuid4().hex[:6].upper()}'
    root=load_record_root();dirs=ensure_record_dirs(root)
    common={'KontrolID':control_id,'KontrolZamani':timestamp,'KontrolTuru':_csv_cell(header.get('KontrolTuru')),'RezervasyonNo':_csv_cell(header.get('RezervasyonNo')),'KaynakUY':_csv_cell(header.get('KaynakUY')),'KaynakDepo':_csv_cell(header.get('KaynakDepo')),'HedefUY':_csv_cell(header.get('HedefUY')),'HedefDepo':_csv_cell(header.get('HedefDepo')),'IsTuru':_csv_cell(header.get('IsTuru')),'Firma':_csv_cell(header.get('Firma')),'Sozlesme':_csv_cell(header.get('Sozlesme'))}
    previous_id=str((history.get('latest') or {}).get('KontrolID') or '')
    revision_no=(int(history.get('count') or 0)+1) if control_type=='REZERVASYON' and reservation_no else 1
    _,source_map,_=source_snapshot_cached(force=False)
    source_versions=DATA_ARCH_V2.observe_sources(source_map or {})
    engine_state=_engine_snapshot(source_map or {})
    rules=DATA_ARCH_V2.ruleset_info()
    trace={
        'RuleSetVersion':rules.get('version',''),'RuleSetHash':rules.get('hash',''),
        'DataSourceDigest':engine_state.get('sourceDigest',''),'IndexBuildID':engine_state.get('buildId',''),
        'IndexSourceDigest':engine_state.get('indexSourceDigest',''),'IndexStatus':engine_state.get('status',''),
        'ZMM048SnapshotID':(source_versions.get('ZMM048') or {}).get('versionId',''),
        'MB51SnapshotID':(source_versions.get('MB51') or {}).get('versionId',''),
        'MB52SnapshotID':(source_versions.get('MB52') or {}).get('versionId',''),
        'ZMM098SnapshotID':(source_versions.get('ZMM098') or {}).get('versionId',''),
        'KESIFLERSnapshotID':(source_versions.get('KESIFLER') or {}).get('versionId',''),
        'TANIMLARSnapshotID':(source_versions.get('TANIMLAR') or {}).get('versionId','')
    }
    session=user_context(audit=True);resp=session.get('responsibility') or {}
    trace.update({'WindowsKullanici':session.get('login',''),'BilgisayarAdi':session.get('computerName',''),'OturumBaslangici':session.get('sessionStartedAt',''),'KullaniciRolu':resp.get('role',''),'BirincilSorumluIller':', '.join(resp.get('primaryProvinces') or []),'YedekSorumluIller':', '.join(resp.get('backupProvinces') or [])})
    # TESIS: existing SAP movements and earlier approvals are a pre-save safety gate.
    # Revisions remain possible, but they never create a second local commitment.
    mb51_safety=[]
    if control_type=='REZERVASYON' and reservation_no and str(header.get('IsTuru') or '').strip().upper() in ('TESIS','TESİS','T'):
        for row in materials:
            mat=str((row or {}).get('MalzemeKodu') or '').strip()
            approved=_dashboard_num((row or {}).get('OnaylananMiktar'))
            if not mat or approved<=0:continue
            rec=_mb51_reconcile(reservation_no,mat,approved)
            if rec.get('status')=='KONTROL_EDILEMEDI':
                raise ValueError('MB51 kontrol verisi okunamadı; TESİS kesin kayıt güvenle doğrulanamıyor: '+str(rec.get('error') or ''))
            if rec.get('found'):
                mb51_safety.append({'materialCode':mat,'actualQty':rec.get('actualQty'),'events':rec.get('events'),'status':rec.get('status')})
                row['TaahhutDurumu']='FIILI_HAREKET_VAR_TEKRAR_TAAHHUT_YOK'
            elif history.get('controlled'):
                # Existing revision: do not allocate the same capacity again.
                row['TaahhutDurumu']='KONTROL_REVIZYONU_MEVCUT_TAAHHUT_TEKRAR_DUSULMEZ'
        if mb51_safety and str(header.get('MB51OnKontrolOnayi') or '').strip().upper()!='EVET':
            raise ValueError('TESİS kaydı için fiili MB51 hareketi bulundu. Kayıt öncesi MB51 uyarısı açıkça onaylanmalıdır.')
        if mb51_safety:
            header['MB51OnKontrolUyarisi']=' | '.join(f"{x['materialCode']}:{x['actualQty']}:{x['status']}" for x in mb51_safety)
            header['MB51OnKontrolOnayi']='EVET'
        if history.get('controlled'):
            header['KayitIslemi']='YENIDEN_DEGERLENDIRME_TAAHHUT_TEKRAR_DUSULMEZ'
    mb51_notes=[]
    for row in materials:
        decision=str((row or {}).get('KalemKarari') or '').upper();approved=_dashboard_num((row or {}).get('OnaylananMiktar'));rec=_mb51_reconcile(reservation_no,(row or {}).get('MalzemeKodu'),approved) if reservation_no else {'status':'NOT_APPLICABLE','actualQty':0,'lastDate':''}
        row['MB51FiiliMiktar']=rec.get('actualQty',0);row['MB51MutabakatDurumu']=rec.get('status','');row['MB51SonHareketTarihi']=rec.get('lastDate','')
        if decision=='ONAYLA': mb51_notes.append(f"{row.get('MalzemeKodu')}:{rec.get('status')}")
    trace['MB51MutabakatOzeti']=' | '.join(mb51_notes)
    header_row={**header,**trace,'KontrolID':control_id,'KontrolZamani':timestamp,'RezervasyonKontrolSira':str(revision_no) if reservation_no else '','TekrarKontrol':'EVET' if reservation_no and revision_no>1 else 'HAYIR','OncekiKontrolID':previous_id};material_rows=[{**common,**(row or {})} for row in materials];project_rows=[{**common,**(row or {})} for row in projects]
    # FIX28: the final control is ONE immutable bundle, not three loose CSVs.
    targets=[('header',HEADER_FIELDS,[header_row]),('materials',MATERIAL_FIELDS,material_rows)]
    if project_rows:targets.append(('projects',PROJECT_FIELDS,project_rows))
    written=publish_control_bundle(root,control_id,targets,session.get('login','USER'))
    _RECORD_HEADERS_CACHE['signature']=None
    try:
        decisions=[{'itemNo':_csv_cell(r.get('RezervasyonKalemNo')),'materialCode':_csv_cell(r.get('MalzemeKodu')),'quantity':_csv_cell(r.get('Miktar')),'decision':_csv_cell(r.get('KalemKarari')),'reason':_csv_cell(r.get('KararGerekcesi')),'note':_csv_cell(r.get('KararAciklamasi')),'commitment':_csv_cell(r.get('TaahhutDurumu'))} for r in materials]
        DATA_ARCH_V2.audit('CONTROL','ITEM_LEVEL_DECISION_SAVED',session.get('login','USER'),'CONTROL',control_id,{'reservationNo':reservation_no,'generalResult':_csv_cell(header.get('GenelSonuc')),'approved':sum(1 for x in decisions if x.get('decision')=='ONAYLA'),'rejected':sum(1 for x in decisions if x.get('decision')=='ONAYLAMA'),'held':sum(1 for x in decisions if x.get('decision')=='BEKLET'),'items':decisions})
        if mb51_safety:
            DATA_ARCH_V2.audit('CONTROL','MB51_PRE_SAVE_WARNING_ACK',session.get('login','USER'),'CONTROL',control_id,{'reservationNo':reservation_no,'items':mb51_safety,'confirmedByUser':True})
        if _csv_cell(header.get('KullaniciOverride')).upper()=='EVET':
            DATA_ARCH_V2.audit('CONTROL','USER_APPROVAL_OVERRIDE',session.get('login','USER'),'CONTROL',control_id,{'reservationNo':reservation_no,'reasons':_csv_cell(header.get('OverrideNedenleri')),'detail':_csv_cell(header.get('OverrideDetayi')),'confirmedAt':_csv_cell(header.get('OverrideOnayZamani')),'guaranteeResult':_csv_cell(header.get('TeminatSonucu')),'discoveryResult':_csv_cell(header.get('KesifSonucu'))})
    except Exception:
        pass
    return {'controlId':control_id,'timestamp':timestamp,'recordRoot':str(root),'files':[str(p) for p in written],'projectFileCreated':bool(project_rows),'revisionNo':revision_no if reservation_no else None,'repeatControl':bool(reservation_no and revision_no>1),'previousControlId':previous_id,'mb51Reconciliation':[{'materialCode':r.get('MalzemeKodu',''),'decision':r.get('KalemKarari',''),'approvedQty':r.get('OnaylananMiktar',''),'actualQty':r.get('MB51FiiliMiktar',''),'status':r.get('MB51MutabakatDurumu',''),'lastDate':r.get('MB51SonHareketTarihi','')} for r in material_rows]}




# FIX26: central record writer lock. Atomic file creation serializes saves sharing
# a record root. If a stale lock exists, fail closed instead of risking duplicates.
_SAVE_LOCK_NAME='.fix26_control_write.lock'
_save_control_payload_unlocked=save_control_payload
def save_control_payload(payload,allow_repeat=False):
    # Fail closed: production shared writes require explicit IT acceptance.
    if not load_config().get('shared_writes_enabled',False):
        raise PermissionError('Merkezi kayıt güvenliği henüz kabul edilmedi. Pilot salt okunur; yönetici onayı sonrası kayıt etkinleştirilir.')
    # Reject malformed final controls before creating any directory/lock/file.
    validate_final_reservation_number(payload)
    root=load_record_root();root.mkdir(parents=True,exist_ok=True)
    lock_path=root/_SAVE_LOCK_NAME
    descriptor=None
    for attempt in range(60):
        try:
            descriptor=os.open(str(lock_path),os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
            os.write(descriptor,(f'{socket.gethostname()}:{os.getpid()}:{datetime.now().astimezone().isoformat()}').encode('utf-8'))
            break
        except FileExistsError:
            if attempt==59:raise ValueError('Merkezi kayıt kilidi kullanımda; eşzamanlı/mükerrer kayıt önlemek için kayıt durduruldu. Kilit dosyasını doğrulamadan silmeyin.')
            time.sleep(.2)
    try:
        return _save_control_payload_unlocked(payload,allow_repeat=allow_repeat)
    finally:
        if descriptor is not None:
            os.close(descriptor)
            try:lock_path.unlink()
            except OSError:pass

def _read_csv_dict(path):
    raw=Path(path).read_bytes();text=None
    for enc in ('utf-8-sig','utf-8','cp1254','cp1252','latin-1'):
        try:text=raw.decode(enc);break
        except UnicodeDecodeError:continue
    text=text or raw.decode('utf-8',errors='replace')
    delim=';' if text.count(';')>=text.count(',') else ','
    return list(csv.DictReader(text.splitlines(),delimiter=delim))

def _dashboard_num(value):
    text=str(value or '').strip().replace(' ','')
    if not text:return 0.0
    # Kayıt CSV'leri Türkçe ondalık virgül kullanır. Binlik ayırıcı beklenmez.
    if ',' in text and '.' in text:
        if text.rfind(',')>text.rfind('.'):
            text=text.replace('.','').replace(',','.')
        else:
            text=text.replace(',','')
    else:
        text=text.replace(',','.')
    try:return float(text)
    except Exception:return 0.0

def _dashboard_time(value):
    text=str(value or '').strip()
    for fmt in ('%Y-%m-%d %H:%M:%S','%Y-%m-%dT%H:%M:%S','%d.%m.%Y %H:%M:%S','%d.%m.%Y'):
        try:return datetime.strptime(text,fmt)
        except Exception:pass
    return None

def _read_semicolon_csv(path: Path):
    with path.open('r',encoding='utf-8-sig',newline='') as fh:
        return list(csv.DictReader(fh,delimiter=';'))

def _dashboard_depot_key(row):
    return f"{str(row.get('HedefUY') or '').strip()}|{str(row.get('HedefDepo') or '').strip()}"

def _dashboard_depot_label(row):
    code=' / '.join(x for x in [str(row.get('HedefUY') or '').strip(),str(row.get('HedefDepo') or '').strip()] if x)
    desc=str(row.get('HedefDepoTanimi') or '').strip()
    return (code+(' — '+desc if desc else '')).strip(' —') or 'Tanımsız Depo'

def dashboard_snapshot(days=30, company='', depot='', work_type=''):
    try: days=int(days)
    except Exception: days=30
    if days not in (0,7,30,90,365):days=30
    company=str(company or '').strip();depot=str(depot or '').strip();work_type=str(work_type or '').strip()
    root=load_record_root();warnings=[]
    # FIX28N: reads only the local SQLite index for unchanged CSV bundles.
    # Source stat/manifest refresh and periodic checksum verification are in
    # control_read_index; the CSV fallback remains read-only and validated.
    headers=_control_index_rows('header',root=root)
    now=datetime.now();cutoff=(now-timedelta(days=days-1)).replace(hour=0,minute=0,second=0,microsecond=0) if days else None
    period=[]
    for row in headers:
        dt=_dashboard_time(row.get('KontrolZamani'))
        if cutoff and (not dt or dt<cutoff):continue
        period.append((row,dt))

    # Dönem bazındaki tüm filtre seçenekleri, seçili filtrelerden bağımsız korunur.
    companies=sorted({str(r.get('Firma') or '').strip() for r,_ in period if str(r.get('Firma') or '').strip()},key=str.casefold)
    work_types_all=sorted({str(r.get('IsTuru') or '').strip() for r,_ in period if str(r.get('IsTuru') or '').strip()},key=str.casefold)
    depot_map={}
    for r,_ in period:
        key=_dashboard_depot_key(r)
        if key=='|':continue
        firm=str(r.get('Firma') or '').strip();wt=str(r.get('IsTuru') or '').strip();sig=(firm,key)
        item=depot_map.get(sig)
        if not item:
            item={'key':key,'label':_dashboard_depot_label(r),'company':firm,'uy':str(r.get('HedefUY') or '').strip(),'depot':str(r.get('HedefDepo') or '').strip(),'desc':str(r.get('HedefDepoTanimi') or '').strip(),'workType':wt,'workTypes':[],'contract':str(r.get('Sozlesme') or '').strip()}
            depot_map[sig]=item
        if wt and wt not in item['workTypes']:item['workTypes'].append(wt)
        if not item['workType'] and wt:item['workType']=wt
        if not item['contract'] and str(r.get('Sozlesme') or '').strip():item['contract']=str(r.get('Sozlesme') or '').strip()
    depot_options=list(depot_map.values())
    for item in depot_options:item['workTypes'].sort(key=str.casefold)
    depot_options.sort(key=lambda x:(x['company'].casefold(),x['label'].casefold()))

    parsed=[]
    for row,dt in period:
        if company and str(row.get('Firma') or '').strip()!=company:continue
        if depot and _dashboard_depot_key(row)!=depot:continue
        if work_type and str(row.get('IsTuru') or '').strip()!=work_type:continue
        parsed.append((row,dt))
    ids={str(r.get('KontrolID') or '') for r,_ in parsed if r.get('KontrolID')}
    header_by_id={str(r.get('KontrolID') or ''):(r,dt) for r,dt in parsed if r.get('KontrolID')}
    controls=len(parsed)
    completed_results={'KARAR VERILEBILIR','KISMI ONAY','ONAY YOK'}
    okay=sum(1 for r,_ in parsed if str(r.get('GenelSonuc') or '').upper().strip() in completed_results)
    review=sum(1 for r,_ in parsed if str(r.get('GenelSonuc') or '').upper().strip() not in completed_results)
    today=now.date();today_count=sum(1 for _,dt in parsed if dt and dt.date()==today)
    demand=sum(_dashboard_num(r.get('TalepTeminatDegeri')) for r,_ in parsed)
    usages=[_dashboard_num(r.get('TeminatKullanimOraniYuzde')) for r,_ in parsed if str(r.get('TeminatKullanimOraniYuzde') or '').strip()]
    avg_usage=(sum(usages)/len(usages)) if usages else 0.0
    firms={str(r.get('Firma') or '').strip() for r,_ in parsed if str(r.get('Firma') or '').strip()}
    modes=Counter((str(r.get('KontrolTuru') or 'BELIRSIZ').strip() or 'BELIRSIZ') for r,_ in parsed)
    work_types=Counter((str(r.get('IsTuru') or 'BELIRSIZ').strip() or 'BELIRSIZ') for r,_ in parsed)
    firm_counts=Counter((str(r.get('Firma') or 'Tanımsız Firma').strip() or 'Tanımsız Firma') for r,_ in parsed)
    depot_counts=Counter(_dashboard_depot_label(r) for r,_ in parsed)
    daily=Counter(dt.strftime('%Y-%m-%d') for _,dt in parsed if dt)
    if days:
        daily_series=[]
        for i in range(days):
            d=(cutoff+timedelta(days=i)).date()
            if d>today:break
            key=d.isoformat();daily_series.append({'date':key,'count':daily.get(key,0)})
    else:daily_series=[{'date':k,'count':daily[k]} for k in sorted(daily)]

    mat_agg={};contractor_mat_agg={};material_row_count=0
    if ids:
        for r in _control_index_rows('materials', control_ids=ids, root=root):
            material_row_count+=1;cid=str(r.get('KontrolID') or '').strip();h,hdt=header_by_id.get(cid,({},None))
            line_decision=str(r.get('KalemKarari') or '').strip().upper()
            if line_decision and line_decision!='ONAYLA':continue
            code=str(r.get('MalzemeKodu') or '').strip() or 'Tanımsız';desc=str(r.get('MalzemeTanimi') or '').strip();unit=str(r.get('Birim') or '').strip();amount=_dashboard_num(r.get('TalepTutari'));qty=_dashboard_num(r.get('OnaylananMiktar') or r.get('Miktar'))
            key=(code,desc,unit);a=mat_agg.setdefault(key,{'code':code,'desc':desc,'unit':unit,'amount':0.0,'qty':0.0,'controls':set()});a['amount']+=amount;a['qty']+=qty
            if cid:a['controls'].add(cid)
            comp=str(r.get('Firma') or h.get('Firma') or '').strip() or 'Tanımsız Firma';target=_dashboard_depot_label(h if h else r)
            ckey=(comp,target,code,desc,unit);ca=contractor_mat_agg.setdefault(ckey,{'company':comp,'target':target,'code':code,'desc':desc,'unit':unit,'amount':0.0,'qty':0.0,'controls':set(),'lastDate':'','lastDt':None});ca['amount']+=amount;ca['qty']+=qty
            if cid:ca['controls'].add(cid)
            row_dt=hdt or _dashboard_time(r.get('KontrolZamani'))
            if row_dt and (ca['lastDt'] is None or row_dt>ca['lastDt']):ca['lastDt']=row_dt;ca['lastDate']=row_dt.strftime('%Y-%m-%d %H:%M:%S')
    materials=sorted(({'code':a['code'],'desc':a['desc'],'unit':a['unit'],'amount':a['amount'],'qty':a['qty'],'controls':len(a['controls'])} for a in mat_agg.values()),key=lambda x:(x['amount'],x['controls']),reverse=True)[:10]
    contractor_materials=[{'company':a['company'],'target':a['target'],'code':a['code'],'desc':a['desc'],'unit':a['unit'],'amount':a['amount'],'qty':a['qty'],'controls':len(a['controls']),'lastDate':a['lastDate']} for a in contractor_mat_agg.values()]
    contractor_materials.sort(key=lambda x:(x['company'].casefold(),x['target'].casefold(),-x['amount'],-x['qty'],x['code']))

    project_rows=[]
    if ids:
        for r in _control_index_rows('projects',control_ids=ids,root=root):
            cid=str(r.get('KontrolID') or '').strip();h,hdt=header_by_id.get(cid,({},None));comp=str(r.get('Firma') or h.get('Firma') or '').strip() or 'Tanımsız Firma';reservation=str(r.get('RezervasyonNo') or h.get('RezervasyonNo') or '').strip();row_dt=hdt or _dashboard_time(r.get('KontrolZamani'));target=_dashboard_depot_label(h if h else r)
            project_rows.append({'controlId':cid,'time':(row_dt.strftime('%Y-%m-%d %H:%M:%S') if row_dt else str(r.get('KontrolZamani') or '')),'company':comp,'target':target,'reservation':reservation,'projectCode':str(r.get('ProjeKodu') or '').strip(),'projectName':str(r.get('ProjeAdi') or '').strip(),'materialCode':str(r.get('MalzemeKodu') or '').strip(),'materialDesc':str(r.get('MalzemeTanimi') or '').strip(),'unit':str(r.get('Birim') or '').strip(),'projectDiscovery':_dashboard_num(r.get('ProjeKesfi')),'distributed':_dashboard_num(r.get('DagitilanMiktar')),'projectRemaining':_dashboard_num(r.get('ProjeKalani')),'materialRemaining':_dashboard_num(r.get('MalzemeKalani')),'status':str(r.get('Durum') or '').strip()})
    project_rows.sort(key=lambda x:(x['time'],x['company'],x['projectName'],x['materialCode']),reverse=True)
    latest=[]
    for r,dt in sorted(parsed,key=lambda x:x[1] or datetime.min,reverse=True)[:10]:latest.append({'id':r.get('KontrolID',''),'time':r.get('KontrolZamani',''),'mode':r.get('KontrolTuru',''),'reservation':r.get('RezervasyonNo',''),'company':r.get('Firma',''),'target':_dashboard_depot_label(r),'result':r.get('GenelSonuc',''),'demand':_dashboard_num(r.get('TalepTeminatDegeri'))})
    def top(counter,n=8):return [{'label':k,'value':v} for k,v in counter.most_common(n)]
    selected_depot=next((x for x in depot_options if x['key']==depot and (not company or x['company']==company)),None)
    return {'recordRoot':str(root),'days':days,'generatedAt':now.strftime('%Y-%m-%d %H:%M:%S'),'warnings':warnings[:20],'selectedFilters':{'company':company,'depot':depot,'depotLabel':selected_depot['label'] if selected_depot else '','workType':work_type},'filterOptions':{'companies':companies,'depots':depot_options,'workTypes':work_types_all},'metrics':{'totalControls':controls,'todayControls':today_count,'decisionReady':okay,'reviewRequired':review,'totalDemandValue':demand,'avgGuaranteeUsage':avg_usage,'uniqueFirms':len(firms),'materialRows':material_row_count,'contractorMaterialRows':len(contractor_materials),'projectRows':len(project_rows)},'decision':{'ready':okay,'review':review},'modes':top(modes),'workTypes':top(work_types),'firms':top(firm_counts),'depots':top(depot_counts),'daily':daily_series,'materials':materials,'contractorMaterials':contractor_materials,'projectDistributions':project_rows,'latest':latest}


def operations_snapshot(days=30, company='', depot='', work_type='', months=12):
    """Operasyon İzleme: kontrol kayıtları + ZMM098 + MB51 aylık harcama/akış özeti.
    Stok devir hızı, ortalama stok veya stokta kalma günü hesaplanmaz.
    """
    dash=dashboard_snapshot(days,company,depot,work_type)
    raw_depot=str(depot or '').strip();dy=raw_depot.split('|',1)[1] if '|' in raw_depot else raw_depot
    eligible=[]
    if not dy and (company or work_type):
        for x in (dash.get('filterOptions') or {}).get('depots') or []:
            if company and str(x.get('company') or '').strip()!=str(company).strip():continue
            wts=x.get('workTypes') or ([x.get('workType')] if x.get('workType') else [])
            if work_type and str(work_type) not in [str(w) for w in wts]:continue
            code=str(x.get('depot') or '').strip()
            if code:eligible.append(code)
    ops=indexed_engine.operations_metrics(_active_index_db(),dy,months,eligible)
    # Depo/proje bazlı kontrol özeti: farklı birimlerde miktarlar toplanmaz; kontrol ve malzeme satırı sayısı izlenir.
    project_groups={}
    for r in dash.get('projectDistributions') or []:
        key=(str(r.get('target') or ''),str(r.get('projectCode') or ''),str(r.get('projectName') or ''))
        g=project_groups.setdefault(key,{'target':key[0],'projectCode':key[1],'projectName':key[2],'controls':set(),'materialRows':0,'lastControl':'','readyRows':0,'reviewRows':0})
        cid=str(r.get('controlId') or '')
        if cid:g['controls'].add(cid)
        g['materialRows']+=1
        if str(r.get('status') or '').strip().upper()=='UYGUN':g['readyRows']+=1
        else:g['reviewRows']+=1
        t=str(r.get('time') or '')
        if t>g['lastControl']:g['lastControl']=t
    project_summary=[]
    life=load_project_status_state().get('projects',{}) if 'load_project_status_state' in globals() else {}
    for g in project_groups.values():
        pk=project_key(g['target'],g['projectCode'],g['projectName']) if 'project_key' in globals() else ''
        ls=life.get(pk) or {}
        project_summary.append({'target':g['target'],'projectCode':g['projectCode'],'projectName':g['projectName'],'controls':len(g['controls']),'materialRows':g['materialRows'],'lastControl':g['lastControl'],'readyRows':g['readyRows'],'reviewRows':g['reviewRows'],'lifecycleStatus':ls.get('status') or 'AKTIF','lifecycleReason':ls.get('reason') or '','lifecycleRevision':ls.get('revision') or 0,'lifecycleUpdatedAt':ls.get('updatedAt') or ''})
    project_summary.sort(key=lambda x:(x['target'].casefold(),x['projectName'].casefold(),-x['controls']))
    # Current guarantee summary. Multiple rows are preserved so duplicate/master quality issues remain visible.
    grows=ops.get('guaranteeRows') or []
    guarantee={'rows':grows,'rowCount':len(grows),'ambiguous':bool(dy and len(grows)>1),'total':sum(float(x.get('main') or 0)+float(x.get('cash') or 0)+float(x.get('manual') or 0) for x in grows),'stockValue':sum(float(x.get('stockValue') or 0) for x in grows),'available':sum(float(x.get('available') or 0) for x in grows)}
    latest_month=(ops.get('monthlySpend') or [{}])[-1] if ops.get('monthlySpend') else {}
    return {'generatedAt':datetime.now().strftime('%Y-%m-%d %H:%M:%S'),'filters':{'days':days,'company':company,'depot':depot,'workType':work_type,'dy':dy},'guarantee':guarantee,'monthlySpend':ops.get('monthlySpend') or [],'monthlyByDepot':ops.get('monthlyByDepot') or [],'currentMonth':ops.get('currentMonth') or '', 'currentMonthByDepot':ops.get('currentMonthByDepot') or [],'latestMonthSpend':latest_month,'flows':ops.get('flows') or {},'pypSpend':ops.get('pypSpend') or [],'projectSummary':project_summary,'controlMetrics':dash.get('metrics') or {},'warnings':dash.get('warnings') or [],'note':'Stok devir hızı / ortalama stok / stokta kalma günü hesaplanmaz. Harcama MB51 Kayıt Tarihi ve 221/222/Z22 net etkisine göre raporlanır.'}


def operations_work_snapshot(code='T', months=12):
    """BAKIM/KET/LED/TESİS için ayrı operasyon sayfası snapshotı."""
    code=str(code or 'T').upper().strip()
    if code not in ('T','K','B','L'):
        raise ValueError('Geçersiz iş türü kodu.')
    try: months=max(1,min(36,int(months or 12)))
    except Exception: months=12
    data=indexed_engine.worktype_operations(_active_index_db(),code,months)
    if code=='T':
        for mp in load_manual_tesis_projects().get('projects',[]):
            rows=mp.get('discoveryRows') or []
            data.setdefault('projects',[]).append({'dy':mp.get('depot'),'projectNorm':mp.get('projectNorm'),'projectName':mp.get('projectName'),'projectCode':mp.get('projectCode'),'materialCount':len(rows),'positiveRows':sum(1 for x in rows if float(x.get('remaining') or 0)>0),'zeroRows':sum(1 for x in rows if float(x.get('remaining') or 0)==0),'negativeRows':sum(1 for x in rows if float(x.get('remaining') or 0)<0),'issueRows':0,'manualProject':True})
            if mp.get('depot') and mp.get('depot') not in data.setdefault('depotCodes',[]): data['depotCodes'].append(mp.get('depot'))
        with indexed_engine.connect(_active_index_db()) as dbc:
            master=[dict(r) for r in dbc.execute('SELECT dy,project_id,project_norm FROM projects').fetchall()]
        data['autoProjectIds']=project_ids28r.assign(data.get('projects') or [],master,load_manual_tesis_projects().get('projects') or [],PROJECT_IDS28R_PATH)
        life=load_project_status_state().get('projects',{}) if 'load_project_status_state' in globals() else {}
        values=list(life.values()) if isinstance(life,dict) else []
        def life_for(row):
            dy=str(row.get('dy') or '').strip();pc=str(row.get('projectCode') or '').strip();pn=str(row.get('projectName') or '').strip()
            direct=life.get(project_key(dy,pc,pn)) if 'project_key' in globals() else None
            if direct:return direct
            for x in values:
                xd=str(x.get('depot') or '')
                if dy and dy not in xd:continue
                if pc and str(x.get('projectCode') or '').strip()==pc:return x
                if pn and str(x.get('projectName') or '').strip()==pn:return x
            return {}
        for r in data.get('projects') or []:
            ls=life_for(r);r['lifecycleStatus']=ls.get('status') or 'AKTIF';r['lifecycleReason']=ls.get('reason') or '';r['lifecycleRevision']=ls.get('revision') or 0;r['lifecycleUpdatedAt']=ls.get('updatedAt') or ''
        for r in data.get('projectMaterials') or []:
            ls=life_for(r);r['lifecycleStatus']=ls.get('status') or 'AKTIF'
    labels={'T':'TESİS','K':'KET&YB','B':'BAKIM','L':'LED'}
    mats=data.get('materials') or [];depot_rows=data.get('depotDiscovery') or [];guar=data.get('guaranteeRows') or [];monthly=data.get('monthlySpend') or []
    data['workLabel']=labels[code]
    data['summary']={
        'depots':len(data.get('depotCodes') or []),
        'materialRows':sum(int(x.get('materialCount') or 0) for x in (data.get('projects') or [])) if code=='T' else len(mats),
        'discoveryRows':sum(int(x.get('sourceRows') or 0) for x in depot_rows),
        'positiveRows':sum(int(x.get('positiveRows') or 0) for x in depot_rows),
        'zeroRows':sum(int(x.get('zeroRows') or 0) for x in depot_rows),
        'negativeRows':sum(int(x.get('negativeRows') or 0) for x in depot_rows),
        'issueRows':sum(int(x.get('issueRows') or 0) for x in depot_rows),
        'guaranteeAvailable':sum(float(x.get('available') or 0) for x in guar),
        'lastMonth':(monthly[-1].get('month') if monthly else ''),
        'lastMonthSpend':(float(monthly[-1].get('netSpend') or 0) if monthly else 0.0)
    }
    data['generatedAt']=datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    data['note']='Stok devir hızı / ortalama stok / stokta kalma günü hesaplanmaz.'
    return data




def tesis_control_preflight(reservation_no):
    res=str(reservation_no or '').strip()
    if not res:raise ValueError('Rezervasyon numarası zorunludur.')
    history=reservation_control_history(res)
    with indexed_engine.connect(_active_index_db()) as c:
        source=[dict(r) for r in c.execute('''SELECT material_code materialCode,SUM(qty) sourceQty,COUNT(*) sourceRows,
          MAX(source_uy) sourceUY,MAX(source_dy) sourceDY,MAX(target_uy) targetUY,MAX(target_dy) targetDY
          FROM zmm048 WHERE reservation_no=? GROUP BY material_code''',(res,)).fetchall()]
        movements=[dict(r) for r in c.execute('''SELECT material_code materialCode,COUNT(*) events,
          SUM(CASE WHEN movement IN ('301','311') THEN ABS(qty) WHEN movement IN ('302','312') THEN -ABS(qty) ELSE 0 END) actualQty,
          MAX(posting_date) lastPostingDate FROM mb51 WHERE reservation=? AND movement IN ('301','302','311','312') GROUP BY material_code''',(res,)).fetchall()]
    mp={x['materialCode']:x for x in movements};
    for r in source:
        m=mp.get(r['materialCode'])
        r['mb51Found']=bool(m);r['mb51Qty']=float(m['actualQty'] or 0) if m else 0.0
        r['mb51Events']=int(m['events'] or 0) if m else 0
        r['reservationConfirmation']='KESINLESME_DOGRULANMADI'
    for m in movements:
        if m['materialCode'] not in {x['materialCode'] for x in source}:
            source.append({'materialCode':m['materialCode'],'sourceQty':None,'sourceRows':0,'mb51Found':True,
              'mb51Qty':float(m['actualQty'] or 0),'mb51Events':int(m['events'] or 0),'reservationConfirmation':'KESINLESME_DOGRULANMADI'})
    return {'reservationNo':res,'previousControlCount':history.get('count',0),'previousControlId':(history.get('latest') or {}).get('KontrolID',''),
            'items':source,'note':'ZMM048 kayıtlı olmak kesinleşme kanıtı değildir; MB51 fiili hareketi ayrıca incelenmelidir.'}

# FIX26: Read-only TESIS reservation / MB51 history. ZMM048 presence is NOT proof
# of a confirmed reservation; a separate certified publication is required.
def _fix26_csv_for_control(control_id, kind):
    if not re.fullmatch(r'KD-[A-Za-z0-9-]+', str(control_id or '')):return []
    if kind not in ('header','materials','projects'):return []
    return _control_index_rows(kind,control_ids=(control_id,))

def _fix26_pair_mb51(c,res,mat):
    rows=[dict(r) for r in c.execute('''SELECT id,doc,date,posting_date,movement,material_code,material_desc,qty,uom,plant,dy,
            reservation,pyp,target_dy,target_plant,amount_upb FROM mb51
            WHERE reservation=? AND material_code=? ORDER BY posting_date DESC,id DESC LIMIT 350''',(res,mat)).fetchall()]
    agg=c.execute('''SELECT COUNT(*) events,COALESCE(SUM(CASE WHEN movement IN ('301','311') THEN ABS(qty)
                      WHEN movement IN ('302','312') THEN -ABS(qty) ELSE 0 END),0) actualQty
                      FROM mb51 WHERE reservation=? AND material_code=? AND movement IN ('301','302','311','312')''',(res,mat)).fetchone()
    return rows,float(agg['actualQty'] or 0),int(agg['events'] or 0)

def tesis_control_history_snapshot(query='', status='', depot='', page=1, page_size=35):
    query=str(query or '').strip().casefold();status=str(status or '').strip().upper();depot=str(depot or '').strip()
    page=max(1,int(page or 1));page_size=max(1,min(100,int(page_size or 35)))
    entries=[]
    # Only TESIS control records are loaded, and the existing append-only files are untouched.
    for h in record_header_rows():
        if str(h.get('IsTuru') or '').strip().upper() not in ('TESIS','TESİS','T'):continue
        if depot and str(h.get('HedefDepo') or '')!=depot:continue
        res=str(h.get('RezervasyonNo') or '').strip()
        if not res:continue
        cid=str(h.get('KontrolID') or '')
        for r in _fix26_csv_for_control(cid,'materials'):
            mat=str(r.get('MalzemeKodu') or '').strip()
            if not mat:continue
            hay=' '.join([res,mat,cid,str(r.get('MalzemeTanimi') or ''),str(h.get('Firma') or ''),str(h.get('HedefDepo') or '')]).casefold()
            if query and query not in hay:continue
            entries.append({'controlId':cid,'controlTime':h.get('KontrolZamani',''),'revision':h.get('RezervasyonKontrolSira',''),
                'reservationNo':res,'materialCode':mat,'materialDesc':r.get('MalzemeTanimi',''),'unit':r.get('Birim',''),
                'depot':h.get('HedefDepo',''),'targetPlant':h.get('HedefUY',''),'company':h.get('Firma',''),
                'approvedQty':_dashboard_num(r.get('OnaylananMiktar')),'requestQty':_dashboard_num(r.get('Miktar')),
                'itemDecision':r.get('KalemKarari',''),'appResult':h.get('GenelSonuc',''),
                'override':h.get('KullaniciOverride',''),'mb51SnapshotId':h.get('MB51SnapshotID','')})
    # Filter by MB51 status after lookup; no fabricated 'confirmed' state from ZMM048.
    with indexed_engine.connect(_active_index_db()) as c:
        cache={}
        reservations={}
        pairs=list({(e['reservationNo'],e['materialCode']) for e in entries})
        for res,mat in pairs:
            rows,actual,events=_fix26_pair_mb51(c,res,mat)
            cache[(res,mat)]=(rows,actual,events)
            zv=c.execute('''SELECT COUNT(*) n,SUM(qty) qty FROM zmm048 WHERE reservation_no=? AND material_code=?''',(res,mat)).fetchone()
            reservations[(res,mat)]={'present':int(zv['n'] or 0)>0,'sourceQty':float(zv['qty'] or 0),'sourceRows':int(zv['n'] or 0)}
    output=[]
    for e in entries:
        rows,actual,events=cache[(e['reservationNo'],e['materialCode'])]
        e['mb51Qty']=round(actual,3);e['mb51Events']=events;e['mb51Status']='MB51_BEKLENIYOR' if not events else 'MUTABIK' if abs(actual-e['approvedQty'])<=1e-7 else 'FIILI_MIKTAR_FARKI'
        e['lastPostingDate']=rows[0].get('posting_date','') if rows else ''
        z=reservations[(e['reservationNo'],e['materialCode'])]
        e['reservationSource']='ZMM048_KAYDI_VAR' if z['present'] else 'ZMM048_KAYDI_YOK'
        e['reservationConfirmation']='KESINLESME_DOGRULANMADI'
        e['zmm048Qty']=z['sourceQty'] if z['present'] else None
        if status and e['mb51Status']!=status:continue
        output.append(e)
    total=len(output);lo=(page-1)*page_size
    return {'items':output[lo:lo+page_size],'total':total,'page':page,'pageSize':page_size,'pages':max(1,(total+page_size-1)//page_size),
        'summary':{'mb51Waiting':sum(1 for x in output if x['mb51Status']=='MB51_BEKLENIYOR'),'matched':sum(1 for x in output if x['mb51Status']=='MUTABIK'),'different':sum(1 for x in output if x['mb51Status']=='FIILI_MIKTAR_FARKI')},
        'note':'ZMM048 varlığı kesinleşme kanıtı değildir. MB51 hareketleri fiili durumdur. Önceki kontrol revizyonları ayrı satırlarda gösterilir.'}

def tesis_control_history_detail(control_id, reservation_no, material_code):
    cid=str(control_id or '').strip();res=str(reservation_no or '').strip();mat=str(material_code or '').strip()
    if not res or not mat:raise ValueError('Rezervasyon ve malzeme kodu zorunludur.')
    h=next((x for x in record_header_rows() if x.get('KontrolID')==cid and str(x.get('RezervasyonNo'))==res),None)
    if not h or str(h.get('IsTuru') or '').upper() not in ('TESIS','TESİS','T'):raise ValueError('TESİS kontrol kaydı bulunamadı.')
    materials=[r for r in _fix26_csv_for_control(cid,'materials') if str(r.get('MalzemeKodu') or '')==mat]
    projects=[r for r in _fix26_csv_for_control(cid,'projects') if str(r.get('MalzemeKodu') or '')==mat]
    with indexed_engine.connect(_active_index_db()) as c:
        movements,actual,events=_fix26_pair_mb51(c,res,mat)
        zmm=[dict(r) for r in c.execute('''SELECT reservation_no,material_code,qty,uom,source_uy,source_dy,target_uy,target_dy
           FROM zmm048 WHERE reservation_no=? AND material_code=? LIMIT 60''',(res,mat)).fetchall()]
    revisions=[{'controlId':x.get('KontrolID',''),'controlTime':x.get('KontrolZamani',''),'result':x.get('GenelSonuc',''),'revision':x.get('RezervasyonKontrolSira','')}
          for x in record_header_rows() if str(x.get('RezervasyonNo') or '')==res and str(x.get('IsTuru') or '').upper() in ('TESIS','TESİS','T')]
    return {'header':h,'materials':materials,'projects':projects,'movements':movements,'zmm048':zmm,'revisions':revisions,'actualQty':round(actual,3),'givenEvents':events,
       'reservationConfirmation':'KESINLESME_DOGRULANMADI','explanation':'ZMM048 kaydı ve uygulama kontrolü tek başına kesin rezervasyon kanıtı değildir.'}

# FIX26D: bundled material master is a read-only fallback, never an editable source.
_WORK_MATERIAL_MASTER_CACHE={'mtime':None,'rows':{}}
def _work_material_master():
    path=BUNDLED_ROOT/'SITE_MALZEMELER.csv'
    try:stamp=path.stat().st_mtime_ns
    except OSError:return {}
    if _WORK_MATERIAL_MASTER_CACHE['mtime']==stamp:return _WORK_MATERIAL_MASTER_CACHE['rows']
    rows={}
    with path.open('r',encoding='utf-8-sig',newline='') as f:
        for row in csv.DictReader(f,delimiter=';'):
            code=str(row.get('Malzeme_Kodu') or '').strip()
            desc=str(row.get('Malzeme_Tanimi') or '').strip()
            if code and desc:rows[code]=desc
    _WORK_MATERIAL_MASTER_CACHE.update(mtime=stamp,rows=rows)
    return rows

# FIX28R: Reservation-first view. One row per reservation, lazy material detail.
# No quantities are calculated here: units and movement directions stay in children.
def worktype_reservation_snapshot(code,depot='',plant='',query='',page=1,page_size=100,column_filters=None,sort_by='',sort_dir='desc'):
    code=str(code or '').strip().upper()
    if code not in ('B','K','L','T'):raise ValueError('İş türü geçersiz')
    depot=str(depot or '').strip();plant=str(plant or '').strip();query=str(query or '').strip().lower()[:120]
    page=max(1,int(page or 1));size=max(1,min(250,int(page_size or 100)))
    allowed="SELECT DISTINCT dy FROM kesif WHERE work_code=? AND dy<>''"
    clauses=["m.movement IN ('301','302','311','312')",f'(m.dy IN ({allowed}) OR m.target_dy IN ({allowed}))']
    args=[code,code]
    if depot:clauses.append('(m.dy=? OR m.target_dy=?)');args.extend([depot,depot])
    if plant:clauses.append('(m.plant=? OR m.target_plant=?)');args.extend([plant,plant])
    if query:
        clauses.append('(lower(m.material_code) LIKE ? OR lower(m.material_desc) LIKE ? OR lower(m.reservation) LIKE ? OR lower(m.doc) LIKE ?)')
        args.extend(['%'+query+'%']*4)
    fields={'reservationNo':'m.reservation','materialCode':'m.material_code','materialDesc':'m.material_desc','documentNo':'m.doc','postingDate':'m.posting_date','unit':'m.uom'}
    filters=column_filters if isinstance(column_filters,dict) else {}
    if len(filters)>8:raise ValueError('En fazla 8 sütun filtresi')
    having=[];hargs=[]
    for key,rule in filters.items():
        if not isinstance(rule,dict):raise ValueError('Geçersiz sütun filtresi')
        op=str(rule.get('op') or 'contains');value=str(rule.get('value') or '').strip()[:120]
        if not value:continue
        if key in ('materialCount','documentCount'):
            col='COUNT(DISTINCT m.material_code)' if key=='materialCount' else 'COUNT(DISTINCT m.doc)'
            if op not in ('equals','gt','lt'):raise ValueError('Sayısal filtre geçersiz')
            try:val=float(value.replace(',','.'))
            except ValueError:raise ValueError('Filtre değeri sayısal olmalı')
            having.append(col+{'equals':'=?','gt':'>?','lt':'<?'}[op]);hargs.append(val);continue
        if key not in fields:raise ValueError('Desteklenmeyen sütun filtresi')
        fld=fields[key]
        if op=='contains':clauses.append("lower(COALESCE("+fld+",'')) LIKE ?");args.append('%'+value.lower()+'%')
        elif op=='equals':clauses.append("lower(COALESCE("+fld+",''))=?");args.append(value.lower())
        elif op in ('date_from','date_to') and key=='postingDate':
            from datetime import date as _date
            try:_date.fromisoformat(value)
            except ValueError:raise ValueError('Tarih YYYY-MM-DD olmalı')
            clauses.append(fld+('>=?' if op=='date_from' else '<=?'));args.append(value)
        else:raise ValueError('Filtre karşılaştırması desteklenmiyor')
    key="CASE WHEN TRIM(COALESCE(m.reservation,''))<>'' THEN TRIM(m.reservation) ELSE 'BELGE:'||COALESCE(NULLIF(TRIM(m.doc),''),CAST(m.id AS TEXT)) END"
    where=' AND '.join(clauses)
    group=f'''SELECT {key} reservationKey,MAX(TRIM(COALESCE(m.reservation,''))) reservationNo,
      MAX(CASE WHEN TRIM(COALESCE(m.reservation,''))='' THEN m.doc ELSE '' END) documentNo,
      COUNT(DISTINCT m.material_code) materialCount,COUNT(DISTINCT m.doc) documentCount,
      COUNT(*) eventCount,MAX(m.posting_date) lastPostingDate,
      COUNT(DISTINCT m.dy) depotCount
      FROM mb51 m WHERE {where} GROUP BY {key}'''
    if having:group+=' HAVING '+' AND '.join(having)
    order={'reservationNo':'reservationNo','materialCount':'materialCount','documentCount':'documentCount','postingDate':'lastPostingDate'}.get(str(sort_by),'lastPostingDate')
    direction='ASC' if str(sort_dir).lower()=='asc' else 'DESC'
    with indexed_engine.connect(_active_index_db()) as c:
        total=c.execute('SELECT COUNT(*) FROM ('+group+')',args+hargs).fetchone()[0]
        rows=[dict(r) for r in c.execute(group+f' ORDER BY {order} {direction},reservationKey ASC LIMIT ? OFFSET ?',args+hargs+[size,(page-1)*size]).fetchall()]
    return {'rows':rows,'total':total,'page':page,'pages':max(1,(total+size-1)//size),'pageSize':size,
        'note':'Rezervasyon yalnız bir kez gösterilir. Malzeme ve MB51 belge hareketleri satır açıldığında ayrıca yüklenir; farklı ölçü birimleri toplanmaz.'}

# FIX28Q: read-only grouped MB51 view. Signed quantity uses the EXISTING
# worktype_report_snapshot direction/reversal calculation, unchanged.
def worktype_given_group_snapshot(code,depot='',plant='',query='',page=1,page_size=100,column_filters=None,sort_by='',sort_dir='desc'):
    code=str(code or '').upper().strip()
    if code not in ('B','K','L','T'):raise ValueError('İş türü geçersiz')
    depot=str(depot or '').strip();plant=str(plant or '').strip();query=str(query or '').strip().lower()[:120]
    page=max(1,int(page or 1));size=max(1,min(250,int(page_size or 100)))
    allowed='SELECT DISTINCT dy FROM kesif WHERE work_code=? AND dy<>\'\''
    inside_src=f'm.dy IN ({allowed})';inside_tgt=f'm.target_dy IN ({allowed})'
    clauses=["m.movement IN ('301','302','311','312')",f'({inside_src} OR {inside_tgt})'];args=[code,code]
    if depot:clauses.append('(m.dy=? OR m.target_dy=?)');args.extend([depot,depot])
    if plant:clauses.append('(m.plant=? OR m.target_plant=?)');args.extend([plant,plant])
    if query:clauses.append('(lower(m.material_code) LIKE ? OR lower(m.material_desc) LIKE ? OR lower(m.reservation) LIKE ?)');args.extend(['%'+query+'%']*3)
    fields={'materialCode':'m.material_code','materialDesc':'m.material_desc','reservationNo':'m.reservation','documentNo':'m.doc','unit':'m.uom','postingDate':'m.posting_date'}
    column_filters=column_filters if isinstance(column_filters,dict) else {}
    if len(column_filters)>8:raise ValueError('En fazla 8 sütun filtresi')
    for key,item in column_filters.items():
        if key not in fields or not isinstance(item,dict):raise ValueError('Desteklenmeyen sütun filtresi')
        op=str(item.get('op') or 'contains');value=str(item.get('value') or '')[:120].strip()
        if not value:continue
        if op=='contains':clauses.append('lower(COALESCE('+fields[key]+",'')) LIKE ?");args.append('%'+value.lower()+'%')
        elif op=='equals':clauses.append('lower(COALESCE('+fields[key]+",''))=?");args.append(value.lower())
        elif op in ('date_from','date_to') and key=='postingDate':
            import datetime as _dt
            try:_dt.date.fromisoformat(value)
            except ValueError:raise ValueError('Tarih YYYY-MM-DD olmalı')
            clauses.append(fields[key]+('>=?' if op=='date_from' else '<=?'));args.append(value)
        else:raise ValueError('Filtre karşılaştırması desteklenmiyor')

    # Repeated subqueries in CASE are bound separately; work_code is always validated.
    dkey=f'CASE WHEN {inside_tgt} AND NOT {inside_src} THEN m.target_dy ELSE m.dy END'
    factor=f'''CASE WHEN {inside_tgt} AND NOT {inside_src} THEN 1
       WHEN {inside_src} AND TRIM(COALESCE(m.target_dy,''))<>'' AND NOT {inside_tgt} THEN -1
       WHEN {inside_src} AND {inside_tgt} THEN 0 ELSE NULL END'''
    where=' AND '.join(clauses)
    # Six embedded work-code references in factor + two in dkey, plus two in WHERE.
    # Keep arguments in SQL textual appearance order.
    sql=f'''WITH events AS (SELECT m.plant plant,{dkey} depot,
      m.material_code materialCode,m.material_desc materialDesc,m.reservation reservationNo,
      COALESCE(NULLIF(TRIM(m.uom),''),'—') unit,m.doc documentNo,m.posting_date postingDate,
      CASE WHEN ({factor}) IS NULL THEN NULL ELSE ABS(m.qty)*({factor})*
      (CASE WHEN m.movement IN ('301','311') THEN 1 ELSE -1 END) END signedQty
      FROM mb51 m WHERE {where}), groups AS
      (SELECT plant,depot,materialCode,MAX(materialDesc) materialDesc,reservationNo,unit,
       ROUND(SUM(signedQty),3) signedQty,COUNT(DISTINCT documentNo) documentCount,
       COUNT(*) eventCount,SUM(CASE WHEN signedQty IS NULL THEN 1 ELSE 0 END) unknownCount,
       MAX(postingDate) lastPostingDate
       FROM events GROUP BY plant,depot,materialCode,reservationNo,unit)
       SELECT * FROM groups'''
    # dkey: tgt 1 + src 1; factor expanded twice, each 3*tgt +3*src = 6; where 2 => 16 code args.
    params=[code]*2+[code]*6+[code]*6+args
    with indexed_engine.connect(_active_index_db()) as c:
        total=c.execute('SELECT COUNT(*) FROM ('+sql+')',params).fetchone()[0]
        order_col={'materialCode':'materialCode','materialDesc':'materialDesc','reservationNo':'reservationNo','postingDate':'lastPostingDate','unit':'unit'}.get(sort_by,'lastPostingDate')
        direction='ASC' if str(sort_dir).lower()=='asc' else 'DESC'
        rows=[dict(r) for r in c.execute(sql+f' ORDER BY {order_col} {direction},materialCode,reservationNo LIMIT ? OFFSET ?',params+[size,(page-1)*size]).fetchall()]
    return {'rows':rows,'total':total,'page':page,'pages':max(1,(total+size-1)//size),'pageSize':size,
            'note':'Rezervasyon kalemi alanı MB51 indeksinde yoktur; grup depo/rezervasyon/malzeme/birim düzeyindedir. Net işaret algoritması değiştirilmedi.'}

# FIX26: paginated read-only BAKIM / KET / LED reports; no changes to SAP sources.
def worktype_report_snapshot(code,tab,depot='',query='',page=1,page_size=100,plant='',project_norm='',column_filters=None,sort_by='',sort_dir='asc'):
    code=str(code or '').upper().strip();tab=str(tab or '').lower().strip();depot=str(depot or '').strip();plant=str(plant or '').strip();query=str(query or '').strip().lower()
    if code not in ('B','K','L','T'):raise ValueError('Rapor iş türü BAKIM, KET, LED veya TESİS olmalıdır.')
    if tab not in ('money','material','diff','given','consumption','discovery'):raise ValueError('Geçersiz rapor sekmesi.')
    project_norm=str(project_norm or '').strip() if code=='T' else ''
    if project_norm and not depot:raise ValueError('TESİS proje filtresi için depo zorunludur.')
    page=max(1,int(page or 1));size=max(1,min(250,int(page_size or 100)))
    # FIX28Q: filters operate at database scope, before LIMIT/OFFSET. Identifiers are hard whitelisted.
    column_filters=column_filters if isinstance(column_filters,dict) else {}
    if len(column_filters)>8:raise ValueError('En fazla 8 sütun filtresi uygulanabilir.')
    sort_dir='DESC' if (str(sort_dir).lower()=='desc' or (not sort_by and tab in ('given','consumption'))) else 'ASC'
    def filter_expr(alias, cols):
        pieces=[];arguments=[]
        for key,rule in column_filters.items():
            field=cols.get(key)
            if not field:raise ValueError('Bu rapor için desteklenmeyen sütun filtresi: '+str(key))
            if not isinstance(rule,dict):raise ValueError('Geçersiz sütun filtresi')
            op=str(rule.get('op','contains'))
            val=str(rule.get('value','')).strip()[:120]
            if not val:continue
            if op=='contains':pieces.append(f"lower(COALESCE(CAST({alias}{field} AS TEXT),'')) LIKE ?");arguments.append('%'+val.lower()+'%')
            elif op=='equals':pieces.append(f"lower(COALESCE(CAST({alias}{field} AS TEXT),''))=?");arguments.append(val.lower())
            elif op in ('gt','lt','gte','lte'):
                try:v=float(val.replace(',','.'))
                except ValueError:raise ValueError('Sayısal filtre değeri geçersiz')
                if key not in ('discoveryQty','sourceGivenQty','differenceQty','rawQty'):raise ValueError('Bu sütun sayısal karşılaştırmayı desteklemiyor')
                operator={"gt":">","lt":"<","gte":">=","lte":"<="}[op]
                pieces.append(f"CAST({alias}{field} AS REAL) {operator} ?");arguments.append(v)
            elif op in ('date_from','date_to'):
                if key!='postingDate':raise ValueError('Tarih filtresi yalnız tarih alanına uygulanır')
                import datetime as _dt
                try:_dt.date.fromisoformat(val)
                except ValueError:raise ValueError('Tarih YYYY-MM-DD olmalıdır')
                pieces.append(f"{alias}{field} {'>=' if op=='date_from' else '<='} ?");arguments.append(val)
            else:raise ValueError('Filtre karşılaştırması geçersiz')
        return pieces,arguments

    where=['k.work_code=?'];params=[code]
    if depot:where.append('k.dy=?');params.append(depot)
    if project_norm:where.append('k.project_norm=?');params.append(project_norm)
    if plant:where.append('EXISTS (SELECT 1 FROM depots d WHERE d.dy=k.dy AND d.uy=?)');params.append(plant)
    if query:where.append("(lower(k.material_code) LIKE ? OR lower(k.material_desc) LIKE ? OR lower(k.dy) LIKE ?)");params.extend(['%'+query+'%']*3)
    rows=[];total=0;totals={};note='';monthlySpend=[]
    with indexed_engine.connect(_active_index_db()) as c:
        if tab in ('material','diff','money','discovery'):
            cond=' AND '.join(where)
            base=f'''SELECT k.dy depot,k.material_code materialCode,MAX(NULLIF(TRIM(k.material_desc),'')) materialDesc,MAX(k.uom) unit,
                         SUM(k.planned) discoveryQty,SUM(k.given) sourceGivenQty,SUM(k.remaining) sourceRemainingQty,
                         SUM(k.planned)-SUM(k.given) differenceQty,
                         SUM(CASE WHEN k.issue=1 THEN 1 ELSE 0 END) issues
                         {",k.project_norm projectNorm,MAX(k.project) projectName," if code=='T' else ''}
                         {"(SELECT MIN(p.project_id) FROM projects p WHERE p.dy=k.dy AND p.project_norm=k.project_norm) projectCode" if code=='T' else ",NULL projectCode"}
                    FROM kesif k WHERE {cond} GROUP BY k.dy,{"k.project_norm," if code=='T' else ''}k.material_code'''
            filter_cond=' WHERE differenceQty<>0' if tab=='diff' else ''
            subset=f'SELECT * FROM ({base}){filter_cond}'
            mapping={'materialCode':'materialCode','materialDesc':'materialDesc','depot':'depot','unit':'unit','discoveryQty':'discoveryQty','sourceGivenQty':'sourceGivenQty','differenceQty':'differenceQty'}
            if code=='T':mapping.update(projectCode='projectCode',projectName='projectName')
            pieces,extra=filter_expr('f.',mapping)
            if pieces:subset='SELECT * FROM ('+subset+') f WHERE '+' AND '.join(pieces)
            order_key=mapping.get(sort_by,'materialCode')
            total=c.execute('SELECT COUNT(*) n FROM ('+subset+')',params+extra).fetchone()['n']
            rows=[dict(r) for r in c.execute(subset+f' ORDER BY {order_key} {sort_dir}, depot,materialCode LIMIT ? OFFSET ?',params+extra+[size,(page-1)*size]).fetchall()]
            # FIX26D: missing discovery description falls back to authoritative material labels.
            # No arbitrary material code-to-name mapping is invented.
            for row in rows:
                if not str(row.get('materialDesc') or '').strip():
                    row['materialDesc']=_work_material_master().get(str(row['materialCode']),'')
                if not str(row.get('materialDesc') or '').strip():
                    row['materialDesc']=_work_material_master().get(str(row['materialCode']),'')
                if not str(row.get('materialDesc') or '').strip():
                    for table in ('mb52','mb51'):
                        found=c.execute(f"SELECT material_desc FROM {table} WHERE material_code=? AND TRIM(COALESCE(material_desc,''))<>'' ORDER BY id DESC LIMIT 1",(row['materialCode'],)).fetchone()
                        if found:
                            row['materialDesc']=found['material_desc'];break
                # Source-given and MB51-given are independent evidence (no double subtraction).
                if code=='T':
                    row['actualGivenQty']=None
                    row['mutabakat']='MB51 PROJE BAZINDA EŞLEŞTİRİLMEDİ'
                    continue
                actual=c.execute("""SELECT COUNT(*) n,SUM(CASE WHEN movement IN ('301','311') THEN ABS(qty)
                   WHEN movement IN ('302','312') THEN -ABS(qty) ELSE 0 END) v
                   FROM mb51 WHERE material_code=? AND movement IN ('301','302','311','312')
                   AND (target_dy=? OR (COALESCE(TRIM(target_dy),'')='' AND dy=?))""",
                   (row['materialCode'],row['depot'],row['depot'])).fetchone()
                row['actualGivenQty']=round(float(actual['v'] or 0),3) if int(actual['n'] or 0) else None
                row['mutabakat']='MB51 YOK / DOĞRULANMADI' if row['actualGivenQty'] is None else 'KAYNAK-MB51 UYUMLU' if abs(row['actualGivenQty']-float(row.get('sourceGivenQty') or 0))<0.00001 else 'KAYNAK-MB51 FARKI'
            if tab=='money':
                # Material-level pricing: only YENİ valuation type; never infer a missing price as zero.
                for row in rows:
                    # Official price order: source plant+material NEW weighted average, then global weighted average.
                    dp=c.execute("SELECT DISTINCT uy FROM depots WHERE dy=? AND uy<>'' LIMIT 2",(row['depot'],)).fetchall()
                    plants=[str(x['uy']) for x in dp]
                    price=None;price_source='FİYAT BULUNAMADI'
                    if len(plants)==1:
                        price=c.execute('''SELECT SUM(total_value) val,SUM(qty) qty FROM mb52
                            WHERE plant=? AND material_code=? AND upper(valuation_type) IN ('YENİ','YENI') AND qty>0''',(plants[0],row['materialCode'])).fetchone()
                        if float(price['qty'] or 0)>0:price_source='MB52 YENİ / ÜY + MALZEME AĞIRLIKLI ORTALAMA'
                    if price_source=='FİYAT BULUNAMADI':
                        price=c.execute('''SELECT SUM(total_value) val,SUM(qty) qty FROM mb52
                            WHERE material_code=? AND upper(valuation_type) IN ('YENİ','YENI') AND qty>0''',(row['materialCode'],)).fetchone()
                        if float(price['qty'] or 0)>0:price_source='MB52 YENİ / GLOBAL YEDEK AĞIRLIKLI ORTALAMA'
                    qty=float(price['qty'] or 0) if price else 0
                    unit_price=float(price['val'] or 0)/qty if qty>0 else None
                    row['unitPrice']=unit_price;row['priceSource']=price_source
                    for amount,quantity in [('discoveryAmount','discoveryQty'),('givenAmount','sourceGivenQty'),('differenceAmount','differenceQty')]:
                        row[amount]=(round(float(row[quantity] or 0)*unit_price,2) if unit_price is not None else None)
                    row['actualGivenAmount']=(round(row['actualGivenQty']*unit_price,2) if row['actualGivenQty'] is not None and unit_price is not None else None)
                note=('TESİS parasal keşif proje bazındadır; MB51 fiili verilen proje bazında doğrulanmadığı için boş gösterilir. ' if code=='T' else '')+'Parasal alanlar yalnız fiyatı bulunan satırlarda hesaplanır. ÜY + malzeme fiyatı önceliklidir, bulunamazsa global fiyat kullanılır; fiyatı olmayan malzeme toplamda 0 kabul edilmez.'
            else:note=('TESİS proje keşfi ve kaynak verilen miktarı proje bazındadır. MB51 fiili verilen miktarı doğrulanmış proje bağı olmadığından projelere paylaştırılmaz; depo MB51 hareketleri ayrı sekmededir.' if code=='T' else 'Kaynak Verilen keşif dosyasından gelir; MB51 fiili verilen ayrı gösterilir ve iki kez düşülmez. Fark = keşif - kaynak verilen; fiiliyle uyuşmayan kalemleri mutabakata alın.')
        else:
            # A MB51 depot movement has no proven project allocation in this index.
            # Never show whole-depot movements as if they belonged to the selected project.
            if code=='T' and project_norm:
                note='Seçili TESİS projesine özgü MB51 hareketleri doğrulanmış proje bağı bulunmadığı için gösterilmez. Depo bazında tüm hareketleri görmek için Proje filtresini Tüm Projeler yapın.'
                return {'workCode':code,'tab':tab,'rows':[],'monthlySpend':[],
                        'filters':{'plant':plant,'depot':depot,'projectNorm':project_norm,'query':query},
                        'page':1,'pageSize':size,'total':0,'pages':1,'note':note,'pricingMissing':0}
            # Draw depot scope from the maintained kesif work code; non-associated MB51 rows are excluded.
            allowed="SELECT DISTINCT dy FROM kesif WHERE work_code=? AND dy<>''"
            moves=['301','302','311','312'] if tab=='given' else ['221','222','Z22']
            marks=','.join('?'*len(moves));where_m=[f"m.movement IN ({marks})",f'(m.dy IN ({allowed}) OR m.target_dy IN ({allowed}))' if tab=='given' else f'm.dy IN ({allowed})']
            args=moves+([code,code] if tab=='given' else [code])
            if depot:where_m.append('(m.dy=? OR m.target_dy=?)');args.extend([depot,depot])
            if plant:where_m.append('(m.plant=? OR m.target_plant=?)');args.extend([plant,plant])
            if query:where_m.append('(lower(m.material_code) LIKE ? OR lower(m.material_desc) LIKE ? OR lower(m.reservation) LIKE ? OR lower(m.doc) LIKE ?)');args.extend(['%'+query+'%']*4)
            mapping={'materialCode':'m.material_code','materialDesc':'m.material_desc','reservationNo':'m.reservation','documentNo':'m.doc','postingDate':'m.posting_date','unit':'m.uom','sourceDepot':'m.dy','targetDepot':'m.target_dy','rawQty':'m.qty','movement':'m.movement'}
            pieces,extra=filter_expr('',mapping)
            if pieces:where_m.extend(pieces);args.extend(extra)
            wc=' AND '.join(where_m)
            base=f'''FROM mb51 m WHERE {wc}'''
            order_key=mapping.get(sort_by,'m.posting_date')
            total=c.execute('SELECT COUNT(*) n '+base,args).fetchone()['n']
            rows=[dict(r) for r in c.execute(f'''SELECT m.doc documentNo,m.posting_date postingDate,m.movement movement,
                   m.material_code materialCode,m.material_desc materialDesc,m.qty rawQty,m.uom unit,m.plant plant,
                   m.dy sourceDepot,m.target_dy targetDepot,m.reservation reservationNo,m.amount_upb amount
                   {base} ORDER BY {order_key} {sort_dir},m.id DESC LIMIT ? OFFSET ?''',args+[size,(page-1)*size]).fetchall()]
            work_depots={str(x['dy']) for x in c.execute(allowed,(code,)).fetchall()}
            for r in rows:
                mv=r['movement'];qty=abs(float(r['rawQty'] or 0))
                if tab=='given':
                    src=str(r['sourceDepot'] or '');dest=str(r['targetDepot'] or '')
                    if dest in work_depots and src not in work_depots:factor=1;r['movementDirection']='DEPOYA GİRİŞ'
                    elif src in work_depots and dest and dest not in work_depots:factor=-1;r['movementDirection']='DEPODAN ÇIKIŞ'
                    elif src in work_depots and dest in work_depots:factor=0;r['movementDirection']='İÇ NAKİL'
                    else:factor=None;r['movementDirection']='HEDEF DEPO EKSİK / YÖN DOĞRULANMADI'
                    r['signedQty']=round(qty*factor*(1 if mv in ('301','311') else -1),3) if factor is not None else None
                else:r['signedQty']=round(qty if mv in ('221','Z22') else -qty,3)
            for row in rows:
                if not str(row.get('materialDesc') or '').strip():
                    for table in ('mb52','mb51'):
                        found=c.execute(f"SELECT material_desc FROM {table} WHERE material_code=? AND TRIM(COALESCE(material_desc,''))<>'' ORDER BY id DESC LIMIT 1",(row['materialCode'],)).fetchone()
                        if found:row['materialDesc']=found['material_desc'];break
            if tab=='consumption':
                sql="""SELECT substr(m.posting_date,1,7) month,
                  SUM(CASE WHEN m.movement='221' THEN ABS(COALESCE(m.amount_upb,0)) ELSE 0 END) amount221,
                  SUM(CASE WHEN m.movement='222' THEN -ABS(COALESCE(m.amount_upb,0)) ELSE 0 END) amount222,
                  SUM(CASE WHEN m.movement='Z22' THEN ABS(COALESCE(m.amount_upb,0)) ELSE 0 END) amountZ22,
                  SUM(CASE WHEN m.movement='222' THEN -ABS(COALESCE(m.amount_upb,0)) ELSE ABS(COALESCE(m.amount_upb,0)) END) netAmount,
                  COUNT(*) events """ + base + ' GROUP BY substr(m.posting_date,1,7) ORDER BY month DESC'
                monthlySpend=[dict(r) for r in c.execute(sql,args).fetchall()]
            note='MB51 net hareket detayı; verilen sekmesinde kaynak/hedef depo yönü ayrıca gösterilir ve hedef depo bilinmeyen satırın net miktarı doğrulanmış kabul edilmez. Tüketim: 221/Z22 pozitif, 222 ters etki.'
    return {'workCode':code,'tab':tab,'rows':rows,'monthlySpend':monthlySpend,'filters':{'plant':plant,'depot':depot,'projectNorm':project_norm,'query':query},'page':page,'pageSize':size,'total':total,'pages':max(1,(total+size-1)//size),'note':note,'pricingMissing':sum(1 for r in rows if tab=='money' and r.get('unitPrice') is None)}


# FIX28O: read-only net monthly consumption quantities by unit and material.
# Canonical SAP sources and approved published datasets are never modified here.
def worktype_monthly_consumption(code,year,plant='',depot='',query=''):
    code=str(code or '').upper().strip();year=str(year or '').strip()
    plant=str(plant or '').strip();depot=str(depot or '').strip();query=str(query or '').strip().lower()
    if code not in ('B','K','L'):raise ValueError('Geçersiz iş türü.')
    if not (len(year)==4 and year.isdigit() and 2000<=int(year)<=2100):raise ValueError('Yıl YYYY olmalıdır.')
    conditions=["m.movement IN ('221','222','Z22')", 'm.posting_date >= ?', 'm.posting_date < ?',
       "m.dy IN (SELECT DISTINCT dy FROM kesif WHERE work_code=? AND dy<>'')"]
    args=[year+'-01-01',str(int(year)+1)+'-01-01',code]
    if plant: conditions.append('m.plant=?');args.append(plant)
    if depot: conditions.append('m.dy=?');args.append(depot)
    if query:
        conditions.append('(lower(m.material_code) LIKE ? OR lower(m.material_desc) LIKE ?)')
        args.extend(['%'+query+'%']*2)
    where=' AND '.join(conditions)
    # Each unit remains separate. 221 and Z22 are positive, 222 reverses.
    # These movement rules match the existing FIX28N consumption reporting.
    sql=f'''SELECT substr(m.posting_date,1,7) month,
      m.material_code materialCode,MAX(NULLIF(TRIM(m.material_desc),'')) materialDesc,
      COALESCE(NULLIF(TRIM(m.uom),''),'Birim Belirsiz') unit,
      ROUND(SUM(CASE WHEN m.movement='222' THEN -ABS(m.qty)
                     ELSE ABS(m.qty) END),3) qty,
      COUNT(*) events
      FROM mb51 m WHERE {where}
      GROUP BY substr(m.posting_date,1,7),m.material_code,COALESCE(NULLIF(TRIM(m.uom),''),'Birim Belirsiz')
      ORDER BY month,materialCode,unit'''
    with indexed_engine.connect(_active_index_db()) as c:
        rows=[dict(x) for x in c.execute(sql,args).fetchall()]
    # No apparent total across units; negative net totals are retained.
    monthly={f'{year}-{i:02d}':{'units':{},'materialCount':0,'events':0} for i in range(1,13)}
    material_master=_work_material_master()
    for row in rows:
        code_key=str(row['month'])
        if code_key not in monthly:continue
        if not row.get('materialDesc'): row['materialDesc']=material_master.get(str(row.get('materialCode') or ''),'')
        rec=monthly[code_key];unit=str(row['unit'] or 'Birim Belirsiz')
        rec['units'][unit]=round(rec['units'].get(unit,0)+float(row['qty'] or 0),3)
        rec['materialCount']+=1;rec['events']+=int(row['events'] or 0)
    return {'workCode':code,'year':year,'plant':plant,'depot':depot,'months':monthly,'rows':rows,
            'note':'MB51 kayıt tarihine göre 221/Z22 pozitif ve 222 ters net miktardır; farklı birimler toplanmaz. Kaynak/veri güncelliği ayrıca doğrulanmalıdır.'}

PROJECT_STATUS_PATH = APP_DIR/'data_v2'/'07_AUDIT'/'tesis_project_status.json'
PROJECT_STATUS_VALUES = ('AKTIF','TAMAMLANDI','IPTAL','REVIZE')

def load_project_status_state():
    data=_json_load(PROJECT_STATUS_PATH,{'projects':{},'events':[]})
    if not isinstance(data,dict):data={'projects':{},'events':[]}
    data.setdefault('projects',{});data.setdefault('events',[]);return data

def project_key(depot,code,name=''):
    return f"{str(depot or '').strip()}|{str(code or '').strip()}|{str(name or '').strip()}"

def project_lifecycle_snapshot():
    data=load_project_status_state();return {'items':list(data.get('projects',{}).values()),'events':list(reversed(data.get('events',[])))[:500]}

def update_project_lifecycle(payload,actor='DATA_MANAGER'):
    depot=str(payload.get('depot') or '').strip();code=str(payload.get('projectCode') or '').strip();name=str(payload.get('projectName') or '').strip();status=str(payload.get('status') or '').upper().strip();reason=str(payload.get('reason') or '').strip()
    if not depot or not (code or name):raise ValueError('Depo ve proje bilgisi gereklidir.')
    if status not in PROJECT_STATUS_VALUES:raise ValueError('Geçersiz proje durumu.')
    if status in ('IPTAL','REVIZE') and not reason:raise ValueError('İptal/Revize işlemlerinde açıklama zorunludur.')
    data=load_project_status_state();canonical=project_key(depot,code,name);existing_key=canonical
    if canonical not in data['projects']:
        for ek,ex in list(data['projects'].items()):
            ed=str(ex.get('depot') or '');ec=str(ex.get('projectCode') or '').strip();en=str(ex.get('projectName') or '').strip()
            if depot not in ed:continue
            if (code and ec==code) or (name and en==name):existing_key=ek;break
    base=data['projects'].get(existing_key) or {};old=base.get('status') or 'AKTIF';now=datetime.now().astimezone().isoformat()
    def same_project_event(e):
        ed=str(e.get('depot') or '');ec=str(e.get('projectCode') or '').strip();en=str(e.get('projectName') or '').strip()
        return depot in ed and ((code and ec==code) or (name and en==name))
    rev=sum(1 for e in data['events'] if same_project_event(e))+1
    item={'key':canonical,'depot':depot,'projectCode':code,'projectName':name,'status':status,'reason':reason,'revision':rev,'updatedAt':now,'updatedBy':actor}
    if existing_key!=canonical:data['projects'].pop(existing_key,None)
    data['projects'][canonical]=item;event={**item,'previousStatus':old,'previousKey':existing_key if existing_key!=canonical else ''};data['events'].append(event);_json_save(PROJECT_STATUS_PATH,data)
    DATA_ARCH_V2.audit('PROJECT','PROJECT_STATUS_CHANGED',actor,'TESIS_PROJECT',canonical,event)
    nd=_notif_state();_notif_upsert(nd,'PROJECT-CHANGE-'+hashlib.sha1(canonical.encode('utf-8')).hexdigest()[:12],f'TESİS proje durumu değişti: {status}',f'{depot} • {name or code} projesi {old} durumundan {status} durumuna geçti.','WARNING' if status in ('IPTAL','REVIZE') else 'INFO','PROJE',{'depot':depot,'projectCode':code,'projectName':name,'previousStatus':old,'status':status,'reason':reason},[{'label':'TESİS ekranına git','action':'OPEN_TESIS','depot':depot}]);_save_notif_state(nd)
    return item

def operations_archive_snapshot(months=36):
    try:ops=indexed_engine.operations_metrics(_active_index_db(),'',months,[])
    except Exception:ops={'monthlySpend':[],'monthlyByDepot':[],'currentMonthByDepot':[]}
    life=project_lifecycle_snapshot();records=control_records_snapshot('', '', '', 1, 500)
    return {'monthlySpend':ops.get('monthlySpend') or [],'monthlyByDepot':ops.get('monthlyByDepot') or [],'projectEvents':life.get('events') or [],'controls':records.get('items') or [],'note':'Arşiv görünümü salt okunurdur; depo bazlı harcama, proje durum olayları ve kontrol kayıtları fiziksel olarak silinmez.'}


CLIENT_LOCK = threading.Lock()
CLIENT_STATE = {'seen': False, 'last': 0.0, 'close_requested': None}
# Browser background timer throttling must never terminate the local service.
# The service now closes only after an explicit client-close signal.
CLOSE_GRACE_SECONDS = 30.0

def mark_client_alive():
    now = time.monotonic()
    with CLIENT_LOCK:
        CLIENT_STATE['seen'] = True
        CLIENT_STATE['last'] = now
        CLIENT_STATE['close_requested'] = None

def mark_client_close():
    now = time.monotonic()
    with CLIENT_LOCK:
        CLIENT_STATE['seen'] = True
        CLIENT_STATE['close_requested'] = now

def client_watchdog(httpd):
    while True:
        time.sleep(1.0)
        now = time.monotonic()
        with CLIENT_LOCK:
            seen = CLIENT_STATE['seen']
            last = CLIENT_STATE['last']
            close_at = CLIENT_STATE['close_requested']
        if not seen:
            continue
        should_close = False
        if close_at is not None and last <= close_at and now - close_at >= CLOSE_GRACE_SECONDS:
            should_close = True
        if should_close:
            try:
                httpd.shutdown()
            except Exception:
                pass
            return



# -------------------- V3.12 Parquet + indeksli veri motoru --------------------
_ENGINE_BUILD_STATE={'building':False,'startedAt':'','finishedAt':'','error':''}
_ENGINE_BUILD_STATE_LOCK=threading.RLock()

def _engine_build_state():
    with _ENGINE_BUILD_STATE_LOCK:
        return dict(_ENGINE_BUILD_STATE)

def _start_engine_rebuild_background(sources):
    # Veri Yenile butonu buyuk CSV/Parquet rebuild'ini beklemez. Tek bir
    # arka plan build'i calisir; mevcut saglikli indeks build tamamlanana kadar
    # sorgulara hizmet vermeye devam eder.
    with _ENGINE_BUILD_STATE_LOCK:
        if _ENGINE_BUILD_STATE.get('building'):
            return False
        _ENGINE_BUILD_STATE.update({'building':True,'startedAt':time.strftime('%Y-%m-%dT%H:%M:%S'),'finishedAt':'','error':''})
    snap=sources
    def worker():
        try:
            _rebuild_engine(snap)
            err=''
        except Exception as exc:
            err=str(exc)
        finally:
            with _ENGINE_BUILD_STATE_LOCK:
                _ENGINE_BUILD_STATE.update({'building':False,'finishedAt':time.strftime('%Y-%m-%dT%H:%M:%S'),'error':err})
    threading.Thread(target=worker,name='talep-engine-rebuild',daemon=True).start()
    return True

def _active_index_db():
    return indexed_engine.active_index_db(APP_DIR)

def _engine_snapshot(sources=None):
    global _ENGINE_LAST_ERROR
    if sources is None:
        _,sources,_=source_snapshot_cached(force=False)
    try:
        state=indexed_engine.active_build_state(APP_DIR,sources or {})
        build_state=_engine_build_state()
        if build_state.get('building') and not state.get('sourceIndexMatch'):
            state['status']='REBUILDING'
        elif build_state.get('error') and not state.get('ready'):
            state['status']='FAILED'
        idx=Path(state.get('indexDb') or _active_index_db())
        quality=indexed_engine.quality_summary(idx) if state.get('usable') else {'level':'CRITICAL','critical':1,'warning':0,'findingTypes':1,'findings':[]}
        return {
            **state,
            'engine':'PARQUET_SQLITE_INDEX',
            'indexExists':idx.exists(),
            'manifestExists':bool(state.get('manifestPath') and Path(state.get('manifestPath')).exists()),
            'lastError':_ENGINE_LAST_ERROR,
            'quality':quality,
            **build_state,
        }
    except Exception as exc:
        _ENGINE_LAST_ERROR=str(exc)
        return {'ready':False,'usable':False,'status':'FAILED','engine':'PARQUET_SQLITE_INDEX','indexDb':str(_active_index_db()),'indexExists':_active_index_db().exists(),'manifestExists':False,'parquetRoot':str(PARQUET_ROOT),'sourceDigest':'','indexSourceDigest':'','sourceIndexMatch':False,'lastError':str(exc),**_engine_build_state()}


def _rebuild_engine(sources=None):
    global _ENGINE_LAST_ERROR,_ENGINE_LAST_BUILD
    with _ENGINE_BUILD_LOCK:
        if sources is None:
            _,sources,missing=source_snapshot_cached(force=True)
            if missing:
                raise RuntimeError('Eksik kaynak bulundu: '+', '.join(missing))
        try:
            result=indexed_engine.build_engine(APP_DIR,sources or {},build_parquet=True)
            _ENGINE_LAST_BUILD=result
            _ENGINE_LAST_ERROR=''
            try:
                state=indexed_engine.active_build_state(APP_DIR,sources or {})
                DATA_ARCH_V2.record_index_build({**state,'status':'ACTIVE','startedAt':time.strftime('%Y-%m-%dT%H:%M:%S',time.localtime(result.get('started_at') or time.time())),'finishedAt':time.strftime('%Y-%m-%dT%H:%M:%S')})
                DATA_ARCH_V2.audit('INDEX','ACTIVE_SWITCH','SYSTEM','INDEX_BUILD',state.get('buildId',''),{'sourceDigest':state.get('sourceDigest'),'quality':state.get('quality')})
            except Exception:
                pass
            # Eski RAM önbellekleri yeni indeksle karışmasın.
            with _FAST_CACHE_LOCK:
                _FAST_CACHE.clear()
            with _KESIF_CONTEXT_LOCK:
                _KESIF_CONTEXT_CACHE.clear()
            return result
        except Exception as exc:
            _ENGINE_LAST_ERROR=str(exc)
            raise


def _engine_ready_now(sources=None):
    # Yeni kaynak build edilirken mevcut doğrulanmış ACTIVE indeks sorgulara hizmet etmeye devam eder.
    return bool(_engine_snapshot(sources).get('usable'))

# -------------------- V3.11 hızlı veri motoru --------------------
# CSV dosyaları kaynak olmaya devam eder. Büyük tablolar tarayıcıya komple
# gönderilmez; Python servisi satırları bir kez normalize eder ve ekranlara
# filtrelenmiş/sayfalanmış sonuç döndürür.
_FAST_CACHE = {}
_FAST_CACHE_LOCK = threading.RLock()
_BOOK_CACHE = {}
_BOOK_CACHE_LOCK = threading.RLock()

def _source_info(source):
    cfg,sources,_=source_snapshot_cached(force=False)
    return (sources or {}).get(source)

def _source_fingerprint(source):
    info=_source_info(source) or {}
    files=info.get('files') or []
    return '|'.join(f"{x.get('path','')}:{x.get('size',0)}:{x.get('lastModified',0)}:{x.get('role','')}" for x in files)

def _open_public_csv(file_info):
    path=Path(file_info['path'])
    with path.open('rb') as fh: raw_sample=fh.read(262144)
    enc=_detect_encoding_bytes(raw_sample)
    return path.open('r',encoding=enc,errors='replace',newline='')

def _source_book_fast(source):
    fp=_source_fingerprint(source); cache_key=(source,fp)
    with _BOOK_CACHE_LOCK:
        if cache_key in _BOOK_CACHE:return _BOOK_CACHE[cache_key]
    info=_source_info(source)
    if not info: raise FileNotFoundError(f'{source} CSV kaynağı bulunamadı')
    book={}
    for idx,f in enumerate(info.get('files') or []):
        rows=[]
        with _open_public_csv(f) as fh:
            reader=csv.reader(fh,delimiter=f.get('delimiter') or ';')
            start=max(0,int(f.get('headerRow') or 0))
            for i,row in enumerate(reader):
                if i<start: continue
                if any(str(v or '').strip() for v in row): rows.append(row)
        name=str(f.get('sheet') or f.get('role') or source or f'CSV_{idx+1}')
        base=name; n=2
        while name in book:
            name=f'{base}__{n}'; n+=1
        book[name]=rows
    with _BOOK_CACHE_LOCK:
        # Aynı kaynak için eski fingerprint cache'lerini temizle.
        for k in list(_BOOK_CACHE):
            if k[0]==source and k!=cache_key:_BOOK_CACHE.pop(k,None)
        _BOOK_CACHE[cache_key]=book
    return book

_KESIF_CONTEXT_CACHE = {}
_KESIF_CONTEXT_LOCK = threading.RLock()


def _kesif_context_rows(dy, materials):
    dy=str(dy or '').strip()
    material_set={str(x or '').strip() for x in (materials or []) if str(x or '').strip()}
    if not dy or not material_set:return []
    if _engine_ready_now():
        return indexed_engine.kesif_context(_active_index_db(),dy,sorted(material_set))
    fp=_source_fingerprint('KESIFLER')
    cache_key=(fp,dy,tuple(sorted(material_set)))
    with _KESIF_CONTEXT_LOCK:
        cached=_KESIF_CONTEXT_CACHE.get(cache_key)
        if cached is not None:return cached
    info=_source_info('KESIFLER')
    if not info:raise FileNotFoundError('KESIFLER CSV kaynağı bulunamadı')
    agg={}
    for f in info.get('files') or []:
        role=str(f.get('role') or '').upper()
        code=role if role in ('T','K','B','L') else ''
        with _open_public_csv(f) as fh:
            reader=csv.reader(fh,delimiter=f.get('delimiter') or ';')
            start=max(0,int(f.get('headerRow') or 0));headers=None;idx={}
            for i,row in enumerate(reader):
                if i<start:continue
                if headers is None:
                    headers=row
                    idx={g:_idx_for(headers,g) for g in ('depot_code','storage','material','project_name','planned','given','group_no','group_desc','company','work_type')}
                    continue
                if not any(str(v or '').strip() for v in row):continue
                row_dy=str(_cell(row,idx.get('depot_code',-1)) or _cell(row,idx.get('storage',-1))).strip()
                if row_dy!=dy:continue
                mat=str(_cell(row,idx.get('material',-1))).strip()
                if mat not in material_set:continue
                row_code=code or _work_code(_cell(row,idx.get('work_type',-1)))
                if row_code not in ('T','K','B','L'):continue
                project=str(_cell(row,idx.get('project_name',-1))).strip() if row_code=='T' else ''
                k=(row_code,row_dy,project,mat) if row_code=='T' else (row_code,row_dy,'',mat)
                a=agg.setdefault(k,{'workCode':row_code,'dy':row_dy,'projectName':project,'materialCode':mat,'planned':0.0,'given':0.0,'rowCount':0,'groupNo':'','groupDesc':'','contractor':''})
                a['planned']+=_number(_cell(row,idx.get('planned',-1)))
                a['given']+=_number(_cell(row,idx.get('given',-1)))
                a['rowCount']+=1
                if not a['groupNo']:a['groupNo']=str(_cell(row,idx.get('group_no',-1))).strip()
                if not a['groupDesc']:a['groupDesc']=str(_cell(row,idx.get('group_desc',-1))).strip()
                if not a['contractor']:a['contractor']=str(_cell(row,idx.get('company',-1))).strip()
    rows=[]
    for a in agg.values():
        a['remaining']=a['planned']-a['given']
        rows.append(a)
    rows.sort(key=lambda x:(x['workCode'],x['dy'],x['projectName'].casefold(),x['materialCode']))
    with _KESIF_CONTEXT_LOCK:
        # Eski kaynak sürümüne ait context önbelleğini temizle.
        for k in list(_KESIF_CONTEXT_CACHE):
            if k[0]!=fp:_KESIF_CONTEXT_CACHE.pop(k,None)
        _KESIF_CONTEXT_CACHE[cache_key]=rows
    return rows


def _idx_for(headers, group):
    aliases=FIELD_ALIASES.get(group,set())
    for i,h in enumerate(headers):
        if _norm_header(h) in aliases:return i
    return -1

def _cell(row, idx):
    return row[idx] if idx>=0 and idx<len(row) else ''

def _number(v):
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
    except Exception:return 0.0

def _norm_search(v):
    return _norm_header(v)

def _normalized_rows(source):
    fp=_source_fingerprint(source); key=('rows',source,fp)
    with _FAST_CACHE_LOCK:
        if key in _FAST_CACHE:return _FAST_CACHE[key]
    info=_source_info(source)
    if not info: raise FileNotFoundError(f'{source} CSV kaynağı bulunamadı')
    out=[]
    for f in info.get('files') or []:
        with _open_public_csv(f) as fh:
            reader=csv.reader(fh,delimiter=f.get('delimiter') or ';')
            start=max(0,int(f.get('headerRow') or 0)); headers=None; indexes={}
            for i,row in enumerate(reader):
                if i<start:continue
                if headers is None:
                    headers=row
                    wanted=('material_doc','doc_date','movement','material','material_desc','material_group','material_group_desc','qty','uom','plant','storage','storage_desc','reservation','total_value','unrestricted','unrestricted_value','valuation_type','guarantee_main','guarantee_cash','guarantee_manual','z98_stock_value','z98_available','depot_code','group_no','group_desc','company','project_name','planned','given','remaining','work_type')
                    indexes={g:_idx_for(headers,g) for g in wanted}
                    if source=='ZMM098':
                        preferred=_norm_header('Rez.Yapılabilir Tutar (Açık Rez.Dahil)')
                        for j,h in enumerate(headers):
                            if _norm_header(h)==preferred:indexes['z98_available']=j;break
                    continue
                if not any(str(v or '').strip() for v in row):continue
                if source=='MB51':
                    d={'doc':str(_cell(row,indexes['material_doc'])).strip(),'date':str(_cell(row,indexes['doc_date'])).strip(),'movement':str(_cell(row,indexes['movement'])).strip(),'materialCode':str(_cell(row,indexes['material'])).strip(),'materialDesc':str(_cell(row,indexes['material_desc'])).strip(),'materialGroup':str(_cell(row,indexes['material_group'])).strip(),'materialGroupDesc':str(_cell(row,indexes['material_group_desc'])).strip(),'qty':_number(_cell(row,indexes['qty'])),'uom':str(_cell(row,indexes['uom'])).strip(),'plant':str(_cell(row,indexes['plant'])).strip(),'dy':str(_cell(row,indexes['storage'])).strip(),'reservation':str(_cell(row,indexes['reservation'])).strip()}
                    if d['materialCode'] or d['doc']:out.append(d)
                elif source=='MB52':
                    q=_number(_cell(row,indexes['unrestricted'])); tv=_number(_cell(row,indexes['total_value']))
                    d={'plant':str(_cell(row,indexes['plant'])).strip(),'dy':str(_cell(row,indexes['storage'])).strip(),'dyDesc':str(_cell(row,indexes['storage_desc'])).strip(),'materialGroup':str(_cell(row,indexes['material_group'])).strip(),'materialGroupDesc':str(_cell(row,indexes['material_group_desc'])).strip(),'materialCode':str(_cell(row,indexes['material'])).strip(),'materialDesc':str(_cell(row,indexes['material_desc'])).strip(),'qty':q,'uom':str(_cell(row,indexes['uom'])).strip(),'totalValue':tv,'valuationType':str(_cell(row,indexes['valuation_type'])).strip()}
                    if d['materialCode'] and d['dy']:out.append(d)
                elif source=='ZMM098':
                    d={'uy':str(_cell(row,indexes['plant'])).strip(),'dy':str(_cell(row,indexes['storage'])).strip(),'dyDesc':str(_cell(row,indexes['storage_desc'])).strip(),'main':_number(_cell(row,indexes['guarantee_main'])),'cash':_number(_cell(row,indexes['guarantee_cash'])),'manual':_number(_cell(row,indexes['guarantee_manual'])),'stockValue':_number(_cell(row,indexes['z98_stock_value'])),'available':_number(_cell(row,indexes['z98_available']))}
                    if d['uy'] and d['dy']:out.append(d)
                elif source=='KESIFLER':
                    role=str(f.get('role') or '')
                    code=role if role in ('T','K','B','L') else _work_code(_cell(row,indexes['work_type']))
                    d={'workCode':code,'sheet':str(f.get('sheet') or role or 'KESIFLER'),'rowNo':i+1,'dy':str(_cell(row,indexes['depot_code'])).strip() or str(_cell(row,indexes['storage'])).strip(),'groupNo':str(_cell(row,indexes['group_no'])).strip(),'groupDesc':str(_cell(row,indexes['group_desc'])).strip(),'contractor':str(_cell(row,indexes['company'])).strip(),'project':str(_cell(row,indexes['project_name'])).strip(),'materialCode':str(_cell(row,indexes['material'])).strip(),'materialDesc':str(_cell(row,indexes['material_desc'])).strip(),'uom':str(_cell(row,indexes['uom'])).strip(),'planned':_number(_cell(row,indexes['planned'])),'given':_number(_cell(row,indexes['given'])),'remaining':_number(_cell(row,indexes['remaining']))}
                    if d['materialCode']:out.append(d)
    # Arama metnini bir kez üret; her tuş vuruşunda tekrar normalize etme.
    if source=='MB51':
        for d in out:d['_s']=_norm_search(' '.join(str(d.get(x,'')) for x in ('doc','date','movement','materialCode','materialDesc','materialGroup','materialGroupDesc','plant','dy','reservation')))
    elif source=='MB52':
        for d in out:d['_s']=_norm_search(' '.join(str(d.get(x,'')) for x in ('plant','dy','dyDesc','materialGroup','materialGroupDesc','materialCode','materialDesc','valuationType')))
    elif source=='ZMM098':
        for d in out:d['_s']=_norm_search(' '.join(str(d.get(x,'')) for x in ('uy','dy','dyDesc')))
    elif source=='KESIFLER':
        for d in out:d['_s']=_norm_search(' '.join(str(d.get(x,'')) for x in ('dy','groupNo','groupDesc','contractor','project','materialCode','materialDesc')))
    with _FAST_CACHE_LOCK:
        for k in list(_FAST_CACHE):
            if len(k)>=3 and k[0]=='rows' and k[1]==source and k!=key:_FAST_CACHE.pop(k,None)
        _FAST_CACHE[key]=out
    return out

def _mb51_scope():
    fp=_source_fingerprint('MB51');key=('scope','MB51',fp)
    with _FAST_CACHE_LOCK:
        if key in _FAST_CACHE:return _FAST_CACHE[key]
    rows=_normalized_rows('MB51');depots=set();pairs=set();group_by_material={}
    for r in rows:
        plant=str(r.get('plant') or '');dy=str(r.get('dy') or '')
        if dy:depots.add((plant,dy));depots.add(('',dy))
        token=str(r.get('materialGroup') or '').strip() or _norm_header(r.get('materialGroupDesc') or '')
        mc=str(r.get('materialCode') or '')
        if mc and token and mc not in group_by_material:group_by_material[mc]=(str(r.get('materialGroup') or ''),str(r.get('materialGroupDesc') or ''),token)
        if dy and token:pairs.add((plant,dy,token));pairs.add(('',dy,token))
    value={'depots':depots,'pairs':pairs,'groupByMaterial':group_by_material,'hasGroups':bool(pairs),'count':len(rows)}
    with _FAST_CACHE_LOCK:_FAST_CACHE[key]=value
    return value

def _paged(items,page,page_size):
    total=len(items);page_size=max(25,min(500,int(page_size or 100)));pages=max(1,(total+page_size-1)//page_size);page=max(1,min(int(page or 1),pages));start=(page-1)*page_size
    return items[start:start+page_size],total,page,pages,page_size

def _grid_snapshot(view,query):
    q=_norm_search(query.get('q',''));page=int(query.get('page',1) or 1);size=int(query.get('pageSize',100) or 100)
    cols=json.loads(query.get('columnFilters') or '{}');sort_by=query.get('sortBy','');sort_dir=query.get('sortDir','asc')
    if _engine_ready_now():
        rawq=str(query.get('q','') or '')
        if view=='movements':return indexed_engine.grid_movements(_active_index_db(),rawq,page,size,cols,sort_by,sort_dir)
        if view=='guarantee':return indexed_engine.grid_guarantee(_active_index_db(),rawq,page,size,cols,sort_by,sort_dir)
        if view=='stocks':return indexed_engine.grid_stocks(_active_index_db(),rawq,page,size,str(query.get('scope') or 'mb51_group'),cols,sort_by,sort_dir)
        if view=='kesif':return indexed_engine.grid_kesif(_active_index_db(),rawq,page,size,str(query.get('type') or 'T'),str(query.get('status') or ''),str(query.get('depot') or ''),cols,sort_by,sort_dir)
    if cols or sort_by:
        raise ValueError('Tüm veri üzerinde sütun filtresi için SQLite indeksi hazır olmalı; indeks oluşturulmadan eksik filtre uygulanmaz.')
    if view=='movements':
        rows=_normalized_rows('MB51');filtered=[r for r in rows if not q or q in r.get('_s','')]
        shown,total,page,pages,size=_paged(filtered,page,size)
        return {'rows':[{k:v for k,v in r.items() if k!='_s'} for r in shown],'total':total,'page':page,'pages':pages,'pageSize':size,'source':'MB51'}
    if view=='guarantee':
        rows=_normalized_rows('ZMM098');filtered=[r for r in rows if not q or q in r.get('_s','')]
        shown,total,page,pages,size=_paged(filtered,page,size)
        return {'rows':[{k:v for k,v in r.items() if k!='_s'} for r in shown],'total':total,'page':page,'pages':pages,'pageSize':size,'source':'ZMM098'}
    if view=='stocks':
        rows=_normalized_rows('MB52');scope=str(query.get('scope') or 'mb51_group');scope_info=None;note='';scope_label='Tüm MB52 stokları'
        if scope!='all':
            scope_info=_mb51_scope();scope_label='MB51 Depo + Mal Grubu' if scope=='mb51_group' else 'MB51 Depoları / Tüm Mal Grupları'
        filtered=[]
        for r in rows:
            x=dict(r);fallback=(scope_info or {}).get('groupByMaterial',{}).get(x.get('materialCode'),('','','')) if scope_info else ('','','')
            x['displayMaterialGroup']=x.get('materialGroup') or fallback[0];x['displayMaterialGroupDesc']=x.get('materialGroupDesc') or fallback[1]
            if scope_info:
                plant=str(x.get('plant') or '');dy=str(x.get('dy') or '')
                if scope=='mb51_depot' and (plant,dy) not in scope_info['depots'] and ('',dy) not in scope_info['depots']:continue
                if scope=='mb51_group':
                    token=str(x.get('displayMaterialGroup') or '').strip() or _norm_header(x.get('displayMaterialGroupDesc') or '')
                    if scope_info['hasGroups']:
                        if not token or ((plant,dy,token) not in scope_info['pairs'] and ('',dy,token) not in scope_info['pairs']):continue
                    elif (plant,dy) not in scope_info['depots'] and ('',dy) not in scope_info['depots']:continue
            if q and q not in _norm_search(' '.join(str(x.get(k,'')) for k in ('plant','dy','dyDesc','displayMaterialGroup','displayMaterialGroupDesc','materialCode','materialDesc','valuationType'))):continue
            x.pop('_s',None);filtered.append(x)
        shown,total,page,pages,size=_paged(filtered,page,size)
        return {'rows':shown,'total':total,'page':page,'pages':pages,'pageSize':size,'source':'MB52','scopeLabel':scope_label,'note':note}
    if view=='kesif':
        code=str(query.get('type') or 'T').upper();status=str(query.get('status') or '');depot=str(query.get('depot') or '')
        rows=[dict(r) for r in _normalized_rows('KESIFLER') if str(r.get('workCode') or '').upper()==code]
        counts=Counter();known_dep=set()
        for r in rows:
            dup=(str(r.get('dy') or ''), _norm_header(r.get('project') or ''), str(r.get('materialCode') or '')) if code=='T' else (str(r.get('dy') or ''),str(r.get('materialCode') or ''))
            r['_dupkey']=dup;counts[dup]+=1;known_dep.add(str(r.get('dy') or ''))
        positive=zero=negative=mismatch=duplicate_rows=0;project_names=set();filtered=[]
        for r in rows:
            r['mismatch']=abs((float(r.get('planned') or 0)-float(r.get('given') or 0))-float(r.get('remaining') or 0))>0.001
            r['duplicate']=counts[r['_dupkey']]>1;r['issue']=r['mismatch'] or float(r.get('remaining') or 0)<0 or r['duplicate']
            rem=float(r.get('remaining') or 0)
            if rem>0:positive+=1
            elif rem<0:negative+=1
            else:zero+=1
            if r['mismatch']:mismatch+=1
            if r['duplicate']:duplicate_rows+=1
            if code=='T' and r.get('project'):project_names.add((r.get('dy'),_norm_header(r.get('project'))))
            if q and q not in r.get('_s',''):continue
            if depot and str(r.get('dy') or '')!=depot:continue
            if status=='issues' and not r['issue']:continue
            if status=='negative' and not rem<0:continue
            if status=='mismatch' and not r['mismatch']:continue
            if status=='duplicate' and not r['duplicate']:continue
            if status=='positive' and not rem>0:continue
            if status=='zero' and rem!=0:continue
            r.pop('_s',None);r.pop('_dupkey',None);filtered.append(r)
        shown,total,page,pages,size=_paged(filtered,page,size)
        stats={'rows':len(rows),'projects':len(project_names),'depots':len(known_dep),'positive':positive,'zero':zero,'negative':negative,'mismatch':mismatch,'duplicateRows':duplicate_rows,'duplicateKeys':sum(1 for v in counts.values() if v>1),'issues':sum(1 for r in rows if r.get('issue'))}
        return {'rows':shown,'total':total,'page':page,'pages':pages,'pageSize':size,'source':'KESIFLER','stats':stats,'depots':sorted(x for x in known_dep if x)}
    raise ValueError('Geçersiz grid görünümü')

class Handler(BaseHTTPRequestHandler):
    server_version = f'TalepKontrolCurrent/{APP_VERSION}'

    def log_message(self, fmt, *args):
        return

    def _send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False, default=str).encode('utf-8', errors='replace')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Connection', 'close')
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path: Path):
        try:
            body = path.read_bytes()
        except Exception as exc:
            return self._send_json({'ok': False, 'error': str(exc)}, 500)
        mime = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Connection', 'close')
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self, max_bytes=5 * 1024 * 1024):
        try:length=int(self.headers.get('Content-Length') or '0')
        except Exception:length=0
        if length<=0:raise ValueError('İstek gövdesi boş.')
        if length>max_bytes:raise ValueError('Kayıt verisi izin verilen boyutu aşıyor.')
        return json.loads(self.rfile.read(length).decode('utf-8'))

    def _form_excel_receive(self, parsed, stage=False):
        try:
            q=urllib.parse.parse_qs(parsed.query)
            key=str((q.get('key') or [''])[0]).upper().strip()
            if key not in form_excel.FORMATS:raise form_excel.FormError('Form türü seçilmelidir.')
            length=int(self.headers.get('Content-Length') or '0')
            if length<=0 or length>form_excel.MAX_COMPRESSED:raise form_excel.FormError('Dosya boş veya izin verilen boyuttan büyük.')
            if 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' not in self.headers.get('Content-Type',''):
                raise form_excel.FormError('Yalnız .xlsx dosya yükleyin.')
            with tempfile.TemporaryDirectory(prefix='tk_form_import_') as td:
                tmp=Path(td)/'input.xlsx';tmp.write_bytes(self.rfile.read(length))
                result=form_excel.preview(tmp,key)
                if stage:
                    if result['count']<=0:raise form_excel.FormError('Miktar içermeyen form taslak import olarak kaydedilemez.')
                    with _FORM_IMPORT_STAGING_LOCK:
                        FORM_IMPORT_STAGING_ROOT.mkdir(parents=True,exist_ok=True)
                        batch_id='IMP-'+key+'-'+result['fileSha256'][:20]
                        final=FORM_IMPORT_STAGING_ROOT/batch_id
                        if not final.exists():
                            pending=FORM_IMPORT_STAGING_ROOT/('.PREPARING-'+uuid.uuid4().hex)
                            pending.mkdir()
                            try:
                                shutil.copy2(tmp,pending/'source.xlsx')
                                meta={'batchId':batch_id,'key':key,'sheet':result['sheet'],'sha256':result['fileSha256'],'count':result['count'],'status':'LOCAL_STAGING_REQUIRES_CENTRAL_APPROVAL','createdAt':datetime.now().astimezone().isoformat()}
                                (pending/'manifest.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')
                                os.rename(pending,final)
                            finally:
                                if pending.exists():shutil.rmtree(pending)
                        else:
                            old=json.loads((final/'manifest.json').read_text(encoding='utf-8'))
                            if old.get('sha256')!=result['fileSha256']:raise form_excel.FormError('İşlem kimliği çakışması tespit edildi.')
                    result['batchId']=batch_id;result['status']='LOCAL_STAGING_REQUIRES_CENTRAL_APPROVAL';result['localSaved']=True
                return self._send_json({'ok':True,**result})
        except (form_excel.FormError,ValueError,zipfile.BadZipFile) as exc:
            return self._send_json({'ok':False,'error':str(exc),'canPublish':False},400)
        except Exception:
            return self._send_json({'ok':False,'error':'Excel işlenemedi. Dosyayı ve form türünü kontrol edin.','canPublish':False},500)

    def _send_excel_blob(self, body, filename):
        self.send_response(200)
        self.send_header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        self.send_header('Content-Disposition', 'attachment; filename="'+filename+'"')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Connection', 'close')
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        parsed=urllib.parse.urlparse(self.path)
        if parsed.path=='/api/kesif-drafts':
            try:
                import kesif_drafts28q
                payload=self._read_json(max_bytes=24*1024)
                if str(payload.get('workType') or '').upper()=='TESIS' and not str(payload.get('projectId') or '').strip():
                    depot=str(payload.get('depot') or '').strip().upper();name=str(payload.get('projectName') or '').strip()
                    if not depot or not name:raise ValueError('TESİS taslağında depo ve proje adı zorunludur.')
                    matched=next((r for r in operations_work_snapshot('T').get('projects') or [] if str(r.get('dy') or '')==depot and str(r.get('projectNorm') or '')==indexed_engine.norm(name)),None)
                    if matched:payload['projectId']=matched.get('projectCode')
                    else:
                        with indexed_engine.connect(_active_index_db()) as dbc:
                            master=[dict(r) for r in dbc.execute('SELECT dy,project_id,project_norm FROM projects').fetchall()]
                        candidate=[{'dy':depot,'projectName':name,'projectNorm':indexed_engine.norm(name),'projectCode':''}]
                        project_ids28r.assign(candidate,master,load_manual_tesis_projects().get('projects') or [],PROJECT_IDS28R_PATH)
                        payload['projectId']=candidate[0].get('projectCode')
                    if not payload.get('projectId'):raise ValueError('Proje kodu oluşturulamadı.')
                item=kesif_drafts28q.store(APP_DIR,payload,user_context().get('login') or 'LOCAL_USER')
                return self._send_json({'ok':True,'item':item,'published':False},201)
            except (ValueError,TypeError) as exc:return self._send_json({'ok':False,'error':str(exc)},400)
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if parsed.path=='/api/form-import/preview':return self._form_excel_receive(parsed,stage=False)
        if parsed.path=='/api/form-import/stage':return self._form_excel_receive(parsed,stage=True)
        if parsed.path=='/api/client-close':mark_client_close();return self._send_json({'ok':True})
        # Any real request proves the application is still alive and cancels a pending close.
        mark_client_alive()
        if parsed.path=='/api/shutdown':
            active_token = os.environ.get('TALEP_GUI_SHUTDOWN_TOKEN', '')
            given_token = self.headers.get('X-Talep-Session-Token', '')
            if active_token and not hmac.compare_digest(given_token, active_token):
                return self._send_json({'ok':False,'error':'Oturum yetkisi doğrulanamadı.'},403)
            self._send_json({'ok':True})
            threading.Thread(target=self.server.shutdown,daemon=True).start()
            return
        if parsed.path=='/api/heartbeat':mark_client_alive();return self._send_json({'ok':True})
        if parsed.path=='/api/exemptions':
            try:
                payload=self._read_json(max_bytes=1024*1024);items=save_exemptions(payload.get('items') or [])
                return self._send_json({'ok':True,'items':items,'count':len(items),'path':str(EXEMPTION_PATH)})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},400)
        if parsed.path=='/api/save-control':
            try:
                outer=self._read_json();encoded=str(outer.get('payloadBase64') or '')
                if not encoded:raise ValueError('Kayıt payload bilgisi bulunamadı.')
                payload=json.loads(base64.b64decode(encoded,validate=True).decode('utf-8'));allow_repeat=bool(outer.get('allowRepeat'));result=save_control_payload(payload,allow_repeat=allow_repeat)
                return self._send_json({'ok':True,**result})
            except DuplicateReservationError as exc:return self._send_json({'ok':False,'code':'RESERVATION_ALREADY_CONTROLLED','error':str(exc),'history':exc.history},409)
            except MissingReservationNumberError as exc:return self._send_json({'ok':False,'code':exc.code,'error':str(exc)},400)
            except PermissionError as exc:return self._send_json({'ok':False,'code':'SHARED_WRITE_DISABLED','error':str(exc)},403)
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if parsed.path=='/api/project-lifecycle':
            try:
                payload=self._read_json(max_bytes=128*1024);item=update_project_lifecycle(payload,user_context().get('login') or 'DATA_MANAGER');return self._send_json({'ok':True,'item':item})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},400)
        if parsed.path=='/api/user-responsibilities':
            try:
                payload=self._read_json(max_bytes=512*1024);result=save_user_responsibilities(payload,user_context().get('login') or 'ADMIN');return self._send_json({'ok':True,**result})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},400)
        if parsed.path=='/api/notifications/action':
            try:
                payload=self._read_json(max_bytes=64*1024);item=notification_action(payload);return self._send_json({'ok':True,'item':item})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},400)
        if parsed.path=='/api/notifications/clear':
            try:
                payload=self._read_json(max_bytes=64*1024);result=clear_notifications(payload);return self._send_json({'ok':True,**result})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},400)
        if parsed.path=='/api/tesis-project':
            try:
                payload=self._read_json(max_bytes=512*1024);item=add_manual_tesis_project(payload);return self._send_json({'ok':True,'item':item})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},400)
        if parsed.path=='/api/data-prep/select-excel':
            try:return self._send_json({'ok':True,**data_prep_select_excel()})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},400)
        if parsed.path=='/api/data-prep/convert':
            try:
                payload=self._read_json(max_bytes=2*1024*1024);return self._send_json({'ok':True,**data_prep_convert(payload)})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},400)
        if parsed.path=='/api/data-prep/stage-source':
            try:
                payload=self._read_json(max_bytes=128*1024);return self._send_json({'ok':True,**data_prep_stage_source(payload)})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},400)
        if parsed.path=='/api/data-prep/open-folder':
            try:return self._send_json({'ok':True,**data_prep_open_folder()})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},400)
        if parsed.path=='/api/source-update-choice':
            try:
                payload=self._read_json(max_bytes=64*1024);result=source_update_choice(payload.get('source'),payload.get('choice'),user_context().get('login') or 'DATA_MANAGER')
                return self._send_json({'ok':True,**result})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},400)
        if parsed.path=='/api/source-select-file':
            try:
                payload=self._read_json(max_bytes=64*1024);result=stage_source_file(payload.get('source'),user_context().get('login') or 'DATA_MANAGER')
                return self._send_json({'ok':True,**result})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},400)
        if parsed.path=='/api/settings-select-folder':
            try:
                payload=self._read_json(max_bytes=64*1024);result=select_settings_folder(str(payload.get('kind') or ''))
                return self._send_json({'ok':True,**result})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},400)
        if parsed.path=='/api/settings-open-folder':
            try:
                payload=self._read_json(max_bytes=64*1024);result=open_settings_folder(str(payload.get('kind') or ''))
                return self._send_json({'ok':True,**result})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},400)
        if parsed.path in ('/api/settings','/api/settings-save'):
            try:
                payload=self._read_json(max_bytes=256*1024);saved=save_settings_payload(payload)
                return self._send_json({'ok':True,**saved})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},400)
        if parsed.path=='/api/data-center/integrity/run':
            try:
                engine=_engine_snapshot();result=DATA_ARCH_V2.run_integrity_due(engine,force=True);return self._send_json({'ok':True,**result})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if parsed.path=='/api/data-center/quarantine/reprocess':
            try:
                body=self._read_json(max_bytes=64*1024);qid=str(body.get('quarantineId') or '').strip()
                if not qid:return self._send_json({'ok':False,'error':'Quarantine ID gereklidir.'},400)
                return self._send_json({'ok':True,**DATA_ARCH_V2.reprocess_quarantine(qid,user_context().get('login') or 'ADMIN')})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},400)
        return self._send_json({'ok':False,'error':'Geçersiz istek'},404)

    def _serve_official_excel(self, key):
        # Published keys only: no caller-supplied file paths, no writes to original XLSX.
        catalog_path = APP_DIR / 'templates' / 'kurumsal' / 'catalog.json'
        try:
            catalog = json.loads(catalog_path.read_text(encoding='utf-8'))
            item = catalog.get(key)
            if not item: return self._send_json({'ok':False,'error':'Bilinmeyen form.'},404)
            basename = item['file']
            if not basename.endswith('.xlsx') or Path(basename).name != basename:
                raise ValueError('Geçersiz form dosyası.')
            source = APP_DIR / 'templates' / 'kurumsal' / basename
            body = source.read_bytes()
            if len(body)!=int(item['bytes']) or hashlib.sha256(body).hexdigest()!=item['sha256']:
                raise ValueError('Kurumsal form bütünlüğü doğrulanamadı.')
            return self._send_excel_blob(body, basename)
        except Exception as exc:
            return self._send_json({'ok':False,'error':'Kurumsal form indirilemedi: '+str(exc)},503)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        route = parsed.path
        # Any GET/static/API request proves the browser is still active.
        mark_client_alive()
        if route == '/api/form-library':
            try:
                catalog=json.loads((APP_DIR/'templates'/'kurumsal'/'catalog.json').read_text(encoding='utf-8'))
                items=[{'key':k,'name':v['title'],'sheet':v['sheet'],'bytes':v['bytes'],'status':v['status']} for k,v in catalog.items()]
                return self._send_json({'ok':True,'items':items,'readOnly':True,'format':'ORIGINAL_NOT_MODIFIED'})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},503)
        if route == '/api/form-library/download':
            q=urllib.parse.parse_qs(parsed.query)
            key=str((q.get('key') or [''])[0]).strip().upper()
            return self._serve_official_excel(key)
        if route == '/api/kesif-drafts':
            try:
                import kesif_drafts28q
                return self._send_json({'ok':True,'items':kesif_drafts28q.list_items(APP_DIR),'published':False})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route == '/api/form-import/templates':
            return self._send_json({'ok':True,'items':[{'key':k,'name':v['label'],'sheet':v['sheet'],'kind':v['kind']} for k,v in form_excel.FORMATS.items()],'status':'PILOT_PREVIEW_ONLY'})
        if route == '/api/form-import/template':
            q=urllib.parse.parse_qs(parsed.query);key=str((q.get('key') or [''])[0]).upper().strip()
            if key not in form_excel.FORMATS:return self._send_json({'ok':False,'error':'Bilinmeyen şablon.'},404)
            return self._serve_official_excel(key)  # Kurumsal formun orijinal biçimi korunur.
        if route == '/api/templates/yeni-kesif-v06':
            # Controlled, read-only distribution of the approved V0.6 layout PILOT.
            # This is NOT a dynamic/project-count generator or an import endpoint.
            source = APP_DIR / 'templates' / 'YEDAS_Yeni_Kesif_V0_6_ORNEK.xlsx'
            try:
                body = source.read_bytes()
                if hashlib.sha256(body).hexdigest() != 'f3818103a5bfb7ff4ccf935924a84f7e253c4fb9589d30d52166e418ae8a046e':
                    return self._send_json({'ok': False, 'error': 'Şablon bütünlüğü doğrulanamadı.'}, 503)
                with zipfile.ZipFile(source) as archive:
                    if archive.testzip() is not None:
                        raise ValueError('Geçersiz Excel arşivi')
                self.send_response(200)
                self.send_header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
                self.send_header('Content-Disposition', 'attachment; filename="YEDAS_Yeni_Kesif_V0_6_Ornek.xlsx"')
                self.send_header('Content-Length', str(len(body)))
                self.send_header('Cache-Control', 'no-store')
                self.send_header('Connection', 'close')
                self.end_headers()
                self.wfile.write(body)
                return
            except Exception as exc:
                return self._send_json({'ok': False, 'error': 'Şablon indirilemedi: ' + str(exc)}, 500)
        if route == '/api/heartbeat':
            mark_client_alive()
            return self._send_json({'ok': True})
        if route == '/api/user-context':
            try:return self._send_json({'ok':True,**user_context(audit=True)})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route == '/api/user-responsibilities':
            try:return self._send_json({'ok':True,**load_user_responsibilities()})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route == '/api/data-center/audit':
            try:
                q=urllib.parse.parse_qs(parsed.query);limit=max(1,min(1000,int((q.get('limit') or ['250'])[0])))
                with DATA_ARCH_V2.connect() as con:
                    rows=[dict(r) for r in con.execute('SELECT id,event_time,category,action,actor,object_type,object_id,details_json FROM audit_events ORDER BY id DESC LIMIT ?',(limit,)).fetchall()]
                for r in rows:
                    try:r['details']=json.loads(r.pop('details_json') or '{}')
                    except Exception:r['details']={}
                return self._send_json({'ok':True,'items':rows,'count':len(rows)})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route == '/api/notifications':
            try:
                items=build_notifications();return self._send_json({'ok':True,'items':items,'openCount':sum(1 for x in items if x.get('status')=='OPEN'),'criticalCount':sum(1 for x in items if x.get('status')=='OPEN' and x.get('severity')=='CRITICAL'),'warningCount':sum(1 for x in items if x.get('status')=='OPEN' and x.get('severity')=='WARNING'),'infoCount':sum(1 for x in items if x.get('status')=='OPEN' and x.get('severity')=='INFO')})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route == '/api/tesis-projects':
            try:return self._send_json({'ok':True,**load_manual_tesis_projects()})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route == '/api/exemptions':
            try:
                items=load_exemptions();return self._send_json({'ok':True,'items':items,'count':len(items),'path':str(EXEMPTION_PATH)})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route == '/api/data-center/health':
            try:
                cfg,srcs,_=source_snapshot_cached(force=False);DATA_ARCH_V2.observe_sources(srcs or {});engine=_engine_snapshot(srcs or {})
                return self._send_json({'ok':True,**DATA_ARCH_V2.health(engine,engine.get('quality') or {}),'pendingSourceUpdates':cfg.get('_pending_source_updates',[])})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route == '/api/data-center/quality':
            try:
                engine=_engine_snapshot();return self._send_json({'ok':True,**(engine.get('quality') or {})})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route == '/api/data-center/quarantine':
            try:return self._send_json({'ok':True,'items':DATA_ARCH_V2.quarantine_items()})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route == '/api/data-center/integrity':
            try:
                last=DATA_ARCH_V2._last_integrity('ACTIVE_ENGINE');return self._send_json({'ok':True,'last':dict(last) if last else None})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route == '/api/data-center/snapshots':
            try:
                q=urllib.parse.parse_qs(parsed.query);source=str((q.get('source') or [''])[0]).strip().upper() or None;limit=int((q.get('limit') or ['200'])[0])
                return self._send_json({'ok':True,'items':DATA_ARCH_V2.snapshots(source,limit)})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route == '/api/data-center/config':
            try:return self._send_json({'ok':True,**DATA_ARCH_V2.config()})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route == '/api/data-center/actions':
            try:return self._send_json({'ok':True,'items':DATA_ARCH_V2.actions()})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route == '/api/data-prep':
            try:return self._send_json({'ok':True,'templates':_data_prep_templates_public(),'history':_data_prep_history()[:20],'outputRoot':str(DATA_PREP_ROOT)})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route == '/api/data-prep/download':
            try:
                q=urllib.parse.parse_qs(parsed.query);path=_data_prep_find_output((q.get('batch') or [''])[0],(q.get('file') or [''])[0]);body=path.read_bytes();self.send_response(200);self.send_header('Content-Type','text/csv; charset=utf-8');self.send_header('Content-Disposition',f'attachment; filename="{path.name}"');self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-store');self.send_header('Connection','close');self.end_headers();self.wfile.write(body);return
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},404)
        if route == '/api/health':
            return self._send_json({'ok': True, 'app': 'Talep Kontrol', 'version': APP_VERSION, 'build': APP_BUILD, 'sessionId':os.environ.get('TALEP_GUI_SESSION',''), 'servicePid':os.getpid(), 'capabilities': {'dashboard': True, 'dashboardDetails': True, 'csvArchive': True, 'csvSources': True, 'contentDetection': True, 'settings': True, 'exemptions': True, 'fastDataEngine': True, 'serverPaging': True, 'parquet': True, 'indexedQueries': True, 'controlHistory': True, 'localControlReadIndex': True, 'dataArchitectureV2': True, 'dataCenter': True, 'dataIntegrity': True, 'qualityChecks': True, 'atomicActiveBuild': True, 'rulesetTrace': True, 'sourceUpdateApproval': True, 'projectLifecycle': True, 'operationsArchive': True, 'itemLevelDecision': True, 'workTypeOperations': True, 'notifications': True, 'notificationClear': True, 'windowsSession': True, 'userResponsibilities': True, 'manualTesisProject': True, 'mb51Reconciliation': True, 'dataPreparation': True, 'tesisHistoryV2': True, 'worktypeReportsV2': True, 'reservationComboboxV2': True, 'tesisPreflightV2': True}, 'recordSecurity': {'sharedWritesEnabled': bool(load_config().get('shared_writes_enabled',False)), 'mode': str(load_config().get('shared_write_mode',''))}, 'dataEngine': _engine_snapshot()})
        if route == '/api/tesis-control-preflight':
            try:
                q=urllib.parse.parse_qs(parsed.query)
                return self._send_json({'ok':True,**tesis_control_preflight((q.get('reservationNo') or [''])[0])})
            except ValueError as exc:return self._send_json({'ok':False,'error':str(exc)},400)
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route == '/api/tesis-control-history':
            try:
                q=urllib.parse.parse_qs(parsed.query)
                if (q.get('detail') or [''])[0]=='1':
                    return self._send_json({'ok':True,**tesis_control_history_detail((q.get('controlId') or [''])[0],(q.get('reservationNo') or [''])[0],(q.get('materialCode') or [''])[0])})
                return self._send_json({'ok':True,**tesis_control_history_snapshot((q.get('q') or [''])[0],(q.get('status') or [''])[0],(q.get('depot') or [''])[0],(q.get('page') or ['1'])[0])})
            except ValueError as exc:return self._send_json({'ok':False,'error':str(exc)},400)
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route == '/api/bakim-parasal-icmal':
            try:
                q=urllib.parse.parse_qs(parsed.query)
                result=f604_summary.get_report(APP_DIR,(q.get('depot') or [''])[0],(q.get('plant') or [''])[0],(q.get('q') or [''])[0])
                return self._send_json({'ok':True,**result})
            except ValueError as exc:return self._send_json({'ok':False,'error':str(exc)},400)
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route == '/api/worktype-monthly-consumption':
            try:
                q=urllib.parse.parse_qs(parsed.query)
                return self._send_json({'ok':True,**worktype_monthly_consumption((q.get('code') or [''])[0],(q.get('year') or ['2026'])[0],(q.get('plant') or [''])[0],(q.get('depot') or [''])[0],(q.get('q') or [''])[0])})
            except ValueError as exc:return self._send_json({'ok':False,'error':str(exc)},400)
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route == '/api/tesis-next-project-code':
            try:
                q=urllib.parse.parse_qs(parsed.query);depot=str((q.get('depot') or [''])[0]).strip().upper()
                # Materialize missing source IDs first; preview is not a confirmed reservation.
                operations_work_snapshot('T')
                with indexed_engine.connect(_active_index_db()) as dbc:
                    master=[dict(r) for r in dbc.execute('SELECT dy,project_id,project_norm FROM projects').fetchall()]
                nxt=project_ids28r.preview_next(depot,master,load_manual_tesis_projects().get('projects') or [],PROJECT_IDS28R_PATH)
                return self._send_json({'ok':True,'depot':depot,'nextCode':nxt,'previewOnly':True})
            except ValueError as exc:return self._send_json({'ok':False,'error':str(exc)},400)
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route == '/api/worktype-given-reservations':
            try:
                q=urllib.parse.parse_qs(parsed.query)
                return self._send_json({'ok':True,**worktype_reservation_snapshot((q.get('code') or [''])[0],(q.get('depot') or [''])[0],(q.get('plant') or [''])[0],(q.get('q') or [''])[0],(q.get('page') or ['1'])[0],(q.get('pageSize') or ['100'])[0],json.loads((q.get('columnFilters') or ['{}'])[0]),(q.get('sortBy') or [''])[0],(q.get('sortDir') or ['desc'])[0])})
            except ValueError as exc:return self._send_json({'ok':False,'error':str(exc)},400)
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route == '/api/worktype-given-groups':
            try:
                q=urllib.parse.parse_qs(parsed.query)
                return self._send_json({'ok':True,**worktype_given_group_snapshot((q.get('code') or [''])[0],(q.get('depot') or [''])[0],(q.get('plant') or [''])[0],(q.get('q') or [''])[0],(q.get('page') or ['1'])[0],(q.get('pageSize') or ['100'])[0],json.loads((q.get('columnFilters') or ['{}'])[0]),(q.get('sortBy') or [''])[0],(q.get('sortDir') or ['desc'])[0])})
            except ValueError as exc:return self._send_json({'ok':False,'error':str(exc)},400)
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route == '/api/worktype-report':
            try:
                q=urllib.parse.parse_qs(parsed.query)
                return self._send_json({'ok':True,**worktype_report_snapshot((q.get('code') or [''])[0],(q.get('tab') or ['material'])[0],(q.get('depot') or [''])[0],(q.get('q') or [''])[0],(q.get('page') or ['1'])[0],(q.get('pageSize') or ['100'])[0],(q.get('plant') or [''])[0],(q.get('projectNorm') or [''])[0],json.loads((q.get('columnFilters') or ['{}'])[0]),(q.get('sortBy') or [''])[0],(q.get('sortDir') or ['asc'])[0])})
            except ValueError as exc:return self._send_json({'ok':False,'error':str(exc)},400)
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route == '/api/control-history':
            try:
                q=urllib.parse.parse_qs(parsed.query);no=str((q.get('reservationNo') or [''])[0]).strip()
                if not no:return self._send_json({'ok':False,'error':'Rezervasyon numarası gereklidir.'},400)
                return self._send_json({'ok':True,**reservation_control_history(no)})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route == '/api/control-records':
            try:
                q=urllib.parse.parse_qs(parsed.query);query=(q.get('q') or [''])[0];ctype=(q.get('type') or [''])[0];result=(q.get('result') or [''])[0];page=(q.get('page') or ['1'])[0];page_size=(q.get('pageSize') or ['50'])[0]
                return self._send_json({'ok':True,**control_records_snapshot(query,ctype,result,page,page_size)})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route == '/api/control-record-detail':
            try:
                q=urllib.parse.parse_qs(parsed.query);cid=str((q.get('id') or [''])[0]).strip()
                return self._send_json({'ok':True,**control_record_detail(cid)})
            except ValueError as exc:return self._send_json({'ok':False,'error':str(exc)},404)
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route == '/api/project-lifecycle':
            try:return self._send_json({'ok':True,**project_lifecycle_snapshot()})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route == '/api/archive/operations':
            try:
                q=urllib.parse.parse_qs(parsed.query);months=int((q.get('months') or ['36'])[0]);return self._send_json({'ok':True,**operations_archive_snapshot(months)})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route == '/api/operations-work':
            try:
                q=urllib.parse.parse_qs(parsed.query);code=(q.get('code') or ['T'])[0];months=(q.get('months') or ['12'])[0]
                return self._send_json({'ok':True,**operations_work_snapshot(code,months)})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route == '/api/operations-work-project':
            try:
                q=urllib.parse.parse_qs(parsed.query);depot=(q.get('depot') or [''])[0];project_norm=(q.get('projectNorm') or [''])[0]
                rows=indexed_engine.worktype_project_materials(_active_index_db(),depot,project_norm)
                rows.extend(_manual_project_rows(depot,project_norm))
                projects=operations_work_snapshot('T').get('projects') or []
                ref=next((x for x in projects if str(x.get('dy') or '')==depot and str(x.get('projectNorm') or '')==project_norm),None)
                if ref:
                    for r in rows:
                        if not r.get('projectCode'):r['projectCode']=ref.get('projectCode') or ''
                return self._send_json({'ok':True,'depot':depot,'projectNorm':project_norm,'rows':rows})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route == '/api/operations':
            try:
                q=urllib.parse.parse_qs(parsed.query);days=(q.get('days') or ['30'])[0];company=(q.get('company') or [''])[0];depot=(q.get('depot') or [''])[0];work_type=(q.get('workType') or [''])[0];months=(q.get('months') or ['12'])[0]
                return self._send_json({'ok':True,**operations_snapshot(days,company,depot,work_type,months)})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route == '/api/dashboard':
            try:
                q=urllib.parse.parse_qs(parsed.query);days=(q.get('days') or ['30'])[0];company=(q.get('company') or [''])[0];depot=(q.get('depot') or [''])[0];work_type=(q.get('workType') or [''])[0]
                snap=dashboard_snapshot(days,company,depot,work_type)
                compact=str((q.get('compact') or ['0'])[0]).lower() in ('1','true','yes')
                if compact:
                    snap={**snap,'contractorMaterials':[],'projectDistributions':[]}
                return self._send_json({'ok':True,**snap})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route == '/api/dashboard-details':
            try:
                q=urllib.parse.parse_qs(parsed.query);days=(q.get('days') or ['30'])[0];kind=str((q.get('kind') or [''])[0]).lower();company=(q.get('company') or [''])[0];depot=(q.get('depot') or [''])[0];work_type=(q.get('workType') or [''])[0]
                snap=dashboard_snapshot(days,company,depot,work_type)
                if kind=='materials':items=snap.get('contractorMaterials',[])
                elif kind=='projects':items=snap.get('projectDistributions',[])
                else:return self._send_json({'ok':False,'error':'Geçersiz dashboard detay türü.'},400)
                return self._send_json({'ok':True,'kind':kind,'days':snap.get('days'),'count':len(items),'items':items,'warnings':snap.get('warnings',[])})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route == '/api/record-info':
            try:
                root=load_record_root();dirs=record_dir_paths(root)
                return self._send_json({'ok':True,'recordRoot':str(root),'folders':{k:str(v) for k,v in dirs.items()},'format':'UTF-8 BOM / semicolon-separated CSV'})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route in ('/api/settings','/api/settings-info'):
            try:return self._send_json({'ok':True,**settings_snapshot()})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route == '/api/book':
            try:
                q=urllib.parse.parse_qs(parsed.query);src=str((q.get('source') or [''])[0]).upper()
                if src not in SOURCE_NAMES:return self._send_json({'ok':False,'error':'Geçersiz kaynak'},400)
                # Keşif dosyaları çok büyük. Karar ekranı bunları ihtiyaca göre
                # /api/kesif-context üzerinden alır; tarayıcıya 60+ MB JSON gönderilmez.
                if src=='KESIFLER':return self._send_json({'ok':True,'source':src,'book':{},'fingerprint':_source_fingerprint(src),'deferred':True})
                return self._send_json({'ok':True,'source':src,'book':_source_book_fast(src),'fingerprint':_source_fingerprint(src)})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route == '/api/kesif-context':
            try:
                q=urllib.parse.parse_qs(parsed.query);dy=str((q.get('dy') or [''])[0]).strip();raw=str((q.get('materials') or [''])[0])
                materials=[x.strip() for x in raw.split(',') if x.strip()]
                if not dy or not materials:return self._send_json({'ok':False,'error':'Depo ve malzeme bilgisi gereklidir.'},400)
                if len(materials)>500:return self._send_json({'ok':False,'error':'Tek istekte en fazla 500 malzeme sorgulanabilir.'},400)
                rows=_kesif_context_rows(dy,materials)
                return self._send_json({'ok':True,'dy':dy,'materials':materials,'rows':rows,'count':len(rows),'fingerprint':_source_fingerprint('KESIFLER')})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route == '/api/grid':
            try:
                q0=urllib.parse.parse_qs(parsed.query)
                view=str((q0.get('view') or [''])[0]).lower()
                query={k:(v[0] if v else '') for k,v in q0.items()}
                return self._send_json({'ok':True,**_grid_snapshot(view,query)})
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
        if route == '/api/files':
            q=urllib.parse.parse_qs(parsed.query)
            force=str((q.get('refresh') or ['0'])[0]).lower() in ('1','true','yes')
            cfg, sources, missing = source_snapshot_cached(force=force)
            source_versions=DATA_ARCH_V2.observe_sources(sources or {})
            engine=_engine_snapshot(sources)
            engine_refresh_error=''
            # FIX7: Yeni kaynak veri kullanıcının onayı olmadan ACTIVE yapılmaz.
            # refresh yalnız tarar ve pendingSourceUpdates üretir; ağır build ancak
            # 'Yeni veriye güncelle' seçeneği ile başlatılır.
            source_health=DATA_ARCH_V2.health(engine,engine.get('quality') or {})
            return self._send_json({
                'ok': True,
                'sources': sources,
                'missing': missing,
                'roots': cfg.get('roots', []),
                'externalRoot': cfg.get('external_root', ''),
                'bundledRoot': str(BUNDLED_ROOT),
                'recursive': bool(cfg.get('recursive', False)),
                'configError': cfg.get('_config_error', ''),
                'scanDiagnostics': cfg.get('_scan_diagnostics', []),
                'scanCount': cfg.get('_scan_count', 0),
                'sourceMode': 'CSV_TO_PARQUET_INDEXED',
                'dataEngine': engine,
                'sourceVersions': source_versions,
                'engineRefreshError': engine_refresh_error,
                'pendingSourceUpdates': cfg.get('_pending_source_updates', []),
                'sourceHealth': source_health
            })
        if route == '/api/file':
            q=urllib.parse.parse_qs(parsed.query);src=(q.get('source') or [''])[0]
            try:file_index=int((q.get('index') or ['0'])[0])
            except Exception:file_index=0
            cfg,sources,_=source_snapshot_cached(force=False);info=sources.get(src)
            files=(info or {}).get('files') or []
            if not info or file_index<0 or file_index>=len(files):
                return self._send_json({'ok':False,'error':f'{src} CSV kaynağı bulunamadı'},404)
            item=files[file_index];path=Path(item['path'])
            try:
                # Tarayıcıya her zaman UTF-8 gönderilir; kaynak cp1254/cp1252 olsa bile Türkçe karakter bozulmaz.
                raw=path.read_bytes();text=None
                for enc in ('utf-8-sig','utf-8','cp1254','cp1252','latin-1'):
                    try:text=raw.decode(enc);break
                    except UnicodeDecodeError:continue
                body=(text if text is not None else raw.decode('utf-8',errors='replace')).encode('utf-8-sig')
            except Exception as exc:return self._send_json({'ok':False,'error':str(exc)},500)
            self.send_response(200);self.send_header('Content-Type','text/csv; charset=utf-8');self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-store');self.send_header('Connection','close');self.end_headers();self.wfile.write(body);return

        rel = 'index.html' if route in ('', '/') else urllib.parse.unquote(route.lstrip('/'))
        candidate = (APP_DIR / rel).resolve()
        try:
            candidate.relative_to(APP_DIR)
        except ValueError:
            return self._send_json({'ok': False, 'error': 'Geçersiz yol'}, 403)
        if not candidate.exists() or not candidate.is_file():
            return self._send_json({'ok': False, 'error': 'Dosya bulunamadı'}, 404)
        return self._send_file(candidate)


def open_browser(port):
    time.sleep(0.7)
    webbrowser.open(f'http://{HOST}:{port}/')


def _integrity_scheduler():
    time.sleep(3)
    while True:
        try:
            engine=_engine_snapshot()
            if engine.get('usable'):
                DATA_ARCH_V2.record_index_build({**engine,'status':'ACTIVE','startedAt':engine.get('builtAt',''),'finishedAt':engine.get('builtAt','')})
                DATA_ARCH_V2.run_integrity_due(engine,force=False)
        except Exception as exc:
            try:DATA_ARCH_V2.audit('INTEGRITY','SCHEDULE_ERROR','SYSTEM','ENGINE','ACTIVE',{'error':str(exc)})
            except Exception:pass
        time.sleep(3600)


class TalepHTTPServer(ThreadingHTTPServer):
    def handle_error(self, request, client_address):
        # When WebView2 cancels an in-flight HTTP request on navigation/close,
        # Windows reports 10053/10054. This is a client disconnect, not a
        # fatal server failure. Preserve normal error reporting otherwise.
        exc = sys.exc_info()[1]
        if isinstance(exc, (BrokenPipeError, ConnectionResetError, ConnectionAbortedError)):
            return
        if isinstance(exc, OSError) and getattr(exc, 'winerror', None) in (10053, 10054):
            return
        return super().handle_error(request, client_address)


def main():
    selected_port = PORT
    try:
        httpd = TalepHTTPServer((HOST, selected_port), Handler)
    except OSError as exc:
        print(f'Yerel port {selected_port} başlatılamadı: {exc}')
        return

    if os.environ.get('TALEP_NO_BROWSER', '').strip().lower() not in ('1', 'true'):
        threading.Thread(target=open_browser, args=(selected_port,), daemon=True).start()

    threading.Thread(target=_integrity_scheduler,name='talep-integrity-scheduler',daemon=True).start()

    try:user_context(audit=True)
    except Exception:pass
    cfg = load_config()
    print('=' * 76)
    print('TALEP KONTROL - YEREL SERVİS')
    print('Dış kaynak klasörü :', cfg.get('external_root', ''))
    print('Paket CSV yedeği   :', BUNDLED_ROOT)
    print('Veri motoru         : CSV -> Parquet + SQLite indeks (büyük veri tarayıcıya taşınmaz).')
    print('-' * 76)
    print(f'Uygulama: http://{HOST}:{selected_port}/')
    print('Tarayıcı sayfası kapandığında yerel servis otomatik kapanır.')
    print('=' * 76)
    threading.Thread(target=client_watchdog, args=(httpd,), daemon=True).start()
    try:
        httpd.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == '__main__':
    main()
