/* Talep Kontrol FIX28J – Onaylanan beş UX kararının sunum katmanı.
   İş kurallarını, veri bağlantılarını, kayıt kontrollerini değiştirmez. */
(function(){
  'use strict';
  const $=selector=>document.querySelector(selector);
  const $$=selector=>Array.from(document.querySelectorAll(selector));
  function el(tag, cls, text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;}
  function initNav28J(){
    const nav=$('.sidebar-nav');if(!nav||$('#tkUxJNavMarker'))return;
    const lookup={};$$('.sidebar-nav .nav-item[data-view]').forEach(n=>{lookup[n.dataset.view]=n});
    nav.replaceChildren();
    const mark=el('div','tk-uxj-nav-kicker','ÇALIŞMA ALANI');mark.id='tkUxJNavMarker';nav.appendChild(mark);
    const direct=(key)=>{if(lookup[key]){lookup[key].classList.remove('nav-item-child');nav.appendChild(lookup[key]);}};
    function group(label,keys,open){
      const det=el('details','tk-uxj-nav-group');det.open=!!open;
      const head=el('summary','tk-uxj-nav-summary');head.appendChild(el('span',null,label));head.appendChild(el('span','tk-uxj-nav-chevron','⌄'));
      det.appendChild(head);const body=el('div','tk-uxj-nav-children');
      keys.forEach(k=>{const n=lookup[k];if(n){n.classList.add('nav-item-child');body.appendChild(n);n.addEventListener('click',()=>{det.open=true});}});
      det.appendChild(body);nav.appendChild(det);return det;
    }
    direct('decision');
    group('Operasyon İzleme',['opsBakim','opsKet','opsLed','opsTesis'],false);
    group('Stok ve Teminat',['stocks','movements','guarantee'],false);
    direct('kesif');direct('data-center');direct('formLibrary');
    group('Raporlar / Geçmiş',['tesisHistory'],false);
    direct('help');
    const active=$('.sidebar-nav .nav-item.active');if(active){const parent=active.closest('details');if(parent)parent.open=true}
    // Uygulama başka ekrandan ilgili menü öğesini programatik açtığında grubu aç.
    nav.addEventListener('click',event=>{const btn=event.target.closest('.nav-item');if(btn){const parent=btn.closest('details');if(parent)parent.open=true}});
  }
  function initTop28J(){
    const bar=$('.top-actions');if(!bar||$('#tkUxJToolsBtn'))return;
    const wrapper=el('div','tk-uxj-tools');
    const button=el('button','tk-uxj-tools-button','⋯  İşlemler');button.type='button';button.id='tkUxJToolsBtn';
    button.setAttribute('aria-haspopup','true');button.setAttribute('aria-expanded','false');
    const pop=el('div','tk-uxj-tools-pop');pop.id='tkUxJToolsPop';pop.hidden=true;
    pop.appendChild(el('div','tk-uxj-tools-title','DİĞER İŞLEMLER'));
    ['tkStartViewTour','recordsViewBtn','refreshBtn','packageCsvBackupBtn'].forEach(id=>{
      const old=$('#'+id);if(old){const slot=el('div','tk-uxj-tools-slot');slot.appendChild(old);pop.appendChild(slot)}
    });
    const tip=$('.tk-top-inline-tip');if(tip)pop.appendChild(tip);
    wrapper.append(button,pop);bar.appendChild(wrapper);
    const close=()=>{pop.hidden=true;button.setAttribute('aria-expanded','false')};
    button.addEventListener('click',()=>{const next=!pop.hidden;pop.hidden=next;button.setAttribute('aria-expanded',next?'false':'true')});
    document.addEventListener('click',ev=>{if(!wrapper.contains(ev.target))close()});
    document.addEventListener('keydown',ev=>{if(ev.key==='Escape')close()});
    pop.addEventListener('click',ev=>{if(ev.target.closest('button'))close()});
  }
  function initDecision28J(){
    const view=$('#decisionView'),first=view?.querySelector('.reservation-lookup-panel');if(!view||!first||$('#tkUxJDecisionSteps'))return;
    const steps=el('nav','tk-uxj-decision-steps');steps.id='tkUxJDecisionSteps';steps.setAttribute('aria-label','Karar Destek işlem adımları');
    const group=[
      ['1','Rezervasyon / Manuel','reservation'],
      ['2','Malzeme ve Keşif','material'],
      ['3','Kontrol ve Karar','check']
    ];
    group.forEach(([no,label,key],idx)=>{
      const b=el('button','tk-uxj-step'+(!idx?' selected':''));b.type='button';b.dataset.stepTarget=key;
      b.setAttribute('aria-current',!idx?'step':'false');
      b.append(el('span','tk-uxj-step-no',no),el('span','tk-uxj-step-label',label));
      b.addEventListener('click',()=>{
        const target=key==='reservation'?first:$('#materialPlanPanel');
        if(!target||target.closest('[hidden]')){first.scrollIntoView({behavior:'smooth',block:'start'});return}
        target.scrollIntoView({behavior:'smooth',block:'start'});
        if(key==='check'){const c=$('#runCheckBtn');if(c)c.focus({preventScroll:true})}
        $$('.tk-uxj-step').forEach(x=>{const selected=x===b;x.classList.toggle('selected',selected);x.setAttribute('aria-current',selected?'step':'false')});
      });steps.appendChild(b);
    });
    const note=el('p','tk-uxj-step-note','Adımlar yalnızca ekranda gezinmeyi kolaylaştırır; kontrol veya kesin kayıt kendiliğinden yapılmaz.');
    first.before(steps,note);
  }
  function initDataCenter28J(){
    const tabs=$('.dc-tabs');if(!tabs||$('#tkUxJDcGroups'))return;
    const values=[
      {id:'durum',text:'Sistem ve Kaynaklar',keys:['health','freshness']},
      {id:'import',text:'Veri Hazırla / Import',keys:['dataPrep']},
      {id:'gecmis',text:'Geçmiş ve Arşiv',keys:['snapshots','archive','actions']},
      {id:'yonetim',text:'Yönetim / Rapor',keys:['users','reports']}
    ];
    const row=el('div','tk-uxj-dc-groups');row.id='tkUxJDcGroups';row.setAttribute('role','group');row.setAttribute('aria-label','Veri Merkezi çalışma alanları');
    function showGroup(g,activate){
      for(const item of values){const btn=row.querySelector('[data-dc-group="'+item.id+'"]');if(btn){btn.classList.toggle('selected',item===g);btn.setAttribute('aria-pressed',item===g?'true':'false')}}
      tabs.querySelectorAll('[data-dc-tab]').forEach(t=>{t.hidden=!g.keys.includes(t.dataset.dcTab)});
      if(activate){const selected=tabs.querySelector('.dc-tab.active:not([hidden])');if(!selected){const first=tabs.querySelector('[data-dc-tab="'+g.keys[0]+'"]');if(first)first.click()}}
    }
    values.forEach(g=>{const b=el('button','tk-uxj-group-btn',g.text);b.type='button';b.dataset.dcGroup=g.id;b.addEventListener('click',()=>showGroup(g,true));row.appendChild(b)});
    tabs.before(row);
    const groupForTab=id=>values.find(g=>g.keys.includes(id))||values[0];
    tabs.addEventListener('click',ev=>{const b=ev.target.closest('[data-dc-tab]');if(b)showGroup(groupForTab(b.dataset.dcTab),false)},true);
    const active=tabs.querySelector('.dc-tab.active');showGroup(groupForTab(active?.dataset.dcTab||'health'),false);
  }
  function initExcel28J(){
    const lib=$('#formLibraryView');if(lib&&!$('#tkUxJExcelFlow')){
      const flow=el('div','tk-uxj-excel-flow');flow.id='tkUxJExcelFlow';
      [['1','Orijinal dosyayı indir'],['2','Formu doldur'],['3','Veri Merkezi’nde kontrol et'],['4','Yerel taslağa al']].forEach(([n,label])=>{
        const c=el('div','tk-uxj-flow-step');c.append(el('span','tk-uxj-flow-no',n),el('span',null,label));flow.appendChild(c)
      });
      const title=lib.querySelector('.template-library-title');if(title)title.after(flow);
      lib.querySelectorAll('.template-library-item').forEach((card,i)=>{
        const badge=el('span','tk-uxj-form-badge'+(i===4?' pilot':''),i===4?'PİLOT ŞABLON':'ORİJİNAL FORM');
        const detail=card.querySelector('.template-library-item-detail');if(detail)detail.prepend(badge);
        const download=card.querySelector('.template-library-download');if(download){download.textContent='Excel’i İndir';download.setAttribute('aria-label',(detail?.querySelector('h3')?.textContent||'Form')+' Excel dosyasını indir')}
      });
    }
    const importPanel=$('#tkExcelFormsPanel');if(importPanel&&!$('#tkUxJImportStages')){
      const stages=el('div','tk-uxj-import-stages');stages.id='tkUxJImportStages';
      stages.innerHTML='<span><b>1</b> Dosya seçimi</span><span><b>2</b> Kontrol / Önizleme</span><span><b>3</b> Yerel taslak</span><span class="tk-uxj-stage-locked"><b>4</b> Kesin kayıt: bu pilotta kapalı</span>';
      const head=importPanel.querySelector('.dashboard-card-head');if(head)head.after(stages);
      const status=$('#tkFormImportStatus');if(status)status.setAttribute('aria-live','polite');
    }
  }
  function initTables28J(){
    const views=['#opsBakimView','#opsKetView','#opsLedView','#opsTesisView','#kesifView','#guaranteeView','#stocksView','#movementsView','#dataCenterView'];
    for(const sel of views){const view=$(sel);if(!view)continue;view.classList.add('tk-uxj-data-view');
      view.querySelectorAll('.table-wrap,.work-ops-scroll').forEach(w=>{w.setAttribute('tabindex','0');w.setAttribute('role','region');w.setAttribute('aria-label','Tablo: yatay kaydırarak diğer sütunları görebilirsiniz')});
    }
    // Form kontrollerindeki görsel etiketleri klavye/ekran okuyucu için ilişkilendir.
    $$('input:not([aria-label]), select:not([aria-label]), textarea:not([aria-label])').forEach(control=>{
      if(control.id&&$('label[for="'+control.id+'"]'))return;
      const label=control.closest('label');const span=label?.querySelector('span');let caption=span?.textContent?.trim()||'';
      if(!caption){const a=control.getAttribute('placeholder')||control.getAttribute('title')||'';caption=a.trim()}
      if(caption)control.setAttribute('aria-label',caption.slice(0,140));
    });
  }
  function init(){try{document.body.classList.add('tk-ux28j');initNav28J();initTop28J();initDecision28J();initDataCenter28J();initExcel28J();initTables28J();}catch(err){console.error('FIX28J UX sunum katmanı hatası:',err)}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
