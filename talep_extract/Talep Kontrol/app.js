'use strict';

const SOURCES=['ZMM048','MB51','MB52','ZMM098','TANIMLAR','KESIFLER'];
const CORE_SOURCES=['ZMM048','MB52','ZMM098','TANIMLAR','KESIFLER'];
const APP_VERSION='3.13.0';
const CACHE_VERSION='current-chat-v3.13.0-kontrol-gecmisi-1';
const FRIENDLY={
  ZMM048:'Rezervasyon verileri',
  MB51:'Stok hareketleri',
  MB52:'Güncel depo stokları',
  ZMM098:'Teminat bilgileri',
  TANIMLAR:'Depo ve proje tanımları',
  KESIFLER:'Keşif verileri',
  TESIS:'TESİS keşif verisi',KET:'KET&YB keşif verisi',BAKIM:'BAKIM keşif verisi',LED:'LED keşif verisi'
};
const state={files:{},books:{},data:{exemptions:[]},ix:{},diagnostics:[],meta:{roots:[],externalRoot:'',bundledRoot:'',serviceVersion:'',settingsFallback:false,dataEngine:{},sourceHealth:{},pendingSourceUpdates:[],userContext:null,notifications:[]},ui:{mode:'reservation',reservationNo:'',selectedMaterial:'',allocations:{},allocationRows:{},modalMaterial:'',reservationSearchActive:-1,manualSourceKey:'',manualTargetKey:'',manualRows:[],manualReady:false,manualDepotSearchActive:{source:-1,target:-1},manualMaterialCode:'',manualMaterialSearchActive:-1,manualDraftRows:[],manualDraftProjectHeaders:[],manualDraftSelection:[],manualActiveRow:-1,manualRowClipboard:null,manualContextRow:-1,stocksScope:'mb51_group',stockScopeNote:'',lastDecisionCheckToken:'',savedDecisionCheckToken:'',lastSavedControlId:'',lastDecisionRecordPayload:null,reservationRecordHistory:null,repeatControlAllowed:false,itemDecisions:{}},lastSnapshot:{}};
const kesifContextLoaded=new Set();
const dataPrepState={templates:[],selected:[],outputs:[],history:[],outputRoot:''};

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
function norm(v=''){return String(v??'').trim().toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').replace(/ş/g,'s').replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ö/g,'o').replace(/ç/g,'c').replace(/[^a-z0-9]+/g,'')}
function num(v){if(typeof v==='number'&&Number.isFinite(v))return v;if(v==null||v==='')return 0;let s=String(v).trim().replace(/\s/g,'');if(s.includes(',')&&s.includes('.'))s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');else if(s.includes(','))s=s.replace(',','.');else if(/^[+-]?\d{1,3}(?:\.\d{3})+$/.test(s))s=s.replace(/\./g,'');const n=Number(s);return Number.isFinite(n)?n:0}
function fmtNum(v,d=2){return Number(v||0).toLocaleString('tr-TR',{maximumFractionDigits:d})}
function fmtMoney(v){return Number(v||0).toLocaleString('tr-TR',{style:'currency',currency:'TRY',maximumFractionDigits:2})}
function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function key(...x){return x.map(v=>String(v??'').trim()).join('|')}
function uniq(a){return [...new Set(a.filter(v=>v!==''&&v!=null))]}
function autoToastType(msg=''){const s=norm(msg);if(/(hata|başarısız|bulunamadi|bulunamadı|gecersiz|geçersiz|yetersiz|açık oluşuyor|acik olusuyor)/.test(s))return 'error';if(/(uyari|uyarı|kontrol edilmeli|inceleme|eksik)/.test(s))return 'warn';if(/(kaydedildi|hazirlandi|hazırlandı|yenilendi|eklendi|ayristirildi|ayrıştırıldı|acildi|açıldı|kopyalandi|kopyalandı|guncellendi|güncellendi)/.test(s))return 'success';return 'info'}
function toast(msg,type='auto',duration=4200,titleOverride=''){const stack=$('#toastStack');if(!stack)return;const tone=type==='auto'?autoToastType(String(msg||'')):type;const title=titleOverride||(tone==='error'?'Hata':tone==='warn'?'Uyarı':tone==='success'?'Başarılı':'Bilgi');const icons={success:'✓',warn:'!',error:'✕',info:'i'};const card=document.createElement('section');card.className=`toast-card ${tone}`;card.innerHTML=`<div class="toast-icon">${icons[tone]||'i'}</div><div class="toast-copy"><strong>${esc(title)}</strong><div>${esc(msg)}</div></div><button type="button" class="toast-close" aria-label="Bildirimi kapat">×</button><div class="toast-progress"></div>`;stack.prepend(card);requestAnimationFrame(()=>card.classList.add('show'));const close=()=>{card.classList.remove('show');card.classList.add('hide');setTimeout(()=>card.remove(),260)};card.querySelector('.toast-close')?.addEventListener('click',close);card._timer=setTimeout(close,duration);card.addEventListener('mouseenter',()=>clearTimeout(card._timer));card.addEventListener('mouseleave',()=>card._timer=setTimeout(close,1800));}
let tkFormLastValidated=null;
async function tkPreviewFormExcel(){
  tkFormLastValidated=null;if($('#tkFormStageBtn'))$('#tkFormStageBtn').disabled=true;
  const picker=$('#tkFormExcelFile'),file=picker?.files?.[0],key=$('#tkFormKind')?.value,btn=$('#tkFormPreviewBtn');
  if(!file){toast('Lütfen doldurulmuş bir .xlsx dosyası seçin.','warn');return}
  if(!file.name.toLowerCase().endsWith('.xlsx')){toast('Yalnız .xlsx dosyası desteklenir.','error');return}
  if(btn)btn.disabled=true;
  if($('#tkFormImportStatus'))$('#tkFormImportStatus').textContent='Form inceleniyor...';
  try{
    const response=await fetch('/api/form-import/preview?key='+encodeURIComponent(key),{method:'POST',headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},body:file});
    const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||'Excel okunamadı.');
    const status=$('#tkFormImportStatus');if(status)status.textContent=`${data.formName} · Sayfa: ${data.sheet} · ${data.count} dolu miktar · Kaynak: ${data.fileSha256.slice(0,12)}… · YALNIZ ÖNİZLEME. `+(data.warnings||[]).slice(0,3).join(' | ');
    const body=$('#tkFormImportRows');if(body){body.innerHTML=(data.records||[]).map(r=>`<tr><td>${esc(r.row)}</td><td>${esc(r.tedas)}</td><td>${esc(r.sap||'—')}</td><td>${esc(r.name)}</td><td>${esc(r.scope)}</td><td class="num">${esc(r.quantity)}</td></tr>`).join('')||'<tr><td colspan="6">Girilen miktar bulunamadı. Boş form olabilir.</td></tr>'}
    if(data.count>0){tkFormLastValidated={file,key,sha:data.fileSha256};if($('#tkFormStageBtn'))$('#tkFormStageBtn').disabled=false}
    toast(`${data.count} miktar kaydı yerel önizlemede bulundu. Kesin kayıt oluşturulmadı.`,data.count?'success':'warn');
  }catch(e){if($('#tkFormImportStatus'))$('#tkFormImportStatus').textContent='Import hatası: '+e.message;toast('Excel import önizlemesi: '+e.message,'error',7000)}
  finally{if(btn)btn.disabled=false}
}

async function tkStageFormExcel(){
 const v=tkFormLastValidated,btn=$('#tkFormStageBtn');
 if(!v || v.file!==$('#tkFormExcelFile')?.files?.[0] || v.key!==$('#tkFormKind')?.value){toast('Lütfen önce seçili dosyayı yeniden kontrol edin.','warn');return}
 if(btn)btn.disabled=true;
 try{
  const response=await fetch('/api/form-import/stage?key='+encodeURIComponent(v.key),{method:'POST',headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},body:v.file});
  const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||'Yerel taslak kaydedilemedi.');
  if(data.fileSha256!==v.sha)throw new Error('Dosyanın parmak izi değişti.');
  if($('#tkFormImportStatus'))$('#tkFormImportStatus').textContent=`${data.batchId} · ${data.count} satır · YEREL TASLAK; UNC ve ACTIVE güncellenmedi.`;
  toast('Excel, yerel import taslağı olarak kaydedildi. Kesin kayıt oluşturulmadı.','success');
 }catch(e){toast('Taslak import: '+e.message,'error',7000)}
 finally{if(btn)btn.disabled=false}
}

let contentLoadingCounter=0;
function setContentLoading(active){contentLoadingCounter=Math.max(0,contentLoadingCounter+(active?1:-1));document.body.classList.toggle('content-loading',contentLoadingCounter>0)}
function showRefreshOverlay(){const o=$('#refreshOverlay');if(o)o.hidden=false}
function hideRefreshOverlay(){const o=$('#refreshOverlay');if(o)o.hidden=true}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}

let loadingStartedAt=performance.now(),loadingLastProgress=0;
function updateLoadingStages(value){
  const cards=[$('#loadingStage1'),$('#loadingStage2'),$('#loadingStage3'),$('#loadingStage4')].filter(Boolean);
  if(!cards.length)return;
  if(value>=100){cards.forEach(c=>{c.classList.remove('active');c.classList.add('done')});return}
  const idx=value<=24?0:value<=49?1:value<=76?2:3;
  cards.forEach((c,i)=>{c.classList.toggle('done',i<idx);c.classList.toggle('active',i===idx)});
}
function updateLoadingEta(value){
  const eta=$('#loadingEta');if(!eta)return;
  if(value>=100){eta.textContent='Tamamlandı';return}
  const elapsed=Math.max(0,(performance.now()-loadingStartedAt)/1000);
  if(value<10||elapsed<1){eta.textContent='Hazırlanıyor';return}
  const remaining=Math.ceil((elapsed/value)*(100-value));
  eta.textContent=Number.isFinite(remaining)&&remaining>0?`≈ ${Math.min(99,remaining)} sn`:'Hazırlanıyor';
}
function setLoading(p,msg,detail=''){
  const value=Math.max(0,Math.min(100,Number(p)||0));
  if(value<loadingLastProgress||(value<=5&&loadingLastProgress>5))loadingStartedAt=performance.now();
  loadingLastProgress=value;
  const bar=$('#loadingBar'),percent=$('#loadingPercent'),track=$('#loadingTrack'),card=$('#loadingCard');
  if(bar)bar.style.width=`${value}%`;
  if(percent)percent.textContent=`${Math.round(value)}%`;
  if(track)track.setAttribute('aria-valuenow',String(Math.round(value)));
  if($('#loadingMessage'))$('#loadingMessage').textContent=msg||'';
  if($('#loadingDetail'))$('#loadingDetail').textContent=detail||'';
  if(card){card.classList.remove('has-error');card.setAttribute('aria-busy',value>=100?'false':'true')}
  updateLoadingStages(value);updateLoadingEta(value);
}
function showLoadingIssue(msg){
  const box=$('#loadingError'),card=$('#loadingCard');
  if(box){box.hidden=false;box.innerHTML=esc(msg).replace(/\n/g,'<br>')}
  if($('#loadingRetry'))$('#loadingRetry').hidden=false;
  if($('#loadingEta'))$('#loadingEta').textContent='Kontrol gerekli';
  if(card)card.classList.add('has-error');
}
function hideLoading(){document.body.classList.remove('booting');const s=$('#loadingScreen');if(s){s.classList.add('done');setTimeout(()=>s.remove(),420)}}

const ALIAS={
 reservationNo:['rezervasyon','rezervasyonno','rezervasyonnumarasi'],itemNo:['nakilrezervasyonukalemno','rezervasyonkalemno','kalemno','kalem'],
 status:['durum','status'],approvalStatus:['onaydurumu','onayli','onaybutonu'],
 sourceUY:['teslimedenuy','kaynakuy','uretimyeri'],sourceDY:['teslimedendy','kaynakdepo','depoyeri'],sourceDYDesc:['teslimedendt'],
 recvUY:['teslimalanuy','hedefuy'],recvDY:['teslimalandy','hedefdepo'],recvUYDesc:['teslimalanut'],
 materialCode:['malzeme','malzemekodu'],materialDesc:['malzemekisametni','malzemekisametin','malzemetanimi','malzemeaciklamasi'],
 materialGroup:['malgrubu','malzemegrubu','malgrup'],materialGroupDesc:['malgrubutanimi','malzemegrubutanimi','malzemegrubuaciklamasi','malgrubuaciklamasi'],
 reservationQty:['rezervasyonmiktari','talepmiktari','miktar'],deliveredQty:['teslimedilenmiktar'],uom:['girisolcubirimi','olcu','birim'],movementType:['islemturu','hareketturu'],
 plant:['uretimyeri','uy'],storageLoc:['depoyeri','dy'],storageDesc:['depoyeritanimi','depotanimi'],depotType:['depoturu'],
 unrestricted:['tahditsizklnb','tahditsizkullanilabilir','tahditsiz'],unrestrictedValue:['degerthdsklnb','degerthdsklnb','degerthdskullanilabilir'],totalValue:['toplamdeger'],valuationType:['parti','degerlemeturu'],currency:['parabirimi'],
 guaranteeMain:['guvenceteminattutari','mlzteminat','malzemeteminati'],guaranteeCash:['nakditeminattutari','ekteminat'],guaranteeManual:['manuelartistutari','olurartisi'],z98StockValue:['depostoktutaritoplam'],z98Available:['rezervasyonyapilabilirtutar'],
 workType:['isturu','isturukodu'],contractName:['sozlesmeadi'],companyName:['firmaadi'],active:['aktif'],projectId:['projeid'],projectName:['projeadi']
};
function pick(row,name){const a=ALIAS[name]||[];for(const k of Object.keys(row||{}))if(a.includes(norm(k)))return row[k];return undefined}

function sheetToObjects(rows){
  if(!rows?.length)return[];let hi=0,best=-1;
  for(let i=0;i<Math.min(20,rows.length);i++){const c=(rows[i]||[]).filter(v=>String(v??'').trim()!=='').length;if(c>best){best=c;hi=i}}
  const headers=(rows[hi]||[]).map((v,i)=>String(v??'').trim()||`COL_${i+1}`);
  const out=[];for(let r=hi+1;r<rows.length;r++){const a=rows[r]||[];if(!a.some(v=>String(v??'').trim()!==''))continue;const o={};headers.forEach((h,i)=>o[h]=a[i]??'');out.push(o)}return out;
}
function allRows(src){return Object.entries(state.books[src]||{}).flatMap(([sheet,rows])=>sheetToObjects(rows).map(r=>({...r,__sheet:sheet})))}
function sheetRows(src,name){const b=state.books[src]||{};const k=Object.keys(b).find(x=>norm(x)===norm(name));return k?b[k]:[]}
function kesifSheetName(preferred){if(norm(preferred)===norm('LED_Verileri')){if(sheetRows('KESIFLER','LED_Verileri').length)return 'LED_Verileri';if(sheetRows('KESIFLER','LedPath').length)return 'LedPath'}return preferred}

function parseCsvText(text,delimiter=';'){
  text=String(text??'').replace(/^\ufeff/,'');const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){
      if(ch==='"'){if(text[i+1]==='"'){field+='"';i++}else quoted=false}else field+=ch;
      continue;
    }
    if(ch==='"'){quoted=true;continue}
    if(ch===delimiter){row.push(field);field='';continue}
    if(ch==='\n'||ch==='\r'){
      if(ch==='\r'&&text[i+1]==='\n')i++;
      row.push(field);field='';if(row.some(v=>String(v??'').trim()!==''))rows.push(row);row=[];continue;
    }
    field+=ch;
  }
  if(field!==''||row.length){row.push(field);if(row.some(v=>String(v??'').trim()!==''))rows.push(row)}
  return rows;
}
async function getCsvRows(fileInfo){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),120000);
  try{
    const r=await fetch(fileInfo.url,{cache:'no-store',signal:ctl.signal});if(!r.ok)throw new Error(`${fileInfo.name||'CSV'} okunamadı (${r.status}).`);
    const text=await r.text();return parseCsvText(text,fileInfo.delimiter||';');
  }catch(e){
    if(e?.name==='AbortError')throw new Error(`${fileInfo.name||'CSV'} 120 saniye içinde okunamadı.`);
    throw e;
  }finally{clearTimeout(timer)}
}
async function parseCsvSourceBookDirect(src,info){
  const files=info?.files||[];if(!files.length)throw new Error(`${src} için tanınmış CSV dosyası yok.`);
  const book={};
  for(let i=0;i<files.length;i++){
    const f=files[i],allRows=await getCsvRows(f),headerRow=Math.max(0,Number(f.headerRow)||0);
    const rows=headerRow>0?allRows.slice(headerRow):allRows;
    let name=String(f.sheet||f.role||src||`CSV_${i+1}`);
    if(book[name])name=`${name}__${i+2}`;book[name]=rows;
  }
  return book;
}
async function parseCsvSourceBook(src,info){
  // V3.11: CSV parse işlemi ana tarayıcı thread'inde yapılmaz. Yerel servis
  // Python csv motoruyla parse edip JSON olarak döndürür. Eski servis varsa
  // doğrudan CSV okuma yalnızca geriye dönük yedektir.
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),120000);
  try{
    const r=await fetch(`/api/book?source=${encodeURIComponent(src)}`,{cache:'no-store',signal:ctl.signal});
    if(!r.ok)throw new Error(`Sunucu veri motoru ${r.status}`);
    const data=await r.json();if(!data?.ok||!data.book)throw new Error(data?.error||'Sunucu veri motoru geçersiz yanıt verdi.');
    return data.book;
  }catch(e){
    if(e?.name==='AbortError')throw new Error(`${src} sunucu veri motorunda 120 saniye içinde hazırlanamadı.`);
    return await parseCsvSourceBookDirect(src,info);
  }finally{clearTimeout(timer)}
}

const DB='TalepKontrolCurrentDB',STORE='cache';
function dbOpen(){return new Promise((res,rej)=>{const q=indexedDB.open(DB,1);q.onupgradeneeded=()=>q.result.createObjectStore(STORE);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})}
async function dbGet(k){const db=await dbOpen();return new Promise((res,rej)=>{const q=db.transaction(STORE).objectStore(STORE).get(k);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})}
async function dbSet(k,v){const db=await dbOpen();return new Promise((res,rej)=>{const q=db.transaction(STORE,'readwrite').objectStore(STORE).put(v,k);q.onsuccess=()=>res();q.onerror=()=>rej(q.error)})}
async function dbClear(){const db=await dbOpen();return new Promise((res,rej)=>{const q=db.transaction(STORE,'readwrite').objectStore(STORE).clear();q.onsuccess=()=>res();q.onerror=()=>rej(q.error)})}

function hasHeader(rows,aliases){if(!rows?.length)return false;for(let i=0;i<Math.min(rows.length,12);i++){const h=(rows[i]||[]).map(norm);if(aliases.some(a=>h.includes(norm(a))))return true}return false}
function validateSource(src){
  const b=state.books[src];if(!b)return[];const issues=[];
  if(src==='ZMM048'){const r=Object.values(b).sort((a,c)=>c.length-a.length)[0]||[];for(const h of ['Rezervasyon','Malzeme','Rezervasyon Miktari','TESLİM EDEN ÜY','TESLİM EDEN DY','TESLİM ALAN ÜY','Teslim alan DY'])if(!hasHeader(r,[h]))issues.push(`ZMM048: '${h}' sütunu bulunamadı.`)}
  if(src==='MB52'){const r=Object.values(b).sort((a,c)=>c.length-a.length)[0]||[];for(const h of ['Malzeme','Üretim yeri','Depo yeri','Tahditsiz klnb.','Toplam değer'])if(!hasHeader(r,[h]))issues.push(`MB52: '${h}' sütunu bulunamadı.`)}
  if(src==='ZMM098'){const r=Object.values(b).sort((a,c)=>c.length-a.length)[0]||[];for(const h of ['Üretim yeri','Depo yeri','Güvence Teminat Tutarı'])if(!hasHeader(r,[h]))issues.push(`ZMM098: '${h}' sütunu bulunamadı.`)}
  if(src==='TANIMLAR'){if(!sheetRows('TANIMLAR','TB_Depo_Kodlari').length&&!sheetRows('TANIMLAR','SITE_DEPOLAR').length)issues.push("TANIMLAR: depo tanım sayfası bulunamadı.");if(!sheetRows('TANIMLAR','SITE_PROJELER').length)issues.push("TANIMLAR: SITE_PROJELER sayfası bulunamadı.")}
  if(src==='KESIFLER'){
    const sheets=Object.entries(b||{});if(!sheets.length)issues.push('KESIFLER: tanınmış CSV kaynağı bulunamadı.');
    for(const [sheet,r] of sheets){
      for(const h of ['Depo Kodu','Malzeme Kodu','Teslim Edilen','Verilen Malzeme Toplamı','Teslim Edilen - Verilen Fark'])if(!hasHeader(r,[h]))issues.push(`KESIFLER/${sheet}: '${h}' başlığı bulunamadı.`);
    }
  }
  return issues;
}

async function fetchSnapshot(forceScan=false){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),forceScan?240000:45000);
  try{
    const url='/api/files'+(forceScan?'?refresh=1':'');
    const r=await fetch(url,{cache:'no-store',signal:ctl.signal});
    if(!r.ok)throw new Error(`Yerel veri servisi yanıt vermedi (${r.status}).`);
    return await r.json();
  }catch(e){
    if(e?.name==='AbortError')throw new Error(forceScan?'Veri yenileme 240 saniyeyi aştı. Kaynak dosyalarını kontrol edin.':'CSV kaynak taraması 45 saniyeyi aştı. Veri klasörünü kontrol edin.');
    throw e;
  }finally{clearTimeout(timer)}
}


async function loadExemptions(){
  try{
    const data=await fetchApiJson('/api/exemptions?ts='+Date.now(),{},15000);
    state.data.exemptions=(data.items||[]).map(x=>({
      materialCode:String(x.materialCode||'').trim(),
      discoveryExempt:!!x.discoveryExempt,
      guaranteeExempt:!!x.guaranteeExempt,
      active:x.active!==false,
      description:String(x.description||'').trim()
    })).filter(x=>x.materialCode);
  }catch(e){
    console.error('Muaf listesi yüklenemedi',e);state.data.exemptions=[];
    state.diagnostics.push({level:'warn',text:'Muaf listesi yüklenemedi: '+e.message});
  }
}
async function saveExemptions(items){
  const r=await fetch('/api/exemptions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items})});
  let data={};try{data=await r.json()}catch(e){}
  if(!r.ok||!data.ok)throw new Error(data.error||`Muaf listesi kaydedilemedi (${r.status}).`);
  state.data.exemptions=(data.items||[]).map(x=>({...x,materialCode:String(x.materialCode||'').trim()}));
  buildIndexes();return data;
}
function exemptionFor(materialCode){
  return state.ix.exemptions?.get(String(materialCode||'').trim())||{materialCode:String(materialCode||'').trim(),discoveryExempt:false,guaranteeExempt:false,active:false,description:''};
}
function isDiscoveryExempt(materialCode){const x=exemptionFor(materialCode);return !!(x.active&&x.discoveryExempt)}
function isGuaranteeExempt(materialCode){const x=exemptionFor(materialCode);return !!(x.active&&x.guaranteeExempt)}

async function loadSources({initial=false,silent=false,forceScan=false}={}){
  state.diagnostics=[];kesifContextLoaded.clear();
  if(location.protocol==='file:')throw new Error('Bu paket index.html dosyasına çift tıklanarak çalıştırılmaz. BASLAT.vbs kullanın.');
  const snap=await fetchSnapshot(forceScan);state.meta.roots=snap.roots||[];state.meta.externalRoot=snap.externalRoot||'';state.meta.bundledRoot=snap.bundledRoot||'';state.meta.dataEngine=snap.dataEngine||{};state.meta.sourceHealth=snap.sourceHealth||{};state.meta.pendingSourceUpdates=snap.pendingSourceUpdates||[];
  const entries=Object.entries(snap.sources||{});
  let done=0;
  for(const [src,info] of entries){
    done++;
    if(!info){state.files[src]={status:'missing',name:'',path:'',origin:''};state.books[src]=null;state.diagnostics.push({level:'bad',text:`${FRIENDLY[src]} kaynağı bulunamadı. Bu kaynağa bağlı kontroller kullanılamaz.`});continue}
    state.files[src]={...info,status:'ready'};
    if(src==='MB51'||src==='KESIFLER'){
      // MB51 ve Keşif CSV'leri büyük. Açılışta tarayıcıya komple taşınmaz.
      // MB51 ekranı sunucu sayfalaması kullanır; keşif karar verisi ise hedef
      // depo + malzeme bazında /api/kesif-context ile ihtiyaç anında alınır.
      state.books[src]={};state.files[src].status='ok';
      if(initial&&!silent)setLoading(src==='MB51'?12:18,`${FRIENDLY[src]} kaynağı hazır…`,src==='MB51'?'Raporlama için sunucu tarafında tutuluyor.':'Karar sırasında yalnız gerekli depo/malzeme satırları okunacak.');
      continue;
    }
    const fileSig=(info.files||[]).map(f=>`${f.name}:${f.size}:${f.lastModified}:${f.role||''}`).join('|');const fp=`${CACHE_VERSION}:${src}:${info.size}:${info.lastModified}:${fileSig}`;
    let cached=await dbGet(fp);
    try{
      if(!cached?.book){
        if(initial&&!silent)setLoading(12+Math.round((done/entries.length)*72),`${FRIENDLY[src]} hazırlanıyor…`,'Sütun başlıkları ve veri yapısı kontrol ediliyor.');
        const book=await parseCsvSourceBook(src,info);cached={book};if(Number(info.size||0)<=25*1024*1024)await dbSet(fp,cached);
      }
      state.books[src]=cached.book;state.files[src].status='ok';
      for(const issue of validateSource(src))state.diagnostics.push({level:'bad',text:issue,source:src});
    }catch(e){state.books[src]=null;state.files[src].status='bad';state.diagnostics.push({level:'bad',text:`${src}: ${e.message}`,source:src})}
  }
  if(snap.configError)state.diagnostics.push({level:'warn',text:snap.configError});if(snap.engineRefreshError)state.diagnostics.push({level:'bad',text:'İndeks/Parquet yenileme hatası: '+snap.engineRefreshError});if(snap.dataEngine?.building)state.diagnostics.push({level:'warn',text:'Büyük veri indeksi arka planda güncelleniyor. Mevcut sağlıklı indeks kullanılmaya devam ediyor.'});else if(snap.dataEngine&&!snap.dataEngine.ready)state.diagnostics.push({level:'warn',text:'Parquet/index veri motoru güncel değil. Yeni kaynak algılandıysa kullanıcı onayı bekleniyor.'});
  for(const d of snap.scanDiagnostics||[])state.diagnostics.push({level:d.level||'warn',text:d.text||''});
  await loadExemptions();
  normalizeData();buildIndexes();validateData();renderCommon();
  scheduleSourceUpdateAlerts(state.meta.pendingSourceUpdates||[]);
  resetKesifManagementCache();
  if($('#kesifView')?.classList.contains('active'))renderKesifManagementView(true);
  if($('#guaranteeView')?.classList.contains('active'))renderGuaranteeView();
  if($('#stocksView')?.classList.contains('active'))renderStocksView();
  if($('#movementsView')?.classList.contains('active')&&state.books.MB51)renderMovementsView(false);
  if(state.ui.mode==='reservation'&&state.ui.reservationNo)renderReservation(state.ui.reservationNo);
  else if(state.ui.mode==='manual'&&state.ui.manualReady)renderManualWorkspace();
  state.lastSnapshot=Object.fromEntries(entries.map(([s,i])=>[s,i?`${i.size}|${i.lastModified}|${(i.files||[]).map(f=>`${f.name}:${f.lastModified}:${f.role}`).join(',')}`:'missing']));
  if(initial&&!silent){setLoading(96,'Karar destek modeli hazırlanıyor…','Parquet + indeksli veri motoru ve karar ilişkileri hazırlanıyor.');setTimeout(()=>{setLoading(100,'Veriler hazır','Karar destek ekranı açılıyor.');setTimeout(hideLoading,180)},120)}
}

function workCode(v){const n=norm(v);if(n==='t'||n.includes('tesis'))return'T';if(n==='b'||n.includes('bakim'))return'B';if(n==='k'||n.includes('ket'))return'K';if(n==='l'||n.includes('led'))return'L';return String(v||'').trim().toUpperCase()}
function isActive(v){const n=norm(v);return !v||['evet','x','1','aktif','true'].includes(n)}

function stableKesifProjectId(dy,name){
  const s=`${String(dy||'').trim()}|${normalizeSearchText(name)}`;let h=2166136261;
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}
  return `KESIF-${String(dy||'').trim()}-${(h>>>0).toString(36).toUpperCase()}`;
}
function kesifDepotByCode(dy){
  return (state.data.depots||[]).find(d=>String(d.dy)===String(dy))||null;
}
function kesifTextCode(v){
  const n=norm(v);if(!n)return'';
  if(n.includes('led')||n.includes('armaturdonusum'))return'L';
  if(n.includes('bakim'))return'B';
  if(n.includes('ket')||n.includes('yapibaglanti')||/(^|\s|[-_/])yb($|\s|[-_/])/.test(String(v||'').toLowerCase()))return'K';
  if(n.includes('tesis'))return'T';
  return'';
}
function workLabel(code){return ({T:'TESİS',K:'KET&YB',B:'BAKIM',L:'LED'})[workCode(code)]||String(code||'').trim()}
function resolveContextWorkCode(target,targetDY,mats=[]){
  const explicit=workCode(target?.workType||'');
  if(['T','K','B','L'].includes(explicit))return explicit;
  for(const text of [target?.contractName,target?.dyDesc,target?.companyName]){const c=kesifTextCode(text||'');if(c)return c}
  if(/^B\d+$/i.test(String(targetDY||'').trim()))return'B';
  const wanted=new Set((mats||[]).map(m=>String(m?.materialCode||m||'').trim()).filter(Boolean));
  const codes=uniq((state.data.kesif||[]).filter(k=>String(k.dy)===String(targetDY)&&(!wanted.size||wanted.has(String(k.materialCode)))).map(k=>workCode(k.workType)).filter(c=>['T','K','B','L'].includes(c)));
  return codes.length===1?codes[0]:'';
}
function inferKesifCode(r,sheetName=''){
  const explicit=String(pick(r,'workType')??r['İş Türü']??r['İş Türü Kodu']??'').trim();
  if(explicit){const c=workCode(explicit);if(['T','K','B','L'].includes(c))return c}
  // Sunucu içerikten tanıyıp CSV'yi bu sanal sayfa adına bağlar; önce bunu kullan.
  const sn=norm(sheetName);if(sn.includes('tesis'))return'T';if(sn.includes('ket'))return'K';if(sn.includes('bakim'))return'B';if(sn.includes('led'))return'L';
  // Dosya adı değil, satır içeriği: Grup Tanımı + Proje.
  for(const v of [r['Grup Tanımı'],r['Grup Tanimi'],r['Proje'],r['Proje Adı'],r['Proje_Adi'],pick(r,'projectName')]){const c=kesifTextCode(v);if(c)return c}
  const dy=String(r['Depo Kodu']??pick(r,'storageLoc')??'').trim();
  if(/^B\d+/i.test(dy))return'B';
  if(dy){const dep=(state.data.depots||[]).find(x=>String(x.dy||'').trim()===dy);const c=workCode(dep?.workType||'');if(['T','K','B','L'].includes(c))return c}
  return'';
}
function allKesifObjects(){
  const out=[];for(const [sheet,rows] of Object.entries(state.books.KESIFLER||{})){const objs=sheetToObjects(rows);for(let i=0;i<objs.length;i++)out.push({r:objs[i],sheet,rowNo:i+2})}return out;
}
function augmentProjectsFromKesif(){
  const existing=new Map((state.data.projects||[]).map(p=>[key(p.dy,norm(p.projectName)),p]));
  for(const x of allKesifObjects()){
    const r=x.r,code=inferKesifCode(r,x.sheet);if(code!=='T')continue;
    const dy=String(r['Depo Kodu']??'').trim(),name=String(r['Proje']??r['Proje Adı']??r['Proje_Adi']??'').trim();if(!dy||!name)continue;
    const k=key(dy,norm(name));if(existing.has(k)){existing.get(k).sourceKesif='KESIFLER';continue}
    const dep=(state.data.depots||[]).find(d=>String(d.dy)===dy)||{};
    const p={projectId:stableKesifProjectId(dy,name),projectName:name,uy:String(dep.uy||'').trim(),dy,workType:'TESİS',active:'EVET',source:'KESIFLER',sourceKesif:'KESIFLER'};
    state.data.projects.push(p);existing.set(k,p);
  }
}
function normalizeKesifModern(){
  const projectMap=new Map(),depotMap=new Map();
  for(const x of allKesifObjects()){
    const r=x.r,code=inferKesifCode(r,x.sheet),dy=String(r['Depo Kodu']??'').trim(),mat=String(r['Malzeme Kodu']??'').trim();if(!code||!dy||!mat)continue;
    const projectName=String(r['Proje']??r['Proje Adı']??r['Proje_Adi']??'').trim();
    const dep=(state.data.depots||[]).find(d=>String(d.dy)===dy)||{},uy=String(dep.uy||'').trim();
    const planned=num(r['Teslim Edilen']),given=num(r['Verilen Malzeme Toplamı']),remaining=num(r['Teslim Edilen - Verilen Fark']);
    let projectId='';if(code==='T'){const p=(state.data.projects||[]).find(v=>String(v.dy)===dy&&norm(v.projectName)===norm(projectName));projectId=p?.projectId||stableKesifProjectId(dy,projectName)}
    const item={uy,dy,projectId,projectName,workType:code,materialCode:mat,planned,given,remaining,metric:planned,metricName:'Teslim Edilen',sheet:x.sheet,sourceModel:'CSV_DELIVERY_BALANCE',sourceRow:x.rowNo,groupNo:String(r['Grup No']??'').trim(),groupDesc:String(r['Grup Tanımı']??'').trim(),contractor:String(r['Yüklenici']??r['Firma Adı']??'').trim()};
    if(code==='T')projectMap.set(key(dy,norm(projectName),mat),item);else depotMap.set(key(code,dy,mat),item);
  }
  return [...projectMap.values(),...depotMap.values()];
}
function normalizeKesif(){return normalizeKesifModern()}

function normalizeData(){
  state.data.zmm=allRows('ZMM048').map((r,i)=>({raw:r,rowNo:i+1,itemNo:String(pick(r,'itemNo')??r['Nakil rezervasyonu kalem no.']??'').trim(),reservationNo:String(pick(r,'reservationNo')??'').trim(),status:String(pick(r,'status')??'').trim(),approvalStatus:(String(r['Onay Durumu']??'').trim() || (norm(r['Onaylı']??'')==='x'?'Onaylı':'Onaysız')),sourceUY:String(pick(r,'sourceUY')??'').trim(),sourceDY:String(pick(r,'sourceDY')??'').trim(),sourceDYDesc:String(pick(r,'sourceDYDesc')??'').trim(),recvUY:String(pick(r,'recvUY')??'').trim(),recvDY:String(pick(r,'recvDY')??'').trim(),recvUYDesc:String(pick(r,'recvUYDesc')??'').trim(),movementType:String(pick(r,'movementType')??'').trim(),materialCode:String(pick(r,'materialCode')??'').trim(),materialDesc:String(pick(r,'materialDesc')??'').trim(),qty:num(pick(r,'reservationQty')),deliveredQty:num(pick(r,'deliveredQty')),uom:String(pick(r,'uom')??'').trim()})).filter(r=>r.reservationNo&&r.materialCode);
  state.data.mb52=allRows('MB52').map(r=>{const q=num(pick(r,'unrestricted')),uv=num(pick(r,'unrestrictedValue')),tv=num(pick(r,'totalValue'));return{raw:r,plant:String(pick(r,'plant')??'').trim(),dy:String(pick(r,'storageLoc')??'').trim(),dyDesc:String(pick(r,'storageDesc')??'').trim(),materialCode:String(pick(r,'materialCode')??'').trim(),materialDesc:String(pick(r,'materialDesc')??'').trim(),materialGroup:String(pick(r,'materialGroup')??pickAny(r,['Mal grubu','Mal Grubu','Malzeme grubu','Malzeme Grubu'])??'').trim(),materialGroupDesc:String(pick(r,'materialGroupDesc')??pickAny(r,['Mal grubu tanımı','Mal Grubu Tanımı','Malzeme grubu tanımı','Malzeme Grubu Tanımı'])??'').trim(),uom:String(pick(r,'uom')??'').trim(),qty:q,unrestrictedValue:uv,totalValue:tv,valuationType:String(pick(r,'valuationType')??'').trim(),depotType:String(pick(r,'depotType')??'').trim(),currency:String(pick(r,'currency')??'').trim(),unitPrice:q>0&&uv>0?uv/q:(q>0&&tv>0?tv/q:0)}}).filter(r=>r.materialCode&&r.plant&&r.dy);
  state.data.z98=allRows('ZMM098').map(r=>{const openAvailable=pickAny(r,['Rez.Yapılabilir Tutar (Açık Rez.Dahil)']);const fallbackAvailable=pick(r,'z98Available');return{raw:r,uy:String(pick(r,'plant')??'').trim(),dy:String(pick(r,'storageLoc')??'').trim(),dyDesc:String(pick(r,'storageDesc')??'').trim(),main:num(pick(r,'guaranteeMain')),cash:num(pick(r,'guaranteeCash')),manual:num(pick(r,'guaranteeManual')),stockValue:num(pick(r,'z98StockValue')),available:num(String(openAvailable??'').trim()!==''?openAvailable:fallbackAvailable),availableSource:String(openAvailable??'').trim()!==''?'OPEN_RESERVATIONS_INCLUDED':'FALLBACK'}}).filter(r=>r.uy&&r.dy);
  const depRows=[...sheetToObjects(sheetRows('TANIMLAR','TB_Depo_Kodlari')),...sheetToObjects(sheetRows('TANIMLAR','SITE_DEPOLAR'))];
  state.data.depots=depRows.map(r=>{const uy=String(pick(r,'plant')??r.UY??'').trim(),dy=String(pick(r,'storageLoc')??r.Depo_yeri??r.Depo_Yeri??'').trim(),contractName=String(pick(r,'contractName')??r.Sozlesme_Adi??'').trim(),dyDesc=String(pick(r,'storageDesc')??r.Depo_Yeri_Tanimi??r.Depo_Tanimi??'').trim();let workType=String(pick(r,'workType')??r.Is_Turu??r.Is_Turu_Kodu??'').trim();if(!['T','K','B','L'].includes(workCode(workType))){const inferred=kesifTextCode(contractName)||kesifTextCode(dyDesc)||(/^B\d+$/i.test(dy)?'B':'');if(inferred)workType=workLabel(inferred)}return{raw:r,uy,dy,dyDesc,depotType:String(pick(r,'depotType')??r.Depo_Turu??'').trim(),workType,contractName,companyName:String(pick(r,'companyName')??r.Firma_Adi??'').trim(),active:String(pick(r,'active')??r.Aktif??'').trim()}}).filter(r=>r.uy&&r.dy);
  state.data.projects=sheetToObjects(sheetRows('TANIMLAR','SITE_PROJELER')).map(r=>({projectId:String(pick(r,'projectId')??r.Proje_ID??'').trim(),projectName:String(pick(r,'projectName')??r.Proje_Adi??'').trim(),uy:String(pick(r,'plant')??r.UY??'').trim(),dy:String(pick(r,'storageLoc')??r.Depo_Yeri??'').trim(),workType:String(pick(r,'workType')??r.Is_Turu??'').trim(),active:String(pick(r,'active')??r.Aktif??'').trim()})).filter(r=>r.projectId&&r.dy);
  state.data.materials=sheetToObjects(sheetRows('TANIMLAR','SITE_MALZEMELER')).map(r=>({materialCode:String(r.Malzeme_Kodu??pick(r,'materialCode')??'').trim(),materialDesc:String(r.Malzeme_Tanimi??pick(r,'materialDesc')??'').trim(),materialGroup:String(r.Mal_Grubu??r.Malzeme_Grubu??pick(r,'materialGroup')??'').trim(),materialGroupDesc:String(r.Mal_Grubu_Tanimi??r.Malzeme_Grubu_Tanimi??pick(r,'materialGroupDesc')??'').trim(),uom:String(r.Birim??pick(r,'uom')??'').trim()})).filter(r=>r.materialCode);
  // Büyük keşif dosyaları açılışta tarayıcıya yüklenmez. İlgili hedef depo
  // ve malzemeler seçildiğinde ensureKesifContext() ile küçük bir karar dilimi alınır.
  state.data.kesif=[];
}

function kesifSourceFingerprint(){
  const f=state.files.KESIFLER||{};
  return (f.files||[]).map(x=>`${x.name}:${x.size}:${x.lastModified}:${x.role||''}`).join('|');
}
async function ensureKesifContext(dy,materialCodes){
  dy=String(dy||'').trim();const mats=uniq((materialCodes||[]).map(x=>String(x||'').trim())).sort();
  if(!dy||!mats.length)return;
  const cacheKey=`${kesifSourceFingerprint()}|${dy}|${mats.join(',')}`;
  if(kesifContextLoaded.has(cacheKey))return;
  const qs=new URLSearchParams({dy,materials:mats.join(',')});
  const data=await fetchApiJson('/api/kesif-context?'+qs.toString(),{},120000);
  const set=new Set(mats);
  state.data.kesif=(state.data.kesif||[]).filter(x=>!(String(x.dy)===dy&&set.has(String(x.materialCode))));
  const existingProjects=new Map((state.data.projects||[]).map(p=>[key(p.dy,norm(p.projectName)),p]));
  for(const r of data.rows||[]){
    const code=workCode(r.workCode||''),projectName=String(r.projectName||'').trim();
    let projectId='';
    if(code==='T'&&projectName){
      const pk=key(dy,norm(projectName));let p=existingProjects.get(pk);
      if(p){p.sourceKesif='KESIFLER';p.source=p.source||'KESIFLER';projectId=p.projectId}
      else{const dep=(state.data.depots||[]).find(d=>String(d.dy)===dy)||{};p={projectId:stableKesifProjectId(dy,projectName),projectName,uy:String(dep.uy||'').trim(),dy,workType:'TESİS',active:'EVET',source:'KESIFLER',sourceKesif:'KESIFLER'};state.data.projects.push(p);existingProjects.set(pk,p);projectId=p.projectId}
    }
    const dep=(state.data.depots||[]).find(d=>String(d.dy)===dy)||{};
    state.data.kesif.push({uy:String(dep.uy||'').trim(),dy,projectId,projectName,workType:code,materialCode:String(r.materialCode||'').trim(),planned:num(r.planned),given:num(r.given),remaining:num(r.remaining),metric:num(r.planned),metricName:'Teslim Edilen',sheet:code==='T'?'Tesis_Verileri':code==='K'?'KET_Verileri':code==='B'?'BAKIM_Verileri':'LED_Verileri',sourceModel:'CSV_DELIVERY_BALANCE_LAZY',sourceRow:0,groupNo:String(r.groupNo||'').trim(),groupDesc:String(r.groupDesc||'').trim(),contractor:String(r.contractor||'').trim()});
  }
  kesifContextLoaded.add(cacheKey);buildIndexes();
}
async function ensureKesifForCurrentSelection(){
  if(state.ui.mode==='manual'){
    if(!state.ui.manualReady||!state.ui.manualTargetKey)return;
    const target=splitDepotKey(state.ui.manualTargetKey);await ensureKesifContext(target.dy,(state.ui.manualRows||[]).map(r=>r.materialCode).filter(code=>!isDiscoveryExempt(code)));return;
  }
  const rows=(state.data.zmm||[]).filter(r=>String(r.reservationNo)===String(state.ui.reservationNo));
  if(!rows.length)return;await ensureKesifContext(rows[0].recvDY,rows.map(r=>r.materialCode).filter(code=>!isDiscoveryExempt(code)));
}

function buildIndexes(){
  const ix={depots:new Map(),guar:new Map(),stock:new Map(),depotValue:new Map(),plantPrice:new Map(),kesifDepot:new Map(),kesifDepotPlan:new Map(),kesifDepotGiven:new Map(),kesifProject:new Map(),kesifProjectPlan:new Map(),kesifProjectGiven:new Map(),projectsByDepot:new Map(),reservationSearch:[],depotSearch:[],materialCatalog:new Map(),materialByPlant:new Map(),materialSearch:[],exemptions:new Map()};
  for(const x of state.data.exemptions||[]){if(x?.materialCode)ix.exemptions.set(String(x.materialCode).trim(),x)}
  for(const d of state.data.depots||[]){const k=key(d.uy,d.dy);const old=ix.depots.get(k);if(!old||(!old.companyName&&d.companyName)||(!old.workType&&d.workType))ix.depots.set(k,d)}
  // Ana depolar TANIMLAR'da bulunmayabilir; MB52 depo/üretim yeri bilgisi manuel depo seçimi için güvenli tamamlayıcıdır.
  for(const s of state.data.mb52||[]){const k=key(s.plant,s.dy),old=ix.depots.get(k);if(!old)ix.depots.set(k,{uy:s.plant,dy:s.dy,dyDesc:s.dyDesc||'',depotType:s.depotType||'',workType:'',contractName:'',companyName:'',active:'EVET'});else{if(!old.dyDesc&&s.dyDesc)old.dyDesc=s.dyDesc;if(!old.depotType&&s.depotType)old.depotType=s.depotType}}
  for(const g of state.data.z98||[]){g.total=g.main+g.cash+g.manual;ix.guar.set(key(g.uy,g.dy),g)}
  const priceAgg=new Map();
  for(const s of state.data.mb52||[]){const sk=key(s.plant,s.dy,s.materialCode),cur=ix.stock.get(sk)||{qty:0,totalValue:0,unrestrictedValue:0};cur.qty+=s.qty;cur.totalValue+=s.totalValue;cur.unrestrictedValue+=s.unrestrictedValue;ix.stock.set(sk,cur);ix.depotValue.set(key(s.plant,s.dy),(ix.depotValue.get(key(s.plant,s.dy))||0)+s.totalValue);if(s.qty>0&&s.unitPrice>0){const pk=key(s.plant,s.materialCode),p=priceAgg.get(pk)||{qty:0,value:0};p.qty+=s.qty;p.value+=s.qty*s.unitPrice;priceAgg.set(pk,p)}}
  for(const [k,p] of priceAgg)ix.plantPrice.set(k,p.qty>0?p.value/p.qty:0);
  for(const m of state.data.materials||[]){if(!ix.materialCatalog.has(m.materialCode))ix.materialCatalog.set(m.materialCode,m)}
  for(const s of state.data.mb52||[]){
    const info={materialCode:s.materialCode,materialDesc:s.materialDesc||'',uom:s.uom||''};
    if(!ix.materialCatalog.has(s.materialCode)||(!ix.materialCatalog.get(s.materialCode)?.materialDesc&&info.materialDesc))ix.materialCatalog.set(s.materialCode,info);
    const pk=key(s.plant,s.materialCode);if(!ix.materialByPlant.has(pk)||(!ix.materialByPlant.get(pk)?.materialDesc&&info.materialDesc))ix.materialByPlant.set(pk,info);
  }
  ix.materialSearch=[...ix.materialCatalog.values()].map(m=>({
    ...m,searchText:normalizeSearchText([m.materialCode,m.materialDesc,m.uom].join(' '))
  })).sort((a,b)=>String(a.materialCode).localeCompare(String(b.materialCode),'tr',{numeric:true}));
  for(const k of state.data.kesif||[]){
    const planned=num(k.planned??k.metric),given=num(k.given),remaining=num(k.remaining??k.metric);
    if(k.projectId){
      const kk=key(k.projectId,k.materialCode);ix.kesifProject.set(kk,remaining);ix.kesifProjectPlan.set(kk,planned);ix.kesifProjectGiven.set(kk,given);
    }else if(k.dy){
      const kk=key(workCode(k.workType),k.dy,k.materialCode);ix.kesifDepot.set(kk,remaining);ix.kesifDepotPlan.set(kk,planned);ix.kesifDepotGiven.set(kk,given);
    }
  }
  for(const p of state.data.projects||[]){if(!isActive(p.active))continue;const k=key(p.uy,p.dy);if(!ix.projectsByDepot.has(k))ix.projectsByDepot.set(k,[]);ix.projectsByDepot.get(k).push(p)}
  // Rezervasyonlar tekilleştirilir; dinamik arama her ZMM048 satırını değil rezervasyonu tarar.
  const reservationMap=new Map();
  for(const r of state.data.zmm||[]){
    let item=reservationMap.get(r.reservationNo);
    if(!item){
      item={
        reservationNo:r.reservationNo,status:r.status||'',approvalStatus:r.approvalStatus||'',
        recvUY:r.recvUY||'',recvDY:r.recvDY||'',recvUYDesc:r.recvUYDesc||'',
        sourceUY:r.sourceUY||'',sourceDY:r.sourceDY||'',materials:new Set(),rowCount:0
      };
      reservationMap.set(r.reservationNo,item);
    }
    item.rowCount++;
    if(r.materialCode)item.materials.add(r.materialCode);
    if(!item.status&&r.status)item.status=r.status;
    if(!item.approvalStatus&&r.approvalStatus)item.approvalStatus=r.approvalStatus;
  }
  ix.reservationSearch=[...reservationMap.values()].map(item=>{
    const depot=ix.depots.get(key(item.recvUY,item.recvDY))||{};
    const depotDesc=depot.dyDesc||'';
    const companyName=depot.companyName||'';
    const contractName=depot.contractName||'';
    const searchText=normalizeSearchText([
      item.reservationNo,item.recvUY,item.recvDY,depotDesc,companyName,contractName,
      item.status,item.approvalStatus,item.recvUYDesc
    ].join(' '));
    return{
      ...item,
      materialCount:item.materials.size,
      materials:undefined,
      depotDesc,companyName,contractName,
      searchText
    };
  }).sort((a,b)=>Number(b.reservationNo)-Number(a.reservationNo));
  ix.depotSearch=[...ix.depots.values()].filter(d=>isActive(d.active)).map(d=>({
    ...d,searchText:normalizeSearchText([d.uy,d.dy,d.dyDesc,d.depotType,d.workType,d.companyName,d.contractName].join(' '))
  })).sort((a,b)=>String(a.uy).localeCompare(String(b.uy),'tr')||String(a.dy).localeCompare(String(b.dy),'tr'));
  state.ix=ix;
}

function validateData(){
  if(!state.books.ZMM048)state.diagnostics.push({level:'bad',text:'Rezervasyon verisi yok; rezervasyon sorgulaması kullanılamaz.'});
  if(!state.books.ZMM098)state.diagnostics.push({level:'bad',text:'Teminat verisi yok; teminat kontrolü kullanılamaz.'});
  if(!state.books.MB52)state.diagnostics.push({level:'bad',text:'Güncel depo stok verisi yok; teminat ve kaynak üretim yeri fiyat hesapları kullanılamaz.'});
  if(!state.books.TANIMLAR)state.diagnostics.push({level:'bad',text:'Tanım verisi yok; depo, sözleşme, firma ve proje bilgileri kullanılamaz.'});
  if(!state.books.KESIFLER)state.diagnostics.push({level:'bad',text:'Keşif verisi yok; keşif kontrolü kullanılamaz.'});
  if(!state.files.MB51||state.files.MB51.status==='missing')state.diagnostics.push({level:'warn',text:'Stok hareketleri kaynağı bulunamadı. Karar ekranı çalışır; ilerideki raporlama fonksiyonları kullanılamaz.'});
  if(state.data.zmm?.length===0&&state.books.ZMM048)state.diagnostics.push({level:'bad',text:'ZMM048 içinde rezervasyon + malzeme satırı algılanamadı.'});
  if(state.data.mb52?.length===0&&state.books.MB52)state.diagnostics.push({level:'bad',text:'MB52 içinde kullanılabilir stok satırı algılanamadı.'});
}

function depotInfo(uy,dy){return state.ix.depots.get(key(uy,dy))||{uy,dy,dyDesc:'',depotType:'',workType:'',contractName:'',companyName:''}}
function isCepYapim(d){return norm(d?.depotType).includes('cepyapim')||norm(d?.depotType).includes('yapim')}
function stockQty(uy,dy,mat){return state.ix.stock.get(key(uy,dy,mat))?.qty||0}
function depotStockValue(uy,dy){
  const qtyByMaterial=new Map();
  for(const s of state.data.mb52||[]){
    if(String(s.plant)!==String(uy)||String(s.dy)!==String(dy))continue;
    qtyByMaterial.set(s.materialCode,(qtyByMaterial.get(s.materialCode)||0)+num(s.qty));
  }
  let total=0;
  for(const [mat,qty] of qtyByMaterial){
    const unitPrice=state.ix.plantPrice.get(key(uy,mat))||0;
    total+=qty*unitPrice;
  }
  return total;
}
function priceFor(uy,mat){return state.ix.plantPrice.get(key(uy,mat))||0}
function activeProjects(uy,dy){
  const list=(state.ix.projectsByDepot.get(key(uy,dy))||[]).filter(p=>workCode(p.workType)==='T'||!p.workType);
  const modern=(state.data.kesif||[]).some(k=>workCode(k.workType)==='T');
  return modern?list.filter(p=>p.sourceKesif==='KESIFLER'||p.source==='KESIFLER'):list;
}

function groupMaterials(rows){const map=new Map();for(const r of rows){const k=r.materialCode;if(!map.has(k))map.set(k,{materialCode:k,materialDesc:r.materialDesc,uom:r.uom,qty:0,rows:[]});const g=map.get(k);g.qty+=r.qty;g.rows.push(r);if(!g.materialDesc&&r.materialDesc)g.materialDesc=r.materialDesc;if(!g.uom&&r.uom)g.uom=r.uom}return [...map.values()]}

function getKesifFor(ctx,mat){
  const target=ctx.target,work=ctx.workCode||resolveContextWorkCode(target,ctx.targetDY,[mat]),stock=stockQty(ctx.targetUY,ctx.targetDY,mat.materialCode);
  if(work==='T'){
    // TESIS kesif kontrolu TANIMLAR proje eslesmesine bagli olmamali.
    // Kaynak KESIFLER CSV'deki hedef depo + malzeme satirlari dogrudan toplanir.
    const raw=(state.data.kesif||[]).filter(k=>workCode(k.workType)==='T'&&String(k.dy)===String(ctx.targetDY)&&String(k.materialCode)===String(mat.materialCode));
    let planned=0,given=0,remaining=0;const details=[];
    for(const k of raw){
      planned+=num(k.planned);given+=num(k.given);remaining+=num(k.remaining);
      let p=(state.data.projects||[]).find(x=>x.projectId===k.projectId);
      if(!p)p={projectId:k.projectId||stableKesifProjectId(k.dy,k.projectName),projectName:k.projectName||'Tanimsiz Proje',uy:k.uy||ctx.targetUY,dy:k.dy||ctx.targetDY,workType:'T',active:'EVET',source:'KESIFLER',sourceKesif:'KESIFLER'};
      details.push({project:p,planned:num(k.planned),given:num(k.given),remaining:num(k.remaining)});
    }
    return{work:'T',metric:planned,planned,given,stock,remaining,details,found:raw.length>0,sourceModel:'CSV_DELIVERY_BALANCE'};
  }
  const kk=key(work,ctx.targetDY,mat.materialCode),remaining=state.ix.kesifDepot.get(kk),planned=state.ix.kesifDepotPlan.get(kk),given=state.ix.kesifDepotGiven.get(kk);
  return{work,metric:planned==null?null:num(planned),planned:planned==null?null:num(planned),given:given==null?0:num(given),stock,remaining:remaining==null?null:num(remaining),details:[],found:remaining!=null,sourceModel:'DELIVERY_BALANCE'};
}

function buildContextFromRows(rows,{mode='reservation',referenceNo='',sourceUY='',sourceDY='',targetUY='',targetDY=''}={}){
  if(!rows?.length)return null;
  const first=rows[0];
  sourceUY=sourceUY||first.sourceUY;sourceDY=sourceDY||first.sourceDY;targetUY=targetUY||first.recvUY;targetDY=targetDY||first.recvDY;
  const target=depotInfo(targetUY,targetDY),source=depotInfo(sourceUY,sourceDY),mats=groupMaterials(rows);
  const resolvedWorkCode=resolveContextWorkCode(target,targetDY,mats);if(resolvedWorkCode&&!['T','K','B','L'].includes(workCode(target.workType)))target.workType=workLabel(resolvedWorkCode);
  const isTesis=resolvedWorkCode==='T';
  const ctx={mode,reservationNo:referenceNo||'',rows,first,target,source,targetUY,targetDY,sourceUY,sourceDY,materials:mats,errors:[],warnings:[],isTesis,workCode:resolvedWorkCode};
  if(mode==='reservation'){
    const targets=uniq(rows.map(r=>key(r.recvUY,r.recvDY))),sources=uniq(rows.map(r=>key(r.sourceUY,r.sourceDY)));
    if(targets.length>1)ctx.errors.push('Rezervasyonda birden fazla talep eden/hedef depo bulundu. ZMM048 verisi kontrol edilmeli.');
    if(sources.length>1)ctx.warnings.push('Rezervasyonda birden fazla talep edilen/kaynak depo bulundu.');
  }else{
    if(key(sourceUY,sourceDY)===key(targetUY,targetDY))ctx.errors.push('Talep edilen depo ile talep eden depo aynı olamaz.');
    if(!source.dyDesc)ctx.warnings.push('Talep edilen depo TANIMLAR içinde bulunamadı; kaynak depo tanımını kontrol edin.');
    if(!target.dyDesc)ctx.warnings.push('Talep eden depo TANIMLAR içinde bulunamadı; hedef depo tanımını kontrol edin.');
  }
  const g=state.ix.guar.get(key(ctx.targetUY,ctx.targetDY));const stockValue=g?.stockValue??depotStockValue(ctx.targetUY,ctx.targetDY);let reservationValue=0,missingPrices=[];
  let guaranteeApplicableCount=0,guaranteeExemptCount=0,discoveryExemptCount=0,exemptGuaranteeValue=0;
  for(const m of mats){
    const exemption=exemptionFor(m.materialCode);m.exemption=exemption;m.discoveryExempt=!!(exemption.active&&exemption.discoveryExempt);m.guaranteeExempt=!!(exemption.active&&exemption.guaranteeExempt);
    if(m.discoveryExempt)discoveryExemptCount++;
    const p=priceFor(ctx.sourceUY,m.materialCode);m.unitPrice=p;m.currentStock=stockQty(ctx.targetUY,ctx.targetDY,m.materialCode);m.kesif=getKesifFor(ctx,m);
    if(m.guaranteeExempt){guaranteeExemptCount++;if(p>0)exemptGuaranteeValue+=m.qty*p;continue}
    guaranteeApplicableCount++;
    if(!(p>0))missingPrices.push(m.materialCode);else reservationValue+=m.qty*p;
  }
  const totalGuarantee=g?.total??null,availableBase=g?.available??null,allGuaranteeExempt=guaranteeApplicableCount===0&&mats.length>0;
  const after=availableBase==null?null:(mode==='manual'?(allGuaranteeExempt?availableBase:availableBase-reservationValue):availableBase+exemptGuaranteeValue);
  ctx.guarantee={found:!!g,total:totalGuarantee,stockValue,reservationValue,exemptValue:exemptGuaranteeValue,before:availableBase,after,availableBase,source:g,allExempt:allGuaranteeExempt,applicableCount:guaranteeApplicableCount,exemptCount:guaranteeExemptCount,calculationMode:allGuaranteeExempt?'ALL_MATERIALS_EXEMPT':(mode==='manual'?'ZMM098_OPEN_AVAILABLE_MINUS_MANUAL_REQUEST':'ZMM098_OPEN_AVAILABLE_PLUS_EXEMPT_CURRENT_REQUEST')};
  ctx.exemptionSummary={guaranteeExemptCount,discoveryExemptCount,totalMaterials:mats.length};
  if(!g&&!allGuaranteeExempt)ctx.errors.push('Bu depo için ZMM098 teminat kaydı bulunamadı.');
  if(mode==='manual'&&missingPrices.length)ctx.errors.push(`Güncel MB52 kaynak üretim yeri fiyatı bulunamayan malzemeler: ${uniq(missingPrices).join(', ')}.`);
  if(g&&!allGuaranteeExempt&&ctx.guarantee.after<0)ctx.errors.push(`Teminat, bu talep sonrasında ${fmtMoney(Math.abs(ctx.guarantee.after))} yetersiz kalıyor.`);
  for(const m of mats){
    if(m.discoveryExempt)continue;
    if(!m.kesif.found)ctx.errors.push(`${m.materialCode}: Keşif verisi bulunamadı.`);
    else if(!ctx.isTesis&&m.kesif.remaining<m.qty)ctx.errors.push(`${m.materialCode}: Kalan keşif ${fmtNum(m.kesif.remaining)} ${m.uom}; talep ${fmtNum(m.qty)} ${m.uom}.`);
  }
  ctx.projects=ctx.isTesis?activeProjects(ctx.targetUY,ctx.targetDY):[];
  if(ctx.isTesis&&!ctx.projects.length)ctx.errors.push('TESİS deposuna bağlı aktif alt proje bulunamadı.');
  if(mode==='reservation'){
    const st=norm(first.status);if(st.includes('kapali'))ctx.warnings.push('Rezervasyon KAPALI durumda; sonuç bilgi amaçlıdır.');if(st.includes('silin'))ctx.warnings.push('Rezervasyon SİLİNMİŞ durumda; sonuç bilgi amaçlıdır.');
  }
  return ctx;
}
function computeContext(resNo){
  const rows=(state.data.zmm||[]).filter(r=>String(r.reservationNo)===String(resNo));if(!rows.length)return null;
  return buildContextFromRows(rows,{mode:'reservation',referenceNo:String(resNo)});
}
function splitDepotKey(v){const [uy='',dy='']=String(v||'').split('|');return{uy,dy}}
function computeManualContext(){
  if(!state.ui.manualReady||!state.ui.manualRows.length||!state.ui.manualSourceKey||!state.ui.manualTargetKey)return null;
  const source=splitDepotKey(state.ui.manualSourceKey),target=splitDepotKey(state.ui.manualTargetKey);
  const rows=state.ui.manualRows.map((r,i)=>({
    raw:r.raw||{},rowNo:i+1,itemNo:String(i+1),reservationNo:'MANUEL',status:'MANUEL',approvalStatus:'',
    sourceUY:source.uy,sourceDY:source.dy,sourceDYDesc:depotInfo(source.uy,source.dy).dyDesc||'',
    recvUY:target.uy,recvDY:target.dy,recvUYDesc:depotInfo(target.uy,target.dy).dyDesc||'',
    movementType:'',materialCode:r.materialCode,materialDesc:r.materialDesc||'',qty:num(r.qty),deliveredQty:0,uom:r.uom||''
  }));
  return buildContextFromRows(rows,{mode:'manual',referenceNo:'MANUEL',sourceUY:source.uy,sourceDY:source.dy,targetUY:target.uy,targetDY:target.dy});
}
function currentContext(){return state.ui.mode==='manual'?computeManualContext():computeContext(state.ui.reservationNo)}

function badge(text,cls='neutral'){return `<span class="badge ${esc(cls)}">${esc(text)}</span>`}
function discoveryStatusBadge(mat,ok,checked){if(mat?.discoveryExempt)return badge('Muaf','exempt');return checked?badge(ok?'Uygun':'Yetersiz',ok?'ok':'bad'):badge('Bekliyor','neutral')}
function guaranteeStatusBadge(mat,ok,checked){if(mat?.guaranteeExempt)return badge('Muaf','exempt');return checked?badge(ok?'Uygun':'Yetersiz',ok?'ok':'bad'):badge('Bekliyor','neutral')}
function fileState(src){
  const f=state.files[src];
  if(!f)return{label:'Bulunamadı',cls:'bad'};
  if(f.status==='bad'||f.status==='missing')return{label:'Hata',cls:'bad'};
  if(src==='MB51'&&f.status==='ready')return{label:'Hazır',cls:'ok'};
  if(f.status==='ok'||f.status==='ready')return{label:'Hazır',cls:'ok'};
  return{label:'Bekliyor',cls:'neutral'};
}

let sourceUpdateCurrent=null,sourceUpdateQueue=[],sourceUpdateSeen=new Set();
function sourceUpdateLabel(src){return FRIENDLY[src]||src}
function formatBytes(n){n=Number(n)||0;if(n>=1024*1024*1024)return (n/1024/1024/1024).toLocaleString('tr-TR',{maximumFractionDigits:2})+' GB';if(n>=1024*1024)return (n/1024/1024).toLocaleString('tr-TR',{maximumFractionDigits:1})+' MB';if(n>=1024)return (n/1024).toLocaleString('tr-TR',{maximumFractionDigits:1})+' KB';return n.toLocaleString('tr-TR')+' B'}
function closeSourceUpdateModal(){const m=$('#sourceUpdateModal');if(m){m.hidden=true;m.setAttribute('aria-hidden','true')}sourceUpdateCurrent=null;document.body.classList.remove('modal-open')}
function openSourceUpdateModal(item){if(!item)return;sourceUpdateCurrent=item;const m=$('#sourceUpdateModal');if(!m)return;m.hidden=false;m.setAttribute('aria-hidden','false');document.body.classList.add('modal-open');$('#sourceUpdateTitle').textContent=`${sourceUpdateLabel(item.source)} – Yeni kaynak verisi eklendi`;$('#sourceUpdateSubtitle').textContent='Yeni veri kalite kontrollerinden geçip siz onaylayana kadar mevcut sağlıklı ACTIVE veri kullanılmaya devam eder.';$('#sourceUpdateSummary').innerHTML=`<div><span>Mevcut kaynak</span><strong>${esc(item.oldName||'—')}</strong></div><div><span>Yeni kaynak</span><strong>${esc(item.newName||'—')}</strong></div><div><span>Mevcut boyut</span><strong>${formatBytes(item.oldSize)}</strong></div><div><span>Yeni boyut</span><strong>${formatBytes(item.newSize)}</strong></div><div><span>Mevcut tarih</span><strong>${esc(item.oldModified||'—')}</strong></div><div><span>Yeni tarih</span><strong>${esc(item.newModified||'—')}</strong></div>`;const det=$('#sourceUpdateDetails');if(det){det.hidden=true;det.textContent=`Aktif imza: ${item.activeDigest||'—'}\nYeni imza: ${item.candidateDigest||'—'}\nDosya sayısı: ${item.oldFileCount||0} → ${item.newFileCount||0}\n\n“Eski Veriyle Devam Et” seçilirse mevcut ACTIVE değişmez. “Yeni Veriye Güncelle” seçilirse yeni kaynak şema, bütünlük ve kalite kontrolünden geçer; CRITICAL hata halinde güncelleme reddedilir.`}}
function scheduleSourceUpdateAlerts(items=[]){sourceUpdateQueue=(items||[]).filter(x=>!x.deferred&&!sourceUpdateSeen.has(String(x.source||'')+'|'+String(x.candidateDigest||'')));if(sourceUpdateCurrent||!sourceUpdateQueue.length)return;setTimeout(()=>{if(!sourceUpdateCurrent&&sourceUpdateQueue.length){const item=sourceUpdateQueue.shift();sourceUpdateSeen.add(String(item.source||'')+'|'+String(item.candidateDigest||''));openSourceUpdateModal(item)}},250)}
async function pollSourceUpdateStatus(){if(document.hidden)return;try{const snap=await fetchApiJson('/api/files?refresh=1&monitor=1&ts='+Date.now(),{},20000);state.meta.dataEngine=snap.dataEngine||state.meta.dataEngine||{};state.meta.sourceHealth=snap.sourceHealth||state.meta.sourceHealth||{};state.meta.pendingSourceUpdates=snap.pendingSourceUpdates||[];renderCommon();scheduleSourceUpdateAlerts(state.meta.pendingSourceUpdates)}catch(_){}}
async function sourceUpdateChoice(choice){const item=sourceUpdateCurrent;if(!item)return;const source=item.source;if(choice==='keep'){$('#sourceUpdateKeep').disabled=true;try{await fetchApiJson('/api/source-update-choice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source,choice:'keep'})},20000);toast(`${sourceUpdateLabel(source)} için eski veriyle devam ediliyor.`,'info');closeSourceUpdateModal();await loadSources({silent:true,forceScan:true})}catch(e){toast('Kaynak tercihi kaydedilemedi: '+e.message,'error')}finally{if($('#sourceUpdateKeep'))$('#sourceUpdateKeep').disabled=false}return}
  const b=$('#sourceUpdateAccept');if(b){b.disabled=true;b.textContent='Kontrol Ediliyor…'}showRefreshOverlay();setContentLoading(true);try{const data=await fetchApiJson('/api/source-update-choice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source,choice:'accept'})},360000);toast(`${sourceUpdateLabel(source)} yeni veriye güncellendi${data.buildId?' · '+data.buildId:''}.`,'success',6500);closeSourceUpdateModal();await dbClear();await loadSources({silent:true,forceScan:true});if($('#dataCenterView')?.classList.contains('active'))await loadDataCenter();if($('#dashboardView')?.classList.contains('active'))await loadDashboardView()}catch(e){toast('Yeni kaynak ACTIVE yapılamadı: '+e.message,'error',8000)}finally{hideRefreshOverlay();setContentLoading(false);if(b){b.disabled=false;b.textContent='Yeni Veriye Güncelle'}}}
async function selectSourceFile(source){const buttons=$$(`.source-change-btn[data-source="${source}"],.dc-source-change[data-source="${source}"]`);buttons.forEach(b=>b.disabled=true);try{const data=await fetchApiJson('/api/source-select-file',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source})},330000);if(data.cancelled)return;toast(`${sourceUpdateLabel(source)} için yeni kaynak dosyası seçildi. Onay bekliyor.`,'warn',6500);await loadSources({silent:true,forceScan:true});const item=(state.meta.pendingSourceUpdates||[]).find(x=>x.source===source);if(item)openSourceUpdateModal(item);if($('#dataCenterView')?.classList.contains('active'))await loadDataCenter()}catch(e){toast('Kaynak dosyası seçilemedi: '+e.message,'error',7000)}finally{buttons.forEach(b=>b.disabled=false)}}
function bindSourceHealthActions(root=document){root.querySelectorAll?.('.source-change-btn').forEach(b=>b.onclick=()=>selectSourceFile(b.dataset.source));root.querySelectorAll?.('.source-pending-review').forEach(b=>b.onclick=()=>{const item=(state.meta.pendingSourceUpdates||[]).find(x=>x.source===b.dataset.source);if(item)openSourceUpdateModal(item)})}
function renderCommon(){
  const health=$('#dataHealth');
  if(health){
    const healthItems=state.meta.sourceHealth?.sources||[];const hmap=new Map(healthItems.map(x=>[String(x.source||'').toUpperCase(),x]));
    const pendingMap=new Map((state.meta.pendingSourceUpdates||[]).map(x=>[String(x.source||'').toUpperCase(),x]));
    const rows=['ZMM048','MB51','MB52','ZMM098','TESIS','KET','BAKIM','LED'].map(src=>{const h=hmap.get(src)||(['TESIS','KET','BAKIM','LED'].includes(src)?(hmap.get('KESIFLER')||{}):{}),level=String(h.health||(!state.files[src]&&['ZMM048','MB51','MB52','ZMM098'].includes(src)?'CRITICAL':'NORMAL')).toUpperCase(),p=pendingMap.get(src);return `<tr><td><strong>${esc(FRIENDLY[src]||src)}</strong></td><td class="health-state-cell"><span class="health-state-dot normal ${level==='NORMAL'?'on':'off'}">${level==='NORMAL'?'Normal':'—'}</span></td><td class="health-state-cell"><span class="health-state-dot warning ${level==='WARNING'?'on':'off'}">${level==='WARNING'?'Uyarı':'—'}</span></td><td class="health-state-cell"><span class="health-state-dot critical ${level==='CRITICAL'?'on':'off'}">${level==='CRITICAL'?'Kritik':'—'}</span></td><td>${h.age_hours!=null?Number(h.age_hours).toFixed(1)+' sa':'—'}</td><td>${p?`<button class="dc-pending-btn source-pending-review" data-source="${esc(src)}" type="button">Yeni veri bekliyor</button>`:'—'}</td><td><button class="source-health-action source-change-btn" data-source="${esc(src)}" type="button">Kaynak Dosyasını Değiştir</button></td></tr>`}).join('');
    health.innerHTML=`<div class="source-health-inline"><div class="source-health-inline-head"><strong>Kaynak Sağlığı</strong><span>Normal / Uyarı / Kritik durumları ayrı gösterilir. Yeni veri kullanıcı onayı olmadan ACTIVE olmaz.</span></div><div class="table-wrap"><table><thead><tr><th>Kaynak</th><th>Normal</th><th>Uyarı</th><th>Kritik</th><th>Veri Yaşı</th><th>Yeni Veri</th><th>İşlem</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    bindSourceHealthActions(health);
  }

  const roots=$('#fixedRoots');
  if(roots){
    const list=[];
    if(state.meta.externalRoot)list.push(`<span class="root-chip">Öncelikli: ${esc(state.meta.externalRoot)}</span>`);
    if(state.meta.bundledRoot)list.push(`<span class="root-chip">Paket yedeği: ${esc(state.meta.bundledRoot)}</span>`);
    roots.innerHTML=list.join('');
  }

  const cards=$('#sourceCards');
  if(cards){
    cards.innerHTML=SOURCES.map(src=>{
      const f=state.files[src],s=fileState(src);
      if(!f){
        return `<div class="source-card"><div class="name">${esc(FRIENDLY[src]||src)}</div><div class="meta">${badge('Bulunamadı','bad')}</div></div>`;
      }
      const origin=f.origin==='external'?'Dış klasör':'Paket içi';
      const originCls=f.origin==='external'?'':' bundled';
      const size=f.size?`${(Number(f.size)/1024/1024).toLocaleString('tr-TR',{maximumFractionDigits:1})} MB`:'';
      const fileNames=(f.files||[]).map(x=>x.name).join(' • ');const conf=f.confidence?` · İçerikten %${f.confidence}`:'';
      return `<div class="source-card">
        <div class="name">${esc(FRIENDLY[src]||src)}</div>
        <div class="meta">${badge(s.label,s.cls)}${size?` · ${esc(size)}`:''}${esc(conf)}</div>
        <span class="source-origin${originCls}">${esc(origin)}</span>
        <div class="path">${esc(fileNames||f.path||f.name||'')}</div>
      </div>`;
    }).join('');
  }

  const diag=$('#diagnostics');
  if(diag){
    if(!state.diagnostics.length){
      diag.innerHTML=`<div class="diag ok">Veri kaynaklarında kritik bir tutarsızlık algılanmadı.</div>`;
    }else{
      diag.innerHTML=state.diagnostics.map(d=>`<div class="diag ${d.level==='bad'?'bad':d.level==='warn'?'warn':'ok'}">${esc(d.text||'')}</div>`).join('');
    }
  }

  const mode=$('#sourceModeBadge');
  if(mode){
    const external=SOURCES.some(src=>state.files[src]?.origin==='external');
    mode.textContent=external?'CSV • İçerikten Otomatik Tanıma':'Paket CSV Yedeği';
  }
}

function depotSummaryHtml(title,d,uy,dy){
  const extras=isCepYapim(d)
    ? `${d.contractName?`<div><span>Sözleşme</span><strong class="wide">${esc(d.contractName)}</strong></div>`:''}${d.companyName?`<div><span>Firma</span><strong class="wide">${esc(d.companyName)}</strong></div>`:''}`
    : '';
  return `<div class="summary-card"><span>${esc(title)}</span><strong>${esc(uy||'-')} / ${esc(dy||'-')}</strong><small>${esc(d?.dyDesc||'')}</small></div>
  <div class="summary-card"><span>Depo Türü / İş Türü</span><strong>${esc(d?.depotType||'-')}</strong><small>${esc(d?.workType||'')}</small></div>${extras}`;
}

function renderAlerts(ctx){
  const box=$('#reservationAlerts');if(!box)return;
  const items=[];
  // Malzeme bazlı keşif yetersizliği / keşif kaydı yok mesajları üstte ayrı
  // kırmızı banner olarak gösterilmez. Kontrol motorundaki hata kayıtları korunur;
  // sonuç ve detay ekranlarında değerlendirilmeye devam eder.
  const visibleErrors=(ctx.errors||[]).filter(e=>!/^.+: (Keşif verisi bulunamadı|Kalan keşif )/.test(String(e||'')));
  for(const e of visibleErrors)items.push(`<div class="alert bad">${esc(e)}</div>`);
  for(const w of ctx.warnings||[])items.push(`<div class="alert warn">${esc(w)}</div>`);
  box.innerHTML=items.join('');
  box.hidden=!items.length;
}


function summaryLine(label,value,cls=''){
  return `<div class="summary-line"><span class="label">${esc(label)}</span><span class="value ${esc(cls)}">${esc(value)}</span></div>`;
}

function guaranteeIsOk(ctx){const g=ctx?.guarantee||{};if(g.allExempt)return true;if(!g.found||g.after==null||g.after<0)return false;if(ctx.mode==='manual'&&ctx.materials.some(m=>!m.guaranteeExempt&&!(num(m.unitPrice)>0)))return false;return true}
function guaranteeUsageRatio(ctx){const g=ctx?.guarantee||{},total=num(g.total);if(g.allExempt)return null;if(!(total>0)||g.after==null)return null;const used=Math.max(0,total-num(g.after));return used/total}

function renderGuaranteeCoverage(ctx){
  const g=ctx.guarantee||{},ratioRaw=guaranteeUsageRatio(ctx),ratio=ratioRaw==null?null:ratioRaw*100,total=num(g.total),used=ratioRaw==null?null:Math.max(0,total-num(g.after));
  const percent=$('#coveragePercent'),fill=$('#coverageFill'),threshold=$('.coverage-threshold'),maxLabel=$('#coverageMaxLabel'),detail=$('#coverageDetail'),gauge=$('#coverageGauge');
  const usedEl=$('#guaranteeUsed'),totalEl=$('#guaranteeTotal'),availEl=$('#guaranteeAvailable'),kpiTotal=$('#guaranteeKpiTotal'),kpiAvail=$('#guaranteeKpiAvailable'),kpiEffect=$('#guaranteeKpiEffect'),currentPct=$('#guaranteeCurrentPercent');
  if(g.allExempt){
    if(usedEl)usedEl.textContent='Muaf';if(totalEl)totalEl.textContent=total>0?fmtMoney(total):'—';if(availEl)availEl.textContent=g.after==null?'—':fmtMoney(g.after);
    if(kpiTotal)kpiTotal.textContent=total>0?fmtMoney(total):'—';if(kpiAvail)kpiAvail.textContent=g.after==null?'—':fmtMoney(g.after);if(kpiEffect)kpiEffect.textContent=fmtMoney(0);
    if(percent)percent.textContent='MUAF';if(currentPct)currentPct.textContent='MUAF';if(fill)fill.style.width='0%';if(threshold)threshold.style.left='100%';if(maxLabel)maxLabel.textContent='100%';if(gauge)gauge.style.setProperty('--coverage-deg','0deg');
    if(detail)detail.innerHTML=`<strong>Teminat kontrolü:</strong> Listedeki ${g.exemptCount||ctx.materials.length} malzemenin tamamı teminattan muaf. Muaf malzemelerin tutarı teminat hesabına dahil edilmedi.`;
    const trendLine=$('#trendCurrentLine'),trendMonth=$('#trendCurrentMonth');if(trendLine)trendLine.style.setProperty('--trend-level','100%');if(trendMonth)trendMonth.textContent='Teminat muaf';
    return;
  }
  if(usedEl)usedEl.textContent=used==null?'—':fmtMoney(used);
  if(totalEl)totalEl.textContent=total>0?fmtMoney(total):'—';
  if(availEl)availEl.textContent=g.after==null?'—':fmtMoney(g.after);
  if(kpiTotal)kpiTotal.textContent=total>0?fmtMoney(total):'—';
  if(kpiAvail)kpiAvail.textContent=g.after==null?'—':fmtMoney(g.after);
  if(kpiEffect)kpiEffect.textContent=fmtMoney(g.reservationValue||0);
  if(!percent||!fill||!threshold||!maxLabel||!detail)return;
  if(ratio==null||!Number.isFinite(ratio)){
    percent.textContent='—';if(currentPct)currentPct.textContent='—';fill.style.width='0%';threshold.style.left='100%';maxLabel.textContent='100%';if(gauge)gauge.style.setProperty('--coverage-deg','0deg');
    const trendLine=$('#trendCurrentLine'),trendMonth=$('#trendCurrentMonth');if(trendLine)trendLine.style.setProperty('--trend-level','100%');if(trendMonth)trendMonth.textContent='Mevcut oran hesaplanamadı';
    detail.textContent='Oran hesaplanamadı; ZMM098 toplam teminat ve kullanılabilir tutar alanlarını kontrol edin.';return;
  }
  const graphMax=Math.max(100,Math.ceil(Math.max(0,ratio)/25)*25||100),visualPct=Math.max(0,Math.min(100,(ratio/graphMax)*100)),thresholdPct=(100/graphMax)*100;
  const label=`%${fmtNum(ratio,1)}`;
  percent.textContent=label;if(currentPct)currentPct.textContent=label;if(gauge)gauge.style.setProperty('--coverage-deg',`${Math.max(0,Math.min(100,ratio))*3.6}deg`);
  const trendLine=$('#trendCurrentLine'),trendMonth=$('#trendCurrentMonth');
  if(trendLine){const clamped=Math.max(0,Math.min(100,ratio));trendLine.style.setProperty('--trend-level',`${100-clamped}%`)}
  if(trendMonth){const now=new Date(),monthNames=['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];trendMonth.textContent=`${monthNames[now.getMonth()]} · ${label}`;}
  percent.classList.remove('coverage-state-ok','coverage-state-warn','coverage-state-bad');fill.classList.remove('coverage-fill-ok','coverage-fill-warn','coverage-fill-bad');
  if(ratio>100){percent.classList.add('coverage-state-bad');fill.classList.add('coverage-fill-bad')}else if(ratio>=80){percent.classList.add('coverage-state-warn');fill.classList.add('coverage-fill-warn')}else{percent.classList.add('coverage-state-ok');fill.classList.add('coverage-fill-ok')}
  fill.style.width=`${visualPct}%`;threshold.style.left=`${thresholdPct}%`;maxLabel.textContent=`${graphMax}%`;
  const remainingLabel=ctx.mode==='manual'?'Talep sonrası kullanılabilir':'Kullanılabilir (Açık Rez. Dahil)';
  const stockInfo=g.stockValue==null?'':` &nbsp; · &nbsp; <strong>ZMM098 Depo Stok (Bilgi):</strong> ${fmtMoney(g.stockValue)}`;
  detail.innerHTML=`<strong>Kullanılmış teminat:</strong> ${fmtMoney(used)} &nbsp; · &nbsp; <strong>Toplam teminat:</strong> ${fmtMoney(total)} &nbsp; · &nbsp; <strong>${remainingLabel}:</strong> ${fmtMoney(g.after)}${stockInfo}`;
}
function renderControlSummary(ctx,checked=false){
  const host=$('#controlSummaryStack');if(!host)return;
  const t=ctx.target||{},s=ctx.source||{},g=ctx.guarantee||{};
  const tExtra=isCepYapim(t)?summaryLine('Sözleşme Adı',t.contractName||'-')+summaryLine('Firma Adı',t.companyName||'-'):'';
  const sExtra=isCepYapim(s)?summaryLine('Sözleşme Adı',s.contractName||'-')+summaryLine('Firma Adı',s.companyName||'-'):'';
  const gOk=guaranteeIsOk(ctx);
  const warehouseSvg=(tone='blue')=>`<svg class="warehouse-svg ${tone}" viewBox="0 0 96 76" aria-hidden="true"><path class="wh-roof" d="M10 33 48 10l38 23v35H10z"/><path class="wh-door" d="M32 42h32v26H32z"/><path class="wh-line" d="M15 33h66M38 49h20M38 56h20M38 63h20"/></svg>`;
  const transferLane=`<div class="material-transfer-lane compact-transfer" aria-label="Talep edilen depo ile talep eden depo arasındaki malzeme akışı">
      <div class="transfer-hub" title="Depolar arası akış"><span>⇄</span></div>
    </div>`;
  host.innerHTML=`
    <section class="summary-section depot-card source-depot-card">
      <div class="depot-card-head"><div class="depot-icon source">▣</div><div><h3>Talep Edilen Depo</h3><small>Rezervasyonun teslim edileceği depo</small></div></div>
      <div class="summary-lines">
        ${summaryLine('Üretim Yeri',ctx.sourceUY||'-')}
        ${summaryLine('Depo Yeri',ctx.sourceDY||'-')}
        ${summaryLine('Depo Yeri Tanımı',s.dyDesc||ctx.first.sourceDYDesc||'-')}
        ${summaryLine('Depo Türü',s.depotType||'-')}
        ${summaryLine('İş Türü',s.workType||'-')}
        ${sExtra}
      </div><div class="depot-watermark">${warehouseSvg('blue')}</div>
    </section>
    ${transferLane}
    <section class="summary-section depot-card target-depot-card">
      <div class="depot-card-head"><div class="depot-icon target">▣</div><div><h3>Talep Eden Depo</h3><small>Rezervasyonu talep eden depo</small></div></div>
      <div class="summary-lines">
        ${summaryLine('Üretim Yeri',ctx.targetUY||'-')}
        ${summaryLine('Depo Yeri',ctx.targetDY||'-')}
        ${summaryLine('Depo Yeri Tanımı',t.dyDesc||ctx.first.recvUYDesc||'-')}
        ${summaryLine('Depo Türü',t.depotType||'-')}
        ${summaryLine('İş Türü',t.workType||'-')}
        ${tExtra}
      </div><div class="depot-watermark">${warehouseSvg('green')}</div>
    </section>`;

  renderGuaranteeCoverage(ctx);
  const st=$('#overallSummaryStatus');
  if(st){
    if(!checked)st.innerHTML=badge('Kontrol bekliyor','neutral');
    else st.innerHTML=ctx.guarantee?.allExempt?badge('Teminat muaf','exempt'):badge(gOk?'Teminat uygun':'Teminat kontrolü gerekli',gOk?'ok':'bad');
  }
}
function scrollToMaterialPlan(){
  const panel=$('#materialPlanPanel')||document.querySelector('.material-plan-panel');
  if(!panel||panel.offsetParent===null)return;
  // Kart render edildikten sonra tarayıcının yerleşimi tamamlamasını bekleyip
  // Malzeme ve Keşif Kontrolü bölümünü ekranın üstüne yumuşakça getirir.
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const top=Math.max(0,window.scrollY+panel.getBoundingClientRect().top-12);
    window.scrollTo({top,behavior:'smooth'});
  }));
}

async function fetchReservationControlHistory(no,{notify=false}={}){
  no=String(no||'').trim();
  if(!no)return {controlled:false,count:0,latest:null,items:[]};
  try{
    const data=await fetchApiJson('/api/control-history?reservationNo='+encodeURIComponent(no)+'&ts='+Date.now(),{},6500);
    if(state.ui.reservationNo===no){state.ui.reservationRecordHistory=data;}
    if(data.controlled&&notify){
      const latest=data.latest||{};
      toast(`Rezervasyon ${no} daha önce kontrol edilmiş ve kaydedilmiş. ${latest.KontrolZamani?('Son kontrol: '+latest.KontrolZamani+'. '):''}${data.count>1?data.count+' kayıt bulunuyor.':''}`,'warn',6500);
    }
    return data;
  }catch(e){
    console.error('Kontrol geçmişi sorgusu',e);
    throw new Error('Kontrol geçmişi doğrulanamadı: '+e.message);
  }
}
function updateReservationHistorySummary(history){
  const sum=$('#reservationSummary');if(!sum||!history?.controlled)return;
  const latest=history.latest||{};
  const base=sum.textContent.replace(/ · Daha önce kontrol edildi.*$/,'');
  sum.textContent=`${base} · Daha önce kontrol edildi (${history.count} kayıt${latest.KontrolZamani?` · son: ${latest.KontrolZamani}`:''})`;
  sum.className='reservation-summary found reservation-previously-controlled';
}
function closeRepeatControlModal(result=false){
  const modal=$('#repeatControlModal');if(!modal)return;
  modal.hidden=true;modal.setAttribute('aria-hidden','true');document.body.classList.remove('modal-open');
  const resolver=closeRepeatControlModal._resolver;closeRepeatControlModal._resolver=null;if(resolver)resolver(!!result);
}
function confirmRepeatControl(history){
  const modal=$('#repeatControlModal'),meta=$('#repeatControlMeta'),txt=$('#repeatControlText');
  if(!modal)return Promise.resolve(false);
  const latest=history?.latest||{};
  if(txt)txt.textContent=`${history?.reservationNo||state.ui.reservationNo} numaralı rezervasyon için ${history?.count||1} adet kayıtlı kontrol bulunmaktadır. Yeni kontrol mevcut kaydı silmez; yeni bir revizyon olarak kaydedilir.`;
  if(meta)meta.innerHTML=`<span><strong>Son Kontrol:</strong> ${esc(latest.KontrolZamani||'—')}</span><span><strong>Kontrol ID:</strong> ${esc(latest.KontrolID||'—')}</span><span><strong>Sonuç:</strong> ${esc(latest.GenelSonuc||'—')}</span>`;
  modal.hidden=false;modal.setAttribute('aria-hidden','false');document.body.classList.add('modal-open');
  return new Promise(resolve=>{closeRepeatControlModal._resolver=resolve;});
}

async function renderReservation(no){
  closeReservationSearch();const renderNo=String(no);const previousNo=String(state.ui.reservationNo||'');state.ui.reservationNo=renderNo;$('#reservationLookup').value=renderNo;
  if(previousNo!==renderNo){state.ui.reservationRecordHistory=null;state.ui.repeatControlAllowed=false;}
  const baseRows=(state.data.zmm||[]).filter(r=>String(r.reservationNo)===String(no));
  if(!baseRows.length){toast('Rezervasyon verisi hazırlanamadı.');return}
  const sum0=$('#reservationSummary');if(sum0){sum0.className='reservation-summary muted';sum0.textContent='Keşif verisi hedef depo ve malzemeler için hazırlanıyor…'}
  try{await ensureKesifContext(baseRows[0].recvDY,baseRows.map(r=>r.materialCode).filter(code=>!isDiscoveryExempt(code)))}catch(e){console.error('Keşif bağlamı',e);state.diagnostics.push({level:'bad',text:'Keşif verisi hazırlanamadı: '+e.message,source:'KESIFLER'});toast('Keşif verisi hazırlanamadı: '+e.message)}
  if(state.ui.reservationNo!==renderNo)return;
  const ctx=computeContext(no);if(!ctx){toast('Rezervasyon verisi hazırlanamadı.');return}
  $('#reservationWorkspace').hidden=false;$('#noReservationPlaceholder').hidden=true;$('#runCheckBtn').disabled=false;
  updateWorkspaceLabels(ctx);
  const sum=$('#reservationSummary');if(sum){sum.className='reservation-summary found';sum.textContent=`${no} rezervasyonu bulundu · ${ctx.rows.length} SAP satırı · ${ctx.materials.length} farklı malzeme`}
  renderAlerts(ctx);renderControlSummary(ctx,false);renderMaterials(ctx,false);clearDecisionResults();
  scrollToMaterialPlan();
  try{const history=await fetchReservationControlHistory(renderNo,{notify:true});if(state.ui.reservationNo===renderNo)updateReservationHistorySummary(history)}catch(e){toast(e.message,'error',6000)}
}

async function renderManualWorkspace(){
  const targetKeyAtStart=state.ui.manualTargetKey;
  try{if(state.ui.manualReady&&targetKeyAtStart){const target=splitDepotKey(targetKeyAtStart);await ensureKesifContext(target.dy,(state.ui.manualRows||[]).map(r=>r.materialCode).filter(code=>!isDiscoveryExempt(code)))}}catch(e){console.error('Manuel keşif bağlamı',e);toast('Keşif verisi hazırlanamadı: '+e.message)}
  if(targetKeyAtStart!==state.ui.manualTargetKey)return;
  const ctx=computeManualContext();if(!ctx){hideWorkspaceForMode();return}
  $('#reservationWorkspace').hidden=false;$('#noReservationPlaceholder').hidden=true;$('#runCheckBtn').disabled=false;
  const status=$('#manualPasteStatus');if(status){const repeats=Math.max(0,ctx.rows.length-ctx.materials.length);status.className='manual-paste-status ok';status.textContent=`${ctx.rows.length} liste satırı hazır · ${ctx.materials.length} farklı malzeme${repeats?` · ${repeats} tekrar satırı malzeme toplamına dahil`:''} · Kontrol Et ile değerlendirebilirsiniz.`}
  updateWorkspaceLabels(ctx);
  renderAlerts(ctx);renderControlSummary(ctx,false);renderMaterials(ctx,false);clearDecisionResults();
  scrollToMaterialPlan();
}
function updateWorkspaceLabels(ctx){
  const manual=ctx?.mode==='manual';
  if($('#controlSummaryTitle'))$('#controlSummaryTitle').textContent=manual?'Manuel Talep Kontrol Özeti':'Rezervasyon Kontrol Özeti';
  if($('#controlSummaryDescription'))$('#controlSummaryDescription').textContent=manual?'Seçilen kaynak/hedef depolar ve yapıştırılan malzeme listesinin teminat bilgileri birlikte gösterilir.':'Talep edilen depo, talep eden depo ve teminat bilgileri birlikte gösterilir.';
  if($('#materialPlanDescription'))$('#materialPlanDescription').textContent=manual?'Manuel olarak eklenen veya Excel’den yapıştırılan satırlar gösterilir. Aynı malzeme kodları kontrol hesabında toplanır; TESİS ise proje dağılımı toplam malzeme miktarı üzerinden yapılır.':'ZMM048 satırları aynen gösterilir. Kontrol sırasında aynı malzeme kodları arka planda toplanabilir.';
}
function hideWorkspaceForMode(){
  const workspace=$('#reservationWorkspace'),empty=$('#noReservationPlaceholder'),run=$('#runCheckBtn');
  if(workspace)workspace.hidden=true;if(empty)empty.hidden=false;if(run)run.disabled=true;clearDecisionResults();
}

const ITEM_DECISION_REASONS=[
  ['YETERSIZ_KESIF','Yetersiz Keşif'],
  ['ONCELIKLI_DEPO_FIRMA','Öncelikli Depo / Firma Var'],
  ['SONRAKI_SEVK','Sonraki Sevke Bırakıldı'],
  ['MALZEME_IHTIYACI_YOK','Malzeme İhtiyacı Yok'],
  ['KULLANICI_KARARI','Kullanıcı Kararı'],
  ['DIGER','Diğer']
];
function resetItemDecisions(){state.ui.itemDecisions={}}
function itemDecisionKey(ctx,row){return key(ctx?.mode||state.ui.mode,ctx?.reservationNo||'',row?.itemNo||'',row?.rowNo||'',row?.materialCode||'')}
function itemDecision(ctx,row,create=true){
  const k=itemDecisionKey(ctx,row);if(!k)return{decision:'',reason:'',note:''};
  if(create&&!state.ui.itemDecisions[k])state.ui.itemDecisions[k]={decision:'',reason:'',note:''};
  return state.ui.itemDecisions[k]||{decision:'',reason:'',note:''};
}
function itemDecisionReasonLabel(value){return ITEM_DECISION_REASONS.find(x=>x[0]===value)?.[1]||value||''}
function itemDecisionSummary(ctx){
  const counts={ONAYLA:0,ONAYLAMA:0,BEKLET:0,EMPTY:0};
  for(const r of ctx?.rows||[]){const d=itemDecision(ctx,r,false)?.decision||'';if(d&&counts[d]!=null)counts[d]++;else counts.EMPTY++}
  return counts;
}
function itemDecisionControlHtml(ctx,row){
  const d=itemDecision(ctx,row,true),label=d.decision==='ONAYLA'?'Onayla':d.decision==='ONAYLAMA'?'Onaylama':d.decision==='BEKLET'?'Beklet':'Karar Bekliyor';
  const cls=d.decision==='ONAYLA'?'approve':d.decision==='ONAYLAMA'?'reject':d.decision==='BEKLET'?'hold':'empty';
  const reason=itemDecisionReasonLabel(d.reason||''),detail=[reason,d.note||''].filter(Boolean).join(' · ');
  return `<div class="item-decision-compact" data-row-key="${esc(itemDecisionKey(ctx,row))}">
    <span class="item-decision-state ${cls}">${esc(label)}</span>
    <button class="btn btn-ghost item-decision-open" type="button" data-row-key="${esc(itemDecisionKey(ctx,row))}">${d.decision?'Düzenle':'Karar Ver'}</button>
    <small>${detail?esc(detail):'Kalem kararı açılır pencereden verilir.'}</small>
  </div>`;
}
let itemDecisionModalState=null;
function openItemDecisionModal(ctx,row,checked){
  if(!ctx||!row)return;const k=itemDecisionKey(ctx,row),d={...(itemDecision(ctx,row,true)||{})};
  itemDecisionModalState={ctx,row,checked,key:k};
  const modal=$('#itemDecisionModal');if(!modal)return;
  const title=`${row.itemNo||row.rowNo||'Kalem'} · ${row.materialCode||''}`;
  $('#itemDecisionModalTitle').textContent=title;
  $('#itemDecisionModalSubtitle').textContent=row.materialDesc||'Rezervasyon kalemi için bağımsız karar verin.';
  $('#itemDecisionModalMeta').innerHTML=`<div><span>Talep Miktarı</span><strong>${fmtNum(row.qty)} ${esc(row.uom||'')}</strong></div><div><span>Malzeme</span><strong>${esc(row.materialCode||'—')}</strong></div><div><span>Rezervasyon Kalemi</span><strong>${esc(row.itemNo||row.rowNo||'—')}</strong></div>`;
  $('#itemDecisionModalDecision').value=d.decision||'';$('#itemDecisionModalReason').value=d.reason||'';$('#itemDecisionModalNote').value=d.note||'';syncItemDecisionModalReason();
  modal.hidden=false;modal.setAttribute('aria-hidden','false');document.body.classList.add('modal-open');setTimeout(()=>$('#itemDecisionModalDecision')?.focus(),0);
}
function closeItemDecisionModal(){const modal=$('#itemDecisionModal');if(modal){modal.hidden=true;modal.setAttribute('aria-hidden','true')}itemDecisionModalState=null;if(!document.querySelector('.decision-modal-backdrop:not([hidden]),.repeat-control-backdrop:not([hidden])'))document.body.classList.remove('modal-open')}
function syncItemDecisionModalReason(){const decision=$('#itemDecisionModalDecision')?.value||'',reason=$('#itemDecisionModalReason');if(!reason)return;const needed=decision==='ONAYLAMA'||decision==='BEKLET';reason.disabled=!needed;if(!needed)reason.value='';$('#itemDecisionModalHint').textContent=needed?'Onaylama veya Beklet kararında gerekçe zorunludur.':'Onayla kararında gerekçe gerekmez; açıklama isteğe bağlıdır.'}
function saveItemDecisionModal(){if(!itemDecisionModalState)return;const decision=$('#itemDecisionModalDecision')?.value||'',reason=$('#itemDecisionModalReason')?.value||'',note=$('#itemDecisionModalNote')?.value?.trim()||'';if(!['ONAYLA','ONAYLAMA','BEKLET'].includes(decision))return toast('Kalem için Onayla, Onaylama veya Beklet kararı seçin.','warn');if((decision==='ONAYLAMA'||decision==='BEKLET')&&!reason)return toast('Onaylama veya Beklet kararında gerekçe seçmeniz gerekir.','warn');state.ui.itemDecisions[itemDecisionModalState.key]={decision,reason:decision==='ONAYLA'?'':reason,note};const {ctx,checked}=itemDecisionModalState;closeItemDecisionModal();renderMaterials(ctx,checked);renderDecisionItemSection(ctx);toast('Kalem kararı uygulandı.','success',2400)}
function bindItemDecisionEvents(ctx,checked){
  document.querySelectorAll('.item-decision-open').forEach(btn=>btn.onclick=e=>{e.stopPropagation();const k=btn.dataset.rowKey,row=(ctx?.rows||[]).find(r=>itemDecisionKey(ctx,r)===k);if(row)openItemDecisionModal(ctx,row,checked)});
}
function validateItemDecisions(ctx){
  const missing=[],reasonMissing=[];
  for(const r of ctx?.rows||[]){const d=itemDecision(ctx,r,false)||{};const label=`${r.itemNo||r.rowNo||'?'} · ${r.materialCode||''}`;
    if(!['ONAYLA','ONAYLAMA','BEKLET'].includes(d.decision||'')){missing.push(label);continue}
    if((d.decision==='ONAYLAMA'||d.decision==='BEKLET')&&!d.reason)reasonMissing.push(label);
  }
  return{ok:!reasonMissing.length,missing,reasonMissing};
}
function approvedRowsFor(ctx){return (ctx?.rows||[]).filter(r=>itemDecision(ctx,r,false)?.decision==='ONAYLA')}
function materialDecisionQty(mat){const rows=mat?.rows||[];if(!rows.length)return num(mat?.qty);const ref=state.ui.mode==='manual'?'MANUEL':state.ui.reservationNo;let decided=0,approved=0;for(const r of rows){const d=state.ui.itemDecisions[key(state.ui.mode,ref,r.itemNo||'',r.rowNo||'',r.materialCode||'')]||{};if(['ONAYLA','ONAYLAMA','BEKLET'].includes(d.decision||''))decided++;if(d.decision==='ONAYLA')approved+=num(r.qty)}return decided===rows.length?approved:num(mat?.qty)}
function buildApprovedContext(baseCtx){
  const rows=approvedRowsFor(baseCtx);if(!rows.length)return null;
  return buildContextFromRows(rows,{mode:baseCtx.mode,referenceNo:baseCtx.reservationNo,sourceUY:baseCtx.sourceUY,sourceDY:baseCtx.sourceDY,targetUY:baseCtx.targetUY,targetDY:baseCtx.targetDY});
}
function isOverrideableBusinessError(message){
  const s=String(message||'').trim();
  if(/^Teminat, bu talep sonrasında .* yetersiz kalıyor\.$/.test(s))return true;
  if(/^.+: Kalan keşif .*; talep .*\.$/.test(s))return true;
  return false;
}
function criticalDecisionErrors(ctx){return (ctx?.errors||[]).filter(x=>!isOverrideableBusinessError(x))}
function blockingProjectDistributionIssues(ctx){
  if(!ctx?.isTesis)return[];
  const issues=[];
  for(const m of ctx.materials||[]){
    const rows=allocationRowsFor(m),need=materialDecisionQty(m);
    const selected=rows.filter(r=>r.projectId&&num(r.qty)>0),sum=selected.reduce((a,r)=>a+num(r.qty),0);
    if(Math.abs(sum-num(need))>=1e-7)issues.push(`${m.materialCode}: proje dağılım toplamı ${fmtNum(sum)} / ${fmtNum(need)} ${m.uom}`);
    const ids=selected.map(r=>r.projectId),duplicates=[...new Set(ids.filter((x,i)=>ids.indexOf(x)!==i))];
    if(duplicates.length)issues.push(`${m.materialCode}: aynı proje birden fazla dağılım satırında seçildi`);
    if(rows.some(r=>!r.projectId&&num(r.qty)>0))issues.push(`${m.materialCode}: proje seçilmemiş dağılım miktarı var`);
    for(const r of selected){
      const pr=ctx.projects?.find(p=>p.projectId===r.projectId);
      if(!pr){issues.push(`${m.materialCode}: seçilen proje tanımı bulunamadı (${r.projectId})`);continue}
      if(!m.discoveryExempt&&state.ix.kesifProject.get(key(r.projectId,m.materialCode))==null)issues.push(`${m.materialCode}: ${pr.projectName||r.projectId} için proje keşif verisi bulunamadı`);
    }
  }
  return issues;
}
function currentApprovedDecisionState(){
  const baseCtx=currentContext();if(!baseCtx)return null;
  const decisions=validateItemDecisions(baseCtx),approvedRows=approvedRowsFor(baseCtx),approvalCtx=buildApprovedContext(baseCtx);
  if(!approvalCtx)return{baseCtx,ctx:null,decisions,approvedRows,gOk:true,kOk:true,d:{ok:true,issues:[]},overall:true,criticalErrors:[],projectBlocking:[]};
  const gOk=guaranteeIsOk(approvalCtx),kBad=approvalCtx.materials.filter(m=>!materialDiscoveryCheck(approvalCtx,m).ok),kOk=kBad.length===0,d=overallDistribution(approvalCtx);
  const criticalErrors=criticalDecisionErrors(approvalCtx),projectBlocking=blockingProjectDistributionIssues(approvalCtx);
  const overall=gOk&&kOk&&d.ok&&criticalErrors.length===0&&projectBlocking.length===0;
  return{baseCtx,ctx:approvalCtx,decisions,approvedRows,gOk,kOk,d,overall,criticalErrors,projectBlocking};
}

function allocationFor(matCode,projectId){return num(state.ui.allocations?.[matCode]?.[projectId])}
function ensureAllocation(matCode){state.ui.allocations[matCode]??={};return state.ui.allocations[matCode]}
function allocationRowsFor(mat){
  const code=mat.materialCode;
  if(!state.ui.allocationRows[code]){
    const existing=Object.entries(state.ui.allocations?.[code]||{}).filter(([,q])=>num(q)>0).map(([projectId,qty])=>({projectId,qty:num(q)}));
    state.ui.allocationRows[code]=existing.length?existing:[{projectId:'',qty:materialDecisionQty(mat)}];
  }
  return state.ui.allocationRows[code];
}
function syncAllocationMap(mat){
  const rows=allocationRowsFor(mat),map={};
  for(const r of rows){if(r.projectId&&num(r.qty)>0)map[r.projectId]=(map[r.projectId]||0)+num(r.qty)}
  state.ui.allocations[mat.materialCode]=map;
}
function distributionCheck(ctx,mat){
  syncAllocationMap(mat);
  if(!ctx.isTesis)return{ok:true,sum:0,need:0,over:[],duplicates:[]};
  const need=materialDecisionQty(mat);const rows=allocationRowsFor(mat);const sum=rows.reduce((s,r)=>s+(r.projectId?num(r.qty):0),0);let over=[];
  const ids=rows.filter(r=>r.projectId&&num(r.qty)>0).map(r=>r.projectId);const duplicates=ids.filter((x,i)=>ids.indexOf(x)!==i);
  for(const r of rows){if(!r.projectId||num(r.qty)<=0)continue;const p=ctx.projects.find(x=>x.projectId===r.projectId),cap=state.ix.kesifProject.get(key(r.projectId,mat.materialCode));if(!mat.discoveryExempt&&(cap==null||num(r.qty)>cap))over.push(p?.projectName||r.projectId)}
  const blankPositive=rows.some(r=>!r.projectId&&num(r.qty)>0);
  return{ok:Math.abs(sum-need)<1e-7&&over.length===0&&duplicates.length===0&&!blankPositive,sum,need,over,duplicates:[...new Set(duplicates)],discoveryExempt:!!mat.discoveryExempt}
}

function materialDiscoveryCheck(ctx,mat){
  const k=mat.kesif||{};
  const decisionRequest=materialDecisionQty(mat);if(mat.discoveryExempt){return{ok:true,exempt:true,mode:'EXEMPT',found:!!k.found,total:k.planned??k.metric??null,given:num(k.given),availableBefore:k.remaining==null?null:num(k.remaining),available:k.remaining==null?null:num(k.remaining),stock:num(mat.currentStock),request:num(decisionRequest),issues:[],description:mat.exemption?.description||''}}
  if(!ctx.isTesis){
    const available=k.remaining==null?null:num(k.remaining),request=num(decisionRequest),after=available==null?null:available-request;
    const ok=!!k.found&&available!=null&&available+1e-7>=request;
    return{
      ok,mode:'DEPOT',found:!!k.found,total:k.planned??k.metric,given:num(k.given),availableBefore:available,available:after,
      stock:num(mat.currentStock),request,issues:ok?[]:[!k.found?'Keşif kaydı bulunamadı.':`Kalan keşif ${fmtNum(available)} ${mat.uom}; talep ${fmtNum(request)} ${mat.uom}.`]
    };
  }

  const rows=allocationRowsFor(mat);
  const selected=rows.filter(r=>r.projectId&&num(r.qty)>0);
  const issues=[];let distributed=0,selectedDiscovery=0,selectedGiven=0,availableBefore=0,afterRequest=0;
  if(!selected.length)issues.push('Henüz proje seçimi yapılmadı.');

  for(const r of selected){
    const qty=num(r.qty);distributed+=qty;
    const pr=ctx.projects.find(p=>p.projectId===r.projectId),projectName=pr?.projectName||r.projectId,kk=key(r.projectId,mat.materialCode);
    const cap=state.ix.kesifProject.get(kk),plan=state.ix.kesifProjectPlan.get(kk),given=state.ix.kesifProjectGiven.get(kk);
    if(cap==null){issues.push(`${projectName}: bu malzeme için proje keşfi bulunamadı.`);continue}
    selectedDiscovery+=num(plan==null?cap:plan);selectedGiven+=num(given);availableBefore+=num(cap);afterRequest+=num(cap)-qty;
    if(qty>num(cap)+1e-7)issues.push(`${projectName}: kalan keşif ${fmtNum(cap)} ${mat.uom}; dağıtılan talep ${fmtNum(qty)} ${mat.uom}.`);
  }

  const fullyDistributed=Math.abs(distributed-num(decisionRequest))<1e-7;
  if(!fullyDistributed){
    const remain=Math.max(0,num(decisionRequest)-distributed);
    if(remain>1e-7)issues.push(`Talebin ${fmtNum(remain)} ${mat.uom} kısmı henüz bir projeye dağıtılmadı.`);
    else if(distributed>num(decisionRequest)+1e-7)issues.push(`Dağıtılan miktar onaylanacak talebi ${fmtNum(distributed-num(decisionRequest))} ${mat.uom} aşıyor.`);
  }

  return{
    ok:issues.length===0,mode:'TESIS_PROJECT',found:selected.length>0,total:selectedDiscovery,given:selectedGiven,
    availableBefore,available:afterRequest,stock:num(mat.currentStock),request:num(decisionRequest),distributed,issues
  };
}

function overallDistribution(ctx){if(!ctx.isTesis)return{ok:true,issues:[]};const issues=[];for(const m of ctx.materials){const d=distributionCheck(ctx,m);if(!d.ok)issues.push(`${m.materialCode}: dağılım ${fmtNum(d.sum)} / ${fmtNum(d.need)} ${m.uom}${d.over.length?` · proje keşfi aşıldı/eksik: ${d.over.join(', ')}`:''}${d.duplicates.length?' · aynı proje birden fazla seçildi':''}`)}return{ok:issues.length===0,issues}}
function normalizeAllocationRows(mat,changedIndex=-1){
  const rows=allocationRowsFor(mat),total=materialDecisionQty(mat);
  rows.forEach(r=>r.qty=Math.max(0,num(r.qty)));
  // Tek bir boş 'kalan miktar' satırı tut. Seçilmiş projelerin toplamına göre miktarı otomatik güncelle.
  const selected=rows.filter(r=>r.projectId);
  const assigned=selected.reduce((a,r)=>a+num(r.qty),0);
  const blanks=rows.filter(r=>!r.projectId);
  // Birden fazla boş satır varsa ilkini bırak.
  for(let i=rows.length-1;i>=0;i--){if(!rows[i].projectId&&rows[i]!==blanks[0])rows.splice(i,1)}
  const blank=rows.find(r=>!r.projectId);
  if(assigned<total-1e-7){
    const remain=Math.max(0,total-assigned);
    if(blank)blank.qty=remain;else rows.push({projectId:'',qty:remain});
  }else if(blank){
    const i=rows.indexOf(blank);if(i>=0)rows.splice(i,1);
  }
  if(!rows.length)rows.push({projectId:'',qty:total});
  syncAllocationMap(mat);
}

function projectUsage(mat,projectId,excludeIndex=-1){
  return allocationRowsFor(mat).reduce((s,r,i)=>s+(i!==excludeIndex&&r.projectId===projectId?num(r.qty):0),0);
}
function projectMeta(ctx,mat,projectId,excludeIndex=-1){
  const kk=key(projectId,mat.materialCode),cap=state.ix.kesifProject.get(kk),plan=state.ix.kesifProjectPlan.get(kk),given=state.ix.kesifProjectGiven.get(kk);
  const used=projectUsage(mat,projectId,excludeIndex);
  return{cap,plan:plan==null?cap:plan,given:given==null?0:given,used,left:cap==null?null:cap-used};
}
function projectName(ctx,id){return ctx.projects.find(p=>p.projectId===id)?.projectName||id||''}
function comboSelectedHtml(ctx,mat,row,index){
  if(!row.projectId)return `<span class="combo-selected-name">Proje seçin…</span><span class="combo-selected-meta"><span class="meta-cap">Tanımlı TESİS projeleri</span></span>`;
  const meta=projectMeta(ctx,mat,row.projectId,index),after=meta.cap==null?null:meta.cap-num(row.qty);
  return `<span class="combo-selected-name">${esc(projectName(ctx,row.projectId))}</span><span class="combo-selected-meta">
    <span class="meta-cap">Keşif ${meta.plan==null?'—':fmtNum(meta.plan)}</span>
    <span class="meta-used">Önce Verilen ${fmtNum(meta.given)}</span>
    <span class="meta-used">Yeni Dağıtım ${fmtNum(row.qty)}</span>
    <span class="meta-left ${after!=null&&after<0?'bad':''}">Talep Sonrası Kalan ${after==null?'—':fmtNum(after)}</span>
  </span>`;
}
function comboMenuHtml(ctx,mat,row,index){
  const usedIds=new Set(allocationRowsFor(mat).map((r,i)=>i===index?'':r.projectId).filter(Boolean));
  return ctx.projects.map(pr=>{
    const meta=projectMeta(ctx,mat,pr.projectId,index),disabled=usedIds.has(pr.projectId);
    return `<button type="button" class="combo-option ${disabled?'disabled':''}" data-project-id="${esc(pr.projectId)}" ${disabled?'disabled':''}>
      <span class="combo-option-name">${esc(pr.projectName)}</span>
      <span class="combo-option-meta">
        <span class="meta-cap">Keşif ${meta.plan==null?'—':fmtNum(meta.plan)}</span>
        <span class="meta-used">Verilen ${fmtNum(meta.given)}</span>
        <span class="meta-left ${meta.cap!=null&&meta.cap<0?'bad':''}">Kalan ${meta.cap==null?'—':fmtNum(meta.cap)}</span>
      </span>
    </button>`;
  }).join('');
}

function inlineComboHtml(ctx,mat,row,index){
  return `<div class="project-combo" data-mat="${esc(mat.materialCode)}" data-index="${index}">
    <button type="button" class="combo-trigger">${comboSelectedHtml(ctx,mat,row,index)}</button>
    <div class="combo-menu" hidden>
      <div class="combo-search-wrap">
        <span class="combo-search-icon">⌕</span>
        <input type="text" class="combo-search-input" placeholder="Proje ara..." autocomplete="off">
        <button type="button" class="combo-search-clear" aria-label="Aramayı temizle" hidden>×</button>
      </div>
      <div class="combo-options-list">${comboMenuHtml(ctx,mat,row,index)}</div>
      <div class="combo-no-result" hidden>Aramaya uygun proje bulunamadı.</div>
    </div>
  </div>`;
}
function closeAllCombos(except=null){
  document.querySelectorAll('.combo-menu').forEach(m=>{if(m!==except)m.hidden=true});
  document.querySelectorAll('.combo-trigger').forEach(b=>{if(!except||b.nextElementSibling!==except)b.classList.remove('open')});
}

function normalizeSearchText(v){
  return String(v||'').toLocaleLowerCase('tr-TR')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/ı/g,'i').replace(/ş/g,'s').replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ö/g,'o').replace(/ç/g,'c')
    .replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}
function filterProjectCombo(menu,query){
  if(!menu)return;
  const q=normalizeSearchText(query).trim();
  let visible=0;
  menu.querySelectorAll('.combo-option').forEach(opt=>{
    const name=normalizeSearchText(opt.querySelector('.combo-option-name')?.textContent||'');
    const code=normalizeSearchText(opt.dataset.projectId||'');
    const show=!q||name.includes(q)||code.includes(q);
    opt.hidden=!show;
    if(show)visible++;
  });
  const noResult=menu.querySelector('.combo-no-result');
  if(noResult)noResult.hidden=visible>0;
  const clear=menu.querySelector('.combo-search-clear');
  if(clear)clear.hidden=!q;
}

function bindInlineAllocationEvents(ctx,checked){
  document.querySelectorAll('.combo-trigger').forEach(btn=>btn.onclick=e=>{
    e.stopPropagation();
    const menu=btn.nextElementSibling,willOpen=menu.hidden;
    closeAllCombos(menu);
    menu.hidden=!willOpen;
    btn.classList.toggle('open',willOpen);
    if(willOpen){
      const search=menu.querySelector('.combo-search-input');
      if(search){search.value='';filterProjectCombo(menu,'');setTimeout(()=>search.focus(),0)}
    }
  });

  document.querySelectorAll('.combo-search-input').forEach(inp=>{
    inp.onclick=e=>e.stopPropagation();
    inp.onkeydown=e=>{
      e.stopPropagation();
      if(e.key==='Escape'){
        const menu=inp.closest('.combo-menu');
        menu.hidden=true;
        menu.previousElementSibling?.classList.remove('open');
      }
    };
    inp.oninput=()=>{
      const menu=inp.closest('.combo-menu');
      filterProjectCombo(menu,inp.value);
    };
  });

  document.querySelectorAll('.combo-search-clear').forEach(btn=>btn.onclick=e=>{
    e.stopPropagation();
    const menu=btn.closest('.combo-menu'),inp=menu.querySelector('.combo-search-input');
    if(inp){inp.value='';filterProjectCombo(menu,'');inp.focus()}
  });

  document.querySelectorAll('.combo-option').forEach(opt=>opt.onclick=e=>{
    e.stopPropagation();if(opt.disabled)return;
    const combo=opt.closest('.project-combo'),mat=ctx.materials.find(m=>m.materialCode===combo.dataset.mat);if(!mat)return;
    const rows=allocationRowsFor(mat),i=Number(combo.dataset.index);
    rows[i].projectId=opt.dataset.projectId;
    normalizeAllocationRows(mat,i);
    renderMaterials(ctx,checked);
  });

  document.querySelectorAll('.alloc-inline-qty').forEach(inp=>inp.onchange=()=>{
    const mat=ctx.materials.find(m=>m.materialCode===inp.dataset.mat);if(!mat)return;
    const rows=allocationRowsFor(mat),i=Number(inp.dataset.index);
    rows[i].qty=Math.max(0,num(inp.value));
    normalizeAllocationRows(mat,i);
    renderMaterials(ctx,checked);
  });
}
document.addEventListener('click',()=>closeAllCombos());

function renderMaterials(ctx,checked){
  const b=$('#materialBody');let html='',seq=0;const seen=new Set();
  const guaranteeOk=guaranteeIsOk(ctx);
  for(const r of ctx.rows){
    const m=ctx.materials.find(x=>x.materialCode===r.materialCode),k=m?.kesif;if(!m)continue;
    const kCheck=materialDiscoveryCheck(ctx,m),kOk=kCheck.ok,duplicate=seen.has(m.materialCode),multi=m.rows.length>1;
    const kesifPlanned=k?.found&&k?.planned!=null?fmtNum(k.planned):'—';
    const kesifGiven=k?.found&&k?.given!=null?fmtNum(k.given):'—';
    const kesifRemaining=k?.found&&k?.remaining!=null?fmtNum(k.remaining):'—';
    const kesifRemainCls=k?.found&&k?.remaining!=null&&num(k.remaining)<num(m.qty)?' discovery-shortage':'';
    const kalem=esc(r.itemNo||String(seq+1));
    if(!ctx.isTesis){
      seq++;html+=`<tr>
        <td>${kalem}</td><td>${esc(r.materialCode)}</td><td>${esc(r.materialDesc)}</td>
        <td>${fmtNum(r.qty)} ${esc(r.uom)}</td><td>${esc(r.uom)}</td>
        <td class="num-cell discovery-value">${kesifPlanned==='—'?'—':kesifPlanned+' '+esc(m.uom)}</td>
        <td class="num-cell discovery-value">${kesifGiven==='—'?'—':kesifGiven+' '+esc(m.uom)}</td>
        <td class="num-cell discovery-value${kesifRemainCls}"><strong>${kesifRemaining==='—'?'—':kesifRemaining+' '+esc(m.uom)}</strong></td>
        <td>${discoveryStatusBadge(m,kOk,checked)}</td>
        <td>${guaranteeStatusBadge(m,guaranteeOk,checked)}</td>
        <td class="inline-project-cell"><span class="project-unneeded">Gerekmez</span></td><td>—</td><td>—</td><td class="allocation-action">—</td>
      </tr>`;seen.add(m.materialCode);continue;
    }
    if(duplicate){
      seq++;html+=`<tr class="duplicate-source-row">
        <td>${kalem}</td><td>${esc(r.materialCode)}</td>
        <td>${esc(r.materialDesc)}<small class="raw-group-note">Aynı malzemenin ek kaynak satırı</small></td>
        <td>${fmtNum(r.qty)} ${esc(r.uom)}</td><td>${esc(r.uom)}</td>
        <td class="num-cell discovery-value">${kesifPlanned==='—'?'—':kesifPlanned+' '+esc(m.uom)}</td>
        <td class="num-cell discovery-value">${kesifGiven==='—'?'—':kesifGiven+' '+esc(m.uom)}</td>
        <td class="num-cell discovery-value${kesifRemainCls}"><strong>${kesifRemaining==='—'?'—':kesifRemaining+' '+esc(m.uom)}</strong></td>
        <td>${discoveryStatusBadge(m,kOk,checked)}</td>
        <td>${guaranteeStatusBadge(m,guaranteeOk,checked)}</td>
        <td class="inline-project-cell"><span class="project-unneeded">Toplam dağılıma dahil</span></td><td>—</td><td>—</td><td class="allocation-action">—</td>
      </tr>`;continue;
    }
    seen.add(m.materialCode);normalizeAllocationRows(m);const rows=allocationRowsFor(m);
    rows.forEach((ar,ai)=>{
      seq++;const allocationTotal=materialDecisionQty(m),assigned=rows.slice(0,ai+1).reduce((sum,x)=>sum+(x.projectId?num(x.qty):0),0),remain=Math.max(0,allocationTotal-assigned),sub=ai>0;
      const canDelete=ai>0&&!!ar.projectId;const qtyDisplay=sub?ar.qty:r.qty;
      const totalNote=!sub&&multi?`<small class="raw-group-note">Malzeme toplamı: ${fmtNum(m.qty)} ${esc(m.uom)}${Math.abs(allocationTotal-num(m.qty))>1e-7?` · Onaylanacak: ${fmtNum(allocationTotal)} ${esc(m.uom)}`:''}</small>`:'';
      html+=`<tr class="${sub?'allocation-subrow':''}">
        <td>${sub?'↳':kalem}</td><td>${esc(r.materialCode)}</td>
        <td class="${sub?'allocation-material-repeat':''}">${esc(r.materialDesc)}${sub?'<small>Kalan miktar için ek proje dağılımı</small>':totalNote}</td>
        <td>${fmtNum(qtyDisplay)} ${esc(r.uom)}</td><td>${esc(r.uom)}</td>
        <td class="num-cell discovery-value">${kesifPlanned==='—'?'—':kesifPlanned+' '+esc(m.uom)}</td>
        <td class="num-cell discovery-value">${kesifGiven==='—'?'—':kesifGiven+' '+esc(m.uom)}</td>
        <td class="num-cell discovery-value${kesifRemainCls}"><strong>${kesifRemaining==='—'?'—':kesifRemaining+' '+esc(m.uom)}</strong></td>
        <td>${discoveryStatusBadge(m,kOk,checked)}</td>
        <td>${guaranteeStatusBadge(m,guaranteeOk,checked)}</td>
        <td class="inline-project-cell">${inlineComboHtml(ctx,m,ar,ai)}</td>
        <td><input class="alloc-inline-qty" data-mat="${esc(m.materialCode)}" data-index="${ai}" type="number" min="0" step="any" value="${num(ar.qty)}"></td>
        <td><span class="alloc-remaining-inline ${remain<=1e-7?'done':'open'}">${fmtNum(remain)} ${esc(m.uom)}</span></td>
        <td class="allocation-action">${canDelete?`<button type="button" class="alloc-delete-btn" data-mat="${esc(m.materialCode)}" data-index="${ai}">Dağıtımı Sil</button>`:'—'}</td>
      </tr>`;
    });
  }
  b.innerHTML=html;bindInlineAllocationEvents(ctx,checked);bindItemDecisionEvents(ctx,checked);
  b.querySelectorAll('.alloc-delete-btn').forEach(btn=>btn.onclick=e=>{
    e.stopPropagation();const mat=ctx.materials.find(m=>m.materialCode===btn.dataset.mat);if(!mat)return;
    const rows=allocationRowsFor(mat),i=Number(btn.dataset.index);if(i<=0||i>=rows.length)return;
    const removedQty=Math.max(0,num(rows[i].qty));rows[i-1].qty=Math.max(0,num(rows[i-1].qty))+removedQty;rows.splice(i,1);normalizeAllocationRows(mat,i-1);renderMaterials(ctx,checked);
  });
  const all=ctx.materials.every(m=>materialDiscoveryCheck(ctx,m).ok),ds=itemDecisionSummary(ctx);
  $('#materialStatus').innerHTML=checked?badge(all?'Uygun':'Keşif sorunu var',all?'ok':'bad'):badge('Kontrol bekliyor','neutral');
  const decisionText=`Kalem kararı: ${ds.ONAYLA} Onayla · ${ds.ONAYLAMA} Onaylama · ${ds.BEKLET} Beklet · ${ds.EMPTY} Karar bekliyor.`;
  $('#selectedMaterialDetail').textContent=(ctx.isTesis?'Proje dağılımını malzemenin sağındaki seçim alanından yapın. ':'Bu depo TESİS değildir; proje dağılımı uygulanmaz. ')+decisionText;
}
function closeDecisionModal(){
  const modal=$('#decisionResultModal');if(!modal)return;
  modal.hidden=true;modal.setAttribute('aria-hidden','true');document.body.classList.remove('decision-modal-open');
}
function openDecisionModal(){
  const modal=$('#decisionResultModal');if(!modal)return;
  modal.hidden=false;modal.setAttribute('aria-hidden','false');document.body.classList.add('decision-modal-open');
}
function clearDecisionResults(){
  const results=$('#decisionResults');if(results){results.className='decision-modal-body';results.innerHTML=''}
  const status=$('#overallStatus');if(status)status.innerHTML=badge('Henüz kontrol edilmedi','neutral');
  state.ui.lastDecisionCheckToken='';state.ui.savedDecisionCheckToken='';state.ui.lastSavedControlId='';state.ui.lastDecisionRecordPayload=null;
  const saveStatus=$('#decisionSaveStatus');if(saveStatus){saveStatus.className='decision-save-status muted';saveStatus.textContent='Kontrol sonucu henüz kayıt altına alınmadı.'}
  const saveBtn=$('#saveDecisionRecord');if(saveBtn){saveBtn.disabled=false;saveBtn.textContent='Kontrolü Onayla ve Kaydet'}
  closeDecisionModal();
}
function itemDecisionResultTable(ctx){
  const rows=(ctx?.rows||[]).map((r,i)=>{const d=itemDecision(ctx,r,true),m=ctx.materials.find(x=>x.materialCode===r.materialCode),kc=m?materialDiscoveryCheck(ctx,m):{ok:false},gOk=m?.guaranteeExempt?true:guaranteeIsOk(ctx);const label=d.decision==='ONAYLA'?'Onayla':d.decision==='ONAYLAMA'?'Onaylama':d.decision==='BEKLET'?'Beklet':'Karar Bekliyor';const cls=d.decision==='ONAYLA'?'ok':d.decision==='ONAYLAMA'?'bad':d.decision==='BEKLET'?'warn':'neutral';const detail=[itemDecisionReasonLabel(d.reason||''),d.note||''].filter(Boolean).join(' · ');return `<tr><td>${esc(r.itemNo||i+1)}</td><td><strong>${esc(r.materialCode||'')}</strong><small>${esc(r.materialDesc||'')}</small></td><td class="num">${fmtNum(r.qty)} ${esc(r.uom||'')}</td><td>${discoveryStatusBadge(m,kc.ok,true)}</td><td>${guaranteeStatusBadge(m,gOk,true)}</td><td>${badge(label,cls)}</td><td class="wrap">${esc(detail||'—')}</td><td><button class="btn btn-ghost decision-item-action" type="button" data-row-key="${esc(itemDecisionKey(ctx,r))}">${d.decision?'Düzenle':'Karar Ver'}</button></td></tr>`}).join('');
  const sm=itemDecisionSummary(ctx);return `<section id="decisionItemDecisionSection" class="decision-project-section decision-item-section"><div class="decision-project-head"><strong>Kalem Bazlı Karar</strong><span class="muted">${sm.ONAYLA} onay · ${sm.ONAYLAMA} onaylama · ${sm.BEKLET} beklet · ${sm.EMPTY} karar bekliyor</span></div><div class="table-wrap"><table class="decision-item-table"><thead><tr><th>Kalem</th><th>Malzeme</th><th>Talep</th><th>Keşif</th><th>Teminat</th><th>Karar</th><th>Gerekçe / Açıklama</th><th>İşlem</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}
function bindDecisionItemSection(ctx){document.querySelectorAll('#decisionItemDecisionSection .decision-item-action').forEach(btn=>btn.onclick=e=>{e.stopPropagation();const row=(ctx?.rows||[]).find(r=>itemDecisionKey(ctx,r)===btn.dataset.rowKey);if(row)openItemDecisionModal(ctx,row,true)})}
function refreshDecisionOverallStatus(){
  const el=$('#overallStatus');if(!el)return;
  const st=currentApprovedDecisionState();if(!st)return;
  if(st.decisions?.missing?.length&&!st.approvedRows?.length){el.innerHTML=badge('Genel kontrol kaydedilebilir','neutral');return}
  if(!st.approvedRows?.length){el.innerHTML=badge('Onay yok','neutral');return}
  const blocked=(st.criticalErrors||[]).length||(st.projectBlocking||[]).length;
  if(blocked){el.innerHTML=badge('İnceleme gerekli','bad');return}
  if(!st.gOk||!st.kOk||!st.d.ok){el.innerHTML=badge('Uyarı ile onaylanabilir','warn');return}
  el.innerHTML=badge('Karar verilebilir','ok');
}
function renderDecisionItemSection(ctx){const old=document.querySelector('#decisionItemDecisionSection');if(!old||!ctx)return;const wrap=document.createElement('div');wrap.innerHTML=itemDecisionResultTable(ctx);old.replaceWith(wrap.firstElementChild);bindDecisionItemSection(ctx);refreshDecisionOverallStatus()}

function projectDistributionResultTable(ctx){
  if(!ctx.isTesis){return `<div class="decision-project-section"><div class="decision-project-head"><strong>Proje Dağılımı</strong>${badge('Gerekmez','ok')}</div><div class="empty-inline">Bu depo TESİS değildir; proje dağılımı uygulanmaz.</div></div>`}
  let rowsHtml='';
  for(const m of ctx.materials){
    const rows=allocationRowsFor(m);let cumulative=0;
    for(const ar of rows){
      const qty=ar.projectId?num(ar.qty):0;if(ar.projectId)cumulative+=qty;
      const pr=ctx.projects.find(p=>p.projectId===ar.projectId),kk=key(ar.projectId,m.materialCode);
      const cap=ar.projectId?state.ix.kesifProject.get(kk):null,plan=ar.projectId?state.ix.kesifProjectPlan.get(kk):null,given=ar.projectId?state.ix.kesifProjectGiven.get(kk):null;
      const projectRemain=cap==null?null:num(cap)-qty,materialRemain=Math.max(0,m.qty-cumulative);
      const ok=!!ar.projectId&&qty>0&&(m.discoveryExempt||(cap!=null&&qty<=num(cap)));
      rowsHtml+=`<tr>
        <td class="mat-code">${esc(m.materialCode)}</td><td>${esc(m.materialDesc||'')}</td>
        <td class="project-name">${esc(pr?.projectName||'Proje seçilmedi')}</td>
        <td class="num">${plan==null?'—':fmtNum(plan)+' '+esc(m.uom)}</td>
        <td class="num">${ar.projectId?fmtNum(given||0)+' '+esc(m.uom):'—'}</td>
        <td class="num">${ar.projectId?fmtNum(qty)+' '+esc(m.uom):'—'}</td>
        <td class="num ${projectRemain!=null&&projectRemain<0?'remain-bad':'remain-ok'}">${projectRemain==null?'—':fmtNum(projectRemain)+' '+esc(m.uom)}</td>
        <td class="num ${materialRemain>0?'remain-bad':'remain-ok'}">${fmtNum(materialRemain)} ${esc(m.uom)}</td>
        <td>${badge(ok?'Uygun':ar.projectId?'Kontrol':'Eksik',ok?'ok':ar.projectId?'bad':'warn')}</td>
      </tr>`;
    }
  }
  const d=overallDistribution(ctx);
  return `<div class="decision-project-section"><div class="decision-project-head"><strong>Proje Dağılımı</strong>${badge(d.ok?'Tamam':'Eksik / Hatalı',d.ok?'ok':'warn')}</div><div class="decision-project-table-wrap"><table class="decision-project-table"><thead><tr><th>Malzeme Kodu</th><th>Malzeme Tanımı</th><th>Proje</th><th>Proje Keşfi</th><th>Daha Önce Verilen</th><th>Yeni Dağıtım</th><th>Talep Sonrası Kalan</th><th>Malzeme Kalanı</th><th>Durum</th></tr></thead><tbody>${rowsHtml}</tbody></table></div></div>`;
}


function buildDecisionExportPayload(){
  const ctx=currentContext();if(!ctx)return null;
  const gOk=guaranteeIsOk(ctx);
  const kBad=ctx.materials.filter(m=>!materialDiscoveryCheck(ctx,m).ok),kOk=kBad.length===0,d=overallDistribution(ctx);
  const overall=gOk&&kOk&&d.ok&&ctx.errors.length===0;
  const coverage=guaranteeUsageRatio(ctx);

  const guarantee=[
    {label:'Toplam Tanımlı Teminat',value:num(ctx.guarantee.total),display:fmtMoney(ctx.guarantee.total),numeric:true,money:true},
    {label:'ZMM098 Depo Stok Tutarı (Bilgi)',value:num(ctx.guarantee.stockValue),display:fmtMoney(ctx.guarantee.stockValue),numeric:true,money:true},
    {label:'Kullanılabilir Teminat (Açık Rez. Dahil)',value:num(ctx.guarantee.before),display:ctx.guarantee.before==null?'—':fmtMoney(ctx.guarantee.before),numeric:ctx.guarantee.before!=null,money:true},
    {label:ctx.mode==='manual'?'Manuel Talep Teminat Değeri':'Rezervasyon Teminat Değeri (Bilgi)',value:num(ctx.guarantee.reservationValue),display:fmtMoney(ctx.guarantee.reservationValue),numeric:true,money:true},
    {label:'Teminattan Muaf Tutar',value:num(ctx.guarantee.exemptValue),display:fmtMoney(ctx.guarantee.exemptValue||0),numeric:true,money:true},
    {label:ctx.mode==='manual'?'Talep Sonrası Kullanılabilir':'SAP Kullanılabilir Teminat',value:num(ctx.guarantee.after),display:ctx.guarantee.after==null?'—':fmtMoney(ctx.guarantee.after),numeric:ctx.guarantee.after!=null,money:true},
    {label:'Teminat Kullanım Oranı',value:coverage==null?'':coverage,display:coverage==null?'—':`%${fmtNum(coverage*100,1)}`,numeric:coverage!=null,percent:true}
  ];

  const discovery=ctx.materials.map(m=>{
    const k=m.kesif||{},kc=materialDiscoveryCheck(ctx,m),ok=kc.ok;
    const total=kc.total,previousGiven=kc.given,availableBefore=kc.availableBefore,afterRequest=kc.available;
    return{
      materialCode:m.materialCode,materialDesc:m.materialDesc||'',stock:num(m.currentStock),
      total:total==null?0:num(total),previousGiven:num(previousGiven),availableBefore:availableBefore==null?0:num(availableBefore),remaining:afterRequest==null?0:num(afterRequest),request:num(m.qty),uom:m.uom||'',
      status:m.discoveryExempt?'Muaf':(ok?'Uygun':'Yetersiz'),ok,exempt:!!m.discoveryExempt,guaranteeExempt:!!m.guaranteeExempt,exemptionDescription:m.exemption?.description||'',
      stockDisplay:`${fmtNum(m.currentStock)} ${m.uom||''}`,
      totalDisplay:total==null?'—':`${fmtNum(total)} ${m.uom||''}`,
      previousGivenDisplay:`${fmtNum(previousGiven||0)} ${m.uom||''}`,
      availableBeforeDisplay:availableBefore==null?'—':`${fmtNum(availableBefore)} ${m.uom||''}`,
      remainingDisplay:afterRequest==null?'—':`${fmtNum(afterRequest)} ${m.uom||''}`,
      requestDisplay:`${fmtNum(m.qty)} ${m.uom||''}`
    };
  });

  const projects=[];
  if(ctx.isTesis){
    for(const m of ctx.materials){
      const rows=allocationRowsFor(m);let cumulative=0;
      for(const ar of rows){
        const qty=ar.projectId?num(ar.qty):0;if(ar.projectId)cumulative+=qty;
        const pr=ctx.projects.find(p=>p.projectId===ar.projectId),kk=key(ar.projectId,m.materialCode);
        const cap=ar.projectId?state.ix.kesifProject.get(kk):null,plan=ar.projectId?state.ix.kesifProjectPlan.get(kk):null,given=ar.projectId?state.ix.kesifProjectGiven.get(kk):null;
        const projectRemaining=cap==null?null:num(cap)-qty,materialRemaining=Math.max(0,m.qty-cumulative);
        const ok=!!ar.projectId&&qty>0&&(m.discoveryExempt||(cap!=null&&qty<=num(cap)));
        projects.push({
          materialCode:m.materialCode,materialDesc:m.materialDesc||'',projectName:pr?.projectName||'Proje seçilmedi',
          projectDiscovery:plan==null?null:num(plan),previousGiven:num(given),availableBefore:cap==null?null:num(cap),distributed:qty,projectRemaining:projectRemaining==null?null:num(projectRemaining),
          materialRemaining:num(materialRemaining),uom:m.uom||'',status:ok?'Uygun':ar.projectId?'Kontrol':'Eksik',ok,
          projectDiscoveryDisplay:plan==null?'—':`${fmtNum(plan)} ${m.uom||''}`,
          previousGivenDisplay:ar.projectId?`${fmtNum(given||0)} ${m.uom||''}`:'—',
          availableBeforeDisplay:cap==null?'—':`${fmtNum(cap)} ${m.uom||''}`,
          distributedDisplay:ar.projectId?`${fmtNum(qty)} ${m.uom||''}`:'—',
          projectRemainingDisplay:projectRemaining==null?'—':`${fmtNum(projectRemaining)} ${m.uom||''}`,
          materialRemainingDisplay:`${fmtNum(materialRemaining)} ${m.uom||''}`
        });
      }
    }
  }
  return{
    reservationNo:ctx.reservationNo,referenceLabel:ctx.mode==='manual'?'Kontrol Türü':'Rezervasyon',referenceValue:ctx.mode==='manual'?'Manuel / Excel Listesi':ctx.reservationNo,
    inputMode:ctx.mode,sourceDepot:`${ctx.sourceUY} / ${ctx.sourceDY} - ${ctx.source?.dyDesc||''}`,targetDepot:`${ctx.targetUY} / ${ctx.targetDY} - ${ctx.target?.dyDesc||''}`,
    generatedAt:new Date().toLocaleString('tr-TR'),overall:overall?'Karar verilebilir':'İnceleme gerekli',overallOk:overall,guarantee,discovery,projects,
    errors:[...(ctx.errors||[])],warnings:[...(ctx.warnings||[])],
    guaranteeOk:gOk,discoveryOk:kOk,distributionOk:d.ok,isTesis:ctx.isTesis
  };
}


function recordNumber(v){
  if(v==null||v==='')return '';
  const n=Number(v);if(!Number.isFinite(n))return '';
  let s=String(Math.round(n*1000000)/1000000);
  if(s.includes('e'))s=n.toFixed(6).replace(/0+$/,'').replace(/\.$/,'');
  return s.replace('.',',');
}
function recordText(v){return String(v??'').replace(/\r?\n/g,' ').trim()}
function currentDecisionState(){
  const ctx=currentContext();if(!ctx)return null;
  const gOk=guaranteeIsOk(ctx);
  const kBad=ctx.materials.filter(m=>!materialDiscoveryCheck(ctx,m).ok),kOk=kBad.length===0,d=overallDistribution(ctx);
  const overall=gOk&&kOk&&d.ok&&ctx.errors.length===0;
  return{ctx,gOk,kOk,d,overall};
}
function buildControlRecordPayload(){
  const decisionState=currentApprovedDecisionState();if(!decisionState)return null;
  const {baseCtx,ctx:approvedCtx,decisions,approvedRows,gOk,kOk,d,overall}=decisionState;
  if(!decisions.ok)return null;
  const ctx=approvedCtx||baseCtx,coverageRatio=approvedCtx?guaranteeUsageRatio(approvedCtx):null,coveragePct=coverageRatio==null?null:coverageRatio*100;
  const first=baseCtx.first||{},files=state.files||{},summary=itemDecisionSummary(baseCtx),allApproved=approvedRows.length===baseCtx.rows.length;
  const generalResult=!approvedRows.length?'GENEL_KONTROL_KALEM_KARARI_BEKLIYOR':(!overall?'INCELEME GEREKLI':(allApproved?'KARAR VERILEBILIR':'KISMI ONAY'));
  const g=approvedCtx?.guarantee||baseCtx.guarantee||{};
  const approvedErrors=approvedCtx?.errors||[],approvedWarnings=approvedCtx?.warnings||[];
  const header={
    KontrolTuru:baseCtx.mode==='manual'?'MANUEL':'REZERVASYON',RezervasyonNo:baseCtx.mode==='manual'?String($('#manualReservationNo')?.value||'').trim():baseCtx.reservationNo,
    RezervasyonDurumu:baseCtx.mode==='reservation'?recordText(first.status):'',RezervasyonOnayDurumu:baseCtx.mode==='reservation'?recordText(first.approvalStatus):'',
    KaynakUY:recordText(baseCtx.sourceUY),KaynakDepo:recordText(baseCtx.sourceDY),KaynakDepoTanimi:recordText(baseCtx.source?.dyDesc),
    HedefUY:recordText(baseCtx.targetUY),HedefDepo:recordText(baseCtx.targetDY),HedefDepoTanimi:recordText(baseCtx.target?.dyDesc),
    DepoTuru:recordText(baseCtx.target?.depotType),IsTuru:recordText(baseCtx.target?.workType),Firma:recordText(baseCtx.target?.companyName),Sozlesme:recordText(baseCtx.target?.contractName),
    ToplamListeSatiri:String(baseCtx.rows.length),FarkliMalzemeSayisi:String(baseCtx.materials.length),OnaylananKalemSayisi:String(summary.ONAYLA),OnaylanmayanKalemSayisi:String(summary.ONAYLAMA),BekletilenKalemSayisi:String(summary.BEKLET),KararVerilmemisKalemSayisi:String(summary.EMPTY),KalemKararModeli:summary.EMPTY>0?'GENEL_KONTROL_KALEM_OPSIYONEL':'KALEM_BAZLI',
    KesifMuafMalzemeSayisi:String((approvedCtx?.materials||[]).filter(m=>m.discoveryExempt).length),TeminatMuafMalzemeSayisi:String((approvedCtx?.materials||[]).filter(m=>m.guaranteeExempt).length),ToplamTeminat:recordNumber(g.total),
    MevcutDepoStokDegeri:recordNumber(g.stockValue),TalepTeminatDegeri:recordNumber(approvedRows.length?g.reservationValue:0),
    TeminatKullanimOraniYuzde:recordNumber(coveragePct),TeminatSonrasiKalan:!approvedRows.length?(g.before==null?'':recordNumber(g.before)):(g.after==null?(g.before==null?'':recordNumber(g.before)):recordNumber(g.after)),
    TeminatSonucu:!approvedRows.length?'GEREKMEZ':(g.allExempt?'MUAF':(gOk?'UYGUN':'HATA')),KesifSonucu:!approvedRows.length?'GEREKMEZ':((approvedCtx?.materials||[]).length&&(approvedCtx.materials.every(m=>m.discoveryExempt))?'MUAF':(kOk?'UYGUN':'HATA')),ProjeDagilimSonucu:!approvedRows.length?'GEREKMEZ':(approvedCtx?.isTesis?(d.ok?'UYGUN':'HATA'):'GEREKMEZ'),
    GenelSonuc:generalResult,HataSayisi:String(approvedErrors.length),UyariSayisi:String(approvedWarnings.length),
    Hatalar:recordText(approvedErrors.join(' | ')),Uyarilar:recordText(approvedWarnings.join(' | ')),
    ZMM048Kaynak:recordText(files.ZMM048?.name),ZMM048Degisim:recordText(files.ZMM048?.modifiedIso),MB52Kaynak:recordText(files.MB52?.name),MB52Degisim:recordText(files.MB52?.modifiedIso),
    ZMM098Kaynak:recordText(files.ZMM098?.name),ZMM098Degisim:recordText(files.ZMM098?.modifiedIso),KESIFLERKaynak:recordText(files.KESIFLER?.name),KESIFLERDegisim:recordText(files.KESIFLER?.modifiedIso),
    TANIMLARKaynak:recordText(files.TANIMLAR?.name),TANIMLARDegisim:recordText(files.TANIMLAR?.modifiedIso),
    UygulamaSurumu:APP_VERSION,KayitIslemi:summary.EMPTY>0?'GENEL_KONTROL_KALEM_KARARI_BEKLIYOR':'KALEM_BAZLI_KARAR_KAYDEDILDI',SAPOnayiDegildir:'EVET'
  };
  const fullGOk=guaranteeIsOk(baseCtx);
  const materials=baseCtx.rows.map((r,index)=>{
    const m=baseCtx.materials.find(x=>x.materialCode===r.materialCode),kc=m?materialDiscoveryCheck(baseCtx,m):{total:null,given:0,availableBefore:null,available:null,ok:false,issues:['Malzeme bağlamı bulunamadı.']},dec=itemDecision(baseCtx,r,false)||{};
    const unitPrice=num(m?.unitPrice),approved=dec.decision==='ONAYLA';
    return{
      SiraNo:String(index+1),RezervasyonKalemNo:recordText(r.itemNo||''),KaynakSatirNo:String(r.rowNo||''),MalzemeKodu:recordText(r.materialCode),MalzemeTanimi:recordText(r.materialDesc),Miktar:recordNumber(r.qty),OnaylananMiktar:recordNumber(approved?r.qty:0),Birim:recordText(r.uom),KaynakSatirSayisi:'1',
      KalemKarari:recordText(dec.decision||''),KararGerekcesi:recordText(itemDecisionReasonLabel(dec.reason||'')),KararAciklamasi:recordText(dec.note||''),TaahhutDurumu:approved?'OLUSTURUR':'OLUSTURMAZ',
      BirimFiyat:recordNumber(unitPrice),TalepTutari:recordNumber(num(r.qty)*unitPrice),MevcutHedefDepoStogu:recordNumber(m?.currentStock),KesifKontrolTipi:baseCtx.isTesis?'TESIS_PROJE':'DEPO',
      ToplamKesif:kc.total==null?'':recordNumber(kc.total),DahaOnceVerilen:recordNumber(kc.given),MevcutKalanKesif:kc.availableBefore==null?'':recordNumber(kc.availableBefore),KullanilabilirKesif:kc.available==null?'':recordNumber(kc.available),KesifMuaf:m?.discoveryExempt?'EVET':'HAYIR',TeminatMuaf:m?.guaranteeExempt?'EVET':'HAYIR',MuafAciklama:recordText(m?.exemption?.description||''),KesifDurumu:m?.discoveryExempt?'MUAF':(kc.ok?'UYGUN':'HATA'),TeminatDurumu:m?.guaranteeExempt?'MUAF':(fullGOk?'UYGUN':'HATA'),KontrolNotu:recordText((kc.issues||[]).join(' | '))
    };
  });
  const projects=[];
  if(approvedCtx?.isTesis){for(const m of approvedCtx.materials){const rows=allocationRowsFor(m);let cumulative=0;rows.forEach((ar,index)=>{
    const qty=ar.projectId?num(ar.qty):0;if(ar.projectId)cumulative+=qty;const pr=approvedCtx.projects.find(p=>p.projectId===ar.projectId),kk=key(ar.projectId,m.materialCode);
    const cap=ar.projectId?state.ix.kesifProject.get(kk):null,plan=ar.projectId?state.ix.kesifProjectPlan.get(kk):null,given=ar.projectId?state.ix.kesifProjectGiven.get(kk):null;
    const projectRemaining=cap==null?null:num(cap)-qty,materialRemaining=Math.max(0,num(m.qty)-cumulative);const ok=!!ar.projectId&&qty>0&&(m.discoveryExempt||(cap!=null&&qty<=num(cap)));
    projects.push({SiraNo:String(index+1),MalzemeKodu:recordText(m.materialCode),MalzemeTanimi:recordText(m.materialDesc),Birim:recordText(m.uom),ProjeKodu:recordText(ar.projectId),ProjeAdi:recordText(pr?.projectName||'Proje seçilmedi'),
      ProjeKesfi:plan==null?'':recordNumber(plan),DahaOnceVerilen:recordNumber(given),MevcutKalanKesif:cap==null?'':recordNumber(cap),DagitilanMiktar:recordNumber(qty),DagitilmamisMiktar:ar.projectId?'':recordNumber(ar.qty),ProjeKalani:projectRemaining==null?'':recordNumber(projectRemaining),MalzemeKalani:recordNumber(materialRemaining),Durum:ok?'UYGUN':ar.projectId?'HATA':'EKSIK'});
  })}}
  return{appVersion:APP_VERSION,header,materials,projects};
}
function utf8ToBase64(text){const bytes=new TextEncoder().encode(text);let binary='';const chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));return btoa(binary)}
function resetDecisionSaveState(){
  state.ui.lastDecisionCheckToken=`${Date.now()}-${Math.random().toString(36).slice(2,9)}`;state.ui.savedDecisionCheckToken='';state.ui.lastSavedControlId='';
  const btn=$('#saveDecisionRecord'),status=$('#decisionSaveStatus');if(btn){btn.disabled=false;btn.textContent='Kontrolü Onayla ve Kaydet'}if(status){status.className='decision-save-status muted';status.textContent='Kontrol sonucu henüz kayıt altına alınmadı.'}
}
async function saveDecisionRecord(){
  const baseCtx=currentContext();if(!baseCtx)return toast('Kaydedilecek kontrol sonucu bulunamadı. Kontrol Et ile sonucu yeniden oluşturun.');
  // FIX27: analysis/export remain possible without a number, final save does not.
  const finalReservationNo=state.ui.mode==='manual'?String($('#manualReservationNo')?.value||'').trim():String(baseCtx.reservationNo||'').trim();
  if(!finalReservationNo){
    const input=state.ui.mode==='manual'?$('#manualReservationNo'):$('#reservationLookup');
    if(input){input.focus();input.setAttribute('aria-invalid','true')}
    return toast('Nihai kayıt için Rezervasyon No zorunludur. Numara olmadan analiz veya dışa aktarma yapabilirsiniz.','warn',7500);
  }
  if(state.ui.mode==='manual')$('#manualReservationNo')?.removeAttribute('aria-invalid');
  const validation=validateItemDecisions(baseCtx);
  if(validation.missing.length&&!window.confirm(`${validation.missing.length} kalem için bireysel karar verilmedi. Genel kontrol kaydı oluşturulabilir; bu kalemler otomatik onaylanmaz ve yeni taahhüt oluşturmaz. Devam edilsin mi?`))return;
  if(validation.reasonMissing.length)return toast(`Onaylanmayan/Bekletilen kalemlerde gerekçe zorunludur. ${validation.reasonMissing.slice(0,5).join(', ')}${validation.reasonMissing.length>5?'…':''}`,'warn',7500);
  const approvedState=currentApprovedDecisionState();
  let approvalOverride=null;
  if(approvedState?.approvedRows?.length){
    const criticalErrors=approvedState.criticalErrors||criticalDecisionErrors(approvedState.ctx),projectBlocking=approvedState.projectBlocking||blockingProjectDistributionIssues(approvedState.ctx);
    const blocking=[];if(projectBlocking.length)blocking.push('proje dağılım bütünlüğü');if(criticalErrors.length)blocking.push('kritik veri');
    if(blocking.length){
      const details=[...criticalErrors,...projectBlocking].slice(0,4).join(' · ');
      return toast(`Onay verdiğiniz kalemlerde ${blocking.join(', ')} sorunu bulunuyor. ${details?details+' ':''}Bu teknik sorun düzeltilmeden kayıt yapılamaz.`,'error',9500);
    }
    const overrideReasons=[];if(!approvedState.gOk)overrideReasons.push('Teminat yetersiz / uygun değil');if(!approvedState.kOk)overrideReasons.push('Keşif yetersiz / uygun değil');
    if(overrideReasons.length){
      const badMaterials=(approvedState.ctx?.materials||[]).filter(m=>!materialDiscoveryCheck(approvedState.ctx,m).ok).map(m=>m.materialCode).filter(Boolean);
      const g=approvedState.ctx?.guarantee||{};
      const detail=[...overrideReasons];
      if(!approvedState.gOk&&g.after!=null)detail.push(`Talep sonrası teminat: ${fmtMoney(g.after)}`);
      if(badMaterials.length)detail.push(`Keşif sorunu olan malzemeler: ${badMaterials.slice(0,8).join(', ')}${badMaterials.length>8?'…':''}`);
      const warning=`UYARI!\n\n${detail.join('\n')}\n\nBu kontrolü yine de ONAYLAYIP KAYDETMEK istiyor musunuz?\n\nDevam ederseniz kayıt "UYARI İLE ONAYLANDI" olarak saklanacak ve kullanıcı override işlemi AUDIT'e yazılacaktır.`;
      if(!window.confirm(warning))return toast('Kayıt iptal edildi. Keşif/teminat uyarısı nedeniyle kullanıcı devam etmedi.','warn',5000);
      approvalOverride={active:true,reasons:overrideReasons,details:detail,confirmedAt:new Date().toISOString()};
    }
  }
  const payload=buildControlRecordPayload();if(!payload)return toast('Kalem kararlarından kayıt verisi oluşturulamadı.','error');
  if(approvalOverride?.active&&payload.header){
    payload.header.KullaniciOverride='EVET';
    payload.header.OverrideNedenleri=approvalOverride.reasons.join(' | ');
    payload.header.OverrideDetayi=approvalOverride.details.join(' | ');
    payload.header.OverrideOnayZamani=approvalOverride.confirmedAt;
    payload.header.GenelSonuc='UYARI ILE ONAYLANDI';
    payload.header.KayitIslemi='KALEM_BAZLI_KARAR_OVERRIDE_ILE_KAYDEDILDI';
  }
  // FIX26: explicit pre-save SAP movement warning, including manual item decisions.
  if(state.ui.mode==='reservation'&&baseCtx.isTesis&&payload.header?.RezervasyonNo){
    try{
      const pre=await fetchApiJson('/api/tesis-control-preflight?reservationNo='+encodeURIComponent(payload.header.RezervasyonNo),{},25000);
      const approvedCodes=new Set((payload.materials||[]).filter(x=>Number(String(x.OnaylananMiktar||'0').replace(',','.'))>0).map(x=>String(x.MalzemeKodu||'')));
      const active=(pre.items||[]).filter(x=>approvedCodes.has(String(x.materialCode||''))&&(x.mb51Found||Number(x.mb51Events)>0));
      if(active.length){
        const lines=active.slice(0,12).map(x=>`${x.materialCode} · MB51 net ${workOpsNum(x.mb51Qty)} · ${x.mb51Events} hareket`);
        const msg=`TESİS / KESİN KAYIT UYARISI\n\n${lines.join('\n')}\n\nBu rezervasyonun MB51 fiili hareketleri daha önce oluşmuş. Yeni bir SAP fiili hareketi veya ikinci keşif/teminat taahhüdü oluşturulmayacak; bu işlem yalnız kontrol/revizyon kaydıdır.\n\nKesinleşme ZMM048 varlığıyla kanıtlanamaz. Kontrolü bu uyarıyla kaydetmek istiyor musunuz?`.replace(/\n/g,'\n');
        if(!window.confirm(msg))return toast('MB51 ön kontrolü nedeniyle kayıt kullanıcı tarafından iptal edildi.','warn');
        payload.header.MB51OnKontrolOnayi='EVET';payload.header.MB51OnKontrolUyarisi=lines.join(' | ');
      }
      if(pre.previousControlCount>0&&!state.ui.repeatControlAllowed)return toast('Önceki kontrol kaydı bulundu. Tekrar kontrol / revizyon adımını tamamlayın.','warn',6500);
    }catch(e){return toast('TESİS MB51 ön kontrolü doğrulanamadı; kayıt durduruldu: '+e.message,'error',8500)}
  }
  state.ui.lastDecisionRecordPayload=payload;
  const btn=$('#saveDecisionRecord'),status=$('#decisionSaveStatus');
  if(state.ui.savedDecisionCheckToken&&state.ui.savedDecisionCheckToken===state.ui.lastDecisionCheckToken)return toast(`Bu kontrol sonucu zaten kaydedildi${state.ui.lastSavedControlId?' · '+state.ui.lastSavedControlId:''}.`);
  if(btn){btn.disabled=true;btn.textContent='Kaydediliyor…'}if(status){status.className='decision-save-status muted';status.textContent='Kalem bazlı CSV kayıtları hazırlanıyor…'}
  try{const body=JSON.stringify({payloadBase64:utf8ToBase64(JSON.stringify(payload)),allowRepeat:!!state.ui.repeatControlAllowed});const res=await fetch('/api/save-control',{method:'POST',headers:{'Content-Type':'application/json'},body,cache:'no-store'});const data=await res.json().catch(()=>({}));
    if(res.status===409&&data.code==='RESERVATION_ALREADY_CONTROLLED'){
      state.ui.reservationRecordHistory=data.history||null;state.ui.repeatControlAllowed=false;
      if(btn){btn.disabled=false;btn.textContent='Kontrolü Onayla ve Kaydet'}if(status){status.className='decision-save-status bad';status.textContent='Rezervasyon daha önce kaydedilmiş. Yeniden kontrol onayı gereklidir.'}
      toast('Bu rezervasyon daha önce kaydedilmiş. Önce “Tekrar Kontrol Et” onayıyla kontrolü yeniden çalıştırın.','warn',7000);return;
    }
    if(!res.ok||!data.ok)throw new Error(data.error||`Kayıt servisi ${res.status} hatası verdi.`);state.ui.savedDecisionCheckToken=state.ui.lastDecisionCheckToken;state.ui.lastSavedControlId=data.controlId||'';
    const revision=data.revisionNo?` · Revizyon ${data.revisionNo}`:'',ds=itemDecisionSummary(baseCtx);
    const recs=Array.isArray(data.mb51Reconciliation)?data.mb51Reconciliation:[],mismatch=recs.filter(x=>x.status==='FIILI_MIKTAR_FARKI').length,mutabik=recs.filter(x=>x.status==='MUTABIK').length,waiting=recs.filter(x=>x.status==='MB51_BEKLENIYOR').length;if(btn){btn.disabled=true;btn.textContent='Kontrol Kaydedildi'}if(status){status.className='decision-save-status ok';status.textContent=`Kaydedildi · ${data.controlId||''}${revision} · ${ds.ONAYLA} onay / ${ds.ONAYLAMA} onaylama / ${ds.BEKLET} beklet · MB51: ${mutabik} mutabık / ${mismatch} fark / ${waiting} bekliyor${data.recordRoot?' · '+data.recordRoot:''}`;status.title=data.recordRoot||''}toast(`Kalem bazlı karar kaydedildi · ${ds.ONAYLA} onay / ${ds.ONAYLAMA} onaylama / ${ds.BEKLET} beklet${revision}.`);loadNotifications(true).catch(()=>{});
    if(state.ui.mode==='reservation'&&state.ui.reservationNo){try{state.ui.reservationRecordHistory=await fetchReservationControlHistory(state.ui.reservationNo,{notify:false});state.ui.repeatControlAllowed=false;updateReservationHistorySummary(state.ui.reservationRecordHistory)}catch(_){} }
    setTimeout(()=>{const mode=state.ui.mode;closeDecisionModal();if(mode==='reservation')clearReservation();else clearManual();state.ui.lastDecisionRecordPayload=null;resetDecisionSaveState();toast('Kayıt tamamlandı. Takip ekranı yeni kontrol için temizlendi.','success')},450);
  }catch(e){console.error(e);if(btn){btn.disabled=false;btn.textContent='Kontrolü Onayla ve Kaydet'}if(status){status.className='decision-save-status bad';status.textContent='Kayıt başarısız: '+e.message}toast('CSV kayıt hatası: '+e.message,'error',6500)}
}
function exportDecisionAsExcel(){
  const payload=buildDecisionExportPayload();if(!payload)return toast('Dışa aktarılacak karar sonucu bulunamadı.');
  if(!window.DecisionExport)return toast('Excel dışa aktarım bileşeni yüklenemedi.');
  try{DecisionExport.downloadDecisionExcel(payload);toast('Excel dosyası hazırlandı.')}catch(e){console.error(e);toast('Excel dışa aktarım hatası: '+e.message)}
}
function exportDecisionAsPdf(){
  const payload=buildDecisionExportPayload();if(!payload)return toast('Dışa aktarılacak karar sonucu bulunamadı.');
  if(!window.DecisionExport)return toast('PDF dışa aktarım bileşeni yüklenemedi.');
  try{DecisionExport.printDecisionPdf(payload)}catch(e){console.error(e);toast('PDF dışa aktarım hatası: '+e.message)}
}
function exportDecisionAsJpg(){
  const payload=buildDecisionExportPayload();if(!payload)return toast('Dışa aktarılacak karar sonucu bulunamadı.');
  if(!window.DecisionExport?.downloadDecisionJpg)return toast('JPG dışa aktarım bileşeni yüklenemedi.');
  try{DecisionExport.downloadDecisionJpg(payload).then(()=>toast('JPG görseli hazırlandı.')).catch(e=>{console.error(e);toast('JPG dışa aktarım hatası: '+e.message)})}catch(e){console.error(e);toast('JPG dışa aktarım hatası: '+e.message)}
}


function discoveryErrorDetails(ctx){
  return ctx.materials.filter(m=>!materialDiscoveryCheck(ctx,m).ok).map(m=>{
    const k=m.kesif||{},kc=materialDiscoveryCheck(ctx,m),request=num(m.qty),uom=m.uom||'';
    if(ctx.isTesis){
      const rows=allocationRowsFor(m).filter(r=>r.projectId&&num(r.qty)>0);
      const projectLines=rows.length?rows.map(r=>{
        const pr=ctx.projects.find(p=>p.projectId===r.projectId),name=pr?.projectName||r.projectId,kk=key(r.projectId,m.materialCode);
        const cap=state.ix.kesifProject.get(kk),plan=state.ix.kesifProjectPlan.get(kk),given=state.ix.kesifProjectGiven.get(kk),qty=num(r.qty),left=cap==null?null:num(cap)-qty;
        return `<div class="tesis-project-check-row">
          <div><small>Proje</small><strong>${esc(name)}</strong></div>
          <div><small>Keşif</small><strong>${plan==null?'—':fmtNum(plan)+' '+esc(uom)}</strong></div>
          <div><small>Daha Önce Verilen</small><strong>${fmtNum(given||0)} ${esc(uom)}</strong></div>
          <div><small>Mevcut Kalan</small><strong>${cap==null?'—':fmtNum(cap)+' '+esc(uom)}</strong></div>
          <div><small>Yeni Dağıtım</small><strong>${fmtNum(qty)} ${esc(uom)}</strong></div>
          <div><small>Talep Sonrası Kalan</small><strong class="${left!=null&&left<0?'error-shortage':''}">${left==null?'—':fmtNum(left)+' '+esc(uom)}</strong></div>
        </div>`;
      }).join(''):`<div class="error-explanation">Bu malzeme için henüz proje seçimi yapılmadı.</div>`;
      return `<div class="error-detail-row error-detail-bad">
        <div class="error-detail-title"><strong>${esc(m.materialCode)}</strong><span>${esc(m.materialDesc||'')}</span>${badge('TESİS keşif kontrolü','bad')}</div>
        <div class="tesis-rule-note"><b>Keşif = Teslim Edilen</b>, <b>Daha Önce Verilen = Verilen Malzeme Toplamı</b>, <b>Kalan Keşif = Teslim Edilen − Verilen</b>. Yeni talep doğrudan kalan keşifle karşılaştırılır.</div>
        ${projectLines}
        <div class="error-compare"><span>${ctx.mode==='manual'?'Manuel Talep':'Rezervasyon Talebi'}: <b>${fmtNum(request)} ${esc(uom)}</b></span><span>Projelere Dağıtılan: <b>${fmtNum(kc.distributed||0)} ${esc(uom)}</b></span></div>
        ${kc.issues.length?`<div class="error-explanation"><b>Neden:</b> ${esc(kc.issues.join(' · '))}</div>`:''}
      </div>`;
    }
    if(!k.found||k.planned==null){
      return `<div class="error-detail-row error-detail-bad"><div class="error-detail-title"><strong>${esc(m.materialCode)}</strong><span>${esc(m.materialDesc||'')}</span>${badge('Keşif kaydı yok','bad')}</div><div class="error-explanation">Bu malzeme için yeni keşif kaynağında kayıt bulunamadı.</div></div>`;
    }
    const planned=num(k.planned),given=num(k.given),available=num(k.remaining),after=available-request,shortage=Math.max(0,request-available);
    return `<div class="error-detail-row error-detail-bad">
      <div class="error-detail-title"><strong>${esc(m.materialCode)}</strong><span>${esc(m.materialDesc||'')}</span>${badge('Keşif yetersiz','bad')}</div>
      <div class="error-equation-grid">
        <div><small>Keşif / Teslim Edilen</small><strong>${fmtNum(planned)} ${esc(uom)}</strong></div><div class="operator">−</div>
        <div><small>Daha Önce Verilen</small><strong>${fmtNum(given)} ${esc(uom)}</strong></div><div class="operator">=</div>
        <div><small>Mevcut Kalan Keşif</small><strong>${fmtNum(available)} ${esc(uom)}</strong></div>
      </div>
      <div class="error-compare"><span>Talep: <b>${fmtNum(request)} ${esc(uom)}</b></span><span>Talep Sonrası: <b>${fmtNum(after)} ${esc(uom)}</b></span><span class="error-shortage">Eksik: <b>${fmtNum(shortage)} ${esc(uom)}</b></span></div>
    </div>`;
  }).join('');
}

function guaranteeErrorDetails(ctx){
  const g=ctx.guarantee||{},items=[];
  if(!g.found){
    items.push(`<div class="error-detail-row error-detail-bad">
      <div class="error-detail-title"><strong>Teminat</strong>${badge('Teminat kaydı yok','bad')}</div>
      <div class="error-explanation">Talep eden depo için ZMM098 teminat bilgisi bulunamadı.</div>
    </div>`);
  }
  const missingPrice=ctx.mode==='manual'?ctx.materials.filter(m=>!m.guaranteeExempt&&!(num(m.unitPrice)>0)):[];
  if(missingPrice.length){
    items.push(`<div class="error-detail-row error-detail-bad">
      <div class="error-detail-title"><strong>Birim Fiyat Eksik</strong>${badge('Hesaplanamıyor','bad')}</div>
      <div class="error-explanation">Kaynak üretim yerindeki MB52 birim fiyatı bulunamayan malzemeler: <b>${missingPrice.map(m=>esc(m.materialCode)).join(', ')}</b>.</div>
    </div>`);
  }
  if(g.found&&g.after!=null&&g.after<0){
    const available=num(g.before),request=num(g.reservationValue),gap=Math.abs(num(g.after));
    items.push(`<div class="error-detail-row error-detail-bad">
      <div class="error-detail-title"><strong>Teminat Limiti Aşılıyor</strong>${badge('Yetersiz','bad')}</div>
      ${ctx.mode==='manual'?`<div class="error-equation-grid guarantee-equation"><div><small>Açık Rez. Dahil Kullanılabilir</small><strong>${fmtMoney(available)}</strong></div><div class="operator">−</div><div><small>Manuel Talep Değeri</small><strong>${fmtMoney(request)}</strong></div><div class="operator">=</div><div><small>Talep Sonrası</small><strong>${fmtMoney(g.after)}</strong></div></div>`:`<div class="error-explanation">ZMM098 içindeki <b>Rez.Yapılabilir Tutar (Açık Rez.Dahil)</b> değeri negatiftir.</div>`}
      <div class="error-compare"><span>Toplam Teminat: <b>${fmtMoney(g.total)}</b></span><span class="error-shortage">Teminat Açığı: <b>${fmtMoney(gap)}</b></span></div>
    </div>`);
  }
  return items.join('');
}

function distributionErrorDetails(ctx){
  if(!ctx.isTesis)return '';
  const items=[];
  for(const m of ctx.materials){
    const d=distributionCheck(ctx,m);if(d.ok)continue;
    const remain=Math.max(0,num(d.need)-num(d.sum));
    const extra=[];
    if(d.over.length)extra.push(`Proje keşfi aşılan/eksik proje: ${d.over.join(', ')}`);
    if(d.duplicates.length)extra.push(`Aynı proje birden fazla satırda seçildi: ${d.duplicates.join(', ')}`);
    items.push(`<div class="error-detail-row error-detail-warn">
      <div class="error-detail-title"><strong>${esc(m.materialCode)}</strong><span>${esc(m.materialDesc||'')}</span>${badge('Dağılım eksik/hatalı','warn')}</div>
      <div class="error-compare">
        <span>Dağıtılması gereken: <b>${fmtNum(d.need)} ${esc(m.uom)}</b></span>
        <span>Dağıtılan: <b>${fmtNum(d.sum)} ${esc(m.uom)}</b></span>
        ${remain>0?`<span class="error-shortage">Kalan: <b>${fmtNum(remain)} ${esc(m.uom)}</b></span>`:''}
      </div>
      ${extra.length?`<div class="error-explanation">${esc(extra.join(' · '))}</div>`:''}
    </div>`);
  }
  return items.join('');
}

function decisionErrorDetails(ctx,gOk,kOk,d){
  const sections=[];
  if(!gOk){
    const html=guaranteeErrorDetails(ctx);
    if(html)sections.push(`<div class="error-detail-group"><h3>Teminat Hataları</h3>${html}</div>`);
  }
  if(!kOk){
    const html=discoveryErrorDetails(ctx);
    if(html)sections.push(`<div class="error-detail-group"><h3>Keşif Hataları</h3>${html}</div>`);
  }
  if(!d.ok){
    const html=distributionErrorDetails(ctx);
    if(html)sections.push(`<div class="error-detail-group"><h3>Proje Dağılımı Hataları</h3>${html}</div>`);
  }
  const other=(ctx.errors||[]).filter(x=>!/^.+: (Keşif verisi bulunamadı|Kalan keşif )/.test(x));
  if(other.length){
    sections.push(`<div class="error-detail-group"><h3>Diğer Kontrol Hataları</h3>${other.map(x=>`<div class="error-detail-row error-detail-bad"><div class="error-explanation">${esc(x)}</div></div>`).join('')}</div>`);
  }
  if(!sections.length)return '';
  return `<section class="decision-error-details">
    <div class="decision-error-head">
      <div><strong>Hata Detayları</strong><span>Kontrolün neden başarısız olduğunu aşağıdaki hesaplardan görebilirsiniz.</span></div>
      ${badge('Açıklama gerekli','bad')}
    </div>
    ${sections.join('')}
  </section>`;
}

async function runCheck(){
  setContentLoading(true);
  if(state.ui.mode==='reservation'&&state.ui.reservationNo&&!state.ui.repeatControlAllowed){
    let history=null;
    try{history=await fetchReservationControlHistory(state.ui.reservationNo,{notify:false})}catch(e){setContentLoading(false);return toast(e.message,'error',6500)}
    if(history?.controlled){
      setContentLoading(false);
      toast(`Bu rezervasyon daha önce kontrol edilmiş ve kaydedilmiş (${history.count} kayıt).`,'warn',6500);
      const confirmed=await confirmRepeatControl(history);
      if(!confirmed)return;
      state.ui.repeatControlAllowed=true;
      toast('Tekrar kontrol blokesi kaldırıldı. Rezervasyon güncel verilerle yeniden kontrol ediliyor.','info',5000);
      setContentLoading(true);
    }
  }
  try{await ensureKesifForCurrentSelection()}catch(e){console.error('Kontrol keşif bağlamı',e);setContentLoading(false);return toast('Keşif verisi hazırlanamadı: '+e.message)}
  const ctx=currentContext();if(!ctx){setContentLoading(false);return toast(state.ui.mode==='manual'?'Önce manuel listeyi hazırlayın.':'Önce rezervasyon seçin.');}
  renderAlerts(ctx);renderControlSummary(ctx,true);renderMaterials(ctx,true);
  const gOk=guaranteeIsOk(ctx);
  const kBad=ctx.materials.filter(m=>!materialDiscoveryCheck(ctx,m).ok),kOk=kBad.length===0,d=overallDistribution(ctx);
  const overall=gOk&&kOk&&d.ok&&ctx.errors.length===0;
  const allDiscoveryExempt=ctx.materials.length>0&&ctx.materials.every(m=>m.discoveryExempt),allGuaranteeExempt=!!ctx.guarantee?.allExempt;
  const gExemptCount=ctx.materials.filter(m=>m.guaranteeExempt).length,kExemptCount=ctx.materials.filter(m=>m.discoveryExempt).length;
  const topRows=[
    {name:'Teminat',ok:gOk,badgeText:allGuaranteeExempt?'Muaf':(gOk?'Uygun':'Hata'),badgeClass:allGuaranteeExempt?'exempt':(gOk?'ok':'bad'),text:allGuaranteeExempt?`Listedeki ${gExemptCount} malzemenin tamamı teminat kontrolünden muaf. Muaf malzemelerin tutarı teminat hesabına dahil edilmedi.`:gOk?`${gExemptCount?gExemptCount+' malzeme teminattan muaf. ':''}${ctx.mode==='manual'?`Muaf olmayan malzemelerin tutarı ZMM098 açık rezervasyonlar dahil kullanılabilir tutardan düşüldü. ${fmtMoney(ctx.guarantee.after)} kullanılabilir teminat kalıyor.`:`Muaf olmayan malzemeler için ZMM098 açık rezervasyonlar dahil kullanılabilir teminat esas alındı. ${fmtMoney(ctx.guarantee.after)} kullanılabilir teminat bulunuyor.`}`:`Teminat kontrolünde eksik veya yetersizlik var. ${ctx.guarantee.after!=null&&ctx.guarantee.after<0?fmtMoney(Math.abs(ctx.guarantee.after))+' açık oluşuyor.':'ZMM098 kullanılabilir teminat bilgisini'+(ctx.mode==='manual'?' ve MB52 fiyatını':'')+' kontrol edin.'}`},
    {name:'Keşif',ok:kOk,badgeText:allDiscoveryExempt?'Muaf':(kOk?'Uygun':'Hata'),badgeClass:allDiscoveryExempt?'exempt':(kOk?'ok':'bad'),text:allDiscoveryExempt?`Listedeki ${kExemptCount} malzemenin tamamı keşif kontrolünden muaf. TESİS proje dağılımı kontrolü devam eder.`:kOk?`${kExemptCount?kExemptCount+' malzeme keşiften muaf. ':''}${ctx.isTesis?'Muaf olmayan TESİS malzemelerinde yeni dağıtım proje bazındaki kalan keşif miktarları içinde.':'Muaf olmayan malzemelerde yeni talep keşif kaynağındaki kalan miktar içinde.'}`:`${kBad.length} malzemede keşif kontrolü başarısız. Ayrıntılı hesap aşağıda gösteriliyor.`}
  ];
  const results=$('#decisionResults');
  results.className='decision-modal-body';
  results.innerHTML=topRows.map(x=>`<div class="decision-result"><strong>${esc(x.name)}</strong><p>${esc(x.text)}</p>${badge(x.badgeText,x.badgeClass)}</div>`).join('')+decisionErrorDetails(ctx,gOk,kOk,d)+itemDecisionResultTable(ctx)+projectDistributionResultTable(ctx);bindDecisionItemSection(ctx);
  $('#overallStatus').innerHTML=badge(overall?'Karar verilebilir':'İnceleme gerekli',overall?'ok':'bad');
  if($('#decisionModalTitle'))$('#decisionModalTitle').textContent=ctx.mode==='manual'?'Manuel Malzeme Kontrol Sonucu':'Karar Destek Sonucu';
  if($('#decisionModalSubtitle'))$('#decisionModalSubtitle').textContent=ctx.mode==='manual'?`Manuel / Excel listesindeki ${ctx.rows.length} satır; seçilen kaynak/hedef depo, teminat, keşif ve TESİS proje dağılımıyla değerlendirildi.`:'Teminat, keşif ve TESİS proje dağılımı birlikte değerlendirilmiştir.';
  state.ui.lastDecisionRecordPayload=null;
  resetDecisionSaveState();
  openDecisionModal();
  setContentLoading(false);
}

async function silentRefresh(){if(Date.now()-lastActivity<60000)return;try{const snap=await fetchSnapshot(true);const next=Object.fromEntries(Object.entries(snap.sources||{}).map(([s,i])=>[s,i?`${i.size}|${i.lastModified}|${(i.files||[]).map(f=>`${f.name}:${f.lastModified}:${f.role}`).join(',')}`:'missing']));const changed=SOURCES.some(s=>next[s]!==state.lastSnapshot[s]);if(changed){await loadSources({silent:true});toast('Değişen veri kaynakları yenilendi.')}lastActivity=Date.now()}catch(e){console.warn('Otomatik yenileme:',e)}}
let lastActivity=Date.now();['mousemove','keydown','click','scroll','touchstart'].forEach(e=>document.addEventListener(e,()=>lastActivity=Date.now(),{passive:true}));setInterval(silentRefresh,10000);


function materialInfoForManual(code,sourceUY=''){
  return state.ix.materialByPlant?.get(key(sourceUY,code))||state.ix.materialCatalog?.get(code)||null;
}
function parseManualQuantity(raw){
  const text=String(raw??'').trim();if(!text)return null;
  const cleaned=text.replace(/\s/g,'').replace(/\.(?=\d{3}(?:\D|$))/g,'').replace(',','.');
  const value=Number(cleaned);return Number.isFinite(value)?value:null;
}
function cleanPasteCell(value){
  return String(value??'').replace(/\u00a0/g,' ').replace(/[\r\n]+/g,' ').replace(/\s+/g,' ').trim();
}
function splitPasteColumns(line){
  if(line.includes('\t'))return line.split('\t');
  if(line.includes(';'))return line.split(';');
  return line.trim().split(/\s{2,}/);
}
function looksLikeManualMaterialCode(value){
  const text=cleanPasteCell(value).replace(/\.0$/,'');
  if(!text)return false;
  const n=normalizeSearchText(text);
  if(n.includes('malzeme')||n.includes('toplam')||n.includes('proje'))return false;
  return /^[A-Za-z0-9._\/-]{5,}$/.test(text);
}
function isManualTotalQtyHeader(value){
  const n=normalizeSearchText(value);
  if(!n)return false;
  return (n.includes('talep')&&n.includes('toplam')&&n.includes('malzeme')&&n.includes('miktar')) ||
    (n.includes('talep edilen')&&n.includes('miktar')) || n==='toplam miktar' || n==='miktar';
}
function isProjectHeaderCandidate(value){
  const n=normalizeSearchText(value);if(!n)return false;
  const blocked=['birim','olcu','termin','direk k','malzeme tanimi','malzeme veya isin cinsi','poz birlesi','sira','malzeme kodu','toplam miktar','talep edilen toplam malzeme miktarlari'];
  return !blocked.some(x=>n===x||n.startsWith(x+' '));
}
function parseSimpleManualRow(rec){
  const cols=(rec?.cols||[]).map(cleanPasteCell);
  let code='',codeIndex=-1;
  for(let i=0;i<cols.length;i++){
    const candidate=String(cols[i]||'').replace(/\.0$/,'').trim();
    if(looksLikeManualMaterialCode(candidate)){code=candidate;codeIndex=i;break}
  }
  // Bazı kopyalamalarda Excel sütun ayırıcıları kaybolup satır tek hücre gibi gelebilir.
  if(!code){
    const m=String(rec?.rawText||'').trim().match(/^([A-Za-z0-9._\/-]{5,})(?:\s+|$)/);
    if(m&&looksLikeManualMaterialCode(m[1]))code=m[1];
  }
  if(!code)return{skip:true};

  // Önce gerçek Excel hücrelerinden sayısal miktarı ara. Açıklama sütunu aradaysa
  // son sayısal hücreyi miktar kabul eder. Eski iki sütunlu Kod + Miktar yapısı da korunur.
  let qty=null;
  if(codeIndex>=0){
    for(let i=cols.length-1;i>codeIndex;i--){
      const q=parseManualQuantity(cols[i]);
      if(q!=null&&q>0){qty=q;break}
    }
  }
  // Sekme/sütun bilgisi yoksa satırın en sonundaki bağımsız sayıyı miktar olarak oku.
  if(qty==null){
    const raw=String(rec?.rawText||'').trim();
    const m=raw.match(/(?:^|\s)([+-]?\d+(?:[.,]\d+)?)\s*$/);
    if(m){const q=parseManualQuantity(m[1]);if(q!=null&&q>0)qty=q}
  }
  return{materialCode:code,qty};
}
function parseManualPaste(text){
  const rawLines=String(text||'').replace(/\r/g,'').split('\n');
  const matrix=[];
  for(let i=0;i<rawLines.length;i++){
    if(!rawLines[i].trim())continue;
    const cols=splitPasteColumns(rawLines[i]).map(cleanPasteCell);
    if(cols.some(Boolean))matrix.push({sourceLine:i+1,rawText:rawLines[i],cols});
  }
  const rows=[],errors=[];let projectHeaders=[],mode='simple',headerSourceLine=0;
  if(!matrix.length)return{rows,errors:['Yapıştırılan alanda malzeme satırı bulunamadı.'],projectHeaders,mode,headerSourceLine,materialColumnIndex:-1,qtyColumnIndex:-1};

  // Tam Excel talep formunda tablo başlığını bul. Üstteki doküman/firma/sözleşme satırları otomatik atlanır.
  let headerPos=-1,materialIdx=-1,qtyIdx=-1;
  for(let i=0;i<matrix.length;i++){
    const cols=matrix[i].cols;
    const mi=cols.findIndex(c=>{const n=normalizeSearchText(c);return n==='malzeme kodu'||(n.includes('malzeme')&&n.includes('kodu'))});
    if(mi<0)continue;
    let qi=cols.findIndex((c,j)=>j>mi&&isManualTotalQtyHeader(c));
    if(qi<0)qi=cols.findIndex((c,j)=>j>mi&&normalizeSearchText(c)==='miktar');
    if(qi>=0){headerPos=i;materialIdx=mi;qtyIdx=qi;break}
  }

  if(headerPos>=0){
    mode='excel-form';headerSourceLine=matrix[headerPos].sourceLine;
    const headers=matrix[headerPos].cols;
    const rawProjects=[];
    for(let j=qtyIdx+1;j<headers.length;j++){
      const projectName=cleanPasteCell(headers[j]);
      if(projectName&&isProjectHeaderCandidate(projectName))rawProjects.push({colIndex:j,projectName});
    }
    const projectTotals=new Map(rawProjects.map(p=>[p.projectName,0]));
    for(let i=headerPos+1;i<matrix.length;i++){
      const rec=matrix[i],cols=rec.cols,code=cleanPasteCell(cols[materialIdx]).replace(/\.0$/,'');
      if(!code)continue;
      if(!looksLikeManualMaterialCode(code)){
        // Tablo altı toplam/not satırlarını sessizce atla; malzeme koduna benzeyen ama hatalı satırlar ayrıca yakalanır.
        continue;
      }
      const qty=parseManualQuantity(cols[qtyIdx]);
      if(qty==null||qty<=0){errors.push(`Satır ${rec.sourceLine}: ${code} için toplam miktar bulunamadı veya geçersiz.`);continue}
      const projectAllocations=[];
      for(const p of rawProjects){
        const q=parseManualQuantity(cols[p.colIndex]);
        if(q!=null&&q>0){projectAllocations.push({projectName:p.projectName,qty:q});projectTotals.set(p.projectName,(projectTotals.get(p.projectName)||0)+q)}
      }
      rows.push({materialCode:code,qty,sourceLine:rec.sourceLine,rawText:rec.rawText,projectAllocations});
    }
    projectHeaders=rawProjects.filter(p=>(projectTotals.get(p.projectName)||0)>0).map(p=>p.projectName);
    // Kullanılmayan proje kolonlarını satırlardan da temizle.
    const used=new Set(projectHeaders);
    rows.forEach(r=>r.projectAllocations=(r.projectAllocations||[]).filter(a=>used.has(a.projectName)));
  }else{
    // Başlıksız / sade yapıştırma desteği:
    // 1) Malzeme Kodu + Miktar
    // 2) Malzeme Kodu + Malzeme Tanımı + Miktar
    // 3) Excel sekmeleri kaybolmuş olsa bile satır başındaki kod + satır sonundaki miktar
    let logical=0;
    for(const rec of matrix){
      const cols=rec.cols;
      const firstNorm=normalizeSearchText(cols[0]),secondNorm=normalizeSearchText(cols[1]||'');
      if(logical===0&&firstNorm.includes('malzeme')&&(secondNorm.includes('miktar')||secondNorm.includes('adet')||secondNorm.includes('qty'))){logical++;continue}
      logical++;
      const parsedRow=parseSimpleManualRow(rec);
      if(parsedRow.skip)continue;
      const materialCode=parsedRow.materialCode,qty=parsedRow.qty;
      if(qty==null||qty<=0){errors.push(`Satır ${rec.sourceLine}: ${materialCode} için miktar bulunamadı. Kod + miktar veya Kod + Tanım + Miktar biçiminde yapıştırın.`);continue}
      rows.push({materialCode,qty,sourceLine:rec.sourceLine,rawText:rec.rawText,projectAllocations:[]});
    }
  }
  if(!rows.length&&!errors.length)errors.push('Yapıştırılan alanda malzeme satırı bulunamadı.');
  return{rows,errors,projectHeaders,mode,headerSourceLine,materialColumnIndex:materialIdx,qtyColumnIndex:qtyIdx};
}
function manualPreviewProjectQuantity(row,projectName){
  return num((row.projectAllocations||[]).find(a=>a.projectName===projectName)?.qty||0);
}
function cloneManualDraftRow(row={}){
  return {
    materialCode:String(row.materialCode||'').trim(),
    qty:row.qty==null?'':String(row.qty),
    projectAllocations:(row.projectAllocations||[]).map(a=>({projectName:String(a.projectName||''),qty:a.qty==null?'':String(a.qty)}))
  };
}
function buildManualDraftFromParsed(parsed={}){
  const preserve=!!parsed.fromDraft;
  const prevSelection=preserve?[...(state.ui.manualDraftSelection||[])]:[];
  const prevActive=preserve?state.ui.manualActiveRow:-1;
  state.ui.manualDraftRows=(parsed.rows||[]).map(cloneManualDraftRow);
  state.ui.manualDraftProjectHeaders=[...new Set((parsed.projectHeaders||[]).filter(Boolean))];
  state.ui.manualDraftSelection=preserve?prevSelection.filter(i=>i>=0&&i<state.ui.manualDraftRows.length):[];
  state.ui.manualActiveRow=preserve&&prevActive>=0&&prevActive<state.ui.manualDraftRows.length?prevActive:(state.ui.manualDraftRows.length?0:-1);
  hideManualContextMenu();
}
function buildParsedFromManualDraft(){
  const rows=[];const errors=[];const headers=[...new Set((state.ui.manualDraftProjectHeaders||[]).map(x=>String(x||'').trim()).filter(Boolean))];
  const projectTotals=new Map(headers.map(h=>[h,0]));
  let visibleLine=0;
  for(const draft of (state.ui.manualDraftRows||[])){
    visibleLine++;
    const code=cleanPasteCell(draft.materialCode).replace(/\.0$/,'');
    const qty=parseManualQuantity(draft.qty);
    const allocations=[];
    for(const h of headers){
      const found=(draft.projectAllocations||[]).find(a=>String(a.projectName||'').trim()===h);
      const q=parseManualQuantity(found?.qty);
      if(q!=null&&q>0){allocations.push({projectName:h,qty:q});projectTotals.set(h,(projectTotals.get(h)||0)+q)}
    }
    const hasAny=!!code || qty!=null || allocations.length;
    if(!hasAny)continue;
    if(!code){errors.push(`Satır ${visibleLine}: malzeme kodu boş.`);continue}
    if(!looksLikeManualMaterialCode(code)){errors.push(`Satır ${visibleLine}: ${code} malzeme kodu biçimi geçerli görünmüyor.`);continue}
    if(qty==null||qty<=0){errors.push(`Satır ${visibleLine}: ${code} için toplam miktar bulunamadı veya geçersiz.`);continue}
    rows.push({materialCode:code,qty,sourceLine:visibleLine,rawText:'',projectAllocations:allocations});
  }
  const usedHeaders=headers.filter(h=>(projectTotals.get(h)||0)>0);
  const usedSet=new Set(usedHeaders);
  rows.forEach(r=>r.projectAllocations=(r.projectAllocations||[]).filter(a=>usedSet.has(a.projectName)));
  return {rows,errors,projectHeaders:headers.length?usedHeaders:[],mode:headers.length?'excel-form':'manual-list',headerSourceLine:1,fromDraft:true};
}
function manualDraftSelectionSet(){return new Set((state.ui.manualDraftSelection||[]).map(Number).filter(Number.isInteger))}
function setManualActiveRow(index){ state.ui.manualActiveRow = index>=0 && index<(state.ui.manualDraftRows||[]).length ? index : -1; }
function toggleManualDraftSelection(index,checked){ const set=manualDraftSelectionSet(); if(checked)set.add(index); else set.delete(index); state.ui.manualDraftSelection=[...set].sort((a,b)=>a-b); setManualActiveRow(index); }
function updateManualDraftRow(index,field,value,projectName=''){
  const row=state.ui.manualDraftRows?.[index]; if(!row)return;
  if(field==='materialCode') row.materialCode=String(value||'').trim();
  else if(field==='qty') row.qty=String(value??'');
  else if(field==='project'){ row.projectAllocations ||= []; let found=row.projectAllocations.find(a=>String(a.projectName||'').trim()===projectName); if(!found){found={projectName,qty:''}; row.projectAllocations.push(found)} found.qty=String(value??''); }
  invalidateManualPrepared('Liste üzerinde değişiklik yapıldı; Listeyi Hazırla ve Kontrol Et ile yeniden hesaplayın.');
}
function insertManualDraftRow(index,before=false,sourceRow=null){
  const headers=state.ui.manualDraftProjectHeaders||[];
  const base=sourceRow?cloneManualDraftRow(sourceRow):{materialCode:'',qty:'',projectAllocations:headers.map(h=>({projectName:h,qty:''}))};
  if(!base.projectAllocations?.length && headers.length)base.projectAllocations=headers.map(h=>({projectName:h,qty:''}));
  const rows=state.ui.manualDraftRows||[];
  const at = before ? Math.max(0,index) : Math.min(rows.length,index+1);
  rows.splice(at,0,base); state.ui.manualDraftRows=rows; state.ui.manualDraftSelection=[]; setManualActiveRow(at);
  invalidateManualPrepared('Listeye yeni satır eklendi; Listeyi Hazırla ve Kontrol Et ile yeniden hesaplayın.'); renderManualExcelPreview(buildParsedFromManualDraft());
}
function removeManualDraftRows(indices=[]){
  const uniq=[...new Set(indices.map(Number).filter(Number.isInteger))].sort((a,b)=>b-a); if(!uniq.length)return; const rows=state.ui.manualDraftRows||[]; uniq.forEach(i=>{if(i>=0&&i<rows.length)rows.splice(i,1)});
  state.ui.manualDraftRows=rows; state.ui.manualDraftSelection=[]; setManualActiveRow(Math.min(rows.length-1, uniq.length?uniq[uniq.length-1]:-1));
  invalidateManualPrepared('Seçilen satırlar listeden çıkarıldı; Listeyi Hazırla ve Kontrol Et ile yeniden hesaplayın.'); renderManualExcelPreview(buildParsedFromManualDraft());
}
function clearManualDraftOnly(){ state.ui.manualDraftRows=[];state.ui.manualDraftProjectHeaders=[];state.ui.manualDraftSelection=[];state.ui.manualActiveRow=-1;state.ui.manualRowClipboard=null; invalidateManualPrepared('Liste temizlendi.'); renderManualExcelPreview(buildParsedFromManualDraft()); }
function copyManualDraftRow(index){ const row=state.ui.manualDraftRows?.[index]; if(!row)return; state.ui.manualRowClipboard=cloneManualDraftRow(row); toast('Satır kopyalandı.'); }
function pasteManualDraftRow(index){ if(!state.ui.manualRowClipboard){toast('Kopyalanmış satır bulunamadı.');return} insertManualDraftRow(index,false,state.ui.manualRowClipboard); }
function hideManualContextMenu(){const menu=$('#manualContextMenu'); if(menu) menu.hidden=true; state.ui.manualContextRow=-1;}
function showManualContextMenu(x,y,rowIndex){
  const menu=$('#manualContextMenu'); if(!menu)return; state.ui.manualContextRow=rowIndex; setManualActiveRow(rowIndex); renderManualExcelPreview(buildParsedFromManualDraft());
  menu.hidden=false; const rect=menu.getBoundingClientRect(); const maxX=window.scrollX+document.documentElement.clientWidth-rect.width-12; const maxY=window.scrollY+document.documentElement.clientHeight-rect.height-12;
  menu.style.left=Math.max(window.scrollX+8, Math.min(x,maxX))+'px'; menu.style.top=Math.max(window.scrollY+8, Math.min(y,maxY))+'px';
}
function handleManualContextAction(action){
  const row=state.ui.manualContextRow>=0?state.ui.manualContextRow:state.ui.manualActiveRow;
  if(action==='add-below')insertManualDraftRow(row<0?(state.ui.manualDraftRows||[]).length-1:row,false);
  else if(action==='add-above')insertManualDraftRow(Math.max(0,row),true);
  else if(action==='delete-row' && row>=0)removeManualDraftRows([row]);
  else if(action==='delete-selected')removeManualDraftRows(state.ui.manualDraftSelection||[]);
  else if(action==='copy-row' && row>=0)copyManualDraftRow(row);
  else if(action==='paste-row' && row>=0)pasteManualDraftRow(row);
  else if(action==='clear-all')clearManualDraftOnly();
  hideManualContextMenu();
}
function bindManualDraftInteractions(){
  $$('.manual-row-check').forEach(inp=>inp.onchange=()=>{toggleManualDraftSelection(Number(inp.dataset.index),inp.checked); renderManualExcelPreview(buildParsedFromManualDraft())});
  $$('.manual-draft-input').forEach(inp=>{ inp.onfocus=()=>setManualActiveRow(Number(inp.dataset.index)); inp.oninput=()=>updateManualDraftRow(Number(inp.dataset.index),inp.dataset.field,inp.value,inp.dataset.project||''); });
  $$('.manual-row-delete').forEach(btn=>btn.onclick=()=>removeManualDraftRows([Number(btn.dataset.index)]));
  $$('.manual-edit-table tbody tr').forEach(tr=>{ tr.onclick=e=>{if(e.target.closest('input,button,label'))return; setManualActiveRow(Number(tr.dataset.index)); renderManualExcelPreview(buildParsedFromManualDraft())}; tr.oncontextmenu=e=>{e.preventDefault();}; });
  document.querySelectorAll('#manualContextMenu button').forEach(btn=>btn.onclick=()=>handleManualContextAction(btn.dataset.action));
}
function renderManualSummary(rows,projects){
  const uniqueCount=new Set(rows.map(r=>r.materialCode).filter(Boolean)).size; const totalQty=rows.reduce((s,r)=>s+num(r.qty),0); const setText=(id,val)=>{const el=$(id); if(el) el.textContent=val};
  setText('#manualSummaryMaterials', String(uniqueCount)); setText('#manualSummaryQty', fmtNum(totalQty)); setText('#manualSummaryProjects', String(projects.length));
  const list=$('#manualSummaryProjectList'); if(list){ if(!projects.length){list.innerHTML='<li>Proje verisi bekleniyor</li>'} else { const totals=projects.map(p=>({name:p,total:rows.reduce((s,r)=>s+manualPreviewProjectQuantity(r,p),0)})).sort((a,b)=>b.total-a.total).slice(0,5); list.innerHTML=totals.map(item=>`<li><span>${esc(item.name)}</span><strong>${fmtNum(item.total)}</strong></li>`).join(''); } }
}
function renderManualExcelPreview(parsed=parseManualPaste($('#manualPasteArea')?.value||'')){
  parsed=parsed||{rows:[],errors:[],projectHeaders:[],mode:'manual-list'};
  buildManualDraftFromParsed(parsed);
  const rows=state.ui.manualDraftRows||[],projects=state.ui.manualDraftProjectHeaders||[],errors=parsed.errors||[];
  const setText=(id,val)=>{const el=$(id);if(el)el.textContent=val};
  setText('#manualMetricMaterials',String(new Set(rows.map(r=>r.materialCode).filter(Boolean)).size));
  setText('#manualMetricProjects',String(projects.length));
  setText('#manualMetricQty',fmtNum(rows.reduce((s,r)=>s+num(r.qty),0)));
  setText('#manualMetricErrors',String(errors.length));
  const feedback=$('#manualPasteFeedback');
  if(feedback){
    if(!String($('#manualPasteArea')?.value||'').trim() && !rows.length){
      feedback.className='excel-parser-feedback neutral';
      feedback.innerHTML='<span class="excel-feedback-dot">i</span><strong>Excel verisi bekleniyor.</strong><span>Tablo yapıştırıldığında proje isimleri otomatik olarak sütun başlığına dönüştürülür.</span>';
    }else if(errors.length){
      feedback.className='excel-parser-feedback bad';
      feedback.innerHTML=`<span class="excel-feedback-dot">!</span><strong>${errors.length} satır kontrol edilmeli.</strong><span>${esc(errors[0])}</span>`;
    }else if(parsed.mode==='excel-form'){
      feedback.className='excel-parser-feedback ok';
      feedback.innerHTML=`<span class="excel-feedback-dot">✓</span><strong>Excel verisi başarıyla ayrıştırıldı.</strong><span>${rows.length} satır ve ${projects.length} proje sütunu bulundu.</span>`;
    }else{
      feedback.className='excel-parser-feedback ok';
      feedback.innerHTML=`<span class="excel-feedback-dot">✓</span><strong>${rows.length} malzeme satırı okundu.</strong><span>Proje sütunu bulunmadı; proje dağılımı aşağıdaki kontrol kartında yapılabilir.</span>`;
    }
  }
  const empty=$('#manualExcelPreviewEmpty'),scroll=$('#manualExcelPreviewScroll'),head=$('#manualExcelPreviewHead'),body=$('#manualExcelPreviewBody');
  if(!empty||!scroll||!head||!body)return parsed;
  renderManualSummary(rows,projects);
  if(!rows.length){empty.hidden=false;scroll.hidden=true;head.innerHTML='';body.innerHTML='';hideManualContextMenu();return parsed}
  empty.hidden=true;scroll.hidden=false;
  head.innerHTML=`<tr><th class="manual-select-col"><input id="manualSelectAllRows" type="checkbox" ${rows.length&&rows.every((_,i)=>manualDraftSelectionSet().has(i))?'checked':''}></th><th class="excel-row-no">#</th><th class="excel-sticky-code">Malzeme Kodu</th><th class="excel-sticky-qty">Toplam Miktar</th>${projects.map((p,i)=>`<th class="project-col project-tone-${i%6}" title="${esc(p)}">${esc(p)}</th>`).join('')}<th class="manual-action-col">Sil</th></tr>`;
  const sel=manualDraftSelectionSet();
  body.innerHTML=rows.map((r,ri)=>`<tr data-index="${ri}" class="${state.ui.manualActiveRow===ri?'active':''} ${sel.has(ri)?'selected':''}"><td class="manual-select-col"><input class="manual-row-check" data-index="${ri}" type="checkbox" ${sel.has(ri)?'checked':''}></td><td class="excel-row-no">${ri+1}</td><td class="excel-sticky-code"><input class="manual-draft-input code" data-index="${ri}" data-field="materialCode" value="${esc(r.materialCode)}" placeholder="Malzeme kodu"></td><td class="excel-sticky-qty num"><input class="manual-draft-input qty" data-index="${ri}" data-field="qty" value="${esc(r.qty)}" placeholder="0"></td>${projects.map((p,i)=>{const q=(r.projectAllocations||[]).find(a=>a.projectName===p)?.qty||'';return`<td class="project-col project-tone-${i%6} num"><input class="manual-draft-input project" data-index="${ri}" data-field="project" data-project="${esc(p)}" value="${esc(q)}" placeholder="0"></td>`}).join('')}<td class="manual-action-col"><button type="button" class="manual-row-delete" data-index="${ri}" title="Satırı sil">🗑</button></td></tr>`).join('');
  const selectAll=$('#manualSelectAllRows');
  if(selectAll)selectAll.onchange=()=>{state.ui.manualDraftSelection=selectAll.checked?rows.map((_,i)=>i):[]; renderManualExcelPreview(buildParsedFromManualDraft())};
  bindManualDraftInteractions();
  return parsed;
}
function compactProjectMatchName(value){
  return normalizeSearchText(value).replace(/\b(projesi|proje|isi|işi)\b/g,' ').replace(/\s+/g,' ').trim();
}
function resolveManualProjectId(projectName,projects){
  const target=normalizeSearchText(projectName),compact=compactProjectMatchName(projectName);
  const exact=(projects||[]).filter(p=>normalizeSearchText(p.projectName)===target);
  if(exact.length===1)return exact[0].projectId;
  const compactExact=(projects||[]).filter(p=>compactProjectMatchName(p.projectName)===compact);
  if(compact&&compactExact.length===1)return compactExact[0].projectId;
  const contains=(projects||[]).filter(p=>{
    const n=normalizeSearchText(p.projectName);return target.length>=8&&(n.includes(target)||target.includes(n));
  });
  return contains.length===1?contains[0].projectId:'';
}
function applyParsedProjectAllocations(parsed,ctx){
  state.ui.allocations={};state.ui.allocationRows={};
  if(!ctx?.isTesis||!(parsed?.projectHeaders||[]).length)return{unmatched:[]};
  const projectMap=new Map(),unmatched=[];
  for(const name of parsed.projectHeaders){
    const id=resolveManualProjectId(name,ctx.projects||[]);if(id)projectMap.set(name,id);else unmatched.push(name);
  }
  const rowsByMaterial={};
  for(const r of parsed.rows||[]){
    for(const a of r.projectAllocations||[]){
      if(!(num(a.qty)>0))continue;const pid=projectMap.get(a.projectName);if(!pid)continue;
      rowsByMaterial[r.materialCode]??={};rowsByMaterial[r.materialCode][pid]=(rowsByMaterial[r.materialCode][pid]||0)+num(a.qty);
    }
  }
  for(const [code,map] of Object.entries(rowsByMaterial)){
    state.ui.allocations[code]={...map};
    state.ui.allocationRows[code]=Object.entries(map).filter(([,q])=>num(q)>0).map(([projectId,qty])=>({projectId,qty:num(q)}));
  }
  return{unmatched};
}
function refreshManualPastePreview(){
  const status=$('#manualPasteStatus');if(status&&!state.ui.manualReady){status.className='manual-paste-status muted';status.textContent=''}
  hideManualContextMenu();
  return renderManualExcelPreview();
}
function invalidateManualPrepared(message='Seçim veya liste değişti; Listeyi Hazırla ile yeniden hesaplayın.'){
  state.ui.manualReady=false;state.ui.manualRows=[];state.ui.allocations={};state.ui.allocationRows={};hideManualContextMenu();
  if(state.ui.mode==='manual')hideWorkspaceForMode();
  const status=$('#manualPasteStatus');if(status){status.className='manual-paste-status warn';status.textContent=message}
}
function materialSearchRank(item,q){
  const code=normalizeSearchText(item.materialCode),desc=normalizeSearchText(item.materialDesc),uom=normalizeSearchText(item.uom);
  if(code===q)return 0;
  if(code.startsWith(q))return 1;
  if(code.includes(q))return 2;
  if(desc.startsWith(q))return 3;
  const words=q.split(/\s+/).filter(Boolean);if(words.length&&words.every(w=>desc.includes(w)||code.includes(w)||uom.includes(w)))return 4;
  return 5;
}
function findMaterialMatches(query,limit=15){
  const q=normalizeSearchText(query);if(!q)return[];const words=q.split(/\s+/).filter(Boolean);
  return (state.ix.materialSearch||[]).filter(m=>words.every(w=>m.searchText.includes(w))).sort((a,b)=>materialSearchRank(a,q)-materialSearchRank(b,q)||String(a.materialCode).localeCompare(String(b.materialCode),'tr',{numeric:true})).slice(0,limit);
}
function materialOptionHtml(m,index){
  const source=splitDepotKey(state.ui.manualSourceKey),plantInfo=source.uy?state.ix.materialByPlant?.get(key(source.uy,m.materialCode)):null;
  const info=plantInfo||m,price=source.uy?(state.ix.plantPrice?.get(key(source.uy,m.materialCode))||0):0;
  const sourceText=source.uy?(plantInfo?(price>0?`Kaynak ÜY ${source.uy} · fiyat kaydı var`:`Kaynak ÜY ${source.uy} · malzeme kaydı var, fiyat yok`):`Kaynak ÜY ${source.uy} kaydı yok`):'Kaynak depo seçilmedi';
  return `<button type="button" class="manual-material-option" role="option" data-material-code="${esc(m.materialCode)}" data-index="${index}">
    <div class="manual-material-option-top"><strong class="manual-material-option-code">${esc(m.materialCode)}</strong><span class="manual-material-option-uom">${esc(info.uom||m.uom||'—')}</span></div>
    <div class="manual-material-option-desc">${esc(info.materialDesc||m.materialDesc||'Malzeme tanımı bulunamadı')}</div>
    <div class="manual-material-option-source ${plantInfo&&price>0?'ready':''}">${esc(sourceText)}</div>
  </button>`;
}
function closeManualMaterialSearch(){
  const input=$('#manualMaterialLookup'),box=$('#manualMaterialResults'),toggle=$('#manualMaterialToggleBtn');state.ui.manualMaterialSearchActive=-1;
  if(box){box.hidden=true;box.innerHTML=''}
  if(input)input.setAttribute('aria-expanded','false');
  if(toggle){toggle.setAttribute('aria-expanded','false');toggle.classList.remove('active');toggle.textContent='▾';toggle.title='Malzeme listesini aç';toggle.setAttribute('aria-label','Malzeme listesini aç')}
}
function renderManualMaterialSearch(query){
  const input=$('#manualMaterialLookup'),box=$('#manualMaterialResults'),toggle=$('#manualMaterialToggleBtn');if(!input||!box)return;const q=String(query||'').trim();state.ui.manualMaterialSearchActive=-1;
  let matches=[];let heading='';
  if(!q){
    matches=[...(state.ix.materialSearch||[])];
    heading=`Tüm malzemeler · ${matches.length.toLocaleString('tr-TR')} kayıt · Aramak için yazmaya başlayın`;
  }else{
    matches=findMaterialMatches(q,60);
    heading=matches.length?`${matches.length} eşleşme gösteriliyor · Kod veya tanımla arama aktif`:'Arama sonucu';
  }
  box.innerHTML=`<div class="manual-material-list-head">${esc(heading)}</div>`+(matches.length?matches.map(materialOptionHtml).join(''):'<div class="res-search-empty">Aramaya uygun malzeme bulunamadı.</div>');
  box.querySelectorAll('.manual-material-option').forEach(btn=>btn.onclick=e=>{e.preventDefault();e.stopPropagation();selectManualMaterial(btn.dataset.materialCode)});
  box.hidden=false;input.setAttribute('aria-expanded','true');
  if(toggle){toggle.setAttribute('aria-expanded','true');toggle.classList.add('active');toggle.textContent='▴';toggle.title='Malzeme listesini kapat';toggle.setAttribute('aria-label','Malzeme listesini kapat')}
}
function setManualMaterialActive(index){
  const box=$('#manualMaterialResults');if(!box||box.hidden)return;const opts=[...box.querySelectorAll('.manual-material-option')];if(!opts.length)return;
  index=Math.max(0,Math.min(opts.length-1,index));state.ui.manualMaterialSearchActive=index;opts.forEach((o,i)=>o.classList.toggle('active',i===index));opts[index].scrollIntoView({block:'nearest'});
}
function clearManualMaterialSelection({clearInput=true,clearQty=false}={}){
  state.ui.manualMaterialCode='';state.ui.manualMaterialSearchActive=-1;closeManualMaterialSearch();
  const input=$('#manualMaterialLookup'),selected=$('#manualMaterialSelected'),qty=$('#manualMaterialQty');
  if(clearInput&&input)input.value='';if(clearQty&&qty)qty.value='';
  if(selected){selected.className='manual-material-selected muted';selected.textContent='Malzeme seçilmedi.'}
}
function selectManualMaterial(materialCode){
  const source=splitDepotKey(state.ui.manualSourceKey),info=materialInfoForManual(materialCode,source.uy)||state.ix.materialCatalog?.get(materialCode);if(!info)return toast('Malzeme tanımı bulunamadı.');
  state.ui.manualMaterialCode=materialCode;const input=$('#manualMaterialLookup'),selected=$('#manualMaterialSelected');
  if(input)input.value=`${materialCode} — ${info.materialDesc||'Malzeme tanımı bulunamadı'}`;
  if(selected){selected.className='manual-material-selected ready';selected.textContent=`${info.materialDesc||'Malzeme tanımı bulunamadı'}${info.uom?` · ${info.uom}`:''}`}
  closeManualMaterialSearch();const qty=$('#manualMaterialQty');if(qty){qty.focus();qty.select()}
}
function bindManualMaterialInput(){
  const input=$('#manualMaterialLookup'),box=$('#manualMaterialResults'),toggle=$('#manualMaterialToggleBtn');if(!input)return;
  input.onfocus=()=>renderManualMaterialSearch(state.ui.manualMaterialCode?'':input.value);
  input.oninput=()=>{state.ui.manualMaterialCode='';const selected=$('#manualMaterialSelected');if(selected){selected.className='manual-material-selected muted';selected.textContent='Malzeme seçilmedi.'}renderManualMaterialSearch(input.value)};
  if(toggle)toggle.onclick=e=>{
    e.preventDefault();e.stopPropagation();
    if(box&&!box.hidden){closeManualMaterialSearch();return}
    renderManualMaterialSearch('');input.focus({preventScroll:true});
  };
  input.onkeydown=e=>{
    const opts=box?[...box.querySelectorAll('.manual-material-option')]:[];
    if((e.key==='ArrowDown'||(e.altKey&&e.key==='ArrowDown'))&&box.hidden){e.preventDefault();renderManualMaterialSearch('');setManualMaterialActive(0);return}
    if(e.key==='ArrowDown'&&!box.hidden&&opts.length){e.preventDefault();setManualMaterialActive(state.ui.manualMaterialSearchActive<0?0:state.ui.manualMaterialSearchActive+1);return}
    if(e.key==='ArrowUp'&&!box.hidden&&opts.length){e.preventDefault();setManualMaterialActive(state.ui.manualMaterialSearchActive<=0?opts.length-1:state.ui.manualMaterialSearchActive-1);return}
    if(e.key==='Escape'){closeManualMaterialSearch();return}
    if(e.key==='Enter'){
      if(!box.hidden&&state.ui.manualMaterialSearchActive>=0&&opts[state.ui.manualMaterialSearchActive]){e.preventDefault();selectManualMaterial(opts[state.ui.manualMaterialSearchActive].dataset.materialCode);return}
      const raw=String(input.value||'').trim(),exact=(state.ix.materialSearch||[]).find(m=>m.materialCode===raw)||(findMaterialMatches(raw,2).length===1?findMaterialMatches(raw,2)[0]:null);
      if(exact){e.preventDefault();selectManualMaterial(exact.materialCode)}
    }
  };
}
function addSelectedManualMaterial(){
  const code=state.ui.manualMaterialCode,qtyRaw=$('#manualMaterialQty')?.value??'',qty=parseManualQuantity(qtyRaw);
  if(!code)return toast('Önce listeden bir malzeme seçin.');
  if(qty==null||qty<=0)return toast('Miktar sıfırdan büyük sayısal bir değer olmalı.');
  const area=$('#manualPasteArea');if(!area)return;
  const qtyText=String(qty).replace('.',',');let current=String(area.value||'').replace(/\s+$/,'');
  const existing=parseManualPaste(current);let line=`${code}\t${qtyText}`;
  if(current&&existing.mode==='excel-form'&&existing.qtyColumnIndex>=0&&existing.materialColumnIndex>=0){
    const cells=Array(existing.qtyColumnIndex+1).fill('');cells[existing.materialColumnIndex]=code;cells[existing.qtyColumnIndex]=qtyText;line=cells.join('\t');
  }
  if(!current)current=`Malzeme Kodu\tMiktar\n${line}`;else current+=`\n${line}`;
  area.value=current;invalidateManualPrepared(`${code} listeye eklendi; Malzeme ve Keşif Kontrolüne Aktar ile kontrolü oluşturun.`);refreshManualPastePreview();
  clearManualMaterialSelection({clearInput:true,clearQty:true});area.scrollTop=area.scrollHeight;$('#manualMaterialLookup')?.focus();
}
function depotSearchRank(item,q,kind){
  const dy=normalizeSearchText(item.dy),uy=normalizeSearchText(item.uy),desc=normalizeSearchText(item.dyDesc),company=normalizeSearchText(item.companyName),contract=normalizeSearchText(item.contractName);
  let r=6;if(dy===q||uy===q)r=0;else if(dy.startsWith(q)||uy.startsWith(q))r=1;else if(desc.startsWith(q))r=2;else if(company.startsWith(q)||contract.startsWith(q))r=3;else if(item.searchText.includes(q))r=4;
  const type=normalizeSearchText(item.depotType);if(kind==='source'&&type.includes('ana'))r-=.25;if(kind==='target'&&(type.includes('cep')||type.includes('yapim')))r-=.25;return r;
}
function findDepotMatches(query,kind,limit=12){
  const q=normalizeSearchText(query);if(!q)return[];
  return (state.ix.depotSearch||[]).filter(d=>d.searchText.includes(q)).sort((a,b)=>depotSearchRank(a,q,kind)-depotSearchRank(b,q,kind)||String(a.uy).localeCompare(String(b.uy),'tr')||String(a.dy).localeCompare(String(b.dy),'tr')).slice(0,limit);
}
function depotOptionHtml(d,index){
  return `<button type="button" class="manual-depot-option" role="option" data-depot-key="${esc(key(d.uy,d.dy))}" data-index="${index}">
    <div class="manual-depot-option-top"><strong class="manual-depot-option-code">${esc(d.uy)} / ${esc(d.dy)}</strong><span class="manual-depot-option-type">${esc(d.depotType||'Depo')}</span></div>
    <div class="manual-depot-option-desc">${esc(d.dyDesc||'Depo tanımı yok')} ${d.workType?`· ${esc(d.workType)}`:''}</div>
    ${d.companyName?`<div class="manual-depot-option-company">${esc(d.companyName)}</div>`:''}
    ${d.contractName?`<div class="manual-depot-option-contract">${esc(d.contractName)}</div>`:''}
  </button>`;
}
function manualDepotEls(kind){return kind==='source'?{input:$('#manualSourceDepotLookup'),box:$('#manualSourceDepotResults'),selected:$('#manualSourceDepotSelected')}:{input:$('#manualTargetDepotLookup'),box:$('#manualTargetDepotResults'),selected:$('#manualTargetDepotSelected')}}
function closeManualDepotSearch(kind=''){
  for(const k of kind?[kind]:['source','target']){const {input,box}=manualDepotEls(k);state.ui.manualDepotSearchActive[k]=-1;if(box){box.hidden=true;box.innerHTML=''}if(input)input.setAttribute('aria-expanded','false')}
}
function renderManualDepotSearch(kind,query){
  const {input,box}=manualDepotEls(kind);if(!input||!box)return;const q=String(query||'').trim();state.ui.manualDepotSearchActive[kind]=-1;
  if(!q){box.innerHTML='<div class="res-search-hint">Üretim yeri, depo kodu, depo tanımı, firma veya sözleşme adı yazın.</div>';box.hidden=false;input.setAttribute('aria-expanded','true');return}
  const matches=findDepotMatches(q,kind,12);box.innerHTML=matches.length?matches.map(depotOptionHtml).join(''):'<div class="res-search-empty">Aramaya uygun depo bulunamadı.</div>';
  box.querySelectorAll('.manual-depot-option').forEach(btn=>btn.onclick=e=>{e.preventDefault();e.stopPropagation();selectManualDepot(kind,btn.dataset.depotKey)});
  box.hidden=false;input.setAttribute('aria-expanded','true');
}
function setManualDepotActive(kind,index){
  const {box}=manualDepotEls(kind);if(!box||box.hidden)return;const opts=[...box.querySelectorAll('.manual-depot-option')];if(!opts.length)return;
  index=Math.max(0,Math.min(opts.length-1,index));state.ui.manualDepotSearchActive[kind]=index;opts.forEach((o,i)=>o.classList.toggle('active',i===index));opts[index].scrollIntoView({block:'nearest'});
}
function selectManualDepot(kind,depotKey){
  const {uy,dy}=splitDepotKey(depotKey),d=depotInfo(uy,dy),els=manualDepotEls(kind);
  if(kind==='source'){state.ui.manualSourceKey=depotKey;clearManualMaterialSelection({clearInput:true,clearQty:false})}else state.ui.manualTargetKey=depotKey;
  els.input.value=`${uy} / ${dy} — ${d.dyDesc||''}`;els.selected.className='manual-depot-selected ready';
  els.selected.textContent=[d.depotType,d.workType,d.companyName].filter(Boolean).join(' · ')||'Depo seçildi.';closeManualDepotSearch(kind);
  invalidateManualPrepared('Depo seçimi değişti; yapıştırılan listeyi Listeyi Hazırla ile yeniden hesaplayın.');
}
function bindManualDepotInput(kind){
  const {input,box}=manualDepotEls(kind);if(!input)return;
  input.onfocus=()=>renderManualDepotSearch(kind,input.value.includes('—')?'':input.value);
  input.oninput=()=>{if(kind==='source'){state.ui.manualSourceKey='';clearManualMaterialSelection({clearInput:true,clearQty:false})}else state.ui.manualTargetKey='';const els=manualDepotEls(kind);els.selected.className='manual-depot-selected muted';els.selected.textContent='Depo seçilmedi.';invalidateManualPrepared();renderManualDepotSearch(kind,input.value)};
  input.onkeydown=e=>{const opts=box?[...box.querySelectorAll('.manual-depot-option')]:[];if(e.key==='ArrowDown'&&!box.hidden&&opts.length){e.preventDefault();setManualDepotActive(kind,state.ui.manualDepotSearchActive[kind]<0?0:state.ui.manualDepotSearchActive[kind]+1)}else if(e.key==='ArrowUp'&&!box.hidden&&opts.length){e.preventDefault();setManualDepotActive(kind,state.ui.manualDepotSearchActive[kind]<=0?opts.length-1:state.ui.manualDepotSearchActive[kind]-1)}else if(e.key==='Enter'&&!box.hidden&&state.ui.manualDepotSearchActive[kind]>=0&&opts[state.ui.manualDepotSearchActive[kind]]){e.preventDefault();selectManualDepot(kind,opts[state.ui.manualDepotSearchActive[kind]].dataset.depotKey)}else if(e.key==='Escape')closeManualDepotSearch(kind)};
}
async function prepareManualList(){
  setContentLoading(true);
  try{
  const status=$('#manualPasteStatus');const parsed=buildParsedFromManualDraft();renderManualExcelPreview(parsed);const errors=[...parsed.errors];
  if(!state.ui.manualSourceKey)errors.unshift('Talep Edilen Depo seçilmelidir.');
  if(!state.ui.manualTargetKey)errors.unshift('Talep Eden Depo seçilmelidir.');
  if(state.ui.manualSourceKey&&state.ui.manualTargetKey&&state.ui.manualSourceKey===state.ui.manualTargetKey)errors.push('Talep edilen depo ile talep eden depo aynı olamaz.');
  const source=splitDepotKey(state.ui.manualSourceKey),target=splitDepotKey(state.ui.manualTargetKey);const prepared=[];
  for(const r of parsed.rows){const info=materialInfoForManual(r.materialCode,source.uy);if(!info){errors.push(`Satır ${r.sourceLine}: ${r.materialCode} malzeme kodu TANIMLAR / SITE_MALZEMELER / MB52 içinde bulunamadı.`);continue}prepared.push({...r,materialDesc:info.materialDesc||'Malzeme tanımı bulunamadı',uom:info.uom||''})}
  if(errors.length){state.ui.manualReady=false;state.ui.manualRows=[];state.ui.allocations={};state.ui.allocationRows={};hideWorkspaceForMode();if(status){status.className='manual-paste-status muted';status.textContent=''}toast(errors.map(x=>'• '+x).join('\n'),'warn',6500,'Liste hazırlanamadı');return}

  state.ui.manualRows=prepared;state.ui.manualReady=true;state.ui.allocations={};state.ui.allocationRows={};state.ui.selectedMaterial='';resetItemDecisions();
  try{if(target.dy)await ensureKesifContext(target.dy,prepared.map(r=>r.materialCode))}catch(e){console.error('Excel proje eşleştirme keşif bağlamı',e)}
  const ctx=computeManualContext();
  const projectResult=applyParsedProjectAllocations(parsed,ctx);
  if(ctx?.isTesis&&projectResult.unmatched.length){
    state.ui.manualReady=false;state.ui.allocations={};state.ui.allocationRows={};hideWorkspaceForMode();
    if(status){status.className='manual-paste-status muted';status.textContent=''}toast(projectResult.unmatched.map(x=>'• '+x).join('\n'),'warn',7000,'Proje başlıkları eşleştirilemedi')
    return;
  }
  const duplicateCount=prepared.length-new Set(prepared.map(r=>r.materialCode)).size;
  const projectCount=parsed.projectHeaders?.length||0;
  if(status){status.className='manual-paste-status ok';status.textContent=`${prepared.length} satır hazır · ${new Set(prepared.map(r=>r.materialCode)).size} farklı malzeme${projectCount?` · ${projectCount} proje sütunu aktarıldı`:''}${duplicateCount?` · ${duplicateCount} tekrar satırı hesapta aynı malzemeyle toplanacak`:''}.`}
  await renderManualWorkspace();
  } finally { setContentLoading(false); }
}
function clearManual(){
  state.ui.manualSourceKey='';state.ui.manualTargetKey='';state.ui.manualRows=[];state.ui.manualReady=false;state.ui.allocations={};state.ui.allocationRows={};resetItemDecisions();closeManualDepotSearch();closeManualMaterialSearch();closeDecisionModal();hideManualContextMenu();
  state.ui.manualMaterialCode='';state.ui.manualMaterialSearchActive=-1;state.ui.manualDraftRows=[];state.ui.manualDraftProjectHeaders=[];state.ui.manualDraftSelection=[];state.ui.manualActiveRow=-1;state.ui.manualRowClipboard=null;
  for(const id of ['manualSourceDepotLookup','manualTargetDepotLookup','manualPasteArea','manualMaterialLookup','manualMaterialQty','manualReservationNo'])if($('#'+id))$('#'+id).value='';
  $('#manualReservationNo')?.removeAttribute('aria-invalid');
  if($('#manualMaterialSelected')){$('#manualMaterialSelected').className='manual-material-selected muted';$('#manualMaterialSelected').textContent='Malzeme seçilmedi.'}
  for(const id of ['manualSourceDepotSelected','manualTargetDepotSelected'])if($('#'+id)){ $('#'+id).className='manual-depot-selected muted';$('#'+id).textContent='Depo seçilmedi.'}
  const status=$('#manualPasteStatus');if(status){status.className='manual-paste-status muted';status.textContent=''}hideWorkspaceForMode();renderManualExcelPreview(parseManualPaste(''));
}
function setControlMode(mode){
  if(!['reservation','manual'].includes(mode))mode='reservation';state.ui.mode=mode;closeReservationSearch();closeManualDepotSearch();closeManualMaterialSearch();closeDecisionModal();
  $('#reservationModePanel').hidden=mode!=='reservation';$('#manualModePanel').hidden=mode!=='manual';
  $$('.control-mode-btn').forEach(b=>{const active=b.dataset.controlMode===mode;b.classList.toggle('active',active);b.setAttribute('aria-selected',active?'true':'false')});
  if(mode==='reservation'){
    if($('#emptyStateTitle'))$('#emptyStateTitle').textContent='Rezervasyon numarasıyla başlayın';
    if($('#emptyStateText'))$('#emptyStateText').textContent="Uygulama onay işlemi yapmaz. SAP'de karar vermeden önce gerekli kontrolleri tek ekranda sunar.";
    if(state.ui.reservationNo)renderReservation(state.ui.reservationNo);else hideWorkspaceForMode();
  }else{
    if($('#emptyStateTitle'))$('#emptyStateTitle').textContent='Depoları seçin ve malzeme listesini oluşturun';
    if($('#emptyStateText'))$('#emptyStateText').textContent='Malzemeleri kod/tanım combobox’ından seçerek veya Excel’den kopyalayarak oluşturun; seçtiğiniz kaynak/hedef depolara göre teminat ve keşif açısından kontrol edin.';
    if(state.ui.manualReady)renderManualWorkspace();else hideWorkspaceForMode();
  }
}

function reservationStatusClass(status){
  const n=norm(status);
  if(n.includes('silin'))return'deleted';
  if(n.includes('kapali'))return'closed';
  return'open';
}
function reservationApprovalClass(status){
  const n=norm(status);
  return n.includes('onayli')&&!n.includes('onaysiz')?'approved':'pending';
}
function reservationSearchRank(item,q){
  const no=normalizeSearchText(item.reservationNo),dy=normalizeSearchText(item.recvDY),uy=normalizeSearchText(item.recvUY);
  const desc=normalizeSearchText(item.depotDesc),company=normalizeSearchText(item.companyName),contract=normalizeSearchText(item.contractName);
  if(no===q)return 0;
  if(no.startsWith(q))return 1;
  if(no.includes(q))return 2;
  if(dy===q||uy===q)return 3;
  if(dy.startsWith(q)||uy.startsWith(q))return 4;
  if(desc.startsWith(q)||company.startsWith(q)||contract.startsWith(q))return 5;
  return 6;
}
function findReservationMatches(query,limit=80){
  const q=normalizeSearchText(query).trim();
  return (state.ix.reservationSearch||[])
    .filter(item=>!q||item.searchText.includes(q))
    .sort((a,b)=>{
      const ar=reservationSearchRank(a,q),br=reservationSearchRank(b,q);
      if(ar!==br)return ar-br;
      const aPriority=(norm(a.status)==='acik'&&reservationApprovalClass(a.approvalStatus)==='pending')?0:1;
      const bPriority=(norm(b.status)==='acik'&&reservationApprovalClass(b.approvalStatus)==='pending')?0:1;
      if(aPriority!==bPriority)return aPriority-bPriority;
      return Number(b.reservationNo)-Number(a.reservationNo);
    }).slice(0,limit);
}
function reservationSearchOptionHtml(item,index){
  const status=item.status||'Durum yok',approval=item.approvalStatus||'Onaysız';
  return `<button type="button" class="reservation-search-option" role="option" data-reservation-no="${esc(item.reservationNo)}" data-index="${index}">
    <div class="res-search-top">
      <strong class="res-search-no">${esc(item.reservationNo)}</strong>
      <span class="res-search-badges">
        <span class="res-search-badge ${reservationStatusClass(status)}">${esc(status)}</span>
        <span class="res-search-badge ${reservationApprovalClass(approval)}">${esc(approval)}</span>
      </span>
    </div>
    <div class="res-search-depot">
      <span class="label">Teslim Alan</span>
      <strong>${esc(item.recvUY||'-')} / ${esc(item.recvDY||'-')}</strong>
      <span>${esc(item.depotDesc||item.recvUYDesc||'Depo tanımı bulunamadı')}</span>
    </div>
    <div class="res-search-company">${esc(item.companyName||'Yüklenici / firma tanımı bulunamadı')}</div>
    ${item.contractName?`<div class="res-search-contract">${esc(item.contractName)}</div>`:''}
  </button>`;
}
function closeReservationSearch(){
  const box=$('#reservationSearchResults'),input=$('#reservationLookup');
  state.ui.reservationSearchActive=-1;
  if(box){box.hidden=true;box.innerHTML=''}
  if(input)input.setAttribute('aria-expanded','false');
}
function setReservationSearchActive(index){
  const box=$('#reservationSearchResults');if(!box||box.hidden)return;
  const opts=$$('.reservation-search-option');
  if(!opts.length){state.ui.reservationSearchActive=-1;return}
  index=Math.max(0,Math.min(opts.length-1,index));
  state.ui.reservationSearchActive=index;
  opts.forEach((o,i)=>o.classList.toggle('active',i===index));
  opts[index].scrollIntoView({block:'nearest'});
}
function renderReservationSearch(query){
  const box=$('#reservationSearchResults'),input=$('#reservationLookup');if(!box||!input)return;
  const q=String(query||'').trim();
  state.ui.reservationSearchActive=-1;
  const matches=findReservationMatches(q,80);
  if(!matches.length){
    box.innerHTML='<div class="res-search-empty">Aramaya uygun rezervasyon bulunamadı.</div>';
  }else{
    const total=(state.ix.reservationSearch||[]).filter(item=>!q||item.searchText.includes(normalizeSearchText(q).trim())).length;
    box.innerHTML=`<div class="res-search-counter">${total} eşleşme · ilk ${matches.length} kayıt gösteriliyor · yazarak daraltın</div>`+matches.map(reservationSearchOptionHtml).join('');
    box.querySelectorAll('.reservation-search-option').forEach(btn=>btn.onclick=e=>{
      e.preventDefault();e.stopPropagation();openReservationByNo(btn.dataset.reservationNo);
    });
  }
  box.hidden=false;input.setAttribute('aria-expanded','true');
}
function openReservationByNo(no){
  no=String(no||'').trim();
  if(!no)return toast('Rezervasyon numarası girin.');
  if(!(state.data.zmm||[]).some(r=>r.reservationNo===no))return toast('Rezervasyon ZMM048 içinde bulunamadı.');
  closeReservationSearch();
  state.ui.allocations={};state.ui.allocationRows={};state.ui.selectedMaterial='';resetItemDecisions();
  renderReservation(no);
}
function clearReservation(){
  state.ui.reservationNo='';state.ui.selectedMaterial='';state.ui.allocations={};state.ui.allocationRows={};resetItemDecisions();state.ui.reservationRecordHistory=null;state.ui.repeatControlAllowed=false;
  closeReservationSearch();closeDecisionModal();
  const input=$('#reservationLookup');if(input)input.value='';
  $('#reservationWorkspace').hidden=true;$('#noReservationPlaceholder').hidden=false;$('#runCheckBtn').disabled=true;
  const sum=$('#reservationSummary');if(sum){sum.className='reservation-summary muted';sum.textContent="Rezervasyon numarası girildiğinde ZMM048'deki satırlar, depo tanımları ve kontrol verileri getirilecektir."}
}
function lookupReservation(){
  const raw=$('#reservationLookup').value.trim();if(!raw)return toast('Rezervasyon numarası girin veya arama listesinden seçim yapın.');
  const exact=(state.ix.reservationSearch||[]).find(x=>x.reservationNo===raw);
  if(exact)return openReservationByNo(exact.reservationNo);
  const matches=findReservationMatches(raw,12);
  if(matches.length===1)return openReservationByNo(matches[0].reservationNo);
  renderReservationSearch(raw);
  toast(matches.length?'Birden fazla eşleşme bulundu; listeden rezervasyonu seçin.':'Rezervasyon bulunamadı.');
}


const KESIF_MANAGE_DEFS=[
  {sheet:'Tesis_Verileri',code:'T',label:'TESİS',countId:'#kesifTabCountT'},
  {sheet:'KET_Verileri',code:'K',label:'KET&YB',countId:'#kesifTabCountK'},
  {sheet:'BAKIM_Verileri',code:'B',label:'BAKIM',countId:'#kesifTabCountB'},
  {sheet:'LED_Verileri',code:'L',label:'LED',countId:'#kesifTabCountL'}
];
const kesifManage={sheet:'Tesis_Verileri',page:1,pageSize:100,rows:[],filtered:[],searchTimer:null,stats:null,cache:{}};
function kesifManageDef(){return KESIF_MANAGE_DEFS.find(x=>x.sheet===kesifManage.sheet)||KESIF_MANAGE_DEFS[0]}
function resetKesifManagementCache(){kesifManage.cache={};kesifManage._tabCounts=null;kesifManage.rows=[];kesifManage.filtered=[];kesifManage.stats=null;kesifManage.page=1}
function getKesifBuilt(def,force=false){if(force||!kesifManage.cache[def.sheet])kesifManage.cache[def.sheet]=buildKesifManagement(def);return kesifManage.cache[def.sheet]}
function kesifManageRawObjects(def){const rows=(state.data.kesif||[]).filter(x=>workCode(x.workType)===def.code);return{actual:uniq(rows.map(x=>x.sheet)).join(', ')||def.sheet,rows}}
function kesifIssueTags(row){
  const tags=[];
  if(row.mismatch)tags.push({t:'Hesap Tutarsız',c:'bad'});
  if(row.remaining<0)tags.push({t:'Negatif Kalan',c:'bad'});
  if(row.duplicate)tags.push({t:row.code==='T'?'Mükerrer':'Mükerrer • Son Kayıt',c:'warn'});
  if(row.unknownMaterial)tags.push({t:'Tanımsız Malzeme',c:'warn'});
  if(row.unknownDepot)tags.push({t:'Tanımsız Depo',c:'warn'});
  if(!tags.length)tags.push(row.remaining===0?{t:'Sıfır Kalan',c:'zero'}:{t:'Uygun',c:'good'});
  return tags;
}
function buildKesifManagement(def){
  const source=kesifManageRawObjects(def),objects=source.rows,base=[],counts=new Map(),projectSet=new Set(),knownDepotCodes=new Set((state.data.depots||[]).map(d=>String(d.dy||'').trim()).filter(Boolean));
  for(let i=0;i<objects.length;i++){
    const r=objects[i]||{},dy=String(r.dy||'').trim(),project=String(r.projectName||'').trim(),mat=String(r.materialCode||'').trim();
    if(project)projectSet.add(key(dy,norm(project)));if(!mat)continue;
    const planned=num(r.planned),given=num(r.given),remaining=num(r.remaining),dupKey=def.code==='T'?key(dy,norm(project),mat):key(dy,mat);counts.set(dupKey,(counts.get(dupKey)||0)+1);
    const material=state.ix.materialCatalog?.get(mat)||{},unknownDepot=!!dy&&!knownDepotCodes.has(dy),unknownMaterial=!!mat&&!state.ix.materialCatalog?.has(mat);
    base.push({rowNo:r.sourceRow||i+2,code:def.code,sheet:def.sheet,actualSheet:r.sheet||source.actual,dy,groupNo:String(r.groupNo||'').trim(),groupDesc:String(r.groupDesc||'').trim(),contractor:String(r.contractor||'').trim(),project,materialCode:mat,materialDesc:String(material.materialDesc||''),uom:String(material.uom||''),planned,given,remaining,mismatch:Math.abs((planned-given)-remaining)>0.001,unknownDepot,unknownMaterial,dupKey});
  }
  for(const row of base){row.duplicate=(counts.get(row.dupKey)||0)>1;row.issue=row.mismatch||row.remaining<0||row.duplicate||row.unknownDepot||row.unknownMaterial;row.searchText=normalizeSearchText([row.dy,row.groupNo,row.groupDesc,row.contractor,row.project,row.materialCode,row.materialDesc].join(' '));}
  const stats={rows:base.length,projects:projectSet.size,positive:base.filter(x=>x.remaining>0).length,zero:base.filter(x=>x.remaining===0).length,negative:base.filter(x=>x.remaining<0).length,mismatch:base.filter(x=>x.mismatch).length,duplicateRows:base.filter(x=>x.duplicate).length,duplicateKeys:[...counts.values()].filter(v=>v>1).length,unknown:base.filter(x=>x.unknownDepot||x.unknownMaterial).length,issues:base.filter(x=>x.issue).length,actualSheet:uniq(base.map(x=>x.actualSheet)).join(', ')||source.actual};
  return{rows:base,stats};
}
function kesifFilterMatches(row){
  const q=normalizeSearchText($('#kesifSearch')?.value||'').trim(),depot=$('#kesifDepotFilter')?.value||'',st=$('#kesifStatusFilter')?.value||'';
  if(q&&!row.searchText.includes(q))return false;if(depot&&row.dy!==depot)return false;
  if(st==='issues'&&!row.issue)return false;if(st==='negative'&&!(row.remaining<0))return false;if(st==='mismatch'&&!row.mismatch)return false;if(st==='duplicate'&&!row.duplicate)return false;if(st==='unknown'&&!(row.unknownDepot||row.unknownMaterial))return false;if(st==='positive'&&!(row.remaining>0))return false;if(st==='zero'&&row.remaining!==0)return false;return true;
}
function updateKesifSourceInfo(stats){
  const el=$('#kesifSourceInfo'),f=state.files.KESIFLER||{};if(!el)return;const names=(f.files||[]).map(x=>x.name).join(' • ')||f.name||'CSV';
  el.innerHTML=`<span class="kesif-source-chip"><strong>${esc(names)}</strong></span><span>Değişim: <strong>${esc(f.modifiedIso||'—')}</strong></span><span>Aktif veri: <strong>${esc(stats.actualSheet||kesifManage.sheet)}</strong></span><span class="kesif-source-chip">Dosya adından bağımsız • içerikten tanındı</span>`;
}
function populateKesifDepotFilter(rows){const sel=$('#kesifDepotFilter');if(!sel)return;const keep=sel.value;const deps=uniq(rows.map(x=>x.dy)).sort((a,b)=>a.localeCompare(b,'tr',{numeric:true}));sel.innerHTML='<option value="">Tüm Depolar</option>'+deps.map(d=>`<option value="${esc(d)}">${esc(d)}</option>`).join('');if(deps.includes(keep))sel.value=keep}
async function fetchFastGrid(view,params={}){
  const qs=new URLSearchParams({view,...Object.fromEntries(Object.entries(params).map(([k,v])=>[k,String(v??'')]))});
  return await fetchApiJson('/api/grid?'+qs.toString(),{},120000);
}
async function ensureKesifTabCounts(force=false){
  if(kesifManage._tabCounts&&!force)return;
  try{
    const results=await Promise.all(KESIF_MANAGE_DEFS.map(d=>fetchFastGrid('kesif',{type:d.code,page:1,pageSize:25})));
    kesifManage._tabCounts={};
    results.forEach((r,i)=>{kesifManage._tabCounts[KESIF_MANAGE_DEFS[i].code]=Number(r.stats?.rows||0)});
    KESIF_MANAGE_DEFS.forEach(d=>{const el=$(d.countId);if(el)el.textContent=dashInt(kesifManage._tabCounts[d.code]||0)});
  }catch(_){/* ekranın kendisi yine açılır */}
}
async function renderKesifManagementView(rebuild=false){
  const def=kesifManageDef(),body=$('#kesifTableBody');
  const append=!!kesifManage.qAppend&&kesifManage.page>1;
  if(body&&!append)body.innerHTML='<tr><td colspan="11" class="dashboard-no-data">Keşif verisi hazırlanıyor…</td></tr>';
  kesifManage.qLoading=true;
  try{
    if(rebuild)await ensureKesifTabCounts(true);else ensureKesifTabCounts(false);
    const size=Number($('#kesifPageSize')?.value||kesifManage.pageSize)||100;kesifManage.pageSize=size;
    const data=await fetchFastGrid('kesif',{type:def.code,q:$('#kesifSearch')?.value||'',depot:$('#kesifDepotFilter')?.value||'',status:$('#kesifStatusFilter')?.value||'',page:kesifManage.page,pageSize:size,...(window.FIX28QGridFilterQuery?.('kesif')||{})});
    kesifManage.page=Number(data.page||1);kesifManage.rows=append?[...(kesifManage.rows||[]),...(data.rows||[])]:[...(data.rows||[])];kesifManage.filtered=kesifManage.rows;kesifManage.stats=data.stats||{};
    const stats=kesifManage.stats;stats.actualSheet=def.sheet;updateKesifSourceInfo(stats);
    if(rebuild||!$('#kesifDepotFilter')?.options?.length||$('#kesifDepotFilter').options.length<=1){
      const sel=$('#kesifDepotFilter'),keep=sel?.value||'';if(sel){const deps=data.depots||[];sel.innerHTML='<option value="">Tüm Depolar</option>'+deps.map(d=>`<option value="${esc(d)}">${esc(d)}</option>`).join('');if(deps.includes(keep))sel.value=keep}
    }
    $('#kesifKpiRows').textContent=dashInt(stats.rows||0);$('#kesifKpiProjects').textContent=def.code==='T'?`${dashInt(stats.projects||0)} proje`:`${dashInt(stats.depots||0)} depo`;$('#kesifKpiPositive').textContent=dashInt(stats.positive||0);$('#kesifKpiZero').textContent=dashInt(stats.zero||0);$('#kesifKpiNegative').textContent=dashInt(stats.negative||0);$('#kesifKpiIssues').textContent=dashInt(stats.issues||0);$('#kesifKpiIssueDetail').textContent=`${dashInt(stats.mismatch||0)} tutarsız • ${dashInt(stats.duplicateKeys||0)} mükerrer anahtar`;
    const shown=kesifManage.rows||[];
    if(body){const html=(append?(data.rows||[]):shown).map((r,index)=>{const tags=kesifIssueTags({...r,code:def.code});return`<tr class="${r.issue?'kesif-row-bad':''}"><td class="q28-row-number">${(append?(kesifManage.page-1)*size:0)+index+1}</td><td>${dashInt(r.rowNo)}</td><td><span class="kesif-code">${esc(r.dy)}</span></td><td class="kesif-muted-cell" title="${esc(r.groupDesc)}">${esc(r.groupNo||'—')}</td><td class="kesif-muted-cell" title="${esc(r.contractor)}">${esc(r.contractor||'—')}</td><td class="kesif-project-cell" title="${esc(r.project)}">${esc(r.project||'—')}</td><td><span class="kesif-code">${esc(r.materialCode)}</span></td><td class="kesif-muted-cell" title="${esc(r.materialDesc)}">${esc(r.materialDesc||'—')}</td><td class="num">${fmtNum(r.planned)}</td><td class="num">${fmtNum(r.given)}</td><td class="num"><strong>${fmtNum(r.remaining)}</strong></td><td><div class="kesif-status-list">${tags.map(x=>`<span class="kesif-status ${x.c}">${esc(x.t)}</span>`).join('')}</div></td></tr>`}).join('');if(append)body.insertAdjacentHTML('beforeend',html);else body.innerHTML=html||'<tr><td colspan="12" class="dashboard-no-data">Filtreye uygun keşif kaydı bulunamadı.</td></tr>';
    }
    const pages=Number(data.pages||1),total=Number(data.total||0),start=total?(kesifManage.page-1)*size+1:0,end=Math.min(kesifManage.page*size,total);
    $('#kesifFilteredCount').textContent=dashInt(total);$('#kesifPageInfo').textContent=`• ${dashInt(kesifManage.rows.length)} / ${dashInt(total)} kayıt · ${kesifManage.page<pages?'Aşağı kaydırdıkça yüklenir':'Tümü yüklendi'}`;$('#kesifPrevBtn').disabled=kesifManage.page<=1;$('#kesifNextBtn').disabled=kesifManage.page>=pages;
    const sum=$('#kesifControlSummary');sum.innerHTML=`<span class="kesif-summary-pill good">${dashInt(stats.positive||0)} pozitif kalan</span><span class="kesif-summary-pill">${dashInt(stats.zero||0)} sıfır kalan</span><span class="kesif-summary-pill bad">${dashInt(stats.negative||0)} negatif</span><span class="kesif-summary-pill bad">${dashInt(stats.mismatch||0)} hesap tutarsız</span><span class="kesif-summary-pill warn">${dashInt(stats.duplicateKeys||0)} mükerrer anahtar</span>`;
  }catch(e){if(!append&&body)body.innerHTML=`<tr><td colspan="12" class="dashboard-no-data">Keşif verisi yüklenemedi: ${esc(e.message)}</td></tr>`;if(append)kesifManage.page=Math.max(1,kesifManage.page-1);toast('Keşif ekranı: '+e.message)}finally{kesifManage.qLoading=false;kesifManage.qAppend=false}
}
function loadKesifView(){kesifManage.qAppend=false;kesifManage.page=1;renderKesifManagementView(true)}
function setKesifSheet(sheet){kesifManage.sheet=sheet;kesifManage.rows=[];kesifManage.filtered=[];kesifManage.stats=null;kesifManage.page=1;$$('.kesif-tab').forEach(b=>b.classList.toggle('active',b.dataset.kesifSheet===sheet));if($('#kesifSearch'))$('#kesifSearch').value='';if($('#kesifStatusFilter'))$('#kesifStatusFilter').value='';renderKesifManagementView(true)}
function scheduleKesifRender(){clearTimeout(kesifManage.searchTimer);kesifManage.searchTimer=setTimeout(()=>{kesifManage.page=1;renderKesifManagementView(false)},140)}
async function exportKesifFilteredCsv(){
 const def=kesifManageDef(),size=500,base={type:def.code,q:$('#kesifSearch')?.value||'',depot:$('#kesifDepotFilter')?.value||'',status:$('#kesifStatusFilter')?.value||'',...(window.FIX28QGridFilterQuery?.('kesif')||{})};
 try{
  const first=await fetchFastGrid('kesif',{...base,page:1,pageSize:size}),total=Number(first.total||0);if(!total){toast('Aktarılacak keşif kaydı yok.');return}
  if(total>50000)throw Error('50.000 satırın üzerindeki çıktılarda depo veya sütun filtresi ekleyin; eksik rapor üretilmez.');
  const rows=[...(first.rows||[])],pages=Number(first.pages||1);
  for(let i=2;i<=pages;i++){const part=await fetchFastGrid('kesif',{...base,page:i,pageSize:size});rows.push(...(part.rows||[]))}
  if(rows.length!==total)throw Error('Veri yenilendi veya rapor bütünlüğü bozuldu; tekrar deneyin.');
  const head=['İş Türü','Kaynak Sayfa','CSV Satırı','Depo Kodu','Grup No','Grup Tanımı','Yüklenici','Proje','Malzeme Kodu','Malzeme Tanımı','Birim','Teslim Edilen','Verilen Malzeme Toplamı','Teslim Edilen - Verilen Fark','Hesap Tutarsız','Mükerrer'];
  const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';const lines=[head.map(q).join(';'),...rows.map(r=>[def.label,r.sheet,r.rowNo,r.dy,r.groupNo,r.groupDesc,r.contractor,r.project,r.materialCode,r.materialDesc,r.uom,r.planned,r.given,r.remaining,r.mismatch?'EVET':'HAYIR',r.duplicate?'EVET':'HAYIR'].map(q).join(';'))];
  const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`KESIF_KONTROL_${def.code}_${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(`${rows.length} filtreli keşif kaydı CSV olarak aktarıldı.`)
 }catch(e){toast('Keşif CSV aktarım hatası: '+e.message)}
}
async function refreshKesifManagement(){const b=$('#kesifRefreshBtn');if(b){b.disabled=true;b.textContent='Yenileniyor…'}showRefreshOverlay();setContentLoading(true);try{await loadSources({silent:true,forceScan:true});renderKesifManagementView(true);toast('Keşif verileri yenilendi.')}catch(e){toast('Keşif yenileme hatası: '+e.message)}finally{hideRefreshOverlay();setContentLoading(false);if(b){b.disabled=false;b.textContent='Keşif Verisini Yenile'}}}


function pickAny(row,names){const want=names.map(norm);for(const [k,v] of Object.entries(row||{}))if(want.includes(norm(k)))return v;return ''}
function sourceFileNames(src){const f=state.files[src]||{};return (f.files||[]).map(x=>x.name).join(' • ')||f.name||'Kaynak bulunamadı'}
function filterText(parts,q){return !q||normalizeSearchText(parts.join(' ')).includes(normalizeSearchText(q).trim())}
const sourceGridState={guarantee:{page:1,pageSize:100},movements:{page:1,pageSize:100},stocks:{page:1,pageSize:100}};
const q28SourceMap={guarantee:'guarantee',stocks:'stocks',movements:'movements'};
const q28SourceFns={guarantee:()=>renderGuaranteeView(),stocks:()=>renderStocksView(),movements:()=>renderMovementsView(false)};
function q28LocalDate(v){const s=String(v??'');const m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);return m?`${m[3]}.${m[2]}.${m[1]}`:s}
function sourcePagerText(data,loaded){return `${dashInt(loaded)} / ${dashInt(data.total||0)} kayıt • ${(data.page||1)<(data.pages||1)?'Aşağı kaydırdıkça devam eder':'Tümü yüklendi'}`}
function updateSourcePager(name,data){
 const st=sourceGridState[name];st.page=Number(data.page||1);st.total=Number(data.total||0);st.pages=Number(data.pages||1);
 const count=$('#'+name+'Count');if(count)count.textContent=sourcePagerText(data,st.loaded||0);
}
function q28SourceReset(name){const st=sourceGridState[name];st.page=1;st.append=false;st.loaded=0;st.pages=1;st.total=0;return q28SourceFns[name]?.()}
window.FIX28QGridReload=(name)=>{if(name==='kesif'){kesifManage.page=1;kesifManage.qAppend=false;return renderKesifManagementView(false)}if(q28SourceFns[name])return q28SourceReset(name)};
async function q28RenderSource(name,force=false){
 const st=sourceGridState[name],body=$('#'+name+'TableBody'),append=!!st.append&&st.page>1;
 if(st.loading)return;st.loading=true;
 if(body&&!append)body.innerHTML='<tr><td class="dashboard-no-data">Veriler yükleniyor…</td></tr>';
 try{
  const params={q:$('#'+name+'Search')?.value||'',page:st.page,pageSize:st.pageSize,...(window.FIX28QGridFilterQuery?.(name)||{})};
  if(name==='stocks'){params.scope=$('#stocksScope')?.value||state.ui.stocksScope||'mb51_group';state.ui.stocksScope=params.scope}
  const data=await fetchFastGrid(name,params),rows=data.rows||[],off=(st.page-1)*st.pageSize;
  const render=(r,i)=>{
   const no=`<td class="q28-source-row-no">${off+i+1}</td>`;
   if(name==='guarantee')return `<tr>${no}<td>${esc(r.uy)}</td><td>${esc(r.dy)}</td><td>${esc(r.dyDesc||'—')}</td><td class="num">${fmtMoney(r.main)}</td><td class="num">${fmtMoney(r.cash)}</td><td class="num">${fmtMoney(r.manual)}</td><td class="num"><strong>${fmtMoney(num(r.main)+num(r.cash)+num(r.manual))}</strong></td><td class="num">${r.available!=null?fmtMoney(r.available):'—'}</td></tr>`;
   if(name==='stocks')return `<tr>${no}<td>${esc(r.plant)}</td><td>${esc(r.dy)}</td><td>${esc(r.dyDesc||'—')}</td><td><strong>${esc(r.displayMaterialGroup||'—')}</strong></td><td>${esc(r.displayMaterialGroupDesc||'—')}</td><td><strong>${esc(r.materialCode)}</strong></td><td>${esc(r.materialDesc||'—')}</td><td class="num">${fmtNum(r.qty)}</td><td>${esc(r.uom||'')}</td><td class="num">${fmtMoney(r.totalValue)}</td><td>${esc(r.valuationType||'—')}</td></tr>`;
   return `<tr>${no}<td>${esc(r.doc||'—')}</td><td>${esc(q28LocalDate(r.date)||'—')}</td><td>${esc(r.movement||'—')}</td><td><strong>${esc(r.materialCode||'—')}</strong></td><td>${esc(r.materialDesc||'—')}</td><td class="num">${fmtNum(r.qty)}</td><td>${esc(r.uom||'')}</td><td>${esc(r.plant||'—')}</td><td>${esc(r.dy||'—')}</td><td>${esc(r.reservation||'—')}</td></tr>`;
  };
  if(body){const html=rows.map(render).join('');if(append){body.insertAdjacentHTML('beforeend',html)}else{body.innerHTML=html||'<tr><td class="dashboard-no-data">Filtreye uygun kayıt bulunamadı.</td></tr>'}}
  st.loaded=append?(st.loaded||0)+rows.length:rows.length;updateSourcePager(name,data);
  const info=$('#'+name+'SourceInfo');if(info&&name==='stocks')info.innerHTML=`<strong>Güncel stok kaynağı</strong><span>${esc(data.scopeLabel||'')}</span>`;
  if(info&&name==='movements')info.innerHTML='<strong>Stok hareketleri</strong><span>MB51 • tüm veri üzerinde filtrelenen kayıtlar</span>';
  if(info&&name==='guarantee')info.innerHTML=`<strong>${esc(sourceFileNames('ZMM098'))}</strong><span>Filtrelenen teminat kayıtları</span>`;
 }catch(e){if(!append&&body)body.innerHTML=`<tr><td class="dashboard-no-data">Veri yüklenemedi: ${esc(e.message)}</td></tr>`;if(append)st.page=Math.max(1,st.page-1)}
 finally{st.loading=false;st.append=false}
}
async function renderGuaranteeView(){return q28RenderSource('guarantee')}
async function renderStocksView(){return q28RenderSource('stocks')}
async function renderMovementsView(force=false){return q28RenderSource('movements',force)}
function initSourceTableViews(){
 for(const name of ['guarantee','stocks','movements']){
  let timer;const srch=$('#'+name+'Search');if(srch)srch.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>q28SourceReset(name),220)});
  const wrap=$('#'+name+'TableBody')?.closest('.source-table-wrap');if(wrap)wrap.addEventListener('scroll',()=>{
   const st=sourceGridState[name];if(st.loading||st.page>=(st.pages||1))return;
   if(wrap.scrollTop+wrap.clientHeight>=wrap.scrollHeight-180){st.page++;st.append=true;q28RenderSource(name)}
  });
  const old=$('#'+name+'PrevBtn')?.closest('.source-grid-pager');if(old)old.classList.add('q28-auto-pager-hidden');
  const header=wrap?.querySelector('thead tr');if(header){const th=document.createElement('th');th.textContent='No';th.className='q28-source-no-header';header.insertBefore(th,header.firstChild)}
  $('#'+name+'RefreshBtn')?.addEventListener('click',async()=>{await loadSources({silent:true,forceScan:true});q28SourceReset(name)});
 }
 $('#stocksScope')?.addEventListener('change',()=>q28SourceReset('stocks'));
 window.FIX28QBindGridFilters?.();
}


// FIX26 — TESIS reservation and MB51 history, all read-only.
const tesisHistoryState={page:1,pages:1,items:[],detail:null,tab:'movements',selected:''};
function showTesisHistory(q=''){
  const nav=document.querySelector('.nav-item[data-view="tesisHistory"]');if(nav)nav.click();
  const input=$('#tesisHistorySearch');if(input&&q){input.value=String(q).trim();loadTesisHistory(true)}
}
function hist26Status(code){const styles={MUTABIK:'history26-good',FIILI_MIKTAR_FARKI:'history26-bad',MB51_BEKLENIYOR:'history26-neutral'};const labels={MUTABIK:'Mutabık',FIILI_MIKTAR_FARKI:'Fiili miktar farkı',MB51_BEKLENIYOR:'MB51 bekleniyor'};return `<span class="${styles[code]||'history26-neutral'}">${dashEsc(labels[code]||code||'—')}</span>`}
async function loadTesisHistory(reset=false){
  if(reset)tesisHistoryState.page=1;
  const body=$('#tesisHistoryBody'),note=$('#tesisHistoryCount'),alert=$('#tesisHistoryAlert');if(!body)return;
  if(alert)alert.hidden=true;body.innerHTML='<tr><td colspan="10">Geçmiş kayıtlar yükleniyor…</td></tr>';
  const p=new URLSearchParams({page:String(tesisHistoryState.page),q:$('#tesisHistorySearch')?.value||'',status:$('#tesisHistoryStatus')?.value||'',depot:$('#tesisHistoryDepot')?.value||'',ts:String(Date.now())});
  try{
    const data=await fetchApiJson('/api/tesis-control-history?'+p.toString(),{},60000);
    const arr=Array.isArray(data.items)?data.items:[];tesisHistoryState.items=arr;tesisHistoryState.pages=Number(data.pages||1);tesisHistoryState.page=Number(data.page||1);
    const m=data.summary||{};
    if($('#tesisHistoryMetrics'))$('#tesisHistoryMetrics').innerHTML=[['Kayıt',data.total||0],['Mutabık',m.matched||0],['Miktar Farkı',m.different||0],['MB51 Bekleyen',m.mb51Waiting||0]].map(x=>`<div class="history26-metric"><span>${dashEsc(x[0])}</span><strong>${dashInt(x[1])}</strong></div>`).join('');
    if(note)note.textContent=`${dashInt(data.total||0)} kayıt • Kayıtlar kontrol sürümü bazında görüntülenir.`;
    const pg=$('#tesisHistoryPage');if(pg)pg.textContent=`${tesisHistoryState.page} / ${tesisHistoryState.pages}`;
    if($('#tesisHistoryPrev'))$('#tesisHistoryPrev').disabled=tesisHistoryState.page<=1;
    if($('#tesisHistoryNext'))$('#tesisHistoryNext').disabled=tesisHistoryState.page>=tesisHistoryState.pages;
    body.innerHTML=arr.length?arr.map((r,i)=>`<tr class="${tesisHistoryState.selected===r.controlId+'|'+r.materialCode?'history26-row-active':''}">
      <td>${dashEsc(r.controlTime||'—')}</td><td><strong>${dashEsc(r.reservationNo||'—')}</strong><small>${dashEsc(r.controlId||'')}</small></td>
      <td><strong>${dashEsc(r.materialCode||'—')}</strong><small>${dashEsc(r.materialDesc||'')}</small></td><td>${dashEsc(r.depot||'—')}</td>
      <td>${dashEsc(r.appResult||'—')}<small>Kalem: ${dashEsc(r.itemDecision||'KARAR BEKLİYOR')}</small></td>
      <td>${dashEsc(r.reservationSource==='ZMM048_KAYDI_VAR'?'ZMM048 kaydı var':'ZMM048 kaydı yok')}<small>Kesinleşme doğrulanmadı</small></td>
      <td class="num">${workOpsNum(r.approvedQty)} ${dashEsc(r.unit||'')}</td><td class="num">${workOpsNum(r.mb51Qty)} ${dashEsc(r.unit||'')}</td>
      <td>${hist26Status(r.mb51Status)}</td><td><button type="button" class="btn btn-ghost history26-detail-btn" data-i="${i}">İncele</button></td></tr>`).join(''):'<tr><td colspan="10" class="dashboard-no-data">Seçilen filtrelerde TESİS kontrol kaydı bulunamadı.</td></tr>';
    body.querySelectorAll('.history26-detail-btn').forEach(b=>b.onclick=()=>loadTesisHistoryDetail(arr[Number(b.dataset.i)]));
  }catch(e){body.innerHTML='<tr><td colspan="10">Veri yüklenemedi.</td></tr>';if(alert){alert.textContent='TESİS geçmişi okunamadı: '+e.message;alert.hidden=false;} }
}
async function loadTesisHistoryDetail(row){if(!row)return;const box=$('#tesisHistoryDetailPanel');if(box)box.hidden=false;
  const p=new URLSearchParams({detail:'1',controlId:row.controlId,reservationNo:row.reservationNo,materialCode:row.materialCode});
  tesisHistoryState.selected=row.controlId+'|'+row.materialCode;tesisHistoryState.tab='movements';tesisHistoryState.detail=null;
  if($('#tesisHistoryDetailTitle'))$('#tesisHistoryDetailTitle').textContent='Rezervasyon '+row.reservationNo+' · '+row.materialCode;
  if($('#tesisHistoryDetailContent'))$('#tesisHistoryDetailContent').textContent='SAP hareketleri ve kontrol geçmişi yükleniyor…';
  try{tesisHistoryState.detail=await fetchApiJson('/api/tesis-control-history?'+p.toString(),{},45000);renderTesisHistoryDetail();box?.scrollIntoView({behavior:'smooth',block:'nearest'})}
  catch(e){if($('#tesisHistoryDetailContent'))$('#tesisHistoryDetailContent').textContent='Ayrıntı yüklenemedi: '+e.message}
}
function renderTesisHistoryDetail(){const data=tesisHistoryState.detail,box=$('#tesisHistoryDetailContent');if(!data||!box)return;
  const tab=tesisHistoryState.tab;
  $$('#tesisHistoryDetailTabs [data-history-tab]').forEach(b=>{b.classList.toggle('btn-primary',b.dataset.historyTab===tab);b.classList.toggle('btn-ghost',b.dataset.historyTab!==tab)});
  if($('#tesisHistoryDetailInfo'))$('#tesisHistoryDetailInfo').textContent=`Kontrol: ${data.header?.KontrolID||'—'} · ${data.header?.KontrolZamani||'—'} · Gerçekleşen net: ${workOpsNum(data.actualQty)} · ZMM048 kesinleşme kanıtı değildir`;
  let columns=[],rows=[];
  if(tab==='movements'){
    columns=['SAP Belge','Kayıt Tarihi','Hareket','Malzeme','Miktar','Birim','ÜY','Kaynak Depo','Hedef Depo','Rezervasyon'];
    rows=(data.movements||[]).map(x=>[x.doc,x.posting_date,x.movement,x.material_code,workOpsNum(x.qty),x.uom,x.plant,x.dy,x.target_dy,x.reservation]);
  }else if(tab==='projects'){
    columns=['Proje Kodu','Proje Adı','Malzeme','Keşif','Daha Önce Verilen','Dağıtılan','Proje Kalanı','Durum'];
    rows=(data.projects||[]).map(x=>[x.ProjeKodu,x.ProjeAdi,x.MalzemeKodu,x.ProjeKesfi,x.DahaOnceVerilen,x.DagitilanMiktar,x.ProjeKalani,x.Durum]);
  }else if(tab==='revisions'){
    columns=['Kontrol ID','Tarih','Revizyon','Genel Sonuç'];
    rows=(data.revisions||[]).map(x=>[x.controlId,x.controlTime,x.revision,x.result]);
  }else{
    columns=['Kaynak','Bilgi'];rows=[['ZMM048',`${(data.zmm048||[]).length} rezervasyon/malzeme satırı · kesinleşme doğrulanmadı`],['MB51',`${data.givenEvents||0} verilen/ters hareket · snapshot ${data.header?.MB51SnapshotID||'—'}`],['Keşif',data.header?.KESIFLERSnapshotID||'—'],['Kontrol',data.header?.KontrolID||'—'],['İşlem Kullanıcısı',data.header?.WindowsKullanici||'—'],['Override',data.header?.KullaniciOverride||'HAYIR']];
  }
  box.innerHTML=`<div class="history26-warning">Onay, ZMM048 rezervasyon kaydı ve MB51 fiili hareketi farklı durumlardır. Doğrulanmış kesin rezervasyon yayını bulunmadığı için kesinleşmiş olarak işaretlenmez.</div><div class="table-wrap"><table class="dashboard-table"><thead><tr>${columns.map(x=>`<th>${dashEsc(x)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(x=>`<tr>${x.map(v=>`<td>${dashEsc(v==null?'—':v)}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${columns.length}">Bu sekmede kayıt bulunamadı.</td></tr>`}</tbody></table></div>`;
}

const workReportState={B:{tab:'money',page:1},K:{tab:'money',page:1},L:{tab:'money',page:1},T:{tab:'money',page:1}};
const workReportTimers={};
function scheduleWorkReport(code){if(!workReportState[code])return;clearTimeout(workReportTimers[code]);workReportTimers[code]=setTimeout(()=>{workReportState[code].page=1;loadWorkReport(code)},300)}
const WORK_REPORT_TITLES={money:'Parasal İcmal',material:'Malzeme İcmal',diff:'Fark Listesi',given:'Verilen Malzeme Detayı',consumption:'Tüketim Detayı',discovery:'Keşif'};
function workReportColumns(tab,code=''){
  const projectCols=code==='T'?[['projectCode','Proje Kodu'],['projectName','Proje']]:[];
  if(tab==='money')return [['depot','Depo'],...projectCols,['materialCode','Malzeme'],['materialDesc','Tanım'],['discoveryQty','Keşif'],['sourceGivenQty','Kaynak Verilen'],['actualGivenQty','MB51 Fiili Verilen'],['differenceQty','Fark (Kaynak)'],['unitPrice','MB52 YENİ Fiyat'],['discoveryAmount','Keşif Bedeli'],['givenAmount','Kaynak Verilen Bedeli'],['actualGivenAmount','MB51 Fiili Bedeli'],['differenceAmount','Fark Bedeli'],['priceSource','Fiyat Kaynağı']];
  if(['material','diff','discovery'].includes(tab))return [['depot','Depo'],...projectCols,['materialCode','Malzeme'],['materialDesc','Tanım'],['unit','Birim'],['discoveryQty','Keşif'],['sourceGivenQty','Kaynak Verilen'],['actualGivenQty','MB51 Fiili Verilen'],['differenceQty','Fark (Kaynak)'],['issues','Sorun'],['mutabakat','MB51 Mutabakat']];
  return [['documentNo','SAP Belge'],['postingDate','Kayıt Tarihi'],['movement','Hareket'],['reservationNo','Rezervasyon'],['materialCode','Malzeme'],['materialDesc','Tanım'],['rawQty','SAP Miktarı'],['signedQty','Net Miktar'],['unit','Birim'],['plant','ÜY'],['sourceDepot','Depo'],['targetDepot','Hedef Depo'],...(tab==='given'?[['movementDirection','Hareket Yönü']]:[]),['amount','MB51 Tutar']];
}
function workReportMonthlyTable(rows){
  const monthName=v=>workOpsMonthName(v);
  return `<h4>Aylık Harcamalar — MB51 (221 / 222 / Z22)</h4><div class="table-wrap"><table class="dashboard-table"><thead><tr><th>Ay</th><th class="num">221</th><th class="num">222 (Ters)</th><th class="num">Z22</th><th class="num">Net Harcama</th><th class="num">Hareket</th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr><td>${dashEsc(monthName(r.month))}</td><td class="num">${dashMoney(r.amount221)}</td><td class="num">${dashMoney(r.amount222)}</td><td class="num">${dashMoney(r.amountZ22)}</td><td class="num"><strong>${dashMoney(r.netAmount)}</strong></td><td class="num">${dashInt(r.events)}</td></tr>`).join(''):'<tr><td colspan="6">Bu filtreye ait aylık harcama kaydı yok.</td></tr>'}</tbody></table></div>`;
}
async function collectActiveWorkReport(code){
  const sec=workOpsSection(code),f=workOpsFilters(code),st=workReportState[code],tab=st.tab;
  const selectedProject=code==='T'?(workOpsState.T?.projects||[]).find(r=>workOpsProjectKey(r)===f.project):null;
  const reportDepot=selectedProject?String(selectedProject.dy||''):f.depot;
  const grouped=(tab==='given'&&code!=='T'&&window.FIX28QGivenMode?.(code)!=='all');
  const params=new URLSearchParams({code,tab,plant:f.plant,depot:reportDepot,projectNorm:selectedProject?String(selectedProject.projectNorm||''):'',q:workOpsRole(sec,'search')?.value||'',pageSize:'250'});
  if(window.FIX28QFilterQuery){for(const [k,v] of Object.entries(window.FIX28QFilterQuery(code,tab)))params.set(k,v)}
  params.set('page','1');const route=grouped?'/api/worktype-given-reservations?':'/api/worktype-report?';const first=await fetchApiJson(route+params,{},60000);
  const pages=Number(first.pages||1),total=Number(first.total||0),rows=[...(first.rows||[])];
  if(total>50000)throw new Error('50.000 satır sınırı aşıldı. Lütfen üretim yeri veya depo filtresi seçin; eksik veriyle çıktı alınmaz.');
  const chosen={plant:f.plant,depot:reportDepot,project:f.project,q:workOpsRole(sec,'search')?.value||'',tab};
  for(let page=2;page<=pages;page++){params.set('page',String(page));const result=await fetchApiJson(route+params,{},60000);rows.push(...(result.rows||[]));}
  const fNow=workOpsFilters(code);
  if(st.tab!==tab||(fNow.depot!==(f.depot))||fNow.project!==chosen.project||fNow.plant!==chosen.plant||(workOpsRole(sec,'search')?.value||'')!==chosen.q)throw new Error('Filtreler değişti; doğru çıktıyı almak için tekrar deneyin.');
  if(rows.length!==total)throw new Error(`Dışa aktarım bütünlüğü: ${total} beklenirken ${rows.length} satır geldi.`);
  return{workLabel:WORK_LABELS[code],title:WORK_REPORT_TITLES[tab]+(grouped?' – Rezervasyon Özeti':''),tab,plant:chosen.plant,depot:chosen.depot,search:chosen.q,generatedAt:new Date().toLocaleString('tr-TR'),columns:grouped?[['reservationNo','Rezervasyon No'],['materialCount','Malzeme Kalemi'],['documentCount','Belge Sayısı'],['eventCount','MB51 Hareket'],['lastPostingDate','Son Hareket']]:workReportColumns(tab,code),rows,monthlySpend:tab==='consumption'?first.monthlySpend||[]:[],note:first.note||'',total};
}
function initWorkReportSection(sec,code){const panel=sec.querySelector('.work-report26');if(!panel)return;
  panel.querySelectorAll('[data-report-tab]').forEach(b=>b.onclick=()=>{workReportState[code].tab=b.dataset.reportTab;workReportState[code].page=1;const title=panel.querySelector('[data-report-title]');if(title)title.textContent=b.textContent.trim();loadWorkReport(code)});
  panel.querySelector('[data-report-refresh]').onclick=()=>loadWorkReport(code);
  panel.querySelector('[data-report-prev]').onclick=()=>{if(workReportState[code].page>1){workReportState[code].page--;loadWorkReport(code)}};
  panel.querySelector('[data-report-next]').onclick=()=>{workReportState[code].page++;loadWorkReport(code)};
}
async function loadWorkReport(code){
  if(code!=='T' && window.FIX28O && typeof window.FIX28O.renderWorkReport==='function'){
    return window.FIX28O.renderWorkReport(code,workReportState[code],workOpsFilters(code),workOpsState[code]);
  }const panel=workOpsSection(code)?.querySelector('.work-report26'),st=workReportState[code];if(!panel||!st)return;
  const body=panel.querySelector('[data-report-body]'),head=panel.querySelector('[data-report-head]'),info=panel.querySelector('[data-report-info]');
  const filters=workOpsFilters(code);
  const signature=JSON.stringify([st.tab,filters.plant,filters.depot,filters.project,workOpsRole(workOpsSection(code),'search')?.value||'',window.FIX28QFilterQuery?.(code,st.tab)||{}]);
  if(st.qSignature!==signature){st.qSignature=signature;st.qRecords=[];st.page=1;st.qAppend=false;}
  const append=!!st.qAppend&&st.page>1;
  const holder=body.closest('.table-wrap'),savedScroll=append?(holder?.scrollTop||0):0;
  if(!append)body.innerHTML='<tr><td>Rapor verileri yükleniyor…</td></tr>';
  st.qLoading=true;const requestId=st.requestId=(st.requestId||1)+1;
  const selectedProject=code==='T'?(workOpsState.T?.projects||[]).find(r=>workOpsProjectKey(r)===filters.project):null;
  const qs=new URLSearchParams({code,tab:st.tab,plant:filters.plant,depot:selectedProject?String(selectedProject.dy||''):filters.depot,projectNorm:selectedProject?String(selectedProject.projectNorm||''):'',q:workOpsRole(workOpsSection(code),'search')?.value||'',page:String(st.page),pageSize:'100',ts:String(Date.now()),...(window.FIX28QFilterQuery?.(code,st.tab)||{})});
  try{
    const data=await fetchApiJson('/api/worktype-report?'+qs.toString(),{},60000),batch=data.rows||[];if(st.requestId!==requestId)return;
    st.qRecords=append?[...(st.qRecords||[]),...batch]:[...batch];const rows=st.qRecords;
    st.page=Number(data.page||1);st.pages=Number(data.pages||1);
    const cols=workReportColumns(st.tab,code);
    const moneyFields=new Set(['unitPrice','discoveryAmount','givenAmount','actualGivenAmount','differenceAmount','amount']);
    const numberFields=new Set(['discoveryQty','sourceGivenQty','actualGivenQty','differenceQty','rawQty','signedQty']);
    head.innerHTML='<tr><th class="q28-index-head">No</th>'+cols.map(([k,label])=>`<th><span>${dashEsc(label)}</span>${['materialCode','materialDesc','depot','projectCode','projectName','unit','postingDate','documentNo','reservationNo','discoveryQty','sourceGivenQty','differenceQty','rawQty'].includes(k)?`<button class="q28-t-filter" type="button" data-key="${k}" aria-label="${dashEsc(label)} sütununu filtrele">⌄</button>`:''}</th>`).join('')+'</tr>';
    body.innerHTML=rows.length?rows.map((r,i)=>`<tr><td class="q28-row-number">${i+1}</td>${cols.map(([k])=>{const v=r[k],date=/Date$/.test(k)&&typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v.slice(8)+'.'+v.slice(5,7)+'.'+v.slice(0,4):v;return `<td class="${moneyFields.has(k)||numberFields.has(k)?'num':''}">${dashEsc(date==null?'—':moneyFields.has(k)?dashMoney(date):numberFields.has(k)?workOpsNum(date):date)}</td>`}).join('')}</tr>`).join(''):`<tr><td colspan="${cols.length+1}">Bu filtrede rapor satırı bulunamadı.</td></tr>`;
    if(holder&&append)holder.scrollTop=savedScroll;
    if(window.FIX28QTTable)window.FIX28QTTable.bind(code,st,panel);
    if(info)info.textContent=`${dashInt(rows.length)} / ${dashInt(data.total||0)} satır · ${st.page<st.pages?'Aşağı kaydırdıkça devam eder':'Tüm kayıtlar yüklendi'} · ${data.note||''}${data.pricingMissing?' · Bu sayfada fiyatı eksik '+data.pricingMissing+' malzeme var.':''}`;
    const monthly=panel.querySelector('[data-report-monthly]');if(monthly){monthly.hidden=st.tab!=='consumption';monthly.innerHTML=st.tab==='consumption'?workReportMonthlyTable(data.monthlySpend||[]):'';}
    const rev=panel.querySelector('[data-report-revision-plan]');if(rev)rev.hidden=st.tab!=='discovery';

    if(panel.querySelector('[data-report-page]'))panel.querySelector('[data-report-page]').textContent=`${rows.length} / ${data.total||0}`;
    panel.querySelector('[data-report-prev]').disabled=st.page<=1;panel.querySelector('[data-report-next]').disabled=st.page>=st.pages;
    panel.querySelectorAll('[data-report-tab]').forEach(b=>{const active=b.dataset.reportTab===st.tab;b.classList.toggle('btn-primary',active);b.classList.toggle('btn-ghost',!active);b.setAttribute('aria-pressed',active?'true':'false')});
    const reportTitle=panel.querySelector('[data-report-title]'),activeTab=panel.querySelector('[data-report-tab="'+st.tab+'"]');if(reportTitle&&activeTab)reportTitle.textContent=activeTab.textContent.trim();
  }catch(e){if(!append){head.innerHTML='';body.innerHTML='<tr><td>Rapor yüklenemedi: '+dashEsc(e.message)+'</td></tr>';}else{st.page=Math.max(1,st.page-1)}if(info)info.textContent='Rapor servisi bağlantısı kontrol edilmeli.'}finally{st.qLoading=false;st.qAppend=false}
}

function initNav(){
  const sidebar=$('.sidebar'),menuBtn=$('#appMenuButton'),backdrop=$('#sidebarBackdrop');
  const closeSidebar=()=>{document.body.classList.remove('sidebar-open');if(backdrop)backdrop.hidden=true};
  const openSidebar=()=>{document.body.classList.add('sidebar-open');if(backdrop)backdrop.hidden=false};
  if(menuBtn)menuBtn.onclick=()=>document.body.classList.contains('sidebar-open')?closeSidebar():openSidebar();
  if(backdrop)backdrop.onclick=closeSidebar;document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSidebar()});
  $$('.nav-item').forEach(b=>b.onclick=()=>{
    $$('.nav-item').forEach(x=>x.classList.remove('active'));b.classList.add('active');
    $$('.view').forEach(v=>v.classList.remove('active'));const view=$('#'+b.dataset.view+'View');if(view)view.classList.add('active');
    if(b.dataset.view==='tesisHistory')loadTesisHistory(true);
    if(b.dataset.view==='settings')loadSettingsView();if(b.dataset.view==='dashboard')loadDashboardView();if(WORK_VIEW_CODES[b.dataset.view])loadWorkOperations(WORK_VIEW_CODES[b.dataset.view]);if(b.dataset.view==='kesif')loadKesifView();if(b.dataset.view==='guarantee')renderGuaranteeView();if(b.dataset.view==='stocks')renderStocksView();if(b.dataset.view==='movements')renderMovementsView(false);if(b.dataset.view==='data-center')loadDataCenter();
    if(innerWidth<=760)closeSidebar();
  });
  const pkg=$('#packageCsvBackupBtn');if(pkg)pkg.onclick=async()=>{pkg.disabled=true;try{await fetchApiJson('/api/settings-open-folder',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'bundled'})},8000);toast('Paket CSV yedeği klasörü açıldı.')}catch(e){toast('Paket CSV yedeği klasörü açılamadı: '+e.message)}finally{pkg.disabled=false}};
}

function dashMoney(v){const n=Number(v)||0;return new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY',maximumFractionDigits:n>=1000000?0:2}).format(n)}
function dashInt(v){return new Intl.NumberFormat('tr-TR',{maximumFractionDigits:0}).format(Number(v)||0)}
function dashPct(v,digits=1){return '%'+new Intl.NumberFormat('tr-TR',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(Number(v)||0)}
function dashEsc(v){return esc(String(v??''))}

const WORK_VIEW_CODES={opsBakim:'B',opsKet:'K',opsLed:'L',opsTesis:'T'};
const WORK_LABELS={B:'BAKIM',K:'KET&YB',L:'LED',T:'TESİS'};
const workOpsState={B:null,K:null,L:null,T:null};
const workOpsProjectMaterialCache=new Map();
const workOpsProjectMaterialPending=new Set();
function workOpsSection(code){return document.querySelector(`.work-operations-view[data-work-code="${code}"]`)}
function workOpsRole(sec,role){return sec?.querySelector(`[data-role="${role}"]`)||null}
function workOpsKpi(sec,key){return sec?.querySelector(`[data-kpi="${key}"]`)||null}
function workOpsNum(v){return new Intl.NumberFormat('tr-TR',{maximumFractionDigits:2}).format(Number(v)||0)}
function workOpsSetAlert(sec,text,type=''){const el=workOpsRole(sec,'alert');if(!el)return;el.textContent=text||'';el.className='dashboard-alert'+(type?' '+type:'');el.hidden=!text}
function workOpsFilters(code){const sec=workOpsSection(code);return{plant:workOpsRole(sec,'plant-filter')?.value||'',depot:workOpsRole(sec,'depot-filter')?.value||'',project:workOpsRole(sec,'project-filter')?.value||'',q:normalizeSearchText(workOpsRole(sec,'search')?.value||'').trim()}}
function workOpsProjectKey(r){return `${String(r.dy||'')}|${String(r.projectCode||'')}|${String(r.projectName||'')}`}
function workOpsMonthName(v){const m=String(v||'').match(/^(\d{4})-(\d{2})$/);if(!m)return String(v||'—');const names=['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];return `${names[Number(m[2])-1]||m[2]} ${m[1]}`}
function workOpsMeta(data,dy){return (data?.depots||[]).find(x=>String(x.dy||'')===String(dy||''))||{}}
function workOpsDepotLabel(data,dy){const m=workOpsMeta(data,dy);return [dy,m.dyDesc,m.contract].filter(Boolean).join(' — ')||String(dy||'')}
function workOpsProjectLabel(data,r,depSelected=false){const m=workOpsMeta(data,r.dy);const p=(r.projectName||'—');return p}
function workOpsFillFilters(code,data){
  const sec=workOpsSection(code);if(!sec)return;const ds=workOpsRole(sec,'depot-filter'),ps=workOpsRole(sec,'project-filter'),uy=workOpsRole(sec,'plant-filter');const curD=ds?.value||'',curP=ps?.value||'',curU=uy?.value||'';
  if(uy){const plants=[...new Set((data.depots||[]).filter(x=>(data.depotCodes||[]).includes(String(x.dy||''))).map(x=>String(x.uy||'')).filter(Boolean))].sort();uy.innerHTML='<option value="">Tüm Üretim Yerleri</option>'+plants.map(p=>`<option value="${dashEsc(p)}">${dashEsc(p)}</option>`).join('');if(plants.includes(curU))uy.value=curU;}
  if(ds){ds.innerHTML='<option value="">Tüm Depolar</option>'+(data.depotCodes||[]).filter(d=>!uy?.value||(data.depots||[]).some(x=>String(x.dy||'')===String(d)&&String(x.uy||'')===uy.value)).map(d=>`<option value="${dashEsc(d)}">${dashEsc(workOpsDepotLabel(data,d))}</option>`).join('');if([...ds.options].some(o=>o.value===curD))ds.value=curD}
  if(ps){const dep=ds?.value||'';const arr=(data.projects||[]).filter(r=>!dep||String(r.dy||'')===dep);ps.innerHTML='<option value="">Tüm Projeler</option>'+arr.map(r=>`<option value="${dashEsc(workOpsProjectKey(r))}">${dashEsc(workOpsProjectLabel(data,r,!!dep))}</option>`).join('');if([...ps.options].some(o=>o.value===curP))ps.value=curP}
}
function workOpsSelectDepot(code,dy){const sec=workOpsSection(code),data=workOpsState[code];if(!sec||!data)return;const ds=workOpsRole(sec,'depot-filter'),ps=workOpsRole(sec,'project-filter');if(ds)ds.value=dy||'';if(ps)ps.value='';workOpsFillFilters(code,data);workOpsRender(code);sec.scrollIntoView({behavior:'smooth',block:'start'})}
function workOpsBindDepotLinks(code,sec){sec.querySelectorAll('.work-ops-depot-link').forEach(b=>b.onclick=e=>{e.stopPropagation();workOpsSelectDepot(code,b.dataset.depot||'')})}
function workOpsRenderContractor(code,data,f){const sec=workOpsSection(code);let box=sec?.querySelector('.work-ops-contractor-card');if(!box)return;if(!f.depot){box.innerHTML='<div><span>Yüklenici Kartı</span><strong>Depo seçildiğinde yüklenici bilgileri gösterilir.</strong></div>';return}const m=workOpsMeta(data,f.depot);box.innerHTML=`<div><span>Depo</span><strong>${dashEsc(f.depot)}</strong></div><div><span>Depo Tanımı</span><strong>${dashEsc(m.dyDesc||'—')}</strong></div><div><span>Yüklenici</span><strong>${dashEsc(m.company||'—')}</strong></div><div><span>Sözleşme</span><strong>${dashEsc(m.contract||'—')}</strong></div>`}
function workOpsExportPayload(code){const sec=workOpsSection(code),data=workOpsState[code]||{},f=workOpsFilters(code),isT=code==='T';const selectedProject=isT&&f.project?(data.projects||[]).find(r=>workOpsProjectKey(r)===f.project):null;let mats=isT&&selectedProject?(workOpsProjectMaterialCache.get(workOpsProjectKey(selectedProject))||[]):(data.materials||[]);mats=mats.filter(r=>(!f.depot||String(r.dy||'')===f.depot)&&(!f.q||normalizeSearchText([r.dy,r.projectCode,r.projectName,r.materialCode,r.materialDesc].join(' ')).includes(f.q)));const discovery=mats.map(r=>({...r,projectLabel:(r.projectCode?r.projectCode+' — ':'')+(r.projectName||''),status:Number(r.remaining)<0?'NEGATİF':Number(r.issueRows)>0?'SORUN':'UYGUN'}));const spend=(data.monthlyMaterialSpend||[]).filter(r=>(!f.depot||String(r.dy||'')===f.depot)&&(!f.q||normalizeSearchText([r.dy,r.materialCode,r.materialDesc].join(' ')).includes(f.q))).map(r=>({...r,monthName:workOpsMonthName(r.month)}));const guarantee=(data.guaranteeRows||[]).filter(r=>(!f.depot||String(r.dy||'')===f.depot)).map(r=>({...r,total:(Number(r.main)||0)+(Number(r.cash)||0)+(Number(r.manual)||0)}));return{workLabel:WORK_LABELS[code],generatedAt:new Date().toLocaleString('tr-TR'),depotLabel:f.depot?workOpsDepotLabel(data,f.depot):'Tüm Depolar',projectLabel:selectedProject?workOpsProjectLabel(data,selectedProject,true):'Tüm Projeler',search:workOpsRole(sec,'search')?.value||'',materials:mats.map(r=>({...r,projectLabel:(r.projectCode?r.projectCode+' — ':'')+(r.projectName||'')})),discovery,spend,guarantee,kpis:{'Depo':new Set(mats.map(x=>x.dy)).size,'Malzeme Çeşidi':new Set(mats.map(x=>x.materialCode)).size,'Keşif Kalemi':discovery.length,'Kullanılabilir Teminat':guarantee.reduce((a,x)=>a+Number(x.available||0),0)}}}
function workOpsRender(code){
  const sec=workOpsSection(code),data=workOpsState[code];if(!sec||!data)return;const f=workOpsFilters(code),isT=code==='T';const selectedProject=isT&&f.project?(data.projects||[]).find(r=>workOpsProjectKey(r)===f.project):null;
  let baseMaterials=isT&&selectedProject?(workOpsProjectMaterialCache.get(workOpsProjectKey(selectedProject))||[]):(data.materials||[]);if(isT&&selectedProject&&!workOpsProjectMaterialCache.has(workOpsProjectKey(selectedProject))){baseMaterials=[];ensureWorkProjectMaterials(selectedProject)}
  const materials=baseMaterials.filter(r=>{if(f.plant&&!(data.depots||[]).some(x=>String(x.dy||'')===String(r.dy||'')&&String(x.uy||'')===f.plant))return false;if(f.depot&&String(r.dy||'')!==f.depot)return false;if(f.q&&!normalizeSearchText([r.dy,r.projectCode,r.projectName,r.materialCode,r.materialDesc].join(' ')).includes(f.q))return false;return true});
  const projects=(data.projects||[]).filter(r=>{if(f.depot&&String(r.dy||'')!==f.depot)return false;if(f.project&&workOpsProjectKey(r)!==f.project)return false;if(f.q&&!normalizeSearchText([r.dy,r.projectCode,r.projectName,workOpsMeta(data,r.dy).company,workOpsMeta(data,r.dy).contract].join(' ')).includes(f.q))return false;return true});
  const guarantee=(data.guaranteeRows||[]).filter(r=>(!f.plant||String(r.uy||'')===f.plant)&&(!f.depot||String(r.dy||'')===f.depot)&&(!f.q||normalizeSearchText([r.uy,r.dy,r.dyDesc,workOpsMeta(data,r.dy).company,workOpsMeta(data,r.dy).contract].join(' ')).includes(f.q)));
  const spend=(data.monthlyMaterialSpend||[]).filter(r=>(!f.plant||(data.depots||[]).some(x=>String(x.dy||'')===String(r.dy||'')&&String(x.uy||'')===f.plant))&&(!f.depot||String(r.dy||'')===f.depot)&&(!f.q||normalizeSearchText([r.dy,r.materialCode,r.materialDesc].join(' ')).includes(f.q)));
  const uniqueDepots=new Set((f.depot?[f.depot]:materials.map(r=>String(r.dy||''))).filter(Boolean)),materialTypes=new Set(materials.map(r=>String(r.materialCode||'')).filter(Boolean)).size,discoveryRows=materials.length,positiveRows=materials.filter(r=>Number(r.remaining)>0).length,negativeRows=materials.filter(r=>Number(r.remaining)<0).length,issueRows=materials.reduce((a,r)=>a+Number(r.issueRows||0),0),gavail=guarantee.reduce((a,r)=>a+Number(r.available||0),0);const months=[...new Set(spend.map(r=>r.month).filter(Boolean))].sort(),lm=months.at(-1)||'',lmSpend=spend.filter(r=>r.month===lm).reduce((a,r)=>a+Number(r.netSpend||0),0);const kpis={depots:uniqueDepots.size,materialTypes,discoveryRows,positiveRows,issueRows,negativeRows,guaranteeAvailable:gavail,lastMonthSpend:lmSpend,lastMonth:lm?workOpsMonthName(lm):'—'};for(const [k,v] of Object.entries(kpis)){const el=workOpsKpi(sec,k);if(!el)continue;if(k==='guaranteeAvailable'||k==='lastMonthSpend')el.textContent=dashMoney(v);else if(k==='lastMonth')el.textContent=String(v);else el.textContent=dashInt(v)}
  workOpsRenderContractor(code,data,f);
  if(code==='T'&&sec.classList.contains('active'))scheduleWorkReport('T');
  const mb=workOpsRole(sec,'material-body');if(mb){const colspan=isT?8:7;mb.innerHTML=materials.length?materials.slice(0,2500).map(r=>`<tr class="${Number(r.remaining)<0?'work-ops-negative':''}"><td><button class="work-ops-depot-link" data-depot="${dashEsc(r.dy||'')}">${dashEsc(r.dy||'—')}</button></td>${isT?`<td class="wrap">${dashEsc(r.projectName||'—')}</td>`:''}<td>${dashEsc(r.materialCode||'—')}</td><td class="wrap">${dashEsc(r.materialDesc||'—')}</td><td>${dashEsc(r.uom||'—')}</td><td class="num">${workOpsNum(r.planned)}</td><td class="num">${workOpsNum(r.given)}</td><td class="num"><strong>${workOpsNum(r.remaining)}</strong></td></tr>`).join(''):`<tr><td colspan="${colspan}"><div class="dashboard-no-data">Filtrelere uygun malzeme dağılımı bulunamadı.</div></td></tr>`}
  const gd=sec.querySelector('.work-ops-guarantee-detail');if(gd){const total=guarantee.reduce((a,r)=>a+Number(r.main||0)+Number(r.cash||0)+Number(r.manual||0),0),main=guarantee.reduce((a,r)=>a+Number(r.main||0),0),cash=guarantee.reduce((a,r)=>a+Number(r.cash||0),0),manual=guarantee.reduce((a,r)=>a+Number(r.manual||0),0),stock=guarantee.reduce((a,r)=>a+Number(r.stockValue||0),0);gd.innerHTML=`<div><span>Ana Teminat</span><strong>${dashMoney(main)}</strong></div><div><span>Nakdi Teminat</span><strong>${dashMoney(cash)}</strong></div><div><span>Manuel Artış</span><strong>${dashMoney(manual)}</strong></div><div><span>Toplam Teminat</span><strong>${dashMoney(total)}</strong></div><div><span>Depo Stok Değeri</span><strong>${dashMoney(stock)}</strong></div>`}
  const gb=workOpsRole(sec,'guarantee-body');if(gb)gb.innerHTML=guarantee.length?guarantee.map(r=>`<tr><td>${dashEsc(r.uy||'—')}</td><td><button class="work-ops-depot-link" data-depot="${dashEsc(r.dy||'')}">${dashEsc(r.dy||'—')}</button></td><td class="wrap">${dashEsc(r.dyDesc||'—')}</td><td class="num">${dashMoney(r.main)}</td><td class="num">${dashMoney(r.cash)}</td><td class="num">${dashMoney(r.manual)}</td><td class="num">${dashMoney((Number(r.main)||0)+(Number(r.cash)||0)+(Number(r.manual)||0))}</td><td class="num">${dashMoney(r.stockValue)}</td><td class="num"><strong>${dashMoney(r.available)}</strong></td></tr>`).join(''):'<tr><td colspan="9"><div class="dashboard-no-data">Bu kapsamda ZMM098 teminat kaydı bulunamadı.</div></td></tr>';
  const db=workOpsRole(sec,'discovery-body');if(db){const colspan=isT?9:8;db.innerHTML=materials.length?materials.map(r=>`<tr class="${Number(r.remaining)<0?'work-ops-negative':''}"><td><button class="work-ops-depot-link" data-depot="${dashEsc(r.dy||'')}">${dashEsc(r.dy||'—')}</button></td>${isT?`<td class="wrap">${dashEsc(r.projectName||'—')}</td>`:''}<td>${dashEsc(r.materialCode||'—')}</td><td class="wrap">${dashEsc(r.materialDesc||'—')}</td><td>${dashEsc(r.uom||'—')}</td><td class="num">${workOpsNum(r.planned)}</td><td class="num">${workOpsNum(r.given)}</td><td class="num"><strong>${workOpsNum(r.remaining)}</strong></td><td>${Number(r.remaining)<0?dcStatusBadge('CRITICAL'):Number(r.issueRows)>0?dcStatusBadge('WARNING'):dcStatusBadge('NORMAL')}</td></tr>`).join(''):`<tr><td colspan="${colspan}"><div class="dashboard-no-data">Filtrelere uygun malzeme bazlı keşif bulunamadı.</div></td></tr>`}
  const sb=workOpsRole(sec,'spend-body');if(sb){const arr=[...spend].sort((a,b)=>String(b.month||'').localeCompare(String(a.month||''))||String(a.dy||'').localeCompare(String(b.dy||''))||String(a.materialCode||'').localeCompare(String(b.materialCode||'')));sb.innerHTML=arr.length?arr.slice(0,2500).map(r=>`<tr class="${Number(r.netSpend)<0?'work-ops-negative':''}"><td>${dashEsc(workOpsMonthName(r.month))}</td><td><button class="work-ops-depot-link" data-depot="${dashEsc(r.dy||'')}">${dashEsc(r.dy||'—')}</button></td><td>${dashEsc(r.materialCode||'—')}</td><td class="wrap">${dashEsc(r.materialDesc||'—')}</td><td>${dashEsc(r.uom||'—')}</td><td class="num"><strong>${dashMoney(r.netSpend)}</strong></td></tr>`).join(''):'<tr><td colspan="6"><div class="dashboard-no-data">Bu kapsamda aylık harcama bulunamadı.</div></td></tr>'}
  if(isT){const pb=workOpsRole(sec,'project-body');if(pb){pb.innerHTML=projects.length?projects.map((r,i)=>`<tr class="work-ops-project-row ${f.project===workOpsProjectKey(r)?'selected':''} ${Number(r.negativeRows)>0?'work-ops-negative':''}" data-project="${dashEsc(workOpsProjectKey(r))}"><td><button class="work-ops-depot-link" data-depot="${dashEsc(r.dy||'')}">${dashEsc(r.dy||'—')}</button></td><td class="wrap">${dashEsc(r.projectName||'—')}</td><td>${operationsStatusPill(r.lifecycleStatus)}</td><td class="num">${dashInt(r.materialCount)}</td><td class="num">${dashInt(r.positiveRows)}</td><td class="num">${dashInt(r.zeroRows)}</td><td class="num">${dashInt(r.negativeRows)}</td><td class="num">${dashInt(r.issueRows)}</td><td><button class="btn btn-ghost work-project-edit" type="button" data-index="${i}">Düzenle</button></td></tr>`).join(''):'<tr><td colspan="9"><div class="dashboard-no-data">Filtrelere uygun TESİS projesi bulunamadı.</div></td></tr>';pb.querySelectorAll('.work-ops-project-row').forEach(tr=>tr.onclick=e=>{if(e.target.closest('.work-project-edit,.work-ops-depot-link'))return;const ps=workOpsRole(sec,'project-filter');if(ps){ps.value=tr.dataset.project||'';workOpsProjectChanged(code)}});pb.querySelectorAll('.work-project-edit').forEach(b=>b.onclick=e=>{e.stopPropagation();const r=projects[Number(b.dataset.index)||0];if(r)openProjectLifecycleModal({target:r.dy,projectCode:r.projectCode,projectName:r.projectName,lifecycleStatus:r.lifecycleStatus,lifecycleRevision:r.lifecycleRevision,lifecycleUpdatedAt:r.lifecycleUpdatedAt})})}}
  workOpsBindDepotLinks(code,sec);const note=workOpsRole(sec,'note');if(note)note.textContent=`${WORK_LABELS[code]} • Keşif ve harcama malzeme bazlıdır • negatif kalanlar gizlenmez. ${data.note||''}`;
  if(code==='B'||code==='K'||code==='L')scheduleWorkReport(code);
}
async function ensureWorkProjectMaterials(project){
  if(!project)return[];const key=workOpsProjectKey(project);if(workOpsProjectMaterialCache.has(key))return workOpsProjectMaterialCache.get(key)||[];if(workOpsProjectMaterialPending.has(key))return[];workOpsProjectMaterialPending.add(key);
  try{const qs=new URLSearchParams({depot:String(project.dy||''),projectNorm:String(project.projectNorm||'')});const d=await fetchApiJson('/api/operations-work-project?'+qs.toString(),{},60000);const rows=Array.isArray(d.rows)?d.rows:[];workOpsProjectMaterialCache.set(key,rows);return rows}catch(e){toast('TESİS proje malzemeleri yüklenemedi: '+e.message,'error',6000);return[]}finally{workOpsProjectMaterialPending.delete(key);if($('#opsTesisView')?.classList.contains('active'))workOpsRender('T')}
}
async function workOpsProjectChanged(code){const sec=workOpsSection(code),data=workOpsState[code];if(!sec||!data)return;const val=workOpsRole(sec,'project-filter')?.value||'';const p=(data.projects||[]).find(x=>workOpsProjectKey(x)===val);if(p)await ensureWorkProjectMaterials(p);workOpsRender(code)}
async function loadWorkOperations(code,force=false){
  const sec=workOpsSection(code);if(!sec)return;const btn=workOpsRole(sec,'refresh');if(btn){btn.disabled=true;btn.textContent='Yükleniyor…'}workOpsSetAlert(sec,`${WORK_LABELS[code]} verileri hazırlanıyor…`);
  try{const data=await fetchApiJson(`/api/operations-work?code=${encodeURIComponent(code)}&months=12&ts=${Date.now()}`,{},90000);workOpsState[code]=data;workOpsFillFilters(code,data);const resp=state.meta.userContext?.responsibility||{},preferred=(resp.depots||[]).filter(d=>(data.depotCodes||[]).includes(d)),ds=workOpsRole(sec,'depot-filter');if(ds&&!ds.value&&preferred.length===1){ds.value=preferred[0];workOpsFillFilters(code,data)}workOpsRender(code);workOpsSetAlert(sec,'')}
  catch(e){console.error('Work operations load',code,e);workOpsSetAlert(sec,`${WORK_LABELS[code]} operasyon verileri yüklenemedi: ${e.message}`,'bad')}
  finally{if(btn){btn.disabled=false;btn.textContent='Yenile'}}
}
function initWorkOperationViews(){
  document.querySelectorAll('.work-operations-view').forEach(sec=>{const code=sec.dataset.workCode;if(!code)return;const depot=workOpsRole(sec,'depot-filter'),plant=workOpsRole(sec,'plant-filter'),project=workOpsRole(sec,'project-filter'),search=workOpsRole(sec,'search'),clear=workOpsRole(sec,'clear'),refresh=workOpsRole(sec,'refresh');
    if(!sec.querySelector('.work-ops-contractor-card')){const c=document.createElement('div');c.className='work-ops-contractor-card';workOpsRole(sec,'alert')?.insertAdjacentElement('afterend',c)}
    const gb=workOpsRole(sec,'guarantee-body');if(gb&&!sec.querySelector('.work-ops-guarantee-detail')){const d=document.createElement('div');d.className='work-ops-guarantee-detail';gb.closest('.table-wrap')?.insertAdjacentElement('beforebegin',d)}
    const controls=sec.querySelector('.work-ops-controls');if(controls&&!controls.querySelector('[data-role="export-excel"]')){const g=document.createElement('div');g.className='work-ops-toolbar-extra';g.innerHTML=`${code==='T'?'<button class="btn btn-ghost" data-role="new-project" type="button">+ Yeni Proje</button>':''}<button class="btn btn-export-excel" data-role="export-excel" type="button">Excel</button><button class="btn btn-export-pdf" data-role="export-pdf" type="button">PDF</button>`;const head=sec.querySelector('.work-report26 > .dashboard-card-head');if(['B','K','L','T'].includes(code)&&head)head.appendChild(g);else controls.appendChild(g)}
    const dt=workOpsRole(sec,'discovery-body')?.closest('table')?.querySelector('thead');if(dt)dt.innerHTML=`<tr><th>Depo</th>${code==='T'?'<th>Proje</th>':''}<th>Malzeme</th><th>Tanım</th><th>Birim</th><th class="num">Keşif</th><th class="num">Verilen</th><th class="num">Kalan</th><th>Durum</th></tr>`;
    const st=workOpsRole(sec,'spend-body')?.closest('table')?.querySelector('thead');if(st)st.innerHTML='<tr><th>Ay</th><th>Depo</th><th>Malzeme</th><th>Tanım</th><th>Birim</th><th class="num">Net Harcama</th></tr>';
    const gt=workOpsRole(sec,'guarantee-body')?.closest('table')?.querySelector('thead');if(gt)gt.innerHTML='<tr><th>ÜY</th><th>Depo</th><th>Tanım</th><th class="num">Ana Teminat</th><th class="num">Nakdi</th><th class="num">Manuel Artış</th><th class="num">Toplam</th><th class="num">Stok</th><th class="num">Kullanılabilir</th></tr>';
    if(plant)plant.onchange=()=>{if(depot)depot.value='';workOpsFillFilters(code,workOpsState[code]||{});workOpsRender(code)};if(depot)depot.onchange=()=>{workOpsFillFilters(code,workOpsState[code]||{});workOpsRender(code)};if(project)project.onchange=()=>workOpsProjectChanged(code);if(search)search.oninput=()=>workOpsRender(code);if(clear)clear.onclick=()=>{if(plant)plant.value='';if(depot)depot.value='';if(project)project.value='';if(search)search.value='';workOpsFillFilters(code,workOpsState[code]||{});workOpsRender(code)};if(refresh)refresh.onclick=()=>loadWorkOperations(code,true);
    if(['B','K','L','T'].includes(code))initWorkReportSection(sec,code);
    if(code==='T'){
      const wrap=sec.querySelector('.work-report26 > .table-wrap');
      if(wrap){wrap.addEventListener('scroll',()=>{const st=workReportState.T;if(st.qLoading||st.page>=st.pages)return;if(wrap.scrollTop+wrap.clientHeight>=wrap.scrollHeight-120){st.qAppend=true;st.page++;loadWorkReport('T')}});}
    }

    const ex=workOpsRole(sec,'export-excel'),pdf=workOpsRole(sec,'export-pdf'),np=workOpsRole(sec,'new-project');if(ex)ex.onclick=async()=>{try{if(['B','K','L','T'].includes(code)){const payload=await collectActiveWorkReport(code);DecisionExport.downloadWorkReportExcel(payload);toast(`${payload.title} Excel raporu hazırlandı.`,'success');}else{DecisionExport.downloadWorkOpsExcel(workOpsExportPayload(code));toast('Excel raporu hazırlandı.','success')}}catch(e){toast('Excel aktarım hatası: '+e.message,'error')}};if(pdf)pdf.onclick=async()=>{let win=null;try{if(['B','K','L','T'].includes(code)){win=window.open('','_blank');if(!win)throw new Error('PDF penceresi engellendi. Açılır pencerelere izin verin.');win.document.write('<p>Filtrelenmiş rapor hazırlanıyor…</p>');const payload=await collectActiveWorkReport(code);DecisionExport.printWorkReportPdf(payload,win)}else DecisionExport.printWorkOpsPdf(workOpsExportPayload(code))}catch(e){try{win?.close()}catch(_){}toast('PDF aktarım hatası: '+e.message,'error')}};if(np)np.onclick=openNewTesisProjectModal;
  })
}
let dashboardCurrentData=null;
let dashboardLoading=false;
const dashboardFilterState={company:'',depot:'',depotLabel:'',workType:'',options:{companies:[],depots:[],workTypes:[]},companyActive:-1,depotActive:-1};
function dashboardRangeLabel(days){const n=Number(days);return n===7?'Son 7 Gün':n===30?'Son 30 Gün':n===90?'Son 90 Gün':n===365?'Son 1 Yıl':'Tüm Kayıtlar'}
function setDashboardAlert(text,type=''){const el=$('#dashboardAlert');if(!el)return;el.textContent=text||'';el.className='dashboard-alert'+(type?' '+type:'');el.hidden=!text}
function dashboardBarList(el,items){if(!el)return;const arr=Array.isArray(items)?items:[];if(!arr.length){el.innerHTML='<div class="dashboard-no-data">Bu dönem için veri yok.</div>';return}const max=Math.max(...arr.map(x=>Number(x.value)||0),1);el.innerHTML=arr.map(x=>`<div class="dashboard-bar-row"><span class="label" title="${dashEsc(x.label)}">${dashEsc(x.label)}</span><div class="dashboard-bar-track"><div class="dashboard-bar-fill" style="width:${Math.max(4,(Number(x.value)||0)/max*100)}%"></div></div><strong>${dashInt(x.value)}</strong></div>`).join('')}
function dashboardRankList(el,items){if(!el)return;const arr=Array.isArray(items)?items:[];if(!arr.length){el.innerHTML='<div class="dashboard-no-data">Bu dönem için veri yok.</div>';return}el.innerHTML=arr.map((x,i)=>`<div class="dashboard-rank-item"><span class="dashboard-rank-no">${i+1}</span><span class="dashboard-rank-label" title="${dashEsc(x.label)}">${dashEsc(x.label)}</span><strong>${dashInt(x.value)}</strong></div>`).join('')}
function renderDashboardTrend(items){const el=$('#dashTrendChart');if(!el)return;const arr=(Array.isArray(items)?items:[]).slice(-90);if(!arr.length){el.innerHTML='<div class="dashboard-no-data">Henüz tarih serisi oluşmadı.</div>';return}const W=760,H=220,pad={l:34,r:14,t:18,b:34},iw=W-pad.l-pad.r,ih=H-pad.t-pad.b,max=Math.max(...arr.map(x=>Number(x.count)||0),1);const x=i=>pad.l+(arr.length===1?iw/2:i*iw/(arr.length-1)),y=v=>pad.t+ih-(Number(v)||0)*ih/max;let path='';arr.forEach((d,i)=>{path+=(i?' L ':'M ')+x(i).toFixed(1)+' '+y(d.count).toFixed(1)});const area=path+` L ${x(arr.length-1).toFixed(1)} ${pad.t+ih} L ${x(0).toFixed(1)} ${pad.t+ih} Z`;const grid=[0,.25,.5,.75,1].map(r=>`<line class="dashboard-chart-grid" x1="${pad.l}" y1="${(pad.t+ih-r*ih).toFixed(1)}" x2="${W-pad.r}" y2="${(pad.t+ih-r*ih).toFixed(1)}"/><text class="dashboard-chart-label" x="${pad.l-7}" y="${(pad.t+ih-r*ih+3).toFixed(1)}" text-anchor="end">${Math.round(max*r)}</text>`).join('');const step=Math.max(1,Math.ceil(arr.length/7));const labels=arr.map((d,i)=>i%step===0||i===arr.length-1?`<text class="dashboard-chart-label" x="${x(i).toFixed(1)}" y="${H-9}" text-anchor="middle">${dashEsc(String(d.date||'').slice(5).replace('-','.'))}</text>`:'').join('');const dots=arr.length<=31?arr.map((d,i)=>`<circle class="dashboard-chart-dot" cx="${x(i).toFixed(1)}" cy="${y(d.count).toFixed(1)}" r="3"><title>${dashEsc(d.date)}: ${dashInt(d.count)} kontrol</title></circle>`).join(''):'';el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Günlük kontrol aktivitesi"><defs><linearGradient id="dashAreaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4c84cf" stop-opacity=".22"/><stop offset="1" stop-color="#4c84cf" stop-opacity=".02"/></linearGradient></defs>${grid}<path class="dashboard-chart-area" d="${area}"/><path class="dashboard-chart-line" d="${path}"/>${dots}${labels}</svg>`}
function dashboardSelectedDepot(){return (dashboardFilterState.options.depots||[]).find(x=>x.key===dashboardFilterState.depot&&(!dashboardFilterState.company||x.company===dashboardFilterState.company))||null}
function dashboardEligibleDepots(){return (dashboardFilterState.options.depots||[]).filter(x=>(!dashboardFilterState.company||x.company===dashboardFilterState.company)&&(!dashboardFilterState.workType||(Array.isArray(x.workTypes)?x.workTypes.includes(dashboardFilterState.workType):x.workType===dashboardFilterState.workType)))}
function closeDashboardFilterResults(kind='all'){
  if(kind==='all'||kind==='company'){const b=$('#dashboardCompanyResults'),i=$('#dashboardCompanyInput');if(b){b.hidden=true;b.innerHTML=''}if(i)i.setAttribute('aria-expanded','false');dashboardFilterState.companyActive=-1}
  if(kind==='all'||kind==='depot'){const b=$('#dashboardDepotResults'),i=$('#dashboardDepotInput');if(b){b.hidden=true;b.innerHTML=''}if(i)i.setAttribute('aria-expanded','false');dashboardFilterState.depotActive=-1}
}
function setDashboardFilterActive(kind,index){const box=$(kind==='company'?'#dashboardCompanyResults':'#dashboardDepotResults');if(!box||box.hidden)return;const opts=[...box.querySelectorAll('.dashboard-filter-option')];if(!opts.length)return;index=Math.max(0,Math.min(opts.length-1,index));dashboardFilterState[kind+'Active']=index;opts.forEach((o,i)=>o.classList.toggle('active',i===index));opts[index].scrollIntoView({block:'nearest'})}
function renderDashboardCompanyResults(forceAll=false){const box=$('#dashboardCompanyResults'),input=$('#dashboardCompanyInput');if(!box||!input)return;const q=normalizeSearchText(input.value).trim();const all=dashboardFilterState.options.companies||[];const arr=(forceAll||!q?all:all.filter(x=>normalizeSearchText(x).includes(q))).slice(0,60);dashboardFilterState.companyActive=-1;box.innerHTML=arr.length?arr.map((x,i)=>`<button type="button" class="dashboard-filter-option" role="option" data-index="${i}" data-value="${dashEsc(x)}"><strong>${dashEsc(x)}</strong></button>`).join(''):'<div class="dashboard-filter-empty">Yüklenici bulunamadı.</div>';box.hidden=false;input.setAttribute('aria-expanded','true');box.querySelectorAll('.dashboard-filter-option').forEach(b=>b.onclick=e=>{e.preventDefault();selectDashboardCompany(b.dataset.value||'')})}
function renderDashboardDepotResults(forceAll=false){const box=$('#dashboardDepotResults'),input=$('#dashboardDepotInput');if(!box||!input)return;const q=normalizeSearchText(input.value).trim();const all=dashboardEligibleDepots();const arr=(forceAll||!q?all:all.filter(x=>normalizeSearchText([x.label,x.key,x.company,x.workType,x.contract].join(' ')).includes(q))).slice(0,80);dashboardFilterState.depotActive=-1;box.innerHTML=arr.length?arr.map((x,i)=>`<button type="button" class="dashboard-filter-option" role="option" data-index="${i}" data-key="${dashEsc(x.key)}" data-company="${dashEsc(x.company)}"><strong>${dashEsc(x.label)}</strong><small>${dashEsc(x.company||'Tanımsız Firma')}${(Array.isArray(x.workTypes)&&x.workTypes.length)?` • ${dashEsc(x.workTypes.join(', '))}`:(x.workType?` • ${dashEsc(x.workType)}`:'')}${x.contract?` • ${dashEsc(x.contract)}`:''}</small></button>`).join(''):'<div class="dashboard-filter-empty">Seçili filtrelere uygun depo bulunamadı.</div>';box.hidden=false;input.setAttribute('aria-expanded','true');box.querySelectorAll('.dashboard-filter-option').forEach(b=>b.onclick=e=>{e.preventDefault();selectDashboardDepot(b.dataset.key||'',b.dataset.company||'')})}
function selectDashboardCompany(value,{autoLoad=true}={}){dashboardFilterState.company=String(value||'');dashboardFilterState.depot='';dashboardFilterState.depotLabel='';const ci=$('#dashboardCompanyInput'),di=$('#dashboardDepotInput');if(ci)ci.value=dashboardFilterState.company;if(di)di.value='';closeDashboardFilterResults('company');const eligible=dashboardEligibleDepots();if(eligible.length===1){dashboardFilterState.depot=eligible[0].key;dashboardFilterState.depotLabel=eligible[0].label;if(di)di.value=eligible[0].label}updateDashboardScope();if(autoLoad)loadDashboardView()}
function selectDashboardDepot(key,company='',{autoLoad=true}={}){const all=dashboardFilterState.options.depots||[];const item=all.find(x=>x.key===key&&(!company||x.company===company))||all.find(x=>x.key===key);if(!item)return;dashboardFilterState.depot=item.key;dashboardFilterState.depotLabel=item.label;if(item.company){dashboardFilterState.company=item.company;const ci=$('#dashboardCompanyInput');if(ci)ci.value=item.company}const di=$('#dashboardDepotInput');if(di)di.value=item.label;closeDashboardFilterResults('depot');updateDashboardScope();if(autoLoad)loadDashboardView()}
function resetDashboardEntityFilters({reload=true}={}){dashboardFilterState.company='';dashboardFilterState.depot='';dashboardFilterState.depotLabel='';dashboardFilterState.workType='';const ci=$('#dashboardCompanyInput'),di=$('#dashboardDepotInput'),wt=$('#dashboardWorkType');if(ci)ci.value='';if(di)di.value='';if(wt)wt.value='';closeDashboardFilterResults();updateDashboardScope();if(reload)loadDashboardView()}
function syncDashboardFilterOptions(options){const o=options||{};dashboardFilterState.options={companies:Array.isArray(o.companies)?o.companies:[],depots:Array.isArray(o.depots)?o.depots:[],workTypes:Array.isArray(o.workTypes)?o.workTypes:[]};const wt=$('#dashboardWorkType');if(wt){const current=dashboardFilterState.workType;wt.innerHTML='<option value="">Tüm İş Türleri</option>'+dashboardFilterState.options.workTypes.map(x=>`<option value="${dashEsc(x)}">${dashEsc(x)}</option>`).join('');if(current&&dashboardFilterState.options.workTypes.includes(current))wt.value=current;else{dashboardFilterState.workType='';wt.value=''}}if(dashboardFilterState.company&&!dashboardFilterState.options.companies.includes(dashboardFilterState.company)){dashboardFilterState.company='';dashboardFilterState.depot='';dashboardFilterState.depotLabel='';const ci=$('#dashboardCompanyInput'),di=$('#dashboardDepotInput');if(ci)ci.value='';if(di)di.value=''}if(dashboardFilterState.depot&&!dashboardSelectedDepot()){dashboardFilterState.depot='';dashboardFilterState.depotLabel='';const di=$('#dashboardDepotInput');if(di)di.value=''}updateDashboardScope()}
function dashboardQueryString(){const p=new URLSearchParams();p.set('days',$('#dashboardRange')?.value||'30');if(dashboardFilterState.company)p.set('company',dashboardFilterState.company);if(dashboardFilterState.depot)p.set('depot',dashboardFilterState.depot);if(dashboardFilterState.workType)p.set('workType',dashboardFilterState.workType);return p.toString()}
function updateDashboardScope(){const banner=$('#dashboardScopeBanner'),depot=dashboardSelectedDepot(),company=dashboardFilterState.company,workType=dashboardFilterState.workType,range=dashboardRangeLabel($('#dashboardRange')?.value||30);if(banner){banner.className='dashboard-scope-banner'+(depot?' depot-selected':company?' company-selected':'');if(depot){banner.innerHTML=`<strong>${dashEsc(depot.label)}</strong><span>${dashEsc(company||depot.company||'')} • ${dashEsc(workType||depot.workType||'Tüm iş türleri')} • ${dashEsc(range)}</span>`}else if(company){banner.innerHTML=`<strong>${dashEsc(company)}</strong><span>${dashEsc(range)} • Depo seçerek Excel / PDF / JPG dışa aktarımını etkinleştirin.</span>`}else{banner.innerHTML=`<strong>Genel görünüm</strong><span>${dashEsc(range)} • Yüklenici ve depo seçerek dashboardu daraltabilirsiniz. Dışa aktarım için depo seçimi zorunludur.</span>`}}updateDashboardExportState()}
function updateDashboardExportState(){const enabled=!dashboardLoading&&!!dashboardFilterState.depot&&!!dashboardCurrentData&&(Number(dashboardCurrentData.metrics?.totalControls)||0)>0;['#dashboardExportExcelBtn','#dashboardExportPdfBtn','#dashboardExportJpgBtn'].forEach(sel=>{const b=$(sel);if(!b)return;b.disabled=!enabled;b.title=enabled?'Seçili depoya ait dashboard raporunu dışa aktarır.':'Dışa aktarım için önce depo seçin.'})}
function renderDashboardContractorMaterials(){const all=Array.isArray(dashboardCurrentData?.contractorMaterials)?dashboardCurrentData.contractorMaterials:[];const q=normalizeSearchText($('#dashContractorMaterialSearch')?.value||'').trim();const arr=q?all.filter(x=>normalizeSearchText([x.company,x.target,x.code,x.desc,x.unit].join(' ')).includes(q)):all;$('#dashContractorMaterialsCount').textContent=dashInt(arr.length);const body=$('#dashContractorMaterialsBody');if(!body)return;body.innerHTML=arr.length?arr.map(x=>{const neg=Number(x.qty)<0||Number(x.amount)<0;return `<tr class="${neg?'operations-row-negative':''}"><td class="wrap" title="${dashEsc(x.company)}">${dashEsc(x.company||'—')}</td><td class="wrap">${dashEsc(x.target||'—')}</td><td class="nowrap"><strong>${dashEsc(x.code||'—')}</strong></td><td class="wrap" title="${dashEsc(x.desc)}">${dashEsc(x.desc||'—')}</td><td class="num nowrap">${new Intl.NumberFormat('tr-TR',{maximumFractionDigits:3}).format(Number(x.qty)||0)}</td><td>${dashEsc(x.unit||'—')}</td><td class="num nowrap">${dashMoney(x.amount)}</td><td>${neg?'<span class="negative-pill">Negatif</span>':'<span class="neutral-pill">Normal</span>'}</td><td class="num">${dashInt(x.controls)}</td><td class="nowrap">${dashEsc(x.lastDate||'—')}</td></tr>`}).join(''):`<tr><td colspan="10"><div class="dashboard-no-data">${q?'Aramaya uygun yüklenici / malzeme kaydı bulunamadı.':'Bu dönem için yüklenici / malzeme kaydı yok.'}</div></td></tr>`}
function renderDashboardProjectDistributions(){const all=Array.isArray(dashboardCurrentData?.projectDistributions)?dashboardCurrentData.projectDistributions:[];const q=normalizeSearchText($('#dashProjectSearch')?.value||'').trim();const arr=q?all.filter(x=>normalizeSearchText([x.company,x.target,x.reservation,x.projectCode,x.projectName,x.materialCode,x.materialDesc,x.status].join(' ')).includes(q)):all;$('#dashProjectDistributionCount').textContent=dashInt(arr.length);const body=$('#dashProjectDistributionBody');if(!body)return;body.innerHTML=arr.length?arr.map(x=>{const neg=[x.projectDiscovery,x.distributed,x.projectRemaining].some(v=>Number(v)<0);return `<tr class="${neg?'operations-row-negative':''}"><td class="wrap" title="${dashEsc(x.company)}">${dashEsc(x.company||'—')}</td><td class="nowrap">${dashEsc(x.reservation||'—')}</td><td class="wrap" title="${dashEsc((x.projectCode?x.projectCode+' — ':'')+(x.projectName||''))}">${dashEsc(x.projectName||'—')}</td><td class="wrap"><strong>${dashEsc(x.materialCode||'—')}</strong>${x.materialDesc?`<br><span class="muted">${dashEsc(x.materialDesc)}</span>`:''}</td><td class="num nowrap">${new Intl.NumberFormat('tr-TR',{maximumFractionDigits:3}).format(Number(x.projectDiscovery)||0)} ${dashEsc(x.unit||'')}</td><td class="num nowrap">${new Intl.NumberFormat('tr-TR',{maximumFractionDigits:3}).format(Number(x.distributed)||0)} ${dashEsc(x.unit||'')}</td><td class="num nowrap">${new Intl.NumberFormat('tr-TR',{maximumFractionDigits:3}).format(Number(x.projectRemaining)||0)} ${dashEsc(x.unit||'')}</td><td>${neg?'<span class="negative-pill">Negatif</span>':'<span class="neutral-pill">Normal</span>'}</td><td><span class="dashboard-result-pill ${norm(x.status)==='uygun'?'ready':'review'}">${dashEsc(x.status||'—')}</span></td></tr>`}).join(''):`<tr><td colspan="9"><div class="dashboard-no-data">${q?'Aramaya uygun proje dağılımı bulunamadı.':'Bu dönem için TESİS proje dağılımı kaydı yok.'}</div></td></tr>`}
function renderDashboard(data){dashboardCurrentData=data;syncDashboardFilterOptions(data.filterOptions);const m=data.metrics||{},total=Number(m.totalControls)||0;$('#dashboardEmpty').hidden=total>0;$('#dashboardContent').hidden=total===0;$('#dashboardEmptyPath').textContent=data.recordRoot||'—';if(!total){setDashboardAlert(data.warnings?.length?`${data.warnings.length} CSV dosyası okunamadı.`:'Seçili filtrelerde kayıt bulunamadı.','warn');updateDashboardExportState();return}const ready=Number(m.decisionReady)||0,review=Number(m.reviewRequired)||0;$('#dashTotalControls').textContent=dashInt(total);$('#dashTodayControls').textContent=`Bugün ${dashInt(m.todayControls)} kontrol`;$('#dashDecisionReady').textContent=dashInt(ready);$('#dashReviewRequired').textContent=dashInt(review);$('#dashDecisionReadyPct').textContent=dashPct(total?ready/total*100:0,0);$('#dashReviewPct').textContent=dashPct(total?review/total*100:0,0);$('#dashDemandValue').textContent=dashMoney(m.totalDemandValue);$('#dashAvgGuarantee').textContent=dashPct(m.avgGuaranteeUsage);$('#dashUniqueFirms').textContent=dashInt(m.uniqueFirms);$('#dashMaterialRows').textContent=`${dashInt(m.materialRows)} malzeme satırı`;$('#dashGeneratedAt').textContent=`Güncelleme: ${data.generatedAt||'—'}`;$('#dashDonutTotal').textContent=dashInt(total);$('#dashLegendReady').textContent=dashInt(ready);$('#dashLegendReview').textContent=dashInt(review);const angle=total?ready/total*360:0;$('#dashDecisionDonut').style.setProperty('--ready',angle.toFixed(1)+'deg');renderDashboardTrend(data.daily);dashboardRankList($('#dashFirms'),data.firms);const mats=Array.isArray(data.materials)?data.materials:[];$('#dashMaterials').innerHTML=mats.length?mats.map(x=>`<div class="dashboard-material-item"><div><div class="dashboard-material-code">${dashEsc(x.code)}</div><div class="dashboard-material-desc" title="${dashEsc(x.desc)}">${dashEsc(x.desc||'Tanım yok')}</div><div class="dashboard-material-meta">${dashInt(x.controls)} kontrol • ${new Intl.NumberFormat('tr-TR',{maximumFractionDigits:2}).format(Number(x.qty)||0)} ${dashEsc(x.unit)}</div></div><div class="dashboard-material-amount">${dashMoney(x.amount)}</div></div>`).join(''):'<div class="dashboard-no-data">Bu dönem için malzeme detayı yok.</div>';const latest=Array.isArray(data.latest)?data.latest:[];$('#dashLatestBody').innerHTML=latest.map(x=>`<tr><td>${dashEsc(x.time)}</td><td>${dashEsc(x.mode)}</td><td>${dashEsc(x.reservation||'—')}</td><td>${dashEsc(x.target||'—')}</td><td title="${dashEsc(x.company)}">${dashEsc(x.company||'—')}</td><td class="num">${dashMoney(x.demand)}</td><td><span class="dashboard-result-pill ${String(x.result||'').includes('KARAR VERILEBILIR')?'ready':'review'}">${dashEsc(x.result||'—')}</span></td></tr>`).join('');renderDashboardContractorMaterials();renderDashboardProjectDistributions();$('#dashboardFootnote').textContent=`CSV Arşivi: ${data.recordRoot||'—'} • Yüklenici/Malzeme: ${dashInt(m.contractorMaterialRows||0)} satır • Proje Dağılımı: ${dashInt(m.projectRows||0)} satır${data.warnings?.length?` • ${data.warnings.length} dosya okunamadı; diğer kayıtlar gösterildi.`:''}`;setDashboardAlert(data.warnings?.length?`${data.warnings.length} CSV dosyası okunamadı. Sağlıklı kayıtlar dashboard'a dahil edildi.`:'',data.warnings?.length?'warn':'');updateDashboardScope()}
function dashboardExportPayload(){if(!dashboardFilterState.depot){toast('Excel / PDF / JPG dışa aktarımı için önce bir depo seçin.');return null}if(!dashboardCurrentData||(Number(dashboardCurrentData.metrics?.totalControls)||0)===0)return null;const depot=dashboardSelectedDepot();return{...dashboardCurrentData,rangeLabel:dashboardRangeLabel(dashboardCurrentData.days),exportedAt:new Date().toLocaleString('tr-TR'),selectedCompany:dashboardFilterState.company||depot?.company||'',selectedDepot:dashboardFilterState.depot,selectedDepotLabel:dashboardFilterState.depotLabel||depot?.label||'',selectedWorkType:dashboardFilterState.workType||depot?.workType||''}}
function exportDashboardExcel(){const payload=dashboardExportPayload();if(!payload)return;if(!window.DecisionExport?.downloadDashboardExcel)return toast('Dashboard Excel bileşeni yüklenemedi.');try{DecisionExport.downloadDashboardExcel(payload);toast('Seçili depo için Dashboard Excel dosyası hazırlandı.')}catch(e){console.error(e);toast('Excel dışa aktarım hatası: '+e.message)}}
function exportDashboardPdf(){const payload=dashboardExportPayload();if(!payload)return;if(!window.DecisionExport?.printDashboardPdf)return toast('Dashboard PDF bileşeni yüklenemedi.');try{DecisionExport.printDashboardPdf(payload)}catch(e){console.error(e);toast('PDF dışa aktarım hatası: '+e.message)}}
async function exportDashboardJpg(){const payload=dashboardExportPayload();if(!payload)return;if(!window.DecisionExport?.downloadDashboardJpg)return toast('Dashboard JPG bileşeni yüklenemedi.');try{await DecisionExport.downloadDashboardJpg(payload);toast('Seçili depo için Dashboard JPG görseli hazırlandı.')}catch(e){console.error(e);toast('JPG dışa aktarım hatası: '+e.message)}}
let operationsCurrentData=null;
let operationsSelectedDepot='';
let projectLifecycleCurrent=null;
function operationsStatusPill(status){const st=String(status||'AKTIF').toUpperCase();const label={AKTIF:'Aktif',TAMAMLANDI:'Tamamlandı',IPTAL:'İptal',REVIZE:'Revize'}[st]||st;return `<span class="project-status-pill ${st.toLowerCase()}">${dashEsc(label)}</span>`}
function renderOperationsSpend(items){
  const el=$('#opsSpendChart');if(!el)return;const arr=Array.isArray(items)?items:[];
  if(!arr.length){el.innerHTML='<div class="dashboard-no-data">MB51 aylık harcama verisi bulunamadı.</div>';return}
  const W=720,H=250,p={l:66,r:18,t:18,b:38},iw=W-p.l-p.r,ih=H-p.t-p.b,vals=arr.map(x=>Number(x.netSpend)||0),min=Math.min(0,...vals),max=Math.max(1,...vals),span=Math.max(1,max-min);
  const x=i=>p.l+(arr.length===1?iw/2:i*iw/(arr.length-1)),y=v=>p.t+ih-((Number(v)||0)-min)*ih/span;
  let path='';arr.forEach((d,i)=>path+=(i?' L ':'M ')+x(i).toFixed(1)+' '+y(d.netSpend).toFixed(1));const base=y(0),area=path+` L ${x(arr.length-1).toFixed(1)} ${base.toFixed(1)} L ${x(0).toFixed(1)} ${base.toFixed(1)} Z`;
  const grid=[0,.25,.5,.75,1].map(r=>{const val=min+span*r,yy=y(val);return `<line class="operations-spend-grid" x1="${p.l}" y1="${yy.toFixed(1)}" x2="${W-p.r}" y2="${yy.toFixed(1)}"/><text class="operations-spend-label" x="${p.l-8}" y="${(yy+3).toFixed(1)}" text-anchor="end">${dashInt(val/1000)}K</text>`}).join('');
  const labels=arr.map((d,i)=>`<text class="operations-spend-label" x="${x(i).toFixed(1)}" y="${H-10}" text-anchor="middle">${dashEsc(String(d.month||'').slice(2).replace('-','/'))}</text>`).join('');
  const dots=arr.map((d,i)=>`<circle class="operations-spend-dot" tabindex="0" cx="${x(i).toFixed(1)}" cy="${y(d.netSpend).toFixed(1)}" r="4"><title>${dashEsc(d.month)} • ${dashMoney(d.netSpend)} • ${dashInt(d.events||0)} hareket</title></circle>`).join('');
  el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Aylık net harcama grafiği">${grid}<line class="operations-spend-zero" x1="${p.l}" y1="${base.toFixed(1)}" x2="${W-p.r}" y2="${base.toFixed(1)}"/><path class="operations-spend-area" d="${area}"/><path class="operations-spend-line" d="${path}"/>${dots}${labels}</svg>`;
}
function operationsSpendSeriesForDepot(depot){const d=operationsCurrentData||{};if(!depot)return d.monthlySpend||[];return (d.monthlyByDepot||[]).filter(x=>String(x.dy||'')===String(depot)).sort((a,b)=>String(a.month||'').localeCompare(String(b.month||'')))}
function renderOperationsSelectedSpend(){const depot=operationsSelectedDepot;renderOperationsSpend(operationsSpendSeriesForDepot(depot));const scope=$('#opsSpendScope');if(scope)scope.innerHTML=depot?`<strong>${dashEsc(depot)}</strong><span>Seçili depo • Teminat tablosundan değiştirilebilir</span>`:'<strong>Genel</strong><span>Tüm depolar</span>';const btn=$('#opsSpendGeneralBtn');if(btn)btn.disabled=!depot}
function renderOperationsGuaranteeRows(){const d=operationsCurrentData||{},rows=Array.isArray(d.guarantee?.rows)?d.guarantee.rows:[],q=normalizeSearchText($('#opsGuaranteeSearch')?.value||'').trim(),st=$('#opsGuaranteeStatus')?.value||'';const arr=rows.filter(r=>{if(q&&!normalizeSearchText([r.uy,r.dy,r.dyDesc].join(' ')).includes(q))return false;const a=Number(r.available)||0;if(st==='positive'&&a<=0)return false;if(st==='nonpositive'&&a>0)return false;return true});const gb=$('#opsGuaranteeBody');if(!gb)return;gb.innerHTML=arr.length?arr.slice(0,250).map(r=>`<tr class="${operationsSelectedDepot===String(r.dy||'')?'operations-row-selected':''}"><td>${dashEsc(r.uy||'—')}</td><td><button class="ops-depot-link" type="button" data-depot="${dashEsc(r.dy||'')}">${dashEsc(r.dy||'—')}</button></td><td class="wrap">${dashEsc(r.dyDesc||'—')}</td><td class="num">${dashMoney((Number(r.main)||0)+(Number(r.cash)||0)+(Number(r.manual)||0))}</td><td class="num">${dashMoney(r.stockValue)}</td><td class="num"><strong>${dashMoney(r.available)}</strong></td></tr>`).join(''):'<tr><td colspan="6"><div class="dashboard-no-data">Filtrelere uygun ZMM098 teminat kaydı yok.</div></td></tr>';gb.querySelectorAll('.ops-depot-link').forEach(b=>b.onclick=()=>{operationsSelectedDepot=b.dataset.depot||'';renderOperationsGuaranteeRows();renderOperationsSelectedSpend()})}
function syncOperationsSpendMonths(){const sel=$('#opsSpendMonth');if(!sel)return;const cur=sel.value,months=[...new Set((operationsCurrentData?.monthlyByDepot||[]).map(x=>String(x.month||'')).filter(Boolean))].sort().reverse();sel.innerHTML='<option value="">Tüm Aylar</option>'+months.map(m=>`<option value="${dashEsc(m)}">${dashEsc(m)}</option>`).join('');if(months.includes(cur))sel.value=cur}
function renderOperationsMonthlyTable(){const all=Array.isArray(operationsCurrentData?.monthlyByDepot)?operationsCurrentData.monthlyByDepot:[],month=$('#opsSpendMonth')?.value||'',q=normalizeSearchText($('#opsSpendDepotSearch')?.value||'').trim(),sign=$('#opsSpendSign')?.value||'';const arr=all.filter(r=>{if(month&&String(r.month||'')!==month)return false;if(q&&!normalizeSearchText(r.dy||'').includes(q))return false;const n=Number(r.netSpend)||0;if(sign==='positive'&&n<0)return false;if(sign==='negative'&&n>=0)return false;return true}).sort((a,b)=>String(b.month||'').localeCompare(String(a.month||''))||String(a.dy||'').localeCompare(String(b.dy||'')));const body=$('#opsDepotSpendBody');if(!body)return;body.innerHTML=arr.length?arr.slice(0,1000).map(r=>`<tr class="${Number(r.netSpend)<0?'operations-row-negative':''}"><td class="nowrap">${dashEsc(r.month||'—')}</td><td><button type="button" class="ops-depot-link" data-depot="${dashEsc(r.dy||'')}">${dashEsc(r.dy||'—')}</button></td><td class="num">${dashMoney(r.grossSpend)}</td><td class="num">${dashMoney(r.reversal222)}</td><td class="num">${dashMoney(r.returnZ22)}</td><td class="num"><strong>${dashMoney(r.netSpend)}</strong></td><td class="num">${dashInt(r.events)}</td></tr>`).join(''):'<tr><td colspan="7"><div class="dashboard-no-data">Filtrelere uygun aylık harcama hareketi bulunamadı.</div></td></tr>';body.querySelectorAll('.ops-depot-link').forEach(b=>b.onclick=()=>{operationsSelectedDepot=b.dataset.depot||'';renderOperationsGuaranteeRows();renderOperationsSelectedSpend();document.querySelector('.operations-guarantee-spend-grid')?.scrollIntoView({behavior:'smooth',block:'start'})})}
function renderOperationsProjectManage(){const all=Array.isArray(operationsCurrentData?.projectSummary)?operationsCurrentData.projectSummary:[],q=normalizeSearchText($('#opsProjectManageSearch')?.value||'').trim(),status=$('#opsProjectManageStatus')?.value||'';const arr=all.filter(r=>(!q||normalizeSearchText([r.target,r.projectCode,r.projectName].join(' ')).includes(q))&&(!status||String(r.lifecycleStatus||'AKTIF')===status));const body=$('#opsProjectManageBody');if(!body)return;body.innerHTML=arr.length?arr.map((r,i)=>`<tr><td>${dashEsc(r.target||'—')}</td><td class="wrap"><strong>${dashEsc(r.projectName||'—')}</strong></td><td>${operationsStatusPill(r.lifecycleStatus)}</td><td class="num">${dashInt(r.lifecycleRevision||0)}</td><td class="nowrap">${dashEsc(r.lifecycleUpdatedAt?String(r.lifecycleUpdatedAt).replace('T',' ').slice(0,16):'—')}</td><td><button class="btn btn-ghost ops-project-edit" data-index="${i}" type="button">Düzenle</button></td></tr>`).join(''):'<tr><td colspan="6"><div class="dashboard-no-data">Filtrelere uygun TESİS projesi bulunamadı.</div></td></tr>';body.querySelectorAll('.ops-project-edit').forEach(b=>b.onclick=()=>openProjectLifecycleModal(arr[Number(b.dataset.index)||0]))}
function openProjectLifecycleModal(project){if(!project)return;projectLifecycleCurrent=project;const modal=$('#projectLifecycleModal');if(!modal)return;$('#projectLifecycleTitle').textContent='Proje Durumunu Düzenle';$('#projectLifecycleMeta').innerHTML=`<strong>${dashEsc(project.target||'—')}</strong><span>${dashEsc((project.projectCode?project.projectCode+' — ':'')+(project.projectName||'—'))}</span><small>Mevcut durum: ${dashEsc(project.lifecycleStatus||'AKTIF')} • Revizyon: ${dashInt(project.lifecycleRevision||0)}</small>`;$('#projectLifecycleStatus').value=project.lifecycleStatus||'AKTIF';$('#projectLifecycleReason').value='';modal.hidden=false;modal.setAttribute('aria-hidden','false')}
function closeProjectLifecycleModal(){const modal=$('#projectLifecycleModal');if(modal){modal.hidden=true;modal.setAttribute('aria-hidden','true')}projectLifecycleCurrent=null}
async function saveProjectLifecycle(){if(!projectLifecycleCurrent)return;const status=$('#projectLifecycleStatus')?.value||'AKTIF',reason=$('#projectLifecycleReason')?.value?.trim()||'',btn=$('#projectLifecycleSave');if((status==='IPTAL'||status==='REVIZE')&&!reason)return toast('İptal ve Revize için gerekçe zorunludur.');if(btn)btn.disabled=true;try{await fetchApiJson('/api/project-lifecycle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({depot:projectLifecycleCurrent.target,projectCode:projectLifecycleCurrent.projectCode,projectName:projectLifecycleCurrent.projectName,status,reason})},15000);toast('TESİS proje durumu kaydedildi; geçmiş revizyon korundu.');closeProjectLifecycleModal();if($('#opsTesisView')?.classList.contains('active'))await loadWorkOperations('T',true);else await loadDashboardView()}catch(e){toast('Proje durumu kaydedilemedi: '+e.message)}finally{if(btn)btn.disabled=false}}
function renderOperations(data){
  operationsCurrentData=data||{};const d=operationsCurrentData,g=d.guarantee||{},cm=d.latestMonthSpend||{},flows=d.flows||{},projects=Array.isArray(d.projectSummary)?d.projectSummary:[];
  if(operationsSelectedDepot&&!((g.rows||[]).some(r=>String(r.dy||'')===operationsSelectedDepot)||(d.monthlyByDepot||[]).some(r=>String(r.dy||'')===operationsSelectedDepot)))operationsSelectedDepot='';
  $('#opsControlCount').textContent=dashInt(d.controlMetrics?.totalControls||0);$('#opsProjectCount').textContent=dashInt(projects.length);$('#opsProjectRows').textContent=`${dashInt(d.controlMetrics?.projectRows||0)} proje/malzeme satırı`;
  $('#opsGuaranteeAvailable').textContent=dashMoney(g.available||0);$('#opsGuaranteeMeta').textContent=g.ambiguous?'Mükerrer depo kaydı — kontrol gerekli':`${dashInt(g.rowCount||0)} ZMM098 depo kaydı`;
  $('#opsLatestSpend').textContent=dashMoney(cm.netSpend||0);$('#opsLatestSpendMonth').textContent=d.currentMonth?`${d.currentMonth} • ${dashInt(cm.spendEvents||0)} adet 221`:'Harcama verisi yok';
  $('#opsGuaranteeTotal').textContent=dashMoney(g.total||0);$('#opsGuaranteeStock').textContent=dashMoney(g.stockValue||0);$('#opsGuaranteeAvail2').textContent=dashMoney(g.available||0);
  renderOperationsGuaranteeRows();renderOperationsSelectedSpend();syncOperationsSpendMonths();renderOperationsMonthlyTable();
  const setFlow=(id,obj)=>{const el=$(id);if(el)el.textContent=dashInt(obj?.events||0)};setFlow('#opsFlowMain',flows.mainToContractor);setFlow('#opsFlowTransfer',flows.contractorTransfer);setFlow('#opsFlowPyp',flows.contractorToPyp);setFlow('#opsFlowExpense',flows.expense);setFlow('#opsFlowReturn',flows.returns);
  $('#opsDepotSpendSubtitle').textContent='Ay ve depo bazında 221 / 222 / Z22 net etkisi. Negatif değerler aynen gösterilir.';
  const pb=$('#opsProjectBody');if(pb)pb.innerHTML=projects.length?projects.slice(0,250).map(r=>`<tr><td class="wrap">${dashEsc(r.target||'—')}</td><td class="wrap"><strong>${dashEsc(r.projectName||'—')}</strong></td><td>${operationsStatusPill(r.lifecycleStatus)}</td><td class="num">${dashInt(r.controls)}</td><td class="num">${dashInt(r.materialRows)}</td><td class="nowrap">${dashEsc(r.lastControl||'—')}</td></tr>`).join(''):'<tr><td colspan="6"><div class="dashboard-no-data">Seçili kapsamda TESİS proje dağılım kaydı yok.</div></td></tr>';
  renderOperationsProjectManage();
  const note=$('#opsNote');if(note)note.textContent=(d.note||'')+(g.ambiguous?' • UYARI: Seçili depo için birden fazla ZMM098 satırı var; teminat toplamı karar amacıyla kullanılmamalıdır.':'');
}
async function loadDashboardView(){const btn=$('#dashboardRefreshBtn');dashboardLoading=true;updateDashboardExportState();if(btn){btn.disabled=true;btn.textContent='Yükleniyor…'}setDashboardAlert('Operasyon ve kontrol kayıtları hazırlanıyor…');try{const health=await getServiceHealth();if(!health)throw new Error('Yerel servis bağlantısı kurulamadı. Talep Kontrol uygulamasını yeniden açın.');if(health.app!=='Talep Kontrol')throw new Error('Yerel servis kimliği doğrulanamadı. Talep Kontrol uygulamasını yeniden açın.');if(!(health.capabilities&&health.capabilities.itemLevelDecision))throw new Error('Aynı sürümün eski yerel servis işlemi çalışıyor. Tüm Talep Kontrol pencerelerini kapatıp Talep Kontrol uygulamasını yeniden açın.');const retry=async(url,timeout=60000)=>{let last;for(let attempt=0;attempt<2;attempt++){try{return await fetchApiJson(url+(url.includes('?')?'&':'?')+'ts='+Date.now(),{},timeout)}catch(e){last=e;if(attempt===0)await sleep(450)}}throw last||new Error('Yerel servis yanıt vermedi.')};const qs=dashboardQueryString();const summary=await retry('/api/dashboard?compact=1&'+qs,60000);syncDashboardFilterOptions(summary.filterOptions);const [materialsResult,projectsResult,operationsResult]=await Promise.allSettled([retry('/api/dashboard-details?kind=materials&'+qs,60000),retry('/api/dashboard-details?kind=projects&'+qs,60000),retry('/api/operations?months=12&'+qs,60000)]);const data={...summary,contractorMaterials:[],projectDistributions:[]};const detailWarnings=[];if(materialsResult.status==='fulfilled')data.contractorMaterials=materialsResult.value.items||[];else detailWarnings.push('Yüklenici / malzeme detayları yüklenemedi.');if(projectsResult.status==='fulfilled')data.projectDistributions=projectsResult.value.items||[];else detailWarnings.push('Proje dağılımı detayları yüklenemedi.');if(operationsResult.status==='fulfilled')renderOperations(operationsResult.value);else{detailWarnings.push('Teminat / harcama operasyon verileri yüklenemedi.');renderOperations({note:'Operasyon verileri kullanılamıyor: '+String(operationsResult.reason?.message||operationsResult.reason||'')})}data.warnings=[...(Array.isArray(summary.warnings)?summary.warnings:[]),...detailWarnings];renderDashboard(data);if(detailWarnings.length)setDashboardAlert(detailWarnings.join(' ')+' Kullanılabilen bölümler gösteriliyor.','warn')}catch(e){console.error('Dashboard load error',e);let msg=String(e?.message||e||'Bilinmeyen hata');if(/failed to fetch/i.test(msg))msg='Yerel servis bağlantısı kesildi. Talep Kontrol uygulamasını yeniden açın.';setDashboardAlert('Operasyon İzleme yüklenemedi: '+msg,'bad');renderOperations({note:'Operasyon İzleme yüklenemedi: '+msg});$('#dashboardContent').hidden=true;$('#dashboardEmpty').hidden=false;$('#dashboardEmptyPath').textContent='Operasyon servisi kullanılamıyor. Ayarlar ekranındaki veri ve CSV kayıt klasörünü kontrol edin.'}finally{dashboardLoading=false;updateDashboardExportState();if(btn){btn.disabled=false;btn.textContent='Dashboard Yenile'}}}


function settingsStatus(el,text,type='neutral'){if(!el)return;el.textContent=text;el.className='settings-status '+type}
function showSettingsAlert(text,type=''){const el=$('#settingsAlert');if(!el)return;el.textContent=text;el.className='settings-alert'+(type?' '+type:'');el.hidden=!text}

function exemptionMaterialDescription(code){return state.ix.materialCatalog?.get(String(code||'').trim())?.materialDesc||''}
function clearExemptionForm(){
  if($('#exemptionMaterialCode'))$('#exemptionMaterialCode').value='';if($('#exemptionDiscovery'))$('#exemptionDiscovery').checked=false;if($('#exemptionGuarantee'))$('#exemptionGuarantee').checked=false;if($('#exemptionActive'))$('#exemptionActive').checked=true;if($('#exemptionDescription'))$('#exemptionDescription').value='';
}
function renderExemptionSettings(){
  const body=$('#exemptionTableBody'),status=$('#exemptionStatus');if(!body)return;
  const items=[...(state.data.exemptions||[])].sort((a,b)=>String(a.materialCode).localeCompare(String(b.materialCode),'tr',{numeric:true}));
  if(status){status.className='exemption-status muted';status.textContent=`${items.length} malzeme muaf listesinde.`}
  if(!items.length){body.innerHTML='<tr><td colspan="7" class="dashboard-no-data">Muaf listesi boş. Yukarıdan malzeme kodu ekleyebilirsiniz.</td></tr>';return}
  body.innerHTML=items.map(x=>`<tr class="${x.active?'':'exemption-passive'}"><td><strong>${esc(x.materialCode)}</strong></td><td>${esc(exemptionMaterialDescription(x.materialCode)||'—')}</td><td>${x.discoveryExempt?badge('Muaf','exempt'):badge('Normal','neutral')}</td><td>${x.guaranteeExempt?badge('Muaf','exempt'):badge('Normal','neutral')}</td><td>${x.active?badge('Aktif','ok'):badge('Pasif','neutral')}</td><td>${esc(x.description||'')}</td><td class="exemption-actions"><button type="button" class="exemption-edit-btn" data-code="${esc(x.materialCode)}">Düzenle</button><button type="button" class="exemption-delete-btn" data-code="${esc(x.materialCode)}">Sil</button></td></tr>`).join('');
  $$('.exemption-edit-btn').forEach(btn=>btn.onclick=()=>{const x=(state.data.exemptions||[]).find(v=>v.materialCode===btn.dataset.code);if(!x)return;$('#exemptionMaterialCode').value=x.materialCode;$('#exemptionDiscovery').checked=!!x.discoveryExempt;$('#exemptionGuarantee').checked=!!x.guaranteeExempt;$('#exemptionActive').checked=x.active!==false;$('#exemptionDescription').value=x.description||'';$('#exemptionMaterialCode').focus()});
  $$('.exemption-delete-btn').forEach(btn=>btn.onclick=async()=>{const code=btn.dataset.code;const next=(state.data.exemptions||[]).filter(x=>x.materialCode!==code);const st=$('#exemptionStatus');try{if(st){st.className='exemption-status muted';st.textContent=`${code} listeden çıkarılıyor…`}await saveExemptions(next);renderExemptionSettings();clearExemptionForm();await refreshCurrentAfterExemptionChange();toast(`${code} muaf listesinden çıkarıldı.`)}catch(e){if(st){st.className='exemption-status bad';st.textContent=e.message}toast('Muaf listesi kayıt hatası: '+e.message)}});
}
async function loadExemptionSettings(){
  const btn=$('#exemptionReloadBtn'),status=$('#exemptionStatus');if(btn)btn.disabled=true;if(status){status.className='exemption-status muted';status.textContent='Muaf listesi yenileniyor…'}
  try{await loadExemptions();buildIndexes();renderExemptionSettings();await refreshCurrentAfterExemptionChange()}catch(e){if(status){status.className='exemption-status bad';status.textContent='Muaf listesi yüklenemedi: '+e.message}}finally{if(btn)btn.disabled=false}
}
async function saveExemptionFromForm(){
  const code=String($('#exemptionMaterialCode')?.value||'').trim().replace(/\.0$/,''),discoveryExempt=!!$('#exemptionDiscovery')?.checked,guaranteeExempt=!!$('#exemptionGuarantee')?.checked,active=$('#exemptionActive')?.checked!==false,description=String($('#exemptionDescription')?.value||'').trim();
  const status=$('#exemptionStatus');if(!code){if(status){status.className='exemption-status bad';status.textContent='Malzeme kodu girilmelidir.'}return}
  if(!/^\d{5,20}$/.test(code)){if(status){status.className='exemption-status bad';status.textContent='Malzeme kodu yalnızca rakamlardan oluşmalıdır.'}return}
  if(!discoveryExempt&&!guaranteeExempt){if(status){status.className='exemption-status bad';status.textContent='Keşif veya Teminat muafiyetlerinden en az biri seçilmelidir.'}return}
  const items=[...(state.data.exemptions||[])];const idx=items.findIndex(x=>x.materialCode===code);const item={materialCode:code,discoveryExempt,guaranteeExempt,active,description};if(idx>=0)items[idx]=item;else items.push(item);
  const btn=$('#exemptionSaveBtn');if(btn){btn.disabled=true;btn.textContent='Kaydediliyor…'}
  try{await saveExemptions(items);renderExemptionSettings();clearExemptionForm();await refreshCurrentAfterExemptionChange();if(status){status.className='exemption-status ok';status.textContent=`${code} muaf listesine kaydedildi.`}toast(`${code} muaf listesine kaydedildi.`)}catch(e){if(status){status.className='exemption-status bad';status.textContent=e.message}toast('Muaf listesi kayıt hatası: '+e.message)}finally{if(btn){btn.disabled=false;btn.textContent='Listeye Ekle / Güncelle'}}
}
async function refreshCurrentAfterExemptionChange(){
  if(state.ui.mode==='reservation'&&state.ui.reservationNo){await renderReservation(state.ui.reservationNo);return}
  if(state.ui.mode==='manual'&&state.ui.manualReady){await renderManualWorkspace()}
}

function renderSettingsView(data){
  if(!data)return;
  $('#settingsDataRoot').textContent=data.dataRoot||'—';$('#settingsRecordRoot').textContent=data.recordRoot||'kayitlar';
  $('#settingsDataResolved').textContent=data.dataResolved||'—';$('#settingsRecordResolved').textContent=data.recordResolved||'—';
  settingsStatus($('#settingsDataStatus'),data.dataExists?'Klasör erişilebilir':'Klasör bulunamadı',data.dataExists?'good':'bad');
  settingsStatus($('#settingsRecordStatus'),data.recordReady?'Kayıt klasörü hazır':(data.recordError||'Kayıt klasörü kullanılamıyor'),data.recordReady?'good':'bad');
  const f=data.folders||{};$('#settingsHeaderFolder').textContent=f.header||'—';$('#settingsMaterialFolder').textContent=f.materials||'—';$('#settingsProjectFolder').textContent=f.projects||'—';
  const locked=!!data.folderChangeLocked;
  const dataBtn=$('#settingsDataChangeBtn'),recordBtn=$('#settingsRecordChangeBtn');
  if(dataBtn){dataBtn.disabled=locked;dataBtn.title=locked?'Merkezi dağıtımda veri klasörü kilitlidir.':'Windows klasör seçim penceresini açar';dataBtn.textContent=locked?'Kilitli':'Klasörü Değiştir'}
  if(recordBtn){recordBtn.disabled=locked;recordBtn.title=locked?'Merkezi dağıtımda kayıt klasörü kilitlidir.':'Windows klasör seçim penceresini açar';recordBtn.textContent=locked?'Kilitli':'Klasörü Değiştir'}
  const help=$('#settingsBundledFallbackHelp');
  if(help){
    help.innerHTML=data.bundledCsvFallback
      ? 'Bu klasörde uygun CSV bulunmazsa uygulama paket içindeki <strong>csv</strong> klasöründe içerik eşleşmesi arar. Tanınamayan dosyalar otomatik bağlanmaz.'
      : 'Katı dış kaynak modu açık: yalnız kurumsal ağ klasöründeki yetkili alt klasörler taranır; paket <strong>csv</strong> yedeği kullanılmaz.';
  }
  const warnings=[];
  if(data.dataEnvOverride)warnings.push('TALEP_DATA_ROOT ortam değişkeni aktif; VERI_KLASORU.txt bu oturumda öncelikli olmayabilir.');
  if(data.recordEnvOverride)warnings.push('TALEP_RECORD_ROOT ortam değişkeni aktif; KAYIT_KLASORU.txt bu oturumda öncelikli olmayabilir.');
  if(locked)warnings.push('Merkezi klasör kilidi etkin; “Klasörü Değiştir” kullanılamaz.');
  if(data.sharedWritesEnabled===false)warnings.push('Kesin kontrol kaydı bu dağıtımda kapalı (shared_writes_enabled=false).');
  if(data.appVersion)warnings.push('Uygulama sürümü: '+data.appVersion+(data.appBuild?' · '+data.appBuild:''));
  showSettingsAlert(warnings.filter(Boolean).join(' '),warnings.some(w=>w.includes('kilidi')||w.includes('kapalı')||w.includes('ortam'))?'warn':'');
  renderExemptionSettings();
}
async function fetchApiJson(url,options={},timeoutMs=4500){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const r=await fetch(url,{cache:'no-store',...options,signal:controller.signal});
    const text=await r.text();let data={};
    try{data=text?JSON.parse(text):{}}catch(_){throw new Error(`Yerel servis geçersiz yanıt verdi (${r.status}).`)}
    if(!r.ok||data.ok===false)throw new Error(data.error||`Yerel servis yanıtı başarısız (${r.status}).`);
    return data;
  }catch(e){
    if(e?.name==='AbortError')throw new Error('Yerel servis yanıt vermedi (zaman aşımı).');
    throw e;
  }finally{clearTimeout(timer)}
}
async function getServiceHealth(){
  try{return await fetchApiJson('/api/health?ts='+Date.now(),{},2500)}catch(_){return null}
}
async function settingsFallbackSnapshot(){
  const health=await getServiceHealth();
  let record=null;
  try{record=await fetchApiJson('/api/record-info?ts='+Date.now(),{},3500)}catch(_){record=null}
  const externalReady=Object.values(state.files||{}).some(x=>x?.origin==='external'&&(x.status==='ok'||x.status==='ready'));
  const dataRoot=state.meta.externalRoot||'';
  return{
    ok:true,dataRoot,dataResolved:dataRoot||'—',dataExists:externalReady,
    recordRoot:record?.recordRoot||'kayitlar',recordResolved:record?.recordRoot||'—',
    recordReady:!!record?.ok,recordError:record?.ok?'':'Kayıt klasörü bilgisi alınamadı.',folders:record?.folders||{},
    bundledRoot:state.meta.bundledRoot||'',dataEnvOverride:false,recordEnvOverride:false,
    appVersion:APP_VERSION,appBuild:String(health?.build||''),sharedWritesEnabled:health?.recordSecurity?.sharedWritesEnabled!==false,
    folderChangeLocked:false,bundledCsvFallback:true,
    _fallback:true,_health:health
  };
}
async function loadSettingsView(){
  const btn=$('#settingsReloadBtn');if(btn)btn.disabled=true;showSettingsAlert('Ayarlar okunuyor…');
  try{
    let data=null,directError=null;
    for(const url of ['/api/settings-info?ts='+Date.now(),'/api/settings?ts='+Date.now()]){
      try{data=await fetchApiJson(url,{},3500);break}catch(e){directError=e}
    }
    if(!data){data=await settingsFallbackSnapshot();state.meta.settingsFallback=true}else state.meta.settingsFallback=false;
    renderSettingsView(data);
    const health=data._health||await getServiceHealth();state.meta.serviceVersion=String(health?.version||'');
    if(data._fallback){
      const expected=String(data.appVersion||APP_VERSION||'').trim();
      if(health&&health.version&&expected&&health.version!==expected){
        showSettingsAlert(`Arka planda uyumsuz yerel servis çalışıyor (beklenen ${expected}, bulunan ${health.version}). Talep Kontrol uygulamasını yeniden açın. Mevcut yollar bilgi amaçlı gösteriliyor.`,'warn');
      }else if(!health){
        showSettingsAlert('Yerel servis bağlantısı kesildi. Uygulamayı kapatıp Talep Kontrol uygulamasını yeniden açın.','bad');
      }else{
        showSettingsAlert('Ayar servisine doğrudan ulaşılamadı; mevcut veri/kayıt servislerinden bilgiler gösteriliyor. Uygulamayı yeniden başlatmanız önerilir.','warn');
      }
    }
  }catch(e){showSettingsAlert('Ayarlar yüklenemedi: '+e.message+' Uygulamayı kapatıp BASLAT.bat ile yeniden açın.','bad')}
  finally{if(btn)btn.disabled=false}
}
async function selectSettingsFolder(kind){
  const btn=kind==='data'?$('#settingsDataChangeBtn'):$('#settingsRecordChangeBtn');
  if(btn){btn.disabled=true;btn.textContent='Seçim bekleniyor…'}
  showSettingsAlert('Windows klasör seçim penceresi açılıyor…');
  try{
    const health=await getServiceHealth();
    if(!health)throw new Error('Yerel servis bağlantısı kurulamadı.');
    if(health.app!=='Talep Kontrol')throw new Error('Yerel servis kimliği doğrulanamadı. Talep Kontrol uygulamasını yeniden açın.');
    const data=await fetchApiJson('/api/settings-select-folder',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind})
    },300000);
    renderSettingsView(data);
    if(data.cancelled){showSettingsAlert('Klasör seçimi iptal edildi.','warn');return}
    if(kind==='data'){
      showSettingsAlert('Veri kaynak klasörü değiştirildi. Kaynaklar yeniden okunuyor…','good');
      await loadSources({silent:true,forceScan:true});
      showSettingsAlert('Veri kaynak klasörü değiştirildi ve kaynaklar yenilendi.','good');
    }else showSettingsAlert('CSV kayıt klasörü değiştirildi ve kayıt alt klasörleri hazırlandı.','good');
    toast('Klasör ayarı güncellendi.');
  }catch(e){showSettingsAlert('Klasör değiştirilemedi: '+e.message,'bad')}
  finally{if(btn){btn.disabled=false;btn.textContent='Klasörü Değiştir'}}
}
async function openSettingsFolder(kind,button=null){
  if(button)button.disabled=true;
  try{
    const health=await getServiceHealth();
    if(!health)throw new Error('Yerel servis bağlantısı kurulamadı.');
    if(health.app!=='Talep Kontrol')throw new Error('Yerel servis kimliği doğrulanamadı. Talep Kontrol uygulamasını yeniden açın.');
    const data=await fetchApiJson('/api/settings-open-folder',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind})
    },8000);
    showSettingsAlert(`Klasör açıldı: ${data.path||''}`,'good');
  }catch(e){showSettingsAlert('Klasör açılamadı: '+e.message,'bad')}
  finally{if(button)button.disabled=false}
}

const controlRecordState={page:1,pageSize:50,total:0,pages:1,loading:false};
function activateStandaloneView(viewId){
  $$('.view').forEach(v=>v.classList.remove('active'));const v=$('#'+viewId);if(v)v.classList.add('active');
  $$('.nav-item').forEach(x=>{const target=viewId==='settingsView'?'settings':viewId==='dataCenterView'?'data-center':'decision';x.classList.toggle('active',x.dataset.view===target)});
  window.scrollTo({top:0,behavior:'smooth'});
}
function showControlRecords(){activateStandaloneView('recordsView');loadControlRecords(true)}
function backToDecision(){activateStandaloneView('decisionView')}
function recordStatusBadge(value){const v=String(value||'').toUpperCase();if(v==='UYGUN'||v==='MUAF'||v==='GEREKMEZ')return `<span class="records-pill ok">${esc(value||'—')}</span>`;if(v.includes('KARAR VERILEBILIR'))return `<span class="records-pill ok">Karar Verilebilir</span>`;if(v.includes('UYARI ILE ONAYLANDI'))return `<span class="records-pill warn">Uyarı ile Onaylandı</span>`;if(v==='KISMI ONAY')return `<span class="records-pill warn">Kısmi Onay</span>`;if(v==='ONAY YOK')return `<span class="records-pill neutral">Onay Yok</span>`;if(v==='ONAYLA')return `<span class="records-pill ok">Onayla</span>`;if(v==='ONAYLAMA')return `<span class="records-pill bad">Onaylama</span>`;if(v==='BEKLET')return `<span class="records-pill warn">Beklet</span>`;if(v==='HATA'||v.includes('INCELEME'))return `<span class="records-pill bad">${v.includes('INCELEME')?'İnceleme Gerekli':esc(value)}</span>`;return `<span class="records-pill neutral">${esc(value||'—')}</span>`}
function recordMoney(v){let s=String(v??'').trim().replace(/\s/g,'');if(!s)return '—';if(s.includes(',')&&s.includes('.'))s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');else if(s.includes(','))s=s.replace(',','.');const n=Number(s);return Number.isFinite(n)?fmtMoney(n):esc(v)}
async function loadControlRecords(reset=false){
  if(controlRecordState.loading)return;if(reset)controlRecordState.page=1;controlRecordState.loading=true;
  const body=$('#recordsTableBody');if(body)body.innerHTML='<tr><td colspan="12" class="dashboard-no-data">Kontrol kayıtları yükleniyor…</td></tr>';
  try{
    const q=$('#recordsSearch')?.value||'',type=$('#recordsTypeFilter')?.value||'',result=$('#recordsResultFilter')?.value||'';
    const qs=new URLSearchParams({q,type,result,page:String(controlRecordState.page),pageSize:String(controlRecordState.pageSize),ts:String(Date.now())});
    const data=await fetchApiJson('/api/control-records?'+qs.toString(),{},15000);controlRecordState.total=Number(data.total)||0;controlRecordState.pages=Math.max(1,Number(data.pages)||1);controlRecordState.page=Math.min(controlRecordState.page,controlRecordState.pages);
    const items=Array.isArray(data.items)?data.items:[];
    if(body)body.innerHTML=items.length?items.map(r=>`<tr><td>${esc(r.time||'—')}</td><td><strong>${esc(r.reservationNo||'Manuel')}</strong>${r.repeat==='EVET'?'<span class="records-repeat-chip">Tekrar</span>':''}</td><td>${r.reservationNo?('R'+esc(r.revision||'1')):'—'}</td><td><code>${esc(r.controlId||'')}</code></td><td title="${esc(r.company||'')}">${esc(r.company||'—')}</td><td>${esc(r.targetDepot||'—')}<small>${esc(r.targetDepotDesc||'')}</small></td><td>${esc(r.workType||'—')}</td><td>${recordStatusBadge(r.guaranteeResult)}</td><td>${recordStatusBadge(r.discoveryResult)}</td><td>${recordStatusBadge(r.projectResult)}</td><td>${recordStatusBadge(r.generalResult)}</td><td><button class="btn btn-ghost records-detail-btn" type="button" data-id="${esc(r.controlId)}">Detay</button></td></tr>`).join(''):'<tr><td colspan="12" class="dashboard-no-data">Filtrelere uygun kayıt bulunamadı.</td></tr>';
    $('#recordsTotalCount').textContent=String(controlRecordState.total);$('#recordsPageInfo').textContent=`${controlRecordState.page} / ${controlRecordState.pages}`;$('#recordsPaginationText').textContent=`Sayfa ${controlRecordState.page} / ${controlRecordState.pages}`;$('#recordsRootInfo').textContent=data.recordRoot||'—';
    $('#recordsPrevBtn').disabled=controlRecordState.page<=1;$('#recordsNextBtn').disabled=controlRecordState.page>=controlRecordState.pages;
    $$('.records-detail-btn').forEach(b=>b.onclick=()=>openRecordDetail(b.dataset.id));
  }catch(e){if(body)body.innerHTML=`<tr><td colspan="12" class="dashboard-no-data">Kayıtlar yüklenemedi: ${esc(e.message)}</td></tr>`;toast('Kontrol kayıtları yüklenemedi: '+e.message,'error',6500)}finally{controlRecordState.loading=false}
}
function closeRecordDetail(){const m=$('#recordDetailModal');if(m){m.hidden=true;m.setAttribute('aria-hidden','true');document.body.classList.remove('modal-open')}}
async function openRecordDetail(controlId){
  const modal=$('#recordDetailModal'),body=$('#recordDetailBody');if(!modal||!body)return;modal.hidden=false;modal.setAttribute('aria-hidden','false');document.body.classList.add('modal-open');body.innerHTML='<div class="dashboard-no-data">Kontrol detayı yükleniyor…</div>';
  try{
    const data=await fetchApiJson('/api/control-record-detail?id='+encodeURIComponent(controlId)+'&ts='+Date.now(),{},12000),h=data.header||{},mats=data.materials||[],projects=data.projects||[];
    $('#recordDetailTitle').textContent=h.RezervasyonNo?`Rezervasyon ${h.RezervasyonNo}`:`Kontrol ${controlId}`;$('#recordDetailSubtitle').textContent=`${h.KontrolZamani||'—'} · ${h.Firma||'Firma yok'} · ${h.HedefDepo||'—'} ${h.HedefDepoTanimi||''}`;$('#recordDetailRoot').textContent=data.recordRoot||'';
    const summary=[['Kontrol ID',h.KontrolID],['Kontrol Zamanı',h.KontrolZamani],['Kontrol Türü',h.KontrolTuru],['Rezervasyon',h.RezervasyonNo||'—'],['Revizyon',h.RezervasyonKontrolSira?('R'+h.RezervasyonKontrolSira):'—'],['Önceki Kontrol',h.OncekiKontrolID||'—'],['Firma',h.Firma||'—'],['Sözleşme',h.Sozlesme||'—'],['Kaynak Depo',[h.KaynakUY,h.KaynakDepo,h.KaynakDepoTanimi].filter(Boolean).join(' / ')],['Hedef Depo',[h.HedefUY,h.HedefDepo,h.HedefDepoTanimi].filter(Boolean).join(' / ')],['İş Türü',h.IsTuru||'—'],['Genel Sonuç',h.GenelSonuc||'—'],['Talep Değeri',recordMoney(h.TalepTeminatDegeri)],['Teminat Sonucu',h.TeminatSonucu||'—'],['Keşif Sonucu',h.KesifSonucu||'—'],['Proje Dağılımı',h.ProjeDagilimSonucu||'—'],['Onaylanan Kalem',h.OnaylananKalemSayisi||'—'],['Onaylanmayan Kalem',h.OnaylanmayanKalemSayisi||'—'],['Bekletilen Kalem',h.BekletilenKalemSayisi||'—']];
    const materialRows=mats.map(x=>`<tr><td>${esc(x.RezervasyonKalemNo||x.SiraNo||'—')}</td><td>${esc(x.MalzemeKodu||'')}</td><td>${esc(x.MalzemeTanimi||'')}</td><td class="num">${esc(x.Miktar||'')}</td><td>${esc(x.Birim||'')}</td><td>${recordStatusBadge(x.KesifDurumu)}</td><td>${recordStatusBadge(x.TeminatDurumu)}</td><td>${recordStatusBadge(x.KalemKarari||'ONAYLA')}</td><td>${esc(x.KararGerekcesi||'—')}<small>${esc(x.KararAciklamasi||'')}</small></td><td class="num">${recordMoney(x.TalepTutari)}</td></tr>`).join('');
    const projectRows=projects.map(x=>`<tr><td>${esc(x.MalzemeKodu||'')}</td><td>${esc(x.ProjeKodu||'')}</td><td>${esc(x.ProjeAdi||'')}</td><td class="num">${esc(x.DagitilanMiktar||'')}</td><td>${recordStatusBadge(x.Durum)}</td></tr>`).join('');
    body.innerHTML=`<div class="record-detail-summary">${summary.map(([k,v])=>`<div><span>${esc(k)}</span><strong>${typeof v==='string'&&v.includes('<span')?v:esc(v||'—')}</strong></div>`).join('')}</div><section class="record-detail-section"><h3>Malzemeler <span>${mats.length}</span></h3><div class="table-wrap"><table class="records-detail-table"><thead><tr><th>Kalem</th><th>Malzeme</th><th>Tanım</th><th>Miktar</th><th>Birim</th><th>Keşif</th><th>Teminat</th><th>Kalem Kararı</th><th>Gerekçe / Açıklama</th><th>Talep Tutarı</th></tr></thead><tbody>${materialRows||'<tr><td colspan="10">Malzeme detayı yok.</td></tr>'}</tbody></table></div></section>${projects.length?`<section class="record-detail-section"><h3>Proje Dağılımları <span>${projects.length}</span></h3><div class="table-wrap"><table class="records-detail-table"><thead><tr><th>Malzeme</th><th>Proje Kodu</th><th>Proje Adı</th><th>Dağıtılan</th><th>Durum</th></tr></thead><tbody>${projectRows}</tbody></table></div></section>`:''}`;
  }catch(e){body.innerHTML=`<div class="dashboard-no-data">Kontrol detayı yüklenemedi: ${esc(e.message)}</div>`}
}



// FIX12 • Bildirim Merkezi + Windows oturumu + kullanıcı sorumlulukları + TESİS yeni proje
let notificationFilter='';
const userResponsibilityState={users:{},loaded:false};

function splitResponsibilityValues(value){return String(value||'').split(/[;,\n]+/).map(x=>x.trim()).filter(Boolean)}
function roleLabel(v){return ({NORMAL_USER:'Normal Kullanıcı',DATA_MANAGER:'Veri Yöneticisi',ADMIN:'Admin'})[String(v||'').toUpperCase()]||String(v||'—')}
function renderSessionUser(){
  const c=state.meta.userContext||{},r=c.responsibility||{},login=c.login||c.username||'Kullanıcı',primary=r.primaryProvinces||[],backup=r.backupProvinces||[];
  if($('#sessionUserName'))$('#sessionUserName').textContent=login;
  if($('#sessionUserScope'))$('#sessionUserScope').textContent='Sorumlu iller: '+(primary.length?primary.join(', '):'—');
  if($('#dcSessionCard'))$('#dcSessionCard').innerHTML=`<div><span>Windows Kullanıcısı</span><strong>${esc(login)}</strong></div><div><span>Bilgisayar</span><strong>${esc(c.computerName||'—')}</strong></div><div><span>Oturum Başlangıcı</span><strong>${dcFormatTime(c.sessionStartedAt)}</strong></div><div><span>Rol</span><strong>${esc(roleLabel(r.role))}</strong></div><div><span>Birincil İller</span><strong>${esc(primary.join(', ')||'—')}</strong></div><div><span>Yedek İller</span><strong>${esc(backup.join(', ')||'—')}</strong></div><div><span>IP</span><strong>${esc(c.ip||'—')}</strong></div><div><span>Build</span><strong>${esc(c.appBuild||'—')}</strong></div>`;
}
async function loadUserContext(silent=false){
  try{const data=await fetchApiJson('/api/user-context?ts='+Date.now(),{},10000);state.meta.userContext=data;renderSessionUser();return data}catch(e){if(!silent)toast('Windows oturum bilgisi alınamadı: '+e.message,'error');return null}
}
function renderUserResponsibilities(){
  const users=userResponsibilityState.users||{},body=$('#dcUsersBody');if(!body)return;
  const rows=Object.values(users).sort((a,b)=>String(a.login||'').localeCompare(String(b.login||''),'tr'));
  body.innerHTML=rows.length?rows.map(u=>`<tr><td><strong>${esc(u.login||'')}</strong>${u.displayName?`<small>${esc(u.displayName)}</small>`:''}</td><td>${esc(roleLabel(u.role))}</td><td>${esc((u.primaryProvinces||[]).join(', ')||'—')}</td><td>${esc((u.backupProvinces||[]).join(', ')||'—')}</td><td>${esc((u.workTypes||[]).join(', ')||'—')}</td><td>${esc((u.depots||[]).join(', ')||'—')}</td><td><button class="btn btn-ghost dc-user-edit" type="button" data-login="${esc(u.login||'')}">Düzenle</button></td></tr>`).join(''):'<tr><td colspan="7">Henüz kullanıcı sorumluluğu tanımlanmadı.</td></tr>';
  $$('.dc-user-edit').forEach(b=>b.onclick=()=>fillUserResponsibilityForm(b.dataset.login||''));
}
function fillUserResponsibilityForm(login){
  const key=String(login||'').toLowerCase(),u=userResponsibilityState.users?.[key]||Object.values(userResponsibilityState.users||{}).find(x=>String(x.login||'').toLowerCase()===key);if(!u)return;
  if($('#dcUserLogin'))$('#dcUserLogin').value=u.login||'';if($('#dcUserRole'))$('#dcUserRole').value=u.role||'NORMAL_USER';if($('#dcUserPrimary'))$('#dcUserPrimary').value=(u.primaryProvinces||[]).join(', ');if($('#dcUserBackup'))$('#dcUserBackup').value=(u.backupProvinces||[]).join(', ');if($('#dcUserWorkTypes'))$('#dcUserWorkTypes').value=(u.workTypes||[]).join(', ');if($('#dcUserDepots'))$('#dcUserDepots').value=(u.depots||[]).join(', ');
}
async function loadUserResponsibilities(silent=false){
  try{const data=await fetchApiJson('/api/user-responsibilities?ts='+Date.now(),{},10000);userResponsibilityState.users=data.users||{};userResponsibilityState.loaded=true;renderUserResponsibilities();renderSessionUser();return data}catch(e){if(!silent)toast('Kullanıcı sorumlulukları yüklenemedi: '+e.message,'error');return null}
}
async function loadUserAudit(silent=false){
  const body=$('#dcAuditBody');if(body)body.innerHTML='<tr><td colspan="6">AUDIT yükleniyor…</td></tr>';
  try{const data=await fetchApiJson('/api/data-center/audit?limit=300&ts='+Date.now(),{},10000),rows=data.items||[];if(body)body.innerHTML=rows.length?rows.map(r=>`<tr><td>${dcFormatTime(r.event_time)}</td><td>${esc(r.actor||'—')}</td><td>${esc(r.category||'—')}</td><td>${esc(r.action||'—')}</td><td>${esc(r.object_type||'—')}</td><td><code>${esc(r.object_id||'—')}</code></td></tr>`).join(''):'<tr><td colspan="6">AUDIT kaydı bulunamadı.</td></tr>';return data}catch(e){if(body)body.innerHTML=`<tr><td colspan="6">AUDIT yüklenemedi: ${esc(e.message)}</td></tr>`;if(!silent)toast('AUDIT yüklenemedi: '+e.message,'error');return null}
}
async function saveUserResponsibilityForm(){
  const login=$('#dcUserLogin')?.value.trim()||'';if(!login){toast('DOMAIN\\Kullanıcı alanı zorunludur.','error');return}
  if(!userResponsibilityState.loaded)await loadUserResponsibilities(true);
  const users={...(userResponsibilityState.users||{})},key=login.toLowerCase(),existing=users[key]||{};
  users[key]={...existing,login,role:$('#dcUserRole')?.value||'NORMAL_USER',primaryProvinces:splitResponsibilityValues($('#dcUserPrimary')?.value),backupProvinces:splitResponsibilityValues($('#dcUserBackup')?.value),workTypes:splitResponsibilityValues($('#dcUserWorkTypes')?.value).map(x=>x.toUpperCase()),depots:splitResponsibilityValues($('#dcUserDepots')?.value),active:true};
  const b=$('#dcUserSaveBtn');if(b)b.disabled=true;
  try{const data=await fetchApiJson('/api/user-responsibilities',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({users})},15000);userResponsibilityState.users=data.users||users;renderUserResponsibilities();await loadUserContext(true);toast('Kullanıcı sorumluluğu kaydedildi.','success')}catch(e){toast('Kullanıcı kaydı hatası: '+e.message,'error')}finally{if(b)b.disabled=false}
}

function notificationSeverityLabel(v){return ({CRITICAL:'Kritik',WARNING:'İşlem Bekleyen',INFO:'Bilgi'})[String(v||'').toUpperCase()]||String(v||'Bilgi')}
function notificationCategoryLabel(v){return ({MB51:'MB51',KESIF:'Keşif',PROJE:'Proje',VERI_KAYNAKLARI:'Veri Kaynakları',VERI_KALITESI:'Veri Kalitesi',SYSTEM:'Sistem'})[String(v||'').toUpperCase()]||String(v||'Sistem')}
function renderNotifications(){
  const data=state.meta.notificationPayload||{},items=Array.isArray(data.items)?data.items:[],open=items.filter(x=>x.status==='OPEN');
  if($('#notificationBadge')){const n=Number(data.openCount||open.length);$('#notificationBadge').textContent=n;$('#notificationBadge').hidden=!n}
  if($('#notifCriticalCount'))$('#notifCriticalCount').textContent=data.criticalCount||0;if($('#notifWarningCount'))$('#notifWarningCount').textContent=data.warningCount||0;if($('#notifInfoCount'))$('#notifInfoCount').textContent=data.infoCount||0;
  $$('[data-notif-filter]').forEach(b=>b.classList.toggle('active',String(b.dataset.notifFilter||'')===notificationFilter));
  const filtered=items.filter(n=>{const f=notificationFilter.toUpperCase();if(!f)return n.status==='OPEN';if(f==='HISTORY')return n.status!=='OPEN'&&n.status!=='CLEARED';return n.status==='OPEN'&&(String(n.severity||'').toUpperCase()===f||String(n.category||'').toUpperCase()===f)}),list=$('#notificationList');if(!list)return;
  list.innerHTML=filtered.length?filtered.map(n=>{const sev=String(n.severity||'INFO').toUpperCase(),meta=n.meta||{},actions=Array.isArray(n.actions)?n.actions:[];const detail=[meta.depot&&`Depo: ${meta.depot}`,meta.projectName&&`Proje: ${meta.projectName}`,meta.reservationNo&&`Rezervasyon: ${meta.reservationNo}`,meta.materialCode&&`Malzeme: ${meta.materialCode}`,meta.count!=null&&`Adet: ${meta.count}`].filter(Boolean).join(' · ');return `<article class="notification-card ${sev}${n.read?' read':''}"><div class="notification-card-head"><span class="notification-level ${sev}">${esc(notificationSeverityLabel(n.severity))}</span><span class="notification-category">${esc(notificationCategoryLabel(n.category))}</span><small>${dcFormatTime(n.updatedAt||n.createdAt)}</small></div><h4>${esc(n.title||'Bildirim')}</h4><p>${esc(n.message||'')}</p>${detail?`<div class="notification-meta">${esc(detail)}</div>`:''}<div class="notification-actions">${actions.map((a,i)=>`<button class="btn ${i===0?'btn-primary':'btn-ghost'} notif-nav-action" type="button" data-id="${esc(n.id)}" data-action="${esc(a.action||'')}" data-depot="${esc(a.depot||meta.depot||'')}" data-work-code="${esc(a.workCode||meta.workCode||'')}">${esc(a.label||'Aç')}</button>`).join('')}<button class="btn btn-ghost notif-state-action" type="button" data-id="${esc(n.id)}" data-state-action="READ">Okundu</button><button class="btn btn-ghost notif-state-action" type="button" data-id="${esc(n.id)}" data-state-action="RESOLVE">Çözüldü</button></div></article>`}).join(''):'<div class="notification-empty">Bu filtrede açık bildirim bulunmuyor.</div>';
  $$('.notif-state-action').forEach(b=>b.onclick=()=>updateNotificationState(b.dataset.id,b.dataset.stateAction));$$('.notif-nav-action').forEach(b=>b.onclick=()=>navigateNotificationAction(b.dataset.action,b.dataset));
}
async function loadNotifications(silent=false){
  try{const data=await fetchApiJson('/api/notifications?ts='+Date.now(),{},30000);state.meta.notificationPayload=data;state.meta.notifications=data.items||[];renderNotifications();return data}catch(e){if(!silent)toast('Bildirimler yüklenemedi: '+e.message,'error');return null}
}
function openNotificationDrawer(){const d=$('#notificationDrawer'),b=$('#notificationBackdrop');if(d){d.hidden=false;d.setAttribute('aria-hidden','false')}if(b)b.hidden=false;loadNotifications(true)}
function closeNotificationDrawer(){const d=$('#notificationDrawer'),b=$('#notificationBackdrop');if(d){d.hidden=true;d.setAttribute('aria-hidden','true')}if(b)b.hidden=true}
async function updateNotificationState(id,action){try{await fetchApiJson('/api/notifications/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,action})},10000);await loadNotifications(true)}catch(e){toast('Bildirim işlemi hatası: '+e.message,'error')}}
async function clearNotifications(){const ok=window.confirm('Bilgi ve geçmiş bildirimleri temizlensin mi?\n\nAktif Kritik ve İşlem Bekleyen uyarılar korunacaktır.');if(!ok)return;try{const r=await fetchApiJson('/api/notifications/clear',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'SAFE'})},15000);await loadNotifications(true);const cleared=Number(r.cleared||0),protectedCount=Number(r.protected||0);toast(cleared?`${cleared} bildirim temizlendi.${protectedCount?` ${protectedCount} aktif kritik/işlem bekleyen uyarı korundu.`:''}`:`Temizlenecek bildirim yok.${protectedCount?` ${protectedCount} aktif uyarı korunuyor.`:''}`,'success',5200,'Bildirim Merkezi')}catch(e){toast('Bildirim temizleme hatası: '+e.message,'error')}}
function activateWorkView(code,depot=''){
  const view=Object.entries(WORK_VIEW_CODES).find(([,v])=>v===code)?.[0];const nav=view?document.querySelector(`.nav-item[data-view="${view}"]`):null;if(nav){nav.click();setTimeout(()=>{if(depot)workOpsSelectDepot(code,depot)},350)}
}
function navigateNotificationAction(action,dataset={}){
  const a=String(action||'').toUpperCase();closeNotificationDrawer();if(a==='OPEN_DATA_CENTER'){showDataCenter();setDcTab('health');return}if(a==='OPEN_RECORDS'){showControlRecords();return}if(a==='OPEN_TESIS'){activateWorkView('T',dataset.depot||'');return}if(a==='OPEN_WORK'){activateWorkView(dataset.workCode||'',dataset.depot||'');return}
}

function addNewProjectDiscoveryRow(row={}){
  const body=$('#newProjectDiscoveryBody');if(!body)return;const tr=document.createElement('tr');tr.innerHTML=`<td><input class="new-proj-mat-code" type="text" value="${esc(row.materialCode||'')}" placeholder="Malzeme kodu"></td><td><input class="new-proj-mat-desc" type="text" value="${esc(row.materialDesc||'')}" placeholder="Malzeme tanımı"></td><td><input class="new-proj-uom" type="text" value="${esc(row.uom||'ADT')}" placeholder="Birim"></td><td><input class="new-proj-planned" type="number" min="0" step="any" value="${esc(row.planned||'')}" placeholder="Keşif"></td><td><button class="btn btn-ghost new-proj-remove" type="button">Sil</button></td>`;body.appendChild(tr);tr.querySelector('.new-proj-remove').onclick=()=>{if(body.children.length>1)tr.remove();else{tr.querySelectorAll('input').forEach(x=>x.value='')}}
}
async function openNewTesisProjectModal(){
  if(!workOpsState.T)await loadWorkOperations('T');const data=workOpsState.T||{},sel=$('#newProjectDepot');if(sel)sel.innerHTML='<option value="">Depo seçin</option>'+[...(data.depotCodes||[])].map(d=>`<option value="${esc(d)}">${esc(workOpsDepotLabel(data,d))}</option>`).join('');if($('#newProjectCode'))$('#newProjectCode').value='';if(sel){sel.onchange=async()=>{const field=$('#newProjectCode');if(!field)return;field.value='';if(!sel.value)return;try{const d=await fetchApiJson('/api/tesis-next-project-code?depot='+encodeURIComponent(sel.value),{},6000);field.value=d.nextCode||''}catch(e){field.placeholder='Kod kaydetme anında oluşturulur'}};}if($('#newProjectName'))$('#newProjectName').value='';if($('#newProjectDiscoveryBody')){$('#newProjectDiscoveryBody').innerHTML='';addNewProjectDiscoveryRow()};const m=$('#newTesisProjectModal');if(m){m.hidden=false;m.setAttribute('aria-hidden','false');document.body.classList.add('modal-open')}
}
function closeNewTesisProjectModal(){const m=$('#newTesisProjectModal');if(m){m.hidden=true;m.setAttribute('aria-hidden','true')}document.body.classList.remove('modal-open')}
async function saveNewTesisProject(){
  const depot=$('#newProjectDepot')?.value||'',projectCode='',projectName=$('#newProjectName')?.value.trim()||'',rows=[...($('#newProjectDiscoveryBody')?.querySelectorAll('tr')||[])].map(tr=>({materialCode:tr.querySelector('.new-proj-mat-code')?.value.trim()||'',materialDesc:tr.querySelector('.new-proj-mat-desc')?.value.trim()||'',uom:tr.querySelector('.new-proj-uom')?.value.trim()||'',planned:Number(tr.querySelector('.new-proj-planned')?.value||0)})).filter(r=>r.materialCode||r.planned);
  if(!depot||!projectName){toast('Depo ve proje adı zorunludur.','error');return}if(!rows.length||rows.some(r=>!r.materialCode||!(r.planned>0))){toast('Her keşif satırında malzeme kodu ve sıfırdan büyük keşif miktarı zorunludur.','error');return}
  const b=$('#newTesisProjectSave');if(b)b.disabled=true;try{const saved=await fetchApiJson('/api/tesis-project',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({depot,projectCode,projectName,discoveryRows:rows})},20000);closeNewTesisProjectModal();workOpsProjectMaterialCache.clear();await loadWorkOperations('T',true);await loadNotifications(true);toast('TESİS projesi '+(saved.item?.projectCode||saved.projectCode||'')+' koduyla kaydedildi.','success')}catch(e){toast('Yeni proje kaydı hatası: '+e.message,'error')}finally{if(b)b.disabled=false}
}

const dcState={health:null,config:null,snapshots:[],actions:[],quarantine:[],archive:{}};
function dcStatusBadge(v){const x=String(v||'').toUpperCase();const cls=x==='NORMAL'||x==='ACTIVE'||x==='READY'?'ok':x==='WARNING'||x==='STALE'||x==='REBUILDING'?'warn':x==='CRITICAL'||x==='FAILED'||x==='MISSING'?'bad':'neutral';return `<span class="records-pill ${cls}">${esc(v||'—')}</span>`}
function dcFormatTime(v){if(!v)return '—';try{return new Date(v).toLocaleString('tr-TR')}catch(_){return esc(v)}}
function dcHealthCell(actual,target,label){return String(actual||'').toUpperCase()===target?`<span class="health-state-dot ${target.toLowerCase()} on" title="${label}">${label}</span>`:'<span class="health-state-empty">—</span>'}
function showDataCenter(){activateStandaloneView('dataCenterView');loadDataCenter()}
function setDcTab(tab){$$('.dc-tab').forEach(b=>b.classList.toggle('active',b.dataset.dcTab===tab));$$('.dc-pane').forEach(p=>p.classList.remove('active'));const pane=$('#dc'+tab.charAt(0).toUpperCase()+tab.slice(1)+'Pane');if(pane)pane.classList.add('active');if(tab==='users'){loadUserContext(true);loadUserResponsibilities(true);loadUserAudit(true)}if(tab==='dataPrep')loadDataPrep(true)}
async function loadDataCenter(){
  const alert=$('#dcAlert');if(alert){alert.hidden=false;alert.className='settings-alert';alert.textContent='Veri Merkezi bilgileri yükleniyor…'}
  try{
    const [health,config,snaps,actions,quarantine,archive]=await Promise.all([fetchApiJson('/api/data-center/health?ts='+Date.now(),{},15000),fetchApiJson('/api/data-center/config?ts='+Date.now(),{},10000),fetchApiJson('/api/data-center/snapshots?limit=300&ts='+Date.now(),{},15000),fetchApiJson('/api/data-center/actions?ts='+Date.now(),{},10000),fetchApiJson('/api/data-center/quarantine?ts='+Date.now(),{},10000),fetchApiJson('/api/archive/operations?months=36&ts='+Date.now(),{},30000)]);
    dcState.health=health;dcState.config=config;dcState.snapshots=snaps.items||[];dcState.actions=actions.items||[];dcState.quarantine=quarantine.items||[];dcState.archive=archive||{};renderDataCenter();if(alert)alert.hidden=true;
  }catch(e){if(alert){alert.hidden=false;alert.className='settings-alert bad';alert.textContent='Veri Merkezi yüklenemedi: '+e.message}}
}
function renderDataCenter(){
  const h=dcState.health||{},eng=h.engine||{},q=h.quality||{},integ=h.integrity||{},pending=Array.isArray(h.pendingSourceUpdates)?h.pendingSourceUpdates:[],pendingMap=new Map(pending.map(x=>[String(x.source||'').toUpperCase(),x]));
  $('#dcOverall').textContent=h.overall||'—';$('#dcHealthy').textContent=h.activeCount||0;$('#dcWarning').textContent=h.warningCount||0;$('#dcCritical').textContent=h.criticalCount||0;
  $('#dcLastBackup').textContent=h.lastBackup?dcFormatTime(h.lastBackup):'Henüz yok';$('#dcRestoreTest').textContent='Geri yükleme testi: '+(h.restoreTest||'—');
  if($('#dcIndexStatus'))$('#dcIndexStatus').innerHTML=dcStatusBadge(eng.status||'MISSING');if($('#dcIndexBuild'))$('#dcIndexBuild').textContent='Build: '+(eng.buildId||'—');
  if($('#dcIntegrityStatus'))$('#dcIntegrityStatus').innerHTML=dcStatusBadge(integ.status||'HENÜZ YOK');if($('#dcIntegrityTime'))$('#dcIntegrityTime').textContent='Son kontrol: '+(integ.check_time?dcFormatTime(integ.check_time):'—');
  if($('#dcQualityStatus'))$('#dcQualityStatus').innerHTML=dcStatusBadge(q.level||'—');if($('#dcQualityCount'))$('#dcQualityCount').textContent=`Bulgu türü: ${q.findingTypes||0} · WARNING: ${q.warning||0} · CRITICAL: ${q.critical||0}`;
  const rawSrc=h.sources||[];const src=rawSrc.flatMap(x=>String(x.source||'').toUpperCase()==='KESIFLER'?['TESIS','KET','BAKIM','LED'].map(name=>({...x,source:name})): [x]);const healthRows=src.map(x=>{const st=String(x.health||'').toUpperCase(),pnd=pendingMap.get(String(x.source||'').toUpperCase());return `<tr><td><strong>${esc(x.source)}</strong></td><td><code>${esc(x.snapshot_id||'—')}</code></td><td>${Number(x.age_hours||0).toFixed(1)} sa</td><td>${dcHealthCell(st,'NORMAL','Normal')}</td><td>${dcHealthCell(st,'WARNING','Uyarı')}</td><td>${dcHealthCell(st,'CRITICAL','Kritik')}</td><td>${pnd?`<button class="source-pending-review" type="button" data-source="${esc(pnd.source)}">Yeni veri var</button>`:'<span class="source-current-pill">Güncel</span>'}</td><td><button class="btn btn-ghost dc-source-change" type="button" data-source="${esc(x.source)}">Kaynak Dosyasını Değiştir</button></td></tr>`}).join('');if($('#dcHealthBody'))$('#dcHealthBody').innerHTML=healthRows||'<tr><td colspan="8">Kaynak snapshot bulunamadı.</td></tr>';
  if($('#dcFreshnessBody'))$('#dcFreshnessBody').innerHTML=src.map(x=>`<tr><td>${esc(x.source)}</td><td>${dcFormatTime(x.report_time||x.created_at)}</td><td>${Number(x.age_hours||0).toFixed(1)} sa</td><td>${x.freshness_limit_hours} sa</td><td>${dcStatusBadge(x.health)}</td><td>${esc(x.time_basis||'—')}</td></tr>`).join('')||'<tr><td colspan="6">Veri yok.</td></tr>';
  if($('#dcLineageBody')){$('#dcLineageBody').innerHTML=`<tr><td title="${esc(eng.sourceDigest||'')}"><code>${esc((eng.sourceDigest||'').slice(0,14)||'—')}</code></td><td><code>${esc(eng.buildId||'—')}</code></td><td title="${esc(eng.indexSourceDigest||'')}"><code>${esc((eng.indexSourceDigest||'').slice(0,14)||'—')}</code></td><td>${dcStatusBadge(eng.status||'—')}</td><td>${esc((h.ruleset||{}).version||eng.rulesetVersion||'—')} <code>${esc(((h.ruleset||{}).shortHash||eng.rulesetHash||'').slice(0,12))}</code></td><td>${eng.sourceIndexMatch?dcStatusBadge('NORMAL'):dcStatusBadge(eng.building?'REBUILDING':'WARNING')}</td></tr>`}
  if($('#dcQualityBody')){$('#dcQualityBody').innerHTML=(q.findings||[]).slice(0,100).map(f=>`<tr><td>${dcStatusBadge(f.severity)}</td><td>${esc(f.source||'—')}</td><td><code>${esc(f.code||'—')}</code></td><td>${esc(f.count||0)}</td><td>${esc(f.description||'')}</td></tr>`).join('')||'<tr><td colspan="5">Kalite bulgusu yok.</td></tr>'}
  renderDcSnapshots();const ret=(h.retention||{});if($('#dcRetention'))$('#dcRetention').innerHTML=Object.entries(ret).map(([k,v])=>`<div><strong>${esc(k)}</strong><span>${esc(v)}</span></div>`).join('');
  if($('#dcActionsBody'))$('#dcActionsBody').innerHTML=(dcState.actions||[]).map(a=>`<tr><td>${esc(a.action_id)}</td><td>${esc(a.source||'—')}</td><td>${esc(a.owner||'—')}</td><td>${dcStatusBadge(a.status)}</td><td>${esc(a.risk_level||'—')}</td><td>${dcFormatTime(a.original_due_at)}</td><td>${dcFormatTime(a.current_due_at)}</td><td>${esc(a.extension_count||0)}</td></tr>`).join('')||'<tr><td colspan="8">Açık aksiyon bulunmuyor.</td></tr>';
  if($('#dcQuarantineBody'))$('#dcQuarantineBody').innerHTML=(dcState.quarantine||[]).map(x=>`<tr><td><code>${esc(x.quarantine_id)}</code></td><td>${esc(x.source||'—')}</td><td>${dcStatusBadge(x.status)}</td><td>${esc(x.reason||'—')}</td><td>${dcFormatTime(x.created_at)}</td><td>${x.status==='QUARANTINED'?`<button class="btn btn-ghost dc-q-reprocess" data-qid="${esc(x.quarantine_id)}" type="button">Yeniden İşle</button>`:'—'}</td></tr>`).join('')||'<tr><td colspan="6">Karantinada kayıt yok.</td></tr>';
  renderDcArchive();
  $$('.dc-q-reprocess').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await fetchApiJson('/api/data-center/quarantine/reprocess',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({quarantineId:b.dataset.qid})},15000);toast('Karantina kaydı yeni INBOX girdisi olarak sıraya alındı.');await loadDataCenter()}catch(e){toast('Yeniden işleme hatası: '+e.message)}finally{b.disabled=false}});
  $$('.dc-source-change').forEach(b=>b.onclick=()=>selectSourceFile(b.dataset.source||''));$$('.source-pending-review').forEach(b=>b.onclick=()=>{const item=pendingMap.get(String(b.dataset.source||'').toUpperCase());if(item)openSourceUpdateModal(item)});
}

function syncDcArchiveMonths(){const sel=$('#dcArchiveSpendMonth');if(!sel)return;const cur=sel.value,months=[...new Set((dcState.archive?.monthlyByDepot||[]).map(x=>String(x.month||'')).filter(Boolean))].sort().reverse();sel.innerHTML='<option value="">Tüm Aylar</option>'+months.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('');if(months.includes(cur))sel.value=cur}
function renderDcArchive(){
  const ar=dcState.archive||{};syncDcArchiveMonths();
  const month=$('#dcArchiveSpendMonth')?.value||'',dq=normalizeSearchText($('#dcArchiveSpendDepot')?.value||'').trim(),sign=$('#dcArchiveSpendSign')?.value||'';
  const spends=(Array.isArray(ar.monthlyByDepot)?ar.monthlyByDepot:[]).filter(r=>{if(month&&String(r.month||'')!==month)return false;if(dq&&!normalizeSearchText(r.dy||'').includes(dq))return false;const n=Number(r.netSpend)||0;if(sign==='positive'&&n<0)return false;if(sign==='negative'&&n>=0)return false;return true}).sort((a,b)=>String(b.month||'').localeCompare(String(a.month||''))||String(a.dy||'').localeCompare(String(b.dy||'')));
  if($('#dcArchiveSpendBody'))$('#dcArchiveSpendBody').innerHTML=spends.length?spends.slice(0,1500).map(r=>`<tr class="${Number(r.netSpend)<0?'operations-row-negative':''}"><td>${esc(r.month||'—')}<br><small>${esc(r.dy||'—')}</small></td><td class="num"><strong>${dashMoney(r.netSpend)}</strong></td><td class="num">${dashMoney(r.grossSpend)}</td><td class="num">${dashMoney((Number(r.reversal222)||0)+(Number(r.returnZ22)||0))}</td></tr>`).join(''):'<tr><td colspan="4">Filtrelere uygun arşiv harcama kaydı bulunamadı.</td></tr>';
  const pq=normalizeSearchText($('#dcArchiveProjectSearch')?.value||'').trim(),pst=$('#dcArchiveProjectStatus')?.value||'',events=(ar.projectEvents||[]).filter(e=>(!pq||normalizeSearchText([e.depot,e.projectCode,e.projectName,e.reason].join(' ')).includes(pq))&&(!pst||String(e.status||'')===pst));
  if($('#dcArchiveProjectBody'))$('#dcArchiveProjectBody').innerHTML=events.map(e=>`<tr><td>${dcFormatTime(e.updatedAt)}</td><td>${esc(e.depot||'—')}</td><td>${esc((e.projectCode?e.projectCode+' — ':'')+(e.projectName||'—'))}</td><td>${operationsStatusPill(e.previousStatus)}</td><td>${operationsStatusPill(e.status)}</td><td class="num">${esc(e.revision||0)}</td><td class="wrap">${esc(e.reason||'—')}</td></tr>`).join('')||'<tr><td colspan="7">Filtrelere uygun proje durum/revizyon olayı bulunamadı.</td></tr>';
  const cq=normalizeSearchText($('#dcArchiveControlSearch')?.value||'').trim(),controls=(ar.controls||[]).filter(r=>{const h=r.header||r;return !cq||normalizeSearchText([h.KontrolID,h.HedefDepo,h.Firma,h.GenelSonuc,h.KontrolZamani].join(' ')).includes(cq)});
  if($('#dcArchiveControlBody')){
    $('#dcArchiveControlBody').innerHTML=controls.map(r=>{const h=r.header||r,id=h.KontrolID||h.controlId||'',ok=Number(r.approvedItemCount??h.OnaylananKalemSayisi??0)||0,no=Number(r.rejectedItemCount??h.OnaylanmayanKalemSayisi??0)||0,hold=Number(r.heldItemCount??h.BekletilenKalemSayisi??0)||0;return `<tr><td>${esc(h.KontrolZamani||h.time||'—')}</td><td><code>${esc(id||'—')}</code></td><td>${esc(h.HedefDepo||h.targetDepot||'—')}</td><td>${esc(h.Firma||h.company||'—')}</td><td>${recordStatusBadge(h.GenelSonuc||h.generalResult||'—')}</td><td><span class="records-pill ok">${ok} Onay</span> <span class="records-pill bad">${no} Onaylama</span> <span class="records-pill warn">${hold} Beklet</span></td><td>${id?`<button class="btn btn-ghost dc-archive-control-detail" type="button" data-id="${esc(id)}">Detay</button>`:'—'}</td></tr>`}).join('')||'<tr><td colspan="7">Filtrelere uygun kontrol geçmişi bulunamadı.</td></tr>';
    $$('.dc-archive-control-detail').forEach(b=>b.onclick=()=>openRecordDetail(b.dataset.id));
  }
}


function dataPrepTemplateOptions(selected=''){
  return (dataPrepState.templates||[]).map(t=>`<option value="${esc(t.key)}" ${String(t.key)===String(selected)?'selected':''}>${esc(t.label)} · ${esc(t.filename)}</option>`).join('');
}
function dataPrepCurrentSheet(item,rowEl){const sel=rowEl?.querySelector('.data-prep-sheet');const name=sel?.value||item.suggestedSheet||'';return (item.sheets||[]).find(x=>x.name===name)||(item.sheets||[])[0]||{};}
function dataPrepConfidence(v){const n=Number(v||0),cls=n>=.8?'good':n>=.5?'warn':'bad';return `<span class="data-prep-confidence ${cls}">%${Math.round(n*100)}</span>`}
function renderDataPrepHistory(){const body=$('#dcDataPrepHistoryBody');if(!body)return;const rows=[];(dataPrepState.history||[]).forEach(b=>(b.files||[]).forEach(f=>rows.push(`<tr><td>${esc(dcFormatTime(b.createdAt))}</td><td>${esc(b.actor||'—')}</td><td><code>${esc(b.batchId||'—')}</code></td><td>${esc(f.outputFile||'—')}</td><td>${esc(f.source||'—')}</td><td class="num">${fmtNum(f.rows||0,0)}</td><td>${String(f.validation)==='OK'?'<span class="data-prep-status-ok">Uygun</span>':'<span class="data-prep-status-bad">Kontrol Gerekli</span>'}</td></tr>`)));body.innerHTML=rows.join('')||'<tr><td colspan="7">Henüz dönüşüm geçmişi yok.</td></tr>'}
function renderDataPrepSelections(){const body=$('#dcDataPrepInputBody');if(!body)return;const items=dataPrepState.selected||[];body.innerHTML=items.map((item,idx)=>{const sheet=(item.sheets||[]).find(x=>x.name===(item.suggestedSheet||''))||(item.sheets||[])[0]||{},src=sheet.detectedSource||item.detectedSource||'MB51';return `<tr data-prep-token="${esc(item.token)}"><td><strong>${esc(item.fileName)}</strong><small>${fmtNum((Number(item.size||0)/1024/1024),1)} MB</small></td><td><select class="data-prep-sheet">${(item.sheets||[]).map(x=>`<option value="${esc(x.name)}" ${x.name===sheet.name?'selected':''}>${esc(x.name)}</option>`).join('')}</select></td><td><select class="data-prep-source">${dataPrepTemplateOptions(src)}</select></td><td class="data-prep-estimated num">${fmtNum(sheet.estimatedRows||0,0)}</td><td class="data-prep-header-row">${esc(sheet.headerRow||'—')}</td><td class="data-prep-match">${dataPrepConfidence(sheet.confidence)}</td><td><button class="btn btn-ghost data-prep-preview-btn" type="button">Önizle</button></td></tr>`}).join('')||'<tr><td colspan="7">Henüz Excel dosyası seçilmedi.</td></tr>';
  $$('.data-prep-sheet').forEach(sel=>sel.onchange=()=>{const tr=sel.closest('tr'),item=items.find(x=>x.token===tr?.dataset.prepToken);if(!item)return;const sh=dataPrepCurrentSheet(item,tr);tr.querySelector('.data-prep-estimated').textContent=fmtNum(sh.estimatedRows||0,0);tr.querySelector('.data-prep-header-row').textContent=sh.headerRow||'—';tr.querySelector('.data-prep-match').innerHTML=dataPrepConfidence(sh.confidence);const src=tr.querySelector('.data-prep-source');if(src&&sh.detectedSource)src.value=sh.detectedSource});
  $$('.data-prep-preview-btn').forEach(btn=>btn.onclick=()=>{const tr=btn.closest('tr'),item=items.find(x=>x.token===tr?.dataset.prepToken);if(item)renderDataPrepPreview(item,tr)});if($('#dcDataPrepConvertBtn'))$('#dcDataPrepConvertBtn').disabled=!items.length;
}
function renderDataPrepPreview(item,tr){const sh=dataPrepCurrentSheet(item,tr),rows=sh.preview||[],card=$('#dcDataPrepPreviewCard'),box=$('#dcDataPrepPreview');if(!card||!box)return;$('#dcDataPrepPreviewTitle').textContent=`Önizleme · ${item.fileName} · ${sh.name||''}`;const width=Math.max(1,...rows.map(r=>r.length));box.innerHTML=`<table><tbody>${rows.map((r,ri)=>`<tr>${Array.from({length:width},(_,i)=>`<${ri===Math.max(0,(sh.headerRow||1)-1)?'th':'td'}>${esc(r[i]??'')}</${ri===Math.max(0,(sh.headerRow||1)-1)?'th':'td'}>`).join('')}</tr>`).join('')}</tbody></table>`;card.hidden=false;card.scrollIntoView({behavior:'smooth',block:'nearest'})}
function renderDataPrepOutputs(){const body=$('#dcDataPrepOutputBody');if(!body)return;const rows=dataPrepState.outputs||[];body.innerHTML=rows.map(o=>`<tr><td><strong>${esc(o.source)}</strong><small>${esc(o.label||'')}</small></td><td><code>${esc(o.outputFile)}</code></td><td class="num">${fmtNum(o.rows||0,0)}</td><td>${esc(o.matchedColumns||0)} / ${esc(o.templateColumns||0)}</td><td class="data-prep-missing">${o.missingColumns?.length?esc(o.missingColumns.slice(0,8).join(', '))+(o.missingColumns.length>8?` +${o.missingColumns.length-8}`:''):'—'}</td><td>${o.validation==='OK'?'<span class="data-prep-status-ok">Uygun</span>':'<span class="data-prep-status-bad">Uyumsuz</span>'}</td><td><div class="data-prep-output-actions"><button class="btn btn-ghost data-prep-download" type="button" data-batch="${esc(o.batchId)}" data-file="${esc(o.outputFile)}">CSV İndir</button>${o.logical&&o.validation==='OK'?`<button class="btn btn-primary data-prep-stage" type="button" data-batch="${esc(o.batchId)}" data-file="${esc(o.outputFile)}" data-source="${esc(o.logical)}">Kaynak Olarak Hazırla</button>`:''}</div></td></tr>`).join('')||'<tr><td colspan="7">Henüz CSV oluşturulmadı.</td></tr>';
  $$('.data-prep-download').forEach(b=>b.onclick=()=>{window.location.href=`/api/data-prep/download?batch=${encodeURIComponent(b.dataset.batch)}&file=${encodeURIComponent(b.dataset.file)}`});$$('.data-prep-stage').forEach(b=>b.onclick=()=>stagePreparedCsv(b));
}
async function loadDataPrep(silent=false){try{const d=await fetchApiJson('/api/data-prep',{},120000);dataPrepState.templates=d.templates||[];dataPrepState.history=d.history||[];dataPrepState.outputRoot=d.outputRoot||'';if($('#dcDataPrepOutputRoot'))$('#dcDataPrepOutputRoot').textContent=dataPrepState.outputRoot||'—';renderDataPrepHistory();if(dataPrepState.selected.length)renderDataPrepSelections()}catch(e){if(!silent)toast('Veri Hazırla bilgileri yüklenemedi: '+e.message,'error')}}
async function selectDataPrepExcel(){const b=$('#dcDataPrepSelectBtn');if(b)b.disabled=true;try{const d=await fetchApiJson('/api/data-prep/select-excel',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'},330000);if(d.cancelled)return;dataPrepState.templates=d.templates||dataPrepState.templates;dataPrepState.selected=d.items||[];dataPrepState.outputRoot=d.outputRoot||dataPrepState.outputRoot;if($('#dcDataPrepOutputRoot'))$('#dcDataPrepOutputRoot').textContent=dataPrepState.outputRoot||'—';renderDataPrepSelections();toast(`${dataPrepState.selected.length} Excel dosyası seçildi.`,'success')}catch(e){toast('Excel dosyaları seçilemedi: '+e.message,'error',7000)}finally{if(b)b.disabled=false}}
async function convertDataPrep(){const items=[];$$('#dcDataPrepInputBody tr[data-prep-token]').forEach(tr=>items.push({token:tr.dataset.prepToken,sheet:tr.querySelector('.data-prep-sheet')?.value||'',source:tr.querySelector('.data-prep-source')?.value||''}));if(!items.length)return toast('Önce Excel dosyası seçin.','warn');const b=$('#dcDataPrepConvertBtn');if(b){b.disabled=true;b.textContent='CSV Oluşturuluyor…'}showRefreshOverlay();try{const d=await fetchApiJson('/api/data-prep/convert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items})},600000);dataPrepState.outputs=d.files||[];dataPrepState.outputs.forEach(x=>x.batchId=d.batchId);renderDataPrepOutputs();toast(`${dataPrepState.outputs.length} kaynak CSV hazırlandı.`,'success',6500);await loadDataPrep(true)}catch(e){toast('CSV dönüşümü başarısız: '+e.message,'error',9000)}finally{hideRefreshOverlay();if(b){b.disabled=false;b.textContent='CSV Oluştur'}}}
async function stagePreparedCsv(btn){btn.disabled=true;try{const d=await fetchApiJson('/api/data-prep/stage-source',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({batchId:btn.dataset.batch,fileName:btn.dataset.file,source:btn.dataset.source})},180000);toast(`${sourceUpdateLabel(btn.dataset.source)} için hazırlanan CSV kaynak adayı oldu.`,'warn',6500);await loadSources({silent:true,forceScan:true});if(d.pending)openSourceUpdateModal(d.pending);else{const item=(state.meta.pendingSourceUpdates||[]).find(x=>x.source===btn.dataset.source);if(item)openSourceUpdateModal(item)}}catch(e){toast('Hazırlanan CSV kaynak olarak kullanılamadı: '+e.message,'error',8000)}finally{btn.disabled=false}}
async function openDataPrepFolder(){try{const d=await fetchApiJson('/api/data-prep/open-folder',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'},30000);toast(`Çıktı klasörü açıldı: ${d.path||''}`,'success')}catch(e){toast('Çıktı klasörü açılamadı: '+e.message,'error')}}

function renderDcSnapshots(){const source=$('#dcSnapshotSource')?.value||'';const rows=(dcState.snapshots||[]).filter(x=>!source||x.source===source);if($('#dcSnapshotsBody'))$('#dcSnapshotsBody').innerHTML=rows.map(x=>`<tr><td><code>${esc(x.snapshot_id)}</code></td><td>${esc(x.source)}</td><td>${dcFormatTime(x.report_time||x.created_at)}</td><td>${dcStatusBadge(x.status)}</td><td>${esc(x.layer)}</td><td title="${esc(x.file_hash||'')}"><code>${esc((x.file_hash||'').slice(0,12))}</code></td><td>${esc(x.file_name||'—')}</td></tr>`).join('')||'<tr><td colspan="7">Snapshot bulunamadı.</td></tr>'}

function initEvents(){
  if($('#notificationButton'))$('#notificationButton').onclick=openNotificationDrawer;if($('#notificationClose'))$('#notificationClose').onclick=closeNotificationDrawer;if($('#notificationBackdrop'))$('#notificationBackdrop').onclick=closeNotificationDrawer;if($('#notificationClear'))$('#notificationClear').onclick=clearNotifications;if($('#notificationRefresh'))$('#notificationRefresh').onclick=()=>loadNotifications(false);$$('[data-notif-filter]').forEach(b=>b.onclick=()=>{notificationFilter=String(b.dataset.notifFilter||'');renderNotifications()});
  if($('#userSessionButton'))$('#userSessionButton').onclick=()=>{showDataCenter();setDcTab('users')};if($('#dcUsersReloadBtn'))$('#dcUsersReloadBtn').onclick=()=>{loadUserContext(true);loadUserResponsibilities(false);loadUserAudit(true)};if($('#dcAuditReloadBtn'))$('#dcAuditReloadBtn').onclick=()=>loadUserAudit(false);if($('#dcUserSaveBtn'))$('#dcUserSaveBtn').onclick=saveUserResponsibilityForm;
  if($('#dcDataPrepSelectBtn'))$('#dcDataPrepSelectBtn').onclick=selectDataPrepExcel;if($('#dcDataPrepConvertBtn'))$('#dcDataPrepConvertBtn').onclick=convertDataPrep;if($('#dcDataPrepOpenFolderBtn'))$('#dcDataPrepOpenFolderBtn').onclick=openDataPrepFolder;if($('#dcDataPrepReloadBtn'))$('#dcDataPrepReloadBtn').onclick=()=>loadDataPrep(false);
  if($('#newTesisProjectClose'))$('#newTesisProjectClose').onclick=closeNewTesisProjectModal;if($('#newTesisProjectCancel'))$('#newTesisProjectCancel').onclick=closeNewTesisProjectModal;if($('#newProjectAddRow'))$('#newProjectAddRow').onclick=()=>addNewProjectDiscoveryRow();if($('#newTesisProjectSave'))$('#newTesisProjectSave').onclick=saveNewTesisProject;if($('#newTesisProjectModal'))$('#newTesisProjectModal').onclick=e=>{if(e.target===$('#newTesisProjectModal'))closeNewTesisProjectModal()};
  if($('#sourceUpdateClose'))$('#sourceUpdateClose').onclick=closeSourceUpdateModal;if($('#sourceUpdateModal'))$('#sourceUpdateModal').onclick=e=>{if(e.target===$('#sourceUpdateModal'))closeSourceUpdateModal()};if($('#sourceUpdateKeep'))$('#sourceUpdateKeep').onclick=()=>sourceUpdateChoice('keep');if($('#sourceUpdateAccept'))$('#sourceUpdateAccept').onclick=()=>sourceUpdateChoice('accept');if($('#sourceUpdateInspect'))$('#sourceUpdateInspect').onclick=()=>{const d=$('#sourceUpdateDetails');if(d)d.hidden=!d.hidden};
  if($('#projectLifecycleClose'))$('#projectLifecycleClose').onclick=closeProjectLifecycleModal;if($('#projectLifecycleCancel'))$('#projectLifecycleCancel').onclick=closeProjectLifecycleModal;if($('#projectLifecycleSave'))$('#projectLifecycleSave').onclick=saveProjectLifecycle;if($('#projectLifecycleModal'))$('#projectLifecycleModal').onclick=e=>{if(e.target===$('#projectLifecycleModal'))closeProjectLifecycleModal()};
  if($('#itemDecisionModalClose'))$('#itemDecisionModalClose').onclick=closeItemDecisionModal;if($('#itemDecisionModalCancel'))$('#itemDecisionModalCancel').onclick=closeItemDecisionModal;if($('#itemDecisionModalSave'))$('#itemDecisionModalSave').onclick=saveItemDecisionModal;if($('#itemDecisionModalDecision'))$('#itemDecisionModalDecision').onchange=syncItemDecisionModalReason;if($('#itemDecisionModal'))$('#itemDecisionModal').onclick=e=>{if(e.target===$('#itemDecisionModal'))closeItemDecisionModal()};
  $$('.nav-item[data-view="data-center"]').forEach(b=>b.onclick=showDataCenter);
  $$('.dc-tab').forEach(b=>b.onclick=()=>setDcTab(b.dataset.dcTab));
  if($('#dcRefreshBtn'))$('#dcRefreshBtn').onclick=loadDataCenter;
  if($('#dcIntegrityRunBtn'))$('#dcIntegrityRunBtn').onclick=async()=>{const b=$('#dcIntegrityRunBtn');b.disabled=true;try{toast('Bütünlük kontrolü başlatıldı…');await fetchApiJson('/api/data-center/integrity/run',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'},120000);toast('Bütünlük kontrolü tamamlandı.');await loadDataCenter()}catch(e){toast('Bütünlük kontrolü hatası: '+e.message)}finally{b.disabled=false}};
  if($('#dcSnapshotSource'))$('#dcSnapshotSource').onchange=renderDcSnapshots;
  $$('.control-mode-btn').forEach(b=>b.onclick=()=>setControlMode(b.dataset.controlMode));
  if($('#reservationHistoryQuickBtn'))$('#reservationHistoryQuickBtn').onclick=()=>showTesisHistory($('#reservationLookup')?.value||'');
  if($('#tesisHistoryRefresh'))$('#tesisHistoryRefresh').onclick=()=>loadTesisHistory(true);
  let histSearchDebounce=null;
  for(const sel of ['#tesisHistorySearch','#tesisHistoryDepot'])if($(sel))$(sel).oninput=()=>{clearTimeout(histSearchDebounce);histSearchDebounce=setTimeout(()=>loadTesisHistory(true),260)};
  if($('#tesisHistoryStatus'))$('#tesisHistoryStatus').onchange=()=>loadTesisHistory(true);
  if($('#tesisHistoryPrev'))$('#tesisHistoryPrev').onclick=()=>{if(tesisHistoryState.page>1){tesisHistoryState.page--;loadTesisHistory(false)}};
  if($('#tesisHistoryNext'))$('#tesisHistoryNext').onclick=()=>{if(tesisHistoryState.page<tesisHistoryState.pages){tesisHistoryState.page++;loadTesisHistory(false)}};
  $$('#tesisHistoryDetailTabs [data-history-tab]').forEach(b=>b.onclick=()=>{tesisHistoryState.tab=b.dataset.historyTab;renderTesisHistoryDetail()});
  if($('#recordsViewBtn'))$('#recordsViewBtn').onclick=showControlRecords;if($('#recordsBackBtn'))$('#recordsBackBtn').onclick=backToDecision;if($('#recordsRefreshBtn'))$('#recordsRefreshBtn').onclick=()=>loadControlRecords(false);
  if($('#recordsSearch')){let recordsSearchTimer=null;$('#recordsSearch').oninput=()=>{clearTimeout(recordsSearchTimer);recordsSearchTimer=setTimeout(()=>loadControlRecords(true),250)}}
  if($('#recordsTypeFilter'))$('#recordsTypeFilter').onchange=()=>loadControlRecords(true);if($('#recordsResultFilter'))$('#recordsResultFilter').onchange=()=>loadControlRecords(true);
  if($('#recordsPrevBtn'))$('#recordsPrevBtn').onclick=()=>{if(controlRecordState.page>1){controlRecordState.page--;loadControlRecords(false)}};if($('#recordsNextBtn'))$('#recordsNextBtn').onclick=()=>{if(controlRecordState.page<controlRecordState.pages){controlRecordState.page++;loadControlRecords(false)}};
  if($('#recordDetailClose'))$('#recordDetailClose').onclick=closeRecordDetail;if($('#recordDetailDone'))$('#recordDetailDone').onclick=closeRecordDetail;if($('#recordDetailModal'))$('#recordDetailModal').onclick=e=>{if(e.target===$('#recordDetailModal'))closeRecordDetail()};
  if($('#repeatControlCancel'))$('#repeatControlCancel').onclick=()=>closeRepeatControlModal(false);if($('#repeatControlConfirm'))$('#repeatControlConfirm').onclick=()=>closeRepeatControlModal(true);if($('#repeatControlModal'))$('#repeatControlModal').onclick=e=>{if(e.target===$('#repeatControlModal'))closeRepeatControlModal(false)};
  bindManualDepotInput('source');bindManualDepotInput('target');bindManualMaterialInput();
  $('#manualMaterialAddBtn').onclick=addSelectedManualMaterial;
  $('#manualMaterialQty').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();addSelectedManualMaterial()}};
  $('#manualPrepareBtn').onclick=prepareManualList;$('#manualClearBtn').onclick=clearManual;
  $('#manualPasteFocusBtn').onclick=()=>{const a=$('#manualPasteArea');if(a){a.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>a.focus(),250)}};
  $('#manualSampleBtn').onclick=()=>{const a=$('#manualPasteArea');a.value='Malzeme Kodu\tTalep Edilen Toplam Malzeme Miktarları\tKorubaşı İlave Trafo ve Şebeke Yenileme Projesi\tKışlabey Köy İlave Trafo ve Şebeke Yenileme Projesi\tDirekli Köyü Giriş İlave Trafo Projesi\n5100143932\t46\t42\t2\t2\n5100141032\t10\t5\t2\t3\n5100141033\t5\t3\t2\t';invalidateManualPrepared('Örnek Excel verisi eklendi.');refreshManualPastePreview();a.focus()};
  $('#manualPasteArea').oninput=()=>{if(state.ui.manualReady)invalidateManualPrepared();refreshManualPastePreview()};
  $('#manualPasteArea').onpaste=()=>setTimeout(refreshManualPastePreview,0);
  $('#reservationLookupBtn').onclick=lookupReservation;
  const reservationInput=$('#reservationLookup');
  reservationInput.oninput=()=>renderReservationSearch(reservationInput.value);
  reservationInput.onfocus=()=>renderReservationSearch(reservationInput.value);
  if($('#reservationSearchToggle'))$('#reservationSearchToggle').onclick=e=>{e.stopPropagation();const b=$('#reservationSearchResults');if(b&&!b.hidden)closeReservationSearch();else{renderReservationSearch(reservationInput.value);reservationInput.focus()}};
  reservationInput.onkeydown=e=>{
    const box=$('#reservationSearchResults'),opts=$$('.reservation-search-option');
    if(e.key==='ArrowDown'&&!box.hidden&&opts.length){e.preventDefault();setReservationSearchActive(state.ui.reservationSearchActive<0?0:state.ui.reservationSearchActive+1);return}
    if(e.key==='ArrowUp'&&!box.hidden&&opts.length){e.preventDefault();setReservationSearchActive(state.ui.reservationSearchActive<=0?opts.length-1:state.ui.reservationSearchActive-1);return}
    if(e.key==='Escape'){closeReservationSearch();return}
    if(e.key==='Enter'){
      e.preventDefault();
      if(!box.hidden&&state.ui.reservationSearchActive>=0&&opts[state.ui.reservationSearchActive]){
        openReservationByNo(opts[state.ui.reservationSearchActive].dataset.reservationNo);
      }else lookupReservation();
    }
  };
  $('#runCheckBtn').onclick=runCheck;$('#clearReservationBtn').onclick=clearReservation;
  $('#decisionModalClose').onclick=closeDecisionModal;$('#decisionModalDone').onclick=closeDecisionModal;
  $('#saveDecisionRecord').onclick=saveDecisionRecord;$('#exportDecisionExcel').onclick=exportDecisionAsExcel;$('#exportDecisionPdf').onclick=exportDecisionAsPdf;$('#exportDecisionJpg').onclick=exportDecisionAsJpg;
  $('#decisionResultModal').onclick=e=>{if(e.target===$('#decisionResultModal'))closeDecisionModal()};
  document.addEventListener('click',e=>{const target=e.target instanceof Element?e.target:null;if(!target)return;if(!target.closest('.reservation-search-field')&&!target.closest('#reservationLookupBtn'))closeReservationSearch();if(!target.closest('.manual-depot-search-field'))closeManualDepotSearch();if(!target.closest('.manual-material-search-field'))closeManualMaterialSearch();if(!target.closest('#manualContextMenu'))hideManualContextMenu();if(!target.closest('#dashboardCompanyCombo'))closeDashboardFilterResults('company');if(!target.closest('#dashboardDepotCombo'))closeDashboardFilterResults('depot')});
  document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(!$('#repeatControlModal').hidden)closeRepeatControlModal(false);else if(!$('#recordDetailModal').hidden)closeRecordDetail();else if(!$('#decisionResultModal').hidden)closeDecisionModal()});
  $('#refreshBtn').onclick=async()=>{const b=$('#refreshBtn');closeReservationSearch();showRefreshOverlay();setContentLoading(true);if(b)b.disabled=true;const t=Date.now();try{await loadSources({silent:true,forceScan:true});const wait=Math.max(0,350-(Date.now()-t));if(wait)await sleep(wait);toast(state.meta.dataEngine?.building?'Kaynaklar yenilendi. Büyük veri indeksi arka planda güncelleniyor.':'Veriler yenilendi.')}catch(e){toast('Yenileme hatası: '+e.message)}finally{hideRefreshOverlay();setContentLoading(false);if(b)b.disabled=false}};
  $('#loadingRetry').onclick=async()=>{if($('#loadingError'))$('#loadingError').hidden=true;if($('#loadingRetry'))$('#loadingRetry').hidden=true;loadingStartedAt=performance.now();loadingLastProgress=0;setLoading(4,'Yerel veri servisine yeniden bağlanılıyor…','Kaynak klasörü ve dosya eşleşmeleri tekrar kontrol ediliyor.');try{await loadSources({initial:true});await Promise.allSettled([loadUserContext(true),loadUserResponsibilities(true),loadNotifications(true)])}catch(e){showLoadingIssue(e.message)}};
  $('#notesText').value=localStorage.getItem('talep-current-notes')||'';$('#saveNoteBtn').onclick=()=>{localStorage.setItem('talep-current-notes',$('#notesText').value);$('#noteSaved').textContent='Kaydedildi';setTimeout(()=>$('#noteSaved').textContent='',1400)};
  $('#dashboardRefreshBtn').onclick=loadDashboardView;
  $('#dashboardRange').onchange=()=>{resetDashboardEntityFilters({reload:false});loadDashboardView()};
  $('#dashboardClearFiltersBtn').onclick=()=>resetDashboardEntityFilters({reload:true});
  $('#dashboardWorkType').onchange=e=>{dashboardFilterState.workType=e.target.value||'';const d=dashboardSelectedDepot();if(d&&dashboardFilterState.workType&&d.workType!==dashboardFilterState.workType){dashboardFilterState.depot='';dashboardFilterState.depotLabel='';$('#dashboardDepotInput').value=''}const eligible=dashboardEligibleDepots();if(dashboardFilterState.company&&eligible.length===1){dashboardFilterState.depot=eligible[0].key;dashboardFilterState.depotLabel=eligible[0].label;$('#dashboardDepotInput').value=eligible[0].label}updateDashboardScope();loadDashboardView()};
  const dashCompanyInput=$('#dashboardCompanyInput'),dashDepotInput=$('#dashboardDepotInput');
  dashCompanyInput.oninput=()=>{if(dashCompanyInput.value!==dashboardFilterState.company){dashboardFilterState.company='';dashboardFilterState.depot='';dashboardFilterState.depotLabel='';dashDepotInput.value='';updateDashboardScope()}renderDashboardCompanyResults(false)};
  dashCompanyInput.onfocus=()=>renderDashboardCompanyResults(false);
  $('#dashboardCompanyToggle').onclick=e=>{e.preventDefault();e.stopPropagation();renderDashboardCompanyResults(true)};
  dashCompanyInput.onkeydown=e=>{const box=$('#dashboardCompanyResults'),opts=box?[...box.querySelectorAll('.dashboard-filter-option')]:[];if(e.key==='ArrowDown'&&!box.hidden&&opts.length){e.preventDefault();setDashboardFilterActive('company',dashboardFilterState.companyActive<0?0:dashboardFilterState.companyActive+1)}else if(e.key==='ArrowUp'&&!box.hidden&&opts.length){e.preventDefault();setDashboardFilterActive('company',dashboardFilterState.companyActive<=0?opts.length-1:dashboardFilterState.companyActive-1)}else if(e.key==='Enter'&&!box.hidden&&dashboardFilterState.companyActive>=0&&opts[dashboardFilterState.companyActive]){e.preventDefault();selectDashboardCompany(opts[dashboardFilterState.companyActive].dataset.value||'')}else if(e.key==='Escape')closeDashboardFilterResults('company')};
  dashDepotInput.oninput=()=>{if(dashDepotInput.value!==dashboardFilterState.depotLabel){dashboardFilterState.depot='';dashboardFilterState.depotLabel='';updateDashboardScope()}renderDashboardDepotResults(false)};
  dashDepotInput.onfocus=()=>renderDashboardDepotResults(false);
  $('#dashboardDepotToggle').onclick=e=>{e.preventDefault();e.stopPropagation();renderDashboardDepotResults(true)};
  dashDepotInput.onkeydown=e=>{const box=$('#dashboardDepotResults'),opts=box?[...box.querySelectorAll('.dashboard-filter-option')]:[];if(e.key==='ArrowDown'&&!box.hidden&&opts.length){e.preventDefault();setDashboardFilterActive('depot',dashboardFilterState.depotActive<0?0:dashboardFilterState.depotActive+1)}else if(e.key==='ArrowUp'&&!box.hidden&&opts.length){e.preventDefault();setDashboardFilterActive('depot',dashboardFilterState.depotActive<=0?opts.length-1:dashboardFilterState.depotActive-1)}else if(e.key==='Enter'&&!box.hidden&&dashboardFilterState.depotActive>=0&&opts[dashboardFilterState.depotActive]){e.preventDefault();const b=opts[dashboardFilterState.depotActive];selectDashboardDepot(b.dataset.key||'',b.dataset.company||'')}else if(e.key==='Escape')closeDashboardFilterResults('depot')};
  $('#dashboardExportExcelBtn').onclick=exportDashboardExcel;
  $('#dashboardExportPdfBtn').onclick=exportDashboardPdf;
  $('#dashboardExportJpgBtn').onclick=exportDashboardJpg;
  $('#dashContractorMaterialSearch').oninput=renderDashboardContractorMaterials;
  $('#dashProjectSearch').oninput=renderDashboardProjectDistributions;
  if($('#opsGuaranteeFilterToggle'))$('#opsGuaranteeFilterToggle').onclick=()=>{const p=$('#opsGuaranteeFilters');if(p)p.hidden=!p.hidden};
  if($('#opsGuaranteeSearch'))$('#opsGuaranteeSearch').oninput=renderOperationsGuaranteeRows;if($('#opsGuaranteeStatus'))$('#opsGuaranteeStatus').onchange=renderOperationsGuaranteeRows;
  if($('#opsGuaranteeClear'))$('#opsGuaranteeClear').onclick=()=>{if($('#opsGuaranteeSearch'))$('#opsGuaranteeSearch').value='';if($('#opsGuaranteeStatus'))$('#opsGuaranteeStatus').value='';renderOperationsGuaranteeRows()};
  if($('#opsSpendGeneralBtn'))$('#opsSpendGeneralBtn').onclick=()=>{operationsSelectedDepot='';renderOperationsGuaranteeRows();renderOperationsSelectedSpend()};
  if($('#opsSpendFilterToggle'))$('#opsSpendFilterToggle').onclick=()=>{const p=$('#opsSpendFilters');if(p)p.hidden=!p.hidden};
  if($('#opsSpendMonth'))$('#opsSpendMonth').onchange=renderOperationsMonthlyTable;if($('#opsSpendDepotSearch'))$('#opsSpendDepotSearch').oninput=renderOperationsMonthlyTable;if($('#opsSpendSign'))$('#opsSpendSign').onchange=renderOperationsMonthlyTable;
  if($('#opsSpendClear'))$('#opsSpendClear').onclick=()=>{if($('#opsSpendMonth'))$('#opsSpendMonth').value='';if($('#opsSpendDepotSearch'))$('#opsSpendDepotSearch').value='';if($('#opsSpendSign'))$('#opsSpendSign').value='';renderOperationsMonthlyTable()};
  if($('#opsProjectFilterToggle'))$('#opsProjectFilterToggle').onclick=()=>{const p=$('#opsProjectFilters');if(p)p.hidden=!p.hidden};
  if($('#opsProjectManageSearch'))$('#opsProjectManageSearch').oninput=renderOperationsProjectManage;if($('#opsProjectManageStatus'))$('#opsProjectManageStatus').onchange=renderOperationsProjectManage;
  if($('#dcArchiveReloadBtn'))$('#dcArchiveReloadBtn').onclick=loadDataCenter;
  if($('#dcArchiveSpendFilterToggle'))$('#dcArchiveSpendFilterToggle').onclick=()=>{const p=$('#dcArchiveSpendFilters');if(p)p.hidden=!p.hidden};
  if($('#dcArchiveSpendMonth'))$('#dcArchiveSpendMonth').onchange=renderDcArchive;if($('#dcArchiveSpendDepot'))$('#dcArchiveSpendDepot').oninput=renderDcArchive;if($('#dcArchiveSpendSign'))$('#dcArchiveSpendSign').onchange=renderDcArchive;
  if($('#dcArchiveProjectFilterToggle'))$('#dcArchiveProjectFilterToggle').onclick=()=>{const p=$('#dcArchiveProjectFilters');if(p)p.hidden=!p.hidden};
  if($('#dcArchiveProjectSearch'))$('#dcArchiveProjectSearch').oninput=renderDcArchive;if($('#dcArchiveProjectStatus'))$('#dcArchiveProjectStatus').onchange=renderDcArchive;
  if($('#dcArchiveControlFilterToggle'))$('#dcArchiveControlFilterToggle').onclick=()=>{const p=$('#dcArchiveControlFilters');if(p)p.hidden=!p.hidden};
  if($('#dcArchiveControlSearch'))$('#dcArchiveControlSearch').oninput=renderDcArchive;
  $('#dashboardOpenArchiveBtn').onclick=e=>openSettingsFolder('record',e.currentTarget);
  $$('.kesif-tab').forEach(b=>b.onclick=()=>setKesifSheet(b.dataset.kesifSheet));
  const kScroll=document.querySelector('.kesif-table-wrap');
  if(kScroll)kScroll.addEventListener('scroll',()=>{if(kesifManage.qLoading)return;const size=Number($('#kesifPageSize')?.value||100);const total=Number($('#kesifFilteredCount')?.textContent?.replace(/\D/g,'')||0);if(kesifManage.page*size>=total)return;if(kScroll.scrollTop+kScroll.clientHeight>=kScroll.scrollHeight-110){kesifManage.qAppend=true;kesifManage.page++;renderKesifManagementView(false)}});
  $('#kesifSearch').oninput=scheduleKesifRender;$('#kesifDepotFilter').onchange=()=>{kesifManage.page=1;renderKesifManagementView(false)};$('#kesifStatusFilter').onchange=()=>{kesifManage.page=1;renderKesifManagementView(false)};$('#kesifPageSize').onchange=()=>{kesifManage.page=1;renderKesifManagementView(false)};
  $('#kesifClearFiltersBtn').onclick=()=>{$('#kesifSearch').value='';$('#kesifDepotFilter').value='';$('#kesifStatusFilter').value='';kesifManage.page=1;renderKesifManagementView(false)};
  $('#kesifPrevBtn').onclick=()=>{kesifManage.page=Math.max(1,kesifManage.page-1);renderKesifManagementView(false)};$('#kesifNextBtn').onclick=()=>{kesifManage.page+=1;renderKesifManagementView(false)};
  if($('#tkFormDownloadBtn'))$('#tkFormDownloadBtn').onclick=()=>{
    const key=$('#tkFormKind')?.value||'TESIS';
    window.location.href='/api/form-import/template?key='+encodeURIComponent(key);
    toast('Orijinal kurumsal Excel dosyası indiriliyor; mevcut örnek alanları kontrol edin.');
  };
  if($('#formLibraryImportNav'))$('#formLibraryImportNav').onclick=()=>{const nav=document.querySelector('.nav-item[data-view="data-center"]');if(nav)nav.click();const tab=document.querySelector('.dc-tab[data-dc-tab="dataPrep"]');if(tab)tab.click()};
  if($('#tkFormPreviewBtn'))$('#tkFormPreviewBtn').onclick=tkPreviewFormExcel;
  if($('#tkFormStageBtn'))$('#tkFormStageBtn').onclick=tkStageFormExcel;
  if($('#tkFormExcelFile'))$('#tkFormExcelFile').onchange=()=>{tkFormLastValidated=null;if($('#tkFormStageBtn'))$('#tkFormStageBtn').disabled=true};
  if($('#tkFormKind'))$('#tkFormKind').onchange=()=>{tkFormLastValidated=null;if($('#tkFormStageBtn'))$('#tkFormStageBtn').disabled=true};
  $('#kesifNewTemplateBtn').onclick=()=>{
    // FIX28E pilot export: V0.6 is an example workbook, not a live dynamic generator.
    window.location.href='/api/templates/yeni-kesif-v06';
    toast('Yeni keşif V0.6 örnek Excel şablonu indiriliyor. Proje sayısı ve import entegrasyonu henüz geliştirme aşamasında.');
  };
  $('#kesifRefreshBtn').onclick=refreshKesifManagement;$('#kesifOpenFolderBtn').onclick=e=>openSettingsFolder('data',e.currentTarget);$('#kesifExportBtn').onclick=exportKesifFilteredCsv;
  $('#settingsReloadBtn').onclick=loadSettingsView;
  $('#exemptionReloadBtn').onclick=loadExemptionSettings;
  $('#exemptionSaveBtn').onclick=saveExemptionFromForm;
  $('#exemptionMaterialCode').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();saveExemptionFromForm()}};
  $('#settingsDataChangeBtn').onclick=()=>selectSettingsFolder('data');
  $('#settingsRecordChangeBtn').onclick=()=>selectSettingsFolder('record');
  $('#settingsDataOpenBtn').onclick=e=>openSettingsFolder('data',e.currentTarget);
  $('#settingsRecordOpenBtn').onclick=e=>openSettingsFolder('record',e.currentTarget);
  $$('[data-settings-open-folder]').forEach(b=>b.onclick=()=>openSettingsFolder(b.dataset.settingsOpenFolder,b));
}


// Görünmez yerel servisin sayfa yaşam döngüsünü izlemesi için heartbeat.
let closeSignalSent=false;
async function sendHeartbeat(){
  try{await fetch('/api/heartbeat?ts='+Date.now(),{cache:'no-store',keepalive:true})}catch(_){}
}
function signalClientClose(){
  if(closeSignalSent)return;
  closeSignalSent=true;
  try{navigator.sendBeacon('/api/client-close','closed')}catch(_){}
}
sendHeartbeat();
const heartbeatTimer=setInterval(sendHeartbeat,3000);
const sourceMonitorTimer=setInterval(pollSourceUpdateStatus,60000);
const notificationTimer=setInterval(()=>loadNotifications(true).catch(()=>{}),60000);
window.addEventListener('beforeunload',signalClientClose);
window.addEventListener('pageshow',()=>{closeSignalSent=false;sendHeartbeat()});

(async function boot(){initNav();initSourceTableViews();initWorkOperationViews();initEvents();setControlMode(state.ui.mode);try{setLoading(4,'Yerel veri servisine bağlanılıyor…','Kaynak klasörü ve dosya eşleşmeleri kontrol ediliyor.');await loadSources({initial:true})}catch(e){console.error(e);showLoadingIssue(e.message);state.diagnostics.push({level:'bad',text:e.message});try{renderCommon()}catch(_e){};}})();
