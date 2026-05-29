const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = __dirname;
const HAR_PATH = "/Users/satan/Downloads/StormSniffer-20260529-000352.har";
const NO_BUSINESS_HAR_PATH =
  "/Users/satan/Downloads/StormSniffer-20260529-004239.har";
const HIDDEN_CONTINUE_HAR_PATH =
  "/Users/satan/Downloads/StormSniffer-20260529-121255.har";
const SCRIPT_PATH = path.join(ROOT, "cmcc_nr_no_precheck_loon.js");

function readHarEntry(pathPart, harPath = HAR_PATH) {
  const har = JSON.parse(fs.readFileSync(harPath, "utf8"));
  const entry = (har.log.entries || []).find((item) =>
    String(item.request && item.request.url).includes(pathPart)
  );
  assert(entry, `HAR entry not found: ${pathPart}`);
  return {
    url: entry.request.url,
    body: entry.response.content.text,
    cipher: JSON.parse(entry.response.content.text).body,
  };
}

function readHarEntries(harPath) {
  const har = JSON.parse(fs.readFileSync(harPath, "utf8"));
  return har.log.entries || [];
}

function runLoonScript(url, body, store, headers = {}) {
  const source = fs.readFileSync(SCRIPT_PATH, "utf8");
  let doneValue = null;
  const sandbox = {
    $request: { url },
    $response: { body, headers },
    $persistentStore: {
      read(key) {
        return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
      },
      write(value, key) {
        store[key] = value;
        return true;
      },
    },
    $done(value) {
      doneValue = value || {};
    },
    console,
  };
  vm.runInNewContext(source, sandbox, { filename: SCRIPT_PATH });
  assert(doneValue, "script did not call $done");
  return doneValue;
}

function assertReplacedWithLearnedSuccess(pathPart) {
  const store = {};
  const success = readHarEntry("/nrpromotion/atom/courtesy/hcByNorm");
  const target = readHarEntry(pathPart);

  const learnResult = runLoonScript(success.url, success.body, store);
  assert.strictEqual(learnResult.body, success.body);
  assert.strictEqual(store.cmcc_nr_success_cipher, success.cipher);

  const rewriteResult = runLoonScript(target.url, target.body, store);
  const rewritten = JSON.parse(rewriteResult.body);
  assert.strictEqual(rewritten.body, success.cipher);
  assert.notStrictEqual(rewritten.body, target.cipher);
}

assertReplacedWithLearnedSuccess("/nrmix/preCheck/productPreCheck");
assertReplacedWithLearnedSuccess("/nropportunity/atom/failedOrder/check");

{
  const target = readHarEntry("/nrzone/tczq/checkAgreement");
  const blockedBody = JSON.stringify({ body: "X".repeat(64) });
  const rewriteResult = runLoonScript(target.url, blockedBody, {});
  const rewritten = JSON.parse(rewriteResult.body);
  assert.strictEqual(
    rewritten.body,
    "JddRWDcJFqmaCqlqHuounSIqXFQq23U4Li9Kj55nR3KEGSZzacxGO_XgNzD6dUCbsYyT6KjQuZ9iE7-3ZzBOQqaWNrMwLU6Wk0vq0TvqMvaAbfo9_yjxVzF1hhp4eNVygv2wu-wrjqK4NRb6ve3EeA=="
  );
}

{
  const oldAgreement = readHarEntry("/nrzone/tczq/checkAgreement", HAR_PATH);
  const newAgreement = readHarEntry(
    "/nrzone/tczq/checkAgreement",
    HIDDEN_CONTINUE_HAR_PATH
  );
  assert.strictEqual(
    newAgreement.cipher,
    oldAgreement.cipher,
    "latest HAR should still carry the known checkAgreement pass cipher"
  );
}

{
  if (fs.existsSync(NO_BUSINESS_HAR_PATH)) {
    const businessEntries = readHarEntries(NO_BUSINESS_HAR_PATH).filter((entry) =>
      String(entry.request && entry.request.url).includes(
        "wx.10086.cn/website/nrapigate"
      )
    );
    assert.strictEqual(
      businessEntries.length,
      0,
      "new HAR should document that no nrapigate business call was captured"
    );
  }
}

{
  const html =
    '<!doctype html><html><body><div style="display:none"><button disabled aria-disabled="true">继续办理</button></div></body></html>';
  const result = runLoonScript(
    "https://wx.10086.cn/nr/index.html",
    html,
    {},
    { "Content-Type": "text/html; charset=utf-8" }
  );
  assert.notStrictEqual(result.body, html);
  assert(result.body.includes("__CMCC_NR_CONTINUE_RESTORE__"));
  assert(result.body.includes("继续办理"));
}

{
  const js = "window.__cmccDemo = true;";
  const result = runLoonScript(
    "https://wx.10086.cn/static/app.js",
    js,
    {},
    { "content-type": "application/javascript" }
  );
  assert.notStrictEqual(result.body, js);
  assert(result.body.includes("__CMCC_NR_CONTINUE_RESTORE__"));
}

{
  const html =
    '<!doctype html><html><body><button style="display:none">确认办理</button></body></html>';
  const result = runLoonScript(
    "https://ha-cmim.cmcc-cs.cn:12501/page/index.html",
    html,
    {},
    { "Content-Type": "text/html" }
  );
  assert.notStrictEqual(result.body, html);
  assert(result.body.includes("__CMCC_NR_CONTINUE_RESTORE__"));
}

{
  const html =
    '<!doctype html><html><body><ul><li class="hidden" style="display:none">智慧爱家成员资费</li></ul></body></html>';
  const result = runLoonScript(
    "https://wx.10086.cn/nr/package.html",
    html,
    {},
    { "Content-Type": "text/html" }
  );
  assert.notStrictEqual(result.body, html);
  assert(result.body.includes('"智慧爱家成员资费"'));
}

console.log("cmcc_nr_no_precheck_test passed");
