# MediaTrak

A self-hosted household media journal. Django API, React/TypeScript frontend, SQLite, and a single Docker container targeting Python 3.14 and ARM64 Raspberry Pi OS.

## First release

- Landscape artwork grid for games, movies, TV, and books, with mobile layouts.
- Separate household logins and personal ratings, notes, tags, progress, and dates.
- Shared title metadata; add household catalogue titles to your own library.
- Manual titles, cover uploads, editable external links, game completion flags, and revisit history.
- RAWG game search/import with server-side API key and attribution.
- Status/tag/search filters, sorting, collection counts, and account administration.
- Persistent SQLite and uploaded artwork; migrations run on container startup.

Steam imports, achievements, season/episode tracking, streaming availability, discovery, and recommendations are future milestones. RAWG artwork remains hosted remotely; uploaded artwork is stored locally. External links are currently entered as a JSON object in the metadata editor.

## Raspberry Pi deployment

Use a 64-bit Raspberry Pi OS installation with Docker Compose. Copy or clone the source to `~/docker/mediatrak/app`. This folder is the source/build context; `~/docker/mediatrak/data` holds persistent data.

Build the image from the app folder:

```sh
cd ~/docker/mediatrak/app
docker build -t mediatrak:local .
mkdir -p ~/docker/mediatrak/data
sudo chown -R 10001:10001 ~/docker/mediatrak/data
cp .env.example ~/docker/mediatrak/.env
python3 -c 'import secrets; print(secrets.token_urlsafe(64))'
```

Paste the generated value into `SECRET_KEY`. Configure `ALLOWED_HOSTS` with your actual Pi hostnames/IPs (no scheme or port), and `CSRF_TRUSTED_ORIGINS` with the exact URLs you use, including scheme and port. Obtain a RAWG API key at https://rawg.io/apidocs and put it in `RAWG_API_KEY`. Leave it empty to use manual tracking without RAWG. Keep `.env` private and outside version control.

Add this service to your existing `~/docker/docker-compose.yml`:

```yaml
services:
  mediatrak:
    image: mediatrak:local
    restart: unless-stopped
    ports:
      - "8090:8000"
    env_file:
      - ./mediatrak/.env
    volumes:
      - ./mediatrak/data:/data
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/session/')"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 30s
```

Start the service and create the first administrator interactively:

```sh
cd ~/docker
docker compose up -d mediatrak
docker compose exec mediatrak python manage.py createsuperuser
```

Open `http://raspberrypi.local:8090` (or your configured Pi address). Sign in with the account you created. Administrators can add household accounts from the library. The Django admin at `/admin/` supports password changes and account deactivation. Each member sees only their own tracking, while all members share title metadata and cover art.

For HTTPS behind your existing reverse proxy, set `COOKIE_SECURE=1` and include the HTTPS URL in `CSRF_TRUSTED_ORIGINS`. Keep port 8090 limited to your trusted network or bind it to localhost when using a local proxy. For direct HTTP on your LAN, leave `COOKIE_SECURE=0`.

Alternatively use the included `compose.yaml` from the source folder: copy `.env.example` to `.env`, configure it, set `MEDIATRAK_DATA_DIR` to an absolute data path, prepare its ownership, and run `docker compose up -d --build`.

## Backups and restore

Create a consistent SQLite snapshot plus uploaded artwork (prefer a quiet period with no uploads):

```sh
cd ~/docker
docker compose exec mediatrak python manage.py backup
```

Archives appear in `~/docker/mediatrak/data/backups/`. Copy them to another disk/device. Back up `~/docker/mediatrak/.env` separately; it contains secrets. Remote RAWG artwork URLs are in the database, not the image files themselves.

Restore a trusted archive with the service stopped. Preserve the current data first, then extract the selected backup into the data directory:

```sh
cd ~/docker
docker compose stop mediatrak
cp -a mediatrak/data mediatrak/data-before-restore
# Replace this path with your chosen backup archive:
sudo tar -xzf /path/to/mediatrak-backup.tar.gz -C mediatrak/data
sudo chown -R 10001:10001 mediatrak/data
docker compose start mediatrak
```

Startup applies any newer migrations. Backups contain household notes and history: store them privately. Avoid rolling back to an older app version against a newer database; restore the matching backup when needed.

## Local development

Python 3.14 is the deployment target; Python 3.13 can also run the backend locally. Node 24 and pnpm are used for the frontend. All resolved dependencies are pinned in `requirements.txt` and `frontend/pnpm-lock.yaml`.

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
DEBUG=1 .venv/bin/python backend/manage.py migrate
DEBUG=1 .venv/bin/python backend/manage.py createsuperuser
DEBUG=1 .venv/bin/python backend/manage.py runserver 127.0.0.1:8000
```

In a second terminal:

```sh
cd frontend
pnpm install --frozen-lockfile
pnpm dev
```

Open the Vite URL. Vite proxies API and artwork requests to Django. For RAWG locally, export `RAWG_API_KEY` before starting Django.

Validation:

```sh
DEBUG=1 .venv/bin/python backend/manage.py test library
cd frontend && pnpm build
```

To serve the production frontend locally, copy `frontend/dist/` into `backend/frontend/`, run `DEBUG=1 .venv/bin/python backend/manage.py collectstatic --noinput`, and launch Gunicorn with `DEBUG=1` for the local-only secret fallback. Real deployments must set a strong `SECRET_KEY` and leave `DEBUG` off.
