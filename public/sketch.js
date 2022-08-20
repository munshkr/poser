const debug = false;

const gui = new lil.GUI();
const osc = new OSC();

const camWidth = 640;
const camHeight = 480;

const KEYPOINT_TYPES = [
  'leftAnkle',
  'leftEar',
  'leftElbow',
  'leftEye',
  'leftHip',
  'leftKnee',
  'leftShoulder',
  'leftWrist',
  'nose',
  'rightAnkle',
  'rightEar',
  'rightElbow',
  'rightEye',
  'rightHip',
  'rightKnee',
  'rightShoulder',
  'rightWrist',
];

let capture;
let videoRatio, videoWidth, videoHeight, videoOffsetX, videoOffsetY;
let poseNet;
let posesResults = [];
let previousPixels;

let zones = [];
let nextZoneId = 0;
const zoneFolders = [];

let parameters = {
  keypointThreshold: 0.2,
  knownDistEyeCm: 3.3,
  motionThreshold: 0.3,
  motionCountThreshold: 50,
}

function setup() {
  createCanvas(windowWidth, windowHeight);

  // Connect to WS server (port 8080 when not specified)
  osc.open();

  // Create capture
  capture = createCapture({
    audio: false,
    video: {
      width: camWidth,
      height: camHeight
    }
  }, function () {
    console.log('Capture ready')
  });
  capture.elt.setAttribute('playsinline', '');
  capture.size(camWidth, camHeight);

  // Create a new poseNet method
  const options = {
    flipHorizontal: false,
    detectionType: 'single',
    maxPoseDetections: 1,
  };
  poseNet = ml5.poseNet(capture, options, modelReady);
  // This sets up an event that fills the global variable "poses"
  // with an array every time new poses are detected
  poseNet.on('pose', function (results) {
    posesResults = results;
  });

  capture.hide();

  // Setup GUI
  gui.add(parameters, 'knownDistEyeCm', 2.5, 3.8);
  gui.add(parameters, 'motionThreshold', 0, 1);
  gui.add(parameters, 'motionCountThreshold', 0, 300, 10);

  const poseNetFolder = gui.addFolder('PoseNet');
  poseNetFolder.add(poseNet, 'minConfidence', 0, 1);
  poseNetFolder.add(poseNet, 'maxPoseDetections', 1, 8, 1);
  poseNetFolder.add(poseNet, 'scoreThreshold', 0, 1);
  poseNetFolder.add(poseNet, 'detectionType', ['single', 'multiple']);
  poseNetFolder.add(parameters, 'keypointThreshold', 0, 1);

  const zonesCtrlFolder = gui.addFolder("Zones");
  zonesCtrlFolder.add(window, 'addZone')
  zonesCtrlFolder.add(window, 'saveZones')
  zonesCtrlFolder.add(window, 'loadZones')

  // add a default zone as a starting point...
  addZone({ x: 5, y: -7, width: 4, height: 4, relativeTo: 'leftEye' });

  setInterval(() => {
    document.getElementById("framerate").innerText = getFrameRate().toFixed(2);
  }, 250);
}

function saveZones() {
  let writer = createWriter('zones.json');
  writer.write(JSON.stringify(zones));
  writer.close();
}

function loadZones() {
  const fileInput = document.getElementById("fileInput");
  fileInput.onchange = (ev) => {
    var reader = new FileReader();
    reader.onload = (e) => {
      console.log("read", e.target.result)
      zones = JSON.parse(e.target.result)
    };
    reader.readAsText(ev.target.files[0]);
  }
  fileInput.click();
}

function addZone(newZone) {
  const randomKeypoint = KEYPOINT_TYPES[Math.floor(Math.random() * KEYPOINT_TYPES.length)];
  const id = nextZoneId;
  zones.push({
    x: 0,
    y: 0,
    width: 4,
    height: 4,
    relativeTo: randomKeypoint,
    ...newZone,
    id,
    remove: () => removeZone(id)
  });
  nextZoneId += 1;
  updateZoneFolders();
  console.log("Zones:", zones);
}

function removeZone(idx) {
  console.log("Remove zone id", idx)
  zones = zones.filter(zone => zone.id != idx);
  updateZoneFolders();
}

function updateZoneFolders() {
  // Destroy all zone folders
  for (let i = 0; i < zoneFolders.length; i++) {
    const zoneFolder = zoneFolders[i];
    zoneFolder.destroy();
  }

  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    const zoneFolder = gui.addFolder(`Zone ${i + 1}`);
    zoneFolder.add(zone, 'x', -30, 30);
    zoneFolder.add(zone, 'y', -30, 30);
    zoneFolder.add(zone, 'width', 0, 30);
    zoneFolder.add(zone, 'height', 0, 40);
    zoneFolder.add(zone, 'relativeTo', KEYPOINT_TYPES);
    zoneFolder.add(zone, 'remove');
    zoneFolders.push(zoneFolder);
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function modelReady() {
  console.log('Model Loaded');
}

function draw() {
  background(0);

  // Render capture image to canvas, preserving aspect ratio
  updateVideoSize();

  push();
  translate(width, 0);
  scale(-1, 1);

  image(capture, videoOffsetX, videoOffsetY, videoWidth, videoHeight);

  updateZonePixelPosSize();
  calculateMotionInZones();
  handleZoneTriggers();

  // Draw things

  const offX = width / 2 - videoWidth / 2
  const offY = height / 2 - videoHeight / 2
  translate(offX, offY);
  scale(videoRatio);

  if (debug) drawVideoRect();

  drawKeypoints();
  drawSkeleton();
  drawZones();

  pop();
}

function updateVideoSize() {
  const hRatio = height / capture.height;
  const wRatio = width / capture.width;

  videoRatio = Math.min(hRatio, wRatio);
  videoWidth = capture.width * videoRatio;
  videoHeight = capture.height * videoRatio;

  videoOffsetX = (width / 2) - (videoWidth / 2);
  videoOffsetY = (height / 2) - (videoHeight / 2);
}

function drawVideoRect() {
  noFill();
  stroke(255, 255, 0);
  rect(0, 0, capture.width - 1, capture.height - 1);
}

// A function to draw ellipses over the detected keypoints
function drawKeypoints() {
  // Loop through all the poses detected
  for (let i = 0; i < posesResults.length; i++) {
    // For each pose detected, loop through all the keypoints
    let pose = posesResults[i].pose;
    for (let j = 0; j < pose.keypoints.length; j++) {
      // A keypoint is an object describing a body part (like rightArm or leftShoulder)
      let keypoint = pose.keypoints[j];
      // Only draw an ellipse is the pose probability is bigger than 0.2
      if (keypoint.score > parameters.keypointThreshold) {
        fill(255, 0, 0);
        noStroke();
        ellipse(keypoint.position.x, keypoint.position.y, 10, 10);
      }
    }
  }
}

// A function to draw the skeletons
function drawSkeleton() {
  // Loop through all the skeletons detected
  for (let i = 0; i < posesResults.length; i++) {
    let skeleton = posesResults[i].skeleton;
    // For every skeleton, loop through all body connections
    for (let j = 0; j < skeleton.length; j++) {
      let partA = skeleton[j][0];
      let partB = skeleton[j][1];
      stroke(255, 0, 0);
      line(partA.position.x, partA.position.y, partB.position.x, partB.position.y);
    }
  }
}

function drawZones() {
  const poseResults = posesResults[0];
  if (!poseResults) return;

  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    const kpName = zone.relativeTo;
    const kp = poseResults.pose[kpName];
    if (kp.confidence >= 0.5) {
      if (zone._triggered) {
        stroke(255, 255, 0);
        fill(255, 255, 0, 40);
      } else {
        stroke(255, 0, 0);
        fill(255, 0, 0, 40);
      }
      rect(zone._x, zone._y, zone._w, zone._h);
    }
  }
}

function calcCmPerPixelRatio() {
  if (posesResults.length == 0) return;
  const { pose } = posesResults[0];
  const leftEye = pose['leftEye'];
  const rightEye = pose['rightEye'];
  if (leftEye.confidence < 0.5 || rightEye.confidence < 0.5) return;
  const distEye = Math.max(leftEye.x, rightEye.x) - Math.min(leftEye.x, rightEye.x);
  return parameters.knownDistEyeCm / distEye;
}

function copyImage(src, dst) {
  let n = src.length;
  if (!dst || dst.length != n) dst = new src.constructor(n);
  while (n--) dst[n] = src[n];
  return dst;
}

function updateZonePixelPosSize() {
  const poseResults = posesResults[0];
  if (!poseResults) return;

  const r = calcCmPerPixelRatio();

  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    const kpName = zone.relativeTo;
    const kp = poseResults.pose[kpName];
    if (kp.confidence >= 0.5) {
      zone._x = Math.round(kp.x + zone.x / r);
      zone._y = Math.round(kp.y + zone.y / r);
      zone._w = Math.round(zone.width / r);
      zone._h = Math.round(zone.height / r);
    }
  }
}

function calculateMotionInZones() {
  capture.loadPixels();

  if (capture.pixels.length > 0) {
    const pixels = capture.pixels;

    // Create previousPixels array
    if (!previousPixels) {
      previousPixels = copyImage(pixels);
    }

    // Copy curent pixels (because we're going to modify them with diff)
    const currentPixels = copyImage(pixels);

    // For each zone, calculate difference to detect changes between previous
    // and current frame.
    const thresholdAmount = parameters.motionThreshold * 255 * 3;
    for (let j = 0; j < zones.length; j++) {
      const zone = zones[j];

      let diffCount = 0;
      for (let x = zone._x; x < zone._x + zone._w; x++) {
        for (let y = zone._y; y < zone._y + zone._h; y++) {
          let i = (x + (y * capture.width)) * 4;

          const rdiff = Math.abs(currentPixels[i + 0] - previousPixels[i + 0]);
          const gdiff = Math.abs(currentPixels[i + 1] - previousPixels[i + 1]);
          const bdiff = Math.abs(currentPixels[i + 2] - previousPixels[i + 2]);

          const totalDiff = rdiff + gdiff + bdiff;
          let output = 0;
          if (totalDiff > thresholdAmount) {
            output = 255;
            diffCount += 1;
          }

          pixels[i++] = output;
          pixels[i++] = output;
          pixels[i++] = output;
        }
      }

      // console.debug("motion", diffCount)
      const totalCount = zone._w * zone._h;
      zone.motion = diffCount
      zone.diffRatio = diffCount / totalCount;
    }

    // Update all pixels of previous frame (using currPixels, not capture.pixels)
    for (let i = 0; i < pixels.length; i++) {
      previousPixels[i] = currentPixels[i];
    }

    capture.updatePixels();
  }
}

function notifyZone(zoneId, isOn) {
  osc.send(new OSC.Message(`/ctrl`, `zone${zoneId}`, isOn ? 1 : 0))
}

function notifyZoneDiff(zoneId, zone) {
  osc.send(new OSC.Message(`/ctrl`, `zone${zoneId}-diff`, zone.diffRatio))
  // setTimeout(() => osc.send(new OSC.Message(`/ctrl`, `zone${zoneId}`, 0)), 250);
}

function handleZoneTriggers() {
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    const isTriggered = zone.motion >= parameters.motionCountThreshold;
    if (!zone._triggered && isTriggered) notifyZone(i, true);
    if (zone._triggered && !isTriggered) notifyZone(i, false);
    if (isTriggered) notifyZoneDiff(i, zone);
    zone._triggered = isTriggered;
  }
}