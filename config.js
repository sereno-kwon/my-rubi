// My Rubi 설정
window.MYRUBI_CONFIG = {
  // Apps Script 웹앱 URL (…/exec)
  API_URL: 'https://script.google.com/macros/s/AKfycbypQe4DIULfFv2JllxmXAgMFthIm-PRCSEwkM9kSQGCfOxJ7yn4Qp0TxwwJO3lppvYG/exec',

  // 구글 로그인: Google Cloud 콘솔의 OAuth 클라이언트 ID (…apps.googleusercontent.com)
  // 비워두면 로그인 없이 바로 바탕화면이 열림. 넣는 순간부터 첫 화면이 잠금 화면이 됨
  // Apps Script Code.gs 의 GOOGLE_CLIENT_ID 와 같은 값이어야 함
  GOOGLE_CLIENT_ID: '170788190959-st694dptpqurkm17fglb21bmhph2ui53.apps.googleusercontent.com',

  // 계정 선택 창에 이 워크스페이스의 계정만 보이게 함 (기본 도메인). 실제 허용 여부는 Apps Script에서 확인
  ALLOWED_DOMAIN: 'rubiworkshop.com',

  // 체크리스트 멤버 (탭 순서). 비워두면 항목을 가진 사람과 로그인한 사람만 탭으로 보임
  // 예: MEMBERS: ['세레노', '○○', '△△'],  이름은 구글 계정 이름과 같게
  MEMBERS: ['권오현', '권오륜', '박국현', '김현우', '전요셉'],
  // 구글 계정 이름(또는 이메일)이 위 멤버 이름과 다를 때 맞춰 줌. 로그인한 사람의 탭이 처음에 열리고, 끝낸 사람 이름도 이걸로 기록됨
  MEMBER_ALIASES: { 'Ohyun Kwon': '권오현', 'ohyun@rubi.kr': '권오현', 'ohyun@rubiworkshop.com': '권오현' },
  // 본인에게만 보이는 개인 체크리스트 멤버. 실제로 누가 볼 수 있는지는 Apps Script Code.gs 의 PRIVATE_CHECKLISTS 가 정함
  // (여기 적힌 이름은 서버 응답을 받기 전 잠깐 동안 탭을 숨기는 데만 씀)
  PRIVATE_MEMBERS: ['권오현', '권오륜'],

  // Synology NAS 연결 (nas/README.md 참고)
  // NAS_API: NAS Web Station에 올린 연결 파일 주소 (예: 'https://myrubi.이름.synology.me/'). 비워두면 NAS 창에 설치 안내가 보임
  // NAS_WEB: DSM 접속 주소 (예: 'https://이름.synology.me:5001'). 'File Station에서 열기' 메뉴에 씀
  NAS_API: 'https://myrubi.rubibase.synology.me/',
  NAS_WEB: 'https://rubibase.synology.me:5001',
};
