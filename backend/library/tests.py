from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import Entry, Title


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class LibraryTests(TestCase):
    def setUp(self):
        self.alex = get_user_model().objects.create_user(
            "alex", password="Example-pass-123"
        )
        self.sam = get_user_model().objects.create_user(
            "sam", password="Example-pass-123"
        )
        self.client = APIClient()
        self.client.force_authenticate(self.alex)
        self.title = Title.objects.create(name="A story", kind="book")
        self.entry = Entry.objects.create(
            user=self.alex, title=self.title, notes="Private memory"
        )

    def test_members_cannot_read_update_or_delete_other_entries(self):
        self.client.force_authenticate(self.sam)
        self.assertEqual(self.client.get("/api/entries/").json(), [])
        for method in ["get", "patch", "delete"]:
            response = getattr(self.client, method)(
                f"/api/entries/{self.entry.pk}/", {"notes": "Changed"}, format="json"
            )
            self.assertEqual(response.status_code, 404)
        self.assertEqual(
            self.client.patch(
                f"/api/entries/{self.entry.pk}/metadata/",
                {"name": "Changed"},
                format="json",
            ).status_code,
            404,
        )
        self.assertEqual(
            self.client.post(
                f"/api/entries/{self.entry.pk}/history/",
                {"finished_on": "2026-10-15"},
                format="json",
            ).status_code,
            404,
        )

    def test_shared_catalogue_does_not_leak_notes(self):
        self.client.force_authenticate(self.sam)
        result = self.client.get("/api/catalogue/?q=story").json()
        self.assertEqual(len(result), 1)
        self.assertNotIn("notes", result[0])
        added = self.client.post(
            "/api/entries/", {"title_id": self.title.pk}, format="json"
        )
        self.assertEqual(added.status_code, 201)
        self.assertEqual(added.json()["notes"], "")

    def test_invalid_entry_does_not_leave_orphan_title(self):
        response = self.client.post(
            "/api/entries/",
            {"title": {"name": "Invalid", "kind": "game"}, "rating": 11},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Title.objects.filter(name="Invalid").exists())

    def test_validate_dates_tags_rating_and_external_links(self):
        url = f"/api/entries/{self.entry.pk}/"
        for data in [
            {"rating": 0},
            {"tags": "not a list"},
            {"started_on": "2026-10-15", "finished_on": "2026-01-01"},
        ]:
            self.assertEqual(
                self.client.patch(url, data, format="json").status_code, 400
            )
        self.assertEqual(
            self.client.patch(
                url + "metadata/",
                {"external_links": {"bad": "javascript:alert(1)"}},
                format="json",
            ).status_code,
            400,
        )

    def test_revisit_does_not_overwrite_original_dates(self):
        self.entry.finished_on = "2025-01-01"
        self.entry.save()
        self.assertEqual(
            self.client.post(
                f"/api/entries/{self.entry.pk}/history/",
                {"finished_on": "2026-10-15", "notes": "Again"},
                format="json",
            ).status_code,
            201,
        )
        self.entry.refresh_from_db()
        self.assertEqual(str(self.entry.finished_on), "2025-01-01")
        self.assertEqual(self.entry.history.count(), 1)

    def test_member_creation_requires_admin(self):
        self.assertEqual(
            self.client.post(
                "/api/members/",
                {"username": "new", "password": "Example-pass-123"},
                format="json",
            ).status_code,
            403,
        )
        self.alex.is_staff = True
        self.alex.save()
        self.assertEqual(
            self.client.post(
                "/api/members/",
                {"username": "new", "password": "Example-pass-123"},
                format="json",
            ).status_code,
            201,
        )

    @override_settings(RAWG_API_KEY="secret-server-key")
    @patch("library.views.requests.get")
    def test_rawg_import_is_idempotent_and_keeps_personal_data(self, get):
        get.return_value = Mock(
            json=lambda: {
                "id": 42,
                "name": "Test Game",
                "slug": "test-game",
                "released": "2020-01-01",
                "background_image": "https://example.com/art.jpg",
            }
        )
        response = self.client.post("/api/rawg/import/", {"id": 42}, format="json")
        self.assertEqual(response.status_code, 200)
        entry = Entry.objects.get(pk=response.json()["id"])
        entry.notes = "Keep this"
        entry.save()
        again = self.client.post("/api/rawg/import/", {"id": 42}, format="json")
        self.assertEqual(again.json()["notes"], "Keep this")
        self.assertEqual(get.call_count, 1)
        self.assertNotIn("secret-server-key", str(again.json()))

    @override_settings(RAWG_API_KEY="")
    def test_missing_rawg_key_is_actionable(self):
        self.assertEqual(self.client.get("/api/rawg/search/?q=test").status_code, 503)

    def test_login_and_writes_require_csrf(self):
        client = APIClient(enforce_csrf_checks=True)
        self.assertEqual(
            client.post(
                "/api/login/",
                {"username": "alex", "password": "Example-pass-123"},
                format="json",
            ).status_code,
            403,
        )
        token = client.get("/api/session/").json()["csrfToken"]
        response = client.post(
            "/api/login/",
            {"username": "alex", "password": "Example-pass-123"},
            format="json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            client.patch(
                f"/api/entries/{self.entry.pk}/", {"notes": "x"}, format="json"
            ).status_code,
            403,
        )

    def test_anonymous_library_access_is_denied(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/entries/").status_code, 403)
