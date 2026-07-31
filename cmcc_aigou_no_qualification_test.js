const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SCRIPT_PATH = path.join(
  __dirname,
  "cmcc_aigou_no_qualification_loon.js"
);
const TARGET_URL =
  "https://dev.coc.10086.cn/coc3/coc3-market-activity/arrange/checkQualificByActivityId/v3?activityId=17453&skuId=84632";
const V5_TARGET_URL =
  "https://dev.coc.10086.cn/coc3/coc3-market-activity/arrange/checkQualificByActivityId/v5?activityId=17453&skuId=84632";
const STOCK_TARGET_URL =
  "https://dev.coc.10086.cn/coc3/coc3-market-activity/arrange/getProByActId?activityId=20000&batchId=0";
const DETAIL_TARGET_URL =
  "https://dev.coc.10086.cn/coc3/coc3-market-activity/arrange/getProByActId?activityId=20000&batchId=50002&mid=22636&action=goodinfo";
const SERVER_TIME_URL =
  "https://dev.coc.10086.cn/coc3/coc3-market/api/order/getCurrentTime.do";
const DETAIL_PAGE_URL =
  "https://dev.coc.10086.cn/coc3/canvas/rightsmarket-h5-canvas/online/detail5?mid=1916&aBatchId=37678&aid=17453";
const DETAIL_LAYOUT_URL =
  "https://res.coc.10086.cn/res/cdn/coc1/fixedPath/production.rightsmarket-h5-canvas.online.layout.detail5.json";
const TARGET_LAYOUT_URL =
  "https://res.coc.10086.cn/res/cdn/coc1/fixedPath/production.rightsmarket-h5-canvas.online.layout.adaptive-page.json";

function createPersistentStore() {
  const values = new Map();
  return {
    read(key) {
      return values.has(key) ? values.get(key) : null;
    },
    write(value, key) {
      values.set(key, String(value));
      return true;
    },
  };
}

function runLoonScript(
  body,
  url = TARGET_URL,
  persistentStore = createPersistentStore()
) {
  const source = fs.readFileSync(SCRIPT_PATH, "utf8");
  let doneValue = null;
  const sandbox = {
    $request: { url },
    $response: { body },
    $done(value) {
      doneValue = value || {};
    },
    console,
    decodeURIComponent,
    $persistentStore: persistentStore,
  };

  vm.runInNewContext(source, sandbox, { filename: SCRIPT_PATH });
  assert(doneValue, "script did not call $done");
  return doneValue;
}

function runLoonRequest(url, headers) {
  const source = fs.readFileSync(SCRIPT_PATH, "utf8");
  let doneValue = null;
  const sandbox = {
    $request: { url, headers },
    $done(value) {
      doneValue = value || {};
    },
    console,
    decodeURIComponent,
  };

  vm.runInNewContext(source, sandbox, { filename: SCRIPT_PATH });
  assert(doneValue, "request script did not call $done");
  return doneValue;
}

{
  const blocked = JSON.stringify({
    resultCode: -1,
    msg: "not qualified",
    data: [
      {
        skuId: 84632,
        skuResultCode: -61001,
        skuResultMsg: "not qualified",
        memberId: "123",
        provinceVip: { level: 2 },
      },
    ],
  });
  const result = JSON.parse(runLoonScript(blocked).body);

  assert.strictEqual(result.resultCode, 0);
  assert.strictEqual(result.msg, "success");
  assert.strictEqual(result.data[0].skuResultCode, 0);
  assert.strictEqual(result.data[0].skuResultMsg, "success");
  assert.strictEqual(result.data[0].memberId, "123");
  assert.deepStrictEqual(result.data[0].provinceVip, { level: 2 });
}

{
  const result = JSON.parse(
    runLoonScript(
      JSON.stringify({ resultCode: -1, msg: "blocked", data: null })
    ).body
  );

  assert.deepStrictEqual(result.data, [
    {
      skuId: 84632,
      memberId: "0",
      provinceVip: null,
      skuResultCode: 0,
      skuResultMsg: "success",
    },
  ]);
}

{
  const result = JSON.parse(
    runLoonScript(
      JSON.stringify({
        resultCode: -1,
        msg: "blocked",
        data: [
          { skuId: 1, skuResultCode: 1 },
          { skuId: 2, skuResultCode: 2 },
        ],
      })
    ).body
  );

  assert.deepStrictEqual(
    result.data.map((item) => item.skuResultCode),
    [0, 0]
  );
}

{
  const result = JSON.parse(
    runLoonScript(
      JSON.stringify({
        resultCode: -18100,
        msg: "not qualified",
        data: [{ skuId: 84632, skuResultCode: -18112 }],
      }),
      V5_TARGET_URL
    ).body
  );

  assert.strictEqual(result.resultCode, 0);
  assert.strictEqual(result.data[0].skuResultCode, 0);
  assert.strictEqual(result.data[0].skuResultMsg, "success");
}

{
  const result = JSON.parse(
    runLoonScript(
      JSON.stringify({
        code: "0",
        data: {
          id: 20000,
          name: "幸运三日签累签秒杀话费券",
          subType: 12,
          subActivityList: [
            {
              id: 50001,
              activityStatus: 1,
              goodsList: [
                {
                  skuid: 90001,
                  name: "66元话费兑换券",
                  availableNum: 0,
                  joinStatus: 3,
                  price: 0,
                },
                {
                  skuid: 99999,
                  name: "其他商品",
                  availableNum: 0,
                  joinStatus: 3,
                  price: 100,
                },
              ],
            },
            {
              id: 50002,
              activityStatus: 0,
              startTime: 4102444800000,
              endTime: 4102531200000,
              goodsList: [
                {
                  skuid: 90002,
                  name: "88元话费兑换券",
                  availableNum: 3,
                  joinStatus: 0,
                  price: 0,
                },
              ],
            },
            {
              id: 50003,
              activityStatus: 0,
              goodsList: [
                {
                  skuid: 90003,
                  name: "100元话费兑换券",
                  availableNum: 5,
                  joinStatus: 0,
                  price: 0,
                },
              ],
            },
          ],
        },
      }),
      STOCK_TARGET_URL
    ).body
  );

  assert.strictEqual(result.data.subActivityList[0].activityStatus, 1);
  assert.strictEqual(result.data.subActivityList[0].goodsList[0].availableNum, 1);
  assert.strictEqual(result.data.subActivityList[0].goodsList[0].joinStatus, 0);
  assert.strictEqual(
    result.data.subActivityList[0].goodsList[0]._cmccOriginalAvailableNum,
    0
  );
  assert.strictEqual(
    result.data.subActivityList[0].goodsList[0]._cmccOriginalJoinStatus,
    3
  );
  assert.strictEqual(result.data.subActivityList[0].goodsList[1].availableNum, 0);
  assert.strictEqual(result.data.subActivityList[0].goodsList[1].joinStatus, 3);
  assert.strictEqual(result.data.subActivityList[0].goodsList[1].price, 100);
  assert.strictEqual(result.data.subActivityList[1].activityStatus, 1);
  assert.strictEqual(result.data.subActivityList[1].startTime, 4102444800000);
  assert.strictEqual(result.data.subActivityList[1].endTime, 4102531200000);
  assert.strictEqual(result.data.subActivityList[1].goodsList[0].availableNum, 3);
  assert.strictEqual(result.data.subActivityList[1].goodsList[0].joinStatus, 0);
  assert.strictEqual(result.data.subActivityList[2].activityStatus, 1);
  assert.strictEqual(result.data.subActivityList[2].goodsList[0].availableNum, 5);
  assert.strictEqual(result.data.subActivityList[2].goodsList[0].joinStatus, 0);
}

{
  const result = JSON.parse(
    runLoonScript(
      JSON.stringify({
        code: "0",
        data: {
          id: 29999,
          name: "幸运三日签新面额",
          subType: 12,
          subActivityList: [
            {
              id: 70001,
              activityStatus: 0,
              goodsList: [
                {
                  skuid: 91001,
                  name: "50元话费券",
                  availableNum: 0,
                  joinStatus: 3,
                },
                {
                  skuid: 91002,
                  name: "50元礼品券",
                  availableNum: 0,
                  joinStatus: 3,
                },
              ],
            },
          ],
        },
      }),
      STOCK_TARGET_URL
    ).body
  );

  assert.strictEqual(result.data.subActivityList[0].goodsList[0].availableNum, 1);
  assert.strictEqual(result.data.subActivityList[0].goodsList[0].joinStatus, 0);
  assert.strictEqual(result.data.subActivityList[0].goodsList[1].availableNum, 0);
  assert.strictEqual(result.data.subActivityList[0].goodsList[1].joinStatus, 3);
}

{
  const futureStartTime = Date.now() + 3600000;
  const futureEndTime = Date.now() + 7200000;
  const result = JSON.parse(
    runLoonScript(
      JSON.stringify({
        code: "0",
        data: {
          id: 20000,
          name: "幸运三日签累签秒杀话费券",
          subType: 12,
          subActivityList: [
            {
              id: 50002,
              activityStatus: 0,
              startTime: futureStartTime,
              endTime: futureEndTime,
              goodsList: [
                {
                  skuid: 90002,
                  name: "88元话费兑换券",
                  availableNum: 3,
                  joinStatus: 0,
                },
              ],
            },
          ],
        },
      }),
      DETAIL_TARGET_URL
    ).body
  );

  assert.strictEqual(result.data.subActivityList[0].activityStatus, 1);
  assert(result.data.subActivityList[0].startTime <= Date.now());
  assert.strictEqual(
    result.data.subActivityList[0].endTime,
    futureEndTime
  );
}

{
  const expiredEndTime = Date.now() - 1000;
  const result = JSON.parse(
    runLoonScript(
      JSON.stringify({
        code: "0",
        data: {
          id: 20000,
          name: "幸运三日签累签秒杀话费券",
          subType: 12,
          subActivityList: [
            {
              id: 50002,
              activityStatus: 2,
              startTime: Date.now() - 7200000,
              endTime: expiredEndTime,
              goodsList: [
                {
                  skuid: 90002,
                  name: "88元话费兑换券",
                  availableNum: 0,
                  joinStatus: 3,
                },
              ],
            },
          ],
        },
      }),
      DETAIL_TARGET_URL
    ).body
  );

  assert.strictEqual(result.data.subActivityList[0].activityStatus, 1);
  assert(result.data.subActivityList[0].endTime > Date.now());
  assert.strictEqual(
    result.data.subActivityList[0].goodsList[0].availableNum,
    1
  );
  assert.strictEqual(result.data.subActivityList[0].goodsList[0].joinStatus, 0);
}

{
  const persistentStore = createPersistentStore();
  const serverTime = Date.now() + 10000;
  assert.strictEqual(
    Object.keys(
      runLoonScript(
        JSON.stringify({ resultCode: 0, msg: "success", data: serverTime }),
        SERVER_TIME_URL,
        persistentStore
      )
    ).length,
    0
  );

  const startTime = Date.now() + 5000;
  const endTime = Date.now() + 7200000;
  const result = JSON.parse(
    runLoonScript(
      JSON.stringify({
        code: "0",
        data: {
          id: 20000,
          name: "幸运三日签累签秒杀话费券",
          subType: 12,
          subActivityList: [
            {
              id: 50002,
              activityStatus: 0,
              startTime,
              endTime,
              goodsList: [
                {
                  skuid: 90002,
                  name: "88元话费兑换券",
                  availableNum: 3,
                  joinStatus: 0,
                },
              ],
            },
          ],
        },
      }),
      DETAIL_TARGET_URL,
      persistentStore
    ).body
  );

  assert.strictEqual(result.data.subActivityList[0].startTime, startTime);
  assert.strictEqual(result.data.subActivityList[0].endTime, endTime);
}

{
  const html =
    "<!doctype html><html><head><script src=\"app.js\"></script></head>" +
    "<body><div id=\"app\"></div></body></html>";
  const result = runLoonScript(html, DETAIL_PAGE_URL);
  assert(result.body.includes("data-cmcc-aigou-popup-fix"));
  assert(result.body.includes("(?:活动|业务).{0,4}太火爆"));
  assert(result.body.includes("/coc3-market/api/sms/qwSendSmsCode"));
  assert(result.body.includes("购买验证码未发送"));
  assert(result.body.includes("releaseSmsButton"));
  assert(result.body.includes("activityHotTips=0"));
  assert(result.body.includes("canvasworkbenchweb_auth"));
  assert(result.body.includes("patchBusyToast"));
  assert(result.body.includes("接口库存 / 页面库存"));
  assert(result.body.includes("__cmccAigouRenderInventory"));
  assert(
    result.body.indexOf("data-cmcc-aigou-popup-fix") <
      result.body.indexOf('src="app.js"')
  );
  const inlineSource = result.body.match(
    /<script data-cmcc-aigou-popup-fix="1">([\s\S]*?)<\/script>/
  );
  assert(inlineSource, "injected browser script was not found");
  new vm.Script(inlineSource[1]);

  class FakeStorage {
    constructor(initial = {}) {
      this.values = new Map(Object.entries(initial));
    }
    getItem(key) {
      return this.values.has(key) ? this.values.get(key) : null;
    }
    setItem(key, value) {
      this.values.set(key, String(value));
    }
  }

  const storedPageInfo = JSON.stringify({
    page_info: JSON.stringify({
      activityHotTips: 1,
      name: "幸运三日签",
    }),
  });
  const sessionStorage = new FakeStorage({
    canvasworkbenchweb_auth: storedPageInfo,
  });
  const localStorage = new FakeStorage();
  const toastCalls = [];
  const originalToast = function (options) {
    toastCalls.push(options);
  };
  originalToast.clear = function () {};
  const browserWindow = {
    sessionStorage,
    localStorage,
    $utils: { toast: originalToast },
  };
  function createFakeElement() {
    const element = {
      children: [],
      style: {},
      appendChild(child) {
        this.children.push(child);
        return child;
      },
      removeChild(child) {
        const index = this.children.indexOf(child);
        if (index !== -1) {
          this.children.splice(index, 1);
        }
        return child;
      },
      addEventListener() {},
      remove() {},
      querySelectorAll() {
        return [];
      },
    };
    Object.defineProperty(element, "firstChild", {
      get() {
        return this.children[0] || null;
      },
    });
    return element;
  }
  const fakeBody = createFakeElement();
  function FakeXhr() {}
  FakeXhr.prototype.open = function () {};
  const browserSandbox = {
    window: browserWindow,
    Storage: FakeStorage,
    XMLHttpRequest: FakeXhr,
    MutationObserver: function () {
      this.observe = function () {};
    },
    document: {
      body: fakeBody,
      documentElement: {},
      getElementById() {
        return null;
      },
      createElement() {
        return createFakeElement();
      },
      querySelectorAll() {
        return [];
      },
    },
    setTimeout(callback, delay) {
      if (delay === 0) {
        callback();
      }
      return 1;
    },
    setInterval() {
      return 1;
    },
    clearInterval() {},
  };
  vm.runInNewContext(inlineSource[1], browserSandbox);

  browserWindow.__cmccAigouRenderInventory({
    data: {
      subActivityList: [
        {
          id: 70001,
          startTime: Date.now() - 1000,
          endTime: Date.now() + 60000,
          goodsList: [
            {
              skuid: 91001,
              name: "50元话费券",
              availableNum: 1,
              _cmccOriginalAvailableNum: 0,
            },
            {
              skuid: 91002,
              name: "100元话费兑换券",
              availableNum: 5,
              _cmccOriginalAvailableNum: 5,
            },
          ],
        },
      ],
    },
  });
  assert.strictEqual(browserWindow.__cmccAigouInventorySnapshot.length, 2);
  assert.strictEqual(
    browserWindow.__cmccAigouInventorySnapshot[0].original,
    0
  );
  assert.strictEqual(
    browserWindow.__cmccAigouInventorySnapshot[0].effective,
    1
  );
  assert.strictEqual(
    browserWindow.__cmccAigouInventorySnapshot[1].original,
    5
  );
  assert.strictEqual(fakeBody.children.length, 1);
  assert.strictEqual(fakeBody.children[0].children[0].textContent, "库存 5 · 2款");
  assert.strictEqual(
    fakeBody.children[0].children[1].children[0].textContent,
    "接口库存 / 页面库存"
  );

  let stored = JSON.parse(
    sessionStorage.getItem("canvasworkbenchweb_auth")
  );
  assert.strictEqual(JSON.parse(stored.page_info).activityHotTips, 0);
  sessionStorage.setItem("canvasworkbenchweb_auth", storedPageInfo);
  stored = JSON.parse(sessionStorage.getItem("canvasworkbenchweb_auth"));
  assert.strictEqual(JSON.parse(stored.page_info).activityHotTips, 0);

  browserWindow.$utils.toast({
    message: "活动太火爆啦，请稍后重试~",
  });
  assert.strictEqual(toastCalls.length, 0);
  browserWindow.$utils.toast({ message: "真实错误" });
  assert.strictEqual(toastCalls.length, 1);
  assert.strictEqual(toastCalls[0].message, "真实错误");

  assert.strictEqual(
    Object.keys(runLoonScript(result.body, DETAIL_PAGE_URL)).length,
    0
  );
}

{
  const html = "<!doctype html><html><body><div id=\"app\"></div></body></html>";
  const result = runLoonScript(html, DETAIL_PAGE_URL);
  assert(
    result.body.indexOf("data-cmcc-aigou-popup-fix") <
      result.body.indexOf('id="app"')
  );
}

{
  const result = runLoonRequest(DETAIL_PAGE_URL, {
    Accept: "text/html",
    "If-None-Match": "\"cached-etag\"",
    "if-modified-since": "Wed, 29 Jul 2026 00:00:00 GMT",
  });

  assert.strictEqual(result.headers.Accept, "text/html");
  assert.strictEqual(result.headers["If-None-Match"], undefined);
  assert.strictEqual(result.headers["if-modified-since"], undefined);
  assert.strictEqual(result.headers["Cache-Control"], "no-cache");
  assert.strictEqual(result.headers.Pragma, "no-cache");
}

{
  const result = runLoonRequest(DETAIL_LAYOUT_URL, {
    Accept: "application/json",
    "If-None-Match": "\"cached-layout\"",
  });

  assert.strictEqual(result.headers.Accept, "application/json");
  assert.strictEqual(result.headers["If-None-Match"], undefined);
  assert.strictEqual(result.headers["Cache-Control"], "no-cache");
}

{
  const result = JSON.parse(
    runLoonScript(
      JSON.stringify({
        activityHotTips: 1,
        description: "商品详情",
      }),
      DETAIL_LAYOUT_URL
    ).body
  );
  assert.strictEqual(result.activityHotTips, 0);
}

{
  const result = JSON.parse(
    runLoonScript(
      JSON.stringify({
        activityHotTips: 1,
        instanceList: [
          {
            name: "幸运三日签累签秒杀话费券",
            activityId: 29999,
          },
        ],
      }),
      TARGET_LAYOUT_URL
    ).body
  );
  assert.strictEqual(result.activityHotTips, 0);
}

{
  const unrelated = JSON.stringify({
    activityHotTips: 1,
    instanceList: [{ name: "其他活动", activityId: 99999 }],
  });
  assert.strictEqual(
    Object.keys(runLoonScript(unrelated, TARGET_LAYOUT_URL)).length,
    0
  );
}

{
  const unrelated = JSON.stringify({
    code: "0",
    data: {
      id: 17297,
      name: "26世界杯好物专区返AI豆秒杀",
      subType: 11,
      subActivityList: [
        {
          id: 35975,
          activityStatus: 0,
          goodsList: [
            {
              skuid: 84632,
              name: "88元话费兑换券",
              availableNum: 0,
              joinStatus: 3,
            },
          ],
        },
      ],
    },
  });
  assert.strictEqual(
    Object.keys(runLoonScript(unrelated, STOCK_TARGET_URL)).length,
    0
  );
}

{
  const malformed = "{not-json";
  assert.strictEqual(Object.keys(runLoonScript(malformed)).length, 0);
}

console.log("cmcc_aigou_no_qualification tests passed");
