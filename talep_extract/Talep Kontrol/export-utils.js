'use strict';

(function(global){
  const enc = new TextEncoder();

  function xmlEsc(v=''){
    return String(v ?? '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  }
  function htmlEsc(v=''){
    return String(v ?? '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function u16(n){const a=new Uint8Array(2),d=new DataView(a.buffer);d.setUint16(0,n,true);return a}
  function u32(n){const a=new Uint8Array(4),d=new DataView(a.buffer);d.setUint32(0,n>>>0,true);return a}
  function joinBytes(parts){
    const len=parts.reduce((s,p)=>s+p.length,0),out=new Uint8Array(len);let o=0;
    for(const p of parts){out.set(p,o);o+=p.length}return out;
  }
  const crcTable=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);t[n]=c>>>0}return t})();
  function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&0xff]^(c>>>8);return (c^0xffffffff)>>>0}
  function dosDateTime(d=new Date()){
    const year=Math.max(1980,d.getFullYear());
    const time=(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1);
    const date=((year-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate();
    return{time,date};
  }
  function zipStore(files){
    const local=[],central=[];let offset=0;const dt=dosDateTime();
    for(const f of files){
      const name=enc.encode(f.name),data=typeof f.data==='string'?enc.encode(f.data):f.data;
      const crc=crc32(data),flags=0x0800;
      const lh=joinBytes([
        u32(0x04034b50),u16(20),u16(flags),u16(0),u16(dt.time),u16(dt.date),
        u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name
      ]);
      local.push(lh,data);
      const ch=joinBytes([
        u32(0x02014b50),u16(20),u16(20),u16(flags),u16(0),u16(dt.time),u16(dt.date),
        u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),
        u16(0),u16(0),u32(0),u32(offset),name
      ]);
      central.push(ch);
      offset+=lh.length+data.length;
    }
    const centralBlob=joinBytes(central),localBlob=joinBytes(local);
    const eocd=joinBytes([
      u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),
      u32(centralBlob.length),u32(localBlob.length),u16(0)
    ]);
    return joinBytes([localBlob,centralBlob,eocd]);
  }
  function colName(n){let s='';while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26)}return s}
  function cell(ref,value,style=0,type='s'){
    if(value===null||value===undefined||value==='')return `<c r="${ref}" s="${style}"/>`;
    if(type==='n' && Number.isFinite(Number(value)))return `<c r="${ref}" s="${style}"><v>${Number(value)}</v></c>`;
    return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xmlEsc(value)}</t></is></c>`;
  }
  function rowXml(rowNo,cells){
    return `<row r="${rowNo}">${cells.map((c,i)=>cell(`${colName(i+1)}${rowNo}`,c.v,c.s||0,c.t||'s')).join('')}</row>`;
  }
  function sanitizeFilePart(v){return String(v||'').replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,'_').slice(0,70)||'Karar_Destek'}
  function downloadBlob(blob,name){
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1200);
  }

  function buildDecisionXlsx(payload){
    let r=1,rows=[],merges=[];
    const add=(cells)=>{rows.push(rowXml(r,cells));return r++};
    const blank=()=>{rows.push(`<row r="${r}"></row>`);r++};
    const merge=(range)=>merges.push(range);

    add([{v:'YEDAŞ Talep Kontrol ve Karar Destek - Karar Destek Sonucu',s:1}]);merge(`A1:K1`);
    add([{v:payload.referenceLabel||'Rezervasyon',s:3},{v:payload.referenceValue||payload.reservationNo,s:0},{v:'Genel Sonuç',s:3},{v:payload.overall,s:payload.overallOk?7:8},{v:'Dışa Aktarım',s:3},{v:payload.generatedAt,s:0}]);
    if(payload.sourceDepot||payload.targetDepot){add([{v:'Talep Edilen Depo',s:3},{v:payload.sourceDepot||'-',s:0},{v:'Talep Eden Depo',s:3},{v:payload.targetDepot||'-',s:0}]);}
    blank();

    add([{v:'TEMİNAT',s:2}]);merge(`A${r-1}:K${r-1}`);
    add([{v:'Gösterge',s:3},{v:'Değer',s:3}]);
    for(const g of payload.guarantee||[]){
      add([{v:g.label},{v:g.value,t:g.numeric?'n':'s',s:g.money?4:(g.percent?6:0)}]);
    }
    blank();

    add([{v:'KEŞİF',s:2}]);merge(`A${r-1}:K${r-1}`);
    add([
      {v:'Malzeme Kodu',s:3},{v:'Malzeme Tanımı',s:3},{v:'Mevcut Depo Stoku',s:3},
      {v:'Keşif / Teslim Edilen',s:3},{v:'Daha Önce Verilen',s:3},{v:'Mevcut Kalan Keşif',s:3},
      {v:'Yeni Talep',s:3},{v:'Talep Sonrası Kalan',s:3},{v:'Birim',s:3},{v:'Durum',s:3}
    ]);
    for(const k of payload.discovery||[]){
      add([
        {v:k.materialCode},{v:k.materialDesc},
        {v:k.stock,t:'n',s:5},{v:k.total,t:'n',s:5},{v:k.previousGiven,t:'n',s:5},{v:k.availableBefore,t:'n',s:5},
        {v:k.request,t:'n',s:5},{v:k.remaining,t:'n',s:5},{v:k.uom},{v:k.status,s:k.ok?7:8}
      ]);
    }
    blank();

    add([{v:'PROJE DAĞILIMI',s:2}]);merge(`A${r-1}:K${r-1}`);
    add([
      {v:'Malzeme Kodu',s:3},{v:'Malzeme Tanımı',s:3},{v:'Proje',s:3},
      {v:'Proje Keşfi',s:3},{v:'Daha Önce Verilen',s:3},{v:'Mevcut Kalan',s:3},{v:'Yeni Dağıtım',s:3},
      {v:'Talep Sonrası Kalan',s:3},{v:'Malzeme Kalanı',s:3},{v:'Birim',s:3},{v:'Durum',s:3}
    ]);
    if((payload.projects||[]).length){
      for(const p of payload.projects){
        add([
          {v:p.materialCode},{v:p.materialDesc},{v:p.projectName},
          {v:p.projectDiscovery,t:p.projectDiscovery==null?'s':'n',s:5},
          {v:p.previousGiven,t:'n',s:5},
          {v:p.availableBefore,t:p.availableBefore==null?'s':'n',s:5},
          {v:p.distributed,t:'n',s:5},
          {v:p.projectRemaining,t:p.projectRemaining==null?'s':'n',s:5},
          {v:p.materialRemaining,t:'n',s:5},{v:p.uom},{v:p.status,s:p.ok?7:8}
        ]);
      }
    }else{
      add([{v:'Bu rezervasyon için TESİS proje dağılımı uygulanmıyor.',s:0}]);merge(`A${r-1}:K${r-1}`);
    }

    const sheet=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="17"/>
  <cols>
    <col min="1" max="1" width="17" customWidth="1"/>
    <col min="2" max="2" width="40" customWidth="1"/>
    <col min="3" max="3" width="34" customWidth="1"/>
    <col min="4" max="9" width="18" customWidth="1"/>
    <col min="10" max="11" width="15" customWidth="1"/>
  </cols>
  <sheetData>${rows.join('')}</sheetData>
  ${merges.length?`<mergeCells count="${merges.length}">${merges.map(x=>`<mergeCell ref="${x}"/>`).join('')}</mergeCells>`:''}
</worksheet>`;

    const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00 [$₺-tr-TR]"/></numFmts>
  <fonts count="3">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="16"/><color rgb="FF18345D"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
  </fonts>
  <fills count="6">
    <fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1769FF"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEAF2FF"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE9F7F2"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFDECEF"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFDCE4EE"/></left><right style="thin"><color rgb="FFDCE4EE"/></right><top style="thin"><color rgb="FFDCE4EE"/></top><bottom style="thin"><color rgb="FFDCE4EE"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="9">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFill="1" applyFont="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFill="1" applyFont="1" applyBorder="1"/>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="4" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="10" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

    const files=[
      {name:'[Content_Types].xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`},
      {name:'_rels/.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`},
      {name:'xl/workbook.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Karar Destek Sonucu" sheetId="1" r:id="rId1"/></sheets></workbook>`},
      {name:'xl/_rels/workbook.xml.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`},
      {name:'xl/worksheets/sheet1.xml',data:sheet},
      {name:'xl/styles.xml',data:styles},
      {name:'docProps/core.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>YEDAŞ Karar Destek Sonucu</dc:title><dc:creator>YEDAŞ Talep Kontrol ve Karar Destek</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`},
      {name:'docProps/app.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>YEDAŞ Talep Kontrol</Application></Properties>`}
    ];
    return zipStore(files);
  }

  function downloadDecisionExcel(payload){
    const bytes=buildDecisionXlsx(payload);
    const blob=new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    downloadBlob(blob,`Karar_Destek_${sanitizeFilePart(payload.inputMode==='manual'?'Manuel_Liste':payload.reservationNo)}.xlsx`);
  }

  function printDecisionPdf(payload){
    const w=window.open('','_blank','width=1200,height=850');
    if(!w){alert('PDF penceresi açılamadı. Tarayıcı popup engelini kontrol edin.');return}
    const guarantee=(payload.guarantee||[]).map(g=>`<tr><td>${htmlEsc(g.label)}</td><td>${htmlEsc(g.display)}</td></tr>`).join('');
    const discovery=(payload.discovery||[]).map(k=>`<tr><td>${htmlEsc(k.materialCode)}</td><td>${htmlEsc(k.materialDesc)}</td><td>${htmlEsc(k.stockDisplay)}</td><td>${htmlEsc(k.totalDisplay)}</td><td>${htmlEsc(k.previousGivenDisplay)}</td><td>${htmlEsc(k.availableBeforeDisplay)}</td><td>${htmlEsc(k.requestDisplay)}</td><td>${htmlEsc(k.remainingDisplay)}</td><td>${htmlEsc(k.status)}</td></tr>`).join('');
    const projects=(payload.projects||[]).length
      ? payload.projects.map(p=>`<tr><td>${htmlEsc(p.materialCode)}</td><td>${htmlEsc(p.materialDesc)}</td><td>${htmlEsc(p.projectName)}</td><td>${htmlEsc(p.projectDiscoveryDisplay)}</td><td>${htmlEsc(p.previousGivenDisplay)}</td><td>${htmlEsc(p.availableBeforeDisplay)}</td><td>${htmlEsc(p.distributedDisplay)}</td><td>${htmlEsc(p.projectRemainingDisplay)}</td><td>${htmlEsc(p.materialRemainingDisplay)}</td><td>${htmlEsc(p.status)}</td></tr>`).join('')
      : `<tr><td colspan="10">Bu kontrol için TESİS proje dağılımı uygulanmıyor.</td></tr>`;
    w.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Karar Destek ${htmlEsc(payload.reservationNo)}</title>
<style>
@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,"Segoe UI",sans-serif;color:#172033;margin:0;font-size:10px}
h1{font-size:20px;margin:0 0 5px;color:#18345d}.meta{display:flex;gap:22px;margin-bottom:14px;padding-bottom:10px;border-bottom:2px solid #1769ff}
.result{font-weight:800;color:${payload.overallOk?'#158765':'#c43f4f'}}h2{font-size:12px;background:#1769ff;color:#fff;padding:7px 9px;margin:12px 0 0}
table{border-collapse:collapse;width:100%;margin:0 0 10px}th,td{border:1px solid #d9e1ec;padding:5px 6px;text-align:left;vertical-align:top}th{background:#edf3fb;color:#40516a}
.small{color:#6d7890;font-size:9px}.foot{margin-top:12px;color:#6d7890;border-top:1px solid #dfe6ef;padding-top:7px}
</style></head><body>
<h1>YEDAŞ Talep Kontrol ve Karar Destek - Karar Destek Sonucu</h1>
<div class="meta"><span><b>${htmlEsc(payload.referenceLabel||'Rezervasyon')}:</b> ${htmlEsc(payload.referenceValue||payload.reservationNo)}</span><span><b>Sonuç:</b> <span class="result">${htmlEsc(payload.overall)}</span></span><span><b>Tarih:</b> ${htmlEsc(payload.generatedAt)}</span></div>${payload.sourceDepot||payload.targetDepot?`<div class="meta"><span><b>Talep Edilen Depo:</b> ${htmlEsc(payload.sourceDepot||'-')}</span><span><b>Talep Eden Depo:</b> ${htmlEsc(payload.targetDepot||'-')}</span></div>`:''}
<h2>Teminat</h2><table><tbody>${guarantee}</tbody></table>
<h2>Keşif</h2><table><thead><tr><th>Malzeme</th><th>Tanım</th><th>Depo Stoku</th><th>Keşif</th><th>Daha Önce Verilen</th><th>Mevcut Kalan</th><th>Yeni Talep</th><th>Talep Sonrası Kalan</th><th>Durum</th></tr></thead><tbody>${discovery}</tbody></table>
<h2>Proje Dağılımı</h2><table><thead><tr><th>Malzeme</th><th>Tanım</th><th>Proje</th><th>Proje Keşfi</th><th>Daha Önce Verilen</th><th>Mevcut Kalan</th><th>Yeni Dağıtım</th><th>Talep Sonrası Kalan</th><th>Malzeme Kalanı</th><th>Durum</th></tr></thead><tbody>${projects}</tbody></table>
<div class="foot">Bu belge karar desteği amaçlıdır; SAP üzerinde onay işlemi oluşturmaz.</div>
<script>window.onload=()=>setTimeout(()=>{window.focus();window.print()},250)<\/script>
</body></html>`);
    w.document.close();
  }


  function dashSheetXml(rows,widths=[]){
    const body=rows.map((r,i)=>rowXml(i+1,r)).join('');
    const cols=widths.length?`<cols>${widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols>`:'';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${body}</sheetData></worksheet>`;
  }
  function dashboardStylesXml(){return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#\,##0.00 [$₺-tr-TR]"/></numFmts>
<fonts count="3"><font><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="16"/><color rgb="FF18345D"/><name val="Calibri"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2E68B7"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF2FB"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFDCE4EE"/></left><right style="thin"><color rgb="FFDCE4EE"/></right><top style="thin"><color rgb="FFDCE4EE"/></top><bottom style="thin"><color rgb="FFDCE4EE"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFill="1" applyFont="1" applyBorder="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="10" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`}
  function buildDashboardXlsx(payload){
    const m=payload.metrics||{};
    const sheets=[];
    const summary=[
      [{v:'YEDAŞ Talep Kontrol ve Karar Destek - Dashboard',s:1}],
      [{v:'Dönem',s:6},{v:payload.rangeLabel||''},{v:'Rapor Tarihi',s:6},{v:payload.exportedAt||payload.generatedAt||''}],
      [{v:'Yüklenici',s:6},{v:payload.selectedCompany||''},{v:'Hedef Depo',s:6},{v:payload.selectedDepotLabel||''}],
      [{v:'İş Türü',s:6},{v:payload.selectedWorkType||'Tümü'},{v:'CSV Arşivi',s:6},{v:payload.recordRoot||''}],
      [],
      [{v:'Gösterge',s:2},{v:'Değer',s:2}],
      [{v:'Toplam Kontrol'},{v:m.totalControls,t:'n',s:4}],
      [{v:'Bugün'},{v:m.todayControls,t:'n',s:4}],
      [{v:'Karar Verilebilir'},{v:m.decisionReady,t:'n',s:4}],
      [{v:'İnceleme Gerekli'},{v:m.reviewRequired,t:'n',s:4}],
      [{v:'Toplam Talep Değeri'},{v:m.totalDemandValue,t:'n',s:3}],
      [{v:'Ort. Teminat Kullanımı'},{v:(Number(m.avgGuaranteeUsage)||0)/100,t:'n',s:5}],
      [{v:'Firma Sayısı'},{v:m.uniqueFirms,t:'n',s:4}],
      [{v:'Malzeme Satırı'},{v:m.materialRows,t:'n',s:4}],
      [{v:'Yüklenici / Malzeme Satırı'},{v:m.contractorMaterialRows,t:'n',s:4}],
      [{v:'Proje Dağılım Satırı'},{v:m.projectRows,t:'n',s:4}],
      [],[{v:'Kontrol Türleri',s:2},{v:'Adet',s:2}],
      ...(payload.modes||[]).map(x=>[{v:x.label},{v:x.value,t:'n',s:4}]),
      [],[{v:'İş Türleri',s:2},{v:'Adet',s:2}],
      ...(payload.workTypes||[]).map(x=>[{v:x.label},{v:x.value,t:'n',s:4}])
    ];
    sheets.push({name:'Özet',rows:summary,widths:[32,22,20,24]});
    const cmRows=[[{v:'Yüklenici',s:2},{v:'Hedef Depo',s:2},{v:'Malzeme Kodu',s:2},{v:'Malzeme Tanımı',s:2},{v:'Toplam Miktar',s:2},{v:'Birim',s:2},{v:'Toplam Tutar',s:2},{v:'Kontrol Sayısı',s:2},{v:'Son Kontrol',s:2}]];
    for(const x of payload.contractorMaterials||[])cmRows.push([{v:x.company},{v:x.target},{v:x.code},{v:x.desc},{v:x.qty,t:'n',s:4},{v:x.unit},{v:x.amount,t:'n',s:3},{v:x.controls,t:'n',s:4},{v:x.lastDate}]);
    sheets.push({name:'Yüklenici Malzeme',rows:cmRows,widths:[34,28,17,48,16,10,18,13,20]});
    const prRows=[[{v:'Yüklenici',s:2},{v:'Hedef Depo',s:2},{v:'Rezervasyon',s:2},{v:'Proje Kodu',s:2},{v:'Proje Adı',s:2},{v:'Malzeme Kodu',s:2},{v:'Malzeme Tanımı',s:2},{v:'Proje Keşfi',s:2},{v:'Dağıtılan',s:2},{v:'Proje Kalanı',s:2},{v:'Malzeme Kalanı',s:2},{v:'Birim',s:2},{v:'Durum',s:2}]];
    for(const x of payload.projectDistributions||[])prRows.push([{v:x.company},{v:x.target},{v:x.reservation},{v:x.projectCode},{v:x.projectName},{v:x.materialCode},{v:x.materialDesc},{v:x.projectDiscovery,t:'n',s:4},{v:x.distributed,t:'n',s:4},{v:x.projectRemaining,t:'n',s:4},{v:x.materialRemaining,t:'n',s:4},{v:x.unit},{v:x.status}]);
    sheets.push({name:'Proje Dağılımları',rows:prRows,widths:[34,18,16,18,44,17,46,14,14,14,16,10,14]});
    const ltRows=[[{v:'Tarih',s:2},{v:'Kontrol Türü',s:2},{v:'Rezervasyon',s:2},{v:'Hedef Depo',s:2},{v:'Firma',s:2},{v:'Talep Değeri',s:2},{v:'Sonuç',s:2}]];
    for(const x of payload.latest||[])ltRows.push([{v:x.time},{v:x.mode},{v:x.reservation},{v:x.target},{v:x.company},{v:x.demand,t:'n',s:3},{v:x.result}]);
    sheets.push({name:'Son Kontroller',rows:ltRows,widths:[20,18,16,20,38,18,24]});

    const contentOverrides=sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
    const workbookSheets=sheets.map((sh,i)=>`<sheet name="${xmlEsc(sh.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('');
    const workbookRels=sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')+`<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;
    const files=[
      {name:'[Content_Types].xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${contentOverrides}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`},
      {name:'_rels/.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`},
      {name:'xl/workbook.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>`},
      {name:'xl/_rels/workbook.xml.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRels}</Relationships>`},
      {name:'xl/styles.xml',data:dashboardStylesXml()},
      {name:'docProps/core.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>YEDAŞ Karar Destek Dashboard</dc:title><dc:creator>YEDAŞ Talep Kontrol ve Karar Destek</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`},
      {name:'docProps/app.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>YEDAŞ Talep Kontrol</Application></Properties>`}
    ];
    sheets.forEach((sh,i)=>files.push({name:`xl/worksheets/sheet${i+1}.xml`,data:dashSheetXml(sh.rows,sh.widths)}));
    return zipStore(files);
  }
  function dashboardFileStamp(payload){const d=new Date();return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`}
  function dashboardSafeName(v){return String(v||'').replace(/[\\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim().replace(/ /g,'_').slice(0,36)||'DEPO'}
  function dashboardExportBase(payload){const depot=String(payload.selectedDepot||'').split('|').pop()||payload.selectedDepotLabel||'DEPO';const company=String(payload.selectedCompany||'').split(/\s+/).filter(Boolean).slice(0,2).join('_');return `Karar_Destek_${dashboardSafeName(depot)}_${dashboardSafeName(company)}_${dashboardFileStamp(payload)}`}
  function downloadDashboardExcel(payload){const bytes=buildDashboardXlsx(payload);downloadBlob(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`${dashboardExportBase(payload)}.xlsx`)}
  function printDashboardPdf(payload){
    const w=window.open('','_blank','width=1400,height=900');if(!w){alert('PDF penceresi açılamadı. Tarayıcı popup engelini kontrol edin.');return}
    const m=payload.metrics||{};
    const cm=(payload.contractorMaterials||[]).map(x=>`<tr><td>${htmlEsc(x.company)}</td><td>${htmlEsc(x.target)}</td><td>${htmlEsc(x.code)}</td><td>${htmlEsc(x.desc)}</td><td class="num">${Number(x.qty||0).toLocaleString('tr-TR',{maximumFractionDigits:3})}</td><td>${htmlEsc(x.unit)}</td><td class="num">${Number(x.amount||0).toLocaleString('tr-TR',{style:'currency',currency:'TRY'})}</td><td class="num">${htmlEsc(x.controls)}</td><td>${htmlEsc(x.lastDate)}</td></tr>`).join('')||'<tr><td colspan="9">Kayıt yok.</td></tr>';
    const pr=(payload.projectDistributions||[]).map(x=>`<tr><td>${htmlEsc(x.company)}</td><td>${htmlEsc(x.reservation||'—')}</td><td>${htmlEsc((x.projectCode?x.projectCode+' — ':'')+(x.projectName||''))}</td><td>${htmlEsc(x.materialCode)}</td><td>${htmlEsc(x.materialDesc||'—')}</td><td class="num">${Number(x.projectDiscovery||0).toLocaleString('tr-TR',{maximumFractionDigits:3})}</td><td class="num">${Number(x.distributed||0).toLocaleString('tr-TR',{maximumFractionDigits:3})}</td><td class="num">${Number(x.projectRemaining||0).toLocaleString('tr-TR',{maximumFractionDigits:3})}</td><td>${htmlEsc(x.status)}</td></tr>`).join('')||'<tr><td colspan="9">Proje dağılımı yok.</td></tr>';
    w.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${htmlEsc(payload.selectedDepotLabel||'Depo')} - Karar Destek Raporu</title><style>@page{size:A4 landscape;margin:9mm}*{box-sizing:border-box}body{font-family:Arial,"Segoe UI",sans-serif;color:#172033;margin:0;font-size:8px}h1{font-size:19px;margin:0 0 4px;color:#18345d}.meta{color:#61738b;margin-bottom:10px}.kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:5px;margin:10px 0}.kpi{border:1px solid #dbe3ec;border-radius:6px;padding:7px}.kpi span{display:block;color:#718198;font-size:7px}.kpi strong{font-size:12px;color:#1f3856}h2{font-size:10px;background:#2e68b7;color:white;padding:6px;margin:12px 0 0;page-break-after:avoid}table{border-collapse:collapse;width:100%;margin-bottom:9px}thead{display:table-header-group}tr{page-break-inside:avoid}th,td{border:1px solid #dce4ed;padding:3px 4px;text-align:left;vertical-align:top}th{background:#eef3f9;color:#40516a}.num{text-align:right;white-space:nowrap}.foot{margin-top:8px;color:#7b899a}</style></head><body><h1>YEDAŞ Talep Kontrol ve Karar Destek — Depo Raporu</h1><div class="meta"><b>Yüklenici:</b> ${htmlEsc(payload.selectedCompany||'—')} &nbsp; • &nbsp; <b>Depo:</b> ${htmlEsc(payload.selectedDepotLabel||'—')} &nbsp; • &nbsp; <b>İş Türü:</b> ${htmlEsc(payload.selectedWorkType||'Tümü')}<br><b>Dönem:</b> ${htmlEsc(payload.rangeLabel)} &nbsp; • &nbsp; <b>Rapor:</b> ${htmlEsc(payload.exportedAt||payload.generatedAt)} &nbsp; • &nbsp; <b>CSV:</b> ${htmlEsc(payload.recordRoot||'')}</div><div class="kpis"><div class="kpi"><span>Toplam Kontrol</span><strong>${htmlEsc(m.totalControls)}</strong></div><div class="kpi"><span>Karar Verilebilir</span><strong>${htmlEsc(m.decisionReady)}</strong></div><div class="kpi"><span>İnceleme Gerekli</span><strong>${htmlEsc(m.reviewRequired)}</strong></div><div class="kpi"><span>Toplam Talep</span><strong>${Number(m.totalDemandValue||0).toLocaleString('tr-TR',{style:'currency',currency:'TRY',maximumFractionDigits:0})}</strong></div><div class="kpi"><span>Ort. Teminat</span><strong>%${Number(m.avgGuaranteeUsage||0).toLocaleString('tr-TR',{maximumFractionDigits:1})}</strong></div><div class="kpi"><span>Firma Sayısı</span><strong>${htmlEsc(m.uniqueFirms)}</strong></div></div><h2>Yüklenici / Malzeme Dağılımı</h2><table><thead><tr><th>Yüklenici</th><th>Hedef Depo</th><th>Malzeme Kodu</th><th>Malzeme Tanımı</th><th>Miktar</th><th>Birim</th><th>Tutar</th><th>Kontrol</th><th>Son Kontrol</th></tr></thead><tbody>${cm}</tbody></table><h2>Proje Dağılımları</h2><table><thead><tr><th>Yüklenici</th><th>Rezervasyon</th><th>Proje</th><th>Malzeme Kodu</th><th>Malzeme Tanımı</th><th>Proje Keşfi</th><th>Dağıtılan</th><th>Proje Kalanı</th><th>Durum</th></tr></thead><tbody>${pr}</tbody></table><div class="foot">Veriler “Kontrolü Onayla ve Kaydet” ile oluşturulan CSV kontrol snapshot kayıtlarından üretilmiştir; SAP malzeme hareketi kaydı değildir.</div><script>window.onload=()=>setTimeout(()=>{window.focus();window.print()},250)<\/script></body></html>`);w.document.close();
  }
  function canvasFitText(ctx,text,maxWidth){let s=String(text??'');if(ctx.measureText(s).width<=maxWidth)return s;while(s.length>3&&ctx.measureText(s+'…').width>maxWidth)s=s.slice(0,-1);return s+'…'}
  function canvasWrapLines(ctx,text,maxWidth){
    const raw=String(text??'').trim();if(!raw)return [''];
    const words=raw.split(/\s+/),lines=[];let line='';
    for(const word of words){const test=line?line+' '+word:word;if(ctx.measureText(test).width<=maxWidth||!line){line=test}else{lines.push(line);line=word}}
    if(line)lines.push(line);return lines;
  }
  function decisionExportBase(payload){
    const ref=payload.inputMode==='manual'?'Manuel':(payload.reservationNo||payload.referenceValue||'Rezervasyon');
    const d=new Date(),stamp=`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
    return `Kontrol_Sonucu_${sanitizeFilePart(ref)}_${stamp}`;
  }
  function downloadDecisionJpg(payload){
    const W=2200,margin=64,rowH=46,headH=38,sectionTitleH=46,gap=30;
    const guarantee=payload.guarantee||[],discovery=payload.discovery||[],projects=payload.projects||[];
    const notes=[...(payload.errors||[]).map(x=>`Hata: ${x}`),...(payload.warnings||[]).map(x=>`Uyarı: ${x}`)];
    const noteEstimate=notes.reduce((n,t)=>n+Math.max(1,Math.ceil(String(t).length/125)),0);
    const sectionHeight=(rows)=>sectionTitleH+headH+Math.max(1,rows)*rowH;
    const H=Math.max(1250,300+sectionTitleH+Math.max(1,guarantee.length)*rowH+gap+sectionHeight(discovery.length)+gap+sectionHeight(projects.length)+gap+(notes.length?sectionTitleH+noteEstimate*34+28:0)+105);
    if(H>30000)throw new Error('JPG raporu çok uzun. Tam detay için Excel veya PDF dışa aktarımını kullanın.');
    const c=document.createElement('canvas');c.width=W;c.height=H;const ctx=c.getContext('2d');if(!ctx)throw new Error('Görsel oluşturma bileşeni başlatılamadı.');
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,W,H);ctx.textBaseline='middle';
    ctx.fillStyle='#18345d';ctx.font='700 38px Segoe UI,Arial';ctx.fillText('YEDAŞ Talep Kontrol ve Karar Destek — Kontrol Sonucu',margin,60);
    ctx.fillStyle='#687990';ctx.font='18px Segoe UI,Arial';ctx.fillText(`${payload.referenceLabel||'Rezervasyon'}: ${payload.referenceValue||payload.reservationNo||'—'}   •   Tarih: ${payload.generatedAt||''}`,margin,102);
    ctx.fillText(canvasFitText(ctx,`Talep Edilen Depo: ${payload.sourceDepot||'—'}   •   Talep Eden Depo: ${payload.targetDepot||'—'}`,W-margin*2),margin,134);
    const resultY=170;ctx.fillStyle=payload.overallOk?'#e9f7f2':'#fdecef';ctx.strokeStyle=payload.overallOk?'#8fd8c2':'#efb6c0';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(margin,resultY,W-margin*2,76,16);ctx.fill();ctx.stroke();ctx.fillStyle=payload.overallOk?'#14785f':'#b7384b';ctx.font='700 28px Segoe UI,Arial';ctx.fillText(`Genel Sonuç: ${payload.overall||'—'}`,margin+22,resultY+38);
    let y=270;
    const drawSectionTitle=(title,status,statusOk)=>{ctx.fillStyle='#2e68b7';ctx.fillRect(margin,y,W-margin*2,sectionTitleH);ctx.fillStyle='#fff';ctx.font='700 20px Segoe UI,Arial';ctx.fillText(title,margin+16,y+sectionTitleH/2);if(status){ctx.textAlign='right';ctx.fillText(status,W-margin-16,y+sectionTitleH/2);ctx.textAlign='left'}y+=sectionTitleH};
    const drawTable=(headers,rows,widths)=>{const totalW=W-margin*2,scale=totalW/widths.reduce((a,b)=>a+b,0),ws=widths.map(v=>v*scale);ctx.fillStyle='#eef3f9';ctx.fillRect(margin,y,totalW,headH);ctx.fillStyle='#40516a';ctx.font='700 14px Segoe UI,Arial';let x=margin;headers.forEach((h,i)=>{ctx.fillText(canvasFitText(ctx,h,ws[i]-12),x+6,y+headH/2);x+=ws[i]});y+=headH;const data=rows.length?rows:[headers.map((_,i)=>i===0?'Kayıt yok.':'')];ctx.font='14px Segoe UI,Arial';for(const row of data){x=margin;ctx.fillStyle='#fff';ctx.fillRect(margin,y,totalW,rowH);ctx.strokeStyle='#e1e7ef';ctx.beginPath();ctx.moveTo(margin,y+rowH);ctx.lineTo(margin+totalW,y+rowH);ctx.stroke();row.forEach((v,i)=>{ctx.fillStyle='#334960';ctx.fillText(canvasFitText(ctx,String(v??''),ws[i]-12),x+6,y+rowH/2);x+=ws[i]});y+=rowH}};
    drawSectionTitle('Teminat',payload.guaranteeOk?'Uygun':'Hata',payload.guaranteeOk);drawTable(['Gösterge','Değer'],guarantee.map(g=>[g.label,g.display]),[45,25]);y+=gap;
    drawSectionTitle('Keşif',payload.discoveryOk?'Uygun':'Hata',payload.discoveryOk);drawTable(['Malzeme Kodu','Malzeme Tanımı','Depo Stoku','Toplam Keşif','Kalan Keşif','Talep','Durum'],discovery.map(k=>[k.materialCode,k.materialDesc,k.stockDisplay,k.totalDisplay,k.remainingDisplay,k.requestDisplay,k.status]),[15,39,13,13,13,12,10]);y+=gap;
    drawSectionTitle('Proje Dağılımı',payload.isTesis?(payload.distributionOk?'Tamam':'Eksik / Hatalı'):'Gerekmez',payload.distributionOk);drawTable(['Malzeme Kodu','Malzeme Tanımı','Proje','Proje Keşfi','Dağıtılan','Proje Kalanı','Malzeme Kalanı','Durum'],projects.map(p=>[p.materialCode,p.materialDesc,p.projectName,p.projectDiscoveryDisplay,p.distributedDisplay,p.projectRemainingDisplay,p.materialRemainingDisplay,p.status]),[13,27,28,11,10,11,11,9]);y+=gap;
    if(notes.length){drawSectionTitle('Hata / Uyarı Detayları');ctx.font='15px Segoe UI,Arial';for(const note of notes){const isErr=String(note).startsWith('Hata:');ctx.fillStyle=isErr?'#b7384b':'#9b6b16';const lines=canvasWrapLines(ctx,note,W-margin*2-28);for(const line of lines){ctx.fillText('• '+line,margin+12,y+17);y+=34}y+=4}}
    ctx.strokeStyle='#dfe6ef';ctx.beginPath();ctx.moveTo(margin,H-82);ctx.lineTo(W-margin,H-82);ctx.stroke();ctx.fillStyle='#718198';ctx.font='15px Segoe UI,Arial';ctx.fillText('Bu görsel karar desteği amaçlıdır; SAP üzerinde onay işlemi oluşturmaz.',margin,H-48);
    return new Promise((resolve,reject)=>c.toBlob(blob=>{if(!blob)return reject(new Error('JPG oluşturulamadı.'));downloadBlob(blob,`${decisionExportBase(payload)}.jpg`);resolve()},'image/jpeg',.94));
  }
  function downloadDashboardJpg(payload){
    const mats=(payload.contractorMaterials||[]).slice(0,35),projects=(payload.projectDistributions||[]).slice(0,35),m=payload.metrics||{};
    const W=1800,margin=60,rowH=34,sectionGap=36,headerH=290,table1H=70+(mats.length||1)*rowH,table2H=70+(projects.length||1)*rowH,H=headerH+table1H+table2H+sectionGap*3+100;
    const c=document.createElement('canvas');c.width=W;c.height=H;const ctx=c.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,W,H);ctx.textBaseline='middle';ctx.fillStyle='#18345d';ctx.font='700 34px Segoe UI,Arial';ctx.fillText('YEDAŞ Talep Kontrol ve Karar Destek — Depo Raporu',margin,58);ctx.fillStyle='#526b87';ctx.font='700 18px Segoe UI,Arial';ctx.fillText(canvasFitText(ctx,`Yüklenici: ${payload.selectedCompany||'—'}   •   Depo: ${payload.selectedDepotLabel||'—'}`,W-margin*2),margin,98);ctx.fillStyle='#718198';ctx.font='16px Segoe UI,Arial';ctx.fillText(`İş Türü: ${payload.selectedWorkType||'Tümü'}   •   Dönem: ${payload.rangeLabel||''}   •   Rapor: ${payload.exportedAt||payload.generatedAt||''}`,margin,126);
    const cards=[['Toplam Kontrol',m.totalControls],['Karar Verilebilir',m.decisionReady],['İnceleme Gerekli',m.reviewRequired],['Toplam Talep',Number(m.totalDemandValue||0).toLocaleString('tr-TR',{style:'currency',currency:'TRY',maximumFractionDigits:0})],['Ort. Teminat','%'+Number(m.avgGuaranteeUsage||0).toLocaleString('tr-TR',{maximumFractionDigits:1})],['Firma Sayısı',m.uniqueFirms]];const cardW=(W-margin*2-5*18)/6,cardY=132;
    cards.forEach((it,i)=>{const x=margin+i*(cardW+18);ctx.fillStyle='#f7f9fc';ctx.strokeStyle='#dfe7f0';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(x,cardY,cardW,104,14);ctx.fill();ctx.stroke();ctx.fillStyle='#74849a';ctx.font='15px Segoe UI,Arial';ctx.fillText(String(it[0]),x+16,cardY+28);ctx.fillStyle='#193452';ctx.font='700 24px Segoe UI,Arial';ctx.fillText(canvasFitText(ctx,it[1],cardW-32),x+16,cardY+68)});
    const drawTable=(title,headers,rows,widths,y)=>{ctx.fillStyle='#2e68b7';ctx.fillRect(margin,y,W-margin*2,42);ctx.fillStyle='#fff';ctx.font='700 18px Segoe UI,Arial';ctx.fillText(title,margin+14,y+21);y+=42;const totalW=W-margin*2,scale=totalW/widths.reduce((a,b)=>a+b,0),ws=widths.map(x=>x*scale);ctx.fillStyle='#eef3f9';ctx.fillRect(margin,y,totalW,34);ctx.fillStyle='#40516a';ctx.font='700 13px Segoe UI,Arial';let x=margin;headers.forEach((h,i)=>{ctx.fillText(canvasFitText(ctx,h,ws[i]-12),x+6,y+17);x+=ws[i]});y+=34;ctx.font='13px Segoe UI,Arial';for(const row of rows.length?rows:[headers.map((_,i)=>i===0?'Kayıt yok.':'')]){x=margin;ctx.fillStyle='#fff';ctx.fillRect(margin,y,totalW,rowH);ctx.strokeStyle='#e5eaf0';ctx.beginPath();ctx.moveTo(margin,y+rowH);ctx.lineTo(margin+totalW,y+rowH);ctx.stroke();ctx.fillStyle='#40536d';row.forEach((v,i)=>{ctx.fillText(canvasFitText(ctx,v,ws[i]-12),x+6,y+rowH/2);x+=ws[i]});y+=rowH}return y};
    let y=headerH;const matRows=mats.map(x=>[x.company,x.target,x.code,x.desc,Number(x.qty||0).toLocaleString('tr-TR',{maximumFractionDigits:3}),x.unit,Number(x.amount||0).toLocaleString('tr-TR',{style:'currency',currency:'TRY',maximumFractionDigits:0}),x.controls,x.lastDate]);y=drawTable('Yüklenici / Malzeme Dağılımı',['Yüklenici','Hedef Depo','Malzeme','Tanım','Miktar','Birim','Tutar','Kontrol','Son Kontrol'],matRows,[24,18,12,29,10,7,12,7,15],y);y+=sectionGap;const pRows=projects.map(x=>[x.company,x.reservation||'—',(x.projectCode?x.projectCode+' — ':'')+(x.projectName||''),x.materialCode,x.materialDesc||'—',Number(x.projectDiscovery||0).toLocaleString('tr-TR',{maximumFractionDigits:2}),Number(x.distributed||0).toLocaleString('tr-TR',{maximumFractionDigits:2}),Number(x.projectRemaining||0).toLocaleString('tr-TR',{maximumFractionDigits:2}),x.status]);y=drawTable('Proje Dağılımları',['Yüklenici','Rez.','Proje','Malzeme Kodu','Malzeme Tanımı','Keşif','Dağıtılan','Kalan','Durum'],pRows,[22,9,27,12,32,9,10,9,10],y);ctx.fillStyle='#7c899b';ctx.font='14px Segoe UI,Arial';ctx.fillText(`JPG görünümünde her detay tablosunun ilk 35 satırı gösterilir. Tam veri Excel/PDF dışa aktarımındadır.`,margin,H-48);
    return new Promise((resolve,reject)=>c.toBlob(blob=>{if(!blob)return reject(new Error('JPG oluşturulamadı.'));downloadBlob(blob,`${dashboardExportBase(payload)}.jpg`);resolve()},'image/jpeg',.92));
  }

  function buildWorkOpsXlsx(payload){
    const sheets=[];
    const summary=[[{v:`YEDAŞ Talep Kontrol - ${payload.workLabel||''} Operasyon İzleme`,s:1}],[{v:'Rapor Tarihi',s:6},{v:payload.generatedAt||new Date().toLocaleString('tr-TR')},{v:'Depo Filtresi',s:6},{v:payload.depotLabel||'Tüm Depolar'}],[{v:'Proje Filtresi',s:6},{v:payload.projectLabel||'Tüm Projeler'},{v:'Arama',s:6},{v:payload.search||''}],[],[{v:'Gösterge',s:2},{v:'Değer',s:2}],...Object.entries(payload.kpis||{}).map(([k,v])=>[{v:k},{v:v}])];
    sheets.push({name:'Özet',rows:summary,widths:[28,28,22,34]});
    const mats=[[{v:'Depo',s:2},{v:'Proje',s:2},{v:'Malzeme',s:2},{v:'Tanım',s:2},{v:'Birim',s:2},{v:'Keşif',s:2},{v:'Verilen',s:2},{v:'Kalan',s:2}]];
    for(const x of payload.materials||[])mats.push([{v:x.dy},{v:x.projectLabel||''},{v:x.materialCode},{v:x.materialDesc},{v:x.uom},{v:x.planned,t:'n',s:4},{v:x.given,t:'n',s:4},{v:x.remaining,t:'n',s:4}]);
    sheets.push({name:'Malzeme Dağılımı',rows:mats,widths:[14,32,17,45,10,14,14,14]});
    const disc=[[{v:'Depo',s:2},{v:'Proje',s:2},{v:'Malzeme',s:2},{v:'Tanım',s:2},{v:'Birim',s:2},{v:'Keşif',s:2},{v:'Verilen',s:2},{v:'Kalan',s:2},{v:'Durum',s:2}]];
    for(const x of payload.discovery||[])disc.push([{v:x.dy},{v:x.projectLabel||''},{v:x.materialCode},{v:x.materialDesc},{v:x.uom},{v:x.planned,t:'n',s:4},{v:x.given,t:'n',s:4},{v:x.remaining,t:'n',s:4},{v:x.status}]);
    sheets.push({name:'Keşif',rows:disc,widths:[14,32,17,45,10,14,14,14,14]});
    const spend=[[{v:'Ay',s:2},{v:'Depo',s:2},{v:'Malzeme',s:2},{v:'Tanım',s:2},{v:'Birim',s:2},{v:'Net Harcama',s:2}]];
    for(const x of payload.spend||[])spend.push([{v:x.monthName||x.month},{v:x.dy},{v:x.materialCode},{v:x.materialDesc},{v:x.uom},{v:x.netSpend,t:'n',s:3}]);
    sheets.push({name:'Aylık Harcamalar',rows:spend,widths:[15,14,17,45,10,18]});
    const gua=[[{v:'ÜY',s:2},{v:'Depo',s:2},{v:'Depo Tanımı',s:2},{v:'Ana Teminat',s:2},{v:'Nakdi',s:2},{v:'Manuel Artış',s:2},{v:'Toplam Teminat',s:2},{v:'Stok Değeri',s:2},{v:'Kullanılabilir',s:2}]];
    for(const x of payload.guarantee||[])gua.push([{v:x.uy},{v:x.dy},{v:x.dyDesc},{v:x.main,t:'n',s:3},{v:x.cash,t:'n',s:3},{v:x.manual,t:'n',s:3},{v:x.total,t:'n',s:3},{v:x.stockValue,t:'n',s:3},{v:x.available,t:'n',s:3}]);
    sheets.push({name:'Teminat',rows:gua,widths:[10,14,38,18,18,18,18,18,18]});
    const contentOverrides=sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
    const workbookSheets=sheets.map((sh,i)=>`<sheet name="${xmlEsc(sh.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('');
    const workbookRels=sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')+`<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;
    const files=[{name:'[Content_Types].xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${contentOverrides}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`},{name:'_rels/.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`},{name:'xl/workbook.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>`},{name:'xl/_rels/workbook.xml.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRels}</Relationships>`},{name:'xl/styles.xml',data:dashboardStylesXml()}];
    sheets.forEach((sh,i)=>files.push({name:`xl/worksheets/sheet${i+1}.xml`,data:dashSheetXml(sh.rows,sh.widths)}));return zipStore(files);
  }
  function workOpsBase(payload){return `Operasyon_${dashboardSafeName(payload.workLabel||'Rapor')}_${dashboardSafeName(payload.depotLabel||'Tum_Depolar')}_${dashboardFileStamp(payload)}`}
  function downloadWorkOpsExcel(payload){downloadBlob(new Blob([buildWorkOpsXlsx(payload)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`${workOpsBase(payload)}.xlsx`)}
  function printWorkOpsPdf(payload){
    const w=window.open('','_blank','width=1300,height=900');if(!w)throw new Error('PDF yazdırma penceresi açılamadı.');
    const table=(title,heads,rows)=>`<h2>${htmlEsc(title)}</h2><table><thead><tr>${heads.map(h=>`<th>${htmlEsc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(v=>`<td>${htmlEsc(v)}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${heads.length}">Kayıt yok.</td></tr>`}</tbody></table>`;
    const body=table('Malzeme Dağılımı',['Depo','Proje','Malzeme','Tanım','Birim','Keşif','Verilen','Kalan'],(payload.materials||[]).map(x=>[x.dy,x.projectLabel||'',x.materialCode,x.materialDesc,x.uom,x.planned,x.given,x.remaining]))+table('Keşif',['Depo','Proje','Malzeme','Tanım','Birim','Keşif','Verilen','Kalan','Durum'],(payload.discovery||[]).map(x=>[x.dy,x.projectLabel||'',x.materialCode,x.materialDesc,x.uom,x.planned,x.given,x.remaining,x.status]))+table('Aylık Harcamalar',['Ay','Depo','Malzeme','Tanım','Birim','Net Harcama'],(payload.spend||[]).map(x=>[x.monthName||x.month,x.dy,x.materialCode,x.materialDesc,x.uom,Number(x.netSpend||0).toLocaleString('tr-TR',{style:'currency',currency:'TRY'})]))+table('Teminat',['ÜY','Depo','Tanım','Toplam Teminat','Stok','Kullanılabilir'],(payload.guarantee||[]).map(x=>[x.uy,x.dy,x.dyDesc,Number(x.total||0).toLocaleString('tr-TR',{style:'currency',currency:'TRY'}),Number(x.stockValue||0).toLocaleString('tr-TR',{style:'currency',currency:'TRY'}),Number(x.available||0).toLocaleString('tr-TR',{style:'currency',currency:'TRY'})]));
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${htmlEsc(payload.workLabel||'Operasyon')}</title><style>body{font-family:Arial,sans-serif;color:#26384d;margin:28px}h1{font-size:24px}h2{margin-top:28px;font-size:17px;color:#235f9e}table{width:100%;border-collapse:collapse;font-size:10px}th,td{border:1px solid #d8e0e8;padding:6px;vertical-align:top}th{background:#eef3f8;text-align:left}@media print{body{margin:10mm}button{display:none}}</style></head><body><h1>YEDAŞ Talep Kontrol — ${htmlEsc(payload.workLabel||'')} Operasyon İzleme</h1><p>Depo: ${htmlEsc(payload.depotLabel||'Tüm Depolar')} • Proje: ${htmlEsc(payload.projectLabel||'Tüm Projeler')} • ${htmlEsc(payload.generatedAt||'')}</p>${body}<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);w.document.close();
  }

  // FIX26D: Only the selected report tab is exported, including all filtered pages.
  function buildWorkReportXlsx(p){
    const names=(p.columns||[]).map(x=>x[1]);const fields=(p.columns||[]).map(x=>x[0]);
    const numeric=new Set(['discoveryQty','sourceGivenQty','actualGivenQty','differenceQty','rawQty','signedQty','issues','unitPrice','discoveryAmount','givenAmount','actualGivenAmount','differenceAmount','amount']);
    const title=`${p.workLabel||''} - ${p.title||''}`;
    const rows=[
      [{v:'YEDAŞ Talep Kontrol — '+title,s:1}],
      [{v:'Üretim Yeri',s:6},{v:p.plant||'Tümü'},{v:'Depo',s:6},{v:p.depot||'Tümü'}],
      [{v:'Arama',s:6},{v:p.search||''},{v:'Çıktı',s:6},{v:p.generatedAt||''}],
      [{v:'Satır Sayısı',s:6},{v:Number(p.total||0),t:'n'},{v:'Veri Açıklaması',s:6},{v:p.note||''}],[],
      names.map(h=>({v:h,s:2}))
    ];
    for(const x of p.rows||[])rows.push(fields.map(k=>{const v=x[k];return numeric.has(k)?(v==null?{v:''}:{v:Number(v),t:'n',s:k==='unitPrice'||k.toLowerCase().includes('amount')?3:4}):{v:v==null?'':String(v)}}));
    const sheets=[{name:(p.title||'Rapor').slice(0,31),rows,widths:fields.map(k=>['materialDesc','priceSource','mutabakat'].includes(k)?46:18)}];
    if(p.tab==='consumption'){
      const summary=[[{v:'Ay',s:2},{v:'221',s:2},{v:'222 (Ters)',s:2},{v:'Z22',s:2},{v:'Net Harcama',s:2},{v:'Hareket',s:2}]];
      for(const m of p.monthlySpend||[])summary.push([{v:m.month},{v:Number(m.amount221||0),t:'n',s:3},{v:Number(m.amount222||0),t:'n',s:3},{v:Number(m.amountZ22||0),t:'n',s:3},{v:Number(m.netAmount||0),t:'n',s:3},{v:Number(m.events||0),t:'n'}]);
      sheets.push({name:'Aylık Harcamalar',rows:summary,widths:[20,20,20,20,20,15]});
    }
    const overrides=sheets.map((sh,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
    const wbSheets=sheets.map((sh,i)=>`<sheet name="${xmlEsc(sh.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('');
    const rels=sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')+`<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;
    const files=[
      {name:'[Content_Types].xml',data:`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`},
      {name:'_rels/.rels',data:'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
      {name:'xl/workbook.xml',data:`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${wbSheets}</sheets></workbook>`},
      {name:'xl/_rels/workbook.xml.rels',data:`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`},
      {name:'xl/styles.xml',data:dashboardStylesXml()}
    ];
    sheets.forEach((sh,i)=>files.push({name:`xl/worksheets/sheet${i+1}.xml`,data:dashSheetXml(sh.rows,sh.widths)}));
    return zipStore(files);
  }
  function downloadWorkReportExcel(p){
    const bytes=buildWorkReportXlsx(p);
    const name=`${dashboardSafeName(p.workLabel)}_${dashboardSafeName(p.title)}_${dashboardFileStamp(p)}.xlsx`;
    downloadBlob(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),name);
  }
  function printWorkReportPdf(p,preopenedWindow){
    const w=preopenedWindow||window.open('','_blank','width=1320,height=900');if(!w)throw new Error('PDF yazdırma penceresi engellendi.');
    const text=v=>v==null?'—':typeof v==='number'?v.toLocaleString('tr-TR',{maximumFractionDigits:3}):String(v);
    const table=(heads,rows)=>`<table><thead><tr>${heads.map(h=>`<th>${htmlEsc(h)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(row=>`<tr>${row.map(v=>`<td>${htmlEsc(text(v))}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${heads.length}">Kayıt yok.</td></tr>`}</tbody></table>`;
    const cols=p.columns||[],data=(p.rows||[]).map(x=>cols.map(y=>x[y[0]]));
    const monthly=p.tab==='consumption'?`<h2>Aylık Harcamalar</h2>`+table(['Ay','221','222 (Ters)','Z22','Net Harcama','Hareket'],(p.monthlySpend||[]).map(m=>[m.month,m.amount221,m.amount222,m.amountZ22,m.netAmount,m.events])):'';
    w.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${htmlEsc(p.title||'Rapor')}</title><style>body{font-family:Arial,sans-serif;color:#22364e;margin:16px}h1{font-size:19px;color:#075c7a}h2{font-size:15px;color:#17618a}table{border-collapse:collapse;font-size:9px;width:100%;margin-bottom:18px}th,td{border:1px solid #cdd7e3;padding:4px;text-align:left;overflow-wrap:anywhere}th{background:#e4eff7}thead{display:table-header-group}tr{break-inside:avoid}p{font-size:11px}@page{size:A4 landscape;margin:9mm}</style></head><body><h1>YEDAŞ Talep Kontrol — ${htmlEsc(p.workLabel||'')} / ${htmlEsc(p.title||'')}</h1><p>ÜY: ${htmlEsc(p.plant||'Tümü')} · Depo: ${htmlEsc(p.depot||'Tümü')} · Arama: ${htmlEsc(p.search||'Yok')} · Satır: ${htmlEsc(p.total||0)} · ${htmlEsc(p.generatedAt||'')}</p><p>${htmlEsc(p.note||'')}</p>${monthly}<h2>${htmlEsc(p.title||'')} — Detay</h2>${table(cols.map(x=>x[1]),data)}<script>window.onload=()=>setTimeout(()=>window.print(),350)<\/script></body></html>`);
    w.document.close();
  }
  global.DecisionExport={downloadDecisionExcel,printDecisionPdf,downloadDecisionJpg,downloadDashboardExcel,printDashboardPdf,downloadDashboardJpg,downloadWorkOpsExcel,printWorkOpsPdf,downloadWorkReportExcel,printWorkReportPdf};
})(window);
