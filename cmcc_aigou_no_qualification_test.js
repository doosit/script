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

function runLoonScript(body, url = TARGET_URL) {
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
  };

  vm.runInNewContext(source, sandbox, { filename: SCRIPT_PATH });
  assert(doneValue, "script did not call $done");
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
  assert.strictEqual(result.data.subActivityList[0].goodsList[1].availableNum, 0);
  assert.strictEqual(result.data.subActivityList[0].goodsList[1].joinStatus, 3);
  assert.strictEqual(result.data.subActivityList[0].goodsList[1].price, 100);
  assert.strictEqual(result.data.subActivityList[1].activityStatus, 1);
  assert.strictEqual(result.data.subActivityList[1].goodsList[0].availableNum, 3);
  assert.strictEqual(result.data.subActivityList[1].goodsList[0].joinStatus, 0);
  assert.strictEqual(result.data.subActivityList[2].activityStatus, 1);
  assert.strictEqual(result.data.subActivityList[2].goodsList[0].availableNum, 5);
  assert.strictEqual(result.data.subActivityList[2].goodsList[0].joinStatus, 0);
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
