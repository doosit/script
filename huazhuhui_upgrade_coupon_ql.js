'use strict';

/*
 * 华住会每日升房券领取 - 青龙脚本
 *
 * 必填环境变量：
 *   HZH_COOKIE                    Loon 捕获到的完整 Cookie，支持换行、&、@ 分隔多账号
 *
 * 常用可选变量：
 *   HZH_UPGRADE_CLAIM_TIME        每天领取时间，默认 10:00:00.000
 *   HZH_UPGRADE_MAX_ATTEMPTS      最大尝试次数，默认 20
 *   HZH_UPGRADE_ATTEMPT_INTERVAL_MS 失败后基础重试间隔，默认 350
 *   HZH_UPGRADE_LEAD_MS           按校准后的服务端时间提前发起毫秒数，默认 80
 *   HZH_UPGRADE_TIME_SAMPLES      服务端时间采样次数，默认 12；建议青龙提前运行时可设 12-20 提高秒跳变校准概率
 *   HZH_UPGRADE_DRY_RUN           设为 1 时只探测服务端时间，不发起领取
 *   HZH_UPGRADE_RUN_NOW           设为 1 时跳过等待，立即按最大次数尝试
 *
 * HAR 默认参数：
 *   objectClass=OCTYYLQ
 *   id=a6f395af270e42adb8985879bff7739d
 *   moduleId=148
 *   source=CMS活动_OCTYYLQ
 */

const https = require('https');
const { randomUUID, randomBytes } = require('crypto');

const ENV_COOKIE = 'HZH_COOKIE';

const DEFAULTS = {
  baseUrl: 'https://newactivity.huazhu.com/campaign/template/sendPrize',
  objectClass: 'OCTYYLQ',
  prizeId: 'a6f395af270e42adb8985879bff7739d',
  moduleId: '148',
  env: 'prd',
  appType: 'web',
  source: 'CMS活动_OCTYYLQ',
  claimTime: '10:00:00.000',
  timezoneOffset: 8,
  maxAttempts: 20,
  attemptIntervalMs: 350,
  rateLimitExtraMs: 300,
  maxIntervalMs: 1200,
  leadMs: 80,
  lateGraceMs: 300000,
  requestTimeoutMs: 3000,
  timeSamples: 12,
  timeSampleIntervalMs: 80,
  serverDateBiasMs: 500,
};

function envValue(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function envInt(name, fallback, min = 0) {
  const value = Number.parseInt(envValue(name, ''), 10);
  if (!Number.isFinite(value) || value < min) return fallback;
  return value;
}

function envBool(name, fallback = false) {
  const value = String(envValue(name, fallback ? '1' : '0')).trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(value);
}

function loadConfig() {
  return {
    baseUrl: envValue('HZH_UPGRADE_BASE_URL', DEFAULTS.baseUrl),
    objectClass: envValue('HZH_UPGRADE_OBJECT_CLASS', DEFAULTS.objectClass),
    prizeId: envValue('HZH_UPGRADE_PRIZE_ID', DEFAULTS.prizeId),
    moduleId: envValue('HZH_UPGRADE_MODULE_ID', DEFAULTS.moduleId),
    env: envValue('HZH_UPGRADE_ENV', DEFAULTS.env),
    appType: envValue('HZH_UPGRADE_APP_TYPE', DEFAULTS.appType),
    source: envValue('HZH_UPGRADE_SOURCE', DEFAULTS.source),
    claimTime: envValue('HZH_UPGRADE_CLAIM_TIME', DEFAULTS.claimTime),
    timezoneOffset: envInt('HZH_UPGRADE_TZ_OFFSET', DEFAULTS.timezoneOffset, -12),
    maxAttempts: envInt('HZH_UPGRADE_MAX_ATTEMPTS', DEFAULTS.maxAttempts, 1),
    attemptIntervalMs: envInt('HZH_UPGRADE_ATTEMPT_INTERVAL_MS', DEFAULTS.attemptIntervalMs, 0),
    rateLimitExtraMs: envInt('HZH_UPGRADE_RATE_LIMIT_EXTRA_MS', DEFAULTS.rateLimitExtraMs, 0),
    maxIntervalMs: envInt('HZH_UPGRADE_MAX_INTERVAL_MS', DEFAULTS.maxIntervalMs, 1),
    leadMs: envInt('HZH_UPGRADE_LEAD_MS', DEFAULTS.leadMs, 0),
    lateGraceMs: envInt('HZH_UPGRADE_LATE_GRACE_MS', DEFAULTS.lateGraceMs, 0),
    requestTimeoutMs: envInt('HZH_UPGRADE_TIMEOUT_MS', DEFAULTS.requestTimeoutMs, 500),
    timeSamples: envInt('HZH_UPGRADE_TIME_SAMPLES', DEFAULTS.timeSamples, 1),
    timeSampleIntervalMs: envInt('HZH_UPGRADE_TIME_SAMPLE_INTERVAL_MS', DEFAULTS.timeSampleIntervalMs, 0),
    serverDateBiasMs: envInt('HZH_UPGRADE_SERVER_DATE_BIAS_MS', DEFAULTS.serverDateBiasMs, 0),
    dryRun: envBool('HZH_UPGRADE_DRY_RUN', false),
    runNow: envBool('HZH_UPGRADE_RUN_NOW', false),
  };
}

function parseAccounts(rawValue) {
  if (!rawValue) return [];
  return String(rawValue)
    .split(/[\n&@]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractCookieValue(cookie, name) {
  const parts = String(cookie || '').split(';');
  for (const part of parts) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    if (key === name) return part.slice(index + 1).trim();
  }
  return '';
}

function maskToken(token) {
  const value = String(token || '');
  if (value.length <= 8) return '***';
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

function parseClaimTime(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:\.(\d{1,3}))?)?$/);
  if (!match) {
    throw new Error(`领取时间格式错误：${value}，请使用 HH:mm 或 HH:mm:ss.SSS`);
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] === undefined ? 0 : Number(match[3]);
  const millisecond = match[4] === undefined ? 0 : Number(match[4].padEnd(3, '0'));

  if (hour > 23 || minute > 59 || second > 59 || millisecond > 999) {
    throw new Error(`领取时间超出范围：${value}`);
  }

  return { hour, minute, second, millisecond };
}

function computeTargetServerTimeMs(serverNowMs, claimTime, timezoneOffset = 8, lateGraceMs = DEFAULTS.lateGraceMs) {
  const { hour, minute, second, millisecond } = parseClaimTime(claimTime);
  const zoneMs = timezoneOffset * 3600000;
  const zonedNow = new Date(serverNowMs + zoneMs);
  const targetMs = Date.UTC(
    zonedNow.getUTCFullYear(),
    zonedNow.getUTCMonth(),
    zonedNow.getUTCDate(),
    hour,
    minute,
    second,
    millisecond
  ) - zoneMs;

  if (serverNowMs <= targetMs + lateGraceMs) return targetMs;
  return targetMs + 86400000;
}

function uuid() {
  if (typeof randomUUID === 'function') return randomUUID();
  const hex = randomBytes(16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function buildClaimUrl(options) {
  const url = new URL(options.baseUrl);
  url.searchParams.set('objectClass', options.objectClass);
  url.searchParams.set('id', options.prizeId);
  url.searchParams.set('sk', options.userToken);
  url.searchParams.set('env', options.env);
  url.searchParams.set('moduleId', options.moduleId);
  url.searchParams.set('flag', options.flag || uuid());
  url.searchParams.set('appType', options.appType);
  url.searchParams.set('source', options.source);
  return url.toString();
}

function buildHeaders(cookie, userToken, isOptions = false) {
  const headers = {
    Referer: 'https://cdn.huazhu.com/',
    'Sec-Fetch-Site': 'same-site',
    Host: 'newactivity.huazhu.com',
    'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
    Origin: 'https://cdn.huazhu.com',
    Connection: 'keep-alive',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'User-Agent': 'HUAZHU/ios/iPhone/26.1/9.43.1/RNWEBVIEW',
    'Accept-Encoding': 'identity',
  };

  if (isOptions) {
    headers.Accept = '*/*';
    headers['Access-Control-Request-Method'] = 'POST';
    headers['Access-Control-Request-Headers'] = 'user-token';
    headers['Content-Length'] = '0';
    return headers;
  }

  headers.Accept = 'application/json, text/plain, */*';
  headers['Content-Type'] = 'application/x-www-form-urlencoded';
  headers['Content-Length'] = '0';
  headers['User-Token'] = userToken;
  headers.Cookie = cookie;
  return headers;
}

function requestText(url, options = {}) {
  const method = options.method || 'GET';
  const headers = options.headers || {};
  const timeoutMs = options.timeoutMs || DEFAULTS.requestTimeoutMs;

  return new Promise((resolve, reject) => {
    const startMs = Date.now();
    const req = https.request(url, { method, headers, timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const endMs = Date.now();
        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers || {},
          body: Buffer.concat(chunks).toString('utf8'),
          rttMs: endMs - startMs,
          startedAtMs: startMs,
          endedAtMs: endMs,
        });
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error(`请求超时 ${timeoutMs}ms`));
    });
    req.on('error', reject);
    req.end();
  });
}

function pickServerOffsetSample(samples, fallbackBiasMs) {
  if (!Array.isArray(samples) || samples.length === 0) {
    return null;
  }

  for (let i = 1; i < samples.length; i += 1) {
    const previous = samples[i - 1];
    const current = samples[i];
    const dateJumpMs = current.parsedDateMs - previous.parsedDateMs;
    if (dateJumpMs === 1000) {
      const boundaryWindowMs = current.midpointMs - previous.midpointMs;
      const estimatedBoundaryLocalMs = previous.midpointMs + boundaryWindowMs / 2;
      return {
        offsetMs: Math.round(current.parsedDateMs - estimatedBoundaryLocalMs),
        rttMs: current.rttMs,
        dateHeader: current.dateHeader,
        strategy: 'date-rollover-bracket',
        boundaryWindowMs: Math.round(boundaryWindowMs),
      };
    }
  }

  const best = [...samples].sort((a, b) => a.rttMs - b.rttMs)[0];
  return {
    offsetMs: Math.round(best.parsedDateMs + fallbackBiasMs - best.midpointMs),
    rttMs: best.rttMs,
    dateHeader: best.dateHeader,
    strategy: 'best-rtt-bias',
  };
}

function parseJson(body) {
  try {
    return JSON.parse(body || '{}');
  } catch (error) {
    return null;
  }
}

function classifyClaimResult(statusCode, payload) {
  const msg = payload && (payload.msg || payload.message || payload.businessCode);
  const data = payload && payload.data;

  if (statusCode === 429 || /限流|too many/i.test(String(msg || ''))) {
    return { type: 'retry', message: `限流：${msg || statusCode}` };
  }

  if (!payload) {
    return { type: 'retry', message: `非 JSON 响应，HTTP ${statusCode}` };
  }

  if (payload.success === true && payload.businessCode === '1000') {
    if (data && Number(data.state) === 4) {
      return { type: 'sold_out', message: `奖品已抢光，lastCount=${data.lastCount}` };
    }
    if (!data || Number(data.lastCount) !== 0) {
      return { type: 'success', message: `可能领取成功：${JSON.stringify(payload)}` };
    }
    return { type: 'unknown_success', message: `接口成功但库存状态不明确：${JSON.stringify(payload)}` };
  }

  if (/已领取|重复|领过/.test(String(msg || JSON.stringify(payload)))) {
    return { type: 'already', message: String(msg || '可能已领取') };
  }

  return { type: 'retry', message: `业务失败：${JSON.stringify(payload).slice(0, 300)}` };
}

function isTerminalResult(type) {
  return ['success', 'already', 'sold_out', 'unknown_success'].includes(type);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

async function waitUntil(targetLocalMs) {
  while (true) {
    const remain = targetLocalMs - Date.now();
    if (remain <= 3) break;
    if (remain > 2000) {
      await sleep(remain - 1000);
    } else if (remain > 100) {
      await sleep(remain - 50);
    } else if (remain > 15) {
      await sleep(remain - 8);
    } else {
      await sleep(1);
    }
  }
  while (Date.now() < targetLocalMs) {
    // Busy wait only for the last few milliseconds.
  }
}

async function sampleServerOffset(account, config) {
  const samples = [];
  for (let i = 0; i < config.timeSamples; i += 1) {
    const flag = uuid();
    const url = buildClaimUrl({ ...config, userToken: account.userToken, flag });
    try {
      const response = await requestText(url, {
        method: 'OPTIONS',
        headers: buildHeaders(account.cookie, account.userToken, true),
        timeoutMs: config.requestTimeoutMs,
      });
      const dateHeader = response.headers.date;
      const parsedDateMs = dateHeader ? Date.parse(dateHeader) : NaN;
      if (Number.isFinite(parsedDateMs)) {
        const midpointMs = response.startedAtMs + response.rttMs / 2;
        samples.push({
          parsedDateMs,
          midpointMs,
          rttMs: response.rttMs,
          dateHeader,
        });
      }
    } catch (error) {
      console.log(`服务端时间采样失败：${error.message || error}`);
    }

    if (i < config.timeSamples - 1) await sleep(config.timeSampleIntervalMs);
  }

  if (samples.length === 0) {
    console.log('未能获取服务端 Date，使用本地时间作为兜底');
    return { offsetMs: 0, rttMs: 0, samples };
  }

  const best = pickServerOffsetSample(samples, config.serverDateBiasMs);
  return {
    offsetMs: Math.round(best.offsetMs),
    rttMs: best.rttMs,
    samples,
    dateHeader: best.dateHeader,
    strategy: best.strategy,
    boundaryWindowMs: best.boundaryWindowMs,
  };
}

async function sendClaim(account, config, attempt) {
  const flag = uuid();
  const url = buildClaimUrl({ ...config, userToken: account.userToken, flag });
  const response = await requestText(url, {
    method: 'POST',
    headers: buildHeaders(account.cookie, account.userToken, false),
    timeoutMs: config.requestTimeoutMs,
  });
  const payload = parseJson(response.body);
  const result = classifyClaimResult(response.statusCode, payload);
  return {
    attempt,
    statusCode: response.statusCode,
    rttMs: response.rttMs,
    payload,
    result,
  };
}

async function claimForAccount(account, config, targetLocalMs) {
  if (!config.runNow) await waitUntil(targetLocalMs);

  let intervalMs = config.attemptIntervalMs;
  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    const sendAt = new Date().toISOString();
    try {
      const outcome = await sendClaim(account, config, attempt);
      console.log(
        `账号${account.index} 第${attempt}/${config.maxAttempts}次 ${sendAt} HTTP ${outcome.statusCode} ` +
          `RTT ${outcome.rttMs}ms：${outcome.result.message}`
      );

      if (isTerminalResult(outcome.result.type)) {
        return outcome;
      }

      if (outcome.result.type === 'retry' && /限流/.test(outcome.result.message)) {
        intervalMs = Math.min(config.maxIntervalMs, intervalMs + config.rateLimitExtraMs);
      }
    } catch (error) {
      console.log(`账号${account.index} 第${attempt}次异常：${error.message || error}`);
      intervalMs = Math.min(config.maxIntervalMs, intervalMs + config.rateLimitExtraMs);
    }

    if (attempt < config.maxAttempts) await sleep(intervalMs);
  }

  return {
    result: {
      type: 'failed',
      message: `超过最大尝试次数 ${config.maxAttempts}`,
    },
  };
}

function buildAccounts(cookies) {
  return parseAccounts(cookies).map((cookie, index) => ({
    index: index + 1,
    cookie,
    userToken: extractCookieValue(cookie, 'userToken'),
  }));
}

async function main() {
  const config = loadConfig();
  const accounts = buildAccounts(process.env[ENV_COOKIE]);

  console.log('华住会每日升房券领取');
  console.log(`领取接口：${config.baseUrl}`);
  console.log(`奖品：objectClass=${config.objectClass}, id=${config.prizeId}, moduleId=${config.moduleId}`);
  console.log(`目标服务端时间：每天 ${config.claimTime} UTC+${config.timezoneOffset}`);
  console.log(`最大尝试：${config.maxAttempts}，默认间隔：${config.attemptIntervalMs}ms，提前量：${config.leadMs}ms`);

  if (accounts.length === 0) {
    console.log(`未找到环境变量 ${ENV_COOKIE}`);
    process.exitCode = 1;
    return;
  }

  const validAccounts = accounts.filter((account) => {
    if (account.userToken) return true;
    console.log(`账号${account.index} 缺少 userToken，跳过。Cookie 请使用 Loon 捕获到的完整 HZH_COOKIE`);
    return false;
  });

  if (validAccounts.length === 0) {
    process.exitCode = 1;
    return;
  }

  for (const account of validAccounts) {
    console.log(`账号${account.index} userToken=${maskToken(account.userToken)}`);
  }

  const offsetInfo = await sampleServerOffset(validAccounts[0], config);
  const serverNowMs = Date.now() + offsetInfo.offsetMs;
  const targetServerMs = computeTargetServerTimeMs(
    serverNowMs,
    config.claimTime,
    config.timezoneOffset,
    config.lateGraceMs
  );
  const targetLocalMs = config.runNow ? Date.now() : targetServerMs - offsetInfo.offsetMs - config.leadMs;

  console.log(
    `服务端时间偏移估算：${offsetInfo.offsetMs}ms，RTT=${offsetInfo.rttMs}ms，Date=${offsetInfo.dateHeader || 'N/A'}`
      + `，策略=${offsetInfo.strategy || 'fallback'}`
      + (offsetInfo.boundaryWindowMs ? `，秒边界窗口=${offsetInfo.boundaryWindowMs}ms` : '')
  );
  console.log(`目标服务端时间：${new Date(targetServerMs).toISOString()}`);
  console.log(`本地发起时间：${config.runNow ? '立即执行' : new Date(targetLocalMs).toISOString()}`);

  if (config.dryRun) {
    console.log('DRY_RUN=1，仅完成参数解析和服务端时间探测，不发起领取。');
    return;
  }

  const results = await Promise.all(validAccounts.map((account) => claimForAccount(account, config, targetLocalMs)));
  const failedCount = results.filter((item) => !isTerminalResult(item.result.type)).length;
  console.log(`领取结束：成功/已领取/接口成功/已抢光 ${results.length - failedCount} 个，失败 ${failedCount} 个`);
  if (failedCount > 0) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.log(`脚本异常：${error.stack || error.message || error}`);
    process.exitCode = 1;
  });
}

module.exports = {
  buildClaimUrl,
  classifyClaimResult,
  computeTargetServerTimeMs,
  extractCookieValue,
  parseAccounts,
  parseClaimTime,
  pickServerOffsetSample,
};
