/*
 * 移动云盘会员日去蒙板，版本 20261016-2。
 * 由配套 .plugin 在活动 CSS 请求与响应阶段自动调用。
 * 只改变展示样式，不修改活动接口、资格、库存或抽奖次数。
 */

(function () {
  "use strict";

  var result = {};

  function log(message) {
    console.log("[云盘会员日去蒙板] " + message);
  }

  function copyHeaders(source, excluded) {
    var headers = {};

    Object.keys(source || {}).forEach(function (name) {
      if (excluded.indexOf(name.toLowerCase()) === -1) {
        headers[name] = source[name];
      }
    });

    return headers;
  }

  function rewrite() {
    var target =
      /^https:\/\/img\.mcloud\.139\.com\/portal\/cloudCircle\/public\/css\/mCloudDay\.[0-9a-f]+\.css(?:\?.*)?$/;

    if (
      typeof $request === "undefined" ||
      !$request ||
      typeof $request.url !== "string" ||
      !target.test($request.url)
    ) {
      log("未命中活动样式，保持原样");
      return {};
    }

    if (typeof $response === "undefined") {
      log("请求阶段：移除样式条件缓存头");
      return {
        headers: copyHeaders($request.headers, [
          "if-none-match",
          "if-modified-since",
        ]),
      };
    }

    if (!$response || Number($response.status) !== 200) {
      log("响应非 200，保持原样");
      return {};
    }

    var body = $response.body;
    var responseHeaders = $response.headers || {};
    var contentType = "";

    Object.keys(responseHeaders).forEach(function (name) {
      if (name.toLowerCase() === "content-type") {
        contentType = String(responseHeaders[name]);
      }
    });

    if (typeof body !== "string" || !/^text\/css(?:;|$)/i.test(contentType)) {
      log("未取得 CSS 正文，保持原样");
      return {};
    }

    var marker = "/* mcloud-memberday-unmask 20261016-2 */";

    if (body.indexOf(marker) !== -1) {
      log("已包含去蒙板样式，跳过重复追加");
      return {};
    }

    if (body.indexOf(".fansGift") === -1 && body.indexOf(".fansDraw") === -1) {
      log("活动样式结构已变化，保持原样");
      return {};
    }

    var override = [
      "",
      marker,
      ".fansGift .toastBox,",
      ".fansGift .prizeList.mask::before,",
      ".fansDraw .fans_wrap .not_started_yet {",
      "  display: none !important;",
      "}",
      "",
    ].join("\n");
    var headers = copyHeaders(responseHeaders, [
      "content-length",
      "content-encoding",
      "etag",
      "last-modified",
      "cache-control",
    ]);

    headers["Cache-Control"] = "no-store";
    log("响应阶段：已追加礼品区和盲盒区去蒙板样式");

    return {
      headers: headers,
      body: body + override,
    };
  }

  try {
    result = rewrite();
  } catch (_) {
    log("处理异常，保持原样");
  }

  $done(result);
})();
