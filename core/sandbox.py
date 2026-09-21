"""
Adapter over Nebius Token Factory Sandboxes (ConTree).

=============================== ADAPTER SURFACE ===============================
Blast Radius needs exactly four operations. If the SDK's names have moved since
this was written, THIS IS THE ONLY FILE YOU CHANGE. Run `python probe_sdk.py`
first — it prints the real method signatures — then fix the four methods below.

    create_root()                 -> image_id
    exec(image_id, cmd)           -> ExecResult(image_id=NEW image, stdout, exit_code)
    list_files(image_id, path)    -> list[str]   (no VM boot)
    read_file(image_id, path)     -> bytes       (no VM boot)

Semantics that the rest of the codebase depends on and that you must preserve:

  * exec() is PURE with respect to its input image. It must never mutate
    `image_id`. It returns a NEW image id containing the result. This is what
    makes a fork a real counterfactual instead of a snapshot.

  * list_files()/read_file() should not boot a VM. If in your SDK version they
    do, everything still works — it just costs latency. Lower DIFF_MAX_FILES in
    core/diff.py if diffing becomes slow.

  * Forking is implicit: two exec() calls against the same parent image_id
    produce two independent children. There is no separate fork() call.
===============================================================================
"""
from __future__ import annotations

from dataclasses import dataclass

from core.config import CONFIG


class SandboxAdapterError(RuntimeError):
    """The SDK surface does not match this adapter. Run probe_sdk.py."""


@dataclass
class ExecResult:
    image_id: str        # NEW image containing the effects of the command
    stdout: str
    stderr: str
    exit_code: int

    @property
    def ok(self) -> bool:
        return self.exit_code == 0

    def as_tool_output(self, limit: int = 4000) -> str:
        body = self.stdout or ""
        if self.stderr:
            body += ("\n[stderr]\n" + self.stderr)
        body = body.strip() or "(no output)"
        if len(body) > limit:
            body = body[:limit] + f"\n… truncated, {len(body) - limit} more chars"
        return f"exit={self.exit_code}\n{body}"


def _first_attr(obj, *names):
    for n in names:
        if hasattr(obj, n):
            return getattr(obj, n)
    return None


def _image_id_of(obj) -> str:
    """Pull an image identifier off whatever the SDK handed back."""
    if isinstance(obj, str):
        return obj
    for n in ("image_id", "id", "directory_state_id", "state_id", "uuid"):
        v = getattr(obj, n, None)
        if isinstance(v, str) and v:
            return v
    img = getattr(obj, "image", None)
    if img is not None and img is not obj:
        return _image_id_of(img)
    raise SandboxAdapterError(
        f"Could not find an image id on {type(obj)!r}. Run `python probe_sdk.py`, "
        "find the attribute that holds the image/state id, and add its name to "
        "_image_id_of() in core/sandbox.py."
    )


class Sandbox:
    """Thin, stateless wrapper. One instance per process is fine."""

    def __init__(self, token: str | None = None, base_image: str | None = None):
        try:
            import contree
        except ImportError as exc:
            raise SandboxAdapterError(
                "contree-sdk is not installed. `pip install contree-sdk`. If that "
                "package name is wrong, check "
                "https://docs.tokenfactory.nebius.com/sandboxes/overview"
            ) from exc

        client_cls = _first_attr(contree, "ContreeSync", "Contree", "Client", "ContreeClient")
        if client_cls is None:
            raise SandboxAdapterError(
                "No client class found on the contree module. Run probe_sdk.py."
            )
        self.ct = client_cls(token=token or CONFIG.nebius_api_key)
        self.base_image = base_image or CONFIG.base_image

    # ---------------------------------------------------------------- 1. root
    def create_root(self) -> str:
        try:
            img = self.ct.images.use(self.base_image)
        except AttributeError as exc:
            raise SandboxAdapterError(
                "client.images.use(<oci-ref>) not found. Run probe_sdk.py and fix "
                "Sandbox.create_root()."
            ) from exc
        return _image_id_of(img)

    def _image(self, image_id: str):
        getter = _first_attr(self.ct.images, "get", "use", "from_id")
        if getter is None:
            raise SandboxAdapterError("No way to fetch an image by id. Run probe_sdk.py.")
        return getter(image_id)

    # ---------------------------------------------------------------- 2. exec
    def exec(self, image_id: str, cmd: str, timeout: int = 180) -> ExecResult:
        """Run `cmd` against `image_id`. Returns a NEW image; parent untouched."""
        img = self._image(image_id)
        try:
            with img.session() as s:
                res = s.run(shell=cmd)
                if hasattr(res, "wait"):
                    res = res.wait()
                new_id = None
                for n in ("image_id", "id", "directory_state_id", "state_id"):
                    v = getattr(s, n, None)
                    if isinstance(v, str) and v and v != image_id:
                        new_id = v
                        break
                if new_id is None:
                    new_id = _image_id_of(res)
                return ExecResult(
                    image_id=new_id,
                    stdout=str(getattr(res, "stdout", "") or ""),
                    stderr=str(getattr(res, "stderr", "") or ""),
                    exit_code=int(getattr(res, "exit_code", getattr(res, "returncode", 0)) or 0),
                )
        except SandboxAdapterError:
            raise
        except AttributeError as exc:
            raise SandboxAdapterError(
                f"image.session().run(shell=...) surface mismatch: {exc}. Run probe_sdk.py "
                "and fix Sandbox.exec()."
            ) from exc

    # ----------------------------------------------------------- 3. list_files
    def list_files(self, image_id: str, path: str = "/") -> list[str]:
        """Recursive file listing under `path`. Should not boot a VM."""
        img = self._image(image_id)
        lister = _first_attr(img, "ls", "list_files", "listdir")
        if lister is not None:
            try:
                out = lister(path)
                return sorted(_flatten_paths(out, path))
            except TypeError:
                out = lister(path=path)
                return sorted(_flatten_paths(out, path))
            except Exception:  # noqa: BLE001 - fall through to exec-based listing
                pass
        # Fallback: correct, just slower. Uses a boot.
        res = self.exec(image_id, f"find {_q(path)} -type f 2>/dev/null | sort")
        return [ln.strip() for ln in res.stdout.splitlines() if ln.strip()]

    # ------------------------------------------------------------ 4. read_file
    def read_file(self, image_id: str, path: str) -> bytes:
        img = self._image(image_id)
        reader = _first_attr(img, "read", "read_file", "cat")
        if reader is not None:
            try:
                out = reader(path)
                if isinstance(out, bytes):
                    return out
                if isinstance(out, str):
                    return out.encode("utf-8", "replace")
                data = getattr(out, "content", None) or getattr(out, "data", None)
                if isinstance(data, bytes):
                    return data
                if isinstance(data, str):
                    return data.encode("utf-8", "replace")
            except Exception:  # noqa: BLE001
                pass
        res = self.exec(image_id, f"cat {_q(path)} 2>/dev/null | head -c 200000")
        return res.stdout.encode("utf-8", "replace")


def _flatten_paths(out, base: str) -> list[str]:
    """SDK listings may be strings, dicts, or objects. Normalise to paths."""
    result: list[str] = []
    if out is None:
        return result
    if isinstance(out, (str, bytes)):
        text = out.decode() if isinstance(out, bytes) else out
        return [ln.strip() for ln in text.splitlines() if ln.strip()]
    for item in out:
        if isinstance(item, str):
            result.append(item if item.startswith("/") else f"{base.rstrip('/')}/{item}")
        elif isinstance(item, dict):
            p = item.get("path") or item.get("name")
            if p:
                result.append(p if str(p).startswith("/") else f"{base.rstrip('/')}/{p}")
        else:
            p = getattr(item, "path", None) or getattr(item, "name", None)
            if p:
                result.append(p if str(p).startswith("/") else f"{base.rstrip('/')}/{p}")
    return result


def _q(path: str) -> str:
    return "'" + str(path).replace("'", "'\\''") + "'"
