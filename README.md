# Poser

Estimate pose from a webcam and detect motion changes to trigger WebSocket/OSC
messages.

Uses [p5](https://p5js.org/) and
[PoseNet](https://learn.ml5js.org/#/reference/posenet) model from
[ml5](https://ml5js.org/).

## Development

Run `yarn` to install dependencies.

Run `yarn dev` to start the Vite development server.  Then on a different
terminal, run `yarn bridge` to start the WebSocket/OSC bridge

You can also use the production build locally by running `yarn build` and then
running `yarn start`.

## Deploy

To deploy the web server, simply run `yarn build` and serve the static files on
`dist/`.

WebSocket bridge server should be run by the user on the machine that will be
running TidalCycles.
