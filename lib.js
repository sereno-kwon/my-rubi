// My Rubi 공용: 서버 주소, 로그인 토큰, API 호출
// 바탕화면(/)과 각 앱(/consult/, /users/ …)이 같은 도메인이라 localStorage를 공유함
(function () {
  const K_URL = 'myrubi.url', K_TOKEN = 'myrubi.token', K_USER = 'myrubi.user';
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };
  const inFrame = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();

  const MR = {
    inFrame,
    url() { return get(K_URL) || (window.MYRUBI_CONFIG && window.MYRUBI_CONFIG.API_URL) || ''; },
    setUrl(u) { set(K_URL, u || null); },
    token() { return get(K_TOKEN); },
    user() { try { return JSON.parse(get(K_USER) || 'null'); } catch (e) { return null; } },
    setSession(token, user) { set(K_TOKEN, token); set(K_USER, user ? JSON.stringify(user) : null); },
    clear() { set(K_TOKEN, null); set(K_USER, null); },

    async get(params) {
      const base = MR.url(); if (!base) throw new Error('서버 주소가 설정되지 않았습니다');
      const u = new URL(base);
      Object.entries(Object.assign({}, params, { token: MR.token() || '' })).forEach(([k, v]) => u.searchParams.set(k, v));
      return MR._handle(await MR._fetch(u, { redirect: 'follow' }));
    },
    async post(body) {
      const base = MR.url(); if (!base) throw new Error('서버 주소가 설정되지 않았습니다');
      // text/plain 이면 CORS preflight 없이 Apps Script에 도달함
      const r = await MR._fetch(base, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({}, body, { token: MR.token() || '' })) });
      return MR._handle(r);
    },
    async _fetch(u, opt) {
      try { return await fetch(u, opt); }
      catch (e) { throw new Error('서버에 연결할 수 없습니다. Apps Script 배포의 액세스 권한이 "모든 사용자"인지 확인해 주세요.'); }
    },
    async _handle(r) {
      let j; try { j = await r.json(); } catch (e) { throw new Error('서버 응답을 읽을 수 없습니다'); }
      if (!j.ok) {
        if (j.error === 'unauthorized') { MR.kick(); throw new Error('로그인이 필요합니다'); }
        throw new Error(j.error || '오류');
      }
      return j;
    },

    /** 세션이 끝났을 때: 바탕화면이면 로그인 화면, 창 안이면 바탕화면에 알림, 단독 페이지면 / 로 이동 */
    kick() {
      MR.clear();
      if (inFrame) { try { window.top.postMessage({ type: 'myrubi:logout' }, location.origin); } catch (e) {} return; }
      if (typeof MR.onKick === 'function') { MR.onKick(); return; }
      location.href = '/?next=' + encodeURIComponent(location.pathname + location.search);
    },
    /** 앱 페이지 시작 시 호출: 토큰 없으면 바로 kick */
    requireLogin() { if (!MR.token()) { MR.kick(); return false; } return true; },
  };
  window.MR = MR;
})();
