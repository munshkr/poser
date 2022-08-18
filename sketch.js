// https://kylemcdonald.github.io/cv-examples/

const debug = false;

const gui = new lil.GUI();

const camWidth = 640;
const camHeight = 480;

const KEYPOINT_TYPES = ['leftEye', 'leftEar', 'rightEye', 'rightEar'];

let video;
let videoRatio, videoWidth, videoHeight, videoOffsetX, videoOffsetY;
let poseNet;
let posesResults = [];

const zones = [
  { x: -8, y: -7, width: 3, height: 3, relativeTo: 'rightEye' }
];
const zoneFolders = [];

let parameters = {
  keypointThreshold: 0.2,
  knownDistEyeCm: 3.3
}

function setup() {
  createCanvas(windowWidth, windowHeight);

  // Create capture
  video = createCapture({
    audio: false,
    video: {
      width: camWidth,
      height: camHeight
    }
  }, function () {
    console.log('Capture ready')
  });
  video.elt.setAttribute('playsinline', '');
  video.size(camWidth, camHeight);

  // Create a new poseNet method
  const options = {
    flipHorizontal: false,
    detectionType: 'single',
    maxPoseDetections: 1,
  };
  poseNet = ml5.poseNet(video, options, modelReady);
  // This sets up an event that fills the global variable "poses"
  // with an array every time new poses are detected
  poseNet.on('pose', function (results) {
    posesResults = results;
  });

  video.hide();

  gui.add(parameters, 'knownDistEyeCm', 2.5, 3.8);

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
  image(video, videoOffsetX, videoOffsetY, videoWidth, videoHeight);

  // Load pixels
  video.loadPixels();
  if (video.pixels.length > 0) { // don't forget this!
  }

  // We can call both functions to draw all keypoints and the skeletons
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
  const hRatio = height / video.height;
  const wRatio = width / video.width;

  videoRatio = Math.min(hRatio, wRatio);
  videoWidth = video.width * videoRatio;
  videoHeight = video.height * videoRatio;

  videoOffsetX = (width / 2) - (videoWidth / 2);
  videoOffsetY = (height / 2) - (videoHeight / 2);
}

function drawVideoRect() {
  noFill();
  stroke(255, 255, 0);
  rect(0, 0, video.width - 1, video.height - 1);
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

  // console.log(`1 pixel is ${calcCmPerPixelRatio()} cm`);
  const r = calcCmPerPixelRatio();

  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    const kpName = zone.relativeTo;
    const kp = poseResults.pose[kpName];
    if (kp.confidence >= 0.5) {
      stroke(255, 0, 0);
      fill(255, 0, 0, 80);
      const x = (kp.x + zone.x / r);
      const y = (kp.y + zone.y / r);
      const w = zone.width / r;
      const h = zone.height / r;
      rect(x, y, w, h);
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