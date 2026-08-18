from django.contrib.auth.models import AbstractUser


class User(AbstractUser):
    """Application user created by an administrator; public registration is disabled."""

    pass
