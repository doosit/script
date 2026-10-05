/**
 * ============================================================================
 * 海底捞 ·「好礼天天兑」碎片商店 自动兑换  (独立脚本, 可与 hdl.plugin 一起使用)
 * ============================================================================

/* ============================== ① 配置区 ============================== */
const CFG = {
    /* ---- 关键词(核心): 按数组顺序依次查询, 命中且碎片够就兑换 ---- */
    /* 字符串 = 包含匹配, 也支持正则字符串如 "/^捞派/" ; 对象可单独指定该关键词最多兑几件 */
    KEYWORDS: [
        "捞派魔芋素",
        "巴沙鱼",
        "捞派鸭肠",
        // { name: "毛肚", max: 1 },
    ],

    /* 命中即跳过的商品名关键词(黑名单), 例如不想兑立减券可填: ["立减","代金","折扣"] */
    EXCLUDE_KEYWORDS: [],

    /* ---- 限兑风控(默认保守: 每次最多 1 件, 每天最多 1 件) ---- */
    /* 想"依次把多个关键词商品都兑掉"就把下面两个都改成 0, 此时只受碎片余额约束 */
    MAX_EXCHANGE_PER_RUN: 1,   // 单账号单次运行最多兑换件数, 0 = 不限(仅受碎片和每日上限约束)
    MAX_EXCHANGE_PER_DAY: 1,   // 单账号每天最多兑换件数, 0 = 不限
    MAX_PER_KEYWORD: 1,        // 每个关键词默认最多兑换件数(string 形式关键词用这个值)

    /* ---- 碎片阈值 ---- */
    MAX_CONSUME_AMOUNT: 0,     // 单件最多消耗多少碎片, 0 = 不限(防止一票梭哈)
    MIN_KEEP_FRAGMENTS: 0,     // 兑换后至少保留多少碎片, 0 = 不留

    /* ---- 行为开关 ---- */
    DO_SIGNIN: true,               // 先复用签到逻辑签到(保证碎片最新, 重复签到无副作用)
    REQUIRE_PAY_STATUS: false,      // true = 必须 commodityPayStatus===1 才兑(更严); false = 纯按碎片数判断(推荐)
    SKIP_ALREADY_EXCHANGED: true,   // 跳过本周期内已兑换过的商品(commodityMemberExchangeCount>0)
    AUTO_LOWEST_WHEN_EMPTY: false,  // 关键词全都没命中时, 是否兜底兑"最便宜的碎片够的商品"

    /* ---- 关键词优先级策略(默认严格优先级) ---- */
    /* false = 严格优先级(默认): 第一个"本期有货"的关键词碎片不够, 本次就什么都不兑,
     *         绝不降级去买后面的便宜货, 攒着等它
     *         例: [魔芋, 鸭肠, 沙沙土豆] 碎片只够土豆 -> 不兑, 继续攒
     *         注意: 只有"碎片不够"才拦住; 高优先级商品本期已兑过/不可兑时会正常往下走
     * true  = 高优先级关键词碎片不够时, 继续往下试后面的关键词
     *         例: [魔芋, 鸭肠, 沙沙土豆] 碎片只够土豆 -> 兑土豆 */
    FALLTHROUGH_WHEN_UNAFFORDABLE: false,

    DRY_RUN: false,                 // true = 只报告将要兑换什么, 不真正下单(先试运行)
    DEBUG_LIST: false,              // true = 日志打印完整商品清单

    /* ---- 活动 ID ---- */
    /* 留空 = 自动从 /signin/querySite 的 convertUrl 解析(每次活动期会变, 推荐留空)
       形如 https://superapp-public.kiwa-tech.com/app-prize-shop/#/index/NkNVLzQwNmhIbTg9 取末段 */
    EXCHANGE_ACTIVITY_ID: "",
    CONSUME_UNIT_ID: 0,             // 碎片单位, 0 = 用商品清单里的 consumeUnitId(抓到的是 1)

    /* ---- 请求节奏(避免风控) ---- */
    DELAY_MIN: 1200,
    DELAY_MAX: 3200,
    REQUEST_TIMEOUT: 20000,   // 单个请求超时(ms); 兑换超时≠失败, 脚本会复查余额再判定
    READ_RETRY: 2,            // 只读接口(查碎片/查清单等)失败重试次数; 兑换接口不重试
    MAX_RUNTIME: 90000,       // 总预算(ms): 超预算就不再发请求并正常收尾, 避免被 cron 超时硬杀
};

/* ============================ ② 常量 / 环境 ============================ */
const SCRIPT_VERSION = "2026-10-05.r3";

const $ = new Env("海底捞·好礼天天兑");
$.log(`[INFO] 兑换脚本版本 ${SCRIPT_VERSION}`);

const TOKEN_KEY = "hdl_data";            // 与签到脚本共用同一个存储键 => 复用鉴权
const STATE_KEY = "hdl_exchange_state";  // 防重复兑换 / 每日计数的持久化状态
const CLEAR_KEY = "hdl_clear";           // 与签到脚本一致的清空标记(置 true 后下次运行清 token)

const Notify = 1;
const notify = $.isNode() ? require('./sendNotify') : '';

let envSplitor = ["@"];
let userCookie = ($.isNode() ? process.env[TOKEN_KEY] : $.getdata(TOKEN_KEY)) || '';
let userList = [];
let userIdx = 0;
let userCount = 0;
$.is_debug = ($.isNode() ? process.env.IS_DEDUG : $.getdata('is_debug')) || 'false';
$.notifyMsg = [];
$.barkKey = ($.isNode() ? process.env["bark_key"] : $.getdata("bark_key")) || '';

const HOST = 'superapp-public.kiwa-tech.com';
const BASE = `https://${HOST}`;

const API = {
    signin: `${BASE}/activity/wxapp/signin/signin`,
    queryFragment: `${BASE}/activity/wxapp/signin/queryFragment`,
    querySite: `${BASE}/activity/wxapp/signin/querySite`,
    querySwitch: `${BASE}/activity/wxapp/signin/querySwitch`,
    query: `${BASE}/activity/wxapp/signin/query`,
    exActivity: `${BASE}/activity/wxapp/exchange/queryExchangeActivity`,
    exList: `${BASE}/activity/wxapp/exchange/queryCommodityList`,
    exInfo: `${BASE}/activity/wxapp/exchange/queryCommodityInfo`,
    exTotal: `${BASE}/activity/wxapp/exchange/getTotalByUnitId`,
    exDo: `${BASE}/activity/wxapp/exchange/exchangeCommodity`,
};

/* 抓包得到的小程序端指纹, 兑换接口依赖这一组头; 换设备/换小程序版本时可重抓后替换 */
const UA_SIGNIN = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.73(0x18004926) NetType/WIFI Language/zh_CN miniProgram/wx1ddeb67115f30d1a';
const UA_EXCHANGE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.79(0x18004f26) NetType/WIFI Language/zh_CN';
const SM_DEVICE_ID = 'BfCNcrDgyalPpAfMNNvX2nRyKvdRGiXEsPklKF5xwtr34Dcct6nQamL5OQFrpsq9wmRzBqG0CmLGN85cqbHz1MA==';
const APP_VERSION = '4.93.1';
const REFERER_EXCHANGE = 'https://servicewechat.com/wx1ddeb67115f30d1a/344/page-frame.html';

/* ============================== ③ 主流程 ============================== */
async function main() {
    console.log('\n================== 任务 ==================\n');
    for (let user of userList) {
        if (overBudget()) {
            $.notifyMsg.push(`⏳已超出运行预算(${Math.round(CFG.MAX_RUNTIME / 1000)}s), 账号${user.index} 起跳过`);
            break;
        }
        await user.run();
        await $.wait(user.getRandomTime());
    }
}

class UserInfo {
    constructor(str) {
        this.index = ++userIdx;
        this.token = String(str).trim();
        this.ckStatus = true;
        this.acct = acctId(this.token);
        this.unitId = CFG.CONSUME_UNIT_ID || 0;
    }

    getRandomTime() {
        return randomInt(CFG.DELAY_MIN, CFG.DELAY_MAX);
    }

    /* -------- 鉴权头: 完全复用签到脚本 -------- */
    buildHeaders() {
        return {
            'Host': HOST,
            'deviceid': 'null',
            'accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'user-agent': UA_SIGNIN,
            'reqtype': 'APPH5',
            '_haidilao_app_token': this.token,
            'origin': BASE,
            'sec-fetch-site': 'same-origin',
            'sec-fetch-mode': 'cors',
            'sec-fetch-dest': 'empty',
            'referer': `${BASE}/app-sign-in/?SignInToken=${this.token}&source=MiniApp`,
        };
    }

    /* -------- 碎片商店头: 按 HAR 原样复刻 -------- */
    /* 注意: 刻意不带 Connection / Accept-Encoding, 交给客户端自己协商与解压,
       避免手动声明 br 后客户端解不开导致 JSON 解析失败 */
    buildExchangeHeaders() {
        return {
            'Host': HOST,
            'user-agent': UA_EXCHANGE,
            'platformName': 'wechat',
            'X-Omp-PlatformType': 'WECHAT',
            'X-Omp-Device-Ip': '127.0.0.1',
            'content-type': 'application/json',
            '_HAIDILAO_APP_TOKEN': this.token,
            'X-Omp-Device-Mac': '00:00:00:00:00:00',
            'appVersion': APP_VERSION,
            'SMDeviceID': SM_DEVICE_ID,
            'X-Omp-ChannelType': 'MINI_APP',
            'appName': 'HDLMember',
            'X-Omp-Brand-Code': '211',
            'X-Omp-Device-Type': 'wechat',
            'appId': '15',
            'referer': REFERER_EXCHANGE,
        };
    }

    /* 发起一次请求, 返回信封 { ok, status, data, raw, err, ms } */
    async call(url, body, kind) {
        /* 空 body 必须是真正的空(POST + Content-Length: 0), 与抓包一致 */
        const empty = (body === null || body === '' || typeof body === 'undefined');
        const options = {
            url,
            headers: kind === 'ex' ? this.buildExchangeHeaders() : this.buildHeaders(),
            body: empty ? '' : JSON.stringify(body),
        };
        const r = await rawRequest(options, undefined, CFG.REQUEST_TIMEOUT);
        debug(`[${this.index}] ${shortApi(url)} ${r.ok ? 'OK' : 'FAIL'} ${r.status || ''} ${r.ms}ms <= ${r.raw || r.err || ''}`);
        this.last = r;
        return r;
    }

    /* 只读接口: 失败(网络/超时/被 WAF 拦成 HTML)自动重试, 返回 data 或 undefined */
    async read(url, body, kind) {
        let r = null;
        for (let i = 0; i < Math.max(1, CFG.READ_RETRY); i++) {
            r = await this.call(url, body, kind);
            if (r.ok && r.data) return r.data;
            if (r.status === 401 || r.status === 403) break;   // 鉴权类不重试
            if (i < CFG.READ_RETRY - 1 && !overBudget()) {
                $.log(`[${this.index}] ${shortApi(url)} 第${i + 1}次失败(${r.err || 'HTTP ' + r.status}), 稍后重试`);
                await $.wait(this.getRandomTime());
            } else break;
        }
        this.reportFail(url, r);
        return undefined;
    }

    /* 真实运行排障: 把 HTTP 状态/错误/响应片段打进日志 */
    reportFail(url, r) {
        if (!r) return;
        const extra = r.raw ? ` | 响应片段: ${r.raw}` : '';
        $.log(`[ERROR] 账号${this.index} ${shortApi(url)} 失败: ${r.err || ('HTTP ' + r.status)}${extra}`);
    }

    /* token 失效判定, 与签到脚本一致 */
    isAuthFail(result) {
        if (!result) return false;
        return result.code === 'unauthorized' || /token|登录|未授权|重新登录/i.test(result.msg || '');
    }

    /* -------------------- 1. 签到(复用签到逻辑) -------------------- */
    /* 签到接口幂等: 重复调用只会返回"今日已签", 所以允许重试 */
    async signin() {
        try {
            const result = await this.read(API.signin, { signinSource: 'MiniApp' });
            if (!result) return '❌签到无响应';
            if (this.isAuthFail(result)) {
                this.ckStatus = false;
                return `❌${result.msg || 'token 失效'}`;
            }
            if (result.success === true) {
                const list = result?.data?.signinQueryDetailList || [];
                const today = list.find(x => x.currentOr === 1);
                if (today) {
                    if (today.dailySigninStatus === 1) return '✨今日已签';
                    return `✅签到成功,+${today.fragment || 0}🧩,连签${today.daysSeries || 0}天`;
                }
                return '✅签到成功';
            }
            return `❌${result.msg || '签到失败'}`;
        } catch (e) {
            return `❌签到异常 ${e}`;
        }
    }

    /* -------------------- 2. 查碎片总数(复用签到逻辑) -------------------- */
    async queryFragment() {
        const result = await this.read(API.queryFragment, '');
        if (!result) return null;
        if (result.success === true) {
            const n = Number(result?.data?.total);
            if (isNaN(n)) { $.log(`[${this.index}] queryFragment total 异常: ${JSON.stringify(result.data)}`); return null; }
            return Object.assign({}, result.data, { total: n });
        }
        if (this.isAuthFail(result)) { this.ckStatus = false; return null; }
        $.log(`[${this.index}] queryFragment 业务失败: ${result.msg || result.code}`);
        return null;
    }

    /* -------------------- 3. 从 querySite 解析当期兑换活动 ID -------------------- */
    async querySite() {
        const result = await this.read(API.querySite, '');
        if (!result) return '';
        if (result.success !== true) {
            if (this.isAuthFail(result)) this.ckStatus = false;
            return '';
        }
        const url = String(result?.data?.convertUrl || '');
        const id = parseActivityId(url);
        if (id) $.log(`[${this.index}] 解析到兑换活动 ID: ${id}`);
        else $.log(`[${this.index}] convertUrl 无法解析活动 ID: ${url || '(空)'}`);
        return id;
    }

    /* -------------------- 4. 兑换活动信息 -------------------- */
    async queryActivity(actId) {
        const result = await this.read(API.exActivity, { id: actId }, 'ex');
        if (!result) return null;
        if (this.isAuthFail(result)) { this.ckStatus = false; return null; }
        if (result.success !== true) {
            $.log(`[${this.index}] 兑换活动不可用: ${result.msg || result.code}`);
            return null;
        }
        return result.data || null;
    }

    /* -------------------- 5. 商品清单 -------------------- */
    async queryList(actId) {
        const result = await this.read(API.exList, { exchangeActivityId: actId }, 'ex');
        if (!result) return null;
        if (this.isAuthFail(result)) { this.ckStatus = false; return null; }
        if (result.success !== true) {
            $.log(`[${this.index}] queryCommodityList 失败: ${result.msg || result.code}`);
            return null;
        }
        const list = result?.data?.commodityDetailList;
        return Array.isArray(list) ? list : null;
    }

    /* -------------------- 6. 剩余可用碎片(兑换口径) -------------------- */
    async getTotal(unitId) {
        const result = await this.read(API.exTotal, { consumeUnitId: unitId || 1 }, 'ex');
        if (!result) return null;
        if (this.isAuthFail(result)) { this.ckStatus = false; return null; }
        if (result.success !== true) return null;
        const n = Number(result?.data?.total);
        return isNaN(n) ? null : n;
    }

    /* -------------------- 7. 下单兑换(不重试: 必须靠复查余额判成败) -------------------- */
    async exchange(commodityId, actId) {
        const env = await this.call(API.exDo, {
            commodityId: commodityId,
            exchangeActivityId: actId,
            exchangeResource: '',
        }, 'ex');
        if (!env.ok) {
            /* 超时/网络错误/非 JSON 都不能断言失败, 交给调用方复查余额 */
            return { ok: false, unknown: true, msg: env.err || `HTTP ${env.status}` };
        }
        const result = env.data;
        if (this.isAuthFail(result)) {
            this.ckStatus = false;
            return { ok: false, msg: result.msg || 'token 失效', auth: true };
        }
        if (result.success !== true) {
            return { ok: false, msg: result.msg || `code=${result.code}` };
        }
        const d = result.data || {};
        return {
            ok: true,
            msg: d.validateCodeDesc || '兑换成功',
            code: d.validateCode,
        };
    }

    /* -------------------- 7b. 兑换 + 对账 --------------------
     * 真实网络的坑: 请求超时/连接被掐断时, 服务端可能已经扣了碎片。
     * 所以不论响应成功与否, 都用 getTotalByUnitId 复查余额来定成败:
     *   响应成功 + 余额下降 -> 确认成功
     *   响应成功 + 余额不变 -> 受理但未观察到扣减(可能延迟), 提示去小程序核对
     *   响应异常 + 余额下降 -> 实际已兑换(响应丢了), 判定成功, 避免重复下单
     *   响应失败 + 余额不变 -> 真失败
     */
    async settleExchange(c, actId, balance, tag) {
        const cost = Number(c.consumeAmount);
        let r;
        try {
            r = await this.exchange(c.id, actId);
        } catch (e) {
            r = { ok: false, unknown: true, msg: `异常 ${(e && e.message) || e}` };
        }

        /* token 已失效就不用再对账了 */
        if (r.auth) {
            DoubleLog(`❌${tag} >> 「${c.commodityName}」兑换失败: ${r.msg}`);
            return { done: false, balance, auth: true };
        }

        await $.wait(this.getRandomTime());
        const after = await this.getTotal(this.unitId);
        const dropped = (after !== null && after < balance);
        const newBalance = (after !== null) ? after : (r.ok ? Math.max(0, balance - cost) : balance);

        if (r.ok || r.unknown || dropped) {
            if (r.ok && after !== null && !dropped) {
                DoubleLog(`⚠️${tag} >> 「${c.commodityName}」服务端返回成功但碎片未减少(可能延迟入账), 请到小程序【我的-优惠券】核对`);
            } else if (!r.ok && dropped) {
                DoubleLog(`✅${tag} >> 「${c.commodityName}」响应异常(${r.msg})但碎片已扣减 ${balance}->${after}, 判定兑换成功`);
            } else {
                DoubleLog(`✅${tag} >> 兑换成功「${c.commodityName}」-${cost}🧩, ${r.msg}${r.code ? `(${r.code})` : ''}${after !== null ? `, 剩余${after}🧩` : ''}`);
            }
            return { done: true, balance: newBalance, confirmed: dropped, auth: r.auth === true };
        }

        DoubleLog(`❌${tag} >> 「${c.commodityName}」兑换失败: ${r.msg}${after !== null ? `(碎片仍为 ${after})` : ''}`);
        return { done: false, balance: newBalance, auth: r.auth === true };
    }

    /* -------------------- 8. 单个账号完整流程 -------------------- */
    async run() {
        const tag = `账号${this.index}`;

        /* 8.1 签到 */
        let signMsg = '⏭️跳过签到';
        if (CFG.DO_SIGNIN) {
            signMsg = await this.signin();
            debug(`[${tag}] signin raw: ${signMsg}`);
            if (!this.ckStatus) {
                DoubleLog(`❌${tag} >> ${signMsg}`);
                return;
            }
            await $.wait(this.getRandomTime());
        }

        /* 8.2 当前碎片 */
        const frag = await this.queryFragment();
        if (!this.ckStatus) {
            DoubleLog(`❌${tag} >> ${signMsg} (token 失效, 请重新抓取)`);
            return;
        }
        if (!frag) {
            DoubleLog(`❌${tag} >> ${signMsg}, 碎片查询失败`);
            return;
        }
        let balance = Number(frag.total) || 0;
        DoubleLog(`🔷${tag} >> ${signMsg}, 当前碎片 ${balance}🧩${frag.expireDate ? `(有效期至 ${frag.expireDate})` : ''}`);

        if (balance <= 0) {
            DoubleLog(`⚠️${tag} >> 碎片为 0, 无可兑换`);
            return;
        }

        /* 8.3 兑换活动 ID */
        let actId = CFG.EXCHANGE_ACTIVITY_ID || await this.querySite();
        if (!actId) actId = loadState().lastActivityId || '';
        if (!actId) {
            DoubleLog(`⚠️${tag} >> 未取到「好礼天天兑」活动 ID, 跳过兑换`);
            return;
        }
        await $.wait(this.getRandomTime());

        /* 8.4 活动校验 */
        const act = await this.queryActivity(actId);
        if (act) {
            $.log(`[${tag}] 活动: ${act.activityName} / ${act.internalName} / ${act.activityStartTime} ~ ${act.activityEndTime}`);
            if (act.activityEndTime && new Date(act.activityEndTime.replace(/-/g, '/')).getTime() < Date.now()) {
                DoubleLog(`⚠️${tag} >> 兑换活动已结束(${act.activityEndTime}), 跳过`);
                return;
            }
        } else if (!this.ckStatus) {
            DoubleLog(`❌${tag} >> token 失效(token 请重新抓取)`);
            return;
        }

        /* 8.5 商品清单 */
        await $.wait(this.getRandomTime());
        let list = await this.queryList(actId);
        if (!list) {
            DoubleLog(`⚠️${tag} >> 商品清单获取失败`);
            return;
        }
        if (!this.unitId) this.unitId = Number(list[0]?.consumeUnitId) || 1;
        if (CFG.DEBUG_LIST) dumpList(list, tag);

        /* 8.6 以兑换口径复查一次碎片 */
        const t2 = await this.getTotal(this.unitId);
        if (t2 !== null && t2 !== balance) {
            $.log(`[${tag}] 碎片口径校准: ${balance} -> ${t2}`);
            balance = t2;
        }

        /* 8.7 状态(防重复 / 每日计数) */
        const state = loadState();
        const st = freshState(state, this.acct, actId);
        const today = dateStr();

        /* 8.8 依次按关键词兑换 */
        const kws = normalizeKeywords(CFG.KEYWORDS);
        if (!kws.length && !CFG.AUTO_LOWEST_WHEN_EMPTY) {
            DoubleLog(`⚠️${tag} >> 未配置 KEYWORDS, 跳过`);
            return;
        }

        let runCount = 0;
        let strictHold = '';   // 严格优先级模式下, 因为碎片不够而卡住的关键词
        const exchanged = [];

        for (const kw of kws) {
            if (!this.ckStatus) break;
            if (overBudget()) {
                DoubleLog(`⏳${tag} >> 已超出运行预算(${Math.round(CFG.MAX_RUNTIME / 1000)}s), 停止后续兑换`);
                break;
            }
            if (limitReached(runCount, st, today)) {
                const why = (CFG.MAX_EXCHANGE_PER_RUN > 0 && runCount >= CFG.MAX_EXCHANGE_PER_RUN)
                    ? '本次运行已达限兑上限' : '今日已达限兑上限';
                DoubleLog(`🔸${tag} >> ${why}(本次${runCount}件/今日${countToday(st, today)}件), 停止`);
                break;
            }

            const pool = pickCandidates(list, kw, balance, st);
            if (!pool.length) {
                const matched = matchItems(list, kw);
                if (!matched.length) {
                    $.log(`[${tag}] 关键词「${kw.name}」本期没有对应商品, 跳过`);
                    continue;
                }
                /* 本期有这件商品: 区分"碎片不够"还是"已兑过/不可兑" */
                const budgetless = pickCandidates(list, kw, balance, st, true);
                if (!budgetless.length) {
                    $.log(`[${tag}] 关键词「${kw.name}」本期商品已兑过或不可兑, 继续试后面的关键词`);
                    continue;
                }
                if (!CFG.FALLTHROUGH_WHEN_UNAFFORDABLE) {
                    strictHold = kw.name;
                    DoubleLog(`⏸️${tag} >> 「${kw.name}」本期最低需${matched[0].consumeAmount}🧩, 当前${balance}🧩 不够; 严格优先级下不降级去买后面的商品`);
                    break;
                }
                $.log(`[${tag}] 关键词「${kw.name}」暂无可兑换商品(碎片${balance}), 继续试后面的关键词`);
                continue;
            }

            let kwCount = 0;
            for (const c of pool) {
                if (limitReached(runCount, st, today)) break;
                if (kwCount >= kw.max) break;

                const cost = Number(c.consumeAmount);
                $.log(`[${tag}] 命中「${kw.name}」-> ${c.commodityName} (${cost}🧩, 余额${balance})`);

                if (CFG.DRY_RUN) {
                    DoubleLog(`🧪${tag} >> [试运行] 将兑换「${c.commodityName}」消耗${cost}🧩, 剩余${balance - cost}🧩`);
                    exchanged.push({ id: c.id, name: c.commodityName, cost, dry: true });
                    kwCount++; runCount++;
                    balance -= cost;
                    continue;
                }

                const r = await this.settleExchange(c, actId, balance, tag);
                balance = r.balance;
                if (r.done) {
                    runCount++; kwCount++;
                    st.items.push({ id: c.id, name: c.commodityName, cost, ts: Date.now(), confirmed: r.confirmed });
                    saveState(state);
                    exchanged.push({ id: c.id, name: c.commodityName, cost });

                    /* 兑换后刷新清单(限兑次数/可兑状态会变) */
                    await $.wait(this.getRandomTime());
                    const nl = await this.queryList(actId);
                    if (nl) list = nl;
                } else if (r.auth) {
                    break;
                }
                await $.wait(this.getRandomTime());
            }
        }

        /* 8.9 兜底: 关键词全没命中时可选择兑最便宜的 */
        if (!exchanged.length && CFG.AUTO_LOWEST_WHEN_EMPTY && this.ckStatus && !limitReached(runCount, st, today)) {
            const pool = pickCandidates(list, { name: '', max: 1, any: true }, balance, st);
            if (pool.length) {
                const c = pool[0];
                const cost = Number(c.consumeAmount);
                if (CFG.DRY_RUN) {
                    DoubleLog(`🧪${tag} >> [试运行] 兜底将兑换「${c.commodityName}」消耗${cost}🧩`);
                } else {
                    const r = await this.settleExchange(c, actId, balance, tag);
                    balance = r.balance;
                    if (r.done) {
                        st.items.push({ id: c.id, name: c.commodityName, cost, ts: Date.now(), confirmed: r.confirmed });
                        saveState(state);
                        DoubleLog(`🔸${tag} >> 兜底兑换已入账「${c.commodityName}」-${cost}🧩`);
                        exchanged.push({ id: c.id, name: c.commodityName, cost });
                    }
                }
            }
        }

        /* 8.10 什么都没兑到 -> 给出原因和"还差多少" */
        if (!exchanged.length) {
            if (!kws.length) {
                DoubleLog(`ℹ️${tag} >> 未配置关键词, 未兑换`);
            } else if (strictHold) {
                const it = matchItems(list, { name: strictHold, max: 1 })[0];
                const cost = it ? Number(it.consumeAmount) : 0;
                DoubleLog(`ℹ️${tag} >> 碎片不足, 严格优先级下攒着等「${strictHold}」${cost ? `(需${cost}🧩, 当前${balance}🧩, 还差${Math.max(0, cost - balance)}🧩)` : ''}, 本次未兑换`);
            } else {
                const kwList = list.filter(c => {
                    const n = String(c.commodityName || '');
                    if (!kws.some(k => matchKeyword(n, k))) return false;
                    return !(CFG.EXCLUDE_KEYWORDS || []).some(x => x && n.indexOf(x) > -1);
                }).sort((a, b) => Number(a.consumeAmount) - Number(b.consumeAmount));
                if (!kwList.length) {
                    DoubleLog(`ℹ️${tag} >> 关键词[${kws.map(k => k.name).join('/')}]在本期商品里没有对应商品, 未兑换`);
                } else {
                    const cheapest = kwList[0];
                    const cost = Number(cheapest.consumeAmount);
                    if (cost > balance) {
                        DoubleLog(`ℹ️${tag} >> 碎片不足, 未兑换(当前${balance}🧩, 关键词商品「${cheapest.commodityName}」需${cost}🧩, 还差${cost - balance}🧩)`);
                    } else {
                        DoubleLog(`ℹ️${tag} >> 未兑换(当前${balance}🧩, 关键词商品「${cheapest.commodityName}」需${cost}🧩, 已兑过或被阈值拦下)`);
                    }
                }
                if (CFG.DEBUG_LIST) $.log(dumpList(list, tag, true));
            }
        }

        if (CFG.DRY_RUN && exchanged.length) {
            DoubleLog(`🧪${tag} >> 试运行结束(未真实兑换), 共${exchanged.length}件`);
        }
    }
}

/* ============================ ④ 业务工具函数 ============================ */

/* 从 convertUrl 解析活动 ID: .../app-prize-shop/#/index/NkNVLzQwNmhIbTg9 */
function parseActivityId(url) {
    if (!url) return '';
    let m = /#\/index\/([^\/?#]+)/.exec(url);
    if (m) return decodeURIComponent(m[1]);
    m = /[?&]id=([^&#]+)/.exec(url);
    if (m) return decodeURIComponent(m[1]);
    m = /#\/([^\/?#]+)\/?$/.exec(url);
    if (m) return decodeURIComponent(m[1]);
    return '';
}

/* 关键词归一化: 支持 "词" 和 {name:"词", max:2} */
function normalizeKeywords(src) {
    const out = [];
    for (const it of (src || [])) {
        if (!it) continue;
        if (typeof it === 'string') {
            const n = it.trim();
            if (n) out.push({ name: n, max: CFG.MAX_PER_KEYWORD });
        } else if (typeof it === 'object' && it.name) {
            const n = String(it.name).trim();
            if (n) out.push({ name: n, max: Number(it.max) > 0 ? Number(it.max) : CFG.MAX_PER_KEYWORD });
        }
    }
    return out;
}

/* 关键词匹配: 支持包含匹配 和 /正则/ 写法 */
function matchKeyword(name, kw) {
    const k = kw.name;
    if (!k) return true; // 空关键词 = 任意(兜底用)
    if (/^\/.*\/[a-z]*$/.test(k)) {
        try {
            const end = k.lastIndexOf('/');
            return new RegExp(k.slice(1, end), k.slice(end + 1)).test(name);
        } catch (e) { return false; }
    }
    return String(name).indexOf(k) > -1;
}

/* 本期命中该关键词的在售商品(不看碎片够不够), 按碎片从低到高 */
function matchItems(list, kw) {
    return list.filter(c => {
        const name = String(c.commodityName || '');
        if (!matchKeyword(name, kw)) return false;
        if ((CFG.EXCLUDE_KEYWORDS || []).some(x => x && name.indexOf(x) > -1)) return false;
        if (Number(c.commoditySaleStatus) !== 1) return false;         // 1 = 在售
        return Number(c.consumeAmount || 0) > 0;
    }).sort((a, b) => Number(a.consumeAmount) - Number(b.consumeAmount));
}

/* 从"命中该关键词的商品"里再挑出这次真能兑的
 * ignoreBudget = true 时忽略"碎片够不够/阈值"这类预算类限制,
 * 用来区分"碎片不够(要严格拦住)"和"已经兑过/不可兑(可以继续往下走)" */
function pickCandidates(list, kw, balance, st, ignoreBudget) {
    const res = [];
    for (const c of matchItems(list, kw)) {
        const cost = Number(c.consumeAmount || 0);
        if (!ignoreBudget) {
            if (cost > balance) continue;                              // 碎片不够 -> 不兑
            if (CFG.MAX_CONSUME_AMOUNT > 0 && cost > CFG.MAX_CONSUME_AMOUNT) continue;
            if (CFG.MIN_KEEP_FRAGMENTS > 0 && (balance - cost) < CFG.MIN_KEEP_FRAGMENTS) continue;
        }
        if (CFG.REQUIRE_PAY_STATUS && Number(c.commodityPayStatus) !== 1) continue;
        if (CFG.SKIP_ALREADY_EXCHANGED) {
            if (Number(c.commodityMemberExchangeCount || 0) > 0) continue;
            if (Number(c.commodityMemberExchangeTodayCount || 0) > 0) continue;
        }
        if (st.items.some(x => x.id === c.id)) continue;               // 本期已兑过
        res.push(c);
    }
    /* 优先给 payStatus=1(服务端认为当前可兑)的, 其次碎片少的 */
    res.sort((a, b) => {
        const pa = Number(a.commodityPayStatus) === 1 ? 0 : 1;
        const pb = Number(b.commodityPayStatus) === 1 ? 0 : 1;
        if (pa !== pb) return pa - pb;
        return Number(a.consumeAmount) - Number(b.consumeAmount);
    });
    return res;
}

function dumpList(list, tag, toStr) {
    const lines = list.slice().sort((a, b) => Number(a.consumeAmount) - Number(b.consumeAmount))
        .map(c => `  ${c.commodityName} | 需${c.consumeAmount}🧩 | 在售${c.commoditySaleStatus} | 可兑${c.commodityPayStatus} | 已兑${c.commodityMemberExchangeCount}/今${c.commodityMemberExchangeTodayCount} | ${c.id}`);
    const s = `[${tag}] 商品清单(${list.length}件):\n${lines.join('\n')}`;
    if (toStr) return s;
    console.log(s);
    return s;
}

/* ---------------- 状态持久化: 防重复兑换 + 每日计数 ---------------- */
function loadState() {
    try {
        const raw = ($.isNode() ? process.env[STATE_KEY] : $.getdata(STATE_KEY)) || '';
        const o = raw ? JSON.parse(raw) : {};
        return (o && typeof o === 'object') ? o : {};
    } catch (e) {
        $.log(`[WARN] 状态解析失败, 重新开始: ${e}`);
        return {};
    }
}

function saveState(state) {
    try {
        const s = JSON.stringify(state);
        if ($.isNode()) process.env[STATE_KEY] = s;
        else $.setdata(s, STATE_KEY);
    } catch (e) {
        $.log(`[WARN] 状态保存失败: ${e}`);
    }
}

/* 取出某账号在当前活动期的状态; 换期整体清空(每日次数直接按 items 的时间戳统计) */
function freshState(state, acct, actId) {
    let st = state[acct];
    if (!st || typeof st !== 'object' || !Array.isArray(st.items)) st = { period: '', items: [] };
    if (st.period !== actId) {
        st = { period: actId, items: [] };
        $.log(`[INFO] 账号 ${acct} 进入新的兑换活动期 ${actId}, 已重置兑换记录`);
    }
    st.date = dateStr();
    /* 状态只保留最近 60 条, 避免长年累积撑爆存储 */
    if (st.items.length > 60) st.items = st.items.slice(-60);
    state[acct] = st;
    state.lastActivityId = actId;
    saveState(state);
    return st;
}

function countToday(st, today) {
    return (st.items || []).filter(x => x.ts && dateStr(new Date(x.ts)) === today).length;
}

function limitReached(runCount, st, today) {
    if (CFG.MAX_EXCHANGE_PER_RUN > 0 && runCount >= CFG.MAX_EXCHANGE_PER_RUN) return true;
    if (CFG.MAX_EXCHANGE_PER_DAY > 0 && countToday(st, today) >= CFG.MAX_EXCHANGE_PER_DAY) return true;
    return false;
}

function dateStr(d) {
    const t = d || new Date();
    const p = n => (n < 10 ? '0' + n : '' + n);
    return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

function acctId(token) {
    let h = 5381;
    const s = String(token);
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    const hex = h.toString(16);
    return ('00000000' + hex).slice(-8);
}

/* 是否已超出本次运行预算: 超了就停止发新请求并正常收尾, 避免被客户端 cron 超时硬杀 */
function overBudget() {
    if (!CFG.MAX_RUNTIME) return false;
    const started = $.startTime || 0;
    return started > 0 && (Date.now() - started) > CFG.MAX_RUNTIME;
}

/* ============================ ⑤ 抓 token(复用签到逻辑) ============================ */
async function getCookie() {
    try {
        if (!$request || $request.method === 'OPTIONS') return;
        const headers = ObjectKeys2LowerCase($request.headers);
        const token = headers['_haidilao_app_token'];

        if (!token) {
            $.log(`[ERROR] 未在请求头里找到 _haidilao_app_token`);
            $.log(`[DEBUG] headers keys: ${Object.keys(headers).join(',')}`);
            return;
        }
        if (!/^TOKEN_APP_/i.test(token)) {
            $.log(`[WARN] token 格式异常: ${token.substring(0, 20)}...`);
        }

        const existing = (userCookie || '').split('@').filter(Boolean);
        const idx = existing.findIndex(t => t === token);
        if (idx === -1) {
            existing.push(token);
            $.setdata(existing.join('@'), TOKEN_KEY);
            $.msg($.name, '✅ 海底捞 Cookie 获取成功', `共 ${existing.length} 个账号`);
            $.log(`[INFO] 新增 token: ${token}`);
        } else {
            $.log(`[INFO] token 已存在,无需更新`);
        }
    } catch (e) {
        $.log(`[ERROR] getCookie: ${e}`);
        $.msg($.name, '', `❌ 获取 Token 失败: ${e.message || e}`);
    }
}

function ObjectKeys2LowerCase(obj) {
    return !obj ? {} : Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v]));
}

/* ============================== ⑥ 入口 ============================== */
!(async () => {
    /* 6.1 抓包模式: 进小程序时把 token 存起来 */
    if (typeof $request !== "undefined") {
        await getCookie();
        return;
    }
    /* 6.2 清空 token(与签到脚本同一开关) */
    if (JSON.parse($.getdata(CLEAR_KEY) || "false")) {
        $.setdata("", TOKEN_KEY);
        $.setdata("false", CLEAR_KEY);
        $.notifyMsg.push("✅ Cookie 已清除，请重新抓取");
        return;
    }
    /* 6.3 定时任务模式 */
    if (!(await checkEnv())) throw new Error(`❌未检测到ck，请添加环境变量 ${TOKEN_KEY} 或在插件里抓包`);
    if (userList.length > 0) {
        await main();
    }
})()
    .catch((e) => $.notifyMsg.push(e.message || e))
    .finally(async () => {
        if ($.barkKey) {
            await BarkNotify($, $.barkKey, $.name, $.notifyMsg.join('\n'));
        }
        await SendMsg($.notifyMsg.join('\n'));
        $.done();
    });

/* ============================ ⑦ 通用辅助(与签到脚本一致) ============================ */
function DoubleLog(data) {
    if (data) {
        console.log(`${data}`);
        $.notifyMsg.push(`${data}`);
    }
}

async function checkEnv() {
    if (userCookie) {
        let e = envSplitor[0];
        for (let o of envSplitor)
            if (userCookie.indexOf(o) > -1) { e = o; break; }
        for (let n of userCookie.split(e)) n && userList.push(new UserInfo(n));
        userCount = userList.length;
    } else {
        console.log("未找到CK");
        return;
    }
    return console.log(`共找到${userCount}个账号`), true;
}

function randomInt(min, max) {
    return Math.round(Math.random() * (max - min) + min);
}

async function SendMsg(message) {
    if (!message) return;
    if (Notify > 0) {
        if ($.isNode()) {
            await notify.sendNotify($.name, message);
        } else {
            $.msg($.name, '', message);
        }
    } else {
        console.log(message);
    }
}

function debug(text) {
    if ($.is_debug === 'true') {
        if (typeof text === "string") console.log(text);
        else if (typeof text === "object") console.log($.toStr(text));
    }
}

/* ============================================================================
 * 固定不动区域
 *  - Env / BarkNotify: 与 MaYIHEI/paperclip haidilao.js 完全一致, 保证行为相同
 *  - httpRequest: 在原版基础上做了"真实运行"加固(超时 + HTTP 状态 + 原文截断),
 *    原版会把网络错误 / 风控 HTML 页静默吞成 undefined, 线上无法排障
 * ==========================================================================*/

/* 真实运行必备: 带超时 / HTTP 状态 / 原文截断的可诊断请求, 返回信封而不是裸数据 */
function rawRequest(options, method, timeoutMs) {
    const m = typeof method === 'undefined' ? ('body' in options ? 'post' : 'get') : method;
    const started = Date.now();
    return new Promise((resolve) => {
        let settled = false;
        let timer = null;
        const finish = (r) => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            r.ms = Date.now() - started;
            resolve(r);
        };
        if (timeoutMs) {
            timer = setTimeout(() => finish({ ok: false, err: `请求超时(${timeoutMs}ms)` }), timeoutMs);
        }
        try {
            $[m](options, (err, resp, data) => {
                const status = resp ? (resp.status || resp.statusCode) : 0;
                if (err) return finish({ ok: false, err: String((err && err.message) || err), status });
                if (!data) return finish({ ok: false, err: '响应为空', status });
                let parsed;
                try {
                    parsed = JSON.parse(data);
                } catch (e) {
                    /* 常见于被 WAF/acw 拦截返回 HTML, 或网关错误页 —— 必须能看到原文才好排障 */
                    return finish({
                        ok: false, err: '响应非 JSON(可能是风控/网关页)', status,
                        raw: String(data).replace(/\s+/g, ' ').substring(0, 180),
                    });
                }
                finish({ ok: true, status, data: parsed, raw: String(data).substring(0, 300) });
            });
        } catch (e) {
            finish({ ok: false, err: `请求异常: ${(e && e.message) || e}` });
        }
    });
}

/* 兼容写法: 直接拿 JSON 数据(拿不到返回 undefined) */
function httpRequest(options, method) {
    return rawRequest(options, method).then(r => (r.ok ? r.data : undefined));
}

/* 日志里只留接口名, 不刷长 URL */
function shortApi(url) {
    try { return String(url).split('/').slice(-2).join('/'); } catch (e) { return String(url); }
}
async function BarkNotify(c, k, t, b) { for (let i = 0; i < 3; i++) { console.log(`🔷Bark notify >> Start push (${i + 1})`); const s = await new Promise((n) => { c.post({ url: 'https://api.day.app/push', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: t, body: b, device_key: k, ext_params: { group: t } }) }, (e, r, d) => r && r.status == 200 ? n(1) : n(d || e)) }); if (s === 1) { console.log('✅Push success!'); break } else { console.log(`❌Push failed! >> ${s.message || s}`) } } };
function Env(t, e) { class s { constructor(t) { this.env = t } send(t, e = "GET") { t = "string" == typeof t ? { url: t } : t; let s = this.get; return "POST" === e && (s = this.post), new Promise((e, a) => { s.call(this, t, (t, s, r) => { t ? a(t) : e(s) }) }) } get(t) { return this.send.call(this.env, t) } post(t) { return this.send.call(this.env, t, "POST") } } return new class { constructor(t, e) { this.name = t, this.http = new s(this), this.data = null, this.dataFile = "box.dat", this.logs = [], this.isMute = !1, this.isNeedRewrite = !1, this.logSeparator = "\n", this.encoding = "utf-8", this.startTime = (new Date).getTime(), Object.assign(this, e), this.log("", `🔔${this.name}, 开始!`) } getEnv() { return "undefined" != typeof $environment && $environment["surge-version"] ? "Surge" : "undefined" != typeof $environment && $environment["stash-version"] ? "Stash" : "undefined" != typeof module && module.exports ? "Node.js" : "undefined" != typeof $task ? "Quantumult X" : "undefined" != typeof $loon ? "Loon" : "undefined" != typeof $rocket ? "Shadowrocket" : void 0 } isNode() { return "Node.js" === this.getEnv() } isQuanX() { return "Quantumult X" === this.getEnv() } isSurge() { return "Surge" === this.getEnv() } isLoon() { return "Loon" === this.getEnv() } isShadowrocket() { return "Shadowrocket" === this.getEnv() } isStash() { return "Stash" === this.getEnv() } toObj(t, e = null) { try { return JSON.parse(t) } catch { return e } } toStr(t, e = null) { try { return JSON.stringify(t) } catch { return e } } getjson(t, e) { let s = e; const a = this.getdata(t); if (a) try { s = JSON.parse(this.getdata(t)) } catch { } return s } setjson(t, e) { try { return this.setdata(JSON.stringify(t), e) } catch { return !1 } } getScript(t) { return new Promise(e => { this.get({ url: t }, (t, s, a) => e(a)) }) } runScript(t, e) { return new Promise(s => { let a = this.getdata("@chavy_boxjs_userCfgs.httpapi"); a = a ? a.replace(/\n/g, "").trim() : a; let r = this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout"); r = r ? 1 * r : 20, r = e && e.timeout ? e.timeout : r; const [i, o] = a.split("@"), n = { url: `http://${o}/v1/scripting/evaluate`, body: { script_text: t, mock_type: "cron", timeout: r }, headers: { "X-Key": i, Accept: "*/*" }, timeout: r }; this.post(n, (t, e, a) => s(a)) }).catch(t => this.logErr(t)) } loaddata() { if (!this.isNode()) return {}; { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), a = !s && this.fs.existsSync(e); if (!s && !a) return {}; { const a = s ? t : e; try { return JSON.parse(this.fs.readFileSync(a)) } catch (t) { return {} } } } } writedata() { if (this.isNode()) { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), a = !s && this.fs.existsSync(e), r = JSON.stringify(this.data); s ? this.fs.writeFileSync(t, r) : a ? this.fs.writeFileSync(e, r) : this.fs.writeFileSync(t, r) } } lodash_get(t, e, s) { const a = e.replace(/\[(\d+)\]/g, ".$1").split("."); let r = t; for (const t of a) if (r = Object(r)[t], void 0 === r) return s; return r } lodash_set(t, e, s) { return Object(t) !== t ? t : (Array.isArray(e) || (e = e.toString().match(/[^.[\]]+/g) || []), e.slice(0, -1).reduce((t, s, a) => Object(t[s]) === t[s] ? t[s] : t[s] = Math.abs(e[a + 1]) >> 0 == +e[a + 1] ? [] : {}, t)[e[e.length - 1]] = s, t) } getdata(t) { let e = this.getval(t); if (/^@/.test(t)) { const [, s, a] = /^@(.*?)\.(.*?)$/.exec(t), r = s ? this.getval(s) : ""; if (r) try { const t = JSON.parse(r); e = t ? this.lodash_get(t, a, "") : e } catch (t) { e = "" } } return e } setdata(t, e) { let s = !1; if (/^@/.test(e)) { const [, a, r] = /^@(.*?)\.(.*?)$/.exec(e), i = this.getval(a), o = a ? "null" === i ? null : i || "{}" : "{}"; try { const e = JSON.parse(o); this.lodash_set(e, r, t), s = this.setval(JSON.stringify(e), a) } catch (e) { const i = {}; this.lodash_set(i, r, t), s = this.setval(JSON.stringify(i), a) } } else s = this.setval(t, e); return s } getval(t) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": return $persistentStore.read(t); case "Quantumult X": return $prefs.valueForKey(t); case "Node.js": return this.data = this.loaddata(), this.data[t]; default: return this.data && this.data[t] || null } } setval(t, e) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": return $persistentStore.write(t, e); case "Quantumult X": return $prefs.setValueForKey(t, e); case "Node.js": return this.data = this.loaddata(), this.data[e] = t, this.writedata(), !0; default: return this.data && this.data[e] || null } } initGotEnv(t) { this.got = this.got ? this.got : require("got"), this.cktough = this.cktough ? this.cktough : require("tough-cookie"), this.ckjar = this.ckjar ? this.ckjar : new this.cktough.CookieJar, t && (t.headers = t.headers ? t.headers : {}, void 0 === t.headers.Cookie && void 0 === t.cookieJar && (t.cookieJar = this.ckjar)) } get(t, e = (() => { })) { switch (t.headers && (delete t.headers["Content-Type"], delete t.headers["Content-Length"], delete t.headers["content-type"], delete t.headers["content-length"]), t.params && (t.url += "?" + this.queryStr(t.params)), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient.get(t, (t, s, a) => { !t && s && (s.body = a, s.statusCode = s.status ? s.status : s.statusCode, s.status = s.statusCode), e(t, s, a) }); break; case "Quantumult X": this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then(t => { const { statusCode: s, statusCode: a, headers: r, body: i, bodyBytes: o } = t; e(null, { status: s, statusCode: a, headers: r, body: i, bodyBytes: o }, i, o) }, t => e(t && t.error || "UndefinedError")); break; case "Node.js": let s = require("iconv-lite"); this.initGotEnv(t), this.got(t).on("redirect", (t, e) => { try { if (t.headers["set-cookie"]) { const s = t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString(); s && this.ckjar.setCookieSync(s, null), e.cookieJar = this.ckjar } } catch (t) { this.logErr(t) } }).then(t => { const { statusCode: a, statusCode: r, headers: i, rawBody: o } = t, n = s.decode(o, this.encoding); e(null, { status: a, statusCode: r, headers: i, rawBody: o, body: n }, n) }, t => { const { message: a, response: r } = t; e(a, r, r && s.decode(r.rawBody, this.encoding)) }) } } post(t, e = (() => { })) { const s = t.method ? t.method.toLocaleLowerCase() : "post"; switch (t.body && t.headers && !t.headers["Content-Type"] && !t.headers["content-type"] && (t.headers["content-type"] = "application/x-www-form-urlencoded"), t.headers && (delete t.headers["Content-Length"], delete t.headers["content-length"]), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient[s](t, (t, s, a) => { !t && s && (s.body = a, s.statusCode = s.status ? s.status : s.statusCode, s.status = s.statusCode), e(t, s, a) }); break; case "Quantumult X": t.method = s, this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then(t => { const { statusCode: s, statusCode: a, headers: r, body: i, bodyBytes: o } = t; e(null, { status: s, statusCode: a, headers: r, body: i, bodyBytes: o }, i, o) }, t => e(t && t.error || "UndefinedError")); break; case "Node.js": let a = require("iconv-lite"); this.initGotEnv(t); const { url: r, ...i } = t; this.got[s](r, i).then(t => { const { statusCode: s, statusCode: r, headers: i, rawBody: o } = t, n = a.decode(o, this.encoding); e(null, { status: s, statusCode: r, headers: i, rawBody: o, body: n }, n) }, t => { const { message: s, response: r } = t; e(s, r, r && a.decode(r.rawBody, this.encoding)) }) } } time(t, e = null) { const s = e ? new Date(e) : new Date; let a = { "M+": s.getMonth() + 1, "d+": s.getDate(), "H+": s.getHours(), "m+": s.getMinutes(), "s+": s.getSeconds(), "q+": Math.floor((s.getMonth() + 3) / 3), S: s.getMilliseconds() }; /(y+)/.test(t) && (t = t.replace(RegExp.$1, (s.getFullYear() + "").substr(4 - RegExp.$1.length))); for (let e in a) new RegExp("(" + e + ")").test(t) && (t = t.replace(RegExp.$1, 1 == RegExp.$1.length ? a[e] : ("00" + a[e]).substr(("" + a[e]).length))); return t } queryStr(t) { let e = ""; for (const s in t) { let a = t[s]; null != a && "" !== a && ("object" == typeof a && (a = JSON.stringify(a)), e += `${s}=${a}&`) } return e = e.substring(0, e.length - 1), e } msg(e = t, s = "", a = "", r) { const i = t => { switch (typeof t) { case void 0: return t; case "string": switch (this.getEnv()) { case "Surge": case "Stash": default: return { url: t }; case "Loon": case "Shadowrocket": return t; case "Quantumult X": return { "open-url": t }; case "Node.js": return }case "object": switch (this.getEnv()) { case "Surge": case "Stash": case "Shadowrocket": default: { let e = t.url || t.openUrl || t["open-url"]; return { url: e } } case "Loon": { let e = t.openUrl || t.url || t["open-url"], s = t.mediaUrl || t["media-url"]; return { openUrl: e, mediaUrl: s } } case "Quantumult X": { let e = t["open-url"] || t.url || t.openUrl, s = t["media-url"] || t.mediaUrl, a = t["update-pasteboard"] || t.updatePasteboard; return { "open-url": e, "media-url": s, "update-pasteboard": a } } case "Node.js": return }default: return } }; if (!this.isMute) switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: $notification.post(e, s, a, i(r)); break; case "Quantumult X": $notify(e, s, a, i(r)); break; case "Node.js": }if (!this.isMuteLog) { let t = ["", "==============📣系统通知📣=============="]; t.push(e), s && t.push(s), a && t.push(a), console.log(t.join("\n")), this.logs = this.logs.concat(t) } } log(...t) { t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(t.join(this.logSeparator)) } logErr(t, e) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": case "Quantumult X": default: this.log("", `❗️${this.name}, 错误!`, t); break; case "Node.js": this.log("", `❗️${this.name}, 错误!`, t.stack) } } wait(t) { return new Promise(e => setTimeout(e, t)) } done(t = {}) { const e = (new Date).getTime(), s = (e - this.startTime) / 1e3; switch (this.log("", `🔔${this.name}, 结束! 🕛 ${s} 秒`), this.log(), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": case "Quantumult X": default: $done(t); break; case "Node.js": process.exit(1) } } }(t, e) }
