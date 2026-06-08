#!/bin/sh
# scrum CLI installer for macOS and Linux.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/viscosityna/scrum/main/install.sh | sh
#
# Honours these env vars (rarely needed):
#   SCRUM_INSTALL_DIR  override install location (default: ~/.scrum/bin)
#   SCRUM_VERSION      pin to a specific tag (default: latest)

set -e

REPO="viscosityna/scrum"
INSTALL_DIR="${SCRUM_INSTALL_DIR:-$HOME/.scrum/bin}"

# ----- detect OS + arch -----
case "$(uname -s)" in
  Darwin)
    # Rosetta 2 lets Apple Silicon Macs run x86_64 binaries — not the other
    # way around. So `uname -m` is x86_64 in two distinct cases on macOS:
    #   1) a real Intel Mac (we want scrum-macos-x64)
    #   2) Apple Silicon Mac running this script inside a Rosetta shell
    #      (we still want the arm64 binary — it runs natively)
    # sysctl.proc_translated == 1 disambiguates case (2).
    MAC_ARCH="$(uname -m)"
    if [ "$MAC_ARCH" = "x86_64" ] && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null)" = "1" ]; then
      MAC_ARCH="arm64"
    fi
    case "$MAC_ARCH" in
      arm64)  ASSET="scrum-macos-arm64" ;;
      x86_64) ASSET="scrum-macos-x64"   ;;
      *)      echo "scrum: unsupported macOS arch: $MAC_ARCH" >&2; exit 1 ;;
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

# ----- verify integrity (SHA256 against the release's checksums.txt) -----
# This catches a tampered binary on GitHub Releases or in transit. The
# release workflow ships a checksums.txt alongside the binaries with one
# "<sha256>  <filename>" line per asset.
CHECKSUM_URL="$(echo "$URL" | sed "s|/$ASSET\$|/checksums.txt|")"
# tr -d '\r' tolerates CRLF lines that the Windows build runner may
# contribute to the concatenated checksums.txt — otherwise the awk
# field comparison sees "scrum-win-x64.exe\r" and never matches.
EXPECTED="$(curl -fsSL "$CHECKSUM_URL" 2>/dev/null | tr -d '\r' | awk -v f="$ASSET" '$2 == f { print $1 }')"
if [ -z "$EXPECTED" ]; then
  echo "scrum: could not retrieve checksum for $ASSET from $CHECKSUM_URL" >&2
  echo "scrum: refusing to install an unverified binary" >&2
  rm -f "$INSTALL_DIR/scrum"
  exit 1
fi
if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL="$(sha256sum "$INSTALL_DIR/scrum" | awk '{print $1}')"
else
  ACTUAL="$(shasum -a 256 "$INSTALL_DIR/scrum" | awk '{print $1}')"
fi
if [ "$EXPECTED" != "$ACTUAL" ]; then
  echo "scrum: SHA256 mismatch — the downloaded binary does not match the release's published checksum" >&2
  echo "  expected: $EXPECTED" >&2
  echo "  got:      $ACTUAL" >&2
  rm -f "$INSTALL_DIR/scrum"
  exit 1
fi
echo "scrum: integrity verified (SHA256 matches checksums.txt)."

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
