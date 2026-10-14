from django.contrib import admin
from django.urls import include, path
from django.views.generic import TemplateView
from library import views
from rest_framework.routers import DefaultRouter

router = DefaultRouter()
router.register("entries", views.EntryViewSet, basename="entry")
urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/session/", views.session),
    path("api/login/", views.sign_in),
    path("api/logout/", views.sign_out),
    path("api/members/", views.member),
    path("api/catalogue/", views.catalogue),
    path("api/rawg/search/", views.rawg_search),
    path("api/rawg/import/", views.rawg_import),
    path("api/", include(router.urls)),
    path("covers/<str:filename>", views.cover_file),
    path("", TemplateView.as_view(template_name="index.html")),
]
