(() => {
  const deck = document.getElementById("deck");
  const empty = document.getElementById("empty");
  const statsEl = document.getElementById("stats");
  const undoBtn = document.getElementById("b-undo");
  const readBtn = document.getElementById("b-read");
  const history = []; // [{book, prev}]
  let current = null; // {book, el}
  let busy = false;

  const LABEL = { want: "♥ LEER", reject: "✕ DESCARTAR", skip: "⏭ PASAR" };
  const OTHER = { want: "quiere leerlo", reject: "lo descarta", skip: "lo ha pasado" };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const post = (url, body) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  const cap = (s) => String(s || "").replace(/^./, (c) => c.toUpperCase());

  function renderStats(s) {
    if (!s) return;
    const done = s.want + s.reject;
    const pct = s.total ? Math.round((done / s.total) * 100) : 0;
    statsEl.innerHTML = `
      <div class="bar"><span style="width:${pct}%"></span></div>
      <div class="nums"><span>${s.pending} por decidir</span><span class="c-want">♥ ${s.want}</span><span class="c-skip">⏭ ${s.skip}</span><span class="c-reject">✕ ${s.reject}</span><span class="c-read">✓ ${s.read}</span><a class="c-match" href="/listas">💞 ${s.match}</a></div>`;
  }

  function otherLine(o) {
    if (!o || (!o.decision && !o.read)) return "";
    const parts = [];
    if (o.decision) parts.push(OTHER[o.decision]);
    if (o.read) parts.push("ya lo ha leído");
    return `<p class="other ${o.decision || "read"}">${esc(cap(o.user))} ${parts.join(" · ")}</p>`;
  }

  const SEASONS = {
    primavera: { icon: "🌷", label: "Lectura de primavera" },
    verano: { icon: "☀️", label: "Lectura de verano" },
    otono: { icon: "🍂", label: "Lectura de otoño" },
    invierno: { icon: "❄️", label: "Lectura de invierno" },
  };
  const seasonKey = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  function cardHTML(b) {
    const { "Por qué": why, ...rest } = b.extra || {};
    const rows = Object.entries(rest)
      .map(([k, v]) => `<div class="kv"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
    const se = SEASONS[seasonKey(b.season)];
    return `
      ${se ? `<span class="season-chip">${se.icon} ${se.label}</span>` : ""}
      <a class="gr" href="${esc(b.goodreads)}" target="_blank" rel="noopener" title="Buscar en Goodreads (?)">?</a>
      <div class="stamp"></div>
      <div class="cover">${se ? se.icon : "📖"}</div>
      <h2>${esc(b.title)}</h2>
      ${b.original ? `<p class="orig">${esc(b.original)}</p>` : ""}
      ${b.author ? `<p class="author">${esc(b.author)}</p>` : ""}
      ${b.me.decision === "skip" ? `<p class="again">⏭ Lo pasaste antes</p>` : ""}
      ${rows ? `<dl>${rows}</dl>` : ""}
      ${why ? `<p class="why">“${esc(why)}”</p>` : ""}
      ${otherLine(b.other)}`;
  }

  function syncRead() {
    const on = !!(current && current.book.me.read);
    readBtn.classList.toggle("on", on);
    readBtn.setAttribute("aria-pressed", on);
    readBtn.title = on ? "Marcado como leído (L para quitar)" : "Marcar como leído (L)";
    if (current) current.el.classList.toggle("is-read", on);
  }

  function show(book) {
    deck.querySelectorAll(".card").forEach((c) => c.remove());
    if (!book) { current = null; empty.hidden = false; readBtn.disabled = true; syncRead(); return; }
    empty.hidden = true;
    readBtn.disabled = false;
    const el = document.createElement("article");
    el.className = "card enter season-" + (seasonKey(book.season) || "none");
    el.innerHTML = cardHTML(book);
    deck.appendChild(el);
    requestAnimationFrame(() => el.classList.remove("enter"));
    current = { book, el };
    syncRead();
    attachDrag(el);
  }

  async function loadNext(exclude) {
    const r = await fetch("/api/next" + (exclude ? `?exclude=${exclude}` : ""));
    if (r.status === 401) return (location.href = "/login");
    const d = await r.json();
    renderStats(d.stats);
    show(d.book);
  }

  async function decide(decision) {
    if (!current || busy) return;
    busy = true;
    const { book, el } = current;
    const dir = { want: [1, 0], reject: [-1, 0], skip: [0, -1] }[decision];
    const stamp = el.querySelector(".stamp");
    stamp.textContent = LABEL[decision];
    stamp.className = "stamp show " + decision;
    el.classList.add("fly");
    el.style.transform = `translate(${dir[0] * 140}vw, ${dir[1] * 120}vh) rotate(${dir[0] * 30}deg)`;
    el.style.opacity = 0;
    try {
      const d = await post("/api/vote", { book_id: book.id, decision });
      history.push({ book, prev: book.me.decision });
      if (d.match) showMatch(book);
      undoBtn.disabled = false;
      await new Promise((res) => setTimeout(res, 220));
      await loadNext(decision === "skip" ? book.id : "");
    } finally { busy = false; }
  }

  // 💞 Efecto de match: los dos queréis leerlo → "Nos lo quedamos"
  function showMatch(book) {
    const other = cap(book.other && book.other.user);
    const ov = document.createElement("div");
    ov.className = "match-overlay";
    const bits = ["💞", "☕", "📚", "💕", "✨", "📖", "🍂"];
    const confetti = Array.from({ length: 26 }, (_, i) => {
      const x = Math.random() * 100, d = 1.6 + Math.random() * 1.6, delay = Math.random() * 0.6, size = 18 + Math.random() * 22;
      return `<span class="bit" style="left:${x}%;font-size:${size}px;animation-duration:${d}s;animation-delay:${delay}s">${bits[i % bits.length]}</span>`;
    }).join("");
    ov.innerHTML = `${confetti}
      <div class="match-box">
        <div class="match-cups">☕<span>💞</span>☕</div>
        <h3>¡Nos lo quedamos!</h3>
        <p><strong>${esc(book.title)}</strong></p>
        <p class="muted">Tú y ${esc(other)} queréis leerlo</p>
        <button class="btn primary">Seguir deslizando</button>
      </div>`;
    document.body.appendChild(ov);
    if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
    const close = () => { ov.classList.add("out"); setTimeout(() => ov.remove(), 300); };
    ov.addEventListener("click", close);
    setTimeout(close, 3500);
  }

  async function toggleRead() {
    if (!current || busy) return;
    const b = current.book;
    b.me.read = !b.me.read;
    syncRead();
    const d = await post("/api/read", { book_id: b.id, read: b.me.read });
    renderStats(d.stats);
  }

  async function undo() {
    if (busy || !history.length) return;
    busy = true;
    const { book, prev } = history.pop();
    try {
      const d = await post("/api/vote", { book_id: book.id, decision: prev });
      book.me.decision = prev;
      renderStats(d.stats);
      show(book);
    } finally { busy = false; undoBtn.disabled = !history.length; }
  }

  function attachDrag(el) {
    let sx = 0, sy = 0, dx = 0, dy = 0, dragging = false;
    const stamp = el.querySelector(".stamp");
    el.querySelector(".gr").addEventListener("pointerdown", (e) => e.stopPropagation());

    el.addEventListener("pointerdown", (e) => {
      if (busy) return;
      dragging = true; sx = e.clientX; sy = e.clientY; dx = dy = 0;
      el.setPointerCapture(e.pointerId);
      el.classList.add("drag");
    });
    el.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      dx = e.clientX - sx; dy = e.clientY - sy;
      el.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 18}deg)`;
      const s = pick(dx, dy, 40);
      stamp.className = "stamp" + (s ? " show " + s : "");
      stamp.textContent = s ? LABEL[s] : "";
      stamp.style.opacity = s ? Math.min(1, Math.max(Math.abs(dx), Math.abs(dy)) / 120) : 0;
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      el.classList.remove("drag");
      stamp.style.opacity = "";
      const s = pick(dx, dy, 110);
      if (s) decide(s);
      else { el.style.transform = ""; stamp.className = "stamp"; }
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  // → leer · ← descartar · ↑ pasar
  function pick(dx, dy, th) {
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx > th) return "want";
      if (dx < -th) return "reject";
    } else if (dy < -th) return "skip";
    return null;
  }

  document.getElementById("b-want").onclick = () => decide("want");
  document.getElementById("b-reject").onclick = () => decide("reject");
  document.getElementById("b-skip").onclick = () => decide("skip");
  readBtn.onclick = toggleRead;
  undoBtn.onclick = undo;

  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input,textarea")) return;
    const k = { ArrowRight: "want", ArrowLeft: "reject", ArrowUp: "skip" }[e.key];
    if (k) { e.preventDefault(); decide(k); }
    else if (e.key === "l" || e.key === "L") { e.preventDefault(); toggleRead(); }
    else if (e.key === "Backspace" || (e.key === "z" && (e.ctrlKey || e.metaKey))) { e.preventDefault(); undo(); }
    else if (e.key === "?" && current) window.open(current.book.goodreads, "_blank", "noopener");
  });

  // 🔎 Buscador (solo para quien lo tenga activado): carga el libro elegido como tarjeta
  const findQ = document.getElementById("find-q");
  const findRes = document.getElementById("find-res");
  if (findQ) {
    const STATE = { want: "♥", skip: "⏭", reject: "✕" };
    let timer = null, results = [];
    findQ.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const q = findQ.value.trim();
        if (q.length < 2) { findRes.hidden = true; return; }
        results = (await (await fetch("/api/search?q=" + encodeURIComponent(q))).json()).books;
        findRes.innerHTML = results.length
          ? results.map((b, i) => `<li data-i="${i}"><strong>${esc(b.title)}</strong> <span class="muted">${esc(b.author)}</span>
              <span class="st">${b.me.decision ? STATE[b.me.decision] : ""}${b.me.read ? " ✓" : ""}</span></li>`).join("")
          : `<li class="muted">Sin resultados</li>`;
        findRes.hidden = false;
      }, 200);
    });
    findRes.addEventListener("click", (e) => {
      const li = e.target.closest("li[data-i]"); if (!li) return;
      show(results[+li.dataset.i]);
      findQ.value = ""; findRes.hidden = true; findQ.blur();
    });
    findQ.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { findQ.value = ""; findRes.hidden = true; findQ.blur(); }
      if (e.key === "Enter" && results[0] && !findRes.hidden) { show(results[0]); findQ.value = ""; findRes.hidden = true; findQ.blur(); }
    });
  }

  loadNext();
})();
