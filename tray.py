import os
import sys
import subprocess
import atexit
import time
import urllib.request
import threading
import pystray
from PIL import Image
import webview

PORT = 3000
SERVER_URL = f"http://127.0.0.1:{PORT}"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

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
        for _ in range(25):
            time.sleep(0.2)
            if is_server_online():
                break

class WidgetApi:
    def __init__(self, window_ref):
        self.window_ref = window_ref

    def resize_widget(self, width, height):
        w = self.window_ref[0]
        if w:
            w.resize(int(width), int(height))

    def minimize_to_tray(self):
        w = self.window_ref[0]
        if w:
            w.hide()

    def set_on_top(self, on_top):
        w = self.window_ref[0]
        if w:
            w.on_top = bool(on_top)

    def close_app(self):
        w = self.window_ref[0]
        if w:
            w.destroy()

def main():
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
        w = window_ref[0]
        if w:
            if w.visible:
                w.hide()
            else:
                w.show()
                w.restore()

    def on_quit(icon, item=None):
        icon.stop()
        w = window_ref[0]
        if w:
            w.destroy()
        cleanup_server()
        sys.exit(0)

    menu = pystray.Menu(
        pystray.MenuItem("Mostrar / Ocultar Widget", toggle_window, default=True),
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
        easy_drag=True,
        js_api=api,
        background_color='#13161f'
    )
    window_ref[0] = window

    # Prevent accidental destruction on close; minimize to tray instead
    window.events.closing += lambda: (window.hide(), False)

    webview.start()

if __name__ == "__main__":
    main()
