import { spawn } from 'child_process';
import { mkdir, stat, unlink } from 'fs/promises';
import path from 'path';
import os from 'os';

const SERVICE = 'scrumtime-cli';
const ACCOUNT = 'tokens';

/**
 * Cross-platform secret storage backed by the OS-native data-protection API.
 *
 *   Windows  DPAPI (per-user scope, via PowerShell ProtectedData)
 *   macOS    Keychain (via the `security` tool, -A so all caller binaries can read)
 *   Linux    libsecret (via `secret-tool` — requires libsecret-tools installed)
 *
 * No native Node module is involved, which keeps the SEA binary portable.
 * Trade-off is ~50-200ms per call (subprocess spawn), which is fine for an
 * interactive CLI that touches tokens at most a couple of times per command.
 *
 * The single secret blob is the full token-set JSON. Caller passes a string,
 * gets a string back. Callers above this module never see ciphertext.
 */

export async function setSecret(value: string): Promise<void> {
  if (process.platform === 'win32') return setWindowsDpapi(value);
  if (process.platform === 'darwin') return setMacKeychain(value);
  if (process.platform === 'linux') return setLinuxSecretService(value);
  throw new Error(`scrum: unsupported platform for secure storage: ${process.platform}`);
}

export async function getSecret(): Promise<string | null> {
  if (process.platform === 'win32') return getWindowsDpapi();
  if (process.platform === 'darwin') return getMacKeychain();
  if (process.platform === 'linux') return getLinuxSecretService();
  throw new Error(`scrum: unsupported platform for secure storage: ${process.platform}`);
}

export async function deleteSecret(): Promise<void> {
  if (process.platform === 'win32') return deleteWindowsDpapi();
  if (process.platform === 'darwin') return deleteMacKeychain();
  if (process.platform === 'linux') return deleteLinuxSecretService();
}

// ===== Windows: DPAPI per-user via PowerShell ProtectedData =====
//
// We write the ciphertext to a file under %APPDATA% rather than into a
// Windows Credential Manager slot, because Microsoft access tokens routinely
// blow past the practical ~2.5 KB CM limit (the original reason this CLI was
// shipping plaintext in the first place). DPAPI itself has no such cap.

function dpapiBlobPath(): string {
  const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, 'scrumtime-nodejs', 'tokens.dpapi');
}

async function setWindowsDpapi(value: string): Promise<void> {
  const blobPath = dpapiBlobPath();
  await mkdir(path.dirname(blobPath), { recursive: true });
  const escapedPath = blobPath.replace(/\\/g, '\\\\').replace(/'/g, "''");
  // System.Security.Cryptography.ProtectedData lives in System.Security.dll,
  // which neither Windows PowerShell 5.x nor PowerShell 7 auto-loads. Add-Type
  // pulls it in. Use the typed DataProtectionScope enum rather than the bare
  // string so coercion works under both runtimes.
  const script = [
    `$ErrorActionPreference = 'Stop'`,
    `Add-Type -AssemblyName System.Security`,
    `$plain = [Console]::In.ReadToEnd()`,
    `$bytes = [System.Text.Encoding]::UTF8.GetBytes($plain)`,
    `$scope = [System.Security.Cryptography.DataProtectionScope]::CurrentUser`,
    `$protected = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, $scope)`,
    `[System.IO.File]::WriteAllBytes('${escapedPath}', $protected)`,
  ].join('; ');
  await runPowershellWithInput(script, value);
}

async function getWindowsDpapi(): Promise<string | null> {
  const blobPath = dpapiBlobPath();
  try { await stat(blobPath); } catch { return null; }
  const escapedPath = blobPath.replace(/\\/g, '\\\\').replace(/'/g, "''");
  const script = [
    `$ErrorActionPreference = 'Stop'`,
    `Add-Type -AssemblyName System.Security`,
    `$bytes = [System.IO.File]::ReadAllBytes('${escapedPath}')`,
    `$scope = [System.Security.Cryptography.DataProtectionScope]::CurrentUser`,
    `$unprotected = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, $scope)`,
    `[Console]::Out.Write([System.Text.Encoding]::UTF8.GetString($unprotected))`,
  ].join('; ');
  try {
    return await runPowershellReadOutput(script);
  } catch {
    // DPAPI can fail if the user's master key has rotated (rare on a stable
    // workstation). Treat as "no usable secret" rather than crashing the CLI.
    return null;
  }
}

async function deleteWindowsDpapi(): Promise<void> {
  try { await unlink(dpapiBlobPath()); } catch { /* idempotent */ }
}

function runPowershellWithInput(script: string, input: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ps = spawn('powershell', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script,
    ]);
    let stderr = '';
    ps.stderr.on('data', (d) => { stderr += d.toString(); });
    ps.on('error', reject);
    ps.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`powershell exited ${code}: ${stderr.trim()}`));
    });
    ps.stdin.write(input);
    ps.stdin.end();
  });
}

function runPowershellReadOutput(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const ps = spawn('powershell', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script,
    ]);
    let stdout = '';
    let stderr = '';
    ps.stdout.on('data', (d) => { stdout += d.toString(); });
    ps.stderr.on('data', (d) => { stderr += d.toString(); });
    ps.on('error', reject);
    ps.on('exit', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`powershell exited ${code}: ${stderr.trim()}`));
    });
  });
}

// ===== macOS: Keychain via `security` =====

async function setMacKeychain(value: string): Promise<void> {
  // -U: update existing item if present
  // -A: any caller binary can read silently (avoids Keychain prompts after
  //     `scrum update` swaps the binary out — the prompt-on-binary-change
  //     behaviour was the main UX regression in the keytar attempt).
  await runCommand('security', [
    'add-generic-password', '-U', '-A',
    '-s', SERVICE, '-a', ACCOUNT, '-w', value,
  ]);
}

async function getMacKeychain(): Promise<string | null> {
  try {
    const { stdout } = await runCommandRead('security', [
      'find-generic-password', '-s', SERVICE, '-a', ACCOUNT, '-w',
    ]);
    const trimmed = stdout.trimEnd();
    return trimmed.length > 0 ? trimmed : null;
  } catch (e: any) {
    if (/could not be found|SecKeychainSearchCopyNext/.test(e?.message ?? '')) return null;
    throw e;
  }
}

async function deleteMacKeychain(): Promise<void> {
  try {
    await runCommand('security', ['delete-generic-password', '-s', SERVICE, '-a', ACCOUNT]);
  } catch { /* idempotent */ }
}

// ===== Linux: libsecret via `secret-tool` =====

async function setLinuxSecretService(value: string): Promise<void> {
  await ensureSecretToolAvailable();
  // secret-tool reads the secret value from stdin; the trailing newline is
  // required (it's how `secret-tool store` knows input is done).
  await runCommandWithInput(
    'secret-tool',
    ['store', '--label=scrumtime CLI tokens', 'service', SERVICE, 'account', ACCOUNT],
    value + '\n',
  );
}

async function getLinuxSecretService(): Promise<string | null> {
  await ensureSecretToolAvailable();
  try {
    const { stdout } = await runCommandRead('secret-tool', [
      'lookup', 'service', SERVICE, 'account', ACCOUNT,
    ]);
    return stdout.length > 0 ? stdout : null;
  } catch {
    return null;
  }
}

async function deleteLinuxSecretService(): Promise<void> {
  await ensureSecretToolAvailable();
  try {
    await runCommand('secret-tool', ['clear', 'service', SERVICE, 'account', ACCOUNT]);
  } catch { /* idempotent */ }
}

async function ensureSecretToolAvailable(): Promise<void> {
  try {
    await runCommandRead('which', ['secret-tool']);
  } catch {
    throw new Error(
      'scrum: this build requires libsecret-tools to encrypt your tokens.\n' +
      '  Debian/Ubuntu:  sudo apt install libsecret-tools\n' +
      '  Fedora:         sudo dnf install libsecret\n' +
      '  Arch:           sudo pacman -S libsecret\n' +
      'Then re-run the same command.',
    );
  }
}

// ===== generic process runners =====

function runCommand(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    p.stderr.on('data', (d) => { stderr += d.toString(); });
    p.on('error', reject);
    p.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}: ${stderr.trim()}`));
    });
  });
}

function runCommandRead(cmd: string, args: string[]): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => { stdout += d.toString(); });
    p.stderr.on('data', (d) => { stderr += d.toString(); });
    p.on('error', reject);
    p.on('exit', (code) => {
      if (code === 0) resolve({ stdout });
      else reject(new Error(`${cmd} exited ${code}: ${stderr.trim()}`));
    });
  });
}

function runCommandWithInput(cmd: string, args: string[], input: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    p.stderr.on('data', (d) => { stderr += d.toString(); });
    p.on('error', reject);
    p.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}: ${stderr.trim()}`));
    });
    p.stdin.write(input);
    p.stdin.end();
  });
}
