const DATA_ROOT = "./data";
const DATA_VERSION = "20260518-vader-dl";
const DASHBOARD_SIZE = 4;
const OVERLAY_GRID_POINTS = 500;

const MODEL_KEYS = ["vader", "dl"];
const MODEL_LABELS = { vader: "VADER", dl: "DL (siebert)" };
const MODEL_FULL_LABELS = {
  vader: "VADER",
  dl: "DL (siebert)",
};
const MODEL_COLORS = { vader: "#b84a3a", dl: "#0f766e" };
const COMPARISON_COLORS = { vader: "#274c77", dl: "#a16207" };
const MODEL_PATTERN_INDEX = { vader: 0, dl: 1 };

// Colors for the three optional reference lines on the Single-view main chart.
const REF_LINE_COLORS = {
  midline:         "#7c3aed", // purple — start+end avg
  mean:            "#0f766e", // teal — overall mean
  firstLastScene:  "#d97706", // orange — first scene + last scene avg
};

function fieldsForSentiment(settings) {
  if (settings.sentiment === "all") return ["vader", "dl"];
  if (MODEL_KEYS.includes(settings.sentiment)) return [settings.sentiment];
  return ["vader"];
}

function modelLabel(field) {
  return MODEL_LABELS[field] || field;
}

const state = {
  view: "dashboard",
  playIndex: [],
  cache: new Map(),
  singlePlay: "hamlet",
  dashboardPlays: ["hamlet", "macbeth", "king-lear", "othello"],
  overlayPlays: ["hamlet", "macbeth", "king-lear", "othello"],
  overlayComparisonPlay: "",
  referencePlaysTouched: false,
  renderToken: 0,
  // Single-view main chart: which reference lines are visible
  refLineMidline: false,
  refLineMean: false,
  refLineFirstLastScene: false,
};

const charts = {
  dashboard: [],
  overlay: null,
  main: null,
  scenes: null,
  heatmap: null,
  speakers: null,
};

const el = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindElements();
  bindControls();
  initCharts();

  try {
    await loadPlayIndex();
    populatePlaySelectors();
    buildDashboardSlots();
    buildOverlayChecks();
    await renderAll();
    el.dataStatus.textContent = `Loaded ${state.playIndex.length} plays`;
  } catch (error) {
    el.dataStatus.textContent = "Data failed to load";
    console.error(error);
  }

  window.addEventListener("resize", debounce(() => {
    renderVisibleCharts();
  }, 120));
}

function bindElements() {
  const ids = [
    "dataStatus",
    "viewDashboard",
    "viewSingle",
    "viewOverlay",
    "singlePicker",
    "dashboardPicker",
    "overlayPicker",
    "singlePlay",
    "dashboardSlots",
    "overlayChecks",
    "overlayCount",
    "overlayAll",
    "overlayClear",
    "overlayComparison",
    "overlayComparisonClear",
    "granularity",
    "sentiment",
    "smoothing",
    "windowSize",
    "windowValue",
    "stageDirections",
    "yScale",
    "singleFilters",
    "speakerFilter",
    "actFilter",
    "sceneFilter",
    "speakerSort",
    "speakerMin",
    "speakerMinValue",
    "dashboardView",
    "singleView",
    "overlayView",
    "dashboardGrid",
    "overlayChartTitle",
    "overlayChartMeta",
    "overlayChart",
    "overlayTooltip",
    "mainChartTitle",
    "mainChartMeta",
    "mainChart",
    "mainTooltip",
    "sceneChart",
    "sceneTooltip",
    "heatmapChart",
    "heatmapTooltip",
    "speakerChart",
    "speakerTooltip",
    "contextTitle",
    "contextMeta",
    "contextText",
    "downloadMainPng",
    "downloadOverlayPng",
    "downloadScenePng",
    "downloadHeatmapPng",
    "downloadSpeakerPng",
    "downloadFiltered",
    "downloadPublic",
    "downloadSceneSummary",
    "downloadAllSummary",
    "downloadArcStats",
    "downloadAllArcStats",
    "refLineMidline",
    "refLineMean",
    "refLineFirstLastScene",
  ];
  ids.forEach((id) => {
    el[id] = document.getElementById(id);
  });
}

function bindControls() {
  [el.viewDashboard, el.viewOverlay, el.viewSingle].forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      renderAll();
    });
  });

  [
    el.singlePlay,
    el.granularity,
    el.sentiment,
    el.smoothing,
    el.stageDirections,
    el.yScale,
    el.speakerFilter,
    el.actFilter,
    el.sceneFilter,
    el.speakerSort,
    el.overlayComparison,
  ].forEach((control) => {
    control.addEventListener("change", () => {
      if (control === el.singlePlay) state.singlePlay = control.value;
      if (control === el.overlayComparison) state.overlayComparisonPlay = control.value;
      renderAll();
    });
  });

  el.windowSize.addEventListener("input", () => {
    el.windowValue.textContent = el.windowSize.value;
    renderAll();
  });

  el.speakerMin.addEventListener("input", () => {
    el.speakerMinValue.textContent = el.speakerMin.value;
    renderAll();
  });

  el.overlayAll.addEventListener("click", () => {
    setOverlayPlays(state.playIndex.map((play) => play.playId));
  });
  el.overlayClear.addEventListener("click", () => {
    setOverlayPlays([]);
  });
  el.overlayComparisonClear.addEventListener("click", () => {
    state.overlayComparisonPlay = "";
    el.overlayComparison.value = "";
    renderAll();
  });

  el.downloadMainPng.addEventListener("click", () => charts.main.download("sentiment-arc.png"));
  el.downloadOverlayPng.addEventListener("click", () => charts.overlay.download("overlay-compare.png"));
  el.downloadScenePng.addEventListener("click", () => charts.scenes.download("scene-sentiment.png"));
  el.downloadHeatmapPng.addEventListener("click", () => charts.heatmap.download("act-scene-heatmap.png"));
  el.downloadSpeakerPng.addEventListener("click", () => charts.speakers.download("speaker-sentiment.png"));
  el.downloadFiltered.addEventListener("click", downloadFilteredCsv);
  el.downloadPublic.addEventListener("click", downloadSelectedPublicCsv);
  el.downloadSceneSummary.addEventListener("click", downloadSelectedSceneCsv);
  el.downloadAllSummary.addEventListener("click", downloadAllSummaryCsv);
  el.downloadArcStats.addEventListener("click", downloadArcStatsCsv);
  el.downloadAllArcStats.addEventListener("click", downloadAllArcStatsCsv);

  // Reference line toggles for the Single-view main arc chart.
  el.refLineMidline.addEventListener("change", () => {
    state.refLineMidline = el.refLineMidline.checked;
    renderAll();
  });
  el.refLineMean.addEventListener("change", () => {
    state.refLineMean = el.refLineMean.checked;
    renderAll();
  });
  el.refLineFirstLastScene.addEventListener("change", () => {
    state.refLineFirstLastScene = el.refLineFirstLastScene.checked;
    renderAll();
  });
}

function initCharts() {
  charts.overlay = new OverlayChart(el.overlayChart, el.overlayTooltip, setContextFromOverlay);
  charts.main = new CurveChart(el.mainChart, el.mainTooltip, setContextFromItem);
  charts.scenes = new BarChart(el.sceneChart, el.sceneTooltip, setContextFromItem, "vertical");
  charts.heatmap = new HeatmapChart(el.heatmapChart, el.heatmapTooltip, setContextFromItem);
  charts.speakers = new BarChart(el.speakerChart, el.speakerTooltip, setContextFromItem, "horizontal");
}

async function loadPlayIndex() {
  const response = await fetch(dataUrl("play_index.json"), { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load play index: ${response.status}`);
  state.playIndex = await response.json();
  const ids = new Set(state.playIndex.map((play) => play.playId));
  state.dashboardPlays = state.dashboardPlays.map((playId, index) => {
    if (ids.has(playId)) return playId;
    return state.playIndex[index]?.playId || state.playIndex[0].playId;
  });
  state.overlayPlays = state.referencePlaysTouched
    ? state.overlayPlays.filter((playId) => ids.has(playId))
    : unique(state.dashboardPlays).filter((playId) => ids.has(playId));
  if (!state.overlayPlays.length) {
    state.overlayPlays = state.dashboardPlays.filter((playId) => ids.has(playId));
  }
  if (!ids.has(state.overlayComparisonPlay)) {
    state.overlayComparisonPlay = "";
  }
  if (!ids.has(state.singlePlay)) {
    state.singlePlay = state.dashboardPlays[0] || state.playIndex[0].playId;
  }
}

function populatePlaySelectors() {
  fillPlaySelect(el.singlePlay, state.singlePlay);
  fillOptionalPlaySelect(el.overlayComparison, state.overlayComparisonPlay);
}

function buildDashboardSlots() {
  el.dashboardSlots.innerHTML = "";
  el.dashboardGrid.innerHTML = "";
  charts.dashboard = [];

  for (let index = 0; index < DASHBOARD_SIZE; index += 1) {
    const row = document.createElement("div");
    row.className = "slot-row";
    row.innerHTML = `<span class="slot-index">${index + 1}</span>`;
    const select = document.createElement("select");
    select.id = `dashboardPlay${index}`;
    fillPlaySelect(select, state.dashboardPlays[index]);
    row.appendChild(select);
    el.dashboardSlots.appendChild(row);

    const card = document.createElement("article");
    card.className = "chart-card";
    card.innerHTML = `
      <header class="chart-header">
        <div>
          <h2 id="dashboardTitle${index}">Graph ${index + 1}</h2>
          <p id="dashboardMeta${index}" class="chart-meta"></p>
        </div>
        <div class="chart-actions">
          <select id="dashboardCardPlay${index}" aria-label="Graph ${index + 1} play"></select>
          <button class="small-button" type="button" data-download="${index}">PNG</button>
        </div>
      </header>
      <div class="canvas-wrap">
        <canvas id="dashboardChart${index}"></canvas>
        <div id="dashboardTooltip${index}" class="tooltip" role="status"></div>
      </div>
    `;
    el.dashboardGrid.appendChild(card);

    const chart = new CurveChart(
      document.getElementById(`dashboardChart${index}`),
      document.getElementById(`dashboardTooltip${index}`),
      setContextFromItem,
    );
    chart.titleElement = document.getElementById(`dashboardTitle${index}`);
    chart.metaElement = document.getElementById(`dashboardMeta${index}`);
    charts.dashboard.push(chart);

    const cardSelect = document.getElementById(`dashboardCardPlay${index}`);
    fillPlaySelect(cardSelect, state.dashboardPlays[index]);
    const setSlotPlay = (playId) => {
      state.dashboardPlays[index] = playId;
      select.value = playId;
      cardSelect.value = playId;
      if (!state.referencePlaysTouched) {
        syncReferencePlaysFromDashboard();
      }
      renderAll();
    };
    select.addEventListener("change", () => setSlotPlay(select.value));
    cardSelect.addEventListener("change", () => setSlotPlay(cardSelect.value));

    card.querySelector("[data-download]").addEventListener("click", () => {
      chart.download(`${slugify(state.dashboardPlays[index])}-sentiment.png`);
    });
  }
}

function buildOverlayChecks() {
  el.overlayChecks.innerHTML = "";
  const selected = new Set(state.overlayPlays);
  state.playIndex.forEach((play) => {
    const label = document.createElement("label");
    label.className = "check-row";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = play.playId;
    checkbox.checked = selected.has(play.playId);
    const text = document.createElement("span");
    text.textContent = play.playTitle;
    label.append(checkbox, text);
    el.overlayChecks.appendChild(label);

    checkbox.addEventListener("change", () => {
      state.referencePlaysTouched = true;
      if (checkbox.checked) {
        state.overlayPlays = unique([...state.overlayPlays, play.playId]);
      } else {
        state.overlayPlays = state.overlayPlays.filter((playId) => playId !== play.playId);
      }
      updateOverlayCount();
      renderAll();
    });
  });
  updateOverlayCount();
}

function setOverlayPlays(playIds, markTouched = true) {
  if (markTouched) state.referencePlaysTouched = true;
  const validIds = new Set(state.playIndex.map((play) => play.playId));
  state.overlayPlays = unique(playIds).filter((playId) => validIds.has(playId));
  buildOverlayChecks();
  renderAll();
}

function syncReferencePlaysFromDashboard() {
  const validIds = new Set(state.playIndex.map((play) => play.playId));
  state.overlayPlays = unique(state.dashboardPlays).filter((playId) => validIds.has(playId));
  buildOverlayChecks();
}

function updateOverlayCount() {
  el.overlayCount.textContent = String(state.overlayPlays.length);
}

function fillPlaySelect(select, selectedId) {
  select.innerHTML = "";
  fillPlayOptions(select, selectedId);
}

function fillOptionalPlaySelect(select, selectedId) {
  select.innerHTML = "";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "";
  empty.hidden = true;
  empty.selected = !selectedId;
  select.appendChild(empty);
  fillPlayOptions(select, selectedId);
  if (!selectedId) select.value = "";
}

function fillPlayOptions(select, selectedId) {
  state.playIndex.forEach((play) => {
    const option = document.createElement("option");
    option.value = play.playId;
    option.textContent = play.playTitle;
    if (play.playId === selectedId) option.selected = true;
    select.appendChild(option);
  });
}

async function getPlay(playId) {
  if (state.cache.has(playId)) return state.cache.get(playId);
  const meta = state.playIndex.find((play) => play.playId === playId);
  if (!meta) throw new Error(`Unknown play: ${playId}`);
  const response = await fetch(dataUrl(meta.dataPath), { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load ${playId}: ${response.status}`);
  const payload = await response.json();
  state.cache.set(playId, payload);
  return payload;
}

async function renderAll() {
  const token = ++state.renderToken;
  updateViewState();
  const settings = readSettings();

  if (state.view === "dashboard") {
    await renderDashboard(settings, token);
  } else if (state.view === "single") {
    await renderSingle(settings, token);
  } else {
    await renderOverlay(settings, token);
  }
}

function updateViewState() {
  el.viewDashboard.classList.toggle("is-active", state.view === "dashboard");
  el.viewSingle.classList.toggle("is-active", state.view === "single");
  el.viewOverlay.classList.toggle("is-active", state.view === "overlay");
  el.dashboardView.classList.toggle("is-hidden", state.view !== "dashboard");
  el.singleView.classList.toggle("is-hidden", state.view !== "single");
  el.overlayView.classList.toggle("is-hidden", state.view !== "overlay");
  el.dashboardPicker.classList.toggle("is-hidden", state.view !== "dashboard");
  el.singlePicker.classList.toggle("is-hidden", state.view !== "single");
  el.overlayPicker.classList.toggle("is-hidden", state.view !== "overlay");
  el.singleFilters.classList.toggle("is-hidden", state.view !== "single");
  syncSentimentOptionsForView();
}

function syncSentimentOptionsForView() {
  const allOption = el.sentiment.querySelector('option[value="all"]');
  if (!allOption) return;
  const isOverlay = state.view === "overlay";
  allOption.hidden = isOverlay;
  allOption.disabled = isOverlay;
  if (isOverlay && el.sentiment.value === "all") {
    el.sentiment.value = "vader";
  }
}

function readSettings() {
  return {
    granularity: el.granularity.value,
    sentiment: el.sentiment.value,
    smoothing: el.smoothing.value,
    windowSize: Number(el.windowSize.value),
    includeStage: el.stageDirections.checked,
    xAxis: "progress",
    yScale: el.yScale.value,
  };
}

function readFilters() {
  return {
    speaker: el.speakerFilter.value,
    act: el.actFilter.value,
    scene: el.sceneFilter.value,
  };
}

async function renderDashboard(settings, token) {
  const plays = await Promise.all(state.dashboardPlays.map((playId) => getPlay(playId)));
  if (token !== state.renderToken) return;

  plays.forEach((play, index) => {
    const rows = getRows(play, settings, {});
    const chart = charts.dashboard[index];
    const meta = settingsLabel(settings, rows.length);
    chart.titleElement.textContent = play.metadata.playTitle;
    chart.metaElement.textContent = meta;
    chart.setData({
      title: play.metadata.playTitle,
      meta,
      rows,
      settings,
      play,
      kind: "curve",
    });
  });
}

async function renderOverlay(settings, token) {
  const validIds = new Set(state.playIndex.map((play) => play.playId));
  const playIds = state.overlayPlays.filter((playId) => (
    validIds.has(playId)
  ));
  const comparisonPlayId = validIds.has(state.overlayComparisonPlay) ? state.overlayComparisonPlay : "";
  const [plays, comparisonPlay] = await Promise.all([
    Promise.all(playIds.map((playId) => getPlay(playId))),
    comparisonPlayId ? getPlay(comparisonPlayId) : Promise.resolve(null),
  ]);
  if (token !== state.renderToken) return;

  const overlaySettings = { ...settings, xAxis: "progress" };
  const datasets = plays
    .map((play) => ({
      play,
      rows: getRows(play, overlaySettings, {}),
    }))
    .filter((dataset) => dataset.rows.length > 1);
  const comparisonDataset = comparisonPlay
    ? {
        play: comparisonPlay,
        rows: getRows(comparisonPlay, overlaySettings, {}),
      }
    : null;
  const overlayData = buildOverlayData(
    datasets,
    overlaySettings,
    comparisonDataset?.rows.length > 1 ? comparisonDataset : null,
  );
  const count = datasets.length;
  const comparisonMeta = overlayData.comparison ? ` · comparison: ${overlayData.comparison.playTitle}` : "";
  const meta = count || overlayData.comparison
    ? `${scoreLabel(settings)} · ${smoothingLabel(overlaySettings)} · normalized progress · ${count} selected plays${comparisonMeta} · ${OVERLAY_GRID_POINTS} points`
    : "Select plays or a comparison play";

  el.overlayChartTitle.textContent = "Overlay";
  el.overlayChartMeta.textContent = meta;
  charts.overlay.setData({
    title: "Overlay",
    meta,
    ...overlayData,
    settings: overlaySettings,
    playCount: count,
    kind: "overlay",
  });
}

async function renderSingle(settings, token) {
  const play = await getPlay(state.singlePlay);
  if (token !== state.renderToken) return;

  populateSingleFilters(play);
  const filters = readFilters();
  const rows = getRows(play, settings, filters);
  const scenes = getSceneRows(play, settings).filter((row) => filterSceneRow(row, filters));
  const speakerRows = buildSpeakerRows(getRows(play, { ...settings, granularity: "units" }, {
    act: filters.act,
    scene: filters.scene,
  }), settings);
  const meta = settingsLabel(settings, rows.length);

  el.mainChartTitle.textContent = `${play.metadata.playTitle} Sentiment Arc`;
  el.mainChartMeta.textContent = meta;

  // Build reference lines based on the user's toggle state.
  // We use the PRIMARY model field (first in fieldsForSentiment) as the
  // source of truth for the threshold values, so the reference lines
  // describe the same curve the markers appear on.
  const refFields = fieldsForSentiment(settings);
  const primaryField = refFields[0];
  const primaryRaw = rows.map((row) => scoreFor(row, { ...settings, sentiment: primaryField }));
  const primarySmoothed = smoothValues(primaryRaw, settings.smoothing, settings.windowSize);
  const primaryStats = computeArcStats(primarySmoothed);
  const sceneInfo = getFirstLastSceneScores(play, primaryField);
  const referenceLines = [];
  if (primaryStats) {
    if (state.refLineMidline) {
      referenceLines.push({
        value: primaryStats.midlineScore,
        color: REF_LINE_COLORS.midline,
        label: "Start–End avg",
      });
    }
    if (state.refLineMean) {
      referenceLines.push({
        value: primaryStats.meanScore,
        color: REF_LINE_COLORS.mean,
        label: "Mean",
      });
    }
    if (state.refLineFirstLastScene && sceneInfo) {
      referenceLines.push({
        value: sceneInfo.firstLastAvg,
        color: REF_LINE_COLORS.firstLastScene,
        label: `First/Last scene avg (${sceneInfo.firstLabel} & ${sceneInfo.lastLabel})`,
      });
    }
  }

  charts.main.setData({
    title: play.metadata.playTitle,
    meta,
    rows,
    settings,
    play,
    kind: "curve",
    referenceLines,
  });

  const activeFields = fieldsForSentiment(settings);
  const decorateRow = (row) => {
    const values = activeFields.map((field) => scoreFor(row, { ...settings, sentiment: field }));
    return {
      ...row,
      label: row.sceneLabel,
      playTitle: play.metadata.playTitle,
      value: values[0],
      value2: values[1],
      value3: values[2],
      values,
      valueFields: activeFields,
    };
  };

  charts.scenes.setData({
    title: `${play.metadata.playTitle} Scenes`,
    meta: scoreLabel(settings),
    rows: scenes.map(decorateRow),
    settings,
    play,
    kind: "scene",
  });

  charts.heatmap.setData({
    title: `${play.metadata.playTitle} Heatmap`,
    meta: scoreLabel(settings),
    rows: scenes.map(decorateRow),
    settings,
    play,
    kind: "scene",
  });

  charts.speakers.setData({
    title: `${play.metadata.playTitle} Speakers`,
    meta: scoreLabel(settings),
    rows: speakerRows,
    settings,
    play,
    kind: "speaker",
  });
}

function populateSingleFilters(play) {
  const current = readFilters();
  fillSimpleSelect(el.speakerFilter, "All speakers", play.metadata.speakers, current.speaker);
  fillSimpleSelect(el.actFilter, "Whole play", play.metadata.acts, current.act);

  const scenes = play.scenes.include
    .filter((scene) => !current.act || scene.act === current.act)
    .map((scene) => scene.sceneLabel);
  fillSimpleSelect(el.sceneFilter, "All scenes", unique(scenes), current.scene);
}

function fillSimpleSelect(select, emptyLabel, values, selected) {
  select.innerHTML = "";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = emptyLabel;
  select.appendChild(empty);
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    if (value === selected) option.selected = true;
    select.appendChild(option);
  });
  if (selected && !values.includes(selected)) select.value = "";
}

function getRows(play, settings, filters) {
  if (settings.granularity === "scenes") {
    return getSceneRows(play, settings).filter((row) => filterSceneRow(row, filters));
  }

  let rows = play[settings.granularity] || [];
  if (!settings.includeStage) {
    rows = rows.filter((row) => row.type !== "stage_direction");
  }
  if (filters.speaker) {
    rows = rows.filter((row) => row.speaker === filters.speaker);
  }
  if (filters.act) {
    rows = rows.filter((row) => row.act === filters.act);
  }
  if (filters.scene) {
    rows = rows.filter((row) => row.sceneLabel === filters.scene);
  }
  return rows;
}

function getSceneRows(play, settings) {
  return settings.includeStage ? play.scenes.include : play.scenes.exclude;
}

function filterSceneRow(row, filters) {
  if (filters.act && row.act !== filters.act) return false;
  if (filters.scene && row.sceneLabel !== filters.scene) return false;
  return true;
}

function buildSpeakerRows(rows, settings) {
  const minCount = Number(el.speakerMin.value);
  const groups = new Map();
  rows.forEach((row) => {
    if (!row.speaker || row.type === "stage_direction") return;
    if (!groups.has(row.speaker)) {
      groups.set(row.speaker, { label: row.speaker, count: 0, vader: 0, dl: 0, text: "" });
    }
    const group = groups.get(row.speaker);
    group.count += 1;
    group.vader += Number(row.vader || 0);
    group.dl += Number(row.dl || 0);
    if (!group.text) group.text = row.text;
  });

  const activeFields = fieldsForSentiment(settings);
  const result = Array.from(groups.values())
    .map((group) => {
      const averaged = {
        vader: group.vader / group.count,
        dl: group.dl / group.count,
      };
      const values = activeFields.map((field) => scoreFor(averaged, { ...settings, sentiment: field }));
      return {
        ...group,
        ...averaged,
        value: values[0],
        value2: values[1],
        value3: values[2],
        values,
        valueFields: activeFields,
      };
    })
    .filter((group) => group.count >= minCount);

  const sort = el.speakerSort.value;
  result.sort((a, b) => {
    const aSort = scoreFor(a, settings);
    const bSort = scoreFor(b, settings);
    if (sort === "positive") return bSort - aSort;
    if (sort === "negative") return aSort - bSort;
    return b.count - a.count;
  });

  return result.slice(0, 16);
}

function buildOverlayData(datasets, settings, comparisonDataset = null) {
  const fields = fieldsForSentiment(settings);
  const curves = {};
  const averages = {};
  const comparison = comparisonDataset
    ? {
        playId: comparisonDataset.play.metadata.playId,
        playTitle: comparisonDataset.play.metadata.playTitle,
        curves: {},
      }
    : null;

  fields.forEach((field) => {
    curves[field] = datasets.map((dataset) => {
      const raw = dataset.rows.map((row) => scoreFor(row, { ...settings, sentiment: field }));
      const smoothed = smoothValues(raw, settings.smoothing, settings.windowSize);
      return {
        playId: dataset.play.metadata.playId,
        playTitle: dataset.play.metadata.playTitle,
        rows: dataset.rows,
        values: resampleValues(smoothed, OVERLAY_GRID_POINTS),
      };
    });
    averages[field] = averageCurves(curves[field].map((curve) => curve.values));
    if (comparison) {
      const raw = comparisonDataset.rows.map((row) => scoreFor(row, { ...settings, sentiment: field }));
      const smoothed = smoothValues(raw, settings.smoothing, settings.windowSize);
      comparison.curves[field] = {
        playId: comparison.playId,
        playTitle: comparison.playTitle,
        rows: comparisonDataset.rows,
        values: resampleValues(smoothed, OVERLAY_GRID_POINTS),
      };
    }
  });

  return { fields, curves, averages, comparison, gridPoints: OVERLAY_GRID_POINTS };
}

function resampleValues(values, targetLength) {
  if (!values.length) return [];
  if (targetLength <= 1) return [values[0]];
  if (values.length === 1) return Array.from({ length: targetLength }, () => values[0]);
  return Array.from({ length: targetLength }, (_, index) => {
    const source = (index / (targetLength - 1)) * (values.length - 1);
    const left = Math.floor(source);
    const right = Math.min(values.length - 1, left + 1);
    const ratio = source - left;
    return values[left] + (values[right] - values[left]) * ratio;
  });
}

function averageCurves(curves) {
  if (!curves.length) return [];
  const length = Math.max(...curves.map((curve) => curve.length));
  return Array.from({ length }, (_, index) => {
    let total = 0;
    let count = 0;
    curves.forEach((curve) => {
      const value = Number(curve[index]);
      if (Number.isFinite(value)) {
        total += value;
        count += 1;
      }
    });
    return count ? total / count : 0;
  });
}

class OverlayChart {
  constructor(canvas, tooltip, onSelect) {
    this.canvas = canvas;
    this.tooltip = tooltip;
    this.ctx = canvas.getContext("2d");
    this.onSelect = onSelect;
    this.payload = null;
    this.primary = [];
    this.bounds = null;
    this.scale = null;

    this.canvas.addEventListener("mousemove", (event) => this.handleMove(event));
    this.canvas.addEventListener("mouseleave", () => this.hideTooltip());
    this.canvas.addEventListener("click", (event) => this.handleClick(event));
  }

  setData(payload) {
    this.payload = payload;
    this.draw();
  }

  draw() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const width = rect.width;
    const height = rect.height;
    const plot = { left: 48, top: 52, right: width - 20, bottom: height - 42 };
    this.bounds = plot;
    this.primary = [];

    drawPanelBackground(this.ctx, width, height);
    drawTitle(this.ctx, this.payload?.title || "", this.payload?.meta || "", 14, 20);

    if (!this.payload || (!this.payload.playCount && !this.payload.comparison)) {
      drawEmpty(this.ctx, width, height, "Select plays or a comparison play");
      return;
    }

    const values = [];
    this.payload.fields.forEach((field) => {
      this.payload.curves[field].forEach((curve) => values.push(...curve.values));
      values.push(...this.payload.averages[field]);
      if (this.payload.comparison?.curves[field]) {
        values.push(...this.payload.comparison.curves[field].values);
      }
    });
    const [yMin, yMax] = scoreDomainFromValues(values, this.payload.settings, true);
    const scale = {
      x: (value) => map(value, 0, 100, plot.left, plot.right),
      y: (value) => map(value, yMin, yMax, plot.bottom, plot.top),
      yMin,
      yMax,
    };
    this.scale = scale;
    const colors = MODEL_COLORS;
    const comparisonColors = COMPARISON_COLORS;

    drawGrid(this.ctx, plot, scale);
    drawZeroBaseline(this.ctx, plot, scale);
    drawProgressAxis(this.ctx, plot, scale);

    const backgroundAlpha = clamp(0.55 / Math.sqrt(Math.max(1, this.payload.playCount)), 0.08, 0.26);
    if (this.payload.playCount) {
      this.payload.fields.forEach((field, fieldIndex) => {
        const alpha = fieldIndex ? backgroundAlpha * 0.72 : backgroundAlpha;
        const color = `rgba(70, 77, 75, ${alpha})`;
        this.payload.curves[field].forEach((curve) => {
          drawLine(this.ctx, gridSeries(curve.values, scale), color, plot, 1.2);
        });
      });

      this.payload.fields.forEach((field) => {
        const series = gridSeries(this.payload.averages[field], scale);
        if (!this.primary.length) this.primary = series;
        drawLine(this.ctx, series, colors[field], plot, 3);
      });
    }

    if (this.payload.comparison) {
      this.payload.fields.forEach((field) => {
        const comparisonCurve = this.payload.comparison.curves[field];
        if (!comparisonCurve) return;
        const series = gridSeries(comparisonCurve.values, scale);
        if (!this.primary.length) this.primary = series;
        drawLine(this.ctx, series, comparisonColors[field], plot, 3.2);
      });
    }

    drawOverlayLegend(this.ctx, this.payload, colors, comparisonColors, Math.max(plot.left + 12, plot.right - 178), 18);
  }

  handleMove(event) {
    const item = this.nearestItem(event);
    if (!item) {
      this.hideTooltip();
      return;
    }
    showTooltip(this.tooltip, event, overlayTooltipHtml(this.payload, item));
  }

  handleClick(event) {
    const item = this.nearestItem(event);
    if (item) this.onSelect(this.payload, item);
  }

  nearestItem(event) {
    if (!this.primary.length || !this.bounds || !this.scale || !this.payload) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x < this.bounds.left - 24 || x > this.bounds.right + 24) return null;

    const progress = clamp(map(x, this.bounds.left, this.bounds.right, 0, 100), 0, 100);
    const length = this.payload.gridPoints || this.primary.length;
    const index = clamp(Math.round((progress / 100) * (length - 1)), 0, length - 1);
    const averagePoint = this.primary[index] || this.primary[0];
    return {
      ...averagePoint,
      index,
      progress,
      closest: this.closestCurveAt(x, y, index),
    };
  }

  closestCurveAt(x, y, centerIndex) {
    let best = null;
    let bestDistance = Infinity;
    const considerCurve = (curve, field, role) => {
      const start = Math.max(0, centerIndex - 2);
      const end = Math.min(curve.values.length - 1, centerIndex + 2);
      for (let index = start; index <= end; index += 1) {
        const value = curve.values[index];
        const progress = curve.values.length <= 1 ? 0 : (index / (curve.values.length - 1)) * 100;
        const px = this.scale.x(progress);
        const py = this.scale.y(value);
        const distance = Math.hypot(px - x, (py - y) * 1.25);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = {
            playTitle: curve.playTitle,
            field,
            role,
            value,
            progress,
          };
        }
      }
    };
    this.payload.fields.forEach((field) => {
      this.payload.curves[field].forEach((curve) => {
        considerCurve(curve, field, "Selected");
      });
      const comparisonCurve = this.payload.comparison?.curves[field];
      if (comparisonCurve) {
        considerCurve(comparisonCurve, field, "Comparison");
      }
    });
    return bestDistance <= 34 ? best : null;
  }

  hideTooltip() {
    this.tooltip.style.display = "none";
  }

  download(filename) {
    downloadCanvas(this.canvas, filename);
  }
}

class CurveChart {
  constructor(canvas, tooltip, onSelect) {
    this.canvas = canvas;
    this.tooltip = tooltip;
    this.ctx = canvas.getContext("2d");
    this.onSelect = onSelect;
    this.payload = null;
    this.primary = [];
    this.bounds = null;

    this.canvas.addEventListener("mousemove", (event) => this.handleMove(event));
    this.canvas.addEventListener("mouseleave", () => this.hideTooltip());
    this.canvas.addEventListener("click", (event) => this.handleClick(event));
  }

  setData(payload) {
    this.payload = payload;
    this.draw();
  }

  draw() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const width = rect.width;
    const height = rect.height;
    const plot = { left: 44, top: 48, right: width - 18, bottom: height - 34 };
    this.bounds = plot;
    this.primary = [];

    drawPanelBackground(this.ctx, width, height);
    drawTitle(this.ctx, this.payload?.title || "", this.payload?.meta || "", 14, 20);

    if (!this.payload || !this.payload.rows.length) {
      drawEmpty(this.ctx, width, height, "No rows");
      return;
    }

    const fields = fieldsForSentiment(this.payload.settings);
    const colors = MODEL_COLORS;
    const rows = this.payload.rows;
    const smoothedValues = {};
    fields.forEach((field) => {
      const raw = rows.map((row) => scoreFor(row, { ...this.payload.settings, sentiment: field }));
      smoothedValues[field] = smoothValues(raw, this.payload.settings.smoothing, this.payload.settings.windowSize);
    });
    const yDomain = scoreDomainFromValues(Object.values(smoothedValues).flat(), this.payload.settings, true);
    const scale = createScale(rows, plot, this.payload.settings, false, yDomain);
    drawGrid(this.ctx, plot, scale);
    drawZeroBaseline(this.ctx, plot, scale);
    drawBoundaries(this.ctx, rows, plot, scale, this.payload.settings);

    fields.forEach((field) => {
      const series = buildSeriesFromValues(rows, smoothedValues[field], this.payload.settings, scale);
      if (field === fields[0]) this.primary = series;
      drawLine(this.ctx, series, colors[field], plot);
    });

    // Draw reference lines + crossing markers (Single view main chart only).
    if (this.payload.referenceLines && this.payload.referenceLines.length) {
      drawReferenceLines(
        this.ctx,
        plot,
        scale,
        this.payload.referenceLines,
        smoothedValues,
        fields,
      );
    }

    drawLegend(this.ctx, fields, colors, plot.right - 120, 18);
  }

  handleMove(event) {
    const item = this.nearestItem(event);
    if (!item) {
      this.hideTooltip();
      return;
    }
    showTooltip(this.tooltip, event, tooltipHtml(this.payload.play.metadata.playTitle, item.row));
  }

  handleClick(event) {
    const item = this.nearestItem(event);
    if (item) this.onSelect(this.payload.play, item.row, this.payload.kind);
  }

  nearestItem(event) {
    if (!this.primary.length || !this.bounds) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    let best = null;
    let bestDistance = Infinity;
    this.primary.forEach((point) => {
      const distance = Math.abs(point.px - x);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = point;
      }
    });
    return bestDistance <= 32 ? best : null;
  }

  hideTooltip() {
    this.tooltip.style.display = "none";
  }

  download(filename) {
    downloadCanvas(this.canvas, filename);
  }
}

class BarChart {
  constructor(canvas, tooltip, onSelect, orientation) {
    this.canvas = canvas;
    this.tooltip = tooltip;
    this.ctx = canvas.getContext("2d");
    this.onSelect = onSelect;
    this.orientation = orientation;
    this.payload = null;
    this.items = [];

    this.canvas.addEventListener("mousemove", (event) => this.handleMove(event));
    this.canvas.addEventListener("mouseleave", () => this.hideTooltip());
    this.canvas.addEventListener("click", (event) => this.handleClick(event));
  }

  setData(payload) {
    this.payload = payload;
    this.draw();
  }

  draw() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const width = rect.width;
    const height = rect.height;
    this.items = [];

    drawPanelBackground(this.ctx, width, height);
    drawTitle(this.ctx, this.payload?.title || "", this.payload?.meta || "", 14, 20);
    if (!this.payload || !this.payload.rows.length) {
      drawEmpty(this.ctx, width, height, "No rows");
      return;
    }

    if (this.orientation === "horizontal") {
      this.drawHorizontal(width, height);
    } else {
      this.drawVertical(width, height);
    }
  }

  drawVertical(width, height) {
    const rows = this.payload.rows.slice(0, 48);
    const plot = { left: 42, top: 48, right: width - 18, bottom: height - 44 };
    const [yMin, yMax] = scoreDomain(rows, this.payload.settings, true);
    const scale = {
      y: (value) => map(value, yMin, yMax, plot.bottom, plot.top),
      yMin,
      yMax,
    };
    drawGrid(this.ctx, plot, scale);
    drawZeroBaseline(this.ctx, plot, scale);
    const step = (plot.right - plot.left) / rows.length;
    const activeFields = fieldsForSentiment(this.payload.settings);
    const fieldCount = activeFields.length;
    const showLegend = fieldCount > 1;
    const colorDomain = colorDomainForRows(rows, this.payload.settings);
    const groupRatio = fieldCount === 1 ? 0.72 : fieldCount === 2 ? 0.34 : 0.24;
    rows.forEach((row, index) => {
      const values = rowValues(row, activeFields);
      const x = plot.left + index * step + step * 0.14;
      const zero = scale.y(0);
      const barWidth = Math.max(3, step * groupRatio);
      const gap = Math.max(2, step * 0.04);
      values.forEach((barValue, barIndex) => {
        const y = scale.y(barValue);
        const xx = x + barIndex * (barWidth + gap);
        const top = Math.min(y, zero);
        const height = Math.max(1, Math.abs(y - zero));
        drawScoreFill(this.ctx, xx, top, barWidth, height, barValue, colorDomain, MODEL_PATTERN_INDEX[activeFields[barIndex]] || barIndex);
      });
      const maxVal = Math.max(...values);
      const minVal = Math.min(...values);
      this.items.push({
        row,
        x,
        y: Math.min(scale.y(maxVal), zero),
        width: barWidth * fieldCount + gap * (fieldCount - 1),
        height: Math.max(1, Math.abs(scale.y(minVal) - scale.y(maxVal)) + 3),
      });
      if (step > 26) {
        this.ctx.save();
        const centerOffset = (barWidth * fieldCount + gap * (fieldCount - 1)) / 2;
        this.ctx.translate(x + centerOffset, plot.bottom + 6);
        this.ctx.rotate(-Math.PI / 4);
        this.ctx.fillStyle = "#62706c";
        this.ctx.font = "10px sans-serif";
        this.ctx.fillText(row.label, 0, 0);
        this.ctx.restore();
      }
    });
    if (showLegend) drawModelLegend(this.ctx, plot.right - 128, 20, activeFields);
  }

  drawHorizontal(width, height) {
    const rows = this.payload.rows.slice(0, 16);
    const plot = { left: 108, top: 50, right: width - 20, bottom: height - 22 };
    const [xMin, xMax] = scoreDomain(rows, this.payload.settings, true);
    const scale = {
      x: (value) => map(value, xMin, xMax, plot.left, plot.right),
    };
    const activeFields = fieldsForSentiment(this.payload.settings);
    const fieldCount = activeFields.length;
    const showLegend = fieldCount > 1;
    const colorDomain = colorDomainForRows(rows, this.payload.settings);
    drawZeroBaseline(this.ctx, plot, scale, "vertical");

    const step = (plot.bottom - plot.top) / rows.length;
    const groupRatio = fieldCount === 1 ? 0.64 : fieldCount === 2 ? 0.3 : 0.22;
    rows.forEach((row, index) => {
      const values = rowValues(row, activeFields);
      const y = plot.top + index * step + step * 0.18;
      const barHeight = Math.max(3, step * groupRatio);
      values.forEach((barValue, barIndex) => {
        const x = map(Math.min(0, barValue), xMin, xMax, plot.left, plot.right);
        const x2 = map(Math.max(0, barValue), xMin, xMax, plot.left, plot.right);
        const yy = y + barIndex * (barHeight + 2);
        drawScoreFill(this.ctx, x, yy, Math.max(1, x2 - x), barHeight, barValue, colorDomain, MODEL_PATTERN_INDEX[activeFields[barIndex]] || barIndex);
      });
      this.ctx.fillStyle = "#33403d";
      this.ctx.font = "11px sans-serif";
      this.ctx.textAlign = "right";
      const labelY = y + (barHeight * fieldCount + 2 * (fieldCount - 1)) / 2;
      this.ctx.fillText(truncate(row.label, 16), plot.left - 8, labelY + 3);
      const low = Math.min(...values, 0);
      const high = Math.max(...values, 0);
      this.items.push({
        row,
        x: map(low, xMin, xMax, plot.left, plot.right),
        y,
        width: Math.max(1, map(high, xMin, xMax, plot.left, plot.right) - map(low, xMin, xMax, plot.left, plot.right)),
        height: barHeight * fieldCount + 2 * (fieldCount - 1),
      });
    });
    if (showLegend) drawModelLegend(this.ctx, plot.right - 128, 20, activeFields);
    this.ctx.textAlign = "left";
  }

  handleMove(event) {
    const item = this.hitItem(event);
    if (!item) {
      this.hideTooltip();
      return;
    }
    showTooltip(this.tooltip, event, tooltipHtml(this.payload.play.metadata.playTitle, item.row));
  }

  handleClick(event) {
    const item = this.hitItem(event);
    if (item) this.onSelect(this.payload.play, item.row, this.payload.kind);
  }

  hitItem(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return this.items.find((item) => (
      x >= item.x - 3 &&
      x <= item.x + item.width + 3 &&
      y >= item.y - 3 &&
      y <= item.y + item.height + 3
    ));
  }

  hideTooltip() {
    this.tooltip.style.display = "none";
  }

  download(filename) {
    downloadCanvas(this.canvas, filename);
  }
}

class HeatmapChart {
  constructor(canvas, tooltip, onSelect) {
    this.canvas = canvas;
    this.tooltip = tooltip;
    this.ctx = canvas.getContext("2d");
    this.onSelect = onSelect;
    this.payload = null;
    this.items = [];

    this.canvas.addEventListener("mousemove", (event) => this.handleMove(event));
    this.canvas.addEventListener("mouseleave", () => this.hideTooltip());
    this.canvas.addEventListener("click", (event) => this.handleClick(event));
  }

  setData(payload) {
    this.payload = payload;
    this.draw();
  }

  draw() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const width = rect.width;
    const height = rect.height;
    this.items = [];

    drawPanelBackground(this.ctx, width, height);
    drawTitle(this.ctx, this.payload?.title || "", this.payload?.meta || "", 14, 20);
    if (!this.payload || !this.payload.rows.length) {
      drawEmpty(this.ctx, width, height, "No rows");
      return;
    }

    const acts = groupScenesByAct(this.payload.rows);
    const maxCols = Math.max(...acts.map((act) => act.rows.length));
    const plot = { left: 48, top: 58, right: width - 18, bottom: height - 24 };
    const cellWidth = (plot.right - plot.left) / maxCols;
    const cellHeight = (plot.bottom - plot.top) / acts.length;
    const activeFields = fieldsForSentiment(this.payload.settings);
    const fieldCount = activeFields.length;
    const showLegend = fieldCount > 1;
    const colorDomain = colorDomainForRows(this.payload.rows, this.payload.settings);

    acts.forEach((actGroup, rowIndex) => {
      const y = plot.top + rowIndex * cellHeight;
      this.ctx.fillStyle = "#33403d";
      this.ctx.font = "11px sans-serif";
      this.ctx.textAlign = "right";
      this.ctx.fillText(`Act ${actGroup.act}`, plot.left - 8, y + cellHeight * 0.58);
      actGroup.rows.forEach((scene, colIndex) => {
        const x = plot.left + colIndex * cellWidth;
        const pad = 3;
        const innerWidth = cellWidth - pad * 2;
        const innerHeight = cellHeight - pad * 2;
        const values = rowValues(scene, activeFields);
        if (fieldCount > 1) {
          const stripWidth = innerWidth / fieldCount;
          values.forEach((value, fieldIndex) => {
            drawScoreFill(
              this.ctx,
              x + pad + stripWidth * fieldIndex,
              y + pad,
              stripWidth,
              innerHeight,
              value,
              colorDomain,
              MODEL_PATTERN_INDEX[activeFields[fieldIndex]] || fieldIndex,
            );
          });
        } else {
          drawScoreFill(this.ctx, x + pad, y + pad, innerWidth, innerHeight, values[0], colorDomain, MODEL_PATTERN_INDEX[activeFields[0]] || 0);
        }
        this.ctx.fillStyle = rgbaText(values[0]);
        this.ctx.textAlign = "center";
        this.ctx.font = "10px sans-serif";
        this.ctx.fillText(scene.sceneLabel, x + cellWidth / 2, y + cellHeight / 2 + 3);
        this.items.push({
          row: scene,
          x: x + pad,
          y: y + pad,
          width: innerWidth,
          height: innerHeight,
        });
      });
    });
    if (showLegend) drawModelLegend(this.ctx, plot.right - 128, 20, activeFields);
    this.ctx.textAlign = "left";
  }

  handleMove(event) {
    const item = this.hitItem(event);
    if (!item) {
      this.hideTooltip();
      return;
    }
    showTooltip(this.tooltip, event, tooltipHtml(this.payload.play.metadata.playTitle, item.row));
  }

  handleClick(event) {
    const item = this.hitItem(event);
    if (item) this.onSelect(this.payload.play, item.row, this.payload.kind);
  }

  hitItem(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return this.items.find((item) => (
      x >= item.x &&
      x <= item.x + item.width &&
      y >= item.y &&
      y <= item.y + item.height
    ));
  }

  hideTooltip() {
    this.tooltip.style.display = "none";
  }

  download(filename) {
    downloadCanvas(this.canvas, filename);
  }
}

// ---------------------------------------------------------------------------
// Arc statistics: all metrics derived from a smoothed sentiment value array
// ---------------------------------------------------------------------------

/**
 * Compute summary statistics for a smoothed sentiment arc.
 *
 * Definitions
 * ───────────
 * startScore          First value in the smoothed array (index 0)
 * endScore            Last value in the smoothed array (index n-1)
 * midlineScore        (startScore + endScore) / 2  — the "start-end average"
 * highScore           Maximum value in the array
 * lowScore            Minimum value in the array
 * meanScore           Arithmetic mean of all values
 *
 * Crossings are counted by looking at consecutive pairs of values and
 * detecting a sign change relative to the threshold line, i.e. when
 * (values[i] - threshold) and (values[i+1] - threshold) have opposite signs.
 * Touching exactly on the line (delta === 0) is counted as a crossing once.
 *
 * crossingsMidline    Number of times the arc crosses the midlineScore line
 * crossingsMean       Number of times the arc crosses the meanScore line
 */
/**
 * Pull the first scene (1.1) and last scene (n.n) sentiment averages
 * from the scene-level aggregates for a given model field.
 *
 * Returns { firstScene, lastScene, firstLastAvg } or null if unavailable.
 *
 * Note: scenes.exclude already excludes stage directions in the underlying
 * dataset, so this is the cleanest scene-level signal we have.
 */
function getFirstLastSceneScores(play, field) {
  const scenes = play?.scenes?.exclude;
  if (!Array.isArray(scenes) || scenes.length === 0) return null;
  const first = scenes[0];
  const last  = scenes[scenes.length - 1];
  const firstScore = Number(first[field]);
  const lastScore  = Number(last[field]);
  if (!Number.isFinite(firstScore) || !Number.isFinite(lastScore)) return null;
  return {
    firstScene:    firstScore,
    lastScene:     lastScore,
    firstLastAvg:  (firstScore + lastScore) / 2,
    firstLabel:    first.sceneLabel || `${first.act}.${first.sceneIndex || ""}`,
    lastLabel:     last.sceneLabel  || `${last.act}.${last.sceneIndex  || ""}`,
  };
}

function computeArcStats(values) {
  if (!values || values.length === 0) {
    return null;
  }

  const startScore = values[0];
  const endScore   = values[values.length - 1];
  const midlineScore = (startScore + endScore) / 2;

  let high = -Infinity;
  let low  =  Infinity;
  let sum  = 0;
  for (const v of values) {
    if (v > high) high = v;
    if (v < low)  low  = v;
    sum += v;
  }
  const highScore = high;
  const lowScore  = low;
  const meanScore = sum / values.length;

  function countCrossings(threshold) {
    let count = 0;
    for (let i = 0; i < values.length - 1; i += 1) {
      const a = values[i]     - threshold;
      const b = values[i + 1] - threshold;
      // Exact touch on the line at i+1: count once, then skip next pair
      // to avoid double-counting a bounce off the line.
      if (b === 0) {
        count += 1;
        i += 1; // skip the pair starting at i+1
      } else if ((a < 0 && b > 0) || (a > 0 && b < 0)) {
        count += 1;
      }
      // If a === 0, this point was already counted in the previous iteration
    }
    return count;
  }

  const crossingsMidline = countCrossings(midlineScore);
  const crossingsMean    = countCrossings(meanScore);

  return {
    startScore,
    endScore,
    midlineScore,
    highScore,
    lowScore,
    meanScore,
    crossingsMidline,
    crossingsMean,
  };
}

/**
 * Build one CSV row of arc stats for a single play + model field.
 * Returns a plain object whose keys match the CSV header.
 *
 * sceneInfo (optional) is the object returned by getFirstLastSceneScores().
 * When provided, three additional columns are populated: first_scene_score,
 * last_scene_score, first_last_scene_avg, and crossings_first_last_scene_avg
 * (crossings of the smoothed arc against the first_last_scene_avg line).
 */
function arcStatsRow(playTitle, field, values, sceneInfo) {
  const stats = computeArcStats(values);
  if (!stats) return null;

  // Count crossings of the smoothed arc against the first-last scene avg line.
  let crossingsFirstLastScene = "";
  if (sceneInfo && Number.isFinite(sceneInfo.firstLastAvg)) {
    crossingsFirstLastScene = String(countCrossingsAt(values, sceneInfo.firstLastAvg));
  }

  return {
    play_title:                       playTitle,
    model:                            modelLabel(field),
    start_score:                      formatScore(stats.startScore),
    end_score:                        formatScore(stats.endScore),
    midline_score:                    formatScore(stats.midlineScore),
    high_score:                       formatScore(stats.highScore),
    low_score:                        formatScore(stats.lowScore),
    mean_score:                       formatScore(stats.meanScore),
    first_scene_label:                sceneInfo ? sceneInfo.firstLabel : "",
    last_scene_label:                 sceneInfo ? sceneInfo.lastLabel  : "",
    first_scene_score:                sceneInfo ? formatScore(sceneInfo.firstScene)   : "",
    last_scene_score:                 sceneInfo ? formatScore(sceneInfo.lastScene)    : "",
    first_last_scene_avg:             sceneInfo ? formatScore(sceneInfo.firstLastAvg) : "",
    crossings_midline:                String(stats.crossingsMidline),
    crossings_mean:                   String(stats.crossingsMean),
    crossings_first_last_scene_avg:   crossingsFirstLastScene,
  };
}

/**
 * Standalone crossings counter — same logic used inside computeArcStats
 * but exposed for arbitrary threshold lines (e.g. the first-last scene avg).
 */
function countCrossingsAt(values, threshold) {
  if (!values || values.length < 2) return 0;
  let count = 0;
  for (let i = 0; i < values.length - 1; i += 1) {
    const a = values[i]     - threshold;
    const b = values[i + 1] - threshold;
    if (b === 0) {
      count += 1;
      i += 1;
    } else if ((a < 0 && b > 0) || (a > 0 && b < 0)) {
      count += 1;
    }
  }
  return count;
}

/**
 * Download arc-statistics CSV for the currently selected single play,
 * respecting the active sentiment model, granularity, smoothing and
 * stage-direction settings — identical to what the main curve chart displays.
 */
async function downloadArcStatsCsv() {
  const settings = readSettings();
  const play     = await getPlay(state.singlePlay);
  const rows     = getRows(play, settings, readFilters());
  const fields   = fieldsForSentiment(settings);

  const header = [
    "play_title",
    "model",
    "start_score",
    "end_score",
    "midline_score",
    "high_score",
    "low_score",
    "mean_score",
    "first_scene_label",
    "last_scene_label",
    "first_scene_score",
    "last_scene_score",
    "first_last_scene_avg",
    "crossings_midline",
    "crossings_mean",
    "crossings_first_last_scene_avg",
  ];

  const lines = [header.join(",")];

  fields.forEach((field) => {
    const raw       = rows.map((row) => scoreFor(row, { ...settings, sentiment: field }));
    const smoothed  = smoothValues(raw, settings.smoothing, settings.windowSize);
    const sceneInfo = getFirstLastSceneScores(play, field);
    const statsRow  = arcStatsRow(play.metadata.playTitle, field, smoothed, sceneInfo);
    if (statsRow) {
      lines.push(header.map((key) => csvEscape(statsRow[key])).join(","));
    }
  });

  const csv = `${lines.join("\n")}\n`;
  downloadText(csv, `${slugify(play.metadata.playTitle)}-arc-stats.csv`, "text/csv");
}

/**
 * Download arc-statistics CSV for ALL plays currently loaded in the index,
 * using the active settings. Each play + model combination gets one row.
 */
async function downloadAllArcStatsCsv() {
  const settings = readSettings();
  const fields   = fieldsForSentiment(settings);

  const header = [
    "play_title",
    "model",
    "start_score",
    "end_score",
    "midline_score",
    "high_score",
    "low_score",
    "mean_score",
    "first_scene_label",
    "last_scene_label",
    "first_scene_score",
    "last_scene_score",
    "first_last_scene_avg",
    "crossings_midline",
    "crossings_mean",
    "crossings_first_last_scene_avg",
  ];

  const lines = [header.join(",")];

  for (const meta of state.playIndex) {
    let play;
    try {
      play = await getPlay(meta.playId);
    } catch {
      continue;
    }
    const rows = getRows(play, settings, {});
    fields.forEach((field) => {
      const raw       = rows.map((row) => scoreFor(row, { ...settings, sentiment: field }));
      const smoothed  = smoothValues(raw, settings.smoothing, settings.windowSize);
      const sceneInfo = getFirstLastSceneScores(play, field);
      const statsRow  = arcStatsRow(play.metadata.playTitle, field, smoothed, sceneInfo);
      if (statsRow) {
        lines.push(header.map((key) => csvEscape(statsRow[key])).join(","));
      }
    });
  }

  const csv = `${lines.join("\n")}\n`;
  downloadText(csv, "arc-stats-all-plays.csv", "text/csv");
}

// ---------------------------------------------------------------------------

function buildSeries(rows, field, settings, scale) {
  const raw = rows.map((row) => scoreFor(row, { ...settings, sentiment: field }));
  const values = smoothValues(raw, settings.smoothing, settings.windowSize);
  return buildSeriesFromValues(rows, values, settings, scale);
}

function buildSeriesFromValues(rows, values, settings, scale) {
  const series = rows.map((row, index) => {
    const xValue = xValueForRow(row, index, rows.length, settings);
    return {
      row,
      value: values[index],
      px: scale.x(xValue),
      py: scale.y(values[index]),
    };
  });
  return sampleSeries(series, 1200);
}

function gridSeries(values, scale) {
  if (!values.length) return [];
  return values.map((value, index) => {
    const progress = values.length <= 1 ? 0 : (index / (values.length - 1)) * 100;
    return {
      index,
      progress,
      value,
      px: scale.x(progress),
      py: scale.y(value),
    };
  });
}

function smoothValues(values, method, windowSize) {
  if (method === "raw" || values.length < 3) return values.slice();
  if (method === "lowess") return lowessValues(values, windowSize);
  const radius = Math.max(1, Math.round((method === "smooth" ? windowSize * 1.4 : windowSize) / 2));
  return values.map((_, index) => {
    let total = 0;
    let weightTotal = 0;
    const start = Math.max(0, index - radius);
    const end = Math.min(values.length - 1, index + radius);
    for (let cursor = start; cursor <= end; cursor += 1) {
      const distance = Math.abs(cursor - index);
      const weight = method === "smooth" ? radius + 1 - distance : 1;
      total += values[cursor] * weight;
      weightTotal += weight;
    }
    return total / weightTotal;
  });
}

function lowessValues(values, windowSize) {
  const radius = Math.max(2, Math.round(windowSize / 2));
  let robustWeights = values.map(() => 1);
  let fitted = values.slice();

  for (let iteration = 0; iteration < 3; iteration += 1) {
    fitted = values.map((_, index) => localLinearLowess(values, index, radius, robustWeights));
    const residuals = values.map((value, index) => Math.abs(value - fitted[index]));
    const scale = medianNumber(residuals) || 1e-6;
    robustWeights = residuals.map((residual) => {
      const ratio = residual / (6 * scale);
      if (ratio >= 1) return 0;
      return (1 - ratio * ratio) ** 2;
    });
  }

  return fitted;
}

function localLinearLowess(values, index, radius, robustWeights) {
  const start = Math.max(0, index - radius);
  const end = Math.min(values.length - 1, index + radius);
  const maxDistance = Math.max(index - start, end - index, 1);
  let sw = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;

  for (let cursor = start; cursor <= end; cursor += 1) {
    const x = cursor - index;
    const distance = Math.abs(x) / maxDistance;
    const weight = ((1 - distance ** 3) ** 3) * robustWeights[cursor];
    const y = values[cursor];
    sw += weight;
    sx += weight * x;
    sy += weight * y;
    sxx += weight * x * x;
    sxy += weight * x * y;
  }

  if (sw <= 1e-9) return values[index];
  const denominator = sw * sxx - sx * sx;
  if (Math.abs(denominator) < 1e-9) return sy / sw;
  const slope = (sw * sxy - sx * sy) / denominator;
  return (sy - slope * sx) / sw;
}

function medianNumber(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function sampleSeries(series, maxPoints) {
  if (series.length <= maxPoints) return series;
  const result = [];
  const step = series.length / maxPoints;
  for (let index = 0; index < maxPoints; index += 1) {
    result.push(series[Math.floor(index * step)]);
  }
  result.push(series[series.length - 1]);
  return result;
}

function scoreDomain(rows, settings, includeZero) {
  if (settings.yScale === "fixed") return [-1, 1];
  const values = [];
  const activeFields = fieldsForSentiment(settings);
  rows.forEach((row) => {
    if (Number.isFinite(Number(row.value))) values.push(Number(row.value));
    if (Number.isFinite(Number(row.value2))) values.push(Number(row.value2));
    if (Number.isFinite(Number(row.value3))) values.push(Number(row.value3));
    if (settings.sentiment === "all") {
      activeFields.forEach((field) => {
        values.push(Number(row[field] || 0));
      });
    } else {
      values.push(scoreFor(row, settings));
    }
  });
  return scoreDomainFromValues(values, settings, includeZero);
}

function scoreDomainFromValues(values, settings, includeZero) {
  if (settings.yScale === "fixed") return [-1, 1];
  const domainValues = values.filter((value) => Number.isFinite(Number(value))).map(Number);
  if (includeZero) domainValues.push(0);
  let min = Math.min(...domainValues);
  let max = Math.max(...domainValues);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [-1, 1];
  if (min === max) {
    min -= 0.1;
    max += 0.1;
  }
  const range = max - min;
  const padding = Math.max(0.04, range * 0.18);
  min = Math.max(-1, min - padding);
  max = Math.min(1, max + padding);
  if (max - min < 0.12) {
    const center = (min + max) / 2;
    min = Math.max(-1, center - 0.06);
    max = Math.min(1, center + 0.06);
  }
  return [min, max];
}

function createScale(rows, plot, settings, includeZero, yDomain) {
  const xValues = rows.map((row, index) => xValueForRow(row, index, rows.length, settings));
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const [yMin, yMax] = yDomain || scoreDomain(rows, settings, includeZero);
  return {
    x: (value) => map(value, minX, maxX || minX + 1, plot.left, plot.right),
    y: (value) => map(value, yMin, yMax, plot.bottom, plot.top),
    yMin,
    yMax,
  };
}

function xValueForRow(row, index, length, settings) {
  if (settings.xAxis === "progress") {
    return length <= 1 ? 0 : (index / (length - 1)) * 100;
  }
  return Number(row.index || row.sceneIndex || index + 1);
}

function drawPanelBackground(ctx, width, height) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
}

function drawTitle(ctx, title, meta, x, y) {
  ctx.fillStyle = "#18211f";
  ctx.font = "600 13px sans-serif";
  ctx.fillText(truncate(title, 46), x, y);
  ctx.fillStyle = "#62706c";
  ctx.font = "11px sans-serif";
  ctx.fillText(truncate(meta, 58), x, y + 17);
}

function drawEmpty(ctx, width, height, message) {
  ctx.fillStyle = "#62706c";
  ctx.font = "13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(message, width / 2, height / 2);
  ctx.textAlign = "left";
}

function drawGrid(ctx, plot, scale) {
  ctx.strokeStyle = "#e7ece7";
  ctx.lineWidth = 1;
  const ticks = makeTicks(scale.yMin ?? -1, scale.yMax ?? 1);
  ticks.forEach((tick) => {
    const y = scale.y(tick);
    ctx.beginPath();
    ctx.moveTo(plot.left, y);
    ctx.lineTo(plot.right, y);
    ctx.stroke();
    ctx.fillStyle = "#62706c";
    ctx.font = "10px sans-serif";
    ctx.fillText(formatAxisTick(tick), 10, y + 3);
  });
  ctx.strokeStyle = "#b8c3bd";
  ctx.beginPath();
  ctx.moveTo(plot.left, plot.top);
  ctx.lineTo(plot.left, plot.bottom);
  ctx.lineTo(plot.right, plot.bottom);
  ctx.stroke();
}

function drawZeroBaseline(ctx, plot, scale, orientation = "horizontal") {
  const position = orientation === "vertical" ? scale.x?.(0) : scale.y?.(0);
  if (!Number.isFinite(position)) return;
  if (orientation === "vertical" && (position < plot.left || position > plot.right)) return;
  if (orientation !== "vertical" && (position < plot.top || position > plot.bottom)) return;

  ctx.save();
  ctx.strokeStyle = "rgba(24, 33, 31, 0.46)";
  ctx.lineWidth = 1.2;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  if (orientation === "vertical") {
    ctx.moveTo(position, plot.top);
    ctx.lineTo(position, plot.bottom);
  } else {
    ctx.moveTo(plot.left, position);
    ctx.lineTo(plot.right, position);
  }
  ctx.stroke();
  ctx.restore();
}

function drawProgressAxis(ctx, plot, scale) {
  ctx.save();
  ctx.fillStyle = "#62706c";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  [0, 25, 50, 75, 100].forEach((tick) => {
    ctx.fillText(`${tick}%`, scale.x(tick), plot.bottom + 18);
  });
  ctx.restore();
}

/**
 * Draw horizontal reference lines + crossing markers on the curve chart.
 *
 * Parameters
 * ──────────
 * lines           Array of { value, color, label } objects.
 * smoothedValues  Map of field → smoothed value array (matches what was drawn).
 * fields          Active model fields in draw order; first field is the
 *                 primary curve we mark crossings on.
 *
 * Each line is drawn as a dashed horizontal line spanning the plot, with
 * its label on the left and value on the right. Crossings are marked as
 * filled circles where the primary (first-field) smoothed arc actually
 * crosses the threshold.
 */
function drawReferenceLines(ctx, plot, scale, lines, smoothedValues, fields) {
  if (!Array.isArray(lines) || lines.length === 0) return;
  const primaryField = fields[0];
  const primaryValues = smoothedValues[primaryField] || [];

  lines.forEach((line) => {
    if (!Number.isFinite(line.value)) return;
    const y = scale.y(line.value);
    if (!Number.isFinite(y) || y < plot.top || y > plot.bottom) return;

    // Horizontal dashed line
    ctx.save();
    ctx.strokeStyle = line.color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(plot.left, y);
    ctx.lineTo(plot.right, y);
    ctx.stroke();
    ctx.restore();

    // Label on the left + value on the right
    ctx.save();
    ctx.fillStyle = line.color;
    ctx.font = "600 10px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(line.label, plot.left + 4, y - 3);
    ctx.textAlign = "right";
    ctx.fillText(formatScore(line.value), plot.right - 4, y - 3);
    ctx.restore();

    // Crossing markers (filled circles) on the primary curve
    if (primaryValues.length >= 2) {
      ctx.save();
      ctx.fillStyle = line.color;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.2;
      const length = primaryValues.length;
      for (let i = 0; i < length - 1; i += 1) {
        const a = primaryValues[i]     - line.value;
        const b = primaryValues[i + 1] - line.value;
        const crosses = (b === 0) || ((a < 0 && b > 0) || (a > 0 && b < 0));
        if (!crosses) continue;
        // Linear-interpolate the x-progress where the crossing occurs.
        const t = (a === b) ? 0.5 : a / (a - b);
        const progressA = length <= 1 ? 0 : (i / (length - 1)) * 100;
        const progressB = length <= 1 ? 0 : ((i + 1) / (length - 1)) * 100;
        const progress = progressA + (progressB - progressA) * t;
        const px = scale.x(progress);
        ctx.beginPath();
        ctx.arc(px, y, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
  });
}

function makeTicks(min, max) {
  const ticks = [];
  const count = 5;
  for (let index = 0; index < count; index += 1) {
    ticks.push(min + ((max - min) * index) / (count - 1));
  }
  return ticks;
}

function formatAxisTick(value) {
  if (Math.abs(value) < 0.005) return "0";
  return value.toFixed(Math.abs(value) < 0.2 ? 2 : 1);
}

function drawBoundaries(ctx, rows, plot, scale, settings) {
  if (rows.length < 2 || rows.length > 6000) return;
  let lastScene = rows[0].sceneIndex;
  let lastAct = rows[0].act;
  rows.forEach((row, index) => {
    const isAct = row.act !== lastAct;
    const isScene = row.sceneIndex !== lastScene;
    if (!isAct && !isScene) return;
    const x = scale.x(xValueForRow(row, index, rows.length, settings));
    ctx.strokeStyle = isAct ? "rgba(39, 76, 119, 0.42)" : "rgba(184, 74, 58, 0.16)";
    ctx.lineWidth = isAct ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(x, plot.top);
    ctx.lineTo(x, plot.bottom);
    ctx.stroke();
    lastScene = row.sceneIndex;
    lastAct = row.act;
  });
  ctx.lineWidth = 1;
}

function drawLine(ctx, series, color, plot, lineWidth = 2) {
  if (!series.length) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  series.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.px, clamp(point.py, plot.top, plot.bottom));
    else ctx.lineTo(point.px, clamp(point.py, plot.top, plot.bottom));
  });
  ctx.stroke();
  ctx.restore();
}

function drawLegend(ctx, fields, colors, x, y) {
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  fields.forEach((field, index) => {
    const yy = y + index * 18;
    ctx.fillStyle = colors[field];
    ctx.lineWidth = 2;
    ctx.strokeStyle = colors[field];
    ctx.beginPath();
    ctx.moveTo(x, yy - 4);
    ctx.lineTo(x + 22, yy - 4);
    ctx.stroke();
    ctx.fillStyle = "#33403d";
    ctx.font = "12px sans-serif";
    ctx.fillText(modelLabel(field), x + 28, yy);
  });
  ctx.restore();
}

function drawOverlayLegend(ctx, payload, referenceColors, comparisonColors, x, y) {
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  let row = 0;
  const drawLegendLine = (color, label, lineWidth = 3) => {
    const yy = y + row * 18;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(x, yy - 4);
    ctx.lineTo(x + 22, yy - 4);
    ctx.stroke();
    ctx.fillStyle = "#33403d";
    ctx.font = "12px sans-serif";
    ctx.fillText(label, x + 28, yy);
    row += 1;
  };

  if (payload.playCount) {
    drawLegendLine("rgba(70, 77, 75, 0.34)", "Selected plays", 1.2);
    payload.fields.forEach((field) => {
      drawLegendLine(referenceColors[field], `Selected avg ${modelLabel(field)}`);
    });
  }

  if (payload.comparison) {
    payload.fields.forEach((field) => {
      drawLegendLine(comparisonColors[field], `Comparison ${modelLabel(field)}`, 3.2);
    });
  }
  ctx.restore();
}

function drawModelLegend(ctx, x, y, fields) {
  const activeFields = Array.isArray(fields) && fields.length ? fields : ["vader", "dl"];
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  activeFields.forEach((field, index) => {
    const yy = y + index * 18;
    drawScoreFill(ctx, x, yy - 11, 22, 9, 0.55, undefined, MODEL_PATTERN_INDEX[field] ?? index);
    ctx.fillStyle = "#33403d";
    ctx.font = "12px sans-serif";
    ctx.fillText(modelLabel(field), x + 30, yy - 3);
  });
  ctx.restore();
}

function scoreFor(row, settings) {
  if (settings.sentiment === "dl") return Number(row.dl || 0);
  return Number(row.vader || 0);
}

function scoreLabel(settings) {
  if (settings.sentiment === "vader") return "VADER";
  if (settings.sentiment === "dl") return "DL (siebert)";
  if (settings.sentiment === "all") return "VADER + DL (siebert)";
  return "Sentiment";
}

function settingsLabel(settings, count) {
  const granularity = {
    sentences: "Sentence",
    units: "Line / Speech",
    scenes: "Scene",
  }[settings.granularity];
  const stage = settings.includeStage ? "with stage directions" : "spoken text";
  const scale = settings.yScale === "auto" ? "auto y-axis" : "fixed y-axis";
  return `${granularity} · ${scoreLabel(settings)} · ${smoothingLabel(settings)} · ${scale} · ${stage} · ${count} rows`;
}

function smoothingLabel(settings) {
  const smoothNames = { raw: "Raw", moving: "Moving", lowess: "LOWESS", smooth: "Smooth" };
  return settings.smoothing === "raw" ? "Raw" : `${smoothNames[settings.smoothing]} ${settings.windowSize}`;
}

function allScoresLabel(row) {
  return MODEL_KEYS
    .map((field) => `${modelLabel(field)} ${formatScore(row[field])}`)
    .join(" · ");
}

function tooltipHtml(playTitle, row) {
  const label = row.sceneLabel || row.label || "";
  const speaker = row.speaker || row.label || "";
  const text = row.text ? `<p>${escapeHtml(truncate(row.text, 220))}</p>` : "";
  const count = row.count ? ` · ${row.count} rows` : "";
  return `
    <strong>${escapeHtml(playTitle)}</strong>
    <span>${escapeHtml(label)}${speaker ? ` · ${escapeHtml(speaker)}` : ""}${count}</span>
    ${text}
    <span>${allScoresLabel(row)}</span>
  `;
}

function overlayTooltipHtml(payload, item) {
  const referenceScores = payload.playCount
    ? payload.fields
        .map((field) => `${modelLabel(field)} ${formatScore(payload.averages[field][item.index])}`)
        .join(" · ")
    : "";
  const comparisonScores = payload.comparison
    ? payload.fields
        .map((field) => `${modelLabel(field)} ${formatScore(payload.comparison.curves[field]?.values[item.index])}`)
        .join(" · ")
    : "";
  const closest = item.closest
    ? `<span>Closest curve: ${escapeHtml(item.closest.playTitle)} · ${item.closest.role} · ${modelLabel(item.closest.field)} ${formatScore(item.closest.value)}</span>`
    : "";
  return `
    <strong>Overlay comparison</strong>
    <span>${formatPercent(item.progress)} progress · ${payload.playCount} selected plays</span>
    ${referenceScores ? `<p>Selected average: ${referenceScores}</p>` : ""}
    ${comparisonScores ? `<p>${escapeHtml(payload.comparison.playTitle)}: ${comparisonScores}</p>` : ""}
    ${closest}
  `;
}

function setContextFromOverlay(payload, item) {
  const scores = payload.playCount
    ? payload.fields
        .map((field) => `${modelLabel(field)} ${formatScore(payload.averages[field][item.index])}`)
        .join(" · ")
    : "";
  const comparison = payload.comparison
    ? payload.fields
        .map((field) => `${modelLabel(field)} ${formatScore(payload.comparison.curves[field]?.values[item.index])}`)
        .join(" · ")
    : "";
  const closest = item.closest
    ? `\nClosest curve: ${item.closest.playTitle} · ${item.closest.role} · ${modelLabel(item.closest.field)} ${formatScore(item.closest.value)}`
    : "";
  el.contextTitle.textContent = `Overlay · ${formatPercent(item.progress)}`;
  el.contextMeta.textContent = `${payload.playCount} selected plays · ${payload.gridPoints} normalized points`;
  const lines = [];
  if (scores) lines.push(`Selected average: ${scores}`);
  if (comparison) lines.push(`${payload.comparison.playTitle}: ${comparison}`);
  el.contextText.textContent = `${lines.join("\n")}${closest}`;
}

function setContextFromItem(play, row, kind) {
  const title = play.metadata.playTitle;
  const label = row.sceneLabel || row.label || "Selection";
  el.contextTitle.textContent = `${title} · ${label}`;

  if (kind === "speaker") {
    el.contextMeta.textContent = `${row.label} · ${row.count} rows · ${allScoresLabel(row)}`;
    el.contextText.textContent = row.text || "No original text sample is attached to this aggregate.";
    return;
  }

  if (kind === "scene" || !row.text) {
    el.contextMeta.textContent = `${label} · ${row.numSentences || 0} sentences · ${allScoresLabel(row)}`;
    el.contextText.textContent = "Scene-level aggregate.";
    return;
  }

  const speaker = row.speaker ? `${row.speaker} · ` : "";
  el.contextMeta.textContent = `${speaker}${label} · ${row.type.replace("_", " ")} · ${allScoresLabel(row)}`;
  el.contextText.textContent = row.text;
}

function showTooltip(tooltip, event, html) {
  const wrapper = tooltip.parentElement.getBoundingClientRect();
  tooltip.innerHTML = html;
  tooltip.style.display = "block";
  const x = event.clientX - wrapper.left + 12;
  const y = event.clientY - wrapper.top + 12;
  tooltip.style.left = `${Math.min(x, wrapper.width - tooltip.offsetWidth - 10)}px`;
  tooltip.style.top = `${Math.min(y, wrapper.height - tooltip.offsetHeight - 10)}px`;
}

function downloadCanvas(canvas, filename) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

async function downloadFilteredCsv() {
  const settings = readSettings();
  const play = await getPlay(state.singlePlay);
  const rows = getRows(play, settings, readFilters());
  const csv = rowsToCsv(rows, play.metadata.playTitle);
  downloadText(csv, `${slugify(play.metadata.playTitle)}-filtered.csv`, "text/csv");
}

function downloadSelectedPublicCsv() {
  const meta = state.playIndex.find((play) => play.playId === state.singlePlay);
  if (!meta) return;
  downloadUrl(dataUrl(meta.publicCsvPath), `${meta.playId}-public.csv`);
}

async function downloadSelectedSceneCsv() {
  const settings = readSettings();
  const play = await getPlay(state.singlePlay);
  const rows = getSceneRows(play, settings);
  const csv = sceneRowsToCsv(rows, play.metadata.playTitle);
  downloadText(csv, `${slugify(play.metadata.playTitle)}-scene-summary.csv`, "text/csv");
}

function downloadAllSummaryCsv() {
  downloadUrl(dataUrl("downloads/summary_statistics_all_plays.csv"), "summary_statistics_all_plays.csv");
}

function rowsToCsv(rows, playTitle) {
  const header = ["play_title", "index", "act", "scene", "scene_label", "type", "speaker", "original_text", "vader_score", "dl_score"];
  const lines = [header.join(",")];
  rows.forEach((row) => {
    lines.push([
      playTitle,
      row.index || row.sceneIndex || "",
      row.act || "",
      row.scene || "",
      row.sceneLabel || "",
      row.type || "scene",
      row.speaker || "",
      row.text || "",
      formatScore(row.vader),
      formatScore(row.dl),
    ].map(csvEscape).join(","));
  });
  return `${lines.join("\n")}\n`;
}

function sceneRowsToCsv(rows, playTitle) {
  const header = ["play_title", "act", "scene", "scene_label", "num_units", "num_sentences", "num_stage_directions", "vader_score", "dl_score"];
  const lines = [header.join(",")];
  rows.forEach((row) => {
    lines.push([
      playTitle,
      row.act,
      row.scene,
      row.sceneLabel,
      row.numUnits,
      row.numSentences,
      row.numStageDirections,
      formatScore(row.vader),
      formatScore(row.dl),
    ].map(csvEscape).join(","));
  });
  return `${lines.join("\n")}\n`;
}

function downloadText(text, filename, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  downloadUrl(url, filename);
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function downloadUrl(url, filename) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
}

function dataUrl(path) {
  const separator = path.includes("?") ? "&" : "?";
  return `${DATA_ROOT}/${path}${separator}v=${encodeURIComponent(DATA_VERSION)}`;
}

function renderVisibleCharts() {
  if (state.view === "dashboard") {
    charts.dashboard.forEach((chart) => chart.draw());
  } else if (state.view === "single") {
    charts.main.draw();
    charts.scenes.draw();
    charts.heatmap.draw();
    charts.speakers.draw();
  } else {
    charts.overlay.draw();
  }
}

function groupScenesByAct(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const act = row.act || row.section || "Other";
    if (!groups.has(act)) groups.set(act, []);
    groups.get(act).push(row);
  });
  return Array.from(groups.entries()).map(([act, scenes]) => ({ act, rows: scenes }));
}

function colorDomainForRows(rows, settings) {
  if (settings.yScale === "fixed") return [-1, 1];
  const values = [];
  rows.forEach((row) => {
    values.push(Number(row.value || 0));
    if (Number.isFinite(Number(row.value2))) values.push(Number(row.value2));
    if (Number.isFinite(Number(row.value3))) values.push(Number(row.value3));
  });
  const maxAbs = Math.max(0.08, ...values.map((value) => Math.abs(value)));
  return [-maxAbs, maxAbs];
}

function rowValues(row, fields) {
  if (Array.isArray(row.values) && row.values.length === fields.length) {
    return row.values.map((value) => Number(value || 0));
  }
  return fields.map((field) => Number(row[field] || 0));
}

function drawScoreFill(ctx, x, y, width, height, value, domain, pattern) {
  ctx.save();
  ctx.fillStyle = scoreColor(value, domain);
  ctx.fillRect(x, y, width, height);
  const patternIndex = pattern === true ? 1 : pattern === false ? 0 : Number(pattern) || 0;
  const hatchColor = Number(value) < 0 ? "rgba(96, 36, 30, 0.55)" : "rgba(7, 77, 72, 0.55)";
  if (patternIndex === 1) {
    drawDiagonalHatch(ctx, x, y, width, height, hatchColor);
  } else if (patternIndex === 2) {
    drawVerticalHatch(ctx, x, y, width, height, hatchColor);
  }
  ctx.restore();
}

function drawDiagonalHatch(ctx, x, y, width, height, color) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  const spacing = 7;
  for (let offset = -height; offset < width + height; offset += spacing) {
    ctx.beginPath();
    ctx.moveTo(x + offset, y + height);
    ctx.lineTo(x + offset + height, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawVerticalHatch(ctx, x, y, width, height, color) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  const spacing = 5;
  for (let offset = 0; offset < width; offset += spacing) {
    ctx.beginPath();
    ctx.moveTo(x + offset, y);
    ctx.lineTo(x + offset, y + height);
    ctx.stroke();
  }
  ctx.restore();
}

function scoreColor(value, domain = [-1, 1]) {
  const clamped = clamp(Number(value), -1, 1);
  const maxAbs = Math.max(Math.abs(domain[0]), Math.abs(domain[1]), 0.01);
  const intensity = clamp(Math.abs(clamped) / maxAbs, 0, 1);
  if (clamped < 0) {
    return mixColor([249, 241, 236], [184, 74, 58], intensity);
  }
  return mixColor([239, 246, 241], [15, 118, 110], intensity);
}

function rgbaText(value) {
  return Math.abs(Number(value)) > 0.55 ? "#ffffff" : "#18211f";
}

function mixColor(a, b, t) {
  const parts = a.map((value, index) => Math.round(value + (b[index] - value) * t));
  return `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})`;
}

function map(value, inMin, inMax, outMin, outMax) {
  if (inMax === inMin) return (outMin + outMax) / 2;
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function unique(values) {
  return Array.from(new Set(values));
}

function truncate(value, length) {
  const text = String(value || "");
  return text.length > length ? `${text.slice(0, length - 1)}...` : text;
}

function formatScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0.000";
  return number.toFixed(3);
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0%";
  return `${number.toFixed(1)}%`;
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}
