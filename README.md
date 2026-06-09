# 小猫消费

蓝色风格的两人共享消费小账本。第一版功能：

- 现金 / 卡 两个标签页
- 充值
- 划账 / 扣费
- 编辑明细
- 余额显示
- 勾选多条后批量删除
- 两台 iPhone 通过 Supabase 实时同步
- 可用 Safari 添加到主屏幕，当作小 App 使用

## 1. 创建 Supabase 数据库

1. 登录 Supabase，新建 Project。
2. 进入 SQL Editor。
3. 打开本包里的 `supabase.sql`。
4. 把里面的两个邮箱改成你们两个人的登录邮箱。
5. 执行 SQL。

## 2. 配置 app.js

打开 `app.js`，修改最上面两行：

```js
const SUPABASE_URL = "填你的 Supabase Project URL";
const SUPABASE_KEY = "填你的 Supabase anon 或 publishable key";
```

只可以填 anon / publishable key，不要填 service_role key。

## 3. 上传到 GitHub Pages

把整个文件夹里的文件上传到 GitHub 仓库，例如：

- index.html
- app.js
- style.css
- manifest.json
- sw.js
- icons 文件夹

然后进入仓库：

Settings → Pages → Deploy from a branch → main / root

保存后等待 GitHub 给出网址。

## 4. 配置 Supabase 登录跳转

Supabase 后台：Authentication → URL Configuration

把 GitHub Pages 的网址填到：

- Site URL
- Redirect URLs

例如：

```text
https://你的GitHub用户名.github.io/仓库名/
```

## 5. iPhone 安装

两个人都用 Safari 打开 GitHub Pages 网址：

分享按钮 → 添加到主屏幕

以后桌面上会出现“小猫消费”。
