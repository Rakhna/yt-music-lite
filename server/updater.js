import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/**
 * Checks for updates in the git repository.
 * @param {Object} options
 * @param {string} [options.cwd] Repository root path
 * @param {number} [options.timeout] Execution timeout in ms (default 6000)
 * @param {Function} [options.customExec] Optional custom exec function for testing
 * @returns {Promise<{updateAvailable: boolean, commitsBehind: number, currentCommit?: string, remoteCommit?: string, summary?: string, error?: string}>}
 */
export async function checkForUpdates(options = {}) {
  const cwd = options.cwd || process.cwd();
  const timeout = options.timeout || 6000;
  const runner = options.customExec || execAsync;

  try {
    // 1. Verify this is a git work tree
    const { stdout: isGit } = await runner('git rev-parse --is-inside-work-tree', { cwd, timeout });
    if (!isGit.trim().startsWith('true')) {
      return { updateAvailable: false, commitsBehind: 0, error: 'Not a git repository' };
    }

    // 2. Fetch latest refs from origin quietly
    try {
      await runner('git fetch origin main --quiet', { cwd, timeout });
    } catch (fetchErr) {
      console.warn('[WARNING] git fetch origin main failed or offline:', fetchErr.message);
    }

    // 3. Compare current HEAD with origin/main (or upstream)
    let remoteBranch = 'origin/main';
    try {
      await runner(`git rev-parse --verify ${remoteBranch}`, { cwd, timeout });
    } catch {
      remoteBranch = '@{u}';
    }

    const { stdout: headCommit } = await runner('git rev-parse --short HEAD', { cwd, timeout });
    const { stdout: remoteCommit } = await runner(`git rev-parse --short ${remoteBranch}`, { cwd, timeout });

    const headTrim = headCommit.trim();
    const remoteTrim = remoteCommit.trim();

    if (headTrim === remoteTrim) {
      return {
        updateAvailable: false,
        commitsBehind: 0,
        currentCommit: headTrim,
        remoteCommit: remoteTrim,
      };
    }

    // 4. Calculate how many commits behind
    const { stdout: countOut } = await runner(`git rev-list HEAD..${remoteBranch} --count`, { cwd, timeout });
    const commitsBehind = parseInt(countOut.trim(), 10) || 0;

    if (commitsBehind <= 0) {
      return {
        updateAvailable: false,
        commitsBehind: 0,
        currentCommit: headTrim,
        remoteCommit: remoteTrim,
      };
    }

    // 5. Get recent commit log for change summary
    let summary = '';
    try {
      const { stdout: logOut } = await runner(`git log HEAD..${remoteBranch} --oneline -n 3`, { cwd, timeout });
      summary = logOut.trim();
    } catch {
      summary = `${commitsBehind} nuevo(s) cambio(s)`;
    }

    return {
      updateAvailable: true,
      commitsBehind,
      currentCommit: headTrim,
      remoteCommit: remoteTrim,
      summary,
    };
  } catch (err) {
    console.error('[ERROR] Update check failed:', err.message);
    return {
      updateAvailable: false,
      commitsBehind: 0,
      error: err.message,
    };
  }
}

/**
 * Applies update by pulling changes, installing dependencies and rebuilding.
 * @param {Object} options
 * @param {string} [options.cwd] Repository root path
 * @param {number} [options.timeout] Execution timeout in ms (default 120000)
 * @param {Function} [options.customExec] Optional custom exec function for testing
 * @returns {Promise<{success: boolean, message: string, stdout?: string, error?: string}>}
 */
export async function applyUpdate(options = {}) {
  const cwd = options.cwd || process.cwd();
  const timeout = options.timeout || 120000;
  const runner = options.customExec || execAsync;

  try {
    // 1. Pull latest changes
    const { stdout: pullOut } = await runner('git pull origin main', { cwd, timeout });

    // 2. Install any new dependencies using pnpm
    const { stdout: installOut } = await runner('pnpm install --prefer-offline', { cwd, timeout });

    // 3. Build frontend bundle
    const { stdout: buildOut } = await runner('pnpm build', { cwd, timeout });

    return {
      success: true,
      message: 'Actualización aplicada con éxito. Reinicia la aplicación.',
      stdout: `${pullOut}\n${installOut}\n${buildOut}`,
    };
  } catch (err) {
    console.error('[ERROR] Update apply failed:', err.message);
    return {
      success: false,
      message: 'Error al aplicar la actualización.',
      error: err.message,
    };
  }
}
