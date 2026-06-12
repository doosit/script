const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = __dirname;
const SCRIPT_PATH = path.join(ROOT, "bhg_loon_capture.js");
const PLUGIN_PATH = path.join(ROOT, "bhg_mall.plugin");

function makeJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.signature`;
}

function runLoonScript({ request, response }) {
  const source = fs.readFileSync(SCRIPT_PATH, "utf8");
  const logs = [];
  const notifications = [];
  let doneValue = null;
  const sandbox = {
    $request: request,
    $response: response,
    $notification: {
      post(title, subtitle, body) {
        notifications.push({ title, subtitle, body });
      },
    },
    $done(value) {
      doneValue = value || {};
    },
    console: {
      log(message) {
        logs.push(String(message));
      },
    },
    URL,
    Buffer,
  };

  vm.runInNewContext(source, sandbox, { filename: SCRIPT_PATH });
  assert(doneValue, "script did not call $done");
  return { doneValue, logs, notifications };
}

assert(fs.existsSync(SCRIPT_PATH), "bhg_loon_capture.js should exist");
assert(fs.existsSync(PLUGIN_PATH), "bhg_mall.plugin should exist");

{
  const plugin = fs.readFileSync(PLUGIN_PATH, "utf8");
  assert(plugin.includes("#!name=BHG Mall 权鉴与领券抓取"));
  assert(plugin.includes("http-request"));
  assert(plugin.includes("http-response"));
  assert(plugin.includes("script-path=https://raw.githubusercontent.com/doosit/script/main/bhg_loon_capture.js"));
  assert(plugin.includes("requires-body=true"));
  assert(plugin.includes("hostname = rest.china-smartech.com, a.china-smartech.com"));
}

{
  const token = makeJwt({ sub: "member-001", mall_id: 9001, app_id: "wx-app" });
  const result = runLoonScript({
    request: {
      method: "POST",
      url: "https://rest.china-smartech.com/v3/api",
      headers: { authorization: token },
      body: JSON.stringify({ method: "member.info", params: {} }),
    },
  });

  const output = result.logs.join("\n");
  assert(output.includes(`BHG_ACCOUNTS=Bearer ${token}`));
  assert(output.includes("JWT_MEMBER_ID=member-001"));
  assert(output.includes("JWT_MALL_ID=9001"));
  assert(output.includes("JWT_APP_ID=wx-app"));
  assert.strictEqual(result.notifications.length, 1);
  assert.strictEqual(result.notifications[0].title, "BHG 权鉴已捕获");
}

{
  const token = `Bearer ${makeJwt({ sub: "member-002" })}`;
  const result = runLoonScript({
    request: {
      method: "POST",
      url: "https://a.china-smartech.com/restful/mall/888/items/221706/receive?from=miniapp",
      headers: { Authorization: token },
      body: JSON.stringify({ source: "停车券" }),
    },
    response: {
      body: JSON.stringify({ code: "400", msg: "您每日只能领取1张" }),
    },
  });

  const output = result.logs.join("\n");
  assert(output.includes("BHG_RECEIVE_CANDIDATES=REST:POST:/restful/mall/{mall_id}/items/{coupon_id}/receive?from=miniapp"));
  assert(output.includes("RESPONSE_MSG=您每日只能领取1张"));
  assert.strictEqual(result.notifications.length, 1);
  assert.strictEqual(result.notifications[0].title, "BHG 领券接口已识别");
}

{
  const result = runLoonScript({
    request: {
      method: "POST",
      url: "https://rest.china-smartech.com/v3/api",
      headers: {},
      body: JSON.stringify({ method: "activity.prize.take", params: {} }),
    },
    response: {
      body: "您每日只能领取1张",
    },
  });

  const output = result.logs.join("\n");
  assert(output.includes("BHG_RECEIVE_CANDIDATES=activity.prize.take:coupon_id"));
  assert(output.includes("RESPONSE_MSG=您每日只能领取1张"));
}

{
  const result = runLoonScript({
    request: {
      method: "GET",
      url: "https://rest.china-smartech.com/v3/api?ping=1",
      headers: {},
      body: "",
    },
  });

  assert.strictEqual(Object.keys(result.doneValue).length, 0);
  assert.strictEqual(result.logs.length, 0);
  assert.strictEqual(result.notifications.length, 0);
}

console.log("bhg_loon_capture_test.js passed");
