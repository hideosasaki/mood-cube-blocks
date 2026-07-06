import os
import sys
import termios
import time

port = sys.argv[1]
seconds = float(sys.argv[2])

fd = os.open(port, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
attrs = termios.tcgetattr(fd)
attrs[0] = 0                      # iflag
attrs[1] = 0                      # oflag
attrs[2] = termios.CREAD | termios.CLOCAL | termios.CS8  # cflag
attrs[3] = 0                      # lflag
attrs[4] = termios.B115200        # ispeed
attrs[5] = termios.B115200        # ospeed
termios.tcsetattr(fd, termios.TCSANOW, attrs)

deadline = time.time() + seconds
while time.time() < deadline:
    try:
        chunk = os.read(fd, 4096)
        if chunk:
            sys.stdout.write(chunk.decode("utf-8", errors="replace"))
            sys.stdout.flush()
    except BlockingIOError:
        time.sleep(0.02)
os.close(fd)
