const canvas = document.querySelector("#webgl-canvas");
const audioToggle = document.querySelector("#audio-toggle");
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
    gl_PointSize = aSize * perspective * uResolution.y * kindScale;

    vHue = aHue;
    vKind = aKind;
    vDepth = smoothstep(fieldDepth, 3.0, viewPosition.z);
    vAudio = audio;
    vAudioSensitivity = aAudioSensitivity;
  }
`;

const fragmentShaderSource = `
  precision highp float;

  varying float vHue;
  varying float vKind;
  varying float vDepth;
  varying float vAudio;
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

    if (vKind > 2.5) {
      float angleNoise = sin(atan(p.y, p.x) * 9.0 + vHue * 18.0) * 0.012;
      float shapedDistance = d + angleNoise;
      float body = smoothstep(0.52, 0.0, shapedDistance);
      float hollow = smoothstep(0.16, 0.42, shapedDistance);
      float edge = smoothstep(0.52, 0.28, shapedDistance) * smoothstep(0.16, 0.38, shapedDistance);
      float rim = smoothstep(0.08, 0.0, abs(shapedDistance - 0.39)) * 0.22;
      vec3 smokeBlue = vec3(0.08, 0.28, 0.4);
      vec3 smokeAmber = vec3(0.62, 0.3, 0.12);
      vec3 color = mix(smokeBlue, smokeAmber, smoothstep(0.45, 1.0, vHue));
      float alpha = (body * hollow * 0.74 + rim * 0.2) * (0.1 + vDepth * 0.26 + vAudio * 0.32);
      color *= 0.36 + edge * 0.28 + rim * 0.16 + vAudio * 0.5;
      gl_FragColor = vec4(color, alpha);
      return;
    }

    if (vKind < 0.5) {
      float body = smoothstep(0.5, 0.0, d);
      float core = smoothstep(0.18, 0.0, d);
      float smoke = smoothstep(0.5, 0.22, d);
      vec3 color = nebulaColor(vHue);
      float alpha = (body * 0.14 + core * 0.08) * (0.2 + vDepth * 0.72 + vAudio * 0.9);
      color *= 0.22 + body * 0.38 + vAudio * 0.75;
      color *= 1.0 - smoke * 0.18;
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
const audio = new Audio(new URL("../Mnihimo's Journey.wav", import.meta.url));

let audioContext;
let analyser;
let frequencyData;
let sourceNode;
let smoothedBass = 0;
let smoothedMid = 0;
let smoothedTreble = 0;
let cameraAudio = 0;

gl.useProgram(program);
gl.bindBuffer(gl.ARRAY_BUFFER, sceneBuffer);
gl.bufferData(gl.ARRAY_BUFFER, sceneObjects, gl.STATIC_DRAW);
gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
gl.disable(gl.DEPTH_TEST);
audio.loop = true;

audioToggle.addEventListener("click", async () => {
  await setupAudio();

  if (audio.paused) {
    await audioContext.resume();
    await audio.play();
    audioToggle.textContent = "Pause";
    document.body.classList.add("is-playing");
    return;
  }

  audio.pause();
  audioToggle.textContent = "Play";
  document.body.classList.remove("is-playing");
});

function createSceneObjects() {
  const objects = [];

  for (let index = 0; index < 110; index += 1) {
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

  addSmokeLayer(objects, 120);

  for (let index = 0; index < 760; index += 1) {
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

  for (let index = 0; index < 760; index += 1) {
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

  addMusicResponsiveStars(objects, 1040);

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

  smoothedBass += (bands.bass - smoothedBass) * 0.08;
  smoothedMid += (bands.mid - smoothedMid) * 0.08;
  smoothedTreble += (bands.treble - smoothedTreble) * 0.08;

  const cameraTarget = Math.min(1, smoothedBass * 0.72 + smoothedMid * 0.42 + smoothedTreble * 0.18);
  const cameraSmoothing = cameraTarget > cameraAudio ? 0.014 : 0.004;
  cameraAudio += (cameraTarget - cameraAudio) * cameraSmoothing;
}

function getCamera(time) {
  const cameraEnergy = Math.pow(cameraAudio, 1.15) * 0.62;
  const position = cameraPath(time, cameraEnergy);
  const futurePosition = cameraPath(time + 5.5 + cameraEnergy * 1.4, cameraEnergy);
  const headTurn = [
    Math.sin(time * 0.19) * (2.35 + cameraEnergy * 1.22) +
      Math.sin(time * 0.071 + 1.7) * (0.92 + cameraEnergy * 0.58),
    Math.sin(time * 0.143 + 0.8) * (1.55 + cameraEnergy * 0.96) +
      Math.cos(time * 0.057 + 2.1) * (0.58 + cameraEnergy * 0.48),
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
    Math.sin(time * 0.12 + 0.4) * (0.08 + cameraEnergy * 0.1) +
    Math.sin(time * 0.047 + 2.4) * (0.035 + cameraEnergy * 0.065);
  const right = normalize([
    baseRight[0] * Math.cos(roll) + baseUp[0] * Math.sin(roll),
    baseRight[1] * Math.cos(roll) + baseUp[1] * Math.sin(roll),
    baseRight[2] * Math.cos(roll) + baseUp[2] * Math.sin(roll),
  ]);
  const up = normalize(cross(right, forward));

  return { position, right, up, forward };
}

function cameraPath(time, cameraEnergy) {
  const travelSpeed = 1.65 + cameraEnergy * 0.22;

  return [
    Math.sin(time * 0.06) * (0.72 + cameraEnergy * 0.22) +
      Math.sin(time * 0.031 + 1.8) * (0.34 + cameraEnergy * 0.12),
    Math.cos(time * 0.052 + 0.7) * (0.52 + cameraEnergy * 0.18) +
      Math.sin(time * 0.027 + 2.2) * (0.28 + cameraEnergy * 0.1),
    time * travelSpeed,
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
  const pixelRatio = Math.min(window.devicePixelRatio, 2);
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
  const positionLocation = gl.getAttribLocation(program, "aPosition");
  const sizeLocation = gl.getAttribLocation(program, "aSize");
  const hueLocation = gl.getAttribLocation(program, "aHue");
  const kindLocation = gl.getAttribLocation(program, "aKind");
  const phaseLocation = gl.getAttribLocation(program, "aPhase");
  const audioSensitivityLocation = gl.getAttribLocation(program, "aAudioSensitivity");

  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(sizeLocation);
  gl.vertexAttribPointer(sizeLocation, 1, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);
  gl.enableVertexAttribArray(hueLocation);
  gl.vertexAttribPointer(hueLocation, 1, gl.FLOAT, false, stride, 4 * Float32Array.BYTES_PER_ELEMENT);
  gl.enableVertexAttribArray(kindLocation);
  gl.vertexAttribPointer(kindLocation, 1, gl.FLOAT, false, stride, 5 * Float32Array.BYTES_PER_ELEMENT);
  gl.enableVertexAttribArray(phaseLocation);
  gl.vertexAttribPointer(phaseLocation, 1, gl.FLOAT, false, stride, 6 * Float32Array.BYTES_PER_ELEMENT);
  gl.enableVertexAttribArray(audioSensitivityLocation);
  gl.vertexAttribPointer(audioSensitivityLocation, 1, gl.FLOAT, false, stride, 7 * Float32Array.BYTES_PER_ELEMENT);

  gl.uniform2f(gl.getUniformLocation(program, "uResolution"), canvas.width, canvas.height);
  gl.uniform1f(gl.getUniformLocation(program, "uTime"), time);
  gl.uniform1f(gl.getUniformLocation(program, "uBass"), smoothedBass);
  gl.uniform1f(gl.getUniformLocation(program, "uMid"), smoothedMid);
  gl.uniform1f(gl.getUniformLocation(program, "uTreble"), smoothedTreble);
  gl.uniform3fv(gl.getUniformLocation(program, "uCameraPosition"), camera.position);
  gl.uniform3fv(gl.getUniformLocation(program, "uCameraRight"), camera.right);
  gl.uniform3fv(gl.getUniformLocation(program, "uCameraUp"), camera.up);
  gl.uniform3fv(gl.getUniformLocation(program, "uCameraForward"), camera.forward);
  gl.drawArrays(gl.POINTS, 0, sceneObjects.length / 8);
}

function render(timeMs) {
  resizeCanvas();
  updateAudioState();

  const time = timeMs * 0.001;
  const camera = getCamera(time);
  drawScene(time, camera);

  requestAnimationFrame(render);
}

requestAnimationFrame(render);
