/*
 * 移动爱购实物商品去时间蒙板，版本 20261016-3。
 * 仅处理用户 HAR 中的第一个商品，不改写活动接口或订单响应。
 * 商品标识是公开商品编号，不是账号标识或鉴权凭据。
 */

(function () {
  "use strict";

  var result = {};
  var targetItemId = "2609141559270262374";
  var targetPageId = "2026092316440991402007663";
  var marker = "/* cmcc-physical-detail-unmask 20261016-3 */";
  var htmlMarker = "cmcc-physical-spec-preview-v2";
  var snapshot = {
    itemId: targetItemId,
    name: "iPhone Duo 手机【移动正品】",
    capturedAt: "2026-10-16 18:42",
    note: "裸机；普通物流；10月23日起陆续发货，需现场签收激活；限购1台。",
    skus: [
      ["星光白色 / 256GB", "15999", "890"],
      ["星光白色 / 512GB", "17999", "104"],
      ["星光白色 / 1TB", "21499", "0"],
      ["星光白色 / 2TB", "26499", "0"],
      ["夜空色 / 256GB", "15999", "246"],
      ["夜空色 / 512GB", "17999", "130"],
      ["夜空色 / 1TB", "21499", "0"],
      ["夜空色 / 2TB", "26499", "0"],
    ],
    parameters: [
      ["CPU型号", "A20 Pro"],
      ["屏幕尺寸", "7.6英寸"],
      ["电池容量", "未公布"],
      ["网络类型", "5G"],
      ["机身厚度", "闭合11.3毫米；展开5.2毫米"],
      ["操作系统", "IOS"],
      ["无线充电", "是"],
    ],
  };

  // 此函数仅序列化后在商品页面中执行，不在 Loon 环境中执行。
  function installPreview(config) {
    if (document.getElementById("cmcc-physical-spec-preview-v2")) {
      return;
    }

    function element(tag, text, parent) {
      var node = document.createElement(tag);
      if (text) {
        node.textContent = text;
      }
      if (parent) {
        parent.appendChild(node);
      }
      return node;
    }

    var style = element("style", "", document.head);
    style.textContent = [
      "#cmcc-physical-spec-preview-v2 {",
      "  position: fixed;",
      "  right: 8px;",
      "  top: 38%;",
      "  z-index: 2147483646;",
      "  padding: 6px 10px;",
      "  border: 0;",
      "  border-radius: 8px;",
      "  background: #175cd3;",
      "  color: #fff;",
      "  font: 12px sans-serif;",
      "}",
      "#cmcc-spec-dialog-v2 {",
      "  position: fixed;",
      "  inset: 0;",
      "  z-index: 2147483647;",
      "  background: rgba(0,0,0,.5);",
      "  padding: 20px 12px;",
      "  box-sizing: border-box;",
      "  display: none;",
      "  align-items: center;",
      "  justify-content: center;",
      "  font: 14px/1.6 sans-serif;",
      "  color: #182230;",
      "}",
      "#cmcc-spec-dialog-v2 section {",
      "  width: 100%;",
      "  max-width: 560px;",
      "  max-height: 85vh;",
      "  overflow: auto;",
      "  background: #fff;",
      "  padding: 18px;",
      "  border-radius: 12px;",
      "  box-sizing: border-box;",
      "}",
      "#cmcc-spec-dialog-v2 h2 {",
      "  font-size: 20px;",
      "  margin: 0 0 8px;",
      "}",
      "#cmcc-spec-dialog-v2 p {",
      "  margin: 8px 0;",
      "}",
      "#cmcc-spec-dialog-v2 table {",
      "  width: 100%;",
      "  border-collapse: collapse;",
      "  font-size: 13px;",
      "}",
      "#cmcc-spec-dialog-v2 th, #cmcc-spec-dialog-v2 td {",
      "  text-align: left;",
      "  padding: 7px 3px;",
      "  border-bottom: 1px solid #e4e7ec;",
      "}",
      "#cmcc-spec-dialog-v2 button {",
      "  margin: 10px 8px 0 0;",
      "  padding: 9px 12px;",
      "  border: 1px solid #98a2b3;",
      "  border-radius: 6px;",
      "  background: #fff;",
      "  color: #182230;",
      "  font-size: 14px;",
      "}",
    ].join("\n");

    var trigger = element("button", "查看规格 · v3", document.body);
    trigger.id = "cmcc-physical-spec-preview-v2";
    trigger.type = "button";
    var dialog = element("div", "", document.body);
    dialog.id = "cmcc-spec-dialog-v2";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "商品型号与规格");
    var panel = element("section", "", dialog);
    element("h2", "商品型号与规格", panel);
    element("p", config.name, panel);
    element(
      "p",
      "来源：" + config.capturedAt + " HAR 快照，价格和库存并非实时。",
      panel,
    );
    element("p", config.note, panel);
    var table = element("table", "", panel);
    var head = element("tr", "", element("thead", "", table));
    ["颜色 / 容量", "价格（元）", "库存快照"].forEach(function (text) {
      element("th", text, head);
    });
    var rows = element("tbody", "", table);
    config.skus.forEach(function (sku) {
      var row = element("tr", "", rows);
      sku.forEach(function (value) {
        element("td", value, row);
      });
    });
    var details = element("details", "", panel);
    element("summary", "查看商品参数", details);
    config.parameters.forEach(function (parameter) {
      element("p", parameter[0] + "：" + parameter[1], details);
    });
    var status = element("p", "页面入口已加载 · v3", panel);
    var open = element("button", "打开页面规格", panel);
    var close = element("button", "关闭", panel);
    open.type = "button";
    close.type = "button";

    function findDetail() {
      var stack = [];
      var seen = [];

      if (typeof window.getCurrentPages === "function") {
        window.getCurrentPages().forEach(function (page) {
          stack.push(page.$vm || page);
        });
      }

      // Vue 2 的页面根节点后备入口；没有实例时仅展示上方静态快照。
      document
        .querySelectorAll("#app, uni-app, uni-page, uni-page-body")
        .forEach(function (node) {
          if (node.__vue__) {
            stack.push(node.__vue__);
          }
        });

      while (stack.length && seen.length < 1000) {
        var instance = stack.pop();
        if (!instance || seen.indexOf(instance) !== -1) {
          continue;
        }
        seen.push(instance);
        if (
          instance.productInfo &&
          String(instance.productInfo.itemId) === config.itemId &&
          typeof instance.checkSaleTime === "function"
        ) {
          return instance;
        }
        (instance.$children || []).forEach(function (child) {
          stack.push(child);
        });
      }
      return null;
    }

    trigger.onclick = function () {
      dialog.style.display = "flex";
      close.focus();
    };
    close.onclick = function () {
      dialog.style.display = "none";
      trigger.focus();
    };
    open.onclick = function () {
      try {
        var detail = findDetail();
        if (!detail || !detail.curNorms) {
          status.textContent = "页面组件尚未就绪；仍可查看上方抓包规格。";
          return;
        }
        detail.checkSaleTime = function () {
          return true;
        };
        detail.isSaleTime = true;
        detail.showAddCartBtn = false;
        detail.showBuyBtn = true;
        detail.curNorms.purchaseMethod = 2;
        detail.showBase = true;
        dialog.style.display = "none";
        trigger.textContent = "规格";
      } catch (_) {
        status.textContent = "页面组件未能打开；仍可查看上方抓包规格。";
      }
    };
  }

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
    var bundleTarget =
      /^https:\/\/activity\.cmcc-cs\.cn\/website\/h5\/static\/js\/subPackage-physicalGoods-physicalDetail\.[0-9a-f]+\.js(?:\?.*)?$/;
    var pageTarget =
      /^https:\/\/wx\.10086\.cn\/website\/businessOnline\/physicalDetail(?:\?.*)?$/;

    if (
      typeof $request === "undefined" ||
      !$request ||
      typeof $request.url !== "string"
    ) {
      log("未命中商品详情脚本，保持原样");
      return {};
    }

    var isPage = pageTarget.test($request.url);
    var pageIdMatch = $request.url.match(/[?&]terminalPageId=([^&#]*)/);

    if (
      (isPage &&
        (!pageIdMatch ||
          decodeURIComponent(pageIdMatch[1]) !== targetPageId)) ||
      (!isPage && !bundleTarget.test($request.url))
    ) {
      return {};
    }

    if (typeof $response === "undefined") {
      log(
        isPage ? "请求阶段：商品 HTML 入口已命中" : "请求阶段：详情 JS 已命中",
      );
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

    if (typeof body !== "string") {
      log("未取得文本正文，保持原样");
      return {};
    }

    if (isPage) {
      if (
        !/^text\/html(?:;|$)/i.test(contentType) ||
        !/<\/body>/i.test(body) ||
        body.indexOf(htmlMarker) !== -1
      ) {
        log("页面正文不适用或已注入，保持原样");
        return {};
      }
      var configText = JSON.stringify(snapshot).replace(/</g, "\\u003c");
      var injection = [
        "",
        '<script data-cmcc-preview="' + htmlMarker + '">',
        "(" + installPreview.toString() + ")(" + configText + ");",
        "</script>",
        "",
      ].join("\n");
      var pageHeaders = copyHeaders(responseHeaders, [
        "content-length",
        "content-encoding",
        "etag",
        "last-modified",
        "cache-control",
      ]);
      pageHeaders["Cache-Control"] = "no-store";
      log("响应阶段：已注入可见规格入口 v3");
      return {
        headers: pageHeaders,
        body: body.replace(/<\/body>/i, function (ending) {
          return injection + ending;
        }),
      };
    }

    if (!/(?:java|ecma)script/i.test(contentType)) {
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
