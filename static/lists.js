(() => {
  const list = document.getElementById("list");
  const desc = document.getElementById("desc");
  const count = document.getElementById("count");
  const q = document.getElementById("q");
  const tabs = document.getElementById("tabs");
  const OTHER = list.dataset.other.replace(/^./, (c) => c.toUpperCase());
  let kind = "match";
  let books = [];

  const DESC = {
    match: "Los que queréis leer los dos: estos son los que entran en el reto.",
    want: "Los que has marcado para leer. «Releer» = ya lo habías leído y quieres volver a él.",
    skip: "Los que dejaste para más tarde. Vuelven a salir al acabar con los nuevos.",
    reject: "Los que has descartado.",
    read: "Los que ya has leído, con lo que has decidido sobre releerlos.",
    all: "Todos los libros, con el estado de los dos.",
  };
  const ICON = { want: "♥", skip: "⏭", reject: "✕" };
  const WORD = { want: "leer", skip: "pasado", reject: "descartado" };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const post = (url, body) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  function chip(who, v) {
    const parts = [];
    if (v.decision) parts.push(`<span class="c-${v.decision}">${ICON[v.decision]} ${v.read && v.decision === "want" ? "releer" : WORD[v.decision]}</span>`);
    if (v.read) parts.push(`<span class="c-read">✓ leído</span>`);
    if (!parts.length) parts.push(`<span class="muted">sin decidir</span>`);
    return `<span class="chip"><b>${esc(who)}</b> ${parts.join(" · ")}</span>`;
  }

  function render() {
    const term = q.value.trim().toLowerCase();
    const rows = books.filter((b) => !term || [b.title, b.original, b.author].join(" ").toLowerCase().includes(term));
    count.textContent = `${rows.length} libros`;
    if (!rows.length) { list.innerHTML = `<li class="none muted">Nada por aquí todavía.</li>`; return; }
    list.innerHTML = rows.map((b) => `
      <li data-id="${b.id}">
        <div class="info">
          <strong>${esc(b.title)}</strong>
          <span class="muted">${esc(b.author)}${b.level ? ` · ${esc(b.level)}` : ""}</span>
          <span class="chips">${chip("Tú", b.me)}${OTHER ? chip(OTHER, b.other) : ""}</span>
        </div>
        <div class="ops">
          <a class="mini" href="${esc(b.goodreads)}" target="_blank" rel="noopener" title="Goodreads">?</a>
          ${["want", "skip", "reject"].map((s) => `<button class="mini ${s} ${b.me.decision === s ? "on" : ""}" data-s="${s}" title="${WORD[s]}">${ICON[s]}</button>`).join("")}
          <button class="mini read ${b.me.read ? "on" : ""}" data-read="${b.me.read ? 0 : 1}" title="${b.me.read ? "Quitar leído" : "Marcar leído"}">✓</button>
        </div>
      </li>`).join("");
  }

  async function load() {
    desc.textContent = DESC[kind];
    list.innerHTML = `<li class="none muted">Cargando…</li>`;
    const r = await fetch("/api/list/" + kind);
    books = (await r.json()).books;
    render();
  }

  tabs.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    tabs.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    kind = b.dataset.k; load();
  });
  list.addEventListener("click", async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const id = +b.closest("li").dataset.id;
    const book = books.find((x) => x.id === id);
    if (b.dataset.s) {
      const decision = b.classList.contains("on") ? null : b.dataset.s;
      const d = await (await post("/api/vote", { book_id: id, decision })).json();
      book.me.decision = decision;
      if (d.match) toast(`🤜🤛 ¡Nos lo quedamos! ${book.title}`);
    } else if (b.dataset.read) {
      const read = b.dataset.read === "1";
      await post("/api/read", { book_id: id, read });
      book.me.read = read;
    }
    render(); // se queda en la lista hasta cambiar de pestaña, para no perder el sitio
  });
  function toast(msg) {
    const t = document.createElement("div");
    t.className = "toast"; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add("out"), 2600);
    setTimeout(() => t.remove(), 3000);
  }

  q.addEventListener("input", render);
  load();
})();
