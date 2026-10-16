/*
 * 移动爱购实物商品去时间蒙板，版本 20261016-1。
 * 仅处理用户 HAR 中的第一个商品，不改写活动接口或订单响应。
 * 商品标识是公开商品编号，不是账号标识或鉴权凭据。
 */

(function () {
  "use strict";

  var result = {};
  var targetItemId = "2609141559270262374";
  var marker = "/* cmcc-physical-detail-unmask 20261016-1 */";

  function log(message) {
    console.log("[实物商品去时间蒙板] " + message);
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
      /^https:\/\/activity\.cmcc-cs\.cn\/website\/h5\/static\/js\/subPackage-physicalGoods-physicalDetail\.[0-9a-f]+\.js(?:\?.*)?$/;

    if (
      typeof $request === "undefined" ||
      !$request ||
      typeof $request.url !== "string" ||
      !target.test($request.url)
    ) {
      log("未命中商品详情脚本，保持原样");
      return {};
    }

    if (typeof $response === "undefined") {
      log("请求阶段：移除脚本条件缓存头");
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

    if (typeof body !== "string" || !/(?:java|ecma)script/i.test(contentType)) {
      log("未取得 JavaScript 正文，保持原样");
      return {};
    }

    if (body.indexOf(marker) !== -1) {
      log("已包含补丁，跳过重复修改");
      return {};
    }

    var anchor = "checkSaleTime:function(){var e=this.productInfo,";
    var matches = body.split(anchor).length - 1;

    if (matches !== 1) {
      log("开售时间方法特征不唯一或已变化，保持原样");
      return {};
    }

    var replacement = [
      "checkSaleTime:function(){",
      "  " + marker,
      "  if (",
      "    this.productInfo &&",
      '    String(this.productInfo.itemId) === "' + targetItemId + '"',
      "  ) {",
      "    return true;",
      "  }",
      "  var e=this.productInfo,",
    ].join("\n");
    var headers = copyHeaders(responseHeaders, [
      "content-length",
      "content-encoding",
      "etag",
      "last-modified",
      "cache-control",
    ]);

    headers["Cache-Control"] = "no-store";
    log("已安装目标商品前端时间补丁；订单仍由服务器校验");

    return {
      headers: headers,
      body: body.replace(anchor, function () {
        return replacement;
      }),
    };
  }

  try {
    result = rewrite();
  } catch (_) {
    log("处理异常，保持原样");
  }

  $done(result);
})();
