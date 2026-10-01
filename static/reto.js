(() => {
  const root = document.getElementById("reto");
  const $ = (id) => document.getElementById(id);
  const cap = (s) => String(s || "").replace(/^./, (c) => c.toUpperCase());
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const post = (url, body) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  const SEASON_ICON = { Primavera: "🌷", Verano: "☀️", "Otoño": "🍂", Invierno: "❄️" };
  const ME = root.dataset.me;
  const OTHERS = (root.dataset.others || "").split(",").filter(Boolean);
  // Grupo activo del reto: 'all' o una pareja ('and+sento'); miembros sin contarme a mí
  let GROUP = "all";
  let MEMBERS = OTHERS.slice();
  let ALL = MEMBERS.length > 1 ? "todos" : "los dos";
  const names = (l) => { const n = l.map(cap); return n.length <= 1 ? n.join("") : n.slice(0, -1).join(", ") + " y " + n[n.length - 1]; };
  const ADMIN = !!root.dataset.admin; // SEARCH_USERS: puede marcar directamente como leído en el reto

  let data = { pool: [], picks: [] };
  let season = null; // null = todas
  let candidate = null;
  const passed = new Set(); // los que habéis pasado con "Otro": no vuelven a salir hasta agotar el resto

  function readers(b) {
    const others = (b.others || []).filter((o) => o.read && MEMBERS.includes(o.user)).map((o) => o.user);
    const total = (b.me.read ? 1 : 0) + others.length;
    if (!total) return `<span class="chip">🆕 Nuevo para ${ALL}</span>`;
    let txt;
    if (total === MEMBERS.length + 1) txt = `Lo habéis leído ${ALL}`;
    else if (b.me.read && !others.length) txt = "Lo has leído tú";
    else if (b.me.read) txt = `Lo habéis leído tú y ${names(others)}`;
    else txt = `Lo ${others.length > 1 ? "han" : "ha"} leído ${names(others)}`;
    return `<span class="chip c-read">✓ ${txt}</span>`;
  }
  function seasonChip(b) {
    return b.season ? `<span class="chip">${SEASON_ICON[b.season] || ""} ${esc(b.season)}</span>` : "";
  }
  function item(b, buttons) {
    return `<li data-id="${b.id}">
      <div class="info">
        <strong>${esc(b.title)}</strong>
        <span class="muted">${esc(b.author)}</span>
        <span class="chips">${seasonChip(b)}${readers(b)}${b.pick ? `<span class="chip muted">${b.pick.manual ? "apuntado" : "elegido"} por ${esc(b.pick.by === ME ? "ti" : cap(b.pick.by))}</span>` : ""}</span>
      </div>
      <div class="ops">${buttons}</div>
    </li>`;
  }
  const btn = (act, label, title) => `<button class="mini" data-act="${act}" title="${title}">${label}</button>`;

  function poolFiltered() {
    return data.pool.filter((b) => (!season || b.season === season) && (!$("fresh").checked || (!b.me.read && !(b.others || []).some((o) => o.read && MEMBERS.includes(o.user)))));
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
    const poolBtns = btn("add", "➕", "Añadir a próximas") + (ADMIN ? btn("reading", "▶", "Ya lo estamos leyendo") + btn("done", "✓", "Ya lo hemos leído en el reto") : "");
    $("pool").innerHTML = list.map((b) => item(b, poolBtns)).join("")
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
        ${ADMIN ? `<button class="btn" data-cand="done" title="Ya lo habéis leído en el reto">✓ Ya leído</button>` : ""}
        <a class="btn" href="${esc(b.goodreads)}" target="_blank" rel="noopener">Goodreads</a>
      </div>`;
  }

  async function load() {
    data = await (await fetch("/api/reto?group=" + encodeURIComponent(GROUP))).json();
    if (season === null && !load.done) {
      // Primera vez: arrancamos en la estación actual si hay candidatos de ella
      if (data.pool.some((b) => b.season === data.season)) season = data.season;
      load.done = true;
    }
    if (candidate && !data.pool.some((b) => b.id === candidate.id)) candidate = null;
    render();
  }

  async function setPick(id, status) {
    const r = await fetch("/api/reto/pick", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ book_id: id, status, group: GROUP }) });
    if (r.status === 409) alert("Ese libro ya está en el reto de otro grupo.");
    await load();
  }

  function roll() {
    const pool = poolFiltered();
    if (!pool.length) return;
    if (candidate) passed.add(candidate.id);
    let fresh = pool.filter((b) => !passed.has(b.id));
    if (!fresh.length) { // ya habéis visto todos: se empieza otra vuelta
      passed.clear();
      fresh = pool.filter((b) => !candidate || b.id !== candidate.id);
      if (!fresh.length) fresh = pool;
    }
    candidate = fresh[Math.floor(Math.random() * fresh.length)];
    renderCandidate();
    $("candidate").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // Pestañas de grupo (con 3 o más usuarios)
  function setGroup(btn) {
    GROUP = btn.dataset.g;
    MEMBERS = btn.dataset.members.split(",").filter((u) => u && u !== ME);
    ALL = MEMBERS.length > 1 ? "todos" : "los dos";
    const solo = GROUP !== "all";
    if ($("groupdesc")) $("groupdesc").textContent = solo
      ? `Los que queréis leer solo tú y ${names(MEMBERS)} (los demás no los han elegido). Lectura aparte, con su propio turno.`
      : "Los que queréis leer todos: el reto común.";
    $("pooldesc").textContent = `De entre los que queréis leer ${ALL}. Elegís por turnos: quien elige añade uno y le pasa el turno ${MEMBERS.length > 1 ? "al siguiente" : "al otro"}.`;
    candidate = null; passed.clear(); season = null; load.done = false;
    load();
  }
  const groupsEl = $("groups");
  if (groupsEl) groupsEl.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-g]"); if (!b) return;
    groupsEl.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    setGroup(b);
  });

  $("roll").onclick = roll;
  $("fresh").onchange = () => { candidate = null; render(); };
  $("seasons").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    season = b.dataset.s || null; candidate = null; render();
  });
  $("candidate").addEventListener("click", async (e) => {
    const b = e.target.closest("button"); if (!b || !candidate) return;
    if (b.dataset.cand === "again") roll();
    else if (b.dataset.cand === "add" || b.dataset.cand === "done") {
      const id = candidate.id; candidate = null;
      await setPick(id, b.dataset.cand === "add" ? "next" : "done");
    }
  });
  root.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-act]"); if (!b) return;
    const id = +b.closest("li").dataset.id;
    const act = b.dataset.act;
    await setPick(id, act === "add" ? "next" : act === "remove" ? null : act);
  });

  // Apuntar a mano una lectura del reto ya hecha (cualquier libro, aunque no sea coincidencia)
  const pastq = $("pastq"), pastres = $("pastres");
  if (pastq) {
    let timer;
    pastq.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const q = pastq.value.trim();
        if (q.length < 2) { pastres.hidden = true; return; }
        const books = (await (await fetch("/api/search?q=" + encodeURIComponent(q))).json()).books;
        const inReto = new Set(data.picks.map((b) => b.id));
        pastres.innerHTML = books.map((b) => `<li data-id="${b.id}" class="${inReto.has(b.id) ? "muted" : ""}">
          <strong>${esc(b.title)}</strong> <span class="muted">· ${esc(b.author)}</span>${inReto.has(b.id) ? " · ya en el reto" : ""}</li>`).join("")
          || `<li class="muted">Sin resultados</li>`;
        pastres.hidden = false;
      }, 200);
    });
    pastres.addEventListener("click", async (e) => {
      const li = e.target.closest("li[data-id]"); if (!li) return;
      pastq.value = ""; pastres.hidden = true;
      await setPick(+li.dataset.id, "done");
      $("donebox").open = true;
    });
  }

  if (groupsEl) setGroup(groupsEl.querySelector("button.on")); else load();
})();
