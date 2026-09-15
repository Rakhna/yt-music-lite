import os
import sys
import subprocess
import atexit
import time
import ctypes
from ctypes import wintypes
import urllib.request
import pystray
from PIL import Image

PORT = 3000
SERVER_URL = f"http://localhost:{PORT}"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

user32 = ctypes.windll.user32
SW_HIDE = 0
SW_RESTORE = 9

server_proc = None

def cleanup_server():
    global server_proc
    if server_proc and server_proc.poll() is None:
        try:
            server_proc.terminate()
            server_proc.wait(timeout=2)
        except Exception:
            try:
                server_proc.kill()
            except Exception:
                pass

atexit.register(cleanup_server)

def get_window_hwnd():
    found = []
    def enum_proc(hwnd, lParam):
        length = user32.GetWindowTextLengthW(hwnd)
        if length > 0:
            buf = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, buf, length + 1)
            title = buf.value
            if "YT Mini Player" in title or "YT Music Lite" in title:
                found.append(hwnd)
        return True

    EnumProc = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
    user32.EnumWindows(EnumProc(enum_proc), 0)
    return found[0] if found else None

def is_server_online():
    try:
        r = urllib.request.urlopen(f"{SERVER_URL}/api/health", timeout=1)
        return r.status == 200
    except Exception:
        return False

def ensure_server():
    global server_proc
    if not is_server_online():
        server_proc = subprocess.Popen(
            ["node", "--optimize-for-size", "--max-old-space-size=192", "server/index.js"],
            cwd=SCRIPT_DIR,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        )
        for _ in range(20):
            time.sleep(0.3)
            if is_server_online():
                break

def launch_app_window():
    user_data_dir = os.path.join(os.environ.get("TEMP", SCRIPT_DIR), "yt-mini-profile")
    flags = [
        f'--app="{SERVER_URL}"',
        '--window-size="370,550"',
        '--renderer-process-limit=1',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-sync',
        '--disable-features=Translate,OptimizationHints,MediaRouter',
        '--disk-cache-size=10485760',
        '--media-cache-size=10485760',
        '--no-default-browser-check',
        f'--user-data-dir="{user_data_dir}"'
    ]
    cmd = f'start msedge.exe {" ".join(flags)}'
    subprocess.Popen(cmd, shell=True)

def main():
    ensure_server()

    # Find which icon is selected (defaults to icon3 if configured)
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

    is_visible = [True]

    def toggle_window(icon, item=None):
        hwnd = get_window_hwnd()
        if not hwnd:
            launch_app_window()
            is_visible[0] = True
            return

        if is_visible[0]:
            user32.ShowWindow(hwnd, SW_HIDE)
            is_visible[0] = False
        else:
            user32.ShowWindow(hwnd, SW_RESTORE)
            user32.SetForegroundWindow(hwnd)
            is_visible[0] = True

    def on_quit(icon, item=None):
        hwnd = get_window_hwnd()
        if hwnd:
            user32.PostMessageW(hwnd, 0x0010, 0, 0) # WM_CLOSE
        cleanup_server()
        icon.stop()
        sys.exit(0)

    menu = pystray.Menu(
        pystray.MenuItem("Mostrar / Ocultar", toggle_window, default=True),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Salir", on_quit)
    )

    icon = pystray.Icon("YT Mini Player", tray_image, "YT Mini Player", menu)

    if not get_window_hwnd():
        launch_app_window()

    icon.run()

if __name__ == "__main__":
    main()
