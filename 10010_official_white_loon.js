/*
联通WIFI通话 - Loon 脚本版

Loon 配置示例：

[Script]
http-response ^https:\/\/m\.client\.10010\.com\/edopinterface\/officialWhite\/checkOfficialWhitePhone(?:\?.*)?$ script-path=https://raw.githubusercontent.com/doosit/script/main/10010_official_white_loon.js,requires-body=true,timeout=10,tag=联通WIFI通话,enable=true

[MITM]
hostname = m.client.10010.com
*/

(function () {
  var tag = "联通WIFI通话";
  var body = $response.body;

  if (!body) {
    console.log("[" + tag + "] 响应体为空，跳过处理");
    $done({});
    return;
  }

  function rewriteRespCode(target) {
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

        if (key === "respCode" && value[key] !== "0000") {
          value[key] = "0000";
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
    var changed = rewriteRespCode(data);
    var newBody = JSON.stringify(data);

    console.log(
      "[" +
        tag +
        "] JSON 重写完成，respCode 已统一修正为 0000，" +
        (changed ? "存在实际修改" : "原始值已是目标状态")
    );
    $done({ body: newBody });
  } catch (error) {
    var fallbackBody = body.replace(
      /"respCode"\s*:\s*"[^"]*"/g,
      '"respCode":"0000"'
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
