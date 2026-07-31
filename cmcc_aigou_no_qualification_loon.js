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
- 目标日期批次 activityStatus: 1
- 详情页批次 startTime <= 当前时间 < endTime

脚本根据活动名称与商品名称识别幸运三日签话费券，不依赖固定活动 ID、
批次 ID 或 SKU ID。仅在指定批次的详情请求中保护活动时间窗，列表中的
真实日期不变。不会修改商品价格、订单或支付接口。JSON 解析失败时原样放行。
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

  function isDetailBatchRequest() {
    var batchIds = queryValues("batchId");
    return (
      batchIds.length > 0 &&
      batchIds[0] !== "0" &&
      (queryValues("action")[0] === "goodinfo" ||
        queryValues("mid").length > 0)
    );
  }

  function isTargetActivity(data) {
    var name = data && data.name != null ? String(data.name) : "";
    return name.indexOf("幸运三日签") !== -1 && Number(data.subType) === 12;
  }

  function isTargetGoods(goods) {
    if (!goods || typeof goods !== "object") {
      return false;
    }
    var name = [
      goods.name,
      goods.midName,
      goods.showName,
      goods.rightTypeRemark,
    ]
      .filter(function (value) {
        return value != null;
      })
      .join(" ");
    return /(?:66|88|100)元话费兑换券/.test(name);
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

  function restoreActivityState(payload) {
    if (
      !payload ||
      !payload.data ||
      !isTargetActivity(payload.data) ||
      !Array.isArray(payload.data.subActivityList)
    ) {
      return { changed: 0, batches: 0, goods: 0 };
    }

    var changed = 0;
    var batches = 0;
    var goodsCount = 0;
    var timeWindows = 0;
    var protectTimeWindow = isDetailBatchRequest();
    var now = Date.now();
    payload.data.subActivityList.forEach(function (activity) {
      if (!activity || !Array.isArray(activity.goodsList)) {
        return;
      }

      var targetGoods = activity.goodsList.filter(isTargetGoods);
      if (targetGoods.length === 0) {
        return;
      }

      batches += 1;
      if (Number(activity.activityStatus) !== 1) {
        activity.activityStatus = 1;
        changed += 1;
      }

      if (protectTimeWindow) {
        if (
          !isFinite(Number(activity.startTime)) ||
          Number(activity.startTime) > now
        ) {
          activity.startTime = now - 1000;
          changed += 1;
          timeWindows += 1;
        }
        if (
          !isFinite(Number(activity.endTime)) ||
          Number(activity.endTime) <= now
        ) {
          activity.endTime = now + 86400000;
          changed += 1;
          timeWindows += 1;
        }
      }

      targetGoods.forEach(function (goods) {
        goodsCount += 1;
        if (!isFinite(Number(goods.availableNum)) || Number(goods.availableNum) <= 0) {
          goods.availableNum = 1;
          changed += 1;
        }
        if (Number(goods.joinStatus) !== 0) {
          goods.joinStatus = 0;
          changed += 1;
        }
      });
    });

    if (changed > 0) {
      console.log(
        "移动爱购日期状态自适应：已处理 " +
          batches +
          " 个日期批次、" +
          goodsCount +
          " 个话费券 SKU、" +
          timeWindows +
          " 个详情时间边界"
      );
    }
    return {
      changed: changed,
      batches: batches,
      goods: goodsCount,
      timeWindows: timeWindows,
    };
  }

  try {
    var payload = JSON.parse(body);

    if (/\/checkQualificByActivityId\/v(?:3|5)(?:\?|$)/.test(url)) {
      payload = restoreQualification(payload);
      $done({ body: JSON.stringify(payload) });
      return;
    }

    if (/\/arrange\/getProByActId(?:\?|$)/.test(url)) {
      var activityResult = restoreActivityState(payload);
      if (activityResult.changed > 0) {
        $done({ body: JSON.stringify(payload) });
        return;
      }
    }

    $done({});
  } catch (error) {
    console.log("移动爱购购买状态恢复：响应不是有效 JSON，已原样放行");
    $done({});
  }
})();
