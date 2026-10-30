/**
 * My Rubi 포털 백엔드 (Google Apps Script 웹앱) · my.rubiworkshop.com
 *
 * 역할
 *  - 회사 구글 계정 로그인과 포털 세션
 *  - 첫 화면 공지·일정 포스트잇을 My Rubi Index 스프레드시트의 '공지' 탭에 저장함 (탭은 처음 쓸 때 자동 생성)
 *  - 멤버별 체크리스트를 같은 스프레드시트의 '체크리스트' 탭에 저장함 (탭은 처음 쓸 때 자동 생성)
 *    CONFIG.PRIVATE_CHECKLISTS 에 적은 멤버의 목록은 본인에게만 돌려줌 (다른 직원에게는 응답에서 아예 빠짐)
 *  - 구글 캘린더(CONFIG.CALENDARS)의 한 달치 일정을 읽어 첫 화면 오른쪽 달력에 돌려줌 (GET calendar)
 *    달력에서 일정 넣기·고치기·지우기도 받음 (POST event). 반복 일정은 구글 캘린더에서만 고침
 *
 * 배포: 확장 프로그램 > Apps Script > 배포 > 새 배포 > 웹 앱
 *   실행 사용자: 나 / 액세스: 모든 사용자 (구글 로그인 세션으로 보호)
 *
 * 로그인
 *  - 포털 첫 화면에서 회사 구글 워크스페이스 계정(CONFIG.ALLOWED_DOMAINS)으로 로그인
 *  - 포털이 보낸 구글 ID 토큰을 여기서 구글에 확인한 뒤, 30일짜리 포털 세션을 발급함
 *  - 이후 모든 요청에 세션(s)이 필요하고, 공지·체크리스트·일정의 작성자는 로그인한 사람 이름으로 들어감
 *  - 세션은 스크립트 속성에 저장됨. 모두 로그아웃시키려면 편집기에서 clearAllSessions 실행
 */

// ───────────────────────────── 설정 ─────────────────────────────

const CONFIG = {
  // 00_My Rubi Index 스프레드시트 ID ('공지'·'체크리스트' 탭을 저장하는 곳)
  INDEX_SHEET_ID: '1wkogYTTI26ha1YsYu35pOLSBFSxIRok58qYRqRw18mA',

  // 구글 로그인: Google Cloud 콘솔에서 만든 OAuth 클라이언트 ID (포털 config.js 의 값과 같아야 함)
  GOOGLE_CLIENT_ID: '170788190959-st694dptpqurkm17fglb21bmhph2ui53.apps.googleusercontent.com',
  // 이 도메인들의 구글 워크스페이스 계정만 로그인 허용 (기본 도메인과 별칭 도메인 모두)
  ALLOWED_DOMAINS: ['rubiworkshop.com', 'rubi.kr'],
  // 도메인 밖이지만 예외로 허용할 계정 (예: ['someone@gmail.com'])
  EXTRA_EMAILS: [],
  // 로그인 유지 기간
  SESSION_DAYS: 30,

  TZ: 'Asia/Seoul',

  // 체크리스트 개인 목록: 여기 적은 멤버의 체크리스트는 본인(과 viewers 에 적은 사람)에게만 보임
  //  emails : 본인 계정. 아이디(@ 앞)만 적으면 rubiworkshop.com, rubi.kr 어느 쪽으로 로그인해도 맞음
  //  names  : emails 가 비어 있을 때만 쓰는 임시 확인용 구글 계정 이름 (계정 이름은 바꿀 수 있으므로 이메일을 적는 것이 안전)
  //  viewers: 본인 말고 이 목록을 볼 수 있는 계정 (예: ['ohyun'])
  PRIVATE_CHECKLISTS: {
    '권오현': { emails: ['ohyun'], names: ['권오현', 'Ohyun Kwon'], viewers: [] },
    '권오륜': { emails: ['oryun'], names: ['권오륜'],               viewers: [] },
  },
  // 예전에 구글 계정 이름으로 저장된 담당자 이름을 멤버 이름으로 맞춤 (포털 config.js 의 MEMBER_ALIASES 와 같게)
  CHECK_OWNER_ALIASES: { 'Ohyun Kwon': '권오현' },

  // 포털 첫 화면 오른쪽 달력에 보여줄 구글 캘린더 ID 목록 (구글 캘린더 → 캘린더 설정 → 캘린더 ID)
  //  비워두면 이 스크립트를 실행하는 계정의 기본 캘린더만 보여줌
  //  회사 공용 캘린더는 '…@group.calendar.google.com', 직원 캘린더는 이메일 그대로 (이 계정에 공유되어 있어야 읽힘)
  //  예: CALENDARS: ['primary', 'abc123@group.calendar.google.com', 'oryun@rubiworkshop.com'],
  CALENDARS: ['rubiworkshop.com_dl9dl4aqajbc3gludolt5of1o8@group.calendar.google.com'],
  // 같은 달을 다시 물을 때 이 시간(초) 동안은 캘린더를 다시 읽지 않고 받아 둔 결과를 돌려줌
  CALENDAR_CACHE_SEC: 120,
};

// 공지 탭 컬럼 (바탕화면 포스트잇)
const NOTE_COLS = ['id', 'type', 'text', 'date', 'time', 'color', 'author', 'email', 'createdAt', 'updatedAt'];
const NOTE_HEADERS = ['ID', '종류(notice/event)', '내용', '날짜', '시간', '색', '작성자', '이메일', '작성일시', '수정일시'];
const NOTE_COLORS = ['yellow', 'pink', 'blue', 'green'];

// 체크리스트 탭 컬럼 (멤버별 체크리스트)
const CHECK_COLS = ['id', 'owner', 'text', 'repeat', 'doneAt', 'doneBy', 'order', 'author', 'email', 'createdAt', 'updatedAt'];
const CHECK_HEADERS = ['ID', '담당', '내용', '반복(daily/weekly/once)', '끝낸 일시', '끝낸 사람', '순서', '작성자', '이메일', '작성일시', '수정일시'];
const CHECK_REPEATS = ['daily', 'weekly', 'once'];

// ───────────────────────────── HTTP ─────────────────────────────

function doGet(e) {
  try {
    const p = e.parameter || {};
    if (p.action === 'ping') return json_({ ok: true });   // 연결 확인은 로그인 없이
    const user = auth_(p.s);

    switch (p.action) {
      case 'me':       return json_({ ok: true, user: publicUser_(user) });
      case 'notes':    return json_({ ok: true, notes: listNotes_() });
      case 'checks':   return json_({ ok: true, checks: listChecks_(user), hide: hiddenMembers_(user) });
      case 'calendar': return json_({ ok: true, ...listCalendar_(p.month) });
      default:         return json_({ ok: false, error: 'unknown action' });
    }
  } catch (err) {
    return json_({ ok: false, error: errMsg_(err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    if (body.action === 'login')  return json_({ ok: true, ...login_(body.credential) });
    if (body.action === 'logout') { logout_(body.s); return json_({ ok: true }); }
    const user = auth_(body.s);

    switch (body.action) {
      case 'note':     return json_({ ok: true, notes: saveNote_(body, user) });
      case 'check':    return json_({ ok: true, checks: saveCheck_(body, user), hide: hiddenMembers_(user) });
      case 'event':    return json_({ ok: true, ...saveEvent_(body, user) });
      default:         return json_({ ok: false, error: 'unknown action' });
    }
  } catch (err) {
    return json_({ ok: false, error: errMsg_(err) });
  } finally {
    lock.releaseLock();
  }
}

function errMsg_(err) {
  return String(err && err.message ? err.message : err).replace(/^Error:\s*/, '');
}

// ───────────────────────────── 로그인 ─────────────────────────────

/** 구글 ID 토큰을 확인하고 포털 세션을 발급함 */
function login_(credential) {
  if (!CONFIG.GOOGLE_CLIENT_ID) throw new Error('Code.gs 의 GOOGLE_CLIENT_ID 가 비어 있습니다');
  if (!credential) throw new Error('로그인 정보가 없습니다');
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('구글 로그인을 확인하지 못했습니다. 다시 시도해 주세요');
  const t = JSON.parse(res.getContentText());
  const email = String(t.email || '').toLowerCase();
  if (t.aud !== CONFIG.GOOGLE_CLIENT_ID) throw new Error('다른 앱의 로그인 정보입니다');
  if (String(t.email_verified) !== 'true') throw new Error('확인되지 않은 이메일입니다');
  if (Number(t.exp) * 1000 < Date.now()) throw new Error('로그인 정보가 만료되었습니다. 다시 시도해 주세요');
  const inDomain = CONFIG.ALLOWED_DOMAINS.includes(String(t.hd || ''));   // hd: 워크스페이스 계정에만 있는 값
  const extra = CONFIG.EXTRA_EMAILS.map(x => String(x).toLowerCase()).includes(email);
  if (!inDomain && !extra) throw new Error('회사 구글 계정(' + CONFIG.ALLOWED_DOMAINS.join(', ') + ')으로 로그인해 주세요');

  const user = { email, name: t.name || email.split('@')[0], picture: t.picture || '', exp: Date.now() + CONFIG.SESSION_DAYS * 86400000 };
  const token = randomString_(40);
  const props = PropertiesService.getScriptProperties();
  pruneSessions_(props);
  props.setProperty('sess:' + hash_(token), JSON.stringify(user));
  return { session: token, user: publicUser_(user) };
}

/** 세션을 확인하고 로그인한 사람을 돌려줌. 없거나 만료되면 unauthorized */
function auth_(token) {
  if (!token) throw new Error('unauthorized');
  const key = 'sess:' + hash_(token);
  const cache = CacheService.getScriptCache();
  let raw = cache.get(key);
  if (!raw) { raw = PropertiesService.getScriptProperties().getProperty(key); if (raw) cache.put(key, raw, 600); }
  if (!raw) throw new Error('unauthorized');
  const user = JSON.parse(raw);
  if (user.exp < Date.now()) { PropertiesService.getScriptProperties().deleteProperty(key); cache.remove(key); throw new Error('unauthorized'); }
  return user;
}

function logout_(token) {
  if (!token) return;
  const key = 'sess:' + hash_(token);
  PropertiesService.getScriptProperties().deleteProperty(key);
  CacheService.getScriptCache().remove(key);
}

function publicUser_(u) { return { email: u.email, name: u.name, picture: u.picture, exp: u.exp }; }

function pruneSessions_(props) {
  const all = props.getProperties(), now = Date.now();
  Object.keys(all).forEach(k => {
    if (k.indexOf('sess:') !== 0) return;
    try { if (JSON.parse(all[k]).exp < now) props.deleteProperty(k); } catch (e) { props.deleteProperty(k); }
  });
}

function hash_(s) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s)));
}

function randomString_(len) {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  while (s.length < len) {
    const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Math.random());
    for (const b of bytes) { if (s.length >= len) break; s += chars[((b + 256) % 256) % chars.length]; }
  }
  return s;
}

/** 편집기에서 직접 실행용: 모든 기기를 로그아웃시킴 (퇴사자가 생겼을 때 등) */
function clearAllSessions() {
  const props = PropertiesService.getScriptProperties(), all = props.getProperties();
  let n = 0;
  Object.keys(all).forEach(k => { if (k.indexOf('sess:') === 0) { props.deleteProperty(k); n++; } });
  Logger.log('세션 ' + n + '개를 지웠습니다. 캐시 때문에 최대 10분 뒤 모두 적용됩니다');
}

/** 편집기에서 직접 실행용: 지금 로그인되어 있는 사람 목록 */
function listSessions() {
  const all = PropertiesService.getScriptProperties().getProperties();
  Object.keys(all).filter(k => k.indexOf('sess:') === 0).forEach(k => {
    const u = JSON.parse(all[k]);
    Logger.log(u.email + '  ~' + Utilities.formatDate(new Date(u.exp), CONFIG.TZ, 'yyyy-MM-dd'));
  });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ───────────────────────────── Index 스프레드시트 ─────────────────────────────

function indexSs_() {
  const id = CONFIG.INDEX_SHEET_ID || PropertiesService.getScriptProperties().getProperty('INDEX_SHEET_ID');
  if (!id) throw new Error('Code.gs 의 INDEX_SHEET_ID 가 비어 있습니다');
  return SpreadsheetApp.openById(id);
}

function now_() {
  return Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd HH:mm');
}

// ───────────────────────────── 공지 (바탕화면 포스트잇) ─────────────────────────────

function noteSheet_() {
  const ss = indexSs_();
  let sh = ss.getSheetByName('공지');
  if (!sh) {
    sh = ss.insertSheet('공지');
    sh.getRange(1, 1, 1, NOTE_HEADERS.length).setValues([NOTE_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    // 날짜·시간이 자동으로 날짜 형식으로 바뀌지 않게 글자 그대로 저장
    sh.getRange(1, 1, sh.getMaxRows(), NOTE_COLS.length).setNumberFormat('@');
  }
  return sh;
}

/** 시트 값 → 문자열 (예전에 날짜 형식으로 바뀐 칸도 처리) */
function noteCell_(v, col) {
  if (v instanceof Date) {
    if (col === 'time') return Utilities.formatDate(v, CONFIG.TZ, 'HH:mm');
    if (col === 'date') return Utilities.formatDate(v, CONFIG.TZ, 'yyyy-MM-dd');
    return Utilities.formatDate(v, CONFIG.TZ, 'yyyy-MM-dd HH:mm');
  }
  return v == null ? '' : String(v);
}

/** 공지 목록. 지난 지 30일이 넘은 일정은 빼고 돌려줌 (시트에는 남음) */
function listNotes_() {
  const sh = noteSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const cutoff = Utilities.formatDate(new Date(Date.now() - 30 * 86400000), CONFIG.TZ, 'yyyy-MM-dd');
  return sh.getRange(2, 1, last - 1, NOTE_COLS.length).getValues()
    .map(r => { const o = {}; NOTE_COLS.forEach((k, i) => o[k] = noteCell_(r[i], k)); delete o.email; return o; })
    .filter(o => o.id && o.text && !(o.type === 'event' && o.date && o.date < cutoff));
}

/** op: add / update / delete. 저장 후 전체 목록을 돌려줌 */
function saveNote_(b, user) {
  const sh = noteSheet_();
  const op = String(b.op || '');
  const findRow = id => {
    const last = sh.getLastRow();
    if (!id || last < 2) return -1;
    const ids = sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0]));
    const i = ids.indexOf(String(id));
    return i < 0 ? -1 : i + 2;
  };

  if (op === 'delete') {
    const row = findRow(b.id);
    if (row > 0) sh.deleteRow(row);
    return listNotes_();
  }

  const type = b.type === 'event' ? 'event' : 'notice';
  const text = String(b.text || '').trim().slice(0, 500);
  const date = type === 'event' ? String(b.date || '') : '';
  const time = type === 'event' ? String(b.time || '') : '';
  const color = NOTE_COLORS.indexOf(b.color) >= 0 ? b.color : (type === 'event' ? 'blue' : 'yellow');
  if (!text) throw new Error('내용을 적어 주세요');
  if (type === 'event' && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('일정 날짜가 필요합니다');
  if (time && !/^\d{2}:\d{2}$/.test(time)) throw new Error('시간 형식이 맞지 않습니다');

  if (op === 'add') {
    const o = { id: Utilities.getUuid().slice(0, 8), type, text, date, time, color,
      author: user.name || user.email, email: user.email, createdAt: now_(), updatedAt: '' };
    const row = sh.getLastRow() + 1;
    sh.getRange(row, 1, 1, NOTE_COLS.length).setNumberFormat('@').setValues([NOTE_COLS.map(k => o[k])]);
    return listNotes_();
  }
  if (op === 'update') {
    const row = findRow(b.id);
    if (row < 0) throw new Error('이미 떼어진 포스트잇입니다. 새로 고침해 주세요');
    const cur = sh.getRange(row, 1, 1, NOTE_COLS.length).getValues()[0];
    const o = {}; NOTE_COLS.forEach((k, i) => o[k] = noteCell_(cur[i], k));
    Object.assign(o, { type, text, date, time, color, updatedAt: now_() });
    sh.getRange(row, 1, 1, NOTE_COLS.length).setNumberFormat('@').setValues([NOTE_COLS.map(k => o[k])]);
    return listNotes_();
  }
  throw new Error('unknown op');
}

// ───────────────────────────── 체크리스트 (멤버별) ─────────────────────────────

function checkSheet_() {
  const ss = indexSs_();
  let sh = ss.getSheetByName('체크리스트');
  if (!sh) {
    sh = ss.insertSheet('체크리스트');
    sh.getRange(1, 1, 1, CHECK_HEADERS.length).setValues([CHECK_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), CHECK_COLS.length).setNumberFormat('@');
  }
  return sh;
}

const checkOwner_ = n => { n = String(n || '').trim(); return (CONFIG.CHECK_OWNER_ALIASES || {})[n] || n; };

function checkRows_(sh) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, CHECK_COLS.length).getValues()
    .map(r => { const o = {}; CHECK_COLS.forEach((k, i) => o[k] = noteCell_(r[i], k)); o.order = Number(o.order) || 0; o.owner = checkOwner_(o.owner); o.doneBy = checkOwner_(o.doneBy); return o; });
}

/** 이메일 아이디(@ 앞). 회사 도메인(ALLOWED_DOMAINS)이면 아이디만, 바깥 계정이면 이메일 전체로 비교 */
function emailKey_(email) {
  const e = String(email || '').toLowerCase().trim();
  const at = e.lastIndexOf('@');
  if (at < 0) return e;
  return CONFIG.ALLOWED_DOMAINS.includes(e.slice(at + 1)) ? e.slice(0, at) : e;
}
/** 이 사람이 그 멤버의 체크리스트를 볼 수 있는지. 개인 목록이 아닌 멤버는 모두 볼 수 있음 */
function canSeeChecks_(owner, user) {
  const p = (CONFIG.PRIVATE_CHECKLISTS || {})[checkOwner_(owner)];
  if (!p) return true;
  const me = emailKey_(user.email);
  const keys = (p.emails || []).concat(p.viewers || []).map(emailKey_);
  if (keys.includes(me)) return true;
  if (!(p.emails || []).length) return (p.names || []).includes(String(user.name || '').trim());
  return false;
}
/** 이 사람에게 탭을 숨길 멤버 */
function hiddenMembers_(user) {
  return Object.keys(CONFIG.PRIVATE_CHECKLISTS || {}).filter(n => !canSeeChecks_(n, user));
}

/** 목록. 볼 수 없는 개인 목록과 끝낸 지 30일이 넘은 '할 일'은 빼고 돌려줌 (시트에는 남음) */
function listChecks_(user) {
  const cutoff = Utilities.formatDate(new Date(Date.now() - 30 * 86400000), CONFIG.TZ, 'yyyy-MM-dd');
  return checkRows_(checkSheet_())
    .filter(o => canSeeChecks_(o.owner, user))
    .map(o => { delete o.email; return o; })
    .filter(o => o.id && o.text && !(o.repeat === 'once' && o.doneAt && o.doneAt.slice(0, 10) < cutoff));
}

/** op: add / update / toggle / delete. 저장 후 전체 목록을 돌려줌 */
function saveCheck_(b, user) {
  const sh = checkSheet_();
  const op = String(b.op || '');
  const who = user.name || user.email;
  const findRow = id => {
    const last = sh.getLastRow();
    if (!id || last < 2) return -1;
    const ids = sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0]));
    const i = ids.indexOf(String(id));
    return i < 0 ? -1 : i + 2;
  };
  const readRow = row => { const cur = sh.getRange(row, 1, 1, CHECK_COLS.length).getValues()[0]; const o = {}; CHECK_COLS.forEach((k, i) => o[k] = noteCell_(cur[i], k)); return o; };
  const gone = '이미 지워진 항목입니다. 새로 고침해 주세요';
  /** 남의 개인 목록에 있는 줄은 없는 것처럼 다룸 */
  const ownRow = id => { const row = findRow(id); if (row < 0) return -1; return canSeeChecks_(readRow(row).owner, user) ? row : -1; };
  const writeRow = (row, o) => sh.getRange(row, 1, 1, CHECK_COLS.length).setNumberFormat('@').setValues([CHECK_COLS.map(k => o[k] == null ? '' : String(o[k]))]);

  if (op === 'delete') {
    const row = ownRow(b.id);
    if (row > 0) sh.deleteRow(row);
    return listChecks_(user);
  }
  if (op === 'toggle') {
    const row = ownRow(b.id);
    if (row < 0) throw new Error(gone);
    const o = readRow(row);
    if (b.done) { o.doneAt = now_(); o.doneBy = who; } else { o.doneAt = ''; o.doneBy = ''; }
    writeRow(row, o);
    return listChecks_(user);
  }

  const owner = checkOwner_(String(b.owner || '').slice(0, 40));
  const text = String(b.text || '').trim().slice(0, 200);
  const repeat = CHECK_REPEATS.indexOf(b.repeat) >= 0 ? b.repeat : 'once';
  const order = Number(b.order) || 0;
  if (!owner) throw new Error('담당 멤버가 필요합니다');
  if (!text) throw new Error('내용을 적어 주세요');
  if (!canSeeChecks_(owner, user)) throw new Error(owner + '님의 체크리스트에는 넣을 수 없습니다');

  if (op === 'add') {
    const o = { id: Utilities.getUuid().slice(0, 8), owner, text, repeat, doneAt: '', doneBy: '', order,
      author: who, email: user.email, createdAt: now_(), updatedAt: '' };
    writeRow(sh.getLastRow() + 1, o);
    return listChecks_(user);
  }
  if (op === 'update') {
    const row = ownRow(b.id);
    if (row < 0) throw new Error(gone);
    const o = readRow(row);
    // 반복 종류가 바뀌면 끝낸 기록은 새로 시작
    if (o.repeat !== repeat) { o.doneAt = ''; o.doneBy = ''; }
    Object.assign(o, { owner, text, repeat, order, updatedAt: now_() });
    writeRow(row, o);
    return listChecks_(user);
  }
  throw new Error('unknown op');
}

// ───────────────────────────── 구글 캘린더 (첫 화면 달력) ─────────────────────────────
// Apps Script 캘린더 서비스(CalendarApp)로 읽음. 스크립트를 실행하는 계정(배포 설정의 '나')이 볼 수 있는 캘린더만 읽힘
// 처음 한 번 편집기에서 test_calendar 를 실행해 캘린더 권한을 승인한 뒤 새 버전으로 배포해야 함

/** 달력 격자 범위: 그 달 1일이 든 주의 일요일부터 6주(42일) */
function calendarRange_(month) {
  const m = String(month || '').match(/^(\d{4})-(\d{2})$/);
  const now = new Date();
  const y = m ? Number(m[1]) : Number(Utilities.formatDate(now, CONFIG.TZ, 'yyyy'));
  const mo = m ? Number(m[2]) : Number(Utilities.formatDate(now, CONFIG.TZ, 'M'));
  const mm = String(mo).padStart(2, '0');
  // CONFIG.TZ 기준 그 달 1일 0시 (스크립트 프로젝트 시간대와 달라도 맞게)
  const first = new Date(`${y}-${mm}-01T00:00:00${tzOffset_(new Date(Date.UTC(y, mo - 1, 1, 12)))}`);
  const dow = Number(Utilities.formatDate(first, CONFIG.TZ, 'u')) % 7;   // u: 1=월 … 7=일 → 일=0
  const start = new Date(first.getTime() - dow * 86400000);
  const end = new Date(start.getTime() + 42 * 86400000);
  return { month: `${y}-${mm}`, start, end };
}
/** '+09:00' 같은 시간대 표기 */
function tzOffset_(d) { return Utilities.formatDate(d, CONFIG.TZ, 'XXX'); }

/** 읽을 캘린더 목록 [{ id, name, color, cal }] */
function calendars_() {
  const ids = (CONFIG.CALENDARS || []).length ? CONFIG.CALENDARS : ['primary'];
  const out = [];
  ids.forEach(id => {
    const cal = id === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(id);
    if (!cal) return;   // 공유되지 않았거나 ID가 틀린 캘린더는 건너뜀
    out.push({ id: cal.getId(), name: cal.getName(), color: cal.getColor() || '', cal });
  });
  return out;
}

/** 한 달치 일정. { month, start, end, calendars:[{id,name,color}], events:[…] } */
/** 일정 하나를 포털이 쓰는 모양으로 */
function eventJson_(ev, ci) {
  const fmtDay = d => Utilities.formatDate(d, CONFIG.TZ, 'yyyy-MM-dd');
  const fmtMin = d => Utilities.formatDate(d, CONFIG.TZ, 'HH:mm');
  const allDay = ev.isAllDayEvent();
  const s = ev.getStartTime(), e = ev.getEndTime();
  // 종일 일정의 끝은 다음 날 0시(배타)라 하루를 빼서 마지막 날로 맞춤
  const endDay = allDay ? fmtDay(new Date(e.getTime() - 1)) : fmtDay(new Date(Math.max(s.getTime(), e.getTime() - 1)));
  const d = splitDesc_(ev.getDescription());
  return {
    id: ev.getId(), cal: ci, title: ev.getTitle() || '(제목 없음)',
    allDay, date: fmtDay(s), endDate: endDay,
    start: allDay ? '' : fmtMin(s), end: allDay ? '' : fmtMin(e),
    location: ev.getLocation() || '',
    desc: d.text.slice(0, 2000), by: d.tag.replace(/^\[My Rubi\]\s*/, ''),
    rec: ev.isRecurringEvent(),
  };
}
const sortEvents_ = events => events.sort((a, b) => (a.date + (a.allDay ? '' : a.start)).localeCompare(b.date + (b.allDay ? '' : b.start)));

/** fresh: 일정을 바꾼 직후. 캐시를 읽지도 쓰지도 않음 (바뀌기 전 목록이 2분 동안 남지 않게) */
function listCalendar_(month, fresh) {
  const r = calendarRange_(month);
  const cache = CacheService.getScriptCache(), key = 'cal:' + r.month;
  const sec = fresh ? 0 : Number(CONFIG.CALENDAR_CACHE_SEC) || 0;
  if (sec) { const hit = cache.get(key); if (hit) return JSON.parse(hit); }

  const fmtDay = d => Utilities.formatDate(d, CONFIG.TZ, 'yyyy-MM-dd');
  const cals = calendars_();
  const events = [];
  cals.forEach((c, ci) => {
    let list = [];
    try { list = c.cal.getEvents(r.start, r.end); } catch (e) { return; }
    list.forEach(ev => events.push(eventJson_(ev, ci)));
  });
  sortEvents_(events);
  const out = {
    month: r.month, start: fmtDay(r.start), end: fmtDay(new Date(r.end.getTime() - 1)),
    calendars: cals.map(c => ({ id: c.id, name: c.name, color: c.color })),
    events,
  };
  if (sec) { try { cache.put(key, JSON.stringify(out), Math.min(sec, 21600)); } catch (e) {} }   // 100KB 넘으면 캐시만 건너뜀
  return out;
}

// ─── 달력에서 일정 넣기·고치기·지우기 (POST event) ───
// op: add | update | delete. 넣는 캘린더는 CONFIG.CALENDARS 의 첫 번째(여러 개면 포털에서 고른 것)
// 포털에서 넣거나 고친 일정은 메모 맨 끝에 '[My Rubi] 입력 이름' 줄이 붙음 (구글 캘린더에서는 실행 계정이 만든 것으로 보이므로)
const EVENT_TAG_RE = /\n*\[My Rubi\][^\n]*\s*$/;

/** 메모를 사용자가 쓴 부분과 [My Rubi] 줄로 나눔 */
function splitDesc_(desc) {
  const s = String(desc || '');
  const m = s.match(EVENT_TAG_RE);
  return m ? { text: s.slice(0, m.index).replace(/\s+$/, ''), tag: m[0].trim() } : { text: s.replace(/\s+$/, ''), tag: '' };
}

/** 포털에서 온 값 확인. 날짜·시간은 CONFIG.TZ 기준 */
function eventInput_(b) {
  const title = String(b.title || '').trim().slice(0, 200);
  if (!title) throw new Error('제목을 입력해 주세요');
  const date = String(b.date || ''), endDate = String(b.endDate || '') || date;
  const D = /^\d{4}-\d{2}-\d{2}$/, T = /^\d{2}:\d{2}$/;
  if (!D.test(date) || !D.test(endDate)) throw new Error('날짜를 확인해 주세요');
  if (endDate < date) throw new Error('끝나는 날이 시작하는 날보다 앞입니다');
  const at = (d, t) => new Date(`${d}T${t}:00${tzOffset_(new Date(d + 'T12:00:00Z'))}`);
  const allDay = !!b.allDay;
  let start, end;
  if (allDay) {
    // 종일 일정은 날짜만 쓰임. 정오로 잡아 두면 시간대가 조금 달라도 날짜가 밀리지 않음
    start = at(date, '12:00'); end = new Date(at(endDate, '12:00').getTime() + 86400000);   // 끝은 다음 날(배타)
  } else {
    const st = String(b.start || ''), et = String(b.end || '');
    if (!T.test(st)) throw new Error('시작 시간을 입력해 주세요');
    start = at(date, st);
    end = T.test(et) ? at(endDate, et) : new Date(start.getTime() + 3600000);
    if (end <= start) throw new Error('끝나는 시간이 시작 시간보다 앞입니다');
  }
  return {
    title, allDay, start, end, date, endDate,
    location: String(b.location || '').trim().slice(0, 300),
    desc: String(b.desc || '').replace(/\r/g, '').trim().slice(0, 4000),
  };
}

/** 일정 저장 후, 그 일정이 보이는 달(앞뒤 한 달 포함)의 캐시를 지움 */
function clearCalCache_(fromDay, toDay) {
  const keys = [];
  let [y, m] = fromDay.slice(0, 7).split('-').map(Number);
  m -= 1; if (m < 1) { m = 12; y--; }
  const [ty, tm0] = toDay.slice(0, 7).split('-').map(Number);
  let ey = ty, em = tm0 + 1; if (em > 12) { em = 1; ey++; }
  for (let i = 0; i < 26 && (y < ey || (y === ey && m <= em)); i++) {
    keys.push('cal:' + y + '-' + String(m).padStart(2, '0'));
    m++; if (m > 12) { m = 1; y++; }
  }
  if (keys.length) CacheService.getScriptCache().removeAll(keys);
}

function findEvent_(cals, id, ci) {
  if (!id) return null;
  const order = cals[Number(ci)] ? [cals[Number(ci)]].concat(cals.filter((c, i) => i !== Number(ci))) : cals;
  for (const c of order) {
    try { const ev = c.cal.getEventById(id); if (ev) return ev; } catch (e) {}
  }
  return null;
}

function saveEvent_(b, user) {
  const cals = calendars_();
  if (!cals.length) throw new Error('일정을 넣을 캘린더가 없습니다. Code.gs 의 CALENDARS 를 확인해 주세요');
  const name = user.name || user.email;
  const fmtDay = d => Utilities.formatDate(d, CONFIG.TZ, 'yyyy-MM-dd');
  const op = String(b.op || '');
  let ev = null;

  if (op === 'update' || op === 'delete') {
    ev = findEvent_(cals, b.id, b.cal);
    if (!ev) throw new Error('일정을 찾지 못했습니다. 이미 지워졌을 수 있습니다');
    if (ev.isRecurringEvent()) throw new Error('반복 일정은 구글 캘린더에서 고쳐 주세요');
    const s = ev.getStartTime(), e = ev.getEndTime();
    clearCalCache_(fmtDay(s), fmtDay(new Date(Math.max(s.getTime(), e.getTime() - 1))));
    if (op === 'delete') {
      const id = ev.getId();
      ev.deleteEvent();
      // 같은 실행 안에서 다시 읽으면 지운 일정이 아직 섞여 나올 수 있어 직접 빼고 돌려줌
      const out = listCalendar_(b.month, true);
      out.events = out.events.filter(x => x.id !== id);
      clearCalCache_(out.start, out.end);
      return Object.assign(out, { saved: '', deleted: id });
    }
  } else if (op !== 'add') {
    throw new Error('unknown op');
  }

  const v = eventInput_(b);
  let tag;
  if (op === 'add') {
    tag = '[My Rubi] 입력 ' + name;
    const c = cals[Number(b.cal) || 0] || cals[0];
    const desc = v.desc + (v.desc ? '\n\n' : '') + tag;
    const opt = { location: v.location, description: desc };
    ev = v.allDay
      ? (v.endDate === v.date ? c.cal.createAllDayEvent(v.title, v.start, opt) : c.cal.createAllDayEvent(v.title, v.start, v.end, opt))
      : c.cal.createEvent(v.title, v.start, v.end, opt);
  } else {
    const old = splitDesc_(ev.getDescription()).tag;
    const base = old ? old.replace(/\s*·\s*수정 .*$/, '') : '[My Rubi]';
    tag = base + (old ? ' · 수정 ' : ' 수정 ') + name;
    ev.setTitle(v.title);
    ev.setLocation(v.location);
    ev.setDescription(v.desc + (v.desc ? '\n\n' : '') + tag);
    if (v.allDay) {
      if (v.endDate === v.date) ev.setAllDayDate(v.start); else ev.setAllDayDates(v.start, v.end);
    } else {
      ev.setTime(v.start, v.end);
    }
  }
  clearCalCache_(v.date, v.endDate);
  // 방금 넣거나 고친 일정이 목록에 바로 반영되지 않았을 수 있어 직접 끼워 넣음
  const out = listCalendar_(b.month, true);
  const id = ev.getId(), ci = Math.max(0, cals.findIndex(c => c.id === ev.getOriginalCalendarId()));
  const item = eventJson_(ev, ci);
  out.events = out.events.filter(x => x.id !== id);
  if (item.endDate >= out.start && item.date <= out.end) out.events.push(item);
  sortEvents_(out.events);
  return Object.assign(out, { saved: id });
}

/** 편집기에서 직접 실행용: 캘린더 권한 승인 + 이번 달 일정 확인 */
function test_calendar() {
  const r = listCalendar_('');
  Logger.log(r.month + ' · 캘린더 ' + r.calendars.map(c => c.name).join(', ') + ' · 일정 ' + r.events.length + '건');
  r.events.slice(0, 10).forEach(e => Logger.log(e.date + ' ' + (e.allDay ? '종일' : e.start + '-' + e.end) + '  ' + e.title));
}
