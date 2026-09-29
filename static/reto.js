(() => {
  const root = document.getElementById("reto");
  const $ = (id) => document.getElementById(id);
  const cap = (s) => String(s || "").replace(/^./, (c) => c.toUpperCase());
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const post = (url, body) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  const SEASON_ICON = { Primavera: "🌷", Verano: "☀️", "Otoño": "🍂", Invierno: "❄️" };
  const ME = root.dataset.me, OTHER = cap(root.dataset.other);

  let data = { pool: [], picks: [] };
  let season = null; // null = todas
  let candidate = null;

  function readers(b) {
    const r = [];
    if (b.me.read) r.push("Tú");
    if (b.other && b.other.read) r.push(OTHER);
    if (!r.length) return `<span class="chip">🆕 Nuevo para los dos</span>`;
    return `<span class="chip c-read">✓ ${r.length === 2 ? "Lo habéis leído los dos" : `Lo ha leído ${r[0] === "Tú" ? "tú" : r[0]}`}</span>`;
  }
  function seasonChip(b) {
    return b.season ? `<span class="chip">${SEASON_ICON[b.season] || ""} ${esc(b.season)}</span>` : "";
  }
  function item(b, buttons) {
    return `<li data-id="${b.id}">
      <div class="info">
        <strong>${esc(b.title)}</strong>
        <span class="muted">${esc(b.author)}</span>
        <span class="chips">${seasonChip(b)}${readers(b)}${b.pick ? `<span class="chip muted">elegido por ${esc(b.pick.by === ME ? "ti" : cap(b.pick.by))}</span>` : ""}</span>
      </div>
      <div class="ops">${buttons}</div>
    </li>`;
  }
  const btn = (act, label, title) => `<button class="mini" data-act="${act}" title="${title}">${label}</button>`;

  function poolFiltered() {
    return data.pool.filter((b) => (!season || b.season === season) && (!$("fresh").checked || (!b.me.read && !(b.other && b.other.read))));
  }

  function render() {
    const by = (s) => data.picks.filter((b) => b.pick.status === s);
    const reading = by("reading"), next = by("next"), done = by("done");
    $("reading").innerHTML = reading.map((b) => item(b, btn("done", "✓", "Terminado") + btn("next", "↩", "Volver a próximas"))).join("")
      || `<li class="none muted">Nada ahora mismo. Empezad una de las próximas.</li>`;
    $("next").innerHTML = next.map((b) => item(b, btn("reading", "▶", "Empezar a leer") + btn("remove", "✕", "Quitar del reto"))).join("")
      || `<li class="none muted">Aún no habéis elegido ninguna.</li>`;
    $("done").innerHTML = done.map((b) => item(b, btn("reading", "↩", "Volver a leyendo"))).join("") || `<li class="none muted">Todavía ninguna.</li>`;
    $("donecount").textContent = done.length ? `(${done.length})` : "";

    const mine = data.turn === ME;
    $("turn").innerHTML = data.turn ? (mine ? "🫵 <b>Te toca elegir</b> la próxima lectura." : `⏳ Le toca elegir a <b>${esc(cap(data.turn))}</b>.`) : "";

    const counts = { null: data.pool.length };
    data.pool.forEach((b) => { counts[b.season] = (counts[b.season] || 0) + 1; });
    $("seasons").innerHTML = [null, "Primavera", "Verano", "Otoño", "Invierno"].map((s) =>
      `<button data-s="${s || ""}" class="${season === s ? "on" : ""}">${s ? `${SEASON_ICON[s]} ${s}` : "Todas"} <span class="muted">${counts[s] || 0}</span></button>`).join("");

    const list = poolFiltered();
    $("poolcount").textContent = `${list.length} candidatos`;
    $("roll").disabled = !list.length;
    $("pool").innerHTML = list.map((b) => item(b, btn("add", "➕", "Añadir a próximas"))).join("")
      || `<li class="none muted">No queda ninguno con este filtro.</li>`;
    renderCandidate();
  }

  function renderCandidate() {
    const el = $("candidate");
    if (!candidate) { el.hidden = true; return; }
    const b = candidate;
    el.hidden = false;
    el.innerHTML = `
      <div class="cand-cover">${SEASON_ICON[b.season] || "📖"}</div>
      <h3>${esc(b.title)}</h3>
      ${b.original ? `<p class="orig">${esc(b.original)}</p>` : ""}
      <p class="author">${esc(b.author)}</p>
      ${b.blurb ? `<p class="blurb">${esc(b.blurb)}</p>` : ""}
      <p class="chips">${seasonChip(b)}${readers(b)}</p>
      <div class="cand-ops">
        <button class="btn primary" data-cand="add">➕ Al reto</button>
        <button class="btn" data-cand="again">🔄 Otro</button>
        <a class="btn" href="${esc(b.goodreads)}" target="_blank" rel="noopener">Goodreads</a>
      </div>`;
  }

  async function load() {
    data = await (await fetch("/api/reto")).json();
    if (season === null && !load.done) {
      // Primera vez: arrancamos en la estación actual si hay candidatos de ella
      if (data.pool.some((b) => b.season === data.season)) season = data.season;
      load.done = true;
    }
    if (candidate && !data.pool.some((b) => b.id === candidate.id)) candidate = null;
    render();
  }

  async function setPick(id, status) {
    await post("/api/reto/pick", { book_id: id, status });
    await load();
  }

  function roll() {
    const list = poolFiltered().filter((b) => !candidate || b.id !== candidate.id);
    const all = list.length ? list : poolFiltered();
    if (!all.length) return;
    candidate = all[Math.floor(Math.random() * all.length)];
    renderCandidate();
    $("candidate").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  $("roll").onclick = roll;
  $("fresh").onchange = () => { candidate = null; render(); };
  $("seasons").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    season = b.dataset.s || null; candidate = null; render();
  });
  $("candidate").addEventListener("click", async (e) => {
    const b = e.target.closest("button"); if (!b || !candidate) return;
    if (b.dataset.cand === "again") roll();
    else if (b.dataset.cand === "add") { const id = candidate.id; candidate = null; await setPick(id, "next"); }
  });
  root.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-act]"); if (!b) return;
    const id = +b.closest("li").dataset.id;
    const act = b.dataset.act;
    await setPick(id, act === "add" ? "next" : act === "remove" ? null : act);
  });

  load();
})();
