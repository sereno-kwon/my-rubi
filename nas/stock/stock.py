#!/usr/bin/env python3
"""
My Rubi 재고 조회 서비스 (NAS 컨테이너에서 실행)

포털(my.rubiworkshop.com)의 '재고 확인' 앱이 이 서비스에 묻고, 이 서비스가 이카운트에서 바로 읽어 답함.
이카운트 API는 사무실 회선 IP만 허용하고 API 키를 브라우저에 둘 수 없어서, 사무실 NAS가 중간에서 대신 부름.

  포털 ──HTTPS──▶ DSM 역방향 프록시 ──▶ 이 서비스(127.0.0.1:8790) ──▶ 이카운트 OAPI

동작
  - 품목 목록(이름·규격·바코드)은 하루 한 번 받아 두고(/data/catalog.json), 검색은 그 목록에서 함
  - 품목을 고르면 그 순간 이카운트에 창고별 재고를 물어봄 (단건 조회, 이카운트 제한 1초 1회)
  - 포털 로그인 세션을 Apps Script에 확인한 사람만 쓸 수 있음

이카운트 호출 제한을 지키는 장치 (같은 회사 계정을 쓰는 ecount-sync가 막히지 않게)
  - 로그인·존 조회·품목 목록: 10분에 한 번을 넘지 않음. 받은 세션은 파일에 두고 재시작해도 다시 씀
  - 단건 재고 조회: 1.2초 간격으로 한 줄로 세워서 보냄, 같은 품목은 30초 동안 다시 묻지 않음
  - 이카운트 오류가 5번 이어지면 10분 쉼 (한 시간에 30번 연속 오류가 나면 이카운트가 막기 때문)
  - 하루 호출 수 상한 (기본 1000, 이카운트 하루 한도 5000 중 나머지는 ecount-sync 몫)

외부 패키지 없이 파이썬 표준 라이브러리만 씀. 실행: python -u stock.py serve
설치: nas/stock/README.md
"""
import json
import os
import re
import sys
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# ───────────────────────────── 설정 (stock.env) ─────────────────────────────

ENV = os.environ.get
SYNC_DIR = ENV('ECOUNT_SYNC_DIR', '/ecount-sync')            # ecount-sync 폴더 (docker-compose 에서 읽기 전용으로 붙임)


def _sync_values():
    """stock.env 에 이카운트 값이 없으면 ecount-sync 폴더의 설정 파일(.env, *.env, *.json)에서 찾아 씀.
    변수 이름이 조금 달라도(ECOUNT_COM_CODE, COM_CODE, API_CERT_KEY …) 알아봄. 값은 로그에 남기지 않음"""
    want = {
        'com': re.compile(r'(^|_)(COM_?CODE|COMPANY_?CODE)$'),
        'user': re.compile(r'(^|_)USER_?ID$'),
        'key': re.compile(r'(^|_)(API_?CERT_?KEY|CERT_?KEY)$|^ECOUNT_?(API_?)?KEY$'),
        'zone': re.compile(r'(^|_)ZONE$'),
    }
    found, used = {}, []
    if not os.path.isdir(SYNC_DIR):
        return found, used
    files = []
    for root, dirs, names in os.walk(SYNC_DIR):
        dirs[:] = [d for d in dirs if d not in ('node_modules', '.git', 'data', 'logs', 'log', '__pycache__', 'venv', '.venv')]
        if root.count(os.sep) - SYNC_DIR.count(os.sep) > 2:
            continue
        for n in names:
            low = n.lower()
            if 'example' in low or 'sample' in low:
                continue
            if low == '.env' or low.endswith('.env') or low.startswith('.env.') or (low.endswith('.json') and 'config' in low or low in ('settings.json', 'secrets.json')):
                files.append(os.path.join(root, n))
    files.sort(key=lambda f: (os.path.basename(f).lower() != '.env', f.count(os.sep), f))
    for f in files:
        pairs = []
        try:
            with open(f, encoding='utf-8') as fh:
                text = fh.read()
            if f.lower().endswith('.json'):
                def walk(o, pre=''):
                    if isinstance(o, dict):
                        for k, v in o.items():
                            walk(v, f'{pre}_{k}' if pre else str(k))
                    elif isinstance(o, (str, int)):
                        pairs.append((pre, str(o)))
                walk(json.loads(text))
            else:
                for line in text.splitlines():
                    m = re.match(r'\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$', line)
                    if m:
                        v = m.group(2).strip()
                        if v[:1] in '\'"' and v[-1:] == v[:1]:
                            v = v[1:-1]
                        else:
                            v = re.sub(r'\s+#.*$', '', v)
                        pairs.append((m.group(1), v))
        except Exception:
            continue
        for k, v in pairs:
            ku = k.upper().replace('-', '_')
            if not v or any(x in ku for x in ('IMWEB', 'NAVER', 'SMARTSTORE', 'GOOGLE', 'NAS_')):
                continue
            for name, rx in want.items():
                if name not in found and rx.search(ku):
                    found[name] = v.strip()
                    used.append(f'{os.path.relpath(f, SYNC_DIR)}:{k}')
        if {'com', 'user', 'key'} <= found.keys():
            break
    return found, used


_SYNC, SYNC_USED = ({}, []) if (ENV('ECOUNT_COM_CODE') and ENV('ECOUNT_API_KEY')) else _sync_values()
COM_CODE = (ENV('ECOUNT_COM_CODE', '') or _SYNC.get('com', '')).strip()
USER_ID = (ENV('ECOUNT_USER_ID', '') or _SYNC.get('user', '')).strip()
API_KEY = (ENV('ECOUNT_API_KEY', '') or _SYNC.get('key', '')).strip()
ZONE_FIXED = (ENV('ECOUNT_ZONE', '') or _SYNC.get('zone', '')).strip().upper()   # 알면 존 조회를 건너뜀 (예: CC)
MAIN_WH = ENV('MAIN_WH', 'RLD').strip()                       # 맨 위에 보여줄 창고 (채널 재고 동기화 기준 창고)
PORTAL_API_URL = ENV('PORTAL_API_URL', '').strip()            # 포털 Apps Script 웹앱 주소 (…/exec), 로그인 확인용
ALLOWED_ORIGIN = ENV('ALLOWED_ORIGIN', 'https://my.rubiworkshop.com').strip()
PORT = int(ENV('PORT', '8790'))
DATA_DIR = ENV('DATA_DIR', '/data')
DAILY_LIMIT = int(ENV('DAILY_LIMIT', '1000'))
CATALOG_HOUR = int(ENV('CATALOG_HOUR', '7'))                  # 매일 이 시각(한국 시간) 이후 첫 확인 때 품목 목록을 새로 받음
TEST_HOST = ENV('ECOUNT_TEST_HOST', '').strip()               # 개발용 가짜 이카운트 주소. 실제 운영에서는 비워 둠

# 이카운트 OAPI V2 경로 (자기설정 → OpenAPI 문서 기준)
EP_ZONE = '/OAPI/V2/Zone'
EP_LOGIN = '/OAPI/V2/OAPILogin'
EP_PRODUCTS = '/OAPI/V2/InventoryBasic/GetBasicProductsList'                    # 품목 목록 (10분 제한)
EP_STOCK_ONE = '/OAPI/V2/InventoryBalance/ViewInventoryBalanceStatusByLocation'   # 창고별 재고 단건 (1초 제한)

SLOW_GAP = 600 + 5        # 로그인·존·목록 조회 간격(초)
FAST_GAP = 1.2            # 단건 조회 간격(초)
STOCK_TTL = 30            # 같은 품목 재고를 다시 묻지 않는 시간(초)
BREAK_AFTER = 5           # 이카운트 오류가 이만큼 이어지면
BREAK_FOR = 600           #   이 시간(초) 동안 쉼
AUTH_TTL = 600            # 포털 세션 확인 결과를 기억하는 시간(초)

KST = timezone(timedelta(hours=9))
STATE_FILE = os.path.join(DATA_DIR, 'state.json')
CATALOG_FILE = os.path.join(DATA_DIR, 'catalog.json')


def now():
    return time.time()


def kst(ts=None):
    return datetime.fromtimestamp(ts if ts is not None else now(), KST)


def log(*a):
    print(kst().strftime('%m-%d %H:%M:%S'), *a, flush=True)


def read_json(path, default):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return default


def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(tmp, path)


def num(v):
    try:
        x = float(str(v).replace(',', ''))
    except Exception:
        return 0
    return int(x) if x == int(x) else round(x, 3)


def fold(s):
    """검색용: 소문자, 한글 자모 정규화, 공백·기호 제거"""
    s = unicodedata.normalize('NFC', str(s or '')).lower()
    return re.sub(r'[\s\-_/.,()\[\]]+', '', s)


# ───────────────────────────── 이카운트 ─────────────────────────────

class EcountError(Exception):
    def __init__(self, msg, expired=False, limited=False):
        super().__init__(msg)
        self.expired = expired
        self.limited = limited


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    # 이카운트는 호출 제한에 걸리면 302로 다른 페이지를 보냄. 따라가지 않고 제한으로 처리
    def redirect_request(self, *a, **k):
        return None


_opener = urllib.request.build_opener(_NoRedirect)


class Ecount:
    def __init__(self):
        self.lock = threading.Lock()          # 이카운트 호출은 한 번에 하나씩
        self.st = read_json(STATE_FILE, {})
        self.catalog = read_json(CATALOG_FILE, {'at': 0, 'items': []})
        self.index = []
        self.cache = {}                        # 품목코드 → (시각, 결과)
        self.last = {}                         # 품목코드 → {qty, at} 검색 목록에 보여줄 마지막 확인값
        self.errors = 0
        self.pause_until = 0
        self.last_fast = 0
        self.last_error = ''
        self._build_index()

    # ── 상태 저장 ──
    def _save(self):
        try:
            write_json(STATE_FILE, self.st)
        except Exception as e:
            log('상태 저장 실패', e)

    def _count_call(self):
        day = kst().strftime('%Y%m%d')
        if self.st.get('day') != day:
            self.st['day'], self.st['calls'] = day, 0
        if self.st.get('calls', 0) >= DAILY_LIMIT:
            raise EcountError(f'오늘 재고 조회 한도({DAILY_LIMIT}회)를 다 썼습니다. 내일 다시 쓸 수 있습니다')
        self.st['calls'] = self.st.get('calls', 0) + 1

    def _slow_ok(self, key):
        """10분 제한 API를 지금 불러도 되는지"""
        return now() - self.st.get(key, 0) >= SLOW_GAP

    def _wait_left(self, key):
        return max(0, int(SLOW_GAP - (now() - self.st.get(key, 0))))

    # ── 호출 ──
    def _post(self, url, body, login=False):
        if now() < self.pause_until:
            left = int(self.pause_until - now()) // 60 + 1
            raise EcountError(f'이카운트 오류가 이어져 잠시 쉬는 중입니다. {left}분 뒤 다시 시도해 주세요')
        self._count_call()
        data = json.dumps(body).encode('utf-8')
        req = urllib.request.Request(url, data=data, method='POST', headers={'Content-Type': 'application/json'})
        try:
            with _opener.open(req, timeout=30) as r:
                raw, code = r.read(), r.status
        except urllib.error.HTTPError as e:
            raw, code = e.read() or b'', e.code
        except Exception as e:
            self._fail()
            raise EcountError('이카운트에 연결할 수 없습니다 (' + type(e).__name__ + ')')
        finally:
            self._save()

        text = raw.decode('utf-8', 'replace')
        if code in (302, 412):
            self._fail()
            raise EcountError('이카운트 호출 간격 제한에 걸렸습니다. 잠시 뒤 다시 시도해 주세요', limited=True)
        try:
            j = json.loads(text)
        except Exception:
            self._fail()
            if code == 404:
                raise EcountError('이카운트 API 주소가 맞지 않습니다 (' + url.split('?')[0].split('.com')[-1] + ')')
            raise EcountError(f'이카운트 응답을 읽을 수 없습니다 (HTTP {code})')

        err = j.get('Error') or {}
        msg = (err.get('Message') or '') if isinstance(err, dict) else str(err)
        ecode = str((err.get('Code') if isinstance(err, dict) else '') or '')
        if not login and (code == 500 or 'EXP' in ecode or re.search(r'please login|로그인', msg, re.I)):
            self._fail()
            raise EcountError('이카운트 세션이 끝났습니다', expired=True)
        if str(j.get('Status')) != '200' or err:
            self._fail()
            raise EcountError('이카운트 오류: ' + (msg or ecode or f'HTTP {code}'))
        self.errors = 0
        self.last_error = ''
        return j.get('Data') or {}

    def _fail(self):
        self.errors += 1
        if self.errors >= BREAK_AFTER:
            self.pause_until = now() + BREAK_FOR
            self.errors = 0
            log(f'이카운트 오류가 {BREAK_AFTER}번 이어져 {BREAK_FOR // 60}분 쉼')

    def _zone(self):
        if ZONE_FIXED:
            return ZONE_FIXED
        if self.st.get('zone'):
            return self.st['zone']
        if not self._slow_ok('zone_at'):
            raise EcountError(f'존 조회 제한 시간입니다. {(self._wait_left("zone_at") + 59) // 60}분 뒤 다시 시도해 주세요')
        self.st['zone_at'] = now()
        d = self._post((TEST_HOST or 'https://oapi.ecount.com') + EP_ZONE, {'COM_CODE': COM_CODE})
        zone = str(d.get('ZONE') or '').upper()
        if not zone:
            raise EcountError('이카운트 존을 받지 못했습니다')
        self.st['zone'] = zone
        self._save()
        log('이카운트 존', zone)
        return zone

    def _base(self):
        return TEST_HOST or f'https://oapi{self._zone()}.ecount.com'

    def _login(self):
        if not (COM_CODE and USER_ID and API_KEY):
            raise EcountError('stock.env 에 ECOUNT_COM_CODE, ECOUNT_USER_ID, ECOUNT_API_KEY 를 넣어 주세요')
        if not self._slow_ok('login_at'):
            raise EcountError(f'이카운트 로그인은 10분에 한 번만 됩니다. {(self._wait_left("login_at") + 59) // 60}분 뒤 다시 시도해 주세요')
        base = self._base()
        self.st['login_at'] = now()
        d = self._post(base + EP_LOGIN, {'COM_CODE': COM_CODE, 'USER_ID': USER_ID, 'API_CERT_KEY': API_KEY,
                                         'LAN_TYPE': 'ko-KR', 'ZONE': self._zone()}, login=True)
        sid = ((d.get('Datas') or {}).get('SESSION_ID')) if isinstance(d.get('Datas'), dict) else None
        if str(d.get('Code', '00')) != '00' or not sid:
            raise EcountError('이카운트 로그인 실패: ' + str(d.get('Message') or '인증키와 사용자 ID를 확인해 주세요'))
        self.st['session'] = sid
        self._save()
        log('이카운트 로그인')
        return sid

    def _call(self, path, body):
        """세션을 붙여 부름. 세션이 끝났으면 (로그인 제한 안에서) 한 번 다시 로그인"""
        sid = self.st.get('session') or self._login()
        try:
            return self._post(f'{self._base()}{path}?SESSION_ID={urllib.parse.quote(sid)}', body)
        except EcountError as e:
            if not e.expired:
                raise
            self.st['session'] = ''
            self._save()
            sid = self._login()
            return self._post(f'{self._base()}{path}?SESSION_ID={urllib.parse.quote(sid)}', body)

    @staticmethod
    def _rows(d):
        r = d.get('Result')
        if isinstance(r, str):
            try:
                r = json.loads(r)
            except Exception:
                r = []
        return r if isinstance(r, list) else []

    # ── 품목 목록 ──
    def _build_index(self):
        self.index = [(fold(' '.join([p['code'], p['name'], p.get('size', ''), p.get('barcode', '')])), p)
                      for p in self.catalog.get('items', [])]

    def catalog_due(self):
        at = self.catalog.get('at', 0)
        if not at:
            return True
        today_mark = kst().replace(hour=CATALOG_HOUR, minute=0, second=0, microsecond=0).timestamp()
        return (now() >= today_mark and at < today_mark) or now() - at > 36 * 3600

    def refresh_catalog(self, force=False):
        with self.lock:
            if not force and not self.catalog_due():
                return False
            if not self._slow_ok('catalog_try'):
                raise EcountError(f'품목 목록은 10분에 한 번만 받을 수 있습니다. {(self._wait_left("catalog_try") + 59) // 60}분 뒤 다시 시도해 주세요')
            self.st['catalog_try'] = now()
            self._save()
            d = self._call(EP_PRODUCTS, {'PROD_CD': '', 'PROD_TYPE': ''})
            items = []
            for r in self._rows(d):
                code = str(r.get('PROD_CD') or '').strip()
                if not code:
                    continue
                items.append({'code': code, 'name': str(r.get('PROD_DES') or '').strip(),
                              'size': str(r.get('SIZE_DES') or '').strip(), 'barcode': str(r.get('BAR_CODE') or '').strip()})
            if not items:
                raise EcountError('이카운트에서 품목을 하나도 받지 못했습니다')
            items.sort(key=lambda p: p['name'])
            self.catalog = {'at': now(), 'items': items}
            write_json(CATALOG_FILE, self.catalog)
            self._build_index()
            log(f'품목 목록 {len(items)}개 받음')
            return True

    def search(self, q, limit=60):
        words = [fold(w) for w in str(q).split() if fold(w)]
        if not words:
            return []
        whole = fold(q)
        hits = []
        for hay, p in self.index:
            if all(w in hay for w in words):
                code, name = fold(p['code']), fold(p['name'])
                rank = (0 if whole in (code, fold(p.get('barcode'))) else
                        1 if code.startswith(whole) else
                        2 if name.startswith(words[0]) else 3)
                hits.append((rank, p['name'], p))
        hits.sort(key=lambda h: (h[0], h[1]))
        return [h[2] for h in hits[:limit]]

    def product(self, code):
        for _, p in self.index:
            if p['code'] == code:
                return p
        return None

    # ── 재고 ──
    def stock(self, code):
        code = code.strip()
        c = self.cache.get(code)
        if c and now() - c[0] < STOCK_TTL:
            return dict(c[1], cached=True)
        with self.lock:
            c = self.cache.get(code)       # 기다리는 동안 다른 사람이 같은 품목을 물었을 수 있음
            if c and now() - c[0] < STOCK_TTL:
                return dict(c[1], cached=True)
            gap = FAST_GAP - (now() - self.last_fast)
            if gap > 0:
                time.sleep(gap)
            try:
                d = self._call(EP_STOCK_ONE, {'BASE_DATE': kst().strftime('%Y%m%d'), 'PROD_CD': code, 'WH_CD': '', 'ZERO_FLAG': 'Y'})
            finally:
                self.last_fast = now()

        p = dict(self.product(code) or {})
        whs = {}
        for r in self._rows(d):
            if str(r.get('PROD_CD') or '').strip() not in ('', code):
                continue
            wh = str(r.get('WH_CD') or '').strip()
            if not wh:
                continue
            w = whs.setdefault(wh, {'wh': wh, 'name': str(r.get('WH_DES') or '').strip(), 'qty': 0})
            w['qty'] = num(w['qty'] + num(r.get('BAL_QTY')))
            p.setdefault('name', str(r.get('PROD_DES') or '').strip())
            p.setdefault('size', str(r.get('PROD_SIZE_DES') or '').strip())
        rows = sorted(whs.values(), key=lambda w: (w['wh'] != MAIN_WH, -abs(w['qty']), w['wh']))
        main = whs.get(MAIN_WH) or {'wh': MAIN_WH, 'name': '', 'qty': 0}
        out = {'code': code, 'name': p.get('name', ''), 'size': p.get('size', ''), 'barcode': p.get('barcode', ''),
               'main': main, 'rows': rows, 'total': num(sum(w['qty'] for w in rows)),
               'at': int(now() * 1000), 'known': bool(rows or self.product(code)), 'cached': False}
        self.cache[code] = (now(), out)
        self.last[code] = {'qty': main['qty'], 'at': out['at']}
        return out

    def health(self):
        return {'catalog': {'count': len(self.catalog.get('items', [])), 'at': int(self.catalog.get('at', 0) * 1000)},
                'mainWh': MAIN_WH, 'calls': self.st.get('calls', 0) if self.st.get('day') == kst().strftime('%Y%m%d') else 0,
                'dailyLimit': DAILY_LIMIT, 'paused': now() < self.pause_until, 'lastError': self.last_error}


EC = Ecount()


# ───────────────────────────── 포털 로그인 확인 ─────────────────────────────

_auth = {}   # 세션 토큰 → (확인 시각, 사용자 or None)
_auth_lock = threading.Lock()


def portal_user(token):
    """포털 세션을 Apps Script 'me' 로 확인. 결과는 10분 기억"""
    if not token or len(token) > 200:
        return None
    with _auth_lock:
        c = _auth.get(token)
    if c and now() - c[0] < (AUTH_TTL if c[1] else 30):
        return c[1]
    if not PORTAL_API_URL:
        raise RuntimeError('stock.env 에 PORTAL_API_URL 이 없습니다')
    url = PORTAL_API_URL + ('&' if '?' in PORTAL_API_URL else '?') + urllib.parse.urlencode({'action': 'me', 's': token})
    try:
        with urllib.request.urlopen(url, timeout=20) as r:
            j = json.loads(r.read().decode('utf-8'))
    except Exception as e:
        log('포털 로그인 확인 실패', type(e).__name__)
        raise RuntimeError('포털 로그인을 확인할 수 없습니다. 잠시 뒤 다시 시도해 주세요')
    user = j.get('user') if j.get('ok') else None
    with _auth_lock:
        if len(_auth) > 500:
            _auth.clear()
        _auth[token] = (now(), user)
    return user


# ───────────────────────────── HTTP ─────────────────────────────

class Handler(BaseHTTPRequestHandler):
    server_version = 'MyRubiStock/1'

    def log_message(self, fmt, *args):   # 기본 접근 기록은 끔 (주소에 검색어가 남지 않게)
        pass

    def _cors(self):
        if self.headers.get('Origin') == ALLOWED_ORIGIN:
            self.send_header('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
        self.send_header('Vary', 'Origin')

    def _json(self, code, body):
        data = json.dumps(body, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self._cors()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'X-MyRubi-Session')
        self.send_header('Access-Control-Max-Age', '86400')
        self.end_headers()

    def _route(self, method):
        u = urllib.parse.urlparse(self.path)
        path, qs = u.path.rstrip('/') or '/', urllib.parse.parse_qs(u.query)
        q = lambda k: (qs.get(k) or [''])[0]
        if path == '/' and q('r'):          # 주소 하나로 받는 방식 (?r=search&q=…)도 같은 동작으로
            path = '/' + q('r')

        origin = self.headers.get('Origin')
        if origin and origin != ALLOWED_ORIGIN:
            return self._json(403, {'ok': False, 'error': 'origin_not_allowed'})
        if path in ('/', '/health') and method == 'GET':
            return self._json(200, {'ok': True, 'service': 'my-rubi-stock'})

        try:
            user = portal_user(self.headers.get('X-MyRubi-Session', ''))
        except RuntimeError as e:
            return self._json(502, {'ok': False, 'error': str(e)})
        if not user:
            return self._json(401, {'ok': False, 'error': 'unauthorized'})

        try:
            if path == '/status' and method == 'GET':
                return self._json(200, dict(ok=True, **EC.health()))
            if path == '/search' and method == 'GET':
                term = q('q').strip()[:80]
                items = EC.search(term)
                out = [dict(p, last=EC.last.get(p['code'])) for p in items]
                return self._json(200, {'ok': True, 'q': term, 'items': out, 'catalogAt': int(EC.catalog.get('at', 0) * 1000),
                                        'catalogCount': len(EC.index), 'mainWh': MAIN_WH})
            if path == '/stock' and method == 'GET':
                code = q('code').strip()[:40]
                if not code:
                    return self._json(400, {'ok': False, 'error': '품목코드가 없습니다'})
                return self._json(200, dict(ok=True, mainWh=MAIN_WH, **EC.stock(code)))
            if path == '/catalog' and method == 'POST':
                EC.refresh_catalog(force=True)
                return self._json(200, dict(ok=True, **EC.health()))
        except EcountError as e:
            EC.last_error = str(e)
            log('이카운트:', e)
            return self._json(503, {'ok': False, 'error': str(e)})
        except Exception as e:
            log('오류', type(e).__name__, e)
            return self._json(500, {'ok': False, 'error': '서비스 오류가 났습니다'})
        return self._json(404, {'ok': False, 'error': 'not_found'})

    def do_GET(self):
        self._route('GET')

    def do_POST(self):
        self._route('POST')


def background():
    """품목 목록을 매일 새로 받음 (시작 직후 한 번, 이후 5분마다 확인)"""
    time.sleep(3)
    while True:
        try:
            if EC.catalog_due():
                EC.refresh_catalog()
        except EcountError as e:
            EC.last_error = str(e)
            log('품목 목록:', e)
        except Exception as e:
            log('품목 목록 오류', type(e).__name__, e)
        time.sleep(300)


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'serve'
    if cmd != 'serve':
        print('사용법: python -u stock.py serve')
        return
    missing = [k for k, v in (('ECOUNT_COM_CODE', COM_CODE), ('ECOUNT_USER_ID', USER_ID),
                              ('ECOUNT_API_KEY', API_KEY), ('PORTAL_API_URL', PORTAL_API_URL)) if not v]
    if missing:
        log('stock.env 에 빠진 값:', ', '.join(missing))
    if SYNC_USED:
        log('이카운트 값을 ecount-sync 설정에서 가져옴:', ', '.join(SYNC_USED))
    elif not (ENV('ECOUNT_COM_CODE') and ENV('ECOUNT_API_KEY')):
        log(f'ecount-sync 설정을 찾지 못함 ({SYNC_DIR}). docker-compose.yml 의 ecount-sync 경로나 stock.env 의 ECOUNT_ 값을 확인')
    log(f'재고 조회 서비스 시작 :{PORT}  기준 창고 {MAIN_WH}  품목 {len(EC.index)}개(저장본)')
    threading.Thread(target=background, daemon=True).start()
    ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()


if __name__ == '__main__':
    main()
