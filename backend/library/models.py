from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class Title(models.Model):
    TYPES = [(x, x.title()) for x in ["game", "movie", "tv", "book"]]
    name = models.CharField(max_length=250)
    kind = models.CharField(max_length=10, choices=TYPES)
    year = models.PositiveIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(9999)],
    )
    cover_url = models.URLField(max_length=1000, blank=True)
    cover = models.ImageField(upload_to="", blank=True)
    rawg_id = models.PositiveIntegerField(null=True, blank=True, unique=True)
    external_links = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Entry(models.Model):
    STATES = [
        (x, x.replace("_", " ").title())
        for x in ["planned", "in_progress", "completed", "paused", "dropped"]
    ]
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    title = models.ForeignKey(Title, on_delete=models.CASCADE)
    status = models.CharField(max_length=20, choices=STATES, default="planned")
    rating = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(10)]
    )
    notes = models.TextField(blank=True, max_length=20000)
    tags = models.JSONField(default=list, blank=True)
    started_on = models.DateField(null=True, blank=True)
    finished_on = models.DateField(null=True, blank=True)
    fully_completed = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "title"], name="unique_user_title")
        ]
        ordering = ["-updated_at"]


class History(models.Model):
    entry = models.ForeignKey(Entry, on_delete=models.CASCADE, related_name="history")
    finished_on = models.DateField()
    notes = models.TextField(blank=True, max_length=20000)

    class Meta:
        ordering = ["-finished_on", "-id"]
