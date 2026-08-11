import os
from datetime import timedelta
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured


BASE_DIR = Path(__file__).resolve().parent.parent


def env_bool(name, default=False):
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def env_list(name, default=""):
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


def env_int(name, default, *, minimum=1, maximum=None):
    raw_value = os.getenv(name)
    try:
        value = int(raw_value) if raw_value is not None else default
    except ValueError as exc:
        raise ImproperlyConfigured(f"{name} must be an integer.") from exc

    if value < minimum or (maximum is not None and value > maximum):
        range_description = f"at least {minimum}"
        if maximum is not None:
            range_description = f"between {minimum} and {maximum}"
        raise ImproperlyConfigured(f"{name} must be {range_description}.")
    return value


def env_float(name, default, *, minimum=0.0, maximum=None):
    raw_value = os.getenv(name)
    try:
        value = float(raw_value) if raw_value is not None else default
    except ValueError as exc:
        raise ImproperlyConfigured(f"{name} must be a number.") from exc

    if value < minimum or (maximum is not None and value > maximum):
        range_description = f"at least {minimum}"
        if maximum is not None:
            range_description = f"between {minimum} and {maximum}"
        raise ImproperlyConfigured(f"{name} must be {range_description}.")
    return value


DEBUG = env_bool("DJANGO_DEBUG", False)
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "")

if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = "unsafe-development-key"
    else:
        raise ImproperlyConfigured("DJANGO_SECRET_KEY is required when DEBUG is false.")

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "axes",
    "rest_framework",
    "apps.accounts",
    "apps.chat",
    "apps.knowledge",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "axes.middleware.AxesMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    }
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("POSTGRES_DB", "ai_chatbot"),
        "USER": os.getenv("POSTGRES_USER", "ai_chatbot"),
        "PASSWORD": os.getenv("POSTGRES_PASSWORD", ""),
        "HOST": os.getenv("POSTGRES_HOST", "db"),
        "PORT": os.getenv("POSTGRES_PORT", "5432"),
        "CONN_MAX_AGE": 60,
    }
}

AUTH_USER_MODEL = "accounts.User"

AUTHENTICATION_BACKENDS = [
    "axes.backends.AxesStandaloneBackend",
    "django.contrib.auth.backends.ModelBackend",
]

AXES_FAILURE_LIMIT = 5
AXES_COOLOFF_TIME = timedelta(minutes=15)
AXES_LOCKOUT_PARAMETERS = [["username", "ip_address"]]
AXES_RESET_ON_SUCCESS = True
AXES_HTTP_RESPONSE_CODE = 429
AXES_LOCKOUT_CALLABLE = "apps.accounts.views.lockout_response"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "fa"
TIME_ZONE = "Asia/Tehran"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_ROOT = BASE_DIR / "data" / "documents"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SECURE = not DEBUG
SECURE_SSL_REDIRECT = env_bool("DJANGO_SECURE_SSL_REDIRECT", not DEBUG)
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
X_FRAME_OPTIONS = "DENY"
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_HSTS_SECONDS = env_int(
    "DJANGO_SECURE_HSTS_SECONDS",
    0,
    minimum=0,
    maximum=63_072_000,
)
SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool("DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS", False)
SECURE_HSTS_PRELOAD = env_bool("DJANGO_SECURE_HSTS_PRELOAD", False)
DATA_UPLOAD_MAX_MEMORY_SIZE = 1_048_576

AI_PROVIDER = os.getenv("AI_PROVIDER", "disabled").strip().lower()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5.6-terra").strip()
OPENAI_TIMEOUT_SECONDS = env_int("OPENAI_TIMEOUT_SECONDS", 30, minimum=5, maximum=120)
OPENAI_MAX_OUTPUT_TOKENS = env_int("OPENAI_MAX_OUTPUT_TOKENS", 800, minimum=100, maximum=4000)
OPENAI_DOCUMENT_EXTRACTION_MODEL = os.getenv(
    "OPENAI_DOCUMENT_EXTRACTION_MODEL",
    OPENAI_MODEL,
).strip()
OPENAI_DOCUMENT_TIMEOUT_SECONDS = env_int(
    "OPENAI_DOCUMENT_TIMEOUT_SECONDS",
    300,
    minimum=30,
    maximum=900,
)
OPENAI_DOCUMENT_MAX_OUTPUT_TOKENS = env_int(
    "OPENAI_DOCUMENT_MAX_OUTPUT_TOKENS",
    30_000,
    minimum=2_000,
    maximum=100_000,
)
OPENAI_DOCUMENT_BATCH_PAGES = env_int(
    "OPENAI_DOCUMENT_BATCH_PAGES",
    3,
    minimum=1,
    maximum=10,
)
OPENAI_EMBEDDING_MODEL = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-large").strip()
OPENAI_EMBEDDING_DIMENSIONS = env_int(
    "OPENAI_EMBEDDING_DIMENSIONS",
    1024,
    minimum=1024,
    maximum=1024,
)
AI_CONTEXT_MESSAGE_LIMIT = env_int("AI_CONTEXT_MESSAGE_LIMIT", 16, minimum=2, maximum=50)
AI_CONTEXT_CHARACTER_LIMIT = env_int(
    "AI_CONTEXT_CHARACTER_LIMIT",
    24_000,
    minimum=2_000,
    maximum=100_000,
)
KNOWLEDGE_RETRIEVAL_ENABLED = env_bool("KNOWLEDGE_RETRIEVAL_ENABLED", True)
KNOWLEDGE_RETRIEVAL_TOP_K = env_int("KNOWLEDGE_RETRIEVAL_TOP_K", 6, minimum=1, maximum=12)
KNOWLEDGE_MIN_SIMILARITY = env_float(
    "KNOWLEDGE_MIN_SIMILARITY",
    0.35,
    minimum=0.0,
    maximum=1.0,
)
KNOWLEDGE_MAX_CONTEXT_CHARACTERS = env_int(
    "KNOWLEDGE_MAX_CONTEXT_CHARACTERS",
    12_000,
    minimum=1_000,
    maximum=40_000,
)
KNOWLEDGE_EMBEDDING_BATCH_SIZE = env_int(
    "KNOWLEDGE_EMBEDDING_BATCH_SIZE",
    32,
    minimum=1,
    maximum=100,
)
KNOWLEDGE_MAX_FILE_BYTES = (
    env_int("KNOWLEDGE_MAX_FILE_SIZE_MB", 50, minimum=1, maximum=500) * 1024 * 1024
)

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
}
