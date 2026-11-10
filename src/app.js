const API = "/api";
const TOKEN_KEY = "teamstats_admin_token";
const COMPETITION_KEY = "teamstats_competition_id";
const THEME_KEY = "teamstats_theme";
const ROUND_ORDER = ["Achtste finale", "Kwartfinale", "Halve finale", "Troostfinale", "Finale"];

/* ---------- Iconen (inline SVG, kleuren via currentColor) ---------- */
const svgIcon = (paths, size = 16, extra = "") =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${paths}</svg>`;
const ICON_X = svgIcon('<path d="M6 6l12 12M18 6L6 18"/>');
const ICON_EDIT = svgIcon('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>');
const ICON_TRASH = svgIcon('<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13M9 7V4h6v3"/>');
const ICON_TROPHY = svgIcon('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>', 20);
const ICON_STAR = '<svg class="ico ico--star" width="14" height="14" viewBox="0 0 24 24" fill="#F2B530" stroke="#B7791F" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>';
const ICON_PIN = svgIcon('<path d="M12 21s-6.5-5.6-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.3"/>', 14, ' class="ico"');
const ICON_CLOCK = svgIcon('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', 14, ' class="ico"');
const ICON_H2H = svgIcon('<path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5"/>', 14, ' class="ico"');
const ICON_BALL = svgIcon('<circle cx="12" cy="12" r="9"/><path d="M12 7.5l4 2.9-1.5 4.7h-5L8 10.4z"/><path d="M12 3v4.5M16 10.4l4.3-1.6M14.5 15.1l2.6 3.8M9.5 15.1l-2.6 3.8M8 10.4L3.7 8.8"/>', 14, ' class="ico"');
const ICON_GLOVE = '<svg class="ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 12V6.5a1.5 1.5 0 0 1 3 0V11M10 10V5a1.5 1.5 0 0 1 3 0v5M13 10V6a1.5 1.5 0 0 1 3 0v5.5M16 11a1.5 1.5 0 0 1 3 0v3a7 7 0 0 1-7 7h-.6a5 5 0 0 1-4-2L4.6 15.6a1.6 1.6 0 0 1 2.4-2.1L7 13.6"/></svg>';
const ICON_YELLOW = '<svg class="ico ico--card" width="11" height="14" viewBox="0 0 11 14" aria-hidden="true"><rect x=".75" y=".75" width="9.5" height="12.5" rx="2" fill="#F5C518" stroke="rgba(0,0,0,.18)" stroke-width="1"/></svg>';
const ICON_RED = '<svg class="ico ico--card" width="11" height="14" viewBox="0 0 11 14" aria-hidden="true"><rect x=".75" y=".75" width="9.5" height="12.5" rx="2" fill="#D9363E" stroke="rgba(0,0,0,.18)" stroke-width="1"/></svg>';

/* ---------- Thema (licht/donker) ---------- */
// De <head> zet data-theme al meteen bij het laden (voorkomt een flits van
// het verkeerde thema); hier alleen de knop synchroniseren en de klik
// afhandelen.
function applyTheme(dark) {
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
  const btn = document.getElementById("theme-toggle");
  btn.setAttribute("aria-pressed", String(dark));
  btn.title = dark ? "Licht thema aan" : "Donker thema aan";
}
document.getElementById("theme-toggle").addEventListener("click", () => {
  applyTheme(document.documentElement.getAttribute("data-theme") !== "dark");
});
applyTheme(document.documentElement.getAttribute("data-theme") === "dark");

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
  // Het slotje zelf wisselt via CSS (body.is-unlocked) tussen open en dicht.
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

  let res;
  try {
    res = await fetch(`${API}${path}`, { ...options, headers });
  } catch {
    throw new Error("Geen verbinding met internet. Probeer het zo nog eens.");
  }
  if (res.headers.get("X-From-SW-Cache") && !api._offlineShown) {
    api._offlineShown = true;
    showToast("Geen verbinding — je ziet de laatst bewaarde gegevens.");
  }
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
  badge.className = `chip competition-bar__type ${comp?.type === "toernooi" ? "chip--gold" : "chip--ink"}`;
  const statusBadge = document.getElementById("competition-status-badge");
  statusBadge.textContent = comp ? (comp.status === "afgesloten" ? "Afgesloten" : "Actief") : "";

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
  showAllRounds = false;
  updateCompetitionContext();
  await loadMatches();
  const activeTab = document.querySelector(".tab.is-active")?.dataset.tab;
  if (activeTab === "stand") await loadStandView();
  if (activeTab === "statistieken") await loadStats();
});

const competitionModal = document.getElementById("competition-modal");
const finalsRows = document.getElementById("finals-rows");

// Zelfde lijst als FINAL_COLORS in functions/api/competitions.js; de
// kleuren zelf staan in style.css (.finals-color--…).
const FINAL_COLORS = ["roze", "blauw", "groen", "goud", "zilver", "brons", "paars", "oranje"];

function addFinalsRow(f = {}) {
  const row = document.createElement("div");
  row.className = "finals-row";
  row.innerHTML = `
    <label class="field finals-row__name"><span>Naam</span>
      <input type="text" class="finals-name" maxlength="60" placeholder="Bijv. Hoofdklasse Finals" value="${escapeHtml(f.name || "")}"></label>
    <label class="field finals-row__date"><span>Datum</span>
      <input type="date" class="finals-date" value="${escapeHtml(f.date || "")}"></label>
    <label class="field finals-row__pos"><span>Plek van</span>
      <input type="number" class="finals-from" min="1" max="99" inputmode="numeric" value="${f.from ?? ""}"></label>
    <label class="field finals-row__pos"><span>t/m</span>
      <input type="number" class="finals-to" min="1" max="99" inputmode="numeric" value="${f.to ?? ""}"></label>
    <label class="field finals-row__color"><span>Kleur</span>
      <select class="finals-color">
        ${FINAL_COLORS.map((c) => `<option value="${c}" ${c === f.color ? "selected" : ""}>${c[0].toUpperCase() + c.slice(1)}</option>`).join("")}
      </select></label>
    <button type="button" class="icon-btn finals-row__remove" aria-label="Finale verwijderen">${ICON_X}</button>
  `;
  row.querySelector(".finals-row__remove").addEventListener("click", () => row.remove());
  finalsRows.appendChild(row);
}

// Volgende vrije plek en kleur alvast invullen, dat scheelt typen.
document.getElementById("finals-add-row").addEventListener("click", () => {
  const rows = readFinalsRows();
  const last = rows[rows.length - 1];
  const from = last && Number.isInteger(last.to) ? last.to + 1 : 1;
  addFinalsRow({ from, color: FINAL_COLORS[rows.length % FINAL_COLORS.length] });
});

function readFinalsRows() {
  return [...finalsRows.querySelectorAll(".finals-row")].map((row) => ({
    name: row.querySelector(".finals-name").value.trim(),
    date: row.querySelector(".finals-date").value || null,
    from: parseInt(row.querySelector(".finals-from").value, 10),
    to: parseInt(row.querySelector(".finals-to").value, 10),
    color: row.querySelector(".finals-color").value,
  }));
}

function openCompetitionModal(comp = null) {
  document.getElementById("competition-modal-title").textContent = comp ? "Competitie bewerken" : "Competitie toevoegen";
  document.getElementById("competition-id").value = comp?.id || "";
  document.getElementById("competition-name").value = comp?.name || "";
  document.getElementById("competition-type").value = comp?.type || "competitie";
  document.getElementById("competition-status").value = comp?.status || "actief";
  document.getElementById("competition-delete").hidden = !comp;
  finalsRows.innerHTML = "";
  (comp?.finals || []).forEach((f) => addFinalsRow(f));
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

  const finals = readFinalsRows();
  const badFinal = finals.find((f) => !f.name || !Number.isInteger(f.from) || !Number.isInteger(f.to) || f.from < 1 || f.to < f.from);
  if (badFinal) { showToast("Vul bij elke finale een naam en geldige plekken in"); return; }

  // Alleen meesturen als er iets met finales is (of was), zodat bewerken
  // ook werkt zolang migratie 0008 nog niet gedraaid heeft.
  const existing = competitions.find((c) => String(c.id) === String(id));
  const payload = { name, type, status };
  if (finals.length || existing?.finals?.length) payload.finals = finals;

  try {
    let saved;
    if (id) {
      saved = await api(`/competitions?id=${id}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      saved = await api("/competitions", { method: "POST", body: JSON.stringify(payload) });
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
  const btns = document.querySelectorAll(`.tab[data-tab="${tabName}"]`);
  if (!btns.length) return;
  document.querySelectorAll(".tab").forEach((t) => { t.classList.remove("is-active"); t.setAttribute("aria-selected", "false"); });
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("is-active"));
  btns.forEach((btn) => { btn.classList.add("is-active"); btn.setAttribute("aria-selected", "true"); });
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

document.getElementById("btn-brand-home").addEventListener("click", (e) => {
  e.preventDefault();
  activateTab("wedstrijden");
  history.replaceState(null, "", "#wedstrijden");
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

// Keepersinzet staat in helften in de database (0, 1 of 2 per wedstrijd).
// Als aantal wedstrijden gelezen is dat prettiger: 3 helften = 1½ wedstrijd.
function fmtKeeper(halves) {
  const n = Number(halves) || 0;
  if (!n) return "\u2014";
  const heel = Math.floor(n / 2);
  const half = n % 2 ? "\u00bd" : "";
  return heel ? `${heel}${half}` : half;
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
  return `hsl(${hash % 360}, 45%, 36%)`;
}
function teamInitials(name) {
  const words = name.trim().split(/\s+/);
  return words.length === 1
    ? words[0].slice(0, 2).toUpperCase()
    : (words[0][0] + words[1][0]).toUpperCase();
}
// Afgerond blokje met initialen (of ons logo). `extra` = extra classes,
// bijv. "avatar--sm" of "avatar--round".
function avatarHtml(name, isOwnTeam = false, extra = "") {
  if (isOwnTeam) return `<span class="avatar avatar--logo ${extra}" aria-hidden="true"><img src="logo.jpeg" alt=""></span>`;
  return `<span class="avatar ${extra}" style="background:${teamColor(name)}" aria-hidden="true">${escapeHtml(teamInitials(name))}</span>`;
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
    <button type="button" class="icon-btn player-name-remove" aria-label="Rij verwijderen">${ICON_X}</button>
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
  // Een nieuwe uitslag verandert de onderlinge balans en kan een nieuwe
  // tegenstandersnaam opleveren: beide caches hier laten vervallen.
  h2hCache.clear();
  knownOpponents = null;
  if (!currentCompetitionId) { matches = []; renderMatches(); return; }
  matches = await api(`/matches?competition_id=${currentCompetitionId}`);
  renderMatches();
  populateGroupNameList();
}

function renderMatches() {
  const upcoming = matches.filter((m) => m.status !== "gespeeld").sort((a, b) => new Date(a.match_date) - new Date(b.match_date));
  const played = matches.filter((m) => m.status === "gespeeld").sort((a, b) => new Date(b.match_date) - new Date(a.match_date));

  const featuredId = renderHeroMatch(upcoming);
  const restUpcoming = featuredId ? upcoming.filter((m) => m.id !== featuredId) : upcoming;

  // De laatste uitslag staat altijd los bovenaan. Is er ook een eerstvolgende
  // wedstrijd, dan in een lichte kaart onder het donkere blok: twee even
  // luide blokken onder elkaar vechten om aandacht. Zonder geplande wedstrijd
  // krijgt de uitslag zelf het donkere blok. Hij blijft ook in de lijst
  // "Gespeeld" staan: dat is het volledige overzicht.
  renderLastResult(played, !!featuredId);

  renderPlayedList(played);
  renderUpcomingList(restUpcoming);

  const upcomingCount = document.getElementById("upcoming-count");
  const plannedRest = restUpcoming.filter((m) => m.status === "gepland").length;
  upcomingCount.hidden = plannedRest === 0;
  upcomingCount.textContent = `${plannedRest} gepland`;
  const playedCount = document.getElementById("played-count");
  playedCount.hidden = played.length === 0;
  playedCount.textContent = `${played.length} ${played.length === 1 ? "wedstrijd" : "wedstrijden"}`;

  const emptyUpcoming = document.getElementById("empty-upcoming");
  if (restUpcoming.length === 0) {
    if (upcoming.length > 0) {
      emptyUpcoming.hidden = false;
      emptyUpcoming.textContent = "Alleen de wedstrijd hierboven staat nog gepland.";
    } else {
      const comp = currentCompetition();
      emptyUpcoming.textContent = comp?.status === "afgesloten"
        ? (comp.type === "toernooi" ? "Dit toernooi is afgesloten." : "Deze competitie is afgesloten.")
        : "Nog geen wedstrijden gepland.";
    }
  }

  renderTeamForm();
}

function matchOutcome(m) {
  if (m.status !== "gespeeld" || m.goals_for == null || m.goals_against == null) return null;
  return m.goals_for > m.goals_against ? "w" : m.goals_for < m.goals_against ? "v" : "g";
}
const OUTCOME_LABEL = { w: "Winst", g: "Gelijkspel", v: "Verlies" };

function heroTeamsHtml(opponent) {
  return `
    <div class="hero__teams">
      <div class="hero__team">
        ${avatarHtml("FC Caesar Salad", true, "avatar--xl")}
        <span class="hero__name">FC Caesar Salad</span>
      </div>
      <span class="hero__vs">vs</span>
      <div class="hero__team">
        ${avatarHtml(opponent, false, "avatar--xl")}
        <span class="hero__name">${escapeHtml(opponent)}</span>
      </div>
    </div>`;
}

/* ---------- Uitgelichte laatste uitslag ---------- */

// De meest recente uitslag, met de score waar bij de eerstvolgende wedstrijd
// de aftelling staat. `quiet`: lichte variant onder dat donkere blok.
function renderLastResult(played, quiet = false) {
  const card = document.getElementById("hero-last-match");

  // `played` is aflopend op datum gesorteerd; een wedstrijd zonder ingevulde
  // score valt af, want dan is er niets uit te lichten.
  const last = played.find((m) => m.goals_for != null && m.goals_against != null);
  if (!last) {
    card.hidden = true;
    card.innerHTML = "";
    return;
  }

  const uitslag = matchOutcome(last);
  const outcomeCls = { w: "win", g: "draw", v: "loss" }[uitslag];
  const mvp = last.mvp_player_id ? players.find((p) => p.id === last.mvp_player_id) : null;

  card.hidden = false;
  card.className = `hero hero-result is-${outcomeCls}${quiet ? " hero--light" : ""}`;
  card.innerHTML = `
    <div class="hero__info">
      <div class="hero__eyebrow">
        <span class="hero__pill hero__pill--grey">Laatste uitslag</span>
        <span class="hero__comp">${fmtDate(last.match_date)}${last.pitch ? ` · ${escapeHtml(last.pitch)}` : ""}</span>
      </div>
      ${heroTeamsHtml(last.opponent)}
      ${mvp ? `<div class="hero__chips"><span class="hero__chip">${ICON_STAR}<span>MVP: <b>${escapeHtml(mvp.name)}</b></span></span></div>` : ""}
    </div>
    <div class="hero__score-wrap">
      <span class="hero__score">${last.goals_for} – ${last.goals_against}</span>
      <span class="hero__outcome hero__outcome--${outcomeCls}">${OUTCOME_LABEL[uitslag]}</span>
    </div>
  `;
  card.onclick = () => openMatchModal(last);
}

/* ---------- Hero: uitgelichte eerstvolgende wedstrijd ---------- */

let heroCountdownTimer = null;

// Toont de eerstvolgende geplande (niet-afgelaste) wedstrijd in een groot
// donker blok met live aftelling. Na aftraptijd toont hij "Bezig" i.p.v. een
// negatieve teller. Geeft het id van de uitgelichte wedstrijd terug (of
// null), zodat de gewone lijst eronder 'm kan overslaan.
function renderHeroMatch(upcoming) {
  const hero = document.getElementById("hero-next-match");
  if (heroCountdownTimer) {
    clearInterval(heroCountdownTimer);
    heroCountdownTimer = null;
  }

  const next = upcoming.find((m) => m.status === "gepland");
  if (!next) {
    hero.hidden = true;
    hero.innerHTML = "";
    return null;
  }

  const target = new Date(next.match_date);
  const now = new Date();
  const isMatchday = target.getFullYear() === now.getFullYear()
    && target.getMonth() === now.getMonth()
    && target.getDate() === now.getDate();

  const dateLabel = isMatchday
    ? "Vandaag"
    : target.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
  const timeLabel = target.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  const comp = currentCompetition();

  hero.hidden = false;
  hero.className = "hero hero-match" + (isMatchday ? " hero-match--matchday" : "");
  hero.innerHTML = `
    <div class="hero__info">
      <div class="hero__eyebrow">
        <span class="hero__pill"><span class="hero__pill-dot"></span>Eerstvolgende wedstrijd</span>
        ${comp ? `<span class="hero__comp">${escapeHtml(comp.name)}</span>` : ""}
      </div>
      ${heroTeamsHtml(next.opponent)}
      <div class="hero__chips">
        <span class="hero__chip">${ICON_CLOCK}${dateLabel} · Aftrap ${timeLabel}</span>
        ${next.pitch ? `<span class="hero__chip">${ICON_PIN}${escapeHtml(next.pitch)}</span>` : ""}
        <span class="hero__chip hero__h2h" hidden></span>
      </div>
    </div>
    <div class="countdown" role="timer" aria-label="Aftellen tot de aftrap"></div>
    <div class="hero__live" hidden>
      <span class="hero__live-pill"><span class="hero__live-dot"></span>Bezig</span>
    </div>
  `;
  hero.onclick = () => openMatchModal(next);
  renderHeroH2h(hero, next.opponent);

  const cdEl = hero.querySelector(".countdown");
  const liveEl = hero.querySelector(".hero__live");

  const tick = () => {
    const diffMs = target - new Date();
    if (diffMs <= 0) {
      cdEl.hidden = true;
      liveEl.hidden = false;
      hero.classList.add("hero-match--live");
      clearInterval(heroCountdownTimer);
      heroCountdownTimer = null;
      return;
    }
    renderHeroCountdown(cdEl, diffMs);
  };
  tick();
  heroCountdownTimer = setInterval(tick, 1000);

  return next.id;
}

const h2hCache = new Map();

// Onderlinge balans tegen deze tegenstander, over alle competities heen (zie
// functions/api/h2h.js). Los opgehaald zodat het blok en de aftelling er
// meteen staan; mislukt de call, dan blijft het chipje simpelweg verborgen.
async function renderHeroH2h(hero, opponent) {
  const el = hero.querySelector(".hero__h2h");
  if (!el) return;

  const key = opponent.trim().toLowerCase().replace(/\s+/g, " ");
  try {
    if (!h2hCache.has(key)) {
      h2hCache.set(key, await api(`/h2h?opponent=${encodeURIComponent(opponent)}`));
    }
    const h = h2hCache.get(key);
    // Tussendoor hertekend (bijv. na verversen): dit blok hangt dan los.
    if (!el.isConnected) return;

    if (!h.played) {
      el.innerHTML = `${ICON_H2H}Eerste ontmoeting`;
    } else {
      const last = h.recent[0];
      const uitkomst = last
        ? (last.goals_for > last.goals_against ? "W" : last.goals_for < last.goals_against ? "V" : "G")
        : "";
      el.innerHTML = `${ICON_H2H}<span>Onderling: <b>${h.wins}W ${h.draws}G ${h.losses}V</b> · ${h.goals_for}–${h.goals_against}`
        + (last ? ` · laatst ${last.goals_for}–${last.goals_against} (${uitkomst})` : "") + "</span>";
    }
    el.hidden = false;
  } catch {
    /* geen kritieke inhoud: het blok werkt ook zonder */
  }
}

function renderHeroCountdown(el, diffMs) {
  const totalSec = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const two = (n) => String(n).padStart(2, "0");
  const units = days > 0
    ? [[days === 1 ? "dag" : "dagen", days], ["uur", hours], ["min", mins], ["sec", secs]]
    : [["uur", hours], ["min", mins], ["sec", secs]];

  el.style.setProperty("--units", units.length);
  el.innerHTML = units.map(([label, val]) =>
    `<div class="countdown__unit"><span class="countdown__num">${two(val)}</span><span class="countdown__label">${label}</span></div>`
  ).join("");
}

function matchDateParts(iso) {
  const d = new Date(iso);
  return {
    dow: d.toLocaleDateString("nl-NL", { weekday: "short" }).replace(".", ""),
    day: d.getDate(),
    mon: d.toLocaleDateString("nl-NL", { month: "short" }).replace(".", ""),
    time: d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }),
  };
}

function wireMatchRows(el, list) {
  el.querySelectorAll(".match-row").forEach((row) => {
    const m = list.find((x) => String(x.id) === row.dataset.id);
    if (!m) return;
    row.addEventListener("click", () => openMatchModal(m));
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openMatchModal(m); }
    });
  });
}

function renderPlayedList(list) {
  const el = document.getElementById("list-played");
  document.getElementById("empty-played").hidden = list.length > 0;

  el.innerHTML = list.map((m) => {
    const p = matchDateParts(m.match_date);
    const res = matchOutcome(m);
    const mvp = m.mvp_player_id ? players.find((pl) => pl.id === m.mvp_player_id) : null;
    const meta = `<span class="meta-item">${ICON_CLOCK}${p.time}</span>`
      + (m.pitch ? `<span class="meta-item">${ICON_PIN}${escapeHtml(m.pitch)}</span>` : "");
    return `
      <div class="match-row" data-id="${m.id}" role="button" tabindex="0" aria-label="Wedstrijd tegen ${escapeHtml(m.opponent)}">
        <div class="match-row__date">
          <div class="match-row__dow">${p.dow}</div>
          <div class="match-row__day">${p.day}</div>
          <div class="match-row__mon">${p.mon}</div>
        </div>
        ${avatarHtml(m.opponent)}
        <div class="match-row__main">
          <span class="match-row__opp">vs. ${escapeHtml(m.opponent)}</span>
          <span class="match-row__meta">
            ${meta}
            ${mvp ? `<span class="match-row__mvp">${ICON_STAR}MVP: ${escapeHtml(mvp.name)}</span>` : ""}
          </span>
        </div>
        ${res
          ? `<span class="match-row__score">${m.goals_for} – ${m.goals_against}</span>
             <span class="res res--${res}" title="${OUTCOME_LABEL[res]}" aria-label="${OUTCOME_LABEL[res]}">${res.toUpperCase()}</span>`
          : `<span class="chip">Geen uitslag</span>`}
        <span class="icon-btn icon-btn--sm admin-only" aria-hidden="true" title="Bewerken">${ICON_EDIT}</span>
      </div>`;
  }).join("");
  wireMatchRows(el, list);
}

function renderUpcomingList(list) {
  const el = document.getElementById("list-upcoming");
  document.getElementById("empty-upcoming").hidden = list.length > 0;

  el.innerHTML = list.map((m) => {
    const cancelled = m.status === "afgelast";
    const meta = `<span class="meta-item">${ICON_CLOCK}${fmtDate(m.match_date)}</span>`
      + (m.pitch ? `<span class="meta-item">${ICON_PIN}${escapeHtml(m.pitch)}</span>` : "");
    return `
      <div class="match-row${cancelled ? " is-cancelled" : ""}" data-id="${m.id}" role="button" tabindex="0" aria-label="Wedstrijd tegen ${escapeHtml(m.opponent)}">
        ${avatarHtml(m.opponent)}
        <div class="match-row__main">
          <span class="match-row__opp">vs. ${escapeHtml(m.opponent)}</span>
          <span class="match-row__meta">${meta}</span>
        </div>
        <span class="chip${cancelled ? " chip--loss" : ""}">${cancelled ? "Afgelast" : "Gepland"}</span>
      </div>`;
  }).join("");
  wireMatchRows(el, list);
}

/* ---------- Teamvorm (laatste 5) ---------- */

// Uit de geladen wedstrijden van de gekozen competitie; bij "All-time" niet,
// want dan zou de vorm maar over één competitie gaan.
function renderTeamForm() {
  const el = document.getElementById("team-form-row");
  const alltime = document.getElementById("stats-alltime-toggle").checked;
  const lastFive = matches
    .filter((m) => matchOutcome(m))
    .sort((a, b) => new Date(b.match_date) - new Date(a.match_date))
    .slice(0, 5)
    .reverse();
  if (alltime || lastFive.length === 0) { el.hidden = true; el.innerHTML = ""; return; }
  el.hidden = false;
  el.innerHTML = `
    <span class="eyebrow">Teamvorm</span>
    <span class="form-row__pills">
      ${lastFive.map((m) => {
        const r = matchOutcome(m);
        return `<span class="res res--${r}" title="${OUTCOME_LABEL[r]} tegen ${escapeHtml(m.opponent)} (${m.goals_for}–${m.goals_against})" aria-label="${OUTCOME_LABEL[r]} tegen ${escapeHtml(m.opponent)}">${r.toUpperCase()}</span>`;
      }).join("")}
    </span>
    <span class="form-row__note">laatste ${lastFive.length}, nieuwste rechts</span>
  `;
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
  document.getElementById("match-pitch").value = match?.pitch || "";
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
  await populateOpponentDatalist();

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
  document.querySelectorAll("#match-stats-rows input, #match-stats-rows select").forEach((el) => { el.disabled = !unlocked; });

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
      <td class="num"><select class="s-keeper">
        ${[[0, "\u2014"], [1, "\u00bd"], [2, "heel"]].map(([v, label]) =>
          `<option value="${v}"${(existing?.keeper_halves ?? 0) === v ? " selected" : ""}>${label}</option>`).join("")}
      </select></td>
      <td class="num"><input type="number" min="0" class="s-yellow" value="${existing?.yellow_cards ?? 0}"></td>
      <td class="num"><input type="number" min="0" class="s-red" value="${existing?.red_cards ?? 0}"></td>
    `;
    tr.querySelector(".s-goals").addEventListener("input", (e) => {
      if (Number(e.target.value || 0) > 0) tr.querySelector(".s-played").checked = true;
    });
    tr.querySelector(".s-keeper").addEventListener("change", (e) => {
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
    pitch: document.getElementById("match-pitch").value.trim() || null,
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
        const keeper = Number(row.querySelector(".s-keeper").value || 0);
        if (present || goals || yellow || red || keeper) {
          await api("/stats", {
            method: "POST",
            body: JSON.stringify({ match_id: matchId, player_id: Number(playerId), goals, yellow_cards: yellow, red_cards: red, keeper_halves: keeper }),
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
const STATS_SORT_KEY = "teamstats_sort";
const statsAlltimeToggle = document.getElementById("stats-alltime-toggle");
statsAlltimeToggle.checked = localStorage.getItem(STATS_ALLTIME_KEY) === "true";
statsAlltimeToggle.addEventListener("change", () => {
  localStorage.setItem(STATS_ALLTIME_KEY, String(statsAlltimeToggle.checked));
  renderTeamForm();
  loadStats();
});

// Sorteren van de selectietabel: klik op een kolomkop. Eerste klik sorteert
// aflopend (meeste bovenaan), nog een klik op dezelfde kolom draait het om.
const SORT_KEYS = ["matches_played", "goals", "keeper_halves", "mvp_count"];
let statsSort = { key: "goals", dir: -1 };
try {
  const saved = JSON.parse(localStorage.getItem(STATS_SORT_KEY) || "null");
  if (saved && SORT_KEYS.includes(saved.key) && (saved.dir === 1 || saved.dir === -1)) statsSort = saved;
} catch { /* ongeldige waarde: standaard houden */ }
let leaderboardRows = [];

document.querySelectorAll(".stats-table .sort-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const key = btn.dataset.sort;
    statsSort = { key, dir: statsSort.key === key ? -statsSort.dir : -1 };
    try { localStorage.setItem(STATS_SORT_KEY, JSON.stringify(statsSort)); } catch {}
    renderLeaderboard(leaderboardRows);
  });
});

async function loadStats() {
  const alltime = statsAlltimeToggle.checked;
  const query = !alltime && currentCompetitionId ? `&competition_id=${currentCompetitionId}` : "";
  const { leaderboard, record } = await api(`/stats?summary=true${query}`);
  renderRecord(record);
  renderLeaderboard(leaderboard);
  renderHighlights(leaderboard);
  updateStatsSub();
}

function renderRecord(r) {
  const points = r.wins * 3 + r.draws;
  const el = document.getElementById("team-record");
  const stats = [
    ["Gespeeld", r.played, ""],
    ["Winst", r.wins, "win"],
    ["Gelijk", r.draws, ""],
    ["Verlies", r.losses, "loss"],
    ["Doelsaldo", `${r.goals_for}-${r.goals_against}`, ""],
    ["Punten", points, "accent"],
  ];
  el.innerHTML = stats.map(([label, value, tone]) => `
    <div class="kpi">
      <span class="eyebrow">${label}</span>
      <span class="kpi__value${tone ? ` kpi__value--${tone}` : ""}">${value}</span>
    </div>
  `).join("");
}

// Drie uitgelichte kaarten boven de selectie. Bij een gedeelde eerste plek
// staan alle namen erbij in plaats van willekeurig één te kiezen.
function renderHighlights(rows) {
  const el = document.getElementById("stats-highlights");
  const leaders = (key) => {
    const max = rows.reduce((m, r) => Math.max(m, Number(r[key]) || 0), 0);
    return { max, who: max > 0 ? rows.filter((r) => (Number(r[key]) || 0) === max) : [] };
  };
  const names = (list) => list.map((r) => r.name);
  const joinNames = (list) => {
    const n = names(list);
    return n.length <= 1 ? n.join("") : `${n.slice(0, -1).join(", ")} en ${n[n.length - 1]}`;
  };
  const whoLabel = (list) => (list.length === 1 ? list[0].name : list.length > 1 ? `${list.length} spelers` : "—");

  const goals = leaders("goals");
  const keep = leaders("keeper_halves");
  const mvp = leaders("mvp_count");

  let goalsSub = "Nog geen doelpunten";
  if (goals.who.length === 1) {
    const r = goals.who[0];
    const perMatch = r.matches_played ? (r.goals / r.matches_played).toFixed(2).replace(".", ",") : "—";
    goalsSub = `${perMatch} per wedstrijd · ${r.matches_played} gespeeld`;
  } else if (goals.who.length > 1) {
    goalsSub = `${joinNames(goals.who)} — elk ${goals.max}`;
  }

  const cards = [
    {
      label: "Topscorer",
      icon: ICON_BALL,
      who: whoLabel(goals.who),
      val: goals.max,
      sub: goalsSub,
    },
    {
      label: "Meest gekeept",
      icon: ICON_GLOVE,
      who: whoLabel(keep.who),
      val: keep.max ? fmtKeeper(keep.max) : "0",
      sub: keep.who.length > 1
        ? `${joinNames(keep.who)} — elk ${fmtKeeper(keep.max)} wedstrijden`
        : keep.who.length ? "wedstrijden op doel" : "Nog niemand op doel",
    },
    {
      label: "Meeste MVP’s",
      icon: ICON_STAR,
      who: whoLabel(mvp.who),
      val: mvp.max,
      sub: mvp.who.length > 1
        ? `${joinNames(mvp.who)} — elk ${mvp.max}×`
        : mvp.who.length ? `keer gekozen tot MVP van de wedstrijd` : "Nog geen MVP gekozen",
    },
  ];

  el.innerHTML = rows.length === 0 ? "" : cards.map((c) => `
    <div class="card highlight">
      <span class="eyebrow eyebrow--ico">${c.icon}${c.label}</span>
      <div class="highlight__row">
        <span class="highlight__who">${escapeHtml(c.who)}</span>
        <span class="highlight__val">${c.val}</span>
      </div>
      <span class="highlight__sub">${escapeHtml(c.sub)}</span>
    </div>
  `).join("");
}

function sortLeaderboard(rows) {
  const { key, dir } = statsSort;
  return [...rows].sort((a, b) =>
    ((Number(a[key]) || 0) - (Number(b[key]) || 0)) * dir
    || (Number(b.goals) || 0) - (Number(a.goals) || 0)
    || (Number(b.matches_played) || 0) - (Number(a.matches_played) || 0)
    || a.name.localeCompare(b.name, "nl")
  );
}

function renderSortHeaders() {
  document.querySelectorAll(".stats-table th[data-sort-col]").forEach((th) => {
    const on = th.dataset.sortCol === statsSort.key;
    th.setAttribute("aria-sort", on ? (statsSort.dir === -1 ? "descending" : "ascending") : "none");
    const btn = th.querySelector(".sort-btn");
    btn.classList.toggle("is-on", on);
    btn.querySelector(".sort-btn__arrow").textContent = on ? (statsSort.dir === -1 ? "↓" : "↑") : "";
  });
}

function renderLeaderboard(rows) {
  leaderboardRows = rows;
  const tbody = document.getElementById("leaderboard-rows");
  const empty = document.getElementById("empty-stats");
  empty.hidden = rows.length > 0;
  renderSortHeaders();

  const sorted = sortLeaderboard(rows);
  tbody.innerHTML = sorted.map((r, i) => `
    <tr data-id="${r.id}">
      <td>
        <button type="button" class="row-btn" data-action="detail" title="Alle stats van ${escapeHtml(r.name)}">
          <span class="row-btn__rank">${i + 1}</span>
          ${avatarHtml(r.name, false, "avatar--sm avatar--round")}
          <span class="row-btn__name">${escapeHtml(r.name)}</span>
        </button>
      </td>
      <td class="num">${r.matches_played}</td>
      <td class="num goals">${r.goals}</td>
      <td class="num">${fmtKeeper(r.keeper_halves)}</td>
      <td class="num">${r.mvp_count > 0 ? r.mvp_count : "—"}</td>
      <td class="row-actions admin-only">
        <button class="icon-btn icon-btn--sm" data-action="edit" title="Bewerken" aria-label="${escapeHtml(r.name)} bewerken">${ICON_EDIT}</button>
        <button class="icon-btn icon-btn--sm icon-btn--danger" data-action="delete" title="Verwijderen" aria-label="${escapeHtml(r.name)} verwijderen">${ICON_TRASH}</button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("tr").forEach((tr) => {
    const r = rows.find((x) => String(x.id) === tr.dataset.id);
    if (!r) return;
    tr.querySelector('[data-action="detail"]').addEventListener("click", () => openPlayerDetailModal(r));
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
    ["Gespeeld", r.matches_played, ""],
    ["Winst", r.wins, "text-win"],
    ["Gelijk", r.draws, ""],
    ["Verlies", r.losses, "text-loss"],
  ].map(([label, value, cls]) => `
    <div class="player-record__cell">
      <span class="player-record__value ${cls}">${value}</span>
      <span class="eyebrow">${label}</span>
    </div>
  `).join("");

  const perMatch = r.matches_played ? (r.goals / r.matches_played).toFixed(1).replace(".", ",") : "—";
  document.getElementById("player-detail-stats").innerHTML = [
    ["Doelpunten", r.goals],
    ["Per wedstrijd", perMatch],
    ["Gekeept", fmtKeeper(r.keeper_halves), ICON_GLOVE],
    ["MVP", r.mvp_count || "—", ICON_STAR],
    ["Geel", r.yellow_cards, ICON_YELLOW],
    ["Rood", r.red_cards, ICON_RED],
  ].map(([label, value, icon = ""]) => `
    <div class="player-stats__cell">
      <span class="player-stats__value">${value}</span>
      <span class="eyebrow eyebrow--ico">${icon}${label}</span>
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

function lockAgain() {
  setAdminToken("");
  applyLockState();
  showToast("Vergrendeld — alleen-lezen modus");
}
document.getElementById("unlock-lock-again").addEventListener("click", () => {
  lockAgain();
  closeUnlockModal();
});
// Zelfde actie vanuit de groene "Bewerkmodus aan"-balk bovenin.
document.getElementById("btn-banner-lock").addEventListener("click", lockAgain);

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

// Tegenstanders krijgen een potloodje om te hernoemen: clubs wisselen tijdens
// een competitie weleens van naam, en dan moet de stand gewoon doorlopen (zie
// renameTeam in functions/api/teams.js). Ons eigen team blijft zoals het is —
// die naam zit ook in matches.js vast.
function renderTeamChips() {
  const el = document.getElementById("team-chip-list");
  el.innerHTML = teams.map((t) => `
    <span class="team-chip ${t.is_own_team ? "is-own" : ""}">
      ${avatarHtml(t.name, t.is_own_team, "avatar--xs")}
      <span>${escapeHtml(t.name)}</span>
      ${t.is_own_team ? '<span class="chip chip--win">Ons team</span>' : ""}
      <span class="team-chip__actions">
        ${t.is_own_team ? "" : `<button type="button" class="team-chip__edit" data-edit-id="${t.id}" title="Teamnaam wijzigen" aria-label="Naam van ${escapeHtml(t.name)} wijzigen">${ICON_EDIT}</button>`}
        <button type="button" class="team-chip__remove" data-delete-id="${t.id}" title="Team verwijderen" aria-label="${escapeHtml(t.name)} verwijderen">${ICON_X}</button>
      </span>
    </span>
  `).join("");
  el.querySelectorAll("button[data-edit-id]").forEach((btn) => {
    btn.addEventListener("click", () => openTeamModal(Number(btn.dataset.editId)));
  });
  el.querySelectorAll("button[data-delete-id]").forEach((btn) => {
    btn.addEventListener("click", () => deleteTeam(Number(btn.dataset.deleteId)));
  });
}

/* ---------- Teamnaam wijzigen ---------- */

const teamModal = document.getElementById("team-modal");

function openTeamModal(id) {
  const team = teams.find((t) => t.id === id);
  if (!team) return;
  document.getElementById("team-id").value = team.id;
  document.getElementById("team-name").value = team.name;
  document.getElementById("team-all-competitions").checked = true;
  teamModal.hidden = false;
  lockBodyScroll();
  document.getElementById("team-name").focus();
}
function closeTeamModal() { teamModal.hidden = true; unlockBodyScroll(); }

document.getElementById("team-modal-close").addEventListener("click", closeTeamModal);
document.getElementById("team-cancel").addEventListener("click", closeTeamModal);
document.getElementById("team-form").addEventListener("submit", (e) => {
  e.preventDefault();
  document.getElementById("team-save").click();
});

document.getElementById("team-save").addEventListener("click", async () => {
  const id = Number(document.getElementById("team-id").value);
  const team = teams.find((t) => t.id === id);
  const name = document.getElementById("team-name").value.trim();
  const allCompetitions = document.getElementById("team-all-competitions").checked;
  if (!name) { showToast("Vul een teamnaam in"); return; }
  if (!team) { closeTeamModal(); return; }
  if (name === team.name) { closeTeamModal(); return; }

  try {
    const saved = await api(`/teams?id=${id}`, {
      method: "PUT",
      body: JSON.stringify({ name, all_competitions: allCompetitions }),
    });
    closeTeamModal();
    knownOpponents = null; // suggestielijst opnieuw ophalen: naam is gewijzigd
    await Promise.all([loadStandView(), loadMatches()]);
    if (saved.skipped_competitions?.length) {
      showToast(`Naam gewijzigd, maar overgeslagen in: ${saved.skipped_competitions.join(", ")} — daar bestaat "${name}" al`);
    } else {
      showToast("Teamnaam gewijzigd");
    }
  } catch (e) { showToast(e.message); }
});

function populateTeamSelects() {
  const options = teams
    .filter((t) => !t.is_own_team)
    .map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`)
    .join("");
  document.getElementById("result-home-team").innerHTML = options;
  document.getElementById("result-away-team").innerHTML = options;
}

// Suggesties uit álle competities (zie functions/api/opponents.js). De teams
// van de huidige competitie alleen zouden bij een nieuw seizoen een lege lijst
// geven; dan typ je een terugkerende club opnieuw, en een afwijkende
// schrijfwijze splitst stilletjes de onderlinge balans.
let knownOpponents = null;

async function populateOpponentDatalist() {
  const datalist = document.getElementById("opponent-list");
  if (!knownOpponents) {
    try {
      knownOpponents = (await api("/opponents")).map((o) => o.name);
    } catch {
      knownOpponents = null; // volgende keer opnieuw proberen
    }
  }
  const names = knownOpponents ?? teams.filter((t) => !t.is_own_team).map((t) => t.name);
  datalist.innerHTML = names.map((n) => `<option value="${escapeHtml(n)}"></option>`).join("");
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

// Eén uitslag als regel in een speelronde-kaart: thuis – score – uit.
// Eigen wedstrijden (gesynchroniseerd vanuit "Programma & uitslagen") zijn
// klikbaar en openen die wedstrijd; alleen losse uitslagen van andere teams
// zijn hier te bewerken.
function renderResultRow(r) {
  const own = r.home_is_own_team || r.away_is_own_team;
  const editable = !r.synced_match_id;
  return `
    <div class="result-row round-game${own ? " is-own" : ""}${r.synced_match_id ? " is-clickable" : ""}${editable ? " has-actions" : ""}" data-id="${r.id}" data-synced="${r.synced_match_id ? "true" : "false"}">
      <span class="round-game__team round-game__team--home${r.home_is_own_team ? " is-own" : ""}" title="${escapeHtml(r.home_team_name)}">${escapeHtml(r.home_team_name)}</span>
      <span class="round-game__score">${r.home_goals} – ${r.away_goals}</span>
      <span class="round-game__team${r.away_is_own_team ? " is-own" : ""}" title="${escapeHtml(r.away_team_name)}">${escapeHtml(r.away_team_name)}</span>
      ${editable ? `<span class="row-actions admin-only">
        <button class="icon-btn" data-action="edit" data-id="${r.id}" title="Bewerken" aria-label="Uitslag bewerken">${ICON_EDIT}</button>
        <button class="icon-btn icon-btn--danger" data-action="delete" data-id="${r.id}" title="Verwijderen" aria-label="Uitslag verwijderen">${ICON_TRASH}</button>
      </span>` : ""}
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

// Uitslagen per speelronde (= speeldatum), nieuwste eerst. Standaard de
// laatste drie rondes; "Alle N speelrondes" klapt de rest uit.
const ROUNDS_COLLAPSED = 3;
let showAllRounds = false;

function fmtRoundDate(isoDate) {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
}

function renderResultsList() {
  const el = document.getElementById("results-list");
  const empty = document.getElementById("empty-results");
  const toggle = document.getElementById("btn-toggle-rounds");
  // Knockout-uitslagen staan in de bracket hierboven, niet in deze lijst.
  const regular = results.filter((r) => r.phase !== "knockout");
  empty.hidden = regular.length > 0;

  // `results` komt al aflopend op datum binnen (zie functions/api/results.js).
  const rounds = [];
  for (const r of regular) {
    const key = r.match_date ? r.match_date.slice(0, 10) : "";
    let round = rounds.find((x) => x.key === key);
    if (!round) { round = { key, list: [] }; rounds.push(round); }
    round.list.push(r);
  }

  const canExpand = rounds.length > ROUNDS_COLLAPSED;
  toggle.hidden = !canExpand;
  toggle.textContent = showAllRounds ? "Toon minder" : `Alle ${rounds.length} speelrondes`;
  toggle.setAttribute("aria-expanded", String(showAllRounds));
  const shown = canExpand && !showAllRounds ? rounds.slice(0, ROUNDS_COLLAPSED) : rounds;

  el.innerHTML = shown.map((round) => `
    <div class="card round">
      <div class="eyebrow round__title">${round.key ? escapeHtml(fmtRoundDate(round.key)) : "Datum onbekend"}</div>
      ${round.list.map(renderResultRow).join("")}
    </div>
  `).join("");

  wireResultRowActions(el);
  applyLockState();
}

document.getElementById("btn-toggle-rounds").addEventListener("click", () => {
  showAllRounds = !showAllRounds;
  renderResultsList();
});

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
          ${!r.synced_match_id ? `<button class="icon-btn" data-action="edit" data-id="${r.id}" title="Bewerken" aria-label="Uitslag bewerken">${ICON_EDIT}</button><button class="icon-btn icon-btn--danger" data-action="delete" data-id="${r.id}" title="Verwijderen" aria-label="Uitslag verwijderen">${ICON_TRASH}</button>` : ""}
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

function finalForPosition(finals, pos) {
  return (finals || []).find((f) => pos >= f.from && pos <= f.to) || null;
}

function fmtFinalDate(isoDate) {
  // Alleen een datum (geen tijd): als lokale middag lezen, zodat een
  // tijdzone de dag nooit verschuift.
  const d = new Date(`${isoDate}T12:00:00`);
  return d.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
}

// Kaarten boven de stand met de finales, op volgorde van speeldatum (zoals
// Footy ze ook toont). Alleen als er voor deze competitie finales zijn.
function renderStandingsFinals(finals) {
  const el = document.getElementById("standings-finals");
  if (!finals?.length) { el.hidden = true; el.innerHTML = ""; return; }

  const sorted = [...finals].sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || a.from - b.from);
  el.hidden = false;
  el.innerHTML = sorted.map((f) => `
    <div class="card finale finals-color--${escapeHtml(f.color)}">
      <span class="finale__icon" aria-hidden="true">${ICON_TROPHY}</span>
      <div class="finale__text">
        <span class="finale__name">${escapeHtml(f.name)}</span>
        <span class="finale__meta">${f.date ? `${escapeHtml(fmtFinalDate(f.date))} · ` : ""}plek ${f.from === f.to ? f.from : `${f.from}–${f.to}`}</span>
      </div>
    </div>
  `).join("");
}

function renderStandingsTable(rows, finals) {
  return `
    <table class="tbl standings-table">
      <thead>
        <tr>
          <th scope="col">#&nbsp;&nbsp;Team</th>
          <th scope="col" class="num"><abbr title="Gespeeld">GS</abbr></th>
          <th scope="col" class="num"><abbr title="Winst">W</abbr></th>
          <th scope="col" class="num"><abbr title="Gelijk">G</abbr></th>
          <th scope="col" class="num"><abbr title="Verlies">V</abbr></th>
          <th scope="col" class="num"><abbr title="Doelpunten voor">DV</abbr></th>
          <th scope="col" class="num"><abbr title="Doelpunten tegen">DT</abbr></th>
          <th scope="col" class="num"><abbr title="Doelsaldo">DS</abbr></th>
          <th scope="col" class="num"><abbr title="Punten">PT</abbr></th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((t, i) => {
          const final = finalForPosition(finals, i + 1);
          return `
          <tr class="${t.is_own_team ? "is-own-team" : ""}">
            <td>
              <span class="team-cell">
                <span class="pos-badge${final ? ` is-final finals-color--${escapeHtml(final.color)}` : ""}"${final ? ` title="${escapeHtml(final.name)}"` : ""}>${i + 1}</span>
                ${avatarHtml(t.name, t.is_own_team, "avatar--sm")}
                <span class="team-cell__name">${escapeHtml(t.name)}</span>
              </span>
            </td>
            <td class="num">${t.played}</td>
            <td class="num">${t.wins}</td>
            <td class="num">${t.draws}</td>
            <td class="num">${t.losses}</td>
            <td class="num">${t.goals_for}</td>
            <td class="num">${t.goals_against}</td>
            <td class="num">${t.goal_diff > 0 ? "+" : ""}${t.goal_diff}</td>
            <td class="num pts">${t.points}</td>
          </tr>
        `;
        }).join("")}
      </tbody>
    </table>
  `;
}

// Bij een competitie is er één (ongegroepeerde) tabel; bij een toernooi met
// groepsfase krijgt elke groep zijn eigen tabel met een eigen kopje.
function renderStandingsGroups(groups) {
  const container = document.getElementById("standings-groups");
  const empty = document.getElementById("empty-standings");
  const hasRows = groups.some((g) => g.standings.length > 0);
  empty.hidden = hasRows;

  // Finales horen bij één competitietabel; bij poules van een toernooi
  // zouden de plekken per groep niets betekenen.
  const finals = !isTournament() && hasRows ? currentCompetition()?.finals : null;
  renderStandingsFinals(finals);

  container.innerHTML = groups.filter((g) => g.standings.length > 0).map((g) => `
    <div class="card standings-group">
      <div class="card__head">
        <h2 class="card__title">${g.group_name ? escapeHtml(g.group_name) : (isTournament() ? "Stand" : "Competitietabel")}</h2>
      </div>
      <div class="table-scroll">
        ${renderStandingsTable(g.standings, g.group_name ? null : finals)}
      </div>
    </div>
  `).join("");
}

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
  document.querySelectorAll(".signup-badge").forEach((badge) => {
    badge.textContent = unseen > 9 ? "9+" : String(unseen);
    badge.hidden = unseen === 0;
  });
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
  document.getElementById("signup-count").textContent = String(rows.length);
  tbody.innerHTML = rows.map((r) => `
    <tr data-id="${r.id}">
      <td><b>${escapeHtml(r.name)}</b></td>
      <td>${escapeHtml(r.unit)}</td>
      <td class="mono">${fmtSignupDate(r.created_at)}</td>
      <td class="row-actions admin-only">
        <button class="icon-btn icon-btn--sm icon-btn--danger" data-action="delete" title="Verwijderen" aria-label="Aanmelding verwijderen">${ICON_TRASH}</button>
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

// Service worker: maakt de app installeerbaar en laat 'm zonder bereik de
// laatst geladen gegevens tonen (zie public/sw.js).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

(async function init() {
  applyLockState();
  try {
    await Promise.all([loadCompetitions(), loadPlayers()]);
    await loadMatches();
    checkSignupBadge();

    const initialTab = location.hash.slice(1);
    if (TAB_NAMES.includes(initialTab)) activateTab(initialTab);
  } catch (e) {
    showToast("Kon data niet laden: " + e.message);
  }
})();
