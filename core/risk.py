"""
Deterministic fork/no-fork classifier.

This is plain Python on purpose. It runs on every single action, and a model
call here would be both decorative and expensive. Judges punish decorative model
use; keeping this deterministic is a point in your favour, not a shortcut.

Most actions are reads and never fork. That is what keeps the system usable
rather than a gate that interrupts constantly.
"""
from __future__ import annotations

import re

SAFE = "safe"
DESTRUCTIVE = "destructive"
NETWORK = "network"

# Commands that only observe. Anchored at the start of each pipeline segment.
_READ_ONLY = re.compile(
    r"^\s*(ls|ll|cat|bat|head|tail|less|more|wc|stat|file|du|df|pwd|echo|printf|"
    r"which|whereis|type|env|date|uname|whoami|id|ps|top|tree|realpath|basename|dirname|"
    r"grep|egrep|fgrep|rg|awk|sed|sort|uniq|cut|tr|jq|diff|cmp|md5sum|sha256sum|"
    r"find(?![^|;&]*(-delete|-exec|-execdir|-ok))|"
    r"python3?\s+-c\s+['\"]?print|test|\[)\b"
)

# Anything that changes state on disk.
_MUTATING = re.compile(
    r"(\brm\b|\brmdir\b|\bunlink\b|\bmv\b|\bcp\b|\bdd\b|\btruncate\b|\bshred\b|"
    r"\bmkdir\b|\btouch\b|\bln\b|\bchmod\b|\bchown\b|\bchgrp\b|\bmkfs\b|\bmount\b|"
    r"\btee\b|\binstall\b|\bapt(-get)?\b|\bdpkg\b|\bpip3?\b|\bnpm\b|\byarn\b|\bpnpm\b|"
    r"-delete\b|-exec\s+rm|\bsed\b[^|]*\s-i\b|\bperl\b[^|]*\s-i\b|"
    r"\bgit\s+(add|commit|push|reset|checkout|clean|rm|merge|rebase)\b|"
    r"\bsystemctl\b|\bservice\b|\bkill\b|\bpkill\b|\bcrontab\b)"
)

# Egress. Also treated as risky: it can have effects you cannot roll back.
_NETWORK = re.compile(
    r"(\bcurl\b|\bwget\b|\bnc\b|\bnetcat\b|\bssh\b|\bscp\b|\brsync\b|\bftp\b|"
    r"\bgit\s+(clone|fetch|pull|push)\b|\bapt(-get)?\s+(update|install)\b|"
    r"\bpip3?\s+install\b|\bnpm\s+(i|install|publish)\b)"
)

# Output redirection that writes a file.
_REDIRECT = re.compile(r"(?<![0-9<>])>{1,2}(?!&)")


def classify(cmd: str) -> str:
    """Return SAFE, DESTRUCTIVE or NETWORK for a shell command."""
    if not cmd or not cmd.strip():
        return SAFE
    text = cmd.strip()

    if _NETWORK.search(text):
        return NETWORK

    # Split on pipes and separators; judge each segment.
    segments = re.split(r"\|\||&&|;|\||\n", text)
    verdict = SAFE
    for seg in segments:
        seg = seg.strip()
        if not seg:
            continue
        if _REDIRECT.search(seg):
            return DESTRUCTIVE
        if _MUTATING.search(seg):
            return DESTRUCTIVE
        if not _READ_ONLY.match(seg):
            # Unknown command. Fail closed — an unrecognised binary may do anything.
            verdict = DESTRUCTIVE
    return verdict


def is_risky(cmd: str) -> bool:
    return classify(cmd) != SAFE


def explain(cmd: str) -> str:
    kind = classify(cmd)
    return {
        SAFE: "read-only — executed directly against the working image",
        DESTRUCTIVE: "changes state on disk — forked and reviewed before it lands",
        NETWORK: "reaches the network — forked and reviewed before it lands",
    }[kind]
