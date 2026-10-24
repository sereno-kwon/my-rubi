// My Rubi 공용: 서버 주소, 구글 로그인 세션, API 호출
// 바탕화면(/)과 각 앱(/consult/ …)이 같은 도메인이라 localStorage의 세션을 함께 씀
(function () {
  const K_URL = 'myrubi.url', K_SESSION = 'myrubi.session';
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };
  const inFrame = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
  const CFG = window.MYRUBI_CONFIG || {};

  const MR = {
    inFrame,
    /** 구글 로그인을 쓰는지 (config.js 에 클라이언트 ID가 있으면 사용) */
    loginEnabled() { return !!CFG.GOOGLE_CLIENT_ID; },
    url() { return get(K_URL) || CFG.API_URL || ''; },
    setUrl(u) { set(K_URL, u || null); },

    /** 저장된 세션 { token, user:{email,name,picture,exp} } 또는 null */
    session() {
      try {
        const s = JSON.parse(get(K_SESSION) || 'null');
        if (!s || !s.token || !s.user || s.user.exp < Date.now()) return null;
        return s;
      } catch (e) { return null; }
    },
    user() { const s = MR.session(); return s ? s.user : { name: '', email: '' }; },
    clear() { set(K_SESSION, null); },

    /** 구글이 준 ID 토큰을 서버에 보내 포털 세션으로 바꿈 */
    async login(credential) {
      const j = await MR._call({ action: 'login', credential }, true);
      set(K_SESSION, JSON.stringify({ token: j.session, user: j.user }));
      return j.user;
    },
    async logout() {
      const s = MR.session();
      MR.clear();
      if (s) { try { await MR._call({ action: 'logout', s: s.token }, true); } catch (e) {} }
    },

    async get(params) {
      const base = MR.url(); if (!base) throw new Error('서버 주소가 설정되지 않았습니다');
      const u = new URL(base);
      const s = MR.session();
      Object.entries(Object.assign({}, params, { s: s ? s.token : '' })).forEach(([k, v]) => u.searchParams.set(k, v));
      return MR._handle(await MR._fetch(u, { redirect: 'follow' }));
    },
    async post(body) {
      const s = MR.session();
      return MR._call(Object.assign({}, body, { s: s ? s.token : '' }));
    },
    async _call(body, noKick) {
      const base = MR.url(); if (!base) throw new Error('서버 주소가 설정되지 않았습니다');
      // text/plain 이면 CORS preflight 없이 Apps Script에 도달함
      const r = await MR._fetch(base, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
      return MR._handle(r, noKick);
    },
    async _fetch(u, opt) {
      try { return await fetch(u, opt); }
      catch (e) { throw new Error('서버에 연결할 수 없습니다. 잠시 뒤 다시 시도해 주세요'); }
    },
    async _handle(r, noKick) {
      let j; try { j = await r.json(); } catch (e) { throw new Error('서버 응답을 읽을 수 없습니다'); }
      if (!j.ok) {
        if (j.error === 'unauthorized') { if (!noKick) MR.kick(); throw new Error('다시 로그인해 주세요'); }
        throw new Error(j.error || '오류');
      }
      return j;
    },

    /** 세션이 없거나 만료됐을 때: 바탕화면이면 잠금 화면, 창 안이면 바탕화면에 알림, 단독 페이지면 / 로 이동 */
    kick() {
      MR.clear();
      if (inFrame) { try { window.top.postMessage({ type: 'myrubi:signedout' }, location.origin); } catch (e) {} return; }
      if (typeof MR.onKick === 'function') { MR.onKick(); return; }
      location.href = '/?next=' + encodeURIComponent(location.pathname + location.search);
    },
    /** 앱 페이지 시작 시 호출: 로그인 안 되어 있으면 바로 kick */
    requireLogin() { if (MR.loginEnabled() && !MR.session()) { MR.kick(); return false; } return true; },
    /** 예전 앱 코드 호환용 */
    who() { return MR.user().name; },
  };
  window.MR = MR;
})();
