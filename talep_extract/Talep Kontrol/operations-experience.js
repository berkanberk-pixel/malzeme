/* FIX28Q: approved user-first navigation + local keşif draft workflow.
   All navigation reuses original .nav-item nodes and their app handlers.
   Authoritative discovery records are NEVER modified by this UI. */
(function(){'use strict';
const $=q=>document.querySelector(q);const $$=q=>[...document.querySelectorAll(q)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function navTo(key){const n=$(`.nav-item[data-view="${key}"]`);if(n){n.click();return;}if(key==='dashboard'){ $$('.view').forEach(v=>v.classList.remove('active'));$('#dashboardView')?.classList.add('active');try{window.loadDashboardView?.()}catch(e){console.warn(e)}}}
const actions={
  import:()=>{navTo('data-center');setTimeout(()=>$('.dc-tab[data-dc-tab="dataPrep"]')?.click(),100)},
  new:()=>{navTo('kesif');setTimeout(()=>showDraft('NEW'),30)},
  revision:()=>{navTo('kesif');setTimeout(()=>{document.querySelector('#q28-draft-list')?.scrollIntoView({block:'start',behavior:'smooth'});showDraft('REVISION')},50)},
  files:()=>navTo('formLibrary'),
  history:()=>{navTo('decision');document.querySelector('#recordsViewBtn')?.click()},
  reports:()=>openDataCenterTab('reports'),
  users:()=>openDataCenterTab('users'),
};
function openDataCenterTab(name){
 const link=document.querySelector('.nav-item[data-view="data-center"]');
 // Navigate without firing the sidebar's bubbling accordion handler:
 // the menu group that the user selected (Raporlar/Yönetim) should stay open.
 if(link)link.dispatchEvent(new MouseEvent('click',{bubbles:false,cancelable:true}));
 else navTo('data-center');
 // The UX28J data-center group selector listens in capture phase and reveals the selected tab.
 const tab=document.querySelector('.dc-tab[data-dc-tab="'+name+'"]');
 if(tab)tab.click();
}
function mk(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n}
function item(label,action,view){const b=mk('button','nav-item nav-item-child q28-virtual',label);b.type='button';b.addEventListener('click',()=>{if(view)navTo(view);else actions[action]?.();});return b}
function menu(){const nav=$('.sidebar-nav');if(!nav||nav.dataset.fix28q)return;
 const orig={};$$('.sidebar-nav .nav-item[data-view], .sidebar-bottom .nav-item[data-view]').forEach(n=>{orig[n.dataset.view]=n;n.classList.add('q28-menu-original')});
 const groups=[
 ['Ana Sayfa',[['Genel Bakış','dashboard']]],
 ['Karar Destek',[['Talep Kontrol','decision'],['Kontrol Geçmişi',null,'history']]],
 ['Operasyonlar',[['TESİS','opsTesis'],['BAKIM','opsBakim'],['KET','opsKet'],['LED','opsLed']]],
 // New/edit/import/revision are actions on this screen, not duplicate sidebar pages.
 ['Keşif Yönetimi',[['Keşifler ve Taslaklar','kesif']]],
 ['Stok ve Teminat',[['Stok Bilgileri','stocks'],['Stok Hareketleri','movements'],['Teminat','guarantee']]],
 ['Veri Merkezi',[['Veri Merkezi','data-center'],['Excel Formları','formLibrary']]],
 // Direct tabs go to the real reports/users panes rather than the dashboard or the DC home.
 ['Raporlar',[['TESİS Kontrol Geçmişi','tesisHistory'],['Yönetim Raporları',null,'reports']]],
 ['Yönetim',[['Kullanıcılar ve Yetkiler',null,'users'],['Ayarlar','settings']]],
 ['Yardım',[['Kullanım Kılavuzu','help']]]
 ];
 nav.replaceChildren();nav.dataset.fix28q='1';const star=mk('div','q28-fav-area');const favTitle=mk('div','q28-fav-title','★ Sık Kullanılanlar');star.appendChild(favTitle);const favList=mk('div','q28-fav-list');star.appendChild(favList);nav.appendChild(star);
 const seen=new Set();const all=[];for(const [groupName,entries] of groups){const det=mk('details','q28-group');det.open=groupName==='Operasyonlar';const h=mk('summary','q28-group-title',groupName);det.appendChild(h);const wrap=mk('div','q28-group-items');for(const [name,key,action] of entries){let node=key?orig[key]:null;if(node&&!seen.has(key)){seen.add(key);const txt=node.querySelector('span:last-child');if(txt)txt.textContent=name}else{node=item(name,action,key)}node.classList.add('q28-nav-entry');const slot=mk('div','q28-nav-row');slot.dataset.menuKey=key||action||name;slot.appendChild(node);
  const fav=mk('button','q28-pin','☆');fav.type='button';fav.title=name+' ekranını sabitle';fav.setAttribute('aria-label',fav.title);fav.addEventListener('click',()=>{const pins=getPins();const k=slot.dataset.menuKey;setPins(pins.includes(k)?pins.filter(x=>x!==k):[...pins,k]);refreshFav()});slot.appendChild(fav);wrap.appendChild(slot);all.push({name,key:slot.dataset.menuKey,node})}
  det.appendChild(wrap);nav.appendChild(det)}
 function animateClose(other){
  if(!other.open||other.dataset.q28Closing==='1')return;
  const panel=other.querySelector('.q28-group-items');other.dataset.q28Closing='1';other.classList.add('q28-collapsing');
  const finish=()=>{other.open=false;delete other.dataset.q28Closing;other.classList.remove('q28-collapsing')};
  if(panel&&typeof panel.animate==='function'&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
   const h=panel.scrollHeight;const running=panel.animate([{maxHeight:h+'px',opacity:1,transform:'translateY(0)'},{maxHeight:'0px',opacity:0,transform:'translateY(-8px)'}],{duration:230,easing:'ease-in-out'});
   running.onfinish=finish;running.oncancel=finish;
  } else finish();
 }
 const menus=[...nav.querySelectorAll('details.q28-group')];
 menus.forEach(det=>{det.addEventListener('toggle',()=>{if(det.open)menus.forEach(other=>{if(other!==det)animateClose(other)})});det.querySelector('summary')?.addEventListener('click',()=>{if(!det.open)menus.forEach(other=>{if(other!==det)animateClose(other)})})});
 nav.addEventListener('click',e=>{if(!e.target.closest('.q28-nav-entry,.q28-fav-link'))return;const target=e.target.closest('details.q28-group');if(target)menus.forEach(other=>{if(other!==target)animateClose(other)})});
 function getPins(){try{const p=JSON.parse(localStorage.getItem('tk_fix28q_menu_pins')||'[]');return Array.isArray(p)?p:[]}catch(_){return []}}
 function setPins(v){try{localStorage.setItem('tk_fix28q_menu_pins',JSON.stringify(v))}catch(_){}}
 function refreshFav(){favList.replaceChildren();const pins=getPins();for(const a of all){const chosen=pins.includes(a.key);const pin=a.node.parentElement.querySelector('.q28-pin');if(pin){pin.textContent=chosen?'★':'☆';pin.setAttribute('aria-pressed',String(chosen))}if(!chosen)continue;const shortcut=mk('button','q28-fav-link',a.name);shortcut.type='button';shortcut.addEventListener('click',()=>a.node.click());favList.appendChild(shortcut)}star.hidden=!pins.length}
 // Retire pin IDs that used to point to duplicate sidebar actions.
 // Do not silently change an old pin into a different destination.
 const uniqueKeys=new Set(all.map(x=>x.key));
 const validPins=getPins().filter(k=>uniqueKeys.has(k));
 if(validPins.length!==getPins().length)setPins(validPins);
 refreshFav();const current=nav.querySelector('.nav-item.active');
 // One expanded group on initial render as well as after user clicks.
 if(current){menus.forEach(group=>{group.open=group.contains(current)})}
 const ver=$('.sidebar-version');if(ver)ver.textContent='Talep Kontrol 3.13.0 · FIX28S Menü Pilot';
}
function showDraft(operation='NEW'){
 const modal=$('#q28-draft-modal');if(!modal)return;modal.hidden=false;$('#q28-draft-title').textContent=operation==='REVISION'?'Keşif Revizyon Taslağı':'Yeni Keşif Taslağı';$('#q28-operation').value=operation;$('#q28-reason-field').hidden=operation!=='REVISION';$('#q28-status').textContent='Bu form yalnız yerel taslak oluşturur. Merkezi keşif ve onaylı sürüm değişmez.';modal.querySelector('input')?.focus();
}
async function drafts(){const list=$('#q28-draft-list');if(!list)return;try{const r=await fetch('/api/kesif-drafts',{cache:'no-store'});const x=await r.json();if(!r.ok||!x.ok)throw Error(x.error||'Liste okunamadı');const items=x.items||[];list.innerHTML=items.length?items.slice(0,20).map(v=>`<tr><td>${esc(v.id)}</td><td>${esc(v.workType)}</td><td>${esc(v.depot)}</td><td>${esc(v.materialCode||v.tedasCode)}</td><td>${esc(v.quantity)} ${esc(v.unit||'')}</td><td>Yerel taslak</td></tr>`).join(''):'<tr><td colspan="6">Henüz yerel keşif taslağı yok.</td></tr>'}catch(e){list.innerHTML='<tr><td colspan="6">Taslaklar yüklenemedi: '+esc(e.message)+'</td></tr>'}}
function discoveries(){const view=$('#kesifView');if(!view||$('#q28-discovery-actions'))return;
 const top=view.querySelector('.kesif-head-actions')||view.querySelector('.kesif-head');if(!top)return;
 const bar=mk('div','q28-discovery-actions');bar.id='q28-discovery-actions';bar.innerHTML='<button type="button" data-q28-new>+ Yeni Keşif</button><button type="button" data-q28-import>Excel’den İçe Aktar</button><button type="button" data-q28-revision>Keşfi Revize Et</button><button type="button" data-q28-show>Yerel Taslaklar</button>';
 top.parentElement.insertBefore(bar,top.nextSibling);
 const pane=mk('section','q28-draft-panel');pane.id='q28-draft-pane';pane.innerHTML='<div class="q28-draft-head"><h3>Keşif Taslakları</h3><span>LOCAL · Onaylı keşif değildir</span></div><div class="q28-draft-scroll"><table><thead><tr><th>Taslak ID</th><th>İş Türü</th><th>Depo</th><th>Malzeme/Poz</th><th>Miktar</th><th>Durum</th></tr></thead><tbody id="q28-draft-list"><tr><td colspan="6">Yükleniyor…</td></tr></tbody></table></div>';
 view.appendChild(pane);
 const modal=mk('div','q28-modal-backdrop');modal.id='q28-draft-modal';modal.hidden=true;modal.innerHTML=`<form id="q28-draft-form" class="q28-modal"><header><h3 id="q28-draft-title">Yeni Keşif Taslağı</h3><button type="button" id="q28-close" aria-label="Kapat">×</button></header><p id="q28-status">Yerel taslak</p><input type="hidden" id="q28-operation" name="operation" value="NEW"/><div class="q28-form-grid">
 <label>İş Türü<select name="workType" required><option value="TESIS">TESİS</option><option value="BAKIM">BAKIM</option><option value="KET">KET</option><option value="LED">LED</option></select></label>
 <label>Depo Kodu<input name="depot" required maxlength="30" placeholder="B202" /></label>
 <label>Üretim Yeri<input name="plant" maxlength="20" placeholder="ÜY" /></label>
 <label>Proje Adı (TESİS)<input name="projectName" maxlength="200" placeholder="Proje adını yazın" /></label><label>Proje ID (varsa)<input name="projectId" maxlength="100" placeholder="Boşsa proje adına göre otomatik" /></label>
 <label>SAP Malzeme Kodu<input name="materialCode" maxlength="40" placeholder="5100..." /></label>
 <label>TEDAŞ Pozu<input name="tedasCode" maxlength="80" placeholder="85.105..." /></label>
 <label>Miktar<input name="quantity" required inputmode="decimal" placeholder="0,000" /></label>
 <label>Ölçü<input name="unit" maxlength="25" placeholder="Ad / m / kg" /></label>
 </div><label id="q28-reason-field" hidden>Revizyon açıklaması<textarea name="reason" rows="3" maxlength="500" placeholder="Revizyon gerekçesi"></textarea></label><label>Kaynak kayıt / belge ID (varsa)<input name="sourceRecordId" maxlength="100" /></label>
 <footer><button type="button" id="q28-cancel">Vazgeç</button><button type="submit" id="q28-save">Yalnız Yerel Taslak Kaydet</button></footer></form>`;
 document.body.appendChild(modal);
 bar.querySelector('[data-q28-new]').onclick=()=>showDraft('NEW');bar.querySelector('[data-q28-revision]').onclick=()=>showDraft('REVISION');bar.querySelector('[data-q28-import]').onclick=actions.import;bar.querySelector('[data-q28-show]').onclick=()=>{pane.scrollIntoView({block:'start',behavior:'smooth'});drafts()};
 $('#q28-close').onclick=$('#q28-cancel').onclick=()=>modal.hidden=true;
 modal.addEventListener('click',e=>{if(e.target===modal)modal.hidden=true});
 $('#q28-draft-form').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;const btn=$('#q28-save');const data=Object.fromEntries(new FormData(f).entries());data.operation=$('#q28-operation').value;btn.disabled=true;try{const response=await fetch('/api/kesif-drafts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),body=await response.json();if(!response.ok||!body.ok)throw Error(body.error||'Taslak kaydedilemedi');modal.hidden=true;f.reset();await drafts();pane.scrollIntoView({behavior:'smooth',block:'start'})}catch(err){$('#q28-status').textContent='Hata: '+err.message}finally{btn.disabled=false}});
 drafts();
}
function trimNoise(){document.querySelectorAll('.o28-panel-title small').forEach(x=>{if(/Fark Listesi bu tabloya birleştirildi/i.test(x.textContent||''))x.remove()});}
function init(){menu();discoveries();trimNoise();new MutationObserver(trimNoise).observe(document.body,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
window.FIX28QMenu={showDraft,drafts};
})();
