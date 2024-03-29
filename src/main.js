import { sketch } from 'p5js-wrapper';
import GUI from 'lil-gui';
import OSC, { STATUS } from 'osc-js';
import { WebMidi } from 'webmidi'
import ZoneController from './ZoneController';

import './style.css'

const gui = new GUI();
const osc = new OSC();

const camWidth = 640;
const camHeight = 480;

let capture;
let videoRatio, videoWidth, videoHeight, videoOffsetX, videoOffsetY;
let poseNet;
let posesResults = [];
let previousPixels;

let zones = [];

let parameters = {
  keypointThreshold: 0.2,
  knownDistEyeCm: 3.3,
  motionThreshold: 0.3,
  motionCountThreshold: 50,
}

sketch.setup = async () => {
  createCanvas(windowWidth, windowHeight);

  // Connect to WS server (port 8080 when not specified)
  osc.open();

  enableMIDI();

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
  const ml5 = await import('ml5');
  const options = {
    flipHorizontal: false,
    detectionType: 'single',
    maxPoseDetections: 1,
  };
  poseNet = ml5.poseNet(capture, options, () => console.log('Model Loaded'));
  // This sets up an event that fills the global variable "poses"
  // with an array every time new poses are detected
  poseNet.on('pose', function (results) {
    posesResults = results;
  });

  capture.hide();

  // Setup GUI
  const motionFolder = gui.addFolder("Motion Detection")
  motionFolder.add(parameters, 'knownDistEyeCm', 2.5, 3.8).name("Eyes distance (cm)")
  motionFolder.add(parameters, 'motionThreshold', 0, 1).name("Motion threshold");
  motionFolder.add(parameters, 'motionCountThreshold', 0, 300, 10).name("Motion count threshold");

  const poseNetFolder = gui.addFolder('PoseNet');
  poseNetFolder.add(poseNet, 'minConfidence', 0, 1).name("Min. confidence");
  poseNetFolder.add(poseNet, 'maxPoseDetections', 1, 8, 1).name("Max. pose detections");
  poseNetFolder.add(poseNet, 'scoreThreshold', 0, 1).name("Score threshold");
  poseNetFolder.add(poseNet, 'detectionType', ['single', 'multiple']).name("Detection type");
  poseNetFolder.add(parameters, 'keypointThreshold', 0, 1).name("Keypoint threshold");

  const fileInput = document.getElementById("file");
  const zonesController = new ZoneController(zones, fileInput);
  zonesController.addZonesFolderTo(gui);

  // add a default zone as a starting point...
  zonesController.add({ x: 5, y: -7, width: 4, height: 4, relativeTo: 'leftEye' });

  // FIXME Use text() on sketch.draw
  setInterval(() => {
    document.getElementById("framerate").innerText = getFrameRate().toFixed(2);
  }, 250);
}

sketch.windowResized = () => {
  resizeCanvas(windowWidth, windowHeight);
}

sketch.draw = () => {
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

  drawKeypoints();
  drawSkeleton();
  drawZones();

  pop();
}

function enableMIDI() {
  WebMidi.enable(function (err) {
    if (err) {
      console.error("WebMidi could not be enabled.", err);
    } else {
      console.log("WebMidi enabled!");
      console.log("Outputs:", WebMidi.outputs);
    }
  });
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
      if (zone.isAbsPosition) {
        zone._x = Math.round(zone.x * 10);
        zone._y = Math.round(zone.y * 10);
        zone._w = Math.round(zone.width * 10);
        zone._h = Math.round(zone.height * 10);
      } else {
        zone._x = Math.round(kp.x + zone.x / r);
        zone._y = Math.round(kp.y + zone.y / r);
        zone._w = Math.round(zone.width / r);
        zone._h = Math.round(zone.height / r);
      }
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
  if (isOn) {
    WebMidi.outputs.forEach(o => o.channels[1].playNote(36 + zoneId))
  } else {
    WebMidi.outputs.forEach(o => o.channels[1].stopNote(36 + zoneId))
  }
  // WebMidi.outputs.forEach(o => o.channels[1].sendControlChange(zoneId, isOn ? 127 : 0))
  console.log("zone", zoneId, isOn)

  if (osc.status() !== STATUS.IS_OPEN) return;
  osc.send(new OSC.Message(`/ctrl`, `zone${zoneId}`, isOn ? 1 : 0))
}

function notifyZoneDiff(zoneId, zone) {
  WebMidi.outputs.forEach(o => o.channels[1].sendControlChange(20 + zoneId, Math.round(zone.diffRatio * 127)))
  console.log("zoneDiff", zoneId, zone.diffRatio)
  // setTimeout(() => osc.send(new OSC.Message(`/ctrl`, `zone${zoneId}`, 0)), 250);

  if (osc.status() !== STATUS.IS_OPEN) return;
  osc.send(new OSC.Message(`/ctrl`, `zone${zoneId}-diff`, zone.diffRatio))
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