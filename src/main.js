const canvas = document.querySelector("#webgl-canvas");
const audioToggle = document.querySelector("#audio-toggle");
const trackSelect = document.querySelector("#track-select");
const trackTitle = document.querySelector("#track-title");
const previousTrackButton = document.querySelector("#previous-track");
const nextTrackButton = document.querySelector("#next-track");
const seekBar = document.querySelector("#seek-bar");
const currentTimeLabel = document.querySelector("#current-time");
const durationLabel = document.querySelector("#duration");
const gl = canvas.getContext("webgl", { antialias: true, alpha: false });

if (!gl) {
  throw new Error("Ta przegladarka nie obsluguje WebGL.");
}

const vertexShaderSource = `
  attribute vec3 aPosition;
  attribute float aSize;
  attribute float aHue;
  attribute float aKind;
  attribute float aPhase;
  attribute float aAudioSensitivity;

  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uBass;
  uniform float uMid;
  uniform float uTreble;
  uniform vec3 uCameraPosition;
  uniform vec3 uCameraRight;
  uniform vec3 uCameraUp;
  uniform vec3 uCameraForward;

  varying float vHue;
  varying float vKind;
  varying float vDepth;
  varying float vAudio;
  varying float vPhase;
  varying float vAudioSensitivity;

  void main() {
    float fieldDepth = 96.0;
    float wrappedDepth = mod(aPosition.z - uCameraPosition.z + fieldDepth, fieldDepth);
    float worldZ = uCameraPosition.z + wrappedDepth;
    float driftTime = uTime * (0.08 + aPhase * 0.001);
    float rawAudio = uBass * 0.48 + uMid * 0.36 + uTreble * 0.24;
    float audio = smoothstep(0.08, 0.68, rawAudio) * aAudioSensitivity;

    vec3 drift = vec3(
      sin(driftTime + aPhase) * 0.08,
      cos(driftTime * 0.73 + aPhase) * 0.06,
      0.0
    );

    if (aKind < 0.5) {
      drift.xy *= 2.4 + uMid * 1.8;
    } else if (aKind > 4.5) {
      drift.xy *= 1.0 + uMid * 0.35;
    } else if (aKind > 3.5) {
      drift.xy *= 1.4 + uMid * 0.8;
    } else if (aKind > 2.5) {
      drift.xy *= 3.8 + uBass * 1.2;
    }

    vec3 worldPosition = vec3(aPosition.xy, worldZ) + drift;
    vec3 cameraRelative = worldPosition - uCameraPosition;
    vec3 viewPosition = vec3(
      dot(cameraRelative, uCameraRight),
      dot(cameraRelative, uCameraUp),
      dot(cameraRelative, uCameraForward)
    );

    float perspective = 1.45 / max(viewPosition.z, 0.2);
    vec2 screenPosition = viewPosition.xy * perspective;
    screenPosition.x *= uResolution.y / uResolution.x;

    gl_Position = vec4(screenPosition, 0.0, 1.0);

    float starScale = aKind > 1.5 ? 0.01 + audio * 0.011 : 0.013;
    float kindScale = aKind < 0.5 ? 0.062 + audio * 0.035 : starScale;
    kindScale = aKind > 2.5 ? 0.092 + audio * 0.042 : kindScale;
    kindScale = aKind > 3.5 ? 0.074 + audio * 0.018 : kindScale;
    kindScale = aKind > 4.5 ? 0.11 + audio * 0.012 : kindScale;
    kindScale = aKind > 5.5 ? 0.072 + audio * 0.01 : kindScale;
    gl_PointSize = aSize * perspective * uResolution.y * kindScale;

    vHue = aHue;
    vKind = aKind;
    vDepth = smoothstep(fieldDepth, 3.0, viewPosition.z);
    vAudio = audio;
    vPhase = aPhase;
    vAudioSensitivity = aAudioSensitivity;
  }
`;

const fragmentShaderSource = `
  precision highp float;

  uniform float uTime;
  uniform float uLightning;

  varying float vHue;
  varying float vKind;
  varying float vDepth;
  varying float vAudio;
  varying float vPhase;
  varying float vAudioSensitivity;

  vec3 nebulaColor(float hue) {
    vec3 blue = vec3(0.04, 0.34, 0.9);
    vec3 cyan = vec3(0.03, 0.78, 0.86);
    vec3 amber = vec3(1.0, 0.42, 0.08);
    vec3 smoke = vec3(0.26, 0.22, 0.24);
    vec3 color = mix(blue, cyan, smoothstep(0.0, 0.52, hue));
    color = mix(color, amber, smoothstep(0.55, 0.95, hue));
    return mix(color, smoke, smoothstep(0.86, 1.0, hue) * 0.25);
  }

  vec3 starColor(float hue) {
    vec3 cool = vec3(0.7, 0.88, 1.0);
    vec3 warm = vec3(1.0, 0.76, 0.42);
    vec3 pink = vec3(1.0, 0.44, 0.68);
    vec3 color = mix(cool, warm, smoothstep(0.2, 0.78, hue));
    return mix(color, pink, smoothstep(0.84, 1.0, hue) * 0.45);
  }

  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p);

    if (vKind > 3.5) {
      if (vKind > 5.5) {
        float angle = vPhase * 6.2831853;
        vec2 axis = vec2(cos(angle), sin(angle));
        vec2 side = vec2(-axis.y, axis.x);
        vec2 q = vec2(dot(p, axis), dot(p, side));
        float wave = sin(q.x * 11.0 + vPhase * 12.0) * 0.04 +
          sin(q.x * 27.0 + vHue * 8.0) * 0.018;
        float strokeDistance = abs(q.y + wave);
        float stroke = smoothstep(0.14, 0.0, strokeDistance);
        float core = smoothstep(0.055, 0.0, strokeDistance);
        float taper = smoothstep(0.54, 0.02, abs(q.x));
        float ragged = smoothstep(0.24, 0.92, sin(q.x * 31.0 + vPhase * 15.0) * 0.5 + 0.5);
        float cloudMask = smoothstep(0.5, 0.14, d);
        vec3 ink = vec3(0.012, 0.014, 0.026);
        vec3 blueSmoke = vec3(0.03, 0.2, 0.28);
        vec3 warmSmoke = vec3(0.24, 0.11, 0.04);
        vec3 smokeColor = mix(blueSmoke, warmSmoke, smoothstep(0.42, 0.95, vHue));
        float musicInk = max(smoothstep(0.12, 0.46, vAudio), smoothstep(0.18, 0.72, uLightning));
        float peakInk = max(smoothstep(0.42, 0.74, vAudio), smoothstep(0.58, 0.92, uLightning));
        float softStroke = stroke * (0.68 + ragged * 0.22);
        float alpha = softStroke * taper * cloudMask * (0.045 + vDepth * 0.06 + musicInk * 0.28 + peakInk * 0.22);
        vec3 color = mix(smokeColor * 0.54, ink, core * (0.24 + musicInk * 0.18 + peakInk * 0.08));
        color += smokeColor * softStroke * (1.0 - core) * (0.08 + musicInk * 0.05);
        gl_FragColor = vec4(color, alpha);
        return;
      }

      if (vKind > 4.5) {
        float angle = vPhase * 6.2831853;
        vec2 axis = vec2(cos(angle), sin(angle));
        vec2 side = vec2(-axis.y, axis.x);
        vec2 q = vec2(dot(p, axis), dot(p, side));
        float wave = sin(q.x * 8.0 + vPhase * 13.0) * 0.055 +
          sin(q.x * 19.0 + vHue * 7.0) * 0.026;
        float vein = smoothstep(0.09, 0.0, abs(q.y + wave));
        float ragged = smoothstep(0.28, 0.92, sin(q.x * 22.0 + vPhase * 17.0) * 0.5 + 0.5);
        float taper = smoothstep(0.52, 0.02, abs(q.x));
        float cloudyEdge = smoothstep(0.54, 0.18, d);
        float alpha = vein * taper * cloudyEdge * (0.08 + ragged * 0.12 + vDepth * 0.14) * (0.7 - vAudio * 0.16);
        vec3 ink = vec3(0.006, 0.008, 0.018);
        vec3 bruisedViolet = vec3(0.045, 0.026, 0.08);
        vec3 color = mix(ink, bruisedViolet, smoothstep(0.2, 1.0, vHue));
        gl_FragColor = vec4(color, alpha);
        return;
      }

      float angle = vPhase * 6.2831853;
      vec2 axis = vec2(cos(angle), sin(angle));
      vec2 side = vec2(-axis.y, axis.x);
      vec2 q = vec2(dot(p, axis), dot(p, side));
      float wave = sin(q.x * 18.0 + vPhase * 11.0) * 0.026 +
        sin(q.x * 35.0 + vHue * 8.0) * 0.012;
      float distanceToBolt = abs(q.y + wave);
      float taper = smoothstep(0.5, 0.05, abs(q.x));
      float cloudMask = smoothstep(0.52, 0.18, d);
      float knots = smoothstep(0.7, 1.0, sin(q.x * 24.0 + vPhase * 17.0) * 0.5 + 0.5);
      float energy = smoothstep(0.08, 0.62, vAudio);
      float shimmer = sin(uTime * 7.2 + vPhase * 19.0) * 0.5 + 0.5;
      shimmer *= sin(uTime * 13.0 + vHue * 21.0) * 0.28 + 0.72;
      float flash = smoothstep(0.08, 0.78, uLightning) * (0.42 + shimmer * 0.58);
      float strike = smoothstep(0.2, 0.86, energy * 0.52 + flash * 0.62 + knots * 0.12);
      float branchWave = sin(q.x * 16.0 + vPhase * 9.0) * 0.014;
      float branchMaskA = smoothstep(0.38, 0.03, abs(q.x - 0.16));
      float branchMaskB = smoothstep(0.36, 0.03, abs(q.x + 0.22));
      float branchA = smoothstep(0.024, 0.0, abs(q.y - q.x * 0.18 + branchWave)) * branchMaskA;
      float branchB = smoothstep(0.024, 0.0, abs(q.y + q.x * 0.22 - branchWave)) * branchMaskB;
      float branchCore = max(branchA, branchB) * strike * flash * 0.34;
      float filament = max(smoothstep(0.038, 0.0, distanceToBolt), branchCore) * strike;
      float core = max(smoothstep(0.008, 0.0, distanceToBolt), branchCore * 0.7) * strike;
      vec3 white = vec3(0.96, 0.94, 1.0);
      vec3 violet = vec3(0.56, 0.34, 1.0);
      vec3 color = mix(white, violet, smoothstep(0.18, 1.0, vHue) * 0.58);
      color = mix(color, vec3(1.0), core * 0.92);
      float alpha = filament * taper * cloudMask * (0.01 + knots * 0.024 + vDepth * 0.05 + energy * 0.08 + flash * 0.22);
      alpha += core * taper * cloudMask * (0.06 + knots * 0.12 + energy * 0.16 + flash * 0.56);
      color *= 0.25 + knots * 0.18 + energy * 0.26 + flash * 0.62 + core * 0.62;
      gl_FragColor = vec4(color, alpha);
      return;
    }

    if (vKind > 2.5) {
      float angleNoise = sin(atan(p.y, p.x) * 9.0 + vHue * 18.0) * 0.012;
      float liquidNoise = sin(p.x * 7.0 + p.y * 4.0 + vPhase * 0.19 + uTime * 0.11) * 0.04 +
        sin(p.x * -5.0 + p.y * 8.0 + vHue * 6.0 - uTime * 0.08) * 0.028 +
        sin(length(p + vec2(0.12, -0.08)) * 18.0 + vPhase * 0.11) * 0.018;
      float shapedDistance = d + angleNoise + liquidNoise;
      float body = smoothstep(0.52, 0.0, shapedDistance);
      float hollow = smoothstep(0.16, 0.42, shapedDistance);
      float edge = smoothstep(0.52, 0.28, shapedDistance) * smoothstep(0.16, 0.38, shapedDistance);
      float rim = smoothstep(0.08, 0.0, abs(shapedDistance - 0.39)) * 0.22;
      float wash = smoothstep(0.46, 0.08, abs(shapedDistance + liquidNoise * 0.35));
      float darkBloom = smoothstep(0.34, 0.04, length(p * vec2(0.78, 1.24) + vec2(liquidNoise * 1.8, -liquidNoise)));
      float feather = smoothstep(0.035, 0.0, abs(shapedDistance - 0.36 - liquidNoise * 0.45));
      float inkEnergy = smoothstep(0.04, 0.52, vAudio);
      float inkPeak = smoothstep(0.42, 0.86, vAudio);
      vec3 smokeBlue = vec3(0.08, 0.28, 0.4);
      vec3 smokeAmber = vec3(0.62, 0.3, 0.12);
      vec3 color = mix(smokeBlue, smokeAmber, smoothstep(0.45, 1.0, vHue));
      float alpha = (body * hollow * 0.58 + rim * 0.12 + wash * 0.06 + feather * 0.05 + darkBloom * (inkEnergy * 0.16 + inkPeak * 0.14)) *
        (0.08 + vDepth * 0.24 + vAudio * 0.26);
      color *= 0.3 + edge * 0.18 + rim * 0.1 + wash * 0.12 + feather * 0.12 + vAudio * 0.32;
      vec3 inkTint = mix(vec3(0.0, 0.016, 0.04), vec3(0.14, 0.035, 0.085), smoothstep(0.44, 0.96, vHue));
      color = mix(color, inkTint, darkBloom * (0.18 + inkEnergy * 0.5 + inkPeak * 0.22));
      gl_FragColor = vec4(color, alpha);
      return;
    }

    if (vKind < 0.5) {
      float flow = sin(p.x * 6.0 + p.y * 3.5 + vPhase * 0.17 + uTime * 0.1) * 0.042 +
        sin(p.x * -4.5 + p.y * 7.0 + vHue * 6.0 - uTime * 0.07) * 0.026 +
        sin(length(p - vec2(0.08, 0.04)) * 16.0 + vPhase * 0.09) * 0.018;
      float wateryDistance = d + flow;
      float body = smoothstep(0.5, 0.0, wateryDistance);
      float core = smoothstep(0.18, 0.0, wateryDistance);
      float smoke = smoothstep(0.5, 0.22, wateryDistance);
      float inkPool = smoothstep(0.36, 0.04, length(p * vec2(1.15, 0.82) + vec2(flow * 1.4, -flow * 0.8)));
      float feather = smoothstep(0.034, 0.0, abs(wateryDistance - 0.34 + flow * 0.45));
      float wash = smoothstep(0.32, 0.0, abs(length(p * vec2(1.2, 0.74)) - 0.28 + flow * 0.35));
      float inkEnergy = smoothstep(0.04, 0.52, vAudio);
      float inkPeak = smoothstep(0.42, 0.86, vAudio);
      vec3 color = nebulaColor(vHue);
      float alpha = (body * 0.11 + core * 0.06 + feather * 0.035 + wash * 0.035 + inkPool * (inkEnergy * 0.09 + inkPeak * 0.08)) *
        (0.18 + vDepth * 0.68 + vAudio * 0.82);
      color *= 0.19 + body * 0.3 + feather * 0.1 + wash * 0.1 + vAudio * 0.58;
      vec3 inkTint = mix(vec3(0.0, 0.018, 0.045), vec3(0.12, 0.025, 0.09), smoothstep(0.46, 0.95, vHue));
      color = mix(color, inkTint, inkPool * (0.2 + inkEnergy * 0.56 + inkPeak * 0.22));
      color *= 1.0 - smoke * 0.12 - wash * 0.05;
      gl_FragColor = vec4(color, alpha);
      return;
    }

    float musicReveal = vKind > 1.5 ? smoothstep(0.16, 0.78, vAudio) : 1.0;
    float sphere = smoothstep(0.46, 0.0, d);
    float core = smoothstep(0.15, 0.0, d);
    float glow = smoothstep(0.5, 0.0, d) * (0.11 + vAudio * 0.34);
    float shade = smoothstep(0.45, 0.0, length(p + vec2(0.12, -0.1)));
    float ring = smoothstep(0.014, 0.0, abs(length(p * vec2(1.0, 2.45)) - 0.32));
    ring *= step(0.86, fract(vHue * 11.31));

    vec3 color = starColor(vHue);
    color = mix(color, vec3(1.0, 0.84, 0.52), vAudio * 0.14);
    float alpha = (sphere * 0.4 + core * (0.34 + vAudio * 0.22) + glow + ring * 0.14) * (0.2 + vDepth * 0.44 + vAudio * 0.34) * musicReveal;
    color *= 0.46 + shade * 0.22 + core * 0.24 + vAudio * 0.28;
    color += vec3(1.0, 0.9, 0.72) * ring * (0.08 + vAudio * 0.22);
    gl_FragColor = vec4(color, alpha);
  }
`;

const program = createProgram(
  createShader(gl.VERTEX_SHADER, vertexShaderSource),
  createShader(gl.FRAGMENT_SHADER, fragmentShaderSource),
);
const sceneObjects = createSceneObjects();
const sceneBuffer = gl.createBuffer();
const attributeLocations = {
  position: gl.getAttribLocation(program, "aPosition"),
  size: gl.getAttribLocation(program, "aSize"),
  hue: gl.getAttribLocation(program, "aHue"),
  kind: gl.getAttribLocation(program, "aKind"),
  phase: gl.getAttribLocation(program, "aPhase"),
  audioSensitivity: gl.getAttribLocation(program, "aAudioSensitivity"),
};
const uniformLocations = {
  resolution: gl.getUniformLocation(program, "uResolution"),
  time: gl.getUniformLocation(program, "uTime"),
  lightning: gl.getUniformLocation(program, "uLightning"),
  bass: gl.getUniformLocation(program, "uBass"),
  mid: gl.getUniformLocation(program, "uMid"),
  treble: gl.getUniformLocation(program, "uTreble"),
  cameraPosition: gl.getUniformLocation(program, "uCameraPosition"),
  cameraRight: gl.getUniformLocation(program, "uCameraRight"),
  cameraUp: gl.getUniformLocation(program, "uCameraUp"),
  cameraForward: gl.getUniformLocation(program, "uCameraForward"),
};
const tracks = [
  {
    title: "Mnihimo's Journey",
    file: "audio/Mnihimo's Journey.wav",
  },
  {
    title: "Improwizacja exended Mixing",
    file: "audio/Improwizacja_exended_Mixing.wav",
  },
  {
    title: "Troll spoted mixingv2",
    file: "audio/Troll spoted mixingv2.wav",
  },
];
const audio = new Audio();

let audioContext;
let analyser;
let frequencyData;
let sourceNode;
let currentTrackIndex = 0;
let isSeeking = false;
let smoothedBass = 0;
let smoothedMid = 0;
let smoothedTreble = 0;
let cameraAudio = 0;
let cameraTravel = 0;
let smoothedImpact = 0;
let previousImpact = 0;
let speedEnvelope = 0;
let cameraVelocity = 0.7;
let lightningEnergy = 0;
let lastRenderTime = 0;

gl.useProgram(program);
gl.bindBuffer(gl.ARRAY_BUFFER, sceneBuffer);
gl.bufferData(gl.ARRAY_BUFFER, sceneObjects, gl.STATIC_DRAW);
gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
gl.disable(gl.DEPTH_TEST);
audio.loop = false;
loadTrack(0);
renderTrackList();

audioToggle.addEventListener("click", async () => {
  await setupAudio();

  if (audio.paused) {
    await audioContext.resume();
    await audio.play();
    audioToggle.textContent = "Pauza";
    document.body.classList.add("is-playing");
    return;
  }

  audio.pause();
  audioToggle.textContent = "Odtwórz";
  document.body.classList.remove("is-playing");
});

previousTrackButton.addEventListener("click", async () => {
  await changeTrack(currentTrackIndex - 1, !audio.paused);
});

nextTrackButton.addEventListener("click", async () => {
  await changeTrack(currentTrackIndex + 1, !audio.paused);
});

trackSelect.addEventListener("change", async () => {
  await changeTrack(Number(trackSelect.value), !audio.paused);
});

seekBar.addEventListener("input", () => {
  isSeeking = true;
  updateTimeLabels(getSeekTime(), audio.duration);
});

seekBar.addEventListener("change", () => {
  audio.currentTime = getSeekTime();
  isSeeking = false;
});

audio.addEventListener("loadedmetadata", updateTimeline);
audio.addEventListener("timeupdate", updateTimeline);
audio.addEventListener("ended", async () => {
  await changeTrack(currentTrackIndex + 1, true);
});

function renderTrackList() {
  trackSelect.innerHTML = "";

  tracks.forEach((track, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = track.title;
    trackSelect.append(option);
  });

  trackSelect.value = String(currentTrackIndex);
}

function loadTrack(index) {
  currentTrackIndex = wrapTrackIndex(index);
  const track = tracks[currentTrackIndex];

  audio.src = new URL(`../${track.file}`, import.meta.url);
  audio.load();
  trackTitle.textContent = track.title;
  trackSelect.value = String(currentTrackIndex);
  seekBar.value = "0";
  updateTimeLabels(0, 0);
}

async function changeTrack(index, shouldPlay) {
  loadTrack(index);

  if (!shouldPlay) {
    audioToggle.textContent = "Odtwórz";
    document.body.classList.remove("is-playing");
    return;
  }

  await setupAudio();
  await audioContext.resume();
  await audio.play();
  audioToggle.textContent = "Pauza";
  document.body.classList.add("is-playing");
}

function wrapTrackIndex(index) {
  return (index + tracks.length) % tracks.length;
}

function getSeekTime() {
  const duration = Number.isFinite(audio.duration) ? audio.duration : 0;

  return (Number(seekBar.value) / Number(seekBar.max)) * duration;
}

function updateTimeline() {
  if (isSeeking) {
    return;
  }

  const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  const currentTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
  const progress = duration > 0 ? (currentTime / duration) * Number(seekBar.max) : 0;

  seekBar.value = String(progress);
  updateTimeLabels(currentTime, duration);
}

function updateTimeLabels(currentTime, duration) {
  currentTimeLabel.textContent = formatTime(currentTime);
  durationLabel.textContent = formatTime(duration);
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0:00";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, "0");

  return `${minutes}:${remainingSeconds}`;
}

function createSceneObjects() {
  const objects = [];

  for (let index = 0; index < 88; index += 1) {
    const cluster = index % 5;
    const clusterX = [-5.8, -2.4, 1.2, 4.6, 0.0][cluster];
    const clusterY = [2.6, -1.4, 1.2, -2.2, 0.0][cluster];
    pushObject(objects, {
      x: clusterX + randomGaussian() * 2.2,
      y: clusterY + randomGaussian() * 1.3,
      z: Math.random() * 96,
      size: 18 + Math.random() * 44,
      hue: [0.28, 0.42, 0.62, 0.82, 0.18][cluster] + randomGaussian() * 0.05,
      kind: 0,
      audioSensitivity: 0.7 + Math.random() * 0.7,
    });
  }

  addSmokeLayer(objects, 84);
  addDustVeinLayer(objects, 38);
  addDustStrokeLayer(objects, 18);
  addFilamentLayer(objects, 22);

  for (let index = 0; index < 540; index += 1) {
    const spread = 12 + Math.random() * 17;
    const sizeRoll = Math.random();
    const size =
      sizeRoll < 0.84
        ? 3.4 + Math.random() * 8.4
        : sizeRoll < 0.97
          ? 10 + Math.random() * 20
          : 24 + Math.random() * 34;
    pushObject(objects, {
      x: (Math.random() - 0.5) * spread,
      y: (Math.random() - 0.5) * spread * 0.72,
      z: Math.random() * 96,
      size,
      hue: Math.random(),
      kind: 1,
      audioSensitivity: sizeRoll < 0.84
        ? 0.26 + Math.random() * 0.88
        : 0.35 + Math.pow(Math.random(), 1.7) * 1.45,
    });
  }

  for (let index = 0; index < 480; index += 1) {
    const spread = 14 + Math.random() * 19;
    pushObject(objects, {
      x: (Math.random() - 0.5) * spread,
      y: (Math.random() - 0.5) * spread * 0.74,
      z: Math.random() * 96,
      size: 2.8 + Math.random() * 5.4,
      hue: Math.random(),
      kind: 1,
      audioSensitivity: 0.18 + Math.random() * 0.58,
    });
  }

  addMusicResponsiveStars(objects, 620);

  return new Float32Array(objects);
}

function addSmokeLayer(objects, count) {
  const pockets = [
    [-5.2, 2.4, 0.78],
    [-2.1, -2.0, 0.88],
    [2.8, 1.4, 0.18],
    [5.6, -1.2, 0.08],
    [0.4, 0.1, 0.55],
  ];

  for (let index = 0; index < count; index += 1) {
    const pocket = pockets[index % pockets.length];

    pushObject(objects, {
      x: pocket[0] + randomGaussian() * 2.8,
      y: pocket[1] + randomGaussian() * 1.8,
      z: Math.random() * 96,
      size: 52 + Math.random() * 82,
      hue: pocket[2] + randomGaussian() * 0.08,
      kind: 3,
      audioSensitivity: 0.45 + Math.random() * 0.85,
    });
  }
}

function addDustVeinLayer(objects, count) {
  const pockets = [
    [-5.2, 2.4, 0.72, 2.4, 1.5],
    [-2.1, -2.0, 0.88, 2.2, 1.3],
    [2.8, 1.4, 0.28, 2.5, 1.5],
    [5.6, -1.2, 0.08, 2.0, 1.2],
  ];

  for (let index = 0; index < count; index += 1) {
    const pocket = pockets[index % pockets.length];

    const position = keepAwayFromCameraAxis(
      pocket[0] + randomGaussian() * pocket[3],
      pocket[1] + randomGaussian() * pocket[4],
    );

    pushObject(objects, {
      x: position[0],
      y: position[1],
      z: Math.random() * 96,
      size: 62 + Math.random() * 96,
      hue: pocket[2] + randomGaussian() * 0.08,
      kind: 5,
      audioSensitivity: 0.24 + Math.random() * 0.4,
    });
  }
}

function addDustStrokeLayer(objects, count) {
  const strokes = [
    [-5.2, 2.4, 0.72, 0.92, 0.58],
    [-2.1, -2.0, 0.9, 0.84, 0.52],
    [2.8, 1.4, 0.3, 0.96, 0.6],
    [5.6, -1.2, 0.08, 0.78, 0.48],
  ];

  for (let index = 0; index < count; index += 1) {
    const stroke = strokes[index % strokes.length];
    const density = Math.pow(Math.random(), 2.1);

    const position = keepAwayFromCameraAxis(
      stroke[0] + randomGaussian() * stroke[3] * density,
      stroke[1] + randomGaussian() * stroke[4] * density,
    );

    pushObject(objects, {
      x: position[0],
      y: position[1],
      z: Math.random() * 96,
      size: 48 + Math.random() * 68,
      hue: stroke[2] + randomGaussian() * 0.05,
      kind: 6,
      audioSensitivity: 0.5 + Math.random() * 0.56,
    });
  }
}

function addFilamentLayer(objects, count) {
  const veins = [
    [-5.2, 2.4, 0.78, 1.8, 1.0],
    [-2.1, -2.0, 0.88, 1.6, 1.0],
    [2.8, 1.4, 0.18, 1.8, 1.05],
    [5.6, -1.2, 0.08, 1.5, 0.95],
  ];

  for (let index = 0; index < count; index += 1) {
    const vein = veins[index % veins.length];
    const density = Math.pow(Math.random(), 1.7);

    const position = keepAwayFromCameraAxis(
      vein[0] + randomGaussian() * vein[3] * density,
      vein[1] + randomGaussian() * vein[4] * density,
    );

    pushObject(objects, {
      x: position[0],
      y: position[1],
      z: Math.random() * 96,
      size: 40 + Math.random() * 62,
      hue: vein[2] + randomGaussian() * 0.06,
      kind: 4,
      audioSensitivity: 0.46 + Math.random() * 0.76,
    });
  }
}

function keepAwayFromCameraAxis(x, y) {
  const distanceFromCenter = Math.hypot(x, y);

  if (distanceFromCenter >= 4.0) {
    return [x, y];
  }

  const angle = Math.atan2(y, x || 0.01);
  const targetDistance = 4.0 + Math.random() * 1.8;

  return [
    Math.cos(angle) * targetDistance,
    Math.sin(angle) * targetDistance,
  ];
}

function addMusicResponsiveStars(objects, count) {
  for (let index = 0; index < count; index += 1) {
    const spread = 13 + Math.random() * 18;
    const sizeRoll = Math.random();

    pushObject(objects, {
      x: (Math.random() - 0.5) * spread,
      y: (Math.random() - 0.5) * spread * 0.76,
      z: Math.random() * 96,
      size: sizeRoll < 0.88 ? 2.4 + Math.random() * 5.8 : 8 + Math.random() * 14,
      hue: Math.random(),
      kind: 2,
      audioSensitivity: 0.75 + Math.pow(Math.random(), 1.4) * 1.45,
    });
  }
}

function pushObject(objects, object) {
  objects.push(
    object.x,
    object.y,
    object.z,
    object.size,
    object.hue,
    object.kind,
    Math.random() * 100,
    object.audioSensitivity,
  );
}

function randomGaussian() {
  let u = 0;
  let v = 0;

  while (u === 0) {
    u = Math.random();
  }

  while (v === 0) {
    v = Math.random();
  }

  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

async function setupAudio() {
  if (audioContext) {
    return;
  }

  audioContext = new AudioContext();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.78;
  frequencyData = new Uint8Array(analyser.frequencyBinCount);

  sourceNode = audioContext.createMediaElementSource(audio);
  sourceNode.connect(analyser);
  analyser.connect(audioContext.destination);
}

function readAudioBands() {
  if (!analyser || audio.paused) {
    return { bass: 0, mid: 0, treble: 0 };
  }

  analyser.getByteFrequencyData(frequencyData);

  return {
    bass: averageRange(0, 12),
    mid: averageRange(12, 58),
    treble: averageRange(58, frequencyData.length),
  };
}

function averageRange(start, end) {
  let sum = 0;

  for (let index = start; index < end; index += 1) {
    sum += frequencyData[index];
  }

  return sum / (end - start) / 255;
}

function updateAudioState() {
  const bands = readAudioBands();

  smoothedBass += (bands.bass - smoothedBass) * 0.055;
  smoothedMid += (bands.mid - smoothedMid) * 0.052;
  smoothedTreble += (bands.treble - smoothedTreble) * 0.045;

  const cameraTarget = Math.min(1, smoothedBass * 0.72 + smoothedMid * 0.42 + smoothedTreble * 0.18);
  const cameraSmoothing = cameraTarget > cameraAudio ? 0.018 : 0.012;
  cameraAudio += (cameraTarget - cameraAudio) * cameraSmoothing;

  const rawImpact = Math.min(1, bands.bass * 1.28 + bands.mid * 0.54);
  smoothedImpact += (rawImpact - smoothedImpact) * 0.12;

  const lightningTarget = Math.max(0, rawImpact - 0.2) / 0.8;
  const lightningSmoothing = lightningTarget > lightningEnergy ? 0.16 : 0.032;
  lightningEnergy += (Math.min(1, lightningTarget) - lightningEnergy) * lightningSmoothing;
}

function updateSpeedEnvelope(deltaTime) {
  const onset = Math.max(0, smoothedImpact - previousImpact);
  const attack = Math.log1p(Math.max(0, onset - 0.01) * 48.0) / Math.log1p(48.0);

  if (attack > 0.04) {
    speedEnvelope = Math.max(speedEnvelope, Math.min(1, attack));
  }

  const decay = Math.pow(1 - Math.min(deltaTime / 0.3, 1), 2.1);
  speedEnvelope *= decay;
  previousImpact = smoothedImpact;

  speedEnvelope = Math.max(0, Math.min(speedEnvelope, 1));
}

function getCamera(time) {
  const position = cameraPath(time, cameraTravel);
  const futurePosition = cameraPath(
    time + 5.8,
    cameraTravel + 9.2,
  );
  const headTurn = [
    Math.sin(time * 0.09) * 1.46 + Math.sin(time * 0.031 + 1.7) * 0.58,
    Math.sin(time * 0.074 + 0.8) * 0.96 + Math.cos(time * 0.027 + 2.1) * 0.38,
    0,
  ];
  const target = [
    futurePosition[0] + headTurn[0],
    futurePosition[1] + headTurn[1],
    futurePosition[2],
  ];
  const forward = normalize([
    target[0] - position[0],
    target[1] - position[1],
    target[2] - position[2],
  ]);
  const baseRight = normalize(cross(forward, [0, 1, 0]));
  const baseUp = normalize(cross(baseRight, forward));
  const roll =
    Math.sin(time * 0.056 + 0.4) * 0.045 +
    Math.sin(time * 0.023 + 2.4) * 0.018;
  const right = normalize([
    baseRight[0] * Math.cos(roll) + baseUp[0] * Math.sin(roll),
    baseRight[1] * Math.cos(roll) + baseUp[1] * Math.sin(roll),
    baseRight[2] * Math.cos(roll) + baseUp[2] * Math.sin(roll),
  ]);
  const up = normalize(cross(right, forward));

  return { position, right, up, forward };
}

function cameraPath(time, travel) {
  return [
    Math.sin(time * 0.036) * 0.62 + Math.sin(time * 0.019 + 1.8) * 0.26,
    Math.cos(time * 0.032 + 0.7) * 0.44 + Math.sin(time * 0.017 + 2.2) * 0.2,
    travel,
  ];
}

function normalize(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;

  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function createShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(message);
  }

  return shader;
}

function createProgram(vertexShader, fragmentShader) {
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(message);
  }

  return program;
}

function resizeCanvas() {
  const pixelRatio = Math.min(window.devicePixelRatio, 1.5);
  const width = Math.floor(canvas.clientWidth * pixelRatio);
  const height = Math.floor(canvas.clientHeight * pixelRatio);

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
  }
}

function drawScene(time, camera) {
  gl.clearColor(0.006, 0.008, 0.022, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, sceneBuffer);

  const stride = 8 * Float32Array.BYTES_PER_ELEMENT;

  gl.enableVertexAttribArray(attributeLocations.position);
  gl.vertexAttribPointer(attributeLocations.position, 3, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(attributeLocations.size);
  gl.vertexAttribPointer(attributeLocations.size, 1, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);
  gl.enableVertexAttribArray(attributeLocations.hue);
  gl.vertexAttribPointer(attributeLocations.hue, 1, gl.FLOAT, false, stride, 4 * Float32Array.BYTES_PER_ELEMENT);
  gl.enableVertexAttribArray(attributeLocations.kind);
  gl.vertexAttribPointer(attributeLocations.kind, 1, gl.FLOAT, false, stride, 5 * Float32Array.BYTES_PER_ELEMENT);
  gl.enableVertexAttribArray(attributeLocations.phase);
  gl.vertexAttribPointer(attributeLocations.phase, 1, gl.FLOAT, false, stride, 6 * Float32Array.BYTES_PER_ELEMENT);
  gl.enableVertexAttribArray(attributeLocations.audioSensitivity);
  gl.vertexAttribPointer(attributeLocations.audioSensitivity, 1, gl.FLOAT, false, stride, 7 * Float32Array.BYTES_PER_ELEMENT);

  gl.uniform2f(uniformLocations.resolution, canvas.width, canvas.height);
  gl.uniform1f(uniformLocations.time, time);
  gl.uniform1f(uniformLocations.lightning, lightningEnergy);
  gl.uniform1f(uniformLocations.bass, smoothedBass);
  gl.uniform1f(uniformLocations.mid, smoothedMid);
  gl.uniform1f(uniformLocations.treble, smoothedTreble);
  gl.uniform3fv(uniformLocations.cameraPosition, camera.position);
  gl.uniform3fv(uniformLocations.cameraRight, camera.right);
  gl.uniform3fv(uniformLocations.cameraUp, camera.up);
  gl.uniform3fv(uniformLocations.cameraForward, camera.forward);
  gl.drawArrays(gl.POINTS, 0, sceneObjects.length / 8);
}

function render(timeMs) {
  resizeCanvas();
  updateAudioState();

  const time = timeMs * 0.001;
  const deltaTime = lastRenderTime > 0 ? Math.min(time - lastRenderTime, 0.05) : 0;
  updateSpeedEnvelope(deltaTime);

  const speedTarget =
    0.55 +
    Math.pow(smoothedImpact, 1.28) * 5.2 +
    speedEnvelope * 2.8;
  const velocitySmoothing = speedTarget > cameraVelocity ? 0.2 : 0.08;
  cameraVelocity += (speedTarget - cameraVelocity) * velocitySmoothing;
  cameraTravel += deltaTime * cameraVelocity;
  lastRenderTime = time;

  const camera = getCamera(time);
  drawScene(time, camera);

  requestAnimationFrame(render);
}

requestAnimationFrame(render);
