import glob
import os
import sys
import termios
import time

# usage: serialread.py <seconds> [port]
# port省略時は /dev/cu.usbmodem* を自動検出。デバイスのリセットや
# 再列挙 (ポート名変更) で切断されても、期限まで再接続し続ける。

seconds = float(sys.argv[1])
fixed_port = sys.argv[2] if len(sys.argv) > 2 else None


def find_port():
    if fixed_port:
        return fixed_port if os.path.exists(fixed_port) else None
    ports = sorted(glob.glob("/dev/cu.usbmodem*"))
    return ports[0] if len(ports) == 1 else None


def open_port(port):
    fd = os.open(port, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
    attrs = termios.tcgetattr(fd)
    attrs[0] = 0                      # iflag
    attrs[1] = 0                      # oflag
    attrs[2] = termios.CREAD | termios.CLOCAL | termios.CS8  # cflag
    attrs[3] = 0                      # lflag
    attrs[4] = termios.B115200        # ispeed
    attrs[5] = termios.B115200        # ospeed
    termios.tcsetattr(fd, termios.TCSANOW, attrs)
    return fd


deadline = time.time() + seconds
fd = None
while time.time() < deadline:
    if fd is None:
        port = find_port()
        if port is None:
            time.sleep(0.5)
            continue
        try:
            fd = open_port(port)
            sys.stderr.write("connected: " + port + "\n")
        except OSError:
            fd = None
            time.sleep(0.5)
            continue
    try:
        chunk = os.read(fd, 4096)
        if chunk:
            sys.stdout.write(chunk.decode("utf-8", errors="replace"))
            sys.stdout.flush()
        else:
            time.sleep(0.02)
    except BlockingIOError:
        time.sleep(0.02)
    except OSError:
        sys.stderr.write("disconnected, retrying\n")
        try:
            os.close(fd)
        except OSError:
            pass
        fd = None
        time.sleep(0.5)
if fd is not None:
    os.close(fd)
