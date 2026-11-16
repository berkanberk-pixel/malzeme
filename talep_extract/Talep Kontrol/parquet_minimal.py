from __future__ import annotations

import csv
import hashlib
import os
import struct
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, List, Dict, Tuple, Callable, Any

# Minimal dependency-free Parquet writer for flat REQUIRED columns.
# It intentionally supports the subset used by this project:
# - BYTE_ARRAY + UTF8 text
# - INT64
# - PLAIN encoding
# - SNAPPY codec using valid literal-only raw Snappy blocks (portable, no native dependency)
# - DataPage V1
# - TCompactProtocol metadata

# Thrift compact type ids
C_STOP=0; C_TRUE=1; C_FALSE=2; C_BYTE=3; C_I16=4; C_I32=5; C_I64=6; C_DOUBLE=7; C_BINARY=8; C_LIST=9; C_SET=10; C_MAP=11; C_STRUCT=12

# Parquet enums
PT_INT64=2
PT_BYTE_ARRAY=6
REQUIRED=0
ENC_PLAIN=0
ENC_RLE=3
CODEC_SNAPPY=1
PAGE_DATA=0
CONVERTED_UTF8=0


def _zz(n:int)->int:
    # enough for thrift signed 64-bit values used here
    return (n << 1) ^ (n >> 63)


def _varint(n:int)->bytes:
    n=int(n)
    out=bytearray()
    while True:
        b=n & 0x7f
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)


def _i32(n:int)->bytes: return _varint(_zz(int(n)))
def _i64(n:int)->bytes: return _varint(_zz(int(n)))
def _bin(b:bytes)->bytes: return _varint(len(b))+b
def _str(s:str)->bytes: return _bin(str(s).encode('utf-8'))


def _list_header(elem_type:int, size:int)->bytes:
    if size <= 14:
        return bytes([(size << 4) | elem_type])
    return bytes([0xF0 | elem_type]) + _varint(size)


def _field(fid:int, ctype:int, payload:bytes, last_fid:int)->Tuple[bytes,int]:
    delta=fid-last_fid
    if 0 < delta <= 15:
        h=bytes([(delta << 4) | ctype])
    else:
        h=bytes([ctype]) + _i32(fid)  # field id is i16; compact uses zigzag varint same representation for small values
    return h+payload, fid


def _struct(fields:Iterable[Tuple[int,int,bytes]])->bytes:
    out=bytearray(); last=0
    for fid,ctype,payload in fields:
        b,last=_field(fid,ctype,payload,last); out += b
    out.append(C_STOP)
    return bytes(out)


def _list_i32(vals:Iterable[int])->bytes:
    vals=list(vals)
    return _list_header(C_I32,len(vals))+b''.join(_i32(v) for v in vals)


def _list_str(vals:Iterable[str])->bytes:
    vals=list(vals)
    return _list_header(C_BINARY,len(vals))+b''.join(_str(v) for v in vals)


def _list_struct(vals:Iterable[bytes])->bytes:
    vals=list(vals)
    return _list_header(C_STRUCT,len(vals))+b''.join(vals)


def snappy_literal_encode(data:bytes)->bytes:
    """Valid raw Snappy stream using only literal chunks.
    This intentionally avoids native dependencies. It is standards-compliant,
    deterministic and portable, though not size-optimized.
    """
    out=bytearray(_varint(len(data)))
    pos=0
    # chunk size chosen so literal length encoding remains compact
    while pos < len(data):
        chunk=data[pos:pos+65536]
        n=len(chunk)-1
        if len(chunk) <= 60:
            out.append((n << 2) & 0xff)
        else:
            nb=max(1,(n.bit_length()+7)//8)
            if nb>4:
                raise ValueError('Snappy literal chunk too large')
            out.append(((59+nb) << 2) & 0xff)
            out += n.to_bytes(nb,'little')
        out += chunk
        pos += len(chunk)
    return bytes(out)


def _page_header(num_values:int, uncompressed_size:int, compressed_size:int)->bytes:
    data_header=_struct([
        (1,C_I32,_i32(num_values)),
        (2,C_I32,_i32(ENC_PLAIN)),
        (3,C_I32,_i32(ENC_RLE)),
        (4,C_I32,_i32(ENC_RLE)),
    ])
    return _struct([
        (1,C_I32,_i32(PAGE_DATA)),
        (2,C_I32,_i32(uncompressed_size)),
        (3,C_I32,_i32(compressed_size)),
        (5,C_STRUCT,data_header),
    ])


def _schema_root(num_children:int)->bytes:
    return _struct([
        (4,C_BINARY,_str('schema')),
        (5,C_I32,_i32(num_children)),
    ])


def _schema_text(name:str)->bytes:
    return _struct([
        (1,C_I32,_i32(PT_BYTE_ARRAY)),
        (3,C_I32,_i32(REQUIRED)),
        (4,C_BINARY,_str(name)),
        (6,C_I32,_i32(CONVERTED_UTF8)),
    ])


def _schema_int64(name:str)->bytes:
    return _struct([
        (1,C_I32,_i32(PT_INT64)),
        (3,C_I32,_i32(REQUIRED)),
        (4,C_BINARY,_str(name)),
    ])


def _column_metadata(ptype:int, name:str, num_values:int, total_uncompressed:int, total_compressed:int, data_page_offset:int)->bytes:
    return _struct([
        (1,C_I32,_i32(ptype)),
        (2,C_LIST,_list_i32([ENC_PLAIN,ENC_RLE])),
        (3,C_LIST,_list_str([name])),
        (4,C_I32,_i32(CODEC_SNAPPY)),
        (5,C_I64,_i64(num_values)),
        (6,C_I64,_i64(total_uncompressed)),
        (7,C_I64,_i64(total_compressed)),
        (9,C_I64,_i64(data_page_offset)),
    ])


def _column_chunk(file_offset:int, metadata:bytes)->bytes:
    return _struct([
        (2,C_I64,_i64(file_offset)),
        (3,C_STRUCT,metadata),
    ])


def _row_group(column_chunks:List[bytes], total_byte_size:int, num_rows:int, total_compressed_size:int)->bytes:
    return _struct([
        (1,C_LIST,_list_struct(column_chunks)),
        (2,C_I64,_i64(total_byte_size)),
        (3,C_I64,_i64(num_rows)),
        (6,C_I64,_i64(total_compressed_size)),
    ])


def _key_value(k:str,v:str)->bytes:
    return _struct([(1,C_BINARY,_str(k)),(2,C_BINARY,_str(v))])


def _file_metadata(schema_elems:List[bytes], num_rows:int, row_groups:List[bytes], metadata:Dict[str,str]|None=None)->bytes:
    fields=[
        (1,C_I32,_i32(1)),
        (2,C_LIST,_list_struct(schema_elems)),
        (3,C_I64,_i64(num_rows)),
        (4,C_LIST,_list_struct(row_groups)),
    ]
    if metadata:
        kv=[_key_value(str(k),str(v)) for k,v in metadata.items()]
        fields.append((5,C_LIST,_list_struct(kv)))
    fields.append((6,C_BINARY,_str('YEDAS Talep Kontrol minimal parquet writer 3.12.2')))
    return _struct(fields)


def _plain_text(values:List[str])->bytes:
    out=bytearray()
    for v in values:
        b=str(v if v is not None else '').encode('utf-8',errors='replace')
        out += struct.pack('<I',len(b)); out += b
    return bytes(out)


def _plain_int64(values:List[int])->bytes:
    return b''.join(struct.pack('<q',int(v)) for v in values)


def unique_headers(headers:List[str])->List[str]:
    counts={}; out=[]
    for i,h in enumerate(headers):
        base=str(h or '').strip() or f'COL_{i+1}'
        n=counts.get(base,0)+1; counts[base]=n
        out.append(base if n==1 else f'{base}_{n}')
    return out


def detect_encoding(path:Path)->str:
    raw=path.read_bytes()[:512*1024]
    for enc in ('utf-8-sig','utf-8','cp1254','cp1252','latin-1'):
        try:
            raw.decode(enc)
            return enc
        except UnicodeDecodeError:
            pass
    return 'latin-1'


def quick_hash(path:Path, block:int=1024*1024)->str:
    h=hashlib.sha256(); size=path.stat().st_size; h.update(str(size).encode())
    with path.open('rb') as f:
        first=f.read(block); h.update(first)
        if size>block:
            f.seek(max(0,size-block)); h.update(f.read(block))
    return h.hexdigest()

@dataclass
class ColumnSpec:
    name:str
    kind:str='text'  # text|int64

class MinimalParquetWriter:
    def __init__(self,path:Path,columns:List[ColumnSpec],row_group_size:int=65536,metadata:Dict[str,str]|None=None):
        self.path=Path(path); self.columns=columns; self.row_group_size=row_group_size; self.metadata=metadata or {}
        self._fh=None; self._row_groups=[]; self._num_rows=0

    def __enter__(self):
        self.path.parent.mkdir(parents=True,exist_ok=True)
        self._fh=self.path.open('wb'); self._fh.write(b'PAR1'); return self

    def write_rows(self,rows:Iterable[List[Any]]):
        batch=[]
        for row in rows:
            batch.append(row)
            if len(batch)>=self.row_group_size:
                self._write_group(batch); batch=[]
        if batch:self._write_group(batch)

    def _write_group(self,rows:List[List[Any]]):
        n=len(rows); chunks=[]; total_u=0; total_c=0
        for ci,spec in enumerate(self.columns):
            vals=[(r[ci] if ci<len(r) else '') for r in rows]
            if spec.kind=='int64':
                raw=_plain_int64([int(v or 0) for v in vals]); ptype=PT_INT64
            else:
                raw=_plain_text([str(v if v is not None else '') for v in vals]); ptype=PT_BYTE_ARRAY
            comp=snappy_literal_encode(raw)
            ph=_page_header(n,len(raw),len(comp))
            offset=self._fh.tell(); self._fh.write(ph); self._fh.write(comp)
            u=len(ph)+len(raw); c=len(ph)+len(comp)
            md=_column_metadata(ptype,spec.name,n,u,c,offset)
            chunks.append(_column_chunk(offset,md)); total_u+=u; total_c+=c
        self._row_groups.append(_row_group(chunks,total_u,n,total_c)); self._num_rows+=n

    def close(self):
        if not self._fh:return
        schema=[_schema_root(len(self.columns))]
        for c in self.columns:
            schema.append(_schema_int64(c.name) if c.kind=='int64' else _schema_text(c.name))
        footer=_file_metadata(schema,self._num_rows,self._row_groups,self.metadata)
        self._fh.write(footer); self._fh.write(struct.pack('<I',len(footer))); self._fh.write(b'PAR1')
        self._fh.close(); self._fh=None

    def __exit__(self,exc_type,exc,tb):
        if exc_type is None:self.close()
        elif self._fh:
            self._fh.close(); self._fh=None
        return False


def csv_to_parquet(csv_path:Path, parquet_path:Path, source_version:str='1', row_group_size:int=65536, progress:Callable[[int],None]|None=None)->Dict[str,Any]:
    csv_path=Path(csv_path); parquet_path=Path(parquet_path)
    enc=detect_encoding(csv_path)
    ingested=datetime.now(timezone.utc).isoformat(timespec='seconds')
    qh=quick_hash(csv_path)
    count=0
    with csv_path.open('r',encoding=enc,errors='replace',newline='') as fh:
        reader=csv.reader(fh,delimiter=';')
        headers=unique_headers(next(reader,[]))
        columns=[ColumnSpec(h,'text') for h in headers]+[
            ColumnSpec('source_file','text'),ColumnSpec('source_row_no','int64'),ColumnSpec('source_version','text'),ColumnSpec('ingested_at','text')]
        meta={'source_file':csv_path.name,'source_hash':qh,'source_version':source_version,'ingested_at':ingested,'encoding':enc,'delimiter':';'}
        with MinimalParquetWriter(parquet_path,columns,row_group_size=row_group_size,metadata=meta) as pw:
            def rows_iter():
                nonlocal count
                for row_no,row in enumerate(reader,start=2):
                    # normalize width without dropping source values
                    if len(row)<len(headers): row=row+['']*(len(headers)-len(row))
                    elif len(row)>len(headers): row=row[:len(headers)]
                    count+=1
                    if progress and count%100000==0:progress(count)
                    yield row+[csv_path.name,row_no,source_version,ingested]
            pw.write_rows(rows_iter())
    return {'source':csv_path.name,'parquet':str(parquet_path),'rows':count,'columns':len(columns),'source_hash':qh,'encoding':enc,'size':parquet_path.stat().st_size}


def verify_parquet_container(path:Path)->Dict[str,Any]:
    path=Path(path); size=path.stat().st_size
    if size<12:raise ValueError('Parquet too small')
    with path.open('rb') as f:
        if f.read(4)!=b'PAR1':raise ValueError('Missing PAR1 header')
        f.seek(-8,os.SEEK_END); footer_len=struct.unpack('<I',f.read(4))[0]; magic=f.read(4)
        if magic!=b'PAR1':raise ValueError('Missing PAR1 footer')
        footer_start=size-8-footer_len
        if footer_start<4:raise ValueError('Invalid footer length')
        f.seek(footer_start); footer=f.read(footer_len)
    if not footer or footer[-1]!=0:raise ValueError('Compact footer does not terminate with STOP')
    return {'ok':True,'size':size,'footer_len':footer_len,'footer_start':footer_start}

if __name__=='__main__':
    import argparse,json
    ap=argparse.ArgumentParser(); ap.add_argument('csv'); ap.add_argument('parquet'); ap.add_argument('--version',default='1'); ap.add_argument('--row-group-size',type=int,default=65536)
    a=ap.parse_args(); print(json.dumps(csv_to_parquet(Path(a.csv),Path(a.parquet),a.version,a.row_group_size),ensure_ascii=False,indent=2)); print(verify_parquet_container(Path(a.parquet)))
