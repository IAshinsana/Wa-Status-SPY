// index.js
require('dotenv').config()
const baileys = require('@whiskeysockets/baileys')
const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  Browsers
} = baileys
const P = require('pino')
const axios = require('axios')
const FormData = require('form-data')

;(async () => {
  try {
    // 1️⃣ Load or create authentication state
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info')

    // 2️⃣ Create a socket that stays invisible
    const sock = makeWASocket({
      auth: state,
      logger: P({ level: 'silent' }),      // no debug logs
      browser: Browsers.macOS('StatusArchiver')
    })

    // 3️⃣ Persist credentials when updated
    sock.ev.on('creds.update', saveCreds)

    // 4️⃣ Immediately go offline so you don’t appear “online”
    sock.ev.on('connection.update', ({ connection }) => {
      if (connection === 'open') {
        sock.sendPresenceUpdate('unavailable')
      }
    })

    // 5️⃣ Cache contacts for name lookups
    const contacts = {}
    sock.ev.on('contacts.update', updates => {
      for (const c of updates) {
        contacts[c.id] = c.notify || c.vname || c.name
      }
    })

    // 6️⃣ Listen for new messages (including Status broadcasts)
    sock.ev.on('messages.upsert', async up => {
      if (up.type !== 'notify') return

      for (const msg of up.messages) {
        // Only Status stories come from JIDs ending in 'status@broadcast'
        if (!msg.key.remoteJid?.endsWith('status@broadcast')) continue

        const content = msg.message?.ephemeralMessage?.message
        if (!content) continue

        // Determine the media node (image, video, audio, or document)
        const media =
          content.imageMessage ||
          content.videoMessage ||
          content.audioMessage ||
          content.documentMessage
        if (!media) continue

        // 7️⃣ Download the media buffer without sending a “viewed” receipt
        const buffer = await baileys.downloadMediaMessage(
          { message: media, key: msg.key },
          'buffer',
          { logger: P({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
        )

        // 8️⃣ Extract phone number and look up saved name
        const jid = msg.key.remoteJid.split(':')[0]     // e.g. "1234@s.whatsapp.net"
        const phone = jid.replace(/@.*$/, '')           // "1234"
        const name = contacts[jid] || 'Unknown'
        const caption = `📱 ${phone}\n👤 ${name}`

        // 9️⃣ Build the Telegram API form
        const form = new FormData()
        form.append('chat_id', process.env.TELEGRAM_CHAT_ID)
        form.append('caption', caption)

        let method
        if (content.imageMessage) {
          method = 'sendPhoto'
          form.append('photo', buffer, { filename: 'status.jpg' })
        } else if (content.videoMessage) {
          method = 'sendVideo'
          form.append('video', buffer, { filename: 'status.mp4' })
        } else if (content.audioMessage) {
          method = 'sendAudio'
          form.append('audio', buffer, { filename: 'status.ogg' })
        } else {
          method = 'sendDocument'
          form.append('document', buffer, { filename: media.fileName || 'status' })
        }

        // 🔟 Send the media to your Telegram channel
        try {
          await axios.post(
            `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`,
            form,
            { headers: form.getHeaders() }
          )
        } catch (err) {
          console.error('Telegram upload failed:', err)
        }

        // 1️⃣1️⃣ Throttle to avoid flooding
        await delay(2000)
      }
    })
  } catch (err) {
    console.error('Unexpected error in index.js:', err)
    process.exit(1)
  }
})()

