// https://kylemcdonald.github.io/cv-examples/

const gui = new lil.GUI();

const camWidth = 640;
const camHeight = 480;

let capture;

function setup() {
  gui.add(document, 'title');

  capture = createCapture({
    audio: false,
    video: {
      width: camWidth,
      height: camHeight
    }
  }, function () {
    console.log('capture ready.')
  });
  capture.elt.setAttribute('playsinline', '');
  capture.size(camWidth, camHeight);

  createCanvas(windowWidth, windowHeight);
  capture.hide();

  imageMode(CENTER);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function draw() {
  // Render capture image to canvas, preserving aspect ratio
  const hRatio = height / capture.height;
  const wRatio = width / capture.width;
  const ratio = Math.min(hRatio, wRatio)
  image(capture, width / 2, height / 2, capture.width * ratio, capture.height * ratio);

  // Load pixels
  capture.loadPixels();
  if (capture.pixels.length > 0) { // don't forget this!
  }
}
