# Independent re-implementation of the Android plugin's wire format (Java DataOutputStream), used to
# prove the Windows sync talks to the phones. Usage: java_peer.py client PORT CMD [BODY]  |  server PORT TAG SNAPSHOT
import socket, struct, sys, threading

def client(port, cmd, body=b''):
    s = socket.create_connection(('127.0.0.1', port), timeout=5)
    c = cmd.encode()
    s.sendall(struct.pack('>H', len(c)) + c + struct.pack('>i', len(body)) + body)   # writeUTF + writeInt + write
    def rd(n):
        b = b''
        while len(b) < n:
            x = s.recv(n - len(b))
            if not x: raise IOError('closed')
            b += x
        return b
    status = struct.unpack('>i', rd(4))[0]; ln = struct.unpack('>i', rd(4))[0]
    return status, rd(ln)

def server(port, tag, snap, ready):
    srv = socket.socket(); srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(('127.0.0.1', port)); srv.listen(5); ready.set()
    got = []
    srv.settimeout(10)
    while True:
        try: c, _ = srv.accept()
        except Exception: break
        def rd(n):
            b = b''
            while len(b) < n: b += c.recv(n - len(b))
            return b
        cl = struct.unpack('>H', rd(2))[0]; cmd = rd(cl).decode()
        ln = struct.unpack('>i', rd(4))[0]; body = rd(ln)
        reply = tag if cmd == 'HELLO' else snap if cmd == 'GET' else b'ok' if cmd == 'PUSH' else b''
        if cmd == 'PUSH': got.append(body)
        c.sendall(struct.pack('>i', 200) + struct.pack('>i', len(reply)) + reply); c.close()
        if cmd == 'PUSH': break
    return got

if __name__ == '__main__':
    if sys.argv[1] == 'client':
        st, b = client(int(sys.argv[2]), sys.argv[3], sys.argv[4].encode() if len(sys.argv) > 4 else b'')
        print(st, b.decode())
    else:
        ev = threading.Event()
        res = []
        t = threading.Thread(target=lambda: res.extend(server(int(sys.argv[2]), sys.argv[3].encode(), sys.argv[4].encode(), ev)))
        t.start(); ev.wait(); print('READY', flush=True); t.join(); print('PUSHED', b''.join(res).decode(), flush=True)
