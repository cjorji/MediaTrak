import json

import requests
from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from django.http import FileResponse, Http404, JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_http_methods
from rest_framework import viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from .models import Entry, Title
from .serializers import EntrySerializer, HistorySerializer, TitleSerializer


def session(request):
    return JsonResponse(
        {
            "user": {
                "username": request.user.username,
                "is_staff": request.user.is_staff,
            }
            if request.user.is_authenticated
            else None,
            "csrfToken": get_token(request),
        }
    )


@csrf_protect
@require_http_methods(["POST"])
def sign_in(request):
    try:
        data = json.loads(request.body)
    except (ValueError, TypeError):
        return JsonResponse({"detail": "Invalid request."}, status=400)
    user = authenticate(
        request, username=data.get("username", ""), password=data.get("password", "")
    )
    if not user:
        return JsonResponse(
            {"detail": "Username or password is incorrect."}, status=400
        )
    login(request, user)
    return session(request)


@csrf_protect
@require_http_methods(["POST"])
def sign_out(request):
    logout(request)
    return JsonResponse({"ok": True})


@api_view(["POST"])
@permission_classes([IsAdminUser])
def member(request):
    User = get_user_model()
    username, password = (
        request.data.get("username", ""),
        request.data.get("password", ""),
    )
    try:
        User._meta.get_field("username").clean(username, None)
        validate_password(password, User(username=username))
    except ValidationError as e:
        return Response({"detail": " ".join(e.messages)}, status=400)
    if not username or User.objects.filter(username=username).exists():
        return Response({"detail": "Choose an unused username."}, status=400)
    User.objects.create_user(username=username, password=password)
    return Response({"username": username}, status=201)


class EntryViewSet(viewsets.ModelViewSet):
    serializer_class = EntrySerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return (
            Entry.objects.filter(user=self.request.user)
            .select_related("title")
            .prefetch_related("history")
        )

    @transaction.atomic
    def create(self, request):
        if not isinstance(request.data, dict):
            return Response({"detail": "Expected an object."}, status=400)
        title_id = request.data.get("title_id")
        if title_id:
            try:
                title = Title.objects.get(pk=title_id)
            except (Title.DoesNotExist, ValueError, TypeError):
                return Response({"detail": "Title not found."}, status=404)
        else:
            data = TitleSerializer(data=request.data.get("title", {}))
            data.is_valid(raise_exception=True)
            title = data.save()
        if Entry.objects.filter(user=request.user, title=title).exists():
            return Response({"detail": "Already in your library."}, status=400)
        serializer = self.get_serializer(
            data={
                k: v for k, v in request.data.items() if k not in ["title", "title_id"]
            }
        )
        serializer.is_valid(raise_exception=True)
        serializer.save(user=request.user, title=title)
        return Response(serializer.data, status=201)

    @action(detail=True, methods=["patch"], url_path="metadata")
    def metadata(self, request, pk=None):
        title = self.get_object().title
        serializer = TitleSerializer(title, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def history(self, request, pk=None):
        serializer = HistorySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(entry=self.get_object())
        return Response(serializer.data, status=201)


@api_view(["GET"])
def catalogue(request):
    query = request.query_params.get("q", "").strip()
    titles = Title.objects.filter(name__icontains=query).order_by("name")[:30]
    return Response(TitleSerializer(titles, many=True).data)


@api_view(["GET"])
def rawg_search(request):
    query = request.query_params.get("q", "").strip()
    if len(query) < 2:
        return Response({"detail": "Enter at least two characters."}, status=400)
    data = rawg_request("games", {"search": query, "page_size": 12})
    if isinstance(data, Response):
        return data
    return Response(
        [
            {
                "id": g["id"],
                "name": g["name"],
                "year": int(g["released"][:4]) if g.get("released") else None,
                "cover_url": g.get("background_image") or "",
            }
            for g in data.get("results", [])
        ]
    )


def rawg_request(path, params=None):
    if not settings.RAWG_API_KEY:
        return Response(
            {"detail": "RAWG is not configured. Set RAWG_API_KEY on the server."},
            status=503,
        )
    try:
        result = requests.get(
            "https://api.rawg.io/api/" + path,
            params={**(params or {}), "key": settings.RAWG_API_KEY},
            timeout=12,
        )
        result.raise_for_status()
        return result.json()
    except (requests.RequestException, ValueError):
        return Response(
            {"detail": "RAWG could not be reached. Please try again later."}, status=502
        )


@api_view(["POST"])
def rawg_import(request):
    try:
        rawg_id = int(request.data.get("id"))
    except (ValueError, TypeError):
        return Response({"detail": "Invalid game ID."}, status=400)
    title = Title.objects.filter(rawg_id=rawg_id).first()
    if not title:
        data = rawg_request(f"games/{rawg_id}")
        if isinstance(data, Response):
            return data
        links = {"RAWG": "https://rawg.io/games/" + data["slug"]}
        if data.get("metacritic_url"):
            links["Metacritic"] = data["metacritic_url"]
        title, _ = Title.objects.get_or_create(
            rawg_id=rawg_id,
            defaults={
                "name": data["name"],
                "kind": "game",
                "year": int(data["released"][:4]) if data.get("released") else None,
                "cover_url": data.get("background_image") or "",
                "external_links": links,
            },
        )
    entry, _ = Entry.objects.get_or_create(user=request.user, title=title)
    return Response(EntrySerializer(entry).data)


def cover_file(request, filename):
    if not request.user.is_authenticated:
        return JsonResponse({"detail": "Sign in required."}, status=403)
    from pathlib import Path

    root = Path(settings.MEDIA_ROOT).resolve()
    path = (root / filename).resolve()
    if path.parent != root or not path.is_file():
        raise Http404
    return FileResponse(path.open("rb"))
