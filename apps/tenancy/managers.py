from django.db import models

from .context import WorkspaceContextRequired, get_current_workspace


class WorkspaceQuerySet(models.QuerySet):
    def for_workspace(self, workspace):
        return super().filter(workspace=workspace)


class WorkspaceManager(models.Manager.from_queryset(WorkspaceQuerySet)):
    """
    Default manager for every tenant-owned model. Filters by the current
    workspace. With no workspace in context it raises, because a query that
    could return every tenant's rows must never run by accident.
    """

    def get_queryset(self):
        qs = super().get_queryset()
        workspace = get_current_workspace()
        if workspace is None:
            raise WorkspaceContextRequired(
                f"{self.model.__name__} queried without a workspace in context. Use .all_workspaces() if you really mean every tenant."
            )
        return qs.filter(workspace=workspace)

    def all_workspaces(self):
        """
        Explicit, greppable escape hatch. Any call site that uses this is a
        place a reviewer should look at twice.
        """
        return super().get_queryset()

    def for_workspace(self, workspace):
        return super().get_queryset().filter(workspace=workspace)
