// My Rubi 설정
window.MYRUBI_CONFIG = {
  // Apps Script 웹앱 URL (…/exec)
  API_URL: 'https://script.google.com/macros/s/AKfycbx-OhlQdNwKCWcUMs-kmjhqPcWhoUKD_vqpavJcX2XVLUY6p3Rmh8ry1NCqOG_4pLrm/exec',

  // 구글 로그인: Google Cloud 콘솔의 OAuth 클라이언트 ID (…apps.googleusercontent.com)
  // 비워두면 로그인 없이 바로 바탕화면이 열림. 넣는 순간부터 첫 화면이 잠금 화면이 됨
  // Apps Script Code.gs 의 GOOGLE_CLIENT_ID 와 같은 값이어야 함
  GOOGLE_CLIENT_ID: '',

  // 로그인 허용 도메인 (계정 선택 창에 이 도메인 계정만 보이게 함. 실제 확인은 Apps Script에서)
  ALLOWED_DOMAIN: 'rubi.kr',
};
