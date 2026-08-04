/*
 * 招商花园城签到（Loon）
 *
 * 功能：
 * 1. 从微信小程序JSON请求体自动提取签到所需Token，不保存Cookie或整包请求头。
 * 2. 按账号去重，只保留签到必需字段。
 * 3. 连续两次确认鉴权失效后自动删除账号；格式错误、重复和长期未刷新记录自动清理。
 * 4. 支持定时签到、手动执行和多账号。
 * 5. 签到成功后返回本次奖励与余额；已签到时返回状态与当前余额。
 *
 * 抓包结论：该接口并不依赖Cookie，鉴权信息位于JSON请求体的Header.Token中。
 */

var CONFIG = {
  name: "招商花园城签到",
  baseUrl: "https://m-bms.cmsk1979.com",
  storeKey: "ZS_GARDEN_ACCOUNTS_V1",
  maxAccounts: 10,
  staleDays: 365,
  maxAuthFailures: 2,
  captureNoticeInterval: 60000,
  timeout: 12000,
  maxBodyLength: 262144,
  maxTokenLength: 4096,
  maxTextLength: 240,
  defaultSystemInfo: {
    model: "iPhone",
    SDKVersion: "3.17.0",
    system: "iOS",
    version: "8.0.75",
    miniVersion: "1.0.140"
  }
};

var finished = false;

function done(value) {
  if (finished) return;
  finished = true;
  if (typeof $done !== "function") return;
  if (value === undefined) $done();
  else $done(value);
}

function notify(subtitle, body) {
  if (typeof $notification !== "undefined") {
    $notification.post(CONFIG.name, subtitle || "", body || "");
  }
}

function log(message) {
  console.log("[" + CONFIG.name + "] " + message);
}

function now() {
  return Date.now();
}

function safeText(value, fallback, maxLength) {
  var text = value === undefined || value === null ? "" : String(value);
  if (!text) text = fallback === undefined || fallback === null ? "" : String(fallback);
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ");
  var limit = Number(maxLength) || CONFIG.maxTextLength;
  return text.length > limit ? text.slice(0, limit) + "…" : text;
}

function readStore() {
  try {
    var raw = $persistentStore.read(CONFIG.storeKey);
    if (!raw) return [];
    var data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    log("读取本地账号失败，已按空记录处理：" + safeText(e.message, "未知错误"));
    return [];
  }
}

function writeStore(accounts) {
  try {
    return $persistentStore.write(JSON.stringify(accounts), CONFIG.storeKey) === true;
  } catch (e) {
    log("写入本地账号失败：" + safeText(e.message, "未知错误"));
    return false;
  }
}

function normalizeSystemInfo(info) {
  info = info && typeof info === "object" ? info : {};
  return {
    model: safeText(info.model, CONFIG.defaultSystemInfo.model, 64),
    SDKVersion: safeText(info.SDKVersion, CONFIG.defaultSystemInfo.SDKVersion, 32),
    system: safeText(info.system, CONFIG.defaultSystemInfo.system, 32),
    version: safeText(info.version, CONFIG.defaultSystemInfo.version, 32),
    miniVersion: safeText(info.miniVersion, CONFIG.defaultSystemInfo.miniVersion, 32)
  };
}

function hashText(value) {
  var text = String(value || "");
  var hash = 2166136261;
  for (var i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return ("00000000" + (hash >>> 0).toString(16)).slice(-8);
}

function accountId(token, mallId) {
  var parts = String(token || "").split(",");
  var identity = parts.length > 1 ? parts[parts.length - 1] : String(token || "");
  return String(mallId) + "@" + hashText(String(mallId) + "|" + identity);
}

function validAccount(item) {
  if (!item || typeof item.token !== "string") return false;
  var mallId = Number(item.mallId);
  return item.token.length >= 12 &&
    item.token.length <= CONFIG.maxTokenLength &&
    isFinite(mallId) && mallId > 0 && Math.floor(mallId) === mallId;
}

function cleanAccounts(accounts) {
  var cutoff = now() - CONFIG.staleDays * 86400000;
  var map = {};
  var cleaned = [];
  var removed = 0;

  (Array.isArray(accounts) ? accounts : []).forEach(function (item) {
    if (!validAccount(item)) {
      removed++;
      return;
    }

    var updatedAt = Number(item.updatedAt);
    if (!isFinite(updatedAt) || updatedAt <= 0 || updatedAt > now() + 86400000) updatedAt = now();

    var normalized = {
      id: accountId(item.token, item.mallId),
      mallId: Number(item.mallId),
      token: String(item.token),
      systemInfo: normalizeSystemInfo(item.systemInfo),
      updatedAt: updatedAt,
      authFailures: Math.max(0, Math.floor(Number(item.authFailures) || 0)),
      lastCaptureNoticeAt: Math.max(0, Math.floor(Number(item.lastCaptureNoticeAt) || 0))
    };

    if (normalized.authFailures >= CONFIG.maxAuthFailures || normalized.updatedAt < cutoff) {
      removed++;
      return;
    }

    var old = map[normalized.id];
    if (!old || normalized.updatedAt > old.updatedAt) {
      if (old) removed++;
      map[normalized.id] = normalized;
    } else {
      removed++;
    }
  });

  Object.keys(map).forEach(function (key) {
    cleaned.push(map[key]);
  });

  cleaned.sort(function (a, b) {
    return b.updatedAt - a.updatedAt;
  });

  if (cleaned.length > CONFIG.maxAccounts) {
    removed += cleaned.length - CONFIG.maxAccounts;
    cleaned = cleaned.slice(0, CONFIG.maxAccounts);
  }

  return { accounts: cleaned, removed: removed };
}

function saveClean(accounts) {
  var result = cleanAccounts(accounts);
  result.saved = writeStore(result.accounts);
  return result;
}

function bytesToUtf8(bytes) {
  var encoded = "";
  for (var i = 0; i < bytes.length; i++) {
    var hex = bytes[i].toString(16).toUpperCase();
    encoded += "%" + (hex.length === 1 ? "0" + hex : hex);
  }
  try {
    return decodeURIComponent(encoded);
  } catch (e) {
    var fallback = "";
    for (var j = 0; j < bytes.length; j++) fallback += String.fromCharCode(bytes[j]);
    return fallback;
  }
}

function base64DecodeUtf8(input) {
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var clean = String(input || "").replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!clean || /[^A-Za-z0-9+/=]/.test(clean)) throw new Error("不是有效Base64");
  var paddingAt = clean.indexOf("=");
  if (clean.length % 4 === 1 || (paddingAt >= 0 && !/^={1,2}$/.test(clean.slice(paddingAt)))) {
    throw new Error("Base64填充无效");
  }

  while (clean.length % 4 !== 0) clean += "=";

  var bytes = [];
  for (var i = 0; i < clean.length; i += 4) {
    var c1 = chars.indexOf(clean[i]);
    var c2 = chars.indexOf(clean[i + 1]);
    var c3 = clean[i + 2] === "=" ? 0 : chars.indexOf(clean[i + 2]);
    var c4 = clean[i + 3] === "=" ? 0 : chars.indexOf(clean[i + 3]);
    if (c1 < 0 || c2 < 0 || c3 < 0 || c4 < 0) throw new Error("Base64字符无效");

    var n = (c1 << 18) | (c2 << 12) | (c3 << 6) | c4;
    bytes.push((n >>> 16) & 255);
    if (clean[i + 2] !== "=") bytes.push((n >>> 8) & 255);
    if (clean[i + 3] !== "=") bytes.push(n & 255);
  }

  return bytesToUtf8(bytes);
}

function parseEncodedJson(text) {
  if (text === undefined || text === null) throw new Error("响应体为空");
  var source = String(text).trim();
  if (!source) throw new Error("响应体为空");
  if (source.length > CONFIG.maxBodyLength) throw new Error("响应体超过安全限制");

  try {
    var parsed = JSON.parse(source);
    if (typeof parsed !== "string") return parsed;
    source = parsed;
  } catch (_) {}

  var decoded = base64DecodeUtf8(source);
  if (decoded.length > CONFIG.maxBodyLength) throw new Error("解码内容超过安全限制");
  return JSON.parse(decoded);
}

function buildBody(account, extra) {
  var data = {};
  var source = extra && typeof extra === "object" ? extra : {};
  Object.keys(source).forEach(function (key) {
    data[key] = source[key];
  });

  // 不同接口对MallID/MallId的大小写并不统一；调用方已指定时不覆盖。
  if (data.MallID === undefined && data.MallId === undefined) {
    data.MallID = Number(account.mallId);
  }

  data.Header = {
    Token: account.token,
    systemInfo: normalizeSystemInfo(account.systemInfo)
  };
  return JSON.stringify(data);
}

function postApi(path, account, extra, callback) {
  var params;
  try {
    params = {
      url: CONFIG.baseUrl + path,
      timeout: CONFIG.timeout,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.0 NetType/WIFI Language/zh_CN",
        "Referer": "https://servicewechat.com/"
      },
      body: buildBody(account, extra),
      "auto-cookie": false
    };
  } catch (e) {
    callback({ requestError: safeText(e.message, "构造请求失败") });
    return;
  }

  if (typeof $httpClient === "undefined" || !$httpClient || typeof $httpClient.post !== "function") {
    callback({ requestError: "当前环境不支持HTTP请求" });
    return;
  }

  var responseStarted = false;
  try {
    $httpClient.post(params, function (error, response, data) {
      responseStarted = true;
      if (error) {
        callback({ transportError: safeText(error, "未知网络错误") });
        return;
      }

      var status = response && Number(response.status || response.statusCode);
      if (!status || status < 200 || status >= 300) {
        callback({ httpError: status || 0, authFailure: status === 401 || status === 403 });
        return;
      }

      try {
        callback({ data: parseEncodedJson(data) });
      } catch (e) {
        callback({ parseError: safeText(e.message, "未知解析错误") });
      }
    });
  } catch (e) {
    if (responseStarted) throw e;
    callback({ transportError: safeText(e.message, "HTTP请求启动失败") });
  }
}

function responseText(obj) {
  try {
    return JSON.stringify(obj || {});
  } catch (_) {
    return String(obj || "");
  }
}

function isAuthFailure(result) {
  if (!result) return false;
  if (result.authFailure === true) return true;
  if (!result.data || typeof result.data !== "object") return false;
  var data = result.data;
  var d = data.d && typeof data.d === "object" && !Array.isArray(data.d) ? data.d : {};
  var text = [data.msg, data.message, data.e, d.Msg, d.msg, d.Message, d.message]
    .filter(function (value) { return value !== undefined && value !== null; })
    .join(" ")
    .toLowerCase();
  return /token|登录|登陆|授权|鉴权|认证|过期|失效|未登录|unauthor|forbidden/.test(text);
}

function apiMessage(data) {
  if (!data || typeof data !== "object") return "未知响应";
  var d = data.d && typeof data.d === "object" ? data.d : {};
  return safeText(d.Msg || d.msg || data.msg || data.message || data.e, "接口未返回说明");
}

function apiSucceeded(data) {
  return data && Number(data.m) === 1;
}

function isAlreadySigned(data, acceptStateFlag) {
  if (!data || typeof data !== "object") return false;
  var d = data.d && typeof data.d === "object" ? data.d : {};
  var message = apiMessage(data);
  return (acceptStateFlag === true && d.IsCheckIn === true) || (Number(data.m) === 2054 && /已签到/.test(message));
}

function maskMobile(value) {
  var text = safeText(value, "", 32);
  return text.replace(/(\d{3})\d{4}(\d{4})/g, "$1****$2");
}

function displayName(account, responseData) {
  var d = responseData && responseData.d && typeof responseData.d === "object" ? responseData.d : {};
  var mobile = maskMobile(d.Mobile || d.mobile || "");
  if (mobile) return mobile;
  return "账号" + account.id.split("@").pop();
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function formatNumber(value) {
  var n = Number(value);
  if (!isFinite(n)) return safeText(value, "未知");
  return Math.floor(n) === n ? String(n) : String(Math.round(n * 100) / 100);
}

function rewardFromSign(data) {
  var d = data && data.d && typeof data.d === "object" ? data.d : {};
  var message = safeText(d.Msg || d.msg, "");
  var matched = message.match(/(?:奖励|获得)\s*([0-9]+(?:\.[0-9]+)?)\s*([^，。\s]*)/);
  if (matched) return matched[1] + (matched[2] || "荟豆");

  if (hasValue(d.Content)) {
    if (Number(d.RewardType) === 1) return formatNumber(d.Content) + "荟豆";
    return safeText(d.Content, "接口未返回奖励数值");
  }
  return "接口未返回奖励数值";
}

function balanceFromCard(data) {
  var d = data && data.d && typeof data.d === "object" ? data.d : {};
  if (hasValue(d.Bonus)) return formatNumber(d.Bonus) + "荟豆";
  if (hasValue(d.TotalBonus)) return formatNumber(d.TotalBonus) + "荟豆";
  return "未返回";
}

function fetchCard(account, callback) {
  postApi("/api/user/user/GetUserAndMallCard", account, { MallId: Number(account.mallId) }, function (result) {
    if (isAuthFailure(result)) {
      callback({ ok: false, authFailure: true, text: apiMessage(result.data) });
      return;
    }
    if (result.transportError || result.httpError || result.parseError || result.requestError) {
      callback({ ok: false, text: "查询当前积分失败" });
      return;
    }
    if (!apiSucceeded(result.data)) {
      callback({ ok: false, text: apiMessage(result.data) });
      return;
    }

    callback({
      ok: true,
      name: displayName(account, result.data),
      balance: balanceFromCard(result.data),
      data: result.data
    });
  });
}

function appendBalance(account, lines, callback) {
  fetchCard(account, function (card) {
    if (card.ok) {
      if (card.name) lines[0] = card.name + lines[0].replace(/^[^：]+/, "");
      lines.push("当前积分：" + card.balance);
    } else if (card.authFailure) {
      lines.push("当前积分：查询失败（鉴权异常）");
    } else {
      lines.push("当前积分：查询失败");
    }
    callback(lines.join("\n"));
  });
}

function markAuthResult(accounts, id, authState) {
  for (var i = 0; i < accounts.length; i++) {
    if (accounts[i].id !== id) continue;
    if (authState === "valid") {
      accounts[i].authFailures = 0;
    } else if (authState === "invalid") {
      accounts[i].authFailures = (Number(accounts[i].authFailures) || 0) + 1;
    }
    break;
  }
}

function checkOne(account, callback) {
  postApi("/api/user/user/CheckinBefore", account, {
    MallId: Number(account.mallId),
    IsCheckMemberCard: true
  }, function (before) {
    var fallbackName = displayName(account, {});
    if (isAuthFailure(before)) {
      var authText = before.httpError ? "HTTP " + before.httpError + "（鉴权失败）" : apiMessage(before.data);
      callback({ ok: false, authState: "invalid", text: fallbackName + "：" + authText });
      return;
    }
    if (before.transportError) {
      callback({ ok: false, temporary: true, authState: "unknown", text: fallbackName + "：网络错误：" + before.transportError });
      return;
    }
    if (before.httpError) {
      callback({ ok: false, temporary: true, authState: "unknown", text: fallbackName + "：HTTP错误：" + before.httpError });
      return;
    }
    if (before.parseError || before.requestError) {
      callback({
        ok: false,
        temporary: true,
        authState: "unknown",
        text: fallbackName + "：" + (before.requestError ? "请求失败：" + before.requestError : "响应解析失败：" + before.parseError)
      });
      return;
    }

    var beforeData = before.data || {};
    var state = beforeData.d && typeof beforeData.d === "object" ? beforeData.d : {};
    var name = displayName(account, beforeData);

    if (isAlreadySigned(beforeData, true)) {
      var lines = [name + "：今日已签到"];
      appendBalance(account, lines, function (text) {
        callback({ ok: true, already: true, authState: "valid", text: text });
      });
      return;
    }
    if (!apiSucceeded(beforeData)) {
      callback({ ok: false, authState: "valid", text: name + "：" + apiMessage(beforeData) });
      return;
    }
    if (state.IsOpenCheckin === false) {
      callback({ ok: false, authState: "valid", text: name + "：签到活动未开放" });
      return;
    }
    if (state.IsOpenCheckinForPosition === true) {
      callback({ ok: false, authState: "valid", text: name + "：当前活动要求定位，定时脚本未伪造位置" });
      return;
    }

    postApi("/api/user/User/CheckinV2", account, {}, function (sign) {
      if (isAuthFailure(sign)) {
        var signAuthText = sign.httpError ? "HTTP " + sign.httpError + "（鉴权失败）" : apiMessage(sign.data);
        callback({ ok: false, authState: "invalid", text: name + "：" + signAuthText });
        return;
      }
      if (sign.transportError) {
        callback({ ok: false, temporary: true, authState: "valid", text: name + "：网络错误：" + sign.transportError });
        return;
      }
      if (sign.httpError) {
        callback({ ok: false, temporary: true, authState: "valid", text: name + "：HTTP错误：" + sign.httpError });
        return;
      }
      if (sign.parseError || sign.requestError) {
        callback({
          ok: false,
          temporary: true,
          authState: "valid",
          text: name + "：" + (sign.requestError ? "请求失败：" + sign.requestError : "响应解析失败：" + sign.parseError)
        });
        return;
      }

      var body = sign.data || {};
      var d = body.d && typeof body.d === "object" ? body.d : {};
      var message = apiMessage(body);
      var success = apiSucceeded(body) && (d.IsCheckIn === true || /签到成功|已签到/.test(message));

      if (isAlreadySigned(body, false)) {
        var alreadyLines = [displayName(account, body) + "：今日已签到"];
        appendBalance(account, alreadyLines, function (text) {
          callback({ ok: true, already: true, authState: "valid", text: text });
        });
      } else if (success) {
        var lines = [displayName(account, body) + "：签到成功"];
        lines.push("本次签到奖励：" + rewardFromSign(body));
        appendBalance(account, lines, function (text) {
          if (d.Desc) text += "\n发放说明：" + safeText(d.Desc, "");
          callback({ ok: true, authState: "valid", text: text });
        });
      } else {
        callback({ ok: false, authState: "valid", text: name + "：" + message });
      }
    });
  });
}

function runCheckin() {
  var initial = saveClean(readStore());
  var accounts = initial.accounts;

  if (!accounts.length) {
    var emptyText = "请先开启Loon MITM，再进入招商花园城微信小程序任意会员或签到页面。脚本会从请求体自动提取Token。";
    if (!initial.saved) emptyText += "\n本地存储当前不可写，请检查Loon持久化存储状态。";
    notify("未获取账号", emptyText);
    done();
    return;
  }

  var results = [];
  var index = 0;
  var successCount = 0;
  var failureCount = 0;

  function next() {
    if (index >= accounts.length) {
      var finalClean = saveClean(accounts);
      var removed = initial.removed + finalClean.removed;
      if (removed > 0) results.push("已自动清理" + removed + "条重复、过期或失效记录");
      if (!initial.saved || !finalClean.saved) results.push("本地账号状态保存失败，请检查Loon持久化存储");
      notify("执行完成（成功" + successCount + "，失败" + failureCount + "）", results.join("\n"));
      done();
      return;
    }

    var account = accounts[index++];
    checkOne(account, function (result) {
      markAuthResult(accounts, account.id, result.authState || "unknown");
      if (result.ok) successCount++;
      else failureCount++;
      results.push(result.text || (account.id + "：未知结果"));
      next();
    });
  }

  next();
}

function captureAccount() {
  try {
    if (!$request || !$request.body) {
      done({});
      return;
    }

    var payload = parseEncodedJson($request.body);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      done({});
      return;
    }
    var header = payload.Header || payload.header || {};
    var token = String(header.Token || header.token || "").trim();
    var mallId = Number(payload.MallID || payload.MallId || payload.mallID || payload.mallId || 0);

    if (token.length < 12 || token.length > CONFIG.maxTokenLength || !isFinite(mallId) || mallId <= 0 || Math.floor(mallId) !== mallId) {
      done({});
      return;
    }

    var accounts = cleanAccounts(readStore()).accounts;
    var id = accountId(token, mallId);
    var found = -1;
    var changed = false;

    for (var i = 0; i < accounts.length; i++) {
      if (accounts[i].id === id) {
        found = i;
        break;
      }
    }

    var systemInfo = normalizeSystemInfo(header.systemInfo || header.SystemInfo);
    if (found >= 0) {
      changed = accounts[found].token !== token || responseText(accounts[found].systemInfo) !== responseText(systemInfo);
    } else {
      changed = true;
    }

    var previousNoticeAt = found >= 0 ? Number(accounts[found].lastCaptureNoticeAt) || 0 : 0;
    var capturedAt = now();
    var shouldNotify = changed || capturedAt - previousNoticeAt >= CONFIG.captureNoticeInterval;
    var item = {
      id: id,
      mallId: mallId,
      token: token,
      systemInfo: systemInfo,
      updatedAt: capturedAt,
      authFailures: 0,
      lastCaptureNoticeAt: shouldNotify ? capturedAt : previousNoticeAt
    };

    if (found >= 0) {
      accounts[found] = item;
    } else {
      accounts.push(item);
    }

    var saved = saveClean(accounts);
    if (!saved.saved) {
      notify("账号保存失败", "无法写入Loon持久化存储，未确认账号是否保存成功。请检查存储状态后重新进入小程序。");
    } else if (shouldNotify) {
      notify(changed ? "Token获取成功" : "Token已刷新", "已保存账号" + id + "；当前有效记录" + saved.accounts.length + "个。仅保存Token、MallID和必要的systemInfo。");
    }
  } catch (e) {
    log("获取账号失败：" + safeText(e.message, "未知错误"));
  }

  done({});
}

if (typeof $request !== "undefined" && $request) {
  captureAccount();
} else {
  runCheckin();
}
