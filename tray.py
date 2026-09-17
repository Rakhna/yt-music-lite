import os
import sys
import subprocess
import atexit
import time
import urllib.request
import threading
import logging
import ctypes
import pystray
from PIL import Image
import webview

# Set explicit Windows AppUserModelID so Windows Taskbar groups under this app and uses its icon instead of pythonw.exe
if os.name == "nt":
    try:
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("rakhna.ytmusiclite.player.1.0")
    except Exception:
        pass

PORT = 3000
SERVER_URL = f"http://127.0.0.1:{PORT}"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(SCRIPT_DIR, "widget.log")
SERVER_LOG = os.path.join(SCRIPT_DIR, "server.log")

logging.basicConfig(
    filename=LOG_FILE,
    filemode="a",
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    level=logging.DEBUG
)
logger = logging.getLogger("yt-mini-tray")
logging.getLogger("PIL").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)
logging.getLogger("pystray").setLevel(logging.WARNING)

def handle_uncaught_exception(exc_type, exc_value, exc_traceback):
    if issubclass(exc_type, KeyboardInterrupt):
        sys.__excepthook__(exc_type, exc_value, exc_traceback)
        return
    logger.critical("[ERROR] Uncaught exception:", exc_info=(exc_type, exc_value, exc_traceback))

sys.excepthook = handle_uncaught_exception

if hasattr(threading, "excepthook"):
    def handle_thread_exception(args):
        logger.critical(
            f"[ERROR] Uncaught thread exception in {args.thread.name}:",
            exc_info=(args.exc_type, args.exc_value, args.exc_traceback)
        )
    threading.excepthook = handle_thread_exception

# Apply safety monkeypatch for pywebview WinForms backend on 64-bit Windows
try:
    import ctypes
    from ctypes import windll, wintypes
    import webview.platforms.winforms as wf

    user32 = windll.user32
    user32.SetWindowPos.argtypes = [
        wintypes.HWND,
        wintypes.HWND,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_int,
        wintypes.UINT,
    ]
    user32.SetWindowPos.restype = wintypes.BOOL

    user32.LoadImageW.argtypes = [
        wintypes.HINSTANCE,
        wintypes.LPCWSTR,
        wintypes.UINT,
        ctypes.c_int,
        ctypes.c_int,
        wintypes.UINT,
    ]
    user32.LoadImageW.restype = wintypes.HANDLE

    user32.SetClassLongPtrW.argtypes = [wintypes.HWND, ctypes.c_int, wintypes.HANDLE]
    user32.SetClassLongPtrW.restype = wintypes.HANDLE

    HWND_TOPMOST = wintypes.HWND(-1)
    HWND_NOTOPMOST = wintypes.HWND(-2)

    def safe_resize(self, width, height, fix_point=0):
        try:
            scale = getattr(self, "_scale", 1)
            phys_width = int(width * scale)
            phys_height = int(height * scale)
            x = self.Location.X
            y = self.Location.Y
            hwnd = int(self.Handle.ToInt64())
            user32.SetWindowPos(hwnd, None, x, y, phys_width, phys_height, 0x0004 | 0x0040)
        except Exception as e:
            logger.error(f"safe_resize error: {e}", exc_info=True)

    last_move_time = [0.0]

    def safe_move(self, x, y):
        now = time.time()
        if now - last_move_time[0] < 0.015:
            return
        last_move_time[0] = now
        try:
            scale = getattr(self, "_scale", 1)
            x_phys = int(x * scale)
            y_phys = int(y * scale)
            hwnd = int(self.Handle.ToInt64())
            # SWP_NOSIZE (0x0001) | SWP_NOZORDER (0x0004)
            flags = 0x0001 | 0x0004
            user32.SetWindowPos(hwnd, None, x_phys, y_phys, 0, 0, flags)
        except Exception as e:
            logger.error(f"safe_move error: {e}", exc_info=True)

    wf.BrowserView.BrowserForm.resize = safe_resize
    wf.BrowserView.BrowserForm.move = safe_move
    logger.info("WinForms BrowserForm resize/move safety patch applied")
except Exception as e:
    logger.warning(f"Could not apply WinForms safety patch: {e}")

MUTEX_NAME = "Local\\YTMusicLite_SingleInstance_Mutex_98a72b"
_single_instance_mutex = None

def check_single_instance():
    """
    Enforces single-instance execution using a Windows named mutex.
    If another instance is already running, restores/focuses the existing
    window and returns False to indicate the current process should exit.
    """
    global _single_instance_mutex
    if os.environ.get("YT_ALLOW_MULTIPLE") == "1":
        return True

    if os.name == "nt":
        ERROR_ALREADY_EXISTS = 183
        kernel32 = ctypes.windll.kernel32
        user32 = ctypes.windll.user32

        try:
            hdesk = user32.OpenInputDesktop(0, False, 0x0100)
            if hdesk:
                user32.SetThreadDesktop(hdesk)
        except Exception:
            pass

        _single_instance_mutex = kernel32.CreateMutexW(None, False, MUTEX_NAME)
        last_error = kernel32.GetLastError()

        if last_error == ERROR_ALREADY_EXISTS:
            logger.warning("[WARNING] Another instance of YT Mini Player is already running.")
            print("[WARNING] Another instance of YT Mini Player is already running. Exiting duplicate process.")
            try:
                hwnd = user32.FindWindowW(None, "YT Mini Player")
                if hwnd:
                    user32.ShowWindow(hwnd, 9)  # SW_RESTORE
                    user32.BringWindowToTop(hwnd)
                    user32.SetForegroundWindow(hwnd)
                    logger.info(f"Restored and focused existing window HWND {hwnd}")
            except Exception as e:
                logger.debug(f"Could not focus existing window: {e}")
            return False
    return True

server_proc = None
server_log_handle = None
is_quitting = False

def cleanup_server():
    global server_proc, server_log_handle
    if server_proc and server_proc.poll() is None:
        logger.info(f"Terminating server process PID {server_proc.pid}")
        try:
            server_proc.terminate()
            server_proc.wait(timeout=2)
        except Exception:
            try:
                server_proc.kill()
            except Exception:
                pass
    if server_log_handle:
        try:
            server_log_handle.close()
        except Exception:
            pass

atexit.register(cleanup_server)

def is_server_online():
    try:
        r = urllib.request.urlopen(f"{SERVER_URL}/api/health", timeout=1)
        return r.status == 200
    except Exception:
        return False

def ensure_server():
    global server_proc, server_log_handle
    if is_server_online():
        logger.info("Server is already online on port 3000")
        return True

    logger.info("Spawning Node server process...")
    server_log_handle = open(SERVER_LOG, "a", encoding="utf-8")
    server_proc = subprocess.Popen(
        ["node", "--optimize-for-size", "--max-old-space-size=192", "server/index.js"],
        cwd=SCRIPT_DIR,
        stdout=server_log_handle,
        stderr=subprocess.STDOUT,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    )
    logger.info(f"Node server started with PID {server_proc.pid}")

    for i in range(60):
        time.sleep(0.25)
        if server_proc.poll() is not None:
            logger.error(f"Node server exited prematurely with code {server_proc.returncode}")
            return False
        if is_server_online():
            logger.info(f"Server online and verified after {(i + 1) * 0.25:.2f}s")
            return True

    logger.warning("Server health check timed out after 15s")
    return False

is_window_visible = True

class WidgetApi:
    def __init__(self, window_ref):
        self.window_ref = window_ref

    def resize_widget(self, width, height):
        try:
            w = self.window_ref[0]
            if w:
                w.resize(int(width), int(height))
        except Exception as e:
            logger.error(f"resize_widget failed: {e}", exc_info=True)

    def minimize_to_tray(self):
        global is_window_visible
        try:
            w = self.window_ref[0]
            if w:
                w.hide()
                is_window_visible = False
        except Exception as e:
            logger.error(f"minimize_to_tray failed: {e}", exc_info=True)

    def set_on_top(self, on_top):
        try:
            w = self.window_ref[0]
            if w:
                i = wf.BrowserView.instances.get(w.uid)
                if i:
                    hwnd = int(i.Handle.ToInt64())
                    target = HWND_TOPMOST if on_top else HWND_NOTOPMOST
                    # SWP_NOSIZE (0x0001) | SWP_NOMOVE (0x0002) | SWP_NOACTIVATE (0x0010)
                    user32.SetWindowPos(hwnd, target, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010)
                    def _sync():
                        try:
                            i.TopMost = bool(on_top)
                        except Exception:
                            pass
                    if i.InvokeRequired:
                        i.BeginInvoke(wf.Func[wf.Type](_sync))
                    else:
                        _sync()
                w._on_top = bool(on_top)
        except Exception as e:
            logger.error(f"set_on_top failed: {e}", exc_info=True)
        return True

    def close_app(self):
        global is_quitting
        is_quitting = True
        try:
            w = self.window_ref[0]
            if w:
                w.destroy()
        except Exception as e:
            logger.error(f"close_app failed: {e}", exc_info=True)
        cleanup_server()

    def restart_app(self):
        global is_quitting
        is_quitting = True
        logger.info("Restarting application requested by webview UI")
        try:
            cleanup_server()
            global _single_instance_mutex
            if _single_instance_mutex:
                import ctypes
                ctypes.windll.kernel32.CloseHandle(_single_instance_mutex)
                _single_instance_mutex = None
            subprocess.Popen([sys.executable, *sys.argv], cwd=SCRIPT_DIR)
        except Exception as e:
            logger.error(f"restart_app failed: {e}", exc_info=True)
        w = self.window_ref[0]
        if w:
            try:
                w.destroy()
            except Exception:
                pass
        os._exit(0)

def main():
    global is_window_visible
    if not check_single_instance():
        logger.info("Exiting duplicate instance cleanly.")
        sys.exit(0)

    logger.info("Starting YT Mini Player tray runner")
    ensure_server()

    # Find which icon is selected (defaults to icon3)
    icon_choice = "icon3.png"
    icon_ico = "icon3.ico"
    pref_file = os.path.join(SCRIPT_DIR, "icon_choice.txt")
    if os.path.exists(pref_file):
        with open(pref_file, "r") as f:
            choice = f.read().strip()
            if choice in ["icon1", "icon2", "icon3"]:
                icon_choice = f"{choice}.png"
                icon_ico = f"{choice}.ico"

    icon_path = os.path.join(SCRIPT_DIR, "client", "public", "icons", icon_choice)
    icon_ico_path = os.path.join(SCRIPT_DIR, "client", "public", "icons", icon_ico)
    if os.path.exists(icon_path):
        tray_image = Image.open(icon_path)
    else:
        tray_image = Image.new("RGBA", (64, 64), (255, 0, 85, 255))

    window_ref = [None]
    api = WidgetApi(window_ref)

    def toggle_window(icon, item=None):
        global is_window_visible
        w = window_ref[0]
        if w:
            try:
                i = wf.BrowserView.instances.get(w.uid)
                if i:
                    hwnd = int(i.Handle.ToInt64())
                    is_window_visible = bool(user32.IsWindowVisible(hwnd))
            except Exception:
                pass
            if is_window_visible:
                w.hide()
                is_window_visible = False
            else:
                w.show()
                w.restore()
                is_window_visible = True

    def open_logs(icon, item=None):
        try:
            if os.path.exists(LOG_FILE):
                os.startfile(LOG_FILE)
            else:
                os.startfile(SCRIPT_DIR)
        except Exception as e:
            logger.error(f"Could not open log file: {e}")

    def check_updates_manual(icon, item=None):
        def _bg():
            try:
                import json
                req = urllib.request.Request(f"{SERVER_URL}/api/update/check")
                with urllib.request.urlopen(req, timeout=5) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    w = window_ref[0]
                    if w:
                        w.show()
                        w.restore()
                        if data.get("updateAvailable"):
                            safe_data = json.dumps(data)
                            w.evaluate_js(f"window.miniPlayerApp?.showUpdateModal({safe_data})")
                        else:
                            w.evaluate_js("alert('YT Mini Player ya esta actualizado a la ultima version.')")
            except Exception as e:
                logger.warning(f"Manual update check failed: {e}")
        threading.Thread(target=_bg, daemon=True).start()

    def on_quit(icon, item=None):
        global is_quitting
        is_quitting = True
        logger.info("Quitting application from tray menu")
        icon.stop()
        w = window_ref[0]
        if w:
            w.destroy()
        cleanup_server()
        sys.exit(0)

    menu = pystray.Menu(
        pystray.MenuItem("Mostrar / Ocultar Widget", toggle_window, default=True),
        pystray.MenuItem("Buscar actualizaciones...", check_updates_manual),
        pystray.MenuItem("Ver Registro de Logs", open_logs),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Salir", on_quit)
    )

    icon = pystray.Icon("YT Mini Player", tray_image, "YT Mini Player", menu)
    threading.Thread(target=icon.run, daemon=True).start()

    window = webview.create_window(
        title="YT Mini Player",
        url=SERVER_URL,
        width=336,
        height=450,
        min_size=(260, 80),
        frameless=True,
        on_top=True,
        easy_drag=False,
        js_api=api,
        background_color='#13161f'
    )
    window_ref[0] = window

    def on_closing():
        global is_quitting, is_window_visible
        if is_quitting:
            logger.info("Application quitting, closing window")
            return True
        logger.info("Window close intercepted, minimizing to tray")
        w = window_ref[0]
        if w:
            w.hide()
            is_window_visible = False
        return False

    def on_shown():
        try:
            if os.name == "nt":
                i = wf.BrowserView.instances.get(window.uid)
                if i:
                    hwnd = int(i.Handle.ToInt64())
                    # 1. Hide from Windows Taskbar (pure desktop widget mode)
                    GWL_EXSTYLE = -20
                    WS_EX_TOOLWINDOW = 0x00000080
                    WS_EX_APPWINDOW = 0x00040000
                    SWP_NOMOVE = 0x0002
                    SWP_NOSIZE = 0x0001
                    SWP_NOZORDER = 0x0004
                    SWP_FRAMECHANGED = 0x0020
                    ex_style = user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
                    new_ex_style = (ex_style | WS_EX_TOOLWINDOW) & ~WS_EX_APPWINDOW
                    user32.SetWindowLongW(hwnd, GWL_EXSTYLE, new_ex_style)
                    user32.SetWindowPos(hwnd, None, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED)
                    logger.info("Widget successfully hidden from Windows taskbar (pure widget mode)")

                    # 2. Also ensure window and class icons are set to custom icon
                    if os.path.exists(icon_ico_path):
                        hicon_big = user32.LoadImageW(None, icon_ico_path, 1, 32, 32, 0x0010)
                        hicon_small = user32.LoadImageW(None, icon_ico_path, 1, 16, 16, 0x0010)
                        if hicon_big:
                            user32.SetClassLongPtrW(hwnd, -14, hicon_big)   # GCLP_HICON
                            user32.SendMessageW(hwnd, 0x0080, 1, hicon_big) # ICON_BIG
                        if hicon_small:
                            user32.SetClassLongPtrW(hwnd, -34, hicon_small)   # GCLP_HICONSM
                            user32.SendMessageW(hwnd, 0x0080, 0, hicon_small) # ICON_SMALL
                        try:
                            from System.Drawing import Icon
                            i.Icon = Icon(icon_ico_path)
                        except Exception:
                            pass
        except Exception as e:
            logger.warning(f"Could not configure native window: {e}")

    window.events.shown += on_shown

    logger.info("Starting webview main loop")
    webview.start(icon=icon_ico_path if os.path.exists(icon_ico_path) else None)
    logger.info("Webview main loop exited")

if __name__ == "__main__":
    main()
