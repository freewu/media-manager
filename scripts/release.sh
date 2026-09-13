#!/bin/sh
# 发版脚本（被 `just release <版本>` 调用）：
#   1. 统一改版本号（package.json / tauri.conf.json / Cargo.toml）
#   2. git commit
#   3. git tag -a v<版本>
#   4. git push（分支 + tag，tag 推送即触发 GitHub Actions 三平台打包与 Release）
#
# 用法：sh scripts/release.sh 0.2.0 | patch | minor | major [--dry-run] [--no-push]
set -eu

spec="${1:-}"
[ -n "$spec" ] || { echo "用法：just release <版本|major|minor|patch>" >&2; exit 2; }
shift

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

# justfile 会按平台传进来（WSL 里没有 Linux 版 node，需要 node.exe）
node_bin="${NODE_BIN:-node}"
command -v "$node_bin" >/dev/null 2>&1 || { echo "✗ 找不到 $node_bin" >&2; exit 1; }

dry_run=0
no_push=0
for arg in "$@"; do
    case "$arg" in
        --dry-run) dry_run=1 ;;
        --no-push) no_push=1 ;;
        *) echo "未知参数：$arg" >&2; exit 2 ;;
    esac
done

if [ "$dry_run" -eq 0 ] && [ -n "$(git status --porcelain)" ]; then
    echo "✗ 工作区有未提交的改动，先提交或 stash 再发版：" >&2
    git status --short >&2
    exit 1
fi

branch="$(git rev-parse --abbrev-ref HEAD)"

# 1. 改版本号（新版本号从 stdout 拿）
version="$("$node_bin" scripts/bump-version.mjs ${dry_run:+--dry-run} "$spec")"
tag="v$version"

if [ "$dry_run" -eq 1 ]; then
    echo "[dry-run] 跳过 commit / tag / push（目标 tag：$tag，分支：$branch）"
    exit 0
fi

# 2. 提交
git add -A
git commit -m "chore(release): $tag"

# 3. 打 tag（已存在就报错退出，避免覆盖历史版本）
if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
    echo "✗ tag $tag 已存在，请换个版本号" >&2
    exit 1
fi
git tag -a "$tag" -m "$tag"

# 4. 推送分支与 tag
if [ "$no_push" -eq 1 ]; then
    echo "已提交并打 tag $tag（--no-push，未推送）"
    echo "手动推送：git push origin $branch --follow-tags"
    exit 0
fi

git push origin "$branch" --follow-tags

echo ""
echo "✓ 已推送 $tag"
echo "  GitHub Actions 会为 Windows / Linux / macOS 编译独立可执行文件并发布 Release："
echo "  https://github.com/$(git remote get-url origin | sed -e 's#.*github.com[:/]##' -e 's#\.git$##')/releases/tag/$tag"
