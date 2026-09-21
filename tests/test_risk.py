"""
Tests for the fork/no-fork classifier.

This is the only component that must be right without a model in the loop: if it
under-classifies, a destructive action reaches the working image ungated; if it
over-classifies, every read forks and the product becomes unusable.

    python -m pytest tests/ -q        (or just: python tests/test_risk.py)
"""
import sys

sys.path.insert(0, ".")

from core.risk import DESTRUCTIVE, NETWORK, SAFE, classify  # noqa: E402

CASES = [
    # read-only: must never fork
    ("ls -la /logs", SAFE),
    ("cat /etc/hosts", SAFE),
    ("grep -r foo /app", SAFE),
    ("find /logs -mtime +30", SAFE),
    ("find /logs -mtime +30 -type f", SAFE),
    ("ls /logs | wc -l", SAFE),
    ("sed s/a/b/ file", SAFE),
    ("stat /logs/a.log", SAFE),
    ("head -20 /app/config.yaml", SAFE),
    ("du -sh /logs", SAFE),
    # destructive: must fork
    ("find /logs -name '*.log' -delete", DESTRUCTIVE),
    ("find /logs -mtime +30 -exec rm {} ;", DESTRUCTIVE),
    ("rm -rf /data", DESTRUCTIVE),
    ("mv /a /b", DESTRUCTIVE),
    ("echo hi > /tmp/x", DESTRUCTIVE),
    ("echo hi >> /tmp/x", DESTRUCTIVE),
    ("sed -i s/a/b/ file", DESTRUCTIVE),
    ("mkdir -p /archive", DESTRUCTIVE),
    ("chmod 777 /app", DESTRUCTIVE),
    ("cat a.txt && rm b.txt", DESTRUCTIVE),   # compound: any risky segment wins
    ("./unknown-binary", DESTRUCTIVE),        # unknown commands fail closed
    ("git commit -m x", DESTRUCTIVE),
    # network: must fork, and is not rolled back by discarding a fork
    ("curl http://example.com", NETWORK),
    ("wget http://example.com/f", NETWORK),
    ("pip install requests", NETWORK),
    ("git clone https://github.com/x/y", NETWORK),
]


def test_all():
    failures = []
    for cmd, expected in CASES:
        got = classify(cmd)
        if got != expected:
            failures.append(f"  {cmd!r}: expected {expected}, got {got}")
    assert not failures, "classifier regressions:\n" + "\n".join(failures)


def test_fails_closed_on_empty_and_junk():
    assert classify("") == SAFE
    assert classify("   ") == SAFE
    assert classify("frobnicate --all") == DESTRUCTIVE


if __name__ == "__main__":
    test_all()
    test_fails_closed_on_empty_and_junk()
    print(f"all {len(CASES) + 3} risk-classifier cases pass")
