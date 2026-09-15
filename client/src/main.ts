import { Track, QueueManager, extractYouTubeId, extractPlaylistId, formatSeconds } from './utils';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

class MiniPlayerApp {
  private player: any = null;
  private isPlayerReady = false;
  private currentTrack: Track | null = null;
  private queueManager = new QueueManager(3);
  private isPlaying = false;
  private isMuted = false;
  private volume = 80;
  private isDraggingSeek = false;
  private progressInterval: number | null = null;
  private searchTimeout: number | null = null;
  private searchAbortController: AbortController | null = null;

  // Visibility states
  private showSearch = true;
  private showVideo = true;
  private isMicroMode = false;
  private isOnTop = true;

  // DOM Elements
  private playerCard!: HTMLElement;
  private toggleSearchBtn!: HTMLButtonElement;
  private toggleVideoBtn!: HTMLButtonElement;
  private toggleMicroBtn!: HTMLButtonElement;
  private pinBtn!: HTMLButtonElement;
  private closeWidgetBtn!: HTMLButtonElement;
  private searchBarContainer!: HTMLElement;
  private videoBox!: HTMLElement;
  private videoPlaceholder!: HTMLElement;
  private urlInput!: HTMLInputElement;
  private clearInputBtn!: HTMLButtonElement;
  private miniThumb!: HTMLImageElement;
  private trackTitle!: HTMLElement;
  private trackArtist!: HTMLElement;
  private currentTimeEl!: HTMLElement;
  private totalDurationEl!: HTMLElement;
  private progressBar!: HTMLElement;
  private bufferedBar!: HTMLElement;
  private seekSlider!: HTMLInputElement;
  private prevBtn!: HTMLButtonElement;
  private seekBackBtn!: HTMLButtonElement;
  private playBtn!: HTMLButtonElement;
  private playIcon!: HTMLElement;
  private pauseIcon!: HTMLElement;
  private seekFwdBtn!: HTMLButtonElement;
  private nextBtn!: HTMLButtonElement;
  private muteBtn!: HTMLButtonElement;
  private volHighIcon!: HTMLElement;
  private volMutedIcon!: HTMLElement;
  private volumeSlider!: HTMLInputElement;
  private toggleResultsBtn!: HTMLButtonElement;
  private resultsDrawer!: HTMLElement;
  private statusMessage!: HTMLElement;
  private resultsList!: HTMLElement;
  private accountBtn!: HTMLButtonElement;
  private authModal!: HTMLElement;
  private closeAuthBtn!: HTMLButtonElement;
  private authBoxTitle!: HTMLElement;
  private authLink!: HTMLAnchorElement;
  private authCodeText!: HTMLElement;
  private copyCodeBtn!: HTMLButtonElement;
  private authPendingStatus!: HTMLElement;
  private authPollInterval: number | null = null;

  constructor() {
    this.bindDom();
    this.loadPreferences();
    this.initYouTube();
    this.bindEvents();
    this.setupMediaSession();
    this.setupDrag();
  }

  private bindDom() {
    this.playerCard = document.getElementById('playerCard')!;
    this.toggleSearchBtn = document.getElementById('toggleSearchBtn') as HTMLButtonElement;
    this.toggleVideoBtn = document.getElementById('toggleVideoBtn') as HTMLButtonElement;
    this.toggleMicroBtn = document.getElementById('toggleMicroBtn') as HTMLButtonElement;
    this.accountBtn = document.getElementById('accountBtn') as HTMLButtonElement;
    this.authModal = document.getElementById('authModal')!;
    this.closeAuthBtn = document.getElementById('closeAuthBtn') as HTMLButtonElement;
    this.authBoxTitle = document.getElementById('authBoxTitle')!;
    this.authLink = document.getElementById('authLink') as HTMLAnchorElement;
    this.authCodeText = document.getElementById('authCodeText')!;
    this.copyCodeBtn = document.getElementById('copyCodeBtn') as HTMLButtonElement;
    this.authPendingStatus = document.getElementById('authPendingStatus')!;
    this.pinBtn = document.getElementById('pinBtn') as HTMLButtonElement;
    this.closeWidgetBtn = document.getElementById('closeWidgetBtn') as HTMLButtonElement;
    this.searchBarContainer = document.getElementById('searchBarContainer')!;
    this.videoBox = document.getElementById('videoBox')!;
    this.videoPlaceholder = document.getElementById('videoPlaceholder')!;
    this.urlInput = document.getElementById('urlInput') as HTMLInputElement;
    this.clearInputBtn = document.getElementById('clearInputBtn') as HTMLButtonElement;
    this.miniThumb = document.getElementById('miniThumb') as HTMLImageElement;
    this.trackTitle = document.getElementById('trackTitle')!;
    this.trackArtist = document.getElementById('trackArtist')!;
    this.currentTimeEl = document.getElementById('currentTime')!;
    this.totalDurationEl = document.getElementById('totalDuration')!;
    this.progressBar = document.getElementById('progressBar')!;
    this.bufferedBar = document.getElementById('bufferedBar')!;
    this.seekSlider = document.getElementById('seekSlider') as HTMLInputElement;
    this.prevBtn = document.getElementById('prevBtn') as HTMLButtonElement;
    this.seekBackBtn = document.getElementById('seekBackBtn') as HTMLButtonElement;
    this.playBtn = document.getElementById('playBtn') as HTMLButtonElement;
    this.playIcon = document.getElementById('playIcon')!;
    this.pauseIcon = document.getElementById('pauseIcon')!;
    this.seekFwdBtn = document.getElementById('seekFwdBtn') as HTMLButtonElement;
    this.nextBtn = document.getElementById('nextBtn') as HTMLButtonElement;
    this.muteBtn = document.getElementById('muteBtn') as HTMLButtonElement;
    this.volHighIcon = document.getElementById('volHighIcon')!;
    this.volMutedIcon = document.getElementById('volMutedIcon')!;
    this.volumeSlider = document.getElementById('volumeSlider') as HTMLInputElement;
    this.toggleResultsBtn = document.getElementById('toggleResultsBtn') as HTMLButtonElement;
    this.resultsDrawer = document.getElementById('resultsDrawer')!;
    this.statusMessage = document.getElementById('statusMessage')!;
    this.resultsList = document.getElementById('resultsList')!;
  }

  private loadPreferences() {
    try {
      const savedSearch = localStorage.getItem('mini_show_search');
      if (savedSearch !== null) {
        this.showSearch = savedSearch === 'true';
      }

      const savedVideo = localStorage.getItem('mini_show_video');
      if (savedVideo !== null) {
        this.showVideo = savedVideo === 'true';
      }

      const savedMicro = localStorage.getItem('mini_micro_mode');
      if (savedMicro !== null) {
        this.isMicroMode = savedMicro === 'true';
      }

      const savedVol = localStorage.getItem('mini_vol');
      if (savedVol !== null) {
        this.volume = parseInt(savedVol, 10);
        this.volumeSlider.value = this.volume.toString();
      }

      this.applyVisibilityStates();
    } catch (_) {}
  }

  private savePreferences() {
    try {
      localStorage.setItem('mini_show_search', this.showSearch.toString());
      localStorage.setItem('mini_show_video', this.showVideo.toString());
      localStorage.setItem('mini_micro_mode', this.isMicroMode.toString());
      localStorage.setItem('mini_vol', this.volume.toString());
    } catch (_) {}
  }

  private applyVisibilityStates() {
    this.searchBarContainer.classList.toggle('hidden', !this.showSearch);
    this.toggleSearchBtn.classList.toggle('active', this.showSearch);

    this.videoBox.classList.toggle('hidden', !this.showVideo);
    this.toggleVideoBtn.classList.toggle('active', this.showVideo);

    this.playerCard.classList.toggle('micro-mode', this.isMicroMode);
    this.playerCard.classList.toggle('pywebview-drag-region', this.isMicroMode);
    this.toggleMicroBtn.classList.toggle('active', this.isMicroMode);

    this.syncWidgetSize();
  }

  public syncWidgetSize() {
    let targetWidth = 320;
    let targetHeight = 440;

    if (this.isMicroMode) {
      targetWidth = 280;
      targetHeight = 66;
    } else if (!this.showVideo && !this.showSearch) {
      targetWidth = 320;
      targetHeight = 185;
    } else if (!this.showVideo) {
      targetWidth = 320;
      targetHeight = 225;
    } else if (!this.showSearch) {
      targetWidth = 320;
      targetHeight = 400;
    }

    if (!this.isMicroMode && this.resultsDrawer && this.resultsDrawer.style.display === 'flex') {
      targetHeight = Math.min(500, targetHeight + 140);
    }

    if ((window as any).pywebview?.api?.resize_widget) {
      (window as any).pywebview.api.resize_widget(targetWidth, targetHeight);
    }
  }

  private initYouTube() {
    const setup = () => {
      this.player = new window.YT.Player('yt-player-container', {
        height: '100%',
        width: '100%',
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
        },
        events: {
          onReady: () => {
            this.isPlayerReady = true;
            this.player.setVolume(this.volume);
          },
          onStateChange: (e: any) => this.onStateChange(e),
          onError: (e: any) => {
            console.error('[ERROR] Player error:', e.data);
            const { canContinue, nextTrack } = this.queueManager.handlePlaybackError();
            if (canContinue && nextTrack) {
              this.playTrack(nextTrack);
            } else {
              this.statusMessage.textContent = 'Error al reproducir el video.';
              this.isPlaying = false;
              this.updatePlayPauseUI();
            }
          },
        },
      });
    };

    if (window.YT && window.YT.Player) {
      setup();
    } else {
      window.onYouTubeIframeAPIReady = setup;
    }
  }

  private onStateChange(event: any) {
    const state = event.data;
    if (state === 1) { // Playing
      this.isPlaying = true;
      this.queueManager.resetErrorCount();
      this.updatePlayPauseUI();
      this.videoPlaceholder.style.display = 'none';
      this.startProgressTimer();
      try {
        this.player.setPlaybackQuality('small');
      } catch (_) {}

      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }
    } else if (state === 2) { // Paused
      this.isPlaying = false;
      this.updatePlayPauseUI();
      this.stopProgressTimer();

      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
    } else if (state === 0) { // Ended
      this.isPlaying = false;
      this.updatePlayPauseUI();
      this.stopProgressTimer();
      this.playNext();
    }
  }

  private updateProgress() {
    if (!this.player || !this.isPlayerReady || this.isDraggingSeek) return;
    try {
      const cur = this.player.getCurrentTime() || 0;
      const dur = this.player.getDuration() || (this.currentTrack?.duration || 0);

      this.currentTimeEl.textContent = formatSeconds(cur);
      if (dur > 0) {
        this.totalDurationEl.textContent = formatSeconds(dur);
        const pct = (cur / dur) * 100;
        this.progressBar.style.width = `${pct}%`;
        this.seekSlider.value = pct.toString();

        const loaded = this.player.getVideoLoadedFraction() || 0;
        this.bufferedBar.style.width = `${loaded * 100}%`;
      }
    } catch (_) {}
  }

  private startProgressTimer() {
    this.stopProgressTimer();
    if (document.hidden) return;
    this.updateProgress();
    this.progressInterval = window.setInterval(() => {
      this.updateProgress();
    }, 500);
  }

  private stopProgressTimer() {
    if (this.progressInterval !== null) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  private createTrackRow(item: Track, onClick: () => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'mini-track-item';

    const img = document.createElement('img');
    img.className = 'mini-track-thumb';
    img.src = item.thumbnail;
    img.alt = '';
    img.loading = 'lazy';

    const info = document.createElement('div');
    info.className = 'mini-track-info';

    const title = document.createElement('div');
    title.className = 'mini-track-title';
    title.textContent = item.title;

    const artist = document.createElement('div');
    artist.className = 'mini-track-artist';
    artist.textContent = item.artist;

    info.appendChild(title);
    info.appendChild(artist);

    const dur = document.createElement('span');
    dur.className = 'mini-track-dur';
    dur.textContent = item.durationText || '';

    row.appendChild(img);
    row.appendChild(info);
    row.appendChild(dur);

    row.addEventListener('click', onClick);
    return row;
  }

  private async loadPlaylistById(playlistId: string) {
    this.statusMessage.textContent = 'Cargando playlist...';
    this.resultsDrawer.style.display = 'flex';

    try {
      const res = await fetch(`/api/playlist/${playlistId}`);
      const data = await res.json();

      if (!data.videos || data.videos.length === 0) {
        this.statusMessage.textContent = 'Playlist vacia o no disponible.';
        return;
      }

      this.queueManager.setQueue(data.videos, 0);
      this.statusMessage.textContent = `Playlist: ${data.title} (${data.totalVideos} canciones)`;
      this.resultsList.innerHTML = '';

      data.videos.forEach((item: Track, idx: number) => {
        const row = this.createTrackRow(item, () => {
          this.queueManager.select(idx);
          this.playTrack(item);
        });
        this.resultsList.appendChild(row);
      });

      const firstTrack = this.queueManager.getCurrent();
      if (firstTrack) {
        this.playTrack(firstTrack);
      }
    } catch (err) {
      console.error('[ERROR] Playlist load error:', err);
      this.statusMessage.textContent = 'Error al cargar la playlist.';
    }
  }

  private async startAuthFlow() {
    this.authCodeText.textContent = 'Generando...';
    this.authPendingStatus.textContent = 'Solicitando codigo de verificacion a Google...';

    try {
      const res = await fetch('/api/auth/start', { method: 'POST' });
      const data = await res.json();

      if (data.loggedIn) {
        this.authBoxTitle.textContent = 'Cuenta Conectada';
        this.authPendingStatus.textContent = 'Tu cuenta de Google ya esta conectada.';
        return;
      }

      if (data.userCode) {
        this.authCodeText.textContent = data.userCode;
        this.authLink.href = data.verificationUrl || 'https://www.google.com/device';
        this.authPendingStatus.textContent = 'Esperando que apruebes el codigo en Google...';

        if (this.authPollInterval) clearInterval(this.authPollInterval);
        this.authPollInterval = window.setInterval(async () => {
          try {
            const check = await fetch('/api/auth/status');
            const status = await check.json();
            if (status.loggedIn) {
              clearInterval(this.authPollInterval!);
              this.authPendingStatus.textContent = 'Cuenta vinculada con exito!';
              this.accountBtn.classList.add('active');
              setTimeout(() => {
                this.authModal.style.display = 'none';
              }, 2500);
            }
          } catch (_) {}
        }, 3000);
      }
    } catch (err) {
      this.authPendingStatus.textContent = 'Error al conectar con Google.';
    }
  }

  private bindEvents() {
    // Toolbar Toggles
    this.toggleSearchBtn.addEventListener('click', () => {
      this.showSearch = !this.showSearch;
      this.applyVisibilityStates();
      this.savePreferences();
      if (this.showSearch) {
        this.urlInput.focus();
      }
    });

    this.toggleVideoBtn.addEventListener('click', () => {
      this.showVideo = !this.showVideo;
      this.applyVisibilityStates();
      this.savePreferences();
    });

    this.toggleMicroBtn.addEventListener('click', () => {
      this.isMicroMode = !this.isMicroMode;
      this.applyVisibilityStates();
      this.savePreferences();
    });

    // Account Modal Toggle
    this.accountBtn.addEventListener('click', () => {
      const isVisible = this.authModal.style.display === 'flex';
      this.authModal.style.display = isVisible ? 'none' : 'flex';
      if (!isVisible) {
        this.startAuthFlow();
      }
    });

    this.closeAuthBtn.addEventListener('click', () => {
      this.authModal.style.display = 'none';
      if (this.authPollInterval) clearInterval(this.authPollInterval);
    });

    this.copyCodeBtn.addEventListener('click', () => {
      const code = this.authCodeText.textContent || '';
      if (code && code !== 'Generando...') {
        navigator.clipboard.writeText(code);
        this.copyCodeBtn.textContent = 'Copiado!';
        setTimeout(() => {
          this.copyCodeBtn.textContent = 'Copiar';
        }, 2000);
      }
    });

    // Pin on top toggle
    this.pinBtn.addEventListener('click', () => {
      this.isOnTop = !this.isOnTop;
      this.pinBtn.classList.toggle('active', this.isOnTop);
      if ((window as any).pywebview?.api?.set_on_top) {
        (window as any).pywebview.api.set_on_top(this.isOnTop);
      }
    });

    // Minimize to System Tray
    document.getElementById('minimizeTrayBtn')?.addEventListener('click', () => {
      if ((window as any).pywebview?.api?.minimize_to_tray) {
        (window as any).pywebview.api.minimize_to_tray();
      } else {
        this.toggleMicroBtn.click();
      }
    });

    // Close Widget (Hides to Tray)
    this.closeWidgetBtn.addEventListener('click', () => {
      if ((window as any).pywebview?.api?.minimize_to_tray) {
        (window as any).pywebview.api.minimize_to_tray();
      } else {
        this.toggleMicroBtn.click();
      }
    });

    // Search / URL input
    this.urlInput.addEventListener('input', () => {
      const val = this.urlInput.value.trim();
      this.clearInputBtn.style.display = val ? 'block' : 'none';

      if (this.searchTimeout) clearTimeout(this.searchTimeout);

      if (!val) {
        this.resultsDrawer.style.display = 'none';
        return;
      }

      // 1. Check if user pasted a Playlist URL
      const playlistId = extractPlaylistId(val);
      if (playlistId) {
        this.loadPlaylistById(playlistId);
        return;
      }

      // 2. Check if user pasted a Single Video URL or ID
      const videoId = extractYouTubeId(val);
      if (videoId) {
        this.loadVideoById(videoId);
        return;
      }

      // 3. Otherwise, debounced search
      this.searchTimeout = window.setTimeout(() => {
        this.performSearch(val);
      }, 350);
    });

    this.clearInputBtn.addEventListener('click', () => {
      this.urlInput.value = '';
      this.clearInputBtn.style.display = 'none';
      this.resultsDrawer.style.display = 'none';
      this.urlInput.focus();
      this.syncWidgetSize();
    });

    // Toggle Results Drawer
    this.toggleResultsBtn.addEventListener('click', () => {
      const isVisible = this.resultsDrawer.style.display === 'flex';
      this.resultsDrawer.style.display = isVisible ? 'none' : 'flex';
      this.syncWidgetSize();
    });

    // Playback buttons
    this.playBtn.addEventListener('click', () => this.togglePlay());
    this.prevBtn.addEventListener('click', () => this.playPrev());
    this.nextBtn.addEventListener('click', () => this.playNext());
    this.seekBackBtn.addEventListener('click', () => this.seekRelative(-5));
    this.seekFwdBtn.addEventListener('click', () => this.seekRelative(5));

    // Seek Slider
    this.seekSlider.addEventListener('input', () => {
      this.isDraggingSeek = true;
      const pct = parseFloat(this.seekSlider.value);
      this.progressBar.style.width = `${pct}%`;
    });

    this.seekSlider.addEventListener('change', () => {
      this.isDraggingSeek = false;
      const pct = parseFloat(this.seekSlider.value);
      if (this.player && this.isPlayerReady) {
        const dur = this.player.getDuration() || (this.currentTrack?.duration || 0);
        this.player.seekTo((pct / 100) * dur, true);
      }
    });

    // Volume
    this.volumeSlider.addEventListener('input', () => {
      this.volume = parseInt(this.volumeSlider.value, 10);
      if (this.player && this.isPlayerReady) {
        this.player.setVolume(this.volume);
      }
      this.isMuted = this.volume === 0;
      this.updateVolumeIcons();
      this.savePreferences();
    });

    this.muteBtn.addEventListener('click', () => {
      this.isMuted = !this.isMuted;
      if (this.player && this.isPlayerReady) {
        if (this.isMuted) {
          this.player.mute();
        } else {
          this.player.unMute();
          this.player.setVolume(this.volume);
        }
      }
      this.updateVolumeIcons();
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;

      if (e.code === 'Space') {
        e.preventDefault();
        this.togglePlay();
      } else if (e.code === 'KeyV') {
        this.toggleVideoBtn.click();
      } else if (e.key === '/') {
        e.preventDefault();
        if (!this.showSearch) {
          this.toggleSearchBtn.click();
        } else {
          this.urlInput.focus();
        }
      } else if (e.code === 'KeyM') {
        this.toggleMicroBtn.click();
      } else if (e.code === 'ArrowRight') {
        this.seekRelative(5);
      } else if (e.code === 'ArrowLeft') {
        this.seekRelative(-5);
      } else if (e.code === 'KeyN') {
        this.playNext();
      } else if (e.code === 'KeyP') {
        this.playPrev();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.stopProgressTimer();
      } else if (this.isPlaying) {
        this.startProgressTimer();
      }
    });
  }

  private seekRelative(delta: number) {
    if (!this.player || !this.isPlayerReady) return;
    const cur = this.player.getCurrentTime() || 0;
    const dur = this.player.getDuration() || 0;
    const target = Math.max(0, Math.min(dur, cur + delta));
    this.player.seekTo(target, true);
  }

  private updateVolumeIcons() {
    this.volHighIcon.style.display = this.isMuted || this.volume === 0 ? 'none' : 'block';
    this.volMutedIcon.style.display = this.isMuted || this.volume === 0 ? 'block' : 'none';
  }

  private togglePlay() {
    if (!this.player || !this.isPlayerReady) return;
    if (this.isPlaying) {
      this.player.pauseVideo();
    } else {
      this.player.playVideo();
    }
  }

  private playNext() {
    const nextTrack = this.queueManager.next();
    if (nextTrack) {
      this.playTrack(nextTrack);
    }
  }

  private playPrev() {
    if (this.player && this.isPlayerReady && this.player.getCurrentTime() > 3) {
      this.player.seekTo(0);
      return;
    }
    const prevTrack = this.queueManager.prev();
    if (prevTrack) {
      this.playTrack(prevTrack);
    }
  }

  private async loadVideoById(videoId: string) {
    this.statusMessage.textContent = 'Cargando pista...';
    this.resultsDrawer.style.display = 'flex';

    try {
      const res = await fetch(`/api/info/${videoId}`);
      const info = await res.json();
      const track: Track = {
        id: videoId,
        title: info.title || 'Video de YouTube',
        artist: info.artist || 'YouTube',
        duration: info.duration || 0,
        durationText: info.durationText || '0:00',
        thumbnail: info.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      };

      this.queueManager.setQueue([track], 0);
      this.playTrack(track);
      this.statusMessage.textContent = `Reproduciendo: ${track.title}`;
    } catch (err) {
      console.error('[ERROR] Info load failed:', err);
      const track: Track = {
        id: videoId,
        title: 'Video de YouTube',
        artist: 'YouTube',
        duration: 0,
        durationText: '0:00',
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      };
      this.queueManager.setQueue([track], 0);
      this.playTrack(track);
    }
  }

  private async performSearch(query: string) {
    this.resultsDrawer.style.display = 'flex';
    this.statusMessage.textContent = 'Buscando...';
    this.resultsList.innerHTML = '';

    if (this.searchAbortController) {
      this.searchAbortController.abort();
    }
    this.searchAbortController = new AbortController();
    const { signal } = this.searchAbortController;

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal });
      const data = await res.json();
      const results: Track[] = data.results || [];

      if (results.length === 0) {
        this.statusMessage.textContent = 'Sin resultados.';
        return;
      }

      this.statusMessage.textContent = `${results.length} resultados:`;
      this.queueManager.setQueue(results, 0);

      results.forEach((item, idx) => {
        const row = this.createTrackRow(item, () => {
          this.queueManager.select(idx);
          this.playTrack(item);
        });
        this.resultsList.appendChild(row);
      });
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      this.statusMessage.textContent = 'Error al conectar con el servidor.';
    }
  }

  private playTrack(track: Track) {
    this.currentTrack = track;
    this.trackTitle.textContent = track.title;
    this.trackArtist.textContent = track.artist;
    this.miniThumb.src = track.thumbnail;
    this.totalDurationEl.textContent = track.durationText || '0:00';
    this.currentTimeEl.textContent = '0:00';
    this.progressBar.style.width = '0%';
    this.seekSlider.value = '0';

    if (this.player && this.isPlayerReady) {
      this.player.loadVideoById({
        videoId: track.id,
        suggestedQuality: 'small',
      });
      this.player.setVolume(this.volume);
    }

    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        artwork: [{ src: track.thumbnail, sizes: '128x128', type: 'image/jpeg' }],
      });
    }
  }

  private setupMediaSession() {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', () => this.togglePlay());
    navigator.mediaSession.setActionHandler('pause', () => this.togglePlay());
    navigator.mediaSession.setActionHandler('previoustrack', () => this.playPrev());
    navigator.mediaSession.setActionHandler('nexttrack', () => this.playNext());
    navigator.mediaSession.setActionHandler('seekbackward', () => this.seekRelative(-5));
    navigator.mediaSession.setActionHandler('seekforward', () => this.seekRelative(5));
  }

  private updatePlayPauseUI() {
    this.playIcon.style.display = this.isPlaying ? 'none' : 'block';
    this.pauseIcon.style.display = this.isPlaying ? 'block' : 'none';
  }

  private setupDrag() {
    // Prevent pywebview-drag-region from triggering when interacting with buttons, sliders, or inputs
    const stopDragPropagation = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('button, input, select, textarea, a, .toolbar-actions, .controls-box, .volume-group, .progress-bar-container, .results-drawer, .auth-box')) {
        e.stopPropagation();
      }
    };

    const header = document.getElementById('dragHeader');
    if (header) {
      header.addEventListener('mousedown', stopDragPropagation);
    }

    if (this.playerCard) {
      this.playerCard.addEventListener('mousedown', stopDragPropagation);
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const app = new MiniPlayerApp();
  (window as any).miniPlayerApp = app;
});

window.addEventListener('pywebviewready', () => {
  if ((window as any).miniPlayerApp) {
    (window as any).miniPlayerApp.syncWidgetSize();
  }

  // Throttle pywebviewMoveWindow via requestAnimationFrame to avoid flooding IPC messages
  const pwv = (window as any).pywebview;
  if (pwv && typeof pwv._jsApiCallback === 'function') {
    const origCallback = pwv._jsApiCallback.bind(pwv);
    let moveRafPending = false;
    let lastMoveArgs: [string, any, any] | null = null;

    pwv._jsApiCallback = function (funcName: string, params: any, id: any) {
      if (funcName === 'pywebviewMoveWindow') {
        lastMoveArgs = [funcName, params, id];
        if (!moveRafPending) {
          moveRafPending = true;
          requestAnimationFrame(() => {
            moveRafPending = false;
            if (lastMoveArgs) {
              origCallback(...lastMoveArgs);
              lastMoveArgs = null;
            }
          });
        }
        return;
      }
      return origCallback(funcName, params, id);
    };
  }
});
