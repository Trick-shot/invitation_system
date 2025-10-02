from django.urls import path, include

from . import views
from rest_framework_nested import routers

router = routers.DefaultRouter()
router.register('invitations', views.InvitationViewSet, basename='invitation')

urlpatterns = [
    path(r'', include(router.urls)),
]
