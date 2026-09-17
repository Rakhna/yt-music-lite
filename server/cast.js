import YouTubeCastReceiver, { Player } from 'yt-cast-receiver';

class MiniPlayerCastReceiver extends Player {
  constructor(onCommand) {
    super();
    this.onCommand = onCommand;
    this.volume = { level: 80, muted: false };
    this.position = 0;
    this.duration = 0;
  }

  async doPlay(video, position) {
    this.position = position || 0;
    if (this.onCommand) {
      this.onCommand('playTrack', {
        id: video.id,
        title: video.title || 'Transmitiendo desde YouTube',
        artist: video.author || 'YouTube Cast',
        duration: video.duration || 0,
        durationText: '0:00',
        thumbnail: `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
        position: position || 0,
      });
    }
    return true;
  }

  async doPause() {
    if (this.onCommand) {
      this.onCommand('pause');
    }
    return true;
  }

  async doResume() {
    if (this.onCommand) {
      this.onCommand('play');
    }
    return true;
  }

  async doStop() {
    if (this.onCommand) {
      this.onCommand('pause');
    }
    return true;
  }

  async doSeek(position) {
    this.position = position;
    if (this.onCommand) {
      this.onCommand('seek', { time: position });
    }
    return true;
  }

  async doSetVolume(vol) {
    this.volume = vol;
    if (this.onCommand) {
      this.onCommand('volume', { volume: vol.level });
    }
    return true;
  }

  async doGetVolume() {
    return this.volume;
  }

  async doGetPosition() {
    return this.position;
  }

  async doGetDuration() {
    return this.duration;
  }

  updateState(state) {
    if (typeof state.currentTime === 'number') this.position = state.currentTime;
    if (typeof state.duration === 'number') this.duration = state.duration;
    if (typeof state.volume === 'number') this.volume.level = state.volume;
  }
}

export class CastManager {
  constructor(onCommand, options = {}) {
    this.onCommand = onCommand;
    this.dialPort = options.dialPort || 3001;
    this.deviceName = options.deviceName || 'YT Mini Player';
    this.player = new MiniPlayerCastReceiver(onCommand);
    this.receiver = null;
    this.pairingCode = null;
    this.pairingService = null;
    this.status = 'stopped';
  }

  async start() {
    if (this.receiver) return;
    try {
      this.receiver = new YouTubeCastReceiver(this.player, {
        dial: {
          port: this.dialPort,
        },
        device: {
          name: this.deviceName,
          screenName: this.deviceName,
        },
        logLevel: 'warn',
      });

      this.receiver.on('error', (err) => {
        console.warn('[WARNING] YouTube Cast receiver warning:', err.message);
      });

      await this.receiver.start();
      this.status = this.receiver.status;
      console.log(`[INFO] YouTube Cast Receiver running (DIAL port ${this.dialPort})`);

      this.pairingService = this.receiver.getPairingCodeRequestService();
      this.pairingService.on('response', (code) => {
        this.pairingCode = code;
        console.log(`[INFO] YouTube TV Pairing Code refreshed: ${code}`);
      });
      this.pairingService.on('error', (err) => {
        console.warn('[WARNING] Pairing code service warning:', err.message);
      });

      this.pairingService.start();
    } catch (err) {
      console.warn('[WARNING] Could not start YouTube Cast Receiver:', err.message);
      this.status = 'failed';
    }
  }

  async stop() {
    if (this.pairingService) {
      try {
        this.pairingService.stop();
      } catch (_) {}
      this.pairingService = null;
    }
    if (this.receiver) {
      try {
        await this.receiver.stop();
      } catch (_) {}
      this.receiver = null;
    }
    this.status = 'stopped';
  }

  getInfo() {
    const formattedCode = this.pairingCode
      ? this.pairingCode.replace(/(\d{3})(\d{3})(\d{3})(\d{3})/, '$1 $2 $3 $4')
      : null;

    return {
      enabled: this.receiver !== null && this.status === 'running',
      pairingCode: formattedCode,
      rawPairingCode: this.pairingCode,
      deviceName: this.deviceName,
      dialPort: this.dialPort,
    };
  }

  updatePlayerState(state) {
    if (this.player) {
      this.player.updateState(state);
    }
  }
}
