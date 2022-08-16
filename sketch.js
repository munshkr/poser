// https://kylemcdonald.github.io/cv-examples/

const debug = false;

const gui = new lil.GUI();

const camWidth = 640;
const camHeight = 480;

let video;
let videoRatio, videoWidth, videoHeight, videoOffsetX, videoOffsetY;
let poseNet;
let poses = [];

let parameters = {
  scoreThreshold: 0.2
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

  // Create a new poseNet method with a single detection
  poseNet = ml5.poseNet(video, modelReady);
  // This sets up an event that fills the global variable "poses"
  // with an array every time new poses are detected
  poseNet.on('pose', function (results) {
    poses = results;
  });

  video.hide();

  // Setup GUI
  gui.add(parameters, 'scoreThreshold', 0, 1);
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
  for (let i = 0; i < poses.length; i++) {
    // For each pose detected, loop through all the keypoints
    let pose = poses[i].pose;
    for (let j = 0; j < pose.keypoints.length; j++) {
      // A keypoint is an object describing a body part (like rightArm or leftShoulder)
      let keypoint = pose.keypoints[j];
      // Only draw an ellipse is the pose probability is bigger than 0.2
      if (keypoint.score > parameters.scoreThreshold) {
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
  for (let i = 0; i < poses.length; i++) {
    let skeleton = poses[i].skeleton;
    // For every skeleton, loop through all body connections
    for (let j = 0; j < skeleton.length; j++) {
      let partA = skeleton[j][0];
      let partB = skeleton[j][1];
      stroke(255, 0, 0);
      line(partA.position.x, partA.position.y, partB.position.x, partB.position.y);
    }
  }
}