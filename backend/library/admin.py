from django.contrib import admin

from .models import Entry, History, Title

admin.site.register([Title, Entry, History])
