import { describe, it, expect, vi } from 'vitest';
import { checkForUpdates, applyUpdate } from '../../server/updater.js';

describe('server/updater', () => {
  it('returns not git repository when rev-parse fails', async () => {
    const mockExec = vi.fn().mockResolvedValue({ stdout: 'false\n' });
    const res = await checkForUpdates({ customExec: mockExec });
    expect(res.updateAvailable).toBe(false);
    expect(res.error).toBe('Not a git repository');
  });

  it('detects when local is up to date with remote', async () => {
    const mockExec = vi.fn().mockImplementation((cmd: string) => {
      if (cmd.includes('rev-parse --is-inside-work-tree')) return Promise.resolve({ stdout: 'true\n' });
      if (cmd.includes('fetch origin main')) return Promise.resolve({ stdout: '' });
      if (cmd.includes('rev-parse --verify')) return Promise.resolve({ stdout: 'origin/main' });
      if (cmd.includes('rev-parse --short HEAD')) return Promise.resolve({ stdout: 'abc1234\n' });
      if (cmd.includes('rev-parse --short origin/main')) return Promise.resolve({ stdout: 'abc1234\n' });
      return Promise.reject(new Error(`Unhandled cmd: ${cmd}`));
    });

    const res = await checkForUpdates({ customExec: mockExec });
    expect(res.updateAvailable).toBe(false);
    expect(res.commitsBehind).toBe(0);
    expect(res.currentCommit).toBe('abc1234');
    expect(res.remoteCommit).toBe('abc1234');
  });

  it('detects available updates when behind remote', async () => {
    const mockExec = vi.fn().mockImplementation((cmd: string) => {
      if (cmd.includes('rev-parse --is-inside-work-tree')) return Promise.resolve({ stdout: 'true\n' });
      if (cmd.includes('fetch origin main')) return Promise.resolve({ stdout: '' });
      if (cmd.includes('rev-parse --verify')) return Promise.resolve({ stdout: 'origin/main' });
      if (cmd.includes('rev-parse --short HEAD')) return Promise.resolve({ stdout: 'abc1234\n' });
      if (cmd.includes('rev-parse --short origin/main')) return Promise.resolve({ stdout: 'def5678\n' });
      if (cmd.includes('rev-list HEAD..origin/main --count')) return Promise.resolve({ stdout: '3\n' });
      if (cmd.includes('log HEAD..origin/main')) return Promise.resolve({ stdout: 'def5678 feat: new UI controls\n' });
      return Promise.reject(new Error(`Unhandled cmd: ${cmd}`));
    });

    const res = await checkForUpdates({ customExec: mockExec });
    expect(res.updateAvailable).toBe(true);
    expect(res.commitsBehind).toBe(3);
    expect(res.currentCommit).toBe('abc1234');
    expect(res.remoteCommit).toBe('def5678');
    expect(res.summary).toBe('def5678 feat: new UI controls');
  });

  it('handles git fetch or network failure gracefully', async () => {
    const mockExec = vi.fn().mockImplementation((cmd: string) => {
      if (cmd.includes('rev-parse --is-inside-work-tree')) return Promise.resolve({ stdout: 'true\n' });
      if (cmd.includes('fetch origin main')) return Promise.reject(new Error('Network timeout'));
      if (cmd.includes('rev-parse --verify')) return Promise.reject(new Error('no origin/main'));
      if (cmd.includes('rev-parse --short HEAD')) return Promise.resolve({ stdout: 'abc1234\n' });
      if (cmd.includes('rev-parse --short @{u}')) return Promise.resolve({ stdout: 'abc1234\n' });
      return Promise.reject(new Error(`Unhandled cmd: ${cmd}`));
    });

    const res = await checkForUpdates({ customExec: mockExec });
    expect(res.updateAvailable).toBe(false);
    expect(res.commitsBehind).toBe(0);
  });

  it('handles fatal exec error without crashing', async () => {
    const mockExec = vi.fn().mockRejectedValue(new Error('Fatal system error'));
    const res = await checkForUpdates({ customExec: mockExec });
    expect(res.updateAvailable).toBe(false);
    expect(res.error).toBe('Fatal system error');
  });

  it('applies updates successfully running git pull, pnpm install, and pnpm build', async () => {
    const mockExec = vi.fn().mockImplementation((cmd: string) => {
      if (cmd.includes('git pull')) return Promise.resolve({ stdout: 'Updating abc..def\nFast-forward' });
      if (cmd.includes('pnpm install')) return Promise.resolve({ stdout: 'Packages: +2' });
      if (cmd.includes('pnpm build')) return Promise.resolve({ stdout: 'built in 100ms' });
      return Promise.reject(new Error(`Unhandled cmd: ${cmd}`));
    });

    const res = await applyUpdate({ customExec: mockExec });
    expect(res.success).toBe(true);
    expect(res.message).toContain('Actualización aplicada con éxito');
    expect(mockExec).toHaveBeenCalledWith('git pull origin main', expect.any(Object));
    expect(mockExec).toHaveBeenCalledWith('pnpm install --prefer-offline', expect.any(Object));
    expect(mockExec).toHaveBeenCalledWith('pnpm build', expect.any(Object));
  });

  it('handles failure when applying updates', async () => {
    const mockExec = vi.fn().mockRejectedValue(new Error('Merge conflict'));
    const res = await applyUpdate({ customExec: mockExec });
    expect(res.success).toBe(false);
    expect(res.error).toBe('Merge conflict');
  });
});
