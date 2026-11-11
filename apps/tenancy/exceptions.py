from django.http import Http404
from rest_framework.views import exception_handler as drf_handler

from .context import WorkspaceContextRequired


def exception_handler(exc, context):
    # A missing workspace context is a programming error, but to the client it
    # must look like "not found": never confirm that something exists elsewhere.
    if isinstance(exc, WorkspaceContextRequired):
        exc = Http404()
    return drf_handler(exc, context)
