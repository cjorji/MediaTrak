from rest_framework import serializers

from .models import Entry, History, Title


class TitleSerializer(serializers.ModelSerializer):
    artwork = serializers.SerializerMethodField()

    class Meta:
        model = Title
        fields = [
            "id",
            "name",
            "kind",
            "year",
            "cover_url",
            "cover",
            "artwork",
            "rawg_id",
            "external_links",
        ]
        read_only_fields = ["rawg_id"]

    def get_artwork(self, obj):
        return obj.cover.url if obj.cover else obj.cover_url

    def validate_external_links(self, value):
        if not isinstance(value, dict) or len(value) > 20:
            raise serializers.ValidationError("Use an object with at most 20 links.")
        for label, url in value.items():
            if not isinstance(label, str) or len(label) > 80:
                raise serializers.ValidationError("Link labels must be short text.")
            serializers.URLField().run_validation(url)
            if not url.startswith(("https://", "http://")):
                raise serializers.ValidationError("Links must use HTTP or HTTPS.")
        return value

    def validate_cover(self, value):
        if value.size > 8 * 1024 * 1024:
            raise serializers.ValidationError("Artwork must be under 8 MB.")
        return value


class HistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = History
        fields = ["id", "finished_on", "notes"]


class EntrySerializer(serializers.ModelSerializer):
    title = TitleSerializer(read_only=True)
    history = HistorySerializer(many=True, read_only=True)

    class Meta:
        model = Entry
        fields = [
            "id",
            "title",
            "status",
            "rating",
            "notes",
            "tags",
            "started_on",
            "finished_on",
            "fully_completed",
            "updated_at",
            "history",
        ]

    def validate_tags(self, value):
        if (
            not isinstance(value, list)
            or len(value) > 30
            or any(not isinstance(t, str) or len(t) > 50 for t in value)
        ):
            raise serializers.ValidationError(
                "Use at most 30 text tags, each under 50 characters."
            )
        return list(dict.fromkeys(t.strip() for t in value if t.strip()))

    def validate(self, attrs):
        start = attrs.get("started_on", getattr(self.instance, "started_on", None))
        end = attrs.get("finished_on", getattr(self.instance, "finished_on", None))
        if start and end and end < start:
            raise serializers.ValidationError("Finish date must follow start date.")
        return attrs
