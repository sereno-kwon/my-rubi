# My Rubi × Synology NAS 연결

포털의 **NAS** 앱에서 공유 폴더를 보고, 파일 이름으로 검색하고, 파일을 열거나 내려받을 수 있게 하는 설정입니다. 시작 메뉴 검색창에 단어를 넣으면 "NAS에서 파일 찾기" 줄도 함께 나옵니다.

```
포털(my.rubiworkshop.com) ──HTTPS──▶ NAS Web Station: nas/proxy/index.php ──▶ DSM File Station API
```

- 직원마다 **자기 NAS 계정**으로 로그인합니다. NAS에서 그 계정이 볼 수 있는 공유 폴더만 보입니다.
- 비밀번호는 저장하지 않습니다. 로그인 후 NAS가 발급한 세션만 그 브라우저에 남고, 포털의 로그아웃 버튼이나 DSM 세션 만료로 끝납니다.
- 연결 파일은 **로그인, 폴더 목록, 검색, 내려받기, 썸네일**만 통과시킵니다. 삭제, 이동, 이름 바꾸기, 공유 링크 만들기는 포털에서 할 수 없습니다.
- my.rubiworkshop.com 이 아닌 곳에서 온 요청은 거절합니다.

## 준비물

- NAS의 Synology DDNS 주소. 루비는 `rubibase.synology.me` (제어판 → 외부 액세스 → DDNS 에서 확인).
- 포털 전용 연결 주소는 그 아래 하위 이름 하나를 씁니다: **`myrubi.rubibase.synology.me`**
  - Synology DDNS는 하위 이름(`*.rubibase.synology.me`)도 같은 NAS로 연결되므로 DNS 설정은 따로 하지 않습니다.
  - DSM 화면(5001)과 주소를 나눠 두면, 포털 연결 파일만 따로 켜고 끌 수 있습니다.
- 공유기 포트 포워딩: 루비 공유기는 공용 443을 DSM(5001)으로 보내고 있어서, 포털 연결용으로 **공용 8443 → NAS 443** 규칙을 따로 둡니다 (DSM 접속 방식은 그대로). 그래서 연결 주소에 `:8443` 이 붙습니다.

## NAS 설정 (DSM 7 기준, 20분)

1. **Web Station 설치**: 패키지 센터에서 Web Station과 PHP 8.2(또는 최신 PHP)를 설치합니다.
2. **PHP 프로필**: Web Station → 스크립트 언어 설정 → PHP → 생성. 이름 `myrubi`, 버전 PHP 8.x, 확장 목록에서 **curl** 을 켭니다.
3. **파일 올리기**: File Station에서 `web` 공유 폴더 안에 `myrubi-nas` 폴더를 만들고, 이 저장소의 `nas/proxy/index.php` 를 올립니다. (`stock.php` 는 이카운트 재고 조회용으로, 같은 폴더에 둡니다. [`stock/README.md`](stock/README.md))
4. **웹 서비스**: Web Station → 웹 서비스 → 생성 → 기본 서비스(PHP), 문서 루트 `web/myrubi-nas`, PHP 프로필 `myrubi`.
5. **웹 포털**: Web Station → 웹 포털 → 생성 → 방금 만든 서비스, 포털 유형 **이름 기반**, 호스트 이름 `myrubi.rubibase.synology.me`, 포트 HTTPS **443** 체크.
6. **인증서**: 제어판 → 보안 → 인증서 에서 `rubibase.synology.me` 인증서를 고르고 **추가 → 기존 인증서 교체 → Let's Encrypt** 로 다시 받으면서, 주체 대체 이름(SAN)에 `*.rubibase.synology.me` 를 넣습니다. 발급되면 같은 화면의 **설정**에서 `myrubi.rubibase.synology.me` 웹 포털에 이 인증서를 지정합니다.
7. **확인**: 브라우저로 `https://myrubi.rubibase.synology.me:8443/nas/proxy/` 을 열었을 때 `{"success":false,"error":{"code":"method_not_allowed"}}` 가 보이면 정상입니다. 자물쇠(HTTPS)가 경고 없이 떠야 합니다.

## 포털 설정

`config.js` 에 두 줄을 넣고 커밋합니다.

```js
NAS_API: 'https://myrubi.rubibase.synology.me:8443/nas/proxy/',
NAS_WEB: 'https://rubibase.synology.me:5001',   // 'File Station에서 열기' 메뉴용, 비워도 됨
```

## 직원 계정

- 제어판 → 사용자 및 그룹에서 직원마다 계정이 있어야 하고, 응용 프로그램 권한에서 **File Station** 이 허용되어 있어야 합니다.
- 보이는 폴더는 공유 폴더 권한 그대로입니다. 고객 사진처럼 일부만 보여야 하는 폴더는 NAS에서 권한을 나눠 주세요.
- 2단계 인증을 쓰는 계정은 로그인 화면에 인증 코드 칸이 자동으로 나옵니다.

## 문제가 생기면

| 증상 | 확인할 것 |
|---|---|
| NAS 창에 "NAS에 연결할 수 없습니다" | 7번 확인 주소가 열리는지, 443 포트 포워딩, 인증서 경고가 없는지 |
| 확인 주소에 `php_curl_missing` | 2번 PHP 프로필에서 curl 확장 켜기 |
| 확인 주소에 `dsm_unreachable` | DSM HTTPS 포트가 5001이 아니면 `index.php` 위쪽 `DSM_ENDPOINT` 의 포트를 바꾸기 |
| 한 명이 비밀번호를 여러 번 틀린 뒤 모두 로그인이 안 됨 | 제어판 → 보안 → 보호 → 자동 차단 목록에 `127.0.0.1` 이 들어갔는지 확인하고 지우기 |
| 검색이 느림 | 파일 이름 검색은 NAS가 폴더를 직접 훑습니다. 폴더 안에 들어가서 검색하면 그 폴더만 찾아서 빠릅니다 |
