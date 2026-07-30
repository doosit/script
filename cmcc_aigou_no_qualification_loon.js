/*
中国移动爱购 - 购买资格恢复

处理控制购买按钮状态的接口：
checkQualificByActivityId/v3
checkQualificByActivityId/v5
getProByActId

正常响应特征：
- resultCode: 0
- msg: "success"
- data[].skuResultCode: 0
- data[].skuResultMsg: "success"
- 目标活动商品 availableNum > 0
- 目标活动商品 joinStatus: 0

脚本仅恢复活动 17453、批次 37677、SKU 84631/84632/84633 的页面
可抢购状态，不会修改商品价格、订单或支付接口。JSON 解析失败时原样放行。
*/

(function () {
  var body =
    typeof $response !== "undefined" && $response ? $response.body : "";
  var url =
    typeof $request !== "undefined" && $request && $request.url
      ? String($request.url)
      : "";
  var targetSkuIds = {
    84631: true,
    84632: true,
    84633: true,
  };

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

  function restoreQualification(payload) {
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

    var versionMatch = url.match(/\/v(3|5)(?:\?|$)/);
    var version = versionMatch ? versionMatch[1] : "unknown";
    console.log(
      "移动爱购购买资格恢复：已命中 v" +
        version +
        "，恢复 " +
        rows.length +
        " 个 SKU"
    );
    return payload;
  }

  function restoreActivityStock(payload) {
    if (
      !payload ||
      !payload.data ||
      Number(payload.data.id) !== 17453 ||
      !Array.isArray(payload.data.subActivityList)
    ) {
      return 0;
    }

    var changed = 0;
    payload.data.subActivityList.forEach(function (activity) {
      if (
        !activity ||
        Number(activity.id) !== 37677 ||
        !Array.isArray(activity.goodsList)
      ) {
        return;
      }

      activity.goodsList.forEach(function (goods) {
        if (!goods || !targetSkuIds[Number(goods.skuid)]) {
          return;
        }
        goods.availableNum = 1;
        goods.joinStatus = 0;
        changed += 1;
      });
    });

    if (changed > 0) {
      console.log(
        "移动爱购抢购状态恢复：已恢复 " + changed + " 个话费券 SKU"
      );
    }
    return changed;
  }

  try {
    var payload = JSON.parse(body);

    if (/\/checkQualificByActivityId\/v(?:3|5)(?:\?|$)/.test(url)) {
      payload = restoreQualification(payload);
      $done({ body: JSON.stringify(payload) });
      return;
    }

    if (
      /\/arrange\/getProByActId(?:\?|$)/.test(url) &&
      restoreActivityStock(payload) > 0
    ) {
      $done({ body: JSON.stringify(payload) });
      return;
    }

    $done({});
  } catch (error) {
    console.log("移动爱购购买状态恢复：响应不是有效 JSON，已原样放行");
    $done({});
  }
})();
