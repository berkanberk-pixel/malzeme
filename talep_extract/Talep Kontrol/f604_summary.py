"""FIX28P — F.604 parasal icmal only, optional read-only Excel preview.
Original XLSX/XLSM bytes are NEVER modified. Data is NOT an approved/published value.
"""
from __future__ import annotations
import csv
from functools import lru_cache
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import zipfile

NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
FIELDS={'J':'contractAmount','K':'discovery','L':'requested','N':'given','P':'requestGivenDiff','R':'consumed','T':'givenConsumedDiff','V':'consumptionRatio','X':'givenRatio'}
GROUPS={7:('BIRIM','Birim Miktar Toplamı'),10:('TEDAS','TEDAŞ Malzeme Fiyatı'),13:('SAP','SAP Malzeme Fiyatı')}
MAX_FILES=25
MAX_BYTES=32*1024*1024

def _get_string(cell,shared):
    value=cell.find('{%s}v'%NS)
    if value is None:
        inline=cell.find('{%s}is'%NS)
        return ''.join(inline.itertext()).strip() if inline is not None else None
    raw=value.text
    if raw is None:return None
    if cell.attrib.get('t')=='s':
        try:return shared[int(raw)]
        except (ValueError,IndexError):return None
    if cell.attrib.get('t') in ('str','inlineStr','e','b'):return raw
    return raw

def _numeric(value):
    if value is None or str(value).strip()=='':return None
    try:return float(value)
    except (ValueError,OverflowError,TypeError):return None

@lru_cache(maxsize=32)
def read_source(path_string,mtime_ns,size):
    path=Path(path_string)
    if not path.is_file() or not 0<size<=MAX_BYTES:raise ValueError('Dosya boyutu geçersiz.')
    with zipfile.ZipFile(path) as z:
        shared=[]
        if 'xl/sharedStrings.xml' in z.namelist():
            root=ET.fromstring(z.read('xl/sharedStrings.xml'))
            shared=[''.join(t.text or '' for t in entry.iter('{%s}t'%NS)) for entry in root]
        workbook=ET.fromstring(z.read('xl/workbook.xml'))
        rels=ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
        targets={r.attrib['Id']:r.attrib['Target'] for r in rels}
        selected=None
        for entry in workbook.findall('.//{%s}sheet'%NS):
            name=entry.attrib.get('name','')
            if 'Parasal İcmal' in name and name.strip().endswith('Parasal İcmal'):
                selected=entry;break
        if selected is None:raise ValueError('Parasal İcmal sayfası bulunamadı.')
        target=targets.get(selected.attrib.get('{%s}id'%REL),'')
        src=target.lstrip('/') if target.startswith('/') else 'xl/'+target
        if src not in z.namelist():raise ValueError('Seçilen sayfa okunamıyor.')
        tree=ET.fromstring(z.read(src))
        rows={}
        for row in tree.findall('.//{%s}sheetData/{%s}row'%(NS,NS)):
            rn=int(row.attrib.get('r','0'))
            if rn not in GROUPS:continue
            vals={}
            for cell in row.findall('{%s}c'%NS):
                col=re.match('[A-Z]+',cell.attrib.get('r',''))
                if col:vals[col.group()]=_get_string(cell,shared)
            rows[rn]=vals
        result=[]
        for rn,(typ,name) in GROUPS.items():
            cells=rows.get(rn,{})
            if not cells or str(cells.get('B') or '').strip()!=name:continue
            record={'group':typ,'groupLabel':name,'city':cells.get('D') or '',
              'depot':cells.get('E') or '', 'depotName':cells.get('F') or '',
              'contractNo':cells.get('G') or '', 'contractGroup':cells.get('H') or '',
              'company':cells.get('I') or '', 'row':rn}
            for k,out in FIELDS.items():record[out]=_numeric(cells.get(k))
            result.append(record)
        if len(result)!=3:raise ValueError('F.604 üç icmal satırı birlikte doğrulanamadı.')
        depots={r['depot'] for r in result}
        contracts={r['contractNo'] for r in result}
        if len(depots)!=1 or not next(iter(depots)) or len(contracts)!=1:
            raise ValueError('F.604 depo/sözleşme satırları tutarsız.')
        return result

def get_report(app_root,depot='',plant='',query=''):
    app_root=Path(app_root);depot=str(depot or '').strip().upper();plant=str(plant or '').strip();query=str(query or '').strip().casefold()
    location=app_root/'data_v2'/'02_STANDARD'/'F604_ONIZLEME_KAYNAKLARI'
    sources=[];warnings=[]
    if location.is_dir():
        for p in sorted(location.iterdir(),key=lambda p:p.name.casefold())[:MAX_FILES]:
            if p.is_symlink() or not p.is_file() or p.suffix.lower() not in ('.xlsx','.xlsm'):continue
            try:
                stat=p.stat()
                if stat.st_size>MAX_BYTES:raise ValueError('32 MB üzeri kaynak atlandı.')
                entries=read_source(str(p.resolve()),stat.st_mtime_ns,stat.st_size)
                sources.append((stat.st_mtime_ns,str(p.name),entries,'LOCAL_EXCEL_ONIZLEME'))
            except (OSError,ValueError,ET.ParseError,zipfile.BadZipFile,KeyError) as exc:
                warnings.append(p.name+': '+str(exc)[:125])
    # Reference workbook excerpt is explicitly a design DEMO, not the current source of truth.
    sample=app_root/'reference'/'f604-example.json'
    if sample.is_file():
        try:
            entries=json.loads(sample.read_text('utf-8'))['records']
            sources.append((-1,'2026 Bakım – Samsun İlkadım – H.Güner.xlsm (REFERANS)',entries,'ORNEK_REFERANS'))
        except (OSError,ValueError,KeyError):pass
    unique={}
    # Local files replace example for same depot/contract; latest file wins.
    for timestamp,name,entries,kind in sorted(sources,key=lambda x:x[0]):
        key=(entries[0].get('depot','').upper(),entries[0].get('contractNo',''))
        unique[key]=(name,entries,kind)
    depot_plants={}
    master=app_root/'csv'/'TB_Depo_Kodlari.csv'
    if master.is_file():
        try:
            with master.open('r',encoding='utf-8-sig',newline='') as file:
                for r in csv.DictReader(file,delimiter=';'):
                    if r.get('Depo_yeri'):depot_plants[r['Depo_yeri'].upper()]=r.get('UY','')
        except (OSError,UnicodeError):pass
    allrecords=[];examples=0;localcount=0
    for (dp,contract),(filename,items,kind) in sorted(unique.items()):
        if depot and dp!=depot:continue
        if plant and depot_plants.get(dp)!=plant:continue
        if query and not any(query in str(item.get(k,'')).casefold() for item in items for k in ('depot','company','contractNo','contractGroup','city')):continue
        for item in items:
            row=dict(item);row['plant']=depot_plants.get(dp,'');row['sourceFile']=filename;row['sourceKind']=kind
            allrecords.append(row)
        if kind=='ORNEK_REFERANS':examples+=1
        else:localcount+=1
    return {'rows':allrecords,'contracts':len(allrecords)//3,'referenceContracts':examples,
            'localPreviewContracts':localcount,'warnings':warnings[:8],
            'sourceNotice':'F.604 Excel örneği/yerel önizleme; ACTIVE veya PUBLISHED değildir. Formül değerleri Excel dosyasının kayıtlı sonuçlarıdır. Kaynak güncelliği ve resmî onay ayrıca doğrulanmalıdır.',
            'locationHint':'data_v2/02_STANDARD/F604_ONIZLEME_KAYNAKLARI'}
