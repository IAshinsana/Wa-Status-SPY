// index.js
require('dotenv').config()

const {
  default: makeWASocket,
  useMultiFileAuthState,
  downloadMediaMessage,
  delay,
  Browsers,
  DisconnectReason
} = require('@whiskeysockets/baileys')
const P = require('pino')
const axios = require('axios')
const FormData = require('form-data')

;(async () => {
  const seen = new Set()
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info')

  // Create socket—never show online
  const sock = makeWASocket({
    auth: state,
    logger: P({ level: 'silent' }),
    browser: Browsers.macOS('StatusArchiver'),
    markOnlineOnConnect: false
  })
  sock.ev.on('creds.update', saveCreds)

  // On connect: go offline once, disable presence & read receipts
  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      console.log(`\n✅ Connected as ${sock.user.name} (${sock.user.id.split(':')[0]})`)
      sock.sendPresenceUpdate('unavailable')
      sock.sendPresenceUpdate = async () => {}
      sock.sendReadReceipt     = async () => {}
      sock.sendReadMessage     = async () => {}
    }
    if (connection === 'close' &&
        lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut) {
      console.error('❌ Logged out—delete auth_info and rerun login.js')
      process.exit(1)
    }
  })

  // Cache contacts for captions
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

  // Real-time status listener
  sock.ev.on('messages.upsert', async up => {
    if (up.type !== 'notify') return
    for (const msg of up.messages) {
      try {
        if (!msg.key.remoteJid?.endsWith('status@broadcast')) continue
        if (!msg.message) continue

        const userJid = msg.key.participant || msg.key.remoteJid.split(':')[0]
        const phone   = userJid.split('@')[0]
        const id      = `${phone}_${msg.key.id}`
        if (seen.has(id)) continue
        seen.add(id)

        const m = msg.message
        let text = null
        if      (m.conversation)                                         text = m.conversation
        else if (m.extendedTextMessage?.text)                            text = m.extendedTextMessage.text
        else if (m.imageMessage?.caption)                                text = m.imageMessage.caption
        else if (m.videoMessage?.caption)                                text = m.videoMessage.caption
        else if (m.ephemeralMessage?.message?.conversation)             text = m.ephemeralMessage.message.conversation
        else if (m.ephemeralMessage?.message?.extendedTextMessage?.text) text = m.ephemeralMessage.message.extendedTextMessage.text
        else if (m.ephemeralMessage?.message?.imageMessage?.caption)     text = m.ephemeralMessage.message.imageMessage.caption
        else if (m.ephemeralMessage?.message?.videoMessage?.caption)     text = m.ephemeralMessage.message.videoMessage.caption

        let type = null
        if      (m.imageMessage || m.ephemeralMessage?.message?.imageMessage) type = 'photo'
        else if (m.videoMessage || m.ephemeralMessage?.message?.videoMessage) type = 'video'
        else if (m.audioMessage)                                            type = 'audio'
        else if (m.documentMessage)                                         type = 'document'

        const name = contacts[userJid] || msg.pushName || 'Unknown'

        // Text-only status
        if (text && !type) {
          console.log(`\n📄 Text status from ${phone} (${name}): ${text}`)
          await axios.post(
            `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
              chat_id: process.env.TELEGRAM_CHAT_ID,
              text: `📱 <a href="https://wa.me/+${phone}">${phone}</a>\n👤 ${name}\n\n📝 ${escapeHtml(text)}`,
              parse_mode: 'HTML'
            }
          )
          console.log('✅ Sent text status to Telegram')
          continue
        }

        if (!type) {
          console.log('⚠️ Unsupported status type, skipping.')
          continue
        }

        console.log(`\n📥 New ${type.toUpperCase()} status from ${phone} (${name})`)
        console.log('⬇️ Downloading media...')
        const buffer = await downloadMediaMessage(
          msg, 'buffer',
          { logger: P({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
        )
        console.log(`✅ Downloaded ${buffer.length} bytes`)

        let caption = `📱 <a href="https://wa.me/+${phone}">${phone}</a>\n👤 ${name}`
        if (text) caption += `\n\n📝 ${escapeHtml(text)}`

        const form = new FormData()
        form.append('chat_id', process.env.TELEGRAM_CHAT_ID)
        form.append('caption', caption)
        form.append('parse_mode', 'HTML')
        const ext = type === 'photo'  ? 'jpg'
                  : type === 'video'  ? 'mp4'
                  : type === 'audio'  ? 'ogg'
                  :                    'dat'
        form.append(type, buffer, { filename: `status.${ext}` })

        console.log('⬆️ Uploading to Telegram...')
        const method = `send${type.charAt(0).toUpperCase() + type.slice(1)}`
        const res = await axios.post(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`,
          form,
          { headers: form.getHeaders() }
        )
        if (res.data.ok) console.log(`✅ Forwarded via ${method}`)
        else             console.error('❌ Telegram API error:', res.data)

        await delay(1000)
      } catch (e) {
        console.error('🚨 Error processing status message:', e)
      }
    }
  })

  // 7️⃣ Block the event loop so the script never exits
  await new Promise(() => {})
})().catch(err => {
  console.error('🚨 Fatal error:', err)
  process.exit(1)
})

// Escape HTML special characters in user text
function escapeHtml(str) {
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
}
