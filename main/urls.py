from django.urls import path, include

from .views import InvitationViewSet
from rest_framework_nested import routers

router = routers.DefaultRouter()
router.register('invitations', InvitationViewSet, basename='invitation')

urlpatterns = [
    path(r'', include(router.urls)),
]
