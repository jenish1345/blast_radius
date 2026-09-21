"""
STEP 1 OF SETUP. Run this before you write or trust any other line of code.

    python probe_sdk.py

Why this exists
---------------
`core/sandbox.py` is an adapter over the Nebius Token Factory Sandboxes SDK
(ConTree). The four operations Blast Radius needs are:

    1. create a root image from an OCI base
    2. execute a shell command against an image and get back a NEW image id
    3. list files under a path in an image, WITHOUT booting a VM
    4. read a file's bytes from an image, WITHOUT booting a VM

Operations 3 and 4 not booting a VM is the entire reason this project is
affordable. If they turn out to require a boot, the design still works, it is
just slower — raise DIFF_MAX_FILES in core/diff.py and move on.

The SDK is in beta and its method names may have moved. This script prints the
real surface so you can correct `core/sandbox.py` in one place instead of
debugging it through five call sites. Paste this script's output into
Antigravity together with core/sandbox.py and ask it to reconcile the two.
"""
import inspect
import os
import sys

from dotenv import load_dotenv

load_dotenv()

KEY = os.getenv("NEBIUS_API_KEY")
if not KEY:
    sys.exit("NEBIUS_API_KEY is not set. Copy .env.example to .env and fill it in.")


def show(label, obj, depth=0):
    pad = "  " * depth
    print(f"\n{pad}=== {label} :: {type(obj)}")
    for name in sorted(n for n in dir(obj) if not n.startswith("_")):
        try:
            attr = getattr(obj, name)
        except Exception as exc:  # noqa: BLE001 - probing, anything may throw
            print(f"{pad}  {name}: <raised {exc.__class__.__name__}>")
            continue
        if callable(attr):
            try:
                sig = str(inspect.signature(attr))
            except (TypeError, ValueError):
                sig = "(?)"
            print(f"{pad}  {name}{sig}")
        else:
            print(f"{pad}  {name} = {attr!r}"[:160])


def main():
    try:
        import contree
    except ImportError:
        sys.exit(
            "contree-sdk is not installed.\n"
            "  pip install contree-sdk\n"
            "If that package name 404s, check https://docs.tokenfactory.nebius.com/sandboxes/overview "
            "for the current install command and update requirements.txt."
        )

    print("contree module file:", getattr(contree, "__file__", "?"))
    print("contree version:", getattr(contree, "__version__", "?"))
    show("contree module", contree)

    client_cls = None
    for candidate in ("ContreeSync", "Contree", "Client", "ContreeClient"):
        if hasattr(contree, candidate):
            client_cls = getattr(contree, candidate)
            print(f"\n>>> Using client class: {candidate}")
            break
    if client_cls is None:
        sys.exit("No recognisable client class on the contree module. Read the names printed above.")

    client = client_cls(token=KEY)
    show("client", client)

    if hasattr(client, "images"):
        show("client.images", client.images, depth=1)

        base = os.getenv("BR_BASE_IMAGE", "ubuntu:24.04")
        print(f"\n>>> Trying to obtain base image {base!r} ...")
        try:
            img = client.images.use(base)
            show("image object", img, depth=1)
            if hasattr(img, "session"):
                print("\n>>> Opening a session ...")
                with img.session() as s:
                    show("session", s, depth=2)
                    print("\n>>> Running a trivial command ...")
                    res = s.run(shell="echo blast-radius-probe && mkdir -p /probe && touch /probe/a")
                    if hasattr(res, "wait"):
                        res = res.wait()
                    show("run result", res, depth=2)
                    print("\n>>> Session attributes after a command (look for an image id):")
                    for n in ("image_id", "id", "image", "state_id", "directory_state_id"):
                        if hasattr(s, n):
                            print(f"    session.{n} = {getattr(s, n)!r}")
        except Exception as exc:  # noqa: BLE001
            print(f"\n!!! Probe failed at image/session stage: {exc.__class__.__name__}: {exc}")
            print("    This is expected if the method names moved. Use the listings above to fix core/sandbox.py.")

    print(
        "\n\nWHAT TO DO NEXT\n"
        "---------------\n"
        "Open core/sandbox.py. It has a block marked ADAPTER SURFACE with four\n"
        "methods. Make each one match what you see above. Then run:\n"
        "    python scripts/smoke.py\n"
        "If smoke.py prints a file list, the architecture is proven and you build.\n"
    )


if __name__ == "__main__":
    main()
