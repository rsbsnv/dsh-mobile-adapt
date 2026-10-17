#!/usr/bin/env bash
# dsh-mobile-adapt 本地安装脚本
#
# 做三件事：
#   1. 把插件目录复制进当前 profile 的 plugins/（SELinux 禁止 link，只能复制）
#   2. 在 profile 的 cordis.patch.yml 末尾追加一行 insert（幂等，已有则跳过）
#   3. 提示重启引擎
#
# 用法：  bash install.sh            # 安装/更新
#         bash install.sh --uninstall # 卸载（删目录 + 删 patch 行）
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
PROFILE_DIR="${DSH_PROFILE_DIR:?需要 DSH_PROFILE_DIR 环境变量（DSH 引擎会自动提供）}"
DEST="$PROFILE_DIR/plugins/dsh-mobile-adapt"
PATCH="$PROFILE_DIR/cordis.patch.yml"
MARK_BEGIN="# >>> dsh-mobile-adapt (由 install.sh 写入) >>>"
MARK_END="# <<< dsh-mobile-adapt <<<"

if [[ "${1:-}" == "--uninstall" ]]; then
  rm -rf "$DEST"
  if [[ -f "$PATCH" ]] && grep -qF "$MARK_BEGIN" "$PATCH"; then
    # 删除标记块（含两端标记行）
    awk -v b="$MARK_BEGIN" -v e="$MARK_END" '
      $0 == b { skip = 1; next }
      $0 == e { skip = 0; next }
      !skip { print }
    ' "$PATCH" > "$PATCH.tmp" && mv "$PATCH.tmp" "$PATCH"
  fi
  echo "已卸载 dsh-mobile-adapt。重启引擎后生效。"
  exit 0
fi

# 1. 复制文件
mkdir -p "$DEST/lib"
cp "$SRC/package.json" "$DEST/package.json"
cp "$SRC/lib/index.js" "$DEST/lib/index.js"
cp "$SRC/lib/client.js" "$DEST/lib/client.js"
echo "已复制插件文件 → $DEST"

# 2. patch 行（幂等）
touch "$PATCH"
if ! grep -qF "$MARK_BEGIN" "$PATCH"; then
  {
    echo ""
    echo "$MARK_BEGIN"
    echo "# 手机端适配层：抽屉侧栏 + 触控命中区 + 软键盘/安全区 + 正文字号下限。"
    echo "# 整块删掉（或用 install.sh --uninstall）即可完全撤销。"
    echo "- insert:"
    echo "    - id: mobile-adapt"
    echo "      name: ./plugins/dsh-mobile-adapt/lib/index.js"
    echo "$MARK_END"
  } >> "$PATCH"
  echo "已在 cordis.patch.yml 追加挂载行"
else
  echo "cordis.patch.yml 已存在挂载行，跳过"
fi

echo ""
echo "下一步：设置 → 重启引擎（中文界面：设置 → 重启引擎），然后刷新页面。"
