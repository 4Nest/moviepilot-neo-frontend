# iOS App 原生导航集成（moviepilot.chrome v1）

Neo 支持官方 iOS 客户端 `jxxghp/MoviePilot-App` 通过 `moviepilot.chrome` v1 协议接管导航。App 容器在页面初始化前注入 `window.MoviePilotNative`（`transportVersion: 1`），前端检测到桥接后挂载 `src/components/native/NativeNavigationHost.vue`，完成 `web.ready` → `host.configure` → `chrome.prepare` → `chrome.accepted` 握手。

## 范围

- 声明能力：`navigation.v1`、`actions.v1`、`layout.v1`、`menu.v1`、`notifications.v1`。不声明 `widgets.v1`、`readonly-cache.v1`、`card-menus.v1`、`standalone-menus.v1`，App 端自动跳过对应通道。
- 根入口 4 个：`/dashboard`、`/recommend`、`/discover`、`/apps`（“更多”目录）。
- 全局动作 5 个：`search`、`shortcuts`、`notifications`、`plugins`、`profile`（`scope: 'global'`）。
- 业务弹窗（`VDialog`、`ProgressDialog`、`ThemeCustomizer`）由原生 Sheet 接管；`ConfirmDialog` 由系统确认框接管（`data-native-confirm-*` 属性投影）。
- 认证回退：API 返回 401（非登录请求自身）或 403 时清理会话并跳转 `/login`，宿主调用 `window.MoviePilotNative.authenticationRequired()` 唤起原生登录页。

## 关键模块

| 路径                                      | 职责                                             |
| ----------------------------------------- | ------------------------------------------------ |
| `src/native/protocol.ts`                  | 协议类型、信封与校验函数                         |
| `src/native/session.ts`                   | `NativeChromeSession` 握手与命令分派             |
| `src/native/layout.ts`                    | 安全区换算、CSS 变量与 `data-native-chrome` 切换 |
| `src/native/sheet.ts` / `confirmation.ts` | Sheet 与确认框接管                               |
| `src/native/registry.ts` / `panel.ts`     | 全局动作注册与面板投影                           |
| `src/native/native.scss`                  | 原生接管态样式（隐藏顶栏、侧栏与底部悬浮 Dock）  |

普通浏览器与 PWA 环境无 `window.MoviePilotNative`，所有原生逻辑不激活，界面与交互保持不变。

## 测试

`src/native/__tests__/neo-app-compat.spec.ts` 模拟注入桥接对象，覆盖握手、根切换、Sheet/确认框接管与登录回退。
