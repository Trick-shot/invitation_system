"""
Django settings for the invitation platform.

Everything secret or environment-specific comes from the environment
(python-decouple reads a .env file in development). Nothing here should
need editing between a laptop and the production server.
"""

from datetime import timedelta
from pathlib import Path

from decouple import Csv, config

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = config("SECRET_KEY")
DEBUG = config("DEBUG", default=False, cast=bool)
ALLOWED_HOSTS = config("ALLOWED_HOSTS", default="localhost,127.0.0.1", cast=Csv())
SITE_URL = config("SITE_URL", default="http://localhost:8000")

# Symmetric key for workspace messaging credentials at rest. Generate with
# `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
FIELD_ENCRYPTION_KEY = config("FIELD_ENCRYPTION_KEY", default="")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt",
    "django_q",
    "apps.accounts",
    "apps.tenancy",
    "apps.events",
    "apps.invitations",
    "apps.scanning",
    "apps.messaging",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "backend.urls"
WSGI_APPLICATION = "backend.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# Database: MySQL when MYSQL_NAME is set, SQLite otherwise (dev and tests).
if config("MYSQL_NAME", default=""):
    import pymysql

    pymysql.install_as_MySQLdb()
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.mysql",
            "NAME": config("MYSQL_NAME"),
            "USER": config("MYSQL_USER"),
            "PASSWORD": config("MYSQL_PASSWORD"),
            "HOST": config("MYSQL_HOST", default="127.0.0.1"),
            "PORT": config("MYSQL_PORT", default="3306"),
            "OPTIONS": {"charset": "utf8mb4"},
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
]

LANGUAGE_CODE = "en"
TIME_ZONE = "Africa/Dar_es_Salaam"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = config("MEDIA_ROOT", default=str(BASE_DIR / "media"))
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ("rest_framework_simplejwt.authentication.JWTAuthentication",),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
    "DEFAULT_THROTTLE_RATES": {
        "scan": config("THROTTLE_SCAN", default="120/min"),
        "public_link": config("THROTTLE_PUBLIC_LINK", default="60/min"),
        "auth": config("THROTTLE_AUTH", default="10/min"),
    },
    "EXCEPTION_HANDLER": "apps.tenancy.exceptions.exception_handler",
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=12),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),
    "ROTATE_REFRESH_TOKENS": True,
}

CORS_ALLOWED_ORIGINS = config("CORS_ALLOWED_ORIGINS", default="http://localhost:5173", cast=Csv())

# Background jobs: DB-backed broker, no Redis to run.
Q_CLUSTER = {
    "name": "invitations",
    "workers": config("Q_WORKERS", default=2, cast=int),
    "timeout": 120,
    "retry": 180,
    "queue_limit": 50,
    "orm": "default",
    # How often the pusher polls the ORM broker. The 0.2s default keeps a core ~30% busy while idle.
    "poll": config("Q_POLL", default=1.0, cast=float),
    "sync": config("Q_SYNC", default=False, cast=bool),  # True in tests: run jobs inline
}

# Messaging. Platform-level Beem account used when a workspace has no credentials.
MESSAGING = {
    "DEFAULT_PROVIDER": config("MESSAGING_PROVIDER", default="console"),  # console | beem
    "BEEM_API_KEY": config("BEEM_API_KEY", default=""),
    "BEEM_SECRET_KEY": config("BEEM_SECRET_KEY", default=""),
    "BEEM_SENDER_ID": config("BEEM_SENDER_ID", default=""),  # must be an active sender name on the Beem account; "INFO" is retired
    "BEEM_SEND_URL": config("BEEM_SEND_URL", default="https://apisms.beem.africa/v1/send"),
}

# Email (set-password links, staff invites). Console backend by default; in production set
# EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend and the SMTP values below.
EMAIL_BACKEND = config("EMAIL_BACKEND", default="django.core.mail.backends.console.EmailBackend")
EMAIL_HOST = config("EMAIL_HOST", default="localhost")
EMAIL_PORT = config("EMAIL_PORT", default=587, cast=int)
EMAIL_HOST_USER = config("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = config("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS = config("EMAIL_USE_TLS", default=True, cast=bool)
EMAIL_USE_SSL = config("EMAIL_USE_SSL", default=False, cast=bool)
EMAIL_TIMEOUT = 15
DEFAULT_FROM_EMAIL = config("DEFAULT_FROM_EMAIL", default="Trickshot Invitations <hello@trickshot.tech>")
SERVER_EMAIL = DEFAULT_FROM_EMAIL

if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = config("SECURE_SSL_REDIRECT", default=True, cast=bool)
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": config("LOG_LEVEL", default="INFO")},
}
