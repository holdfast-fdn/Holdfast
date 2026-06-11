"""
Minimal pure-Python keccak256 (Ethereum variant: pad suffix 0x01, NOT the
FIPS-202 sha3-256 0x06). Vendored so the sim stays stdlib-only — Python's
hashlib.sha3_256 is the finalized SHA-3 and produces DIFFERENT digests.

Adapted from the Keccak team's CompactFIPS202 reference implementation.
Verified against `cast keccak` (see sim test in settlement_fixed.py).
"""

from __future__ import annotations


def _rol64(a: int, n: int) -> int:
    n %= 64
    return ((a >> (64 - n)) | (a << n)) & 0xFFFFFFFFFFFFFFFF


def _keccak_f1600_on_lanes(lanes):
    r = 1
    for _ in range(24):
        # theta
        c = [lanes[x][0] ^ lanes[x][1] ^ lanes[x][2] ^ lanes[x][3] ^ lanes[x][4]
             for x in range(5)]
        d = [c[(x + 4) % 5] ^ _rol64(c[(x + 1) % 5], 1) for x in range(5)]
        lanes = [[lanes[x][y] ^ d[x] for y in range(5)] for x in range(5)]
        # rho and pi
        x, y = 1, 0
        current = lanes[x][y]
        for t in range(24):
            x, y = y, (2 * x + 3 * y) % 5
            current, lanes[x][y] = lanes[x][y], _rol64(
                current, (t + 1) * (t + 2) // 2)
        # chi
        for j in range(5):
            t = [lanes[i][j] for i in range(5)]
            for i in range(5):
                lanes[i][j] = t[i] ^ ((~t[(i + 1) % 5]) & t[(i + 2) % 5])
        # iota
        for j in range(7):
            r = ((r << 1) ^ ((r >> 7) * 0x71)) % 256
            if r & 2:
                lanes[0][0] ^= 1 << ((1 << j) - 1)
    return lanes


def _keccak_f1600(state: bytearray) -> bytearray:
    lanes = [[int.from_bytes(state[8 * (x + 5 * y):8 * (x + 5 * y) + 8],
                             "little") for y in range(5)] for x in range(5)]
    lanes = _keccak_f1600_on_lanes(lanes)
    out = bytearray(200)
    for x in range(5):
        for y in range(5):
            out[8 * (x + 5 * y):8 * (x + 5 * y) + 8] = \
                lanes[x][y].to_bytes(8, "little")
    return out


def keccak256(data: bytes) -> bytes:
    rate_bytes = 136  # (1600 - 2*256) / 8
    state = bytearray(200)
    block = 0
    offset = 0
    # absorb
    while offset < len(data):
        block = min(len(data) - offset, rate_bytes)
        for i in range(block):
            state[i] ^= data[offset + i]
        offset += block
        if block == rate_bytes:
            state = _keccak_f1600(state)
            block = 0
    # pad (multi-rate, Ethereum/original-Keccak suffix 0x01)
    state[block] ^= 0x01
    state[rate_bytes - 1] ^= 0x80
    state = _keccak_f1600(state)
    # squeeze (32 bytes < rate, single block)
    return bytes(state[:32])


if __name__ == "__main__":
    # known Keccak-256 vectors (Ethereum)
    assert keccak256(b"").hex() == (
        "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470")
    assert keccak256(b"abc").hex() == (
        "4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45")
    print("keccak256 self-test passed")
