#!/usr/bin/env python3
"""
My Rubi 상품업로드 서비스 (NAS 컨테이너에서 실행)

포털(my.rubiworkshop.com)의 '상품업로드' 앱이 이 서비스를 부름.

  1. 점검: 이카운트 품목(재고 조회 서비스가 매일 받아 두는 목록)과 아임웹 두 사이트(루비서플라이·루비워크샵)의
     상품 SKU를 비교해, 이카운트에는 있는데 사이트에 없는 품목을 상품 단위로 묶어 검토 목록에 올림
     (아임웹 SKU = 이카운트 품목코드가 연동 키)
  2. 검토: 직원이 상품마다 업로드 / 보류 / 제외를 고름 (상태는 이 서비스의 /data/review.json)
  3. 초안: 업로드로 고른 상품은 브랜드 공식 사이트를 읽고 Claude API로 아코디언 문구 초안을 만듦. 직원이 앱에서 고쳐 확정
  4. 만들기: 사이트별 아임웹 '상품 일괄 추가' 엑셀(template.xlsx 양식)과 대표 이미지(1000×1000, 흰 배경, 사방 10% 여백)를
     zip 하나로 묶어 내려받게 함
       루비서플라이: v5 아코디언(요약설명), 배송 안내(상세정보), 과세상품, 적립금 원, 할인 회원·% 단위, 배송방법 줄바꿈
       루비워크샵:   v6 아코디언(요약설명, 끝에 제품 상담·워런티), 과세상품, 배송방법 줄바꿈

연결
  - 이카운트 품목 목록: 재고 조회 서비스(rubi-stock)의 저장소 볼륨을 읽기 전용으로 붙여 catalog.json 을 읽음
  - 이카운트 창고 재고: 엑셀을 만들 때 재고 조회 서비스(127.0.0.1:8790)에 품목마다 물어봄 (직원 세션을 그대로 넘김)
  - 아임웹 OpenAPI: ecount-sync 가 쓰는 액세스 토큰을 읽기만 함. 토큰 갱신은 하지 않음
    (갱신하면 리프레시 토큰이 바뀌어 ecount-sync 연결이 끊길 수 있어서). 토큰이 만료되면 ecount-sync 가 갱신할 때까지 기다림
  - Claude API: upload.env 의 ANTHROPIC_API_KEY

이 서비스는 이카운트와 아임웹에 아무것도 쓰지 않음 (읽기만). 상품 등록은 직원이 아임웹 관리자에서 엑셀로 함
실행: python -u upload.py serve      설치: nas/upload/README.md
"""
import hashlib
import html as htmlmod
import io
import json
import os
import re
import shutil
import sys
import threading
import time
import traceback
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# ───────────────────────────── 설정 (upload.env) ─────────────────────────────

ENV = os.environ.get
PORT = int(ENV('PORT', '8791'))
DATA_DIR = ENV('DATA_DIR', '/data')
APP_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = ENV('TEMPLATE_XLSX', os.path.join(APP_DIR, 'template.xlsx'))
PORTAL_API_URL = ENV('PORTAL_API_URL', '').strip()
ALLOWED_ORIGIN = ENV('ALLOWED_ORIGIN', 'https://my.rubiworkshop.com').strip()
STOCK_DATA_DIR = ENV('STOCK_DATA_DIR', '/stock-data')            # rubi-stock 저장소 볼륨 (catalog.json)
STOCK_URL = ENV('STOCK_URL', 'http://127.0.0.1:8790').rstrip('/')
MAIN_WH = ENV('MAIN_WH', 'RLD').strip()
SYNC_DIR = ENV('ECOUNT_SYNC_DIR', '/ecount-sync')
ANTHROPIC_KEY = ENV('ANTHROPIC_API_KEY', '').strip()
CLAUDE_MODEL = ENV('CLAUDE_MODEL', 'claude-sonnet-5-5').strip()
IMWEB_API = 'https://openapi.imweb.me'
TEST_MODE = ENV('UPLOAD_TEST', '') == '1'                        # 개발용: 외부 호출 없이 data 폴더의 가짜 데이터로 동작

SITES = {
    'supply':   {'name': '루비서플라이', 'domain': ENV('SUPPLY_DOMAIN', 'rubisupply.com'),   'token': ENV('IMWEB_TOKEN_SUPPLY', '').strip()},
    'workshop': {'name': '루비워크샵',   'domain': ENV('WORKSHOP_DOMAIN', 'rubiworkshop.com'), 'token': ENV('IMWEB_TOKEN_WORKSHOP', '').strip()},
}
CONSULT_URL = ENV('CONSULT_URL', 'https://ai.rubiworkshop.com/')
WARRANTY_URL = ENV('WARRANTY_URL', 'https://rubisupply.com/warranty')

KST = timezone(timedelta(hours=9))
UA = 'Mozilla/5.0 (compatible; MyRubiUpload/1; +https://my.rubiworkshop.com)'
AUTH_TTL = 600
IMG_SIZE = 1000            # 대표 이미지 한 변
IMG_FILL = 0.8             # 제품이 차지하는 최대 비율 (사방 10% 여백)

REVIEW_FILE = os.path.join(DATA_DIR, 'review.json')
SCAN_FILE = os.path.join(DATA_DIR, 'scan.json')
BRANDS_FILE = os.path.join(DATA_DIR, 'brands.json')
OUT_DIR = os.path.join(DATA_DIR, 'out')
CACHE_DIR = os.path.join(DATA_DIR, 'cache')


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


def fold(s):
    return unicodedata.normalize('NFKC', str(s or '')).lower().strip()


def slug(s):
    s = unicodedata.normalize('NFKD', str(s or '')).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return s[:60] or 'item'


class UserError(Exception):
    """직원에게 그대로 보여 줄 오류"""


# ───────────────────────────── HTTP 도우미 ─────────────────────────────

def http(url, method='GET', headers=None, body=None, timeout=40, raw=False):
    h = {'User-Agent': UA, 'Accept': '*/*'}
    h.update(headers or {})
    data = None
    if body is not None:
        data = body if isinstance(body, bytes) else json.dumps(body).encode('utf-8')
        h.setdefault('Content-Type', 'application/json')
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        b = r.read()
        if raw:
            return b, r.headers.get('Content-Type', '')
        return json.loads(b.decode('utf-8'))


def http_text(url, timeout=30):
    b, ctype = http(url, headers={'Accept': 'text/html,application/json;q=0.9,*/*;q=0.8'}, timeout=timeout, raw=True)
    m = re.search(r'charset=([\w-]+)', ctype or '')
    return b.decode(m.group(1) if m else 'utf-8', errors='replace')


# ───────────────────────────── 이카운트 품목 ─────────────────────────────

def ecount_items():
    """재고 조회 서비스가 받아 둔 품목 목록 [{code,name,size,barcode,price,...}]"""
    cat = read_json(os.path.join(STOCK_DATA_DIR, 'catalog.json'), None)
    if not cat or not cat.get('items'):
        raise UserError('이카운트 품목 목록을 읽지 못했습니다. 재고 조회 서비스(rubi-stock)가 품목 목록을 받았는지, '
                        'docker-compose.yml 의 rubi-stock 볼륨 연결을 확인해 주세요')
    return cat['items'], cat.get('at', 0)


RE_BRAND = re.compile(r'^\s*\[([^\]]+)\]\s*(.*)$')
# 품목명 끝에서 옵션으로 떼어 낼 말 (컬러, 사이즈, 티스, 스핀들 규격)
COLORS = ['ultraviolet purple', 'classic purple', 'raw silver', 'shadow gray', 'shadow grey', 'matte black', 'gloss black',
          'black', 'blue', 'red', 'orange', 'gold', 'purple', 'silver', 'green', 'grey', 'gray', 'espresso', 'olive', 'teal',
          'pink', 'yellow', 'white', 'gunmetal', 'brown', 'navy', 'tan', 'raw', 'polished', 'clear']
RE_VARTOK = re.compile(r'(?i)^(?:' + '|'.join(re.escape(c) for c in COLORS) +
                       r'|\d+(?:\.\d+)?\s?mm|\d+(?:\.\d+)?\s?cm|\d{2}t|xx?s|xx?l|[sml]|eu\s?\d{2}(?:\.\d)?|\d{2}(?:\.\d)?'
                       r'|for\s+(?:shimano|sram|campagnolo|campy)|shimano|sram)$')


def _strip_variant(base):
    """'BOTTOM BRACKET BSA - 24MM FOR SHIMANO - BLACK' → ('BOTTOM BRACKET BSA', '24MM FOR SHIMANO BLACK')"""
    taken = []
    changed = True
    while changed:
        changed = False
        # ' - 뒤쪽' 덩어리가 통째로 옵션 말이면 떼어 냄
        m = re.match(r'^(.*\S)\s+-\s+([^-]+)$', base)
        if m and all(RE_VARTOK.match(t) for t in _tokens(m.group(2))):
            taken.insert(0, m.group(2).strip())
            base = m.group(1).strip()
            changed = True
            continue
        # 끝 단어가 컬러·사이즈면 떼어 냄 (두 단어 컬러 먼저)
        for n in (2, 1):
            parts = base.split(' ')
            if len(parts) > n + 1:
                tail = ' '.join(parts[-n:])
                if RE_VARTOK.match(tail) or (n == 1 and RE_VARTOK.match(parts[-1])):
                    taken.insert(0, tail if n == 2 else parts[-1])
                    base = ' '.join(parts[:-n] if n == 2 else parts[:-1]).strip(' -/')
                    changed = True
                    break
    return base.strip(' -/'), ' '.join(taken)


def _tokens(s):
    """옵션 덩어리를 컬러(두 단어 포함)·사이즈 단위로 나눔"""
    s = s.strip()
    out = []
    words_ = s.split()
    i = 0
    while i < len(words_):
        two = ' '.join(words_[i:i + 2])
        three = ' '.join(words_[i:i + 3])
        if re.match(r'(?i)^for\s+\w+$', two) or two.lower() in COLORS:
            out.append(two)
            i += 2
        elif three.lower() in COLORS:
            out.append(three)
            i += 3
        else:
            out.append(words_[i])
            i += 1
    return out


def split_name(name):
    """'[WOLFTOOTH] DRIVETRAIN/ BOTTOM BRACKET BSA (24MM SHIMANO/BLACK)'
       → 브랜드 WOLFTOOTH, 상품 'DRIVETRAIN/ BOTTOM BRACKET BSA', 옵션 '24MM SHIMANO/BLACK'
       '[WOLFTOOTH] STEM CAP FLAT BLACK' → 상품 'STEM CAP FLAT', 옵션 'BLACK'"""
    name = re.sub(r'\s+', ' ', str(name or '')).strip()
    brand = ''
    m = RE_BRAND.match(name)
    if m:
        brand, name = m.group(1).strip(), m.group(2).strip()
    opt = ''
    m = re.match(r'^(.*\S)\s*\(([^()]*)\)\s*$', name)
    if m:
        name, opt = m.group(1).strip(), m.group(2).strip()
    name, more = _strip_variant(name)
    opt = ' '.join(x for x in (more, opt) if x)
    return brand, name, opt


def family_key(brand, base):
    return hashlib.sha1(fold(brand + '|' + base).encode('utf-8')).hexdigest()[:12]


# ───────────────────────────── 아임웹 OpenAPI (읽기 전용) ─────────────────────────────

def _token_candidates():
    """ecount-sync 폴더에서 아임웹 액세스 토큰처럼 생긴 값을 모두 찾음 (JWT, 키 이름에 access 와 token)"""
    found = []
    if not os.path.isdir(SYNC_DIR):
        return found
    base_depth = SYNC_DIR.rstrip(os.sep).count(os.sep)
    for root, dirs, names in os.walk(SYNC_DIR):
        dirs[:] = [d for d in dirs if d not in ('node_modules', '.git', '__pycache__', 'venv', '.venv', 'logs', 'log')]
        if root.count(os.sep) - base_depth > 4:
            dirs[:] = []
            continue
        for n in names:
            low = n.lower()
            if 'example' in low or 'sample' in low:
                continue
            if not (low.endswith('.json') or low.endswith('.env') or low == '.env' or low.startswith('.env.') or low.endswith('.txt')):
                continue
            f = os.path.join(root, n)
            try:
                if os.path.getsize(f) > 2_000_000:
                    continue
                with open(f, encoding='utf-8', errors='ignore') as fh:
                    text = fh.read()
            except Exception:
                continue
            pairs = []
            if low.endswith('.json'):
                try:
                    def walk(o, pre=''):
                        if isinstance(o, dict):
                            for k, v in o.items():
                                walk(v, f'{pre}.{k}' if pre else str(k))
                        elif isinstance(o, list):
                            for i, v in enumerate(o):
                                walk(v, f'{pre}[{i}]')
                        elif isinstance(o, str):
                            pairs.append((pre, o))
                    walk(json.loads(text))
                except Exception:
                    pass
            else:
                for line in text.splitlines():
                    m = re.match(r'\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*["\']?([^"\'\s#]+)', line)
                    if m:
                        pairs.append((m.group(1), m.group(2)))
            for k, v in pairs:
                ku = k.lower().replace('-', '_')
                if 'refresh' in ku or 'access' not in ku or 'token' not in ku:
                    continue
                v = v.strip()
                if v.startswith('Bearer '):
                    v = v[7:]
                if len(v) > 40 and v.count('.') == 2 and v.startswith('eyJ'):
                    found.append({'token': v, 'where': f'{os.path.relpath(f, SYNC_DIR)}:{k}', 'mtime': os.path.getmtime(f)})
    found.sort(key=lambda x: -x['mtime'])
    return found


def _jwt_exp(tok):
    """JWT 만료 시각(초). 읽지 못하면 0"""
    import base64
    try:
        part = tok.split('.')[1]
        part += '=' * (-len(part) % 4)
        return int(json.loads(base64.urlsafe_b64decode(part)).get('exp', 0))
    except Exception:
        return 0


class Imweb:
    def __init__(self):
        self.lock = threading.Lock()
        self.map = {}          # site → {token, unitCode, where, checked}
        self.last_error = {}

    def _get(self, token, path, params=None):
        url = IMWEB_API + path + ('?' + urllib.parse.urlencode(params) if params else '')
        for attempt in range(4):
            try:
                j = http(url, headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/json'}, timeout=40)
                return j.get('data', j)
            except urllib.error.HTTPError as e:
                if e.code == 429 and attempt < 3:
                    time.sleep(2 + attempt * 3)
                    continue
                body = ''
                try:
                    body = e.read().decode('utf-8', 'ignore')[:200]
                except Exception:
                    pass
                raise RuntimeError(f'아임웹 {path} {e.code} {body}')

    def resolve(self, force=False):
        """토큰마다 어느 사이트(도메인)인지 알아내 site → 토큰 연결"""
        if TEST_MODE:
            return {s: {'token': 't', 'unitCode': 'u', 'where': 'test', 'domain': v['domain'], 'checked': now(), 'exp': 0} for s, v in SITES.items()}
        with self.lock:
            if self.map and not force and all(now() - v['checked'] < 600 for v in self.map.values()):
                return self.map
            out = {}
            cands = []
            for site, s in SITES.items():
                if s['token']:
                    cands.append({'token': s['token'], 'where': 'upload.env', 'mtime': now(), 'site': site})
            cands += _token_candidates()
            seen = set()
            for c in cands:
                if c['token'] in seen:
                    continue
                seen.add(c['token'])
                exp = _jwt_exp(c['token'])
                if exp and exp < now() + 60:
                    continue
                try:
                    info = self._get(c['token'], '/site-info')
                    units = info.get('unitList') or []
                    for u in units:
                        uc = u.get('unitCode')
                        try:
                            ui = self._get(c['token'], f'/site-info/unit/{uc}')
                            dom = fold(ui.get('primaryDomain', ''))
                        except Exception:
                            dom = ''
                        for site, s in SITES.items():
                            if (c.get('site') == site or (dom and s['domain'] in dom)) and site not in out:
                                out[site] = {'token': c['token'], 'unitCode': uc, 'where': c['where'], 'domain': dom,
                                             'checked': now(), 'exp': exp}
                except Exception as e:
                    log('아임웹 토큰 확인 실패', c['where'], str(e)[:120])
                if len(out) == len(SITES):
                    break
            self.map = out
            for site in SITES:
                if site not in out:
                    self.last_error[site] = '아임웹 토큰을 찾지 못했거나 만료됐습니다'
                else:
                    self.last_error.pop(site, None)
            return out

    def products(self, site, progress=None):
        """사이트의 모든 상품과 SKU. 옵션 상품은 옵션 상세 SKU까지 (상품 수정 시각이 같으면 캐시를 씀)"""
        if TEST_MODE:
            return read_json(os.path.join(DATA_DIR, f'test_imweb_{site}.json'), [])
        m = self.resolve().get(site)
        if not m:
            raise UserError(f'{SITES[site]["name"]} 아임웹 토큰이 없습니다. ecount-sync 가 아임웹에 연결되어 있는지 확인해 주세요')
        tok, unit = m['token'], m['unitCode']
        cache_f = os.path.join(CACHE_DIR, f'imweb_{site}.json')
        cache = read_json(cache_f, {})
        out, page = [], 1
        while True:
            d = self._get(tok, '/products', {'page': page, 'limit': 100, 'unitCode': unit})
            lst = d.get('list') or []
            for p in lst:
                no = str(p.get('prodNo'))
                skus = set()
                if p.get('skuNoOption'):
                    skus.add(str(p['skuNoOption']).strip())
                c = cache.get(no)
                if c and c.get('editTime') == p.get('editTime'):
                    skus.update(c.get('opt', []))
                else:
                    opt = set()
                    if p.get('optionMixType') or not p.get('skuNoOption'):
                        op = 1
                        while True:
                            try:
                                od = self._get(tok, f'/products/{no}/option-details', {'page': op, 'limit': 100, 'unitCode': unit})
                            except RuntimeError as e:
                                if ' 404 ' in str(e) or ' 400 ' in str(e):
                                    break
                                raise
                            for o in od.get('list') or []:
                                if o.get('stockSku'):
                                    opt.add(str(o['stockSku']).strip())
                            if op >= int(od.get('totalPage') or 1):
                                break
                            op += 1
                            time.sleep(0.15)
                    cache[no] = {'editTime': p.get('editTime'), 'opt': sorted(opt)}
                    skus.update(opt)
                    time.sleep(0.15)
                out.append({'prodNo': no, 'name': p.get('name', ''), 'status': p.get('prodStatus', ''),
                            'custom': str(p.get('customProdCode') or '').strip(), 'skus': sorted(s for s in skus if s)})
            if progress:
                progress(f'{SITES[site]["name"]} 상품 {len(out)}개 확인')
            if page >= int(d.get('totalPage') or 1) or not lst:
                break
            page += 1
        write_json(cache_f, cache)
        return out

    def categories(self, site):
        if TEST_MODE:
            return [{'code': 'CATE384', 'name': '울프투스 > 드라이브트레인 파츠'}, {'code': 'CATE382', 'name': '울프투스 > 헤드셋'}]
        m = self.resolve().get(site)
        if not m:
            return []
        d = self._get(m['token'], '/products/shop-categories', {'unitCode': m['unitCode']})
        rows = []

        def walk(nodes, path):
            for n in nodes or []:
                p = path + [n.get('name', '')]
                rows.append({'code': n.get('categoryCode'), 'name': ' > '.join(p)})
                walk(n.get('children'), p)
        walk(d if isinstance(d, list) else d.get('list', []), [])
        return rows


IM = Imweb()


# ───────────────────────────── 브랜드 정보 ─────────────────────────────

WOLF_STORY = ('울프투스 컴포넌트(Wolf Tooth Components)는 2013년 미국 미네소타에서 세 명의 엔지니어가 시작한 브랜드입니다. '
              '1x 구동계 초창기에 체인이 빠지지 않는 내로우 와이드 체인링을 자체 CNC로 깎아 팔기 시작했고, 이후 드로퍼 리모트, 헤드셋, 바엔드 플러그, 멀티툴까지 라인업을 넓혔습니다. '
              '알루미늄 부품은 지금도 미네소타 공장에서 직접 가공하며, 모든 제품의 부품을 개별로 판매하는 Right to Repair 프로그램을 운영합니다. '
              '여덟 가지 아노다이즈드 컬러를 전 제품에 걸쳐 통일한 것도 울프투스의 특징으로, 작은 부품 몇 개로 빌드 전체의 톤을 맞출 수 있게 합니다. '
              '루비컴퍼니는 울프투스 제품을 정품으로 유통합니다.')

BRAND_SEED = {
    'WOLFTOOTH': {'ko': '울프투스', 'en': 'Wolf Tooth Components', 'site': 'https://www.wolftoothcomponents.com', 'platform': 'shopify',
                  'maker': 'WolfToothComponents', 'origin': '미국', 'story': WOLF_STORY, 'slug': 'wolftooth',
                  'cats': {'supply': '', 'workshop': ''}},
}


def brands():
    b = read_json(BRANDS_FILE, None)
    if b is None:
        b = json.loads(json.dumps(BRAND_SEED))
        write_json(BRANDS_FILE, b)
    return b


def brand_of(key):
    b = brands()
    for k, v in b.items():
        if fold(k) == fold(key):
            return v
    return {'ko': key.title(), 'en': key.title(), 'site': '', 'platform': '', 'maker': '', 'origin': '', 'story': '', 'slug': slug(key), 'cats': {}}


# ───────────────────────────── 점검 (이카운트 ↔ 아임웹) ─────────────────────────────

class Scanner:
    def __init__(self):
        self.lock = threading.Lock()
        self.state = {'running': False, 'msg': '', 'at': 0, 'error': ''}

    def start(self):
        with self.lock:
            if self.state['running']:
                return False
            self.state = {'running': True, 'msg': '시작', 'at': now(), 'error': ''}
        threading.Thread(target=self._run, daemon=True).start()
        return True

    def _progress(self, msg):
        self.state['msg'] = msg

    def _run(self):
        try:
            items, cat_at = ecount_items()
            site_skus, site_info = {}, {}
            for site in SITES:
                self._progress(f'{SITES[site]["name"]} 상품 읽는 중')
                prods = IM.products(site, self._progress)
                skus = set()
                customs = set()
                for p in prods:
                    skus.update(fold(s) for s in p['skus'])
                    if p['custom']:
                        customs.add(fold(p['custom']))
                site_skus[site] = skus
                site_info[site] = {'products': len(prods), 'skus': len(skus), 'customs': customs}
            self._progress('비교 중')
            fams = {}
            for it in items:
                code = str(it.get('code') or '').strip()
                if not code:
                    continue
                brand, base, opt = split_name(it.get('name'))
                key = family_key(brand, base)
                f = fams.setdefault(key, {'key': key, 'brand': brand, 'base': base, 'variants': []})
                on = {s: fold(code) in site_skus[s] for s in SITES}
                f['variants'].append({'code': code, 'name': it.get('name', ''), 'opt': opt, 'size': it.get('size', ''),
                                      'price': it.get('price') or 0, 'on': on})
            out = []
            for f in fams.values():
                f['variants'].sort(key=lambda v: v['code'])
                f['missing'] = {s: sum(1 for v in f['variants'] if not v['on'][s]) for s in SITES}
                # 일부 옵션만 사이트에 있으면 새 상품이 아니라 기존 상품에 옵션을 더해야 함
                f['partial'] = {s: 0 < f['missing'][s] < len(f['variants']) for s in SITES}
                if any(f['missing'].values()):
                    out.append(f)
            out.sort(key=lambda f: (fold(f['brand']), fold(f['base'])))
            result = {'at': now(), 'catalogAt': cat_at, 'families': out, 'itemCount': len(items),
                      'sites': {s: {'products': v['products'], 'skus': v['skus']} for s, v in site_info.items()}}
            write_json(SCAN_FILE, result)
            # 이미 사이트에 다 올라간 상품은 검토 상태를 '완료'로
            rv = Review.load()
            changed = False
            missing_keys = {f['key'] for f in out}
            for k, r in rv.items():
                if k not in missing_keys and r.get('status') in ('approved', 'built'):
                    r['status'] = 'uploaded'
                    r['at'] = now()
                    changed = True
            if changed:
                Review.save(rv)
            self.state.update(running=False, msg=f'상품 {len(out)}개에 미업로드 품목이 있습니다', at=now())
            log('점검 끝', len(out), '개 상품')
        except UserError as e:
            self.state.update(running=False, error=str(e), msg='')
        except Exception as e:
            log('점검 오류', type(e).__name__, e)
            traceback.print_exc()
            self.state.update(running=False, error=f'점검 중 오류가 났습니다: {str(e)[:200]}', msg='')


SCAN = Scanner()


class Review:
    lock = threading.Lock()

    @staticmethod
    def load():
        return read_json(REVIEW_FILE, {})

    @staticmethod
    def save(d):
        write_json(REVIEW_FILE, d)

    @classmethod
    def update(cls, keys, fields, user):
        with cls.lock:
            d = cls.load()
            for k in keys:
                r = d.setdefault(k, {'status': 'new'})
                r.update(fields)
                r['by'] = user.get('name') or user.get('email', '')
                r['at'] = now()
            cls.save(d)
            return d


def families_view(site_filter=''):
    scan = read_json(SCAN_FILE, None)
    if not scan:
        return {'scanned': False}
    rv = Review.load()
    fams = []
    for f in scan['families']:
        r = rv.get(f['key'], {})
        st = r.get('status', 'new')
        b = brand_of(f['brand'])
        fams.append(dict(f, status=st, note=r.get('note', ''), by=r.get('by', ''), reviewedAt=int(r.get('at', 0) * 1000),
                         hasDraft=bool(r.get('draft')), built=r.get('built', {}), brandKo=b.get('ko') or f['brand']))
    return {'scanned': True, 'at': int(scan['at'] * 1000), 'catalogAt': int(scan.get('catalogAt', 0) * 1000),
            'itemCount': scan.get('itemCount', 0), 'sites': scan.get('sites', {}), 'families': fams}


# ───────────────────────────── 공식 사이트 자료 ─────────────────────────────

def html_to_text(h):
    h = re.sub(r'(?is)<(script|style|noscript|svg|nav|footer|header)[^>]*>.*?</\1>', ' ', h or '')
    h = re.sub(r'(?i)<br\s*/?>|</(p|div|li|tr|h\d|table|ul|ol)>', '\n', h)
    h = re.sub(r'(?i)<li[^>]*>', '\n- ', h)
    h = re.sub(r'<[^>]+>', ' ', h)
    h = htmlmod.unescape(h)
    h = re.sub(r'[ \t\r\f\v]+', ' ', h)
    h = re.sub(r'\n\s*\n+', '\n', h)
    return h.strip()


def shopify_catalog(site):
    """쇼피파이 공식 사이트 상품 전체 (하루 캐시)"""
    host = urllib.parse.urlparse(site).netloc
    f = os.path.join(CACHE_DIR, f'shopify_{slug(host)}.json')
    c = read_json(f, None)
    if c and now() - c.get('at', 0) < 86400:
        return c['products']
    prods = []
    for page in range(1, 30):
        j = http(site.rstrip('/') + f'/products.json?limit=250&page={page}', timeout=40)
        lst = j.get('products') or []
        prods += [{'handle': p['handle'], 'title': p['title'], 'type': p.get('product_type', ''), 'tags': p.get('tags', [])} for p in lst]
        if len(lst) < 250:
            break
        time.sleep(0.5)
    write_json(f, {'at': now(), 'products': prods})
    return prods


STOP = set('the and for with to of a an in wt wolftooth wolf tooth service drivetrain bike components component mm inch'.split())


def words(s):
    return [w for w in re.findall(r'[a-z0-9]+', fold(s)) if w not in STOP and len(w) > 1]


def source_candidates(fam, limit=6):
    b = brand_of(fam['brand'])
    if not b.get('site') or b.get('platform') != 'shopify':
        return []
    base = set(words(fam['base']) + words(' '.join(v['opt'] for v in fam['variants'][:3])))
    scored = []
    for p in shopify_catalog(b['site']):
        tw = set(words(p['title'] + ' ' + p['handle'].replace('-', ' ')))
        if not tw:
            continue
        hit = len(base & tw)
        if hit:
            score = hit / (len(tw) ** 0.5) + (0.3 if 'replacement' not in p['handle'] and 'scratch' not in p['handle'] else -1)
            scored.append((score, p))
    scored.sort(key=lambda x: -x[0])
    return [{'url': b['site'].rstrip('/') + '/products/' + p['handle'], 'title': p['title']} for _, p in scored[:limit]]


def read_source(url):
    """공식 페이지 내용: {title, text, images:[{src, alt, variants}], options}"""
    u = urllib.parse.urlparse(url)
    if '/products/' in u.path:
        try:
            j = http(f'{u.scheme}://{u.netloc}{u.path.rstrip("/")}.json', timeout=30)
            p = j['product']
            vid = {v['id']: v['title'] for v in p.get('variants', [])}
            imgs = [{'src': i['src'], 'alt': i.get('alt') or '', 'w': i.get('width'), 'h': i.get('height'),
                     'variants': [vid.get(x, '') for x in i.get('variant_ids') or []]} for i in p.get('images', [])]
            vars_ = [{'title': v['title'], 'sku': v.get('sku', ''), 'grams': v.get('grams', 0), 'image': next((i['src'] for i in p.get('images', []) if i['id'] == v.get('image_id')), '')}
                     for v in p.get('variants', [])]
            text = html_to_text(p.get('body_html', ''))
            return {'title': p['title'], 'text': text[:14000], 'images': imgs, 'variants': vars_,
                    'options': [{'name': o['name'], 'values': o['values']} for o in p.get('options', [])]}
        except Exception:
            pass
    h = http_text(url)
    title = re.search(r'(?is)<title[^>]*>(.*?)</title>', h)
    imgs = []
    for m in re.finditer(r'(?i)<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)', h):
        imgs.append({'src': urllib.parse.urljoin(url, m.group(1)), 'alt': 'og:image', 'variants': []})
    for m in re.finditer(r'(?i)<img[^>]+src=["\']([^"\']+)["\'][^>]*>', h):
        src = urllib.parse.urljoin(url, m.group(1))
        if re.search(r'\.(jpe?g|png|webp)(\?|$)', src, re.I) and not re.search(r'logo|icon|sprite|badge|flag', src, re.I):
            alt = re.search(r'(?i)alt=["\']([^"\']*)', m.group(0))
            imgs.append({'src': src, 'alt': alt.group(1) if alt else '', 'variants': []})
    seen, uniq = set(), []
    for i in imgs:
        if i['src'] not in seen:
            seen.add(i['src'])
            uniq.append(i)
    return {'title': htmlmod.unescape(title.group(1).strip()) if title else url, 'text': html_to_text(h)[:14000],
            'images': uniq[:30], 'variants': [], 'options': []}


# ───────────────────────────── Claude 초안 ─────────────────────────────

HOUSE_RULES = """루비컴퍼니(루비서플라이·루비워크샵) 상품 상세 아코디언 문구 규칙
- 문장은 존댓말 "입니다/합니다" 체. 짧고 담백한 에세이 톤. 과장·감탄 표현, 이모지 금지
- 줄표(—, –) 금지. 쉼표나 마침표로 바꿈
- 공식 자료에 없는 수치·사실은 지어내지 말 것. 모르면 그 줄을 빼기
- 브랜드·부품 한글 표기: Wolf Tooth 울프투스, MKS 엠케이에스, Spurcycle 스퍼사이클, Growtac 그로우택, Schmolke 쉬몰케, Extralite 엑스트라라이트, QUOC 쿽, YOHEMITE 요헤미티
- 'TOP' 부품 명칭은 '탑'(탑 튜브), 마감은 '피니시', 체인링 잇수·치형은 '티스'(34T), 소형 휠 자전거는 '미니벨로'
- '한국 공식 수입사' 대신 '한국 공식 디스트리뷰터'
- 컬러 한글: Black 블랙, Raw Silver 로우실버, Silver 실버, Ultraviolet Purple 퍼플, Purple 퍼플, Espresso 에스프레소, Olive 올리브, Gold 골드, Blue 블루, Red 레드, Orange 오렌지, Green 그린, Teal 틸, Gray/Grey 그레이, Shadow Gray 섀도 그레이
- 단위는 숫자와 붙여 씀(15g, 2~3Nm, 29.8mm). 인치는 '1 1/8인치'
"""

DRAFT_SCHEMA = """다음 JSON 하나만 출력 (코드블록·설명 없이):
{
 "name": "사이트 상품명. '{브랜드 한글} ' 로 시작하는 한글 상품명. 특수문자는 공백·하이픈·괄호·마침표만",
 "en": "영문 제품명 (h3 제목, 브랜드 영문 포함)",
 "ko": "h3 옆 한글 부제 (보통 상품명과 같게)",
 "summary": "제품 요약 한 문단 (3~4문장)",
 "specs": [["브랜드","{브랜드 영문} ({브랜드 한글}, {국가})"], ["용도","..."], ["규격","..."], ["소재","..."], ["무게","..."], ["원산지","..."]],
 "features": [["짧은 제목 마침표로 끝.", "두세 문장 설명"], ... 4개],
 "install": [["항목","설명 문장"], ... 3~5개 (호환, 장착, 공구, 토크 등)],
 "note": "※ 다음에 올 주석 한 문장 (판매 단위, 별도 상품, 포함 안 되는 것)",
 "optName": "필수 옵션명 (예: 컬러, 사이즈, 스핀들 컬러). 옵션이 하나뿐이면 빈 문자열",
 "variants": {"이카운트 품목코드": "옵션값 한글 라벨 (예: 30mm - 로우실버, 블랙, 34T)", ...},
 "weight": 포장 포함 배송 무게 kg 숫자 (예: 0.13),
 "brandStory": "브랜드 이야기 한 문단 (브랜드 정보에 이미 있으면 빈 문자열)",
 "image": 대표 이미지로 쓸 이미지 번호 (0부터, 흰 배경 제품 단독 사진 우선, 블랙 컬러 우선)
}
"""


def claude(system, user, max_tokens=4000):
    if not ANTHROPIC_KEY:
        raise UserError('upload.env 에 ANTHROPIC_API_KEY 가 없습니다. 초안 만들기는 Claude API 키가 있어야 합니다')
    body = {'model': CLAUDE_MODEL, 'max_tokens': max_tokens, 'system': system,
            'messages': [{'role': 'user', 'content': user}]}
    try:
        j = http('https://api.anthropic.com/v1/messages', 'POST',
                 {'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01'}, body, timeout=150)
    except urllib.error.HTTPError as e:
        msg = ''
        try:
            msg = json.loads(e.read().decode('utf-8')).get('error', {}).get('message', '')
        except Exception:
            pass
        raise UserError(f'Claude API 오류 ({e.code}) {msg[:200]}')
    text = ''.join(c.get('text', '') for c in j.get('content', []) if c.get('type') == 'text')
    m = re.search(r'\{.*\}', text, re.S)
    if not m:
        raise UserError('Claude 응답에서 초안을 읽지 못했습니다. 다시 시도해 주세요')
    return json.loads(m.group(0))


COLOR_KO = {'ultraviolet purple': '퍼플', 'classic purple': '퍼플', 'raw silver': '로우실버', 'shadow gray': '섀도 그레이', 'shadow grey': '섀도 그레이',
            'black': '블랙', 'blue': '블루', 'red': '레드', 'orange': '오렌지', 'gold': '골드', 'purple': '퍼플', 'silver': '실버', 'green': '그린',
            'grey': '그레이', 'gray': '그레이', 'espresso': '에스프레소', 'olive': '올리브', 'teal': '틸', 'pink': '핑크', 'yellow': '옐로우',
            'white': '화이트', 'gunmetal': '건메탈', 'brown': '브라운', 'navy': '네이비'}


def ko_opt(opt):
    """Claude 가 옵션 표기를 주지 않았을 때 쓰는 기본 표기: 컬러는 한글로, 사이즈는 소문자 mm"""
    s = str(opt or '').strip()
    for en in sorted(COLOR_KO, key=len, reverse=True):
        s = re.sub(r'(?i)\b' + re.escape(en) + r'\b', COLOR_KO[en], s)
    s = re.sub(r'(?i)(\d)\s?MM\b', r'\1mm', s)
    s = re.sub(r'(?i)\bfor shimano\b', '시마노', s)
    s = re.sub(r'(?i)\bfor sram\b', '스램', s)
    return re.sub(r'\s+', ' ', s).strip()


def make_draft(fam, url):
    b = brand_of(fam['brand'])
    src = read_source(url)
    img_list = '\n'.join(f'{i}: {im.get("alt") or ""} {("variants: " + ", ".join(im["variants"][:4])) if im.get("variants") else ""}'
                         for i, im in enumerate(src['images'][:25]))
    var_list = '\n'.join(f'{v["code"]} | {v["name"]} | 규격 {v.get("size") or "-"} | 이카운트 단가 {v.get("price") or "-"}'
                         for v in fam['variants'])
    user = f"""브랜드 정보: {b.get('en') or fam['brand']} / 한글 {b.get('ko') or ''} / 원산지 {b.get('origin') or '자료 기준'}
기존 브랜드 이야기: {b.get('story') or '(없음, brandStory 를 써 주세요)'}

이카운트 품목 (이 상품으로 묶을 옵션들):
{var_list}

공식 페이지: {url}
제목: {src['title']}
옵션: {json.dumps(src.get('options', []), ensure_ascii=False)}
공식 변형(무게 g): {json.dumps([(v['title'], v.get('grams')) for v in src.get('variants', [])][:30], ensure_ascii=False)}
이미지 목록:
{img_list or '(없음)'}

공식 설명:
{src['text']}

{DRAFT_SCHEMA}"""
    d = claude(HOUSE_RULES + '\n당신은 루비컴퍼니의 상품 상세 문구 담당자입니다. 공식 자료만 근거로 씁니다.', user)
    pick = d.get('image')
    imgs = src['images']
    sel = imgs[pick]['src'] if isinstance(pick, int) and 0 <= pick < len(imgs) else (imgs[0]['src'] if imgs else '')
    # 기본으로는 어느 한 사이트에라도 없는 옵션만 넣음 (이미 올라간 옵션은 빼 둠)
    variants = [{'code': v['code'], 'label': str((d.get('variants') or {}).get(v['code']) or ko_opt(v['opt']) or v['code']),
                 'include': not all(v['on'].values()), 'price': v.get('price') or 0} for v in fam['variants']]
    draft = {
        'name': d.get('name') or f'{b.get("ko", "")} {fam["base"]}'.strip(),
        'en': d.get('en', ''), 'ko': d.get('ko') or d.get('name', ''),
        'summary': d.get('summary', ''),
        'specs': d.get('specs') or [], 'features': d.get('features') or [], 'install': d.get('install') or [],
        'note': d.get('note', ''), 'optName': d.get('optName', ''),
        'variants': variants, 'weight': d.get('weight') or 0.1,
        'price': max((v.get('price') or 0) for v in fam['variants']) if fam['variants'] else 0,
        'image': sel, 'images': [{'src': i['src'], 'alt': i.get('alt', '')} for i in imgs[:30]],
        'trimCaption': True,
        'source': {'url': url, 'title': src['title']},
        'cats': dict(b.get('cats') or {}),
        'model': CLAUDE_MODEL, 'madeAt': now(),
    }
    if d.get('brandStory') and not b.get('story'):
        draft['brandStory'] = d['brandStory']
    return draft


# ───────────────────────────── 아코디언 HTML ─────────────────────────────

E = htmlmod.escape


def nl2p(s):
    return E(str(s or '')).replace('\n', '<br>')


# v5 (루비서플라이 스타일, 오늘까지 쓰던 rb-sum details 구조)
V5 = {
    'th1': 'width:28%; background:#f7f7f7; border-bottom:1px solid #e3e3e3; padding:10px 12px; text-align:left; font-weight:600; color:#222;',
    'th': 'background:#f7f7f7; border-bottom:1px solid #e3e3e3; padding:10px 12px; text-align:left; font-weight:600; color:#222;',
    'td': 'border-bottom:1px solid #e3e3e3; padding:10px 12px;',
    'sum': 'list-style:none; cursor:pointer; display:block; position:relative; width:100%; padding:20px 30px 20px 2px; font-size:13px; font-weight:600; letter-spacing:.18em; text-transform:uppercase;',
    'body': 'padding:2px 2px 30px; font-size:14px; line-height:1.8; color:#555;',
    'table': 'width:100%; border-collapse:collapse; font-size:14px; color:#333; line-height:1.6; border-top:2px solid #222;',
}

SHIP_LINES = [
    ('배송', '평일 오후 3시 이전 결제 건은 당일 출고를 원칙으로 합니다. 주문 제작 및 예약 상품은 상품 페이지의 안내 일정을 따릅니다.'),
    ('교환/반품', '수령 후 7일 이내, 미사용·미장착 상태에 한해 가능합니다. 장착 흔적이 있는 부품, 커팅된 케이블류, 착화 흔적이 있는 슈즈는 교환/반품이 제한됩니다. 규격이나 호환 여부가 애매하시면 장착 전에 먼저 문의해 주세요.'),
    ('A/S', '루비컴퍼니가 수입·유통하는 전 제품은 공식 수입원 정품 보증을 받습니다. 초기 불량 및 보증 범위 내 이슈는 루비 워크샵에서 직접 점검하고, 필요 시 본사 절차를 대행합니다.'),
]
MAINT = ('정비', '보수 부품과 정비 문의는 루비컴퍼니를 통해 받을 수 있습니다.')
CHANGE = '표기된 사항은 품질 개선 및 부품 수급 일정에 따라 변경될 수 있습니다.'


def v5_table(rows, extra=''):
    trs = ''.join(f'<tr><th style="{V5["th1"] if i == 0 else V5["th"]}">{E(str(k))}</th><td style="{V5["td"]}">{nl2p(v)}</td></tr>'
                  for i, (k, v) in enumerate(rows))
    return f'<table style="{V5["table"]}{extra}"><tbody>{trs}</tbody></table>'


def v5_sec(title, inner, first=False):
    d = 'open="" style="border-top:1px solid #e4e1dd; border-bottom:1px solid #e4e1dd;"' if first else 'style="border-bottom:1px solid #e4e1dd;"'
    return f'<div class="rb-sum"><details {d}><summary class="rb-summary" style="{V5["sum"]}">&nbsp;{E(title)}&nbsp;&nbsp;</summary>{inner}</details></div>'


def render_v5(dr, story):
    feats = dr.get('features') or []
    fp = ''.join(f'<p style="margin:0{" 0 10px" if i < len(feats) - 1 else ""};"><strong style="color:#222;">{E(str(h))}</strong> {nl2p(t)}</p>'
                 for i, (h, t) in enumerate(feats))
    install = [tuple(r) for r in dr.get('install') or []]
    if not any(k == '정비' for k, _ in install):
        install.append(MAINT)
    parts = [
        v5_sec('제품 요약', f'<div class="rb-body" style="{V5["body"]}"><p>{nl2p(dr.get("summary"))}</p></div>', True),
        v5_sec('제품 특징', f'<h3 style="font-size:17px; font-weight:700; color:#222; margin:24px 0 10px; letter-spacing:-0.3px;">{E(dr.get("en", ""))} '
                         f'<span style="font-size:13px; font-weight:400; color:#888;">{E(dr.get("ko", ""))}</span></h3>' + v5_table(dr.get('specs') or [])
               + f'<div class="rb-body" style="padding:20px 2px 30px; font-size:14px; line-height:1.8; color:#555;">{fp}</div>'),
        v5_sec('장착 및 호환성 안내', f'<div class="rb-body" style="{V5["body"]}">' + v5_table(install, ' margin-top:20px;')
               + f'<p style="font-size:12px; color:#999; margin:16px 0 0; line-height:1.6;">※ {E(dr.get("note", ""))} {CHANGE}</p></div>'),
    ]
    if story:
        parts.append(v5_sec('브랜드 이야기', f'<div class="rb-body" style="{V5["body"]}"><p>{nl2p(story)}</p></div>'))
    ship = ''.join(f'<p style="margin:{"0 0 10px" if i < 2 else "0"};"><strong style="color:#222;">{k}</strong>&nbsp; {v}</p>' for i, (k, v) in enumerate(SHIP_LINES))
    parts.append(v5_sec('배송 · 교환/반품 · A/S', f'<div class="rb-body" style="{V5["body"]}">{ship}</div>'))
    return '\n'.join(parts)


# v6 (루비워크샵, 포털 아코디언 V6 앱과 같은 모양: rb-acc, 끝에 제품 상담·워런티)
V6 = {
    'wrap': 'margin:0;padding:0;border-bottom:1px solid #e3e3e3;font-family:inherit;font-weight:400;letter-spacing:-0.3px;text-align:left;',
    'det': 'margin:0;padding:0;border-top:1px solid #e3e3e3;',
    'sum': 'display:flex;justify-content:space-between;align-items:center;gap:16px;margin:0;padding:18px 0;list-style:none;cursor:pointer;font-size:15px;line-height:22px;font-weight:400;color:#101114;',
    'arrow': 'flex:0 0 auto;',
    'body': 'margin:0;padding:0 0 22px;font-size:14px;line-height:23px;font-weight:400;color:#4a4b4f;word-break:keep-all;overflow-wrap:break-word;',
    'p': 'margin:0 0 12px;',
    'table': 'width:100%;margin:0 0 12px;border-collapse:collapse;border-top:1px solid #eeeeee;',
    'th': 'width:34%;padding:9px 12px 9px 0;border-bottom:1px solid #eeeeee;text-align:left;vertical-align:top;font-size:14px;line-height:21px;font-weight:400;color:#6e6f73;',
    'td': 'padding:9px 0;border-bottom:1px solid #eeeeee;text-align:left;vertical-align:top;font-size:14px;line-height:21px;font-weight:400;color:#101114;',
    'note': 'margin:0 0 12px;font-size:13px;line-height:20px;color:#8a8b8f;',
    'btn': 'display:inline-block;margin:4px 0 0;padding:10px 16px;border:1px solid #101114;color:#101114;background:#ffffff;text-decoration:none;font-size:14px;line-height:20px;font-weight:400;',
}


def v6_last(blocks):
    """마지막 블록의 아래 여백을 0으로 (아코디언 V6 앱과 같게)"""
    if blocks:
        blocks[-1] = blocks[-1].replace('margin:0 0 12px;', 'margin:0;', 1)
    return blocks


def v6_table(rows):
    trs = '\n'.join(f'        <tr><th scope="row" style="{V6["th"]}">{E(str(k))}</th><td style="{V6["td"]}">{nl2p(v) or "&nbsp;"}</td></tr>' for k, v in rows)
    return f'      <table style="{V6["table"]}">\n        <tbody>\n{trs}\n        </tbody>\n      </table>'


def v6_item(title, blocks, open_=False):
    inner = '\n'.join(v6_last(list(blocks)))
    return (f'  <details class="rb-sum" style="{V6["det"]}"{" open" if open_ else ""}>\n'
            f'    <summary class="rb-summary" style="{V6["sum"]}">{E(title)}<span class="rb-arrow" style="{V6["arrow"]}"></span></summary>\n'
            f'    <div class="rb-body" style="{V6["body"]}">\n{inner}\n    </div>\n  </details>')


def render_v6(dr, story, brand_ko):
    P = lambda t: f'      <p style="{V6["p"]}">{nl2p(t)}</p>'
    feats = [f'      <p style="{V6["p"]}">{E(str(h))} {nl2p(t)}</p>' for h, t in dr.get('features') or []]
    install = [tuple(r) for r in dr.get('install') or []]
    items = [
        v6_item('제품 요약', [P(dr.get('summary'))], True),
        v6_item('제품 특징', [P(f'{dr.get("en", "")} · {dr.get("ko", "")}'), v6_table(dr.get('specs') or [])] + feats),
        v6_item('장착 및 호환성 안내', [v6_table(install), f'      <p style="{V6["note"]}">※ {E(dr.get("note", ""))} {CHANGE}</p>']),
    ]
    if story:
        items.append(v6_item('브랜드 이야기', [P(story)]))
    items.append(v6_item('배송 · 교환/반품 · A/S', [f'      <p style="{V6["p"]}">{E(k)}&nbsp; {E(v)}</p>' for k, v in SHIP_LINES]))
    for title, text, label, url in (
        ('제품 상담', '사이즈, 호환, 다른 제품과의 조합이 궁금하시면 AI 제품 상담에서 바로 물어보실 수 있습니다. 루비워크샵 모델·스펙 자료로 답하며, 필요하면 직원 상담으로 이어집니다.', 'AI 제품 상담 열기', CONSULT_URL),
        ('워런티', '제조사 공식 워런티 기준으로 보증합니다. 브랜드별 보증 기간과 범위, 접수 방법은 워런티 페이지에서 확인하실 수 있습니다.', '워런티 확인하기', WARRANTY_URL),
    ):
        items.append(v6_item(title, [f'      <p style="margin:0 0 14px;">{E(text)}</p>',
                                     f'      <a href="{E(url)}" target="_blank" rel="noopener" style="{V6["btn"]}">{E(label)}</a>']))
    nm = dr.get('name', '')
    label = (nm if brand_ko and nm.startswith(brand_ko) else f'{brand_ko} {nm}').strip().replace('--', '-')
    return f'<!-- Rubi accordion v6 · {E(label)} -->\n<div class="rb-acc" style="{V6["wrap"]}">\n' + '\n'.join(items) + '\n</div>'


SUPPLY_DETAIL = ('<div><p><br></p><p><span style="font-size: 20px;"><strong>배송 안내사항</strong></span></p><p><span style="font-size: 16px;"><br>'
                 '- 루비서플라이 제품은 상태를 꼼꼼하게 검수 후 포장을 진행합니다.<br>- 상품배송은 월요일부터 금요일까지 진행합니다. 단, 모든 배송은 택배사 사정으로 지연될 수 있습니다.<br>'
                 '- 당일 오후 3시 이전 결제완료된 건에 대해 당일 출고를 원칙으로 합니다.<br><br></span><span style="font-size: 20px;"><strong>반품 및 교환</strong></span><span style="font-size: 16px;"><br><br>'
                 '- 구매자 단순 변심은 상품 수령 후 7일 이내 (구매자 반품 배송비 부담)</span><br><span style="font-size: 16px;">- 표시/광고와 상이, 계약 내용과 다르게 이행된 경우 상품 수령 후 3개월 이내 혹은 표시/광고와 다른 사실을 안 날로부터 30일 이내<br></span>'
                 '<span style="font-size: 20px;"><strong><br>반품 및 교환이 불가한 경우</strong></span><span style="font-size: 16px;"><br><br>- 반품 요청기간이 지난 경우</span><br>'
                 '<span style="font-size: 16px;">- 구매자의 책임 있는 사유로 상품 등이 멸실 또는 훼손된 경우</span><br><span style="font-size: 16px;">- 구매자의 책임 있는 사유로 포장이 훼손되어 상품 가치가 현저히 상실된 경우</span><br>'
                 '<span style="font-size: 16px;">- 구매자의 사용 또는 일부 소비에 의하여 상품의 가치가 현저히 감소한 경우</span><br><span style="font-size: 16px;">- 시간의 경과에 의하여 재판매가 곤란할 정도로 상품 등의 가치가 현저히 감소한 경우</span><br>'
                 '<span style="font-size: 16px;">- 고객의 요청사항에 맞춰 제작이 들어가는 맞춤제작상품의 경우</span><br><span style="font-size: 16px;">- 복제가 가능한 상품 등의 포장을 훼손한 경우</span><br>'
                 '<span style="font-size: 16px;"><br><br></span><span style="font-size: 20px;"><strong>택배사 및 세부사항</strong></span><span style="font-size: 16px;"><br><br>- 택배사: 로젠택배<br>- 무료배송: 주문금액 10만원 이상<br>'
                 '- 반품배송비 : 3000원 (최초 배송비 무료인 경우 6,000원 부과)<br>- 교환배송비 : 6000원<br>- 반품 교환지: 서울시 서초구 신반포로 320 루비빌딩 루비컴퍼니 딜리버리 스테이션</span></p></div>')


# ───────────────────────────── 대표 이미지 ─────────────────────────────

def process_image(src, trim_caption=True):
    """1000×1000 흰 배경 JPG. 제품 외곽 기준 가운데, 사방 최소 10% 여백. 제품 아래 짧은 글자 띠(설명 문구)는 지움"""
    from PIL import Image, ImageChops
    b, _ = http(src, raw=True, timeout=60)
    im = Image.open(io.BytesIO(b))
    im.load()
    im = im.convert('RGBA')
    bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
    bg.alpha_composite(im)
    im = bg.convert('RGB')
    W, H = im.size
    mask = ImageChops.difference(im, Image.new('RGB', im.size, 'white')).convert('L').point(lambda v: 255 if v > 18 else 0)
    if trim_caption:
        px = mask.load()
        rows = [any(px[x, y] for x in range(0, W, 2)) for y in range(H)]
        bands, s = [], None
        for y, r in enumerate(rows + [False]):
            if r and s is None:
                s = y
            if not r and s is not None:
                bands.append((s, y))
                s = None
        if len(bands) > 1:
            big = max(range(len(bands)), key=lambda i: bands[i][1] - bands[i][0])
            cut = None
            for i in range(big + 1, len(bands)):
                h = bands[i][1] - bands[i][0]
                gap = bands[i][0] - bands[i - 1][1]
                if h < 0.09 * H and (i > big + 1 or gap > 0.03 * H):
                    cut = bands[i][0] if cut is None else cut
                else:
                    cut = None
                    break
            if cut:
                im = im.crop((0, 0, W, cut))
                mask = mask.crop((0, 0, W, cut))
    box = mask.getbbox()
    if not box:
        raise UserError('이미지에서 제품을 찾지 못했습니다')
    obj = im.crop(box)
    cur = max(obj.size) * IMG_SIZE / max(W, H)
    tgt = min(IMG_SIZE * IMG_FILL, cur)
    sc = tgt / max(obj.size)
    obj = obj.resize((max(1, round(obj.width * sc)), max(1, round(obj.height * sc))), Image.LANCZOS)
    can = Image.new('RGB', (IMG_SIZE, IMG_SIZE), 'white')
    can.paste(obj, ((IMG_SIZE - obj.width) // 2, (IMG_SIZE - obj.height) // 2))
    out = io.BytesIO()
    can.save(out, 'JPEG', quality=92)
    return out.getvalue()


# ───────────────────────────── 엑셀 만들기 ─────────────────────────────

def stock_of(code, session):
    """재고 조회 서비스에 품목 하나의 창고 재고를 물어봄 → MAIN_WH 수량 (모르면 None)"""
    if TEST_MODE:
        return read_json(os.path.join(DATA_DIR, 'test_stock.json'), {}).get(code)
    try:
        j = http(f'{STOCK_URL}/stock?code={urllib.parse.quote(code)}', headers={'X-MyRubi-Session': session}, timeout=60)
        if j.get('ok'):
            for r in j.get('rows') or []:
                if r.get('wh') == MAIN_WH:
                    return max(0, int(r.get('qty') or 0))
            return 0
    except Exception as e:
        log('재고 조회 실패', code, str(e)[:100])
    return None


def img_slug(name, b):
    """이미지 파일명용 제품 이름: 브랜드 이름을 빼고 소문자·하이픈 (MKØ → mk0)"""
    s = str(name or '').replace('Ø', '0').replace('ø', '0')
    for w in {b.get('en', ''), b.get('ko', ''), 'Wolf Tooth', 'Components'}:
        if w:
            s = re.sub(re.escape(w), ' ', s, flags=re.I)
    return slug(s)[:50].strip('-') or 'item'


def family_code(variants):
    """자체 상품코드: 옵션이 하나면 그 품목코드, 여럿이면 품목코드의 공통 앞부분 (끝의 0 과 - 는 뺌)"""
    codes = [v['code'] for v in variants]
    if len(codes) == 1:
        return codes[0]
    pre = os.path.commonprefix(codes).rstrip('0').rstrip('-')
    return pre if len(pre) >= 4 else codes[0]


def build(site, keys, user, session):
    from openpyxl import load_workbook
    if site not in SITES:
        raise UserError('사이트를 골라 주세요')
    rv = Review.load()
    scan = read_json(SCAN_FILE, {'families': []})
    fams = {f['key']: f for f in scan.get('families', [])}
    todo = []
    for k in keys:
        r = rv.get(k) or {}
        if not r.get('draft'):
            raise UserError('초안이 없는 상품이 있습니다. 먼저 초안을 만들어 주세요')
        todo.append((k, r, fams.get(k)))
    if not todo:
        raise UserError('엑셀로 만들 상품을 골라 주세요')

    wb = load_workbook(TEMPLATE)
    ws = wb.worksheets[0]
    col = {}
    for c in range(1, ws.max_column + 1):
        v = ws.cell(1, c).value
        if v:
            col[str(v).strip()] = c
    need = ['상품명', '자체 상품코드', '카테고리ID', '요약설명', '판매상태', '상품상태', '판매가', '무게', '재고사용', '재고수량',
            'SKU(재고번호)', '대표 이미지 파일명', '상품 상세정보', '세금', '원산지', '제조사', '브랜드', '배송방법',
            '상품구매시 적립금 지급 단위', '할인적용대상', '할인금액 단위', '옵션형태', '필수 옵션명', '필수 옵션값', '필수 옵션가', '옵션 재고수량']
    miss = [n for n in need if n not in col]
    if miss:
        raise UserError('엑셀 양식(template.xlsx)에서 열을 찾지 못했습니다: ' + ', '.join(miss))

    stamp = kst().strftime('%Y%m%d-%H%M')
    tag = 'rubisupply' if site == 'supply' else 'rubiworkshop'
    out_id = f'{tag}_{stamp}_{hashlib.sha1(("".join(keys) + str(now())).encode()).hexdigest()[:6]}'
    work = os.path.join(OUT_DIR, out_id)
    os.makedirs(os.path.join(work, 'images'), exist_ok=True)
    row = 4
    report = []
    for k, r, fam in todo:
        dr = r['draft']
        b = brand_of(fam['brand'] if fam else dr.get('brand', ''))
        brand_ko = b.get('ko') or ''
        story = b.get('story') or dr.get('brandStory', '')
        cats = (dr.get('cats') or {}).get(site) or (b.get('cats') or {}).get(site) or ''
        if not cats:
            raise UserError(f'"{dr.get("name")}" 의 {SITES[site]["name"]} 카테고리ID가 비어 있습니다')
        variants = [v for v in dr.get('variants') or [] if v.get('include', True)]
        if not variants:
            raise UserError(f'"{dr.get("name")}" 에 넣을 옵션이 없습니다')
        price = int(dr.get('price') or max(int(v.get('price') or 0) for v in variants))
        img_name = f'rubi-{b.get("slug") or slug(fam["brand"] if fam else "brand")}-thumbnail-{dr.get("imgSlug") or img_slug(dr.get("en") or dr.get("name"), b)}-01.jpg'
        if dr.get('image'):
            try:
                with open(os.path.join(work, 'images', img_name), 'wb') as fh:
                    fh.write(process_image(dr['image'], dr.get('trimCaption', True)))
            except Exception as e:
                report.append(f'{dr.get("name")}: 이미지를 만들지 못했습니다 ({str(e)[:80]})')
        else:
            report.append(f'{dr.get("name")}: 대표 이미지가 없습니다')
        qty = [stock_of(v['code'], session) for v in variants]
        if any(q is None for q in qty):
            report.append(f'{dr.get("name")}: 재고를 읽지 못한 옵션은 0으로 넣었습니다')
        qty = [q or 0 for q in qty]

        def put(name, val):
            ws.cell(row, col[name]).value = val
        put('상품명', dr.get('name'))
        put('자체 상품코드', dr.get('code') or family_code(variants))
        put('카테고리ID', cats)
        put('요약설명', render_v5(dr, story) if site == 'supply' else render_v6(dr, story, brand_ko))
        put('판매상태', '판매중')
        put('상품상태', '신상품')
        put('판매가', price)
        put('무게', float(dr.get('weight') or 0.1))
        put('재고사용', 'Y')
        put('대표 이미지 파일명', img_name)
        if site == 'supply':
            put('상품 상세정보', SUPPLY_DETAIL)
            put('상품구매시 적립금 지급 단위', '원')
            put('할인적용대상', 'B')
            put('할인금액 단위', 'B')
        put('세금', '과세상품')
        put('원산지', b.get('origin') or '')
        put('제조사', (b.get('maker') or '').replace(' ', ''))
        put('브랜드', brand_ko)
        put('배송방법', '\n')
        if len(variants) == 1 and not dr.get('optName'):
            put('재고수량', qty[0])
            put('SKU(재고번호)', variants[0]['code'])
        else:
            put('옵션형태', '조합형')
            put('필수 옵션명', dr.get('optName') or '옵션')
            put('필수 옵션값', ','.join(str(v['label']).replace(',', ' ') for v in variants))
            put('필수 옵션가', ','.join(str(int(v.get('price') or price)) for v in variants))
            put('옵션 재고수량', ','.join(str(q) for q in qty))
        row += 1
    xlsx = os.path.join(work, f'{out_id}.xlsx')
    wb.save(xlsx)
    zpath = os.path.join(OUT_DIR, f'{out_id}.zip')
    with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
        z.write(xlsx, os.path.basename(xlsx))
        for n in sorted(os.listdir(os.path.join(work, 'images'))):
            z.write(os.path.join(work, 'images', n), 'images/' + n)
    shutil.rmtree(work, ignore_errors=True)
    with Review.lock:
        d = Review.load()
        for k, _, _ in todo:
            r = d.setdefault(k, {})
            r['status'] = 'built'
            r.setdefault('built', {})[site] = {'at': now(), 'file': out_id, 'by': user.get('name', '')}
        Review.save(d)
    # 오래된 결과물 정리 (14일)
    for n in os.listdir(OUT_DIR):
        p = os.path.join(OUT_DIR, n)
        if os.path.isfile(p) and now() - os.path.getmtime(p) > 14 * 86400:
            os.remove(p)
    return {'id': out_id, 'file': out_id + '.zip', 'count': len(todo), 'notes': report}


# ───────────────────────────── 포털 로그인 확인 ─────────────────────────────

_auth = {}
_auth_lock = threading.Lock()


def portal_user(token):
    if TEST_MODE:
        return {'name': '테스트', 'email': 'test@rubiworkshop.com'}
    if not token or len(token) > 200:
        return None
    with _auth_lock:
        c = _auth.get(token)
    if c and now() - c[0] < (AUTH_TTL if c[1] else 30):
        return c[1]
    if not PORTAL_API_URL:
        raise RuntimeError('upload.env 에 PORTAL_API_URL 이 없습니다')
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
    server_version = 'MyRubiUpload/1'

    def log_message(self, fmt, *args):
        pass

    def _cors(self):
        if self.headers.get('Origin') == ALLOWED_ORIGIN:
            self.send_header('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
            self.send_header('Access-Control-Expose-Headers', 'Content-Disposition')
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

    def _file(self, path, name):
        with open(path, 'rb') as f:
            data = f.read()
        self.send_response(200)
        self._cors()
        self.send_header('Content-Type', 'application/zip')
        self.send_header('Content-Disposition', f'attachment; filename="{name}"')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'X-MyRubi-Session, Content-Type')
        self.send_header('Access-Control-Max-Age', '86400')
        self.end_headers()

    def _body(self):
        n = int(self.headers.get('Content-Length') or 0)
        if n > 5_000_000:
            raise UserError('보낸 내용이 너무 큽니다')
        raw = self.rfile.read(n) if n else b''
        return json.loads(raw.decode('utf-8')) if raw else {}

    def _route(self, method):
        u = urllib.parse.urlparse(self.path)
        path, qs = u.path.rstrip('/') or '/', urllib.parse.parse_qs(u.query)
        q = lambda k: (qs.get(k) or [''])[0]
        if path == '/' and q('r'):
            path = '/' + q('r')
        origin = self.headers.get('Origin')
        if origin and origin != ALLOWED_ORIGIN:
            return self._json(403, {'ok': False, 'error': 'origin_not_allowed'})
        if path in ('/', '/health') and method == 'GET':
            return self._json(200, {'ok': True, 'service': 'my-rubi-upload'})
        session = self.headers.get('X-MyRubi-Session', '') or q('s')
        try:
            user = portal_user(session)
        except RuntimeError as e:
            return self._json(502, {'ok': False, 'error': str(e)})
        if not user:
            return self._json(401, {'ok': False, 'error': 'unauthorized'})
        try:
            if path == '/status' and method == 'GET':
                try:
                    m = IM.resolve()
                except Exception:
                    m = {}
                try:
                    items, cat_at = ecount_items()
                    cat = {'count': len(items), 'at': int(cat_at * 1000)}
                except UserError as e:
                    cat = {'count': 0, 'error': str(e)}
                return self._json(200, {'ok': True, 'scan': SCAN.state, 'catalog': cat, 'claude': bool(ANTHROPIC_KEY), 'model': CLAUDE_MODEL,
                                        'sites': {s: {'name': v['name'], 'connected': s in m, 'where': (m.get(s) or {}).get('where', ''),
                                                      'error': IM.last_error.get(s, '')} for s, v in SITES.items()}})
            if path == '/scan' and method == 'POST':
                started = SCAN.start()
                return self._json(200, {'ok': True, 'started': started, 'scan': SCAN.state})
            if path == '/families' and method == 'GET':
                return self._json(200, dict(ok=True, scan=SCAN.state, **families_view()))
            if path == '/review' and method == 'POST':
                b = self._body()
                st = b.get('status')
                if st not in ('new', 'approved', 'hold', 'excluded'):
                    raise UserError('상태를 확인해 주세요')
                fields = {'status': st}
                if 'note' in b:
                    fields['note'] = str(b.get('note') or '')[:300]
                Review.update([str(k) for k in b.get('keys') or []][:500], fields, user)
                return self._json(200, dict(ok=True, **families_view()))
            if path == '/item' and method == 'GET':
                k = q('key')
                r = Review.load().get(k, {})
                fam = next((f for f in read_json(SCAN_FILE, {'families': []})['families'] if f['key'] == k), None)
                if not fam:
                    raise UserError('상품을 찾지 못했습니다. 다시 점검해 주세요')
                b = brand_of(fam['brand'])
                return self._json(200, {'ok': True, 'family': fam, 'review': r, 'brand': b})
            if path == '/sources' and method == 'GET':
                fam = next((f for f in read_json(SCAN_FILE, {'families': []})['families'] if f['key'] == q('key')), None)
                if not fam:
                    raise UserError('상품을 찾지 못했습니다')
                try:
                    items = source_candidates(fam)
                except Exception as e:
                    log('공식 사이트 목록 실패', fam['brand'], type(e).__name__, str(e)[:100])
                    raise UserError('공식 사이트에서 제품 목록을 읽지 못했습니다. 주소를 직접 넣어 주세요')
                return self._json(200, {'ok': True, 'items': items})
            if path == '/draft' and method == 'POST':
                b = self._body()
                fam = next((f for f in read_json(SCAN_FILE, {'families': []})['families'] if f['key'] == b.get('key')), None)
                if not fam:
                    raise UserError('상품을 찾지 못했습니다')
                url = str(b.get('url') or '').strip()
                if not re.match(r'^https?://', url):
                    raise UserError('공식 페이지 주소를 넣어 주세요')
                dr = make_draft(fam, url)
                Review.update([fam['key']], {'draft': dr, 'status': 'approved'}, user)
                return self._json(200, {'ok': True, 'draft': dr})
            if path == '/save' and method == 'POST':
                b = self._body()
                dr = b.get('draft')
                if not isinstance(dr, dict):
                    raise UserError('초안이 비어 있습니다')
                if not dr.get('pending'):          # 초안 없이 브랜드 정보만 저장할 때는 pending 이 옴
                    Review.update([str(b.get('key'))], {'draft': dr}, user)
                if b.get('brand') and isinstance(b.get('brandInfo'), dict):
                    bs = brands()
                    cur = bs.get(b['brand'], {})
                    cur.update({k: v for k, v in b['brandInfo'].items() if k in ('ko', 'en', 'site', 'platform', 'maker', 'origin', 'story', 'slug', 'cats')})
                    bs[b['brand']] = cur
                    write_json(BRANDS_FILE, bs)
                return self._json(200, {'ok': True})
            if path == '/brands' and method == 'GET':
                return self._json(200, {'ok': True, 'brands': brands()})
            if path == '/categories' and method == 'GET':
                site = q('site')
                if site not in SITES:
                    raise UserError('사이트를 골라 주세요')
                return self._json(200, {'ok': True, 'items': IM.categories(site)})
            if path == '/build' and method == 'POST':
                b = self._body()
                res = build(b.get('site'), [str(k) for k in b.get('keys') or []][:200], user, session)
                return self._json(200, dict(ok=True, **res))
            if path == '/file' and method == 'GET':
                fid = re.sub(r'[^A-Za-z0-9_.-]', '', q('id'))
                p = os.path.join(OUT_DIR, fid + '.zip')
                if not fid or not os.path.isfile(p):
                    return self._json(404, {'ok': False, 'error': '파일이 없습니다 (14일이 지나 지워졌을 수 있습니다)'})
                return self._file(p, fid + '.zip')
        except UserError as e:
            return self._json(400, {'ok': False, 'error': str(e)})
        except Exception as e:
            log('오류', path, type(e).__name__, e)
            traceback.print_exc()
            return self._json(500, {'ok': False, 'error': f'서비스 오류가 났습니다 ({type(e).__name__})'})
        return self._json(404, {'ok': False, 'error': 'not_found'})

    def do_GET(self):
        self._route('GET')

    def do_POST(self):
        self._route('POST')


def main():
    if len(sys.argv) < 2 or sys.argv[1] != 'serve':
        print('사용법: python upload.py serve')
        return
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(CACHE_DIR, exist_ok=True)
    brands()
    log(f'상품업로드 서비스 시작 · 127.0.0.1:{PORT} · Claude {"사용" if ANTHROPIC_KEY else "키 없음"} ({CLAUDE_MODEL})')
    try:
        m = IM.resolve(force=True)
        for s in SITES:
            log(f'아임웹 {SITES[s]["name"]}:', f'연결됨 ({m[s]["where"]})' if s in m else '토큰 없음')
    except Exception as e:
        log('아임웹 확인 실패', e)
    srv = ThreadingHTTPServer(('127.0.0.1' if not ENV('BIND_ALL') else '0.0.0.0', PORT), Handler)
    srv.serve_forever()


if __name__ == '__main__':
    main()
