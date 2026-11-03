#!/bin/sh
# Playdev clones into its persistent data directory before invoking this file.
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
export NEXT_TELEMETRY_DISABLED=1
export AIX_PYTHON_API_ORIGIN=http://127.0.0.1:8000
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}"
DATA_DIR="${AIX_DATA_DIR:-$(dirname "$PWD")}"
RUNTIME="$DATA_DIR/aix-runtime"
export UV_CACHE_DIR="$RUNTIME/uv-cache"
export UV_PYTHON_INSTALL_DIR="$RUNTIME/python"
mkdir -p "$RUNTIME/bin"
echo "[AIX] Checking Node.js runtime"
node --version
node -e 'if(Number(process.versions.node.split(".")[0])<20) throw Error("AIX requires Node.js 20 or newer")'

# Use a pinned official uv binary when the image does not already provide it.
if command -v uv >/dev/null 2>&1; then
  UV=$(command -v uv)
else
  UV="$RUNTIME/bin/uv"
  if [ ! -x "$UV" ]; then
    case "$(uname -m)" in
      x86_64) UV_ARCH=x86_64 ;;
      aarch64) UV_ARCH=aarch64 ;;
      *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
    esac
    echo "[AIX] Installing official uv 0.13.6"
    ARCHIVE="$RUNTIME/uv.tar.gz"
    URL="https://github.com/astral-sh/uv/releases/download/0.13.6/uv-$UV_ARCH-unknown-linux-musl.tar.gz"
    if command -v curl >/dev/null 2>&1; then
      curl --fail --location --retry 3 "$URL" --output "$ARCHIVE"
    else
      wget -O "$ARCHIVE" "$URL"
    fi
    tar -xzf "$ARCHIVE" -C "$RUNTIME/bin" --strip-components=1
  fi
fi

export UV_PROJECT_ENVIRONMENT="$RUNTIME/venv"
if [ ! -x "$UV_PROJECT_ENVIRONMENT/bin/python" ]; then
  "$UV" venv --python 3.12 "$UV_PROJECT_ENVIRONMENT"
fi
PYTHON="$UV_PROJECT_ENVIRONMENT/bin/python"
echo "[AIX] Installing locked Python and web dependencies"
"$UV" pip install --python "$PYTHON" -r requirements.txt 'uvicorn==0.32.1'

# Cache the production build in the persistent /data repository. A new Git
# revision or API origin rebuilds it; recreated containers reuse the same build.
REVISION="$(git rev-parse HEAD)-$AIX_PYTHON_API_ORIGIN-$(node --version)"
if [ ! -f .next/BUILD_ID ] || [ ! -f "$RUNTIME/build-revision" ] || [ "$(cat "$RUNTIME/build-revision")" != "$REVISION" ]; then
  npm ci --include=dev
  npm run build
  printf '%s\n' "$REVISION" > "$RUNTIME/build-revision"
fi

echo "[AIX] Starting private Python API and public dashboard on port ${PORT:-3000}"
API_PID=
WEB_PID=
cleanup() {
  trap - EXIT INT TERM
  [ -z "$WEB_PID" ] || kill "$WEB_PID" 2>/dev/null || true
  [ -z "$API_PID" ] || kill "$API_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM
"$PYTHON" -m uvicorn api.index:app --host 127.0.0.1 --port 8000 &
API_PID=$!
echo '[AIX] Waiting for the Python API before opening the dashboard'
"$PYTHON" - <<'PY'
import time
import urllib.error
import urllib.request

for attempt in range(120):
    try:
        with urllib.request.urlopen("http://127.0.0.1:8000/api/py/health", timeout=1) as response:
            if response.status == 200:
                break
    except (OSError, urllib.error.URLError):
        pass
    time.sleep(0.5)
else:
    raise SystemExit("Python API did not become healthy within 60 seconds")
PY
node node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port "${PORT:-3000}" &
WEB_PID=$!
while kill -0 "$API_PID" 2>/dev/null && kill -0 "$WEB_PID" 2>/dev/null; do
  sleep 2
done
echo '[AIX] A service exited; stopping its companion so the platform can restart the app.' >&2
exit 1
