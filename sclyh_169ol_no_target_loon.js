/*
四川联通特惠 - 活动资格与商品详情重写

Loon 配置示例：

[Script]
http-response ^https:\/\/sclyh\.169ol\.com\/2b2c-mobile\/goods\/getGoodsDetailInfo(?:\?.*)?$ script-path=https://raw.githubusercontent.com/doosit/script/main/sclyh_169ol_no_target_loon.js,requires-body=true,timeout=10,tag=四川联通特惠资格,enable=true

[MITM]
hostname = sclyh.169ol.com
*/

(function () {
  var tag = "四川联通特惠资格";
  var body = $response.body;
  var GOODS_DETAIL_TEMPLATES = {
    "49845355694389": JSON.parse(
      '{"goodsInfo":{"goodsId":49845355694389,"goodsName":"5G-A国内流量月包20元10GB-立即生效","spuCode":"","goodsType":"2","specType":"0","selectProductFlag":"1","priceDesc":"","thirdGoodsUrl":"","saleTimeLimit":"0","isSearch":"","searchTag":"","storeId":0,"minBuy":1,"maxBuy":0,"totalBuyLimit":0,"status":"1","microPageId":"","sortNum":0,"createStaffId":"xieqiang1013","cityCode":"ZZZZ","createTime":"2026-04-22 16:00:22","updateStaffId":"xieqiang1013","updateTime":"2026-04-23 16:33:24","cnType":"D"},"goodsCategoryDTOList":[{"goodsCategoryId":49845355694902,"categoryId":1001,"name":"流量类产品"}],"goodsSpecList":[],"goodsProductList":[{"productId":49845300372037,"productName":"5G-A国内流量月包20元10GB-立即生效","linedPrice":0,"marketPrice":2000,"stockNumber":0,"weight":"","volume":"","productDesc":"20元/月，包含10GB通用流量，10GB流量可享受5G-A速率服务（下行最高2Gbps、上行最高200Mbps）","priceDesc":"20元/月","tips":"","agreementName":"","status":"1","skuCode":"","storeId":0,"mapSystemCode":"1","mapProductId":"816204163583","cycleBuyLimit":"0","cycleBuyNum":0,"countOrderType":1,"isAgreement":"0","createStaffId":"xieqiang1013","cityCode":"ZZZZ","createTime":"2026-04-22 15:56:46","updateStaffId":"xieqiang1013","updateTime":"2026-05-06 14:50:11","agreementContent":"请输入协议内容","smsMsg":"5G-A国内流量月包20元10GB-立即生效（编号：26SC300077），包含10GB中国内地（不含中国港、澳、台地区）通用流量，订购成功立即生效，连续包月产品，订购成功后立即扣费，如不退订每月1号从话费中扣取产品费用20元。合约期限：无合约期限，违约责任：退订/销户/携转等不需承担违约责任。按月扣费，费用将通过话费余额扣除","tdCoProductCommodityMaterial":{"materialId":49845300373317,"elementType":"1","elementId":49845300372037,"channelId":0,"title":"5G-A国内流量月包20元10GB-立即生效","subTitle":"10GB高速流量","starTitle":"5G-A极速体验即刻生效","starTag":"","smallLogo":"","bigLogo":"https://sclyh.169ol.com/res/0/125102117321062779/69e87e443bde180007e52b9f.jpg","cornerMark":"","carouselMaterialTitle":"","carouselMaterial":"","extraMaterial1":"","extraMaterial2":"","extraMaterial3":"","briefDesc1":"","briefDesc2":"","briefDesc3":"","plusProductImage":"","detailDesc":"","detailDesc1":"<p style=\\"font-size: 9pt;\\"><span style=\\"color: #000000; font-size: 11pt;\\"><strong>产品说明：</strong></span><span style=\\"font-size: 11pt;\\">5G-A国内流量月包20元10GB-立即生效，20元/月，包含10GB中国内地通用流量（不含中国港、澳、台地区），<strong>10GB流量可享受5G-A速率服务（<span style=\\"color: #000000;\\">下行最高2Gbps、上行最高200Mbps</span>）</strong>。5G-A上网服务上下行速率为最高值，用户实际体验速率受网络环境、用户位置、同一时间上网用户数、终端及业务等因素影响，可能低于上述最高值。</span><br><span style=\\"font-size: 11pt;\\"> <strong>适用范围：</strong>符合订购约定的中国联通四川手机用户可订购以上产品，订购了流量畅享包、畅越低消、2G新势力10元流量包的用户不可办理，云宽套餐、智慧沃家共享版、副卡用户不可订购。（温馨提示：因受用户套餐、号码使用状态、产品规则变化等影响，是否能订购该产品以办理当时系统提示为准）</span><br><span style=\\"font-size: 11pt;\\"> <strong>生效规则：</strong>5G-A流量包用户订购当月申请立即生效，<strong>月费一次性扣除</strong>。</span><br><span style=\\"font-size: 11pt;\\"> <strong>计费规则：连续包月产品，</strong>订购成功后立即扣费，<span style=\\"color: #000000;\\"><strong>如不退订每月1号从话费中扣取产品费用20元</strong>。 </span><br><span style=\\"color: #000000;\\"><strong>业务退订：</strong>可到当地联通自有营业厅、致电10010、或通过中国联通APP办理。</span><br><span style=\\"color: #000000;\\"><strong>退订规则：</strong>用户退订时，当月申请，次月1日起生效。用户申请退订成功后，截止退订当月末，用户仍可继续使用包内剩余流量，次月失效。 </span><br><span style=\\"color: #000000;\\"><strong>流量使用顺序：5G-A流量包流量优先于套内流量。</strong>用户参与各类活动，享有/订购的流量，对应相关流量的使用优先级以活动页面或相关流量规则为准。若产品有单独说明的以该产品说明为准，以上使用规则为原则性使用顺序，当用户订购的不同类型产品或订购多个同类型产品时会一定的变化，具体的扣费顺序详情请拨打10010咨询。</span><br><span style=\\"color: #000000;\\"><strong>解限规则：</strong>达量限速套餐用户，在限速前订购5G-A流量包，按订购5G-A流量包包含流量值提高一次限速阈值，二次限速阈值不变；在限速后订购5G-A流量包，订购后取消限速，5G-A流量包包含流量消费完后再按套餐规定限速，限速之前均可享受5G-A速率服务。 </span><br><span style=\\"color: #000000;\\"><strong>共享规则：</strong>主副卡用户订购，<strong>主卡订购后，主、副卡共享流量、速率(如副卡与主卡归属地不同，则不能共享主卡速率）</strong>；<strong>副卡用户不可单独订购</strong>。智慧沃家组合版移网用户订购，副卡可共享流量、速率。智慧沃家共享版用户需虚拟用户订购，成员用户共享流量和速率，融合共享版成员用户不可单独订购。</span><br><span style=\\"color: #000000;\\"><strong>结转规则：</strong>5G-A流量包流量当月<strong>未使用完部分按照现有规则结转次月（结转的前提是5G-A流量包处于订购状态）</strong>。</span> <br><strong>续订规则：</strong>连续包月产品，用户不取消订购月包资费将按约定连续按月收取。 </span></p>\\n<p style=\\"font-size: 9pt;\\"><span style=\\"font-size: 11pt;\\"><strong><span style=\\"color: #000000;\\">温馨提示：</span></strong>订购后可通过“联通APP-服务大厅-已订业务”查看业务是否订购成功。</span></p>","detailDesc2":"","detailDesc3":""},"goodsProductId":49845355695157,"specJson":""}],"material":{"materialId":49845355695925,"elementType":"2","elementId":49845355694389,"channelId":0,"title":"","subTitle":"","starTitle":"","starTag":"","smallLogo":"","bigLogo":"","cornerMark":"","carouselMaterialTitle":"","carouselMaterial":"","extraMaterial1":"","extraMaterial2":"","extraMaterial3":"","briefDesc1":"","briefDesc2":"","briefDesc3":"","plusProductImage":"","detailDesc":"","detailDesc1":"","detailDesc2":"","detailDesc3":""},"materialExpandList":[],"upgradeGoodsList":[]}'
    ),
  };

  if (!body) {
    console.log("[" + tag + "] 响应体为空，跳过处理");
    $done({});
    return;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getRequestGoodsId() {
    if (typeof $request === "undefined" || !$request || !$request.body) {
      return "";
    }

    try {
      var requestData = JSON.parse($request.body);
      return requestData && requestData.goodsId ? String(requestData.goodsId) : "";
    } catch (error) {
      var match = String($request.body).match(/"goodsId"\s*:\s*"?(\d+)"?/);
      return match ? match[1] : "";
    }
  }

  function hasUsableGoodsDetail(data) {
    return !!(
      data &&
      data.goodsInfo &&
      Array.isArray(data.goodsProductList) &&
      data.goodsProductList.length > 0 &&
      data.goodsProductList[0] &&
      data.goodsProductList[0].productId
    );
  }

  function ensureGoodsDetailData(target) {
    if (!target || typeof target !== "object") {
      return "skip";
    }

    if (target.resultCode !== "0000") {
      return "skip";
    }

    if (hasUsableGoodsDetail(target.data)) {
      return "unchanged";
    }

    var requestGoodsId = getRequestGoodsId();
    var goodsId = requestGoodsId || "49845355694389";
    var template = GOODS_DETAIL_TEMPLATES[goodsId];

    if (!template) {
      return "no-template";
    }

    target.data = clone(template);
    return "patched";
  }

  try {
    var data = JSON.parse(body);
    var result = ensureGoodsDetailData(data);

    console.log(
      "[" +
        tag +
        "] JSON 检查完成，" +
        (result === "patched"
          ? "已补齐完整商品详情，活动资格校验后可继续加载办理流程"
          : result === "unchanged"
          ? "原响应已有完整商品详情"
          : result === "no-template"
          ? "未命中商品模板，保留原响应"
          : "无需修改或非 0000 响应")
    );

    $done({ body: JSON.stringify(data) });
  } catch (error) {
    console.log("[" + tag + "] JSON 解析失败，保留原响应：" + String(error));
    $done({ body: body });
  }
})();
