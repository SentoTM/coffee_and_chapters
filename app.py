"""Coffee & Chapters — "Tinder" de libros para elegir el reto de lectura.

Flask + SQLite. Dos usuarios definidos en la variable APP_USERS.

Cada usuario tiene, por libro:
  - decision: want (leer) · reject (descartar) · skip (pasar, vuelve a salir) · NULL (sin decidir)
  - is_read:  casilla aparte "ya lo he leído"
"""
import csv
import io
import json
import os
import random
import sqlite3
from functools import wraps
from urllib.parse import quote_plus

from flask import (Flask, abort, flash, g, jsonify, redirect, render_template,
                   request, session, url_for)
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("DATABASE_PATH", os.path.join(BASE_DIR, "data", "app.db"))
SEED_FILE = os.environ.get("SEED_FILE", os.path.join(BASE_DIR, "seed", "coffee_and_chapters.xlsx"))
BLURBS_FILE = os.path.join(BASE_DIR, "seed", "sinopsis.tsv")  # Nº <TAB> sinopsis breve
DECISIONS = ("want", "reject", "skip")
# Libros que no entran nunca: nivel 7 (descartables) y duplicados/solapados por Nº
# (112 Inferno ya está dentro de 235 La Divina Comedia).
EXCLUDED_LEVEL_PREFIX = "7"
EXCLUDED_IDS = {x.strip() for x in os.environ.get("EXCLUDED_IDS", "112").split(",") if x.strip()}
SCHEMA_VERSION = 5

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "dev-cambia-esto")
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024
app.json.sort_keys = False  # mantener el orden de los campos de la tarjeta


# --------------------------------------------------------------------------- #
# Usuarios: APP_USERS="sento:clave1,and:clave2"
# --------------------------------------------------------------------------- #
def load_users():
    raw = os.environ.get("APP_USERS", "sento:sento,and:and")
    users = {}
    for pair in raw.split(","):
        if ":" in pair:
            name, pwd = pair.split(":", 1)
            users[name.strip().lower()] = generate_password_hash(pwd.strip())
    return users


USERS = load_users()
# Quién ve el buscador en Descubrir
SEARCH_USERS = {u.strip().lower() for u in os.environ.get("SEARCH_USERS", "sento").split(",") if u.strip()}

# Columnas del Excel con el estado previo de cada persona → usuario de la app
# IMPORT_USER_COLUMNS="Vicen:sento,Andrea:and"
USER_COLUMNS = {
    k.strip().lower(): v.strip().lower()
    for k, v in (p.split(":", 1) for p in os.environ.get("IMPORT_USER_COLUMNS", "Vicen:sento,Andrea:and").split(",") if ":" in p)
}


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if session.get("user") not in USERS:
            if request.path.startswith("/api/"):
                return jsonify(error="no autenticado"), 401
            return redirect(url_for("login", next=request.path))
        return view(*args, **kwargs)
    return wrapper


def other_user(user):
    return next((u for u in USERS if u != user), None)


# --------------------------------------------------------------------------- #
# Base de datos
# --------------------------------------------------------------------------- #
SCHEMA = """
CREATE TABLE IF NOT EXISTS books (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    ext_id   TEXT UNIQUE,                 -- Nº del Excel, si existe
    title    TEXT NOT NULL,               -- título a mostrar (español si hay)
    original TEXT NOT NULL DEFAULT '',    -- título original
    author   TEXT NOT NULL DEFAULT '',
    level    TEXT NOT NULL DEFAULT '',
    extra    TEXT NOT NULL DEFAULT '{}',
    blurb    TEXT NOT NULL DEFAULT '',     -- sinopsis breve (seed/sinopsis.tsv)
    added    TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (original, author)
);
CREATE TABLE IF NOT EXISTS votes (
    username TEXT NOT NULL,
    book_id  INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    decision TEXT CHECK (decision IN ('want','reject','skip')),
    is_read  INTEGER NOT NULL DEFAULT 0,
    updated  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (username, book_id)
);
"""


def connect():
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db


def get_db():
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = connect()
    version = db.execute("PRAGMA user_version").fetchone()[0]
    if version < 2:
        # Versión 1 (sin datos reales): se recrea.
        db.executescript("DROP TABLE IF EXISTS votes; DROP TABLE IF EXISTS books;")
    db.executescript(SCHEMA)
    if version in (2, 3):
        migrate_to_v4(db)
    db.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
    db.commit()
    purge_excluded(db)
    empty = db.execute("SELECT COUNT(*) FROM books").fetchone()[0] == 0
    if empty and os.path.exists(SEED_FILE):
        with open(SEED_FILE, "rb") as f:
            res = import_books(db, os.path.basename(SEED_FILE), f.read())
        print(f"[seed] {res}")
    if version < 5:
        demo_vote(db)
    sync_blurbs(db)
    db.close()


def load_blurbs():
    if not os.path.exists(BLURBS_FILE):
        return {}
    out = {}
    with open(BLURBS_FILE, encoding="utf-8") as f:
        for line in f:
            n, _, text = line.rstrip("\n").partition("\t")
            if n.strip() and text.strip():
                out[n.strip()] = text.strip()
    return out


def sync_blurbs(db):
    """Copia las sinopsis de seed/sinopsis.tsv a la base en cada arranque (también en bases ya cargadas)."""
    cols = {r["name"] for r in db.execute("PRAGMA table_info(books)")}
    if "blurb" not in cols:
        db.execute("ALTER TABLE books ADD COLUMN blurb TEXT NOT NULL DEFAULT ''")
    db.executemany("UPDATE books SET blurb = ? WHERE ext_id = ?",
                   [(text, n) for n, text in load_blurbs().items()])
    db.commit()


def demo_vote(db):
    """Una sola vez: And marca 'leer' Ana Karenina (nº 22) para poder probar el match."""
    row = db.execute("SELECT id FROM books WHERE ext_id = '22'").fetchone()
    if not row or "and" not in USERS:
        return
    db.execute("INSERT OR IGNORE INTO votes (username, book_id) VALUES ('and', ?)", (row["id"],))
    db.execute("""UPDATE votes SET decision = 'want', updated = datetime('now')
                  WHERE username = 'and' AND book_id = ? AND decision IS NULL""", (row["id"],))
    db.commit()


def migrate_to_v4(db):
    """Versiones 2-3 precargaban decisiones desde el Excel. Ahora solo se precarga 'leído':
    se quitan las decisiones que siguen tal cual las dejó la carga inicial
    (lo que hayáis deslizado después se respeta)."""
    cur = db.execute(
        """UPDATE votes SET decision = NULL
           WHERE decision IS NOT NULL
             AND julianday(updated) - julianday((SELECT added FROM books b WHERE b.id = votes.book_id)) < 60.0/86400""")
    db.execute("DELETE FROM votes WHERE decision IS NULL AND is_read = 0")
    db.commit()
    print(f"[migrate v4] {cur.rowcount} decisiones precargadas deshechas")


def purge_excluded(db):
    """Quita de la base los libros excluidos (y sus votos) si ya estaban cargados."""
    ph = ",".join("?" * len(EXCLUDED_IDS)) or "NULL"
    db.execute(f"DELETE FROM books WHERE level LIKE ? OR ext_id IN ({ph})",
               [EXCLUDED_LEVEL_PREFIX + "%", *EXCLUDED_IDS])
    db.commit()


def is_excluded(ext_id, level):
    return (ext_id in EXCLUDED_IDS) or level.startswith(EXCLUDED_LEVEL_PREFIX)


# --------------------------------------------------------------------------- #
# Importación
# --------------------------------------------------------------------------- #
def _norm(s):
    return str(s or "").strip().lower()


def _clean(v):
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()


def _sheet_rows(ws):
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    rows = [r for r in rows if any(c not in (None, "") for c in r)]
    if not rows:
        return []
    headers = [_clean(h) or f"col{i+1}" for i, h in enumerate(rows[0])]
    return [dict(zip(headers, r + [None] * (len(headers) - len(r)))) for r in rows[1:]]


def read_records(filename, data):
    """Lista de dicts {cabecera: valor}. Para el Excel del reto une 'Criba' + 'Lista' por Nº."""
    name = filename.lower()
    if name.endswith((".xlsx", ".xlsm")):
        from openpyxl import load_workbook
        wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        sheets = {ws.title.lower(): ws for ws in wb.worksheets}
        if "criba" in sheets:
            main = _sheet_rows(sheets["criba"])
            if "lista" in sheets:
                by_n = {_clean(r.get("Nº")): r for r in _sheet_rows(sheets["lista"])}
                for r in main:
                    for k, v in by_n.get(_clean(r.get("Nº")), {}).items():
                        r.setdefault(k, v)
            return main
        return _sheet_rows(wb.active)
    if name.endswith((".csv", ".txt")):
        text = data.decode("utf-8-sig", errors="replace")
        dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t")
        rows = list(csv.reader(io.StringIO(text), dialect))
        headers = [h.strip() for h in rows[0]] if rows else []
        return [dict(zip(headers, r)) for r in rows[1:] if any(c.strip() for c in r)]
    raise ValueError("Formato no soportado: sube un .xlsx o .csv")


def _pick(rec, *keys):
    low = {_norm(k): k for k in rec}
    for k in keys:
        if k in low and _clean(rec[low[k]]):
            return _clean(rec[low[k]])
    return ""


# Campos que se muestran en la tarjeta, en este orden (el resto se ignora)
CARD_FIELDS = [
    ("Año", ("año", "año (1ª publ.)")),
    ("Tipo", ("tipo",)),
    ("Género", ("género", "genero")),
    ("Nivel", ("nivel", "nivel criba")),
    ("Estación", ("estación", "estacion")),
    ("País", ("país del autor", "país")),
    ("Idioma", ("idioma original",)),
    ("Premios", ("premios destacados", "premios")),
    ("Por qué", ("por qué está aquí",)),
]


def read_from_cell(value):
    """Columna de una persona en el Excel → ¿lo ha leído? (Leído / Releer = sí).
    El resto (Pendiente, Leyendo…) no se usa: las decisiones se toman deslizando."""
    v = _norm(value)
    return 1 if v.startswith(("leído", "leido", "releer")) else 0


def import_books(db, filename, data):
    records = read_records(filename, data)
    added = existing = excluded = 0
    for rec in records:
        original = _pick(rec, "obra", "titulo", "título", "title", "libro")
        if not original:
            continue
        spanish = _pick(rec, "título en español", "titulo en español")
        author = _pick(rec, "autor", "autora", "author", "autores")
        ext_id = _pick(rec, "nº", "n", "id") or None
        level = _pick(rec, "nivel", "nivel criba")
        if is_excluded(ext_id, level):
            excluded += 1
            continue
        extra = {label: _pick(rec, *keys) for label, keys in CARD_FIELDS}
        extra = {k: v for k, v in extra.items() if v}
        if not CARD_FIELDS or not extra:  # CSV genérico: muestra todo lo demás
            skip = {"obra", "titulo", "título", "title", "autor", "author", "nº"}
            extra = {k: _clean(v) for k, v in rec.items() if _clean(v) and _norm(k) not in skip}

        cur = db.execute(
            """INSERT OR IGNORE INTO books (ext_id, title, original, author, level, extra)
               VALUES (?,?,?,?,?,?)""",
            (ext_id, spanish or original, original, author, level, json.dumps(extra, ensure_ascii=False)),
        )
        if not cur.rowcount:
            existing += 1
            continue
        added += 1
        book_id = cur.lastrowid

        # Del Excel solo se toma quién lo ha leído (solo para libros nuevos).
        low = {_norm(k): k for k in rec}
        for user in USERS:
            col = next((c for c, u in USER_COLUMNS.items() if u == user), None)
            if col in low and read_from_cell(rec.get(low[col])):
                db.execute("INSERT OR IGNORE INTO votes (username, book_id, is_read) VALUES (?,?,1)",
                           (user, book_id))
    db.commit()
    return {"added": added, "existing": existing, "excluded": excluded}


# --------------------------------------------------------------------------- #
# Serialización
# --------------------------------------------------------------------------- #
def votes_for(db, book_ids):
    if not book_ids:
        return {}
    ph = ",".join("?" * len(book_ids))
    out = {}
    for r in db.execute(f"SELECT * FROM votes WHERE book_id IN ({ph})", list(book_ids)):
        out.setdefault(r["book_id"], {})[r["username"]] = {"decision": r["decision"], "read": bool(r["is_read"])}
    return out


HIDDEN_FIELDS = {"País", "Idioma", "Estación"}  # no se muestran como fila en la tarjeta


def book_dict(row, votes, user):
    extra = json.loads(row["extra"] or "{}")
    season = extra.get("Estación", "")
    q = f'{row["original"] or row["title"]} {row["author"]}'.strip()
    v = votes.get(row["id"], {})
    empty = {"decision": None, "read": False}
    other = other_user(user)
    return {
        "id": row["id"],
        "n": row["ext_id"],
        "title": row["title"],
        "original": row["original"] if row["original"] != row["title"] else "",
        "author": row["author"],
        "level": row["level"],
        "season": season,
        "blurb": row["blurb"] if "blurb" in row.keys() else "",
        "extra": {k: v for k, v in extra.items() if k not in HIDDEN_FIELDS},
        "goodreads": "https://www.goodreads.com/search?q=" + quote_plus(q),
        "me": v.get(user, empty),
        "other": {"user": other, **v.get(other, empty)} if other else None,
    }


def stats(db, user):
    total = db.execute("SELECT COUNT(*) FROM books").fetchone()[0]
    s = {"total": total, "want": 0, "reject": 0, "skip": 0}
    for r in db.execute(
            "SELECT decision, COUNT(*) c FROM votes WHERE username=? AND decision IS NOT NULL GROUP BY decision", (user,)):
        s[r["decision"]] = r["c"]
    s["pending"] = total - s["want"] - s["reject"] - s["skip"]
    s["read"] = db.execute("SELECT COUNT(*) FROM votes WHERE username=? AND is_read=1", (user,)).fetchone()[0]
    s["match"] = db.execute(
        """SELECT COUNT(*) FROM votes v1 JOIN votes v2 ON v2.book_id = v1.book_id AND v2.username = ?
           WHERE v1.username = ? AND v1.decision = 'want' AND v2.decision = 'want'""",
        (other_user(user) or "", user)).fetchone()[0]
    return s


# --------------------------------------------------------------------------- #
# Vistas
# --------------------------------------------------------------------------- #
@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        user = _norm(request.form.get("user"))
        if user in USERS and check_password_hash(USERS[user], request.form.get("password", "")):
            session.permanent = True
            session["user"] = user
            nxt = request.args.get("next") or "/"
            return redirect(nxt if nxt.startswith("/") else "/")
        flash("Usuario o contraseña incorrectos")
    return render_template("login.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/")
@login_required
def swipe():
    return render_template("swipe.html", user=session["user"], can_search=session["user"] in SEARCH_USERS)


@app.route("/listas")
@login_required
def lists():
    return render_template("lists.html", user=session["user"], other=other_user(session["user"]))


@app.route("/importar", methods=["GET", "POST"])
@login_required
def import_view():
    db = get_db()
    if request.method == "POST":
        f = request.files.get("file")
        if not f or not f.filename:
            flash("Selecciona un fichero")
        else:
            try:
                r = import_books(db, f.filename, f.read())
                flash(f"Importados {r['added']} libros nuevos ({r['existing']} ya existían, {r['excluded']} excluidos)")
            except Exception as e:  # noqa: BLE001
                flash(f"Error al importar: {e}")
        return redirect(url_for("import_view"))
    total = db.execute("SELECT COUNT(*) FROM books").fetchone()[0]
    return render_template("import.html", user=session["user"], total=total)


# --------------------------------------------------------------------------- #
# API
# --------------------------------------------------------------------------- #
@app.route("/api/next")
@login_required
def api_next():
    """Siguiente libro: primero los no decididos (al azar); luego los pasados, del más antiguo."""
    user = session["user"]
    db = get_db()
    exclude = [int(x) for x in request.args.get("exclude", "").split(",") if x.isdigit()]
    not_in = f"AND b.id NOT IN ({','.join('?' * len(exclude))})" if exclude else ""

    ids = [r["id"] for r in db.execute(
        f"""SELECT b.id FROM books b
            LEFT JOIN votes v ON v.book_id = b.id AND v.username = ?
            WHERE v.decision IS NULL {not_in}""", [user, *exclude])]
    book_id = random.choice(ids) if ids else None
    if book_id is None:
        for excl, params in ((not_in, [user, *exclude]), ("", [user])):
            r = db.execute(
                f"""SELECT b.id FROM books b JOIN votes v ON v.book_id = b.id AND v.username = ?
                    WHERE v.decision = 'skip' {excl} ORDER BY v.updated LIMIT 1""", params).fetchone()
            if r:
                book_id = r["id"]
                break
    book = None
    if book_id is not None:
        row = db.execute("SELECT * FROM books WHERE id=?", (book_id,)).fetchone()
        book = book_dict(row, votes_for(db, [book_id]), user)
    return jsonify(book=book, stats=stats(db, user))


@app.route("/api/search")
@login_required
def api_search():
    """Busca por título, título original o autor (máx. 8)."""
    if session["user"] not in SEARCH_USERS:
        abort(403)
    q = request.args.get("q", "").strip()
    if len(q) < 2:
        return jsonify(books=[])
    like = f"%{q}%"
    rows = get_db().execute(
        """SELECT * FROM books WHERE title LIKE ? OR original LIKE ? OR author LIKE ?
           ORDER BY title LIMIT 8""", (like, like, like)).fetchall()
    votes = votes_for(get_db(), [r["id"] for r in rows])
    return jsonify(books=[book_dict(r, votes, session["user"]) for r in rows])


def upsert_vote(db, user, book_id, **fields):
    if not db.execute("SELECT 1 FROM books WHERE id=?", (book_id,)).fetchone():
        abort(404)
    db.execute("INSERT OR IGNORE INTO votes (username, book_id) VALUES (?,?)", (user, book_id))
    for k, v in fields.items():
        db.execute(f"UPDATE votes SET {k}=?, updated=datetime('now') WHERE username=? AND book_id=?", (v, user, book_id))
    db.commit()


@app.route("/api/vote", methods=["POST"])
@login_required
def api_vote():
    """{book_id, decision: want|reject|skip|null}  (null = deshacer / sin decidir)"""
    data = request.get_json(force=True, silent=True) or {}
    decision = data.get("decision")
    if decision is not None and decision not in DECISIONS:
        abort(400)
    db = get_db()
    user = session["user"]
    upsert_vote(db, user, data.get("book_id"), decision=decision)
    match = False
    if decision == "want" and other_user(user):
        r = db.execute("SELECT decision FROM votes WHERE username=? AND book_id=?",
                       (other_user(user), data.get("book_id"))).fetchone()
        match = bool(r and r["decision"] == "want")
    return jsonify(ok=True, match=match, stats=stats(db, user))


@app.route("/api/read", methods=["POST"])
@login_required
def api_read():
    """{book_id, read: true|false}"""
    data = request.get_json(force=True, silent=True) or {}
    db = get_db()
    upsert_vote(db, session["user"], data.get("book_id"), is_read=1 if data.get("read") else 0)
    return jsonify(ok=True, stats=stats(db, session["user"]))


LIST_QUERIES = {
    # clave: (join/where sobre v1 = yo, v2 = el otro)
    "match": "v1.decision='want' AND v2.decision='want'",
    "want": "v1.decision='want'",
    "skip": "v1.decision='skip'",
    "reject": "v1.decision='reject'",
    "read": "v1.is_read=1",
    "all": "1=1",
}


@app.route("/api/list/<kind>")
@login_required
def api_list(kind):
    if kind not in LIST_QUERIES:
        abort(404)
    user = session["user"]
    db = get_db()
    rows = db.execute(
        f"""SELECT b.* FROM books b
            LEFT JOIN votes v1 ON v1.book_id=b.id AND v1.username=?
            LEFT JOIN votes v2 ON v2.book_id=b.id AND v2.username=?
            WHERE {LIST_QUERIES[kind]}
            ORDER BY b.level, b.title""",
        (user, other_user(user) or ""),
    ).fetchall()
    votes = votes_for(db, [r["id"] for r in rows])
    return jsonify(books=[book_dict(r, votes, user) for r in rows])


@app.route("/health")
def health():
    return "ok"


init_db()

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
