from django.urls import path, include

from .views import InvitationViewSet, GuestAPIVIEW
from rest_framework_nested import routers

router = routers.DefaultRouter()
router.register('invitations', InvitationViewSet, basename='invitation')

urlpatterns = [
    path(r'main/', include(router.urls)),
    path('guest-count/', GuestAPIVIEW.as_view(), name='guest-count'),

]
