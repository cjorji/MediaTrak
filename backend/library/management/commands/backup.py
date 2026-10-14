import sqlite3
import tarfile
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Create a consistent SQLite snapshot and archive uploaded artwork. Use during a quiet period for artwork consistency."

    def add_arguments(self, parser):
        parser.add_argument("--output", default=str(settings.DATA_DIR / "backups"))

    def handle(self, *args, **options):
        output = Path(options["output"])
        output.mkdir(parents=True, exist_ok=True)
        name = output / (
            "mediatrak-"
            + datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
            + ".tar.gz"
        )
        database = Path(settings.DATABASES["default"]["NAME"])
        if not database.exists():
            raise CommandError("Database does not exist. Run migrations first.")
        with tempfile.TemporaryDirectory() as scratch:
            snapshot = Path(scratch) / "db.sqlite3"
            with (
                sqlite3.connect(database) as source,
                sqlite3.connect(snapshot) as destination,
            ):
                source.backup(destination)
            with tarfile.open(name, "w:gz") as archive:
                archive.add(snapshot, arcname="db.sqlite3")
                if Path(settings.MEDIA_ROOT).exists():
                    archive.add(settings.MEDIA_ROOT, arcname="covers")
        self.stdout.write(self.style.SUCCESS(str(name)))
