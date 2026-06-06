'use strict';

const https = require('https');

const ENV_NAME = 'HZH_COOKIE';
const REQUEST_TIMEOUT_MS = 15000;
const USER_AGENT = 'HUAZHU/ios/iPhone/18.0/9.24.0/RNWEBVIEW';

function parseAccounts(rawValue) {
  if (!rawValue) return [];
  return String(rawValue)
    .split(/[\n&@]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function maskCookie(cookie) {
  const value = String(cookie || '');
  if (value.length <= 8) return '***';
  return `${value.slice(0, 3)}***${value.slice(-3)}`;
}

function truncate(text, maxLength = 500) {
  const value = String(text || '');
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...`;
}

function buildHeaders(cookie) {
  return {
    Connection: 'keep-alive',
    'Accept-Encoding': 'identity',
    'Client-Platform': 'APP-IOS',
    Origin: 'https://cdn.huazhu.com',
    'User-Agent': USER_AGENT,
    Cookie: cookie,
    Host: 'appgw.huazhu.com',
    Referer: 'https://cdn.huazhu.com/',
    'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
    Accept: 'application/json, text/plain, */*',
  };
}

function requestText(url, headers, timeoutMs = REQUEST_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers, timeout: timeoutMs }, (res) => {
      const chunks = [];

      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error(`请求超时 ${timeoutMs}ms`));
    });

    req.on('error', reject);
  });
}

function parseJsonBody(body) {
  try {
    return {
      ok: true,
      value: JSON.parse(body),
    };
  } catch (error) {
    return {
      ok: false,
      error,
    };
  }
}

function extractAwardNames(content) {
  const awards = content && content.awardMap && content.awardMap.award;
  if (!Array.isArray(awards)) return '';
  return awards
    .map((item) => item && item.awardName)
    .filter(Boolean)
    .join('、');
}

function summarizeSignInResponse(payload) {
  if (payload && payload.message === 'fail') {
    return {
      ok: false,
      status: 'auth_or_event_error',
      message: '接口返回 fail，Cookie 可能失效或活动状态异常',
    };
  }

  const content = payload && payload.content;
  if (content && content.signResult === true) {
    const point = Number.isFinite(Number(content.point)) ? Number(content.point) : 0;
    const awardNames = extractAwardNames(content);
    return {
      ok: true,
      status: 'signed',
      message: `签到成功，获得 ${point} 积分${awardNames ? `、${awardNames}` : ''}！`,
    };
  }

  if (content && content.signResult === false) {
    return {
      ok: true,
      status: 'already',
      message: '今日已签到',
    };
  }

  return {
    ok: false,
    status: 'unknown',
    message: `未知返回结构：${truncate(JSON.stringify(payload))}`,
  };
}

async function signIn(cookie) {
  const timestamp = Math.floor(Date.now() / 1000);
  const url = `https://appgw.huazhu.com/game/sign_in?date=${timestamp}`;
  const response = await requestText(url, buildHeaders(cookie));

  if (response.statusCode < 200 || response.statusCode >= 300) {
    return {
      ok: false,
      status: 'http_error',
      message: `HTTP ${response.statusCode}：${truncate(response.body)}`,
    };
  }

  const parsed = parseJsonBody(response.body);
  if (!parsed.ok) {
    return {
      ok: false,
      status: 'json_error',
      message: `JSON 解析失败：${truncate(response.body)}`,
    };
  }

  return summarizeSignInResponse(parsed.value);
}

async function main() {
  console.log('华住会签到开始');
  const accounts = parseAccounts(process.env[ENV_NAME]);

  if (accounts.length === 0) {
    console.log(`未找到青龙环境变量 ${ENV_NAME}`);
    console.log(`请先通过 Loon 捕获 Cookie，再在青龙环境变量中新增 ${ENV_NAME}`);
    process.exitCode = 1;
    return;
  }

  console.log(`共找到 ${accounts.length} 个账号`);
  let failedCount = 0;

  for (let index = 0; index < accounts.length; index += 1) {
    const accountNo = index + 1;
    const cookie = accounts[index];
    console.log('');
    console.log(`账号 ${accountNo}/${accounts.length}：${maskCookie(cookie)}`);

    try {
      const result = await signIn(cookie);
      console.log(result.message);
      if (!result.ok) failedCount += 1;
    } catch (error) {
      failedCount += 1;
      console.log(`签到异常：${error.message || error}`);
    }
  }

  console.log('');
  console.log(`华住会签到结束，成功 ${accounts.length - failedCount} 个，失败 ${failedCount} 个`);
  if (failedCount > 0) process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  buildHeaders,
  parseAccounts,
  maskCookie,
  summarizeSignInResponse,
  signIn,
};
