/**
 * My Rubi 포털 백엔드 (Google Apps Script 웹앱) · my.rubiworkshop.com
 *
 * 역할
 *  - 회사 구글 계정 로그인과 포털 세션
 *  - 첫 화면 공지·일정 포스트잇을 My Rubi Index 스프레드시트의 '공지' 탭에 저장함 (탭은 처음 쓸 때 자동 생성)
 *  - 멤버별 체크리스트를 같은 스프레드시트의 '체크리스트' 탭에 저장함 (탭은 처음 쓸 때 자동 생성)
 *    CONFIG.PRIVATE_CHECKLISTS 에 적은 멤버의 목록은 본인에게만 돌려줌 (다른 직원에게는 응답에서 아예 빠짐)
 *  - 프로젝트를 같은 스프레드시트의 '프로젝트' 탭에 저장함. 프로젝트의 세부 항목은 '체크리스트' 탭의 줄이고
 *    '프로젝트' 열에 프로젝트 ID가 들어감. 담당은 여러 명(쉼표로 구분)이고, 프로젝트 항목은 개인 목록 설정과 관계없이 모두에게 보임
 *  - 고객관리: 고객 구매 건을 '고객' 탭에, 단계·상황이 바뀐 기록을 '고객로그' 탭에 저장함 (GET/POST crm)
 *    단계는 상담 10단계(문의 → … → 루비케어) + 종료. 포털이 이를 고객문의·구매진행중·구매완료 세 층위로 묶어 보여줌
 *  - 마일리지(예전 이름 적립금): 고객별 적립·사용 내역을 '적립금' 탭에 저장함 (POST point, 목록은 crm 응답의 points). 잔액은 포털이 고객 이름으로 묶어 더함
 *    견적의 지불 현황에서 결제 수단이 '마일리지'(예전 '적립금')인 금액은 그 견적의 '사용' 줄로 자동 기록됨
 *  - 고객 포털(portal.rubiworkshop.com): 견적 앱에서 '고객 포털에 공개'를 누르면 정제한 견적 사본을 '포털' 탭에 저장하고 추측할 수 없는 키를 붙임
 *    GET portal&k=키 는 로그인 없이 그 사본만 돌려줌 (줄별 가격·할인율·내부 메모·이카운트 코드는 사본에 아예 없음)
 *    고객 키(ckey)로 열면 그 고객의 공개 중인 견적 전체를 목록으로 돌려줌 (포털 첫 화면 '내 자전거'). 고객은 이름(띄어쓰기 무시)으로 묶음
 *    고객 로그인: 직원이 견적 앱에서 발급한 고객코드(RUBI-가입연도-임의 8자, 예: RUBI-2026-7K3M9QXP)로 GET portal&c=코드 → 그 고객의 목록과 세션(고객 키)
 *    코드는 '고객코드' 탭. 다시 발급하면 예전 코드와 고객 키가 함께 바뀌어 이미 로그인한 기기와 예전 링크도 끊김
 *    틀린 코드가 10분에 30번을 넘으면 잠시 모든 코드 로그인을 막음 (임의 8자는 40비트, 이 제한 아래에서는 추측으로 맞힐 수 없음)
 *    진행 단계와 단계별 날짜는 고객관리에서 그때그때 읽어 붙임 (가격과 무관해서 다시 공개하지 않아도 바로 반영)
 *  - 견적: 자전거 견적을 '견적' 탭에 저장함 (GET quotes / POST quote). 한 줄 = 견적 하나, 품목·지불 현황·빌드 사양은 JSON으로 한 칸씩
 *    고객관리의 고객 건(cid)에 연결하면, 저장할 때 그 건의 단계가 문의·상담이면 '견적'으로 넘기고 고객로그에 견적 번호와 금액을 남김
 *    지불 현황에 계약금·예약금이 들어오면 고객 건 단계를 그만큼 넘기고, 고객 건의 계약금(원) 칸을 지불 합계로 맞춤
 *    '견적기록' 탭에는 그 시점의 견적 전체를 남김 (예전 시트의 날짜별·결제 단계별 탭 대신, GET quotesnap)
 *    2026-11-09 판: 품목의 고객 지참(own, 금액에서 뺌)·원가(cost)·재고상태(stock), 결제별 증빙 상태(rc)와 결제 취소·환불(음수),
 *    증빙(receipt: 현금영수증·세금계산서 번호), 탈거품(removed), 견적 종류(kind '업그레이드')와 원래 견적(parent) 열이 늘어남
 *    입금 계좌는 스크립트 속성 QUOTE_BANK 에 적음 (리포지토리가 공개라서 코드에 두지 않음). 로그인한 직원에게만 돌려줌
 *  - 매출·매입 보고서(/report/, /report/purchase/): 이카운트 판매현황·구매현황·재고현황·품목등록 엑셀을 '매출'·'매입'·'재고'·'품목' 탭에 저장하고
 *    올린 기록은 '보고서업로드' 탭에 남김 (GET report / POST report). 집계와 그래프는 보고서 페이지가 함
 *    판매현황·구매현황은 파일의 기간(과 거래처 필터)에 해당하는 예전 줄을 지우고 새로 넣으므로 같은 달을 다시 올려도 겹치지 않음
 *    매출·매입은 민감한 정보라서 CONFIG.REPORT_VIEWERS 에 적은 계정만 보고 올릴 수 있음 (비워두면 로그인한 직원 모두)
 *  - 루비개러지 앱(/garage/): 개러지 담당자(CONFIG.GARAGE_VIEWERS)도 볼 수 있는 정제한 보고서 데이터 (GET/POST garage)
 *    개러지 거래처 매출은 금액까지, 나머지 채널은 판매 수량만, 품목은 원가(입고단가·딜러가) 없이 돌려줌
 *    스마트스토어 통계 엑셀(유입·조회·결제)은 '트래픽' 탭에 저장
 *  - 구글 캘린더(CONFIG.CALENDARS)의 한 달치 일정을 읽어 첫 화면 오른쪽 달력에 돌려줌 (GET calendar)
 *    달력에서 일정 넣기·고치기·지우기도 받음 (POST event). 반복 일정은 구글 캘린더에서만 고침
 *
 * 배포: 확장 프로그램 > Apps Script > 배포 > 새 배포 > 웹 앱
 *   실행 사용자: 나 / 액세스: 모든 사용자 (구글 로그인 세션으로 보호)
 *
 * 로그인
 *  - 포털 첫 화면에서 회사 구글 워크스페이스 계정(CONFIG.ALLOWED_DOMAINS)으로 로그인
 *  - 포털이 보낸 구글 ID 토큰을 여기서 구글에 확인한 뒤, 30일짜리 포털 세션을 발급함
 *  - 이후 모든 요청에 세션(s)이 필요하고, 공지·체크리스트·일정의 작성자는 로그인한 사람 이름으로 들어감
 *  - 세션은 스크립트 속성에 저장됨. 모두 로그아웃시키려면 편집기에서 clearAllSessions 실행
 */

// ───────────────────────────── 설정 ─────────────────────────────

const CONFIG = {
  // 00_My Rubi Index 스프레드시트 ID ('공지'·'체크리스트' 탭을 저장하는 곳)
  INDEX_SHEET_ID: '1wkogYTTI26ha1YsYu35pOLSBFSxIRok58qYRqRw18mA',

  // 구글 로그인: Google Cloud 콘솔에서 만든 OAuth 클라이언트 ID (포털 config.js 의 값과 같아야 함)
  GOOGLE_CLIENT_ID: '170788190959-st694dptpqurkm17fglb21bmhph2ui53.apps.googleusercontent.com',
  // 이 도메인들의 구글 워크스페이스 계정만 로그인 허용 (기본 도메인과 별칭 도메인 모두)
  ALLOWED_DOMAINS: ['rubiworkshop.com', 'rubi.kr'],
  // 도메인 밖이지만 예외로 허용할 계정 (예: ['someone@gmail.com'])
  EXTRA_EMAILS: [],
  // 로그인 유지 기간
  SESSION_DAYS: 30,

  TZ: 'Asia/Seoul',

  // 체크리스트 개인 목록: 여기 적은 멤버의 체크리스트는 본인(과 viewers 에 적은 사람)에게만 보임
  //  emails : 본인 계정. 아이디(@ 앞)만 적으면 rubiworkshop.com, rubi.kr 어느 쪽으로 로그인해도 맞음
  //  names  : emails 가 비어 있을 때만 쓰는 임시 확인용 구글 계정 이름 (계정 이름은 바꿀 수 있으므로 이메일을 적는 것이 안전)
  //  viewers: 본인 말고 이 목록을 볼 수 있는 계정 (예: ['ohyun'])
  PRIVATE_CHECKLISTS: {
    '권오현': { emails: ['ohyun'], names: ['권오현', 'Ohyun Kwon'], viewers: [] },
    '권오륜': { emails: ['oryun'], names: ['권오륜'],               viewers: [] },
  },
  // 예전에 구글 계정 이름으로 저장된 담당자 이름을 멤버 이름으로 맞춤 (포털 config.js 의 MEMBER_ALIASES 와 같게)
  CHECK_OWNER_ALIASES: { 'Ohyun Kwon': '권오현' },

  // 포털 첫 화면 오른쪽 달력에 보여줄 구글 캘린더 ID 목록 (구글 캘린더 → 캘린더 설정 → 캘린더 ID)
  //  비워두면 이 스크립트를 실행하는 계정의 기본 캘린더만 보여줌
  //  회사 공용 캘린더는 '…@group.calendar.google.com', 직원 캘린더는 이메일 그대로 (이 계정에 공유되어 있어야 읽힘)
  //  예: CALENDARS: ['primary', 'abc123@group.calendar.google.com', 'oryun@rubiworkshop.com'],
  CALENDARS: ['rubiworkshop.com_dl9dl4aqajbc3gludolt5of1o8@group.calendar.google.com'],
  // 같은 달을 다시 물을 때 이 시간(초) 동안은 캘린더를 다시 읽지 않고 받아 둔 결과를 돌려줌
  CALENDAR_CACHE_SEC: 120,

  // 매출·매입 보고서를 보고 올릴 수 있는 계정 (apps.js 의 보고서 앱 only 와 맞춰 둘 것) (이메일 아이디만 적으면 rubiworkshop.com, rubi.kr 어느 쪽이든 맞음)
  //  비워두면 로그인한 직원 모두. 예: ['ohyun', 'oryun', 'someone@rubiworkshop.com']
  REPORT_VIEWERS: ['ohyun', 'oryun'],

  // 루비개러지 앱 담당자 (REPORT_VIEWERS 는 자동으로 포함). 이메일 아이디 또는 구글 계정 이름
  //  이름은 바꿀 수 있으므로 이메일 아이디를 함께 적어 두는 것이 안전 (예: ['전요셉', 'yosep'])
  //  apps.js 의 garage 앱 only 와 맞출 것
  GARAGE_VIEWERS: ['전요셉'],
  // 판매현황 거래처명 중 루비개러지로 볼 것 (정규식)
  GARAGE_PARTNER: '개러지',
};

// 공지 탭 컬럼 (바탕화면 포스트잇)
const NOTE_COLS = ['id', 'type', 'text', 'date', 'time', 'color', 'author', 'email', 'createdAt', 'updatedAt'];
const NOTE_HEADERS = ['ID', '종류(notice/event)', '내용', '날짜', '시간', '색', '작성자', '이메일', '작성일시', '수정일시'];
const NOTE_COLORS = ['yellow', 'pink', 'blue', 'green'];

// 체크리스트 탭 컬럼 (멤버별 체크리스트). project·due 는 2026-11 에 뒤에 덧붙임 (예전 시트도 처음 쓸 때 머리글이 채워짐)
const CHECK_COLS = ['id', 'owner', 'text', 'repeat', 'doneAt', 'doneBy', 'order', 'author', 'email', 'createdAt', 'updatedAt', 'project', 'due'];
const CHECK_HEADERS = ['ID', '담당(여러 명은 쉼표)', '내용', '반복(daily/weekly/once)', '끝낸 일시', '끝낸 사람', '순서', '작성자', '이메일', '작성일시', '수정일시', '프로젝트 ID', '마감일'];
const CHECK_REPEATS = ['daily', 'weekly', 'once'];

// 프로젝트 탭 컬럼
const PROJ_COLS = ['id', 'name', 'lead', 'due', 'status', 'memo', 'order', 'author', 'email', 'createdAt', 'updatedAt'];
const PROJ_HEADERS = ['ID', '프로젝트', '책임자', '마감일', '상태(active/hold/done)', '메모', '순서', '작성자', '이메일', '작성일시', '수정일시'];
const PROJ_STATUS = ['active', 'hold', 'done'];

// 고객 탭 컬럼 (고객관리). 한 줄 = 고객 한 명의 구매 건 하나 (한 사람이 두 건이면 두 줄)
const CRM_COLS = ['id', 'name', 'info', 'group', 'item', 'stage', 'memo', 'flag', 'owner', 'amount', 'stageAt', 'author', 'email', 'createdAt', 'updatedAt'];
const CRM_HEADERS = ['ID', '고객명', '고객 정보(소속·관계)', '구분', '브랜드·모델', '단계', '현재 상황', '확인 필요', '담당', '계약금(원)', '단계 바뀐 일시', '작성자', '이메일', '작성일시', '수정일시'];
// 고객로그 탭: 단계·현재 상황·확인 필요가 바뀔 때마다 한 줄씩 쌓임 (주차별 변화와 고객별 이력을 여기서 계산)
const CRM_LOG_COLS = ['id', 'cid', 'name', 'stage', 'memo', 'flag', 'by', 'at'];
const CRM_LOG_HEADERS = ['ID', '고객 ID', '고객명', '단계', '현재 상황', '확인 필요', '기록한 사람', '기록 일시'];
// 단계는 상담 10단계 + 종료(취소·보류). 시트에도 한글 그대로 저장함 (포털 assets/crm.js 의 STAGES 와 같게)
const CRM_STAGES = ['문의', '상담', '견적', '계약금', '예약금', '발주', '입고', '조립', '출고', '루비케어', '종료'];
const CRM_GROUPS = ['개별 아카이브', '루비 브랜드', '컴포넌트 및 기타 브랜드'];

// 적립금 탭 (assets/crm.js). 한 줄 = 적립·사용 한 번. 금액은 적립 +, 사용·소멸 −, 조정은 적은 부호 그대로
const POINT_COLS = ['id', 'name', 'cid', 'qid', 'type', 'amount', 'memo', 'date', 'expire', 'by', 'email', 'createdAt'];
const POINT_HEADERS = ['ID', '고객명', '고객 건 ID', '견적 ID', '구분', '금액(원)', '내용', '날짜', '유효기한', '기록한 사람', '이메일', '기록 일시'];
const POINT_TYPES = ['적립', '사용', '조정', '소멸'];
const POINT_AUTO_USE = '[견적 결제]';   // 견적 지불 현황에서 자동으로 만든 사용 줄 표시

// 견적 탭 (assets/quote.js). 새 열은 뒤에만 붙임 (이미 만든 시트의 열 순서를 지키려고)
const QUOTE_COLS = ['id', 'no', 'cid', 'name', 'title', 'items', 'subtotal', 'discount', 'total', 'memo', 'note', 'valid', 'status', 'owner', 'author', 'email', 'createdAt', 'updatedAt',
  'brand', 'model', 'color', 'sn', 'rubiSn', 'fn', 'final', 'payments', 'request', 'ship', 'spec', 'paid',
  'receipt', 'removed', 'kind', 'parent'];
const QUOTE_HEADERS = ['ID', '견적 번호', '고객 건 ID', '고객명', '견적 제목(옵션 이름)', '품목(JSON)', '소비자가 합계(원)', '할인 합계(원)', '최종 견적 금액(원)', '비고(문서에 보임)', '내부 메모', '유효기간', '상태', '담당', '작성자', '이메일', '작성일시', '수정일시',
  '브랜드', '모델', '컬러·사양', '고유 시리얼', '루비 시리얼', '프레임 넘버', '최종 금액 직접 입력(원)', '지불 현황(JSON)', '결제 요청(JSON)', '출고일', '빌드 사양(JSON)', '지불 합계(원)',
  '증빙(JSON)', '탈거품(JSON)', '견적 종류', '원래 견적 ID'];
// 견적 종류: '' 보통 견적, '업그레이드' 출고한 자전거의 업그레이드 작업 견적 (parent 에 원래 견적 ID)
const QUOTE_KINDS = ['업그레이드'];
// 증빙 종류와 결제별 증빙 상태, 품목 재고상태, 탈거품 처리 (포털 quote.js 와 같게)
const QUOTE_RC_TYPES = ['현금영수증 (소득공제)', '현금영수증 (지출증빙)', '세금계산서', '카드 매출전표', '자진발급', '발행 안 함'];
const QUOTE_RC_STATES = ['발행 전', '발행 완료', '자진발급', '미발행', '해당 없음'];
const QUOTE_STOCK = ['재고 있음', '발주 필요', '발주함', '입고', '이동완료', '불출완료'];
const QUOTE_REMOVED_TO = ['고객 반환', '매장 보관', '보상 매입', '다른 빌드로', '폐기'];
const QUOTE_STATUS = ['작성중', '보냄', '계약', '취소'];
// 분류. 포털 quote.js 의 CATS 와 같게 (예전 견적 시트 DB 탭의 분류)
const QUOTE_CATS = ['서비스', '완성차', '프레임', '드라이브트레인', '휠세트', '컴포넌트', '스몰 파츠', '자전거 악세사리', '라이더 이큅먼트'];
// 첫 판(2026-11-08) 분류 이름을 지금 분류로
const QUOTE_CAT_OLD = { '프레임셋': '프레임', '구동계': '드라이브트레인', '휠·타이어': '휠세트', '콕핏': '컴포넌트', '안장·시트포스트': '컴포넌트', '페달': '컴포넌트', '액세서리': '자전거 악세사리', '공임': '서비스', '기타': '컴포넌트' };
const QUOTE_SNAP_COLS = ['id', 'qid', 'no', 'label', 'data', 'total', 'by', 'at'];
// 포털 탭: 고객에게 공개한 정제 사본. key 는 고객 링크(portal.rubiworkshop.com/#키)
const PORTAL_COLS = ['key', 'qid', 'cid', 'name', 'data', 'publishedAt', 'by', 'active', 'views', 'lastView', 'ckey'];
const PORTAL_HEADERS = ['키', '견적 ID', '고객 건 ID', '고객명', '공개한 내용(JSON)', '공개 일시', '공개한 사람', '공개 중', '열어 본 횟수', '마지막으로 열어 본 일시', '고객 키'];
// 고객코드 탭: 포털 로그인 코드. 꼴은 RUBI-가입연도-임의 8자 (임의 부분은 Crockford Base32, 헷갈리는 I·L·O·U 없음)
// 시트에는 하이픈 없이 'RUBI' + 연도 4자리 + 임의 8자 = 16자로 저장
const CODE_COLS = ['code', 'ckey', 'name', 'issuedAt', 'by', 'active', 'logins', 'lastLogin'];
const CODE_HEADERS = ['고객코드', '고객 키', '고객명', '발급 일시', '발급한 사람', '사용 중', '로그인 횟수', '마지막 로그인'];
const CODE_ABC = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
// 매출 보고서 탭 (이카운트 엑셀에서 읽은 값)
const SALE_COLS = ['date', 'no', 'code', 'name', 'qty', 'price', 'supply', 'vat', 'total', 'partner', 'wh', 'up'];
const SALE_HEADERS = ['일자', '전표 번호', '품목코드', '품목명(규격)', '수량', '단가', '공급가액', '부가세', '합계', '거래처명', '창고', '올린 기록 ID'];
const PUR_HEADERS = ['일자', '전표 번호', '품목코드', '품목명(규격)', '수량', '단가', '공급가액', '부가세', '합계', '거래처명(공급처)', '창고', '올린 기록 ID'];
const STOCK_COLS = ['date', 'code', 'name', 'wh', 'qty', 'up'];
const STOCK_HEADERS = ['기준일', '품목코드', '품목명(규격)', '창고', '재고 수량', '올린 기록 ID'];
const ITEM_COLS = ['code', 'name', 'cost', 'out', 'retail', 'supply', 'cat', 'group', 'up'];
const ITEM_HEADERS = ['품목코드', '품목명', '입고단가', '출고단가', '소비자가격', '서플라이(딜러가)', '계층그룹명', '품목그룹1명', '올린 기록 ID'];
const TRAFFIC_COLS = ['from', 'to', 'dim', 'key', 'date', 'visits', 'views', 'orders', 'amount', 'up'];
const TRAFFIC_HEADERS = ['기간 시작', '기간 끝', '구분(path/daily/channel/product/keyword)', '항목(경로·채널·상품·키워드)', '날짜', '방문고객수·유입수', '조회수', '결제고객수·결제수', '판매금액', '올린 기록 ID'];
const UPLOAD_COLS = ['id', 'kind', 'file', 'from', 'to', 'scope', 'rows', 'amount', 'by', 'at'];
const UPLOAD_HEADERS = ['ID', '종류(sales/purchase/stock/items/traffic)', '파일 이름', '시작일', '끝일', '거래처 필터', '줄 수', '금액 합계(공급가액)', '올린 사람', '올린 일시'];

const QUOTE_SNAP_HEADERS = ['ID', '견적 ID', '견적 번호', '기록 이름', '그 시점 견적(JSON)', '최종 견적 금액(원)', '남긴 사람', '남긴 일시'];

// ───────────────────────────── HTTP ─────────────────────────────

function doGet(e) {
  try {
    const p = e.parameter || {};
    if (p.action === 'ping') return json_({ ok: true });   // 연결 확인은 로그인 없이
    if (p.action === 'portal') return json_(p.c ? portalLogin_(p.c) : portalView_(p.k));   // 고객 포털: 고객코드 로그인 또는 키(세션)로 정제 사본만
    const user = auth_(p.s);

    switch (p.action) {
      case 'me':       return json_({ ok: true, user: publicUser_(user) });
      case 'notes':    return json_({ ok: true, notes: listNotes_() });
      case 'checks':   return json_({ ok: true, ...checkData_(user) });
      case 'calendar': return json_({ ok: true, ...listCalendar_(p.month) });
      case 'crm':      return json_({ ok: true, ...crmData_() });
      case 'quotes':   return json_({ ok: true, ...quoteData_() });
      case 'quotesnap': return json_({ ok: true, snap: quoteSnap_(p.id) });
      case 'report':   return json_({ ok: true, ...reportData_(user) });
      case 'garage':   return json_({ ok: true, ...garageData_(user) });
      default:         return json_({ ok: false, error: 'unknown action' });
    }
  } catch (err) {
    return json_({ ok: false, error: errMsg_(err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    if (body.action === 'login')  return json_({ ok: true, ...login_(body.credential) });
    if (body.action === 'logout') { logout_(body.s); return json_({ ok: true }); }
    const user = auth_(body.s);

    switch (body.action) {
      case 'note':     return json_({ ok: true, notes: saveNote_(body, user) });
      case 'check':    saveCheck_(body, user);   return json_({ ok: true, ...checkData_(user) });
      case 'project':  { const saved = saveProject_(body, user) || ''; return json_({ ok: true, saved, ...checkData_(user) }); }
      case 'event':    return json_({ ok: true, ...saveEvent_(body, user) });
      case 'crm':      { const saved = saveCrm_(body, user) || ''; return json_({ ok: true, saved, ...crmData_() }); }
      case 'point':    { const saved = savePoint_(body, user) || ''; return json_({ ok: true, saved, ...crmData_() }); }
      case 'quote':    { const saved = saveQuote_(body, user) || ''; return json_({ ok: true, saved, ...quoteData_() }); }
      case 'report':   return json_({ ok: true, ...saveReport_(body, user) });
      case 'garage':   return json_({ ok: true, ...saveGarage_(body, user) });
      default:         return json_({ ok: false, error: 'unknown action' });
    }
  } catch (err) {
    return json_({ ok: false, error: errMsg_(err) });
  } finally {
    lock.releaseLock();
  }
}

function errMsg_(err) {
  return String(err && err.message ? err.message : err).replace(/^Error:\s*/, '');
}

// ───────────────────────────── 로그인 ─────────────────────────────

/** 구글 ID 토큰을 확인하고 포털 세션을 발급함 */
function login_(credential) {
  if (!CONFIG.GOOGLE_CLIENT_ID) throw new Error('Code.gs 의 GOOGLE_CLIENT_ID 가 비어 있습니다');
  if (!credential) throw new Error('로그인 정보가 없습니다');
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('구글 로그인을 확인하지 못했습니다. 다시 시도해 주세요');
  const t = JSON.parse(res.getContentText());
  const email = String(t.email || '').toLowerCase();
  if (t.aud !== CONFIG.GOOGLE_CLIENT_ID) throw new Error('다른 앱의 로그인 정보입니다');
  if (String(t.email_verified) !== 'true') throw new Error('확인되지 않은 이메일입니다');
  if (Number(t.exp) * 1000 < Date.now()) throw new Error('로그인 정보가 만료되었습니다. 다시 시도해 주세요');
  const inDomain = CONFIG.ALLOWED_DOMAINS.includes(String(t.hd || ''));   // hd: 워크스페이스 계정에만 있는 값
  const extra = CONFIG.EXTRA_EMAILS.map(x => String(x).toLowerCase()).includes(email);
  if (!inDomain && !extra) throw new Error('회사 구글 계정(' + CONFIG.ALLOWED_DOMAINS.join(', ') + ')으로 로그인해 주세요');

  const user = { email, name: t.name || email.split('@')[0], picture: t.picture || '', exp: Date.now() + CONFIG.SESSION_DAYS * 86400000 };
  const token = randomString_(40);
  const props = PropertiesService.getScriptProperties();
  pruneSessions_(props);
  props.setProperty('sess:' + hash_(token), JSON.stringify(user));
  return { session: token, user: publicUser_(user) };
}

/** 세션을 확인하고 로그인한 사람을 돌려줌. 없거나 만료되면 unauthorized */
function auth_(token) {
  if (!token) throw new Error('unauthorized');
  const key = 'sess:' + hash_(token);
  const cache = CacheService.getScriptCache();
  let raw = cache.get(key);
  if (!raw) { raw = PropertiesService.getScriptProperties().getProperty(key); if (raw) cache.put(key, raw, 600); }
  if (!raw) throw new Error('unauthorized');
  const user = JSON.parse(raw);
  if (user.exp < Date.now()) { PropertiesService.getScriptProperties().deleteProperty(key); cache.remove(key); throw new Error('unauthorized'); }
  return user;
}

function logout_(token) {
  if (!token) return;
  const key = 'sess:' + hash_(token);
  PropertiesService.getScriptProperties().deleteProperty(key);
  CacheService.getScriptCache().remove(key);
}

function publicUser_(u) { return { email: u.email, name: u.name, picture: u.picture, exp: u.exp }; }

function pruneSessions_(props) {
  const all = props.getProperties(), now = Date.now();
  Object.keys(all).forEach(k => {
    if (k.indexOf('sess:') !== 0) return;
    try { if (JSON.parse(all[k]).exp < now) props.deleteProperty(k); } catch (e) { props.deleteProperty(k); }
  });
}

function hash_(s) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s)));
}

function randomString_(len) {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  while (s.length < len) {
    const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Math.random());
    for (const b of bytes) { if (s.length >= len) break; s += chars[((b + 256) % 256) % chars.length]; }
  }
  return s;
}

/** 편집기에서 직접 실행용: 모든 기기를 로그아웃시킴 (퇴사자가 생겼을 때 등) */
function clearAllSessions() {
  const props = PropertiesService.getScriptProperties(), all = props.getProperties();
  let n = 0;
  Object.keys(all).forEach(k => { if (k.indexOf('sess:') === 0) { props.deleteProperty(k); n++; } });
  Logger.log('세션 ' + n + '개를 지웠습니다. 캐시 때문에 최대 10분 뒤 모두 적용됩니다');
}

/** 편집기에서 직접 실행용: 지금 로그인되어 있는 사람 목록 */
function listSessions() {
  const all = PropertiesService.getScriptProperties().getProperties();
  Object.keys(all).filter(k => k.indexOf('sess:') === 0).forEach(k => {
    const u = JSON.parse(all[k]);
    Logger.log(u.email + '  ~' + Utilities.formatDate(new Date(u.exp), CONFIG.TZ, 'yyyy-MM-dd'));
  });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ───────────────────────────── Index 스프레드시트 ─────────────────────────────

function indexSs_() {
  const id = CONFIG.INDEX_SHEET_ID || PropertiesService.getScriptProperties().getProperty('INDEX_SHEET_ID');
  if (!id) throw new Error('Code.gs 의 INDEX_SHEET_ID 가 비어 있습니다');
  return SpreadsheetApp.openById(id);
}

function now_() {
  return Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd HH:mm');
}

// ───────────────────────────── 공지 (바탕화면 포스트잇) ─────────────────────────────

function noteSheet_() {
  const ss = indexSs_();
  let sh = ss.getSheetByName('공지');
  if (!sh) {
    sh = ss.insertSheet('공지');
    sh.getRange(1, 1, 1, NOTE_HEADERS.length).setValues([NOTE_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    // 날짜·시간이 자동으로 날짜 형식으로 바뀌지 않게 글자 그대로 저장
    sh.getRange(1, 1, sh.getMaxRows(), NOTE_COLS.length).setNumberFormat('@');
  }
  return sh;
}

/** 시트 값 → 문자열 (예전에 날짜 형식으로 바뀐 칸도 처리) */
function noteCell_(v, col) {
  if (v instanceof Date) {
    if (col === 'time') return Utilities.formatDate(v, CONFIG.TZ, 'HH:mm');
    if (col === 'date') return Utilities.formatDate(v, CONFIG.TZ, 'yyyy-MM-dd');
    return Utilities.formatDate(v, CONFIG.TZ, 'yyyy-MM-dd HH:mm');
  }
  return v == null ? '' : String(v);
}

/** 공지 목록. 지난 지 30일이 넘은 일정은 빼고 돌려줌 (시트에는 남음) */
function listNotes_() {
  const sh = noteSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const cutoff = Utilities.formatDate(new Date(Date.now() - 30 * 86400000), CONFIG.TZ, 'yyyy-MM-dd');
  return sh.getRange(2, 1, last - 1, NOTE_COLS.length).getValues()
    .map(r => { const o = {}; NOTE_COLS.forEach((k, i) => o[k] = noteCell_(r[i], k)); delete o.email; return o; })
    .filter(o => o.id && o.text && !(o.type === 'event' && o.date && o.date < cutoff));
}

/** op: add / update / delete. 저장 후 전체 목록을 돌려줌 */
function saveNote_(b, user) {
  const sh = noteSheet_();
  const op = String(b.op || '');
  const findRow = id => {
    const last = sh.getLastRow();
    if (!id || last < 2) return -1;
    const ids = sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0]));
    const i = ids.indexOf(String(id));
    return i < 0 ? -1 : i + 2;
  };

  if (op === 'delete') {
    const row = findRow(b.id);
    if (row > 0) sh.deleteRow(row);
    return listNotes_();
  }

  const type = b.type === 'event' ? 'event' : 'notice';
  const text = String(b.text || '').trim().slice(0, 500);
  const date = type === 'event' ? String(b.date || '') : '';
  const time = type === 'event' ? String(b.time || '') : '';
  const color = NOTE_COLORS.indexOf(b.color) >= 0 ? b.color : (type === 'event' ? 'blue' : 'yellow');
  if (!text) throw new Error('내용을 적어 주세요');
  if (type === 'event' && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('일정 날짜가 필요합니다');
  if (time && !/^\d{2}:\d{2}$/.test(time)) throw new Error('시간 형식이 맞지 않습니다');

  if (op === 'add') {
    const o = { id: Utilities.getUuid().slice(0, 8), type, text, date, time, color,
      author: user.name || user.email, email: user.email, createdAt: now_(), updatedAt: '' };
    const row = sh.getLastRow() + 1;
    sh.getRange(row, 1, 1, NOTE_COLS.length).setNumberFormat('@').setValues([NOTE_COLS.map(k => o[k])]);
    return listNotes_();
  }
  if (op === 'update') {
    const row = findRow(b.id);
    if (row < 0) throw new Error('이미 떼어진 포스트잇입니다. 새로 고침해 주세요');
    const cur = sh.getRange(row, 1, 1, NOTE_COLS.length).getValues()[0];
    const o = {}; NOTE_COLS.forEach((k, i) => o[k] = noteCell_(cur[i], k));
    Object.assign(o, { type, text, date, time, color, updatedAt: now_() });
    sh.getRange(row, 1, 1, NOTE_COLS.length).setNumberFormat('@').setValues([NOTE_COLS.map(k => o[k])]);
    return listNotes_();
  }
  throw new Error('unknown op');
}

// ───────────────────────────── 체크리스트 (멤버별) + 프로젝트 ─────────────────────────────
// 한 줄 = 한 항목. 프로젝트 항목은 '프로젝트' 열에 프로젝트 ID가 있는 줄이고, 담당 칸에 여러 명(쉼표 구분)이 들어갈 수 있음
// 개인 목록(PRIVATE_CHECKLISTS) 숨김은 프로젝트가 없는 줄에만 적용됨. 프로젝트 항목은 모두에게 보임

function checkSheet_() {
  const ss = indexSs_();
  let sh = ss.getSheetByName('체크리스트');
  if (!sh) {
    sh = ss.insertSheet('체크리스트');
    sh.getRange(1, 1, 1, CHECK_HEADERS.length).setValues([CHECK_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), CHECK_COLS.length).setNumberFormat('@');
  } else if (sh.getLastColumn() < CHECK_COLS.length) {
    // 예전 시트: 뒤에 새 열(프로젝트 ID, 마감일) 머리글을 채우고 글자 형식으로
    if (sh.getMaxColumns() < CHECK_COLS.length) sh.insertColumnsAfter(sh.getMaxColumns(), CHECK_COLS.length - sh.getMaxColumns());
    sh.getRange(1, 1, 1, CHECK_HEADERS.length).setValues([CHECK_HEADERS]).setFontWeight('bold');
    sh.getRange(1, 1, sh.getMaxRows(), CHECK_COLS.length).setNumberFormat('@');
  }
  return sh;
}

function projectSheet_() {
  const ss = indexSs_();
  let sh = ss.getSheetByName('프로젝트');
  if (!sh) {
    sh = ss.insertSheet('프로젝트');
    sh.getRange(1, 1, 1, PROJ_HEADERS.length).setValues([PROJ_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), PROJ_COLS.length).setNumberFormat('@');
  }
  return sh;
}

const checkOwner_ = n => { n = String(n || '').trim(); return (CONFIG.CHECK_OWNER_ALIASES || {})[n] || n; };
/** '권오현, 김현우' → ['권오현', '김현우'] (별칭 맞춤, 중복 제거) */
function ownerList_(v) {
  const arr = Array.isArray(v) ? v : String(v || '').split(/\s*,\s*/);
  const out = [];
  arr.forEach(n => { n = checkOwner_(String(n || '').slice(0, 40)); if (n && out.indexOf(n) < 0) out.push(n); });
  return out;
}

function checkRows_(sh) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, CHECK_COLS.length).getValues()
    .map(r => { const o = {}; CHECK_COLS.forEach((k, i) => o[k] = noteCell_(r[i], k)); o.order = Number(o.order) || 0; o.owner = ownerList_(o.owner).join(', '); o.doneBy = checkOwner_(o.doneBy); return o; });
}

function projectRows_() {
  const sh = projectSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, PROJ_COLS.length).getValues()
    .map(r => { const o = {}; PROJ_COLS.forEach((k, i) => o[k] = noteCell_(r[i], k)); o.order = Number(o.order) || 0; o.lead = checkOwner_(o.lead); return o; })
    .filter(o => o.id && o.name);
}

/** 이메일 아이디(@ 앞). 회사 도메인(ALLOWED_DOMAINS)이면 아이디만, 바깥 계정이면 이메일 전체로 비교 */
function emailKey_(email) {
  const e = String(email || '').toLowerCase().trim();
  const at = e.lastIndexOf('@');
  if (at < 0) return e;
  return CONFIG.ALLOWED_DOMAINS.includes(e.slice(at + 1)) ? e.slice(0, at) : e;
}
/** 이 사람이 그 멤버의 개인 체크리스트를 볼 수 있는지. 개인 목록이 아닌 멤버는 모두 볼 수 있음 */
function canSeeChecks_(owner, user) {
  const p = (CONFIG.PRIVATE_CHECKLISTS || {})[checkOwner_(owner)];
  if (!p) return true;
  const me = emailKey_(user.email);
  const keys = (p.emails || []).concat(p.viewers || []).map(emailKey_);
  if (keys.includes(me)) return true;
  if (!(p.emails || []).length) return (p.names || []).includes(String(user.name || '').trim());
  return false;
}
/** 이 줄을 볼 수 있는지: 프로젝트 항목은 모두, 개인 항목은 담당이 개인 목록이면 본인만 */
function canSeeRow_(o, user) {
  if (o.project) return true;
  return ownerList_(o.owner).every(n => canSeeChecks_(n, user));
}
/** 이 사람에게 탭을 숨길 멤버 */
function hiddenMembers_(user) {
  return Object.keys(CONFIG.PRIVATE_CHECKLISTS || {}).filter(n => !canSeeChecks_(n, user));
}

/** 목록. 볼 수 없는 개인 항목과 끝낸 지 30일이 넘은 개인 '할 일'은 빼고 돌려줌 (시트에는 남음)
 *  프로젝트 항목은 진행률을 세야 하므로 오래되어도 돌려줌 */
function listChecks_(user) {
  const cutoff = Utilities.formatDate(new Date(Date.now() - 30 * 86400000), CONFIG.TZ, 'yyyy-MM-dd');
  return checkRows_(checkSheet_())
    .filter(o => canSeeRow_(o, user))
    .map(o => { delete o.email; return o; })
    .filter(o => o.id && o.text && (o.project || !(o.repeat === 'once' && o.doneAt && o.doneAt.slice(0, 10) < cutoff)));
}

function listProjects_() {
  return projectRows_().map(o => { delete o.email; return o; });
}

/** 체크리스트·프로젝트 응답 한 벌 */
function checkData_(user) {
  return { checks: listChecks_(user), projects: listProjects_(), hide: hiddenMembers_(user) };
}

/** op: add / update / toggle / delete */
function saveCheck_(b, user) {
  const sh = checkSheet_();
  const op = String(b.op || '');
  const who = user.name || user.email;
  const findRow = id => {
    const last = sh.getLastRow();
    if (!id || last < 2) return -1;
    const ids = sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0]));
    const i = ids.indexOf(String(id));
    return i < 0 ? -1 : i + 2;
  };
  const readRow = row => { const cur = sh.getRange(row, 1, 1, CHECK_COLS.length).getValues()[0]; const o = {}; CHECK_COLS.forEach((k, i) => o[k] = noteCell_(cur[i], k)); return o; };
  const gone = '이미 지워진 항목입니다. 새로 고침해 주세요';
  /** 남의 개인 목록에 있는 줄은 없는 것처럼 다룸 */
  const ownRow = id => { const row = findRow(id); if (row < 0) return -1; return canSeeRow_(readRow(row), user) ? row : -1; };
  const writeRow = (row, o) => sh.getRange(row, 1, 1, CHECK_COLS.length).setNumberFormat('@').setValues([CHECK_COLS.map(k => o[k] == null ? '' : String(o[k]))]);

  if (op === 'delete') {
    const row = ownRow(b.id);
    if (row > 0) sh.deleteRow(row);
    return;
  }
  if (op === 'toggle') {
    const row = ownRow(b.id);
    if (row < 0) throw new Error(gone);
    const o = readRow(row);
    if (b.done) { o.doneAt = now_(); o.doneBy = who; } else { o.doneAt = ''; o.doneBy = ''; }
    writeRow(row, o);
    return;
  }

  const project = String(b.project || '').trim();
  const owners = ownerList_(b.owners != null ? b.owners : b.owner);
  const text = String(b.text || '').trim().slice(0, 200);
  const repeat = CHECK_REPEATS.indexOf(b.repeat) >= 0 ? b.repeat : 'once';
  const order = Number(b.order) || 0;
  const due = /^\d{4}-\d{2}-\d{2}$/.test(String(b.due || '')) ? String(b.due) : '';
  if (!owners.length) throw new Error('담당 멤버가 필요합니다');
  if (!text) throw new Error('내용을 적어 주세요');
  if (project) {
    if (!projectRows_().some(p => p.id === project)) throw new Error('프로젝트를 찾지 못했습니다. 새로 고침해 주세요');
  } else {
    // 개인 항목은 한 명만. 개인 목록인 멤버에게는 본인만 넣을 수 있음
    if (owners.length > 1) throw new Error('담당을 여러 명 두는 항목은 프로젝트 안에서만 만들 수 있습니다');
    if (!canSeeChecks_(owners[0], user)) throw new Error(owners[0] + '님의 체크리스트에는 넣을 수 없습니다');
  }
  const owner = owners.join(', ');

  if (op === 'add') {
    const o = { id: Utilities.getUuid().slice(0, 8), owner, text, repeat, doneAt: '', doneBy: '', order,
      author: who, email: user.email, createdAt: now_(), updatedAt: '', project, due };
    writeRow(sh.getLastRow() + 1, o);
    return;
  }
  if (op === 'update') {
    const row = ownRow(b.id);
    if (row < 0) throw new Error(gone);
    const o = readRow(row);
    // 반복 종류가 바뀌면 끝낸 기록은 새로 시작
    if (o.repeat !== repeat) { o.doneAt = ''; o.doneBy = ''; }
    Object.assign(o, { owner, text, repeat, order, project, due, updatedAt: now_() });
    writeRow(row, o);
    return;
  }
  throw new Error('unknown op');
}

/** 프로젝트 op: add / update / delete. 지우면 그 프로젝트의 항목도 함께 지움 */
function saveProject_(b, user) {
  const sh = projectSheet_();
  const op = String(b.op || '');
  const who = user.name || user.email;
  const findRow = id => {
    const last = sh.getLastRow();
    if (!id || last < 2) return -1;
    const ids = sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0]));
    const i = ids.indexOf(String(id));
    return i < 0 ? -1 : i + 2;
  };
  const writeRow = (row, o) => sh.getRange(row, 1, 1, PROJ_COLS.length).setNumberFormat('@').setValues([PROJ_COLS.map(k => o[k] == null ? '' : String(o[k]))]);

  if (op === 'delete') {
    const row = findRow(b.id);
    if (row > 0) sh.deleteRow(row);
    // 그 프로젝트의 항목 줄을 아래에서부터 지움
    const csh = checkSheet_();
    const last = csh.getLastRow();
    if (last >= 2) {
      const pi = CHECK_COLS.indexOf('project');
      const vals = csh.getRange(2, pi + 1, last - 1, 1).getValues();
      for (let i = vals.length - 1; i >= 0; i--) if (String(vals[i][0]) === String(b.id)) csh.deleteRow(i + 2);
    }
    return;
  }

  const name = String(b.name || '').trim().slice(0, 60);
  const lead = checkOwner_(String(b.lead || '').slice(0, 40));
  const due = /^\d{4}-\d{2}-\d{2}$/.test(String(b.due || '')) ? String(b.due) : '';
  const status = PROJ_STATUS.indexOf(b.status) >= 0 ? b.status : 'active';
  const memo = String(b.memo || '').replace(/\r/g, '').trim().slice(0, 1000);
  const order = Number(b.order) || 0;
  if (!name) throw new Error('프로젝트 이름을 적어 주세요');

  if (op === 'add') {
    const o = { id: 'p' + Utilities.getUuid().slice(0, 7), name, lead, due, status, memo, order,
      author: who, email: user.email, createdAt: now_(), updatedAt: '' };
    writeRow(sh.getLastRow() + 1, o);
    return o.id;
  }
  if (op === 'update') {
    const row = findRow(b.id);
    if (row < 0) throw new Error('이미 지워진 프로젝트입니다. 새로 고침해 주세요');
    const cur = sh.getRange(row, 1, 1, PROJ_COLS.length).getValues()[0];
    const o = {}; PROJ_COLS.forEach((k, i) => o[k] = noteCell_(cur[i], k));
    Object.assign(o, { name, lead, due, status, memo, order, updatedAt: now_() });
    writeRow(row, o);
    return o.id;
  }
  throw new Error('unknown op');
}

// ───────────────────────────── 고객관리 (고객·고객로그 탭) ─────────────────────────────
// 고객 탭: 한 줄 = 구매 건 하나. 고객로그 탭: 새 건을 넣거나 단계·현재 상황·확인 필요가 바뀔 때마다 한 줄
// 고객 정보는 로그인한 직원에게만 돌려줌 (포털 코드가 있는 GitHub 리포지토리에는 고객 정보를 두지 않음)

function crmSheet_() {
  const ss = indexSs_();
  let sh = ss.getSheetByName('고객');
  if (!sh) {
    sh = ss.insertSheet('고객');
    sh.getRange(1, 1, 1, CRM_HEADERS.length).setValues([CRM_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), CRM_COLS.length).setNumberFormat('@');
  }
  return sh;
}

function crmLogSheet_() {
  const ss = indexSs_();
  let sh = ss.getSheetByName('고객로그');
  if (!sh) {
    sh = ss.insertSheet('고객로그');
    sh.getRange(1, 1, 1, CRM_LOG_HEADERS.length).setValues([CRM_LOG_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), CRM_LOG_COLS.length).setNumberFormat('@');
  }
  return sh;
}

function crmRows_(sh) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, CRM_COLS.length).getValues()
    .map(r => { const o = {}; CRM_COLS.forEach((k, i) => o[k] = noteCell_(r[i], k)); return o; })
    .filter(o => o.id && o.name);
}

function crmLogRows_() {
  const sh = crmLogSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, CRM_LOG_COLS.length).getValues()
    .map(r => { const o = {}; CRM_LOG_COLS.forEach((k, i) => o[k] = noteCell_(r[i], k)); return o; })
    .filter(o => o.cid);
}

/** 고객관리 응답 한 벌. 기록은 최근 2년치만 (시트에는 모두 남음) */
function crmData_() {
  const cutoff = Utilities.formatDate(new Date(Date.now() - 730 * 86400000), CONFIG.TZ, 'yyyy-MM-dd');
  return {
    customers: crmRows_(crmSheet_()).map(o => { delete o.email; return o; }),
    crmLogs: crmLogRows_().filter(l => String(l.at).slice(0, 10) >= cutoff),
    // 고객 상세 화면의 '견적' 묶음용 요약 (품목은 빼고)
    quotes: quoteRows_().filter(q => q.cid).map(q => ({ id: q.id, no: q.no, cid: q.cid, title: [q.kind, q.brand, q.model, q.title].filter(Boolean).join(' · '), total: q.total, paid: q.paid, status: q.status, ship: q.ship, at: q.updatedAt || q.createdAt })),
    points: pointRows_().map(o => { delete o.email; return o; }),
  };
}

/** 포털에서 온 값 확인 */
function crmInput_(b) {
  const name = String(b.name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!name) throw new Error('고객 이름을 적어 주세요');
  const amount = String(b.amount == null ? '' : b.amount).replace(/[^\d]/g, '').slice(0, 13);
  return {
    name,
    info: String(b.info || '').trim().slice(0, 100),
    group: CRM_GROUPS.indexOf(b.group) >= 0 ? b.group : CRM_GROUPS[CRM_GROUPS.length - 1],
    item: String(b.item || '').trim().slice(0, 120),
    stage: CRM_STAGES.indexOf(b.stage) >= 0 ? b.stage : '문의',
    memo: String(b.memo || '').replace(/\r/g, '').trim().slice(0, 2000),
    flag: String(b.flag || '').trim().slice(0, 60),
    owner: checkOwner_(String(b.owner || '').slice(0, 40)),
    amount,
  };
}

/** op: add / update / delete / bulk(rows: [{ id 있으면 고침, 없으면 새로 }]). add 는 새 ID를 돌려줌 */
function saveCrm_(b, user) {
  const sh = crmSheet_(), lsh = crmLogSheet_();
  const op = String(b.op || '');
  const who = user.name || user.email;
  const findRow = id => {
    const last = sh.getLastRow();
    if (!id || last < 2) return -1;
    const ids = sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0]));
    const i = ids.indexOf(String(id));
    return i < 0 ? -1 : i + 2;
  };
  const writeRow = (row, o) => sh.getRange(row, 1, 1, CRM_COLS.length).setNumberFormat('@').setValues([CRM_COLS.map(k => o[k] == null ? '' : String(o[k]))]);
  const readRow = row => { const cur = sh.getRange(row, 1, 1, CRM_COLS.length).getValues()[0]; const o = {}; CRM_COLS.forEach((k, i) => o[k] = noteCell_(cur[i], k)); return o; };
  const logs = [];
  const log = o => logs.push({ id: Utilities.getUuid().slice(0, 8), cid: o.id, name: o.name, stage: o.stage, memo: o.memo, flag: o.flag, by: who, at: now_() });

  const upsert = d => {
    const v = crmInput_(d);
    const row = d.id ? findRow(d.id) : -1;
    if (d.id && row < 0) throw new Error('이미 지워진 고객입니다. 새로 고침해 주세요');
    if (row < 0) {
      const o = Object.assign({ id: 'c' + Utilities.getUuid().slice(0, 7) }, v,
        { stageAt: now_(), author: who, email: user.email, createdAt: now_(), updatedAt: '' });
      writeRow(sh.getLastRow() + 1, o);
      log(o);
      return o.id;
    }
    const o = readRow(row);
    if (o.name !== v.name) pointRename_(o.id, v.name);
    const changed = o.stage !== v.stage || o.memo !== v.memo || o.flag !== v.flag;
    if (o.stage !== v.stage) o.stageAt = now_();
    Object.assign(o, v, { updatedAt: now_() });
    writeRow(row, o);
    if (changed) log(o);
    return o.id;
  };

  let out = '';
  if (op === 'delete') {
    const row = findRow(b.id);
    if (row > 0) sh.deleteRow(row);
    // 그 고객의 기록도 아래에서부터 지움
    const last = lsh.getLastRow();
    if (last >= 2) {
      const ci = CRM_LOG_COLS.indexOf('cid');
      const vals = lsh.getRange(2, ci + 1, last - 1, 1).getValues();
      for (let i = vals.length - 1; i >= 0; i--) if (String(vals[i][0]) === String(b.id)) lsh.deleteRow(i + 2);
    }
    return '';
  }
  if (op === 'add' || op === 'update') out = upsert(op === 'add' ? Object.assign({}, b, { id: '' }) : b);
  else if (op === 'bulk') {
    const rows = Array.isArray(b.rows) ? b.rows.slice(0, 200) : [];
    if (!rows.length) throw new Error('저장할 고객이 없습니다');
    // 그 사이 지워진 고객을 가리키는 줄은 새 고객으로 넣음 (한 줄 때문에 나머지가 저장되지 않는 일이 없게)
    rows.forEach(r => upsert(r.id && findRow(r.id) < 0 ? Object.assign({}, r, { id: '' }) : r));
    out = String(rows.length);
  } else throw new Error('unknown op');

  if (logs.length) {
    lsh.getRange(lsh.getLastRow() + 1, 1, logs.length, CRM_LOG_COLS.length).setNumberFormat('@')
      .setValues(logs.map(l => CRM_LOG_COLS.map(k => String(l[k] == null ? '' : l[k]))));
  }
  return out;
}

// ───────────────────────────── 적립금 (적립금 탭) ─────────────────────────────
// 고객관리 화면에서 적립·사용·조정·소멸을 한 줄씩 기록함. 잔액 = 그 고객 이름(띄어쓰기 무시)의 금액 합
// 견적과 연결: 적립 줄에 견적 ID(qid)를 남겨 같은 견적을 두 번 적립하지 않게 함
// 견적 지불 현황의 '마일리지'(예전 '적립금') 결제는 저장할 때마다 그 견적의 자동 사용 줄 하나로 맞춤 (pointSyncQuote_)

function pointSheet_() {
  const ss = indexSs_();
  let sh = ss.getSheetByName('적립금');
  if (!sh) {
    sh = ss.insertSheet('적립금');
    sh.getRange(1, 1, 1, POINT_HEADERS.length).setValues([POINT_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), POINT_COLS.length).setNumberFormat('@');
  }
  return sh;
}

function pointRows_() {
  const sh = pointSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, POINT_COLS.length).getValues()
    .map(r => { const o = {}; POINT_COLS.forEach((k, i) => o[k] = noteCell_(r[i], k === 'expire' ? 'date' : k)); return o; })
    .filter(o => o.id && o.name);
}

const pointWrite_ = (sh, row, o) => sh.getRange(row, 1, 1, POINT_COLS.length).setNumberFormat('@').setValues([POINT_COLS.map(k => o[k] == null ? '' : String(o[k]))]);
const pointFind_ = (sh, test) => {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const rows = sh.getRange(2, 1, last - 1, POINT_COLS.length).getValues();
  for (let i = 0; i < rows.length; i++) { const o = {}; POINT_COLS.forEach((k, j) => o[k] = String(rows[i][j])); if (test(o)) return i + 2; }
  return -1;
};

/** op: add / delete. add 는 새 ID를 돌려줌 */
function savePoint_(b, user) {
  const sh = pointSheet_();
  const op = String(b.op || '');
  const who = user.name || user.email;
  if (op === 'delete') {
    const row = pointFind_(sh, o => o.id === String(b.id));
    if (row > 0) sh.deleteRow(row);
    return '';
  }
  if (op !== 'add') throw new Error('unknown op');
  const name = String(b.name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!name) throw new Error('고객 이름이 없습니다');
  const type = POINT_TYPES.indexOf(b.type) >= 0 ? b.type : '적립';
  let amount = Math.round(Number(String(b.amount == null ? '' : b.amount).replace(/[^\d.\-]/g, '')) || 0);
  if (!amount) throw new Error('금액을 적어 주세요');
  if (type === '적립') amount = Math.abs(amount);
  if (type === '사용' || type === '소멸') amount = -Math.abs(amount);
  const qid = String(b.qid || '').trim().slice(0, 20);
  if (qid && type === '적립' && pointFind_(sh, o => o.qid === qid && o.type === '적립') > 0) throw new Error('이미 적립한 견적입니다');
  const day = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '';
  const o = {
    id: 'p' + Utilities.getUuid().slice(0, 7), name, cid: String(b.cid || '').trim().slice(0, 20), qid, type, amount: String(amount),
    memo: String(b.memo || '').replace(/\s+/g, ' ').trim().slice(0, 200),
    date: day(b.date) || Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd'), expire: day(b.expire),
    by: who, email: user.email, createdAt: now_(),
  };
  pointWrite_(sh, sh.getLastRow() + 1, o);
  return o.id;
}

/** 고객 건의 이름을 바꾸면 그 건으로 남긴 적립금 줄의 이름도 같이 */
function pointRename_(cid, name) {
  const sh = pointSheet_(), last = sh.getLastRow();
  if (!cid || last < 2) return;
  const ci = POINT_COLS.indexOf('cid'), ni = POINT_COLS.indexOf('name');
  const vals = sh.getRange(2, 1, last - 1, POINT_COLS.length).getValues();
  vals.forEach((r, i) => { if (String(r[ci]) === String(cid)) sh.getRange(i + 2, ni + 1).setValue(name); });
}

/** 견적 지불 현황에서 결제 수단이 '마일리지'(예전 '적립금')인 금액을 그 견적의 사용 줄 하나로 맞춤 (없으면 지움) */
function pointSyncQuote_(q, who, email) {
  const pays = quoteParse_(q.payments, []);
  const used = pays.filter(p => /적립금|마일리지/.test(p.method || '')).reduce((m, p) => m + (+p.amount || 0), 0);
  const sh = pointSheet_();
  const row = pointFind_(sh, o => o.qid === String(q.id) && o.type === '사용' && o.memo.indexOf(POINT_AUTO_USE) === 0);
  if (!used) { if (row > 0) sh.deleteRow(row); return; }
  let name = q.name;
  if (q.cid) { const c = crmRows_(crmSheet_()).find(x => x.id === q.cid); if (c) name = c.name; }
  const o = row > 0 ? (() => { const cur = sh.getRange(row, 1, 1, POINT_COLS.length).getValues()[0]; const x = {}; POINT_COLS.forEach((k, j) => x[k] = noteCell_(cur[j], k)); return x; })()
    : { id: 'p' + Utilities.getUuid().slice(0, 7), qid: q.id, type: '사용', by: who, email, createdAt: now_(), expire: '' };
  const lastDate = pays.filter(p => /적립금|마일리지/.test(p.method || '')).map(p => p.date).filter(Boolean).sort().pop();
  Object.assign(o, { name, cid: q.cid || '', amount: String(-Math.abs(used)), memo: `${POINT_AUTO_USE} 견적 ${q.no} 결제`, date: lastDate || Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd') });
  pointWrite_(sh, row > 0 ? row : sh.getLastRow() + 1, o);
}

// ───────────────────────────── 고객 포털 (포털 탭) ─────────────────────────────
// 견적 하나에 포털 줄 하나. 다시 공개하면 같은 키로 내용만 바꿈 (고객이 받은 링크가 그대로 살아 있게)
// 저장하는 내용은 portalClean_ 이 허용한 칸만. 포털 앱(sereno-kwon/portal)은 이 모양을 그대로 그림

function portalSheet_() {
  const ss = indexSs_();
  let sh = ss.getSheetByName('포털');
  if (!sh) {
    sh = ss.insertSheet('포털');
    sh.setFrozenRows(1);
  }
  // 처음 만들 때, 그리고 열이 늘어난 판(고객 키)으로 바꾼 뒤 처음 쓸 때 머리글을 맞춤
  if (sh.getLastColumn() < PORTAL_COLS.length) {
    if (sh.getMaxColumns() < PORTAL_COLS.length) sh.insertColumnsAfter(sh.getMaxColumns(), PORTAL_COLS.length - sh.getMaxColumns());
    sh.getRange(1, 1, 1, PORTAL_HEADERS.length).setValues([PORTAL_HEADERS]).setFontWeight('bold');
    sh.getRange(1, 1, sh.getMaxRows(), PORTAL_COLS.length).setNumberFormat('@');
  }
  return sh;
}
const portalNewKey_ = () => (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
const portalPerson_ = name => String(name || '').replace(/\s+/g, '');
function portalRows_() {
  const sh = portalSheet_(), last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, PORTAL_COLS.length).getValues()
    .map((r, i) => { const o = { _row: i + 2 }; PORTAL_COLS.forEach((k, j) => o[k] = noteCell_(r[j], k)); return o; })
    .filter(o => o.key);
}
const portalWrite_ = (row, o) => portalSheet_().getRange(row, 1, 1, PORTAL_COLS.length).setNumberFormat('@').setValues([PORTAL_COLS.map(k => o[k] == null ? '' : String(o[k]))]);
function portalSet_(qid, patch) {
  const r = portalRows_().find(x => x.qid === String(qid));
  if (!r) return;
  portalWrite_(r._row, Object.assign(r, patch));
}

/** 포털에 보낼 내용만 남김. 모르는 칸은 버리고 글자 수·개수를 자름 (가격 민감한 칸이 실수로 섞여도 저장되지 않게) */
function portalClean_(v) {
  v = v || {};
  const t = (x, n) => String(x == null ? '' : x).replace(/\r/g, '').trim().slice(0, n || 120);
  const n = x => { const k = Math.round(Number(x) || 0); return isFinite(k) ? k : 0; };
  const day = x => /^\d{4}-\d{2}-\d{2}$/.test(String(x || '')) ? String(x) : '';
  const arr = (x, max) => (Array.isArray(x) ? x : []).slice(0, max);
  // 원가·재고상태·증빙(번호·발행 상태)·줄 가격은 여기 목록에 없어서 보내도 저장되지 않음
  return {
    no: t(v.no, 20), issued: day(v.issued), valid: day(v.valid),
    kind: QUOTE_KINDS.indexOf(v.kind) >= 0 ? v.kind : '', parentNo: t(v.parentNo, 20),
    name: t(v.name, 40), owner: t(v.owner, 40),
    brand: t(v.brand, 60), model: t(v.model, 80), color: t(v.color, 80), title: t(v.title, 120),
    sn: t(v.sn, 60), fn: t(v.fn, 60), rubiSn: t(v.rubiSn, 60), ship: day(v.ship), care: day(v.care),
    summary: arr(v.summary, 12).map(x => [t(x && x[0], 20), n(x && x[1])]),
    list: n(v.list), offer: n(v.offer), total: n(v.total), paid: n(v.paid), remain: n(v.remain),
    request: { label: t(v.request && v.request.label, 40), amount: v.request && v.request.amount !== '' && v.request.amount != null ? n(v.request.amount) : '' },
    payments: arr(v.payments, 40).map(p => ({ label: t(p.label, 60), date: day(p.date), amount: n(p.amount), method: t(p.method, 30) })),
    kit: arr(v.kit, 120).map(k => ({ cat: t(k.cat, 20), slot: t(k.slot, 40), name: t(k.name, 160), qty: Math.max(1, Math.min(999, Number(k.qty) || 1)), gift: !!k.gift && !k.own, own: !!k.own })),
    spec: arr(v.spec, 8).map(sec => ({ title: t(sec.title, 30), fields: arr(sec.fields, 20).map(f => [t(f[0], 40), t(f[1], 120)]).filter(f => f[1]) })).filter(sec => sec.fields.length),
    // 탈거품: 이름과 처리만 (시리얼·비고는 내부용)
    removed: arr(v.removed, 60).map(x => ({ name: t(x && x.name, 160), to: QUOTE_REMOVED_TO.indexOf(x && x.to) >= 0 ? x.to : '' })).filter(x => x.name),
    memo: t(v.memo, 3000),
  };
}

/** 견적 앱의 '고객 포털에 공개': 저장된 견적이어야 하고, 내용은 포털 앱이 보낸 view 를 portalClean_ 으로 거름 */
function portalPublish_(b, user) {
  const q = quoteRows_().find(x => x.id === String(b.id));
  if (!q) throw new Error('저장한 견적만 공개할 수 있습니다');
  const data = portalClean_(b.view);
  const sh = portalSheet_();
  const rows = portalRows_();
  const ex = rows.find(x => x.qid === q.id);
  // 견적 키: UUID 두 개를 이어 하이픈을 뺀 64자 (추측할 수 없게)
  const key = ex ? ex.key : portalNewKey_();
  // 고객 이름: 고객 건에 연결돼 있으면 고객관리의 이름, 아니면 견적의 고객명
  let person = q.name;
  if (q.cid) { const c = crmRows_(crmSheet_()).find(x => x.id === q.cid); if (c) person = c.name; }
  // 고객 키: 같은 이름(띄어쓰기 무시)으로 이미 공개한 견적이 있으면 그 키를 함께 씀. 첫 화면에서 그 고객의 자전거가 한 목록에 모임
  const same = rows.find(x => x.qid !== q.id && x.ckey && portalPerson_(x.name) === portalPerson_(person));
  const ckey = (ex && ex.ckey && portalPerson_(ex.name) === portalPerson_(person)) ? ex.ckey : same ? same.ckey : portalNewKey_();
  const o = Object.assign(ex || { views: '0', lastView: '' }, {
    key, ckey, qid: q.id, cid: q.cid || '', name: person, data: JSON.stringify(data), publishedAt: now_(), by: user.name || user.email, active: 'Y',
  });
  portalWrite_(ex ? ex._row : sh.getLastRow() + 1, o);
  return key;
}

/** 포털 한 줄 → 고객에게 줄 견적 하나: 정제 사본 + 고객관리의 지금 단계·단계별 날짜(메모 없이) + 남은 금액이 있을 때 입금 계좌 */
function portalItem_(r, crm, logs, bank) {
  const data = quoteParse_(r.data, null);
  if (!data) return null;
  let stage = '', stages = {};
  if (r.cid) {
    const c = crm.find(x => x.id === r.cid);
    if (c && c.stage !== '종료') {
      stage = c.stage;
      logs.filter(l => l.cid === r.cid).sort((a, b) => String(a.at).localeCompare(String(b.at)))
        .forEach(l => { if (l.stage && !stages[l.stage]) stages[l.stage] = String(l.at).slice(0, 10); });
      if (c.stageAt && !stages[c.stage]) stages[c.stage] = String(c.stageAt).slice(0, 10);
    }
  }
  return { id: r.key, quote: data, stage, stages, bank: data.remain > 0 ? bank : '', publishedAt: r.publishedAt };
}

/** GET portal
 *  - 고객 키(ckey): 그 고객의 공개 중인 견적 목록 { mode: 'list', name, items }  (포털 첫 화면 '내 자전거')
 *  - 견적 키(key): 견적 하나 { mode: 'one', ...item }  (예전에 보낸 견적 링크)
 *  키가 틀리거나 공개를 끝냈으면 같은 답(not found) */
function portalView_(key) {
  key = String(key || '').replace(/[^0-9a-f]/gi, '');
  const none = { ok: false, error: 'not found' };
  if (key.length < 32) return none;
  const all = portalRows_();
  const mine = all.filter(x => x.ckey === key && x.active === 'Y');
  const one = mine.length ? null : all.find(x => x.key === key && x.active === 'Y');
  if (!mine.length && !one) return none;
  const crm = crmRows_(crmSheet_()), logs = crmLogRows_();
  const bank = PropertiesService.getScriptProperties().getProperty('QUOTE_BANK') || '';
  // 열어 본 횟수 (직원 화면에서 고객이 봤는지 확인용)
  const seen = rows => rows.forEach(r => { try { portalWrite_(r._row, Object.assign({}, r, { views: String((+r.views || 0) + 1), lastView: now_() })); } catch (e) {} });
  if (one) {
    const it = portalItem_(one, crm, logs, bank);
    if (!it) return none;
    seen([one]);
    return Object.assign({ ok: true, mode: 'one' }, it);
  }
  const items = mine.map(r => portalItem_(r, crm, logs, bank)).filter(Boolean)
    .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
  if (!items.length) return none;
  seen(mine);
  return { ok: true, mode: 'list', name: mine[0].name, items };
}

// ───────────────────────────── 고객코드 (포털 로그인) ─────────────────────────────
function codeSheet_() {
  const ss = indexSs_();
  let sh = ss.getSheetByName('고객코드');
  if (!sh) {
    sh = ss.insertSheet('고객코드');
    sh.getRange(1, 1, 1, CODE_HEADERS.length).setValues([CODE_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), CODE_COLS.length).setNumberFormat('@');
  }
  return sh;
}
function codeRows_() {
  const sh = codeSheet_(), last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, CODE_COLS.length).getValues()
    .map((r, i) => { const o = { _row: i + 2 }; CODE_COLS.forEach((k, j) => o[k] = String(r[j] == null ? '' : r[j])); return o; })
    .filter(o => o.code);
}
const codeWrite_ = (row, o) => codeSheet_().getRange(row, 1, 1, CODE_COLS.length).setNumberFormat('@').setValues([CODE_COLS.map(k => o[k] == null ? '' : String(o[k]))]);
/** 입력한 코드 → 비교용: 대문자, 하이픈·띄어쓰기 빼고, 'RUBI' 를 빼고 적었으면 붙임.
 *  임의 부분만 Crockford 규칙대로 O→0, I·L→1 (RUBI 의 I 는 그대로) */
function codeNorm_(c) {
  let v = String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (v.indexOf('RUBI') === 0) v = v.slice(4);
  return 'RUBI' + v.replace(/O/g, '0').replace(/[IL]/g, '1');
}
/** 시트 값(16자) → 보여줄 꼴 RUBI-2026-7K3M9QXP */
const codeFmt_ = c => { const v = String(c || ''); return v.length === 16 && v.indexOf('RUBI') === 0 ? `RUBI-${v.slice(4, 8)}-${v.slice(8)}` : v; };
/** 가입연도: 고객관리에서 같은 이름(띄어쓰기 무시)의 가장 이른 건의 연도, 없으면 올해 */
function codeYear_(name) {
  const k = portalPerson_(name);
  const ys = crmRows_(crmSheet_()).filter(c => portalPerson_(c.name) === k).map(c => String(c.createdAt).slice(0, 4)).filter(y => /^\d{4}$/.test(y)).sort();
  return ys[0] || Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy');
}
/** 새 코드: RUBI + 가입연도 + 임의 8자(40비트). 무작위 UUID 두 개를 SHA-256 으로 섞은 바이트의 아래 5비트를 32글자 표에 대응 */
function codeNew_(year) {
  const used = new Set(codeRows_().map(c => c.code));
  for (let t = 0; t < 10; t++) {
    const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid() + Date.now());
    let out = '';
    for (let i = 0; i < 8; i++) out += CODE_ABC[bytes[i] & 31];
    const code = 'RUBI' + year + out;
    if (!used.has(code)) return code;
  }
  throw new Error('코드를 만들지 못했습니다. 다시 눌러 주세요');
}

/** 견적 앱의 고객코드 발급. 견적이 포털에 공개돼 있어야 함 (그 견적의 고객 키에 코드를 붙임) */
function portalCode_(qid, renew, user) {
  const r = portalRows_().find(x => x.qid === String(qid));
  if (!r) throw new Error('먼저 고객 포털에 공개해 주세요');
  let ckey = r.ckey;
  if (!ckey) { ckey = portalNewKey_(); portalWrite_(r._row, Object.assign({}, r, { ckey })); }
  const mine = codeRows_().filter(c => c.ckey === ckey && c.active === 'Y');
  if (mine.length && !renew) return codeFmt_(mine[0].code);
  if (renew) {
    // 예전 코드를 끄고 고객 키도 바꿈 → 이미 로그인한 기기·예전 링크가 더는 열리지 않음
    mine.forEach(c => codeWrite_(c._row, Object.assign({}, c, { active: 'N' })));
    const nk = portalNewKey_();
    portalRows_().filter(x => x.ckey === ckey).forEach(x => portalWrite_(x._row, Object.assign({}, x, { ckey: nk })));
    ckey = nk;
  }
  const code = codeNew_(codeYear_(r.name));
  codeWrite_(codeSheet_().getLastRow() + 1, { code, ckey, name: r.name, issuedAt: now_(), by: user.name || user.email, active: 'Y', logins: '0', lastLogin: '' });
  return codeFmt_(code);
}

/** GET portal&c=코드: 맞으면 그 고객의 목록 + session(고객 키). 틀리면 같은 답, 너무 많이 틀리면 잠시 막음 */
function portalLogin_(input) {
  const cache = CacheService.getScriptCache();
  const fails = +(cache.get('portalFail') || 0);
  if (fails >= 30) return { ok: false, error: 'busy' };
  const code = codeNorm_(input);
  const c = code.length === 16 ? codeRows_().find(x => x.code === code && x.active === 'Y') : null;
  const v = c ? portalView_(c.ckey) : null;
  if (!c || !v || !v.ok || v.mode !== 'list') {
    cache.put('portalFail', String(fails + 1), 600);
    return { ok: false, error: 'not found' };
  }
  try { codeWrite_(c._row, Object.assign({}, c, { logins: String((+c.logins || 0) + 1), lastLogin: now_() })); } catch (e) {}
  return Object.assign(v, { session: c.ckey });
}

// ───────────────────────────── 견적 (견적 탭) ─────────────────────────────
// 한 줄 = 견적 하나. 예전 견적 시트(마스터·DB 탭)의 내용을 담음
//  품목(items)   : [{ cat 분류, slot 세부항목, name 모델명, list 소비자가, rate 할인율(%), price 견적가, qty, note 비고, sn 시리얼, slip 전표처리 날짜 }]
//  지불(payments): [{ label 결제 내용, date, amount, method 결제 수단 }]
//  결제 요청(request): { label, amount }, 빌드 사양(spec): { 항목 키: 값 }
// 금액은 포털이 보낸 값이 아니라 여기서 품목으로 다시 계산해 저장함
//  소비자가 합계(subtotal) = Σ 소비자가×수량, 최종 견적 금액(total) = 직접 입력한 최종 금액(final) 또는 Σ 견적가×수량
//  할인 합계(discount) = 소비자가 합계 − 최종 견적 금액 (예전 시트의 '스페셜오퍼'와 줄별 할인을 합친 값)

const quoteParse_ = (v, d) => { try { const x = JSON.parse(v || ''); return x == null ? d : x; } catch (e) { return d; } };
const QUOTE_JSON = ['items', 'payments', 'request', 'spec', 'receipt', 'removed'];

function quoteSheet_() {
  const ss = indexSs_();
  let sh = ss.getSheetByName('견적');
  if (!sh) {
    sh = ss.insertSheet('견적');
    sh.setFrozenRows(1);
  }
  // 처음 만들 때, 그리고 열이 늘어난 판으로 바꾼 뒤 처음 쓸 때 머리글을 맞춤
  if (sh.getLastColumn() < QUOTE_COLS.length || String(sh.getRange(1, 1).getValue()) !== QUOTE_HEADERS[0]) {
    if (sh.getMaxColumns() < QUOTE_COLS.length) sh.insertColumnsAfter(sh.getMaxColumns(), QUOTE_COLS.length - sh.getMaxColumns());
    sh.getRange(1, 1, 1, QUOTE_HEADERS.length).setValues([QUOTE_HEADERS]).setFontWeight('bold');
    sh.getRange(1, 1, sh.getMaxRows(), QUOTE_COLS.length).setNumberFormat('@');
  }
  return sh;
}

function quoteSnapSheet_() {
  const ss = indexSs_();
  let sh = ss.getSheetByName('견적기록');
  if (!sh) {
    sh = ss.insertSheet('견적기록');
    sh.getRange(1, 1, 1, QUOTE_SNAP_HEADERS.length).setValues([QUOTE_SNAP_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), QUOTE_SNAP_COLS.length).setNumberFormat('@');
  }
  return sh;
}

const quoteCell_ = (v, k) => noteCell_(v, k === 'valid' || k === 'ship' ? 'date' : k);

function quoteRows_() {
  const sh = quoteSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, QUOTE_COLS.length).getValues()
    .map(r => { const o = {}; QUOTE_COLS.forEach((k, i) => o[k] = quoteCell_(r[i], k)); return o; })
    .filter(o => o.id);
}

const wonText_ = n => String(Math.round(+n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '원';

/** 시트 한 줄 → 포털에 줄 견적 (JSON 칸을 풀고 이메일은 뺌) */
function quoteOut_(q) {
  const o = Object.assign({}, q);
  delete o.email;
  o.items = quoteParse_(q.items, []);
  o.payments = quoteParse_(q.payments, []);
  o.request = quoteParse_(q.request, {});
  o.spec = quoteParse_(q.spec, {});
  o.receipt = quoteParse_(q.receipt, {});
  o.removed = quoteParse_(q.removed, []);
  return o;
}

/** 견적 응답 한 벌: 견적 목록 + 고객 건 고르기용 고객 요약 + 기록 목록(내용 없이) + 입금 계좌 */
function quoteData_() {
  const quotes = quoteRows_().map(quoteOut_);
  const customers = crmRows_(crmSheet_()).map(c => ({ id: c.id, name: c.name, info: c.info, group: c.group, item: c.item, stage: c.stage, owner: c.owner }));
  const ssh = quoteSnapSheet_(), last = ssh.getLastRow();
  const snaps = last < 2 ? [] : ssh.getRange(2, 1, last - 1, QUOTE_SNAP_COLS.length).getValues()
    .map(r => { const o = {}; QUOTE_SNAP_COLS.forEach((k, i) => o[k] = noteCell_(r[i], k)); delete o.data; return o; })
    .filter(o => o.id);
  const bank = PropertiesService.getScriptProperties().getProperty('QUOTE_BANK') || '';
  // 고객별 적립금 잔액 (이름의 띄어쓰기를 빼고 묶음). 견적 화면에서 잔액을 보여주는 데 씀
  const pointBalance = {};
  pointRows_().forEach(p => { const k = String(p.name).replace(/\s+/g, ''); pointBalance[k] = (pointBalance[k] || 0) + (+p.amount || 0); });
  const portals = portalRows_().map(r => ({ key: r.key, ckey: r.ckey, qid: r.qid, name: r.name, publishedAt: r.publishedAt, by: r.by, active: r.active === 'Y', views: +r.views || 0, lastView: r.lastView }));
  const codes = codeRows_().filter(c => c.active === 'Y').map(c => ({ code: codeFmt_(c.code), ckey: c.ckey, name: c.name, issuedAt: c.issuedAt, by: c.by, logins: +c.logins || 0, lastLogin: c.lastLogin }));
  return { quotes, customers, snaps, bank, pointBalance, portals, codes };
}

/** 기록 하나의 내용 (그 시점의 견적 전체) */
function quoteSnap_(id) {
  const sh = quoteSnapSheet_(), last = sh.getLastRow();
  if (!id || last < 2) throw new Error('기록을 찾지 못했습니다');
  const rows = sh.getRange(2, 1, last - 1, QUOTE_SNAP_COLS.length).getValues();
  const r = rows.find(x => String(x[0]) === String(id));
  if (!r) throw new Error('기록을 찾지 못했습니다');
  const o = {}; QUOTE_SNAP_COLS.forEach((k, i) => o[k] = noteCell_(r[i], k));
  o.data = quoteParse_(o.data, {});
  return o;
}

/** 포털에서 온 견적 확인. 금액은 품목으로 다시 계산 */
function quoteInput_(b) {
  const name = String(b.name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!name) throw new Error('고객 이름을 적어 주세요');
  const int = v => { const n = Math.round(Number(String(v == null ? '' : v).replace(/[^\d.\-]/g, ''))); return isFinite(n) ? n : 0; };
  const txt = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
  const day = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '';
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 120).map(it => {
    const qty = Math.max(0, Math.min(9999, Math.round((Number(it.qty) || 0) * 100) / 100)) || 1;
    const list = Math.max(0, Math.min(1e10, int(it.list != null ? it.list : it.price)));
    const rate = Math.max(0, Math.min(100, Math.round((Number(it.rate) || 0) * 100) / 100));
    const price = it.price != null && it.price !== '' ? Math.max(-1e9, Math.min(1e10, int(it.price))) : Math.round(list * (1 - rate / 100));
    const cat = QUOTE_CATS.indexOf(it.cat) >= 0 ? it.cat : (QUOTE_CAT_OLD[it.cat] || '컴포넌트');
    // own: 고객 지참(금액에서 뺌), cost: 원가(부가세 별도 단가, 내부용), stock: 재고상태(내부용)
    const cost = it.cost === '' || it.cost == null ? '' : Math.max(0, Math.min(1e10, int(it.cost)));
    const stock = QUOTE_STOCK.indexOf(it.stock) >= 0 ? it.stock : '';
    return { cat, slot: txt(it.slot, 40), name: txt(it.name, 160), list, rate, price, qty, note: txt(it.note, 200), sn: txt(it.sn, 60), slip: day(it.slip), code: txt(it.code, 40), own: !!it.own, cost, stock };
  }).filter(it => it.name);
  const paidItems = items.filter(it => !it.own);
  const listSum = paidItems.reduce((m, it) => m + Math.round(it.list * it.qty), 0);
  const priceSum = paidItems.reduce((m, it) => m + Math.round(it.price * it.qty), 0);
  const final = b.final === '' || b.final == null ? '' : Math.max(0, int(b.final));
  const total = final === '' ? priceSum : final;
  // 결제 취소·환불은 적은 부호와 상관없이 음수 (지불 합계에서 빠짐). rc: 결제별 증빙 상태
  const payments = (Array.isArray(b.payments) ? b.payments : []).slice(0, 40)
    .map(p => {
      const label = txt(p.label, 60), a = int(p.amount);
      return { label, date: day(p.date), amount: /취소|환불/.test(label) ? -Math.abs(a) : a, method: txt(p.method, 30), rc: QUOTE_RC_STATES.indexOf(p.rc) >= 0 ? p.rc : '' };
    })
    .filter(p => p.label || p.amount);
  const paid = payments.reduce((m, p) => m + p.amount, 0);
  const rc0 = b.receipt || {};
  const receipt = { type: QUOTE_RC_TYPES.indexOf(rc0.type) >= 0 ? rc0.type : '', no: txt(rc0.no, 40), name: txt(rc0.name, 60), email: txt(rc0.email, 80) };
  const removed = (Array.isArray(b.removed) ? b.removed : []).slice(0, 60)
    .map(x => ({ name: txt(x.name, 160), sn: txt(x.sn, 60), to: QUOTE_REMOVED_TO.indexOf(x.to) >= 0 ? x.to : '', note: txt(x.note, 200) }))
    .filter(x => x.name);
  const kind = QUOTE_KINDS.indexOf(b.kind) >= 0 ? b.kind : '';
  const rq = b.request || {};
  const request = { label: txt(rq.label, 40), amount: rq.amount === '' || rq.amount == null ? '' : int(rq.amount) };
  const spec = {};
  Object.keys(b.spec || {}).slice(0, 80).forEach(k => { const v = txt(b.spec[k], 120); if (v && /^[a-z0-9_]{1,30}$/i.test(k)) spec[k] = v; });
  return {
    cid: txt(b.cid, 20),
    name,
    title: txt(b.title, 120),
    items: JSON.stringify(items),
    subtotal: String(listSum), discount: String(listSum - total), total: String(total), final: String(final),
    memo: String(b.memo || '').replace(/\r/g, '').trim().slice(0, 3000),
    note: String(b.note || '').replace(/\r/g, '').trim().slice(0, 3000),
    valid: day(b.valid),
    status: QUOTE_STATUS.indexOf(b.status) >= 0 ? b.status : QUOTE_STATUS[0],
    owner: checkOwner_(String(b.owner || '').slice(0, 40)),
    brand: txt(b.brand, 60), model: txt(b.model, 80), color: txt(b.color, 80),
    sn: txt(b.sn, 60), rubiSn: txt(b.rubiSn, 60), fn: txt(b.fn, 60),
    payments: JSON.stringify(payments), paid: String(paid),
    request: JSON.stringify(request), ship: day(b.ship), spec: JSON.stringify(spec),
    receipt: JSON.stringify(receipt), removed: JSON.stringify(removed),
    kind, parent: kind ? txt(b.parent, 20) : '',
  };
}

/** op: save(id 없으면 새로) / status(상태만) / delete / snap(지금 저장된 견적을 기록으로) / snapdel. save·snap 은 ID를 돌려줌 */
function saveQuote_(b, user) {
  const sh = quoteSheet_();
  const op = String(b.op || '');
  const who = user.name || user.email;
  const findRow = id => {
    const last = sh.getLastRow();
    if (!id || last < 2) return -1;
    const ids = sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0]));
    const i = ids.indexOf(String(id));
    return i < 0 ? -1 : i + 2;
  };
  const writeRow = (row, o) => sh.getRange(row, 1, 1, QUOTE_COLS.length).setNumberFormat('@').setValues([QUOTE_COLS.map(k => o[k] == null ? '' : String(o[k]))]);
  const readRow = row => { const cur = sh.getRange(row, 1, 1, QUOTE_COLS.length).getValues()[0]; const o = {}; QUOTE_COLS.forEach((k, i) => o[k] = quoteCell_(cur[i], k)); return o; };

  if (op === 'delete') {
    const row = findRow(b.id);
    if (row > 0) sh.deleteRow(row);
    // 그 견적 결제로 자동 기록한 적립금 사용 줄도 지움 (손으로 적은 적립 줄은 남김)
    const psh = pointSheet_(), prow = pointFind_(psh, x => x.qid === String(b.id) && x.type === '사용' && x.memo.indexOf(POINT_AUTO_USE) === 0);
    if (prow > 0) psh.deleteRow(prow);
    // 그 견적의 기록도 지움
    const ssh = quoteSnapSheet_(), last = ssh.getLastRow();
    if (last >= 2) {
      const vals = ssh.getRange(2, 2, last - 1, 1).getValues();
      for (let i = vals.length - 1; i >= 0; i--) if (String(vals[i][0]) === String(b.id)) ssh.deleteRow(i + 2);
    }
    return '';
  }
  if (op === 'status') {
    const row = findRow(b.id);
    if (row < 0) throw new Error('이미 지워진 견적입니다. 새로 고침해 주세요');
    if (QUOTE_STATUS.indexOf(b.status) < 0) throw new Error('알 수 없는 상태입니다');
    const o = readRow(row);
    Object.assign(o, { status: b.status, updatedAt: now_() });
    writeRow(row, o);
    return o.id;
  }
  if (op === 'snap') {
    const row = findRow(b.id);
    if (row < 0) throw new Error('저장한 견적만 기록으로 남길 수 있습니다');
    const q = quoteOut_(readRow(row));
    const ssh = quoteSnapSheet_();
    const label = String(b.label || '').replace(/\s+/g, ' ').trim().slice(0, 40) || Utilities.formatDate(new Date(), CONFIG.TZ, 'yyMMdd');
    const s = { id: 's' + Utilities.getUuid().slice(0, 7), qid: q.id, no: q.no, label, data: JSON.stringify(q), total: q.total, by: who, at: now_() };
    ssh.getRange(ssh.getLastRow() + 1, 1, 1, QUOTE_SNAP_COLS.length).setNumberFormat('@').setValues([QUOTE_SNAP_COLS.map(k => String(s[k] == null ? '' : s[k]))]);
    return s.id;
  }
  if (op === 'publish') return portalPublish_(b, user);
  if (op === 'code') return portalCode_(b.id, false, user);      // 고객코드 발급 (이미 있으면 그대로)
  if (op === 'recode') return portalCode_(b.id, true, user);     // 다시 발급: 예전 코드·고객 키를 끊음
  if (op === 'unpublish') { portalSet_(b.id, { active: 'N' }); return b.id; }
  if (op === 'snapdel') {
    const ssh = quoteSnapSheet_(), last = ssh.getLastRow();
    if (last >= 2) {
      const ids = ssh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0]));
      const i = ids.indexOf(String(b.id));
      if (i >= 0) ssh.deleteRow(i + 2);
    }
    return '';
  }
  if (op !== 'save') throw new Error('unknown op');

  const v = quoteInput_(b);
  let row = b.id ? findRow(b.id) : -1;
  if (b.id && row < 0) throw new Error('이미 지워진 견적입니다. 새로 고침해 주세요');
  let o, isNew = false, prev = {};
  if (row < 0) {
    isNew = true;
    o = Object.assign({ id: 'q' + Utilities.getUuid().slice(0, 7), no: nextQuoteNo_(sh) }, v,
      { author: who, email: user.email, createdAt: now_(), updatedAt: '' });
    row = sh.getLastRow() + 1;
  } else {
    o = readRow(row);
    prev = { cid: o.cid, payments: quoteParse_(o.payments, []) };
    Object.assign(o, v, { updatedAt: now_() });
  }
  writeRow(row, o);
  if (o.cid) quoteLinkCrm_(o, isNew || prev.cid !== o.cid, prev.payments || [], who);
  pointSyncQuote_(o, who, user.email);
  return o.id;
}

/** 견적 번호: Q + 오늘 날짜(yyMMdd) + 그날 순번. 예: Q261108-01 */
function nextQuoteNo_(sh) {
  const prefix = 'Q' + Utilities.formatDate(new Date(), CONFIG.TZ, 'yyMMdd') + '-';
  const last = sh.getLastRow();
  let n = 0;
  if (last >= 2) {
    sh.getRange(2, QUOTE_COLS.indexOf('no') + 1, last - 1, 1).getValues().forEach(r => {
      const s = String(r[0]);
      if (s.indexOf(prefix) === 0) n = Math.max(n, parseInt(s.slice(prefix.length), 10) || 0);
    });
  }
  return prefix + ('0' + (n + 1)).slice(-2);
}

/** 견적을 고객 건에 연결
 *  - 단계: 문의·상담이면 '견적'으로. 지불 현황에 계약금이 있으면 '계약금', 예약금이 있으면 '예약금'까지 (앞으로만)
 *  - 브랜드·모델이 비어 있으면 견적의 모델(또는 제목)으로
 *  - 계약금(원) 칸: 이 고객 건에 연결된 견적(취소 제외)의 지불 합계 (고객관리의 '진행중 계약금' 숫자)
 *    출고 후 업그레이드 견적처럼 한 고객 건에 결제한 견적이 둘 이상이어도 합계가 맞게
 *  - 단계는 앞으로만 가므로, 이미 출고·루비케어인 건에 업그레이드 견적을 붙여도 단계는 그대로
 *  - 기록: 처음 연결할 때, 단계가 바뀔 때, 결제가 새로 들어올 때 고객로그에 한 줄 */
function quoteLinkCrm_(q, first, prevPays, who) {
  const sh = crmSheet_();
  const last = sh.getLastRow();
  if (last < 2) return;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0]));
  const i = ids.indexOf(String(q.cid));
  if (i < 0) return;
  const row = i + 2;
  const cur = sh.getRange(row, 1, 1, CRM_COLS.length).getValues()[0];
  const c = {}; CRM_COLS.forEach((k, j) => c[k] = noteCell_(cur[j], k));
  const pays = quoteParse_(q.payments, []);
  const paidHere = pays.reduce((m, p) => m + (+p.amount || 0), 0);
  // 같은 고객 건에 연결된 견적들(취소 제외)의 지불 합계. 이 견적은 방금 시트에 쓴 값이 들어 있음
  const paid = quoteRows_().filter(x => x.cid === q.cid && x.status !== '취소').reduce((m, x) => m + (+x.paid || 0), 0) || paidHere;
  const key = p => [p.label, p.date, p.amount].join('|');
  const before = {}; (prevPays || []).forEach(p => before[key(p)] = 1);
  const added = first ? pays : pays.filter(p => !before[key(p)]);

  let target = '견적';
  if (pays.some(p => /예약금/.test(p.label))) target = '예약금';
  else if (pays.some(p => /계약금/.test(p.label)) || paidHere > 0) target = '계약금';
  const si = CRM_STAGES.indexOf(c.stage), ti = CRM_STAGES.indexOf(target);
  const moved = si >= 0 && c.stage !== '종료' && si < ti;
  const model = [q.brand, q.model].filter(Boolean).join(' ') || q.title;
  const amountChanged = paid > 0 && String(paid) !== String(c.amount);
  if (!moved && !first && c.item && !amountChanged && !added.length) return;
  if (moved) { c.stage = target; c.stageAt = now_(); }
  if (!c.item && model) c.item = model;
  if (paid > 0) c.amount = String(paid);
  c.updatedAt = now_();
  sh.getRange(row, 1, 1, CRM_COLS.length).setNumberFormat('@').setValues([CRM_COLS.map(k => c[k] == null ? '' : String(c[k]))]);
  if (moved || first || added.length) {
    const lsh = crmLogSheet_();
    const parts = [];
    const kind = q.kind ? q.kind + ' ' : '';
    if (first) parts.push(`${kind}견적서 ${q.no}${model ? ' ' + model : ''}, ${wonText_(q.total)}`);
    added.forEach(p => parts.push(`${p.label || '결제'} ${wonText_(p.amount)} 받음`));
    if (!parts.length) parts.push(`견적서 ${q.no}, ${wonText_(q.total)}`);
    const l = { id: Utilities.getUuid().slice(0, 8), cid: c.id, name: c.name, stage: c.stage, memo: parts.join(' · '), flag: c.flag, by: who, at: now_() };
    lsh.getRange(lsh.getLastRow() + 1, 1, 1, CRM_LOG_COLS.length).setNumberFormat('@').setValues([CRM_LOG_COLS.map(k => String(l[k] == null ? '' : l[k]))]);
  }
}

// ───────────────────────────── 구글 캘린더 (첫 화면 달력) ─────────────────────────────
// Apps Script 캘린더 서비스(CalendarApp)로 읽음. 스크립트를 실행하는 계정(배포 설정의 '나')이 볼 수 있는 캘린더만 읽힘
// 처음 한 번 편집기에서 test_calendar 를 실행해 캘린더 권한을 승인한 뒤 새 버전으로 배포해야 함

/** 달력 격자 범위: 그 달 1일이 든 주의 일요일부터 6주(42일) */
function calendarRange_(month) {
  const m = String(month || '').match(/^(\d{4})-(\d{2})$/);
  const now = new Date();
  const y = m ? Number(m[1]) : Number(Utilities.formatDate(now, CONFIG.TZ, 'yyyy'));
  const mo = m ? Number(m[2]) : Number(Utilities.formatDate(now, CONFIG.TZ, 'M'));
  const mm = String(mo).padStart(2, '0');
  // CONFIG.TZ 기준 그 달 1일 0시 (스크립트 프로젝트 시간대와 달라도 맞게)
  const first = new Date(`${y}-${mm}-01T00:00:00${tzOffset_(new Date(Date.UTC(y, mo - 1, 1, 12)))}`);
  const dow = Number(Utilities.formatDate(first, CONFIG.TZ, 'u')) % 7;   // u: 1=월 … 7=일 → 일=0
  const start = new Date(first.getTime() - dow * 86400000);
  const end = new Date(start.getTime() + 42 * 86400000);
  return { month: `${y}-${mm}`, start, end };
}
/** '+09:00' 같은 시간대 표기 */
function tzOffset_(d) { return Utilities.formatDate(d, CONFIG.TZ, 'XXX'); }

/** 읽을 캘린더 목록 [{ id, name, color, cal }] */
function calendars_() {
  const ids = (CONFIG.CALENDARS || []).length ? CONFIG.CALENDARS : ['primary'];
  const out = [];
  ids.forEach(id => {
    const cal = id === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(id);
    if (!cal) return;   // 공유되지 않았거나 ID가 틀린 캘린더는 건너뜀
    out.push({ id: cal.getId(), name: cal.getName(), color: cal.getColor() || '', cal });
  });
  return out;
}

/** 일정 하나를 포털이 쓰는 모양으로 */
function eventJson_(ev, ci) {
  const fmtDay = d => Utilities.formatDate(d, CONFIG.TZ, 'yyyy-MM-dd');
  const fmtMin = d => Utilities.formatDate(d, CONFIG.TZ, 'HH:mm');
  const allDay = ev.isAllDayEvent();
  const s = ev.getStartTime(), e = ev.getEndTime();
  // 종일 일정의 끝은 다음 날 0시(배타)라 하루를 빼서 마지막 날로 맞춤
  const endDay = allDay ? fmtDay(new Date(e.getTime() - 1)) : fmtDay(new Date(Math.max(s.getTime(), e.getTime() - 1)));
  const d = splitDesc_(ev.getDescription());
  return {
    id: ev.getId(), cal: ci, title: ev.getTitle() || '(제목 없음)',
    allDay, date: fmtDay(s), endDate: endDay,
    start: allDay ? '' : fmtMin(s), end: allDay ? '' : fmtMin(e),
    location: ev.getLocation() || '',
    desc: d.text.slice(0, 2000), by: d.tag.replace(/^\[My Rubi\]\s*/, ''),
    rec: ev.isRecurringEvent(),
  };
}
const sortEvents_ = events => events.sort((a, b) => (a.date + (a.allDay ? '' : a.start)).localeCompare(b.date + (b.allDay ? '' : b.start)));

/** 한 달치 일정. { month, start, end, calendars:[{id,name,color}], events:[…] }
 *  fresh: 일정을 바꾼 직후. 캐시를 읽지도 쓰지도 않음 (바뀌기 전 목록이 2분 동안 남지 않게) */
function listCalendar_(month, fresh) {
  const r = calendarRange_(month);
  const cache = CacheService.getScriptCache(), key = 'cal:' + r.month;
  const sec = fresh ? 0 : Number(CONFIG.CALENDAR_CACHE_SEC) || 0;
  if (sec) { const hit = cache.get(key); if (hit) return JSON.parse(hit); }

  const fmtDay = d => Utilities.formatDate(d, CONFIG.TZ, 'yyyy-MM-dd');
  const cals = calendars_();
  const events = [];
  cals.forEach((c, ci) => {
    let list = [];
    try { list = c.cal.getEvents(r.start, r.end); } catch (e) { return; }
    list.forEach(ev => events.push(eventJson_(ev, ci)));
  });
  sortEvents_(events);
  const out = {
    month: r.month, start: fmtDay(r.start), end: fmtDay(new Date(r.end.getTime() - 1)),
    calendars: cals.map(c => ({ id: c.id, name: c.name, color: c.color })),
    events,
  };
  if (sec) { try { cache.put(key, JSON.stringify(out), Math.min(sec, 21600)); } catch (e) {} }   // 100KB 넘으면 캐시만 건너뜀
  return out;
}

// ─── 달력에서 일정 넣기·고치기·지우기 (POST event) ───
// op: add | update | delete. 넣는 캘린더는 CONFIG.CALENDARS 의 첫 번째(여러 개면 포털에서 고른 것)
// 포털에서 넣거나 고친 일정은 메모 맨 끝에 '[My Rubi] 입력 이름' 줄이 붙음 (구글 캘린더에서는 실행 계정이 만든 것으로 보이므로)
const EVENT_TAG_RE = /\n*\[My Rubi\][^\n]*\s*$/;

/** 메모를 사용자가 쓴 부분과 [My Rubi] 줄로 나눔 */
function splitDesc_(desc) {
  const s = String(desc || '');
  const m = s.match(EVENT_TAG_RE);
  return m ? { text: s.slice(0, m.index).replace(/\s+$/, ''), tag: m[0].trim() } : { text: s.replace(/\s+$/, ''), tag: '' };
}

/** 포털에서 온 값 확인. 날짜·시간은 CONFIG.TZ 기준 */
function eventInput_(b) {
  const title = String(b.title || '').trim().slice(0, 200);
  if (!title) throw new Error('제목을 입력해 주세요');
  const date = String(b.date || ''), endDate = String(b.endDate || '') || date;
  const D = /^\d{4}-\d{2}-\d{2}$/, T = /^\d{2}:\d{2}$/;
  if (!D.test(date) || !D.test(endDate)) throw new Error('날짜를 확인해 주세요');
  if (endDate < date) throw new Error('끝나는 날이 시작하는 날보다 앞입니다');
  const at = (d, t) => new Date(`${d}T${t}:00${tzOffset_(new Date(d + 'T12:00:00Z'))}`);
  const allDay = !!b.allDay;
  let start, end;
  if (allDay) {
    // 종일 일정은 날짜만 쓰임. 정오로 잡아 두면 시간대가 조금 달라도 날짜가 밀리지 않음
    start = at(date, '12:00'); end = new Date(at(endDate, '12:00').getTime() + 86400000);   // 끝은 다음 날(배타)
  } else {
    const st = String(b.start || ''), et = String(b.end || '');
    if (!T.test(st)) throw new Error('시작 시간을 입력해 주세요');
    start = at(date, st);
    end = T.test(et) ? at(endDate, et) : new Date(start.getTime() + 3600000);
    if (end <= start) throw new Error('끝나는 시간이 시작 시간보다 앞입니다');
  }
  return {
    title, allDay, start, end, date, endDate,
    location: String(b.location || '').trim().slice(0, 300),
    desc: String(b.desc || '').replace(/\r/g, '').trim().slice(0, 4000),
  };
}

/** 일정 저장 후, 그 일정이 보이는 달(앞뒤 한 달 포함)의 캐시를 지움 */
function clearCalCache_(fromDay, toDay) {
  const keys = [];
  let [y, m] = fromDay.slice(0, 7).split('-').map(Number);
  m -= 1; if (m < 1) { m = 12; y--; }
  const [ty, tm0] = toDay.slice(0, 7).split('-').map(Number);
  let ey = ty, em = tm0 + 1; if (em > 12) { em = 1; ey++; }
  for (let i = 0; i < 26 && (y < ey || (y === ey && m <= em)); i++) {
    keys.push('cal:' + y + '-' + String(m).padStart(2, '0'));
    m++; if (m > 12) { m = 1; y++; }
  }
  if (keys.length) CacheService.getScriptCache().removeAll(keys);
}

function findEvent_(cals, id, ci) {
  if (!id) return null;
  const order = cals[Number(ci)] ? [cals[Number(ci)]].concat(cals.filter((c, i) => i !== Number(ci))) : cals;
  for (const c of order) {
    try { const ev = c.cal.getEventById(id); if (ev) return ev; } catch (e) {}
  }
  return null;
}

function saveEvent_(b, user) {
  const cals = calendars_();
  if (!cals.length) throw new Error('일정을 넣을 캘린더가 없습니다. Code.gs 의 CALENDARS 를 확인해 주세요');
  const name = user.name || user.email;
  const fmtDay = d => Utilities.formatDate(d, CONFIG.TZ, 'yyyy-MM-dd');
  const op = String(b.op || '');
  let ev = null;

  if (op === 'update' || op === 'delete') {
    ev = findEvent_(cals, b.id, b.cal);
    if (!ev) throw new Error('일정을 찾지 못했습니다. 이미 지워졌을 수 있습니다');
    if (ev.isRecurringEvent()) throw new Error('반복 일정은 구글 캘린더에서 고쳐 주세요');
    const s = ev.getStartTime(), e = ev.getEndTime();
    clearCalCache_(fmtDay(s), fmtDay(new Date(Math.max(s.getTime(), e.getTime() - 1))));
    if (op === 'delete') {
      const id = ev.getId();
      ev.deleteEvent();
      // 같은 실행 안에서 다시 읽으면 지운 일정이 아직 섞여 나올 수 있어 직접 빼고 돌려줌
      const out = listCalendar_(b.month, true);
      out.events = out.events.filter(x => x.id !== id);
      clearCalCache_(out.start, out.end);
      return Object.assign(out, { saved: '', deleted: id });
    }
  } else if (op !== 'add') {
    throw new Error('unknown op');
  }

  const v = eventInput_(b);
  let tag;
  if (op === 'add') {
    tag = '[My Rubi] 입력 ' + name;
    const c = cals[Number(b.cal) || 0] || cals[0];
    const desc = v.desc + (v.desc ? '\n\n' : '') + tag;
    const opt = { location: v.location, description: desc };
    ev = v.allDay
      ? (v.endDate === v.date ? c.cal.createAllDayEvent(v.title, v.start, opt) : c.cal.createAllDayEvent(v.title, v.start, v.end, opt))
      : c.cal.createEvent(v.title, v.start, v.end, opt);
  } else {
    const old = splitDesc_(ev.getDescription()).tag;
    const base = old ? old.replace(/\s*·\s*수정 .*$/, '') : '[My Rubi]';
    tag = base + (old ? ' · 수정 ' : ' 수정 ') + name;
    ev.setTitle(v.title);
    ev.setLocation(v.location);
    ev.setDescription(v.desc + (v.desc ? '\n\n' : '') + tag);
    if (v.allDay) {
      if (v.endDate === v.date) ev.setAllDayDate(v.start); else ev.setAllDayDates(v.start, v.end);
    } else {
      ev.setTime(v.start, v.end);
    }
  }
  clearCalCache_(v.date, v.endDate);
  // 방금 넣거나 고친 일정이 목록에 바로 반영되지 않았을 수 있어 직접 끼워 넣음
  const out = listCalendar_(b.month, true);
  const id = ev.getId(), ci = Math.max(0, cals.findIndex(c => c.id === ev.getOriginalCalendarId()));
  const item = eventJson_(ev, ci);
  out.events = out.events.filter(x => x.id !== id);
  if (item.endDate >= out.start && item.date <= out.end) out.events.push(item);
  sortEvents_(out.events);
  return Object.assign(out, { saved: id });
}

/** 편집기에서 직접 실행용: 캘린더 권한 승인 + 이번 달 일정 확인 */
function test_calendar() {
  const r = listCalendar_('');
  Logger.log(r.month + ' · 캘린더 ' + r.calendars.map(c => c.name).join(', ') + ' · 일정 ' + r.events.length + '건');
  r.events.slice(0, 10).forEach(e => Logger.log(e.date + ' ' + (e.allDay ? '종일' : e.start + '-' + e.end) + '  ' + e.title));
}

// ───────────────────────────── 매출 보고서 (매출·재고·품목·보고서업로드 탭) ─────────────────────────────
// 보고서 페이지가 이카운트 엑셀을 읽어 줄 단위로 보내면 여기서 탭에 씀. 집계는 페이지가 함
// 판매현황: 파일 기간(from~to) 안의 예전 줄을 지우고 넣음. 파일이 거래처로 걸러진 것이면(scope) 그 거래처 줄만 지움
// 재고현황: 기준일(date)별 스냅샷. 같은 기준일을 다시 올리면 그날 스냅샷을 바꿈
// 품목등록: 통째로 바꿈 (입고단가로 재고 금액, 계층그룹으로 분류를 계산)

function canReport_(user) {
  const list = (CONFIG.REPORT_VIEWERS || []).map(emailKey_);
  return !list.length || list.includes(emailKey_(user.email));
}
function needReport_(user) {
  if (!canReport_(user)) throw new Error('매출 보고서를 볼 수 있는 계정이 아닙니다. 관리자에게 요청해 주세요');
}

function reportSheet_(name, headers, ncol) {
  const ss = indexSs_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), ncol).setNumberFormat('@');
  }
  return sh;
}
const saleSheet_ = () => reportSheet_('매출', SALE_HEADERS, SALE_COLS.length);
const purSheet_ = () => reportSheet_('매입', PUR_HEADERS, SALE_COLS.length);   // 열 순서는 매출과 같음
const stockSheet_ = () => reportSheet_('재고', STOCK_HEADERS, STOCK_COLS.length);
const itemSheet_ = () => reportSheet_('품목', ITEM_HEADERS, ITEM_COLS.length);
const trafficSheet_ = () => reportSheet_('트래픽', TRAFFIC_HEADERS, TRAFFIC_COLS.length);
const uploadSheet_ = () => reportSheet_('보고서업로드', UPLOAD_HEADERS, UPLOAD_COLS.length);

/** 탭 전체를 배열로 (머리글 제외) */
function reportValues_(sh, n) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, n).getValues().map(r => r.map(v => v instanceof Date ? Utilities.formatDate(v, CONFIG.TZ, 'yyyy-MM-dd') : (v == null ? '' : String(v))));
}
/** 탭 내용을 통째로 바꿈 (머리글은 그대로) */
function reportRewrite_(sh, n, rows) {
  const last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, n).clearContent();
  reportAppend_(sh, n, rows, true);
}
function reportAppend_(sh, n, rows, fromTop) {
  if (!rows.length) return;
  const start = fromTop ? 2 : sh.getLastRow() + 1;
  const need = start + rows.length - 1;
  if (need > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
  const rng = sh.getRange(start, 1, rows.length, n);
  rng.setNumberFormat('@');
  rng.setValues(rows);
}
const rnum_ = v => { const n = Number(String(v == null ? '' : v).replace(/[,\s]/g, '')); return isFinite(n) ? n : 0; };
const rstr_ = (v, max) => String(v == null ? '' : v).trim().slice(0, max || 200);
const rdate_ = v => { const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? m[0] : ''; };

/** 보고서 응답: 줄은 배열의 배열로 (열 순서는 *_COLS) */
function reportData_(user) {
  needReport_(user);
  const ups = reportValues_(uploadSheet_(), UPLOAD_COLS.length).map(r => { const o = {}; UPLOAD_COLS.forEach((k, i) => o[k] = r[i]); return o; }).filter(o => o.id);
  return {
    cols: { sales: SALE_COLS, purchases: SALE_COLS, stock: STOCK_COLS, items: ITEM_COLS },
    sales: reportValues_(saleSheet_(), SALE_COLS.length).filter(r => r[0]),
    purchases: reportValues_(purSheet_(), SALE_COLS.length).filter(r => r[0]),
    stock: reportValues_(stockSheet_(), STOCK_COLS.length).filter(r => r[0]),
    items: reportValues_(itemSheet_(), ITEM_COLS.length).filter(r => r[0] || r[1]),
    uploads: ups.reverse(),
  };
}

/**
 * POST report
 *  op 'sales' / 'purchase' (구매현황, '매입' 탭. 줄 모양은 판매현황과 같고 거래처는 공급처) : { up, file, from, to, scope:[거래처…] 또는 [], rows:[[date,no,code,name,qty,price,supply,vat,total,partner,wh]], first, last }
 *               first 일 때 기간(과 scope) 안의 예전 줄을 지우고, 모든 조각을 같은 up(올린 기록 ID)으로 덧붙임. last 일 때 올린 기록을 남김
 *  op 'stock' : { up, file, date, rows:[[code,name,wh,qty]], first, last }  같은 기준일의 예전 스냅샷을 first 일 때 지움
 *  op 'items' : { up, file, rows:[[code,name,cost,out,retail,supply,cat,group]], first, last }  first 일 때 통째로 비움
 *  op 'del'   : { id }  그 올린 기록으로 들어간 줄과 기록을 지움
 */
function saveReport_(b, user) {
  needReport_(user);
  return reportWrite_(b, user);
}
function reportWrite_(b, user) {
  const who = user.name || user.email;
  const up = rstr_(b.up, 40) || ('u' + Date.now().toString(36));
  const rows = Array.isArray(b.rows) ? b.rows : [];
  if (b.op === 'sales' || b.op === 'purchase') {
    const from = rdate_(b.from), to = rdate_(b.to);
    if (!from || !to || from > to) throw new Error((b.op === 'sales' ? '판매현황' : '구매현황') + '의 기간을 알 수 없습니다');
    const scope = (Array.isArray(b.scope) ? b.scope : []).map(x => rstr_(x, 100)).filter(Boolean);
    const sh = b.op === 'sales' ? saleSheet_() : purSheet_(), n = SALE_COLS.length;
    const clean = rows.map(r => {
      const d = rdate_(r[0]); if (!d) return null;
      return [d, rstr_(r[1], 20), rstr_(r[2], 60), rstr_(r[3], 200), rnum_(r[4]), rnum_(r[5]), rnum_(r[6]), rnum_(r[7]), rnum_(r[8]), rstr_(r[9], 100), rstr_(r[10], 60), up].map(String);
    }).filter(Boolean);
    if (b.first) {
      const keep = reportValues_(sh, n).filter(r => !(r[0] >= from && r[0] <= to && (!scope.length || scope.includes(r[9]))));
      reportRewrite_(sh, n, keep.concat(clean));
    } else reportAppend_(sh, n, clean);
    if (b.last) reportLog_(Object.assign({}, b, { from, to, scope: scope.join(', ') }), up, b.op, who);
    return { saved: up, count: clean.length };
  }
  if (b.op === 'stock') {
    const date = rdate_(b.date); if (!date) throw new Error('재고 기준일을 알 수 없습니다');
    const sh = stockSheet_(), n = STOCK_COLS.length;
    const clean = rows.map(r => [date, rstr_(r[0], 60), rstr_(r[1], 200), rstr_(r[2], 60), rnum_(r[3]), up].map(String)).filter(r => r[1] || r[2]);
    if (b.first) reportRewrite_(sh, n, reportValues_(sh, n).filter(r => r[0] !== date).concat(clean));
    else reportAppend_(sh, n, clean);
    if (b.last) reportLog_(Object.assign({}, b, { from: date, to: date }), up, 'stock', who);
    return { saved: up, count: clean.length };
  }
  if (b.op === 'items') {
    const sh = itemSheet_(), n = ITEM_COLS.length;
    const clean = rows.map(r => [rstr_(r[0], 60), rstr_(r[1], 200), rnum_(r[2]), rnum_(r[3]), rnum_(r[4]), rnum_(r[5]), rstr_(r[6], 100), rstr_(r[7], 100), up].map(String)).filter(r => r[0] || r[1]);
    if (b.first) reportRewrite_(sh, n, clean); else reportAppend_(sh, n, clean);
    if (b.last) reportLog_(b, up, 'items', who);
    return { saved: up, count: clean.length };
  }
  if (b.op === 'del') {
    const id = rstr_(b.id, 40); if (!id) throw new Error('지울 기록이 없습니다');
    [[saleSheet_(), SALE_COLS], [purSheet_(), SALE_COLS], [stockSheet_(), STOCK_COLS], [trafficSheet_(), TRAFFIC_COLS], [itemSheet_(), ITEM_COLS]].forEach(([sh, cols]) => {
      const all = reportValues_(sh, cols.length), keep = all.filter(r => r[cols.length - 1] !== id);
      if (keep.length !== all.length) reportRewrite_(sh, cols.length, keep);
    });
    const ush = uploadSheet_(), all = reportValues_(ush, UPLOAD_COLS.length);
    reportRewrite_(ush, UPLOAD_COLS.length, all.filter(r => r[0] !== id));
    return { saved: id };
  }
  throw new Error('unknown op');
}

function reportLog_(b, up, kind, who) {
  const sh = uploadSheet_(), n = UPLOAD_COLS.length;
  const old = reportValues_(sh, n).filter(r => r[0] !== up);
  const row = [up, kind, rstr_(b.file, 120), rstr_(b.from, 10), rstr_(b.to, 10), rstr_(b.scope, 300), String(rnum_(b.total_rows)), String(rnum_(b.amount)), who, now_()];
  reportRewrite_(sh, n, old.concat([row]));
}

/** 편집기에서 직접 실행용: 보고서 탭 줄 수 확인 */
function test_report() {
  Logger.log('매출 ' + reportValues_(saleSheet_(), SALE_COLS.length).length + '줄 · 매입 ' + reportValues_(purSheet_(), SALE_COLS.length).length + '줄 · 재고 ' + reportValues_(stockSheet_(), STOCK_COLS.length).length + '줄 · 품목 ' + reportValues_(itemSheet_(), ITEM_COLS.length).length + '줄');
}

// ───────────────────────────── 루비개러지 앱 (GET/POST garage) ─────────────────────────────
// 담당자에게는 개러지 매출 금액과 전사 재고·판매 수량만 줌. 다른 채널 금액·거래처, 입고단가·딜러가는 응답에서 뺌
// REPORT_VIEWERS 는 같은 화면을 보되 품목등록·판매현황 전체를 올릴 수 있음 (full)

const nameKey_ = s => String(s || '').toLowerCase().replace(/\s+/g, '');
function canGarage_(user) {
  if (canReport_(user)) return true;
  const list = CONFIG.GARAGE_VIEWERS || [];
  return list.some(x => emailKey_(x) === emailKey_(user.email) || (nameKey_(x) && nameKey_(x) === nameKey_(user.name)));
}
function needGarage_(user) {
  if (!canGarage_(user)) throw new Error('루비개러지 앱을 볼 수 있는 계정이 아닙니다. 관리자에게 요청해 주세요');
}
const garageRe_ = () => new RegExp(CONFIG.GARAGE_PARTNER || '개러지');

function garageData_(user) {
  needGarage_(user);
  const full = canReport_(user), re = garageRe_();
  const iP = SALE_COLS.indexOf('partner');
  const sales = reportValues_(saleSheet_(), SALE_COLS.length).filter(r => r[0]).map(r => {
    if (re.test(r[iP])) return r;
    // 다른 채널: 날짜·품목·수량만 (금액·거래처 빈칸)
    return SALE_COLS.map((k, i) => ['date', 'code', 'name', 'qty'].includes(k) ? r[i] : '');
  });
  const items = reportValues_(itemSheet_(), ITEM_COLS.length).filter(r => r[0] || r[1])
    .map(r => ITEM_COLS.map((k, i) => ['cost', 'out', 'supply'].includes(k) ? '' : r[i]));
  const ups = reportValues_(uploadSheet_(), UPLOAD_COLS.length).map(r => { const o = {}; UPLOAD_COLS.forEach((k, i) => o[k] = r[i]); return o; })
    .filter(o => o.id && (o.kind === 'traffic' || o.kind === 'stock' || (o.kind === 'sales' && o.scope && re.test(o.scope))))
    .map(o => (o.kind === 'stock' || o.kind === 'traffic') ? o : Object.assign(o, { amount: '' }));
  return {
    full,
    cols: { sales: SALE_COLS, stock: STOCK_COLS, items: ITEM_COLS, traffic: TRAFFIC_COLS },
    sales,
    stock: reportValues_(stockSheet_(), STOCK_COLS.length).filter(r => r[0]),
    items,
    traffic: reportValues_(trafficSheet_(), TRAFFIC_COLS.length).filter(r => r[2]),
    uploads: ups.reverse(),
  };
}

/**
 * POST garage
 *  op 'traffic' : { up, file, from, to, dim, rows:[[date,key,visits,views,orders,amount]], first, last }
 *                 dim 'path' = 스마트스토어센터 방문 분석(경로별, 30일 묶음). key 는 '1단계 › 2단계 › 3단계', 총계 줄은 key '(전체)'
 *                 같은 구분(dim)의 기간이 겹치는 예전 줄을 first 일 때 지움 (일별은 그 날짜들만)
 *  op 'stock'   : 재고현황 (보고서와 같음)
 *  op 'sales'   : 판매현황. 담당자는 개러지 거래처 줄만 올릴 수 있고, 그 거래처 줄만 바뀜
 *  op 'del'     : 담당자는 트래픽 기록만 지울 수 있음
 *  REPORT_VIEWERS 는 보고서와 같은 모든 동작 + traffic
 */
function saveGarage_(b, user) {
  needGarage_(user);
  const full = canReport_(user), re = garageRe_();
  if (b.op === 'traffic') return saveTraffic_(b, user);
  if (full) return reportWrite_(b, user);
  if (b.op === 'stock') return reportWrite_(b, user);
  if (b.op === 'sales') {
    const rows = Array.isArray(b.rows) ? b.rows : [];
    if (rows.some(r => !re.test(String(r[9] || '')))) throw new Error('개러지 거래처가 아닌 줄이 있습니다. 판매현황을 루비개러지 거래처로 걸러서 받아 주세요');
    const scope = [...new Set(rows.map(r => String(r[9] || '').trim()).filter(Boolean))];
    if (b.first && !scope.length) throw new Error('개러지 거래처 줄이 없습니다');
    return reportWrite_(Object.assign({}, b, { scope: b.first ? scope : (b.scope || scope) }), user);
  }
  if (b.op === 'del') {
    const u = reportValues_(uploadSheet_(), UPLOAD_COLS.length).find(r => r[0] === rstr_(b.id, 40));
    if (!u || u[1] !== 'traffic') throw new Error('담당자는 트래픽 기록만 지울 수 있습니다');
    return reportWrite_(b, user);
  }
  throw new Error('이 계정으로는 할 수 없는 동작입니다');
}

function saveTraffic_(b, user) {
  const who = user.name || user.email;
  const up = rstr_(b.up, 40) || ('u' + Date.now().toString(36));
  const from = rdate_(b.from), to = rdate_(b.to);
  if (!from || !to || from > to) throw new Error('트래픽 자료의 기간을 알 수 없습니다');
  const dim = ['path', 'daily', 'channel', 'product', 'keyword', 'other'].includes(b.dim) ? b.dim : 'other';
  const sh = trafficSheet_(), n = TRAFFIC_COLS.length;
  const rows = (Array.isArray(b.rows) ? b.rows : []).map(r => [from, to, dim, rstr_(r[1], 200), rdate_(r[0]), rnum_(r[2]), rnum_(r[3]), rnum_(r[4]), rnum_(r[5]), up].map(String))
    .filter(r => r[3] || r[4]);
  if (b.first) {
    const keep = reportValues_(sh, n).filter(r => {
      if (r[2] !== dim) return true;
      if (dim === 'daily') return !(r[4] >= from && r[4] <= to);
      return !(r[0] <= to && r[1] >= from);   // 기간이 겹치는 같은 구분은 바꿈
    });
    reportRewrite_(sh, n, keep.concat(rows));
  } else reportAppend_(sh, n, rows);
  if (b.last) reportLog_(Object.assign({}, b, { from, to, scope: dim }), up, 'traffic', who);
  return { saved: up, count: rows.length };
}
