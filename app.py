"""Coffee & Chapters — "Tinder" de libros para elegir el reto de lectura.

Flask + SQLite, sin dependencias pesadas. Pensado para 2 usuarios.
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

DB_PATH = os.environ.get("DATABASE_PATH", os.path.join(os.path.dirname(__file__), "data", "app.db"))
STATUSES = ("want", "reject", "skip", "read")

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "dev-cambia-esto")
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024  # 20 MB


# --------------------------------------------------------------------------- #
# Usuarios: APP_USERS="vicente:clave1,ana:clave2"
# --------------------------------------------------------------------------- #
def load_users():
    raw = os.environ.get("APP_USERS", "vicente:vicente,invitado:invitado")
    users = {}
    for pair in raw.split(","):
        if ":" in pair:
            name, pwd = pair.split(":", 1)
            users[name.strip().lower()] = generate_password_hash(pwd.strip())
    return users


USERS = load_users()


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if session.get("user") not in USERS:
            if request.path.startswith("/api/"):
                return jsonify(error="no autenticado"), 401
            return redirect(url_for("login", next=request.path))
        return view(*args, **kwargs)
    return wrapper


# --------------------------------------------------------------------------- #
# Base de datos
# --------------------------------------------------------------------------- #
SCHEMA = """
CREATE TABLE IF NOT EXISTS books (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    title   TEXT NOT NULL,
    author  TEXT NOT NULL DEFAULT '',
    extra   TEXT NOT NULL DEFAULT '{}',
    added   TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (title, author)
);
CREATE TABLE IF NOT EXISTS votes (
    username TEXT NOT NULL,
    book_id  INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    status   TEXT NOT NULL CHECK (status IN ('want','reject','skip','read')),
    updated  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (username, book_id)
);
"""


def get_db():
    if "db" not in g:
        os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    with app.app_context():
        get_db().executescript(SCHEMA)


init_db()


def book_dict(row):
    extra = json.loads(row["extra"] or "{}")
    q = f'{row["title"]} {row["author"]}'.strip()
    return {
        "id": row["id"],
        "title": row["title"],
        "author": row["author"],
        "extra": extra,
        "goodreads": "https://www.goodreads.com/search?q=" + quote_plus(q),
    }


# --------------------------------------------------------------------------- #
# Importación Excel / CSV
# --------------------------------------------------------------------------- #
TITLE_KEYS = ("titulo", "título", "title", "libro", "book", "nombre")
AUTHOR_KEYS = ("autor", "autora", "author", "autores", "authors", "escritor")


def _norm(s):
    return str(s or "").strip().lower()


def read_rows(filename, data):
    """Devuelve (cabeceras, filas) de un .xlsx o .csv."""
    name = filename.lower()
    if name.endswith((".xlsx", ".xlsm")):
        from openpyxl import load_workbook
        wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        ws = wb.active
        rows = [list(r) for r in ws.iter_rows(values_only=True)]
    elif name.endswith((".csv", ".txt")):
        text = data.decode("utf-8-sig", errors="replace")
        dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t") if text.strip() else csv.excel
        rows = list(csv.reader(io.StringIO(text), dialect))
    else:
        raise ValueError("Formato no soportado: sube un .xlsx o .csv")
    rows = [r for r in rows if any(c not in (None, "") for c in r)]
    if not rows:
        return [], []
    headers = [str(h).strip() if h is not None else f"col{i+1}" for i, h in enumerate(rows[0])]
    return headers, rows[1:]


def import_books(filename, data):
    headers, rows = read_rows(filename, data)
    if not headers:
        return 0, 0
    low = [_norm(h) for h in headers]
    t_idx = next((i for i, h in enumerate(low) if h in TITLE_KEYS), 0)
    a_idx = next((i for i, h in enumerate(low) if h in AUTHOR_KEYS), None)

    db = get_db()
    added = skipped = 0
    for r in rows:
        r = list(r) + [None] * (len(headers) - len(r))
        title = str(r[t_idx] or "").strip()
        if not title:
            continue
        author = str(r[a_idx] or "").strip() if a_idx is not None else ""
        extra = {}
        for i, h in enumerate(headers):
            if i in (t_idx, a_idx):
                continue
            v = r[i]
            if v not in (None, ""):
                if isinstance(v, float) and v.is_integer():
                    v = int(v)
                extra[h] = str(v).strip()
        cur = db.execute(
            "INSERT OR IGNORE INTO books (title, author, extra) VALUES (?,?,?)",
            (title, author, json.dumps(extra, ensure_ascii=False)),
        )
        if cur.rowcount:
            added += 1
        else:
            skipped += 1
    db.commit()
    return added, skipped


# --------------------------------------------------------------------------- #
# Vistas
# --------------------------------------------------------------------------- #
@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        user = _norm(request.form.get("user"))
        pwd = request.form.get("password", "")
        if user in USERS and check_password_hash(USERS[user], pwd):
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
    return render_template("swipe.html", user=session["user"])


@app.route("/listas")
@login_required
def lists():
    return render_template("lists.html", user=session["user"])


@app.route("/importar", methods=["GET", "POST"])
@login_required
def import_view():
    if request.method == "POST":
        f = request.files.get("file")
        if not f or not f.filename:
            flash("Selecciona un fichero")
        else:
            try:
                added, skipped = import_books(f.filename, f.read())
                flash(f"Importados {added} libros nuevos ({skipped} ya existían)")
            except Exception as e:  # noqa: BLE001
                flash(f"Error al importar: {e}")
        return redirect(url_for("import_view"))
    total = get_db().execute("SELECT COUNT(*) FROM books").fetchone()[0]
    return render_template("import.html", user=session["user"], total=total)


# --------------------------------------------------------------------------- #
# API
# --------------------------------------------------------------------------- #
def other_user(user):
    return next((u for u in USERS if u != user), None)


@app.route("/api/next")
@login_required
def api_next():
    """Siguiente libro: primero los no vistos (al azar); luego los 'pasados', del más antiguo."""
    user = session["user"]
    db = get_db()
    exclude = [int(x) for x in request.args.get("exclude", "").split(",") if x.isdigit()]
    not_in = f"AND b.id NOT IN ({','.join('?' * len(exclude))})" if exclude else ""
    rows = db.execute(
        f"""SELECT b.id FROM books b
            LEFT JOIN votes v ON v.book_id = b.id AND v.username = ?
            WHERE v.book_id IS NULL {not_in}""",
        [user, *exclude],
    ).fetchall()
    row = None
    if rows:
        pick = random.choice(rows)["id"]
        row = db.execute("SELECT * FROM books WHERE id=?", (pick,)).fetchone()
    else:
        row = db.execute(
            f"""SELECT b.* FROM books b JOIN votes v ON v.book_id = b.id AND v.username = ?
                WHERE v.status = 'skip' {not_in} ORDER BY v.updated LIMIT 1""",
            [user, *exclude],
        ).fetchone()
        if row is None and exclude:  # solo queda el que acabas de pasar
            row = db.execute(
                """SELECT b.* FROM books b JOIN votes v ON v.book_id = b.id AND v.username = ?
                   WHERE v.status = 'skip' ORDER BY v.updated LIMIT 1""",
                [user],
            ).fetchone()
    stats = api_stats_data(user)
    if row is None:
        return jsonify(book=None, stats=stats)
    book = book_dict(row)
    other = other_user(user)
    if other:
        ov = db.execute("SELECT status FROM votes WHERE username=? AND book_id=?", (other, row["id"])).fetchone()
        book["other"] = {"user": other, "status": ov["status"] if ov else None}
    return jsonify(book=book, stats=stats)


def api_stats_data(user):
    db = get_db()
    total = db.execute("SELECT COUNT(*) FROM books").fetchone()[0]
    counts = {s: 0 for s in STATUSES}
    for r in db.execute("SELECT status, COUNT(*) c FROM votes WHERE username=? GROUP BY status", (user,)):
        counts[r["status"]] = r["c"]
    counts["pending"] = total - sum(counts.values())
    counts["total"] = total
    return counts


@app.route("/api/vote", methods=["POST"])
@login_required
def api_vote():
    data = request.get_json(force=True, silent=True) or {}
    status = data.get("status")
    book_id = data.get("book_id")
    db = get_db()
    if status is None:  # deshacer
        db.execute("DELETE FROM votes WHERE username=? AND book_id=?", (session["user"], book_id))
    elif status in STATUSES:
        if not db.execute("SELECT 1 FROM books WHERE id=?", (book_id,)).fetchone():
            abort(404)
        db.execute(
            """INSERT INTO votes (username, book_id, status) VALUES (?,?,?)
               ON CONFLICT(username, book_id) DO UPDATE SET status=excluded.status, updated=datetime('now')""",
            (session["user"], book_id, status),
        )
    else:
        abort(400)
    db.commit()
    return jsonify(ok=True, stats=api_stats_data(session["user"]))


@app.route("/api/list/<kind>")
@login_required
def api_list(kind):
    user = session["user"]
    db = get_db()
    if kind == "match":
        other = other_user(user)
        rows = db.execute(
            """SELECT b.*, v1.status AS status FROM books b
               JOIN votes v1 ON v1.book_id=b.id AND v1.username=? AND v1.status='want'
               JOIN votes v2 ON v2.book_id=b.id AND v2.username=? AND v2.status='want'
               ORDER BY b.title""",
            (user, other),
        ).fetchall()
    elif kind in STATUSES:
        rows = db.execute(
            """SELECT b.*, v.status AS status FROM books b
               JOIN votes v ON v.book_id=b.id AND v.username=? AND v.status=?
               ORDER BY v.updated DESC""",
            (user, kind),
        ).fetchall()
    else:
        abort(404)
    return jsonify(books=[{**book_dict(r), "status": r["status"]} for r in rows])


@app.route("/health")
def health():
    return "ok"


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
