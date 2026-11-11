from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import InviteView, MeView, ThrottledTokenView

urlpatterns = [
    path("auth/token/", ThrottledTokenView.as_view(), name="token"),
    path("auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("me/", MeView.as_view(), name="me"),
    path("invites/<uuid:token>/", InviteView.as_view(), name="invite"),
]
