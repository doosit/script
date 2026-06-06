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

function escapeShellSingleQuoted(value) {
  return String(value).replace(/'/g, "'\\''");
}

function formatQinglongOutput(cookie) {
  return [
    `青龙变量名：${STORE_KEY}`,
    `青龙变量值：${cookie}`,
    '',
    `一行格式：${STORE_KEY}='${escapeShellSingleQuoted(cookie)}'`,
  ].join('\n');
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

  const qinglongOutput = formatQinglongOutput(cookie);
  notify(NAME, '获取鉴权成功，请复制到青龙', qinglongOutput);
  console.log(qinglongOutput);

  done();
})();
