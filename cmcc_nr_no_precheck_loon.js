/*
中国移动新零售 - 确认办理检测绕过

思路：
1. 页面加载早期会请求 hcByNorm，该响应是同一会话可解密的短成功密文。
2. checkAgreement、productPreCheck 和 failedOrder/check 是会把“确认办理”置灰的检测链。
3. 最新页面只剩 checkAgreement 且仍是通过态时，前端可能直接隐藏“继续办理”或过滤套餐项。
4. 不解密、不伪造明文字段；同形态接口优先复用同会话成功密文，协议/设备检查使用已抓到的通过态密文。

Loon 配置示例：

[Script]
http-response ^https:\/\/wx\.10086\.cn\/website\/nrapigate\/nrpromotion\/atom\/courtesy\/hcByNorm(?:\?.*)?$ script-path=https://raw.githubusercontent.com/doosit/script/main/cmcc_nr_no_precheck_loon.js,requires-body=true,timeout=10,tag=移动办理检测学习,enable=true
http-response ^https:\/\/wx\.10086\.cn\/website\/nrapigate\/(?:nrzone\/tczq\/checkAgreement|nrmix\/preCheck\/productPreCheck|nropportunity\/atom\/failedOrder\/check)(?:\?.*)?$ script-path=https://raw.githubusercontent.com/doosit/script/main/cmcc_nr_no_precheck_loon.js,requires-body=true,timeout=10,tag=移动办理检测绕过,enable=true
http-response ^https:\/\/wx\.10086\.cn\/(?!website\/nrapigate\/).*(?:\.html?|\.js|\/)(?:\?.*)?$ script-path=https://raw.githubusercontent.com/doosit/script/main/cmcc_nr_no_precheck_loon.js,requires-body=true,timeout=10,tag=移动继续办理恢复,enable=true
http-response ^https:\/\/ha-cmim\.cmcc-cs\.cn(?::\d+)?\/.*(?:\.html?|\.js|\/)(?:\?.*)?$ script-path=https://raw.githubusercontent.com/doosit/script/main/cmcc_nr_no_precheck_loon.js,requires-body=true,timeout=10,tag=移动继续办理恢复,enable=true

[MITM]
hostname = wx.10086.cn, ha-cmim.cmcc-cs.cn
*/

(function () {
  var tag = "移动确认办理检测";
  var storeKey = "cmcc_nr_success_cipher";
  var fallbackSuccessCipher =
    "JddRWDcJFqmaCqlqHuounSIqXFQq23U4Li9Kj55nR3KETDvIhJMvHLvC6vN4HHRR";
  var checkAgreementSuccessCipher =
    "JddRWDcJFqmaCqlqHuounSIqXFQq23U4Li9Kj55nR3KEGSZzacxGO_XgNzD6dUCbsYyT6KjQuZ9iE7-3ZzBOQqaWNrMwLU6Wk0vq0TvqMvaAbfo9_yjxVzF1hhp4eNVygv2wu-wrjqK4NRb6ve3EeA==";
  var url =
    typeof $request !== "undefined" && $request && $request.url
      ? String($request.url)
      : "";
  var body =
    typeof $response !== "undefined" && $response ? $response.body : "";
  var headers =
    typeof $response !== "undefined" && $response && $response.headers
      ? $response.headers
      : {};
  var restoreMarker = "__CMCC_NR_CONTINUE_RESTORE__";

  function isLearnUrl(value) {
    return /\/website\/nrapigate\/nrpromotion\/atom\/courtesy\/hcByNorm(?:\?|$)/.test(
      value
    );
  }

  function isDetectUrl(value) {
    return /\/website\/nrapigate\/(?:nrmix\/preCheck\/productPreCheck|nropportunity\/atom\/failedOrder\/check)(?:\?|$)/.test(
      value
    );
  }

  function isCheckAgreementUrl(value) {
    return /\/website\/nrapigate\/nrzone\/tczq\/checkAgreement(?:\?|$)/.test(
      value
    );
  }

  function parseJson(text) {
    try {
      return JSON.parse(text);
    } catch (error) {
      return null;
    }
  }

  function headerValue(name) {
    if (!headers || typeof headers !== "object") {
      return "";
    }
    var wanted = String(name).toLowerCase();
    for (var key in headers) {
      if (
        Object.prototype.hasOwnProperty.call(headers, key) &&
        String(key).toLowerCase() === wanted
      ) {
        return String(headers[key] || "");
      }
    }
    return "";
  }

  function isSupportedPageAsset(value) {
    return (
      (/^https:\/\/wx\.10086\.cn\//.test(value) &&
        !/\/website\/nrapigate\//.test(value)) ||
      /^https:\/\/ha-cmim\.cmcc-cs\.cn(?::\d+)?\//.test(value)
    );
  }

  function looksLikeHtml(text) {
    var contentType = headerValue("content-type").toLowerCase();
    return (
      contentType.indexOf("text/html") !== -1 ||
      contentType.indexOf("application/xhtml") !== -1 ||
      /<\/body>|<html[\s>]|<!doctype html/i.test(text)
    );
  }

  function looksLikeScript(value) {
    var contentType = headerValue("content-type").toLowerCase();
    return (
      contentType.indexOf("javascript") !== -1 ||
      contentType.indexOf("ecmascript") !== -1 ||
      /\.js(?:[?#]|$)/.test(value)
    );
  }

  function continueRestorerSource() {
    return (
      "(function(){" +
      "if(typeof window==='undefined'||typeof document==='undefined'){return;}" +
      "if(window." +
      restoreMarker +
      "){return;}window." +
      restoreMarker +
      "=true;" +
      'var words=["继续办理","确认办理","智慧爱家成员资费"];' +
      'var classNames=["disabled","disable","is-disabled","btn-disabled","hidden","hide"];' +
      "function textOf(el){return String((el&&(el.innerText||el.textContent))||'').replace(/\\s+/g,'');}" +
      "function matched(el){var text=textOf(el);for(var i=0;i<words.length;i++){if(text.indexOf(words[i])>-1){return true;}}return false;}" +
      "function hasTargetValue(value,depth){" +
      "if(depth<=0||value==null){return false;}" +
      "if(typeof value==='string'){return value.replace(/\\s+/g,'').indexOf('智慧爱家成员资费')>-1;}" +
      "if(typeof value!=='object'){return false;}" +
      "for(var key in value){try{if(Object.prototype.hasOwnProperty.call(value,key)&&hasTargetValue(value[key],depth-1)){return true;}}catch(e){}}" +
      "return false;" +
      "}" +
      "function installFilterPatch(){" +
      "if(Array.prototype.__cmccNrPackageFilterPatch){return;}" +
      "var rawFilter=Array.prototype.filter;" +
      "try{Object.defineProperty(Array.prototype,'__cmccNrPackageFilterPatch',{value:true,configurable:false});}catch(e){Array.prototype.__cmccNrPackageFilterPatch=true;}" +
      "Array.prototype.filter=function(callback,thisArg){" +
      "var result=rawFilter.call(this,callback,thisArg);" +
      "try{for(var i=0;i<this.length;i++){var item=this[i];if(hasTargetValue(item,4)&&result.indexOf(item)===-1){result.push(item);}}}catch(e){}" +
      "return result;" +
      "};" +
      "}" +
      "function reveal(el){" +
      "if(!el){return;}" +
      "try{el.disabled=false;}catch(e){}" +
      "try{el.removeAttribute('disabled');el.removeAttribute('hidden');el.removeAttribute('aria-hidden');el.setAttribute('aria-disabled','false');}catch(e){}" +
      "try{if(el.style){el.style.setProperty('visibility','visible','important');el.style.setProperty('opacity','1','important');el.style.setProperty('pointer-events','auto','important');var hiddenDisplay=String(el.style.display||'').toLowerCase()==='none';if(!hiddenDisplay&&window.getComputedStyle){hiddenDisplay=window.getComputedStyle(el).display==='none';}if(hiddenDisplay){el.style.setProperty('display','block','important');}}}catch(e){}" +
      "if(el.classList){for(var i=0;i<classNames.length;i++){try{el.classList.remove(classNames[i]);}catch(e){}}try{var names=String(el.className||'').split(/\\s+/);for(var k=0;k<names.length;k++){if(/disabled?|hide|hidden/i.test(names[k])){el.classList.remove(names[k]);}}}catch(e){}}" +
      "}" +
      "function scan(){" +
      "var nodes=document.querySelectorAll('button,a,div,span,p,li,section,article,view,text');" +
      "for(var i=0;i<nodes.length;i++){var el=nodes[i];if(!matched(el)){continue;}reveal(el);var parent=el.parentElement;for(var j=0;parent&&j<5;j++){reveal(parent);parent=parent.parentElement;}}" +
      "}" +
      "function install(){" +
      "installFilterPatch();" +
      "scan();" +
      "try{new MutationObserver(scan).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['style','class','disabled','aria-disabled','aria-hidden']});}catch(e){}" +
      "try{setInterval(scan,800);}catch(e){}" +
      "}" +
      "if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',install);}else{install();}" +
      "})();"
    );
  }

  function patchPageAsset(text) {
    if (!isSupportedPageAsset(url) || text.indexOf(restoreMarker) !== -1) {
      return text;
    }
    var source = continueRestorerSource();
    if (looksLikeHtml(text)) {
      var injection = "<script>" + source + "</script>";
      if (/<head[^>]*>/i.test(text)) {
        return text.replace(/<head([^>]*)>/i, "<head$1>" + injection);
      }
      if (/<script[\s>]/i.test(text)) {
        return text.replace(/<script/i, injection + "<script");
      }
      if (/<\/body>/i.test(text)) {
        return text.replace(/<\/body>/i, injection + "</body>");
      }
      return text + injection;
    }
    if (looksLikeScript(url)) {
      return source + "\n;" + text + "\n";
    }
    return text;
  }

  function isUsableCipher(value) {
    return typeof value === "string" && value.length >= 32;
  }

  function readLearnedCipher() {
    try {
      if (typeof $persistentStore === "undefined" || !$persistentStore) {
        return "";
      }
      return $persistentStore.read(storeKey) || "";
    } catch (error) {
      return "";
    }
  }

  function writeLearnedCipher(value) {
    try {
      if (typeof $persistentStore === "undefined" || !$persistentStore) {
        return false;
      }
      return $persistentStore.write(value, storeKey);
    } catch (error) {
      return false;
    }
  }

  function finishWithOriginal(reason) {
    console.log("[" + tag + "] " + reason);
    $done(body ? { body: body } : {});
  }

  if (!body) {
    finishWithOriginal("响应体为空，跳过");
    return;
  }

  var patchedPageBody = patchPageAsset(body);
  if (patchedPageBody !== body) {
    console.log("[" + tag + "] 已注入继续办理按钮恢复器");
    $done({ body: patchedPageBody });
    return;
  }

  var data = parseJson(body);
  if (!data || !isUsableCipher(data.body)) {
    finishWithOriginal("不是 nrapigate 加密包装响应，跳过");
    return;
  }

  if (isLearnUrl(url)) {
    writeLearnedCipher(data.body);
    console.log("[" + tag + "] 已学习当前会话成功密文");
    $done({ body: body });
    return;
  }

  if (isDetectUrl(url)) {
    var learnedCipher = readLearnedCipher();
    var successCipher = isUsableCipher(learnedCipher)
      ? learnedCipher
      : fallbackSuccessCipher;
    data.body = successCipher;
    console.log(
      "[" +
        tag +
        "] 已替换检测响应，来源=" +
        (successCipher === learnedCipher ? "当前会话" : "内置兜底")
    );
    $done({ body: JSON.stringify(data) });
    return;
  }

  if (isCheckAgreementUrl(url)) {
    data.body = checkAgreementSuccessCipher;
    console.log("[" + tag + "] 已替换协议/设备检查响应");
    $done({ body: JSON.stringify(data) });
    return;
  }

  finishWithOriginal("非目标接口，跳过");
})();
