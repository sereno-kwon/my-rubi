<?php
/**
 * My Rubi 상품업로드 연결 파일 (Synology Web Station에 올리는 파일, index.php · stock.php 와 같은 폴더)
 *
 * 포털의 '상품업로드' 앱 요청을 NAS 안의 상품업로드 컨테이너(rubi-upload, 127.0.0.1:8791)로 넘김.
 * - my.rubiworkshop.com 에서 온 요청만 받음
 * - 정해진 동작만 통과, 직원 로그인 확인은 컨테이너가 함 (포털 세션을 Apps Script에 확인)
 * - file 은 만든 zip 을 그대로 내려보냄
 * 설치: nas/upload/README.md
 */

const ALLOWED_ORIGIN = 'https://my.rubiworkshop.com';
const UPLOAD_ENDPOINT = 'http://127.0.0.1:8791/';
const ROUTES = ['health', 'status', 'scan', 'families', 'review', 'item', 'sources', 'draft', 'save', 'brands', 'categories', 'build', 'file'];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? '';
header('Vary: Origin');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
if ($origin === ALLOWED_ORIGIN) {
  header('Access-Control-Allow-Origin: ' . ALLOWED_ORIGIN);
  header('Access-Control-Expose-Headers: Content-Disposition');
}

function out($code, $body) {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($body, JSON_UNESCAPED_UNICODE);
  exit;
}

if ($method === 'OPTIONS') {
  header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
  header('Access-Control-Allow-Headers: X-MyRubi-Session, Content-Type');
  header('Access-Control-Max-Age: 86400');
  http_response_code(204);
  exit;
}
if ($origin !== '' && $origin !== ALLOWED_ORIGIN) out(403, ['ok' => false, 'error' => 'origin_not_allowed']);
if ($method !== 'GET' && $method !== 'POST') out(405, ['ok' => false, 'error' => 'method_not_allowed']);

$route = $_GET['r'] ?? 'health';
if (!in_array($route, ROUTES, true)) out(404, ['ok' => false, 'error' => 'not_found']);
$query = $_GET; unset($query['r']);
$url = UPLOAD_ENDPOINT . $route . ($query ? '?' . http_build_query($query) : '');

if (!function_exists('curl_init')) out(500, ['ok' => false, 'error' => 'php_curl_missing']);
$ch = curl_init($url);
$headers = ['X-MyRubi-Session: ' . ($_SERVER['HTTP_X_MYRUBI_SESSION'] ?? '')];
$respHeaders = [];
curl_setopt_array($ch, [
  CURLOPT_CUSTOMREQUEST => $method,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_CONNECTTIMEOUT => 5,
  CURLOPT_TIMEOUT => 300,   // 초안 만들기(공식 페이지 읽기 + Claude)와 엑셀·이미지 만들기는 1~3분 걸릴 수 있음
  CURLOPT_HEADERFUNCTION => function ($c, $h) use (&$respHeaders) {
    $p = explode(':', $h, 2);
    if (count($p) === 2) $respHeaders[strtolower(trim($p[0]))] = trim($p[1]);
    return strlen($h);
  },
]);
if ($method === 'POST') {
  $headers[] = 'Content-Type: application/json';
  curl_setopt($ch, CURLOPT_POSTFIELDS, file_get_contents('php://input'));
}
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
$body = curl_exec($ch);
if ($body === false) {
  curl_close($ch);
  out(502, ['ok' => false, 'error' => 'NAS 안의 상품업로드 컨테이너(rubi-upload)가 응답하지 않습니다. Container Manager에서 실행 중인지 확인해 주세요']);
}
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
http_response_code($code ?: 502);
header('Content-Type: ' . ($respHeaders['content-type'] ?? 'application/json; charset=utf-8'));
if (!empty($respHeaders['content-disposition'])) header('Content-Disposition: ' . $respHeaders['content-disposition']);
echo $body;
