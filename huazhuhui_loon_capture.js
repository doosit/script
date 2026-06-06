'use strict';

const NAME = '华住会';
const STORE_KEY = 'HZH_COOKIE';

function notify(title, subtitle, message) {
  if (typeof $notification !== 'undefined') {
    $notification.post(title, subtitle || '', message || '');
  } else {
    console.log(`${title}\n${subtitle || ''}\n${message || ''}`);
  }
}

function done(value) {
  if (typeof $done !== 'undefined') {
    $done(value || {});
  }
}

function readHeader(headers, name) {
  if (!headers) return '';
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || '';
}

(function capture() {
  if (typeof $request === 'undefined') {
    notify(NAME, '运行环境错误', '请将本脚本配置为 Loon http-request 脚本');
    done();
    return;
  }

  const method = String($request.method || '').toUpperCase();
  const url = String($request.url || '');

  if (method === 'OPTIONS') {
    done();
    return;
  }

  if (!/https:\/\/appgw\.huazhu\.com\/game\/sign_header/.test(url)) {
    done();
    return;
  }

  const cookie = readHeader($request.headers, 'Cookie');
  if (!cookie) {
    notify(NAME, '获取鉴权失败', '未在请求头中找到 Cookie，请确认已登录华住会 App 后再打开签到页面');
    done();
    return;
  }

  const saved = typeof $persistentStore !== 'undefined'
    ? $persistentStore.write(cookie, STORE_KEY)
    : false;

  if (saved) {
    notify(NAME, '获取鉴权成功', `已保存到 Loon 持久化键 ${STORE_KEY}\n青龙环境变量名同样填写 ${STORE_KEY}`);
  } else {
    notify(NAME, '获取鉴权成功', `Cookie 已捕获，请复制到青龙环境变量 ${STORE_KEY}`);
    console.log(cookie);
  }

  done();
})();
