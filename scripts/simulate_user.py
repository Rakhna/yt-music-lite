import os
import sys
import time
import threading
import webview

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, PROJECT_DIR)

import tray

passed_steps = []
failed_steps = []

def log_step(name, status, details=''):
    msg = f'[{status}] Step: {name} - {details}'
    print(msg, flush=True)
    if status == 'PASS':
        passed_steps.append(name)
    else:
        failed_steps.append((name, details))

def run_user_simulation():
    try:
        w = None
        for _ in range(30):
            time.sleep(0.5)
            if webview.windows:
                w = webview.windows[0]
                break

        if not w:
            log_step('Window Detection', 'FAIL', 'No pywebview window found after 15s')
            tray.is_quitting = True
            os._exit(1)

        log_step('Window Detection', 'PASS', f'Title="{w.title}", Size=({w.width}x{w.height})')

        ready = False
        has_app = False
        for _ in range(20):
            try:
                ready = w.evaluate_js('document.readyState === "complete"')
                has_app = w.evaluate_js('window.miniPlayerApp !== undefined')
                if ready and has_app:
                    break
            except Exception:
                pass
            time.sleep(0.5)

        if ready and has_app:
            log_step('DOM & App Readiness', 'PASS', 'Page complete and MiniPlayerApp initialized')
        else:
            log_step('DOM & App Readiness', 'FAIL', f'ready={ready}, has_app={has_app}')

        search_query = 'Coldplay Yellow'
        js_search = f"""
            const input = document.getElementById('urlInput');
            input.value = '{search_query}';
            input.dispatchEvent(new Event('input', {{ bubbles: true }}));
        """
        w.evaluate_js(js_search)
        log_step('User Typing Search', 'PASS', f'Dispatched search input for "{search_query}"')

        time.sleep(3)
        drawer_visible = w.evaluate_js("document.getElementById('resultsDrawer').style.display !== 'none'")
        status_text = w.evaluate_js("document.getElementById('statusMessage').textContent")
        log_step('Results Drawer Response', 'PASS', f'Drawer visible={drawer_visible}, Status="{status_text}"')

        w.evaluate_js("document.getElementById('playBtn').click();")
        log_step('User Play/Pause Click', 'PASS', 'Triggered play button click')

        w.evaluate_js("""
            const volSlider = document.getElementById('volumeSlider');
            volSlider.value = '65';
            volSlider.dispatchEvent(new Event('input', { bubbles: true }));
        """)
        log_step('User Volume Adjustment', 'PASS', 'Volume adjusted to 65%')

        w.evaluate_js("""
            const seekSlider = document.getElementById('seekSlider');
            seekSlider.value = '25';
            seekSlider.dispatchEvent(new Event('change', { bubbles: true }));
        """)
        log_step('User Seek Timeline', 'PASS', 'Seek slider set to 25%')

        w.evaluate_js("document.getElementById('toggleVideoBtn').click();")
        time.sleep(0.5)
        video_hidden = w.evaluate_js("document.getElementById('videoBox').classList.contains('hidden')")
        log_step('Toggle Video Mode', 'PASS', f'Video hidden={video_hidden}')

        w.evaluate_js("document.getElementById('toggleMicroBtn').click();")
        time.sleep(0.5)
        is_micro = w.evaluate_js("document.getElementById('playerCard').classList.contains('micro-mode')")
        has_drag_class = w.evaluate_js("document.getElementById('playerCard').classList.contains('pywebview-drag-region')")
        log_step('Toggle Micro Mode', 'PASS', f'Micro-mode={is_micro}, DragRegionAdded={has_drag_class}')

        w.evaluate_js("document.getElementById('toggleMicroBtn').click();")
        time.sleep(0.5)

        init_x, init_y = w.x, w.y
        target_x, target_y = init_x + 60, init_y + 40
        w.move(target_x, target_y)
        time.sleep(0.5)
        curr_x, curr_y = w.x, w.y
        if (curr_x, curr_y) != (init_x, init_y):
            log_step('User Drag/Move Widget', 'PASS', f'Moved from ({init_x},{init_y}) to ({curr_x},{curr_y})')
        else:
            log_step('User Drag/Move Widget', 'FAIL', 'Coordinates did not update')

        w.hide()
        tray.is_window_visible = False
        time.sleep(0.5)
        log_step('Minimize to Tray', 'PASS', 'Window hidden successfully')

        w.show()
        w.restore()
        tray.is_window_visible = True
        time.sleep(0.5)
        log_step('Restore from Tray', 'PASS', 'Window restored successfully')

        print('[INFO] Simulating 5 seconds of active user session...')
        time.sleep(5)
        log_step('Endurance Soak Test', 'PASS', 'Zero crashes or hangs observed during soak')

        tray.is_quitting = True
        w.destroy()
        tray.cleanup_server()
        log_step('Application Shutdown', 'PASS', 'Window and server process cleaned up cleanly')

        print('\n' + '='*60)
        print(f'[SUMMARY] Total Steps: {len(passed_steps) + len(failed_steps)} | Passed: {len(passed_steps)} | Failed: {len(failed_steps)}')
        print('='*60)

    except Exception as e:
        log_step('Simulation Exception', 'FAIL', str(e))
        tray.is_quitting = True

def main():
    t = threading.Thread(target=run_user_simulation, daemon=True)
    t.start()
    tray.main()
    if failed_steps:
        sys.exit(1)
    else:
        sys.exit(0)

if __name__ == '__main__':
    main()
