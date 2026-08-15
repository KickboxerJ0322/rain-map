const DEFAULT_CENTER = { lat: 35.681236, lng: 139.767125 };
const DEFAULT_ZOOM = 5;
const DEFAULT_OPACITY = 0.75;
const DEFAULT_PLAYBACK_MS = 1000;
const JMA_ROOT = "https://www.jma.go.jp/bosai/jmatile/data/nowc";
const FRAME_OFFSETS = Array.from({ length: 13 }, (_, index) => index * 5);
const NOWCAST_OBS_TIMES_URL = `${JMA_ROOT}/targetTimes_N1.json`;
const NOWCAST_FORECAST_TIMES_URL = `${JMA_ROOT}/targetTimes_N2.json`;
const NOWCAST_MULTI_LAYER_TIMES_URL = `${JMA_ROOT}/targetTimes_N3.json`;
const LAYER_CONFIG = {
  rain: {
    elementId: "hrpns",
    label: "雨雲レイヤー",
    sourceZooms: [8, 10]
  },
  thunder: {
    elementId: "thns",
    label: "雷レイヤー",
    sourceZooms: [8, 9]
  },
  tornado: {
    elementId: "trns",
    label: "竜巻レイヤー",
    sourceZooms: [8, 9]
  }
};
const LEGEND_CONTENT = {
  rain: {
    title: "雨雲レイヤー",
    scaleClass: "rain",
    labels: ["弱い", "強い"],
    notes: [
      "青: 1〜10mm/h程度",
      "黄: 10〜20mm/h程度",
      "赤: 20〜50mm/h程度",
      "紫: 50mm/h以上"
    ],
    caption: "気象庁の降水強度凡例（1, 5, 10, 20, 30, 50, 80mm/h）をもとにした目安です。"
  },
  thunder: {
    title: "雷レイヤー",
    scaleClass: "thunder",
    labels: ["低い", "高い"],
    notes: [
      "活動度1: 雷の可能性あり",
      "活動度2: 雷鳴が予想される",
      "活動度3: 落雷が予想される",
      "活動度4: 頻繁な落雷が予想される"
    ],
    caption: "気象庁の雷ナウキャスト活動度（1〜4）を表示します。"
  },
  tornado: {
    title: "竜巻レイヤー",
    scaleClass: "tornado",
    labels: ["低い", "高い"],
    notes: [
      "発生確度1: 1時間以内に1〜7%程度",
      "発生確度2: 1時間以内に7〜14%程度"
    ],
    caption: "竜巻などの激しい突風の発生確度を示します。"
  }
};

const state = {
  map: null,
  overlays: {},
  timelineFrames: [],
  layerFrames: {
    rain: [],
    thunder: [],
    tornado: []
  },
  latestBaseTime: null,
  activeFrameIndex: 0,
  overlayVisibility: {
    rain: true,
    thunder: false,
    tornado: false
  },
  opacity: DEFAULT_OPACITY,
  isPlaying: false,
  playTimerId: null,
  playbackMs: DEFAULT_PLAYBACK_MS,
  activeLegend: null
};

const ui = {};

document.addEventListener("DOMContentLoaded", async () => {
  cacheElements();
  renderTimelineLabels();
  updateLegendUI();

  try {
    await loadGoogleMaps();
    initializeMap();
    wireEvents();
    await refreshTimeline();
  } catch (error) {
    console.error(error);
    setStatus("Google Maps の読み込みに失敗しました。API キーを確認してください。");
  }
});

function cacheElements() {
  ui.baseTimeValue = document.getElementById("baseTimeValue");
  ui.legendBody = document.getElementById("legendBody");
  ui.legendCloseButton = document.getElementById("legendCloseButton");
  ui.legendPanel = document.getElementById("legendPanel");
  ui.legendTabs = Array.from(document.querySelectorAll(".legend-tab"));
  ui.legendTitle = document.getElementById("legendTitle");
  ui.locationButton = document.getElementById("locationButton");
  ui.opacitySlider = document.getElementById("opacitySlider");
  ui.opacityValue = document.getElementById("opacityValue");
  ui.playButton = document.getElementById("playButton");
  ui.rainToggle = document.getElementById("rainToggle");
  ui.refreshButton = document.getElementById("refreshButton");
  ui.speedSlider = document.getElementById("speedSlider");
  ui.speedValue = document.getElementById("speedValue");
  ui.statusBadge = document.getElementById("statusBadge");
  ui.thunderToggle = document.getElementById("thunderToggle");
  ui.timeSlider = document.getElementById("timeSlider");
  ui.timelineLabels = document.getElementById("timelineLabels");
  ui.tornadoToggle = document.getElementById("tornadoToggle");
  ui.validTimeValue = document.getElementById("validTimeValue");
}

function renderTimelineLabels() {
  ui.timelineLabels.innerHTML = FRAME_OFFSETS
    .map((offset) => `<span>${offset === 0 ? "実況" : `+${offset}`}</span>`)
    .join("");
}

async function loadGoogleMaps() {
  const apiKey = window.APP_CONFIG?.mapsApiKey;

  if (!apiKey) {
    throw new Error("Missing GOOGLE_MAPS_API_KEY");
  }

  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&language=ja&region=JP&v=weekly&callback=__initRainMap`;
    script.async = true;
    script.defer = true;

    window.__initRainMap = () => {
      delete window.__initRainMap;
      resolve();
    };

    script.onerror = () => reject(new Error("Failed to load Google Maps script"));
    document.head.appendChild(script);
  });
}

function initializeMap() {
  state.map = new google.maps.Map(document.getElementById("map"), {
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    clickableIcons: false,
    gestureHandling: "greedy"
  });

  state.overlays = {
    rain: createLayerOverlay("rain"),
    thunder: createLayerOverlay("thunder"),
    tornado: createLayerOverlay("tornado")
  };

  refreshOverlay();
}

function wireEvents() {
  state.map.addListener("zoom_changed", refreshOverlay);

  ui.rainToggle.addEventListener("change", () => {
    state.overlayVisibility.rain = ui.rainToggle.checked;
    refreshOverlay();
  });

  ui.thunderToggle.addEventListener("change", () => {
    state.overlayVisibility.thunder = ui.thunderToggle.checked;
    refreshOverlay();
  });

  ui.tornadoToggle.addEventListener("change", () => {
    state.overlayVisibility.tornado = ui.tornadoToggle.checked;
    refreshOverlay();
  });

  ui.opacitySlider.addEventListener("input", () => {
    state.opacity = Number(ui.opacitySlider.value) / 100;
    ui.opacityValue.textContent = `${ui.opacitySlider.value}%`;
    refreshOverlay();
  });

  ui.speedSlider.addEventListener("input", () => {
    state.playbackMs = Number(ui.speedSlider.value);
    ui.speedValue.textContent = `${state.playbackMs}ms`;

    if (state.isPlaying) {
      stopAnimation();
      startAnimation();
    }
  });

  ui.timeSlider.addEventListener("input", () => {
    state.activeFrameIndex = Number(ui.timeSlider.value);
    updateDisplayedFrame();
  });

  ui.playButton.addEventListener("click", () => {
    if (state.isPlaying) {
      stopAnimation();
      return;
    }

    startAnimation();
  });

  ui.refreshButton.addEventListener("click", async () => {
    await refreshTimeline(true);
  });

  ui.locationButton.addEventListener("click", panToCurrentLocation);
  ui.legendCloseButton.addEventListener("click", () => {
    state.activeLegend = null;
    updateLegendUI();
  });

  for (const button of ui.legendTabs) {
    button.addEventListener("click", () => {
      const key = button.dataset.legend;
      state.activeLegend = state.activeLegend === key ? null : key;
      updateLegendUI();
    });
  }
}

function updateLegendUI() {
  for (const button of ui.legendTabs) {
    button.classList.toggle("is-active", button.dataset.legend === state.activeLegend);
  }

  if (!state.activeLegend) {
    ui.legendPanel.classList.add("is-hidden");
    return;
  }

  const config = LEGEND_CONTENT[state.activeLegend];
  ui.legendTitle.textContent = config.title;
  ui.legendBody.innerHTML = `
    <div class="legend-scale ${config.scaleClass}" aria-hidden="true"></div>
    <div class="legend-labels">
      <span>${config.labels[0]}</span>
      <span>${config.labels[1]}</span>
    </div>
    <ul class="legend-notes">
      ${config.notes.map((note) => `<li>${note}</li>`).join("")}
    </ul>
    <p class="legend-caption">${config.caption}</p>
  `;
  ui.legendPanel.classList.remove("is-hidden");
}

async function refreshTimeline(force = false) {
  try {
    const [rainFrames, multiLayerFrames] = await Promise.all([
      fetchRainFrames(),
      fetchMultiLayerFrames()
    ]);

    if (!rainFrames.length) {
      throw new Error("No rain frames available");
    }

    const latestBaseTime = rainFrames[0].baseTime;
    if (!force && state.timelineFrames.length && isSameBaseTime(state.latestBaseTime, latestBaseTime)) {
      updateDisplayedFrame();
      return;
    }

    const thunderFrames = multiLayerFrames.filter((frame) => frame.elementId === LAYER_CONFIG.thunder.elementId);
    const tornadoFrames = multiLayerFrames.filter((frame) => frame.elementId === LAYER_CONFIG.tornado.elementId);

    state.latestBaseTime = latestBaseTime;
    state.timelineFrames = rainFrames;
    state.layerFrames.rain = rainFrames;
    state.layerFrames.thunder = alignLayerFramesToTimeline(rainFrames, thunderFrames);
    state.layerFrames.tornado = alignLayerFramesToTimeline(rainFrames, tornadoFrames);
    state.activeFrameIndex = 0;
    ui.timeSlider.value = "0";
    updateDisplayedFrame();
  } catch (error) {
    console.error(error);
    setStatus("レイヤーデータの取得に失敗しました。しばらくしてから最新化してください。");
  }
}

async function fetchRainFrames() {
  const [observationResponse, forecastResponse] = await Promise.all([
    fetch(NOWCAST_OBS_TIMES_URL, { cache: "no-store" }),
    fetch(NOWCAST_FORECAST_TIMES_URL, { cache: "no-store" })
  ]);

  if (!observationResponse.ok || !forecastResponse.ok) {
    throw new Error("Failed to fetch rain layer times");
  }

  const observationTimes = await observationResponse.json();
  const forecastTimes = await forecastResponse.json();
  const latestObservation = observationTimes[0];
  const latestForecasts = forecastTimes
    .filter((entry) => entry.basetime === latestObservation?.basetime)
    .sort((left, right) => left.validtime.localeCompare(right.validtime));

  const frames = [];

  if (latestObservation) {
    frames.push(toFrame(latestObservation, LAYER_CONFIG.rain.elementId));
  }

  for (const entry of latestForecasts) {
    frames.push(toFrame(entry, LAYER_CONFIG.rain.elementId));
  }

  return frames;
}

async function fetchMultiLayerFrames() {
  const response = await fetch(NOWCAST_MULTI_LAYER_TIMES_URL, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Failed to fetch multi-layer times: ${response.status}`);
  }

  const entries = await response.json();
  const frames = [];

  for (const entry of entries) {
    for (const key of ["thunder", "tornado"]) {
      const elementId = LAYER_CONFIG[key].elementId;
      if (entry.elements.includes(elementId)) {
        frames.push(toFrame(entry, elementId));
      }
    }
  }

  return frames.sort((left, right) => left.validTime.getTime() - right.validTime.getTime());
}

function toFrame(entry, elementId) {
  const baseTime = parseJmaTimestamp(entry.basetime);
  const validTime = parseJmaTimestamp(entry.validtime);
  const offsetMinutes = Math.round((validTime.getTime() - baseTime.getTime()) / (60 * 1000));

  return {
    elementId,
    offsetMinutes,
    baseTime,
    validTime
  };
}

function alignLayerFramesToTimeline(timelineFrames, layerFrames) {
  return timelineFrames.map((timelineFrame) => {
    let candidate = null;

    for (const frame of layerFrames) {
      if (frame.validTime.getTime() <= timelineFrame.validTime.getTime()) {
        candidate = frame;
        continue;
      }

      break;
    }

    return candidate ?? layerFrames[0] ?? null;
  });
}

function buildJmaTileUrl(baseTime, validTime, elementId, zoom, x, y) {
  const normalizedX = modulo(x, 2 ** zoom);
  const base = formatJmaTimestamp(baseTime);
  const valid = formatJmaTimestamp(validTime);

  return `${JMA_ROOT}/${base}/none/${valid}/surf/${elementId}/${zoom}/${normalizedX}/${y}.png`;
}

function createLayerOverlay(layerKey) {
  const config = LAYER_CONFIG[layerKey];

  return {
    alt: config.label,
    maxZoom: 20,
    minZoom: 0,
    name: config.label,
    tileSize: new google.maps.Size(256, 256),
    getTile(coord, zoom, ownerDocument) {
      const tile = ownerDocument.createElement("div");
      tile.style.width = "256px";
      tile.style.height = "256px";
      tile.style.opacity = String(state.opacity);
      tile.style.overflow = "hidden";
      tile.style.position = "relative";

      if (!isValidTileCoordinate(coord, zoom)) {
        return tile;
      }

      const frame = state.layerFrames[layerKey][state.activeFrameIndex];
      if (!frame) {
        return tile;
      }

      const normalizedX = modulo(coord.x, 2 ** zoom);
      const sourceZooms = selectSourceZooms(zoom, config.sourceZooms);
      const tileLayers = sourceZooms.map((sourceZoom, index) =>
        buildTileLayer({
          baseTime: frame.baseTime,
          coordY: coord.y,
          elementId: config.elementId,
          ownerDocument,
          sourceZoom,
          targetX: normalizedX,
          validTime: frame.validTime,
          zoom,
          zIndex: index
        })
      );

      for (const layer of tileLayers) {
        if (layer) {
          tile.appendChild(layer);
        }
      }

      return tile;
    },
    releaseTile(tile) {
      tile.replaceChildren();
    }
  };
}

function selectSourceZooms(targetZoom, sourceZooms) {
  const lowerZooms = sourceZooms.filter((zoom) => zoom <= targetZoom);
  const higherZooms = sourceZooms.filter((zoom) => zoom >= targetZoom);
  const selected = [];
  const nearestLower = lowerZooms.at(-1);
  const nearestHigher = higherZooms[0];

  if (nearestLower !== undefined) {
    selected.push(nearestLower);
  }

  if (nearestHigher !== undefined && nearestHigher !== nearestLower) {
    selected.push(nearestHigher);
  }

  if (!selected.length && sourceZooms.length) {
    selected.push(sourceZooms[0]);
  }

  return selected;
}

function buildTileLayer({ baseTime, coordY, elementId, ownerDocument, sourceZoom, targetX, validTime, zoom, zIndex }) {
  const layer = ownerDocument.createElement("div");
  layer.style.position = "absolute";
  layer.style.inset = "0";
  layer.style.zIndex = String(zIndex);

  if (sourceZoom <= zoom) {
    const zoomDelta = zoom - sourceZoom;
    const scale = 2 ** zoomDelta;
    const sourceX = Math.floor(targetX / scale);
    const sourceY = Math.floor(coordY / scale);

    if (!isValidTileCoordinate({ x: sourceX, y: sourceY }, sourceZoom)) {
      return null;
    }

    const childX = targetX % scale;
    const childY = coordY % scale;
    layer.appendChild(createTileImage({
      baseTime,
      elementId,
      height: 256 * scale,
      left: -childX * 256,
      ownerDocument,
      sourceX,
      sourceY,
      sourceZoom,
      top: -childY * 256,
      validTime,
      width: 256 * scale
    }));
    return layer;
  }

  const scaleDown = 2 ** (sourceZoom - zoom);
  const sourceStartX = targetX * scaleDown;
  const sourceStartY = coordY * scaleDown;
  const fragmentSize = 256 / scaleDown;

  for (let dy = 0; dy < scaleDown; dy++) {
    for (let dx = 0; dx < scaleDown; dx++) {
      const sourceX = sourceStartX + dx;
      const sourceY = sourceStartY + dy;

      if (!isValidTileCoordinate({ x: sourceX, y: sourceY }, sourceZoom)) {
        continue;
      }

      layer.appendChild(createTileImage({
        baseTime,
        elementId,
        height: fragmentSize,
        left: dx * fragmentSize,
        ownerDocument,
        sourceX,
        sourceY,
        sourceZoom,
        top: dy * fragmentSize,
        validTime,
        width: fragmentSize
      }));
    }
  }

  return layer;
}

function createTileImage({ baseTime, elementId, height, left, ownerDocument, sourceX, sourceY, sourceZoom, top, validTime, width }) {
  const img = ownerDocument.createElement("img");
  img.alt = "";
  img.draggable = false;
  img.loading = "eager";
  img.decoding = "async";
  img.src = buildJmaTileUrl(baseTime, validTime, elementId, sourceZoom, sourceX, sourceY);
  img.style.position = "absolute";
  img.style.left = `${left}px`;
  img.style.top = `${top}px`;
  img.style.width = `${width}px`;
  img.style.height = `${height}px`;
  img.style.userSelect = "none";
  img.style.pointerEvents = "none";
  return img;
}

function formatJmaTimestamp(date) {
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  return `${year}${month}${day}${hours}${minutes}00`;
}

function parseJmaTimestamp(value) {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6)) - 1;
  const day = Number(value.slice(6, 8));
  const hours = Number(value.slice(8, 10));
  const minutes = Number(value.slice(10, 12));
  const seconds = Number(value.slice(12, 14));
  return new Date(Date.UTC(year, month, day, hours, minutes, seconds));
}

function updateDisplayedFrame() {
  const rainFrame = state.timelineFrames[state.activeFrameIndex];
  if (!rainFrame) {
    return;
  }

  ui.baseTimeValue.textContent = formatDisplayTime(rainFrame.baseTime);
  ui.validTimeValue.textContent = formatDisplayTime(rainFrame.validTime);

  const enabledLayers = Object.entries(state.overlayVisibility)
    .filter(([, enabled]) => enabled)
    .map(([key]) => LAYER_CONFIG[key].label.replace("レイヤー", ""))
    .join(" / ");
  const layerText = enabledLayers || "レイヤーOFF";
  setStatus(`${layerText} | ${rainFrame.offsetMinutes === 0 ? "実況" : `+${rainFrame.offsetMinutes}分`}`);
  refreshOverlay();
}

function refreshOverlay() {
  if (!state.map) {
    return;
  }

  state.map.overlayMapTypes.clear();

  for (const key of ["rain", "thunder", "tornado"]) {
    if (state.overlayVisibility[key]) {
      state.map.overlayMapTypes.push(state.overlays[key]);
    }
  }
}

function startAnimation() {
  if (!state.timelineFrames.length) {
    return;
  }

  state.isPlaying = true;
  ui.playButton.textContent = "停止";

  state.playTimerId = window.setInterval(() => {
    state.activeFrameIndex = (state.activeFrameIndex + 1) % state.timelineFrames.length;
    ui.timeSlider.value = String(state.activeFrameIndex);
    updateDisplayedFrame();
  }, state.playbackMs);
}

function stopAnimation() {
  state.isPlaying = false;
  ui.playButton.textContent = "再生";

  if (state.playTimerId) {
    window.clearInterval(state.playTimerId);
    state.playTimerId = null;
  }
}

function panToCurrentLocation() {
  if (!navigator.geolocation) {
    setStatus("このブラウザでは Geolocation API を利用できません。");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      const center = {
        lat: coords.latitude,
        lng: coords.longitude
      };

      state.map.panTo(center);
      state.map.setZoom(10);
      setStatus("現在地へ移動しました。");
    },
    (error) => {
      console.error(error);
      setStatus("現在地情報を取得できませんでした。ブラウザの位置情報設定を確認してください。");
    },
    {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 0
    }
  );
}

function formatDisplayTime(date) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function setStatus(text) {
  ui.statusBadge.textContent = text;
}

function isSameBaseTime(left, right) {
  return left?.getTime() === right?.getTime();
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function modulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function isValidTileCoordinate(coord, zoom) {
  const limit = 2 ** zoom;
  return coord.y >= 0 && coord.y < limit;
}
