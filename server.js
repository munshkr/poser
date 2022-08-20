const OSC = require('osc-js')

const config = {
  wsServer: { port: 8080 },
  udpClient: { port: 6010 },  // TidalCycles control port
  udpServer: { port: 9130 },
}
const osc = new OSC({ plugin: new OSC.BridgePlugin(config) })

osc.on('*', (message, rinfo) => {
  console.log(message.address, message.args)
})

osc.on('open', () => {
  console.log(`Port ${config.wsServer.port} is open now.`)
  console.log(`Will redirect messages to UDP port ${config.udpClient.port}`)
})

osc.open()