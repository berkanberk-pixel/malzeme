/* FIX28Q – TESIS report global filtering controls. Uses whitelisted server-side SQL.
   No client-side slice masquerading as a full-dataset filter. */
(function(){'use strict';
function bind(code,st,panel){if(code!=='T')return;
 const filters=(st.tab==='given'||st.tab==='consumption')?['materialCode','materialDesc','reservationNo','postingDate','documentNo','unit','rawQty']:['depot','projectCode','projectName','materialCode','materialDesc','unit','discoveryQty','sourceGivenQty','differenceQty'];
 panel.querySelectorAll('.q28-t-filter').forEach(b=>{
  const key=b.dataset.key;if(!filters.includes(key)){b.remove();return}
  b.addEventListener('click',event=>{event.stopPropagation();document.querySelectorAll('.q28-filter-panel').forEach(el=>el.remove());
   const prev=window.FIX28QFilterQuery?.('T',st.tab)||{},active=JSON.parse(prev.columnFilters||'{}')[key]||{};
   const box=document.createElement('div');box.className='q28-filter-panel';box.innerHTML=`<label>Karşılaştırma<select data-op><option value="contains">İçerir</option><option value="equals">Eşittir</option>${['rawQty','discoveryQty','sourceGivenQty','differenceQty'].includes(key)?'<option value="gt">Büyüktür</option><option value="lt">Küçüktür</option>':''}${key==='postingDate'?'<option value="date_from">Başlangıç tarihi</option><option value="date_to">Bitiş tarihi</option>':''}</select></label><label>Değer<input data-value maxlength="120" /></label><div class="q28-filter-actions"><button data-apply>Uygula</button><button data-clear>Temizle</button><button data-asc>Artan ↑</button><button data-desc>Azalan ↓</button></div>`;document.body.appendChild(box);
   const rect=b.getBoundingClientRect();box.style.left=Math.max(8,Math.min(innerWidth-290,rect.left-60))+'px';box.style.top=Math.min(innerHeight-270,rect.bottom+5)+'px';box.querySelector('[data-op]').value=active.op||'contains';box.querySelector('[data-value]').value=active.value||'';
   function set(op,val,sort){const all=JSON.parse(window.FIX28QFilterQuery?.('T',st.tab)?.columnFilters||'{}');if(sort){window.FIX28QSetFilter?.('T',st.tab,key,null,sort)}else{if(val)all[key]={op,value:val};else delete all[key];window.FIX28QSetFilter?.('T',st.tab,key,val?all[key]:null)}box.remove();st.page=1;st.qSignature='';st.qAppend=false;window.loadWorkReport('T')}
   box.querySelector('[data-apply]').onclick=()=>set(box.querySelector('[data-op]').value,box.querySelector('[data-value]').value.trim());box.querySelector('[data-clear]').onclick=()=>set('',null);
   box.querySelector('[data-asc]').onclick=()=>set('',null,'asc');box.querySelector('[data-desc]').onclick=()=>set('',null,'desc');
   const outside=ev=>{if(!box.contains(ev.target)&&ev.target!==b){box.remove();document.removeEventListener('pointerdown',outside,true)}};setTimeout(()=>document.addEventListener('pointerdown',outside,true),0);
  });
 });
}
window.FIX28QTTable={bind};
})();

/* Shared column filters for MB51, MB52, ZMM098 and Keşifler. Every filter is server-side. */
(function(){'use strict';
const states={guarantee:{},stocks:{},movements:{},kesif:{}},sorts={};
const maps={
 guarantee:['uy','dy','dyDesc','main','cash','manual','', 'available'],
 stocks:['plant','dy','dyDesc','','','materialCode','materialDesc','qty','uom','totalValue','valuationType'],
 movements:['doc','date','movement','materialCode','materialDesc','qty','uom','plant','dy','reservation'],
 kesif:['','rowNo','dy','groupNo','contractor','project','materialCode','materialDesc','planned','given','remaining','']
};
const numberKeys=new Set(['qty','planned','given','remaining','main','available','totalValue']);
window.FIX28QGridFilterQuery=(name)=>({columnFilters:JSON.stringify(states[name]||{}),sortBy:sorts[name]?.key||'',sortDir:sorts[name]?.dir||'asc'});
function makeMenu(name,key,anchor){
 document.querySelectorAll('.q28-filter-panel').forEach(e=>e.remove());
 const prev=states[name][key]||{};const box=document.createElement('div');box.className='q28-filter-panel';
 box.innerHTML=`<label>Filtre<select data-op><option value="contains">İçerir</option><option value="equals">Eşittir</option>${numberKeys.has(key)?'<option value="gt">Büyüktür</option><option value="lt">Küçüktür</option>':''}${key==='date'?'<option value="date_from">Başlangıç tarihi</option><option value="date_to">Bitiş tarihi</option>':''}</select></label><label>Değer<input data-value maxlength="120" placeholder="Filtre değeri"></label><div class="q28-filter-actions"><button data-q28-apply>Uygula</button><button data-q28-clear>Temizle</button><button data-q28-asc>Artan ↑</button><button data-q28-desc>Azalan ↓</button></div>`;
 document.body.appendChild(box);const r=anchor.getBoundingClientRect();box.style.left=Math.max(7,Math.min(innerWidth-294,r.left-60))+'px';box.style.top=Math.max(7,Math.min(innerHeight-270,r.bottom+5))+'px';
 box.querySelector('[data-op]').value=prev.op||'contains';box.querySelector('[data-value]').value=prev.value||'';
 const update=(a)=>{if(a==='clear')delete states[name][key];else if(a==='asc'||a==='desc')sorts[name]={key,dir:a};else{const val=box.querySelector('[data-value]').value.trim();if(val)states[name][key]={op:box.querySelector('[data-op]').value,value:val};else delete states[name][key]}
  box.remove();window.FIX28QGridReload?.(name)};
 for(const a of ['apply','clear','asc','desc'])box.querySelector('[data-q28-'+a+']').addEventListener('click',()=>update(a));
 const outside=e=>{if(!box.contains(e.target)&&!anchor.contains(e.target)){box.remove();document.removeEventListener('pointerdown',outside,true)}};setTimeout(()=>document.addEventListener('pointerdown',outside,true),0);
}
function bindHeaders(name){let head;if(name==='kesif')head=document.querySelector('#kesifTableBody')?.closest('table')?.querySelector('thead tr');else head=document.querySelector('#'+name+'TableBody')?.closest('table')?.querySelector('thead tr');
 if(!head)return;
 const names=name==='kesif'?maps[name]:['',...maps[name]];
 Array.from(head.children).forEach((th,i)=>{const key=names[i];if(!key||th.querySelector('.q28-source-filter'))return;
  const b=document.createElement('button');b.className='q28-source-filter';b.textContent='⌕';b.title='Sütunu filtrele veya sırala';b.setAttribute('aria-label',th.textContent+' sütun filtresi');b.type='button';th.appendChild(b);b.addEventListener('click',e=>{e.stopPropagation();makeMenu(name,key,b)})
 });
}
window.FIX28QBindGridFilters=()=>{for(const k of Object.keys(maps))bindHeaders(k)};
window.addEventListener('DOMContentLoaded',()=>setTimeout(window.FIX28QBindGridFilters,400));
})();
