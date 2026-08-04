"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SCRIPT_PATH = path.join(__dirname, "zhaoshang_garden_checkin.js");
const PLUGIN_PATH = path.join(__dirname, "zhaoshang_garden_checkin.plugin");
const STORE_KEY = "ZS_GARDEN_ACCOUNTS_V1";
const SOURCE = fs.readFileSync(SCRIPT_PATH, "utf8");
const TOKEN_A = "a".repeat(32) + ",12345";
const TOKEN_B = "b".repeat(32) + ",12345";

function createStore(initialValue, canWrite = true) {
  let value = initialValue === undefined ? null : initialValue;
  return {
    api: {
      read(key) {
        assert.strictEqual(key, STORE_KEY);
        return value;
      },
      write(nextValue, key) {
        assert.strictEqual(key, STORE_KEY);
        if (!canWrite) return false;
        value = String(nextValue);
        return true;
      },
    },
    accounts() {
      return value ? JSON.parse(value) : [];
    },
    setAccounts(accounts) {
      value = JSON.stringify(accounts);
    },
  };
}

function runScript({ request, store, responder }) {
  const notifications = [];
  const requests = [];
  const logs = [];
  let doneCount = 0;
  let doneArgumentCount = -1;
  let doneValue;

  const sandbox = {
    $persistentStore: store.api,
    $notification: {
      post(title, subtitle, body, attach) {
        notifications.push({ title, subtitle, body, attach });
      },
    },
    $done(value) {
      doneCount += 1;
      doneArgumentCount = arguments.length;
      doneValue = value;
    },
    console: {
      log(message) {
        logs.push(String(message));
      },
    },
  };

  if (request !== undefined) sandbox.$request = request;
  if (responder) {
    sandbox.$httpClient = {
      post(params, callback) {
        requests.push(params);
        responder(params, callback);
      },
    };
  }

  vm.runInNewContext(SOURCE, sandbox, { filename: SCRIPT_PATH });
  assert.strictEqual(doneCount, 1, "script must call $done exactly once");
  return { doneArgumentCount, doneValue, logs, notifications, requests };
}

function encodeApiBody(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function decodeApiBody(value) {
  return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
}

function reply(callback, value, options = {}) {
  const response = options.useStatusCode
    ? { statusCode: options.status || 200 }
    : { status: options.status || 200 };
  const body = options.plainJson ? JSON.stringify(value) : encodeApiBody(value);
  callback(null, response, body);
}

function capture(store, token = TOKEN_A, options = {}) {
  const payload = {
    MallID: 1001,
    Header: {
      Token: token,
      systemInfo: {
        model: "iPhone",
        SDKVersion: "3.17.0",
        system: "iOS 18.0",
        version: "8.0.75",
        miniVersion: "1.0.140",
      },
    },
  };
  const encoded = encodeApiBody(payload);
  return runScript({
    request: {
      url: "https://m-bms.cmsk1979.com/api/user/user/GetUserAndMallCard",
      body: options.quoted ? JSON.stringify(encoded) : encoded,
    },
    store,
  });
}

function setAuthFailures(store, count) {
  const accounts = store.accounts();
  assert.strictEqual(accounts.length, 1);
  accounts[0].authFailures = count;
  store.setAccounts(accounts);
}

function testCaptureAndDeduplication() {
  const store = createStore();
  const first = capture(store);
  assert.strictEqual(JSON.stringify(first.doneValue), "{}");
  assert.strictEqual(first.doneArgumentCount, 1, "http-request capture must call $done({})");
  assert.strictEqual(store.accounts().length, 1);
  assert.strictEqual(store.accounts()[0].token, TOKEN_A);
  assert.ok(!store.accounts()[0].id.includes("12345"), "account id must not expose token suffix");
  assert.ok(!JSON.stringify(first.notifications).includes(TOKEN_A));
  assert.ok(!JSON.stringify(first.notifications).includes("12345"));

  const previousId = store.accounts()[0].id;
  const second = capture(store, TOKEN_B, { quoted: true });
  assert.strictEqual(store.accounts().length, 1, "rotated token with the same account suffix must replace the old record");
  assert.strictEqual(store.accounts()[0].id, previousId);
  assert.strictEqual(store.accounts()[0].token, TOKEN_B);
  assert.strictEqual(second.notifications[0].subtitle, "账号已更新");
}

function testSuccessfulCheckin() {
  const store = createStore();
  capture(store);
  setAuthFailures(store, 1);

  const result = runScript({
    store,
    responder(params, callback) {
      const pathname = new URL(params.url).pathname;
      if (pathname.endsWith("/CheckinBefore")) {
        reply(callback, {
          m: 1,
          d: {
            Mobile: "13800138000",
            IsCheckIn: false,
            IsOpenCheckin: true,
            IsOpenCheckinForPosition: false,
          },
        });
      } else if (pathname.endsWith("/CheckinV2")) {
        reply(callback, {
          m: 1,
          d: {
            Mobile: "13800138000",
            IsCheckIn: true,
            Msg: "签到成功",
            RewardType: 1,
            Content: "5",
            Desc: "24小时内发放",
          },
        });
      } else if (pathname.endsWith("/GetUserAndMallCard")) {
        reply(callback, { m: 1, d: { Mobile: "13800138000", Bonus: 88 } }, { plainJson: true, useStatusCode: true });
      } else {
        assert.fail("unexpected endpoint: " + pathname);
      }
    },
  });

  assert.strictEqual(result.requests.length, 3);
  assert.deepStrictEqual(
    result.requests.map((item) => new URL(item.url).pathname),
    [
      "/api/user/user/CheckinBefore",
      "/api/user/User/CheckinV2",
      "/api/user/user/GetUserAndMallCard",
    ]
  );
  assert.strictEqual(result.requests[0].timeout, 12000);
  assert.strictEqual(result.requests[0]["auto-cookie"], false);
  assert.ok(!Object.prototype.hasOwnProperty.call(result.requests[0].headers, "Host"));
  assert.strictEqual(decodeApiBody(result.requests[0].body).MallId, 1001);
  assert.strictEqual(decodeApiBody(result.requests[1].body).MallID, 1001);
  assert.strictEqual(decodeApiBody(result.requests[1].body).Header.Token, TOKEN_A);

  const notice = result.notifications[result.notifications.length - 1];
  assert.strictEqual(result.doneArgumentCount, 0, "cron/generic execution must call zero-argument $done()");
  assert.strictEqual(notice.subtitle, "执行完成（成功1，失败0）");
  assert.ok(notice.body.includes("138****8000：签到成功"));
  assert.ok(notice.body.includes("本次签到奖励：5荟豆"));
  assert.ok(notice.body.includes("当前积分：88荟豆"));
  assert.ok(notice.body.includes("发放说明：24小时内发放"));
  assert.ok(!notice.body.includes("13800138000"));
  assert.strictEqual(store.accounts()[0].authFailures, 0);
}

function testAlreadySignedAndBalance() {
  const store = createStore();
  capture(store);

  const result = runScript({
    store,
    responder(params, callback) {
      const pathname = new URL(params.url).pathname;
      if (pathname.endsWith("/CheckinBefore")) {
        reply(callback, { m: 1, d: { IsCheckIn: true, IsOpenCheckin: true } });
      } else if (pathname.endsWith("/GetUserAndMallCard")) {
        reply(callback, { m: 1, d: { Bonus: 91 } });
      } else {
        assert.fail("unexpected endpoint: " + pathname);
      }
    },
  });

  assert.deepStrictEqual(
    result.requests.map((item) => new URL(item.url).pathname),
    ["/api/user/user/CheckinBefore", "/api/user/user/GetUserAndMallCard"]
  );
  assert.strictEqual(result.doneArgumentCount, 0, "cron/generic execution must call zero-argument $done()");
  const notice = result.notifications[result.notifications.length - 1];
  assert.strictEqual(notice.subtitle, "执行完成（成功1，失败0）");
  assert.ok(notice.body.includes("今日已签到"));
  assert.ok(notice.body.includes("当前积分：91荟豆"));
}

function testAlreadySignedStillNotifiesWhenBalanceFails() {
  const store = createStore();
  capture(store);

  const result = runScript({
    store,
    responder(params, callback) {
      const pathname = new URL(params.url).pathname;
      if (pathname.endsWith("/CheckinBefore")) {
        reply(callback, { m: 1, d: { IsCheckIn: true, IsOpenCheckin: true } });
      } else if (pathname.endsWith("/GetUserAndMallCard")) {
        callback("network offline");
      } else {
        assert.fail("unexpected endpoint: " + pathname);
      }
    },
  });

  assert.deepStrictEqual(
    result.requests.map((item) => new URL(item.url).pathname),
    ["/api/user/user/CheckinBefore", "/api/user/user/GetUserAndMallCard"]
  );
  const notice = result.notifications[result.notifications.length - 1];
  assert.strictEqual(notice.subtitle, "执行完成（成功1，失败0）");
  assert.ok(notice.body.includes("今日已签到"));
  assert.ok(notice.body.includes("当前积分：查询失败"));
}

function testConsecutiveAuthFailureCleanup() {
  const store = createStore();
  capture(store);
  setAuthFailures(store, 1);

  runScript({
    store,
    responder(params, callback) {
      assert.ok(params.url.endsWith("/CheckinBefore"));
      reply(callback, { m: 1, d: { IsCheckIn: false, IsOpenCheckin: false } });
    },
  });
  assert.strictEqual(store.accounts()[0].authFailures, 0, "authenticated business response must reset old failures");

  runScript({
    store,
    responder(params, callback) {
      reply(callback, { m: 0, d: { Msg: "Token已失效" } });
    },
  });
  assert.strictEqual(store.accounts()[0].authFailures, 1);

  runScript({
    store,
    responder(params, callback) {
      callback("network offline");
    },
  });
  assert.strictEqual(store.accounts()[0].authFailures, 1, "temporary failure must not change auth failure count");

  runScript({
    store,
    responder(params, callback) {
      callback(null, { status: 401 }, "");
    },
  });
  assert.strictEqual(store.accounts().length, 0, "second confirmed auth failure must remove the account");
}

function testOptionalBalanceFailureDoesNotInvalidateSuccessfulSign() {
  const store = createStore();
  capture(store);
  setAuthFailures(store, 1);

  const result = runScript({
    store,
    responder(params, callback) {
      const pathname = new URL(params.url).pathname;
      if (pathname.endsWith("/CheckinBefore")) {
        reply(callback, { m: 1, d: { IsCheckIn: false, IsOpenCheckin: true, IsOpenCheckinForPosition: false } });
      } else if (pathname.endsWith("/CheckinV2")) {
        reply(callback, { m: 1, d: { IsCheckIn: true, Msg: "签到成功", RewardType: 1, Content: 2 } });
      } else if (pathname.endsWith("/GetUserAndMallCard")) {
        reply(callback, { m: 0, d: { Msg: "Token失效" } });
      } else {
        assert.fail("unexpected endpoint: " + pathname);
      }
    },
  });

  assert.strictEqual(store.accounts().length, 1);
  assert.strictEqual(store.accounts()[0].authFailures, 0);
  const notice = result.notifications[result.notifications.length - 1];
  assert.strictEqual(notice.subtitle, "执行完成（成功1，失败0）");
  assert.ok(notice.body.includes("当前积分：查询失败（鉴权异常）"));
}

function testStorageFailureAndInvalidCapture() {
  const store = createStore(undefined, false);
  const failed = capture(store);
  assert.strictEqual(failed.notifications[0].subtitle, "账号保存失败");
  assert.strictEqual(store.accounts().length, 0);

  const invalidStore = createStore();
  const invalid = runScript({
    request: {
      url: "https://m-bms.cmsk1979.com/api/user/user/GetUserAndMallCard",
      body: "not-base64!",
    },
    store: invalidStore,
  });
  assert.strictEqual(JSON.stringify(invalid.doneValue), "{}");
  assert.strictEqual(invalidStore.accounts().length, 0);
  assert.strictEqual(invalid.notifications.length, 0);
}

function testPluginConfiguration() {
  const plugin = fs.readFileSync(PLUGIN_PATH, "utf8");
  const rawUrl = "https://raw.githubusercontent.com/doosit/script/main/zhaoshang_garden_checkin.js?v=20260804-3";
  const scriptLines = plugin.split(/\r?\n/).filter((line) => /^(http-request|cron|generic) /.test(line));

  assert.strictEqual(scriptLines.length, 3);
  assert.ok(scriptLines.every((line) => line.includes("script-path=" + rawUrl)));
  assert.ok(plugin.includes('cron "5 7 * * *"'));
  assert.ok(plugin.includes('timeout=600,tag=招商花园每日签到'));
  assert.ok(plugin.includes('timeout=600,argument="manual=1",tag=招商花园手动签到'));
  assert.ok(plugin.includes("User\\/(?:CheckinV2|GetRewardList)"));
  assert.ok(!plugin.includes("SCRIPT_URL"));
}

testCaptureAndDeduplication();
testSuccessfulCheckin();
testAlreadySignedAndBalance();
testAlreadySignedStillNotifiesWhenBalanceFails();
testConsecutiveAuthFailureCleanup();
testOptionalBalanceFailureDoesNotInvalidateSuccessfulSign();
testStorageFailureAndInvalidCapture();
testPluginConfiguration();

console.log("zhaoshang_garden_checkin tests passed");
