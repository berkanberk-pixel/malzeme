/* FIX28L • Beş gerçek WebGL shader WebUI teması. Harici CDN, iş kuralı veya API değişikliği yok. */
(function(){
  'use strict';
  const STORAGE='tk.webgl.theme.v1', MOTION='tk.webgl.motion.v1';
  const THEMES=[
    {id:'atlas',name:'Şebeke Atlası',detail:'Lacivert · turkuaz enerji ağı',description:'Hat ve bağlantı noktaları',palette:['#0a2946','#075c78','#72e3e9']},
    {id:'flow',name:'Enerji Akışı',detail:'Kobalt · kehribar akış çizgileri',description:'Dinamik enerji akış hatları',palette:['#182b64','#d58b25','#ffd788']},
    {id:'prism',name:'Kristal Panel',detail:'Mor · buz mavisi kırınım',description:'Cam ve prizmatik ışık yüzeyleri',palette:['#362355','#148d9e','#b7f0ff']},
    {id:'terrain',name:'Topoğrafya',detail:'Petrol yeşili · topografik konturlar',description:'Arazi ve şebeke kontur izleri',palette:['#143d3b','#347d4a','#b4f7c6']},
    {id:'control',name:'Kontrol Odası',detail:'Grafit · kontrollü yeşil radar',description:'Radar ve dijital tarama çizgileri',palette:['#1d292c','#526a31','#d9ff85']}
  ];
  const byId=id=>THEMES.find(t=>t.id===id)||THEMES[0];
  const read=(key,fallback)=>{try{return localStorage.getItem(key)||fallback}catch(_){return fallback}};
  const store=(key,value)=>{try{localStorage.setItem(key,value)}catch(_){/* yerel politika engeli: oturum boyunca çalışır */}};
  const selected=read(STORAGE,'atlas');
  let current=byId(selected), animations=read(MOTION,'on')!=='off', canvas=null, stage=null;
  let gl=null,program=null,buffer=null,uniforms=null,frame=0,active=true,visible=true,lastPaint=0,webglSupported=false;
  const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)')||{matches:false,addEventListener(){}};
  const VERTEX='attribute vec2 a_position;varying vec2 v_uv;void main(){v_uv=(a_position+1.0)*0.5;gl_Position=vec4(a_position,0.0,1.0);}';
  const FRAGMENT=`precision mediump float;
  varying vec2 v_uv;uniform float u_time;uniform float u_mode;uniform vec2 u_resolution;
  uniform vec3 u_c0;uniform vec3 u_c1;uniform vec3 u_c2;
  float hash21(vec2 p){p=fract(p*vec2(123.34,345.45));p+=dot(p,p+34.345);return fract(p.x*p.y);}
  float line1(float x,float width){return 1.0-smoothstep(0.0,width,abs(x));}
  void main(){
    vec2 uv=v_uv;float t=u_time;float glow=0.0;float light=0.0;
    vec2 p=uv*vec2(max(1.0,u_resolution.x/max(u_resolution.y,1.0)),1.0);
    if(u_mode<0.5){
      vec2 g=p*15.0;vec2 f=abs(fract(g)-0.5);
      glow=max(line1(f.x-0.5,0.012),line1(f.y-0.5,0.012))*0.14;
      float h=hash21(floor(g));float node=length(fract(g)-0.5);
      light+=(1.0-smoothstep(0.03,0.12,node))*step(0.84,h)*(0.35+0.65*abs(sin(t*0.8+h*7.0)));
      glow+=0.18*line1(fract(g.x+t*0.22)-0.5,0.017)*step(0.45,h);
    }else if(u_mode<1.5){
      float x=p.x;float yy=uv.y+sin(x*5.0-t*1.1)*0.13;
      glow=pow(max(0.0,sin(yy*39.0-x*3.5+t*1.9)),14.0)*0.8;
      light=pow(max(0.0,sin(x*2.1+yy*19.0-t*.8)),6.0)*.45;
    }else if(u_mode<2.5){
      vec2 a=(uv-vec2(.56,.48))*vec2(1.9,1.0);float angle=atan(a.y,a.x);
      float facet=abs(sin(angle*5.0+sin(t*.27)*.3));
      glow=pow(facet,23.0)*.49 + pow(max(0.0,sin((a.x*.85+a.y*1.2)*11.0+t*.4)),14.0)*.34;
      light=pow(1.0-smoothstep(0.05,0.75,length(a)),2.0)*.27;
    }else if(u_mode<3.5){
      float terrain=uv.y+.08*sin(p.x*2.6+t*.14)+.035*sin(p.x*8.3-t*.12)+.02*sin(p.x*15.0+t*.18);
      float contour=abs(sin(terrain*60.0));
      glow=pow(1.0-contour,11.0)*.48;
      light=pow(max(0.0,sin(p.x*4.5+terrain*17.0)),10.0)*.2;
    }else{
      vec2 o=uv-vec2(.70,.52);o.x*=u_resolution.x/max(u_resolution.y,1.0);
      float r=length(o);float angle=atan(o.y,o.x);
      float circles=1.0-abs(sin(r*45.0));
      glow=pow(circles,18.0)*.35;
      float sweep=mod(angle-t*.44+6.28318,6.28318);
      light=(1.0-smoothstep(0.0,.8,sweep))*(1.0-smoothstep(.15,1.1,r))*.8;
      glow+=pow(max(0.0,sin(p.x*40.0)),60.0)*.1;
    }
    vec3 col=mix(u_c0,u_c1,smoothstep(-.12,1.15,uv.x+sin(uv.y*4.0+t*.13)*.07));
    col=mix(col,u_c2,clamp(glow*.58+light*.62,0.0,.68));
    col+=vec3(.025,.028,.035)*sin(p.x*2.0+t*.2);
    gl_FragColor=vec4(clamp(col,0.0,1.0),1.0);
  }`;
  function compile(ctx,type,source){const s=ctx.createShader(type);ctx.shaderSource(s,source);ctx.compileShader(s);if(!ctx.getShaderParameter(s,ctx.COMPILE_STATUS)){const log=ctx.getShaderInfoLog(s);ctx.deleteShader(s);throw Error('WebGL shader: '+log)}return s}
  function renderStatus(){const node=document.getElementById('tkGlSettingsStatus');if(node)node.textContent=current.name+' · '+(webglSupported?'Hareketli arka plan destekleniyor':'Durağan arka plan kullanılıyor')+(reduce.matches?' · azaltılmış hareket':'');}
  function createGL(){
    if(!canvas)return;
    try{
      gl=canvas.getContext('webgl',{alpha:false,antialias:false,powerPreference:'low-power',preserveDrawingBuffer:false})||canvas.getContext('experimental-webgl');
      if(!gl){webglSupported=false;renderStatus();return}
      const vs=compile(gl,gl.VERTEX_SHADER,VERTEX),fs=compile(gl,gl.FRAGMENT_SHADER,FRAGMENT);
      program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
      gl.deleteShader(vs);gl.deleteShader(fs);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('WebGL program bağlanamadı: '+gl.getProgramInfoLog(program));
      gl.useProgram(program);
      buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
      const loc=gl.getAttribLocation(program,'a_position');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
      uniforms=Object.fromEntries(['u_time','u_mode','u_resolution','u_c0','u_c1','u_c2'].map(k=>[k,gl.getUniformLocation(program,k)]));
      webglSupported=true;
    }catch(err){console.warn('FIX28L WebGL devre dışı, CSS yedeğe geçildi:',err);gl=null;webglSupported=false}
    renderStatus();
  }
  function rgb(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255)}
  function draw(ts){
    if(!gl||!stage||!canvas||!webglSupported)return;
    const rect=stage.getBoundingClientRect();if(rect.width<2||rect.height<2)return;
    const dpr=Math.min(window.devicePixelRatio||1,1.35);
    const w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h)}
    gl.useProgram(program);
    gl.uniform1f(uniforms.u_time,ts*.001);
    gl.uniform1f(uniforms.u_mode,THEMES.indexOf(current));
    gl.uniform2f(uniforms.u_resolution,w,h);
    for(let i=0;i<3;i++){const c=rgb(current.palette[i]);gl.uniform3f(uniforms['u_c'+i],c[0],c[1],c[2])}
    gl.drawArrays(gl.TRIANGLES,0,6);
  }
  function shouldAnimate(){return !!(gl&&animations&&!reduce.matches&&!document.hidden&&visible&&active)}
  function loop(ts){frame=0;if(!shouldAnimate())return;if(ts-lastPaint>=30){lastPaint=ts;draw(ts)}frame=requestAnimationFrame(loop)}
  function resume(){if(frame){cancelAnimationFrame(frame);frame=0}if(webglSupported){draw(performance.now());if(shouldAnimate())frame=requestAnimationFrame(loop)}}
  function choice(theme,settings){const b=document.createElement('button');b.type='button';b.className=settings?'tk-gl-settings-card':'tk-gl-choice';b.dataset.tkGlTheme=theme.id;
    b.setAttribute('aria-pressed',current.id===theme.id?'true':'false');b.title=theme.description;
    const sw=document.createElement('span');sw.className=settings?'tk-gl-settings-swatch':'tk-gl-swatch';sw.style.setProperty('--sw1',theme.palette[0]);sw.style.setProperty('--sw2',theme.palette[1]);
    const title=document.createElement(settings?'strong':'b');title.textContent=theme.name;
    const detail=document.createElement('small');detail.textContent=theme.detail;
    if(settings){b.append(sw,title,detail)}else{const text=document.createElement('span');text.append(title,detail);const check=document.createElement('span');check.className='tk-gl-check';check.textContent=current.id===theme.id?'✓':'';b.append(sw,text,check)}return b}
  function renderChoices(){document.querySelectorAll('[data-tk-gl-theme-list]').forEach(list=>{const inSettings=list.dataset.tkGlThemeList==='settings';list.replaceChildren(...THEMES.map(x=>choice(x,inSettings)))})}
  function syncTheme(){
    document.body.classList.add('tk-webgl-ui');document.body.dataset.webglTheme=current.id;
    const label=document.getElementById('tkGlButtonLabel');if(label)label.textContent='Tema · '+current.name;
    document.querySelectorAll('[data-tk-gl-theme]').forEach(b=>{b.setAttribute('aria-pressed',b.dataset.tkGlTheme===current.id?'true':'false');const check=b.querySelector('.tk-gl-check');if(check)check.textContent=b.dataset.tkGlTheme===current.id?'✓':''});
    document.querySelectorAll('[data-tk-gl-animate]').forEach(inp=>{inp.checked=animations});
    const status=document.getElementById('tkGlSettingsStatus');if(status)status.textContent=current.name+' · '+(webglSupported?'Hareketli arka plan destekleniyor':'Durağan arka plan kullanılıyor')+(reduce.matches?' · azaltılmış hareket':'');
    resume();
  }
  function setTheme(id){if(!THEMES.some(t=>t.id===id))return false;current=byId(id);store(STORAGE,id);syncTheme();closePanel();return true}
  function closePanel(){const pop=document.getElementById('tkGlThemePanel'),btn=document.getElementById('tkGlThemeButton');if(pop&&btn){pop.hidden=true;btn.setAttribute('aria-expanded','false')}}
  function init(){
    if(document.getElementById('tkGlStage'))return;
    document.body.classList.add('tk-webgl-ui');document.body.dataset.webglTheme=current.id;
    const bar=document.querySelector('.top-actions');
    if(bar){
      const wrapper=document.createElement('div');wrapper.className='tk-gl-theme-control';
      const btn=document.createElement('button');btn.id='tkGlThemeButton';btn.type='button';btn.className='tk-gl-theme-trigger';btn.setAttribute('aria-expanded','false');btn.setAttribute('aria-controls','tkGlThemePanel');
      btn.innerHTML='<span aria-hidden="true">◈</span><span id="tkGlButtonLabel"></span><span aria-hidden="true">⌄</span>';
      const pop=document.createElement('div');pop.id='tkGlThemePanel';pop.className='tk-gl-theme-panel';pop.hidden=true;
      pop.innerHTML='<h3>Arayüz Temaları</h3><p>Birini seçin; tema anında değişir.</p><div class="tk-gl-options" data-tk-gl-theme-list="popup"></div><label class="tk-gl-toggle-row"><input type="checkbox" data-tk-gl-animate> Hareketli arka plan efektlerini kullan</label>';
      wrapper.append(btn,pop);
      bar.insertBefore(wrapper,bar.querySelector('.tk-uxj-tools')||bar.firstElementChild);
      btn.addEventListener('click',()=>{pop.hidden=!pop.hidden;btn.setAttribute('aria-expanded',pop.hidden?'false':'true')});
      document.addEventListener('click',e=>{if(!wrapper.contains(e.target))closePanel()});
      document.addEventListener('keydown',e=>{if(e.key==='Escape')closePanel()});
    }
    // Place the animated theme surface directly behind the existing main
    // heading; do not create a second banner with theme introduction text.
    const heading=document.querySelector('.topbar-title-block');
    if(heading){
      heading.classList.add('tk-gl-title-host');
      stage=document.createElement('div');stage.id='tkGlStage';stage.className='tk-gl-stage';stage.setAttribute('aria-hidden','true');
      stage.innerHTML='<canvas id="tkGlCanvas" aria-hidden="true"></canvas>';
      heading.prepend(stage);canvas=stage.querySelector('canvas');
      canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();gl=null;webglSupported=false;cancelAnimationFrame(frame);frame=0;renderStatus()});
      canvas.addEventListener('webglcontextrestored',()=>{createGL();resume()});
    }
    const settings=document.getElementById('settingsView');
    if(settings){
      const panel=document.createElement('section');panel.className='tk-gl-settings';panel.id='tkGlSettings';
      panel.innerHTML='<h3>Arayüz Görünümü</h3><p>Beş farklı görsel tasarım arasında geçiş yapabilirsiniz. Tema yalnızca bu tarayıcıda hatırlanır. İşlemler, hesaplamalar, yetkiler ve Excel dosyaları etkilenmez.</p><div class="tk-gl-settings-grid" data-tk-gl-theme-list="settings"></div><label class="tk-gl-toggle-row"><input type="checkbox" data-tk-gl-animate> Hareketli efektler etkin</label><div class="tk-gl-settings-footer"><strong>Durum:</strong> <span id="tkGlSettingsStatus">Kontrol ediliyor</span></div>';
      settings.prepend(panel);
    }
    renderChoices();
    document.addEventListener('click',e=>{const b=e.target.closest('[data-tk-gl-theme]');if(b)setTheme(b.dataset.tkGlTheme)});
    document.addEventListener('change',e=>{if(e.target.matches('[data-tk-gl-animate]')){animations=e.target.checked;store(MOTION,animations?'on':'off');syncTheme()}});
    document.addEventListener('visibilitychange',resume);
    if(window.IntersectionObserver&&stage){const observer=new IntersectionObserver(entries=>{visible=!!entries[0]?.isIntersecting;resume()},{threshold:0.02});observer.observe(stage)}
    if(window.ResizeObserver&&stage){const observer=new ResizeObserver(()=>resume());observer.observe(stage)}
    if(reduce.addEventListener)reduce.addEventListener('change',resume);
    createGL();syncTheme();
    window.TalepKontrolWebGL={themes:THEMES.map(t=>({id:t.id,name:t.name})),setTheme,getTheme:()=>current.id,isWebGLAvailable:()=>webglSupported};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
