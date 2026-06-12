/*
 * BHG Mall Loon 抓取脚本
 *
 * 用途：
 *   1. http-request 捕获 Authorization，输出青龙变量 BHG_ACCOUNTS。
 *   2. http-response 根据点击领券后的请求/响应，输出 BHG_RECEIVE_CANDIDATES。
 *   3. 不使用 $persistentStore，不保存 token、请求体或响应体。
 *
 * Plugin:
 *   https://raw.githubusercontent.com/doosit/script/main/bhg_mall.plugin
 */

'use strict';

const NAME = 'BHG Mall';
const DEFAULT_PARKING_COUPON_ID = 221706;
const PARKING_KEYWORD = '停车';
const CONFIRM_WORDS = /您每日只能领取1张|每日只能领取|只能领取1张|最多可领取1张|已领取|领取过|领取上限|不可重复领取/;
const QUERY_METHOD_WORDS = /getMemberCoupons|member\.info|mall\.config|mall\.info|point\.|list|info|detail|query|search/i;
const RECEIVE_METHOD_WORDS = /receive|send|coupon|item|grant|draw|claim/i;

function done(value) {
  if (typeof $done !== 'undefined') {
    $done(value || {});
  }
}

function notify(title, subtitle, body) {
  if (typeof $notification === 'undefined' || !$notification.post) {
    console.log(`[${NAME}] ${title}${subtitle ? ` - ${subtitle}` : ''}${body ? `\n${body}` : ''}`);
    return;
  }

  try {
    $notification.post(title, subtitle || '', body || '');
  } catch (error) {
    console.log(`[${NAME}] 通知发送失败：${error && error.message ? error.message : error}`);
  }
}

function readHeader(headers, name) {
  const target = String(name || '').toLowerCase();
  const keys = Object.keys(headers || {});
  for (let i = 0; i < keys.length; i += 1) {
    if (String(keys[i]).toLowerCase() === target) return headers[keys[i]];
  }
  return '';
}

function toBearer(value) {
  const token = String(value || '').trim();
  if (!token) return '';
  return /^Bearer\s+/i.test(token) ? token : `Bearer ${token}`;
}

function tokenOnly(value) {
  return String(value || '').replace(/^Bearer\s+/i, '').trim();
}

function maskToken(value) {
  const token = tokenOnly(value);
  if (!token) return '';
  if (token.length <= 24) return `${token.slice(0, 6)}***${token.slice(-4)}`;
  return `${token.slice(0, 12)}...${token.slice(-10)}`;
}

function base64UrlDecode(value) {
  try {
    const source = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = source + (source.length % 4 ? '='.repeat(4 - (source.length % 4)) : '');
    if (typeof $text !== 'undefined' && $text.base64Decode) return $text.base64Decode(padded);
    if (typeof atob !== 'undefined') return atob(padded);
    if (typeof Buffer !== 'undefined') return Buffer.from(padded, 'base64').toString('utf8');
  } catch (_) {}
  return '';
}

function decodeJwtPayload(authorization) {
  try {
    const parts = tokenOnly(authorization).split('.');
    if (parts.length < 2) return {};
    return JSON.parse(base64UrlDecode(parts[1]) || '{}');
  } catch (_) {
    return {};
  }
}

function parseJson(text) {
  if (!text) return {};
  if (typeof text === 'object') return text;
  try {
    return JSON.parse(String(text));
  } catch (_) {
    return {};
  }
}

function safeText(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch (_) {
    return String(value);
  }
}

function getUrlPath(url) {
  const raw = String(url || '');
  try {
    const parsed = new URL(raw);
    return parsed.pathname + parsed.search;
  } catch (_) {
    const match = raw.match(/^https?:\/\/[^/]+(\/.*)$/i);
    return match ? match[1] : raw;
  }
}

function findCouponKey(params) {
  if (!params || typeof params !== 'object') return '';

  const directKeys = ['coupon_id', 'couponId', 'id', 'target_id', 'targetId', 'item_id', 'itemId'];
  for (let i = 0; i < directKeys.length; i += 1) {
    const key = directKeys[i];
    const value = params[key];
    if (value === undefined || value === null) continue;
    if (Number(value) === DEFAULT_PARKING_COUPON_ID) return key;
    if (String(value).includes(String(DEFAULT_PARKING_COUPON_ID))) return key;
  }

  const arrayKeys = ['coupon_ids', 'couponIds', 'ids', 'target_ids', 'targetIds', 'item_ids', 'itemIds'];
  for (let i = 0; i < arrayKeys.length; i += 1) {
    const key = arrayKeys[i];
    const value = params[key];
    if (Array.isArray(value) && value.map(Number).indexOf(DEFAULT_PARKING_COUPON_ID) !== -1) return key;
  }

  return '';
}

function bodyLooksLikeParking(value) {
  const text = safeText(value);
  return text.includes(String(DEFAULT_PARKING_COUPON_ID)) || text.includes(PARKING_KEYWORD) || /free_park_hour/i.test(text);
}

function normalizeRestPath(url) {
  let path = getUrlPath(url);
  if (!path) return '';
  path = path.replace(/\/restful\/mall\/\d+/i, '/restful/mall/{mall_id}');
  path = path.replace(new RegExp(String(DEFAULT_PARKING_COUPON_ID), 'g'), '{coupon_id}');
  return path;
}

function extractResponseMessage(responseBody, rawBody) {
  if (responseBody && typeof responseBody === 'object') {
    const message = responseBody.message || responseBody.msg || responseBody.error || '';
    if (message) return String(message).trim();
  }

  const parsed = parseJson(rawBody);
  const message = parsed.message || parsed.msg || parsed.error || '';
  if (message) return String(message).trim();

  const rawText = safeText(rawBody).trim();
  if (CONFIRM_WORDS.test(rawText)) return rawText.slice(0, 120);
  return '';
}

function inferCandidate(req, requestBody, responseBody, rawResponseBody) {
  const url = String(req.url || '');
  const reqMethod = String(req.method || '').toUpperCase();
  const apiMethod = String((requestBody && requestBody.method) || '').trim();
  const params = requestBody && requestBody.params && typeof requestBody.params === 'object' ? requestBody.params : {};
  const responseText = `${safeText(responseBody)}\n${safeText(rawResponseBody)}`;
  const isConfirmedByResponse = CONFIRM_WORDS.test(responseText);

  if (/\/restful\/mall\//i.test(url) && reqMethod === 'POST') {
    const path = normalizeRestPath(url);
    const looksLikeCouponPath = /\{coupon_id\}|items|coupon|coupons|receive/i.test(path);
    if (path && (looksLikeCouponPath || bodyLooksLikeParking(requestBody) || isConfirmedByResponse)) {
      return `REST:${reqMethod}:${path}`;
    }
  }

  if (/\/v3\/api/i.test(url) && apiMethod) {
    const key = findCouponKey(params) || (bodyLooksLikeParking(params) ? 'coupon_id' : '');
    const looksLikeReceive = RECEIVE_METHOD_WORDS.test(apiMethod);
    const looksLikeQuery = QUERY_METHOD_WORDS.test(apiMethod);
    if ((isConfirmedByResponse || looksLikeReceive || key) && !looksLikeQuery) {
      return `${apiMethod}:${key || 'coupon_id'}`;
    }
  }

  return '';
}

function requestInfo(req, body) {
  const params = body && body.params && typeof body.params === 'object' ? body.params : {};
  const couponKey = findCouponKey(params);
  return {
    path: getUrlPath(req.url),
    httpMethod: String(req.method || '').toUpperCase(),
    apiMethod: body && body.method ? String(body.method) : '',
    couponKey,
    couponValue: couponKey ? params[couponKey] : '',
  };
}

function buildOutput(req, authorization, candidate, reqBody, respBody, rawResponseBody) {
  const jwt = decodeJwtPayload(authorization);
  const info = requestInfo(req, reqBody);
  const respMsg = extractResponseMessage(respBody, rawResponseBody);
  const lines = [];

  lines.push('===== BHG 青龙环境变量（无持久化抓取）=====');
  if (authorization) lines.push(`BHG_ACCOUNTS=${authorization}`);
  else lines.push('BHG_ACCOUNTS=当前请求未发现 Authorization');
  if (candidate) lines.push(`BHG_RECEIVE_CANDIDATES=${candidate}`);
  lines.push('');
  lines.push('===== 当前请求辅助信息 =====');
  lines.push(`URL_PATH=${info.path || '-'}`);
  lines.push(`HTTP_METHOD=${info.httpMethod || '-'}`);
  if (info.apiMethod) lines.push(`API_METHOD=${info.apiMethod}`);
  if (info.couponKey) lines.push(`COUPON_FIELD=${info.couponKey}`);
  if (info.couponValue !== '') lines.push(`COUPON_VALUE=${info.couponValue}`);
  if (respMsg) lines.push(`RESPONSE_MSG=${respMsg}`);
  if (jwt.sub) lines.push(`JWT_MEMBER_ID=${jwt.sub}`);
  if (jwt.mall_id || jwt.mallId) lines.push(`JWT_MALL_ID=${jwt.mall_id || jwt.mallId}`);
  if (jwt.app_id || jwt.appid || jwt.appId) lines.push(`JWT_APP_ID=${jwt.app_id || jwt.appid || jwt.appId}`);
  lines.push('========================================');

  return lines.join('\n');
}

function notifyOutput(authorization, candidate, responseMessage) {
  const title = candidate ? 'BHG 领券接口已识别' : 'BHG 权鉴已捕获';
  const subtitle = authorization ? `Token：${maskToken(authorization)}` : '当前请求未发现 Authorization';
  const body = candidate
    ? `BHG_RECEIVE_CANDIDATES=${candidate}${responseMessage ? `\n接口提示：${responseMessage}` : ''}\n完整 token 请看 Loon 日志。`
    : 'BHG_ACCOUNTS 已输出到 Loon 日志。';
  notify(title, subtitle, body);
}

function main() {
  if (typeof $request === 'undefined' || !$request) {
    done();
    return;
  }

  const method = String($request.method || '').toUpperCase();
  if (method === 'OPTIONS') {
    done();
    return;
  }

  const hasResponse = typeof $response !== 'undefined' && $response;
  const authorization = toBearer(readHeader($request.headers, 'Authorization'));
  const reqBody = parseJson($request.body || '');
  const rawResponseBody = hasResponse ? String($response.body || '') : '';
  const respBody = hasResponse ? parseJson(rawResponseBody) : {};
  const respMsg = extractResponseMessage(respBody, rawResponseBody);
  const candidate = hasResponse ? inferCandidate($request, reqBody, respBody, rawResponseBody) : '';

  const shouldPrintAuth = !!authorization && !hasResponse;
  const shouldPrintCandidate = !!candidate && (
    CONFIRM_WORDS.test(rawResponseBody) ||
    bodyLooksLikeParking(reqBody) ||
    RECEIVE_METHOD_WORDS.test(candidate)
  );

  if (shouldPrintAuth || shouldPrintCandidate) {
    const output = buildOutput($request, authorization, candidate, reqBody, respBody, rawResponseBody);
    console.log(`\n${output}\n`);
    notifyOutput(authorization, candidate, respMsg);
  }

  done();
}

try {
  main();
} catch (error) {
  console.log(`[${NAME}] 抓取异常：${error && error.message ? error.message : error}`);
  done();
}
