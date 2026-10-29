<?php
/**
 * My Rubi NAS 연결 파일 (Synology Web Station에 올리는 파일)
 *
 * 포털(my.rubiworkshop.com)이 NAS의 File Station API를 부를 수 있게 중간에서 전달함.
 * - my.rubiworkshop.com 에서 온 요청만 받음
 * - 로그인/로그아웃, 폴더 목록, 검색, 내려받기, 썸네일 API만 통과시킴 (파일 삭제·이동·공유 등은 막힘)
 * - 비밀번호나 세션을 이 파일이 저장하지 않음. 받은 요청을 NAS에 그대로 넘기고 응답을 돌려줌
 * 설치: nas/README.md
 */

// ───── 설정 ─────
const ALLOWED_ORIGIN = 'https://my.rubiworkshop.com';
// NAS 안에서 DSM에 접속하는 주소. DSM HTTPS 포트를 바꿨다면 5001을 그 번호로 바꿈
const DSM_ENDPOINT = 'https://127.0.0.1:5001/webapi/entry.cgi';

const ALLOWED = [
  'SYNO.API.Auth'             => ['login', 'logout'],
  'SYNO.FileStation.List'     => ['list_share', 'list', 'getinfo'],
  'SYNO.FileStation.Search'   => ['start', 'list', 'stop', 'clean'],
  'SYNO.FileStation.Download' => ['download'],
  'SYNO.FileStation.Thumb'    => ['get'],   // 이미지 썸네일 (마우스 올렸을 때 미리보기)
];

// ───── CORS ─────
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin === ALLOWED_ORIGIN) {
  header('Access-Control-Allow-Origin: ' . ALLOWED_ORIGIN);
  header('Access-Control-Expose-Headers: Content-Disposition, Content-Type, Content-Length');
}
header('Vary: Origin');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  header('Access-Control-Allow-Methods: POST');
  header('Access-Control-Allow-Headers: Content-Type');
  header('Access-Control-Max-Age: 86400');
  http_response_code(204);
  exit;
}

function deny($code, $msg) {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(['success' => false, 'error' => ['code' => $msg]]);
  exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') deny(405, 'method_not_allowed');
if ($origin !== ALLOWED_ORIGIN) deny(403, 'origin_not_allowed');

$api = $_POST['api'] ?? '';
$method = $_POST['method'] ?? '';
if (!isset(ALLOWED[$api]) || !in_array($method, ALLOWED[$api], true)) deny(403, 'api_not_allowed');

// ───── NAS로 전달 ─────
if (!function_exists('curl_init')) deny(500, 'php_curl_missing');

$ch = curl_init(DSM_ENDPOINT);
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_POSTFIELDS => http_build_query($_POST),
  CURLOPT_HTTPHEADER => [
    'Content-Type: application/x-www-form-urlencoded',
    'X-Forwarded-For: ' . ($_SERVER['REMOTE_ADDR'] ?? ''),
  ],
  CURLOPT_CONNECTTIMEOUT => 10,
  CURLOPT_TIMEOUT => 600,
  // 같은 NAS 안(127.0.0.1)으로만 보내므로 인증서 이름 확인은 생략
  CURLOPT_SSL_VERIFYPEER => false,
  CURLOPT_SSL_VERIFYHOST => 0,
  CURLOPT_HEADERFUNCTION => function ($c, $h) {
    if (preg_match('/^(Content-Type|Content-Disposition|Content-Length):/i', $h)) header(trim($h));
    return strlen($h);
  },
  CURLOPT_WRITEFUNCTION => function ($c, $data) {
    echo $data;
    flush();
    return strlen($data);
  },
]);

if (curl_exec($ch) === false && !headers_sent()) {
  $err = curl_error($ch);
  curl_close($ch);
  deny(502, 'dsm_unreachable: ' . $err);
}
curl_close($ch);
