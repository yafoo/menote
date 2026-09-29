#!/bin/sh
# 构建 menote-pc
#
#   ./build.sh            构建当前平台      → dist/menote-<os>-<arch>[.exe]
#   ./build.sh all        交叉编译全平台    → dist/
#   ./build.sh linux      只构建指定平台    → dist/（windows|linux|darwin）
#
# 产物命名统一为 menote-<os>-<arch>（Windows 加 .exe），当前平台构建与交叉
# 编译只差一个参数，文件名规则完全一致——这样从发布页挑一个文件下载就能直接
# 跑，不用去猜「这个是给哪台机器的」。
#
# 本程序是纯 Go（依赖 go-iroh，不涉及 cgo），所以交叉编译不需要任何
# 额外工具链：CGO_ENABLED=0 + GOOS/GOARCH 就够了。
set -e
cd "$(dirname "$0")"

OUT=dist
BASE=menote

# 当前平台的 GOOS/GOARCH（用 go env 问，不猜；gox 之类都不需要）
host_os=$(go env GOHOSTOS)
host_arch=$(go env GOHOSTARCH)

# go_build <输出路径> [GOOS] [GOARCH]
go_build() {
  out=$1
  if [ -n "$2" ]; then
    CGO_ENABLED=0 GOOS=$2 GOARCH=$3 go build -trimpath -ldflags "-s -w" -o "$out" .
  else
    CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o "$out" .
  fi
}

# build_one <GOOS> <GOARCH> → dist/<BASE>-<os>-<arch>[.exe]
build_one() {
  os=$1
  arch=$2
  name="$BASE-$os-$arch"
  if [ "$os" = "windows" ]; then
    name="$name.exe"
  fi
  echo "  -> $os/$arch"
  go_build "$OUT/$name" "$os" "$arch"
}

case "${1:-}" in
  "" )
    mkdir -p "$OUT"
    echo "构建当前平台（$host_os/$host_arch）…"
    build_one "$host_os" "$host_arch"
    echo "完成：$OUT/${BASE}-${host_os}-${host_arch}$([ "$host_os" = windows ] && echo .exe)"
    ;;
  all )
    mkdir -p "$OUT"
    echo "交叉编译全平台…"
    build_one windows amd64
    build_one windows arm64
    build_one linux   amd64
    build_one linux   arm64
    build_one darwin  amd64
    build_one darwin  arm64
    echo "完成：$OUT/"
    ls -la "$OUT"
    ;;
  windows|linux|darwin )
    mkdir -p "$OUT"
    build_one "$1" amd64
    build_one "$1" arm64
    echo "完成：$OUT/"
    ;;
  * )
    echo "用法：$0 [all|windows|linux|darwin]" >&2
    exit 2
    ;;
esac
