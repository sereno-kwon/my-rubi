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
  { id: 'shops',     title: '쇼핑몰 관리',   kind: 'folder' },
  { id: 'brands',    title: '브랜드 사이트', kind: 'folder' },

  // 내장
  { id: 'memo',      title: '메모장',        icon: 'note', tint: 'paper', kind: 'builtin' },
  { id: 'settings',  title: '바탕화면 설정', icon: 'gear', tint: 'slate', kind: 'builtin' },

  // 구글 업무
  { id: 'gmail',     folder: 'google', title: 'Gmail',   icon: 'mail',     tint: 'ruby',  kind: 'link', url: 'https://mail.google.com/' },
  { id: 'calendar',  folder: 'google', title: '캘린더',  icon: 'calendar', tint: 'blue',  kind: 'link', url: 'https://calendar.google.com/' },
  { id: 'drive',     folder: 'google', title: '드라이브', icon: 'drive',   tint: 'green', kind: 'link', url: 'https://drive.google.com/' },

  // 쇼핑몰 관리
  { id: 'imweb',      folder: 'shops', title: '아임웹',          icon: 'store',  tint: 'slate', kind: 'link', url: 'https://imweb.me/' },
  { id: 'smartstore', folder: 'shops', title: '스마트스토어',     icon: 'store',  tint: 'green', kind: 'link', url: 'https://sell.smartstore.naver.com/' },
  { id: 'site-ws',    folder: 'shops', title: '루비워크샵',      icon: 'globe',  tint: 'ruby',  kind: 'link', url: 'https://rubiworkshop.com/' },
  { id: 'site-sp',    folder: 'shops', title: '루비서플라이',    icon: 'globe',  tint: 'slate', kind: 'link', url: 'https://rubisupply.com/' },
  { id: 'site-kr',    folder: 'shops', title: 'rubi.kr',         icon: 'globe',  tint: 'paper', kind: 'link', url: 'https://rubi.kr/' },
  { id: 'insta',      folder: 'shops', title: '인스타그램',      icon: 'camera', tint: 'paper', kind: 'link', url: 'https://www.instagram.com/rubi.workshop/' },

  // 브랜드 사이트
  { id: 'b-moulton', folder: 'brands', title: '몰튼',          mono: 'Mo', tint: 'slate', kind: 'link', url: 'https://moultonbicycles.co.kr/' },
  { id: 'b-sst',     folder: 'brands', title: '몰튼 SST WIDE', mono: 'SST', tint: 'slate', kind: 'link', url: 'https://sst.moultonbicycles.co.kr/' },
  { id: 'b-bastion', folder: 'brands', title: '바스티온',      mono: 'B',  tint: 'paper', kind: 'link', url: 'https://bastioncycles.co.kr/' },
  { id: 'b-tsubasa', folder: 'brands', title: '츠바사',        mono: 'T',  tint: 'ruby',  kind: 'link', url: 'https://tsubasabicycles.co.kr/' },
  { id: 'b-crust',   folder: 'brands', title: '크러스트',      mono: 'C',  tint: 'amber', kind: 'link', url: 'https://crustbikes.co.kr/' },
  { id: 'b-parlee',  folder: 'brands', title: '팔리',          mono: 'P',  tint: 'blue',  kind: 'link', url: 'https://parleecycles.co.kr/' },
  { id: 'b-quoc',    folder: 'brands', title: 'QUOC',          mono: 'Q',  tint: 'paper', kind: 'link', url: 'https://quoc.rubiworkshop.com/' },
  { id: 'b-gokiso',  folder: 'brands', title: '고키소',        mono: 'G',  tint: 'teal',  kind: 'link', url: 'https://gokiso.rubiworkshop.com/' },
  { id: 'b-surly',   folder: 'brands', title: '설리',          mono: 'S',  tint: 'green', kind: 'link', url: 'https://surly.rubiworkshop.com/' },
];

// 처음 쓰는 기기에서 작업 표시줄에 고정되는 앱
window.MYRUBI_PINNED = ['index', 'customers', 'ecount', 'channel', 'memo'];
