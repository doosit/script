/*
中国移动爱购 - 购买资格恢复

处理控制购买按钮状态的接口：
checkQualificByActivityId/v3
checkQualificByActivityId/v5
getProByActId
getCurrentTime.do
detail5 页面
页面 layout JSON

正常响应特征：
- resultCode: 0
- msg: "success"
- data[].skuResultCode: 0
- data[].skuResultMsg: "success"
- 目标活动商品 availableNum > 0
- 目标活动商品 joinStatus: 0
- 目标日期批次 activityStatus: 1
- 详情页批次 startTime <= 当前时间 < endTime
- 详情时间基于中国移动服务器时间，而非只依赖设备本地时间
- “活动/业务太火爆”泛化弹窗自动关闭，但接口失败不会伪装成成功

脚本根据活动名称与商品名称识别幸运三日签话费券，不依赖固定活动 ID、
批次 ID 或 SKU ID。仅在指定批次的详情请求中保护活动时间窗，列表中的
真实日期不变。不会修改购买验证码、商品价格、订单或支付接口。JSON 解析
失败时原样放行。
*/

(function () {
  var SERVER_TIME_KEY = "cmcc_aigou_server_time_v1";
  var body =
    typeof $response !== "undefined" && $response ? $response.body : "";
  var url =
    typeof $request !== "undefined" && $request && $request.url
      ? String($request.url)
      : "";
  var isRequestPhase = typeof $response === "undefined";
  var isDetailPageUrl =
    /\/canvas\/rightsmarket-h5-canvas\/online\/detail5(?:\?|$)/.test(url);
  var isLayoutConfigUrl =
    /\/production\.rightsmarket-h5-canvas\.online\.layout\.[^/?]+\.json(?:\?|$)/.test(
      url
    );

  if (isRequestPhase) {
    if (isDetailPageUrl || isLayoutConfigUrl) {
      var requestHeaders = {};
      var originalHeaders =
        $request && $request.headers && typeof $request.headers === "object"
          ? $request.headers
          : {};
      Object.keys(originalHeaders).forEach(function (name) {
        if (!/^(?:if-none-match|if-modified-since)$/i.test(name)) {
          requestHeaders[name] = originalHeaders[name];
        }
      });
      requestHeaders["Cache-Control"] = "no-cache";
      requestHeaders.Pragma = "no-cache";
      console.log("移动爱购火爆弹窗处理：已请求完整页面配置");
      $done({ headers: requestHeaders });
    } else {
      $done({});
    }
    return;
  }

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

  function saveServerTime(payload) {
    var serverTime = payload && Number(payload.data);
    if (
      !isFinite(serverTime) ||
      typeof $persistentStore === "undefined" ||
      !$persistentStore ||
      typeof $persistentStore.write !== "function"
    ) {
      return;
    }

    var now = Date.now();
    $persistentStore.write(
      JSON.stringify({
        offsetMs: serverTime - now,
        updatedAtMs: now,
      }),
      SERVER_TIME_KEY
    );
    console.log(
      "移动爱购服务器时间校正：时差 " + (serverTime - now) + "ms"
    );
  }

  function currentServerTimeMs() {
    if (
      typeof $persistentStore === "undefined" ||
      !$persistentStore ||
      typeof $persistentStore.read !== "function"
    ) {
      return Date.now();
    }

    try {
      var saved = JSON.parse($persistentStore.read(SERVER_TIME_KEY) || "{}");
      var offsetMs = Number(saved.offsetMs);
      var updatedAtMs = Number(saved.updatedAtMs);
      var ageMs = Date.now() - updatedAtMs;
      if (
        isFinite(offsetMs) &&
        Math.abs(offsetMs) <= 86400000 &&
        isFinite(ageMs) &&
        ageMs >= 0 &&
        ageMs <= 21600000
      ) {
        return Date.now() + offsetMs;
      }
    } catch (error) {
      console.log("移动爱购服务器时间校正：缓存无效，改用设备时间");
    }
    return Date.now();
  }

  function injectBusyPopupFix(html) {
    var marker = "data-cmcc-aigou-popup-fix";
    if (!html || html.indexOf(marker) !== -1) {
      return html;
    }

    var injected = [
      '<script ' + marker + '="1">',
      "(function(){",
      'if(window.__cmccAigouPopupFixInstalled){return;}',
      "window.__cmccAigouPopupFixInstalled=true;",
      'var busyPattern=/(?:活动|业务).{0,4}太火爆/;',
      "var lastSmsFailure='';",
      "var serverOffsetMs=0;",
      "var inventoryRoot=null;",
      "var inventoryPanel=null;",
      "var inventoryToggle=null;",
      "function sanitizeActivityHotTips(value){",
      "try{",
      "var container=JSON.parse(String(value||'{}'));",
      "var rawPageInfo=container.page_info;",
      "if(rawPageInfo==null){return value;}",
      "var pageInfo=typeof rawPageInfo==='string'?JSON.parse(rawPageInfo):rawPageInfo;",
      "if(!pageInfo||typeof pageInfo!=='object'){return value;}",
      "pageInfo.activityHotTips=0;",
      "container.page_info=typeof rawPageInfo==='string'?JSON.stringify(pageInfo):pageInfo;",
      "return JSON.stringify(container);",
      "}catch(error){return value;}",
      "}",
      "function disableStoredBusyTip(storage){",
      "try{",
      "var key='canvasworkbenchweb_auth';",
      "var current=storage.getItem(key);",
      "if(current!=null){storage.setItem(key,sanitizeActivityHotTips(current));}",
      "}catch(error){}",
      "}",
      "try{",
      "if(typeof Storage!=='undefined'&&Storage.prototype&&Storage.prototype.setItem){",
      "var originalStorageSetItem=Storage.prototype.setItem;",
      "Storage.prototype.setItem=function(key,value){",
      "if(key==='canvasworkbenchweb_auth'){value=sanitizeActivityHotTips(value);}",
      "return originalStorageSetItem.call(this,key,value);",
      "};",
      "}",
      "}catch(error){}",
      "try{disableStoredBusyTip(window.sessionStorage);}catch(error){}",
      "try{disableStoredBusyTip(window.localStorage);}catch(error){}",
      "function showNotice(message){",
      "if(!message){return;}",
      "var old=document.getElementById('cmcc-aigou-real-error');",
      "if(old){old.remove();}",
      "if(!document.body){return;}",
      "var notice=document.createElement('div');",
      "notice.id='cmcc-aigou-real-error';",
      "notice.textContent=message;",
      "notice.style.cssText='position:fixed;left:16px;right:16px;bottom:24px;" +
        "z-index:2147483647;padding:12px 14px;border-radius:10px;" +
        "background:rgba(35,35,38,.94);color:#fff;font-size:14px;" +
        "line-height:20px;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.28)';",
      "document.body.appendChild(notice);",
      "setTimeout(function(){if(notice.parentNode){notice.remove();}},5200);",
      "}",
      "function releaseSmsButton(){",
      "var buttons=document.querySelectorAll('button,[role=\"button\"],.van-button');",
      "Array.prototype.forEach.call(buttons,function(button){",
      "if(String(button.textContent||'').indexOf('获取验证码')===-1){return;}",
      "button.disabled=false;",
      "button.removeAttribute('disabled');",
      "button.removeAttribute('aria-disabled');",
      "if(button.classList){button.classList.remove('van-button--disabled');}",
      "button.style.pointerEvents='auto';",
      "button.style.opacity='1';",
      "});",
      "}",
      "function normalizeTimeMs(value){",
      "var number=Number(value);",
      "if(!isFinite(number)){return 0;}",
      "return number<1000000000000?number*1000:number;",
      "}",
      "function goodsName(goods){",
      "return String(goods.name||goods.midName||goods.showName||goods.rightTypeRemark||('SKU '+String(goods.skuid||goods.skuId||'')));",
      "}",
      "function inventoryRows(payload){",
      "var data=payload&&payload.data;",
      "if(!data||!Array.isArray(data.subActivityList)){return [];}",
      "var now=Date.now()+serverOffsetMs;",
      "var rows=[];",
      "data.subActivityList.forEach(function(batch){",
      "if(!batch||!Array.isArray(batch.goodsList)){return;}",
      "var start=normalizeTimeMs(batch.startTime);",
      "var end=normalizeTimeMs(batch.endTime);",
      "var state=start&&now<start?'未开始':end&&now>=end?'已结束':'进行中';",
      "batch.goodsList.forEach(function(goods){",
      "if(!goods||typeof goods!=='object'){return;}",
      "var original=goods._cmccOriginalAvailableNum;",
      "if(original==null){original=goods.availableNum;}",
      "rows.push({",
      "batchId:batch.id==null?'':String(batch.id),",
      "startTime:start,",
      "state:state,",
      "name:goodsName(goods),",
      "sku:String(goods.skuid||goods.skuId||''),",
      "original:Number(original),",
      "effective:Number(goods.availableNum),",
      "});",
      "});",
      "});",
      "return rows;",
      "}",
      "function formatBatchTime(value){",
      "if(!value){return '时间未知';}",
      "var date=new Date(value);",
      "function pad2(number){return number<10?'0'+String(number):String(number);}",
      "var month=pad2(date.getMonth()+1);",
      "var day=pad2(date.getDate());",
      "var hour=pad2(date.getHours());",
      "var minute=pad2(date.getMinutes());",
      "return month+'-'+day+' '+hour+':'+minute;",
      "}",
      "function ensureInventoryPanel(){",
      "if(inventoryRoot||!document.body){return;}",
      "inventoryRoot=document.createElement('div');",
      "inventoryRoot.id='cmcc-aigou-inventory';",
      "inventoryRoot.style.cssText='position:fixed;top:calc(env(safe-area-inset-top,0px) + 72px);right:10px;z-index:2147483000;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#fff;text-align:left';",
      "inventoryToggle=document.createElement('button');",
      "inventoryToggle.type='button';",
      "inventoryToggle.style.cssText='float:right;border:0;border-radius:16px;padding:7px 11px;background:rgba(25,25,28,.92);color:#fff;font-size:12px;box-shadow:0 4px 14px rgba(0,0,0,.25)';",
      "inventoryPanel=document.createElement('div');",
      "inventoryPanel.style.cssText='display:none;clear:both;margin-top:36px;width:82vw;max-width:300px;max-height:52vh;overflow:auto;border-radius:12px;padding:10px;background:rgba(25,25,28,.94);box-shadow:0 8px 28px rgba(0,0,0,.3);font-size:12px;line-height:18px';",
      "inventoryToggle.addEventListener('click',function(){inventoryPanel.style.display=inventoryPanel.style.display==='none'?'block':'none';});",
      "inventoryRoot.appendChild(inventoryToggle);",
      "inventoryRoot.appendChild(inventoryPanel);",
      "document.body.appendChild(inventoryRoot);",
      "}",
      "function renderInventory(payload){",
      "var rows=inventoryRows(payload);",
      "window.__cmccAigouInventorySnapshot=rows;",
      "if(!rows.length){return;}",
      "if(!document.body){setTimeout(function(){renderInventory(payload);},50);return;}",
      "ensureInventoryPanel();",
      "var total=rows.reduce(function(sum,row){return sum+(isFinite(row.original)?Math.max(0,row.original):0);},0);",
      "inventoryToggle.textContent='库存 '+String(total)+' · '+String(rows.length)+'款';",
      "while(inventoryPanel.firstChild){inventoryPanel.removeChild(inventoryPanel.firstChild);}",
      "var title=document.createElement('div');",
      "title.textContent='接口库存 / 页面库存';",
      "title.style.cssText='font-weight:700;margin-bottom:6px;color:#fff';",
      "inventoryPanel.appendChild(title);",
      "var currentBatch='';",
      "rows.forEach(function(row){",
      "var batchKey=row.batchId+'_'+String(row.startTime);",
      "if(batchKey!==currentBatch){",
      "currentBatch=batchKey;",
      "var batchTitle=document.createElement('div');",
      "batchTitle.textContent=formatBatchTime(row.startTime)+' · '+row.state+(row.batchId?' · 批次'+row.batchId:'');",
      "batchTitle.style.cssText='margin-top:7px;padding-top:6px;border-top:1px solid rgba(255,255,255,.13);color:#ffcf70';",
      "inventoryPanel.appendChild(batchTitle);",
      "}",
      "var item=document.createElement('div');",
      "var original=isFinite(row.original)?String(row.original):'未知';",
      "var effective=isFinite(row.effective)?String(row.effective):'未知';",
      "item.textContent=row.name+' · '+original+' / '+effective+(row.sku?' · SKU '+row.sku:'');",
      "item.style.cssText='padding:3px 0;color:'+(Number(row.original)>0?'#dff7df':'#ffd0c9');",
      "inventoryPanel.appendChild(item);",
      "});",
      "}",
      "window.__cmccAigouRenderInventory=renderInventory;",
      "window.__cmccAigouInventorySnapshot=[];",
      "function patchBusyToast(){",
      "var utils=window.$utils;",
      "if(!utils||typeof utils.toast!=='function'||utils.toast.__cmccBusyFiltered){return;}",
      "var originalToast=utils.toast;",
      "var filteredToast=function(options){",
      "var message=typeof options==='string'?options:options&&options.message;",
      "if(busyPattern.test(String(message||''))){",
      "setTimeout(releaseSmsButton,0);",
      "return;",
      "}",
      "return originalToast.apply(this,arguments);",
      "};",
      "filteredToast.__cmccBusyFiltered=true;",
      "if(originalToast.clear){filteredToast.clear=function(){return originalToast.clear.apply(originalToast,arguments);};}",
      "utils.toast=filteredToast;",
      "}",
      "function dismissBusyPopup(){",
      "patchBusyToast();",
      "var nodes=document.querySelectorAll('.van-dialog,.van-popup,.van-toast,.yd-dialog,.common-dialog,[class*=\"dialog\"],[class*=\"popup\"],[role=\"dialog\"]');",
      "Array.prototype.forEach.call(nodes,function(node){",
      "if(!busyPattern.test(String(node.textContent||''))){return;}",
      "var controls=node.querySelectorAll('button,[role=\"button\"],.van-button');",
      "var closed=false;",
      "Array.prototype.forEach.call(controls,function(control){",
      "if(closed){return;}",
      "var text=String(control.textContent||'');",
      "if(/知道了|我知道了|确定|确认|关闭/.test(text)){control.click();closed=true;}",
      "});",
      "if(!closed&&node.parentNode){node.remove();}",
      "var overlays=document.querySelectorAll('.van-overlay');",
      "if(!closed&&overlays.length){overlays[overlays.length-1].remove();}",
      "showNotice(lastSmsFailure||'请求未成功，已解除泛化弹窗，请按真实原因稍后重试');",
      "lastSmsFailure='';",
      "setTimeout(releaseSmsButton,0);",
      "setTimeout(releaseSmsButton,300);",
      "setTimeout(releaseSmsButton,1200);",
      "});",
      "}",
      "var originalOpen=XMLHttpRequest.prototype.open;",
      "XMLHttpRequest.prototype.open=function(method,requestUrl){",
      "var observedUrl=typeof requestUrl==='string'?requestUrl:'';",
      "this.__cmccPurchaseSms=observedUrl.indexOf('/coc3-market/api/sms/qwSendSmsCode')!==-1;",
      "this.__cmccInventoryRequest=observedUrl.indexOf('/arrange/getProByActId')!==-1;",
      "this.__cmccServerTimeRequest=observedUrl.indexOf('/api/order/getCurrentTime.do')!==-1;",
      "if(this.__cmccPurchaseSms||this.__cmccInventoryRequest||this.__cmccServerTimeRequest){",
      "this.addEventListener('loadend',function(){",
      "try{",
      "var payload=JSON.parse(this.responseText||'{}');",
      "if(this.__cmccServerTimeRequest&&isFinite(Number(payload.data))){",
      "serverOffsetMs=Number(payload.data)-Date.now();",
      "}",
      "if(this.__cmccInventoryRequest){renderInventory(payload);}",
      "var code=payload.resultCode!=null?payload.resultCode:payload.code;",
      "if(this.__cmccPurchaseSms&&code!==0&&code!=='0'&&code!==200&&code!=='200'){",
      "lastSmsFailure='购买验证码未发送（'+code+'）：'+String(payload.msg||payload.message||'接口拒绝');",
      "showNotice(lastSmsFailure);",
      "setTimeout(dismissBusyPopup,0);",
      "setTimeout(releaseSmsButton,0);",
      "}",
      "}catch(error){}",
      "});",
      "}",
      "return originalOpen.apply(this,arguments);",
      "};",
      "var observer=new MutationObserver(function(){dismissBusyPopup();});",
      "observer.observe(document.documentElement,{childList:true,subtree:true});",
      "var toastPatchTimer=setInterval(patchBusyToast,250);",
      "setTimeout(function(){clearInterval(toastPatchTimer);},10000);",
      "dismissBusyPopup();",
      "})();",
      "</script>",
    ].join("");

    if (/<head(?:\s[^>]*)?>/i.test(html)) {
      return html.replace(/<head(\s[^>]*)?>/i, function (head) {
        return head + injected;
      });
    }
    if (/<body(?:\s[^>]*)?>/i.test(html)) {
      return html.replace(/<body(\s[^>]*)?>/i, function (bodyTag) {
        return bodyTag + injected;
      });
    }
    return injected + html;
  }

  function disableBusyTipConfig(payload) {
    if (!payload || typeof payload !== "object") {
      return false;
    }

    var isDetailLayout =
      /\/production\.rightsmarket-h5-canvas\.online\.layout\.detail5\.json(?:\?|$)/.test(
        url
      );
    var serialized = "";
    try {
      serialized = JSON.stringify(payload);
    } catch (error) {}
    var isTargetLayout = serialized.indexOf("幸运三日签") !== -1;

    if (
      (isDetailLayout || isTargetLayout) &&
      Number(payload.activityHotTips) !== 0
    ) {
      payload.activityHotTips = 0;
      return true;
    }
    return false;
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
    return /(?:\d+(?:\.\d+)?元)?话费(?:兑换)?券/.test(name);
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
    var annotated = 0;
    var protectTimeWindow = isDetailBatchRequest();
    var now = currentServerTimeMs();
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
        if (
          !Object.prototype.hasOwnProperty.call(
            goods,
            "_cmccOriginalAvailableNum"
          )
        ) {
          goods._cmccOriginalAvailableNum = goods.availableNum;
          goods._cmccOriginalJoinStatus = goods.joinStatus;
          annotated += 1;
        }
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
      annotated: annotated,
    };
  }

  if (isDetailPageUrl) {
    var updatedHtml = injectBusyPopupFix(body);
    if (updatedHtml !== body) {
      console.log("移动爱购火爆弹窗处理：已注入非阻塞处理");
      $done({ body: updatedHtml });
    } else {
      $done({});
    }
    return;
  }

  try {
    var payload = JSON.parse(body);

    if (isLayoutConfigUrl) {
      if (disableBusyTipConfig(payload)) {
        console.log("移动爱购火爆弹窗处理：已关闭页面配置开关");
        $done({ body: JSON.stringify(payload) });
      } else {
        $done({});
      }
      return;
    }

    if (/\/coc3-market\/api\/order\/getCurrentTime\.do(?:\?|$)/.test(url)) {
      saveServerTime(payload);
      $done({});
      return;
    }

    if (/\/checkQualificByActivityId\/v(?:3|5)(?:\?|$)/.test(url)) {
      payload = restoreQualification(payload);
      $done({ body: JSON.stringify(payload) });
      return;
    }

    if (/\/arrange\/getProByActId(?:\?|$)/.test(url)) {
      var activityResult = restoreActivityState(payload);
      if (activityResult.changed > 0 || activityResult.annotated > 0) {
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
