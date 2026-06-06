'use strict';

const assert = require('assert');

const {
  buildClaimUrl,
  classifyClaimResult,
  computeTargetServerTimeMs,
  extractCookieValue,
  parseAccounts,
  parseClaimTime,
  pickServerOffsetSample,
} = require('./huazhuhui_upgrade_coupon_ql');

function run() {
  assert.deepStrictEqual(parseAccounts('a=1\nb=2&c=3@d=4'), [
    'a=1',
    'b=2',
    'c=3',
    'd=4',
  ]);

  assert.strictEqual(
    extractCookieValue('a=1; userToken=abc123; _hudVID=x', 'userToken'),
    'abc123'
  );
  assert.strictEqual(extractCookieValue('a=1', 'userToken'), '');

  assert.deepStrictEqual(parseClaimTime('10:00'), {
    hour: 10,
    minute: 0,
    second: 0,
    millisecond: 0,
  });
  assert.deepStrictEqual(parseClaimTime('09:59:59.250'), {
    hour: 9,
    minute: 59,
    second: 59,
    millisecond: 250,
  });

  assert.strictEqual(
    new Date(
      computeTargetServerTimeMs(Date.UTC(2026, 5, 6, 1, 59, 58), '10:00:00.000', 8, 300000)
    ).toISOString(),
    '2026-06-06T02:00:00.000Z'
  );
  assert.strictEqual(
    new Date(
      computeTargetServerTimeMs(Date.UTC(2026, 5, 6, 2, 6, 0), '10:00:00.000', 8, 300000)
    ).toISOString(),
    '2026-06-07T02:00:00.000Z'
  );

  const url = buildClaimUrl({
    baseUrl: 'https://newactivity.huazhu.com/campaign/template/sendPrize',
    objectClass: 'OCTYYLQ',
    prizeId: 'pid',
    userToken: 'token',
    moduleId: '148',
    flag: 'uuid',
    env: 'prd',
    appType: 'web',
    source: 'CMS活动_OCTYYLQ',
  });
  assert.ok(url.includes('objectClass=OCTYYLQ'));
  assert.ok(url.includes('id=pid'));
  assert.ok(url.includes('sk=token'));
  assert.ok(url.includes('source=CMS%E6%B4%BB%E5%8A%A8_OCTYYLQ'));

  assert.deepStrictEqual(
    classifyClaimResult(200, {
      businessCode: '1000',
      code: 200,
      data: { lastCount: 1, state: 1 },
      msg: 'success',
      success: true,
    }).type,
    'success'
  );
  assert.deepStrictEqual(
    classifyClaimResult(200, {
      businessCode: '1000',
      code: 200,
      data: { lastCount: 0, state: 4 },
      msg: 'success',
      success: true,
    }).type,
    'sold_out'
  );
  assert.deepStrictEqual(
    classifyClaimResult(429, {
      businessCode: '请求被限流',
      code: 200,
      msg: '50000',
      success: false,
    }).type,
    'retry'
  );

  assert.deepStrictEqual(
    pickServerOffsetSample(
      [
        { parsedDateMs: 100000, midpointMs: 100420, rttMs: 80, dateHeader: 'A' },
        { parsedDateMs: 101000, midpointMs: 101030, rttMs: 70, dateHeader: 'B' },
        { parsedDateMs: 101000, midpointMs: 101330, rttMs: 30, dateHeader: 'B' },
      ],
      500
    ),
    {
      offsetMs: 275,
      rttMs: 70,
      dateHeader: 'B',
      strategy: 'date-rollover-bracket',
      boundaryWindowMs: 610,
    }
  );

  assert.deepStrictEqual(
    pickServerOffsetSample(
      [
        { parsedDateMs: 100000, midpointMs: 100420, rttMs: 80, dateHeader: 'A' },
        { parsedDateMs: 100000, midpointMs: 100100, rttMs: 20, dateHeader: 'A' },
      ],
      500
    ),
    {
      offsetMs: 400,
      rttMs: 20,
      dateHeader: 'A',
      strategy: 'best-rtt-bias',
    }
  );
}

run();
console.log('huazhuhui_upgrade_coupon tests passed');
