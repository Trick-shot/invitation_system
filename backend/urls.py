from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.accounts.views import MemberViewSet
from apps.billing.views import EventBillView, WorkspaceBillingView
from apps.events.views import EventViewSet
from apps.invitations.views import InvitationViewSet, PublicInvitationView
from apps.messaging.views import DeliveryReportView
from apps.scanning.views import ScanEventsView, ScanLogViewSet, ScanSearchView, ScanView
from apps.tenancy.platform_views import EarningsView, PlatformEventBillView, PlatformSettingsView, PlatformWorkspaceViewSet, RepriceOpenBillsView, SmsRatesView
from apps.tenancy.settings_views import (
    WorkspaceActivityView,
    WorkspaceCredentialView,
    WorkspaceExportView,
    WorkspaceSettingsView,
)

platform = DefaultRouter()
platform.register("workspaces", PlatformWorkspaceViewSet, basename="platform-workspace")

ws = DefaultRouter()
ws.register("events", EventViewSet, basename="event")
ws.register("members", MemberViewSet, basename="member")

event_children = DefaultRouter()
event_children.register("invitations", InvitationViewSet, basename="invitation")
event_children.register("scans", ScanLogViewSet, basename="scanlog")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("apps.accounts.urls")),
    path("api/platform/earnings/", EarningsView.as_view(), name="platform-earnings"),
    path("api/platform/rates/", SmsRatesView.as_view(), name="platform-rates"),
    path("api/platform/rates/reprice/", RepriceOpenBillsView.as_view(), name="platform-reprice"),
    path("api/platform/settings/", PlatformSettingsView.as_view(), name="platform-settings"),
    path("api/platform/events/<int:pk>/bill/", PlatformEventBillView.as_view(), name="platform-event-bill"),
    path("api/platform/", include(platform.urls)),
    path("api/workspaces/<slug:workspace_slug>/", include(ws.urls)),
    path("api/workspaces/<slug:workspace_slug>/events/<int:event_pk>/", include(event_children.urls)),
    path("api/workspaces/<slug:workspace_slug>/settings/", WorkspaceSettingsView.as_view(), name="workspace-settings"),
    path("api/workspaces/<slug:workspace_slug>/settings/credentials/", WorkspaceCredentialView.as_view(), name="workspace-credentials"),
    path("api/workspaces/<slug:workspace_slug>/export/", WorkspaceExportView.as_view(), name="workspace-export"),
    path("api/workspaces/<slug:workspace_slug>/activity/", WorkspaceActivityView.as_view(), name="workspace-activity"),
    path("api/workspaces/<slug:workspace_slug>/billing/", WorkspaceBillingView.as_view(), name="workspace-billing"),
    path("api/workspaces/<slug:workspace_slug>/events/<int:event_pk>/bill/", EventBillView.as_view(), name="event-bill"),
    path("api/i/<str:token>/", PublicInvitationView.as_view(), name="public-invitation"),
    path("api/scan/", ScanView.as_view(), name="scan"),
    path("api/scan/events/", ScanEventsView.as_view(), name="scan-events"),
    path("api/scan/search/", ScanSearchView.as_view(), name="scan-search"),
    path("api/webhooks/delivery/", DeliveryReportView.as_view(), name="delivery-webhook"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
