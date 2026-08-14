const DEFAULT_CENTER = { lat: 35.681236, lng: 139.767125 };
const DEFAULT_ZOOM = 5;
const DEFAULT_OPACITY = 0.75;
const JMA_ROOT = "https://www.jma.go.jp/bosai/jmatile/data/nowc";
const FRAME_OFFSETS = Array.from({ length: 13 }, (_, index) => index * 5);
const NOWCAST_OBS_TIMES_URL = `${JMA_ROOT}/targetTimes_N1.json`;
const NOWCAST_FORECAST_TIMES_URL = `${JMA_ROOT}/targetTimes_N2.json`;

const state = {
  map: null,
  overlay: null,
  activeFrameIndex: 0,
  frames: [],
  latestBaseTime: null,
  overlayEnabled: true,
  opacity: DEFAULT_OPACITY,
  isPlaying: false,
  playTimerId: null,
  playbackMs: 900,
  useFallbackBaseTime: false
};

const ui = {};

document.addEventListener("DOMContentLoaded", async () => {
  cacheElements();
  renderTimelineLabels();

  try {
    await loadGoogleMaps();
    initializeMap();
    wireEvents();
    await refreshTimeline();
  } catch (error) {
    console.error(error);
    setStatus("Google Maps の初期化に失敗しました。API キーを確認してください。");
  }
});

function cacheElements() {
  ui.baseTimeValue = document.getElementById("baseTimeValue");
  ui.locationButton = document.getElementById("locationButton");
  ui.opacitySlider = document.getElementById("opacitySlider");
  ui.opacityValue = document.getElementById("opacityValue");
  ui.overlayToggle = document.getElementById("overlayToggle");
  ui.playButton = document.getElementById("playButton");
  ui.refreshButton = document.getElementById("refreshButton");
  ui.speedSlider = document.getElementById("speedSlider");
  ui.speedValue = document.getElementById("speedValue");
  ui.statusBadge = document.getElementById("statusBadge");
  ui.timeSlider = document.getElementById("timeSlider");
  ui.timelineLabels = document.getElementById("timelineLabels");
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

  state.overlay = new google.maps.ImageMapType({
    getTileUrl(coord, zoom) {
      if (!state.overlayEnabled || !state.frames.length) {
        return transparentTile();
      }

      if (!isValidTileCoordinate(coord, zoom)) {
        return transparentTile();
      }

      const frame = state.frames[state.activeFrameIndex];
      if (!frame) {
        return transparentTile();
      }

      return buildJmaTileUrl(frame.baseTime, frame.validTime, zoom, coord.x, coord.y);
    },
    tileSize: new google.maps.Size(256, 256),
    name: "Rain Nowcast",
    opacity: state.opacity,
    maxZoom: 20,
    minZoom: 0
  });

  state.map.overlayMapTypes.clear();
  state.map.overlayMapTypes.push(state.overlay);
}

function wireEvents() {
  state.map.addListener("zoom_changed", () => {
    refreshOverlay();
  });

  ui.overlayToggle.addEventListener("change", () => {
    state.overlayEnabled = ui.overlayToggle.checked;
    refreshOverlay();
  });

  ui.opacitySlider.addEventListener("input", () => {
    state.opacity = Number(ui.opacitySlider.value) / 100;
    ui.opacityValue.textContent = `${ui.opacitySlider.value}%`;
    state.overlay.setOpacity(state.opacity);
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
}

async function refreshTimeline(force = false) {
  try {
    const frames = await fetchNowcastFrames();
    const latestBaseTime = frames[0]?.baseTime ?? null;

    if (!frames.length) {
      throw new Error("No nowcast frames available");
    }

    if (!force && state.frames.length && isSameBaseTime(state.latestBaseTime, latestBaseTime)) {
      updateDisplayedFrame();
      return;
    }

    state.latestBaseTime = latestBaseTime;
    state.useFallbackBaseTime = false;
    state.frames = frames;
    state.activeFrameIndex = 0;
    ui.timeSlider.value = "0";
    updateDisplayedFrame();
  } catch (error) {
    console.error(error);
    setStatus("雨雲データの取得に失敗しました。しばらくしてから最新化をお試しください。");
  }
}

async function fetchNowcastFrames() {
  const [observationResponse, forecastResponse] = await Promise.all([
    fetch(NOWCAST_OBS_TIMES_URL, { cache: "no-store" }),
    fetch(NOWCAST_FORECAST_TIMES_URL, { cache: "no-store" })
  ]);

  if (!observationResponse.ok) {
    throw new Error(`Failed to fetch observation times: ${observationResponse.status}`);
  }

  if (!forecastResponse.ok) {
    throw new Error(`Failed to fetch forecast times: ${forecastResponse.status}`);
  }

  const observationTimes = await observationResponse.json();
  const forecastTimes = await forecastResponse.json();
  const latestObservation = observationTimes[0];
  const latestForecasts = forecastTimes
    .filter((entry) => entry.basetime === latestObservation?.basetime)
    .sort((left, right) => left.validtime.localeCompare(right.validtime));

  const frames = [];

  if (latestObservation) {
    frames.push(toFrame(latestObservation));
  }

  for (const entry of latestForecasts) {
    frames.push(toFrame(entry));
  }

  return frames;
}

function toFrame(entry) {
  const baseTime = parseJmaTimestamp(entry.basetime);
  const validTime = parseJmaTimestamp(entry.validtime);
  const offsetMinutes = Math.round((validTime.getTime() - baseTime.getTime()) / (60 * 1000));

  return {
    offsetMinutes,
    baseTime,
    validTime
  };
}

function buildJmaTileUrl(baseTime, validTime, zoom, x, y) {
  const normalizedX = modulo(x, 2 ** zoom);
  const boundedY = y;
  const base = formatJmaTimestamp(baseTime);
  const valid = formatJmaTimestamp(validTime);

  return `${JMA_ROOT}/${base}/none/${valid}/surf/hrpns/${zoom}/${normalizedX}/${boundedY}.png`;
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
  const frame = state.frames[state.activeFrameIndex];
  if (!frame) {
    return;
  }

  ui.baseTimeValue.textContent = formatDisplayTime(frame.baseTime);
  ui.validTimeValue.textContent = formatDisplayTime(frame.validTime);

  const label = state.useFallbackBaseTime ? "前基準時刻で表示中" : "最新基準時刻を表示中";
  setStatus(`${label} | ${frame.offsetMinutes === 0 ? "実況" : `+${frame.offsetMinutes}分`}`);
  refreshOverlay();
}

function refreshOverlay() {
  if (!state.overlay || !state.map) {
    return;
  }

  state.map.overlayMapTypes.clear();

  if (state.overlayEnabled) {
    state.map.overlayMapTypes.push(state.overlay);
  }
}

function startAnimation() {
  state.isPlaying = true;
  ui.playButton.textContent = "停止";

  state.playTimerId = window.setInterval(() => {
    state.activeFrameIndex = (state.activeFrameIndex + 1) % state.frames.length;
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
      setStatus("位置情報を取得できませんでした。ブラウザの許可設定をご確認ください。");
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

function transparentTile() {
  return "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
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
