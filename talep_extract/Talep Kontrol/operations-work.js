/* Talep Kontrol FIX28O: approved BAKIM, KET and LED report UI.
   All data from existing read-only work reports / read-only MB51 monthly endpoint.
   No fabricated demand, TEDAS position, revision identity, or cross-unit quantities. */
(function(){
'use strict';
const months=['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const state={B:{year:'2026',month:null,detail:0,detailTab:'general',request:0},K:{year:'2026',month:null,detail:0,detailTab:'general',request:0},L:{year:'2026',month:null,detail:0,detailTab:'general',request:0}};
const columnMap={'Malzeme Kodu':'materialCode','Malzeme Tanımı':'materialDesc','Malzeme Tanımı-2 SAP':'materialDesc','Rezervasyon No':'reservationNo','Malzeme Kalemi':'materialCount','Belge Sayısı':'documentCount','Tarih':'postingDate','Malzeme Belgesi':'documentNo','Ölçü':'unit','İhale Keşfi':'discoveryQty','Kaynak Verilen':'sourceGivenQty','Keşif – Kaynak Verilen Fark':'differenceQty','Depo':'depot','Son Hareket':'postingDate','Malzeme Belgesi':'documentNo'};
const colState={B:{},K:{},L:{},T:{}};const qSort={B:{},K:{},L:{},T:{}};
window.FIX28QFilterQuery=(code,tab)=>({columnFilters:JSON.stringify(colState[code]?.[tab]||{}),sortBy:qSort[code]?.[tab]?.key||'',sortDir:qSort[code]?.[tab]?.dir||(tab==='given'?'desc':'asc')});
window.FIX28QSetFilter=(code,tab,key,value,sortDir)=>{colState[code]??={};colState[code][tab]??={};qSort[code]??={};if(sortDir){qSort[code][tab]={key,dir:sortDir};return}if(value)colState[code][tab][key]=value;else delete colState[code][tab][key]};
function localDate(v){const s=String(v||'');return /^\d{4}-\d{2}-\d{2}$/.test(s)?s.slice(8)+'.'+s.slice(5,7)+'.'+s.slice(0,4):(s||'—')}
function bindFilters(code,st,root){
 root.querySelectorAll('.q28-filter').forEach(b=>b.addEventListener('click',e=>{
  e.stopPropagation();const key=b.dataset.key,head=b.closest('th');
  root.querySelectorAll('.q28-filter-panel').forEach(x=>x.remove());
  const box=document.createElement('div');box.className='q28-filter-panel';const existing=colState[code]?.[st.tab]?.[key]||{};
  box.innerHTML=`<label>Karşılaştırma<select data-q28-op><option value="contains">İçerir</option><option value="equals">Eşittir</option>${['discoveryQty','sourceGivenQty','differenceQty','materialCount','documentCount'].includes(key)?'<option value="gt">Büyüktür</option><option value="lt">Küçüktür</option>':''}${key==='postingDate'?'<option value="date_from">Bu tarihten sonra</option><option value="date_to">Bu tarihten önce</option>':''}</select></label><label>Değer<input type="text" data-q28-value maxlength="120" placeholder="Filtre değeri" /></label><div class="q28-filter-actions"><button data-q28-apply type="button">Uygula</button><button data-q28-clear type="button">Temizle</button><button data-q28-asc type="button">A↑Z</button><button data-q28-desc type="button">Z↓A</button></div>`;
  document.body.appendChild(box);const rect=b.getBoundingClientRect();box.style.left=Math.max(8,Math.min(innerWidth-290,rect.left-80))+'px';box.style.top=Math.min(innerHeight-270,rect.bottom+5)+'px';
  box.querySelector('[data-q28-op]').value=existing.op||'contains';box.querySelector('[data-q28-value]').value=existing.value||'';
  function close(){box.remove()}function apply(){const val=box.querySelector('[data-q28-value]').value.trim();colState[code][st.tab]??={};if(val)colState[code][st.tab][key]={op:box.querySelector('[data-q28-op]').value,value:val};else delete colState[code][st.tab][key];st.page=1;state[code].signature='';state[code].nextPending=false;close();window.loadWorkReport(code)}
  box.querySelector('[data-q28-apply]').onclick=apply;box.querySelector('[data-q28-clear]').onclick=()=>{box.querySelector('[data-q28-value]').value='';apply()};
  for(const dir of ['asc','desc'])box.querySelector(`[data-q28-${dir}]`).onclick=()=>{qSort[code][st.tab]={key,dir};st.page=1;state[code].signature='';close();window.loadWorkReport(code)};
  const outside=ev=>{if(!box.contains(ev.target)&&ev.target!==b){close();document.removeEventListener('pointerdown',outside,true)}};setTimeout(()=>document.addEventListener('pointerdown',outside,true),0);
 }));
 const scroll=root.querySelector('.o28-grid-scroll');if(scroll&&st.tab!=='consumption'&&!(code==='B'&&st.tab==='money')){
  scroll.addEventListener('scroll',()=>{const ui=state[code];if(ui.fetching||st.page>=st.pages)return;if(scroll.scrollTop+scroll.clientHeight>=scroll.scrollHeight-110){ui.nextPending=true;st.page++;window.loadWorkReport(code)}});
 }
}

const label={B:'BAKIM',K:'KET',L:'LED'};
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>v===null||v===undefined?'—':Number(v).toLocaleString('tr-TR',{maximumFractionDigits:3});
const money=v=>v===null||v===undefined?'—':Number(v).toLocaleString('tr-TR',{style:'currency',currency:'TRY',maximumFractionDigits:2});
const num=v=>Number(v||0);
const titleMap={money:'Parasal İcmal',material:'Malzeme İcmal',given:'Verilen Malzeme Detayı',consumption:'Tüketim Detayı',discovery:'Keşif'};
function note(text){return `<div class="o28-note" role="note">${safe(text)}</div>`}
function kpis(items){return `<div class="o28-kpis">${items.map(([t,v,sub],i)=>`<div class="o28-kpi o28-c${i%5}"><small>${safe(t)}</small><strong>${safe(v)}</strong>${sub?`<span>${safe(sub)}</span>`:''}</div>`).join('')}</div>`}
function table(headers,rows,empty='Bu filtre için kayıt bulunamadı.'){
 const head=headers.map(x=>{const key=columnMap[x];return `<th><span>${safe(x)}</span>${key?`<button class="q28-filter" type="button" data-key="${key}" title="${safe(x)} sütununu filtrele / sırala" aria-label="${safe(x)} sütun filtresi">⌄</button>`:''}</th>`}).join('');
 return `<div class="o28-grid-scroll" role="region" aria-label="Rapor tablosu" tabindex="0"><table class="o28-table"><thead><tr><th class="q28-index-head">No</th>${head}</tr></thead><tbody>${rows.length?rows.join(''):`<tr><td colspan="${headers.length+1}" class="o28-empty">${safe(empty)}</td></tr>`}</tbody></table></div>`
}
function row(values,idx,selected=false){const n=Number(state._rowOffset||0)+idx+1;return `<tr class="${selected?'o28-selected':''}" data-o28-row="${idx}" tabindex="0"><td class="q28-row-number">${n}</td>${values.map(v=>`<td>${v==null?'—':safe(v)}</td>`).join('')}</tr>`}
function mount(code){const sec=document.querySelector(`.work-operations-view[data-work-code="${code}"]`);if(!sec)return null;sec.classList.add('o28-work');const panel=sec.querySelector('.work-report26');if(!panel)return null;
 if(!panel.querySelector('.o28-root')){const el=document.createElement('div');el.className='o28-root';el.setAttribute('aria-live','polite');panel.appendChild(el);}
 const diff=panel.querySelector('[data-report-tab="diff"]');if(diff)diff.hidden=true;
 return {sec,panel,root:panel.querySelector('.o28-root')}
}
function meta(code,tab){let h=`<div class="o28-section-title"><div><h3>${label[code]} | ${titleMap[tab]||'Malzeme İcmal'}</h3><p>İl / üretim yeri ve depo filtreleri üst bölümden uygulanır.</p></div><span class="o28-badge">Canlı kaynak görünümü</span></div>`;return h}
function sourceAlert(code,tab){if(tab==='discovery')return note('Mevcut indeks, SAP malzeme kodu düzeyindedir. TEDAŞ poz varyantı, Talep Edilen, Termin ve tarih/veren/açıklamalı revizyon verileri doğrulanmış biçimde bağlanmadığından “—” gösterilir. “Kaynak Verilen” talep değildir.');
 if(tab==='material')return note('Keşif–Kaynak Verilen farkı gösterilir. “Kaynak Verilen”, doğrulanmış “Talep Edilen” anlamına gelmez. MB51 fiili miktar ayrıca gösterilir; aynı tutar iki kez düşülmez.');
 if(tab==='money')return note('Kart tutarları yalnız bu sayfada MB52 YENİ fiyatı bulunan kalemlere dayanır; fiyatı eksik kalemler 0 kabul edilmez. Genel sözleşme ve TEDAŞ fiyat toplamları bu kaynaktan doğrulanamaz.');
 if(tab==='given')return note('MB51 fiili verilenler, ilgili nakil/ters kayıt yönüne göre netleştirilir. Hedef depo bilinmeyen hareket için verilen miktarı doğrulanmış olarak gösterilmez.');return ''}
function pager(code,st,d){return `<div class="o28-pager q28-auto-info"><span>${fmt(d.rows?.length||0)} / ${fmt(d.total)} kayıt · ${st.page<d.pages?'Devamı için tabloyu aşağı kaydırın':'Tüm kayıtlar yüklendi'}</span></div>`}
function mountPageEvents(code,st,root){bindFilters(code,st,root);}
function selectedDetail(code,records,idx){const r=records[idx];if(!r)return `<div class="o28-empty">Malzeme seçin.</div>`;const st=state[code];
 const line=(k,v)=>`<div class="o28-dline"><span>${safe(k)}</span><strong>${safe(v==null?'—':v)}</strong></div>`;
 const general=`<div class="o28-detail-lines">${line('Malzeme Kodu',r.materialCode||'—')}${line(code==='L'?'TEDAŞ Alt Poz':'Poz Birleşik','—')}${line('Malzeme Tanımı-2 SAP',r.materialDesc||'—')}${line('Malzeme Veya İşin Cinsi','—')}${line('Ölçü',r.unit||'—')}${line('Termin','—')}${line('İhale Keşfi',fmt(r.discoveryQty))}${line('Talep Edilen','—')}${line('Talep Edilen Detay','Kaynak eşleştirmesi bekliyor')}</div>`;
 const revisions=`<div class="o28-detail-lines">${line('Revizyon Tarihi','—')}${line('Revizyonu Veren','—')}${line('Açıklama','—')}</div>${note('Bu malzeme için yetkili, doğrulanmış revizyon kaydı bu sürümde bağlı değildir. Excel’de bulunmayan tarih/kişiler oluşturulmaz.')}`;
 const demand=`<div class="o28-detail-lines">${line('Malzeme Kodu',r.materialCode||'—')}${line('Talep Edilen','—')}${line('Talep Eden','—')}${line('Talep Tarihi','—')}${line('Açıklama','—')}</div>${note('Talep Edilen bilgisi ancak F.603 ve varsa revizyonlar uygun kaynak ve onayla ilişkilendirildiğinde gösterilecektir. LED için ek tesisat alanı gösterilmez.')}`;
 return `<div class="o28-detail-intro"><small>SEÇİLİ MALZEME</small><strong>${safe(r.materialCode||'—')}</strong><span>${safe(r.materialDesc||'Tanım bulunamadı')}</span></div><div class="o28-mini-tabs"><button data-o28-detail="general" class="${st.detailTab==='general'?'active':''}">Genel Bilgi</button><button data-o28-detail="revision" class="${st.detailTab==='revision'?'active':''}">Revizyon Geçmişi</button><button data-o28-detail="demand" class="${st.detailTab==='demand'?'active':''}">Talep Edilen Detay</button></div>${st.detailTab==='general'?general:st.detailTab==='revision'?revisions:demand}`
}
function bindDetail(code,root,records){const st=state[code];root.querySelectorAll('[data-o28-row]').forEach(tr=>{const choose=()=>{st.detail=Number(tr.dataset.o28Row)||0;st.detailTab='general';refresh();};tr.addEventListener('click',choose);tr.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();choose()}})});
 function refresh(){root.querySelectorAll('[data-o28-row]').forEach(x=>x.classList.toggle('o28-selected',Number(x.dataset.o28Row)===st.detail));const el=root.querySelector('.o28-detail-body');if(el)el.innerHTML=selectedDetail(code,records,st.detail);root.querySelectorAll('[data-o28-detail]').forEach(b=>b.onclick=()=>{st.detailTab=b.dataset.o28Detail;refresh()})};refresh()}
function displayDiscovery(code,st,d,root){const rows=d.rows||[];const cards=kpis([['Keşifli Malzeme Sayısı',fmt(d.total),'SAP kodu bazlı satır'],['Talep Edilen Kalem Sayısı','—','Onaylı talep kaynağı bekleniyor'],['Keşif Aşımı Olanlar','—','Talep bağlanınca hesaplanır'],['Revize Edilenler','—','Revizyon kaynağı bekleniyor']]);
 const head=['Malzeme Kodu',code==='L'?'TEDAŞ Alt Poz':'Poz Birleşik','Malzeme Tanımı-2 SAP','Malzeme Veya İşin Cinsi','Ölçü','Termin','İhale Keşfi','Talep Edilen','Talep Edilen Detay'];
 const trs=rows.map((r,i)=>row([r.materialCode,'—',r.materialDesc||'—','—',r.unit,'—',fmt(r.discoveryQty),'—','Detay Gör'],i,state[code].detail===i));
 root.innerHTML=meta(code,'discovery')+cards+sourceAlert(code,'discovery')+`<div class="o28-two"><section class="o28-panel"><div class="o28-panel-title"><h4>Keşif – Talep Karşılaştırma Listesi</h4><small>Malzemeye tıklayarak detayı inceleyin</small></div>${table(head,trs)}</section><section class="o28-panel o28-detail"><div class="o28-panel-title"><h4>Malzeme Detayı</h4></div><div class="o28-detail-body"></div></section></div>`+pager(code,st,d);
 mountPageEvents(code,st,root);bindDetail(code,root,rows)
}
function displayMaterial(code,st,d,root){const rows=d.rows||[],confirmed=rows.filter(r=>r.actualGivenQty!==null).length,issues=rows.filter(r=>num(r.issues)>0).length;
 const cards=kpis([['Malzeme Satırı',fmt(d.total),'Tüm filtrelenmiş kayıt'],['MB51 Verileni Bulunan',fmt(confirmed),'Bu sayfada'],['Kontrol Gerektiren',fmt(issues),'Bu sayfada'],['Talep Edilen','—','Onaylı talep kaynağı bekleniyor']]);
 const headers=['Malzeme Kodu','Malzeme Tanımı-2 SAP','Ölçü','İhale Keşfi','Talep Edilen','Kaynak Verilen','MB51 Fiili Verilen','Keşif – Kaynak Verilen Fark'];
 const trs=rows.map((r,i)=>row([r.materialCode,r.materialDesc||'—',r.unit,fmt(r.discoveryQty),'—',fmt(r.sourceGivenQty),fmt(r.actualGivenQty),fmt(r.differenceQty)],i));
 root.innerHTML=meta(code,'material')+cards+sourceAlert(code,'material')+`<section class="o28-panel"><div class="o28-panel-title"><h4>Malzeme Miktar ve Fark Özeti</h4></div>${table(headers,trs)}</section>`+pager(code,st,d);mountPageEvents(code,st,root)}
/* FIX28P: BAKIM F.604 three-row summary. Original Excel file is read only. */
const f604Cols=[['Özet Türü','groupLabel'],['İl','city'],['Depo Kodu','depot'],['Depo Adı','depotName'],['Sözleşme No','contractNo'],['Sözleşme Grubu','contractGroup'],['Yüklenici','company'],['Sözleşme Tutarı','contractAmount'],['İhale Keşfi','discovery'],['Talep Edilen','requested'],['Toplam Verilen','given'],['Talep – Verilen Farkı','requestGivenDiff'],['Toplam Tüketilen','consumed'],['Verilen – Tüketim Farkı','givenConsumedDiff'],['Tüketim Oranı','consumptionRatio'],['Verilen Malzeme Oranı','givenRatio']];
const f604Types=[['ALL','Üç Özeti Göster'],['BIRIM','Birim Miktar Toplamı'],['TEDAS','TEDAŞ Malzeme Fiyatı'],['SAP','SAP Malzeme Fiyatı']];
function f604Value(r,key){const v=r[key];if(v===null||v===undefined||v==='')return '—';if(['consumptionRatio','givenRatio'].includes(key))return (Number(v)*100).toLocaleString('tr-TR',{minimumFractionDigits:1,maximumFractionDigits:2})+'%';if(key==='contractAmount'||(r.group!=='BIRIM'&&['discovery','requested','given','requestGivenDiff','consumed','givenConsumedDiff'].includes(key)))return money(v);if(['discovery','requested','given','requestGivenDiff','consumed','givenConsumedDiff'].includes(key))return fmt(v)+' *';return String(v)}
function f604SummaryValue(rows,key,mode){if(!rows.length||rows.some(r=>r[key]===null||r[key]===undefined))return '—';const n=rows.reduce((x,r)=>x+Number(r[key]),0);if(['consumptionRatio','givenRatio'].includes(key))return '—';if(key==='contractAmount'||mode!=='BIRIM')return money(n);return fmt(n)+' *'}
function displayF604(st,d,root){const selected=state.B.moneyMode||'ALL';const filtered=(d.rows||[]).filter(r=>selected==='ALL'||r.group===selected);const totals=(d.rows||[]).filter(r=>r.group===(selected==='ALL'?'TEDAS':selected));const mode=selected==='ALL'?'TEDAS':selected;
 const cards=[['Sözleşme Tutarı',f604SummaryValue(totals,'contractAmount',mode)],['İhale Keşfi',f604SummaryValue(totals,'discovery',mode)],['Talep Edilen',f604SummaryValue(totals,'requested',mode)],['Toplam Verilen',f604SummaryValue(totals,'given',mode)],['Talep – Verilen Farkı',f604SummaryValue(totals,'requestGivenDiff',mode)],['Toplam Tüketilen',f604SummaryValue(totals,'consumed',mode)],['Verilen – Tüketim Farkı',f604SummaryValue(totals,'givenConsumedDiff',mode)],['Sözleşme Sayısı',fmt(d.contracts||0)]];
 const kpiCards=kpis(cards.map(([a,b],i)=>[a,b,i===7?'Filtre kapsamı':(selected==='ALL'?'TEDAŞ fiyatlı referans':selected==='BIRIM'?'Birim miktar (birimler karışık)':'Seçili fiyat türü')]));
 const options=f604Types.map(([v,title])=>`<button type="button" data-f604-type="${v}" class="${v===selected?'selected':''}" aria-pressed="${v===selected?'true':'false'}">${safe(title)}</button>`).join('');
 const headers=f604Cols.map(x=>x[0]);
 const trs=filtered.map((r,i)=>row(f604Cols.map(x=>f604Value(r,x[1])),i));
 const title=`<div class="o28-section-title o28p-main-title"><div><h3>BAKIM | Parasal İcmal</h3><p>Yüklenici / sözleşme bazında F.604 özetleri · Malzeme detayları Malzeme İcmal sekmesindedir.</p></div><span class="o28-badge o28p-preview-badge">${(d.referenceContracts||0)>0?'Excel Referans Örneği':'Yerel Excel Önizlemesi'}</span></div>`;
 const noData=(d.rows||[]).length===0?note('Bu filtre için F.604 özeti bulunamadı. Kaynağı değiştirmeden önizlemek için orijinal Excel’i '+(d.locationHint||'F604_ONIZLEME_KAYNAKLARI')+' klasörüne kopyalayabilirsiniz. Bu, onaylı yayına dönüşmez.'):'';
 const warning=note(d.sourceNotice||'Excel kaynaklı önizleme; güncel kesin değer değildir.');
 const sources=[...new Set((d.rows||[]).map(r=>r.sourceFile))].map(x=>safe(x)).join(' · ');
 const unitWarning=note('“Birim Miktar Toplamı” farklı ölçü birimlerini birleştirebildiğinden fiziksel toplam olarak yorumlanmamalıdır. (*) işareti miktar biçimini belirtir; bu satır TL değildir.');
 const sourceInfo=sources?`<div class="o28p-source">Kaynak: ${sources} · Sadece okuma · Özgün Excel değişmedi</div>`:'';
 const head=`<div class="o28p-group-head"><div><h4>F.604 – Üç İcmal Grubu</h4><small>Orijinal Excel’deki 7, 10 ve 13. satırlarla aynı alanlar</small></div><div class="o28p-types" aria-label="Özet görünümü">${options}</div></div>`;
 root.innerHTML=title+noData+warning+head+((d.rows||[]).length?kpiCards:'')+`<section class="o28-panel o28p-summary"><div class="o28-panel-title"><h4>Yüklenici / Sözleşme Parasal İcmal</h4><small>${fmt(d.contracts)} sözleşme · ${fmt(filtered.length)} özet satırı</small></div>${table(headers,trs,'Seçilen depo/sözleşme için F.604 özeti yok.')}<div class="o28p-source">* Birim miktarlar farklı ölçü birimleri içerebilir; ₺ toplamı değildir.</div></section>`+unitWarning+sourceInfo+((d.warnings||[]).length?note(d.warnings.join(' | ')):'');
 root.querySelectorAll('[data-f604-type]').forEach(b=>b.addEventListener('click',()=>{state.B.moneyMode=b.dataset.f604Type;displayF604(st,d,root)}));
 state.B.f604ExportData={rows:filtered,mode:selected,sourceNotice:d.sourceNotice};
}
function f604Export(type){const d=state.B.f604ExportData;if(!d||!d.rows?.length)return;
 const mode=d.mode||'ALL';const file='BAKIM_F604_Parasal_Icmal_'+mode;
 if(type==='excel'){
  const csvText='\uFEFF'+[f604Cols.map(x=>escapeCsv(x[0])).join(';'),...d.rows.map(r=>f604Cols.map(x=>escapeCsv(r[x[1]]==null?'':r[x[1]])).join(';'))].join('\r\n');
  const blob=new Blob([csvText],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=file+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }else{
  const w=window.open('','_blank');if(!w){alert('PDF için açılır pencere izni gerekli.');return;}
  const trs=d.rows.map(r=>'<tr>'+f604Cols.map(x=>'<td>'+safe(f604Value(r,x[1]))+'</td>').join('')+'</tr>').join('');
  w.document.write(`<html><head><meta charset="UTF-8"><title>${safe(file)}</title><style>body{font:12px Arial;color:#12304e;padding:20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #cddbe5;padding:6px}th{background:#e5f5f2}p{color:#874d09}</style></head><body><h2>BAKIM | Parasal İcmal (F.604)</h2><p>${safe(d.sourceNotice||'Excel önizlemesi, kesin veri değildir.')}</p><table><thead><tr>${f604Cols.map(x=>'<th>'+safe(x[0])+'</th>').join('')}</tr></thead><tbody>${trs}</tbody></table><p>* Birim toplamları farklı birimleri içerebilir.</p></body></html>`);w.document.close();w.focus();setTimeout(()=>w.print(),400);
 }
}
function displayMoney(code,st,d,root){const rows=d.rows||[],known=rows.filter(r=>r.unitPrice!=null),sum=k=>known.reduce((a,r)=>a+num(r[k]),0);
 const cards=kpis([['Keşif Bedeli',money(sum('discoveryAmount')),'Fiyatı bulunan bu sayfa'],['Kaynak Verilen Bedeli',money(sum('givenAmount')),'Fiyatı bulunan bu sayfa'],['MB51 Fiili Bedel',known.some(r=>r.actualGivenAmount!=null)?money(sum('actualGivenAmount')):'—','Doğrulanabilir bu sayfa'],['Fiyatı Eksik',fmt(rows.length-known.length),'Bu sayfada']]);
 const headers=['Malzeme Kodu','Malzeme Tanımı','Ölçü','İhale Keşfi','Kaynak Verilen','MB51 Fiili Verilen','Birim Fiyat (₺)','Keşif Bedeli (₺)','Verilen Bedeli (₺)','Fiyat Kaynağı'];
 const trs=rows.map((r,i)=>row([r.materialCode,r.materialDesc||'—',r.unit,fmt(r.discoveryQty),fmt(r.sourceGivenQty),fmt(r.actualGivenQty),money(r.unitPrice),money(r.discoveryAmount),money(r.givenAmount),r.priceSource],i));
 root.innerHTML=meta(code,'money')+cards+sourceAlert(code,'money')+`<section class="o28-panel"><div class="o28-panel-title"><h4>Parasal İcmal</h4><small>Doğrulanmış fiyat bulunmayan satırlar korunur</small></div>${table(headers,trs)}</section>`+pager(code,st,d);mountPageEvents(code,st,root)}
function displayGiven(code,st,d,root){
 const rows=d.rows||[],ui=state[code],grouped=(ui.givenMode||'group')!=='all';
 const cards=kpis(grouped?[['Rezervasyon Sayısı',fmt(d.total),'Filtrelenen kapsam'],['Gösterilen Rezervasyon',fmt(rows.length),'Kaydırarak devam eder'],['Belge Sayısı',fmt(rows.reduce((a,r)=>a+num(r.documentCount),0)),'Gösterilen rezervasyonlar'],['Malzeme Kalemi',fmt(rows.reduce((a,r)=>a+num(r.materialCount),0)),'Gösterilen rezervasyonlarda']]:[['MB51 Hareket Kaydı',fmt(d.total),'Bu filtrede'],['Yönü Doğrulanan',fmt(rows.filter(r=>r.signedQty!==null).length),'Gösterilen kayıt'],['Yönü Belirsiz',fmt(rows.filter(r=>r.signedQty===null).length),'Gösterilen kayıt']]);
 const controls=`<div class="q28-given-modes" role="group" aria-label="Verilen malzeme görünümü"><button type="button" data-q28-mode="group" class="${grouped?'active':''}">Rezervasyon Özeti</button><button type="button" data-q28-mode="all" class="${grouped?'':'active'}">Tüm Hareketler</button></div>`;
 const headers=grouped?['Rezervasyon No','Malzeme Kalemi','Belge Sayısı','Son Hareket']:['Malzeme Kodu','Malzeme Tanımı','Verilen Miktar','Rezervasyon No','Tarih','Malzeme Belgesi'];
 const trs=rows.map((r,i)=>grouped?row([r.reservationNo||`Rezervasyonsuz • ${r.documentNo||'Belge no yok'}`,fmt(r.materialCount),fmt(r.documentCount),localDate(r.lastPostingDate)],i):row([r.materialCode,r.materialDesc||'—',r.signedQty===null?'Doğrulanmadı':`${fmt(r.signedQty)} ${r.unit||''}`,r.reservationNo||'—',localDate(r.postingDate),r.documentNo||'—'],i));
 root.innerHTML=meta(code,'given')+controls+cards+sourceAlert(code,'given')+`<section class="o28-panel"><div class="o28-panel-title"><h4>${grouped?'Rezervasyon Özeti':'MB51 Malzeme Hareketleri'}</h4><small>${grouped?'Rezervasyona tıklayın: malzemeler açılır':'Belge bazında tüm hareketler'}</small></div>${table(headers,trs)}</section>`+pager(code,st,d);
 root.querySelectorAll('[data-q28-mode]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.q28Mode===ui.givenMode)return;ui.givenMode=b.dataset.q28Mode;colState[code].given={};qSort[code].given={};ui.signature='';st.page=1;window.loadWorkReport(code)}));
 mountPageEvents(code,st,root);
 if(!grouped)return;
 root.querySelectorAll('.o28-table tbody tr[data-o28-row]').forEach(tr=>{
  tr.classList.add('q28-reservation-row');tr.setAttribute('role','button');tr.setAttribute('aria-expanded','false');tr.setAttribute('aria-label','Rezervasyona ait malzeme kalemlerini göster');
  const toggle=async()=>{
   const r=rows[Number(tr.dataset.o28Row)];if(!r)return;
   const existing=tr.nextElementSibling;
   if(existing?.classList.contains('q28-reservation-detail-row')){existing.remove();tr.setAttribute('aria-expanded','false');return;}
   root.querySelectorAll('.q28-reservation-detail-row').forEach(e=>e.remove());root.querySelectorAll('.q28-reservation-row').forEach(e=>e.setAttribute('aria-expanded','false'));
   const detail=document.createElement('tr');detail.className='q28-reservation-detail-row';detail.innerHTML='<td colspan="5"><div class="q28-reservation-content">Malzeme kalemleri yükleniyor…</div></td>';tr.after(detail);tr.setAttribute('aria-expanded','true');
   const contents=detail.querySelector('.q28-reservation-content');
   const materialRows=[];let page=0,total=0;
   const currentFilters=JSON.parse(window.FIX28QFilterQuery(code,'given')?.columnFilters||'{}');
   delete currentFilters.materialCount;delete currentFilters.documentCount;
   if(r.reservationNo){currentFilters.reservationNo={op:'equals',value:String(r.reservationNo)}}
   else {delete currentFilters.reservationNo;currentFilters.documentNo={op:'equals',value:String(r.documentNo||'')}}
   const scope=root.closest('.work-operations-view');
   const scopeDepot=scope?.querySelector('[data-role="depot-filter"]')?.value||'';
   const scopePlant=scope?.querySelector('[data-role="plant-filter"]')?.value||'';
   const scopeSearch=scope?.querySelector('[data-role="search"]')?.value||'';
   const childQuery=new URLSearchParams({code,plant:scopePlant,depot:scopeDepot,q:scopeSearch,pageSize:'100',columnFilters:JSON.stringify(currentFilters),sortBy:'materialCode',sortDir:'asc'});
   contents.innerHTML='<div class="q28-reservation-top"><strong>Rezervasyon '+safe(r.reservationNo||'Yok')+' · Malzeme Kalemleri</strong><span>Malzemeye tıklayınca MB51 belgeleri açılır.</span></div><div class="q28-reservation-scroller"><table class="q28-res-material-table"><thead><tr><th>No</th><th>Malzeme Kodu</th><th>Malzeme Tanımı</th><th>Net Verilen</th><th>Ölçü</th><th>Belge</th></tr></thead><tbody></tbody></table></div><div class="q28-reservation-bottom"><span data-q28-res-count></span><button type="button" data-q28-more-materials hidden>Diğer malzemeleri getir</button></div>';
   const tbody=contents.querySelector('tbody'),more=contents.querySelector('[data-q28-more-materials]');
   async function loadMaterials(){
    if(more.disabled)return;more.disabled=true;more.textContent='Malzemeler yükleniyor…';
    try{
     childQuery.set('page',String(page+1));const resp=await fetch('/api/worktype-given-groups?'+childQuery,{cache:'no-store'}),obj=await resp.json();if(!resp.ok||!obj.ok)throw Error(obj.error||'Malzeme kalemleri alınamadı');
     if(!detail.isConnected)return;
     const offset=materialRows.length;materialRows.push(...(obj.rows||[]));page=Number(obj.page||page+1);total=Number(obj.total)||0;
     tbody.insertAdjacentHTML('beforeend',(obj.rows||[]).map((m,i)=>`<tr class="q28-material-item" data-q28-material="${offset+i}" role="button" tabindex="0" aria-expanded="false"><td>${offset+i+1}</td><td>${safe(m.materialCode||'—')}</td><td>${safe(m.materialDesc||'—')}</td><td class="num">${safe(m.signedQty===null?'Doğrulanmadı':fmt(m.signedQty))}</td><td>${safe(m.unit||'—')}</td><td>${safe(m.documentCount||0)}</td></tr>`).join(''));
     contents.querySelector('[data-q28-res-count]').textContent=`${fmt(materialRows.length)} / ${fmt(total)} kalem`;
     more.hidden=page>=Number(obj.pages||1);more.textContent='Diğer malzemeleri getir';
    }catch(error){contents.querySelector('[data-q28-res-count]').textContent='Malzemeler yüklenemedi: '+error.message;more.hidden=false;more.textContent='Yeniden dene';}
    finally{more.disabled=false;}
   }
   more.addEventListener('click',loadMaterials);await loadMaterials();
   const openMaterial=async materialRow=>{
    const m=materialRows[Number(materialRow.dataset.q28Material)];if(!m)return;
    const sibling=materialRow.nextElementSibling;
    if(sibling?.classList.contains('q28-doc-detail-row')){sibling.remove();materialRow.setAttribute('aria-expanded','false');return;}
    tbody.querySelectorAll('.q28-doc-detail-row').forEach(x=>x.remove());tbody.querySelectorAll('.q28-material-item').forEach(x=>x.setAttribute('aria-expanded','false'));
    const doc=document.createElement('tr');doc.className='q28-doc-detail-row';doc.innerHTML='<td colspan="6">MB51 belgeleri yükleniyor…</td>';materialRow.after(doc);materialRow.setAttribute('aria-expanded','true');
    try{
     const filters={materialCode:{op:'equals',value:m.materialCode}};
     if(r.reservationNo)filters.reservationNo={op:'equals',value:r.reservationNo};
     else filters.documentNo={op:'equals',value:r.documentNo||''};
     const qs=new URLSearchParams({code,tab:'given',depot:m.depot||'',plant:m.plant||'',page:'1',pageSize:'250',columnFilters:JSON.stringify(filters)});
     const resp=await fetch('/api/worktype-report?'+qs,{cache:'no-store'}),obj=await resp.json();if(!resp.ok||!obj.ok)throw Error(obj.error||'Belgeler alınamadı');if(!doc.isConnected)return;
     const ev=(obj.rows||[]).filter(x=>String(x.materialCode||'')===String(m.materialCode||'')&&String(x.reservationNo||'')===String(r.reservationNo||''));
     doc.innerHTML=`<td colspan="6"><div class="q28-move-detail"><strong>MB51 hareketleri · ${fmt(ev.length)} / ${fmt(obj.total)} kayıt</strong><div class="q28-given-detail-scroller"><table><thead><tr><th>Tarih</th><th>Malzeme Belgesi</th><th>Hareket</th><th>Yön</th><th>Net Miktar</th></tr></thead><tbody>${ev.map(v=>`<tr><td>${safe(localDate(v.postingDate))}</td><td>${safe(v.documentNo||'—')}</td><td>${safe(v.movement||'—')}</td><td>${safe(v.movementDirection||'—')}</td><td>${safe(v.signedQty===null?'Doğrulanmadı':fmt(v.signedQty)+' '+(v.unit||''))}</td></tr>`).join('')}</tbody></table></div>${obj.pages>1?'<small>İlk 250 hareket gösteriliyor. Devamını Tüm Hareketler görünümünde inceleyin.</small>':''}</div></td>`;
    }catch(error){doc.innerHTML='<td colspan="6">Belge hareketleri alınamadı: '+safe(error.message)+'</td>'}
   };
   tbody.addEventListener('click',e=>{const target=e.target.closest('.q28-material-item');if(target)openMaterial(target)});
   tbody.addEventListener('keydown',e=>{const target=e.target.closest('.q28-material-item');if(target&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openMaterial(target)}});
  };
  tr.addEventListener('click',e=>{if(!e.target.closest('button'))toggle()});
  tr.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle()}});
 });
}

function unitStrings(units,max=4){const pairs=Object.entries(units||{}).filter(([,v])=>Math.abs(Number(v)||0)>0.000001);if(!pairs.length)return '0';return pairs.slice(0,max).map(([u,v])=>`${fmt(v)} ${u}`).join(' · ')+(pairs.length>max?` · +${pairs.length-max} birim`:'')}
function displayConsumption(code,st,d,root){const ui=state[code];const vals=d.months||{},years=[2024,2025,2026,2027,2028,2029,2030];const yearly={};let totalItems=new Set();const recs=d.rows||[];
 for(const r of recs){yearly[r.unit]=(yearly[r.unit]||0)+num(r.qty);totalItems.add(r.materialCode)}
 const availableMonths=Object.entries(vals).filter(([,v])=>Number(v.materialCount)>0).map(([k])=>k).sort();const selected=ui.month||(availableMonths.at(-1)||`${ui.year}-01`);ui.month=selected;
 const current=vals[selected]||{units:{},materialCount:0,events:0};const monthRows=recs.filter(r=>r.month===selected).filter(r=>(!ui.unitFilter||ui.unitFilter==='all'||r.unit===ui.unitFilter)&&Math.abs(num(r.qty))>0.0000001);
 const tops=Object.entries(vals).map(([m,v])=>({m,size:Object.values(v.units||{}).filter(x=>num(x)!==0).length})).sort((a,b)=>b.size-a.size);const top=tops.find(x=>x.size>0);
 const cards=kpis([['Yıllık Net Tüketim',unitStrings(yearly,2),'Ölçü birimine göre'],['Tüketilen Malzeme',fmt(totalItems.size),'Farklı kod'],['Tüketim Görülen Ay',fmt(Object.values(vals).filter(v=>v.materialCount>0).length),'12 ay içinde'],['Seçili Ay',months[Number(selected.slice(5))-1]||'—',unitStrings(current.units,1)]]);
 const yearBox=`<div class="o28-year"><label>Yıl <select data-o28-year>${years.map(y=>`<option ${String(y)===ui.year?'selected':''} value="${y}">${y}</option>`).join('')}</select></label><span>Ay kartındaki toplamlar birime göre ayrıdır.</span></div>`;
 const units=Array.from(new Set(Object.values(vals).flatMap(v=>Object.keys(v.units||{})))).sort((a,b)=>a.localeCompare(b,'tr'));
 const selectedUnit=ui.unitFilter||'all';
 const unitFilter=`<label class="q28-unit-select">Ölçü Birimi <select data-q28-unit><option value="all">Tüm birimler</option>${units.map(u=>`<option value="${safe(u)}" ${selectedUnit===u?'selected':''}>${safe(u)}</option>`).join('')}</select></label>`;
 const monthCards=months.map((m,i)=>{const key=`${ui.year}-${String(i+1).padStart(2,'0')}`,r=vals[key]||{units:{},materialCount:0};const entries=Object.entries(r.units||{}).filter(([u,v])=>(selectedUnit==='all'||selectedUnit===u)&&Math.abs(num(v))>0.0000001).sort(([a],[b])=>a.localeCompare(b,'tr'));
 const lines=entries.length?entries.map(([u,v])=>`<div class="q28-month-unit"><b>${fmt(v)}</b><span>${safe(u)}</span></div>`).join(''):'<div class="q28-month-empty">Tüketim yok</div>';
 return `<button class="o28-month ${selected===key?'active':''}" type="button" data-o28-month="${key}"><strong>${m}</strong><div class="q28-month-lines">${lines}</div></button>`}).join('');
 const headers=['Malzeme Kodu','Malzeme Tanımı','Tüketim Miktarı'];
 const trs=monthRows.map((r,i)=>row([r.materialCode,r.materialDesc||'—',`${fmt(r.qty)} ${r.unit||''}`],i));
 root.innerHTML=meta(code,'consumption')+yearBox+cards+`<section class="o28-panel"><div class="o28-panel-title"><h4>Aylık Tüketim (${safe(ui.year)})</h4>${unitFilter}</div><div class="o28-months">${monthCards}</div></section><section class="o28-panel"><div class="o28-panel-title"><h4>${months[Number(selected.slice(5))-1]} – Tüketilen Malzemeler</h4><small>${fmt(monthRows.length)} malzeme/birim satırı</small></div>${table(headers,trs,'Bu ayda net tüketim bulunamadı.')}</section>`+note(d.note||'MB51: 221/Z22 pozitif, 222 ters kayıt; aynı ölçüdeki miktarlar toplanır.');
 root.querySelector('[data-q28-unit]')?.addEventListener('change',e=>{ui.unitFilter=e.target.value;displayConsumption(code,st,d,root)});
 root.querySelector('[data-o28-year]')?.addEventListener('change',e=>{ui.year=e.target.value;ui.month=ui.year+'-01';st.page=1;window.loadWorkReport(code)});
 root.querySelectorAll('[data-o28-month]').forEach(b=>b.addEventListener('click',()=>{ui.month=b.dataset.o28Month;displayConsumption(code,st,d,root)}));
}
async function renderWorkReport(code,st,filters,opsData){if(!state[code])return;const el=mount(code);if(!el)return;const {sec,panel,root}=el;
 if(st.tab==='diff'){st.tab='material';st.page=1}
 const h2=sec.querySelector('.work-ops-head h2');if(h2)h2.textContent=`${label[code]} | ${titleMap[st.tab]||'Malzeme İcmal'}`;
 panel.querySelectorAll('[data-report-tab]').forEach(b=>{const on=b.dataset.reportTab===st.tab;b.classList.toggle('btn-primary',on);b.classList.toggle('btn-ghost',!on);b.setAttribute('aria-pressed',on?'true':'false')});
 const info=panel.querySelector('[data-report-info]');if(info)info.textContent='';const title=panel.querySelector('[data-report-title]');if(title)title.textContent=titleMap[st.tab]||'Rapor';
 const cache=state[code];const search=sec.querySelector('[data-role="search"]')?.value||'';
 const sig=JSON.stringify([st.tab,cache.givenMode||'group',filters.plant||'',filters.depot||'',search,colState[code][st.tab]||{},qSort[code][st.tab]||{}]);
 if(cache.signature!==sig){cache.signature=sig;cache.loadedRows=[];cache.nextPending=false;st.page=1;cache.detail=0}
 const appending=!!cache.nextPending&&st.page>1;const previousScroll=appending?(root.querySelector('.o28-grid-scroll')?.scrollTop||0):0;
 cache.fetching=true;const token=++cache.request;
 if(!appending)root.innerHTML='<div class="o28-loading">Rapor hazırlanıyor…</div>';
 try{let d;
  if(st.tab==='consumption'){
    const qs=new URLSearchParams({code,year:state[code].year,plant:filters.plant||'',depot:filters.depot||''});
    qs.set('q',sec.querySelector('[data-role="search"]')?.value||'');
    d=await fetch('/api/worktype-monthly-consumption?'+qs,{cache:'no-store'}).then(async r=>{const x=await r.json();if(!r.ok||!x.ok)throw Error(x.error||'Aylık tüketim alınamadı');return x});
  }else if(st.tab==='given'&&(cache.givenMode||'group')!=='all'){
    const qs=new URLSearchParams({code,plant:filters.plant||'',depot:filters.depot||'',q:search,page:String(st.page),pageSize:'100',...window.FIX28QFilterQuery(code,st.tab)});
    d=await fetch('/api/worktype-given-reservations?'+qs,{cache:'no-store'}).then(async r=>{const x=await r.json();if(!r.ok||!x.ok)throw Error(x.error||'Verilen malzeme özeti alınamadı');return x});
  }else if(code==='B'&&st.tab==='money'){
    const qs=new URLSearchParams({plant:filters.plant||'',depot:filters.depot||'',q:sec.querySelector('[data-role="search"]')?.value||''});
    d=await fetch('/api/bakim-parasal-icmal?'+qs,{cache:'no-store'}).then(async r=>{const x=await r.json();if(!r.ok||!x.ok)throw Error(x.error||'F.604 icmali alınamadı');return x});
  }else{
    const qs=new URLSearchParams({code,tab:st.tab,plant:filters.plant||'',depot:filters.depot||'',q:search,page:String(st.page),pageSize:'100',...window.FIX28QFilterQuery(code,st.tab)});
    d=await fetch('/api/worktype-report?'+qs,{cache:'no-store'}).then(async r=>{const x=await r.json();if(!r.ok||!x.ok)throw Error(x.error||'Rapor alınamadı');return x});
  }
  if(token!==state[code].request)return;
  st.page=Number(d.page)||1;st.pages=Number(d.pages)||1;
  if(st.tab!=='consumption'&&!(code==='B'&&st.tab==='money')){
   cache.loadedRows=appending?cache.loadedRows.concat(d.rows||[]):[...(d.rows||[])];
   d={...d,rows:cache.loadedRows};
  }
  cache.nextPending=false;cache.fetching=false;

  if(st.tab==='consumption'){state[code].consumptionData=d;displayConsumption(code,st,d,root);}
  else if(st.tab==='given')displayGiven(code,st,d,root);
  else if(st.tab==='discovery')displayDiscovery(code,st,d,root);
  else if(st.tab==='money'&&code==='B'){state.B.f604Data=d;displayF604(st,d,root)}
  else if(st.tab==='money')displayMoney(code,st,d,root);
  else displayMaterial(code,st,d,root);
  if(appending){const scroll=root.querySelector('.o28-grid-scroll');if(scroll)scroll.scrollTop=previousScroll}
  if(info)info.textContent=code==='B'&&st.tab==='money'?'Kaynak: F.604 Excel önizleme / referans · ACTIVE değil':st.tab==='consumption'?'Kaynak: SAP MB51 · net tüketim, kayıt tarihi bazlı':`${fmt(d.total||0)} kayıt · Veri kaynağı: ${st.tab==='given'?'SAP MB51':'Keşif indeksi / gerektiğinde MB51-MB52'}`;
 }catch(e){if(token!==state[code].request)return;cache.fetching=false;cache.nextPending=false;if(appending)st.page=Math.max(1,st.page-1);root.innerHTML=`<div class="o28-error">Rapor yüklenemedi: ${safe(e.message)}</div>`}
}
function escapeCsv(v){const s=String(v??'');return '"'+s.replace(/"/g,'""')+'"'}
function consumptionExport(code,type){const st=state[code],d=st.consumptionData,month=st.month;if(!d||!month)return;
 const rows=(d.rows||[]).filter(r=>r.month===month&&(!st.unitFilter||st.unitFilter==='all'||r.unit===st.unitFilter));
 const safeName=`${label[code]}_Tuketim_${month}`;
 if(type==='excel'){
  const text='\uFEFF'+[['Malzeme Kodu','Malzeme Tanımı','Tüketim Miktarı','Ölçü'].map(escapeCsv).join(';'),...rows.map(r=>[r.materialCode,r.materialDesc,r.qty,r.unit].map(escapeCsv).join(';'))].join('\r\n');
  const blob=new Blob([text],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=safeName+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }else{
  const win=window.open('','_blank');if(!win){alert('PDF için açılır pencere izni gerekli.');return;}
  const trs=rows.map(r=>`<tr><td>${safe(r.materialCode)}</td><td>${safe(r.materialDesc)}</td><td>${safe(fmt(r.qty)+' '+r.unit)}</td></tr>`).join('');
  win.document.write(`<html><head><meta charset="UTF-8"><title>${safe(safeName)}</title><style>body{font:14px Arial;padding:24px;color:#16324d}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccdbe6;padding:8px;text-align:left}th{background:#e5f5f3}</style></head><body><h2>${safe(label[code])} — ${safe(months[Number(month.slice(-2))-1])} ${safe(st.year)}</h2><p>Kaynak: SAP MB51; 221/Z22 pozitif, 222 ters. Birimler ayrı gösterilir.</p><table><thead><tr><th>Malzeme Kodu</th><th>Malzeme Tanımı</th><th>Tüketim Miktarı</th></tr></thead><tbody>${trs}</tbody></table></body></html>`);win.document.close();win.focus();setTimeout(()=>win.print(),400);
 }
}
function setup(){for(const code of ['B','K','L']){const el=mount(code);if(!el)continue;
 ['excel','pdf'].forEach(type=>{const btn=el.sec.querySelector(`[data-role="export-${type}"]`);if(!btn)return;btn.addEventListener('click',e=>{
   if(code==='B'&&el.sec.classList.contains('active')&&el.sec.querySelector('[data-report-tab="money"]')?.getAttribute('aria-pressed')==='true'){
     e.preventDefault();e.stopImmediatePropagation();f604Export(type);return;
   }
   if(el.sec.classList.contains('active')&&el.sec.querySelector('[data-report-tab="consumption"]')?.getAttribute('aria-pressed')==='true'){
    e.preventDefault();e.stopImmediatePropagation();consumptionExport(code,type);
   }
 },true)});
 }document.body.classList.add('o28-ready')}
setup();
window.FIX28QGivenMode=(code)=>state[code]?.givenMode||'group';
window.FIX28O={renderWorkReport,setup,version:'FIX28R'};
})();
