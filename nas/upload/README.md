# My Rubi × 상품 업로드 (이카운트 → 아임웹 일괄 추가)

포털의 **상품 업로드** 앱이 쓰는 NAS 서비스입니다. 이카운트에 등록된 품목 가운데 루비서플라이·루비워크샵에 아직 없는 상품을 찾아 검토 목록에 올리고, 검토를 마친 상품은 아임웹 '상품 일괄 추가' 엑셀과 대표 이미지를 zip 하나로 만들어 줍니다.

```
포털(my.rubiworkshop.com/upload/) ──HTTPS:8443──▶ NAS Web Station: nas/proxy/upload.php ──▶ rubi-upload 컨테이너(127.0.0.1:8791)
                                                                                         ├─ 이카운트 품목 목록: rubi-stock 볼륨의 catalog.json (읽기만)
                                                                                         ├─ 창고 재고: rubi-stock 서비스(127.0.0.1:8790)
                                                                                         ├─ 아임웹 OpenAPI: ecount-sync 의 액세스 토큰 (읽기만, 갱신 안 함)
                                                                                         ├─ 브랜드 공식 사이트 (제품 설명·이미지)
                                                                                         └─ Claude API (아코디언 문구 초안)
```

## 하는 일

1. **점검**: 이카운트 품목(재고 조회 서비스가 매일 아침 받아 두는 전체 품목)과 두 사이트의 상품 SKU를 비교합니다. 아임웹 SKU(재고번호)는 이카운트 품목코드와 같게 맞춰 두었기 때문에 품목코드가 사이트에 없으면 미업로드입니다.
   - 이카운트 품목명 `[브랜드] 상품명 (옵션)` 에서 브랜드를 읽고, 끝의 컬러·사이즈·티스·`FOR SHIMANO` 같은 말을 떼어 같은 상품의 옵션으로 묶습니다. 예: `STEM CAP FLAT BLACK`, `STEM CAP FLAT BLUE` → 상품 `STEM CAP FLAT`, 옵션 블랙·블루
   - 상품의 일부 옵션만 사이트에 있으면 "옵션 추가"로 표시합니다. 이런 상품은 새 상품이 아니라 기존 상품에 옵션을 더하는 쪽이 맞습니다.
   - 아임웹 옵션 상세는 상품마다 따로 불러야 해서 처음 점검은 몇 분 걸립니다. 다음부터는 상품 수정 시각이 같으면 저장해 둔 값을 써서 빠릅니다.
2. **검토**: 직원이 상품마다 업로드 / 보류 / 제외를 고릅니다. 검토 요청 버튼은 담당자 체크리스트에 "상품 업로드 검토: 울프투스 12건" 같은 항목을 넣습니다.
3. **초안**: 업로드할 상품을 열어 공식 페이지를 고르면(쇼피파이 브랜드는 자동으로 후보를 찾음), 그 페이지를 읽고 Claude가 아코디언 문구(제품 요약, 스펙, 특징, 장착 및 호환성, 주석), 옵션 한글 표기, 무게, 대표 이미지를 채웁니다. 직원이 고치고 카테고리ID를 넣어 저장합니다.
4. **엑셀 만들기**: 사이트를 골라 만들면 zip 하나로 내려받습니다.
   - `rubisupply_날짜.xlsx` 또는 `rubiworkshop_날짜.xlsx`: `template.xlsx`(아임웹 일괄 추가 양식 ver.1.1) 4행부터 채움
   - `images/`: 대표 이미지. 1000×1000 흰 배경, 제품 외곽 기준 가운데, 사방 최소 10% 여백, 제품 아래 설명 문구 띠는 지움. 파일명은 엑셀의 대표 이미지 파일명과 같음
   - 재고 수량은 그 순간의 이카운트 `MAIN_WH`(RLD) 창고 수량

| 칸 | 루비서플라이 | 루비워크샵 |
|---|---|---|
| 요약설명 | v5 아코디언 (오늘까지 쓰던 rb-sum 구조) | v6 아코디언 (포털 아코디언 V6 앱과 같은 모양, 끝에 제품 상담·워런티) |
| 상품 상세정보 | 배송 안내사항 (기존 상품과 같은 문구) | 비움 |
| 세금 | 과세상품 | 과세상품 |
| 적립금 지급 단위 · 할인적용대상 · 할인금액 단위 | 원 · B(회원) · B(%) | 비움 |
| 배송방법 | 줄바꿈 한 칸 (빈칸이면 업로드가 막힘) | 줄바꿈 한 칸 |
| 판매가 · 옵션가 | 이카운트 단가 | 이카운트 단가 |

이 서비스는 이카운트와 아임웹에 아무것도 쓰지 않습니다. 상품 등록은 직원이 아임웹 관리자 → 상품 → 일괄 추가에서 엑셀과 이미지를 올려서 합니다.

## 아임웹 토큰을 읽기만 하는 이유

아임웹 OpenAPI 토큰은 갱신할 때마다 리프레시 토큰이 새로 나옵니다. 이 서비스가 따로 갱신하면 ecount-sync 가 가진 리프레시 토큰이 무효가 되어 주문·재고 연동이 끊길 수 있습니다. 그래서 ecount-sync 폴더의 설정·저장 파일에서 액세스 토큰(`eyJ…` 로 시작하는 값)을 찾아 읽기만 하고, 토큰마다 `/site-info` 를 불러 어느 사이트(rubisupply.com, rubiworkshop.com) 것인지 맞춥니다. 토큰이 만료되어 있으면 ecount-sync 가 다음 동기화 때 갱신할 때까지 점검이 멈춥니다(포털 화면 위쪽에 "토큰 없음"으로 보임).

자동으로 못 찾으면 컨테이너 로그에 `아임웹 루비서플라이: 토큰 없음` 이 보입니다. 그때는 ecount-sync 가 토큰을 어느 파일에 저장하는지 확인해 주세요. 그 파일이 ecount-sync 폴더 안 4단계 깊이 이내의 `.json` · `.env` · `.txt` 이고, 키 이름에 `access` 와 `token` 이 들어 있으면 찾습니다.

## NAS 설정 (DSM 7, 20분)

재고 조회 서비스(`nas/stock/`)가 먼저 돌고 있어야 합니다.

1. **폴더 만들기**: File Station에서 ecount-sync, rubi-stock 이 있는 폴더(예: `Rubi Company`)에 `rubi-upload` 폴더를 만듭니다.
2. **파일 올리기**: 이 저장소 `nas/upload/` 의 `upload.py`, `template.xlsx`, `docker-compose.yml`, 그리고 `upload.env.example` 을 이름만 `upload.env` 로 바꾼 파일을 `rubi-upload` 폴더에 올립니다.
   - `upload.env` 의 `ANTHROPIC_API_KEY` 에 Claude API 키를 넣습니다 (console.anthropic.com → API Keys). 비워 두면 점검·검토·엑셀은 되고 초안 만들기만 막힙니다.
   - 초안 비용을 줄이려면 `CLAUDE_MODEL` 을 더 작은 모델로 바꿉니다.
3. **rubi-stock 볼륨 이름 확인**: Container Manager → 볼륨에서 rubi-stock 이 쓰는 볼륨 이름을 확인합니다. 보통 `rubi-stock_rubi-stock-data` 이고, 다르면 `docker-compose.yml` 맨 아래 `name:` 을 그 이름으로 고칩니다.
4. **컨테이너 띄우기**: Container Manager → 프로젝트 → 생성 → 이름 `rubi-upload`, 경로는 `rubi-upload` 폴더, **기존 docker-compose.yml 사용** → 완료. 처음엔 파이썬 이미지와 엑셀·이미지 패키지(openpyxl, Pillow)를 받느라 1–2분 걸립니다.
5. **로그 확인**: 프로젝트 → rubi-upload → 로그에 아래 줄이 보이면 연결된 것입니다.
   ```
   상품 업로드 서비스 시작 · 127.0.0.1:8791 · Claude 사용 (claude-sonnet-5-5)
   아임웹 루비서플라이: 연결됨 (…:…access…token)
   아임웹 루비워크샵: 연결됨 (…)
   ```
6. **연결 파일 올리기**: NAS 앱 연결 파일(`index.php`), 재고 조회 연결 파일(`stock.php`)이 있는 Web Station 폴더(`web/myrubi-nas/nas/proxy/`)에 이 저장소의 `nas/proxy/upload.php` 를 올립니다. 주소·인증서·8443 포트는 그대로 씁니다.
7. **확인**: 브라우저로 `https://myrubi.rubibase.synology.me:8443/nas/proxy/upload.php` 를 열어 `{"ok": true, "service": "my-rubi-upload"}` 가 보이면 끝입니다.

포털 `config.js` 의 `UPLOAD_API` 는 이미 이 주소로 채워져 있습니다.

## 데이터

컨테이너의 `/data` 볼륨(rubi-upload-data)에 둡니다.

| 파일 | 내용 |
|---|---|
| `scan.json` | 마지막 점검 결과 (미업로드 품목이 있는 상품) |
| `review.json` | 상품별 검토 상태(new · approved · hold · excluded · built · uploaded), 메모, 초안 |
| `brands.json` | 브랜드 정보 (한글·영문 표기, 공식 사이트, 원산지, 제조사, 브랜드 이야기, 기본 카테고리). 앱의 상품 창 아래 '브랜드 정보'에서 고침. 처음엔 울프투스만 들어 있음 |
| `cache/` | 아임웹 옵션 SKU, 쇼피파이 브랜드 제품 목록(하루) |
| `out/` | 만든 zip (14일 뒤 지움) |

다시 점검했을 때 사이트에 옵션이 모두 올라간 상품은 상태가 '완료'로 바뀝니다.

## 개발용 테스트

외부 연결 없이 화면과 엑셀 만들기를 확인할 때는 `UPLOAD_TEST=1` 로 띄우고, `DATA_DIR` 에 `test_imweb_supply.json` · `test_imweb_workshop.json`(상품과 SKU 목록), `test_stock.json`(품목코드 → 재고), `STOCK_DATA_DIR` 에 `catalog.json` 을 둡니다. 로그인 확인을 건너뛰고 아임웹·재고 조회 대신 이 파일들을 씁니다.
