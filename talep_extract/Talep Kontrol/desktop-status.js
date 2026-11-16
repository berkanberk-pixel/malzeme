/* Talep Kontrol 3.13.0: GUI system health + connection warnings. */
(() => {
  'use strict';
  const el = document.getElementById('tkDesktopStatus');
  if (!el) return;
  const title = document.getElementById('tkDesktopStatusTitle');
  const message = document.getElementById('tkDesktopStatusMessage');
  const icon = document.getElementById('tkDesktopStatusIcon');
  let previous = null;
  let dismissed = false;
  let notifiedOffline = false;
  const set = (kind, heading, body, quiet = false) => {
    el.dataset.kind = kind;
    title.textContent = heading;
    message.textContent = body;
    icon.textContent = kind === 'error' ? '!' : kind === 'warning' ? '⚠' : '✓';
    el.hidden = Boolean(quiet || dismissed);
  };
  document.getElementById('tkDesktopStatusClose')?.addEventListener('click', () => {
    dismissed = true;
    el.hidden = true;
  });
  const notify = (text, kind) => {
    if (typeof window.toast === 'function') window.toast(text, kind, 6500, 'Sistem Durumu');
  };
  async function checkHealth() {
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 4500);
      let response;
      try { response = await fetch('/api/health?gui=' + Date.now(), {cache:'no-store',signal:ctrl.signal}); }
      finally { clearTimeout(timeout); }
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const status = await response.json();
      if (!status.ok || status.app !== 'Talep Kontrol') throw new Error('Uygulama servisi doğrulanamadı.');
      if (previous === 'offline') notify('Yerel uygulama hizmetine yeniden bağlanıldı.', 'success');
      notifiedOffline = false;
      const writes = status.recordSecurity?.sharedWritesEnabled === true;
      const next = writes ? 'online' : 'restricted';
      if (previous !== next) dismissed = false;
      previous = next;
      if (!writes) {
        set('warning', 'Merkezi kayıt koruması etkin',
          'Raporlar ve güvenli görüntüleme kullanılabilir. Kesin onay ve ortak kayıtlar, merkezi güvenlik doğrulanana kadar kapalıdır.');
      } else {
        set('success', 'Sistem bağlantısı sağlıklı', 'Yerel uygulama servisine bağlanıldı.', true);
      }
    } catch (error) {
      if (!notifiedOffline) {
        notify('Yerel uygulama hizmetine ulaşılamıyor. İşlem kaydetmeden önce bağlantıyı kontrol edin.', 'error');
        notifiedOffline = true;
      }
      if (previous !== 'offline') dismissed = false;
      previous = 'offline';
      set('error','Bağlantı kesildi','Uygulama hizmeti yanıt vermiyor. Kesin kayıt yapmayın; bağlantıyı tekrar kontrol edin.');
    }
  }
  window.addEventListener('online', checkHealth);
  window.addEventListener('offline', () => {
    previous='offline'; dismissed=false;
    set('error','Ağ bağlantısı yok','Kurumsal ağ bağlantınızı kontrol edin. Son görüntülenen veriler güncel olmayabilir.');
  });
  checkHealth();
  setInterval(checkHealth, 30000);
})();
