"""
The "current workspace" for the running request or job.

A contextvar rather than a thread-local so it is safe under both threaded
and async execution. Set by WorkspaceScopedMixin for HTTP requests and by
`workspace_context()` inside background jobs. The scoped manager refuses to
return rows when nothing has set it, which is the behaviour that turns a
forgotten filter into a loud error instead of a silent data leak.
"""

from contextlib import contextmanager
from contextvars import ContextVar

_current_workspace: ContextVar = ContextVar("current_workspace", default=None)


class WorkspaceContextRequired(RuntimeError):
    """Raised when a tenant-scoped query runs with no workspace set."""


def get_current_workspace():
    return _current_workspace.get()


def set_current_workspace(workspace):
    return _current_workspace.set(workspace)


def reset_current_workspace(token):
    _current_workspace.reset(token)


@contextmanager
def workspace_context(workspace):
    token = set_current_workspace(workspace)
    try:
        yield workspace
    finally:
        reset_current_workspace(token)
