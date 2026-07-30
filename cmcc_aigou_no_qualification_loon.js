/*
中国移动爱购 - 购买资格恢复

仅处理 HAR 中控制购买按钮状态的资格接口：
checkQualificByActivityId/v3

正常响应特征：
- resultCode: 0
- msg: "success"
- data[].skuResultCode: 0
- data[].skuResultMsg: "success"

脚本不会修改商品价格、库存、订单或支付接口。JSON 解析失败时原样放行。
*/

(function () {
  var body =
    typeof $response !== "undefined" && $response ? $response.body : "";
  var url =
    typeof $request !== "undefined" && $request && $request.url
      ? String($request.url)
      : "";

  function queryValues(name) {
    var match = url.match(new RegExp("[?&]" + name + "=([^&#]*)"));
    if (!match) {
      return [];
    }

    try {
      return decodeURIComponent(match[1].replace(/\+/g, " "))
        .split(",")
        .filter(function (value) {
          return value !== "";
        });
    } catch (error) {
      return [];
    }
  }

  function normalizeSkuId(value) {
    return /^\d+$/.test(value) ? Number(value) : value;
  }

  try {
    var payload = JSON.parse(body);
    var rows = Array.isArray(payload.data) ? payload.data : [];

    if (rows.length === 0) {
      rows = queryValues("skuId").map(function (skuId) {
        return {
          skuId: normalizeSkuId(skuId),
          memberId: "0",
          provinceVip: null,
        };
      });
    }

    rows = rows.map(function (row) {
      var item = row && typeof row === "object" ? row : {};
      item.skuResultCode = 0;
      item.skuResultMsg = "success";
      return item;
    });

    payload.resultCode = 0;
    payload.msg = "success";
    payload.data = rows;

    $done({ body: JSON.stringify(payload) });
  } catch (error) {
    console.log("移动爱购购买资格恢复：响应不是有效 JSON，已原样放行");
    $done({});
  }
})();
