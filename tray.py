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
    import webview.platforms.winforms as wf
    from ctypes import windll

    def safe_resize(self, width, height, fix_point=0):
        try:
            scale = getattr(self, "_scale", 1)
            phys_width = int(width * scale)
            phys_height = int(height * scale)
            x = self.Location.X
            y = self.Location.Y
            hwnd = int(self.Handle.ToInt64())
            windll.user32.SetWindowPos(hwnd, 0, x, y, phys_width, phys_height, 64)
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
            # SWP_NOSIZE (0x0001) | SWP_NOZORDER (0x0004) | SWP_NOACTIVATE (0x0010) | SWP_NOSENDCHANGING (0x0400)
            flags = 0x0001 | 0x0004 | 0x0010 | 0x0400
            windll.user32.SetWindowPos(hwnd, 0, x_phys, y_phys, 0, 0, flags)
        except Exception as e:
            logger.error(f"safe_move error: {e}", exc_info=True)

    wf.BrowserView.BrowserForm.resize = safe_resize
    wf.BrowserView.BrowserForm.move = safe_move
    logger.info("WinForms BrowserForm resize/move safety patch applied")
except Exception as e:
    logger.warning(f"Could not apply WinForms safety patch: {e}")

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
                w.on_top = bool(on_top)
        except Exception as e:
            logger.error(f"set_on_top failed: {e}", exc_info=True)

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

def main():
    global is_window_visible
    logger.info("Starting YT Mini Player tray runner")
    ensure_server()

    # Find which icon is selected (defaults to icon3)
    icon_choice = "icon3.png"
    pref_file = os.path.join(SCRIPT_DIR, "icon_choice.txt")
    if os.path.exists(pref_file):
        with open(pref_file, "r") as f:
            choice = f.read().strip()
            if choice in ["icon1", "icon2", "icon3"]:
                icon_choice = f"{choice}.png"

    icon_path = os.path.join(SCRIPT_DIR, "client", "public", "icons", icon_choice)
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
        pystray.MenuItem("Ver Registro de Logs", open_logs),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Salir", on_quit)
    )

    icon = pystray.Icon("YT Mini Player", tray_image, "YT Mini Player", menu)
    threading.Thread(target=icon.run, daemon=True).start()

    window = webview.create_window(
        title="YT Mini Player",
        url=SERVER_URL,
        width=320,
        height=440,
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

    window.events.closing += on_closing

    logger.info("Starting webview main loop")
    webview.start()
    logger.info("Webview main loop exited")

if __name__ == "__main__":
    main()
