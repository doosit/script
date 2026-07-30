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
  const malformed = "{not-json";
  assert.strictEqual(Object.keys(runLoonScript(malformed)).length, 0);
}

console.log("cmcc_aigou_no_qualification tests passed");
