/**
 * My Rubi 상담 백엔드 (Google Apps Script 웹앱)
 *
 * 역할
 *  - 00_My Rubi Index 시트를 읽어 포털에 상담 현황을 돌려줌 (GET)
 *  - 포털에서 들어온 상담 입력을 Drive 고객 폴더 + Log 시트 + Index 시트에 기록함 (POST)
 *
 * Drive 구조 (기존 그대로 유지)
 *  루트 / 브랜드 폴더 / Customer History_브랜드 / NNNN_[BRAND] MODEL (SPEC)_채널_고객명_YYYYMMDD /
 *     Log_… (스프레드시트: 마스터, 단계별 스냅샷 탭, 조립 DB)
 *     Order_… (스프레드시트, 수동)
 *     NNNN_Customer Pack (폴더)
 *     NNNN_Internal Reference (폴더)
 *
 * 배포: 확장 프로그램 > Apps Script > 배포 > 새 배포 > 웹 앱
 *   실행 사용자: 나 / 액세스: 모든 사용자 (직원 로그인 세션 토큰으로 보호)
 *
 * 로그인
 *  - 계정은 Index 스프레드시트의 '사용자' 탭에 있음 (비밀번호는 솔트+SHA-256 해시로만 저장)
 *  - login 성공 시 세션 토큰 발급 → 이후 모든 요청에 token 필요
 *  - 관리자(admin)는 포털의 '사용자 관리' 앱에서 계정 추가·권한·비활성·비밀번호 초기화
 */

// ───────────────────────────── 설정 ─────────────────────────────

const CONFIG = {
  // 고객 출고 기록 루트 폴더
  ROOT_FOLDER_ID: '1nNNZEw7Pn7a186FraNtmodHsIwtncfH4',

  // 00_My Rubi Index 스프레드시트 ID (setupIndex() 실행 후 채우거나, 자동 생성됨)
  INDEX_SHEET_ID: '1wkogYTTI26ha1YsYu35pOLSBFSxIRok58qYRqRw18mA',

  // 공통 Log 템플릿 (브랜드별 template이 없을 때 사용). 비워두면 Moulton 템플릿을 씀.
  LOG_TEMPLATE_ID: '1Nvo-wZvNcwV0mDnD_0ryyS-2luQIIuw06TiB6F2R5u4',

  // 로그인 세션 유지 시간 (시간 단위). '로그인 상태 유지' 체크 시 REMEMBER 적용
  SESSION_HOURS: 12,
  SESSION_HOURS_REMEMBER: 24 * 30,
  // 비밀번호 5회 틀리면 10분 잠금
  MAX_FAILS: 5,
  LOCK_MINUTES: 10,

  // 브랜드 코드 → 브랜드 폴더 정보
  //  name: 브랜드 폴더명 / short: 고객 폴더명·Log 파일명에 쓰는 표기 / history: Customer History 폴더 ID
  //  template: 그 브랜드의 00_Log 템플릿 시트 ID (Customer History 폴더 직속에 있는 것)
  BRANDS: {
    MOULTON: { name: 'Moulton Bicycles Korea', short: 'Moulton',     history: '1SbKhJuuKRL1949Yt1Mf_uLkCkXswSa0v', template: '1Nvo-wZvNcwV0mDnD_0ryyS-2luQIIuw06TiB6F2R5u4' },
    BASTION: { name: 'Bastion Cycles Korea',   short: 'Bastion',     history: '1ZhqwLDJWq6AXoV0jJX68VQ22GM7S3qW_', template: '' },
    TSUBASA: { name: 'Tsubasa Bicycles Korea', short: 'Tsubasa',     history: '1ImvEyweCPaxYuXcycqbFArSmMLwrmfbq', template: '' },
    PARLEE:  { name: 'Parlee Cycles Korea',    short: 'Parlee',      history: '1S_5pvW1Y9ZJdaGYR634RnpjEEVQl7s2M', template: '' },
    SURLY:   { name: 'Surly bike',             short: 'Surly',       history: '17I7S6j8c76n_j6HVJl8sfM0Bjqsl-QxI', template: '1ODtybMEaNDvoaNXBAKzryBaz7HULk1qKBe4Sk4mer_A' },
    CRUST:   { name: 'Crust Bike',             short: 'Crust Bike',  history: '1rwke-NYJJ0XWdCW126xRW0RX0TpTQRoq', template: '1oH9BBGmH83TIATfQeCZW7Kj2oGmbuWtp5RyucXkzUWg' },
    'VELO ORANGE': { name: 'Velo Orange',      short: 'Velo Orange', history: '1HNZe7h7n2RBCPcKM0HXUmof4vZnyHmKd', template: '1veVXewR3Oh6HwSbQlkvy-3FfZVZrJo3UI6x5w2j0ZsE' },
    PASHLEY: { name: 'Pashley Cycles',         short: 'Pashley',     history: '', template: '' },
    OTHER:   { name: '00. 아카이브',            short: 'Other',       history: '1HAOI5e_hvNEtIPvQwEq9zMAX23J8wEZT', template: '' },
  },

  // 상담 단계 (순서 고정)
  STAGES: ['문의', '상담', '견적', '계약금', '예약금', '발주', '입고', '조립', '출고', '루비케어'],

  // 채널
  CHANNELS: ['루비워크샵', '루비서플라이', '스마트스토어', '기타'],

  TZ: 'Asia/Seoul',
};

// Index 시트 컬럼 (순서 = 열 순서)
const INDEX_COLS = [
  'no', 'ref', 'brand', 'model', 'spec', 'channel', 'customer', 'manager', 'stage',
  '문의', '상담', '견적', '계약금', '예약금', '발주', '입고', '조립', '출고', '루비케어',
  'folderId', 'folderUrl', 'logSheetId', 'memo', 'updatedAt',
];
const INDEX_HEADERS = [
  'No', '고유번호', '브랜드', '모델', '사양', '채널', '고객명', '담당자', '현재 단계',
  '문의', '상담', '견적', '계약금', '예약금', '발주', '입고', '조립', '출고', '루비케어',
  '폴더 ID', '폴더 링크', 'Log 시트 ID', '메모', '최근 업데이트',
];

// 상담 기록 탭 컬럼
const CONSULT_HEADERS = ['일시', 'No', '고객명', '브랜드', '단계', '내용', '금액', '결제수단', '담당자'];

// ───────────────────────────── HTTP ─────────────────────────────

function doGet(e) {
  try {
    const p = e.parameter || {};
    const u = auth_(p.token);

    switch (p.action) {
      case 'me':       return json_({ ok: true, user: publicUser_(u) });
      case 'list':     return json_({ ok: true, stages: CONFIG.STAGES, channels: CONFIG.CHANNELS, brands: Object.keys(CONFIG.BRANDS), rows: listIndex_() });
      case 'get':      return json_({ ok: true, row: getRow_(p.no), consults: listConsults_(p.no) });
      case 'consults': return json_({ ok: true, rows: listConsults_(p.no) });
      case 'users':    requireAdmin_(u); return json_({ ok: true, users: listUsers_().map(publicUser_) });
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

    // 로그인은 토큰 없이 허용
    if (body.action === 'login') return json_(Object.assign({ ok: true }, login_(body)));

    const u = auth_(body.token);
    // 작성자(로그인한 사람) 기록용. 담당자 미입력 시 작성자로 대체
    body.by = u.name;

    switch (body.action) {
      case 'logout':   logout_(body.token); return json_({ ok: true });
      case 'password': changePassword_(u, body); return json_({ ok: true, user: publicUser_(findUser_(u.id)) });
      case 'create':   return json_({ ok: true, row: createCustomer_(body) });
      case 'stage':    return json_({ ok: true, row: advanceStage_(body) });
      case 'consult':  return json_({ ok: true, row: addConsult_(body) });
      case 'update':   return json_({ ok: true, row: updateRow_(body) });
      case 'users.add':    requireAdmin_(u); return json_(Object.assign({ ok: true }, addUser_(body)));
      case 'users.update': requireAdmin_(u); return json_(Object.assign({ ok: true }, updateUser_(u, body)));
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

// ───────────────────────────── 로그인 / 사용자 ─────────────────────────────

const USER_HEADERS = ['아이디', '이름', '권한', '비밀번호해시', '솔트', '활성', '비밀번호변경필요', '최근 로그인'];
const ROLES = ['admin', 'staff'];

function usersSheet_() {
  const ss = indexSs_();
  let sh = ss.getSheetByName('사용자');
  if (!sh) {
    sh = ss.insertSheet('사용자');
    sh.getRange(1, 1, 1, USER_HEADERS.length).setValues([USER_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function listUsers_() {
  const sh = usersSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, USER_HEADERS.length).getValues()
    .map((r, i) => ({
      row: i + 2, id: String(r[0]).trim(), name: String(r[1]).trim(), role: ROLES.includes(r[2]) ? r[2] : 'staff',
      hash: String(r[3]), salt: String(r[4]),
      active: r[5] === true || String(r[5]).toUpperCase() === 'TRUE' || r[5] === 'Y',
      mustChange: r[6] === true || String(r[6]).toUpperCase() === 'TRUE' || r[6] === 'Y',
      lastLogin: r[7] instanceof Date ? Utilities.formatDate(r[7], CONFIG.TZ, 'yyyy-MM-dd HH:mm') : String(r[7] || ''),
    }))
    .filter(u => u.id);
}

function findUser_(id) {
  id = String(id || '').trim().toLowerCase();
  return listUsers_().find(u => u.id.toLowerCase() === id) || null;
}

function publicUser_(u) {
  return { id: u.id, name: u.name, role: u.role, active: u.active, mustChange: u.mustChange, lastLogin: u.lastLogin };
}

function writeUser_(u) {
  usersSheet_().getRange(u.row, 1, 1, USER_HEADERS.length)
    .setValues([[u.id, u.name, u.role, u.hash, u.salt, u.active, u.mustChange, u.lastLogin || '']]);
}

function hash_(salt, pw) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + pw, Utilities.Charset.UTF_8);
  return bytes.map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
}

function randomString_(len, chars) {
  chars = chars || 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  while (s.length < len) {
    const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Math.random());
    for (const b of bytes) { if (s.length >= len) break; s += chars[((b + 256) % 256) % chars.length]; }
  }
  return s;
}

function login_(b) {
  const id = String(b.id || '').trim();
  const pw = String(b.password || '');
  if (!id || !pw) throw new Error('아이디와 비밀번호를 입력하세요');

  const cache = CacheService.getScriptCache();
  const failKey = 'fail_' + id.toLowerCase();
  const fails = parseInt(cache.get(failKey) || '0', 10);
  if (fails >= CONFIG.MAX_FAILS) throw new Error('로그인 시도가 많아 ' + CONFIG.LOCK_MINUTES + '분간 잠겼습니다');

  const u = findUser_(id);
  if (!u || !u.active || !u.hash || hash_(u.salt, pw) !== u.hash) {
    cache.put(failKey, String(fails + 1), CONFIG.LOCK_MINUTES * 60);
    throw new Error('아이디 또는 비밀번호가 맞지 않습니다');
  }
  cache.remove(failKey);

  purgeSessions_();
  const token = Utilities.getUuid().replace(/-/g, '') + randomString_(16);
  const hours = b.remember ? CONFIG.SESSION_HOURS_REMEMBER : CONFIG.SESSION_HOURS;
  PropertiesService.getScriptProperties().setProperty('s_' + token, JSON.stringify({ id: u.id, exp: Date.now() + hours * 3600e3 }));

  u.lastLogin = now_();
  writeUser_(u);
  return { token, user: publicUser_(u) };
}

function auth_(token) {
  if (!token) throw new Error('unauthorized');
  const raw = PropertiesService.getScriptProperties().getProperty('s_' + token);
  if (!raw) throw new Error('unauthorized');
  const s = JSON.parse(raw);
  if (s.exp < Date.now()) { logout_(token); throw new Error('unauthorized'); }
  const u = findUser_(s.id);
  if (!u || !u.active) { logout_(token); throw new Error('unauthorized'); }
  return u;
}

function requireAdmin_(u) {
  if (u.role !== 'admin') throw new Error('관리자만 사용할 수 있습니다');
}

function logout_(token) {
  if (token) PropertiesService.getScriptProperties().deleteProperty('s_' + token);
}

/** 만료된 세션 정리, 특정 사용자의 세션 전부 종료(userId 지정 시) */
function purgeSessions_(userId) {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  const now = Date.now();
  Object.keys(all).forEach(k => {
    if (k.indexOf('s_') !== 0) return;
    try {
      const s = JSON.parse(all[k]);
      if (s.exp < now || (userId && String(s.id).toLowerCase() === String(userId).toLowerCase())) props.deleteProperty(k);
    } catch (e) { props.deleteProperty(k); }
  });
}

function checkPasswordRule_(pw) {
  if (String(pw).length < 8) throw new Error('비밀번호는 8자 이상이어야 합니다');
}

/** body: { current, next } */
function changePassword_(u, b) {
  if (!u.mustChange && hash_(u.salt, String(b.current || '')) !== u.hash) throw new Error('현재 비밀번호가 맞지 않습니다');
  checkPasswordRule_(b.next);
  if (hash_(u.salt, String(b.next)) === u.hash) throw new Error('이전과 다른 비밀번호를 입력하세요');
  u.salt = randomString_(16);
  u.hash = hash_(u.salt, String(b.next));
  u.mustChange = false;
  writeUser_(u);
}

/** body: { id, name, role } → 임시 비밀번호 발급 (첫 로그인 시 변경 강제) */
function addUser_(b) {
  const id = String(b.id || '').trim();
  if (!/^[A-Za-z0-9._-]{3,30}$/.test(id)) throw new Error('아이디는 영문·숫자·._- 3~30자');
  if (findUser_(id)) throw new Error('이미 있는 아이디입니다');
  if (!b.name) throw new Error('이름을 입력하세요');
  const temp = randomString_(10);
  const salt = randomString_(16);
  usersSheet_().appendRow([id, String(b.name).trim(), ROLES.includes(b.role) ? b.role : 'staff', hash_(salt, temp), salt, true, true, '']);
  return { user: publicUser_(findUser_(id)), tempPassword: temp };
}

/** body: { id, name?, role?, active?, resetPassword? } */
function updateUser_(me, b) {
  const u = findUser_(b.id);
  if (!u) throw new Error('사용자를 찾을 수 없습니다');
  const self = u.id.toLowerCase() === me.id.toLowerCase();
  if (self && (b.role !== undefined && b.role !== u.role || b.active === false)) throw new Error('본인 계정의 권한·활성 상태는 바꿀 수 없습니다');

  if (b.name !== undefined) u.name = String(b.name).trim() || u.name;
  if (b.role !== undefined && ROLES.includes(b.role)) u.role = b.role;
  if (b.active !== undefined) u.active = !!b.active;

  let tempPassword = null;
  if (b.resetPassword) {
    tempPassword = randomString_(10);
    u.salt = randomString_(16);
    u.hash = hash_(u.salt, tempPassword);
    u.mustChange = true;
  }
  writeUser_(u);
  if (!u.active || b.resetPassword) purgeSessions_(u.id);
  return { user: publicUser_(u), tempPassword };
}

/**
 * 편집기에서 직접 실행용: 관리자 계정이 하나도 없을 때 임시 관리자 생성.
 * 실행 로그에 아이디와 임시 비밀번호가 찍힘.
 */
function setupAdmin() {
  if (listUsers_().some(u => u.role === 'admin' && u.active)) { Logger.log('이미 관리자 계정이 있습니다.'); return; }
  const r = addUser_({ id: 'admin', name: '관리자', role: 'admin' });
  Logger.log('아이디: admin / 임시 비밀번호: ' + r.tempPassword);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ───────────────────────────── Index 시트 ─────────────────────────────

function indexSs_() {
  let id = CONFIG.INDEX_SHEET_ID || PropertiesService.getScriptProperties().getProperty('INDEX_SHEET_ID');
  if (!id) throw new Error('INDEX_SHEET_ID 없음. setupIndex()를 먼저 실행하세요.');
  return SpreadsheetApp.openById(id);
}

function indexSheet_() {
  return indexSs_().getSheetByName('Index');
}

function consultSheet_() {
  return indexSs_().getSheetByName('상담 기록');
}

/** 최초 1회: Index 스프레드시트 생성 */
function setupIndex() {
  const root = DriveApp.getFolderById(CONFIG.ROOT_FOLDER_ID);
  const ss = SpreadsheetApp.create('00_My Rubi Index');
  const file = DriveApp.getFileById(ss.getId());
  root.addFile(file);
  DriveApp.getRootFolder().removeFile(file);

  const idx = ss.getActiveSheet().setName('Index');
  idx.getRange(1, 1, 1, INDEX_HEADERS.length).setValues([INDEX_HEADERS]).setFontWeight('bold');
  idx.setFrozenRows(1);

  const c = ss.insertSheet('상담 기록');
  c.getRange(1, 1, 1, CONSULT_HEADERS.length).setValues([CONSULT_HEADERS]).setFontWeight('bold');
  c.setFrozenRows(1);

  PropertiesService.getScriptProperties().setProperty('INDEX_SHEET_ID', ss.getId());
  Logger.log('INDEX_SHEET_ID = ' + ss.getId());
  return ss.getId();
}

function listIndex_() {
  const sh = indexSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const vals = sh.getRange(2, 1, last - 1, INDEX_COLS.length).getValues();
  return vals.filter(r => r[0] !== '').map(rowToObj_);
}

function rowToObj_(r) {
  const o = {};
  INDEX_COLS.forEach((k, i) => {
    let v = r[i];
    if (v instanceof Date) v = Utilities.formatDate(v, CONFIG.TZ, 'yyyy-MM-dd');
    o[k] = v;
  });
  o.no = String(o.no).padStart(4, '0');
  return o;
}

function findRowIndex_(no) {
  const sh = indexSheet_();
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const nos = sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0]).padStart(4, '0'));
  const i = nos.indexOf(String(no).padStart(4, '0'));
  return i < 0 ? -1 : i + 2;
}

function getRow_(no) {
  const r = findRowIndex_(no);
  if (r < 0) throw new Error('No ' + no + ' 없음');
  return rowToObj_(indexSheet_().getRange(r, 1, 1, INDEX_COLS.length).getValues()[0]);
}

function writeRow_(rowIdx, obj) {
  obj.updatedAt = now_();
  const vals = INDEX_COLS.map(k => obj[k] === undefined || obj[k] === null ? '' : obj[k]);
  indexSheet_().getRange(rowIdx, 1, 1, INDEX_COLS.length).setValues([vals]);
  return obj;
}

function nextNo_() {
  const rows = listIndex_();
  const max = rows.reduce((m, r) => Math.max(m, parseInt(r.no, 10) || 0), 0);
  return String(max + 1).padStart(4, '0');
}

function now_() {
  return Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd HH:mm');
}
function today_(fmt) {
  return Utilities.formatDate(new Date(), CONFIG.TZ, fmt || 'yyyy-MM-dd');
}
function ymd_(dateStr, fmt) {
  // 'yyyy-MM-dd' → fmt
  const d = dateStr ? new Date(dateStr + 'T00:00:00+09:00') : new Date();
  return Utilities.formatDate(d, CONFIG.TZ, fmt);
}

// ───────────────────────────── 신규 상담 등록 ─────────────────────────────

/**
 * body: { brand, model, spec, channel, customer, manager, memo, stage?, date?, createFolder? }
 *  - stage 기본 '문의'
 *  - createFolder 기본 true: 폴더 + Log 시트 생성. false면 Index만 기록(초기 문의 단계용)
 */
function createCustomer_(b) {
  const brandKey = String(b.brand || '').toUpperCase();
  const brand = CONFIG.BRANDS[brandKey];
  if (!brand) throw new Error('알 수 없는 브랜드: ' + b.brand);
  if (!b.customer) throw new Error('고객명 필요');
  if (!b.model) throw new Error('모델 필요');

  const no = nextNo_();
  const stage = CONFIG.STAGES.includes(b.stage) ? b.stage : '문의';
  const date = b.date || today_();
  const channel = b.channel || '루비워크샵';

  const obj = {
    no, ref: b.ref || '', brand: brandKey, model: b.model, spec: b.spec || '', channel,
    customer: b.customer, manager: b.manager || b.by || '', stage,
    folderId: '', folderUrl: '', logSheetId: '', memo: b.memo || '',
  };
  CONFIG.STAGES.forEach(s => obj[s] = '');
  obj[stage] = date;
  // 앞선 단계도 같은 날짜로 채움 (예: 바로 상담 단계로 등록한 경우 문의일도 기록)
  for (const s of CONFIG.STAGES) { if (s === stage) break; obj[s] = date; }

  if (b.createFolder !== false) {
    const made = createCustomerFolder_(no, brandKey, obj, date);
    obj.folderId = made.folderId;
    obj.folderUrl = made.folderUrl;
    obj.logSheetId = made.logSheetId;
  }

  const sh = indexSheet_();
  const rowIdx = sh.getLastRow() + 1;
  writeRow_(rowIdx, obj);

  if (b.memo) appendConsult_(obj, stage, b.memo, '', '', b.by || obj.manager);
  return obj;
}

/** 현재 쓰시는 규칙: YYYYMMDD_고객명_브랜드_모델[_사양] */
function folderName_(no, brandKey, obj, dateStr) {
  const short = CONFIG.BRANDS[brandKey].short;
  return [ymd_(dateStr, 'yyyyMMdd'), obj.customer, short, obj.model + (obj.spec ? '_' + obj.spec : '')].join('_');
}
function logName_(brandKey, obj, dateStr) {
  const short = CONFIG.BRANDS[brandKey].short;
  return ['00_Log', obj.customer, short, obj.model, ymd_(dateStr, 'yyyyMMdd')].join('_');
}

function createCustomerFolder_(no, brandKey, obj, dateStr) {
  const brand = CONFIG.BRANDS[brandKey];
  let history;
  if (brand.history) {
    history = DriveApp.getFolderById(brand.history);
  } else {
    // 브랜드 폴더 아래 Customer History_ 폴더 찾거나 생성
    const root = DriveApp.getFolderById(CONFIG.ROOT_FOLDER_ID);
    const bf = getOrCreateFolder_(root, brand.name);
    history = getOrCreateFolder_(bf, 'Customer History_' + brand.name);
  }

  const name = folderName_(no, brandKey, obj, dateStr);
  const folder = history.createFolder(name);
  folder.createFolder(no + '_Customer Pack');
  folder.createFolder(no + '_Internal Reference');

  // Log 시트: 브랜드 템플릿(없으면 공통 템플릿) 복사
  const tplId = brand.template || CONFIG.LOG_TEMPLATE_ID;
  let logSheetId = '';
  if (tplId) {
    const copy = DriveApp.getFileById(tplId).makeCopy(logName_(brandKey, obj, dateStr), folder);
    logSheetId = copy.getId();
    fillLogMaster_(logSheetId, brandKey, obj, dateStr);
  }

  return { folderId: folder.getId(), folderUrl: folder.getUrl(), logSheetId };
}

function getOrCreateFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

// ───────────────────────────── Log 시트(마스터 탭) 조작 ─────────────────────────────

/** 마스터 탭에서 라벨 텍스트를 찾아 셀 위치 반환 */
function findCell_(sheet, text) {
  const f = sheet.createTextFinder(text).matchEntireCell(false).findNext();
  return f; // Range 또는 null
}

/**
 * 마스터 탭 채우기. 템플릿(00_Log_고객명_Moulton_TSR 9_20240101) 기준 위치:
 *   H4  날짜(yyyy.MM.dd)            A7  " 브랜드\n 모델\n 사양" (3줄)
 *   A13 고객명 (C13 라벨 '고객명')   A15 루비케어 보증 종료일
 *   A17 결제 요청 금액               E20:H20 결제 표 헤더 (결제 내용/날짜/금액/수단)
 *   B31 "브랜드 모델" 요약 (D31 'S/N:', E31 'F/N:')
 * 위치는 라벨을 찾아 상대적으로 정하므로 행이 약간 밀려도 동작함.
 */
function fillLogMaster_(logSheetId, brandKey, obj, dateStr) {
  const ss = SpreadsheetApp.openById(logSheetId);
  const m = ss.getSheetByName('마스터');
  if (!m) return;
  const brandUp = CONFIG.BRANDS[brandKey].short.toUpperCase();
  const modelUp = String(obj.model).toUpperCase();

  // 날짜: yyyy.MM.dd 형식 셀을 정규식으로 찾아 교체
  const dateCell = m.createTextFinder('^\\d{4}\\.\\d{2}\\.\\d{2}$').useRegularExpression(true).findNext();
  if (dateCell) dateCell.setValue(ymd_(dateStr, 'yyyy.MM.dd'));

  // 고객명: 라벨 '고객명' 같은 행 A열
  const nameLabel = findCell_(m, '고객명');
  if (nameLabel) m.getRange(nameLabel.getRow(), 1).setValue(' ' + obj.customer);

  // 보증 종료일, 결제 요청 금액: 미정/비움
  const war = findCell_(m, '루비케어 무상 보증 종료일');
  if (war) m.getRange(war.getRow(), 1).setValue(' 미정');
  const req = findCell_(m, '결제 요청 금액');
  if (req) m.getRange(req.getRow(), 1).setValue(' 0');

  // 브랜드/모델/사양 3줄 블록: '#Purchase Journey Log' 행 + 5, A열 (줄바꿈 포함 셀)
  const title = findCell_(m, '#Purchase Journey Log');
  if (title) {
    const r = title.getRow() + 5;
    const cur = String(m.getRange(r, 1).getValue());
    if (cur.indexOf('\n') >= 0 || !cur.trim()) {
      m.getRange(r, 1).setValue(' ' + brandUp + '\n ' + modelUp + (obj.spec ? '\n ' + obj.spec : ''));
    }
  }

  // 요약 라인: 'S/N:' 라벨 왼쪽 셀
  const sn = findCell_(m, 'S/N:');
  if (sn && sn.getColumn() > 1) m.getRange(sn.getRow(), sn.getColumn() - 2 > 0 ? sn.getColumn() - 2 : 1).setValue(brandUp + ' ' + modelUp);
  const fn = findCell_(m, 'F/N:');
  if (fn && obj.ref) fn.setValue('F/N: ' + obj.ref);

  // 결제 표 비우기 (템플릿에 샘플이 남아 있을 수 있음)
  const hdr = findCell_(m, '결제 내용');
  if (hdr) m.getRange(hdr.getRow() + 1, hdr.getColumn(), 9, 4).clearContent();
}

function replaceAll_(sheet, from, to) {
  sheet.createTextFinder(from).replaceAllWith(String(to));
}

/**
 * 마스터 탭을 '단계명(YYMMDD)' 이름으로 스냅샷 복제.
 * 지금 손으로 하시는 '계약금(250731)', '예약금 결제(251029)' 탭 생성과 동일.
 */
function snapshotMaster_(logSheetId, label, dateStr) {
  const ss = SpreadsheetApp.openById(logSheetId);
  const m = ss.getSheetByName('마스터');
  if (!m) return null;
  const tabName = label + '(' + ymd_(dateStr, 'yyMMdd') + ')';
  let existing = ss.getSheetByName(tabName);
  if (existing) ss.deleteSheet(existing);
  const copy = m.copyTo(ss).setName(tabName);
  // 마스터 바로 뒤에 두기
  ss.setActiveSheet(copy);
  ss.moveActiveSheet(2);
  return tabName;
}

/** 마스터 탭 결제 표에 한 줄 추가 (결제 내용 / 결제 날짜 / 결제 금액 / 결제 수단) */
function appendPayment_(logSheetId, content, dateStr, amount, method) {
  const ss = SpreadsheetApp.openById(logSheetId);
  const m = ss.getSheetByName('마스터');
  if (!m) return;
  const hdr = findCell_(m, '결제 내용');
  if (!hdr) return;
  const col = hdr.getColumn();
  let row = hdr.getRow() + 1;
  // 빈 줄 찾기 (최대 15줄)
  for (let i = 0; i < 15; i++, row++) {
    if (!m.getRange(row, col).getValue()) break;
  }
  m.getRange(row, col, 1, 4).setValues([[content, ymd_(dateStr, 'yyyyMMdd'), amount || '', method || '']]);
}

// ───────────────────────────── 단계 진행 / 상담 기록 ─────────────────────────────

/**
 * body: { no, stage, date?, note?, amount?, method?, manager? }
 *  - Index 단계/날짜 갱신
 *  - Log 시트가 있으면: 결제 단계(계약금/예약금)이고 amount가 있으면 결제 행 추가 → 마스터 스냅샷 탭 생성
 *  - 상담 기록 탭에 한 줄 추가
 */
function advanceStage_(b) {
  const rowIdx = findRowIndex_(b.no);
  if (rowIdx < 0) throw new Error('No ' + b.no + ' 없음');
  const obj = rowToObj_(indexSheet_().getRange(rowIdx, 1, 1, INDEX_COLS.length).getValues()[0]);
  if (!CONFIG.STAGES.includes(b.stage)) throw new Error('알 수 없는 단계: ' + b.stage);

  const date = b.date || today_();
  obj.stage = b.stage;
  obj[b.stage] = date;
  if (b.manager) obj.manager = b.manager;

  // 폴더가 아직 없는 건(문의 단계로만 기록된 건)이 상담 이상으로 넘어가면 폴더 생성
  if (!obj.folderId && CONFIG.STAGES.indexOf(b.stage) >= 1 && b.createFolder !== false) {
    const made = createCustomerFolder_(obj.no, obj.brand, obj, date);
    obj.folderId = made.folderId; obj.folderUrl = made.folderUrl; obj.logSheetId = made.logSheetId;
  }

  if (obj.logSheetId) {
    const isPay = ['계약금', '예약금', '출고'].includes(b.stage);
    if (isPay && b.amount) appendPayment_(obj.logSheetId, b.stage + ' 결제', date, Number(b.amount), b.method || '');
    if (isPay || b.snapshot) snapshotMaster_(obj.logSheetId, b.stage, date);
  }

  writeRow_(rowIdx, obj);
  appendConsult_(obj, b.stage, b.note || (b.stage + ' 단계로 진행'), b.amount || '', b.method || '', b.by || b.manager || obj.manager);
  return obj;
}

/** body: { no, note, manager?, amount?, method? } : 단계 변경 없이 상담 내용만 기록 */
function addConsult_(b) {
  const rowIdx = findRowIndex_(b.no);
  if (rowIdx < 0) throw new Error('No ' + b.no + ' 없음');
  const obj = rowToObj_(indexSheet_().getRange(rowIdx, 1, 1, INDEX_COLS.length).getValues()[0]);
  if (b.manager) obj.manager = b.manager;
  writeRow_(rowIdx, obj);
  appendConsult_(obj, obj.stage, b.note || '', b.amount || '', b.method || '', b.by || b.manager || obj.manager);
  return obj;
}

/** body: { no, fields: {model?, spec?, channel?, customer?, manager?, memo?} } */
function updateRow_(b) {
  const rowIdx = findRowIndex_(b.no);
  if (rowIdx < 0) throw new Error('No ' + b.no + ' 없음');
  const obj = rowToObj_(indexSheet_().getRange(rowIdx, 1, 1, INDEX_COLS.length).getValues()[0]);
  const allowed = ['ref', 'model', 'spec', 'channel', 'customer', 'manager', 'memo'];
  allowed.forEach(k => { if (b.fields && b.fields[k] !== undefined) obj[k] = b.fields[k]; });
  return writeRow_(rowIdx, obj);
}

function appendConsult_(obj, stage, note, amount, method, manager) {
  consultSheet_().appendRow([now_(), obj.no, obj.customer, obj.brand, stage, note, amount, method, manager || '']);
}

function listConsults_(no) {
  const sh = consultSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const vals = sh.getRange(2, 1, last - 1, CONSULT_HEADERS.length).getValues();
  const want = no ? String(no).padStart(4, '0') : null;
  return vals
    .filter(r => !want || String(r[1]).padStart(4, '0') === want)
    .map(r => ({ at: r[0] instanceof Date ? Utilities.formatDate(r[0], CONFIG.TZ, 'yyyy-MM-dd HH:mm') : r[0], no: String(r[1]).padStart(4, '0'), customer: r[2], brand: r[3], stage: r[4], note: r[5], amount: r[6], method: r[7], manager: r[8] }))
    .reverse();
}

// ───────────────────────────── 기존 폴더 → Index 백필 ─────────────────────────────

/**
 * 기존 Customer History 폴더들을 훑어 Index에 없는 건을 추가.
 * 폴더명 규칙: NNNN_[BRAND] MODEL (SPEC)_채널_고객명_YYYYMMDD  (뒤쪽 항목은 없을 수 있음)
 * 단계는 Log 시트 탭 이름으로 추정: 출고 > 예약금 > 계약금 > 견적(Log 존재) 순.
 */
function rebuildIndex() {
  const existing = listIndex_();
  const known = new Set(existing.map(r => r.folderId).filter(Boolean));
  const sh = indexSheet_();
  const added = [];

  Object.keys(CONFIG.BRANDS).forEach(brandKey => {
    const b = CONFIG.BRANDS[brandKey];
    if (!b.history) return;
    const it = DriveApp.getFolderById(b.history).getFolders();
    while (it.hasNext()) {
      const f = it.next();
      if (known.has(f.getId())) continue;
      const parsed = parseFolderName_(f.getName());
      if (!parsed) continue;
      const obj = {
        no: nextNo_(), ref: parsed.ref, brand: brandKey, model: parsed.model, spec: parsed.spec, channel: parsed.channel || '루비워크샵',
        customer: parsed.customer, manager: '', stage: '상담',
        folderId: f.getId(), folderUrl: f.getUrl(), logSheetId: '', memo: '자동 백필: 단계 확인 필요',
      };
      CONFIG.STAGES.forEach(s => obj[s] = '');

      // Log 시트 찾기
      const files = f.getFilesByType(MimeType.GOOGLE_SHEETS);
      while (files.hasNext()) {
        const file = files.next();
        if (/^(00_)?Log_/.test(file.getName())) { obj.logSheetId = file.getId(); break; }
      }

      // 단계 추정
      const dates = inferStagesFromLog_(obj.logSheetId);
      Object.assign(obj, dates.stageDates);
      obj.stage = dates.stage || '상담';
      const base = parsed.date ? parsed.date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') : Utilities.formatDate(f.getDateCreated(), CONFIG.TZ, 'yyyy-MM-dd');
      if (!obj['문의']) obj['문의'] = base;
      if (!obj['상담']) obj['상담'] = base;

      writeRow_(sh.getLastRow() + 1, obj);
      added.push(obj.no + ' ' + obj.customer);
    }
  });

  // No 기준 정렬
  const last = sh.getLastRow();
  if (last > 2) sh.getRange(2, 1, last - 1, INDEX_COLS.length).sort({ column: 1, ascending: true });
  Logger.log('추가 ' + added.length + '건: ' + added.join(', '));
  return added;
}

/**
 * 세 가지 폴더명 규칙을 모두 파싱.
 *  A) 0647_[BASTION] ARCHETYPE (BESPOKE_…)_루비워크샵_박재웅_20250731   (Bastion·Tsubasa, ref = 앞 번호)
 *  B) 20260826_김지원_Moulton_TSR 9                                     (2025~ 현재 규칙)
 *  C) P25006                                                           (Parlee, ref만)
 * 반환: { ref, model, spec, channel, customer, date(yyyyMMdd) } 또는 null
 */
function parseFolderName_(name) {
  name = name.trim();
  // A
  let m = name.match(/^([A-Z]*\s?\d{1,5})\s*_\[([^\]]+)\]?\s*(.*)$/i);
  if (m && name.indexOf('[') >= 0) {
    const ref = m[1].trim();
    // 괄호 안의 '_'는 분리하지 않음 (예: (MTO53_20SB))
    const masked = m[3].replace(/[\(\[][^\)\]]*[\)\]]/g, g => g.replace(/_/g, '\u0000'));
    const parts = masked.split('_').map(p => p.replace(/\u0000/g, '_'));
    let model = parts[0].trim(), spec = '';
    const sm = model.match(/^(.*?)\s*[\(\[](.*)[\)\]]\s*(.*)$/);
    if (sm) { model = (sm[1] + (sm[3] ? ' ' + sm[3] : '')).trim(); spec = sm[2].trim(); }
    let channel = '', customer = '', date = '';
    parts.slice(1).forEach(t => {
      t = t.trim();
      if (/^\d{8}$/.test(t)) date = t;
      else if (!channel) channel = t;
      else if (!customer) customer = t;
    });
    if (customer === '미확인') customer = '';
    return { ref, model, spec, channel, customer, date };
  }
  // B
  m = name.match(/^(\d{8})[_ ]+([^_]+)_(.+)$/);
  if (m) {
    const date = m[1], customer = m[2].trim();
    let rest = m[3];
    const brandRe = /^(Moulton|Surly|surly|Crust Bike|Velo Orange|Bastion|Tsubasa|Parlee|Pashley)[_ ]?/i;
    const bm = rest.match(brandRe);
    if (bm) rest = rest.slice(bm[0].length);
    const segs = rest.split('_').map(s => s.trim()).filter(Boolean);
    return { ref: '', model: segs[0] || rest, spec: segs.slice(1).join(' '), channel: '', customer, date };
  }
  // C
  m = name.match(/^([A-Z]{1,3}\d{4,6})$/);
  if (m) return { ref: m[1], model: '', spec: '', channel: '', customer: '', date: '' };
  return null;
}

function inferStagesFromLog_(logSheetId) {
  const out = { stage: '', stageDates: {} };
  if (!logSheetId) return out;
  try {
    const ss = SpreadsheetApp.openById(logSheetId);
    const names = ss.getSheets().map(s => s.getName());
    const rules = [
      ['출고', /출고|딜리버리|delivery/i],
      ['조립', /조립/],
      ['입고', /입고/],
      ['발주', /발주/],
      ['예약금', /예약금/],
      ['계약금', /계약금/],
      ['견적', /견적/],
    ];
    names.forEach(n => {
      const d = (n.match(/\((\d{6})\)/) || [])[1];
      rules.forEach(([stage, re]) => {
        if (re.test(n) && d) {
          const iso = '20' + d.slice(0, 2) + '-' + d.slice(2, 4) + '-' + d.slice(4, 6);
          if (!out.stageDates[stage] || iso > out.stageDates[stage]) out.stageDates[stage] = iso;
        }
      });
    });
    for (const [stage] of rules) { if (out.stageDates[stage]) { out.stage = stage; break; } }
    if (!out.stage) out.stage = '견적'; // Log 시트가 있으면 최소 견적 단계
  } catch (e) { /* 접근 불가 시 무시 */ }
  return out;
}

// ───────────────────────────── 테스트 ─────────────────────────────

function test_list() {
  Logger.log(JSON.stringify(listIndex_().slice(0, 3), null, 2));
}
