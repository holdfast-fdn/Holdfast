"""
Minimal pure-Python secp256k1 ADDRESS DERIVATION (no signing, no security
claims — correctness only). Used by the parity generators to know which
Ethereum address a Foundry test's vm.addr(privateKey) will produce, because
attacker addresses feed the per-contest keccak word.

Verified against `cast wallet address` (see self-test).
"""

from __future__ import annotations

from keccak_tiny import keccak256

_P = 2**256 - 2**32 - 977
_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
_G = (
    0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798,
    0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8,
)


def _inv(a: int) -> int:
    return pow(a, _P - 2, _P)


def _add(p, q):
    if p is None:
        return q
    if q is None:
        return p
    (px, py), (qx, qy) = p, q
    if px == qx and (py + qy) % _P == 0:
        return None
    if p == q:
        lam = (3 * px * px) * _inv(2 * py) % _P
    else:
        lam = (qy - py) * _inv(qx - px) % _P
    rx = (lam * lam - px - qx) % _P
    ry = (lam * (px - rx) - py) % _P
    return rx, ry


def _mul(k: int, point):
    result = None
    addend = point
    while k:
        if k & 1:
            result = _add(result, addend)
        addend = _add(addend, addend)
        k >>= 1
    return result


def address_of(private_key: int) -> int:
    """Ethereum address (as int) for a private key — matches vm.addr()."""
    assert 0 < private_key < _N, "invalid private key"
    x, y = _mul(private_key, _G)
    pub = x.to_bytes(32, "big") + y.to_bytes(32, "big")
    return int.from_bytes(keccak256(pub)[12:], "big")


if __name__ == "__main__":
    # ground truth: cast wallet address --private-key 0x...01 etc.
    assert address_of(1) == 0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf
    assert address_of(2) == 0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF
    assert address_of(0xA11CE) == address_of(0xA11CE)  # determinism
    print("secp256k1 address derivation self-test passed")
    print(f"addr(0xA11CE) = 0x{address_of(0xA11CE):040x}")
    print(f"addr(0xB0B)   = 0x{address_of(0xB0B):040x}")
