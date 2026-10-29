<?php
/**
 * My Rubi 재고 조회 연결 파일 (Synology Web Station에 올리는 파일, index.php 와 같은 폴더)
 *
 * 포털의 '재고 확인' 앱 요청을 NAS 안의 재고 조회 컨테이너(rubi-stock, 127.0.0.1:8790)로 넘김.
 * NAS 연결(index.php)과 같은 주소·인증서·포트(8443)를 그대로 써서 역방향 프록시나 공유기 설정이 따로 필요 없음.
 * - my.rubiworkshop.com 에서 온 요청만 받음
 * - 재고 조회 서비스의 정해진 동작(health, status, search, stock, catalog)만 통과
 * - 직원 로그인 확인은 컨테이너가 함 (포털 세션을 Apps Script에 확인)
 * 설치: nas/stock/README.md
 */

const ALLOWED_ORIGIN = 'https://my.rubiworkshop.com';
const STOCK_ENDPOINT = 'http://127.0.0.1:8790/';
const ROUTES = ['health', 'status', 'search', 'stock', 'catalog'];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? '';
header('Vary: Origin');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
if ($origin === ALLOWED_ORIGIN) header('Access-Control-Allow-Origin: ' . ALLOWED_ORIGIN);

function out($code, $body) {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($body, JSON_UNESCAPED_UNICODE);
  exit;
}

if ($method === 'OPTIONS') {
  header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
  header('Access-Control-Allow-Headers: X-MyRubi-Session');
  header('Access-Control-Max-Age: 86400');
  http_response_code(204);
  exit;
}
if ($origin !== '' && $origin !== ALLOWED_ORIGIN) out(403, ['ok' => false, 'error' => 'origin_not_allowed']);
if ($method !== 'GET' && $method !== 'POST') out(405, ['ok' => false, 'error' => 'method_not_allowed']);

$route = $_GET['r'] ?? 'health';
if (!in_array($route, ROUTES, true)) out(404, ['ok' => false, 'error' => 'not_found']);
$query = $_GET; unset($query['r']);
$url = STOCK_ENDPOINT . $route . ($query ? '?' . http_build_query($query) : '');

if (!function_exists('curl_init')) out(500, ['ok' => false, 'error' => 'php_curl_missing']);
$ch = curl_init($url);
$headers = ['X-MyRubi-Session: ' . ($_SERVER['HTTP_X_MYRUBI_SESSION'] ?? '')];
curl_setopt_array($ch, [
  CURLOPT_CUSTOMREQUEST => $method,
  CURLOPT_HTTPHEADER => $headers,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_CONNECTTIMEOUT => 5,
  CURLOPT_TIMEOUT => 90,   // 이카운트 로그인·품목 목록 받기가 길어질 때를 위해 넉넉히
]);
if ($method === 'POST') curl_setopt($ch, CURLOPT_POSTFIELDS, '');
$body = curl_exec($ch);
if ($body === false) {
  curl_close($ch);
  out(502, ['ok' => false, 'error' => 'NAS 안의 재고 조회 컨테이너(rubi-stock)가 응답하지 않습니다. Container Manager에서 실행 중인지 확인해 주세요']);
}
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
http_response_code($code ?: 502);
header('Content-Type: application/json; charset=utf-8');
echo $body;
