(() => {
  const list = document.getElementById("list");
  const desc = document.getElementById("desc");
  const q = document.getElementById("q");
  const tabs = document.getElementById("tabs");
  let kind = "match";
  let books = [];

  const DESC = {
    match: "Libros que los dos queréis leer: candidatos para el reto.",
    want: "Los que has marcado como «quiero leer».",
    read: "Los que ya has leído.",
    skip: "Los que dejaste para más tarde. Volverán a salir cuando acabes con los nuevos.",
    reject: "Los que has descartado.",
  };
  const MOVE = [["want", "♥"], ["read", "✓"], ["skip", "⏭"], ["reject", "✕"]];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function render() {
    const term = q.value.trim().toLowerCase();
    const rows = books.filter((b) => !term || (b.title + " " + b.author).toLowerCase().includes(term));
    if (!rows.length) { list.innerHTML = `<li class="none muted">Nada por aquí todavía.</li>`; return; }
    list.innerHTML = rows.map((b) => `
      <li data-id="${b.id}">
        <div class="info"><strong>${esc(b.title)}</strong><span class="muted">${esc(b.author)}</span></div>
        <div class="ops">
          <a class="mini" href="${esc(b.goodreads)}" target="_blank" rel="noopener" title="Goodreads">?</a>
          ${MOVE.filter(([s]) => s !== b.status).map(([s, ic]) => `<button class="mini ${s}" data-s="${s}" title="Mover">${ic}</button>`).join("")}
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
    const b = e.target.closest("button[data-s]"); if (!b) return;
    const id = +b.closest("li").dataset.id;
    await fetch("/api/vote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ book_id: id, status: b.dataset.s }) });
    load();
  });
  q.addEventListener("input", render);
  load();
})();
