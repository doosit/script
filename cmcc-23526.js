/* 移动爱购 23526 · Loon · v1.0.0
 * 使用当前页面请求的 phone，不内置、不持久保存抓包凭据。
 * mid / SKU id / mcdsId(specId) 是三个不同编号；只用真实映射加购。
 */
(function () {
  'use strict';
  var ORIGIN = 'https://dev.coc.10086.cn';
  var BASE = ORIGIN + '/coc3/coc3-market/';
  var ADD = BASE + 'api/market/external/shoppingCart/add';
  var BRIDGE = ORIGIN + '/coc3/__loon_mid23526/';
  var PAGE = /^https:\/\/dev\.coc\.10086\.cn\/coc3\/canvas\/rightsmarket-h5-canvas\/online\/(?:detail|newdetail2026)(?:\?|$)/;
  var MID = '23526';
  var done = false;
  function finish(value) { if (!done) { done = true; $done(value || {}); } }
  function log(message) { console.log('[23526] ' + message); }
  function header(headers, key) {
    var found = Object.keys(headers || {}).filter(function (k) { return k.toLowerCase() === key.toLowerCase(); })[0];
    return found ? headers[found] : '';
  }
  function clean(headers, names) {
    var result = {};
    Object.keys(headers || {}).forEach(function (k) { if (names.indexOf(k.toLowerCase()) < 0) result[k] = headers[k]; });
    return result;
  }
  function query(url, name) {
    var m = String(url).match(new RegExp('[?&]' + name + '=([^&#]*)'));
    try { return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : ''; } catch (_) { return ''; }
  }
  function pageScope(url) { return PAGE.test(url) && /^(23526|22409)$/.test(query(url, 'mid')); }
  function parse(body) { try { return JSON.parse(body || '{}'); } catch (_) { return null; } }
  function reply(object, status) {
    finish({response:{status:status || 200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},body:JSON.stringify(object)}});
  }
  function nativeFail(message) {
    log('加购已停止：' + message);
    reply({resultCode:-23526,msg:message,data:false}, 409);
  }
  function jsonCall(method, url, phone, body, callback) {
    var options = {url:url,headers:{phone:phone,Accept:'application/json',Referer:ORIGIN+'/coc3/canvas/rightsmarket-h5-canvas/online/detail?mid='+MID},timeout:8000,'auto-cookie':false,'auto-redirect':false,insecure:false};
    if (body) { options.body = JSON.stringify(body); options.headers['Content-Type'] = 'application/json'; options.headers.Origin = ORIGIN; }
    $httpClient[method](options, function (error, response, text) {
      if (done) return;
      var status = Number(response && (response.status || response.statusCode));
      var object = !error && status >= 200 && status < 300 ? parse(text) : null;
      callback(object, error ? '网络请求失败' : !object ? 'HTTP或JSON响应异常' : '');
    });
  }
  function normalize(object) {
    if (!object || object.success === false || String(object.code) !== '0' || !object.data || String(object.data.mid) !== MID) return null;
    var data = object.data, skus = [], seen = {};
    // 抓包证实的层级：tcList -> [tcTwoList] -> payTypeList -> skuList。
    function walk(value, labels) {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) { value.forEach(function (v) { walk(v, labels); }); return; }
      var next = labels.slice();
      if (value.tcRemark) next.push(String(value.tcRemark));
      if (Array.isArray(value.skuList)) value.skuList.forEach(function (sku) {
        var specId = String(sku.mcdsId || '');
        if (!/^\d{10,40}$/.test(specId) || seen[specId]) return;
        seen[specId] = true;
        skus.push({skuId:sku.id,specId:specId,name:String(sku.showName || sku.name || next.join(' / ') || '商品规格'),price:sku.originPrice == null ? null : Number(sku.originPrice),available:String(sku.isUse) !== '0' && sku.isProvinceOnline !== false && sku.isProvinceOnline !== 'false',reason:sku.notPassReason || ''});
      });
      ['tcList','tcTwoList','payTypeList'].forEach(function (key) { if (value[key]) walk(value[key], next); });
    }
    walk(data, []);
    return {mid:Number(MID),name:String(data.name || '商品23526'),image:data.cdnUrl || '',skus:skus};
  }
  function resolve(phone, callback) {
    var paths = ['getProductByMidNew','getProductByMid'], messages = [];
    function attempt(index) {
      jsonCall('get', BASE+'arrange/salePage/'+paths[index]+'?mid='+MID+'&t='+Date.now(), phone, null, function (object, error) {
        var product = normalize(object);
        if (product && product.skus.length) return callback(product, '');
        messages.push(error || (object && object.code != null ? String(object.code) : '无有效规格'));
        if (index + 1 < paths.length) return attempt(index + 1);
        callback(null, '商品23526详情不可用（'+messages.join(' / ')+'），无法确定真实specId；未提交加购');
      });
    }
    attempt(0);
  }
  function choose(product, specId) {
    var valid = product.skus.filter(function (sku) { return sku.available; });
    if (specId) return valid.filter(function (sku) { return sku.specId === String(specId); })[0] || null;
    return valid.length === 1 ? valid[0] : null;
  }
  function offer(sku, pageId) {
    return {specId:sku.specId,offerName:sku.name,number:1,offerAttrList:[{attrKey:'selfChannelCode',attrValue:pageId},{attrKey:'rulecode'},{attrKey:'referer',attrValue:'newdetail2026'}]};
  }
  try {
    if (typeof $request === 'undefined' || !$request || typeof $request.url !== 'string' || !/^https?:\/\//.test($request.url)) return finish({});
    var request = $request, url = request.url;
    var isResponse = typeof $response !== 'undefined' && $response;
    var isBridge = url.indexOf(BRIDGE) === 0 && /^(?:info|add)$/.test(url.slice(BRIDGE.length));
    if (!isResponse && isBridge) {
      var input = parse(request.body), phone = header(request.headers, 'phone');
      if (String(request.method).toUpperCase() !== 'POST') return reply({ok:false,message:'该本地桥接仅支持POST'},405);
      if (!phone) return reply({ok:false,message:'尚未取得当前页面登录信息，请在移动APP内重新打开商品页'},401);
      if (!input) return reply({ok:false,message:'请求格式错误'},400);
      var action = url.slice(BRIDGE.length);
      return resolve(phone, function (product, error) {
        if (!product) return reply({ok:false,message:error});
        if (action === 'info') return reply({ok:true,product:product});
        var sku = choose(product, input.specId);
        if (!sku) return reply({ok:false,message:'目标规格无效、不可售或存在多个规格，请先刷新并选择目标商品规格'});
        var pageId = /^[A-Za-z0-9_-]{1,80}$/.test(String(input.pageId || '')) ? String(input.pageId) : 'P00000058871';
        var body = {userMobile:phone,pageId:pageId,orderBusiInfo:[{busiType:'C3',offerList:[offer(sku,pageId)]}]};
        log('按钮加购：mid=23526，已核对真实规格');
        jsonCall('post', ADD, phone, body, function (result, networkError) {
          var success = !!result && String(result.resultCode) === '0' && result.data === true;
          log('按钮加购结果：'+(success ? '成功' : '失败'));
          reply({ok:success,message:success ? '商品23526已加入购物车' : (networkError || String(result && result.msg || '服务端拒绝加购')),resultCode:result && result.resultCode});
        });
      });
    }
    if (!isResponse && pageScope(url)) {
      var requestHeaders = clean(request.headers,['if-none-match','if-modified-since','accept-encoding']);
      requestHeaders['Cache-Control'] = 'no-cache';
      requestHeaders['Accept-Encoding'] = 'identity';
      return finish({headers:requestHeaders});
    }
    if (!isResponse && url.split('?')[0] === ADD && String(request.method).toUpperCase() === 'POST' && pageScope(header(request.headers,'referer'))) {
      var original = parse(request.body), currentPhone = header(request.headers,'phone');
      var groups = original && original.orderBusiInfo;
      if (!original || !currentPhone || !Array.isArray(groups) || groups.length !== 1 || groups[0].busiType !== 'C3' || !Array.isArray(groups[0].offerList) || groups[0].offerList.length !== 1) return nativeFail('请求结构或登录信息不完整，请使用页面新增的23526按钮');
      if (original.userMobile !== currentPhone) return nativeFail('当前请求账号信息不一致，请重新打开页面');
      return resolve(currentPhone, function (product, error) {
        if (!product) return nativeFail(error);
        var oldOffer = groups[0].offerList[0];
        var selected = choose(product,oldOffer.specId) || choose(product,'');
        if (!selected) return nativeFail('23526存在多个可用规格或无可售规格，请使用新增按钮选择');
        oldOffer.specId = selected.specId;
        oldOffer.offerName = selected.name;
        log('原生加购：已替换为23526的真实规格，保留数量和渠道');
        finish({body:JSON.stringify(original),headers:clean(request.headers,['content-length'])});
      });
    }
    if (isResponse && pageScope(url)) {
      var html = $response.body;
      if (Number($response.status) !== 200 || typeof html !== 'string' || !/<html[\s>]/i.test(html) || html.indexOf('loon-mid23526-panel') >= 0) return finish({});
      var injected = '<script data-loon="loon-mid23526-panel">;('+pageMain.toString()+')();</script>';
      html = html.replace(/<head\b[^>]*>/i,function (tag) { return tag+injected; });
      var responseHeaders = clean($response.headers,['content-length','content-encoding','etag','last-modified','content-security-policy','content-security-policy-report-only']);
      responseHeaders['Cache-Control'] = 'no-store';
      log('已注入23526商品面板');
      return finish({body:html,headers:responseHeaders});
    }
    finish({});
  } catch (_) {
    log('脚本处理异常');
    if (typeof isBridge !== 'undefined' && isBridge) reply({ok:false,message:'Loon脚本处理异常，请查看脚本日志'},500);
    else if (typeof url === 'string' && url.split('?')[0] === ADD && pageScope(header($request.headers,'referer'))) nativeFail('脚本处理异常，未提交加购');
    else finish({});
  }

  // 以下函数在网页中运行；账号只在该页面内存中使用，不写入存储。
  function pageMain() {
    'use strict';
    if (window.__loon23526) return;
    window.__loon23526 = true;
    var phone = '', channel = '', busy = false, booted = false, pending = false;
    var product = null, panel, message, select, addButton, refreshButton;
    var targetPage = /[?&]mid=23526(?:&|$)/.test(location.search);
    var originalFetch = window.fetch.bind(window);
    var bridge = '/coc3/__loon_mid23526/';
    var count = 0;
    function observe(value) {
      if (!value || typeof value !== 'string') return;
      if (phone !== value) {
        phone = value; product = null;
        if (select) { select.textContent = ''; addButton.disabled = true; }
        if (booted && !busy) load(); else pending = true;
      }
    }
    function inspectBody(body) {
      if (typeof body !== 'string') return;
      try {
        var object = JSON.parse(body);
        if (object.pageId) channel = String(object.pageId);
      } catch (_) {}
    }
    var open = XMLHttpRequest.prototype.open;
    var setHeader = XMLHttpRequest.prototype.setRequestHeader;
    var send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method,url) {
      this.__loon23526URL = String(url);
      return open.apply(this,arguments);
    };
    XMLHttpRequest.prototype.setRequestHeader = function (key,value) {
      if (String(key).toLowerCase() === 'phone' && /^(?:\/coc3\/|https:\/\/dev\.coc\.10086\.cn\/coc3\/)/.test(this.__loon23526URL || '')) observe(String(value));
      return setHeader.apply(this,arguments);
    };
    XMLHttpRequest.prototype.send = function (body) {
      if (/^(?:\/coc3\/|https:\/\/dev\.coc\.10086\.cn\/coc3\/)/.test(this.__loon23526URL || '')) inspectBody(body);
      return send.apply(this,arguments);
    };
    window.fetch = function (input,init) {
      var url = typeof input === 'string' ? input : input && input.url || '';
      if (/^(?:\/coc3\/|https:\/\/dev\.coc\.10086\.cn\/coc3\/)/.test(url)) {
        try { observe(new Headers(init && init.headers || input && input.headers || {}).get('phone')); } catch (_) {}
        inspectBody(init && init.body);
      }
      return originalFetch.apply(window,arguments);
    };
    try { channel = new URL(location.href).searchParams.get('channelCode') || ''; } catch (_) {}
    function setMessage(text) { if (message) message.textContent = text; }
    function lock(value) {
      busy = value;
      if (refreshButton) refreshButton.disabled = value;
      if (select) select.disabled = value || !product;
      if (addButton) addButton.disabled = value || !product || !select.value;
      if (!value && pending) { pending = false; load(); }
    }
    function call(action,body) {
      return originalFetch(bridge+action,{method:'POST',headers:{'Content-Type':'application/json',phone:phone},credentials:'same-origin',cache:'no-store',body:JSON.stringify(body || {})}).then(function (response) {
        return response.json().catch(function () { throw new Error('本地桥接未生效，请检查Loon插件、MITM和脚本路径'); });
      });
    }
    function load() {
      if (busy) { pending = true; return; }
      if (!phone) { setMessage('等待当前页面登录信息；请在移动APP内打开并完成登录。'); return; }
      pending = false;
      var activePhone = phone;
      lock(true); product = null; select.textContent = ''; addButton.disabled = true;
      setMessage('正在读取商品23526的真实规格…');
      call('info',{}).then(function (result) {
        if (activePhone !== phone) return;
        if (!result.ok) { setMessage(result.message || '商品详情读取失败'); return; }
        product = result.product;
        panel.querySelector('[data-title]').textContent = product.name+' · 23526';
        product.skus.forEach(function (sku) {
          var option = document.createElement('option');
          option.value = sku.specId;
          option.disabled = !sku.available;
          option.textContent = sku.name+(sku.price == null ? '' : '（标价 ¥'+(sku.price/100).toFixed(2)+'）')+(!sku.available ? ' · 不可售' : '');
          select.appendChild(option);
        });
        var valid = product.skus.filter(function (sku) { return sku.available; });
        if (valid.length) select.value = valid[0].specId;
        else select.selectedIndex = -1;
        setMessage(valid.length ? '已读取真实规格。点击下方按钮将此规格加入购物车，数量1。' : '商品有规格，但当前没有可售规格。');
      }).catch(function (error) { setMessage(error.message || '网络错误，请重试'); }).then(function () { lock(false); });
    }
    function add() {
      if (busy || !product || !select.value) return;
      var activePhone = phone;
      lock(true); setMessage('正在加入购物车，请勿重复点击…');
      call('add',{specId:select.value,pageId:channel}).then(function (result) {
        if (activePhone !== phone) return;
        setMessage(result.message || (result.ok ? '加购成功' : '加购失败'));
      }).catch(function (error) { setMessage(error.message || '网络错误，请到购物车核对后再决定是否重试'); }).then(function () { lock(false); });
    }
    function boot() {
      if (booted || !document.body) return;
      booted = true;
      var style = document.createElement('style');
      style.textContent = '#loon-mid23526-panel{position:fixed;z-index:2147483646;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));box-sizing:border-box;background:#fff;color:#202938;border:1px solid #dce3ed;border-radius:16px;box-shadow:0 5px 24px #25365630;padding:16px;font:14px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;max-height:70vh;overflow:auto}#loon-mid23526-panel *{box-sizing:border-box}#loon-mid23526-panel strong{font-size:17px;display:block;padding-right:32px}#loon-mid23526-panel p{margin:9px 0;color:#526173;white-space:pre-wrap;overflow-wrap:anywhere}#loon-mid23526-panel select{width:100%;padding:10px;border:1px solid #dce3ed;border-radius:8px;background:#fff;color:#202938}#loon-mid23526-panel button{min-height:42px;padding:8px 14px;border:0;border-radius:9px;font-size:14px;background:#eaf0f8;color:#245686}#loon-mid23526-panel button:disabled{opacity:.45}#loon-mid23526-panel [data-add]{flex:1;background:#0873e8;color:#fff}#loon-mid23526-panel .loon-actions{display:flex;gap:8px;margin-top:10px}#loon-mid23526-panel [data-fold]{position:absolute;right:10px;top:8px;background:transparent;min-height:32px;padding:4px 8px}#loon-mid23526-panel small{display:block;margin-top:8px;color:#65758a}body{padding-bottom:280px!important}';
      document.head.appendChild(style);
      panel = document.createElement('aside'); panel.id = 'loon-mid23526-panel';
      panel.setAttribute('aria-label','商品23526辅助面板');
      panel.innerHTML = '<strong data-title>商品23526</strong><button type="button" data-fold aria-label="收起或展开">收起</button><div data-content><p data-message role="status" aria-live="polite"></p><select aria-label="目标商品规格" disabled></select><div class="loon-actions"><button type="button" data-refresh>刷新规格</button><button type="button" data-add disabled>加入购物车 · 23526</button></div><small>仅加购，不自动下单。实际价格和资格以购物车为准。</small></div>';
      document.body.appendChild(panel);
      message = panel.querySelector('[data-message]'); select = panel.querySelector('select');
      refreshButton = panel.querySelector('[data-refresh]'); addButton = panel.querySelector('[data-add]');
      refreshButton.onclick = load; addButton.onclick = add;
      select.onchange = function () { addButton.disabled = busy || !select.value; };
      panel.querySelector('[data-fold]').onclick = function () {
        var content = panel.querySelector('[data-content]'); content.hidden = !content.hidden;
        this.textContent = content.hidden ? '展开' : '收起';
      };
      if (targetPage) document.title = '商品23526 · 移动爱购';
      load();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
    // 防止页面框架重建body后丢失面板；有上限，避免长期后台轮询。
    function check() { if (booted && !document.getElementById('loon-mid23526-panel')) { booted = false; boot(); } if (++count < 20) setTimeout(check,1000); }
    setTimeout(check,1000);
  }
})();
