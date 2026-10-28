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

  // Synology NAS 연결 (nas/README.md 참고)
  // NAS_API: NAS Web Station에 올린 연결 파일 주소 (예: 'https://nas-api.rubiworkshop.com/'). 비워두면 NAS 창에 설치 안내가 보임
  // NAS_WEB: DSM 접속 주소 (예: 'https://nas.rubiworkshop.com:5001'). 'File Station에서 열기' 메뉴에 씀
  NAS_API: '',
  NAS_WEB: '',
};
