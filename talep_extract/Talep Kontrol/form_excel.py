"""FIX28F pilot: the 4 approved F.603/revision Excel sheets, read-only preview.
No database, no UNC writes, no final approval. Only Python standard library.
"""
from __future__ import annotations
from pathlib import Path
from decimal import Decimal, InvalidOperation
from collections import defaultdict
import hashlib, re, zipfile, xml.etree.ElementTree as ET

NS='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
RNS='{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
FORMATS={
 'TESIS': {'label':'TESİS Malzeme Talep F.603','sheet':'Tesis Malzeme Talep F.603','template':'TESIS_MALZEME_TALEP_F603_KURUMSAL.xlsx','kind':'TALEP'},
 'KET_BAKIM': {'label':'KET–BAKIM Malzeme Talep F.603','sheet':'Ket - Bakım Malzeme Talep F.603','template':'KET_BAKIM_MALZEME_TALEP_F603_KURUMSAL.xlsx','kind':'TALEP'},
 'LED': {'label':'LED Malzeme Talep F.603','sheet':'F.603','template':'LED_MALZEME_TALEP_F603_KURUMSAL.xlsx','kind':'TALEP'},
 'REVIZE': {'label':'Revize Keşif Talep','sheet':'Revize Keşif Talep','template':'REVIZE_KESIF_KURUMSAL.xlsx','kind':'REVIZE_KESIF'},
}
MAX_COMPRESSED=22*1024*1024
MAX_UNCOMPRESSED=200*1024*1024
MAX_SHEET=100*1024*1024
MAX_ROWS=20000
MAX_QTY=Decimal('999999999999.999')

class FormError(ValueError):pass

def _cellcol(s):
 c=''.join(x for x in s if 'A'<=x<='Z');n=0
 for x in c:n=n*26+ord(x)-64
 return n

def _col(i):
 s=''
 while i: i,r=divmod(i-1,26);s=chr(65+r)+s
 return s

def _text(el):return ''.join(x.text or '' for x in el.iter() if x.tag==NS+'t')

def _workbook(z):
 try:
  wb=ET.fromstring(z.read('xl/workbook.xml'));rels=ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
 except Exception as e:raise FormError('Excel çalışma kitabının iç yapısı okunamadı.') from e
 rm={x.attrib.get('Id'):x.attrib.get('Target') for x in rels}
 out={}
 for sh in wb.findall('.//'+NS+'sheet'):
  rel=rm.get(sh.attrib.get(RNS+'id'),'');
  if not rel:continue
  path=rel.lstrip('/')
  if not path.startswith('xl/'):path='xl/'+path.lstrip('./')
  if '..' in path.split('/'):raise FormError('Geçersiz sayfa yolu.')
  out[sh.attrib['name']]=path
 return out

def _shared(z):
 if 'xl/sharedStrings.xml' not in z.namelist():return []
 vals=[]
 with z.open('xl/sharedStrings.xml') as fh:
  for ev,el in ET.iterparse(fh,events=('end',)):
   if el.tag==NS+'si':vals.append(_text(el));el.clear()
 return vals

def read_rows(source, sheet):
 """Yield (true Excel row number, {column_index: {'text', 'formula'}})."""
 path=Path(source)
 if not path.is_file():raise FormError('Excel dosyası bulunamadı.')
 if path.suffix.lower()!='.xlsx':raise FormError('Yalnız .xlsx biçimi desteklenir.')
 if path.stat().st_size>MAX_COMPRESSED:raise FormError('Excel dosyası boyut sınırını aşıyor.')
 with zipfile.ZipFile(path,'r') as z:
  if len(z.infolist())>3000 or sum(f.file_size for f in z.infolist())>MAX_UNCOMPRESSED:raise FormError('Excel içeriği güvenlik boyut sınırını aşıyor.')
  if any(f.filename.startswith('xl/vbaProject') for f in z.infolist()):raise FormError('Makro içeren dosyalar bu işlemde kabul edilmez.')
  shs=_workbook(z)
  if sheet not in shs:raise FormError('Beklenen sayfa bulunamadı: '+sheet)
  info=z.getinfo(shs[sheet])
  if info.file_size>MAX_SHEET:raise FormError('Hedef sayfa boyut sınırını aşıyor.')
  strings=_shared(z)
  with z.open(shs[sheet]) as fh:
   for event,row in ET.iterparse(fh,events=('end',)):
    if row.tag!=NS+'row':continue
    ri=int(row.attrib.get('r','0'))
    if ri>MAX_ROWS:raise FormError('Excel satır sayısı limitini aşıyor.')
    cells={}
    for c in row:
     if c.tag!=NS+'c':continue
     idx=_cellcol(c.attrib.get('r',''))
     if idx<1 or idx>16384:continue
     typ=c.attrib.get('t','');v=c.find(NS+'v');inline=c.find(NS+'is');f=c.find(NS+'f')
     raw=(v.text or '') if v is not None else ''
     if typ=='s':
      try:txt=strings[int(raw)]
      except (ValueError,IndexError):txt=''
     elif typ=='inlineStr' and inline is not None:txt=_text(inline)
     else:txt=raw
     cells[idx]={'text':str(txt or '').strip(),'formula':f is not None}
    yield ri,cells
    row.clear()

def _v(cells, col):return (cells.get(_cellcol(col)) or {}).get('text','')

def _is_valid_position(code):return bool(code and code not in ('0','0.0','-','—'))

def _quantity(value):
 s=str(value or '').strip().replace(' ','').replace('\xa0','')
 if not s:return None
 if s.count(',') and s.count('.'):
  s=s.replace('.','').replace(',','.') if s.rfind(',')>s.rfind('.') else s.replace(',','')
 elif ',' in s:s=s.replace(',','.')
 try: d=Decimal(s)
 except InvalidOperation:raise FormError('Miktar sayısal değil: '+str(value)[:30])
 if not d.is_finite() or abs(d)>MAX_QTY:raise FormError('Miktar aralık dışında: '+str(value)[:30])
 return d

def preview(path, form_key, max_preview=75):
 key=str(form_key or '').upper().strip()
 if key not in FORMATS:raise FormError('Geçersiz form türü.')
 spec=FORMATS[key];head={};results=[];errors=[];warnings=[];stats=defaultdict(int);sha=hashlib.sha256(Path(path).read_bytes()).hexdigest();headers={}
 for row,c in read_rows(path,spec['sheet']):
  if row<=8:head[row]=c
  if key=='TESIS':
   if row==8:
    for ci,cell in c.items():
     if ci>=11 and cell['text'] and not cell['text'].isdigit():headers[ci]=cell['text']
    continue
   if row<9:continue
   td=_v(c,'C');name=_v(c,'E');unit=_v(c,'G');sap=_v(c,'B')
   if not _is_valid_position(td) or not name:continue
   if not unit or unit in ('0','0.0'):continue
   for ci,proj in headers.items():
    cell=c.get(ci) or {};raw=cell.get('text','')
    if not raw or cell.get('formula'):continue
    try:qty=_quantity(raw)
    except FormError:
     if len(warnings)<100:warnings.append(f'Satır {row} / {_col(ci)}: miktar dışı içerik: {raw[:30]}')
     continue
    if qty is not None and qty!=0:
     stats['filled']+=1
     if len(results)<max_preview:results.append({'row':row,'tedas':td,'sap':sap,'name':name,'unit':unit,'scope':proj,'quantity':str(qty),'column':_col(ci)})
  elif key=='KET_BAKIM':
   if row<9:continue
   td=_v(c,'C');name=_v(c,'E');unit=_v(c,'G');sap=_v(c,'B');value=c.get(10) or {}
   if not _is_valid_position(td) or not name or not unit or unit in ('0','0.0'):continue
   if not value.get('text') or value.get('formula'):continue
   try:qty=_quantity(value['text'])
   except FormError:
    if len(warnings)<100:warnings.append(f'Satır {row} / J: miktar dışı: {value["text"][:30]}')
    continue
   if qty is not None and qty!=0:
    stats['filled']+=1
    if len(results)<max_preview:results.append({'row':row,'tedas':td,'sap':sap,'name':name,'unit':unit,'scope':'DEPO','quantity':str(qty),'column':'J'})
  elif key=='LED':
   # H=ihale keşfi (reference), J=verilen toplam (formula). Actual requests appear in K+ columns.
   if row<10:continue
   td=_v(c,'C');name=_v(c,'E');unit=_v(c,'F');sap=_v(c,'B')
   if not _is_valid_position(td) or not unit or not name:continue
   for ci,cell in c.items():
    if ci<11 or cell.get('formula') or not cell.get('text'):continue
    try:qty=_quantity(cell['text'])
    except FormError:
     if len(warnings)<100:warnings.append(f'Satır {row} / {_col(ci)}: sayısal olmayan: {cell["text"][:30]}')
     continue
    if qty is not None and qty!=0:
     stats['filled']+=1
     if len(results)<max_preview:results.append({'row':row,'tedas':td,'sap':sap,'name':name,'unit':unit,'scope':'TESISAT / IS SUTUNU '+_col(ci),'quantity':str(qty),'column':_col(ci)})
   # LED may have K+ column semantics unknown, MUST remain review-only.
  elif key=='REVIZE':
   if row<8:continue
   td=_v(c,'C');name=_v(c,'E');unit=_v(c,'G');sap=_v(c,'B')
   if not _is_valid_position(td) or not name or not unit or unit in ('0','0.0'):continue
   for ci,cell in c.items():
    if ci<15 or ci>60 or cell.get('formula') or not cell.get('text'):continue
    try:qty=_quantity(cell['text'])
    except FormError:
     if len(warnings)<100:warnings.append(f'Satır {row} / {_col(ci)}: sayısal olmayan: {cell["text"][:30]}')
     continue
    if qty is not None and qty!=0:
     stats['filled']+=1
     if len(results)<max_preview:results.append({'row':row,'tedas':td,'sap':sap,'name':name,'unit':unit,'scope':'REVIZE '+str(ci-14),'quantity':str(qty),'column':_col(ci)})
 meta={}
 if key in ('TESIS','KET_BAKIM'):
  for tag,nr in [('firma',3),('grup',4),('sozlesme',5),('depo',6)]:meta[tag]=_v(head.get(nr,{}),'H')
 elif key=='LED':meta={k:_v(head.get(nr,{}),'G') for k,nr in [('sozlesme',3),('grup',4),('firma',5),('depo',6)]}
 else:meta={'sozlesme':_v(head.get(2,{}),'E'),'firma':_v(head.get(3,{}),'E'),'tur':_v(head.get(4,{}),'E'),'depo':_v(head.get(5,{}),'E')}
 # Non-automatable checks: no silent project-name mapping, no publishing, no revision stacking.
 if key=='TESIS' and stats['filled'] and not headers:warnings.append('Proje başlıkları bulunamadı.')
 if key=='TESIS' and stats['filled']:warnings.append('Proje başlıkları benzersiz proje kimliğiyle merkezi ana veriden doğrulanmalı.')
 if key=='LED' and stats['filled']:warnings.append('Tesisat No/İş Adı/PYP ilişkisi yetkili kontrolünden geçmeden kesin kayıt oluşturulmaz.')
 if key=='REVIZE' and stats['filled']:warnings.append('Revizyon farkları geçmiş revizyon kimliği ve sürümüyle mutabık olmadan uygulanmaz.')
 if not stats['filled']:warnings.append('Belirtilen giriş sütunlarında dolu miktar yok; boş form veya doldurulmamış satırlar olabilir.')
 return {'key':key,'formName':spec['label'],'sheet':spec['sheet'],'kind':spec['kind'],'fileSha256':sha,'metadata':meta,'count':stats['filled'],'records':results,'previewLimited':stats['filled']>len(results),'warnings':warnings,'errors':errors,'status':'LOCAL_PREVIEW_ONLY','canPublish':False}
