# WhatsApp Status Archiver Bot

A simple Node.js bot that listens for new WhatsApp Status updates, downloads the media, and forwards it to a Telegram chat. Designed for easy deployment and automated archiving of friends’ status updates.

---

## 📋 Features

- **Auto-download** new WhatsApp Status media (photos & videos)
- **Forward** downloaded media to a Telegram bot/chat
- **Customizable captions** including sender’s name & phone number
- **Persistent sessions** so you don’t need to re-scan QR every restart
- **Lightweight** and easy to configure

---

## 🛠 Prerequisites

- **Node.js** v16 or higher  
- **npm** (comes with Node.js)  
- A **Telegram Bot Token** (from [@BotFather](https://t.me/BotFather))  
- The **Chat ID** or **Channel ID** where you want to forward statuses  
- A WhatsApp-compatible phone number (registered to the session)

---

## 🚀 Installation

1. **Clone the repository**

   ```bash
   https://github.com/IAshinsana/Wa-Status-SPY.git
   cd whatsapp-status-archiver
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Create your `.env` file** in the project root:

   ```bash
   cp .env.example .env
   ```

4. **Edit `.env`** and set the following values:

   ```bash
   # Telegram
   TELEGRAM_BOT_TOKEN=123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ
   TELEGRAM_CHAT_ID=-1001234567890

   # Optional: path to store your WhatsApp session state
   SESSION_FILE_PATH=./whatsapp-session.json
   ```

---

## ⚙️ Configuration Options

| Variable             | Description                                                      | Default                   |
|----------------------|------------------------------------------------------------------|---------------------------|
| `TELEGRAM_BOT_TOKEN` | Your Telegram bot’s API token                                    | **(required)**            |
| `TELEGRAM_CHAT_ID`   | Target Telegram chat or channel ID to forward statuses to        | **(required)**            |
| `SESSION_FILE_PATH`  | File path to save WhatsApp authentication state / session data   | `./whatsapp-session.json` |

---

## 🎬 How to Run

1. **Start the bot**

   ```bash
   npm start
   ```

2. **Scan the QR code**  
   The first time you run, a WhatsApp QR code will appear in your console.  
   – Open WhatsApp on your phone ▶ Settings ▶ Linked Devices ▶ Link a Device ▶ scan the code.

3. **Bot status**  
   You should see in console:
   ```
   ✅ Connected as YourWhatsAppName (your_phone_number)
   🔍 Listening for new WhatsApp Status updates…
   ```

4. **Check Telegram**  
   Any new status will be downloaded and forwarded to your specified chat ID, with caption:
   ```
   @ContactName (contact_number)
   ```

---

## 🔧 Troubleshooting

- **Bot says “Error: session not valid”**  
  • Delete the session file (`SESSION_FILE_PATH`) and restart to re-scan QR.  
- **Statuses aren’t forwarded**  
  • Verify your `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are correct.  
  • Ensure your server has Internet access.  
- **Media download failures**  
  • Check file permissions on `SESSION_FILE_PATH` and working directory.  
  • Make sure there is sufficient disk space.

---

## 🤝 Contributing

1. Fork the repo  
2. Create a feature branch (`git checkout -b feature/YourFeature`)  
3. Commit your changes (`git commit -m 'Add SomeFeature'`)  
4. Push to branch (`git push origin feature/YourFeature`)  
5. Open a Pull Request

---

## 📜 License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
