import { describe, it, expect, vi } from 'vitest';
import { CastManager } from '../../server/cast.js';

describe('server/cast - CastManager', () => {
  it('initializes with default device name and port', () => {
    const onCmd = vi.fn();
    const cm = new CastManager(onCmd, { dialPort: 3999, deviceName: 'Custom Player' });

    expect(cm.deviceName).toBe('Custom Player');
    expect(cm.dialPort).toBe(3999);
    expect(cm.status).toBe('stopped');

    const info = cm.getInfo();
    expect(info.deviceName).toBe('Custom Player');
    expect(info.enabled).toBe(false);
    expect(info.pairingCode).toBeNull();
  });

  it('formats 12-digit pairing code with spaces', () => {
    const onCmd = vi.fn();
    const cm = new CastManager(onCmd);
    cm.pairingCode = '123456789012';

    const info = cm.getInfo();
    expect(info.pairingCode).toBe('123 456 789 012');
    expect(info.rawPairingCode).toBe('123456789012');
  });

  it('handles player state updates and player commands', async () => {
    const onCmd = vi.fn();
    const cm = new CastManager(onCmd);

    cm.updatePlayerState({ currentTime: 45, duration: 200, volume: 75 });
    expect(await cm.player.doGetPosition()).toBe(45);
    expect(await cm.player.doGetDuration()).toBe(200);
    expect(await cm.player.doGetVolume()).toEqual({ level: 75, muted: false });

    // Test player delegate callbacks
    await cm.player.doPlay({ id: 'xyz12345678', title: 'Cast Track', author: 'Mobile User', duration: 180 }, 10);
    expect(onCmd).toHaveBeenCalledWith('playTrack', expect.objectContaining({
      id: 'xyz12345678',
      title: 'Cast Track',
      position: 10,
    }));

    await cm.player.doPause();
    expect(onCmd).toHaveBeenCalledWith('pause');

    await cm.player.doResume();
    expect(onCmd).toHaveBeenCalledWith('play');

    await cm.player.doSeek(50);
    expect(onCmd).toHaveBeenCalledWith('seek', { time: 50 });

    await cm.player.doSetVolume({ level: 40, muted: false });
    expect(onCmd).toHaveBeenCalledWith('volume', { volume: 40 });
  });

  it('stops cleanly when not started', async () => {
    const cm = new CastManager(vi.fn());
    await expect(cm.stop()).resolves.toBeUndefined();
    expect(cm.status).toBe('stopped');
  });
});
