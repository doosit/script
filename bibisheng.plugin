[MITM]
hostname = discount.wxpapp.wechatpay.cn

[Script]
http-request ^https:\/\/discount\.wxpapp\.wechatpay\.cn\/txbbs-mall\/coupon\/(querydailygiftcoupons|claimdailygiftcoupon) tag=笔笔省 Cookie, script-path=https://raw.githubusercontent.com/MaYIHEI/paperclip/refs/heads/main/miniprogram/bibisheng/bibisheng.cookie.js, requires-body=false, img-url=https://raw.githubusercontent.com/MaYIHEI/pin/refs/heads/main/app/bibisheng.png

cron "30 7 * * *" script-path=https://raw.githubusercontent.com/MaYIHEI/paperclip/refs/heads/main/miniprogram/bibisheng/bibisheng.js, tag=笔笔省签到, img-url=https://raw.githubusercontent.com/MaYIHEI/pin/refs/heads/main/app/bibisheng.png, enable=true
