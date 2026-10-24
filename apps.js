// My Rubi 앱 목록
// 여기에 한 줄 추가하면 시작 메뉴에 생기고, 폴더에 속하지 않은 앱은 바탕화면에도 놓입니다.
//
// kind
//   link    : 새 탭으로 열림 (외부 사이트는 대부분 창 안에 넣을 수 없음)
//   frame   : 바탕화면 안의 창으로 열림 (my.rubiworkshop.com 안의 페이지용, 예: url:'/consult/')
//   folder  : 창 안에 아이콘 모음. 앱에 folder:'폴더 id' 를 적으면 그 폴더 안에 들어감
//   builtin : 포털 내장 (메모장, 바탕화면 설정)
//   soon    : 준비 중 (아이콘만 보이고, 열면 안내 창)
//
// icon : chat bike shield sheet folder box bubble mail calendar drive note gear store globe camera wrench
// tint : ruby slate green blue amber teal paper
// mono : 아이콘 대신 글자 한두 개 (브랜드 사이트용)
// group: 폴더 안에서 같은 이름끼리 묶어 소제목과 함께 보여줌

window.MYRUBI_APPS = [
  // 루비 업무 앱
  { id: 'consult',   title: '상담 현황',   icon: 'chat',   tint: 'ruby',  kind: 'soon', note: '자전거 상담 접수부터 출고까지 단계별로 관리합니다.' },
  { id: 'bikes',     title: '출고 자전거', icon: 'bike',   tint: 'slate', kind: 'soon', note: '루비워크샵에서 출고한 고객 자전거의 사양과 이력을 모아 봅니다.' },
  { id: 'care',      title: '루비케어',    icon: 'shield', tint: 'teal',  kind: 'soon', note: '출고 이후 점검, 보증, 수리 이력을 관리합니다.' },
  { id: 'garage',    title: '루비개러지',  icon: 'wrench', tint: 'amber', kind: 'soon', note: '루비개러지 입고와 작업 현황을 관리합니다.' },

  // 자주 여는 곳
  { id: 'index',     title: 'Index 시트',  icon: 'sheet',  tint: 'green', kind: 'link', url: 'https://docs.google.com/spreadsheets/d/1wkogYTTI26ha1YsYu35pOLSBFSxIRok58qYRqRw18mA/edit' },
  { id: 'customers', title: '고객 폴더',   icon: 'folder', tint: 'amber', kind: 'link', url: 'https://drive.google.com/drive/folders/1nNNZEw7Pn7a186FraNtmodHsIwtncfH4' },
  { id: 'ecount',    title: '이카운트 ERP', icon: 'box',   tint: 'blue',  kind: 'link', url: 'https://login.ecount.com/' },
  { id: 'channel',   title: '채널톡',      icon: 'bubble', tint: 'paper', kind: 'link', url: 'https://desk.channel.io/' },

  // 폴더
  { id: 'google',    title: '구글 업무',     kind: 'folder' },
  { id: 'shops',     title: 'PLATFORM',      kind: 'folder' },
  { id: 'brands',    title: 'BRAND',         kind: 'folder' },
  { id: 'management', title: 'MANAGEMENT',  kind: 'folder' },

  // 내장
  { id: 'memo',      title: '메모장',        icon: 'note', tint: 'paper', kind: 'builtin' },
  { id: 'settings',  title: '바탕화면 설정', icon: 'gear', tint: 'slate', kind: 'builtin' },

  // 구글 업무
  { id: 'gmail',     folder: 'google', title: 'Gmail',   icon: 'mail',     tint: 'ruby',  kind: 'link', url: 'https://mail.google.com/' },
  { id: 'calendar',  folder: 'google', title: '캘린더',  icon: 'calendar', tint: 'blue',  kind: 'link', url: 'https://calendar.google.com/' },
  { id: 'drive',     folder: 'google', title: '드라이브', icon: 'drive',   tint: 'green', kind: 'link', url: 'https://drive.google.com/' },

  // PLATFORM (판매 채널 관리자 화면)
  { id: 'p-ws',        folder: 'shops', title: '루비워크샵',            icon: 'store', tint: 'ruby',  kind: 'link', url: 'https://rubiworkshop.com/admin' },
  { id: 'p-sp',        folder: 'shops', title: '루비서플라이',          icon: 'store', tint: 'slate', kind: 'link', url: 'https://rubisupply.com/admin' },
  { id: 'p-ss-ws',     folder: 'shops', title: '루비워크샵 스마트스토어', icon: 'store', tint: 'green', kind: 'link', url: 'https://sell.smartstore.naver.com/' },
  { id: 'p-ss-garage', folder: 'shops', title: '루비개러지 스마트스토어', icon: 'store', tint: 'amber', kind: 'link', url: 'https://sell.smartstore.naver.com/' },

  // MANAGEMENT (공유 드라이브의 '매니지먼트 2026' 시트)
  { id: 'm-erp',         folder: 'management', title: 'ERP 2026',                icon: 'sheet', tint: 'blue',   kind: 'link', url: 'https://docs.google.com/spreadsheets/d/1NQ3zmJQzW91JGtnPrIwTJn6EdLZzDPBmUeYqXvzZNBw/edit' },
  { id: 'm-logistics',   folder: 'management', title: '로지스틱스 2026',              icon: 'sheet', tint: 'amber',  kind: 'link', url: 'https://docs.google.com/spreadsheets/d/1c_J3h-qjJBJZM3sKb4mAPMouVQJ60aGgnIaiOQNH9tQ/edit' },
  { id: 'm-import',      folder: 'management', title: '수입 2026',                 icon: 'sheet', tint: 'green',  kind: 'link', url: 'https://docs.google.com/spreadsheets/d/10k5Tfv2uCpOPzf7YnQrddEsbWQb9zm9psDedX-X-dxU/edit' },
  { id: 'm-export',      folder: 'management', title: '수출 2026',                 icon: 'sheet', tint: 'teal',   kind: 'link', url: 'https://docs.google.com/spreadsheets/d/19ortty3Wtoqvi_Jm_UhKIibVyBwpzX6wMWqOu_0sQW4/edit' },
  { id: 'm-supply',      folder: 'management', title: '루비서플라이 2026',             icon: 'sheet', tint: 'slate',  kind: 'link', url: 'https://docs.google.com/spreadsheets/d/1o7IZPhKGQEj1NVSsgmZxQXlDk_Uxj78zqjhqrxEbkCo/edit' },

  // BRAND (group 이 같은 앱끼리 폴더 안에서 한 구역으로 묶임)
  // 루비 운영 한국 사이트
  { id: 'b-moulton',   folder: 'brands', group: '루비 운영 한국 사이트', title: '몰튼',                  mono: 'Mo',   tint: 'slate',  kind: 'link', url: 'https://moultonbicycles.co.kr/' },
  { id: 'b-sst',       folder: 'brands', group: '루비 운영 한국 사이트', title: '몰튼 SST WIDE',         mono: 'SST',  tint: 'slate',  kind: 'link', url: 'https://sst.moultonbicycles.co.kr/' },
  { id: 'b-bastion',   folder: 'brands', group: '루비 운영 한국 사이트', title: '바스티온',                mono: 'B',    tint: 'paper',  kind: 'link', url: 'https://bastioncycles.co.kr/' },
  { id: 'b-tsubasa',   folder: 'brands', group: '루비 운영 한국 사이트', title: '츠바사',                 mono: 'T',    tint: 'ruby',   kind: 'link', url: 'https://tsubasabicycles.co.kr/' },
  { id: 'b-crust',     folder: 'brands', group: '루비 운영 한국 사이트', title: '크러스트',                mono: 'C',    tint: 'amber',  kind: 'link', url: 'https://crustbikes.co.kr/' },
  { id: 'b-parlee',    folder: 'brands', group: '루비 운영 한국 사이트', title: '팔리',                  mono: 'P',    tint: 'blue',   kind: 'link', url: 'https://parleecycles.co.kr/' },
  { id: 'b-surly',     folder: 'brands', group: '루비 운영 한국 사이트', title: '설리',                  mono: 'S',    tint: 'green',  kind: 'link', url: 'https://surly.rubiworkshop.com/' },
  { id: 'b-quoc',      folder: 'brands', group: '루비 운영 한국 사이트', title: 'QUOC',                mono: 'Q',    tint: 'paper',  kind: 'link', url: 'https://quoc.rubiworkshop.com/' },
  { id: 'b-gokiso',    folder: 'brands', group: '루비 운영 한국 사이트', title: '고키소',                 mono: 'G',    tint: 'teal',   kind: 'link', url: 'https://gokiso.rubiworkshop.com/' },
  // 자전거 브랜드 해외 사이트
  { id: 'b-moulton-g', folder: 'brands', group: '자전거 브랜드 해외 사이트', title: '몰튼 Global',           mono: 'Mo',   tint: 'slate',  kind: 'link', url: 'https://moultonbicycles.co.uk/' },
  { id: 'b-bastion-g', folder: 'brands', group: '자전거 브랜드 해외 사이트', title: '바스티온 Global',         mono: 'B',    tint: 'paper',  kind: 'link', url: 'https://bastioncycles.com/' },
  { id: 'b-tsubasa-g', folder: 'brands', group: '자전거 브랜드 해외 사이트', title: '츠바사 Global',          mono: 'T',    tint: 'ruby',   kind: 'link', url: 'https://cargocollective.com/tsubasabicycles' },
  { id: 'b-crust-g',   folder: 'brands', group: '자전거 브랜드 해외 사이트', title: '크러스트 Global',         mono: 'C',    tint: 'amber',  kind: 'link', url: 'https://crustbikes.com/' },
  { id: 'b-parlee-g',  folder: 'brands', group: '자전거 브랜드 해외 사이트', title: '팔리 Global',           mono: 'P',    tint: 'blue',   kind: 'link', url: 'https://parleecycles.com/' },
  { id: 'b-surly-g',   folder: 'brands', group: '자전거 브랜드 해외 사이트', title: '설리 Global',           mono: 'S',    tint: 'green',  kind: 'link', url: 'https://surlybikes.com/' },
  { id: 'b-pashley',   folder: 'brands', group: '자전거 브랜드 해외 사이트', title: '파슐리',                 mono: 'Pa',   tint: 'green',  kind: 'link', url: 'https://www.pashley.co.uk/' },
  { id: 'b-velo',      folder: 'brands', group: '자전거 브랜드 해외 사이트', title: '벨로오렌지',               mono: 'VO',   tint: 'amber',  kind: 'link', url: 'https://velo-orange.com/' },
  // 부품·액세서리 브랜드
  { id: 'b-yohemite',  folder: 'brands', group: '부품·액세서리 브랜드', title: '요헤미티',                mono: 'Yo',   tint: 'ruby',   kind: 'link', url: 'https://www.yohemite.com/' },
  { id: 'b-paul',      folder: 'brands', group: '부품·액세서리 브랜드', title: '폴 컴포넌트',              mono: 'Pc',   tint: 'slate',  kind: 'link', url: 'https://paulcomp.com/' },
  { id: 'b-wolftooth', folder: 'brands', group: '부품·액세서리 브랜드', title: '울프투스',                mono: 'WT',   tint: 'amber',  kind: 'link', url: 'https://www.wolftoothcomponents.com/' },
  { id: 'b-white',     folder: 'brands', group: '부품·액세서리 브랜드', title: '화이트 인더스트리',           mono: 'WI',   tint: 'paper',  kind: 'link', url: 'https://www.whiteind.com/' },
  { id: 'b-mks',       folder: 'brands', group: '부품·액세서리 브랜드', title: 'MKS',                 mono: 'MKS',  tint: 'slate',  kind: 'link', url: 'https://mkspedal.com/' },
  { id: 'b-carbonti',  folder: 'brands', group: '부품·액세서리 브랜드', title: '카본티',                 mono: 'Ct',   tint: 'blue',   kind: 'link', url: 'https://www.carbon-ti.com/' },
  { id: 'b-chrisking', folder: 'brands', group: '부품·액세서리 브랜드', title: '크리스킹',                mono: 'CK',   tint: 'ruby',   kind: 'link', url: 'https://chrisking.com/' },
  { id: 'b-spurcycle', folder: 'brands', group: '부품·액세서리 브랜드', title: '스퍼사이클',               mono: 'Sp',   tint: 'teal',   kind: 'link', url: 'https://www.spurcycle.com/' },
  { id: 'b-growtac',   folder: 'brands', group: '부품·액세서리 브랜드', title: '그로우택',                mono: 'Gr',   tint: 'green',  kind: 'link', url: 'https://growtac.com/' },
  { id: 'b-thm',       folder: 'brands', group: '부품·액세서리 브랜드', title: 'THM',                 mono: 'THM',  tint: 'slate',  kind: 'link', url: 'https://www.thm.bike/' },
  { id: 'b-schmolke',  folder: 'brands', group: '부품·액세서리 브랜드', title: '쉬몰케',                 mono: 'Sm',   tint: 'paper',  kind: 'link', url: 'https://www.schmolke-carbon.com/' },
  { id: 'b-extralite', folder: 'brands', group: '부품·액세서리 브랜드', title: '엑스트라라이트',             mono: 'Ex',   tint: 'blue',   kind: 'link', url: 'https://www.extralite.com/' },
  { id: 'b-adm',       folder: 'brands', group: '부품·액세서리 브랜드', title: '아르떼 디마노',             mono: 'AdM',  tint: 'amber',  kind: 'link', url: 'https://artedimano.com/' },
  { id: 'b-berthoud',  folder: 'brands', group: '부품·액세서리 브랜드', title: '베르투 사이클',             mono: 'Be',   tint: 'ruby',   kind: 'link', url: 'https://www.gillesberthoud.fr/' },
  { id: 'b-velocity',  folder: 'brands', group: '부품·액세서리 브랜드', title: '벨로시티',                mono: 'Ve',   tint: 'teal',   kind: 'link', url: 'https://velocityusa.com/' },
  { id: 'b-nissen',    folder: 'brands', group: '부품·액세서리 브랜드', title: '니센',                  mono: 'Ni',   tint: 'slate',  kind: 'link', url: 'https://www.nissen-cable.jp/' },
  { id: 'b-crane',     folder: 'brands', group: '부품·액세서리 브랜드', title: '크레인벨',                mono: 'Cr',   tint: 'amber',  kind: 'link', url: 'https://www.cranebellco.com/' },
  { id: 'b-ultra',     folder: 'brands', group: '부품·액세서리 브랜드', title: '울트라다이나미코',            mono: 'Ud',   tint: 'green',  kind: 'link', url: 'https://www.ultradynamico.com/' },
  { id: 'b-kingcage',  folder: 'brands', group: '부품·액세서리 브랜드', title: '킹케이지',                mono: 'KC',   tint: 'paper',  kind: 'link', url: 'https://kingcage.com/' },
  { id: 'b-hulsroy',   folder: 'brands', group: '부품·액세서리 브랜드', title: '훌스로이',                mono: 'Hu',   tint: 'slate',  kind: 'link', url: 'https://hulsroy.com/' },
  { id: 'b-nokon',     folder: 'brands', group: '부품·액세서리 브랜드', title: '노콘 케이블',              mono: 'No',   tint: 'blue',   kind: 'link', url: 'https://www.nokon.com/' },
  { id: 'b-honjo',     folder: 'brands', group: '부품·액세서리 브랜드', title: '혼조',                  mono: 'Ho',   tint: 'teal',   kind: 'link', url: 'https://en.honjo-mudguards.jp/' },
  { id: 'b-dward',     folder: 'brands', group: '부품·액세서리 브랜드', title: '디워드 디자인',             mono: 'Dw',   tint: 'paper',  kind: 'link', url: 'https://dward-design.co.uk/' },
  { id: 'b-stone',     folder: 'brands', group: '부품·액세서리 브랜드', title: '스톤 체인링',              mono: 'St',   tint: 'slate',  kind: 'link', url: 'https://stonechainrings.com/' },
  { id: 'b-evt',       folder: 'brands', group: '부품·액세서리 브랜드', title: 'EVT',                 mono: 'EVT',  tint: 'ruby',   kind: 'link', url: 'https://www.efficientvelo.com/' },
  { id: 'b-atelier',   folder: 'brands', group: '부품·액세서리 브랜드', title: '아뜰리에 미디엄',            mono: 'AM',   tint: 'amber',  kind: 'link', url: 'https://ateliermedium.com/' },
];

// 처음 쓰는 기기에서 작업 표시줄에 고정되는 앱
window.MYRUBI_PINNED = ['index', 'customers', 'ecount', 'channel', 'memo'];
