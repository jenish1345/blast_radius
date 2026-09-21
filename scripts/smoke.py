"""
HOUR-ZERO GATE. Run this second, right after probe_sdk.py.

    python scripts/smoke.py

It proves the one thing the entire project depends on: that you can fork a
sandbox image, mutate the fork, and see the difference — without the parent
changing. If this prints a file list, the architecture is real and you build.
If it does not, stop and fix core/sandbox.py before writing anything else.

This is deliberately the first thing that runs. Everything downstream is
ordinary engineering; this is the only part whose feasibility was uncertain.
"""
from __future__ import annotations

import sys
import time

sys.path.insert(0, ".")

from core import diff as diffmod          # noqa: E402
from core.llm import Budget, list_models  # noqa: E402
from core.sandbox import Sandbox          # noqa: E402


def main() -> int:
    print("=" * 66)
    print("BLAST RADIUS — hour-zero smoke test")
    print("=" * 66)

    # ---------------------------------------------------------------- models
    print("\n[1/4] Models your account can actually call")
    try:
        ids = list_models()
        nv = [m for m in ids if "nemotron" in m.lower() or "nvidia" in m.lower()]
        for m in (nv or ids)[:25]:
            print("      ", m)
        if not nv:
            print("      !! No NVIDIA models listed. The hackathon requires at least one.")
            print("         Check your Token Factory account and update BR_MODEL_* in .env.")
    except Exception as exc:  # noqa: BLE001
        print(f"      !! could not list models: {exc}")
        print("         Check NEBIUS_API_KEY and BR_BASE_URL in .env.")
        return 1

    # --------------------------------------------------------------- sandbox
    print("\n[2/4] Creating a root sandbox image")
    t0 = time.time()
    sb = Sandbox()
    root = sb.create_root()
    print(f"       root image: {root}   ({time.time()-t0:.1f}s)")

    print("\n[3/4] Seeding real files, then forking and deleting in the FORK only")
    seed = (
        "mkdir -p /logs && "
        "for i in 1 2 3 4 5; do echo old > /logs/old-$i.log; touch -d '60 days ago' /logs/old-$i.log; done && "
        "echo live > /logs/today.log && ls /logs"
    )
    t0 = time.time()
    parent = sb.exec(root, seed)
    print(f"       parent image: {parent.image_id}   exit={parent.exit_code}   ({time.time()-t0:.1f}s)")
    print("       files:", parent.stdout.strip().replace("\n", " "))

    t0 = time.time()
    fork = sb.exec(parent.image_id, "find /logs -name '*.log' -delete && echo deleted")
    print(f"       fork image:   {fork.image_id}   exit={fork.exit_code}   ({time.time()-t0:.1f}s)")

    if fork.image_id == parent.image_id:
        print("\n  !! FAIL: exec() returned the same image id. It must return a NEW image.")
        print("     Fix Sandbox.exec() in core/sandbox.py — see the ADAPTER SURFACE block.")
        return 1

    # ------------------------------------------------------------------ diff
    print("\n[4/4] Diffing fork against parent")
    t0 = time.time()
    cs = diffmod.compute(sb, parent.image_id, fork.image_id, roots=["/logs"])
    dt = time.time() - t0
    print(f"       computed in {dt:.2f}s")
    print("       " + cs.summary().replace("\n", "\n       "))

    print("\n" + "=" * 66)
    if cs.removed:
        print("PASS — forking, mutation isolation and diffing all work.")
        print("The architecture is proven. Build it.")
        if dt > 8:
            print(f"\nNote: the diff took {dt:.1f}s, which suggests list_files/read_file are")
            print("booting a VM. Everything still works; lower DIFF_MAX_FILES in core/diff.py")
            print("if the gate feels sluggish during the demo.")
        return 0

    print("FAIL — the diff found no removals, but the fork deleted files.")
    print("Most likely list_files() is not reading the image you passed it.")
    print("Run `python probe_sdk.py` and fix Sandbox.list_files() in core/sandbox.py.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
