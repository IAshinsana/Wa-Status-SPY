// login.js
require('dotenv').config()
const baileys = require('@whiskeysockets/baileys')
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers
} = baileys
const P = require('pino')
const qrcode = require('qrcode-terminal')

let sock

async function connect() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info')
  sock = makeWASocket({
    auth: state,
    logger: P({ level: 'debug' }),
    browser: Browsers.macOS('LoginBot')
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ qr, connection, lastDisconnect }) => {
    if (qr) {
      console.log('\n🔔 Scan this QR code:')
      qrcode.generate(qr, { small: true })
    }
    if (connection === 'open') {
      console.log('✅ Logged in successfully!')
      // leaving socket open so index.js can reuse auth files
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      if (code === DisconnectReason.restartRequired) {
        console.log('🔄 Restarting login flow…')
        sock.ev.removeAllListeners()
        sock.end()
        connect()
      } else if (code === DisconnectReason.loggedOut) {
        console.error('❌ Logged out! Delete auth_info and rerun login.js')
        process.exit(1)
      } else {
        console.error('❌ Disconnected:', lastDisconnect?.error)
        process.exit(1)
      }
    }
  })
}

connect().catch(err => {
  console.error('🚨 Login error:', err)
  process.exit(1)
})
