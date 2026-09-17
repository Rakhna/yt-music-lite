import os
import sys
import subprocess
import time

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_DIR)

import tray

def run_tests():
    print("[INFO] Starting Single-Instance Verification Tests...")

    # Test 1: Check single instance under normal execution
    tray._single_instance_mutex = None

    # First acquisition
    is_first = tray.check_single_instance()
    assert is_first is True, "[FAIL] First instance check should return True"
    print("[PASS] Test 1: First instance acquired mutex successfully")

    # Test 2: Second check in the same process with mutex already created
    # Spawning a separate subprocess to verify real multi-process single instance
    sub_code = """
import sys, os
PROJECT_DIR = sys.argv[1]
sys.path.insert(0, PROJECT_DIR)
import tray
result = tray.check_single_instance()
if result is False:
    sys.exit(0)
else:
    sys.exit(1)
"""
    p = subprocess.run(
        [sys.executable, "-c", sub_code, PROJECT_DIR],
        capture_output=True,
        text=True
    )
    assert p.returncode == 0, f"[FAIL] Duplicate process should exit with 0, got {p.returncode}: {p.stderr}"
    assert "[WARNING] Another instance" in p.stdout or "[WARNING] Another instance" in p.stderr, \
        "[FAIL] Duplicate process should output WARNING message"
    print("[PASS] Test 2: Second process correctly detected existing instance and exited with code 0")

    # Test 3: Environment variable bypass
    p_bypass = subprocess.run(
        [sys.executable, "-c", sub_code, PROJECT_DIR],
        env={**os.environ, "YT_ALLOW_MULTIPLE": "1"},
        capture_output=True,
        text=True
    )
    # With bypass, check_single_instance returns True so sub_code exits with 1
    assert p_bypass.returncode == 1, "[FAIL] Bypass YT_ALLOW_MULTIPLE=1 should allow execution"
    print("[PASS] Test 3: YT_ALLOW_MULTIPLE=1 successfully bypassed lock")

    # Clean up mutex handle so subsequent runs are clean
    if tray._single_instance_mutex:
        import ctypes
        ctypes.windll.kernel32.CloseHandle(tray._single_instance_mutex)
        tray._single_instance_mutex = None

    # Test 4: Verify Node server handles duplicate instance (EADDRINUSE) cleanly
    import socket
    dummy_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        dummy_sock.bind(("0.0.0.0", 3000))
        dummy_sock.listen(1)
        p_node = subprocess.run(
            ["node", "server/index.js"],
            cwd=PROJECT_DIR,
            capture_output=True,
            text=True,
            timeout=10
        )
        assert p_node.returncode == 0, f"[FAIL] Node duplicate instance should exit with 0, got {p_node.returncode}: {p_node.stderr}"
        assert "[WARNING] Port 3000 is already in use" in p_node.stderr or "[WARNING] Port 3000 is already in use" in p_node.stdout, \
            f"[FAIL] Node should warn about EADDRINUSE: stdout={p_node.stdout}, stderr={p_node.stderr}"
        print("[PASS] Test 4: Node server gracefully handled duplicate instance on port 3000")
    finally:
        dummy_sock.close()

    print("[INFO] All Single-Instance tests PASSED!")

if __name__ == "__main__":
    run_tests()
