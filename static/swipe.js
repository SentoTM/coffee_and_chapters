(() => {
  const deck = document.getElementById("deck");
  const empty = document.getElementById("empty");
  const statsEl = document.getElementById("stats");
  const undoBtn = document.getElementById("b-undo");
  const history = [];
  let current = null;   // {book, el}
  let busy = false;

  const LABEL = { want: "♥ QUIERO", reject: "✕ PASO", skip: "⏭ LUEGO", read: "✓ LEÍDO" };
  const OTHER = { want: "lo quiere leer", reject: "lo ha descartado", read: "ya lo ha leído", skip: "lo ha dejado para luego" };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function renderStats(s) {
    if (!s) return;
    const done = s.total - s.pending - s.skip;
    const pct = s.total ? Math.round((done / s.total) * 100) : 0;
    statsEl.innerHTML = `
      <div class="bar"><span style="width:${pct}%"></span></div>
      <div class="nums"><span>${s.pending} por ver</span><span>♥ ${s.want}</span><span>✓ ${s.read}</span><span>⏭ ${s.skip}</span><span>✕ ${s.reject}</span></div>`;
  }

  function cardHTML(b) {
    const extra = Object.entries(b.extra || {})
      .map(([k, v]) => `<div class="kv"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
    const other = b.other && b.other.status
      ? `<p class="other ${b.other.status}">${esc(b.other.user)} ${OTHER[b.other.status]}</p>` : "";
    return `
      <a class="gr" href="${esc(b.goodreads)}" target="_blank" rel="noopener" title="Buscar en Goodreads">?</a>
      <div class="stamp"></div>
      <div class="cover">📖</div>
      <h2>${esc(b.title)}</h2>
      ${b.author ? `<p class="author">${esc(b.author)}</p>` : ""}
      ${extra ? `<dl>${extra}</dl>` : ""}
      ${other}`;
  }

  function show(book) {
    deck.querySelectorAll(".card").forEach((c) => c.remove());
    if (!book) { current = null; empty.hidden = false; return; }
    empty.hidden = true;
    const el = document.createElement("article");
    el.className = "card enter";
    el.innerHTML = cardHTML(book);
    deck.appendChild(el);
    requestAnimationFrame(() => el.classList.remove("enter"));
    current = { book, el };
    attachDrag(el);
  }

  async function loadNext(exclude) {
    const r = await fetch("/api/next" + (exclude ? `?exclude=${exclude}` : ""));
    if (r.status === 401) return (location.href = "/login");
    const d = await r.json();
    renderStats(d.stats);
    show(d.book);
  }

  async function vote(status) {
    if (!current || busy) return;
    busy = true;
    const { book, el } = current;
    const dir = { want: [1, 0], reject: [-1, 0], skip: [0, -1], read: [0, 1] }[status];
    el.classList.add("fly");
    el.querySelector(".stamp").textContent = LABEL[status];
    el.querySelector(".stamp").className = "stamp show " + status;
    el.style.transform = `translate(${dir[0] * 140}vw, ${dir[1] * 120}vh) rotate(${dir[0] * 30}deg)`;
    el.style.opacity = 0;
    try {
      await fetch("/api/vote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ book_id: book.id, status }) });
      history.push(book);
      undoBtn.disabled = false;
      await new Promise((res) => setTimeout(res, 220));
      await loadNext(status === "skip" ? book.id : "");
    } finally { busy = false; }
  }

  async function undo() {
    if (busy || !history.length) return;
    busy = true;
    const book = history.pop();
    try {
      const r = await fetch("/api/vote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ book_id: book.id, status: null }) });
      const d = await r.json();
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
      if (s) vote(s);
      else { el.style.transform = ""; stamp.className = "stamp"; }
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  // → quiero · ← rechazo · ↑ pasar (↓ no hace nada: "leído" va por botón)
  function pick(dx, dy, th) {
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx > th) return "want";
      if (dx < -th) return "reject";
    } else if (dy < -th) return "skip";
    return null;
  }

  document.getElementById("b-want").onclick = () => vote("want");
  document.getElementById("b-reject").onclick = () => vote("reject");
  document.getElementById("b-skip").onclick = () => vote("skip");
  document.getElementById("b-read").onclick = () => vote("read");
  undoBtn.onclick = undo;

  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input,textarea")) return;
    const k = { ArrowRight: "want", ArrowLeft: "reject", ArrowUp: "skip", l: "read", L: "read" }[e.key];
    if (k) { e.preventDefault(); vote(k); }
    else if (e.key === "Backspace" || (e.key === "z" && (e.ctrlKey || e.metaKey))) { e.preventDefault(); undo(); }
    else if (e.key === "?" && current) window.open(current.book.goodreads, "_blank", "noopener");
  });

  loadNext();
})();
