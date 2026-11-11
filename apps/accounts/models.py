from django.contrib.auth.base_user import BaseUserManager
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create(self, email, password, **extra):
        if not email:
            raise ValueError("Email is required")
        user = self.model(email=self.normalize_email(email), **extra)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra):
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create(email, password, **extra)

    def create_superuser(self, email, password, **extra):
        extra.update(is_staff=True, is_superuser=True, is_platform_owner=True)
        return self._create(email, password, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    """
    Email login. No role field on purpose: roles live on Membership so one
    person can be an admin in one workspace and door staff in another.
    """

    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=120, blank=True)
    phone = models.CharField(max_length=20, blank=True, help_text="E.164, used for SMS invites to staff")
    is_platform_owner = models.BooleanField(default=False, help_text="Can create workspaces. Cannot read their guest data.")
    is_staff = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    date_joined = models.DateTimeField(auto_now_add=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    def __str__(self):
        return self.full_name or self.email

    @property
    def initials(self):
        parts = [p for p in self.full_name.split() if p]
        return "".join(p[0] for p in parts[:2]).upper() or self.email[:2].upper()
