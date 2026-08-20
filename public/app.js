const API = "/api";
const TOKEN_KEY = "teamstats_admin_token";

let players = [];
let matches = [];
let teams = [];
let results = [];

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
  document.getElementById("btn-lock").title = unlocked ? "Bewerken vergrendelen" : "Bewerken ontgrendelen";
}

/* ---------- Helpers ---------- */

function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => (el.hidden = true), 2200);
}

async function api(path, options = {}) {
  const method = options.method || "GET";
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (method !== "GET") headers["X-Admin-Token"] = getAdminToken();

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

/* ---------- Tabs ---------- */

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => { t.classList.remove("is-active"); t.setAttribute("aria-selected", "false"); });
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("is-active"));
    btn.classList.add("is-active");
    btn.setAttribute("aria-selected", "true");
    document.getElementById(`view-${btn.dataset.tab}`).classList.add("is-active");
    if (btn.dataset.tab === "statistieken") loadStats();
    if (btn.dataset.tab === "stand") loadStandView();
  });
});

/* ---------- Load & render: players ---------- */

async function loadPlayers() {
  players = await api("/players");
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
}
function closePlayerModal() { playerModal.hidden = true; }

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
  matches = await api("/matches");
  renderMatches();
}

function renderMatches() {
  const upcoming = matches.filter((m) => m.status !== "gespeeld").sort((a, b) => new Date(a.match_date) - new Date(b.match_date));
  const played = matches.filter((m) => m.status === "gespeeld").sort((a, b) => new Date(b.match_date) - new Date(a.match_date));

  renderTicketList("list-upcoming", "empty-upcoming", upcoming);
  renderTicketList("list-played", "empty-played", played);
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
        <span class="ticket__opponent">vs. ${escapeHtml(m.opponent)}</span>
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

  if (teams.length === 0) await loadTeams();
  populateOpponentDatalist();

  await toggleStatsBlock();
  document.getElementById("match-status").onchange = toggleStatsBlock;
  document.getElementById("match-mvp").value = match?.mvp_player_id || "";
  document.getElementById("match-own-goals").value = match?.opponent_own_goals ?? 0;
  document.getElementById("match-unknown-goals").value = match?.unknown_goals ?? 0;

  if (match) {
    currentMatchStats = await api(`/stats?match_id=${match.id}`);
  } else {
    currentMatchStats = [];
  }
  renderMatchStatsRows();
  document.querySelectorAll("#match-stats-rows input").forEach((el) => { el.disabled = !unlocked; });

  matchModal.hidden = false;
}

async function toggleStatsBlock() {
  const status = document.getElementById("match-status").value;
  const isPlayed = status === "gespeeld";
  document.getElementById("match-stats-block").hidden = !isPlayed;
  document.getElementById("field-goals-for").hidden = !isPlayed;
  document.getElementById("field-goals-against").hidden = !isPlayed;
  document.getElementById("field-mvp").hidden = !isPlayed;
  document.getElementById("field-own-goals").hidden = !isPlayed;
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
  tbody.innerHTML = "";
  for (const p of players.filter((p) => p.active !== false)) {
    const existing = currentMatchStats.find((s) => s.player_id === p.id);
    const tr = document.createElement("tr");
    tr.dataset.playerId = p.id;
    tr.dataset.statId = existing?.id ?? "";
    tr.innerHTML = `
      <td>${escapeHtml(p.name)}</td>
      <td class="num"><input type="checkbox" class="s-played" ${existing ? "checked" : ""}></td>
      <td class="num"><input type="number" min="0" class="s-goals" value="${existing?.goals ?? 0}"></td>
      <td class="num"><input type="number" min="0" class="s-yellow" value="${existing?.yellow_cards ?? 0}"></td>
      <td class="num"><input type="number" min="0" class="s-red" value="${existing?.red_cards ?? 0}"></td>
    `;
    tbody.appendChild(tr);
  }
}

function closeMatchModal() { matchModal.hidden = true; }
document.getElementById("match-modal-close").addEventListener("click", closeMatchModal);
document.getElementById("match-cancel").addEventListener("click", closeMatchModal);
document.getElementById("btn-new-match").addEventListener("click", () => openMatchModal());

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
  };

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

async function loadStats() {
  const { leaderboard, record } = await api("/stats?summary=true");
  renderRecord(record);
  renderLeaderboard(leaderboard);
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
      <td>${escapeHtml(r.name)}</td>
      <td class="num">${r.matches_played}</td>
      <td class="num">${r.goals}</td>
      <td class="num">${r.yellow_cards}</td>
      <td class="num">${r.red_cards}</td>
      <td class="num">${r.mvp_count > 0 ? r.mvp_count : "—"}</td>
      <td class="row-actions admin-only">
        <button data-action="edit" title="Bewerken">✏️</button>
        <button data-action="delete" title="Verwijderen">🗑️</button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("tr").forEach((tr) => {
    const r = rows.find((x) => String(x.id) === tr.dataset.id);
    if (!r) return;
    tr.querySelector('[data-action="edit"]').addEventListener("click", () => openPlayerModal(r));
    tr.querySelector('[data-action="delete"]').addEventListener("click", () => deletePlayer(r));
  });
  applyLockState();
}

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
  if (!unlocked) document.getElementById("unlock-password").focus();
}
function closeUnlockModal() { unlockModal.hidden = true; }

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
  teams = await api("/teams");
  renderTeamChips();
  populateTeamSelects();
}

function renderTeamChips() {
  const el = document.getElementById("team-chip-list");
  el.innerHTML = teams.map((t) => `
    <span class="team-chip ${t.is_own_team ? "is-own" : ""}">
      ${t.is_own_team ? "⭐ " : ""}${escapeHtml(t.name)}
      <button data-id="${t.id}" title="Team verwijderen">✕</button>
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
  try {
    await api("/teams", { method: "POST", body: JSON.stringify({ name, is_own_team: ownInput.checked }) });
    nameInput.value = "";
    ownInput.checked = false;
    await loadStandView();
    showToast("Team toegevoegd");
  } catch (e) { showToast(e.message); }
});

async function loadResults() {
  results = await api("/results");
  renderResultsList();
}

function renderResultsList() {
  const el = document.getElementById("results-list");
  const empty = document.getElementById("empty-results");
  empty.hidden = results.length > 0;
  el.innerHTML = results.map((r) => `
    <div class="result-row ${r.synced_match_id ? "is-clickable" : ""}" data-id="${r.id}" data-synced="${r.synced_match_id ? "true" : "false"}">
      <span class="result-row__date">${r.match_date ? new Date(r.match_date).toLocaleDateString("nl-NL", { day: "numeric", month: "short" }) : "—"}</span>
      <span class="result-row__score">${r.synced_match_id ? "🔗 " : ""}${escapeHtml(r.home_team_name)} ${r.home_goals} – ${r.away_goals} ${escapeHtml(r.away_team_name)}</span>
      <span class="row-actions admin-only">
        ${!r.synced_match_id ? `<button data-action="edit" data-id="${r.id}" title="Bewerken">✏️</button><button data-action="delete" data-id="${r.id}" title="Verwijderen">🗑️</button>` : ""}
      </span>
    </div>
  `).join("");

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
  applyLockState();
}

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
  resultModal.hidden = false;
}
function closeResultModal() { resultModal.hidden = true; }

document.getElementById("btn-new-result").addEventListener("click", () => {
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
  };

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
  const table = await api("/results?standings=true");
  renderStandings(table);
}

function renderStandings(table) {
  const tbody = document.getElementById("standings-rows");
  const empty = document.getElementById("empty-standings");
  empty.hidden = table.length > 0;
  tbody.innerHTML = table.map((t, i) => `
    <tr class="${t.is_own_team ? "is-own-team" : ""}">
      <td class="pos">${i + 1}</td>
      <td>${escapeHtml(t.name)}</td>
      <td class="num">${t.played}</td>
      <td class="num">${t.wins}</td>
      <td class="num">${t.draws}</td>
      <td class="num">${t.losses}</td>
      <td class="num">${t.goals_for}</td>
      <td class="num">${t.goals_against}</td>
      <td class="num">${t.goal_diff > 0 ? "+" : ""}${t.goal_diff}</td>
      <td class="num">${t.points}</td>
    </tr>
  `).join("");
}

/* ---------- Init ---------- */

(async function init() {
  applyLockState();
  try {
    await loadPlayers();
    await loadMatches();
  } catch (e) {
    showToast("Kon data niet laden: " + e.message);
  }
})();
