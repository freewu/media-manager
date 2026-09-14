# Media Manager · 本地媒体资源管理

基于 **Tauri 2 + SQLite + Vite + React** 的本地媒体资源管理器：扫描你指定的目录，把匹配到的
视频 / 音频 / 图片（可扩展到文档）登记进本地 SQLite 数据库，并提供浏览、搜索、筛选、
标签、收藏、失效检测等管理能力。

所有数据都保存在**应用目录下的 `.data/data.db`**，不依赖任何云服务。

---

## 功能

| 模块 | 说明 |
| --- | --- |
| 媒体库管理 | 添加 / 移除扫描目录、启用停用、查看每个库的条目数与占用空间 |
| 扫描 | 后台线程递归遍历（walkdir），可按扩展名白名单、最小体积、隐藏文件 / 符号链接 / 忽略目录规则过滤；实时进度事件 `scan://progress`、完成事件 `scan://done`；支持取消；同一时刻只允许一个扫描任务 |
| 增量入库 | `path` 唯一索引 + `size`/`mtime` 比对，未变化的文件直接跳过；扫描结束把本次未出现的记录标记为 `missing`（失效），不会误删数据 |
| 浏览 | 卡片网格 + 列表视图、分页、多字段排序（标题 / 大小 / 时间 / 类型）、按类型 Tab 过滤、星标收藏 |
| 搜索与标签 | 标题 / 文件名 / 路径模糊搜索（大小写不敏感，`%`、`_` 已转义），自定义标签，批量打标签 |
| 预览 | 通过 Tauri asset 协议直接显示本地图片、播放视频（扫描目录会自动加入 asset scope） |
| 系统集成 | 在资源管理器中定位、用默认程序打开、文件是否存在探测 |
| 设置 | 媒体类型开关、每种类型的扩展名白名单、最小体积（KB）、是否跳过隐藏文件、是否跟随符号链接、忽略目录名，全部持久化到 `settings` 表（JSON） |

## 技术栈与版本

| 层 | 选型 |
| --- | --- |
| 桌面壳 | Tauri 2.11（`protocol-asset`、`tauri-plugin-dialog`、`tauri-plugin-opener`） |
| 数据库 | SQLite（`rusqlite 0.40`，`bundled` 静态编译，无需系统预装） |
| 后端 | Rust 2021，`walkdir`、`thiserror`、`serde` |
| 前端 | Vite 8 + React 19 + TypeScript 5.9（无 UI 框架，手写暗色主题 CSS） |

## 发布与自动打包

见 [`AGENTS.md`](./AGENTS.md)（完整工作流程）。要点：

- **每完成一个任务** → `just verify` 全绿后 commit + push；
- **每次改版本号** → `just publish <版本>`：同步四个文件的版本号（`package.json`、`src-tauri/tauri.conf.json`、`Cargo.toml`、`Cargo.lock`）→ commit → 打 tag `v<版本>` → push；
- push tag 触发 [`.github/workflows/release.yml`](./.github/workflows/release.yml)：**Windows / macOS / Linux 三个平台**各自编译**独立可执行文件**（`--no-bundle`，不打安装包），macOS 同时出 Apple Silicon 与 Intel 两个架构，产物 + `SHA256SUMS.txt` 自动发布到 GitHub Release；
- 每次 push / PR 跑 [`.github/workflows/ci.yml`](./.github/workflows/ci.yml)：类型检查 + `cargo fmt --check` + `clippy -D warnings` + `cargo test`。

```bash
# 本地出一个当前平台、免安装、可直接执行的单文件（不动版本号、不联网）
just release                    # → out/media-manager-0.1.0-windows-x86_64.exe + SHA256SUMS.txt
just release --target <triple>  # 指定目标（需先 rustup target add）
just release --no-copy          # 只编译，产物留在 src-tauri/target/release/

# 发版（改版本号 + commit + tag + push，由 CI 出三平台包）
just version           # 看当前版本（校验各文件是否一致）
just publish           # 不带参数：终端里问一下要哪个版本（回车 = patch）
just publish patch     # 0.1.0 → 0.1.1，改版本 + commit + tag + push
just publish 0.2.0 --dry-run   # 只预览（默认下一个 patch），不改文件不提交
```

Release 产物命名：`media-manager-<版本>-<windows-x86_64.exe|macos-aarch64|macos-x86_64|linux-x86_64>`。
`just release` 的本地产物用同一套命名，放在 `out/`（已在 `.gitignore` 里）。

> CI 里会删掉 `.cargo/config.toml`（本地用的中科大镜像）走官方源。

## 环境要求

- Node.js ≥ 20（开发用 24.x 验证）
- Rust stable（MSVC toolchain）+ Visual Studio Build Tools（C++ 桌面开发 / Windows SDK）
- Windows 10/11（WebView2 运行时；Win11 已内置）
- [`just`](https://github.com/casey/just)（可选，推荐；`just --version` 验证）
- Windows 侧跑 `just` 时需要 Git 自带的 Git Bash（提供 `sh.exe`），WSL 下直接可用
- Linux / macOS 亦可编译，数据目录逻辑相同

## 快速开始

项目用 [`just`](https://github.com/casey/just) 做统一入口（`justfile`），也可以直接用 npm / cargo。

```bash
just                 # 列出全部命令
just setup           # 首次准备：npm install + cargo fetch
just dev             # 开发模式（Vite 热更新 + Tauri 窗口）
just release         # 本地打免安装单文件 → out/（不改版本号、不联网）
just build-exe       # 只编译（不复制到 out/，不联网下载 NSIS/WiX）
just build           # 完整打包（exe + 安装包，打安装包需要联网）
just run             # 编译后直接运行 release 版
just test            # Rust 测试
just check           # 类型检查 + cargo check + clippy -D warnings
just verify          # 提交前跑一遍：类型检查 + 测试
just db              # 看 SQLite 里的数据（表 / 条数 / 媒体库 / 类型分布 / 设置）
just doctor          # 检查工具链版本与数据目录
just clean           # 清理 dist / out / target / .data
```

<details>
<summary>命令一览表</summary>

| 命令 | 说明 |
| --- | --- |
| `just` | 列出所有命令（默认配方） |
| `just setup` | `npm install` + `cargo fetch` |
| `just doctor` | 打印 node / npm / cargo / clippy / rustfmt / just 版本与数据目录 |
| `just dev` (`d`) | `tauri dev`：Vite 热更新 + 桌面窗口 |
| `just web-dev` | 只起 Vite（浏览器里看 UI，无 Tauri API） |
| `just typecheck` | `tsc --noEmit` |
| `just web` | `tsc --noEmit && vite build` → `dist/` |
| `just check` (`c`) | typecheck + `cargo check --all-targets` + `cargo clippy -- -D warnings` |
| `just test` (`t`) | `cargo test`；可追加参数：`just test scan --nocapture` |
| `just verify` | typecheck + test |
| `just fmt` / `just fmt-check` | `cargo fmt` / `cargo fmt --check` |
| `just build` (`b`) | 完整打包（前端构建 + release exe + NSIS/MSI 安装包） |
| `just release` | 本地打免安装单文件：编译 + 复制到 `out/media-manager-<版本>-<平台>-<架构>[.exe]` + 生成 `SHA256SUMS.txt`（不动版本号、不提交、不联网） |
| `just build-exe` | 等价于 `just release --no-copy`：`tauri build --no-bundle`，产物留在 `src-tauri/target/release/` |
| `just run` | 编译后直接启动 release exe |
| `just publish [版本]` | 发版：改版本号 + commit + tag + push（由 CI 出三平台 Release） |
| `just icon` | 重新生成图标（`app-icon.png` + `src-tauri/icons/*`） |
| `just db [路径]` | 打印数据库概况（默认自动探测 `.data/data.db`） |
| `just clean` / `just clean-all` | 删 `dist` `out` `target` `.data` / 连 `node_modules` 一起删 |

</details>

不装 `just` 时的等价命令：

```bash
npm install          # 安装前端依赖
npm run app:dev      # 启动开发模式（Vite + Tauri 窗口，热更新）
npm run app:build    # 打包（默认生成 exe + 安装包）
npm run app:build -- --no-bundle   # 只生成 exe（不联网下载 NSIS/WiX）
npm run build        # 前端类型检查 + 构建 dist/
npm run typecheck    # 只做类型检查
npm run icon         # 重新生成应用图标（内置纯 JS PNG 生成器）
```

Rust 侧测试（扫描、入库、查询、设置等 6 个用例，含真实 SQLite 与文件系统）：

```bash
just test            # 或 cd src-tauri && cargo test
```

> 首次编译需要下载并编译 Tauri 全套依赖，约 5~15 分钟；之后增量编译在 10 秒级。

### justfile 的平台处理

`justfile` 的配方统一写成 POSIX sh：

- Windows 侧显式设置 `set windows-shell := ["sh", "-cu"]`，走 Git Bash 的 `sh.exe`（随 Git 安装），
  这样 `rm -rf`、`cd x && y` 在两个平台行为一致；
- 工具名按平台切换：WSL 里没有 Linux 版 `node` / `cargo`，需要走 interop 调用 `node.exe` / `cargo.exe`，
  原生 Windows / Linux / macOS 则直接用 `node` / `cargo`（`{{node}}` / `{{cargo}}` / `{{exe}}` 变量）；
- 因此 WSL 与 Windows 下 `just <配方>` 都能跑，无需改文件。

## 数据存储位置

`resolve_data_dir()` 按以下顺序探测，第一个可写目录生效：

1. 环境变量 `MEDIA_MANAGER_HOME` → `$MEDIA_MANAGER_HOME/.data`
2. **应用目录** → `<应用目录>/.data`
   - 开发模式（debug）：`src-tauri/..`（即项目根目录）
   - 发布模式（release）：可执行文件所在目录（绿色版 / 便携版，数据随应用走）
3. 兜底：系统本地应用数据目录 → `<AppLocalData>/.data`

最终数据库文件为 `.data/data.db`（WAL 模式，同目录下会有 `-wal` / `-shm` 临时文件）。

### 表结构

```
libraries(id, path UNIQUE, name, enabled, created_at, last_scan_at)
          -- media_count / total_size 是查询时 LEFT JOIN media 现算的，不落库
media(id, library_id → libraries(id) ON DELETE CASCADE, path UNIQUE, dir, file_name,
      title, ext, kind, size, mtime, duration, width, height, tags, favorite,
      missing, created_at, updated_at)
settings(key PRIMARY KEY, value)        -- 目前仅 settings 一行，存整份 JSON 配置
```

索引：`kind`、`library_id`、`favorite`、`missing`、`mtime`。

看库里的真实数据（表 / 行数 / 媒体库 / 类型分布 / 标签 / 设置）：

```bash
just db                      # 自动探测 .data/data.db
just db path/to/data.db      # 指定路径
```

## 项目结构

```
media-manager/
├─ index.html
├─ justfile                     # 项目管理入口（just dev / test / release / publish / db …）
├─ package.json                 # 前端脚本与依赖
├─ vite.config.ts               # dev server 固定 1420 端口
├─ scripts/gen-icon.mjs         # 纯 JS 生成 1024×1024 应用图标
├─ scripts/db-info.mjs          # just db：用 node:sqlite 只读打印数据库概况
├─ scripts/build-standalone.mjs # just release：本地编译 + 收集独立可执行文件到 out/
├─ scripts/bump-version.mjs     # 同步四个文件的版本号（just version / bump / publish）
├─ scripts/publish.sh           # just publish：改版本 + commit + tag + push
├─ src/                         # React 前端
│  ├─ App.tsx                   # 状态编排（媒体库 / 查询 / 扫描 / 选中项）
│  ├─ components/               # Sidebar、Toolbar、ScanBar、MediaGrid、DetailPanel、SettingsDialog
│  ├─ lib/{api,types,format}.ts # invoke 封装、类型定义、格式化工具
│  └─ styles.css
└─ src-tauri/                   # Rust 后端
   ├─ src/lib.rs                # Builder、插件、setup、invoke_handler
   ├─ src/db.rs                 # 连接、迁移、CRUD、分页查询、设置、数据目录解析
   ├─ src/scanner.rs            # walkdir 扫描、进度事件、失效标记、取消
   ├─ src/media.rs              # 扩展名 → 媒体类型索引、默认白名单
   ├─ src/commands.rs           # 全部 #[tauri::command]
   ├─ src/models.rs / error.rs
   ├─ build.rs                  # 测试目标的 Windows 清单修正（见下）
   ├─ capabilities/default.json # ACL：core / dialog / opener
   └─ tests/core.rs             # 集成测试
```

## 已实现命令（前端 `invoke` 接口）

`app_info`、`list_libraries`、`add_library`、`remove_library`、`set_library_enabled`、`scan`、`cancel_scan`、`scan_status`、`list_media`、`get_media`、
`update_media`、`delete_media`、`clean_missing`、`stats`、`get_settings`、`save_settings`、
`reveal_in_explorer`、`open_with_default`、`path_exists`。

## 实现要点 / 踩坑记录

- **扫描不阻塞 UI**：扫描在 `tauri::async_runtime::spawn_blocking` 中执行，使用**独立的
  SQLite 连接**（WAL 允许读写并发）；每 500 条提交一次事务，进度事件按 120ms 节流，
  避免事件风暴。
- **并发保护**：`ScanState`（`AtomicBool` running / cancel）保证单任务，重复点击只会返回
  错误而不是起两个扫描线程。
- **扫描性能**：扩展名比对走 `HashMap<ext, kind>` 索引，遍历前先构建一次；
  `temp.scan_seen` 临时表记录本次命中的 id，结束后统一标记缺失。
- **失效而非删除**：文件被移动 / 删除后记录标记 `missing`，界面可过滤并一键清理，
  避免误删用户手工打的标签与收藏。
- **资源预览授权**：asset 协议默认不放行任意路径，添加媒体库时动态调用
  `asset_protocol_scope().allow_directory()`，启动时也会为已入库目录重新授权。
- **`cargo test` 在 Windows 上的坑**：lib/bin 单元测试可执行文件不会带上 tauri-build 嵌入的
  Windows 清单，缺少 comctl32 v6 声明时会加载旧版 comctl32，而 tao/wry 引用的
  `TaskDialogIndirect` 只存在于 v6，进程会在启动阶段直接以 `STATUS_ENTRYPOINT_NOT_FOUND
  (0xC0000139)` 退出。解决办法：`build.rs` 为测试目标补一份清单
  （`rustc-link-arg-tests=/MANIFEST:EMBED /MANIFESTINPUT:...`），同时用
  `[lib] test = false` / `[[bin]] test = false` 关掉不需要的测试目标——因为给它们也加
  `/MANIFEST:EMBED` 会和 tauri-build 的 `resource.lib` 冲突（CVT1100 资源重复）。
- **构建产物**：`dist/`（前端）、`src-tauri/target/{debug,release}/`（后端 + 安装包）。

## 网络受限环境

仓库内 `.cargo/config.toml` 使用中科大镜像做 crates.io 源替换；`npm` 侧使用
`registry.npmmirror.com`。若你的网络可以直连，删掉该文件即可。

## 后续可做

- 缩略图缓存（图片 / 视频首帧）与小视频预览
- 重复文件检测（大小 + 采样哈希）
- 媒体库规则表达式（包含 / 排除 glob）与多库合并视图
- 标签自动补全、批量重命名、拖拽入标签
- 定时自动扫描（前台或系统计划任务）
