const DATA_ROOT = "../data/processed";

const MODES = [
  "full",
  "cumulative_scene",
  "scene",
  "act",
  "cumulative_act",
  "sliding_window_3",
  "sliding_window_5",
];

const MODE_LABELS = {
  full: "Full play",
  scene: "Scene",
  act: "Act",
  cumulative_scene: "Cumulative scene",
  cumulative_act: "Cumulative act",
  sliding_window_3: "Window 3",
  sliding_window_5: "Window 5",
};

const METRIC_LABELS = {
  degree: "Degree",
  weighted_degree: "Weighted degree",
  pagerank: "PageRank",
  betweenness: "Betweenness",
  closeness: "Closeness",
  eigenvector: "Eigenvector",
  uniform: "Uniform",
};

const COMMUNITY_COLORS = [
  "#b33b36",
  "#167f78",
  "#d39b28",
  "#4d6fb3",
  "#7c4f9f",
  "#2f7b43",
  "#c85c2e",
  "#59606a",
  "#c23f73",
  "#0087a7",
  "#8a6f27",
  "#5f6f42",
];

const SEX_COLORS = {
  MALE: "#4d6fb3",
  FEMALE: "#c23f73",
  UNKNOWN: "#8a6f27",
  null: "#59606a",
};

const GROUP_NAME_PATTERN = /(^|[._])(ATTENDANTS|SERVANTS|SOLDIERS|PLAYERS|SAILORS|MESSENGERS|LORDS|LADIES|GUARDS|MUSICIANS|CITIZENS|SENATORS|COMMONERS|PLEBEIANS|OFFICERS|FOLLOWERS|WATCHMEN|HERALDS|PETITIONERS|CAPTAINS|NOBLES|TRIBUNES|BISHOPS|ALDERMEN|FAIRIES|WITCHES|MURDERERS|BANDITS|FRIENDS|ROMANS|GOTHS|STRANGERS|NEIGHBORS|PRENTICES|EUNUCHS)\b/i;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 12;
const FIT_TRIM_FRACTION = 0.05;

const state = {
  index: null,
  playName: "",
  edgeType: "co_present",
  mode: "full",
  timeIndex: 1,
  nodeSizeMetric: "degree",
  colorBy: "community",
  edgeWidthMetric: "weight",
  minEdgeWeight: 1,
  showLabels: true,
  showGroups: false,
  selectedCharacter: "",
  hoveredNode: "",
  isPlaying: false,
  playTimer: null,
  data: {
    meta: null,
    layout: null,
    staticNetwork: null,
    centrality: null,
    communities: null,
    modularity: null,
    snapshots: {},
    ego: {},
  },
  view: {
    width: 0,
    height: 0,
    dpr: 1,
    zoom: 1,
    panX: 0,
    panY: 0,
    dragging: false,
    dragStartX: 0,
    dragStartY: 0,
    dragStartPanX: 0,
    dragStartPanY: 0,
    nodes: [],
    screenNodes: new Map(),
  },
};

const el = {
  playTitle: document.querySelector("#playTitle"),
  playMeta: document.querySelector("#playMeta"),
  playSelect: document.querySelector("#playSelect"),
  modeSelect: document.querySelector("#modeSelect"),
  timeLabel: document.querySelector("#timeLabel"),
  prevButton: document.querySelector("#prevButton"),
  playButton: document.querySelector("#playButton"),
  nextButton: document.querySelector("#nextButton"),
  timeSlider: document.querySelector("#timeSlider"),
  nodeSizeSelect: document.querySelector("#nodeSizeSelect"),
  colorBySelect: document.querySelector("#colorBySelect"),
  edgeWidthSelect: document.querySelector("#edgeWidthSelect"),
  edgeWeightRange: document.querySelector("#edgeWeightRange"),
  edgeWeightValue: document.querySelector("#edgeWeightValue"),
  labelToggle: document.querySelector("#labelToggle"),
  groupToggle: document.querySelector("#groupToggle"),
  resetFiltersButton: document.querySelector("#resetFiltersButton"),
  characterSelect: document.querySelector("#characterSelect"),
  canvas: document.querySelector("#networkCanvas"),
  canvasStatus: document.querySelector("#canvasStatus"),
  resetViewButton: document.querySelector("#resetViewButton"),
  snapshotMeta: document.querySelector("#snapshotMeta"),
  metricNodes: document.querySelector("#metricNodes"),
  metricEdges: document.querySelector("#metricEdges"),
  metricDensity: document.querySelector("#metricDensity"),
  metricModularity: document.querySelector("#metricModularity"),
  metricCommunities: document.querySelector("#metricCommunities"),
  metricAvgWeight: document.querySelector("#metricAvgWeight"),
  topMetricLabel: document.querySelector("#topMetricLabel"),
  topNodesList: document.querySelector("#topNodesList"),
  focusPanel: document.querySelector("#focusPanel"),
  exportJsonButton: document.querySelector("#exportJsonButton"),
  exportCsvButton: document.querySelector("#exportCsvButton"),
  exportPngButton: document.querySelector("#exportPngButton"),
};

const ctx = el.canvas.getContext("2d");

init().catch((error) => {
  console.error(error);
  el.canvasStatus.textContent = "Unable to load data";
  el.focusPanel.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
});

async function init() {
  attachEvents();
  resizeCanvas();
  syncControlsWithState();
  state.index = await fetchJson(`${DATA_ROOT}/index.json`);
  populatePlaySelect();
  const initial = state.index.plays.find((play) => play.name === "hamlet") || state.index.plays[0];
  state.playName = initial.name;
  el.playSelect.value = initial.name;
  await loadPlay(initial.name);
}

function syncControlsWithState() {
  el.modeSelect.value = state.mode;
  el.nodeSizeSelect.value = state.nodeSizeMetric;
  el.colorBySelect.value = state.colorBy;
  el.edgeWidthSelect.value = state.edgeWidthMetric;
  el.labelToggle.checked = state.showLabels;
  el.groupToggle.checked = state.showGroups;
}

function attachEvents() {
  el.playSelect.addEventListener("change", async () => {
    stopPlayback();
    state.playName = el.playSelect.value;
    await loadPlay(state.playName);
  });

  document.querySelectorAll("[data-edge-type]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.edgeType = button.dataset.edgeType;
      document.querySelectorAll("[data-edge-type]").forEach((item) => {
        item.classList.toggle("active", item === button);
      });
      setCameraToFit();
      await clampTimeToMode();
      await chooseDefaultCharacter(false);
      await render();
    });
  });

  el.modeSelect.addEventListener("change", async () => {
    stopPlayback();
    state.mode = el.modeSelect.value;
    await loadSnapshot(state.mode);
    await clampTimeToMode();
    setCameraToFit();
    await render();
  });

  el.timeSlider.addEventListener("input", async () => {
    state.timeIndex = Number(el.timeSlider.value);
    await render();
  });

  el.prevButton.addEventListener("click", async () => stepTimeline(-1));
  el.nextButton.addEventListener("click", async () => stepTimeline(1));
  el.playButton.addEventListener("click", () => togglePlayback());

  el.nodeSizeSelect.addEventListener("change", async () => {
    state.nodeSizeMetric = el.nodeSizeSelect.value;
    await render();
  });

  el.colorBySelect.addEventListener("change", async () => {
    state.colorBy = el.colorBySelect.value;
    await render();
  });

  el.edgeWidthSelect.addEventListener("change", async () => {
    state.edgeWidthMetric = el.edgeWidthSelect.value;
    await render();
  });

  el.edgeWeightRange.addEventListener("input", async () => {
    state.minEdgeWeight = Number(el.edgeWeightRange.value);
    el.edgeWeightValue.textContent = String(state.minEdgeWeight);
    setCameraToFit();
    await render();
  });

  el.labelToggle.addEventListener("change", async () => {
    state.showLabels = el.labelToggle.checked;
    await render();
  });

  el.groupToggle.addEventListener("change", async () => {
    state.showGroups = el.groupToggle.checked;
    populateCharacterSelect();
    await chooseDefaultCharacter(false);
    setCameraToFit();
    await render();
  });

  el.characterSelect.addEventListener("change", async () => {
    state.selectedCharacter = el.characterSelect.value;
    await loadEgo(state.selectedCharacter);
    await render();
  });

  el.exportJsonButton.addEventListener("click", exportCurrentJson);
  el.exportCsvButton.addEventListener("click", exportCurrentCsv);
  el.exportPngButton.addEventListener("click", exportPng);
  el.resetFiltersButton.addEventListener("click", resetFilters);
  el.resetViewButton.addEventListener("click", resetView);

  el.canvas.addEventListener("wheel", onWheel, { passive: false });
  el.canvas.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
  el.canvas.addEventListener("click", onCanvasClick);
  el.canvas.addEventListener("dblclick", onDoubleClick);
  el.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  window.addEventListener("resize", () => {
    resizeCanvas();
    draw();
  });
}

async function loadPlay(playName) {
  el.canvasStatus.textContent = "Loading play data";
  state.data = {
    meta: null,
    layout: null,
    staticNetwork: null,
    centrality: null,
    communities: null,
    modularity: null,
    snapshots: {},
    ego: {},
  };
  state.playName = playName;
  setCameraToFit();

  const base = `${DATA_ROOT}/plays/${playName}`;
  const [meta, layout, staticNetwork, centrality, communities, modularity] = await Promise.all([
    fetchJson(`${base}/meta.json`),
    fetchJson(`${base}/layout.json`),
    fetchJson(`${base}/static_network.json`),
    fetchJson(`${base}/centrality.json`),
    fetchJson(`${base}/communities.json`),
    fetchJson(`${base}/modularity.json`),
  ]);

  state.data.meta = meta;
  state.data.layout = layout;
  state.data.staticNetwork = staticNetwork;
  state.data.centrality = centrality;
  state.data.communities = communities;
  state.data.modularity = modularity;

  populateCharacterSelect();
  updatePlayHeader();
  await loadSnapshot(state.mode);
  await clampTimeToMode();
  updateEdgeWeightRange();
  await chooseDefaultCharacter(true);
  await render();
}

async function loadSnapshot(mode) {
  if (mode === "full" || state.data.snapshots[mode]) return;
  const base = `${DATA_ROOT}/plays/${state.playName}`;
  state.data.snapshots[mode] = await fetchJson(`${base}/snapshots/${mode}.json`);
}

async function loadEgo(characterId) {
  if (!characterId || state.data.ego[characterId]) return;
  const base = `${DATA_ROOT}/plays/${state.playName}`;
  try {
    state.data.ego[characterId] = await fetchJson(`${base}/ego/${encodeURIComponent(characterId)}.json`);
  } catch {
    state.data.ego[characterId] = null;
  }
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}`);
  return response.json();
}

function populatePlaySelect() {
  const byGenre = new Map();
  state.index.plays.forEach((play) => {
    if (!byGenre.has(play.genre)) byGenre.set(play.genre, []);
    byGenre.get(play.genre).push(play);
  });

  el.playSelect.innerHTML = "";
  [...byGenre.entries()].forEach(([genre, plays]) => {
    const group = document.createElement("optgroup");
    group.label = titleCase(genre);
    plays.forEach((play) => {
      const option = document.createElement("option");
      option.value = play.name;
      option.textContent = `${play.title} (${play.year || "n.d."})`;
      group.appendChild(option);
    });
    el.playSelect.appendChild(group);
  });
}

function populateCharacterSelect() {
  const chars = [...state.data.meta.characters]
    .filter((character) => includeCharacter(character.id))
    .sort((a, b) => labelFor(a.id).localeCompare(labelFor(b.id)));
  el.characterSelect.innerHTML = "";
  chars.forEach((character) => {
    const option = document.createElement("option");
    option.value = character.id;
    option.textContent = labelFor(character.id);
    el.characterSelect.appendChild(option);
  });
}

async function chooseDefaultCharacter(reset) {
  const existing = state.data.meta.characters.some((char) => char.id === state.selectedCharacter && includeCharacter(char.id));
  if (!reset && existing) {
    el.characterSelect.value = state.selectedCharacter;
    await loadEgo(state.selectedCharacter);
    return;
  }

  const rows = getCentralityRows("full", 0).filter((row) => includeCharacter(row.character_id));
  const best = [...rows].sort((a, b) => Number(b.degree || 0) - Number(a.degree || 0))[0];
  state.selectedCharacter = best?.character_id || state.data.meta.characters.find((character) => includeCharacter(character.id))?.id || "";
  el.characterSelect.value = state.selectedCharacter;
  await loadEgo(state.selectedCharacter);
}

function updatePlayHeader() {
  const meta = state.data.meta;
  el.playTitle.textContent = meta.title;
  el.playMeta.textContent = `${titleCase(meta.genre)} | ${meta.num_characters || meta.characters.length} chars`;
}

async function clampTimeToMode() {
  const times = getAvailableTimes();
  if (!times.length) {
    state.timeIndex = state.mode === "full" ? 0 : 1;
    return;
  }
  if (!times.includes(state.timeIndex)) {
    state.timeIndex = times[0];
  }
}

function getAvailableTimes() {
  if (state.mode === "full") return [0];
  const snapshot = state.data.snapshots[state.mode];
  return [...new Set((snapshot?.[state.edgeType] || []).map((item) => Number(item.time_index)))].sort((a, b) => a - b);
}

async function stepTimeline(direction) {
  const times = getAvailableTimes();
  const index = times.indexOf(state.timeIndex);
  if (!times.length) return;
  const nextIndex = Math.max(0, Math.min(times.length - 1, index + direction));
  state.timeIndex = times[nextIndex];
  await render();
}

function togglePlayback() {
  if (state.isPlaying) {
    stopPlayback();
    return;
  }
  state.isPlaying = true;
  el.playButton.innerHTML = "&#10074;&#10074;";
  el.playButton.title = "Pause";
  state.playTimer = window.setInterval(async () => {
    const times = getAvailableTimes();
    const index = times.indexOf(state.timeIndex);
    if (index >= times.length - 1) {
      state.timeIndex = times[0];
    } else {
      state.timeIndex = times[index + 1];
    }
    await render();
  }, 900);
}

function stopPlayback() {
  if (state.playTimer) window.clearInterval(state.playTimer);
  state.playTimer = null;
  state.isPlaying = false;
  el.playButton.innerHTML = "&#9654;";
  el.playButton.title = "Play";
}

async function render() {
  await loadSnapshot(state.mode);
  const times = getAvailableTimes();
  if (times.length && !times.includes(state.timeIndex)) {
    state.timeIndex = times[0];
  }

  updateTimelineControls(times);
  updateEdgeWeightRange();
  updatePanels();
  draw();
}

function updateTimelineControls(times) {
  const isFull = state.mode === "full";
  const min = times[0] ?? 0;
  const max = times[times.length - 1] ?? 0;
  el.timeSlider.min = String(min);
  el.timeSlider.max = String(max);
  el.timeSlider.value = String(state.timeIndex);
  el.timeSlider.disabled = isFull || times.length <= 1;
  el.prevButton.disabled = isFull || state.timeIndex === min;
  el.nextButton.disabled = isFull || state.timeIndex === max;
  el.playButton.disabled = isFull || times.length <= 1;
  el.timeLabel.textContent = snapshotLabel();
}

function updateEdgeWeightRange() {
  const maxWeight = maxVisibleEdgeWeight();
  el.edgeWeightRange.max = String(maxWeight);
  if (state.minEdgeWeight > maxWeight) state.minEdgeWeight = maxWeight;
  el.edgeWeightRange.value = String(state.minEdgeWeight);
  el.edgeWeightValue.textContent = String(state.minEdgeWeight);
}

async function resetFilters() {
  state.showGroups = false;
  state.showLabels = true;
  state.minEdgeWeight = 1;
  el.groupToggle.checked = false;
  el.labelToggle.checked = true;
  populateCharacterSelect();
  await chooseDefaultCharacter(false);
  setCameraToFit();
  await render();
}

function maxVisibleEdgeWeight() {
  const edges = getVisibleRawEdges();
  return Math.max(1, ...edges.map((edge) => edge.weight));
}

function updatePanels() {
  const graph = getCurrentGraph();
  const modularity = getCurrentModularity();
  const communities = getCurrentCommunities();
  const avgWeight = graph.edges.length
    ? graph.edges.reduce((sum, edge) => sum + edge.weight, 0) / graph.edges.length
    : 0;
  const communityCount = new Set(graph.nodes.map((node) => communities[node.id]).filter((value) => value !== undefined)).size;

  el.canvasStatus.textContent = `${MODE_LABELS[state.mode]} | ${state.edgeType === "co_present" ? "Stage presence" : "Speech"}`;
  el.snapshotMeta.textContent = `${graph.nodes.length} nodes, ${graph.edges.length} edges`;
  el.metricNodes.textContent = String(graph.nodes.length);
  el.metricEdges.textContent = String(graph.edges.length);
  el.metricDensity.textContent = formatNumber(density(graph.nodes.length, graph.edges.length), 3);
  el.metricModularity.textContent = !state.showGroups || modularity?.Q == null ? "-" : formatNumber(modularity.Q, 3);
  el.metricCommunities.textContent = String(state.showGroups ? (modularity?.num_communities ?? (communityCount || "-")) : (communityCount || "-"));
  el.metricAvgWeight.textContent = formatNumber(avgWeight, 2);
  el.topMetricLabel.textContent = METRIC_LABELS[state.nodeSizeMetric] || state.nodeSizeMetric;
  renderTopNodes(graph);
  renderFocusPanel(graph);
}

function renderTopNodes(graph) {
  const rows = currentMetricRows()
    .filter((row) => graph.nodeIds.has(row.character_id))
    .sort((a, b) => metricValue(b) - metricValue(a))
    .slice(0, 8);

  el.topNodesList.innerHTML = "";
  rows.forEach((row) => {
    const item = document.createElement("li");
    item.innerHTML = `
      <div class="rank-row">
        <strong>${escapeHtml(labelFor(row.character_id))}</strong>
        <span>${formatNumber(metricValue(row), 3)}</span>
      </div>
    `;
    el.topNodesList.appendChild(item);
  });
}

function renderFocusPanel(graph) {
  const id = state.selectedCharacter;
  if (!id) {
    el.focusPanel.innerHTML = `<p class="muted">Select a character.</p>`;
    return;
  }

  const metricRow = currentMetricRows().find((row) => row.character_id === id);
  const ego = state.data.ego[id]?.[state.edgeType];
  const fullEgo = ego?.full;
  const modeEgo = Array.isArray(ego?.[state.mode])
    ? ego[state.mode].find((row) => Number(row.time_index) === state.timeIndex)
    : null;
  const focusTies = modeEgo?.top_ties || fullEgo?.top_ties || [];
  const newTies = modeEgo?.new_ties || [];
  const lostTies = modeEgo?.lost_ties || [];
  const active = graph.nodeIds.has(id);

  el.focusPanel.innerHTML = `
    <div>
      <p class="focus-title">${escapeHtml(labelFor(id))}</p>
      <p class="focus-subtitle">${active ? "Active in current view" : "Inactive in current view"}</p>
    </div>
    <dl class="mini-grid">
      <div><dt>Degree</dt><dd>${formatNumber(metricRow?.degree ?? 0, 2)}</dd></div>
      <div><dt>Weighted</dt><dd>${formatNumber(metricRow?.weighted_degree ?? 0, 2)}</dd></div>
      <div><dt>PageRank</dt><dd>${formatNumber(metricRow?.pagerank ?? 0, 3)}</dd></div>
      <div><dt>Ego Size</dt><dd>${formatNumber(modeEgo?.size ?? fullEgo?.size ?? 0, 2)}</dd></div>
    </dl>
    ${renderTieBlock("Strongest ties", focusTies)}
    ${renderTieBlock("New ties", newTies)}
    ${renderTieBlock("Lost ties", lostTies)}
  `;
}

function renderTieBlock(title, ties) {
  const rows = ties.filter(([id]) => includeCharacter(id)).slice(0, 5).map(([id, weight]) => `
    <div class="tie-row">
      <strong>${escapeHtml(labelFor(id))}</strong>
      <span>${formatNumber(weight, 2)}</span>
    </div>
  `).join("");
  return `
    <div class="tie-block">
      <h3>${escapeHtml(title)}</h3>
      ${rows || '<p class="muted">None</p>'}
    </div>
  `;
}

function getCurrentGraph() {
  const rawEdges = getVisibleRawEdges().filter((edge) => edge.weight >= state.minEdgeWeight);
  const metricRows = currentMetricRows().filter((row) => includeCharacter(row.character_id));
  const ids = new Set(metricRows.map((row) => row.character_id));
  rawEdges.forEach((edge) => {
    ids.add(edge.source);
    ids.add(edge.target);
  });

  if (state.mode === "full") {
    getStaticNodes().filter((node) => includeCharacter(node.key)).forEach((node) => ids.add(node.key));
  }

  const nodeIds = new Set([...ids].filter(Boolean));
  const nodes = [...nodeIds].map((id) => ({
    id,
    label: labelFor(id),
    character: characterFor(id),
    metric: metricRows.find((row) => row.character_id === id) || null,
  }));

  const edges = rawEdges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
  return { nodes, edges, nodeIds };
}

function getRawEdges() {
  if (state.mode === "full") {
    return (state.data.staticNetwork[state.edgeType]?.edges || []).map((edge) => ({
      source: edge.source,
      target: edge.target,
      weight: Number(edge.attributes?.weight ?? 1),
    }));
  }
  const snapshots = state.data.snapshots[state.mode]?.[state.edgeType] || [];
  const snapshot = snapshots.find((item) => Number(item.time_index) === state.timeIndex) || snapshots[0];
  return (snapshot?.edges || []).map(([source, target, weight]) => ({
    source,
    target,
    weight: Number(weight),
  }));
}

function getVisibleRawEdges() {
  return getRawEdges().filter((edge) => includeCharacter(edge.source) && includeCharacter(edge.target));
}

function getStaticNodes() {
  return state.data.staticNetwork[state.edgeType]?.nodes || [];
}

function currentMetricRows() {
  return getCentralityRows(state.mode, state.timeIndex);
}

function getCentralityRows(mode, timeIndex) {
  const rows = state.data.centrality[state.edgeType]?.[mode] || [];
  if (mode === "full") return rows.filter((row) => Number(row.time_index) === 0);
  return rows.filter((row) => Number(row.time_index) === Number(timeIndex));
}

function getCurrentCommunities() {
  const byMode = state.data.communities[state.edgeType]?.[state.mode];
  const current = byMode?.[String(state.timeIndex)] || byMode?.[String(0)];
  return current || state.data.communities[state.edgeType]?.full?.["0"] || {};
}

function getCurrentModularity() {
  const rows = state.data.modularity[state.edgeType]?.[state.mode] || [];
  const target = state.mode === "full" ? 0 : state.timeIndex;
  return rows.find((row) => Number(row.time_index) === Number(target)) || null;
}

function draw() {
  resizeCanvas();
  const graph = getCurrentGraph();
  const screenNodes = projectNodes(graph.nodes);
  state.view.nodes = graph.nodes;
  state.view.screenNodes = screenNodes;

  ctx.clearRect(0, 0, state.view.width, state.view.height);
  drawBackground();
  drawEdges(graph.edges, screenNodes);
  drawNodes(graph.nodes, graph.edges, screenNodes);

  if (!graph.nodes.length) {
    ctx.fillStyle = "#687079";
    ctx.font = "14px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No network edges in this snapshot", state.view.width / 2, state.view.height / 2);
  }
}

function resizeCanvas() {
  const rect = el.canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(320, rect.width);
  const height = Math.max(360, rect.height);
  if (el.canvas.width !== Math.floor(width * dpr) || el.canvas.height !== Math.floor(height * dpr)) {
    el.canvas.width = Math.floor(width * dpr);
    el.canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  state.view.width = width;
  state.view.height = height;
  state.view.dpr = dpr;
}

function drawBackground() {
  ctx.fillStyle = "#f1f3ef";
  ctx.fillRect(0, 0, state.view.width, state.view.height);
  ctx.strokeStyle = "rgba(60, 65, 68, 0.08)";
  ctx.lineWidth = 1;
  const step = clamp(48 * state.view.zoom, 24, 160);
  const offsetX = positiveModulo(state.view.panX, step);
  const offsetY = positiveModulo(state.view.panY, step);
  for (let x = offsetX - step; x < state.view.width + step; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, state.view.height);
    ctx.stroke();
  }
  for (let y = offsetY - step; y < state.view.height + step; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(state.view.width, y);
    ctx.stroke();
  }
}

function drawEdges(edges, screenNodes) {
  const selectedNeighbors = neighborSet(edges, state.selectedCharacter);
  const widthScores = edgeWidthScores(edges);
  const regularOpacity = 0.18;
  const neighborOpacity = 0.4;
  edges.forEach((edge, index) => {
    const source = screenNodes.get(edge.source);
    const target = screenNodes.get(edge.target);
    if (!source || !target) return;
    const selected = edge.source === state.selectedCharacter || edge.target === state.selectedCharacter;
    const neighbor = selectedNeighbors.has(edge.source) || selectedNeighbors.has(edge.target);
    const width = edgeLineWidth(widthScores[index], selected);
    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(target.x, target.y);
    ctx.strokeStyle = selected
      ? "rgba(179, 59, 54, 0.78)"
      : neighbor
        ? `rgba(86, 94, 101, ${neighborOpacity})`
        : `rgba(70, 78, 86, ${regularOpacity})`;
    ctx.lineWidth = width;
    ctx.stroke();
  });
}

function drawNodes(nodes, edges, screenNodes) {
  const communities = getCurrentCommunities();
  const values = nodes.map((node) => metricValue(node.metric));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const sizeScores = nodeSizeScores(nodes);
  const selectedNeighbors = neighborSet(edges, state.selectedCharacter);

  nodes.forEach((node) => {
    const screen = screenNodes.get(node.id);
    if (!screen) return;
    const value = metricValue(node.metric);
    const radius = nodeRadius(sizeScores.get(node.id));
    const isSelected = node.id === state.selectedCharacter;
    const isHovered = node.id === state.hoveredNode;
    const isNeighbor = selectedNeighbors.has(node.id);

    ctx.beginPath();
    ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = nodeColor(node, communities, value, min, max);
    ctx.fill();
    ctx.lineWidth = isSelected ? 4 : isHovered ? 3 : isNeighbor ? 2 : 1;
    ctx.strokeStyle = isSelected ? "#202124" : isHovered ? "#b33b36" : isNeighbor ? "#167f78" : "rgba(255,255,255,0.88)";
    ctx.stroke();

    if (state.showLabels || isSelected || isHovered) {
      drawLabel(node.label, screen.x, screen.y, radius, isSelected);
    }
  });
}

function drawLabel(label, x, y, radius, emphasized) {
  ctx.font = `${emphasized ? 700 : 600} 11px Inter, system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  const clean = trimLabel(label);
  const metrics = ctx.measureText(clean);
  const pad = 4;
  const lx = x + radius + 5;
  const ly = y;
  ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
  ctx.fillRect(lx - pad, ly - 8, metrics.width + pad * 2, 16);
  ctx.fillStyle = emphasized ? "#202124" : "#3f464d";
  ctx.fillText(clean, lx, ly);
}

function projectNodes(nodes) {
  const positions = state.data.layout.positions || {};
  const rawPositions = nodes.map((node, index) => ({
    node,
    position: positions[node.id] || fallbackPosition(index, nodes.length),
  }));
  const bounds = layoutBounds(rawPositions.map((item) => item.position));
  const padX = clamp(state.view.width * 0.075, 56, 112);
  const padY = clamp(state.view.height * 0.085, 44, 92);
  const width = Math.max(10, state.view.width - padX * 2);
  const height = Math.max(10, state.view.height - padY * 2);
  const scaleX = width / Math.max(0.0001, bounds.maxX - bounds.minX);
  const scaleY = height / Math.max(0.0001, bounds.maxY - bounds.minY);
  const map = new Map();

  rawPositions.forEach(({ node, position }) => {
    const fitX = clamp(position.x, bounds.minX, bounds.maxX);
    const fitY = clamp(position.y, bounds.minY, bounds.maxY);
    const baseX = padX + (fitX - bounds.minX) * scaleX;
    const baseY = padY + (fitY - bounds.minY) * scaleY;
    const x = state.view.width / 2 + (baseX - state.view.width / 2) * state.view.zoom + state.view.panX;
    const y = state.view.height / 2 + (baseY - state.view.height / 2) * state.view.zoom + state.view.panY;
    map.set(node.id, { x, y });
  });
  return map;
}

function layoutBounds(points) {
  const clean = points.filter((point) => (
    Number.isFinite(point?.x) && Number.isFinite(point?.y)
  ));
  if (!clean.length) {
    return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
  }

  const xs = clean.map((point) => point.x).sort((a, b) => a - b);
  const ys = clean.map((point) => point.y).sort((a, b) => a - b);
  const trim = clean.length >= 12 ? FIT_TRIM_FRACTION : 0;
  const bounds = {
    minX: quantile(xs, trim),
    maxX: quantile(xs, 1 - trim),
    minY: quantile(ys, trim),
    maxY: quantile(ys, 1 - trim),
  };
  return expandTinyBounds(bounds);
}

function fallbackPosition(index, total) {
  const angle = (index / Math.max(1, total)) * Math.PI * 2;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function nodeRadius(score) {
  if (state.nodeSizeMetric === "uniform") return 7;
  return 5 + Math.sqrt(clamp(score ?? 0.35, 0, 1)) * 11;
}

function edgeLineWidth(score, selected) {
  const base = state.edgeWidthMetric === "uniform"
    ? 1
    : 0.45 + clamp(score ?? 0.35, 0, 1) * 5.15;
  return selected ? base * 1.16 : base;
}

function nodeSizeScores(nodes) {
  if (state.nodeSizeMetric === "uniform") {
    return new Map(nodes.map((node) => [node.id, 0.35]));
  }

  const values = nodes.map((node) => metricValue(node.metric));
  const scores = rankScores(values);
  return new Map(nodes.map((node, index) => [node.id, scores[index]]));
}

function edgeWidthScores(edges) {
  if (state.edgeWidthMetric === "uniform") return edges.map(() => 0.35);
  const metricById = new Map(currentMetricRows().map((row) => [row.character_id, row]));
  const values = edges.map((edge) => {
    if (state.edgeWidthMetric === "weight") return Number(edge.weight || 0);
    const source = metricValue(metricById.get(edge.source), state.edgeWidthMetric);
    const target = metricValue(metricById.get(edge.target), state.edgeWidthMetric);
    return (source + target) / 2;
  });
  return valueScores(values);
}

function nodeColor(node, communities, value, min, max) {
  if (state.colorBy === "sex") {
    return SEX_COLORS[String(node.character?.sex ?? null)] || SEX_COLORS.null;
  }
  if (state.colorBy === "metric") {
    const t = max === min ? 0.5 : (value - min) / (max - min);
    return interpolateColor("#d39b28", "#b33b36", t);
  }
  const community = communities[node.id] ?? 0;
  return COMMUNITY_COLORS[Math.abs(Number(community)) % COMMUNITY_COLORS.length];
}

function onWheel(event) {
  event.preventDefault();
  const rect = el.canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const factor = Math.exp(-event.deltaY * 0.002);
  zoomAt(x, y, state.view.zoom * factor);
  draw();
}

function onDoubleClick(event) {
  event.preventDefault();
  const rect = el.canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const factor = event.shiftKey ? 0.625 : 1.6;
  zoomAt(x, y, state.view.zoom * factor);
  draw();
}

function zoomAt(screenX, screenY, nextZoom) {
  const previousZoom = state.view.zoom;
  const zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
  const centerX = state.view.width / 2;
  const centerY = state.view.height / 2;
  const baseX = centerX + (screenX - centerX - state.view.panX) / previousZoom;
  const baseY = centerY + (screenY - centerY - state.view.panY) / previousZoom;

  state.view.zoom = zoom;
  state.view.panX = screenX - centerX - (baseX - centerX) * zoom;
  state.view.panY = screenY - centerY - (baseY - centerY) * zoom;
}

function onMouseDown(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  state.view.dragging = true;
  state.view.dragStartX = event.clientX;
  state.view.dragStartY = event.clientY;
  state.view.dragStartPanX = state.view.panX;
  state.view.dragStartPanY = state.view.panY;
  el.canvas.classList.add("dragging");
}

function onMouseMove(event) {
  if (state.view.dragging) {
    event.preventDefault();
    state.view.panX = state.view.dragStartPanX + event.clientX - state.view.dragStartX;
    state.view.panY = state.view.dragStartPanY + event.clientY - state.view.dragStartY;
    draw();
    return;
  }
  const node = findNodeAt(event);
  if (node !== state.hoveredNode) {
    state.hoveredNode = node;
    draw();
  }
}

function onMouseUp() {
  state.view.dragging = false;
  el.canvas.classList.remove("dragging");
}

function resetView(event) {
  if (event) event.preventDefault();
  setCameraToFit();
  draw();
}

function setCameraToFit() {
  state.view.zoom = 1;
  state.view.panX = 0;
  state.view.panY = 0;
}

async function onCanvasClick(event) {
  if (Math.abs(event.clientX - state.view.dragStartX) > 4 || Math.abs(event.clientY - state.view.dragStartY) > 4) return;
  const node = findNodeAt(event);
  if (!node) return;
  state.selectedCharacter = node;
  el.characterSelect.value = node;
  await loadEgo(node);
  await render();
}

function findNodeAt(event) {
  const rect = el.canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const graph = getCurrentGraph();
  const sizeScores = nodeSizeScores(graph.nodes);

  for (const node of graph.nodes) {
    const screen = state.view.screenNodes.get(node.id);
    if (!screen) continue;
    const radius = nodeRadius(sizeScores.get(node.id)) + 4;
    const dx = x - screen.x;
    const dy = y - screen.y;
    if (dx * dx + dy * dy <= radius * radius) return node.id;
  }
  return "";
}

function exportCurrentJson() {
  const graph = getCurrentGraph();
  const payload = {
    play: state.playName,
    title: state.data.meta.title,
    edge_type: state.edgeType,
    mode: state.mode,
    time_index: state.timeIndex,
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      metric: node.metric,
      position: state.data.layout.positions[node.id] || null,
    })),
    edges: graph.edges,
  };
  download(`${state.playName}-${state.mode}-${state.edgeType}.json`, "application/json", JSON.stringify(payload, null, 2));
}

function exportCurrentCsv() {
  const graph = getCurrentGraph();
  const rows = ["source,target,weight", ...graph.edges.map((edge) => [
    csvCell(edge.source),
    csvCell(edge.target),
    edge.weight,
  ].join(","))];
  download(`${state.playName}-${state.mode}-${state.edgeType}-edges.csv`, "text/csv", rows.join("\n"));
}

function exportPng() {
  const link = document.createElement("a");
  link.download = `${state.playName}-${state.mode}-${state.edgeType}.png`;
  link.href = el.canvas.toDataURL("image/png");
  link.click();
}

function download(filename, type, text) {
  const blob = new Blob([text], { type });
  const link = document.createElement("a");
  link.download = filename;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

function snapshotLabel() {
  if (state.mode === "full") return "Full play";
  if (state.mode === "act" || state.mode === "cumulative_act") return `Act ${state.timeIndex}`;
  const segment = state.data.meta.segments.find((item) => Number(item.order) === Number(state.timeIndex));
  if (state.mode.startsWith("sliding_window")) {
    return segment ? `To ${segment.label}` : `Index ${state.timeIndex}`;
  }
  return segment?.label || `Index ${state.timeIndex}`;
}

function labelFor(id) {
  const character = characterFor(id);
  const raw = character?.name || id;
  return isGroupCharacter(id) ? groupLabel(raw) : raw;
}

function characterFor(id) {
  return state.data.meta?.characters.find((character) => character.id === id) || null;
}

function includeCharacter(id) {
  return state.showGroups || !isGroupCharacter(id);
}

function isGroupCharacter(id) {
  const character = characterFor(id);
  return Boolean(character?.is_group) || GROUP_NAME_PATTERN.test(String(id));
}

function groupLabel(value) {
  const clean = String(value)
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const firstPhrase = clean.split(/[;,]/)[0].trim() || clean;
  return `Group: ${truncateText(firstPhrase, 18)}`;
}

function metricValue(row, metric = state.nodeSizeMetric) {
  if (!row) return 0;
  if (metric === "uniform") return 1;
  return Number(row[metric] ?? 0);
}

function density(nodes, edges) {
  return nodes > 1 ? (2 * edges) / (nodes * (nodes - 1)) : 0;
}

function neighborSet(edges, characterId) {
  const set = new Set();
  if (!characterId) return set;
  edges.forEach((edge) => {
    if (edge.source === characterId) set.add(edge.target);
    if (edge.target === characterId) set.add(edge.source);
  });
  return set;
}

function formatNumber(value, digits) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  if (Math.abs(number) >= 100) return String(Math.round(number));
  return number.toFixed(digits).replace(/\.?0+$/, "");
}

function titleCase(value) {
  return String(value || "").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function trimLabel(label) {
  const clean = String(label).replace(/_/g, " ");
  return truncateText(clean, 28);
}

function truncateText(value, maxLength) {
  const text = String(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function quantile(sortedValues, q) {
  if (!sortedValues.length) return 0;
  const index = clamp(q, 0, 1) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  const t = index - lower;
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * t;
}

function rankScores(values) {
  const clean = values.map((value) => Number.isFinite(value) ? value : 0);
  const unique = [...new Set(clean)].sort((a, b) => a - b);
  if (unique.length <= 1) return clean.map(() => 0.35);
  const scoreByValue = new Map(unique.map((value, index) => [value, index / (unique.length - 1)]));
  return clean.map((value) => scoreByValue.get(value) ?? 0);
}

function valueScores(values) {
  const clean = values.map((value) => Number.isFinite(value) ? Math.max(0, value) : 0);
  const max = Math.max(...clean, 0);
  if (max <= 0) return clean.map(() => 0.35);
  return clean.map((value) => value / max);
}

function expandTinyBounds(bounds) {
  const xSpan = bounds.maxX - bounds.minX;
  const ySpan = bounds.maxY - bounds.minY;
  const minSpan = 0.0001;
  const next = { ...bounds };

  if (xSpan < minSpan) {
    const center = (bounds.minX + bounds.maxX) / 2;
    next.minX = center - minSpan / 2;
    next.maxX = center + minSpan / 2;
  }

  if (ySpan < minSpan) {
    const center = (bounds.minY + bounds.maxY) / 2;
    next.minY = center - minSpan / 2;
    next.maxY = center + minSpan / 2;
  }

  return next;
}

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function interpolateColor(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const mix = ca.map((channel, index) => Math.round(channel + (cb[index] - channel) * clamp(t, 0, 1)));
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}
