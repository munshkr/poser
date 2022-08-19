// https://kylemcdonald.github.io/cv-examples/

const debug = false;

const gui = new lil.GUI();

const camWidth = 640;
const camHeight = 480;

const KEYPOINT_TYPES = ['leftEye', 'leftEar', 'rightEye', 'rightEar'];

let capture;
let videoRatio, videoWidth, videoHeight, videoOffsetX, videoOffsetY;
let poseNet;
let posesResults = [];
let previousPixels;

const zones = [
  { x: -8, y: -7, width: 3, height: 3, relativeTo: 'rightEye' }
];
const zoneFolders = [];

let parameters = {
  keypointThreshold: 0.2,
  knownDistEyeCm: 3.3,
  motionThreshold: 0.3,
}

function setup() {
  createCanvas(windowWidth, windowHeight);

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

  gui.add(parameters, 'knownDistEyeCm', 2.5, 3.8);
  gui.add(parameters, 'motionThreshold', 0, 1);

  // Setup GUI
  const poseNetFolder = gui.addFolder('PoseNet');
  poseNetFolder.add(poseNet, 'minConfidence', 0, 1);
  poseNetFolder.add(poseNet, 'maxPoseDetections', 1, 8, 1);
  poseNetFolder.add(poseNet, 'scoreThreshold', 0, 1);
  poseNetFolder.add(poseNet, 'detectionType', ['single', 'multiple']);
  poseNetFolder.add(parameters, 'keypointThreshold', 0, 1);

  updateZoneFolders();

  setInterval(() => {
    document.getElementById("framerate").innerText = getFrameRate().toFixed(2);
  }, 250);
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
  updateVideoSize()
  image(capture, videoOffsetX, videoOffsetY, videoWidth, videoHeight);

  updateZonePixelPosSize();
  calculateMotionInZones();

  // Draw things
  push();

  const offX = width / 2 - videoWidth / 2
  const offY = height / 2 - videoHeight / 2
  translate(offX, offY);
  scale(videoRatio);

  if (debug) drawVideoRect()

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
      stroke(255, 0, 0);
      fill(255, 0, 0, 80);
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
  if (zones.length == 0) return;

  capture.loadPixels();

  for (let j = 0; j < zones.length; j++) {
    const zone = zones[j];

    let total = 0;
    if (capture.pixels.length > 0) { // don't forget this!
      if (!previousPixels) {
        previousPixels = copyImage(capture.pixels, previousPixels);
      } else {
        const pixels = capture.pixels;
        const thresholdAmount = (parameters.motionThreshold * 255) * 3;
        for (let x = zone._x; x < zone._x + zone._w; x++) {
          for (let y = zone._y; y < zone._y + zone._h; y++) {
            let i = (x + (y * capture.width)) * 4;
            // calculate the differences
            const rdiff = Math.abs(pixels[i + 0] - previousPixels[i + 0]);
            const gdiff = Math.abs(pixels[i + 1] - previousPixels[i + 1]);
            const bdiff = Math.abs(pixels[i + 2] - previousPixels[i + 2]);
            // copy the current pixels to previousPixels
            previousPixels[i + 0] = pixels[i + 0];
            previousPixels[i + 1] = pixels[i + 1];
            previousPixels[i + 2] = pixels[i + 2];
            const diffs = rdiff + gdiff + bdiff;
            let output = 0;
            if (diffs > thresholdAmount) {
              output = 255;
              total += diffs;
            }

            // TODO: Put output pixels in a different image
            // pixels[i++] = output;
            // pixels[i++] = output;
            // pixels[i++] = output;
          }
        }
      }
    }
    zone.motion = total;
  }

  // capture.updatePixels();
}