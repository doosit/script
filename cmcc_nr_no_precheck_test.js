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
const PACKAGE_LIST_HAR_PATH =
  "/Users/satan/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/passes_9787/temp/RWTemp/2026-05/c11c3dcf580a0a788e9ce5656dd2a8b3/apicatcher-export-20260529下午03027.har";
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

function readHarEntryByPredicate(harPath, predicate, label) {
  const entry = readHarEntries(harPath).find(predicate);
  assert(entry, `HAR entry not found: ${label}`);
  return {
    url: entry.request.url,
    body: entry.response.content.text,
    cipher: JSON.parse(entry.response.content.text).body,
  };
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

function extractInjectedScript(html) {
  const match = String(html).match(
    /<script>([\s\S]*__CMCC_NR_CONTINUE_RESTORE__[\s\S]*?)<\/script>/
  );
  assert(match, "injected script not found");
  return match[1];
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

{
  const html =
    '<!doctype html><html><body><div id="packages"></div></body></html>';
  const result = runLoonScript(
    "https://wx.10086.cn/nr/package.html",
    html,
    {},
    { "Content-Type": "text/html" }
  );
  const injected = extractInjectedScript(result.body);
  const sandbox = {
    window: {
      getComputedStyle() {
        return { display: "block" };
      },
    },
    document: {
      readyState: "complete",
      documentElement: {},
      querySelectorAll() {
        return [];
      },
      addEventListener() {},
    },
    MutationObserver: function MutationObserver() {
      this.observe = function observe() {};
    },
    setInterval() {},
  };
  vm.createContext(sandbox);
  vm.runInContext(injected, sandbox);
  const names = vm.runInContext(
    `[
      { name: "其他套餐", show: true },
      { name: "智慧爱家成员资费", show: false }
    ].filter(function (item) {
      return item.show;
    }).map(function (item) {
      return item.name;
    })`,
    sandbox
  );
  assert.strictEqual(
    JSON.stringify(names),
    JSON.stringify(["其他套餐", "智慧爱家成员资费"])
  );
}

{
  const html =
    '<!doctype html><html><body><div class="modal"><h2>套餐变更提醒</h2><p>智慧爱家成员资费</p><button class="disabled" aria-disabled="true">咨询专属客服</button></div></body></html>';
  const result = runLoonScript(
    "https://wx.10086.cn/nr/package.html",
    html,
    {},
    { "Content-Type": "text/html" }
  );
  const injected = extractInjectedScript(result.body);
  const button = {
    innerText: "咨询专属客服",
    textContent: "咨询专属客服",
    value: "",
    style: { setProperty(name, value) { this[name] = value; } },
    className: "disabled",
    classList: {
      remove(name) {
        if (name === "disabled") {
          button.className = "";
        }
      },
    },
    parentElement: null,
    removeAttribute(name) {
      delete this[name];
    },
    setAttribute(name, value) {
      this[name] = value;
    },
    addEventListener() {},
    querySelectorAll() {
      return [];
    },
  };
  const body = {
    innerText: "套餐变更提醒 智慧爱家成员资费 咨询专属客服",
    textContent: "套餐变更提醒 智慧爱家成员资费 咨询专属客服",
  };
  const sandbox = {
    window: {
      getComputedStyle() {
        return { display: "block" };
      },
    },
    document: {
      body,
      readyState: "complete",
      documentElement: body,
      querySelectorAll() {
        return [button];
      },
      addEventListener() {},
    },
    MutationObserver: function MutationObserver() {
      this.observe = function observe() {};
    },
    setInterval() {},
  };
  vm.createContext(sandbox);
  vm.runInContext(injected, sandbox);
  assert.strictEqual(button.textContent, "继续办理");
  assert.strictEqual(button["aria-disabled"], "false");
}

{
  const target = readHarEntryByPredicate(
    PACKAGE_LIST_HAR_PATH,
    (entry) =>
      String(entry.request && entry.request.url).includes(
        "/nrzone/contact/list"
      ) &&
      String(entry.response.content && entry.response.content.text).length >
        10000,
    "large contact/list"
  );
  const rewriteResult = runLoonScript(
    target.url,
    JSON.stringify({ body: "X".repeat(12000) }),
    {}
  );
  assert.strictEqual(rewriteResult.body, target.body);
}

{
  const target = readHarEntry(
    "/nrzone/contact/list",
    PACKAGE_LIST_HAR_PATH
  );
  const rewriteResult = runLoonScript(
    target.url,
    JSON.stringify({ body: "X".repeat(160) }),
    {}
  );
  assert.notStrictEqual(rewriteResult.body, target.body);
}

{
  const target = readHarEntry(
    "/nrzone/contact/waterFallInfo",
    PACKAGE_LIST_HAR_PATH
  );
  const rewriteResult = runLoonScript(
    target.url,
    JSON.stringify({ body: "X".repeat(160) }),
    {}
  );
  assert.strictEqual(rewriteResult.body, target.body);
}

console.log("cmcc_nr_no_precheck_test passed");
