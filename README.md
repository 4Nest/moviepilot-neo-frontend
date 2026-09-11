# MoviePilot Neo Frontend

[MoviePilot-Frontend](https://github.com/jxxghp/MoviePilot-Frontend) v2 的个人定制分支（Fork），与 [moviepilot-neo](https://github.com/4Nest/moviepilot-neo) 后端配套。

<p>
  <img src="./docs/neo-icon.png" width="96" alt="NEO" />
</p>

## 与官方前端的差异

- NEO 品牌标识（导航 Logo、登录页精简、favicon/PWA 图标、MoviePilot Neo 标题）
- 界面精简：移除日历页、热门订阅、分享统计、订阅分享筛选器、AI 助手悬浮入口、智能助手配置
- 通知渠道只保留 Telegram / 企业微信
- 多语言精简为仅简体中文
- 识别测试页重构（结果区重排、识别标题区分、媒体 ID 徽章、表单会话保留）
- 订阅分享批量管理、详情页重排
- 重命名格式双模式编辑器（简易字段流 / 进阶 Jinja2）
- 捷径工具栏：识别 / 词表 / 日志独立图标按钮

## 构建产物

`neo` 分支每次推送自动构建 `dist.zip` 并发布到本仓库 Release（tag 与 `package.json` 版本一致）。后端镜像构建时从此处下载前端产物：

```
https://github.com/4Nest/moviepilot-neo-frontend/releases/download/<version>/dist.zip
```

注意：`dist.zip` 在同一 tag 下会随每次构建重建覆盖。

## 图标

- `docs/neo-icon.png`：512×512 PNG 图标（用于 Unraid 模板等场景）
- `src/assets/images/logos/neo.svg`：矢量品牌图标（界面内使用）

外链：`https://raw.githubusercontent.com/4Nest/moviepilot-neo-frontend/neo/docs/neo-icon.png`

## 开发

- `neo` 分支为开发主线，功能分支 → PR 到 `neo`（format/lint/typecheck/coverage 门禁）
- 本地预览：`yarn dev`（API 代理到 `localhost:3001`）
- 上游同步：`git fetch upstream && git merge upstream/v2`

## License

GPL-3.0（与上游一致）
