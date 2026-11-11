from django.contrib import admin

from .models import (
    MemberInvite,
    Membership,
    UsageRecord,
    Workspace,
    WorkspaceCredential,
)


class UnscopedAdmin(admin.ModelAdmin):
    """For tenant-owned models: the Django admin is platform-only tooling."""

    def get_queryset(self, request):
        return self.model.objects.all_workspaces()


@admin.register(Workspace)
class WorkspaceAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "status", "default_country", "created_at")
    search_fields = ("name", "slug")


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = ("user", "workspace", "role", "is_active")
    list_filter = ("role", "is_active")


admin.site.register(WorkspaceCredential)
admin.site.register(UsageRecord)
admin.site.register(MemberInvite)
