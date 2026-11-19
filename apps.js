// My Rubi 앱 목록
// 여기에 한 줄 추가하면 시작 메뉴에 생기고, 폴더에 속하지 않은 앱은 바탕화면에도 놓입니다.
//
// kind
//   link    : 새 탭으로 열림 (외부 사이트는 대부분 창 안에 넣을 수 없음)
//   frame   : 바탕화면 안의 창으로 열림 (my.rubiworkshop.com 안의 페이지용, 예: url:'/customers/')
//   folder  : 창 안에 아이콘 모음. 앱에 folder:'폴더 id' 를 적으면 그 폴더 안에 들어감
//   builtin : 포털 내장 (체크리스트, 프로젝트, 고객관리, 견적, 재고 확인, NAS, 바탕화면 설정)
//   soon    : 준비 중 (아이콘만 보이고, 열면 안내 창)
//
// icon : server chat bike shield sheet folder box bubble mail calendar drive note gear store globe camera wrench check
// tint : ruby slate green blue amber teal paper
// mono : 아이콘 대신 글자 한두 개 (브랜드 사이트용)
// group: 폴더 안에서 같은 이름끼리 묶어 소제목과 함께 보여줌
// only : 이 계정에게만 보임 (이메일 아이디 또는 구글 계정 이름, 예: ['ohyun', 'oryun', '전요셉']). 화면에서 숨기는 것이고 데이터는 Apps Script 가 따로 막음

window.MYRUBI_APPS = [
  // ESSENTIAL
  { id: 'checklist', title: '체크리스트',    icon: 'check',  tint: 'ruby',  kind: 'builtin', note: '멤버별 할 일' },
  { id: 'project',   title: '프로젝트',     icon: 'note',   tint: 'amber', kind: 'builtin', note: '프로젝트 세부 항목, 멤버 체크리스트와 연동' },
  { id: 'stock',     title: '재고확인',     icon: 'box',    tint: 'blue',  kind: 'builtin', note: '이카운트 창고별 재고' },
  { id: 'nas',       title: 'NAS',         icon: 'server', tint: 'slate', kind: 'builtin' },
  { id: 'manual',    title: '메뉴얼',      icon: 'note',   tint: 'slate', kind: 'frame', url: '/manual/', note: '포털 앱 사용법. 고객관리 · 견적 · 지오메트리 · 스튜디오 · 아코디언 V6' },

  // APP (준비 중)
  { id: 'customers',    title: '고객관리',     icon: 'bike',  tint: 'ruby',  kind: 'builtin', note: '고객 CRM, 고객문의·구매진행중·구매완료 현황과 주간 보고' },
  { id: 'quote',        title: '견적',        icon: 'note',  tint: 'paper', kind: 'builtin', note: '자전거 견적 세팅, 이카운트 품목·판매단가, A4 견적서 인쇄·PDF' },
  { id: 'geometry',     title: '지오메트리',    icon: 'bike',  tint: 'blue',  kind: 'frame', url: '/geometry/', note: 'BikeCAD 방식 프레임 지오메트리, 비교, 핏 맞추기' },
  // 스튜디오: 예전 이름 톤 매칭. 바탕화면 배치·고정이 그대로 남도록 id 는 'tone' 그대로 둠 (/tone/ 은 /studio/ 로 넘김)
  { id: 'tone',         title: '스튜디오',    icon: 'camera', tint: 'paper', kind: 'frame', url: '/studio/', note: '사진 작업. 톤 매칭(루비 톤으로 보정·저장), 룩북 썸네일(블랙 레이어와 가운데 문구), 사진은 브라우저 안에서만 처리' },
  { id: 'upload',       title: '상품업로드',  icon: 'box',  tint: 'green', kind: 'frame', url: '/upload/', note: '이카운트 품목과 루비서플라이·루비워크샵 상품(SKU) 비교, 미업로드 상품 검토 요청(체크리스트), 공식 사이트 + Claude 초안, 아임웹 일괄 추가 엑셀과 대표 이미지 zip' },
  { id: 'accordion',    title: '아코디언 V6',  icon: 'note', tint: 'teal',  kind: 'frame', url: '/accordion/', note: '루비 상세페이지 아코디언 v6 코드 만들기(v5 구조 그대로, 공통 섹션에 워런티·제품 상담 링크), 미리보기와 코드 복사, 기존 v5 코드 불러오기, 브랜드 이야기 저장' },

  // REPORT (권오현·권오륜만. Code.gs 의 REPORT_VIEWERS 와 맞출 것)
  // 루비개러지는 REPORT 구역에 있지만 보이는 사람은 아래 only 목록(전요셉 포함)을 따름
  { id: 'garage',       title: '루비개러지',   icon: 'store', tint: 'amber', kind: 'frame', url: '/garage/', only: ['ohyun', 'oryun', '전요셉'], note: '개러지 매출, 스마트스토어 트래픽, 회사 재고 중 회전이 느린 품목(품목별·장르별). Code.gs 의 GARAGE_VIEWERS 와 맞출 것' },
  { id: 'sales-report',    title: '매출보고서', icon: 'sheet', tint: 'green', kind: 'frame', url: '/report/', only: ['ohyun', 'oryun'], note: '이카운트 판매현황·재고현황으로 재고 수준, 브랜드·플랫폼별 매출, 모델별 회전율, 프로모션 필요 항목' },
  { id: 'purchase-report', title: '매입보고서', icon: 'box',   tint: 'teal',  kind: 'frame', url: '/report/purchase/', only: ['ohyun', 'oryun'], note: '이카운트 구매현황으로 월 평균 매입, 최근 매입 브랜드, 브랜드·공급처별 매입, 모델별 매입 후 소진율과 회전율' },

  // BOOKMARK (바로가기)
  { id: 'ecount',    title: 'Ecount',       icon: 'box',    tint: 'blue',  kind: 'link', url: 'https://login.ecount.com/', note: '이카운트 ERP' },
  { id: 'channel',   title: 'Channel Talk', icon: 'bubble', tint: 'paper', kind: 'link', url: 'https://desk.channel.io/', note: '채널톡' },

  // 폴더
  { id: 'google',    title: 'Google',     kind: 'folder' },
  { id: 'shops',     title: 'Platform',      kind: 'folder' },
  { id: 'brands',    title: 'Brand',         kind: 'folder' },
  { id: 'management', title: 'Management',  kind: 'folder' },
  { id: 'logistics',  title: 'Logistics',   kind: 'folder' },
  { id: 'strategy',   title: '전략상황판',    kind: 'folder', only: ['ohyun', 'oryun'], note: '수입 브랜드별 전략 상황판' },

  // 내장
  { id: 'settings',  title: '바탕화면 설정', icon: 'gear', tint: 'slate', kind: 'builtin' },

  // GOOGLE
  { id: 'gmail',     folder: 'google', title: 'Gmail',   icon: 'mail',     tint: 'ruby',  kind: 'link', url: 'https://mail.google.com/' },
  { id: 'calendar',  folder: 'google', title: '캘린더',  icon: 'calendar', tint: 'blue',  kind: 'link', url: 'https://calendar.google.com/' },
  { id: 'drive',     folder: 'google', title: '드라이브', icon: 'drive',   tint: 'green', kind: 'link', url: 'https://drive.google.com/' },

  // PLATFORM (판매 채널 관리자 화면)
  { id: 'p-ws',        folder: 'shops', title: '루비워크샵',            icon: 'store', tint: 'ruby',  kind: 'link', url: 'https://rubiworkshop.com/admin' },
  { id: 'p-sp',        folder: 'shops', title: '루비서플라이',          icon: 'store', tint: 'slate', kind: 'link', url: 'https://rubisupply.com/admin' },
  { id: 'p-ss-ws',     folder: 'shops', title: '루비워크샵 스마트스토어', icon: 'store', tint: 'green', kind: 'link', url: 'https://smartstore.naver.com/rubiworkshop' },
  { id: 'p-ss-garage', folder: 'shops', title: '루비개러지 스마트스토어', icon: 'store', tint: 'amber', kind: 'link', url: 'https://smartstore.naver.com/rubigarage' },
  { id: 'p-ss-seller', folder: 'shops', title: '스마트스토어 판매자센터', icon: 'store', tint: 'green', kind: 'link', url: 'https://sell.smartstore.naver.com/' },

  // MANAGEMENT (공유 드라이브의 '매니지먼트 2026' 시트)
  { id: 'm-erp',         folder: 'management', title: 'ERP 2026',                icon: 'sheet', tint: 'blue',   kind: 'link', url: 'https://docs.google.com/spreadsheets/d/1NQ3zmJQzW91JGtnPrIwTJn6EdLZzDPBmUeYqXvzZNBw/edit' },
  { id: 'm-logistics',   folder: 'management', title: '로지스틱스 2026',              icon: 'sheet', tint: 'amber',  kind: 'link', url: 'https://docs.google.com/spreadsheets/d/1c_J3h-qjJBJZM3sKb4mAPMouVQJ60aGgnIaiOQNH9tQ/edit' },
  { id: 'm-import',      folder: 'management', title: '수입 2026',                 icon: 'sheet', tint: 'green',  kind: 'link', url: 'https://docs.google.com/spreadsheets/d/10k5Tfv2uCpOPzf7YnQrddEsbWQb9zm9psDedX-X-dxU/edit' },
  { id: 'm-export',      folder: 'management', title: '수출 2026',                 icon: 'sheet', tint: 'teal',   kind: 'link', url: 'https://docs.google.com/spreadsheets/d/19ortty3Wtoqvi_Jm_UhKIibVyBwpzX6wMWqOu_0sQW4/edit' },
  { id: 'm-supply',      folder: 'management', title: '루비서플라이 2026',             icon: 'sheet', tint: 'slate',  kind: 'link', url: 'https://docs.google.com/spreadsheets/d/1o7IZPhKGQEj1NVSsgmZxQXlDk_Uxj78zqjhqrxEbkCo/edit' },

  // LOGISTICS
  { id: 'l-package',     folder: 'logistics', title: '패키지 데이터베이스',          icon: 'box',   tint: 'amber',  kind: 'link', url: 'https://docs.google.com/spreadsheets/d/1u-jDQnshR2zXRjpcBt77eXSWQ885G-JjJkdfyWK_xLo/edit?gid=1261343604#gid=1261343604' },

  // BRAND STRATEGY (전략상황판 폴더, Report 구역. 보는 사람은 매출·매입보고서와 같음)
  // 2026-11-19: 전략 페이지가 있는 브랜드만 둠 (준비 중 항목은 모두 뺌). 새 브랜드 전략 페이지를 만들면 같은 모양으로 한 줄 추가
  { id: 's-quoc', folder: 'strategy', title: 'QUOC', icon: 'note', tint: 'paper', kind: 'frame', url: '/strategy/quoc/', only: ['ohyun', 'oryun'], note: 'QUOC 2027 플랜: 아젠다, 소비자가, 프리오더, 분기별 일정' },

  // BRAND (group 이 같은 앱끼리 폴더 안에서 한 구역으로 묶임)
  // 루비가 운영하는 한국 사이트. 순서는 브랜드전략과 같은 2026 매출순 (자전거·부품 각각). 사이트를 새로 만들면 여기에 한 줄 추가
  { id: 'b-moulton', folder: 'brands', group: '루비 운영 · 자전거', title: '몰튼', mono: 'Mo', tint: 'slate', kind: 'link', url: 'https://moultonbicycles.co.kr/' },
  { id: 'b-sst', folder: 'brands', group: '루비 운영 · 자전거', title: '몰튼 SST WIDE', mono: 'SST', tint: 'slate', kind: 'link', url: 'https://sst.rubiworkshop.com/' },
  { id: 'b-crust', folder: 'brands', group: '루비 운영 · 자전거', title: '크러스트', mono: 'C', tint: 'amber', kind: 'link', url: 'https://crustbikes.co.kr/' },
  { id: 'b-bastion', folder: 'brands', group: '루비 운영 · 자전거', title: '바스티온', mono: 'B', tint: 'paper', kind: 'link', url: 'https://bastioncycles.co.kr/' },
  { id: 'b-parlee', folder: 'brands', group: '루비 운영 · 자전거', title: '팔리', mono: 'P', tint: 'blue', kind: 'link', url: 'https://parleecycles.co.kr/' },
  { id: 'b-surly', folder: 'brands', group: '루비 운영 · 자전거', title: '설리', mono: 'S', tint: 'green', kind: 'link', url: 'https://surly.rubiworkshop.com/' },
  { id: 'b-tsubasa', folder: 'brands', group: '루비 운영 · 자전거', title: '츠바사', mono: 'T', tint: 'ruby', kind: 'link', url: 'https://tsubasabicycles.co.kr/' },

  { id: 'b-quoc', folder: 'brands', group: '루비 운영 · 부품·액세서리', title: 'QUOC', mono: 'Q', tint: 'paper', kind: 'link', url: 'https://quoc.rubiworkshop.com/' },
  { id: 'b-thm-kr', folder: 'brands', group: '루비 운영 · 부품·액세서리', title: 'THM', mono: 'THM', tint: 'slate', kind: 'link', url: 'https://thm.rubiworkshop.com/' },
  { id: 'b-mks-kr', folder: 'brands', group: '루비 운영 · 부품·액세서리', title: 'MKS', mono: 'MKS', tint: 'slate', kind: 'link', url: 'https://mks.rubiworkshop.com/' },
  { id: 'b-carbonti-kr', folder: 'brands', group: '루비 운영 · 부품·액세서리', title: '카본티', mono: 'Ct', tint: 'blue', kind: 'link', url: 'https://carbonti.rubiworkshop.com/' },
  { id: 'b-gokiso', folder: 'brands', group: '루비 운영 · 부품·액세서리', title: '고키소', mono: 'G', tint: 'teal', kind: 'link', url: 'https://gokiso.rubiworkshop.com/' },
  { id: 'b-paul-kr', folder: 'brands', group: '루비 운영 · 부품·액세서리', title: '폴 컴포넌트', mono: 'Pc', tint: 'slate', kind: 'link', url: 'https://paul.rubiworkshop.com/' },
  { id: 'b-whiteind-kr', folder: 'brands', group: '루비 운영 · 부품·액세서리', title: '화이트 인더스트리', mono: 'WI', tint: 'paper', kind: 'link', url: 'https://whiteind.rubiworkshop.com/' },
  { id: 'b-spurcycle-kr', folder: 'brands', group: '루비 운영 · 부품·액세서리', title: '스퍼사이클', mono: 'Sp', tint: 'teal', kind: 'link', url: 'https://spurcycle.rubiworkshop.com/' },
  { id: 'b-chrisking-kr', folder: 'brands', group: '루비 운영 · 부품·액세서리', title: '크리스킹', mono: 'CK', tint: 'ruby', kind: 'link', url: 'https://chrisking.rubiworkshop.com/' },
  { id: 'b-velocity-kr', folder: 'brands', group: '루비 운영 · 부품·액세서리', title: '벨로시티', mono: 'Ve', tint: 'teal', kind: 'link', url: 'https://velocity.rubiworkshop.com/' },
  { id: 'b-wolftooth-kr', folder: 'brands', group: '루비 운영 · 부품·액세서리', title: '울프투스', mono: 'WT', tint: 'amber', kind: 'link', url: 'https://wolftooth.rubiworkshop.com/' },
  { id: 'b-cranebell-kr', folder: 'brands', group: '루비 운영 · 부품·액세서리', title: '크레인벨', mono: 'Cr', tint: 'amber', kind: 'link', url: 'https://cranebell.rubiworkshop.com/' },
  { id: 'b-growtac-kr', folder: 'brands', group: '루비 운영 · 부품·액세서리', title: '그로우택', mono: 'Gr', tint: 'green', kind: 'link', url: 'https://growtac.rubiworkshop.com/' },
  { id: 'b-kingcage-kr', folder: 'brands', group: '루비 운영 · 부품·액세서리', title: '킹케이지', mono: 'KC', tint: 'paper', kind: 'link', url: 'https://kingcage.rubiworkshop.com/' },
  { id: 'b-nissen-kr', folder: 'brands', group: '루비 운영 · 부품·액세서리', title: '니센', mono: 'Ni', tint: 'slate', kind: 'link', url: 'https://nissen.rubiworkshop.com/' },
  { id: 'b-schmolke-kr', folder: 'brands', group: '루비 운영 · 부품·액세서리', title: '쉬몰케', mono: 'Sm', tint: 'paper', kind: 'link', url: 'https://schmolke.rubiworkshop.com/' },
  { id: 'b-ultradynamico-kr', folder: 'brands', group: '루비 운영 · 부품·액세서리', title: '울트라다이나미코', mono: 'Ud', tint: 'green', kind: 'link', url: 'https://ultradynamico.rubiworkshop.com/' },
  { id: 'b-extralite-kr', folder: 'brands', group: '루비 운영 · 부품·액세서리', title: '익스트라라이트', mono: 'Ex', tint: 'blue', kind: 'link', url: 'https://extralite.rubiworkshop.com/' },

  // 브랜드 본사(해외) 사이트
  { id: 'b-moulton-g', folder: 'brands', group: '자전거 · 해외 본사', title: '몰튼 Global',           mono: 'Mo',   tint: 'slate',  kind: 'link', url: 'https://moultonbicycles.co.uk/' },
  { id: 'b-bastion-g', folder: 'brands', group: '자전거 · 해외 본사', title: '바스티온 Global',         mono: 'B',    tint: 'paper',  kind: 'link', url: 'https://bastioncycles.com/' },
  { id: 'b-tsubasa-g', folder: 'brands', group: '자전거 · 해외 본사', title: '츠바사 Global',          mono: 'T',    tint: 'ruby',   kind: 'link', url: 'https://cargocollective.com/tsubasabicycles' },
  { id: 'b-crust-g',   folder: 'brands', group: '자전거 · 해외 본사', title: '크러스트 Global',         mono: 'C',    tint: 'amber',  kind: 'link', url: 'https://crustbikes.com/' },
  { id: 'b-parlee-g',  folder: 'brands', group: '자전거 · 해외 본사', title: '팔리 Global',           mono: 'P',    tint: 'blue',   kind: 'link', url: 'https://parleecycles.com/' },
  { id: 'b-surly-g',   folder: 'brands', group: '자전거 · 해외 본사', title: '설리 Global',           mono: 'S',    tint: 'green',  kind: 'link', url: 'https://surlybikes.com/' },
  { id: 'b-pashley',   folder: 'brands', group: '자전거 · 해외 본사', title: '파슐리',                 mono: 'Pa',   tint: 'green',  kind: 'link', url: 'https://www.pashley.co.uk/' },
  { id: 'b-velo',      folder: 'brands', group: '자전거 · 해외 본사', title: '벨로오렌지',               mono: 'VO',   tint: 'amber',  kind: 'link', url: 'https://velo-orange.com/' },

  { id: 'b-yohemite',  folder: 'brands', group: '부품·액세서리 · 해외 본사', title: '요헤미티',                mono: 'Yo',   tint: 'ruby',   kind: 'link', url: 'https://www.yohemite.com/' },
  { id: 'b-paul',      folder: 'brands', group: '부품·액세서리 · 해외 본사', title: '폴 컴포넌트 Global',              mono: 'Pc',   tint: 'slate',  kind: 'link', url: 'https://paulcomp.com/' },
  { id: 'b-wolftooth', folder: 'brands', group: '부품·액세서리 · 해외 본사', title: '울프투스 Global',                mono: 'WT',   tint: 'amber',  kind: 'link', url: 'https://www.wolftoothcomponents.com/' },
  { id: 'b-white',     folder: 'brands', group: '부품·액세서리 · 해외 본사', title: '화이트 인더스트리 Global',           mono: 'WI',   tint: 'paper',  kind: 'link', url: 'https://www.whiteind.com/' },
  { id: 'b-mks',       folder: 'brands', group: '부품·액세서리 · 해외 본사', title: 'MKS Global',                 mono: 'MKS',  tint: 'slate',  kind: 'link', url: 'https://mkspedal.com/' },
  { id: 'b-carbonti',  folder: 'brands', group: '부품·액세서리 · 해외 본사', title: '카본티 Global',                 mono: 'Ct',   tint: 'blue',   kind: 'link', url: 'https://www.carbon-ti.com/' },
  { id: 'b-chrisking', folder: 'brands', group: '부품·액세서리 · 해외 본사', title: '크리스킹 Global',                mono: 'CK',   tint: 'ruby',   kind: 'link', url: 'https://chrisking.com/' },
  { id: 'b-spurcycle', folder: 'brands', group: '부품·액세서리 · 해외 본사', title: '스퍼사이클 Global',               mono: 'Sp',   tint: 'teal',   kind: 'link', url: 'https://www.spurcycle.com/' },
  { id: 'b-growtac',   folder: 'brands', group: '부품·액세서리 · 해외 본사', title: '그로우택 Global',                mono: 'Gr',   tint: 'green',  kind: 'link', url: 'https://growtac.com/' },
  { id: 'b-thm',       folder: 'brands', group: '부품·액세서리 · 해외 본사', title: 'THM Global',                 mono: 'THM',  tint: 'slate',  kind: 'link', url: 'https://www.thm.bike/' },
  { id: 'b-schmolke',  folder: 'brands', group: '부품·액세서리 · 해외 본사', title: '쉬몰케 Global',                 mono: 'Sm',   tint: 'paper',  kind: 'link', url: 'https://www.schmolke-carbon.com/' },
  { id: 'b-extralite', folder: 'brands', group: '부품·액세서리 · 해외 본사', title: '익스트라라이트 Global',             mono: 'Ex',   tint: 'blue',   kind: 'link', url: 'https://www.extralite.com/' },
  { id: 'b-adm',       folder: 'brands', group: '부품·액세서리 · 해외 본사', title: '아르떼 디마노',             mono: 'AdM',  tint: 'amber',  kind: 'link', url: 'https://artedimano.com/' },
  { id: 'b-berthoud',  folder: 'brands', group: '부품·액세서리 · 해외 본사', title: '베르투 사이클',             mono: 'Be',   tint: 'ruby',   kind: 'link', url: 'https://www.gillesberthoud.fr/' },
  { id: 'b-velocity',  folder: 'brands', group: '부품·액세서리 · 해외 본사', title: '벨로시티 Global',                mono: 'Ve',   tint: 'teal',   kind: 'link', url: 'https://velocityusa.com/' },
  { id: 'b-nissen',    folder: 'brands', group: '부품·액세서리 · 해외 본사', title: '니센 Global',                  mono: 'Ni',   tint: 'slate',  kind: 'link', url: 'https://www.nissen-cable.jp/' },
  { id: 'b-crane',     folder: 'brands', group: '부품·액세서리 · 해외 본사', title: '크레인벨 Global',                mono: 'Cr',   tint: 'amber',  kind: 'link', url: 'https://www.cranebellco.com/' },
  { id: 'b-ultra',     folder: 'brands', group: '부품·액세서리 · 해외 본사', title: '울트라다이나미코 Global',            mono: 'Ud',   tint: 'green',  kind: 'link', url: 'https://www.ultradynamico.com/' },
  { id: 'b-kingcage',  folder: 'brands', group: '부품·액세서리 · 해외 본사', title: '킹케이지 Global',                mono: 'KC',   tint: 'paper',  kind: 'link', url: 'https://kingcage.com/' },
  { id: 'b-hulsroy',   folder: 'brands', group: '부품·액세서리 · 해외 본사', title: '훌스로이',                mono: 'Hu',   tint: 'slate',  kind: 'link', url: 'https://hulsroy.com/' },
  { id: 'b-nokon',     folder: 'brands', group: '부품·액세서리 · 해외 본사', title: '노콘 케이블',              mono: 'No',   tint: 'blue',   kind: 'link', url: 'https://www.nokon.com/' },
  { id: 'b-honjo',     folder: 'brands', group: '부품·액세서리 · 해외 본사', title: '혼조',                  mono: 'Ho',   tint: 'teal',   kind: 'link', url: 'https://en.honjo-mudguards.jp/' },
  { id: 'b-dward',     folder: 'brands', group: '부품·액세서리 · 해외 본사', title: '디워드 디자인',             mono: 'Dw',   tint: 'paper',  kind: 'link', url: 'https://dward-design.co.uk/' },
  { id: 'b-stone',     folder: 'brands', group: '부품·액세서리 · 해외 본사', title: '스톤 체인링',              mono: 'St',   tint: 'slate',  kind: 'link', url: 'https://stonechainrings.com/' },
  { id: 'b-evt',       folder: 'brands', group: '부품·액세서리 · 해외 본사', title: 'EVT',                 mono: 'EVT',  tint: 'ruby',   kind: 'link', url: 'https://www.efficientvelo.com/' },
  { id: 'b-atelier',   folder: 'brands', group: '부품·액세서리 · 해외 본사', title: '아뜰리에 미디엄',            mono: 'AM',   tint: 'amber',  kind: 'link', url: 'https://ateliermedium.com/' },
];

// 텍스트 화면(/) 첫 목록의 구역과 순서. 여기에 없는 앱은 검색으로만 보임 (설정은 오른쪽 위 버튼)
window.MYRUBI_HOME = [
  { label: 'Essential', ids: ['checklist', 'project', 'stock', 'nas', 'manual'] },
  { label: 'App',       ids: ['customers', 'quote', 'geometry', 'tone', 'accordion', 'upload'] },
  { label: 'Report',    ids: ['strategy', 'sales-report', 'purchase-report', 'garage'] },
  { label: 'Bookmark',  ids: ['management', 'ecount', 'channel', 'google', 'shops', 'brands', 'logistics'] },
];

// 처음 쓰는 기기에서 작업 표시줄에 고정되는 앱
window.MYRUBI_PINNED = ['checklist', 'ecount', 'channel', 'nas'];

// only 가 있는 앱은 로그인한 계정이 맞을 때만 목록에 남김 (구역이 비면 구역도 안 보임)
(() => {
  const key = e => { e = String(e || '').toLowerCase().trim(); const at = e.lastIndexOf('@'); return at < 0 ? e : e.slice(0, at); };
  const nk = s => String(s || '').toLowerCase().replace(/\s+/g, '');
  // email: 로그인 이메일, name: 구글 계정 이름 (only 에 이름을 적은 경우)
  const can = (a, email, name) => !a.only || a.only.some(x => key(x) === key(email) || (nk(x) && nk(x) === nk(name)));
  let email = '', name = '';
  try { if (window.MR && MR.session()) { email = MR.user().email; name = MR.user().name; } } catch (e) {}
  window.MYRUBI_CAN = can;
  window.MYRUBI_APPS_HIDDEN = window.MYRUBI_APPS.filter(a => !can(a, email, name));
  window.MYRUBI_APPS = window.MYRUBI_APPS.filter(a => can(a, email, name));
})();
