# 译言工作台

这是一个可放到 GitHub Pages 的单文件翻译对照工作台。

## 在线页面

GitHub Pages 可以直接托管 `index.html`，适合做：

- 文本粘贴导入
- 已保存的 Gutenberg HTML 上传导入
- 原文 / 直译 / 润色 / 定稿对照
- 备注、术语表、进度保存
- 导出 HTML / TXT

## 为什么还需要本地代理

浏览器从 GitHub Pages 或本地 `file://` 页面直接请求 Gutenberg / 有道 API 时，会被 CORS 拦截。

因此本项目附带：

- `yiyan-local-proxy.py`
- `start-local-proxy.bat`

在 Windows 上双击 `start-local-proxy.bat`，页面就可以通过 `http://127.0.0.1:8767` 导入网页和调用有道翻译。

如果要让任何设备打开网页都能直接翻译，需要把代理改成 Supabase Edge Function、Netlify Function 或 Cloudflare Worker，并把有道秘钥放在服务端环境变量里。

## 安全提醒

不要把有道应用秘钥写进 `index.html` 或提交到 GitHub。当前页面只在输入框里临时使用秘钥，不保存到文件。
