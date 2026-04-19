/*
奈雪点单赠送开关 - Loon 脚本版

Loon 配置示例：

[Script]
http-response ^https:\/\/tm-api\.pin-dao\.cn\/coupon\/coupon\/getCouponList(?:\?.*)?$ script-path=https://raw.githubusercontent.com/doosit/script/main/naixue_support_give_loon.js,requires-body=true,timeout=10,tag=奈雪点单赠送开关,enable=true

[MITM]
hostname = tm-api.pin-dao.cn
*/

(function () {
  var tag = "奈雪点单赠送开关";
  var body = $response.body;

  if (!body) {
    console.log("[" + tag + "] 响应体为空，跳过处理");
    $done({});
    return;
  }

  function rewriteSupportGive(target) {
    var changed = false;

    function visit(value) {
      if (!value || typeof value !== "object") {
        return;
      }

      if (Array.isArray(value)) {
        for (var i = 0; i < value.length; i += 1) {
          visit(value[i]);
        }
        return;
      }

      for (var key in value) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) {
          continue;
        }

        if (key === "supportGive" && value[key] !== true) {
          value[key] = true;
          changed = true;
          continue;
        }

        visit(value[key]);
      }
    }

    visit(target);
    return changed;
  }

  try {
    var data = JSON.parse(body);
    var changed = rewriteSupportGive(data);
    var newBody = JSON.stringify(data);

    console.log(
      "[" +
        tag +
        "] JSON 重写完成，supportGive 已统一修正为 true，" +
        (changed ? "存在实际修改" : "原始值已是目标状态")
    );
    $done({ body: newBody });
  } catch (error) {
    var fallbackBody = body.replace(
      /"supportGive"\s*:\s*false/g,
      '"supportGive":true'
    );

    console.log(
      "[" +
        tag +
        "] JSON 解析失败，已回退为正则替换模式：" +
        String(error)
    );
    $done({ body: fallbackBody });
  }
})();
