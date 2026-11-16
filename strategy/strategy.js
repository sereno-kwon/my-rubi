// 브랜드전략 페이지 공용 스크립트 (/strategy/브랜드/)
// 리포지토리가 공개라서 본문(공급율·마진 등 내부 숫자 포함)은 페이지에 두지 않음.
// 로그인 세션으로 Apps Script(GET strategy, b=브랜드)에 요청하면 REPORT_VIEWERS 에게만 Index 스프레드시트 '브랜드전략' 탭의 본문을 내려줌
(function () {
  const brand = document.body.dataset.brand || '';
  const main = document.getElementById('main');
  const toc = document.getElementById('tocList');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function state(title, msg) {
    main.innerHTML = `<div class="state"><h2>${esc(title)}</h2>${msg ? `<p>${esc(msg)}</p>` : ''}</div>`;
    toc.innerHTML = '';
  }

  function buildToc() {
    toc.innerHTML = '';
    main.querySelectorAll('section[id] > h2').forEach(h => {
      const label = Array.from(h.childNodes).filter(n => !(n.nodeType === 1 && n.classList.contains('n'))).map(n => n.textContent).join('').trim();
      const li = document.createElement('li');
      li.innerHTML = `<a href="#${esc(h.parentElement.id)}">${esc(label)}</a>`;
      toc.appendChild(li);
    });
    const links = Array.from(toc.querySelectorAll('a'));
    if (!('IntersectionObserver' in window) || !links.length) return;
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      links.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id));
    }), { rootMargin: '0px 0px -70% 0px' });
    main.querySelectorAll('section[id]').forEach(s => io.observe(s));
  }

  async function load() {
    state('불러오는 중…', '');
    try {
      const j = await MR.get({ action: 'strategy', b: brand });
      if (j.title) { document.title = j.title + ' · My Rubi'; document.getElementById('tocTitle').textContent = j.title; }
      main.innerHTML = j.html || '';
      buildToc();
      if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
    } catch (err) {
      const deploy = /unknown action/.test(err.message);
      state('브랜드전략을 열 수 없습니다', deploy ? 'Apps Script(Code.gs)를 새 버전으로 배포해야 합니다.' : err.message);
    }
  }

  if (window.MR && MR.requireLogin()) load();
  else if (!window.MR) state('브랜드전략을 열 수 없습니다', '포털 스크립트를 불러오지 못했습니다.');
})();
