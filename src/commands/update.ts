import kleur from 'kleur';
import pkg from '../../package.json' with { type: 'json' };

const REPO = 'viscosityna/scrum';

interface Release {
  tag_name: string;
  html_url: string;
  published_at: string;
}

export async function updateCommand(opts: { json?: boolean }) {
  let release: Release;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'scrum-cli' },
    });
    if (!res.ok) {
      throw new Error(`GitHub API returned ${res.status}`);
    }
    release = (await res.json()) as Release;
  } catch (err) {
    console.error(kleur.red(`could not check for updates: ${(err as Error).message}`));
    process.exit(1);
  }

  const latest = release.tag_name.replace(/^v/, '');
  const current = pkg.version;
  const upToDate = current === latest;

  if (opts.json) {
    process.stdout.write(JSON.stringify({ current, latest, upToDate, release_url: release.html_url }, null, 2) + '\n');
    return;
  }

  if (upToDate) {
    console.log(kleur.green(`scrum ${current} is up to date.`));
    return;
  }

  console.log(`scrum ${kleur.yellow(current)} → ${kleur.green(latest)} available`);
  console.log(`  release notes: ${release.html_url}`);
  console.log('');
  console.log(kleur.bold('To update, paste this in your terminal:'));
  if (process.platform === 'win32') {
    console.log(kleur.cyan('  iwr -useb https://raw.githubusercontent.com/viscosityna/scrum/main/install.ps1 | iex'));
  } else {
    console.log(kleur.cyan('  curl -fsSL https://raw.githubusercontent.com/viscosityna/scrum/main/install.sh | sh'));
  }
}
