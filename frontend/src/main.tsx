import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Library,
  Gamepad2,
  Film,
  Tv,
  BookOpen,
  Search,
  Plus,
  X,
  Star,
  ArrowUpRight,
  LogOut,
  Users,
  SlidersHorizontal,
  Check,
  Clock,
  Trash2,
} from "lucide-react";
import "./style.css";

type Kind = "game" | "movie" | "tv" | "book";
type Title = {
  id: number;
  name: string;
  kind: Kind;
  year: number | null;
  artwork: string;
  cover_url: string;
  rawg_id: number | null;
  external_links: Record<string, string>;
};
type Entry = {
  id: number;
  title: Title;
  status: string;
  rating: number | null;
  notes: string;
  tags: string[];
  started_on: string | null;
  finished_on: string | null;
  fully_completed: boolean;
  history: { id: number; finished_on: string; notes: string }[];
};
type User = { username: string; is_staff: boolean };
const kinds = [
  { id: "all", label: "All media", icon: Library },
  { id: "game", label: "Games", icon: Gamepad2 },
  { id: "movie", label: "Movies", icon: Film },
  { id: "tv", label: "TV shows", icon: Tv },
  { id: "book", label: "Books", icon: BookOpen },
];
const states: Record<string, string> = {
  planned: "On the list",
  in_progress: "In progress",
  completed: "Completed",
  paused: "Paused",
  dropped: "Dropped",
};
let csrf = "";
async function api(path: string, options: RequestInit = {}) {
  const response = await fetch("/api/" + path, {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      "X-CSRFToken": csrf,
      ...options.headers,
    },
  });
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.detail ||
        Object.entries(data)
          .map(
            ([k, v]) =>
              `${k}: ${Array.isArray(v) ? v.join(" ") : JSON.stringify(v)}`,
          )
          .join(" · "),
    );
  return data;
}
const today = () => new Date().toLocaleDateString("en-CA");
function App() {
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [entries, setEntries] = useState<Entry[]>([]),
    [kind, setKind] = useState("all"),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [tag, setTag] = useState("all"),
    [sort, setSort] = useState("recent"),
    [modal, setModal] = useState<"add" | "member" | null>(null),
    [selected, setSelected] = useState<Entry | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  async function load() {
    const data = await api("entries/");
    setEntries(data);
    setSelected((prev) =>
      prev ? data.find((e: Entry) => e.id === prev.id) || null : null,
    );
  }
  useEffect(() => {
    api("session/")
      .then(async (data) => {
        csrf = data.csrfToken;
        setUser(data.user);
        if (data.user) await load();
      })
      .catch((e) => setError(e.message))
      .finally(() => setReady(true));
  }, []);
  const filtered = useMemo(
    () =>
      entries
        .filter(
          (e) =>
            (kind === "all" || e.title.kind === kind) &&
            (status === "all" || e.status === status) &&
            (tag === "all" || e.tags.includes(tag)) &&
            `${e.title.name} ${e.tags.join(" ")}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort((a, b) =>
          sort === "name"
            ? a.title.name.localeCompare(b.title.name)
            : sort === "rating"
              ? (b.rating || 0) - (a.rating || 0)
              : 0,
        ),
    [entries, kind, status, tag, query, sort],
  );
  const active = entries.filter((e) => e.status === "in_progress").length,
    completed = entries.filter((e) => e.status === "completed").length;
  async function login(form: HTMLFormElement) {
    setLoading(true);
    setError("");
    try {
      const data = await api("login/", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      csrf = data.csrfToken;
      setUser(data.user);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  if (!ready) return <div className="loading">Opening your library…</div>;
  if (!user)
    return (
      <main className="auth">
        <div className="auth-card">
          <div className="brand">
            <Library /> MediaTrak
            <span className="brand-dot" />
          </div>
          <p className="eyebrow">YOUR NEXT CHAPTER</p>
          <h1>
            Everything you love.
            <br />
            One little library.
          </h1>
          <p className="muted">
            Sign in to your personal collection of games, films, shows, and
            books.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              login(e.currentTarget);
            }}
          >
            <label>
              Username
              <input name="username" autoComplete="username" required />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="primary" disabled={loading}>
              {loading ? "Signing in…" : "Open my library"}{" "}
              <ArrowUpRight size={17} />
            </button>
          </form>
          <p className="fine">
            First visit? Create the initial account using the setup instructions
            in the README.
          </p>
        </div>
        <div className="auth-decoration">
          <Gamepad2 size={120} />
          <Film size={80} />
          <BookOpen size={90} />
        </div>
      </main>
    );
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <Library size={24} /> MediaTrak
          <span className="brand-dot" />
        </div>
        <p className="nav-caption">YOUR LIBRARY</p>
        <nav>
          {kinds.map((k) => (
            <button
              key={k.id}
              className={kind === k.id ? "nav active" : "nav"}
              onClick={() => setKind(k.id)}
            >
              <k.icon size={19} />
              {k.label}
              <span>
                {k.id === "all"
                  ? entries.length
                  : entries.filter((e) => e.title.kind === k.id).length}
              </span>
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="live-dot" /> A little more intentional.
          <p>
            Keep the stories.
            <br />
            Remember how they felt.
          </p>
        </div>
        <div className="profile">
          <div className="avatar">{user.username[0].toUpperCase()}</div>
          <div>
            <strong>{user.username}</strong>
            <small>Personal library</small>
          </div>
          <button
            title="Sign out"
            aria-label="Sign out"
            className="icon-button"
            onClick={async () => {
              try {
                await api("logout/", { method: "POST" });
                setUser(null);
                setEntries([]);
                setSelected(null);
                const data = await api("session/");
                csrf = data.csrfToken;
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <span className="breadcrumb">
            Your space <span>/</span> Library
          </span>
          <div className="top-actions">
            {user.is_staff && (
              <button className="secondary" onClick={() => setModal("member")}>
                <Users size={16} /> Add member
              </button>
            )}
            <button className="primary" onClick={() => setModal("add")}>
              <Plus size={17} /> Add media
            </button>
          </div>
        </header>
        <section className="intro">
          <p className="eyebrow">COLLECT EXPERIENCES, NOT JUST TITLES</p>
          <h1>
            {kind === "all"
              ? "Your library"
              : kinds.find((k) => k.id === kind)?.label}
            <span className="heading-dot">.</span>
          </h1>
          <p className="muted">
            The worlds you’ve explored. The ones still waiting.
          </p>
          <div className="stats">
            <div>
              <Library size={18} />
              <strong>{entries.length}</strong>
              <span>in your library</span>
            </div>
            <div>
              <Clock size={18} />
              <strong>{active}</strong>
              <span>in progress</span>
            </div>
            <div>
              <Check size={18} />
              <strong>{completed}</strong>
              <span>completed</span>
            </div>
          </div>
        </section>
        <section className="collection">
          <div className="section-heading">
            <h2>{status === "all" ? "The collection" : states[status]}</h2>
            <span>{filtered.length} titles</span>
          </div>
          <div className="filters">
            <div className="search">
              <Search size={18} />
              <input
                aria-label="Search your library"
                placeholder="Search titles or tags…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="filter-select">
              <SlidersHorizontal size={16} />
              <select
                aria-label="Filter status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="all">All statuses</option>
                {Object.entries(states).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <select
              aria-label="Filter tag"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            >
              <option value="all">All tags</option>
              {[...new Set(entries.flatMap((e) => e.tags))].sort().map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <select
              aria-label="Sort library"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="recent">Recently updated</option>
              <option value="name">Title A–Z</option>
              <option value="rating">Highest rated</option>
            </select>
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
              <button onClick={() => setError("")}>Dismiss</button>
            </div>
          )}
          {filtered.length ? (
            <div className="grid">
              {filtered.map((entry) => (
                <button
                  className="card"
                  key={entry.id}
                  onClick={() => setSelected(entry)}
                >
                  <Artwork title={entry.title} />
                  <div className="card-body">
                    <div className="card-kicker">
                      {kinds.find((k) => k.id === entry.title.kind)?.label}
                      <span>{entry.title.year || "—"}</span>
                    </div>
                    <h3>{entry.title.name}</h3>
                    <div className="card-bottom">
                      <span className={"badge " + entry.status}>
                        <span />
                        {states[entry.status]}
                      </span>
                      {entry.rating && (
                        <span className="rating">
                          <Star size={13} fill="currentColor" />
                          {entry.rating}
                          <small>/10</small>
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty">
              <Library size={42} />
              <h2>
                {entries.length
                  ? "No titles match these filters"
                  : "A great collection starts with one title."}
              </h2>
              <p>
                {entries.length
                  ? "Try another search or status."
                  : "Add a game you love, a film you watched, or a book on your list."}
              </p>
              <button className="primary" onClick={() => setModal("add")}>
                <Plus size={16} /> Add your first title
              </button>
            </div>
          )}
          <footer>
            <span>Made for your own pace.</span>
            <a href="https://rawg.io" target="_blank" rel="noreferrer">
              Game data and artwork by RAWG <ArrowUpRight size={12} />
            </a>
          </footer>
        </section>
      </main>
      {modal === "add" && (
        <AddModal
          onClose={() => setModal(null)}
          onDone={async () => {
            await load();
            setModal(null);
          }}
        />
      )}
      {modal === "member" && <MemberModal onClose={() => setModal(null)} />}
      {selected && (
        <Detail
          entry={selected}
          onClose={() => setSelected(null)}
          onChange={load}
        />
      )}
    </div>
  );
}
function Artwork({ title }: { title: Title }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [title.artwork]);
  const Icon = kinds.find((k) => k.id === title.kind)!.icon;
  return (
    <div className={"artwork " + title.kind}>
      {title.artwork && !failed ? (
        <img
          src={title.artwork}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <>
          <Icon size={48} />
          <span>{title.name}</span>
        </>
      )}
    </div>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const elements = dialogRef.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),a[href],input,select,textarea",
        );
        if (!elements?.length) return;
        const first = elements[0],
          last = elements[elements.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal"
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button
            autoFocus
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function AddModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [mode, setMode] = useState("rawg"),
    [query, setQuery] = useState(""),
    [results, setResults] = useState<any[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [searched, setSearched] = useState(false);
  async function search() {
    setBusy(true);
    setError("");
    try {
      setResults(
        await api(
          mode === "rawg"
            ? `rawg/search/?q=${encodeURIComponent(query)}`
            : `catalogue/?q=${encodeURIComponent(query)}`,
        ),
      );
      setSearched(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function add(item: any) {
    setBusy(true);
    setError("");
    try {
      await api(mode === "rawg" ? "rawg/import/" : "entries/", {
        method: "POST",
        body: JSON.stringify(
          mode === "rawg" ? { id: item.id } : { title_id: item.id },
        ),
      });
      await onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Add to your library" onClose={onClose}>
      <div className="tabs">
        {[
          ["rawg", "Find a game"],
          ["catalogue", "Household titles"],
          ["manual", "Add manually"],
        ].map(([v, l]) => (
          <button
            key={v}
            className={mode === v ? "selected" : ""}
            onClick={() => {
              setMode(v);
              setResults([]);
              setError("");
              setSearched(false);
            }}
          >
            {l}
          </button>
        ))}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {mode === "manual" ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            setBusy(true);
            setError("");
            const data = new FormData(form);
            try {
              const entry = await api("entries/", {
                method: "POST",
                body: JSON.stringify({
                  title: {
                    name: data.get("name"),
                    kind: data.get("kind"),
                    year: data.get("year") ? Number(data.get("year")) : null,
                    cover_url: data.get("cover_url") || "",
                  },
                }),
              });
              const file = data.get("cover") as File;
              if (file?.size) {
                const upload = new FormData();
                upload.set("cover", file);
                await api(`entries/${entry.id}/metadata/`, {
                  method: "PATCH",
                  body: upload,
                });
              }
              await onDone();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Title
            <input
              name="name"
              maxLength={250}
              required
              placeholder="What did you discover?"
            />
          </label>
          <div className="form-row">
            <label>
              Media type
              <select name="kind">
                <option value="game">Game</option>
                <option value="movie">Movie</option>
                <option value="tv">TV show</option>
                <option value="book">Book</option>
              </select>
            </label>
            <label>
              Release year
              <input name="year" type="number" min="1" max="9999" />
            </label>
          </div>
          <label>
            Artwork URL
            <input name="cover_url" type="url" placeholder="https://…" />
          </label>
          <label>
            Or upload artwork
            <input name="cover" type="file" accept="image/*" />
          </label>
          <p className="fine">
            Landscape images look best. Title metadata is shared with your
            household.
          </p>
          <button className="primary" disabled={busy}>
            {busy ? "Adding…" : "Add title"}
          </button>
        </form>
      ) : (
        <>
          <form
            className="lookup"
            onSubmit={(e) => {
              e.preventDefault();
              search();
            }}
          >
            <input
              aria-label="Find a title"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              required
              minLength={2}
              placeholder={
                mode === "rawg"
                  ? "Search RAWG for a game…"
                  : "Search shared household titles…"
              }
            />
            <button className="primary" disabled={busy}>
              {busy ? "Working…" : "Search"}
            </button>
          </form>
          <div className="results">
            {results.map((item) => (
              <button
                key={item.id}
                disabled={busy}
                className="result"
                onClick={() => add(item)}
              >
                {(item.cover_url || item.artwork) && (
                  <img src={item.artwork || item.cover_url} alt="" />
                )}
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.year || "Release year unknown"}</small>
                </span>
                <Plus size={18} />
              </button>
            ))}
            {searched && !results.length && (
              <p className="muted">
                No results. Try another title, or add it manually.
              </p>
            )}
          </div>
          <p className="fine">
            {mode === "rawg" ? (
              <>
                Search, choose the right game, and its artwork comes with it.{" "}
                <a href="https://rawg.io" target="_blank" rel="noreferrer">
                  Powered by RAWG.
                </a>
              </>
            ) : (
              "Add an existing shared title to your own personal library."
            )}
          </p>
        </>
      )}
    </Modal>
  );
}
function MemberModal({ onClose }: { onClose: () => void }) {
  const [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="Welcome someone home" onClose={onClose}>
      <p className="muted">
        Each member gets their own ratings, progress, and notes.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          setBusy(true);
          setError("");
          try {
            const data = await api("members/", {
              method: "POST",
              body: JSON.stringify(Object.fromEntries(new FormData(form))),
            });
            setSuccess(
              `Account created for ${data.username}. They can sign in now.`,
            );
            form.reset();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Username
          <input name="username" required autoComplete="off" />
        </label>
        <label>
          Initial password
          <input
            name="password"
            required
            type="password"
            minLength={8}
            autoComplete="new-password"
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="success" role="status">
            {success}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "Creating…" : "Create member"}
        </button>
      </form>
    </Modal>
  );
}
function Detail({
  entry,
  onClose,
  onChange,
}: {
  entry: Entry;
  onClose: () => void;
  onChange: () => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false),
    [editMetadata, setEditMetadata] = useState(false);
  async function run(task: () => Promise<any>) {
    setError("");
    setBusy(true);
    try {
      await task();
      await onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={entry.title.name} onClose={onClose}>
      <Artwork title={entry.title} />
      <div className="detail-meta">
        {entry.title.year} ·{" "}
        {kinds.find((k) => k.id === entry.title.kind)?.label}
        <button
          className="text-button"
          onClick={() => setEditMetadata(!editMetadata)}
        >
          Edit shared title
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {editMetadata && (
        <form
          className="metadata-form"
          key={entry.title.id}
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            run(async () => {
              const links = JSON.parse(String(data.get("links") || "{}"));
              await api(`entries/${entry.id}/metadata/`, {
                method: "PATCH",
                body: JSON.stringify({
                  name: data.get("name"),
                  year: data.get("year") ? Number(data.get("year")) : null,
                  cover_url: data.get("cover_url"),
                  external_links: links,
                }),
              });
              const file = data.get("cover") as File;
              if (file?.size) {
                const upload = new FormData();
                upload.set("cover", file);
                await api(`entries/${entry.id}/metadata/`, {
                  method: "PATCH",
                  body: upload,
                });
              }
              setEditMetadata(false);
            });
          }}
        >
          <p className="fine">
            Changes here apply to this title for all household members.
          </p>
          <label>
            Title
            <input name="name" defaultValue={entry.title.name} required />
          </label>
          <label>
            Year
            <input
              type="number"
              name="year"
              min="1"
              max="9999"
              defaultValue={entry.title.year || ""}
            />
          </label>
          <label>
            Artwork URL
            <input
              name="cover_url"
              type="url"
              defaultValue={entry.title.cover_url}
            />
          </label>
          <label>
            Upload artwork
            <input type="file" name="cover" accept="image/*" />
          </label>
          <label>
            External links (JSON object)
            <textarea
              name="links"
              defaultValue={JSON.stringify(entry.title.external_links, null, 2)}
              placeholder={'{"IMDb": "https://…"}'}
            />
          </label>
          <button className="primary" disabled={busy}>
            Save shared title
          </button>
        </form>
      )}
      <form
        key={entry.id + ":" + entry.status + ":" + entry.rating}
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          run(() =>
            api(`entries/${entry.id}/`, {
              method: "PATCH",
              body: JSON.stringify({
                status: data.get("status"),
                rating: data.get("rating") ? Number(data.get("rating")) : null,
                notes: data.get("notes"),
                tags: String(data.get("tags"))
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
                started_on: data.get("started_on") || null,
                finished_on: data.get("finished_on") || null,
                fully_completed: data.get("fully_completed") === "on",
              }),
            }),
          );
        }}
      >
        <div className="form-row">
          <label>
            Status
            <select name="status" defaultValue={entry.status}>
              {Object.entries(states).map(([v, l]) => (
                <option key={v} value={v}>
                  {entry.title.kind === "game" && v === "completed"
                    ? "Beaten"
                    : l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Your rating
            <select name="rating" defaultValue={entry.rating || ""}>
              <option value="">Unrated</option>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} / 10
                </option>
              ))}
            </select>
          </label>
        </div>
        {entry.title.kind === "game" && (
          <label className="checkbox">
            <input
              name="fully_completed"
              type="checkbox"
              defaultChecked={entry.fully_completed}
            />{" "}
            Fully completed / 100%
          </label>
        )}
        <label>
          Your notes
          <textarea
            name="notes"
            defaultValue={entry.notes}
            placeholder="Did you actually enjoy it? What stayed with you?"
            rows={4}
          />
        </label>
        <label>
          Tags
          <input
            name="tags"
            defaultValue={entry.tags.join(", ")}
            placeholder="Comfort pick, sci-fi, with friends…"
          />
        </label>
        <div className="form-row">
          <label>
            Started
            <input
              name="started_on"
              type="date"
              defaultValue={entry.started_on || ""}
            />
          </label>
          <label>
            Finished
            <input
              name="finished_on"
              type="date"
              defaultValue={entry.finished_on || ""}
            />
          </label>
        </div>
        <button className="primary" disabled={busy}>
          {busy ? "Saving…" : "Save your progress"}
        </button>
      </form>
      <div className="external-links">
        {Object.entries(entry.title.external_links).map(([label, url]) => (
          <a key={label} href={url} target="_blank" rel="noreferrer">
            {label}
            <ArrowUpRight size={14} />
          </a>
        ))}
      </div>
      <div className="history">
        <h3>Revisits</h3>
        {entry.history.map((h) => (
          <p key={h.id}>
            <span>{h.finished_on}</span> {h.notes || "Another time through."}
          </p>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.currentTarget));
            run(() =>
              api(`entries/${entry.id}/history/`, {
                method: "POST",
                body: JSON.stringify(data),
              }),
            );
          }}
        >
          <div className="form-row">
            <label>
              Replay / rewatch / reread date
              <input
                type="date"
                name="finished_on"
                defaultValue={today()}
                required
              />
            </label>
            <label>
              A quick memory
              <input name="notes" placeholder="How was it this time?" />
            </label>
          </div>
          <button className="secondary" disabled={busy}>
            <Plus size={14} /> Log a revisit
          </button>
        </form>
      </div>
      <div className="danger-zone">
        {confirmDelete ? (
          <>
            <span>Remove from your library?</span>
            <button
              className="danger"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await api(`entries/${entry.id}/`, { method: "DELETE" });
                  onClose();
                })
              }
            >
              Yes, remove
            </button>
            <button
              className="text-button"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            className="text-button"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={14} /> Remove from my library
          </button>
        )}
      </div>
      <a
        className="fine"
        href="https://rawg.io"
        target="_blank"
        rel="noreferrer"
      >
        Game data and artwork by RAWG
      </a>
    </Modal>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
