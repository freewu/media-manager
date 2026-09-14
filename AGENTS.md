# AGENTS.md · 协作约定

本文件是本仓库的**强制工作流程**，AI 助手和人类协作者在动手前请先读完。

---

## 1. 铁律

### 1.1 每完成一个任务 → 必须 commit + push

任何一个任务（新功能、修 bug、重构、文档、配置）做完后，**必须**按顺序执行：

```bash
just verify                     # 前端类型检查 + Rust 测试，必须全绿
git add -A
git commit -m "<type>: <中文简述>"
git push origin main            # 或 git push origin HEAD
```

- **不允许**把改动留在工作区不提交。
- **不允许**只 commit 不 push（远程才是交付物）。
- push 后如果有 CI，等它绿；红了要立刻修（修完再 commit + push）。

提交信息用 Conventional Commits 前缀 + 中文描述：

| 前缀 | 用途 | 例子 |
| --- | --- | --- |
| `feat` | 新功能 | `feat: 支持按标签筛选媒体` |
| `fix` | 修 bug | `fix: 修正排序 SQL 的 COLLATE 位置导致列表打不开` |
| `refactor` | 重构（不改行为） | `refactor: 扫描进度事件节流抽成独立函数` |
| `docs` | 文档 | `docs: README 补充 just 命令表` |
| `test` | 测试 | `test: 补充扫描去重用例` |
| `chore` | 构建/依赖/杂项 | `chore: 升级 tauri 到 2.11.5` |
| `ci` | CI/工作流 | `ci: 三平台 release 工作流` |

### 1.2 每次改版本号 → 必须打 tag → 触发三平台自动打包 Release

> 两个命令别混：
> - **`just release`** = 本地编译出**当前平台的免安装独立可执行文件**（`out/`，**不改版本号**、不提交、不推送）。
> - **`just publish <版本>`** = 改版本号 + commit + tag + push，由 GitHub Actions 出三平台 Release。
> 改版本号只能走 `just publish`，`just release` 一律不碰版本号。

```bash
just publish 0.2.0              # 指定版本
just publish patch              # 也支持 minor / major
just publish                    # 不带参数：终端里问你要哪个版本（回车 = patch）
just publish --dry-run          # 只预览（默认下一个 patch），不改文件不提交
```

这一条命令会依次做：

1. 把版本号同步写进 `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`
2. `git commit -m "chore(release): v0.2.0"`
3. `git tag -a v0.2.0 -m "v0.2.0"`
4. `git push origin main --follow-tags`

推送 tag 会触发 `.github/workflows/release.yml`：

- **3 个平台**（Windows x86_64 / Linux x86_64 / macOS）各自编译**独立可执行文件**（`tauri build --no-bundle`，不打安装包、不签名）
- 产物以 `media-manager-<版本>-<平台>` 命名上传到 GitHub Release，并附 `SHA256SUMS.txt`
- macOS 同时出 `aarch64`（Apple Silicon）和 `x86_64`（Intel）两个二进制

> 规则：**版本号改动**和**打 tag** 永远是同一次提交，tag 名必须等于 `v` + 三个文件里的版本号。
> 工作流里有一步会校验 `tag == package.json version`，不一致直接失败。
> 临时验证工作流可以手动触发（Actions → Release → Run workflow），tag 留空则只构建产物不发布。

其它参数：`--no-push`（只 commit + 打 tag，先不推）、`just bump <版本>`（只改版本号不提交）。
非终端环境（CI/管道）下不带版本参数会直接报用法并退出，不会卡在等输入。

---

## 2. 任务完成清单（每次收工前逐条勾）

- [ ] 代码能跑：`just dev` 或 `just build-exe` 至少验证过一次
- [ ] `just fmt`（Rust 代码格式化）
- [ ] `just verify`（`tsc --noEmit` + `cargo test`）全绿
- [ ] `just check`（clippy `-D warnings`）无告警
- [ ] 用法有变化 → 更新 `README.md`；流程有变化 → 更新本文件
- [ ] `git commit` + `git push`
- [ ] 改了版本号 → `just publish <版本>`（tag 已推，Release 已触发）

---

## 3. 环境与命令

### 3.1 环境

| 项 | 说明 |
| --- | --- |
| 工作目录 | Windows 路径 `E:\work\github\media-manager`（WSL 下 `/mnt/e/work/github/media-manager`） |
| Shell | 常用 WSL，但 **node / cargo 都是 Windows 侧的**：WSL 内没有 Linux 版 `node`/`cargo`，需要走 interop 调 `node.exe` / `cargo.exe`；`justfile` 已按平台自动切换 |
| Windows 侧跑 `just` | 需要 Git 自带的 Git Bash（提供 `sh.exe`），`justfile` 里 `set windows-shell := ["sh", "-cu"]` |
| 依赖镜像 | `.cargo/config.toml` 把 crates.io 换成中科大镜像（国内直连超时）；npm 用 npmmirror。**CI 里会删掉这个文件**走官方源 |
| 打包 | 本地用 `--no-bundle`（避免联网下载 NSIS/WiX）；安装包只在需要时打 |

### 3.2 命令（全部走 `just`，别手敲 npm/cargo）

```bash
just                  # 列出全部命令
just setup            # 首次：npm install + cargo fetch
just doctor           # 工具链版本 + 数据目录自检
just dev              # 开发模式（Vite 热更新 + Tauri 窗口）
just typecheck        # tsc --noEmit
just test             # cargo test（可 just test scan --nocapture）
just check            # typecheck + cargo check + clippy -D warnings
just verify           # typecheck + test
just fmt / fmt-check  # cargo fmt / --check
just release          # 本地打独立可执行文件 → out/（不改版本号、不提交）
just build-exe        # 只编译不复制（产物在 src-tauri/target/release/）
just run              # 编译后直接运行 release 版
just db [路径]        # 打印 SQLite 数据概况
just version          # 打印当前版本号（校验三个文件是否一致）
just bump <版本>      # 只改版本号，不提交
just publish <版本>   # 改版本 + commit + tag + push（触发三平台 Release）
```

---

## 4. 代码约定

### 4.1 目录职责

```
src/                       React 前端（Vite）
  lib/api.ts               所有 invoke 调用的唯一出口，禁止在组件里直接 invoke
  lib/types.ts             与 Rust models.rs 一一对应的类型
  components/              纯展示组件，状态提升到 App.tsx
src-tauri/src/
  db.rs                    连接、建表迁移、CRUD、分页查询、设置、数据目录解析
  scanner.rs               walkdir 扫描、进度事件、失效标记、取消
  media.rs                 扩展名 → 媒体类型索引、默认白名单
  commands.rs              全部 #[tauri::command]（薄层，逻辑放 db/scanner）
  models.rs / error.rs     数据结构 / AppError
src-tauri/tests/core.rs    集成测试（唯一测试入口）
scripts/                   gen-icon.mjs、db-info.mjs、build-standalone.mjs（just release）、bump-version.mjs、publish.sh（just publish）
```

### 4.2 Rust

- 命令层不用 `unwrap()`，错误统一 `AppError`（`thiserror`），前端按 `errorMessage()` 展示。
- 涉及 SQL 的逻辑放 `db.rs`，扫描放 `scanner.rs`；新命令要同时加到 `lib.rs` 的 `invoke_handler`。
- 新增字段要写进迁移（`init_schema`），并保证老库能平滑升级。
- 测试放 `src-tauri/tests/core.rs`，用 `tauri::test::mock_app()` + 临时目录，别 mock 掉 SQLite。
- **不要在 `src-tauri/src/` 里写 `#[cfg(test)] mod tests`**：lib/bin 的测试目标在 Windows 上会因缺少 comctl32 v6 清单而崩（见 §5）。

### 4.3 TypeScript / React

- 文案、注释用中文；类型全部来自 `lib/types.ts`（Rust 侧 `#[serde(rename_all = "camelCase")]`）。
- 调后端只用 `api.xxx()`；错误用 `errorMessage(error)` 转成人话再弹 toast。
- 组件保持函数式 + hooks，不引 UI 框架，样式写在 `src/styles.css`。

### 4.4 版本号

三个地方必须始终一致：`package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`。
只改版本号不动别的 → `just bump <版本>`；要发版（打 tag 让 CI 出三平台包）→ `just publish <版本>`；
只想本地出一个免安装可执行文件 → `just release`（不碰版本号，见 §1.2）。

---

## 5. 已知坑（别再踩）

1. **`cargo test` 在 Windows 上启动即崩（0xC0000139 / STATUS_ENTRYPOINT_NOT_FOUND）**
   测试可执行文件没有 Windows 清单 → 加载旧版 `comctl32`(v5.82)，而 tao/wry 的 `TaskDialogIndirect` 只在 v6。
   已在 `build.rs` 用 `rustc-link-arg-tests` 给测试目标补清单，并且 `Cargo.toml` 里 `[lib] test = false` / `[[bin]] test = false`。
   → 测试只能写在 `tests/` 下；给 lib/bin 加 `/MANIFEST:EMBED` 会和 tauri-build 的 `resource.lib` 冲突报 `CVT1100`。
2. **SQLite 的 `COLLATE` 位置**：必须是 `ORDER BY m.title COLLATE NOCASE ASC`，写成 `... ASC COLLATE NOCASE` 是语法错误（曾导致列表整页打不开）。
3. **`ORDER BY` 里拼接排序字段**：只允许白名单字段（`m.title` / `m.kind` 才加 `COLLATE NOCASE`），避免注入。
4. **扫描/清理用的 SQLite 连接要独立**（WAL），别在持有主连接锁的时候再开一个连接做清理，会死锁。
5. **WSL 里 `nohup cmd.exe ... &` 不生效**，要后台跑长任务用 `powershell.exe Start-Process -FilePath cmd.exe -ArgumentList ... -WindowStyle Hidden`。
6. **WSL interop 输出带 `\r`**，脚本里处理外部命令输出时记得 `tr -d '\r'`。
7. **打包别用 `tauri build` 直连**：会联网拉 NSIS/WiX 失败 → 用 `--no-bundle`（`just build-exe`）。
8. **前端 `dist/` 是 release 的内嵌资源**：改了前端一定要重新 `tauri build`，否则跑的是旧界面。

---

## 6. 数据与产物

- 运行期数据：`<应用目录>/.data/data.db`（WAL）。开发模式 = 项目根 `.data/`，release = exe 同级 `.data/`；`MEDIA_MANAGER_HOME` 可覆盖。
- 这些都不进仓库：`node_modules/`、`dist/`、`src-tauri/target/`、`.data/`、`*.db*`、`*.log`。
- 发布产物：GitHub Release 上的 `media-manager-<版本>-<平台>` + `SHA256SUMS.txt`。
