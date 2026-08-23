const API = "/api";
const TOKEN_KEY = "teamstats_admin_token";
const COMPETITION_KEY = "teamstats_competition_id";
const ROUND_ORDER = ["Achtste finale", "Kwartfinale", "Halve finale", "Troostfinale", "Finale"];

let players = [];
let matches = [];
let teams = [];
let results = [];
let competitions = [];
let currentCompetitionId = null;
let teamsLoadedForCompetition = null;

function currentCompetition() {
  return competitions.find((c) => c.id === currentCompetitionId);
}
function isTournament() {
  return currentCompetition()?.type === "toernooi";
}

/* ---------- Auth (bewerken vs. alleen bekijken) ---------- */

function getAdminToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}
function setAdminToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}
function isUnlocked() {
  return !!getAdminToken();
}

function applyLockState() {
  const unlocked = isUnlocked();
  document.body.classList.toggle("is-unlocked", unlocked);
  document.querySelectorAll(".admin-only").forEach((el) => {
    el.style.display = unlocked ? "" : "none";
  });
  document.getElementById("lock-icon").textContent = unlocked ? "🔓" : "🔒";
  const lockLabel = unlocked ? "Bewerken vergrendelen" : "Bewerken ontgrendelen";
  document.getElementById("btn-lock").title = lockLabel;
  document.getElementById("btn-lock").setAttribute("aria-label", lockLabel);
}

/* ---------- Helpers ---------- */

let openModalCount = 0;
function lockBodyScroll() {
  openModalCount++;
  document.body.classList.add("modal-open");
}
function unlockBodyScroll() {
  openModalCount = Math.max(0, openModalCount - 1);
  if (openModalCount === 0) document.body.classList.remove("modal-open");
}

function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => (el.hidden = true), 2200);
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", "X-Admin-Token": getAdminToken(), ...(options.headers || {}) };

  const res = await fetch(`${API}${path}`, { ...options, headers });
  if (!res.ok) {
    let msg = `Fout (${res.status})`;
    try { const body = await res.json(); msg = body.error || msg; } catch {}
    if (res.status === 401) {
      msg = "Je bent niet ontgrendeld om te bewerken. Klik op het hangslotje.";
    }
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" }) +
    " · " + d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

/* ---------- Competities ---------- */

async function loadCompetitions(preferId) {
  competitions = await api("/competitions");

  if (competitions.length === 0) {
    currentCompetitionId = null;
    renderCompetitionSelect();
    updateCompetitionContext();
    return;
  }

  const stored = Number(localStorage.getItem(COMPETITION_KEY));
  const preferred = preferId ?? stored;
  currentCompetitionId = competitions.some((c) => c.id === preferred) ? preferred : competitions[0].id;
  localStorage.setItem(COMPETITION_KEY, String(currentCompetitionId));

  renderCompetitionSelect();
  updateCompetitionContext();
}

function renderCompetitionSelect() {
  const select = document.getElementById("competition-select");
  if (competitions.length === 0) {
    select.innerHTML = '<option value="">— Geen competities —</option>';
    return;
  }
  select.innerHTML = competitions.map((c) => `
    <option value="${c.id}">${escapeHtml(c.name)}${c.status === "afgesloten" ? " (afgesloten)" : ""}</option>
  `).join("");
  select.value = currentCompetitionId;
}

function updateCompetitionContext() {
  const comp = currentCompetition();
  const badge = document.getElementById("competition-type-badge");
  badge.textContent = comp ? (comp.type === "toernooi" ? "Toernooi" : "Competitie") : "";

  const wedstrijdenSub = document.getElementById("wedstrijden-sub");
  const standSub = document.getElementById("stand-sub");
  wedstrijdenSub.textContent = comp ? `Schema en uitslagen van FC Caesar Salad — ${comp.name}.` : "Maak eerst een competitie aan.";
  standSub.textContent = comp ? `Stand van ${comp.name}.` : "Maak eerst een competitie aan.";
  updateStatsSub();
}

function updateStatsSub() {
  const statsSub = document.getElementById("statistieken-sub");
  const comp = currentCompetition();
  statsSub.textContent = document.getElementById("stats-alltime-toggle").checked
    ? "Spelers, teamvorm en statistieken van alle competities/toernooien samen."
    : comp
      ? `Spelers, teamvorm en statistieken van ${comp.name}.`
      : "Maak eerst een competitie aan.";
}

document.getElementById("competition-select").addEventListener("change", async (e) => {
  currentCompetitionId = Number(e.target.value);
  localStorage.setItem(COMPETITION_KEY, String(currentCompetitionId));
  teamsLoadedForCompetition = null;
  updateCompetitionContext();
  await loadMatches();
  const activeTab = document.querySelector(".tab.is-active")?.dataset.tab;
  if (activeTab === "stand") await loadStandView();
  if (activeTab === "statistieken") await loadStats();
});

const competitionModal = document.getElementById("competition-modal");

function openCompetitionModal(comp = null) {
  document.getElementById("competition-modal-title").textContent = comp ? "Competitie bewerken" : "Competitie toevoegen";
  document.getElementById("competition-id").value = comp?.id || "";
  document.getElementById("competition-name").value = comp?.name || "";
  document.getElementById("competition-type").value = comp?.type || "competitie";
  document.getElementById("competition-status").value = comp?.status || "actief";
  document.getElementById("competition-delete").hidden = !comp;
  competitionModal.hidden = false;
  lockBodyScroll();
}
function closeCompetitionModal() { competitionModal.hidden = true; unlockBodyScroll(); }

document.getElementById("btn-new-competition").addEventListener("click", () => openCompetitionModal());
document.getElementById("btn-edit-competition").addEventListener("click", () => {
  const comp = currentCompetition();
  if (!comp) { showToast("Geen competitie geselecteerd"); return; }
  openCompetitionModal(comp);
});
document.getElementById("competition-modal-close").addEventListener("click", closeCompetitionModal);
document.getElementById("competition-cancel").addEventListener("click", closeCompetitionModal);

document.getElementById("competition-save").addEventListener("click", async () => {
  const id = document.getElementById("competition-id").value;
  const name = document.getElementById("competition-name").value.trim();
  const type = document.getElementById("competition-type").value;
  const status = document.getElementById("competition-status").value;
  if (!name) { showToast("Vul een naam in"); return; }

  try {
    let saved;
    if (id) {
      saved = await api(`/competitions?id=${id}`, { method: "PUT", body: JSON.stringify({ name, type, status }) });
    } else {
      saved = await api("/competitions", { method: "POST", body: JSON.stringify({ name, type, status }) });
    }
    closeCompetitionModal();
    await loadCompetitions(id ? undefined : saved.id);
    await Promise.all([loadMatches(), loadStandView(), loadStats()]);
    showToast("Competitie opgeslagen");
  } catch (e) { showToast(e.message); }
});

document.getElementById("competition-delete").addEventListener("click", async () => {
  const id = document.getElementById("competition-id").value;
  const comp = competitions.find((c) => String(c.id) === String(id));
  if (!comp) return;
  if (!confirm(`"${comp.name}" verwijderen? Alle teams, wedstrijden en uitslagen van deze competitie verdwijnen.`)) return;
  try {
    await api(`/competitions?id=${id}`, { method: "DELETE" });
    closeCompetitionModal();
    await loadCompetitions();
    await Promise.all([loadMatches(), loadStandView(), loadStats()]);
    showToast("Competitie verwijderd");
  } catch (e) { showToast(e.message); }
});

/* ---------- Tabs ---------- */

const TAB_NAMES = [...document.querySelectorAll(".tab")].map((t) => t.dataset.tab);

// Activeert een tab zonder de URL aan te passen (dat doet de aanroeper),
// zodat dit ook vanuit hashchange/init hergebruikt kan worden.
function activateTab(tabName) {
  const btn = document.querySelector(`.tab[data-tab="${tabName}"]`);
  if (!btn) return;
  document.querySelectorAll(".tab").forEach((t) => { t.classList.remove("is-active"); t.setAttribute("aria-selected", "false"); });
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("is-active"));
  btn.classList.add("is-active");
  btn.setAttribute("aria-selected", "true");
  document.getElementById(`view-${tabName}`).classList.add("is-active");
  if (tabName === "statistieken") loadStats();
  if (tabName === "stand") loadStandView();
  if (tabName === "aanmelden") loadSignups();
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    activateTab(btn.dataset.tab);
    history.replaceState(null, "", `#${btn.dataset.tab}`);
  });
});

// Zo kan een tab gedeeld/gebookmarkt worden (bijv. een link naar #aanmelden)
// en blijft de juiste tab actief na verversen of via de terug/vooruit-knop.
window.addEventListener("hashchange", () => {
  const tab = location.hash.slice(1);
  if (TAB_NAMES.includes(tab)) activateTab(tab);
});

/* ---------- Load & render: players ---------- */

async function loadPlayers() {
  players = await api("/players");
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- Teambadges ---------- */
// Elk team krijgt een kleur + initialen, deterministisch berekend uit de
// naam (dezelfde naam geeft altijd dezelfde kleur) — geen instelling of
// upload nodig, ook niet voor een gloednieuwe tegenstander. Het eigen team
// (is_own_team) krijgt in plaats daarvan het echte logo.
function teamColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${hash % 360}, 58%, 42%)`;
}
function teamInitials(name) {
  const words = name.trim().split(/\s+/);
  return words.length === 1
    ? words[0].slice(0, 2).toUpperCase()
    : (words[0][0] + words[1][0]).toUpperCase();
}
function teamBadgeHtml(name, isOwnTeam) {
  if (isOwnTeam) return `<span class="team-badge"><img src="logo.jpeg" alt=""></span>`;
  return `<span class="team-badge team-badge--initials" style="background:${teamColor(name)}">${escapeHtml(teamInitials(name))}</span>`;
}

/* ---------- Player modal ---------- */

const playerModal = document.getElementById("player-modal");
const playerNameRows = document.getElementById("player-name-rows");
const playerAddRowBtn = document.getElementById("player-add-row");

function addPlayerNameRow(value = "") {
  const row = document.createElement("div");
  row.className = "player-name-row";
  row.style.cssText = "display: flex; gap: 8px; align-items: center;";
  row.innerHTML = `
    <input type="text" class="player-name-input" required placeholder="Voor- en achternaam" style="flex: 1;" value="${escapeHtml(value)}">
    <button type="button" class="icon-btn player-name-remove" aria-label="Rij verwijderen">✕</button>
  `;
  row.querySelector(".player-name-remove").addEventListener("click", () => {
    if (playerNameRows.children.length > 1) row.remove();
  });
  playerNameRows.appendChild(row);
}

function openPlayerModal(player = null) {
  document.getElementById("player-modal-title").textContent = player ? "Speler bewerken" : "Speler(s) toevoegen";
  document.getElementById("player-id").value = player?.id || "";
  playerNameRows.innerHTML = "";
  addPlayerNameRow(player?.name || "");
  document.getElementById("player-delete").hidden = !player;
  playerAddRowBtn.hidden = !!player;
  playerModal.hidden = false;
  lockBodyScroll();
}
function closePlayerModal() { playerModal.hidden = true; unlockBodyScroll(); }

document.getElementById("btn-new-player").addEventListener("click", () => openPlayerModal());
document.getElementById("player-modal-close").addEventListener("click", closePlayerModal);
document.getElementById("player-cancel").addEventListener("click", closePlayerModal);
playerAddRowBtn.addEventListener("click", () => addPlayerNameRow());

document.getElementById("player-save").addEventListener("click", async () => {
  const id = document.getElementById("player-id").value;
  const names = [...playerNameRows.querySelectorAll(".player-name-input")]
    .map((input) => input.value.trim())
    .filter((name) => name.length > 0);
  if (names.length === 0) { showToast("Vul minstens één naam in"); return; }
  try {
    if (id) {
      await api(`/players?id=${id}`, { method: "PUT", body: JSON.stringify({ name: names[0] }) });
    } else {
      for (const name of names) {
        await api("/players", { method: "POST", body: JSON.stringify({ name }) });
      }
    }
    closePlayerModal();
    await Promise.all([loadPlayers(), loadStats()]);
    showToast(names.length > 1 ? `${names.length} spelers opgeslagen` : "Speler opgeslagen");
  } catch (e) { showToast(e.message); }
});

document.getElementById("player-delete").addEventListener("click", async () => {
  const id = document.getElementById("player-id").value;
  const p = players.find((x) => String(x.id) === String(id));
  if (p) await deletePlayer(p, true);
});

async function deletePlayer(player, fromModal = false) {
  if (!confirm(`"${player.name}" verwijderen? Statistieken van deze speler verdwijnen ook.`)) return;
  try {
    await api(`/players?id=${player.id}`, { method: "DELETE" });
    if (fromModal) closePlayerModal();
    await Promise.all([loadPlayers(), loadStats()]);
    showToast("Speler verwijderd");
  } catch (e) { showToast(e.message); }
}

/* ---------- Load & render: matches ---------- */

async function loadMatches() {
  if (!currentCompetitionId) { matches = []; renderMatches(); return; }
  matches = await api(`/matches?competition_id=${currentCompetitionId}`);
  renderMatches();
  populateGroupNameList();
}

function renderMatches() {
  const upcoming = matches.filter((m) => m.status !== "gespeeld").sort((a, b) => new Date(a.match_date) - new Date(b.match_date));
  const played = matches.filter((m) => m.status === "gespeeld").sort((a, b) => new Date(b.match_date) - new Date(a.match_date));

  renderTicketList("list-upcoming", "empty-upcoming", upcoming);
  renderTicketList("list-played", "empty-played", played);

  const emptyUpcoming = document.getElementById("empty-upcoming");
  if (upcoming.length === 0) {
    const comp = currentCompetition();
    emptyUpcoming.textContent = comp?.status === "afgesloten"
      ? (comp.type === "toernooi" ? "Dit toernooi is afgesloten." : "Deze competitie is afgesloten.")
      : "Nog geen wedstrijden gepland.";
  }
}

function renderTicketList(listId, emptyId, list) {
  const el = document.getElementById(listId);
  const empty = document.getElementById(emptyId);
  el.innerHTML = "";
  empty.hidden = list.length > 0;

  for (const m of list) {
    const div = document.createElement("div");
    let resultClass = "";
    if (m.status === "gespeeld" && m.goals_for != null && m.goals_against != null) {
      resultClass = m.goals_for > m.goals_against ? "is-win" : m.goals_for < m.goals_against ? "is-loss" : "is-draw";
    } else if (m.status === "afgelast") {
      resultClass = "is-cancelled";
    }
    div.className = `ticket ${resultClass}`;
    const scoreHtml = (m.status === "gespeeld" && m.goals_for != null && m.goals_against != null)
      ? `${m.goals_for} – ${m.goals_against}`
      : `<span class="ticket__score--pending">${m.status === "afgelast" ? "Afgelast" : "Gepland"}</span>`;

    const mvp = m.mvp_player_id ? players.find((p) => p.id === m.mvp_player_id) : null;

    div.innerHTML = `
      <div class="ticket__bar"></div>
      <div class="ticket__main">
        <span class="ticket__date">${fmtDate(m.match_date)}</span>
        <span class="ticket__opponent team-badge-row">${teamBadgeHtml(m.opponent, false)}<span class="team-badge-row__name">${escapeHtml(m.opponent)}</span></span>
        ${mvp ? `<span class="ticket__meta">⭐ MVP: ${escapeHtml(mvp.name)}</span>` : ""}
      </div>
      <div class="ticket__score">${scoreHtml}</div>
    `;
    div.addEventListener("click", () => openMatchModal(m));
    el.appendChild(div);
  }
  applyLockState();
}

/* ---------- Match modal ---------- */

const matchModal = document.getElementById("match-modal");
let currentMatchStats = [];

function toLocalInputValue(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function openMatchModal(match = null) {
  const unlocked = isUnlocked();
  document.getElementById("match-modal-title").textContent = match
    ? (unlocked ? "Wedstrijd bewerken" : "Wedstrijddetails")
    : "Wedstrijd toevoegen";
  document.getElementById("match-id").value = match?.id || "";
  document.getElementById("match-date").value = match ? toLocalInputValue(match.match_date) : "";
  document.getElementById("match-opponent").value = match?.opponent || "";
  document.getElementById("match-status").value = match?.status || "gepland";
  document.getElementById("match-goals-for").value = match?.goals_for ?? "";
  document.getElementById("match-goals-against").value = match?.goals_against ?? "";
  document.getElementById("match-delete").hidden = !match || !unlocked;
  document.getElementById("match-save").hidden = !unlocked;

  document.querySelectorAll("#match-form input, #match-form select").forEach((el) => { el.disabled = !unlocked; });

  const tournament = isTournament();
  document.getElementById("match-phase-block").hidden = !tournament;
  if (tournament) {
    document.getElementById("match-phase").value = match?.phase === "knockout" ? "knockout" : "groep";
    document.getElementById("match-group").value = match?.group_name || "";
    document.getElementById("match-round").value = match?.round_name || "";
    document.getElementById("match-phase").onchange = toggleMatchPhaseFields;
    toggleMatchPhaseFields();
  }

  if (teamsLoadedForCompetition !== currentCompetitionId) await loadTeams();
  populateOpponentDatalist();

  await toggleStatsBlock();
  document.getElementById("match-status").onchange = toggleStatsBlock;
  document.getElementById("match-mvp").value = match?.mvp_player_id || "";
  document.getElementById("match-own-goals").value = match?.opponent_own_goals ?? 0;
  document.getElementById("match-unknown-goals").value = match?.unknown_goals ?? 0;

  // Bezoeker (niet ontgrendeld) krijgt een compactere popup: eigen/onbekende
  // doelpunten alleen tonen als ze daadwerkelijk gevuld zijn.
  if (!unlocked) {
    if (Number(document.getElementById("match-own-goals").value || 0) === 0) {
      document.getElementById("field-own-goals").hidden = true;
    }
    if (Number(document.getElementById("match-unknown-goals").value || 0) === 0) {
      document.getElementById("field-unknown-goals").hidden = true;
    }
  }

  if (match) {
    currentMatchStats = await api(`/stats?match_id=${match.id}`);
  } else {
    currentMatchStats = [];
  }
  renderMatchStatsRows();
  document.querySelectorAll("#match-stats-rows input").forEach((el) => { el.disabled = !unlocked; });

  matchModal.hidden = false;
  lockBodyScroll();
  matchModal.querySelector(".modal__body").scrollTop = 0;
}

function toggleMatchPhaseFields() {
  const phase = document.getElementById("match-phase").value;
  document.getElementById("field-match-group").hidden = phase !== "groep";
  document.getElementById("field-match-round").hidden = phase !== "knockout";
}

async function toggleStatsBlock() {
  const status = document.getElementById("match-status").value;
  const isPlayed = status === "gespeeld";
  document.getElementById("match-stats-block").hidden = !isPlayed;
  document.getElementById("field-goals-for").hidden = !isPlayed;
  document.getElementById("field-goals-against").hidden = !isPlayed;
  document.getElementById("field-mvp").hidden = !isPlayed;
  document.getElementById("field-own-goals").hidden = !isPlayed;
  document.getElementById("field-unknown-goals").hidden = !isPlayed;
  if (players.length === 0) await loadPlayers();
  renderMvpOptions();
}

function renderMvpOptions() {
  const select = document.getElementById("match-mvp");
  const current = select.value;
  select.innerHTML = '<option value="">— Geen MVP gekozen —</option>' +
    players.filter((p) => p.active !== false)
      .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
      .join("");
  select.value = current;
}

function renderMatchStatsRows() {
  const tbody = document.getElementById("match-stats-rows");
  const empty = document.getElementById("empty-match-stats");
  const unlocked = isUnlocked();
  tbody.innerHTML = "";

  // Bezoeker ziet alleen wie daadwerkelijk aanwezig was, en de
  // "Aanwezig"-kolom zelf is dan overbodig (staat sowieso altijd aan).
  document.getElementById("col-present").hidden = !unlocked;

  const roster = players.filter((p) => p.active !== false)
    .filter((p) => unlocked || currentMatchStats.some((s) => s.player_id === p.id));

  for (const p of roster) {
    const existing = currentMatchStats.find((s) => s.player_id === p.id);
    const tr = document.createElement("tr");
    tr.dataset.playerId = p.id;
    tr.dataset.statId = existing?.id ?? "";
    tr.innerHTML = `
      <td>${escapeHtml(p.name)}</td>
      <td class="num" ${unlocked ? "" : "hidden"}><input type="checkbox" class="s-played" ${existing ? "checked" : ""}></td>
      <td class="num"><input type="number" min="0" class="s-goals" value="${existing?.goals ?? 0}"></td>
      <td class="num"><input type="number" min="0" class="s-yellow" value="${existing?.yellow_cards ?? 0}"></td>
      <td class="num"><input type="number" min="0" class="s-red" value="${existing?.red_cards ?? 0}"></td>
    `;
    tr.querySelector(".s-goals").addEventListener("input", (e) => {
      if (Number(e.target.value || 0) > 0) tr.querySelector(".s-played").checked = true;
    });
    tbody.appendChild(tr);
  }

  empty.hidden = roster.length > 0;
}

function closeMatchModal() { matchModal.hidden = true; unlockBodyScroll(); }
document.getElementById("match-modal-close").addEventListener("click", closeMatchModal);
document.getElementById("match-cancel").addEventListener("click", closeMatchModal);
document.getElementById("btn-new-match").addEventListener("click", () => {
  if (!currentCompetitionId) { showToast("Maak eerst een competitie aan"); return; }
  openMatchModal();
});

document.getElementById("match-save").addEventListener("click", async () => {
  const id = document.getElementById("match-id").value;
  const dateVal = document.getElementById("match-date").value;
  const opponent = document.getElementById("match-opponent").value.trim();
  if (!dateVal || !opponent) { showToast("Vul datum en tegenstander in"); return; }

  const status = document.getElementById("match-status").value;
  const isPlayed = status === "gespeeld";

  const payload = {
    match_date: new Date(dateVal).toISOString(),
    opponent,
    status,
    goals_for: isPlayed && document.getElementById("match-goals-for").value !== "" ? Number(document.getElementById("match-goals-for").value) : null,
    goals_against: isPlayed && document.getElementById("match-goals-against").value !== "" ? Number(document.getElementById("match-goals-against").value) : null,
    mvp_player_id: isPlayed && document.getElementById("match-mvp").value ? Number(document.getElementById("match-mvp").value) : null,
    opponent_own_goals: isPlayed ? Number(document.getElementById("match-own-goals").value || 0) : 0,
    unknown_goals: isPlayed ? Number(document.getElementById("match-unknown-goals").value || 0) : 0,
    competition_id: currentCompetitionId,
  };

  if (isTournament()) {
    payload.phase = document.getElementById("match-phase").value;
    payload.group_name = payload.phase === "groep" ? (document.getElementById("match-group").value.trim() || null) : null;
    payload.round_name = payload.phase === "knockout" ? (document.getElementById("match-round").value.trim() || null) : null;
  } else {
    payload.phase = "competitie";
    payload.group_name = null;
    payload.round_name = null;
  }

  if (isPlayed && payload.goals_for != null) {
    let playerGoals = 0;
    document.querySelectorAll("#match-stats-rows tr").forEach((row) => {
      playerGoals += Number(row.querySelector(".s-goals").value || 0);
    });
    const sumGoals = playerGoals + payload.opponent_own_goals + payload.unknown_goals;
    if (sumGoals !== payload.goals_for) {
      showToast(`Doelpunten spelers + eigen doelpunten tegenstander + onbekend (${sumGoals}) komt niet overeen met doelpunten voor (${payload.goals_for})`);
      return;
    }
  }

  try {
    let matchId = id;
    let savedMatch;
    if (id) {
      savedMatch = await api(`/matches?id=${id}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      savedMatch = await api("/matches", { method: "POST", body: JSON.stringify(payload) });
      matchId = savedMatch.id;
    }

    if (payload.status === "gespeeld") {
      const rows = document.querySelectorAll("#match-stats-rows tr");
      for (const row of rows) {
        const playerId = row.dataset.playerId;
        const statId = row.dataset.statId;
        const present = row.querySelector(".s-played").checked;
        const goals = Number(row.querySelector(".s-goals").value || 0);
        const yellow = Number(row.querySelector(".s-yellow").value || 0);
        const red = Number(row.querySelector(".s-red").value || 0);
        if (present || goals || yellow || red) {
          await api("/stats", {
            method: "POST",
            body: JSON.stringify({ match_id: matchId, player_id: Number(playerId), goals, yellow_cards: yellow, red_cards: red }),
          });
        } else if (statId) {
          // Niet aangevinkt als aanwezig en geen statistieken -> bestaande rij verwijderen
          await api(`/stats?id=${statId}`, { method: "DELETE" });
        }
      }
    } else {
      // Wedstrijd is (weer) gepland/afgelast: eerder ingevoerde statistieken
      // horen dan niet meer mee te tellen.
      for (const stat of currentMatchStats) {
        await api(`/stats?id=${stat.id}`, { method: "DELETE" });
      }
    }

    closeMatchModal();
    await loadMatches();
    showToast("Wedstrijd opgeslagen");
  } catch (e) { showToast(e.message); }
});

document.getElementById("match-delete").addEventListener("click", async () => {
  const id = document.getElementById("match-id").value;
  if (!confirm("Deze wedstrijd en de bijbehorende statistieken verwijderen?")) return;
  try {
    await api(`/matches?id=${id}`, { method: "DELETE" });
    closeMatchModal();
    await loadMatches();
    showToast("Wedstrijd verwijderd");
  } catch (e) { showToast(e.message); }
});

/* ---------- Stats view ---------- */

const STATS_ALLTIME_KEY = "teamstats_alltime";
const statsAlltimeToggle = document.getElementById("stats-alltime-toggle");
statsAlltimeToggle.checked = localStorage.getItem(STATS_ALLTIME_KEY) === "true";
statsAlltimeToggle.addEventListener("change", () => {
  localStorage.setItem(STATS_ALLTIME_KEY, String(statsAlltimeToggle.checked));
  loadStats();
});

async function loadStats() {
  const alltime = statsAlltimeToggle.checked;
  const query = !alltime && currentCompetitionId ? `&competition_id=${currentCompetitionId}` : "";
  const { leaderboard, record } = await api(`/stats?summary=true${query}`);
  renderRecord(record);
  renderLeaderboard(leaderboard);
  updateStatsSub();
}

function renderRecord(r) {
  const points = r.wins * 3 + r.draws;
  const el = document.getElementById("team-record");
  const stats = [
    ["Gespeeld", r.played],
    ["Winst", r.wins],
    ["Gelijk", r.draws],
    ["Verlies", r.losses],
    ["Doelsaldo", `${r.goals_for}-${r.goals_against}`],
    ["Punten", points],
  ];
  el.innerHTML = stats.map(([label, value]) => `
    <div class="scoreboard__stat">
      <div class="scoreboard__value">${value}</div>
      <div class="scoreboard__label">${label}</div>
    </div>
  `).join("");
}

function renderLeaderboard(rows) {
  const tbody = document.getElementById("leaderboard-rows");
  const empty = document.getElementById("empty-stats");
  empty.hidden = rows.length > 0;
  tbody.innerHTML = rows.map((r) => `
    <tr data-id="${r.id}">
      <td class="player-name-cell" data-action="detail" role="button" tabindex="0">
        <span class="player-name-link">${escapeHtml(r.name)}</span>
        <span class="player-name-hint">Klik hier voor alle stats</span>
      </td>
      <td class="num">${r.matches_played}</td>
      <td class="num">${r.goals}</td>
      <td class="num">${r.mvp_count > 0 ? r.mvp_count : "—"}</td>
      <td class="row-actions admin-only">
        <button data-action="edit" title="Bewerken" aria-label="Speler bewerken">✏️</button>
        <button data-action="delete" title="Verwijderen" aria-label="Speler verwijderen">🗑️</button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("tr").forEach((tr) => {
    const r = rows.find((x) => String(x.id) === tr.dataset.id);
    if (!r) return;
    const nameCell = tr.querySelector('[data-action="detail"]');
    nameCell.addEventListener("click", () => openPlayerDetailModal(r));
    nameCell.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPlayerDetailModal(r); }
    });
    tr.querySelector('[data-action="edit"]').addEventListener("click", () => openPlayerModal(r));
    tr.querySelector('[data-action="delete"]').addEventListener("click", () => deletePlayer(r));
  });
  applyLockState();
}

/* ---------- Speler-detailmodal ---------- */

const playerDetailModal = document.getElementById("player-detail-modal");

function openPlayerDetailModal(r) {
  document.getElementById("player-detail-title").textContent = r.name;

  document.getElementById("player-detail-record").innerHTML = [
    ["Gespeeld", r.matches_played],
    ["Winst", r.wins],
    ["Gelijk", r.draws],
    ["Verlies", r.losses],
  ].map(([label, value]) => `
    <div class="scoreboard__stat">
      <div class="scoreboard__value">${value}</div>
      <div class="scoreboard__label">${label}</div>
    </div>
  `).join("");

  document.getElementById("player-detail-stats").innerHTML = [
    ["Doelpunten", r.goals],
    ["🟨 Geel", r.yellow_cards],
    ["🟥 Rood", r.red_cards],
    ["⭐ MVP", r.mvp_count],
  ].map(([label, value]) => `
    <div class="scoreboard__stat">
      <div class="scoreboard__value">${value}</div>
      <div class="scoreboard__label">${label}</div>
    </div>
  `).join("");

  playerDetailModal.hidden = false;
  lockBodyScroll();
}
function closePlayerDetailModal() { playerDetailModal.hidden = true; unlockBodyScroll(); }
document.getElementById("player-detail-close").addEventListener("click", closePlayerDetailModal);
document.getElementById("player-detail-close-btn").addEventListener("click", closePlayerDetailModal);

/* ---------- Unlock modal ---------- */

const unlockModal = document.getElementById("unlock-modal");

function openUnlockModal() {
  const unlocked = isUnlocked();
  document.getElementById("unlock-password").value = "";
  document.getElementById("unlock-lock-again").hidden = !unlocked;
  document.getElementById("field-unlock-password").hidden = unlocked;
  document.getElementById("unlock-actions").hidden = unlocked;
  document.getElementById("unlock-hint").hidden = unlocked;
  unlockModal.hidden = false;
  lockBodyScroll();
  if (!unlocked) document.getElementById("unlock-password").focus();
}
function closeUnlockModal() { unlockModal.hidden = true; unlockBodyScroll(); }

document.getElementById("btn-lock").addEventListener("click", openUnlockModal);
document.getElementById("unlock-modal-close").addEventListener("click", closeUnlockModal);
document.getElementById("unlock-cancel").addEventListener("click", closeUnlockModal);

document.getElementById("unlock-lock-again").addEventListener("click", () => {
  setAdminToken("");
  applyLockState();
  closeUnlockModal();
  showToast("Vergrendeld — alleen-lezen modus");
});

document.getElementById("unlock-save").addEventListener("click", async () => {
  const password = document.getElementById("unlock-password").value;
  if (!password) { showToast("Vul een wachtwoord in"); return; }

  // Testen zonder iets te wijzigen: een update op een niet-bestaande speler
  // geeft 401 bij een fout wachtwoord, of 404 bij een correct wachtwoord.
  try {
    const res = await fetch(`${API}/players?id=0`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Admin-Token": password },
      body: JSON.stringify({}),
    });
    if (res.status === 401) {
      showToast("Wachtwoord onjuist");
      return;
    }
    if (res.status !== 404) { showToast(`Kon niet verifiëren (fout ${res.status}) — controleer of ADMIN_PASSWORD is ingesteld op de server`); return; }
    setAdminToken(password);
    applyLockState();
    closeUnlockModal();
    showToast("Ontgrendeld — je kan nu bewerken");
    if (document.querySelector(".tab.is-active")?.dataset.tab === "aanmelden") loadSignups();
    else checkSignupBadge();
  } catch (e) {
    showToast("Kon niet verifiëren: " + e.message);
  }
});

document.getElementById("unlock-form").addEventListener("submit", (e) => e.preventDefault());

/* ---------- Stand (teams, uitslagen, standings) ---------- */

async function loadStandView() {
  await loadTeams();
  await Promise.all([loadResults(), loadStandingsTable()]);
}

async function loadTeams() {
  if (!currentCompetitionId) { teams = []; renderTeamChips(); populateTeamSelects(); return; }
  teams = await api(`/teams?competition_id=${currentCompetitionId}`);
  teamsLoadedForCompetition = currentCompetitionId;
  renderTeamChips();
  populateTeamSelects();
}

function renderTeamChips() {
  const el = document.getElementById("team-chip-list");
  el.innerHTML = teams.map((t) => `
    <span class="team-chip ${t.is_own_team ? "is-own" : ""}">
      ${t.is_own_team ? "⭐ " : ""}${escapeHtml(t.name)}
      <button data-id="${t.id}" title="Team verwijderen" aria-label="${escapeHtml(t.name)} verwijderen">✕</button>
    </span>
  `).join("");
  el.querySelectorAll("button[data-id]").forEach((btn) => {
    btn.addEventListener("click", () => deleteTeam(Number(btn.dataset.id)));
  });
}

function populateTeamSelects() {
  const options = teams
    .filter((t) => !t.is_own_team)
    .map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`)
    .join("");
  document.getElementById("result-home-team").innerHTML = options;
  document.getElementById("result-away-team").innerHTML = options;
}

function populateOpponentDatalist() {
  const datalist = document.getElementById("opponent-list");
  datalist.innerHTML = teams
    .filter((t) => !t.is_own_team)
    .map((t) => `<option value="${escapeHtml(t.name)}"></option>`)
    .join("");
}

function populateGroupNameList() {
  const names = new Set([
    ...matches.map((m) => m.group_name).filter(Boolean),
    ...results.map((r) => r.group_name).filter(Boolean),
  ]);
  document.getElementById("group-name-list").innerHTML = [...names]
    .map((g) => `<option value="${escapeHtml(g)}">`)
    .join("");
}

async function deleteTeam(id) {
  const team = teams.find((t) => t.id === id);
  if (!team) return;
  if (!confirm(`"${team.name}" verwijderen? Alle uitslagen met dit team verdwijnen, inclusief eventuele eigen wedstrijden bij "Wedstrijden" die hieraan gekoppeld waren.`)) return;
  try {
    await api(`/teams?id=${id}`, { method: "DELETE" });
    await Promise.all([loadStandView(), loadMatches()]);
    showToast("Team verwijderd");
  } catch (e) { showToast(e.message); }
}

document.getElementById("team-quick-add").addEventListener("submit", async (e) => {
  e.preventDefault();
  const nameInput = document.getElementById("new-team-name");
  const ownInput = document.getElementById("new-team-own");
  const name = nameInput.value.trim();
  if (!name) { showToast("Vul een teamnaam in"); return; }
  if (!currentCompetitionId) { showToast("Maak eerst een competitie aan"); return; }
  try {
    await api("/teams", { method: "POST", body: JSON.stringify({ name, is_own_team: ownInput.checked, competition_id: currentCompetitionId }) });
    nameInput.value = "";
    ownInput.checked = false;
    await loadStandView();
    showToast("Team toegevoegd");
  } catch (e) { showToast(e.message); }
});

async function loadResults() {
  if (!currentCompetitionId) { results = []; renderResultsList(); renderBracket(); return; }
  results = await api(`/results?competition_id=${currentCompetitionId}`);
  renderResultsList();
  renderBracket();
  populateGroupNameList();
}

function renderResultRow(r) {
  return `
    <div class="result-row ${r.synced_match_id ? "is-clickable" : ""}" data-id="${r.id}" data-synced="${r.synced_match_id ? "true" : "false"}">
      <div class="result-row__lines">
        <div class="result-row__line">
          ${teamBadgeHtml(r.home_team_name, r.home_is_own_team)}
          <span class="result-row__team-name">${escapeHtml(r.home_team_name)}</span>
          <span class="result-row__goals">${r.home_goals}</span>
        </div>
        <div class="result-row__line">
          ${teamBadgeHtml(r.away_team_name, r.away_is_own_team)}
          <span class="result-row__team-name">${escapeHtml(r.away_team_name)}</span>
          <span class="result-row__goals">${r.away_goals}</span>
        </div>
      </div>
      <span class="row-actions admin-only">
        ${!r.synced_match_id ? `<button data-action="edit" data-id="${r.id}" title="Bewerken" aria-label="Uitslag bewerken">✏️</button><button data-action="delete" data-id="${r.id}" title="Verwijderen" aria-label="Uitslag verwijderen">🗑️</button>` : ""}
      </span>
    </div>
  `;
}

function roundSortIndex(name) {
  const idx = ROUND_ORDER.indexOf(name || "");
  return idx === -1 ? ROUND_ORDER.length : idx;
}

// Wijst klik/edit/delete-acties toe aan gerenderde .result-row(-achtige)
// elementen. Wordt hergebruikt door zowel de platte uitslagenlijst als de
// knockout-bracket-cards.
function wireResultRowActions(el) {
  el.querySelectorAll('.result-row[data-synced="true"]').forEach((row) => {
    row.addEventListener("click", () => {
      const r = results.find((x) => x.id === Number(row.dataset.id));
      const match = matches.find((m) => m.id === r?.synced_match_id);
      if (match) openMatchModal(match);
      else showToast("Kon de bijbehorende wedstrijd niet vinden");
    });
  });
  el.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const r = results.find((x) => x.id === Number(btn.dataset.id));
      if (r) openResultModal(r);
    });
  });
  el.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const r = results.find((x) => x.id === Number(btn.dataset.id));
      if (r) deleteResult(r);
    });
  });
}

function renderResultsList() {
  const el = document.getElementById("results-list");
  const empty = document.getElementById("empty-results");
  // Knockout-uitslagen staan in de bracket hieronder, niet in deze lijst.
  const regular = results.filter((r) => r.phase !== "knockout");
  empty.hidden = regular.length > 0;

  let lastGroupKey;
  el.innerHTML = regular.map((r) => {
    const groupKey = r.match_date || "";
    const groupHtml = groupKey !== lastGroupKey
      ? `<h3 class="results-round__title">${r.match_date ? new Date(r.match_date).toLocaleDateString("nl-NL", { day: "numeric", month: "long" }) : "Datum onbekend"}</h3>`
      : "";
    lastGroupKey = groupKey;
    return groupHtml + renderResultRow(r);
  }).join("");

  wireResultRowActions(el);
  applyLockState();
}

/* ---------- Knockout-bracket ---------- */

// Neemt aan dat uitslagen binnen een ronde in bracket-volgorde zijn
// ingevoerd (bijv. eerst kwartfinale 1 t/m 4), zodat paren (0,1), (2,3), ...
// logisch doorstromen naar de volgende ronde. "Troostfinale" (3e/4e plaats)
// hoort niet in de winnaarsboom en krijgt daarom geen connectorlijnen.
function renderBracket() {
  const wrap = document.getElementById("bracket-wrap");
  const header = document.getElementById("bracket-header");
  const container = document.getElementById("bracket");
  container.innerHTML = "";

  const knockout = results.filter((r) => r.phase === "knockout");
  if (knockout.length === 0) {
    wrap.hidden = true;
    header.hidden = true;
    return;
  }
  wrap.hidden = false;
  header.hidden = false;

  const rounds = new Map();
  for (const r of knockout) {
    const key = r.round_name || "Overig";
    if (!rounds.has(key)) rounds.set(key, []);
    rounds.get(key).push(r);
  }
  for (const list of rounds.values()) list.sort((a, b) => a.id - b.id);

  const roundNames = [...rounds.keys()].sort((a, b) => roundSortIndex(a) - roundSortIndex(b));

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "bracket-lines");
  container.appendChild(svg);

  const roundEls = roundNames.map((name) => {
    const roundEl = document.createElement("div");
    roundEl.className = "bracket-round";
    const title = document.createElement("div");
    title.className = "bracket-round__title";
    title.textContent = name;
    roundEl.appendChild(title);

    const matchEls = rounds.get(name).map((r) => {
      const homeWin = r.home_goals > r.away_goals;
      const awayWin = r.away_goals > r.home_goals;
      const matchEl = document.createElement("div");
      matchEl.className = `result-row bracket-match ${r.synced_match_id ? "is-clickable" : ""}`;
      matchEl.dataset.id = r.id;
      matchEl.dataset.synced = r.synced_match_id ? "true" : "false";
      matchEl.innerHTML = `
        <div>
          <div class="bracket-match__team ${homeWin ? "is-winner" : ""}"><span>${escapeHtml(r.home_team_name)}</span><span>${r.home_goals}</span></div>
          <div class="bracket-match__team ${awayWin ? "is-winner" : ""}"><span>${escapeHtml(r.away_team_name)}</span><span>${r.away_goals}</span></div>
        </div>
        <span class="row-actions admin-only">
          ${!r.synced_match_id ? `<button data-action="edit" data-id="${r.id}" title="Bewerken" aria-label="Uitslag bewerken">✏️</button><button data-action="delete" data-id="${r.id}" title="Verwijderen" aria-label="Uitslag verwijderen">🗑️</button>` : ""}
        </span>
      `;
      roundEl.appendChild(matchEl);
      return matchEl;
    });
    container.appendChild(roundEl);
    return matchEls;
  });

  wireResultRowActions(container);
  applyLockState();

  requestAnimationFrame(() => drawBracketConnectors(container, svg, roundNames, roundEls));
}

function drawBracketConnectors(container, svg, roundNames, roundEls) {
  const containerRect = container.getBoundingClientRect();
  svg.setAttribute("width", container.scrollWidth);
  svg.setAttribute("height", container.scrollHeight);

  // Troostfinale (3e/4e plaats) hoort niet in de winnaarsboom: die kolom
  // wordt overgeslagen bij het bepalen van "aangrenzend", zodat de halve
  // finale gewoon doorverbindt naar de finale.
  const treeRounds = roundNames
    .map((name, i) => i)
    .filter((i) => roundNames[i] !== "Troostfinale");

  let paths = "";
  for (let k = 0; k < treeRounds.length - 1; k++) {
    const current = roundEls[treeRounds[k]];
    const next = roundEls[treeRounds[k + 1]];
    if (current.length !== next.length * 2) continue; // alleen tekenen bij een nette bracket-verhouding

    for (let j = 0; j < next.length; j++) {
      const a = current[j * 2].getBoundingClientRect();
      const b = current[j * 2 + 1].getBoundingClientRect();
      const target = next[j].getBoundingClientRect();

      const ax = a.right - containerRect.left, ay = a.top + a.height / 2 - containerRect.top;
      const bx = b.right - containerRect.left, by = b.top + b.height / 2 - containerRect.top;
      const midX = ax + 22;
      const midY = (ay + by) / 2;
      const targetX = target.left - containerRect.left;

      paths += `<path d="M${ax},${ay} H${midX} V${by}" />`;
      paths += `<path d="M${bx},${by} H${midX}" />`;
      paths += `<path d="M${midX},${midY} H${targetX}" />`;
    }
  }
  svg.innerHTML = paths;
}

window.addEventListener("resize", () => {
  if (!document.getElementById("bracket-wrap").hidden) renderBracket();
});

const resultModal = document.getElementById("result-modal");

function openResultModal(result = null) {
  const unlocked = isUnlocked();
  const otherTeams = teams.filter((t) => !t.is_own_team);
  document.getElementById("result-modal-title").textContent = result
    ? (unlocked ? "Uitslag bewerken" : "Uitslagdetails")
    : "Uitslag toevoegen";
  document.getElementById("result-id").value = result?.id || "";
  document.getElementById("result-date").value = result?.match_date ? result.match_date.slice(0, 10) : "";
  document.getElementById("result-home-team").value = result?.home_team_id || (otherTeams[0]?.id ?? "");
  document.getElementById("result-home-goals").value = result?.home_goals ?? "";
  document.getElementById("result-away-team").value = result?.away_team_id || (otherTeams[1]?.id ?? otherTeams[0]?.id ?? "");
  document.getElementById("result-away-goals").value = result?.away_goals ?? "";
  document.getElementById("result-delete").hidden = !result || !unlocked;
  document.getElementById("result-save").hidden = !unlocked;
  document.querySelectorAll("#result-form input, #result-form select").forEach((el) => { el.disabled = !unlocked; });

  const tournament = isTournament();
  document.getElementById("result-phase-block").hidden = !tournament;
  if (tournament) {
    document.getElementById("result-phase").value = result?.phase === "knockout" ? "knockout" : "groep";
    document.getElementById("result-group").value = result?.group_name || "";
    document.getElementById("result-round").value = result?.round_name || "";
    document.getElementById("result-phase").onchange = toggleResultPhaseFields;
    toggleResultPhaseFields();
  }

  resultModal.hidden = false;
  lockBodyScroll();
}
function closeResultModal() { resultModal.hidden = true; unlockBodyScroll(); }

function toggleResultPhaseFields() {
  const phase = document.getElementById("result-phase").value;
  document.getElementById("field-result-group").hidden = phase !== "groep";
  document.getElementById("field-result-round").hidden = phase !== "knockout";
}

document.getElementById("btn-new-result").addEventListener("click", () => {
  if (!currentCompetitionId) { showToast("Maak eerst een competitie aan"); return; }
  const otherTeams = teams.filter((t) => !t.is_own_team);
  if (otherTeams.length < 2) { showToast("Voeg eerst minstens twee andere teams toe (FC Caesar Salad hoeft niet — dat gaat automatisch via 'Programma & uitslagen')"); return; }
  openResultModal();
});
document.getElementById("result-modal-close").addEventListener("click", closeResultModal);
document.getElementById("result-cancel").addEventListener("click", closeResultModal);

document.getElementById("result-save").addEventListener("click", async () => {
  const id = document.getElementById("result-id").value;
  const home_team_id = Number(document.getElementById("result-home-team").value);
  const away_team_id = Number(document.getElementById("result-away-team").value);
  const home_goals = document.getElementById("result-home-goals").value;
  const away_goals = document.getElementById("result-away-goals").value;

  if (home_team_id === away_team_id) { showToast("Thuis- en uitteam moeten verschillend zijn"); return; }
  if (home_goals === "" || away_goals === "") { showToast("Vul beide scores in"); return; }

  const payload = {
    match_date: document.getElementById("result-date").value || null,
    home_team_id, away_team_id,
    home_goals: Number(home_goals),
    away_goals: Number(away_goals),
    competition_id: currentCompetitionId,
  };

  if (isTournament()) {
    payload.phase = document.getElementById("result-phase").value;
    payload.group_name = payload.phase === "groep" ? (document.getElementById("result-group").value.trim() || null) : null;
    payload.round_name = payload.phase === "knockout" ? (document.getElementById("result-round").value.trim() || null) : null;
  } else {
    payload.phase = "competitie";
    payload.group_name = null;
    payload.round_name = null;
  }

  try {
    if (id) await api(`/results?id=${id}`, { method: "PUT", body: JSON.stringify(payload) });
    else await api("/results", { method: "POST", body: JSON.stringify(payload) });
    closeResultModal();
    await loadStandView();
    showToast("Uitslag opgeslagen");
  } catch (e) { showToast(e.message); }
});

async function deleteResult(result) {
  if (!confirm("Deze uitslag verwijderen?")) return;
  try {
    await api(`/results?id=${result.id}`, { method: "DELETE" });
    closeResultModal();
    await loadStandView();
    showToast("Uitslag verwijderd");
  } catch (e) { showToast(e.message); }
}

document.getElementById("result-delete").addEventListener("click", () => {
  const id = document.getElementById("result-id").value;
  const r = results.find((x) => String(x.id) === String(id));
  if (r) deleteResult(r);
});

async function loadStandingsTable() {
  if (!currentCompetitionId) { renderStandingsGroups([]); return; }
  const groups = await api(`/results?standings=true&competition_id=${currentCompetitionId}`);
  renderStandingsGroups(groups);
}

function renderStandingsTable(rows) {
  return `
    <table class="player-table standings-table">
      <thead>
        <tr>
          <th class="col-num">#</th>
          <th>Team</th>
          <th class="num">GS</th>
          <th class="num">W</th>
          <th class="num">G</th>
          <th class="num">V</th>
          <th class="num">DV</th>
          <th class="num">DT</th>
          <th class="num">DS</th>
          <th class="num">Pt</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((t, i) => `
          <tr class="${t.is_own_team ? "is-own-team" : ""}">
            <td class="pos">${i + 1}</td>
            <td><span class="team-badge-row">${teamBadgeHtml(t.name, t.is_own_team)}<span class="team-badge-row__name">${escapeHtml(t.name)}</span></span></td>
            <td class="num">${t.played}</td>
            <td class="num">${t.wins}</td>
            <td class="num">${t.draws}</td>
            <td class="num">${t.losses}</td>
            <td class="num">${t.goals_for}</td>
            <td class="num">${t.goals_against}</td>
            <td class="num">${t.goal_diff > 0 ? "+" : ""}${t.goal_diff}</td>
            <td class="num">${t.points}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

// Bij een competitie is er één (ongegroepeerde) tabel; bij een toernooi met
// groepsfase krijgt elke groep zijn eigen tabel met een eigen kopje.
function renderStandingsGroups(groups) {
  const container = document.getElementById("standings-groups");
  const empty = document.getElementById("empty-standings");
  empty.hidden = groups.some((g) => g.standings.length > 0);

  container.innerHTML = groups.map((g) => `
    <div class="standings-group">
      ${g.group_name ? `<h2 class="section-title">${escapeHtml(g.group_name)}</h2>` : ""}
      <div class="player-table-wrap">
        ${renderStandingsTable(g.standings)}
      </div>
    </div>
  `).join("");

  syncStandingsStickyOffset();
}

function syncStandingsStickyOffset() {
  document.querySelectorAll(".standings-table").forEach((table) => {
    const firstHeaderCell = table.querySelector("thead th:first-child");
    if (firstHeaderCell) table.style.setProperty("--pos-col-width", `${firstHeaderCell.getBoundingClientRect().width}px`);
  });
}

window.addEventListener("resize", syncStandingsStickyOffset);

/* ---------- Aanmelden ---------- */

document.getElementById("signup-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("signup-name").value.trim();
  const unit = document.getElementById("signup-unit").value.trim();
  if (!name || !unit) { showToast("Vul naam en unit in"); return; }

  const btn = document.getElementById("signup-submit");
  btn.disabled = true;
  try {
    await api("/signup", { method: "POST", body: JSON.stringify({ name, unit }) });
    document.getElementById("signup-form").reset();
    showToast("Bedankt voor je aanmelding!");
    await loadSignups();
  } catch (err) {
    showToast(err.message);
  } finally {
    btn.disabled = false;
  }
});

const SIGNUP_SEEN_ID_KEY = "teamstats_signup_seen_id";

function getSignupSeenId() {
  return Number(localStorage.getItem(SIGNUP_SEEN_ID_KEY) || 0);
}

function updateSignupBadge(rows) {
  const seenId = getSignupSeenId();
  const unseen = rows.filter((r) => r.id > seenId).length;
  const badge = document.getElementById("signup-badge");
  badge.textContent = unseen > 9 ? "9+" : String(unseen);
  badge.hidden = unseen === 0;
}

// Ververst alleen het belletje (voor als de aanmeldingen nog niet echt
// bekeken zijn), zonder ze als "gezien" te markeren.
async function checkSignupBadge() {
  if (!isUnlocked()) return;
  try {
    updateSignupBadge(await api("/signup"));
  } catch { /* geen kritieke actie, stil negeren */ }
}

// Wordt aangeroepen zodra de aanmeldingen daadwerkelijk bekeken worden
// (tabblad "Aanmelden"): rendert de tabel en markeert alles als gezien.
async function loadSignups() {
  if (!isUnlocked()) return;
  try {
    const rows = await api("/signup");
    renderSignupRows(rows);
    const maxId = rows.reduce((max, r) => Math.max(max, r.id), 0);
    localStorage.setItem(SIGNUP_SEEN_ID_KEY, String(maxId));
    updateSignupBadge(rows);
  } catch (e) { showToast(e.message); }
}

function fmtSignupDate(sqliteTimestamp) {
  // SQLite's datetime('now') levert "YYYY-MM-DD HH:MM:SS" in UTC; zonder
  // "T"/"Z" zou new Date(...) dit als lokale tijd kunnen interpreteren.
  const d = new Date(sqliteTimestamp.replace(" ", "T") + "Z");
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" }) +
    " · " + d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

function renderSignupRows(rows) {
  const tbody = document.getElementById("signup-rows");
  const empty = document.getElementById("empty-signups");
  empty.hidden = rows.length > 0;
  tbody.innerHTML = rows.map((r) => `
    <tr data-id="${r.id}">
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.unit)}</td>
      <td>${fmtSignupDate(r.created_at)}</td>
      <td class="row-actions admin-only">
        <button data-action="delete" title="Verwijderen" aria-label="Aanmelding verwijderen">🗑️</button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.closest("tr").dataset.id;
      if (!confirm("Deze aanmelding verwijderen?")) return;
      try {
        await api(`/signup?id=${id}`, { method: "DELETE" });
        await loadSignups();
        showToast("Aanmelding verwijderd");
      } catch (err) { showToast(err.message); }
    });
  });
  applyLockState();
}

/* ---------- Init ---------- */

(async function init() {
  applyLockState();
  try {
    await loadCompetitions();
    await loadPlayers();
    await loadMatches();
    checkSignupBadge();

    const initialTab = location.hash.slice(1);
    if (TAB_NAMES.includes(initialTab)) activateTab(initialTab);
  } catch (e) {
    showToast("Kon data niet laden: " + e.message);
  }
})();
