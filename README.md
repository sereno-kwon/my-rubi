# My Rubi 상담 포털 (my.rubiworkshop.com) 설치 안내

구조: GitHub Pages 정적 페이지 → Google Apps Script 웹앱 → Google Drive(기존 고객 폴더) + `00_My Rubi Index` 시트

## 1. Apps Script 배포 (10분)

1. Drive에서 `00_My Rubi Index` 시트를 엽니다.
2. 메뉴 **확장 프로그램 → Apps Script** 를 열고, 기본 `Code.gs` 내용을 지운 뒤 `apps-script/Code.gs` 내용을 통째로 붙여넣고 저장합니다.
3. `CONFIG.API_KEY` 값을 임의의 긴 문자열로 바꿉니다. (예: 32자 이상 무작위)
4. 상단 함수 선택에서 `test_list` 를 골라 **실행** 합니다. 처음 한 번 권한 승인 창이 뜨면 Drive·Sheets 권한을 허용합니다. 실행 로그에 Index 앞 3건이 찍히면 정상입니다.
5. **배포 → 새 배포 → 유형: 웹 앱**
   - 실행 사용자: **나**
   - 액세스 권한: **모든 사용자** (API_KEY로 보호되므로 괜찮습니다)
   - 배포 후 나오는 `https://script.google.com/macros/s/…/exec` URL을 복사합니다.

> 코드를 고친 뒤에는 **배포 → 배포 관리 → 새 버전** 으로 올려야 URL에 반영됩니다.

## 2. 포털 페이지 배포

1. GitHub에 새 리포지토리(예: `sereno-kwon/my-rubi`)를 만들고 루트 `index.html`(바탕화면)과 `consult/`(상담 앱)가 Pages로 배포됩니다.
2. Settings → Pages → Source: main / root.
3. DNS에서 `my.rubiworkshop.com` CNAME → `sereno-kwon.github.io` (다른 브랜드 사이트와 같은 방식).
4. 사이트를 열고 우상단 **설정** 에 1-5의 웹앱 URL과 API 키를 넣습니다. 브라우저 localStorage에만 저장됩니다.

## 3. 사용 흐름

- **신규 상담**: 브랜드·고객명·모델 입력 → Index에 행 추가. "Drive 폴더 생성" 체크 시 `Customer History_브랜드/YYYYMMDD_고객명_브랜드_모델` 폴더와 `00_Log_…` 시트(브랜드 템플릿 복사), `Customer Pack`, `Internal Reference` 폴더가 함께 생깁니다.
- **상담 기록 추가**: Index 시트의 `상담 기록` 탭에 한 줄씩 쌓입니다.
- **단계 진행**: Index 단계·날짜 갱신. 계약금·예약금·출고 단계에서 금액을 넣으면 Log 마스터 탭 결제 표에 행이 추가되고, 마스터 탭이 `계약금(YYMMDD)` 식으로 스냅샷 복제됩니다(지금 손으로 하시는 것과 동일).
- 문의 단계로만 등록한 건이 상담 이상으로 넘어가면 그때 폴더가 자동 생성됩니다.

## 4. Index 시트 직접 편집

Index 시트는 그대로 열어서 고쳐도 됩니다. 포털은 매번 시트를 읽으므로 수정이 바로 반영됩니다.
백필된 112건은 `메모`에 "자동 백필: 단계 확인 필요"가 들어 있습니다. 90일 넘은 건은 `출고`, 최근 건은 `상담`으로 넣어두었으니 실제와 다른 건만 `현재 단계` 열을 고쳐 주세요.

## 5. 보안 메모

- 포털에는 Index 시트 내용(고객명·모델·단계)만 올라갑니다. Log 시트의 원가·계좌번호는 링크로만 연결되고 포털에 표시되지 않습니다.
- API_KEY가 노출되면 Apps Script 배포를 삭제하고 키를 바꿔 다시 배포하면 됩니다.
- 고객 로그인 화면(2차)은 Supabase Auth를 붙이고, Apps Script에 고객용 읽기 전용 엔드포인트(사양·단계만)를 추가하는 방식으로 확장할 수 있습니다.

## 파일

- `apps-script/Code.gs` 백엔드
- `index.html` 바탕화면 런처 (앱 아이콘·창·독). 앱 추가는 파일 상단 `APPS` 배열에 한 줄
- `consult/index.html` 상담 현황 앱 (단일 파일)
- `CNAME`
- `tools/backfill.py` 기존 폴더명 → Index 행 변환 스크립트 (이미 1회 실행해 Index를 채움)
