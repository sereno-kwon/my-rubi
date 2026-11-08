/**
 * My Rubi 포털 백엔드 (Google Apps Script 웹앱) · my.rubiworkshop.com
 *
 * 역할
 *  - 회사 구글 계정 로그인과 포털 세션
 *  - 첫 화면 공지·일정 포스트잇을 My Rubi Index 스프레드시트의 '공지' 탭에 저장함 (탭은 처음 쓸 때 자동 생성)
 *  - 멤버별 체크리스트를 같은 스프레드시트의 '체크리스트' 탭에 저장함 (탭은 처음 쓸 때 자동 생성)
 *    CONFIG.PRIVATE_CHECKLISTS 에 적은 멤버의 목록은 본인에게만 돌려줌 (다른 직원에게는 응답에서 아예 빠짐)
 *  - 프로젝트를 같은 스프레드시트의 '프로젝트' 탭에 저장함. 프로젝트의 세부 항목은 '체크리스트' 탭의 줄이고
 *    '프로젝트' 열에 프로젝트 ID가 들어감. 담당은 여러 명(쉼표로 구분)이고, 프로젝트 항목은 개인 목록 설정과 관계없이 모두에게 보임
 *  - 고객관리: 고객 구매 건을 '고객' 탭에, 단계·상황이 바뀐 기록을 '고객로그' 탭에 저장함 (GET/POST crm)
 *    단계는 상담 10단계(문의 → … → 루비케어) + 종료. 포털이 이를 고객문의·구매진행중·구매완료 세 층위로 묶어 보여줌
 *  - 견적: 자전거 견적을 '견적' 탭에 저장함 (GET quotes / POST quote). 한 줄 = 견적 하나, 품목은 JSON으로 한 칸에
 *    고객관리의 고객 건(cid)에 연결하면, 저장할 때 그 건의 단계가 문의·상담이면 '견적'으로 넘기고 고객로그에 견적 번호와 금액을 남김
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

// 체크리스트 탭 컬럼 (멤버별 체크리스트). project·due 는 2026-11 에 뒤에 덧붙임 (예전 시트도 처음 쓸 때 머리글이 채워짐)
const CHECK_COLS = ['id', 'owner', 'text', 'repeat', 'doneAt', 'doneBy', 'order', 'author', 'email', 'createdAt', 'updatedAt', 'project', 'due'];
const CHECK_HEADERS = ['ID', '담당(여러 명은 쉼표)', '내용', '반복(daily/weekly/once)', '끝낸 일시', '끝낸 사람', '순서', '작성자', '이메일', '작성일시', '수정일시', '프로젝트 ID', '마감일'];
const CHECK_REPEATS = ['daily', 'weekly', 'once'];

// 프로젝트 탭 컬럼
const PROJ_COLS = ['id', 'name', 'lead', 'due', 'status', 'memo', 'order', 'author', 'email', 'createdAt', 'updatedAt'];
const PROJ_HEADERS = ['ID', '프로젝트', '책임자', '마감일', '상태(active/hold/done)', '메모', '순서', '작성자', '이메일', '작성일시', '수정일시'];
const PROJ_STATUS = ['active', 'hold', 'done'];

// 고객 탭 컬럼 (고객관리). 한 줄 = 고객 한 명의 구매 건 하나 (한 사람이 두 건이면 두 줄)
const CRM_COLS = ['id', 'name', 'info', 'group', 'item', 'stage', 'memo', 'flag', 'owner', 'amount', 'stageAt', 'author', 'email', 'createdAt', 'updatedAt'];
const CRM_HEADERS = ['ID', '고객명', '고객 정보(소속·관계)', '구분', '브랜드·모델', '단계', '현재 상황', '확인 필요', '담당', '계약금(원)', '단계 바뀐 일시', '작성자', '이메일', '작성일시', '수정일시'];
// 고객로그 탭: 단계·현재 상황·확인 필요가 바뀔 때마다 한 줄씩 쌓임 (주차별 변화와 고객별 이력을 여기서 계산)
const CRM_LOG_COLS = ['id', 'cid', 'name', 'stage', 'memo', 'flag', 'by', 'at'];
const CRM_LOG_HEADERS = ['ID', '고객 ID', '고객명', '단계', '현재 상황', '확인 필요', '기록한 사람', '기록 일시'];
// 단계는 상담 10단계 + 종료(취소·보류). 시트에도 한글 그대로 저장함 (포털 assets/crm.js 의 STAGES 와 같게)
const CRM_STAGES = ['문의', '상담', '견적', '계약금', '예약금', '발주', '입고', '조립', '출고', '루비케어', '종료'];
const CRM_GROUPS = ['개별 아카이브', '루비 브랜드', '컴포넌트 및 기타 브랜드'];

// 견적 탭 (assets/quote.js)
const QUOTE_COLS = ['id', 'no', 'cid', 'name', 'title', 'items', 'subtotal', 'discount', 'total', 'memo', 'note', 'valid', 'status', 'owner', 'author', 'email', 'createdAt', 'updatedAt'];
const QUOTE_HEADERS = ['ID', '견적 번호', '고객 건 ID', '고객명', '견적 제목', '품목(JSON)', '합계(원)', '할인(원)', '견적 금액(원)', '비고(견적서에 보임)', '내부 메모', '유효기간', '상태', '담당', '작성자', '이메일', '작성일시', '수정일시'];
const QUOTE_STATUS = ['작성중', '보냄', '계약', '취소'];
// 품목 구분. 포털 quote.js 의 CATS 와 같게 (견적서에는 이 순서로 묶여 나옴)
const QUOTE_CATS = ['프레임셋', '구동계', '휠·타이어', '콕핏', '안장·시트포스트', '페달', '액세서리', '공임', '기타'];

// ───────────────────────────── HTTP ─────────────────────────────

function doGet(e) {
  try {
    const p = e.parameter || {};
    if (p.action === 'ping') return json_({ ok: true });   // 연결 확인은 로그인 없이
    const user = auth_(p.s);

    switch (p.action) {
      case 'me':       return json_({ ok: true, user: publicUser_(user) });
      case 'notes':    return json_({ ok: true, notes: listNotes_() });
      case 'checks':   return json_({ ok: true, ...checkData_(user) });
      case 'calendar': return json_({ ok: true, ...listCalendar_(p.month) });
      case 'crm':      return json_({ ok: true, ...crmData_() });
      case 'quotes':   return json_({ ok: true, ...quoteData_() });
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
      case 'check':    saveCheck_(body, user);   return json_({ ok: true, ...checkData_(user) });
      case 'project':  { const saved = saveProject_(body, user) || ''; return json_({ ok: true, saved, ...checkData_(user) }); }
      case 'event':    return json_({ ok: true, ...saveEvent_(body, user) });
      case 'crm':      { const saved = saveCrm_(body, user) || ''; return json_({ ok: true, saved, ...crmData_() }); }
      case 'quote':    { const saved = saveQuote_(body, user) || ''; return json_({ ok: true, saved, ...quoteData_() }); }
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

// ───────────────────────────── 체크리스트 (멤버별) + 프로젝트 ─────────────────────────────
// 한 줄 = 한 항목. 프로젝트 항목은 '프로젝트' 열에 프로젝트 ID가 있는 줄이고, 담당 칸에 여러 명(쉼표 구분)이 들어갈 수 있음
// 개인 목록(PRIVATE_CHECKLISTS) 숨김은 프로젝트가 없는 줄에만 적용됨. 프로젝트 항목은 모두에게 보임

function checkSheet_() {
  const ss = indexSs_();
  let sh = ss.getSheetByName('체크리스트');
  if (!sh) {
    sh = ss.insertSheet('체크리스트');
    sh.getRange(1, 1, 1, CHECK_HEADERS.length).setValues([CHECK_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), CHECK_COLS.length).setNumberFormat('@');
  } else if (sh.getLastColumn() < CHECK_COLS.length) {
    // 예전 시트: 뒤에 새 열(프로젝트 ID, 마감일) 머리글을 채우고 글자 형식으로
    if (sh.getMaxColumns() < CHECK_COLS.length) sh.insertColumnsAfter(sh.getMaxColumns(), CHECK_COLS.length - sh.getMaxColumns());
    sh.getRange(1, 1, 1, CHECK_HEADERS.length).setValues([CHECK_HEADERS]).setFontWeight('bold');
    sh.getRange(1, 1, sh.getMaxRows(), CHECK_COLS.length).setNumberFormat('@');
  }
  return sh;
}

function projectSheet_() {
  const ss = indexSs_();
  let sh = ss.getSheetByName('프로젝트');
  if (!sh) {
    sh = ss.insertSheet('프로젝트');
    sh.getRange(1, 1, 1, PROJ_HEADERS.length).setValues([PROJ_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), PROJ_COLS.length).setNumberFormat('@');
  }
  return sh;
}

const checkOwner_ = n => { n = String(n || '').trim(); return (CONFIG.CHECK_OWNER_ALIASES || {})[n] || n; };
/** '권오현, 김현우' → ['권오현', '김현우'] (별칭 맞춤, 중복 제거) */
function ownerList_(v) {
  const arr = Array.isArray(v) ? v : String(v || '').split(/\s*,\s*/);
  const out = [];
  arr.forEach(n => { n = checkOwner_(String(n || '').slice(0, 40)); if (n && out.indexOf(n) < 0) out.push(n); });
  return out;
}

function checkRows_(sh) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, CHECK_COLS.length).getValues()
    .map(r => { const o = {}; CHECK_COLS.forEach((k, i) => o[k] = noteCell_(r[i], k)); o.order = Number(o.order) || 0; o.owner = ownerList_(o.owner).join(', '); o.doneBy = checkOwner_(o.doneBy); return o; });
}

function projectRows_() {
  const sh = projectSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, PROJ_COLS.length).getValues()
    .map(r => { const o = {}; PROJ_COLS.forEach((k, i) => o[k] = noteCell_(r[i], k)); o.order = Number(o.order) || 0; o.lead = checkOwner_(o.lead); return o; })
    .filter(o => o.id && o.name);
}

/** 이메일 아이디(@ 앞). 회사 도메인(ALLOWED_DOMAINS)이면 아이디만, 바깥 계정이면 이메일 전체로 비교 */
function emailKey_(email) {
  const e = String(email || '').toLowerCase().trim();
  const at = e.lastIndexOf('@');
  if (at < 0) return e;
  return CONFIG.ALLOWED_DOMAINS.includes(e.slice(at + 1)) ? e.slice(0, at) : e;
}
/** 이 사람이 그 멤버의 개인 체크리스트를 볼 수 있는지. 개인 목록이 아닌 멤버는 모두 볼 수 있음 */
function canSeeChecks_(owner, user) {
  const p = (CONFIG.PRIVATE_CHECKLISTS || {})[checkOwner_(owner)];
  if (!p) return true;
  const me = emailKey_(user.email);
  const keys = (p.emails || []).concat(p.viewers || []).map(emailKey_);
  if (keys.includes(me)) return true;
  if (!(p.emails || []).length) return (p.names || []).includes(String(user.name || '').trim());
  return false;
}
/** 이 줄을 볼 수 있는지: 프로젝트 항목은 모두, 개인 항목은 담당이 개인 목록이면 본인만 */
function canSeeRow_(o, user) {
  if (o.project) return true;
  return ownerList_(o.owner).every(n => canSeeChecks_(n, user));
}
/** 이 사람에게 탭을 숨길 멤버 */
function hiddenMembers_(user) {
  return Object.keys(CONFIG.PRIVATE_CHECKLISTS || {}).filter(n => !canSeeChecks_(n, user));
}

/** 목록. 볼 수 없는 개인 항목과 끝낸 지 30일이 넘은 개인 '할 일'은 빼고 돌려줌 (시트에는 남음)
 *  프로젝트 항목은 진행률을 세야 하므로 오래되어도 돌려줌 */
function listChecks_(user) {
  const cutoff = Utilities.formatDate(new Date(Date.now() - 30 * 86400000), CONFIG.TZ, 'yyyy-MM-dd');
  return checkRows_(checkSheet_())
    .filter(o => canSeeRow_(o, user))
    .map(o => { delete o.email; return o; })
    .filter(o => o.id && o.text && (o.project || !(o.repeat === 'once' && o.doneAt && o.doneAt.slice(0, 10) < cutoff)));
}

function listProjects_() {
  return projectRows_().map(o => { delete o.email; return o; });
}

/** 체크리스트·프로젝트 응답 한 벌 */
function checkData_(user) {
  return { checks: listChecks_(user), projects: listProjects_(), hide: hiddenMembers_(user) };
}

/** op: add / update / toggle / delete */
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
  const ownRow = id => { const row = findRow(id); if (row < 0) return -1; return canSeeRow_(readRow(row), user) ? row : -1; };
  const writeRow = (row, o) => sh.getRange(row, 1, 1, CHECK_COLS.length).setNumberFormat('@').setValues([CHECK_COLS.map(k => o[k] == null ? '' : String(o[k]))]);

  if (op === 'delete') {
    const row = ownRow(b.id);
    if (row > 0) sh.deleteRow(row);
    return;
  }
  if (op === 'toggle') {
    const row = ownRow(b.id);
    if (row < 0) throw new Error(gone);
    const o = readRow(row);
    if (b.done) { o.doneAt = now_(); o.doneBy = who; } else { o.doneAt = ''; o.doneBy = ''; }
    writeRow(row, o);
    return;
  }

  const project = String(b.project || '').trim();
  const owners = ownerList_(b.owners != null ? b.owners : b.owner);
  const text = String(b.text || '').trim().slice(0, 200);
  const repeat = CHECK_REPEATS.indexOf(b.repeat) >= 0 ? b.repeat : 'once';
  const order = Number(b.order) || 0;
  const due = /^\d{4}-\d{2}-\d{2}$/.test(String(b.due || '')) ? String(b.due) : '';
  if (!owners.length) throw new Error('담당 멤버가 필요합니다');
  if (!text) throw new Error('내용을 적어 주세요');
  if (project) {
    if (!projectRows_().some(p => p.id === project)) throw new Error('프로젝트를 찾지 못했습니다. 새로 고침해 주세요');
  } else {
    // 개인 항목은 한 명만. 개인 목록인 멤버에게는 본인만 넣을 수 있음
    if (owners.length > 1) throw new Error('담당을 여러 명 두는 항목은 프로젝트 안에서만 만들 수 있습니다');
    if (!canSeeChecks_(owners[0], user)) throw new Error(owners[0] + '님의 체크리스트에는 넣을 수 없습니다');
  }
  const owner = owners.join(', ');

  if (op === 'add') {
    const o = { id: Utilities.getUuid().slice(0, 8), owner, text, repeat, doneAt: '', doneBy: '', order,
      author: who, email: user.email, createdAt: now_(), updatedAt: '', project, due };
    writeRow(sh.getLastRow() + 1, o);
    return;
  }
  if (op === 'update') {
    const row = ownRow(b.id);
    if (row < 0) throw new Error(gone);
    const o = readRow(row);
    // 반복 종류가 바뀌면 끝낸 기록은 새로 시작
    if (o.repeat !== repeat) { o.doneAt = ''; o.doneBy = ''; }
    Object.assign(o, { owner, text, repeat, order, project, due, updatedAt: now_() });
    writeRow(row, o);
    return;
  }
  throw new Error('unknown op');
}

/** 프로젝트 op: add / update / delete. 지우면 그 프로젝트의 항목도 함께 지움 */
function saveProject_(b, user) {
  const sh = projectSheet_();
  const op = String(b.op || '');
  const who = user.name || user.email;
  const findRow = id => {
    const last = sh.getLastRow();
    if (!id || last < 2) return -1;
    const ids = sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0]));
    const i = ids.indexOf(String(id));
    return i < 0 ? -1 : i + 2;
  };
  const writeRow = (row, o) => sh.getRange(row, 1, 1, PROJ_COLS.length).setNumberFormat('@').setValues([PROJ_COLS.map(k => o[k] == null ? '' : String(o[k]))]);

  if (op === 'delete') {
    const row = findRow(b.id);
    if (row > 0) sh.deleteRow(row);
    // 그 프로젝트의 항목 줄을 아래에서부터 지움
    const csh = checkSheet_();
    const last = csh.getLastRow();
    if (last >= 2) {
      const pi = CHECK_COLS.indexOf('project');
      const vals = csh.getRange(2, pi + 1, last - 1, 1).getValues();
      for (let i = vals.length - 1; i >= 0; i--) if (String(vals[i][0]) === String(b.id)) csh.deleteRow(i + 2);
    }
    return;
  }

  const name = String(b.name || '').trim().slice(0, 60);
  const lead = checkOwner_(String(b.lead || '').slice(0, 40));
  const due = /^\d{4}-\d{2}-\d{2}$/.test(String(b.due || '')) ? String(b.due) : '';
  const status = PROJ_STATUS.indexOf(b.status) >= 0 ? b.status : 'active';
  const memo = String(b.memo || '').replace(/\r/g, '').trim().slice(0, 1000);
  const order = Number(b.order) || 0;
  if (!name) throw new Error('프로젝트 이름을 적어 주세요');

  if (op === 'add') {
    const o = { id: 'p' + Utilities.getUuid().slice(0, 7), name, lead, due, status, memo, order,
      author: who, email: user.email, createdAt: now_(), updatedAt: '' };
    writeRow(sh.getLastRow() + 1, o);
    return o.id;
  }
  if (op === 'update') {
    const row = findRow(b.id);
    if (row < 0) throw new Error('이미 지워진 프로젝트입니다. 새로 고침해 주세요');
    const cur = sh.getRange(row, 1, 1, PROJ_COLS.length).getValues()[0];
    const o = {}; PROJ_COLS.forEach((k, i) => o[k] = noteCell_(cur[i], k));
    Object.assign(o, { name, lead, due, status, memo, order, updatedAt: now_() });
    writeRow(row, o);
    return o.id;
  }
  throw new Error('unknown op');
}

// ───────────────────────────── 고객관리 (고객·고객로그 탭) ─────────────────────────────
// 고객 탭: 한 줄 = 구매 건 하나. 고객로그 탭: 새 건을 넣거나 단계·현재 상황·확인 필요가 바뀔 때마다 한 줄
// 고객 정보는 로그인한 직원에게만 돌려줌 (포털 코드가 있는 GitHub 리포지토리에는 고객 정보를 두지 않음)

function crmSheet_() {
  const ss = indexSs_();
  let sh = ss.getSheetByName('고객');
  if (!sh) {
    sh = ss.insertSheet('고객');
    sh.getRange(1, 1, 1, CRM_HEADERS.length).setValues([CRM_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), CRM_COLS.length).setNumberFormat('@');
  }
  return sh;
}

function crmLogSheet_() {
  const ss = indexSs_();
  let sh = ss.getSheetByName('고객로그');
  if (!sh) {
    sh = ss.insertSheet('고객로그');
    sh.getRange(1, 1, 1, CRM_LOG_HEADERS.length).setValues([CRM_LOG_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), CRM_LOG_COLS.length).setNumberFormat('@');
  }
  return sh;
}

function crmRows_(sh) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, CRM_COLS.length).getValues()
    .map(r => { const o = {}; CRM_COLS.forEach((k, i) => o[k] = noteCell_(r[i], k)); return o; })
    .filter(o => o.id && o.name);
}

function crmLogRows_() {
  const sh = crmLogSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, CRM_LOG_COLS.length).getValues()
    .map(r => { const o = {}; CRM_LOG_COLS.forEach((k, i) => o[k] = noteCell_(r[i], k)); return o; })
    .filter(o => o.cid);
}

/** 고객관리 응답 한 벌. 기록은 최근 2년치만 (시트에는 모두 남음) */
function crmData_() {
  const cutoff = Utilities.formatDate(new Date(Date.now() - 730 * 86400000), CONFIG.TZ, 'yyyy-MM-dd');
  return {
    customers: crmRows_(crmSheet_()).map(o => { delete o.email; return o; }),
    crmLogs: crmLogRows_().filter(l => String(l.at).slice(0, 10) >= cutoff),
    // 고객 상세 화면의 '견적' 묶음용 요약 (품목은 빼고)
    quotes: quoteRows_().filter(q => q.cid).map(q => ({ id: q.id, no: q.no, cid: q.cid, title: q.title, total: q.total, status: q.status, at: q.updatedAt || q.createdAt })),
  };
}

/** 포털에서 온 값 확인 */
function crmInput_(b) {
  const name = String(b.name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!name) throw new Error('고객 이름을 적어 주세요');
  const amount = String(b.amount == null ? '' : b.amount).replace(/[^\d]/g, '').slice(0, 13);
  return {
    name,
    info: String(b.info || '').trim().slice(0, 100),
    group: CRM_GROUPS.indexOf(b.group) >= 0 ? b.group : CRM_GROUPS[CRM_GROUPS.length - 1],
    item: String(b.item || '').trim().slice(0, 120),
    stage: CRM_STAGES.indexOf(b.stage) >= 0 ? b.stage : '문의',
    memo: String(b.memo || '').replace(/\r/g, '').trim().slice(0, 2000),
    flag: String(b.flag || '').trim().slice(0, 60),
    owner: checkOwner_(String(b.owner || '').slice(0, 40)),
    amount,
  };
}

/** op: add / update / delete / bulk(rows: [{ id 있으면 고침, 없으면 새로 }]). add 는 새 ID를 돌려줌 */
function saveCrm_(b, user) {
  const sh = crmSheet_(), lsh = crmLogSheet_();
  const op = String(b.op || '');
  const who = user.name || user.email;
  const findRow = id => {
    const last = sh.getLastRow();
    if (!id || last < 2) return -1;
    const ids = sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0]));
    const i = ids.indexOf(String(id));
    return i < 0 ? -1 : i + 2;
  };
  const writeRow = (row, o) => sh.getRange(row, 1, 1, CRM_COLS.length).setNumberFormat('@').setValues([CRM_COLS.map(k => o[k] == null ? '' : String(o[k]))]);
  const readRow = row => { const cur = sh.getRange(row, 1, 1, CRM_COLS.length).getValues()[0]; const o = {}; CRM_COLS.forEach((k, i) => o[k] = noteCell_(cur[i], k)); return o; };
  const logs = [];
  const log = o => logs.push({ id: Utilities.getUuid().slice(0, 8), cid: o.id, name: o.name, stage: o.stage, memo: o.memo, flag: o.flag, by: who, at: now_() });

  const upsert = d => {
    const v = crmInput_(d);
    const row = d.id ? findRow(d.id) : -1;
    if (d.id && row < 0) throw new Error('이미 지워진 고객입니다. 새로 고침해 주세요');
    if (row < 0) {
      const o = Object.assign({ id: 'c' + Utilities.getUuid().slice(0, 7) }, v,
        { stageAt: now_(), author: who, email: user.email, createdAt: now_(), updatedAt: '' });
      writeRow(sh.getLastRow() + 1, o);
      log(o);
      return o.id;
    }
    const o = readRow(row);
    const changed = o.stage !== v.stage || o.memo !== v.memo || o.flag !== v.flag;
    if (o.stage !== v.stage) o.stageAt = now_();
    Object.assign(o, v, { updatedAt: now_() });
    writeRow(row, o);
    if (changed) log(o);
    return o.id;
  };

  let out = '';
  if (op === 'delete') {
    const row = findRow(b.id);
    if (row > 0) sh.deleteRow(row);
    // 그 고객의 기록도 아래에서부터 지움
    const last = lsh.getLastRow();
    if (last >= 2) {
      const ci = CRM_LOG_COLS.indexOf('cid');
      const vals = lsh.getRange(2, ci + 1, last - 1, 1).getValues();
      for (let i = vals.length - 1; i >= 0; i--) if (String(vals[i][0]) === String(b.id)) lsh.deleteRow(i + 2);
    }
    return '';
  }
  if (op === 'add' || op === 'update') out = upsert(op === 'add' ? Object.assign({}, b, { id: '' }) : b);
  else if (op === 'bulk') {
    const rows = Array.isArray(b.rows) ? b.rows.slice(0, 200) : [];
    if (!rows.length) throw new Error('저장할 고객이 없습니다');
    // 그 사이 지워진 고객을 가리키는 줄은 새 고객으로 넣음 (한 줄 때문에 나머지가 저장되지 않는 일이 없게)
    rows.forEach(r => upsert(r.id && findRow(r.id) < 0 ? Object.assign({}, r, { id: '' }) : r));
    out = String(rows.length);
  } else throw new Error('unknown op');

  if (logs.length) {
    lsh.getRange(lsh.getLastRow() + 1, 1, logs.length, CRM_LOG_COLS.length).setNumberFormat('@')
      .setValues(logs.map(l => CRM_LOG_COLS.map(k => String(l[k] == null ? '' : l[k]))));
  }
  return out;
}

// ───────────────────────────── 견적 (견적 탭) ─────────────────────────────
// 한 줄 = 견적 하나. 품목은 [{ cat, name, spec, code, qty, price }] JSON 으로 '품목' 칸에 들어감
// 금액(합계·견적 금액)은 포털이 보낸 값이 아니라 여기서 품목으로 다시 계산해 저장함
// 고객 건(cid)에 연결하면 저장할 때 고객관리 단계·기록을 함께 고침 (quoteLinkCrm_)

function quoteSheet_() {
  const ss = indexSs_();
  let sh = ss.getSheetByName('견적');
  if (!sh) {
    sh = ss.insertSheet('견적');
    sh.getRange(1, 1, 1, QUOTE_HEADERS.length).setValues([QUOTE_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), QUOTE_COLS.length).setNumberFormat('@');
  }
  return sh;
}

function quoteRows_() {
  const sh = quoteSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, QUOTE_COLS.length).getValues()
    .map(r => { const o = {}; QUOTE_COLS.forEach((k, i) => o[k] = noteCell_(r[i], k === 'valid' ? 'date' : k)); return o; })
    .filter(o => o.id);
}

const wonText_ = n => String(Math.round(+n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '원';

/** 견적 응답 한 벌: 견적 목록(품목 포함) + 고객 건 고르기용 고객 요약 */
function quoteData_() {
  const quotes = quoteRows_().map(q => {
    let items = [];
    try { items = JSON.parse(q.items || '[]'); } catch (e) { items = []; }
    delete q.email;
    return Object.assign(q, { items });
  });
  const customers = crmRows_(crmSheet_()).map(c => ({ id: c.id, name: c.name, info: c.info, group: c.group, item: c.item, stage: c.stage, owner: c.owner }));
  return { quotes, customers };
}

/** 포털에서 온 견적 확인. 금액은 품목으로 다시 계산 */
function quoteInput_(b) {
  const name = String(b.name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!name) throw new Error('고객 이름을 적어 주세요');
  const int = v => { const n = Math.round(Number(String(v == null ? '' : v).replace(/[^\d.\-]/g, ''))); return isFinite(n) ? n : 0; };
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 80).map(it => {
    const qty = Math.max(0, Math.min(9999, Math.round((Number(it.qty) || 0) * 100) / 100));
    return {
      cat: QUOTE_CATS.indexOf(it.cat) >= 0 ? it.cat : '기타',
      name: String(it.name || '').replace(/\s+/g, ' ').trim().slice(0, 120),
      spec: String(it.spec || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      code: String(it.code || '').trim().slice(0, 40),
      qty: qty || 1,
      price: Math.max(-1e9, Math.min(1e10, int(it.price))),
    };
  }).filter(it => it.name);
  const subtotal = items.reduce((m, it) => m + Math.round(it.qty * it.price), 0);
  const discount = Math.max(0, Math.min(Math.max(subtotal, 0), int(b.discount)));
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(String(b.valid || '')) ? String(b.valid) : '';
  return {
    cid: String(b.cid || '').trim().slice(0, 20),
    name,
    title: String(b.title || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    items: JSON.stringify(items),
    subtotal: String(subtotal), discount: String(discount), total: String(subtotal - discount),
    memo: String(b.memo || '').replace(/\r/g, '').trim().slice(0, 2000),
    note: String(b.note || '').replace(/\r/g, '').trim().slice(0, 2000),
    valid,
    status: QUOTE_STATUS.indexOf(b.status) >= 0 ? b.status : QUOTE_STATUS[0],
    owner: checkOwner_(String(b.owner || '').slice(0, 40)),
  };
}

/** op: save(id 없으면 새로) / status(상태만) / delete. save 는 견적 ID를 돌려줌 */
function saveQuote_(b, user) {
  const sh = quoteSheet_();
  const op = String(b.op || '');
  const who = user.name || user.email;
  const findRow = id => {
    const last = sh.getLastRow();
    if (!id || last < 2) return -1;
    const ids = sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0]));
    const i = ids.indexOf(String(id));
    return i < 0 ? -1 : i + 2;
  };
  const writeRow = (row, o) => sh.getRange(row, 1, 1, QUOTE_COLS.length).setNumberFormat('@').setValues([QUOTE_COLS.map(k => o[k] == null ? '' : String(o[k]))]);
  const readRow = row => { const cur = sh.getRange(row, 1, 1, QUOTE_COLS.length).getValues()[0]; const o = {}; QUOTE_COLS.forEach((k, i) => o[k] = noteCell_(cur[i], k === 'valid' ? 'date' : k)); return o; };

  if (op === 'delete') {
    const row = findRow(b.id);
    if (row > 0) sh.deleteRow(row);
    return '';
  }
  if (op === 'status') {
    const row = findRow(b.id);
    if (row < 0) throw new Error('이미 지워진 견적입니다. 새로 고침해 주세요');
    if (QUOTE_STATUS.indexOf(b.status) < 0) throw new Error('알 수 없는 상태입니다');
    const o = readRow(row);
    Object.assign(o, { status: b.status, updatedAt: now_() });
    writeRow(row, o);
    return o.id;
  }
  if (op !== 'save') throw new Error('unknown op');

  const v = quoteInput_(b);
  let row = b.id ? findRow(b.id) : -1;
  if (b.id && row < 0) throw new Error('이미 지워진 견적입니다. 새로 고침해 주세요');
  let o, isNew = false, prevCid = '';
  if (row < 0) {
    isNew = true;
    o = Object.assign({ id: 'q' + Utilities.getUuid().slice(0, 7), no: nextQuoteNo_(sh) }, v,
      { author: who, email: user.email, createdAt: now_(), updatedAt: '' });
    row = sh.getLastRow() + 1;
  } else {
    o = readRow(row);
    prevCid = o.cid;
    Object.assign(o, v, { updatedAt: now_() });
  }
  writeRow(row, o);
  // 처음 연결했을 때(새 견적이거나 고객 건을 새로 고른 경우) 고객관리에 기록
  if (o.cid) quoteLinkCrm_(o, isNew || prevCid !== o.cid, who);
  return o.id;
}

/** 견적 번호: Q + 오늘 날짜(yyMMdd) + 그날 순번. 예: Q261108-01 */
function nextQuoteNo_(sh) {
  const prefix = 'Q' + Utilities.formatDate(new Date(), CONFIG.TZ, 'yyMMdd') + '-';
  const last = sh.getLastRow();
  let n = 0;
  if (last >= 2) {
    sh.getRange(2, QUOTE_COLS.indexOf('no') + 1, last - 1, 1).getValues().forEach(r => {
      const s = String(r[0]);
      if (s.indexOf(prefix) === 0) n = Math.max(n, parseInt(s.slice(prefix.length), 10) || 0);
    });
  }
  return prefix + ('0' + (n + 1)).slice(-2);
}

/** 견적을 고객 건에 연결: 단계가 문의·상담이면 '견적'으로, 브랜드·모델이 비어 있으면 견적 제목으로 채우고, 처음 연결할 때 기록을 남김 */
function quoteLinkCrm_(q, first, who) {
  const sh = crmSheet_();
  const last = sh.getLastRow();
  if (last < 2) return;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0]));
  const i = ids.indexOf(String(q.cid));
  if (i < 0) return;
  const row = i + 2;
  const cur = sh.getRange(row, 1, 1, CRM_COLS.length).getValues()[0];
  const c = {}; CRM_COLS.forEach((k, j) => c[k] = noteCell_(cur[j], k));
  const si = CRM_STAGES.indexOf(c.stage), qi = CRM_STAGES.indexOf('견적');
  const moved = si >= 0 && si < qi;
  if (!moved && !first && c.item) return;
  if (moved) { c.stage = '견적'; c.stageAt = now_(); }
  if (!c.item && q.title) c.item = q.title;
  c.updatedAt = now_();
  sh.getRange(row, 1, 1, CRM_COLS.length).setNumberFormat('@').setValues([CRM_COLS.map(k => c[k] == null ? '' : String(c[k]))]);
  if (moved || first) {
    const lsh = crmLogSheet_();
    const memo = `견적서 ${q.no}${q.title ? ' ' + q.title : ''}, ${wonText_(q.total)}`;
    const l = { id: Utilities.getUuid().slice(0, 8), cid: c.id, name: c.name, stage: c.stage, memo, flag: c.flag, by: who, at: now_() };
    lsh.getRange(lsh.getLastRow() + 1, 1, 1, CRM_LOG_COLS.length).setNumberFormat('@').setValues([CRM_LOG_COLS.map(k => String(l[k] == null ? '' : l[k]))]);
  }
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

/** 한 달치 일정. { month, start, end, calendars:[{id,name,color}], events:[…] }
 *  fresh: 일정을 바꾼 직후. 캐시를 읽지도 쓰지도 않음 (바뀌기 전 목록이 2분 동안 남지 않게) */
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
