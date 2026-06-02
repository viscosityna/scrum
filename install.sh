#!/bin/sh
# scrum CLI installer for macOS and Linux.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/viscosityna/scrumtime-cli/main/install.sh | sh
#
# Honours these env vars (rarely needed):
#   SCRUM_INSTALL_DIR  override install location (default: ~/.scrum/bin)
#   SCRUM_VERSION      pin to a specific tag (default: latest)

set -e

REPO="viscosityna/scrumtime-cli"
INSTALL_DIR="${SCRUM_INSTALL_DIR:-$HOME/.scrum/bin}"

# ----- detect OS + arch -----
case "$(uname -s)" in
  Darwin)
    case "$(uname -m)" in
      arm64)  ASSET="scrum-macos-arm64" ;;
      x86_64) ASSET="scrum-macos-arm64" ;;  # Intel Macs run arm64 via Rosetta 2
      *)      echo "scrum: unsupported macOS arch: $(uname -m)" >&2; exit 1 ;;
    esac ;;
  Linux)
    case "$(uname -m)" in
      x86_64) ASSET="scrum-linux-x64" ;;
      *)      echo "scrum: unsupported Linux arch: $(uname -m)" >&2; exit 1 ;;
    esac ;;
  *) echo "scrum: unsupported OS: $(uname -s) (use install.ps1 on Windows)" >&2; exit 1 ;;
esac

# ----- resolve download URL -----
if [ -n "$SCRUM_VERSION" ]; then
  URL="https://github.com/$REPO/releases/download/$SCRUM_VERSION/$ASSET"
else
  URL="https://github.com/$REPO/releases/latest/download/$ASSET"
fi

# ----- download + install -----
mkdir -p "$INSTALL_DIR"
echo "scrum: downloading $ASSET..."
if ! curl -fsSL "$URL" -o "$INSTALL_DIR/scrum"; then
  echo "scrum: download failed from $URL" >&2
  echo "scrum: the release may not exist yet — check https://github.com/$REPO/releases" >&2
  exit 1
fi
chmod +x "$INSTALL_DIR/scrum"

# clear macOS Gatekeeper quarantine flag so first run doesn't prompt
if [ "$(uname -s)" = "Darwin" ]; then
  xattr -d com.apple.quarantine "$INSTALL_DIR/scrum" 2>/dev/null || true
fi

# ----- add to PATH in shell rc -----
SHELL_RC=""
case "$SHELL" in
  */zsh)  SHELL_RC="$HOME/.zshrc" ;;
  */bash) [ -f "$HOME/.bashrc" ] && SHELL_RC="$HOME/.bashrc" || SHELL_RC="$HOME/.bash_profile" ;;
esac

ADDED_PATH=0
case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;  # already there
  *)
    if [ -n "$SHELL_RC" ]; then
      if [ ! -f "$SHELL_RC" ] || ! grep -q '\.scrum/bin' "$SHELL_RC"; then
        {
          echo ""
          echo "# scrum CLI"
          echo 'export PATH="$HOME/.scrum/bin:$PATH"'
        } >> "$SHELL_RC"
        ADDED_PATH=1
      fi
    fi ;;
esac

# ----- friendly outro -----
echo ""
echo "scrum installed at $INSTALL_DIR/scrum"
"$INSTALL_DIR/scrum" --version 2>/dev/null || true
echo ""
if [ "$ADDED_PATH" = "1" ]; then
  echo "Added scrum to your PATH in $SHELL_RC."
  echo "Open a new terminal (or run:  source $SHELL_RC) and then:  scrum login"
elif ! command -v scrum >/dev/null 2>&1; then
  echo "Add this to your shell's startup file:"
  echo '  export PATH="$HOME/.scrum/bin:$PATH"'
  echo "Then run:  scrum login"
else
  echo "Next step:  scrum login"
fi
