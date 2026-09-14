# Media Manager · 项目管理脚本
#
# 用法：  just              列出全部命令
#         just setup        首次准备（前端依赖 + Rust crate）
#         just dev          开发模式（Vite 热更新 + Tauri 窗口）
#         just test         跑 Rust 测试
#
# 说明：配方统一用 POSIX sh 语法；shell 里没有 `rm`/`cd &&` 的差异由
#       `windows-shell` 兜底（Windows 侧需要 Git Bash 的 sh.exe，一般随 Git 安装）。

set windows-shell := ["sh", "-cu"]

# ---------------------------------------------------------------- 工具链
#
# 本项目通常跑在 WSL 里，但 node / cargo 都是 Windows 侧的：
# WSL 内没有 Linux 版 node/cargo，需要走 interop 调用 *.exe；
# 原生 Windows(Git Bash)/Linux/macOS 则直接调用。
npm := "npm"
node := if os_family() == "windows" { "node" } else { "node.exe" }
cargo := if os_family() == "windows" { "cargo" } else { "cargo.exe" }
exe := if os_family() == "windows" { ".exe" } else { "" }
app_exe := "src-tauri/target/release/media-manager" + exe

export RUST_BACKTRACE := "1"

# ---------------------------------------------------------------- 默认

# 列出所有可用命令
default:
	@just --list --unsorted

# ---------------------------------------------------------------- 准备

# 安装前端依赖并预拉取 Rust crate（首次克隆后执行一次）
setup:
	{{npm}} install
	cd src-tauri && {{cargo}} fetch

# 检查工具链版本与数据目录，排查环境问题
doctor:
	@echo "== node / npm =="
	@{{node}} --version
	@{{npm}} --version
	@echo "== rust =="
	@{{cargo}} --version
	@-{{cargo}} clippy --version
	@-{{cargo}} fmt --version
	@echo "== just =="
	@just --version
	@echo "== 数据目录（dev 模式写入项目根 .data/data.db）=="
	@{{node}} -e "console.log(require('node:path').resolve('.data/data.db'))"

# ---------------------------------------------------------------- 开发

# 启动开发模式：Vite 热更新 + Tauri 桌面窗口
dev:
	{{npm}} run app:dev

# 只跑前端：浏览器里调 UI（没有 Tauri API，仅用于看样式）
web-dev:
	{{npm}} run dev

# 只看 TypeScript 类型错误
typecheck:
	{{npm}} run typecheck

# 构建前端产物 dist/
web:
	{{npm}} run build

# ---------------------------------------------------------------- 检查 / 测试

# 跑全部检查：TypeScript + cargo check + clippy
check: typecheck
	cd src-tauri && {{cargo}} check --all-targets
	cd src-tauri && {{cargo}} clippy --all-targets -- -D warnings

# 跑 Rust 测试（扫描 / 入库 / 查询 / 设置）；追加参数：just test scan --nocapture
test *args:
	cd src-tauri && {{cargo}} test {{args}}

# 提交前跑一遍：类型检查 + Rust 测试
verify: typecheck test

# 格式化 Rust 代码
fmt:
	cd src-tauri && {{cargo}} fmt

# 格式化检查（不写回文件）
fmt-check:
	cd src-tauri && {{cargo}} fmt --check

# ---------------------------------------------------------------- 打包

# 完整打包：前端构建 + release exe + 安装包（NSIS/MSI 需要联网下载）
build:
	{{npm}} run app:build

# 只出 release exe，不联网打安装包
build-exe:
	{{npm}} run app:build -- --no-bundle

# 打包并直接运行 release 版
run: build-exe
	./{{app_exe}}

# 重新生成应用图标（app-icon.png + src-tauri/icons/*）
icon:
	{{npm}} run icon

# ---------------------------------------------------------------- 数据

# 查看 SQLite 数据概况（表 / 条数 / 媒体库 / 类型分布 / 设置）；可指定路径：just db <path>
db *args:
	{{node}} scripts/db-info.mjs {{args}}

# 删除构建产物与开发数据库（保留 node_modules）
clean:
	rm -rf dist src-tauri/target .data src-tauri/target/debug/.data src-tauri/target/release/.data

# 彻底清理：连 node_modules 一起删
clean-all: clean
	rm -rf node_modules

# ---------------------------------------------------------------- 版本 / 发布

# 查看当前版本号（校验 package.json / tauri.conf.json / Cargo.toml 是否一致）
version:
    @{{node}} scripts/bump-version.mjs --show

# 只改版本号（不提交）：just bump 0.2.0 / just bump patch|minor|major
bump spec:
    @{{node}} scripts/bump-version.mjs {{spec}}

# 发版：改版本号 → commit → tag v<版本> → push，push tag 自动出三平台 Release
# 用法：just release（交互式，回车 = patch）| just release patch | just release 0.2.0
#       just release --dry-run（预览下一个 patch）| just release 1.0.0 --no-push
release spec="" *args:
    @NODE_BIN={{node}} sh scripts/release.sh {{spec}} {{args}}

# ---------------------------------------------------------------- 别名

alias d := dev
alias t := test
alias b := build
alias c := check
