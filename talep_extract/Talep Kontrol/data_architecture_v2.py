from __future__ import annotations

import hashlib
import json
import os
import shutil
import sqlite3
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Any, Dict

LAYERS = ['00_INBOX','01_RAW','02_STANDARD','03_ACTIVE','04_HISTORY','05_ARCHIVE','06_QUARANTINE','07_AUDIT','08_BACKUP']
FRESHNESS_HOURS = {'ZMM098':4,'ZMM048':24,'MB52':24,'MB51':24,'TESIS':24,'KET':24,'BAKIM':24,'LED':24}
RETENTION = {'MB51':'1 yıl ACTIVE','MB52':'30 gün ACTIVE','ZMM098':'90 gün ACTIVE','ZMM048':'1 yıl ACTIVE','STANDARD':'90 gün sıcak','QUARANTINE':'1 yıl','RAW':'Süresiz','AUDIT':'Süresiz'}
ROLE_MATRIX = {'NORMAL_USER':'Normal Kullanıcı','DATA_MANAGER':'Veri Yöneticisi','ADMIN':'Admin'}


def _now_iso():
    return datetime.now().astimezone().isoformat()


class DataArchitectureV2:
    """Veri Mimarisi v2 yönetişim/metaveri katmanı.

    Bu sınıf karar motorunun iş kurallarını değiştirmez. Kaynak sürümü, kullanılan
    indeks sürümü, bütünlük kontrolleri, quarantine zinciri ve audit izini tutar.
    """

    def __init__(self, app_dir: Path):
        self.app_dir = Path(app_dir)
        self.root = self.app_dir / 'data_v2'
        self.db_path = self.root / '07_AUDIT' / 'data_architecture.sqlite'
        self.rules_path = self.app_dir / 'CURRENT_RULES.json'
        self.ensure_layout()
        self.init_db()

    def ensure_layout(self):
        for layer in LAYERS:
            (self.root / layer).mkdir(parents=True, exist_ok=True)
        for src in ['MB51','MB52','ZMM048','ZMM098','KESIFLER','TANIMLAR']:
            for layer in ['00_INBOX','01_RAW','02_STANDARD','03_ACTIVE','04_HISTORY','05_ARCHIVE','06_QUARANTINE']:
                (self.root/layer/src).mkdir(parents=True, exist_ok=True)
        (self.root/'08_BACKUP'/'daily').mkdir(parents=True, exist_ok=True)
        (self.root/'08_BACKUP'/'weekly').mkdir(parents=True, exist_ok=True)

    def connect(self):
        con = sqlite3.connect(self.db_path, timeout=30)
        con.row_factory = sqlite3.Row
        return con

    def _columns(self, con, table):
        return {r['name'] for r in con.execute(f'PRAGMA table_info({table})').fetchall()}

    def _ensure_column(self, con, table, name, ddl):
        if name not in self._columns(con, table):
            con.execute(f'ALTER TABLE {table} ADD COLUMN {name} {ddl}')

    def init_db(self):
        with self.connect() as con:
            con.executescript('''
            CREATE TABLE IF NOT EXISTS snapshots(
              snapshot_id TEXT PRIMARY KEY, source TEXT NOT NULL, report_time TEXT,
              created_at TEXT NOT NULL, active_at TEXT, status TEXT NOT NULL,
              layer TEXT NOT NULL, row_count INTEGER, file_hash TEXT, file_name TEXT,
              file_path TEXT, previous_snapshot_id TEXT, warning_level TEXT,
              manual_approval INTEGER DEFAULT 0, manual_reason TEXT, time_basis TEXT DEFAULT 'FILE_MTIME'
            );
            CREATE INDEX IF NOT EXISTS idx_snapshots_source_created ON snapshots(source, created_at DESC);
            CREATE TABLE IF NOT EXISTS snapshot_events(
              id INTEGER PRIMARY KEY AUTOINCREMENT, snapshot_id TEXT, event_time TEXT NOT NULL,
              old_status TEXT, new_status TEXT, actor TEXT, reason TEXT
            );
            CREATE TABLE IF NOT EXISTS audit_events(
              id INTEGER PRIMARY KEY AUTOINCREMENT, event_time TEXT NOT NULL, category TEXT,
              action TEXT, actor TEXT, object_type TEXT, object_id TEXT, details_json TEXT
            );
            CREATE TABLE IF NOT EXISTS actions(
              action_id TEXT PRIMARY KEY, source TEXT, owner TEXT, status TEXT,
              risk_level TEXT, created_at TEXT, original_due_at TEXT, current_due_at TEXT,
              extension_count INTEGER DEFAULT 0, escalation TEXT, resolution TEXT
            );
            CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);

            CREATE TABLE IF NOT EXISTS source_versions(
              version_id TEXT PRIMARY KEY, source TEXT NOT NULL, source_digest TEXT NOT NULL,
              observed_at TEXT NOT NULL, report_time TEXT, file_count INTEGER DEFAULT 0,
              total_size INTEGER DEFAULT 0, files_json TEXT, ruleset_version TEXT,
              ruleset_hash TEXT, is_current INTEGER DEFAULT 1
            );
            CREATE UNIQUE INDEX IF NOT EXISTS uq_source_version_digest ON source_versions(source,source_digest);
            CREATE INDEX IF NOT EXISTS ix_source_versions_current ON source_versions(source,is_current,observed_at DESC);

            CREATE TABLE IF NOT EXISTS index_builds(
              build_id TEXT PRIMARY KEY, source_digest TEXT, started_at TEXT, finished_at TEXT,
              status TEXT, index_path TEXT, manifest_path TEXT, parquet_root TEXT,
              index_hash TEXT, manifest_hash TEXT, ruleset_version TEXT, ruleset_hash TEXT,
              quality_level TEXT, quality_json TEXT, error TEXT
            );
            CREATE INDEX IF NOT EXISTS ix_index_builds_finished ON index_builds(finished_at DESC);

            CREATE TABLE IF NOT EXISTS integrity_checks(
              id INTEGER PRIMARY KEY AUTOINCREMENT, check_time TEXT NOT NULL, scope TEXT NOT NULL,
              status TEXT NOT NULL, checked_count INTEGER DEFAULT 0, failed_count INTEGER DEFAULT 0,
              details_json TEXT
            );
            CREATE INDEX IF NOT EXISTS ix_integrity_checks_scope ON integrity_checks(scope,check_time DESC);

            CREATE TABLE IF NOT EXISTS quarantine_records(
              quarantine_id TEXT PRIMARY KEY, source TEXT, original_path TEXT, quarantine_path TEXT,
              reason TEXT, created_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'QUARANTINED',
              previous_quarantine_id TEXT, reprocess_version_id TEXT, reprocessed_at TEXT
            );
            CREATE INDEX IF NOT EXISTS ix_quarantine_status ON quarantine_records(status,created_at DESC);
            CREATE TABLE IF NOT EXISTS integrity_baselines(
              scope TEXT NOT NULL, file_path TEXT NOT NULL, file_hash TEXT NOT NULL,
              first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, PRIMARY KEY(scope,file_path)
            );
            ''')
            # Eski v2 DB'leri yerinde migrate et.
            self._ensure_column(con,'snapshots','ruleset_version','TEXT')
            self._ensure_column(con,'snapshots','ruleset_hash','TEXT')
            self._ensure_column(con,'snapshots','source_digest','TEXT')
            self._ensure_column(con,'snapshots','index_build_id','TEXT')
            con.execute("INSERT OR IGNORE INTO settings(key,value) VALUES('current_role','ADMIN')")
            con.execute("INSERT OR IGNORE INTO settings(key,value) VALUES('architecture_version','2.0')")

    def audit(self, category, action, actor='SYSTEM', object_type='', object_id='', details=None):
        with self.connect() as con:
            con.execute('INSERT INTO audit_events(event_time,category,action,actor,object_type,object_id,details_json) VALUES(?,?,?,?,?,?,?)',
                        (_now_iso(),category,action,actor,object_type,object_id,json.dumps(details or {},ensure_ascii=False)))

    def ruleset_info(self):
        raw=b''
        data={}
        try:
            raw=self.rules_path.read_bytes()
            data=json.loads(raw.decode('utf-8-sig'))
        except Exception:
            pass
        h=hashlib.sha256(raw).hexdigest() if raw else ''
        version=str(data.get('version') or data.get('ruleset') or 'UNVERSIONED')
        name=str(data.get('ruleset') or 'CURRENT_RULES')
        return {'name':name,'version':version,'hash':h,'shortHash':h[:12] if h else ''}

    def _hash_file(self, path: Path):
        h=hashlib.sha256()
        with path.open('rb') as f:
            for chunk in iter(lambda:f.read(1024*1024), b''):
                h.update(chunk)
        return h.hexdigest()

    def _source_from_name(self, name:str):
        u=name.upper()
        if 'ZMM048' in u:return 'ZMM048'
        if 'ZMM098' in u:return 'ZMM098'
        if 'MB51' in u:return 'MB51'
        if 'MB52' in u:return 'MB52'
        if 'TESIS' in u or 'TESİS' in u:return 'TESIS'
        if 'KET' in u:return 'KET'
        if 'BAKIM' in u:return 'BAKIM'
        if 'LED' in u:return 'LED'
        return None

    def bootstrap_legacy_active(self):
        active = self.app_dir/'parquet'/'ACTIVE'
        if not active.exists(): return 0
        created=0
        rules=self.ruleset_info()
        with self.connect() as con:
            for p in sorted(active.glob('*.parquet')):
                source=self._source_from_name(p.name)
                if not source: continue
                exists=con.execute("SELECT 1 FROM snapshots WHERE source=? LIMIT 1",(source,)).fetchone()
                if exists: continue
                dt=datetime.fromtimestamp(p.stat().st_mtime).astimezone()
                sid=f"{source}-SNP-{dt:%Y%m%d}-000001"
                fh=self._hash_file(p)
                con.execute('''INSERT INTO snapshots(snapshot_id,source,report_time,created_at,active_at,status,layer,row_count,file_hash,file_name,file_path,warning_level,time_basis,ruleset_version,ruleset_hash)
                               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
                            (sid,source,dt.isoformat(),dt.isoformat(),dt.isoformat(),'ACTIVE','03_ACTIVE',None,fh,p.name,str(p),'NORMAL','FILE_MTIME',rules['version'],rules['hash']))
                con.execute("INSERT INTO snapshot_events(snapshot_id,event_time,old_status,new_status,actor,reason) VALUES(?,?,?,?,?,?)",
                            (sid,_now_iso(),None,'ACTIVE','SYSTEM','V3.12.18 mevcut ACTIVE verisi v2 metadata kataloğuna tanıtıldı.'))
                created+=1
        return created

    @staticmethod
    def _logical_source_digest(info: Dict[str,Any]):
        files=[]
        for f in (info or {}).get('files') or []:
            p=Path(f.get('path') or '')
            try:
                st=p.stat()
                files.append({'name':p.name,'role':str(f.get('role') or ''),'size':st.st_size,'mtime_ns':st.st_mtime_ns})
            except Exception:
                files.append({'name':p.name,'role':str(f.get('role') or ''),'size':0,'mtime_ns':0})
        files.sort(key=lambda x:(x['role'],x['name']))
        digest=hashlib.sha256(json.dumps(files,ensure_ascii=False,sort_keys=True).encode('utf-8')).hexdigest()
        return digest,files

    def observe_sources(self, sources: Dict[str,Any]):
        """Kaynak dosya setinin gözlenen sürümünü kaydeder; içerik değiştirmez.

        KESIFLER birleşik kaynağına ek olarak T/K/B/L rolleri TESIS/KET/BAKIM/LED
        olarak ayrı güncellik sürümleri halinde izlenir.
        """
        rules=self.ruleset_info(); now=_now_iso(); out={}
        logical={}
        for source,info in (sources or {}).items():
            if not info: continue
            logical[source]=info
            if source=='KESIFLER':
                role_map={'T':'TESIS','K':'KET','B':'BAKIM','L':'LED'}
                grouped={}
                for f in info.get('files') or []:
                    role=str(f.get('role') or '').upper()
                    if role in role_map: grouped.setdefault(role_map[role],[]).append(f)
                for sub,files in grouped.items(): logical[sub]={'files':files}
        with self.connect() as con:
            for source,info in logical.items():
                digest,files=self._logical_source_digest(info)
                version_id=f"SRC-{source}-{datetime.now():%Y%m%d}-{digest[:10]}"
                sizes=sum(int(x.get('size') or 0) for x in files)
                mtimes=[int(x.get('mtime_ns') or 0) for x in files if int(x.get('mtime_ns') or 0)>0]
                report=datetime.fromtimestamp(max(mtimes)/1e9).astimezone().isoformat() if mtimes else now
                row=con.execute('SELECT version_id FROM source_versions WHERE source=? AND source_digest=?',(source,digest)).fetchone()
                if not row:
                    con.execute('UPDATE source_versions SET is_current=0 WHERE source=?',(source,))
                    con.execute("""INSERT INTO source_versions(version_id,source,source_digest,observed_at,report_time,file_count,total_size,files_json,ruleset_version,ruleset_hash,is_current)
                                   VALUES(?,?,?,?,?,?,?,?,?,?,1)""",
                                (version_id,source,digest,now,report,len(files),sizes,json.dumps(files,ensure_ascii=False),rules['version'],rules['hash']))
                    con.execute('INSERT INTO audit_events(event_time,category,action,actor,object_type,object_id,details_json) VALUES(?,?,?,?,?,?,?)',
                                (now,'SOURCE','SOURCE_VERSION_OBSERVED','SYSTEM','SOURCE',source,json.dumps({'versionId':version_id,'digest':digest,'fileCount':len(files)},ensure_ascii=False)))
                else:
                    version_id=row['version_id']
                    con.execute('UPDATE source_versions SET is_current=CASE WHEN version_id=? THEN 1 ELSE 0 END WHERE source=?',(version_id,source))
                out[source]={'versionId':version_id,'digest':digest,'reportTime':report,'fileCount':len(files),'totalSize':sizes}
        return out

    def current_source_versions(self):
        with self.connect() as con:
            rows=con.execute('SELECT * FROM source_versions WHERE is_current=1 ORDER BY source').fetchall()
        return {r['source']:dict(r) for r in rows}

    def record_index_build(self, state: Dict[str,Any]):
        if not state or not state.get('buildId'): return
        rules=self.ruleset_info()
        q=state.get('quality') or {}
        with self.connect() as con:
            con.execute('''INSERT OR REPLACE INTO index_builds(build_id,source_digest,started_at,finished_at,status,index_path,manifest_path,parquet_root,index_hash,manifest_hash,ruleset_version,ruleset_hash,quality_level,quality_json,error)
                           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',(
                state.get('buildId'),state.get('sourceDigest',''),state.get('startedAt',''),state.get('finishedAt',''),state.get('status',''),
                state.get('indexDb',''),state.get('manifestPath',''),state.get('parquetRoot',''),state.get('indexHash',''),state.get('manifestHash',''),
                state.get('rulesetVersion') or rules['version'],state.get('rulesetHash') or rules['hash'],q.get('level','NORMAL'),json.dumps(q,ensure_ascii=False),state.get('error','')
            ))

    def snapshots(self, source=None, limit=200):
        """Kaynak sürüm geçmişi + varsa eski snapshot kataloğunu tek görünümde döndürür."""
        items=[]
        with self.connect() as con:
            if source:
                sv=con.execute('SELECT * FROM source_versions WHERE source=? ORDER BY observed_at DESC LIMIT ?',(source,int(limit))).fetchall()
                old=con.execute('SELECT * FROM snapshots WHERE source=? ORDER BY created_at DESC LIMIT ?',(source,int(limit))).fetchall()
            else:
                sv=con.execute('SELECT * FROM source_versions ORDER BY observed_at DESC LIMIT ?',(int(limit),)).fetchall()
                old=con.execute('SELECT * FROM snapshots ORDER BY created_at DESC LIMIT ?',(int(limit),)).fetchall()
        for r in sv:
            d=dict(r);items.append({
                'snapshot_id':d.get('version_id'),'source':d.get('source'),'report_time':d.get('report_time'),'created_at':d.get('observed_at'),
                'active_at':d.get('observed_at') if d.get('is_current') else None,'status':'ACTIVE' if d.get('is_current') else 'HISTORY',
                'layer':'SOURCE','row_count':None,'file_hash':d.get('source_digest'),'file_name':f"{d.get('file_count') or 0} kaynak dosyası",
                'file_path':'','previous_snapshot_id':'','warning_level':'','manual_approval':0,'manual_reason':'','time_basis':'SOURCE_FILE_MTIME',
                'ruleset_version':d.get('ruleset_version'),'ruleset_hash':d.get('ruleset_hash'),'source_digest':d.get('source_digest'),'index_build_id':''
            })
        items.extend(dict(r) for r in old)
        items.sort(key=lambda x:str(x.get('created_at') or x.get('report_time') or ''),reverse=True)
        return items[:int(limit)]

    def _last_integrity(self, scope='ACTIVE'):
        with self.connect() as con:
            r=con.execute('SELECT * FROM integrity_checks WHERE scope=? ORDER BY check_time DESC LIMIT 1',(scope,)).fetchone()
        return dict(r) if r else None

    def record_integrity_result(self, scope, status, checked, failed, details):
        with self.connect() as con:
            con.execute('INSERT INTO integrity_checks(check_time,scope,status,checked_count,failed_count,details_json) VALUES(?,?,?,?,?,?)',
                        (_now_iso(),scope,status,int(checked),int(failed),json.dumps(details,ensure_ascii=False)))

    def verify_active_engine(self, engine_state: Dict[str,Any], force=False):
        """ACTIVE indeks/manifest/parquet bütünlüğünü doğrular. Ağır olduğu için günlük yapılır."""
        last=self._last_integrity('ACTIVE_ENGINE')
        if not force and last:
            try:
                dt=datetime.fromisoformat(last['check_time'])
                if dt.tzinfo is None: dt=dt.replace(tzinfo=datetime.now().astimezone().tzinfo)
                if datetime.now().astimezone()-dt < timedelta(days=1):
                    return {**last,'details':json.loads(last.get('details_json') or '{}')}
            except Exception: pass
        checked=0; failures=[]; details={'buildId':engine_state.get('buildId'),'files':[]}
        targets=[]
        for key,expected in [('indexDb',engine_state.get('indexHash')),('manifestPath',engine_state.get('manifestHash'))]:
            raw=engine_state.get(key)
            if raw: targets.append((key,Path(raw),expected))
        for pinfo in engine_state.get('parquetFiles') or []:
            raw=pinfo.get('path'); expected=pinfo.get('sha256')
            if raw: targets.append(('parquet',Path(raw),expected))
        for kind,p,expected in targets:
            checked+=1
            item={'kind':kind,'path':str(p),'expected':expected or ''}
            if not p.exists():
                item['status']='MISSING'; failures.append(item);details['files'].append(item);continue
            try:
                actual=self._hash_file(p);item['actual']=actual
                if expected and actual!=expected:
                    item['status']='HASH_MISMATCH';failures.append(item)
                else:item['status']='OK'
            except Exception as exc:
                item['status']='ERROR';item['error']=str(exc);failures.append(item)
            details['files'].append(item)
        status='CRITICAL' if failures else 'NORMAL'
        self.record_integrity_result('ACTIVE_ENGINE',status,checked,len(failures),details)
        return {'check_time':_now_iso(),'scope':'ACTIVE_ENGINE','status':status,'checked_count':checked,'failed_count':len(failures),'details':details}

    def verify_layer_due(self, layer, days, force=False):
        scope=f'LAYER_{layer}'
        last=self._last_integrity(scope)
        if not force and last:
            try:
                dt=datetime.fromisoformat(last['check_time'])
                if datetime.now().astimezone()-dt < timedelta(days=days):
                    return {**last,'details':json.loads(last.get('details_json') or '{}')}
            except Exception: pass
        base=self.root/layer; checked=0; failures=[]; files=[]; now=_now_iso()
        with self.connect() as con:
            for p in base.rglob('*') if base.exists() else []:
                if not p.is_file(): continue
                checked+=1;rel=str(p.relative_to(self.root))
                try:
                    h=self._hash_file(p);baseline=con.execute('SELECT file_hash FROM integrity_baselines WHERE scope=? AND file_path=?',(scope,rel)).fetchone()
                    if baseline is None:
                        con.execute('INSERT INTO integrity_baselines(scope,file_path,file_hash,first_seen,last_seen) VALUES(?,?,?,?,?)',(scope,rel,h,now,now));status='BASELINE_CREATED'
                    elif baseline['file_hash']!=h:
                        status='HASH_MISMATCH';failures.append({'path':str(p),'expected':baseline['file_hash'],'actual':h,'status':'HASH_MISMATCH'})
                    else:
                        status='OK';con.execute('UPDATE integrity_baselines SET last_seen=? WHERE scope=? AND file_path=?',(now,scope,rel))
                    files.append({'path':str(p),'sha256':h,'status':status})
                except Exception as exc:
                    failures.append({'path':str(p),'error':str(exc)}); files.append({'path':str(p),'status':'ERROR'})
            # Baseline'da olup artık katmanda bulunmayan dosyalar da bütünlük ihlalidir.
            current={str(p.relative_to(self.root)) for p in base.rglob('*') if p.is_file()} if base.exists() else set()
            for r in con.execute('SELECT file_path,file_hash FROM integrity_baselines WHERE scope=?',(scope,)).fetchall():
                if r['file_path'] not in current:
                    failures.append({'path':r['file_path'],'expected':r['file_hash'],'status':'MISSING'})
        status='CRITICAL' if failures else 'NORMAL';details={'files':files[:500],'failures':failures[:100],'truncated':len(files)>500}
        self.record_integrity_result(scope,status,checked,len(failures),details)
        return {'check_time':_now_iso(),'scope':scope,'status':status,'checked_count':checked,'failed_count':len(failures),'details':details}

    def run_integrity_due(self, engine_state=None, force=False):
        results=[]
        if engine_state and engine_state.get('buildId'):
            results.append(self.verify_active_engine(engine_state,force=force))
        results.append(self.verify_layer_due('04_HISTORY',7,force=force))
        results.append(self.verify_layer_due('05_ARCHIVE',30,force=force))
        overall='CRITICAL' if any((r or {}).get('status')=='CRITICAL' for r in results) else 'NORMAL'
        return {'overall':overall,'results':results}

    def scan_quarantine(self):
        now=_now_iso(); inserted=0
        with self.connect() as con:
            for p in (self.root/'06_QUARANTINE').rglob('*'):
                if not p.is_file(): continue
                source=p.parent.name if p.parent.name!='06_QUARANTINE' else (self._source_from_name(p.name) or 'UNKNOWN')
                qid='Q-'+hashlib.sha256(str(p).encode('utf-8')).hexdigest()[:16].upper()
                if not con.execute('SELECT 1 FROM quarantine_records WHERE quarantine_id=?',(qid,)).fetchone():
                    con.execute('INSERT INTO quarantine_records(quarantine_id,source,original_path,quarantine_path,reason,created_at,status) VALUES(?,?,?,?,?,?,?)',
                                (qid,source,'',str(p),'Dosya QUARANTINE katmanında bulundu.',now,'QUARANTINED'));inserted+=1
        return inserted

    def quarantine_items(self, limit=200):
        self.scan_quarantine()
        with self.connect() as con:
            rows=con.execute('SELECT * FROM quarantine_records ORDER BY created_at DESC LIMIT ?',(int(limit),)).fetchall()
        return [dict(r) for r in rows]

    def reprocess_quarantine(self, quarantine_id, actor='SYSTEM'):
        """Karantina kaydını silmeden yeni INBOX girdisi oluşturur.

        Dış SAP kaynak klasörünü otomatik değiştirmez; böylece sağlıklı ACTIVE kaynak
        kullanıcı onayı olmadan üzerine yazılmaz. Yeni ingest zinciri önceki Q-ID ile bağlıdır.
        """
        with self.connect() as con:
            row=con.execute('SELECT * FROM quarantine_records WHERE quarantine_id=?',(str(quarantine_id),)).fetchone()
            if not row: raise ValueError('Quarantine kaydı bulunamadı.')
            src=Path(row['quarantine_path'])
            if not src.exists(): raise FileNotFoundError('Quarantine dosyası bulunamadı: '+str(src))
            source=str(row['source'] or 'UNKNOWN')
            target_dir=self.root/'00_INBOX'/source; target_dir.mkdir(parents=True,exist_ok=True)
            stamp=datetime.now().strftime('%Y%m%d_%H%M%S')
            target=target_dir/f'{src.stem}_REPROCESS_{stamp}{src.suffix}'
            shutil.copy2(src,target)
            digest=self._hash_file(target); vid=f'INGEST-{source}-{stamp}-{digest[:8]}'
            con.execute('UPDATE quarantine_records SET status=?,reprocess_version_id=?,reprocessed_at=? WHERE quarantine_id=?',('REPROCESS_QUEUED',vid,_now_iso(),quarantine_id))
            con.execute('INSERT INTO audit_events(event_time,category,action,actor,object_type,object_id,details_json) VALUES(?,?,?,?,?,?,?)',
                        (_now_iso(),'QUARANTINE','REPROCESS_QUEUED',actor,'QUARANTINE',quarantine_id,json.dumps({'inboxPath':str(target),'ingestVersionId':vid,'previousQuarantineId':quarantine_id},ensure_ascii=False)))
        return {'quarantineId':quarantine_id,'ingestVersionId':vid,'inboxPath':str(target),'status':'REPROCESS_QUEUED'}

    def health(self, engine_state=None, quality=None):
        now=datetime.now().astimezone(); items=[]; src_versions=self.current_source_versions()
        # Güncellik kaynağın gerçek gözlenen sürümünden hesaplanır; indeks yaşıyla karıştırılmaz.
        for source,limit in FRESHNESS_HOURS.items():
            row=src_versions.get(source)
            if not row: continue
            try: stamp=datetime.fromisoformat(row.get('report_time') or row.get('observed_at'))
            except Exception: stamp=now
            if stamp.tzinfo is None: stamp=stamp.replace(tzinfo=now.tzinfo)
            age=max(0,(now-stamp).total_seconds()/3600);ratio=age/limit if limit else 0
            level='CRITICAL' if ratio>=1 else ('WARNING' if ratio>=.8 else 'NORMAL')
            items.append({
                'source':source,'snapshot_id':row.get('version_id'),'report_time':row.get('report_time'),'created_at':row.get('observed_at'),
                'source_digest':row.get('source_digest'),'file_count':row.get('file_count'),'total_size':row.get('total_size'),
                'age_hours':round(age,2),'freshness_limit_hours':limit,'health':level,'remaining_hours':round(max(0,limit-age),2),
                'time_basis':'SOURCE_FILE_MTIME'
            })
        overall='NORMAL'
        if any(x['health']=='CRITICAL' for x in items): overall='CRITICAL'
        elif any(x['health']=='WARNING' for x in items): overall='WARNING'
        backup_root=self.root/'08_BACKUP';backups=[p for p in backup_root.rglob('*') if p.is_file()]
        last_backup=max((p.stat().st_mtime for p in backups), default=None)
        rules=self.ruleset_info(); integ=self._last_integrity('ACTIVE_ENGINE')
        if integ and integ.get('status')=='CRITICAL': overall='CRITICAL'
        if quality and quality.get('level')=='CRITICAL': overall='CRITICAL'
        elif quality and quality.get('level')=='WARNING' and overall=='NORMAL': overall='WARNING'
        engine=engine_state or {}
        if engine.get('status') in ('FAILED','MISSING'): overall='CRITICAL'
        elif engine.get('status') in ('STALE','REBUILDING') and overall=='NORMAL': overall='WARNING'
        return {
            'architectureVersion':'2.0','overall':overall,'sources':items,
            'activeCount':sum(1 for x in items if x['health']=='NORMAL'),
            'warningCount':sum(1 for x in items if x['health']=='WARNING'),
            'criticalCount':sum(1 for x in items if x['health']=='CRITICAL'),
            'lastBackup': datetime.fromtimestamp(last_backup).astimezone().isoformat() if last_backup else None,
            'restoreTest':'Henüz çalıştırılmadı','retention':RETENTION,'layers':LAYERS,'root':str(self.root),
            'ruleset':rules,'sourceVersions':src_versions,'engine':engine,'quality':quality or {},
            'integrity':dict(integ) if integ else None
        }

    def config(self):
        with self.connect() as con:
            settings={r['key']:r['value'] for r in con.execute('SELECT key,value FROM settings')}
        return {'freshnessHours':FRESHNESS_HOURS,'retention':RETENTION,'roles':ROLE_MATRIX,'settings':settings,'layers':LAYERS,'ruleset':self.ruleset_info()}

    def actions(self):
        with self.connect() as con:
            rows=con.execute('SELECT * FROM actions ORDER BY created_at DESC LIMIT 500').fetchall()
        return [dict(r) for r in rows]
