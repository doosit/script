/*
中国移动新零售 - 确认办理检测绕过

思路：
1. 页面加载早期会请求 hcByNorm，该响应是同一会话可解密的短成功密文。
2. productPreCheck 和 failedOrder/check 是会把“确认办理”置灰的检测链。
3. 不解密、不伪造明文字段，只复用同会话成功密文，避免会话密钥不一致。

Loon 配置示例：

[Script]
http-response ^https:\/\/wx\.10086\.cn\/website\/nrapigate\/nrpromotion\/atom\/courtesy\/hcByNorm(?:\?.*)?$ script-path=https://raw.githubusercontent.com/doosit/script/main/cmcc_nr_no_precheck_loon.js,requires-body=true,timeout=10,tag=移动办理检测学习,enable=true
http-response ^https:\/\/wx\.10086\.cn\/website\/nrapigate\/(?:nrmix\/preCheck\/productPreCheck|nropportunity\/atom\/failedOrder\/check)(?:\?.*)?$ script-path=https://raw.githubusercontent.com/doosit/script/main/cmcc_nr_no_precheck_loon.js,requires-body=true,timeout=10,tag=移动办理检测绕过,enable=true

[MITM]
hostname = wx.10086.cn
*/

(function () {
  var tag = "移动确认办理检测";
  var storeKey = "cmcc_nr_success_cipher";
  var fallbackSuccessCipher =
    "JddRWDcJFqmaCqlqHuounSIqXFQq23U4Li9Kj55nR3KETDvIhJMvHLvC6vN4HHRR";
  var url =
    typeof $request !== "undefined" && $request && $request.url
      ? String($request.url)
      : "";
  var body =
    typeof $response !== "undefined" && $response ? $response.body : "";

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

  function parseJson(text) {
    try {
      return JSON.parse(text);
    } catch (error) {
      return null;
    }
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

  finishWithOriginal("非目标接口，跳过");
})();
