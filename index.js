// index.js
require('dotenv').config()
const { default: makeWASocket, useMultiFileAuthState, downloadMediaMessage, delay, Browsers, DisconnectReason } = require('@whiskeysockets/baileys')
const P = require('pino')
const axios = require('axios')
const FormData = require('form-data')

;(async () => {
  const seen = new Set()
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info')
  const sock = makeWASocket({
    auth: state,
    logger: P({ level: 'silent' }),
    browser: Browsers.macOS('StatusArchiver')
  })
  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      console.log(`\n✅ Connected as ${sock.user.name} (${sock.user.id.split(':')[0]})`)
      sock.sendPresenceUpdate('unavailable')
    }
    if (connection === 'close'
      && lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut) {
      console.error('❌ Logged out—delete auth_info and rerun login.js')
      process.exit(1)
    }
  })

  // Cache contacts
  const contacts = {}
  sock.ev.on('contacts.update', ups => {
    ups.forEach(c => contacts[c.id] = c.notify || c.vname || c.name)
    console.log('\n📇 Contacts:')
    for (const [jid, name] of Object.entries(contacts)) {
      console.log(` • ${jid.split('@')[0]} → ${name}`)
    }
  })
  await delay(1000)

  console.log('\n🔍 Listening for new WhatsApp Status updates…')

  sock.ev.on('messages.upsert', async up => {
    if (up.type !== 'notify') return
    for (const msg of up.messages) {
      if (!msg.key.remoteJid?.endsWith('status@broadcast')) continue

      // Dedupe
      // Use participant if present, otherwise remoteJid
      const userJid = msg.key.participant || msg.key.remoteJid.split(':')[0]
      const phone   = userJid.split('@')[0]
      const id      = `${phone}_${msg.key.id}`
      if (seen.has(id)) continue
      seen.add(id)

      // Detect type
      let type
      const m = msg.message
      if      (m.imageMessage)    type = 'photo'
      else if (m.videoMessage)    type = 'video'
      else if (m.audioMessage)    type = 'audio'
      else if (m.documentMessage) type = 'document'
      else if (m.ephemeralMessage?.message?.imageMessage)    type = 'photo'
      else if (m.ephemeralMessage?.message?.videoMessage)    type = 'video'
      else {
        console.log('⚠️  Unsupported media type, skipping.')
        continue
      }

      // Resolve the message wrapper to pass to downloadMediaMessage
      const fullMsg = msg

      // Lookup name: contact list → pushName → fallback
      const name = contacts[userJid] || msg.pushName || 'Unknown'
      console.log(`\n📥 New ${type.toUpperCase()} status from ${phone} (${name})`)

      // Download
      let buffer
      try {
        console.log('⬇️  Downloading media...')
        buffer = await downloadMediaMessage(
          fullMsg,
          'buffer',
          { logger: P({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
        )
        console.log(`✅ Downloaded ${buffer.length} bytes`)
      } catch (e) {
        console.error('❌ Download error:', e)
        continue
      }

      // Send to Telegram
      const caption = `📱 ${phone}\n👤 ${name}`
      const form = new FormData()
      form.append('chat_id', process.env.TELEGRAM_CHAT_ID)
      form.append('caption', caption)
      const filename = type === 'photo' ? 'status.jpg' : type === 'video' ? 'status.mp4' : 'status.dat'
      form.append(type, buffer, { filename })

      try {
        console.log('⬆️  Uploading to Telegram...')
        const method = `send${type.charAt(0).toUpperCase() + type.slice(1)}`
        const res = await axios.post(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`,
          form,
          { headers: form.getHeaders() }
        )
        if (res.data.ok) console.log(`✅ Forwarded via ${method}`)
        else             console.error('❌ Telegram error:', res.data)
      } catch (e) {
        console.error('❌ Telegram upload failed:', e)
      }

      await delay(1000)
    }
  })
})().catch(err => {
  console.error('🚨 Fatal error:', err)
  process.exit(1)
})
