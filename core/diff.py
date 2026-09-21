"""
Changeset between two sandbox images.

This is the component whose feasibility was uncertain, so it is the one you build
and prove FIRST (see scripts/smoke.py). Everything downstream is ordinary
engineering; this is the part that decides whether the project is real.

Cost note: list_files and read_file are documented as not requiring a VM boot,
which is the only reason a gate can afford to sit in front of every write. If
your SDK version does boot for these, lower DIFF_MAX_FILES and DIFF_MAX_BYTES.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field, asdict

from core.sandbox import Sandbox

# Guards so a pathological image cannot stall a demo.
DIFF_ROOTS = ["/workspace", "/logs", "/app", "/data", "/etc", "/srv", "/opt"]
DIFF_MAX_FILES = 4000
DIFF_MAX_BYTES = 262_144   # per file, for content comparison
DIFF_MAX_READS = 400       # files hashed to detect modification


@dataclass
class Changeset:
    added: list[str] = field(default_factory=list)
    removed: list[str] = field(default_factory=list)
    modified: list[str] = field(default_factory=list)
    truncated: bool = False
    roots: list[str] = field(default_factory=list)

    @property
    def empty(self) -> bool:
        return not (self.added or self.removed or self.modified)

    @property
    def total(self) -> int:
        return len(self.added) + len(self.removed) + len(self.modified)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["total"] = self.total
        return d

    def summary(self, limit: int = 40) -> str:
        if self.empty:
            return "no filesystem changes"
        lines = []
        for label, items in (("removed", self.removed), ("added", self.added), ("modified", self.modified)):
            if not items:
                continue
            head = items[:limit]
            lines.append(f"{len(items)} {label}:")
            lines.extend(f"  {label[0].upper()} {p}" for p in head)
            if len(items) > limit:
                lines.append(f"  … and {len(items) - limit} more")
        if self.truncated:
            lines.append("(listing truncated by DIFF_MAX_FILES)")
        return "\n".join(lines)


def _tree(sb: Sandbox, image_id: str, roots: list[str]) -> tuple[set[str], bool]:
    seen: set[str] = set()
    truncated = False
    for root in roots:
        try:
            files = sb.list_files(image_id, root)
        except Exception:  # noqa: BLE001 — a root that does not exist is not an error
            continue
        for p in files:
            if len(seen) >= DIFF_MAX_FILES:
                truncated = True
                break
            seen.add(p)
        if truncated:
            break
    return seen, truncated


def _digest(sb: Sandbox, image_id: str, path: str) -> str:
    try:
        data = sb.read_file(image_id, path)[:DIFF_MAX_BYTES]
    except Exception:  # noqa: BLE001
        return "?"
    return hashlib.sha256(data).hexdigest()


def compute(sb: Sandbox, parent_image: str, child_image: str, roots: list[str] | None = None) -> Changeset:
    """Diff two images. Pure read — neither image is modified."""
    roots = roots or DIFF_ROOTS
    before, t1 = _tree(sb, parent_image, roots)
    after, t2 = _tree(sb, child_image, roots)

    cs = Changeset(
        added=sorted(after - before),
        removed=sorted(before - after),
        truncated=t1 or t2,
        roots=roots,
    )

    common = sorted(before & after)
    for path in common[:DIFF_MAX_READS]:
        if _digest(sb, parent_image, path) != _digest(sb, child_image, path):
            cs.modified.append(path)
    if len(common) > DIFF_MAX_READS:
        cs.truncated = True
    return cs
