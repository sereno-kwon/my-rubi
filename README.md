# My Rubi (my.rubiworkshop.com)

루비워크샵 직원용 포털입니다. 첫 화면은 윈도우 바탕화면처럼 생겼고, 아이콘을 끌어서 원하는 자리에 놓을 수 있습니다. 회사 구글 워크스페이스(rubiworkshop.com) 계정으로 로그인합니다(설정 전에는 로그인 없이 열림).

## 쓰는 법

- **아이콘**: 두 번 클릭하면 열림 (휴대폰은 한 번). 끌어서 다른 칸에 놓으면 그 자리에 고정되고, 다른 아이콘이 있던 칸이면 서로 자리를 바꿈. 휴지통 위에 놓으면 바탕화면에서 빠짐
- **우클릭**: 바탕화면에서는 아이콘 크기·자동 정렬, 아이콘에서는 열기·작업 표시줄 고정·바탕화면에서 지우기·주소 복사
- **작업 표시줄**: 왼쪽 루비 버튼이 시작 메뉴(모든 앱 + 검색). 고정한 앱과 열린 창이 나란히 보이고, 오른쪽 시계를 누르면 달력
- **창**: 제목 표시줄을 끌어 이동, 가장자리를 끌어 크기 조절. 화면 왼쪽·오른쪽 끝으로 끌면 반으로, 위쪽 끝으로 끌면 전체 화면으로 붙음. 제목 표시줄 두 번 클릭은 최대화
- **바탕화면 설정**: 배경(블랙, 루비, 스톤), 아이콘 크기, 자동 정렬, 처음 배치로 되돌리기
- 아이콘 배치, 고정한 앱, 배경, 메모장 내용은 **그 브라우저에만** 저장됨 (계정별 저장은 다음 단계)

## 구글 로그인 켜기 (처음 한 번)

`config.js` 의 `GOOGLE_CLIENT_ID` 가 비어 있는 동안은 로그인 없이 바로 바탕화면이 열립니다. 아래 순서대로 하면 첫 화면이 잠금 화면으로 바뀌고, 회사 워크스페이스(rubiworkshop.com, rubi.kr) 계정만 들어올 수 있습니다. **2번(백엔드)을 먼저, 3번(포털)을 나중에** 해야 중간에 아무도 막히지 않습니다.

1. **OAuth 클라이언트 ID 만들기** (console.cloud.google.com, rubi.kr 계정으로)
   - 새 프로젝트 `My Rubi` 를 만듭니다.
   - Google 인증 플랫폼(또는 API 및 서비스 → OAuth 동의 화면): 앱 이름 `My Rubi`, 사용자 유형 **내부**. 내부로 하면 rubi.kr 계정만 쓸 수 있고 구글 심사가 필요 없습니다.
   - 클라이언트(또는 사용자 인증 정보) → 만들기 → **OAuth 클라이언트 ID** → 유형 **웹 애플리케이션**
   - 승인된 JavaScript 원본: `https://my.rubiworkshop.com` (리디렉션 URI는 비워둠)
   - 만들어진 `…apps.googleusercontent.com` 값을 복사합니다.
2. **Apps Script 갱신**
   - `apps-script/Code.gs` 전체를 Apps Script 편집기에 붙여넣고, 맨 위 `CONFIG.GOOGLE_CLIENT_ID` 에 1번 값을 넣고 저장합니다.
   - 함수 목록에서 `listSessions` 를 한 번 실행합니다. 구글 확인용 외부 연결 권한을 새로 묻기 때문에 승인해 줍니다.
   - 배포 → 배포 관리 → 연필 → 버전: **새 버전** → 배포 (URL은 그대로)
3. **포털 켜기**: `config.js` 의 `GOOGLE_CLIENT_ID` 에 같은 값을 넣고 커밋합니다.

로그인하면 30일 동안 유지됩니다. 시작 메뉴 아래쪽에 이름이 보이고 옆에 로그아웃 버튼이 있습니다.

- 퇴사자: 워크스페이스에서 계정을 정지하면 새 로그인은 막힙니다. 이미 로그인된 기기까지 바로 끊으려면 Apps Script에서 `clearAllSessions` 를 실행합니다(모두 다시 로그인).
- 외부 계정을 예외로 허용하려면 `Code.gs` 의 `EXTRA_EMAILS` 에 이메일을 넣습니다.
- 지금 로그인된 사람 목록: `listSessions` 실행 후 실행 로그 확인
- 로그인이 지키는 것은 Apps Script 데이터(상담 기록 등)입니다. 바탕화면 HTML과 링크 목록 자체는 GitHub Pages라서 주소를 알면 받아볼 수 있습니다.

## NAS (Synology)

바탕화면의 **NAS** 앱에서 공유 폴더를 보고, 파일 이름으로 검색하고, 파일을 열거나 내려받을 수 있습니다. 시작 메뉴 검색창에 단어를 넣으면 "NAS에서 파일 찾기" 줄이 함께 나옵니다. 직원마다 자기 NAS 계정으로 로그인하고, 비밀번호는 저장하지 않습니다. NAS 쪽 설치는 [`nas/README.md`](nas/README.md), 다 되면 `config.js` 의 `NAS_API`, `NAS_WEB` 을 채웁니다.

## 앱 추가하기

`apps.js` 에 한 줄을 넣으면 시작 메뉴에 생기고, 폴더에 속하지 않은 앱은 바탕화면에도 놓입니다(이미 쓰던 기기에도 다음 접속 때 추가됨).

```js
{ id: 'naver-ad', title: '네이버 광고', icon: 'globe', tint: 'green', kind: 'link', url: 'https://searchad.naver.com/' },
```

- `kind`: `link` 새 탭 / `frame` 포털 안의 창(같은 도메인 페이지, 예 `url: '/consult/'`) / `folder` 아이콘 모음 / `builtin` 내장 / `soon` 준비 중
- 폴더에 넣으려면 `folder: 'brands'` 처럼 폴더 id를 적음
- 아이콘 이름과 색 목록은 `apps.js` 맨 위 주석 참고. 브랜드처럼 글자로 표시하려면 `mono: 'Mo'`
- 상담 현황 같은 업무 앱이 완성되면 `kind: 'frame'` 과 `url` 로 한 줄 추가하면 됨
- 처음 쓰는 기기의 작업 표시줄 고정 앱은 `MYRUBI_PINNED`

## 파일

- `index.html` 바탕화면 뼈대와 아이콘 모양
- `assets/desktop.css`, `assets/desktop.js` 바탕화면·창·작업 표시줄·시작 메뉴
- `apps.js` 앱 목록
- `assets/nas.js` NAS 앱 (DSM File Station API)
- `nas/proxy/index.php` NAS Web Station에 올리는 연결 파일, `nas/README.md` 설치 안내
- `config.js` Apps Script 주소, 구글 로그인 클라이언트 ID
- `lib.js` 로그인 세션과 API 호출 (바탕화면과 앱이 같이 씀)
- `apps-script/Code.gs` 백엔드: 구글 로그인 확인, 세션, 구글 드라이브·`00_My Rubi Index` 시트
- `CNAME` my.rubiworkshop.com (GitHub Pages, main / root)

## 지금은 연결되지 않은 이전 작업

바탕화면을 새로 만들면서 아래 파일은 남겨두되 바탕화면에서는 연결하지 않았습니다. 상담 현황 앱을 다시 붙일 때 씁니다.

- `consult/index.html` 상담 현황 앱 (구글 로그인 세션을 쓰도록 맞춰 둠)
- `tools/backfill.py` 기존 고객 폴더명으로 Index 시트를 채운 스크립트
