"""customers.json → Index 시트 행 생성 (Code.gs의 parseFolderName_ 와 같은 규칙)"""
import json, re, sys
from datetime import datetime, date

BRAND_KEY = {
    'Bastion Cycles Korea': 'BASTION', 'Moulton Bicycles Korea': 'MOULTON', 'Tsubasa Bicycles Korea': 'TSUBASA',
    'Parlee Cycles Korea': 'PARLEE', 'Surly bike': 'SURLY', 'Crust Bike': 'CRUST', 'Velo Orange': 'VELO ORANGE',
}
STAGES = ['문의', '상담', '견적', '계약금', '예약금', '발주', '입고', '조립', '출고', '루비케어']
TODAY = date(2026, 10, 22)


def parse(name):
    name = name.strip()
    if '[' in name:
        m = re.match(r'^([A-Z]*\s?\d{1,5})\s*_\[([^\]]+)\]?\s*(.*)$', name, re.I)
        if m:
            ref = m.group(1).strip()
            rest = re.sub(r'[\(\[][^\)\]]*[\)\]]', lambda g: g.group(0).replace('_', '\x00'), m.group(3))
            parts = [p.replace('\x00', '_') for p in rest.split('_')]
            model, spec = parts[0].strip(), ''
            sm = re.match(r'^(.*?)\s*[\(\[](.*)[\)\]]\s*(.*)$', model)
            if sm:
                model = (sm.group(1) + (' ' + sm.group(3) if sm.group(3) else '')).strip(); spec = sm.group(2).strip()
            channel = customer = d = ''
            for t in parts[1:]:
                t = t.strip()
                if re.fullmatch(r'\d{8}', t): d = t
                elif not channel: channel = t
                elif not customer: customer = t
            if customer == '미확인': customer = ''
            return dict(ref=ref, model=model, spec=spec, channel=channel, customer=customer, date=d)
    m = re.match(r'^(\d{8})[_ ]+([^_]+)_(.+)$', name)
    if m:
        d, customer, rest = m.group(1), m.group(2).strip(), m.group(3)
        bm = re.match(r'^(Moulton|Surly|Crust Bike|Velo Orange|Bastion|Tsubasa|Parlee|Pashley)[_ ]?', rest, re.I)
        if bm: rest = rest[bm.end():]
        segs = [s.strip() for s in rest.split('_') if s.strip()]
        return dict(ref='', model=segs[0] if segs else rest, spec=' '.join(segs[1:]), channel='', customer=customer, date=d)
    m = re.fullmatch(r'([A-Z]{1,3}\d{4,6})', name)
    if m:
        return dict(ref=m.group(1), model='', spec='', channel='', customer='', date='')
    return None


def iso(d8):
    if not re.fullmatch(r'\d{8}', d8): return None
    y, mo, da = int(d8[:4]), int(d8[4:6]), int(d8[6:])
    if y < 2000 or y > 2030: return None
    if mo == 0 or da == 0: return f'{y:04d}-{max(mo,1):02d}-01' if mo else f'{y:04d}-01-01'
    try: return date(y, mo, da).isoformat()
    except ValueError: return f'{y:04d}-{mo:02d}-01'


def main():
    data = json.load(open(sys.argv[1]))
    rows, skipped = [], []
    for x in data:
        p = parse(x['folderName'])
        if not p:
            skipped.append(x['folderName']); continue
        brand = BRAND_KEY[x['brand']]
        base = iso(p['date']) or x['createdTime'][:10]
        channel = p['channel'] or '루비워크샵'
        # 단계 추정: 90일 넘은 건은 출고 완료로 보고, 최근 건은 상담 진행 중으로
        age = (TODAY - date.fromisoformat(base)).days
        stage = '출고' if age > 90 else '상담'
        if not p['customer']: stage = '출고'  # 딜러 재고·테스트 등 고객 없는 건
        memo = '자동 백필: 단계 확인 필요'
        if 'TEST' in x['folderName'].upper(): memo += ' (TEST)'
        rec = dict(ref=p['ref'], brand=brand, model=p['model'], spec=p['spec'], channel=channel, customer=p['customer'],
                   stage=stage, base=base, folderId=x['folderId'], folderUrl=x['folderUrl'], logSheetId=x.get('logSheetId') or '', memo=memo)
        rows.append(rec)
    rows.sort(key=lambda r: (r['base'], r['ref']))
    out = []
    for i, r in enumerate(rows, 1):
        stage_dates = {s: '' for s in STAGES}
        stage_dates['문의'] = stage_dates['상담'] = r['base']
        if r['stage'] == '출고': stage_dates['출고'] = r['base']
        out.append([f'{i:04d}', r['ref'], r['brand'], r['model'], r['spec'], r['channel'], r['customer'], '', r['stage'],
                    *[stage_dates[s] for s in STAGES], r['folderId'], r['folderUrl'], r['logSheetId'], r['memo'], TODAY.isoformat() + ' 18:40'])
    json.dump(out, open(sys.argv[2], 'w'), ensure_ascii=False)
    print(len(out), 'rows;', 'skipped:', skipped)
    from collections import Counter
    print(Counter(r[8] for r in out))


main()
