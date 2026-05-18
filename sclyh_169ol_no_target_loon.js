/*
四川联通特惠 - 活动资格弹框限制重写

Loon 配置示例：

[Script]
http-response ^https:\/\/sclyh\.169ol\.com\/2b2c-mobile\/goods\/getGoodsDetailInfo(?:\?.*)?$ script-path=https://raw.githubusercontent.com/doosit/script/main/sclyh_169ol_no_target_loon.js,requires-body=true,timeout=10,tag=四川联通特惠资格,enable=true

[MITM]
hostname = sclyh.169ol.com
*/

(function () {
  var tag = "四川联通特惠资格";
  var body = $response.body;

  if (!body) {
    console.log("[" + tag + "] 响应体为空，跳过处理");
    $done({});
    return;
  }

  function ensureGoodsProductList(target) {
    if (!target || typeof target !== "object") {
      return false;
    }

    if (target.resultCode !== "0000") {
      return false;
    }

    if (!target.data || typeof target.data !== "object" || Array.isArray(target.data)) {
      target.data = {};
    }

    if (
      !Array.isArray(target.data.goodsProductList) ||
      target.data.goodsProductList.length === 0
    ) {
      target.data.goodsProductList = [{}];
      return true;
    }

    return false;
  }

  try {
    var data = JSON.parse(body);
    var changed = ensureGoodsProductList(data);

    console.log(
      "[" +
        tag +
        "] JSON 检查完成，" +
        (changed
          ? "已补齐 data.goodsProductList，活动资格弹框条件将放行"
          : "无需修改或非 0000 响应")
    );

    $done({ body: JSON.stringify(data) });
  } catch (error) {
    console.log("[" + tag + "] JSON 解析失败，保留原响应：" + String(error));
    $done({ body: body });
  }
})();
