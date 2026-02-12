const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const qrcode = require('qrcode');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const logger = require('../utils/logger'); // Assumindo que existe logger

let socket;
let isConnected = false;
let isConnecting = false;
let connectPromise = null;
let qrCode = null;
let qrDataURL = null;
let reconnectAttempts = 0;
let reconnectTimer = null;

class WhatsAppManager {
  constructor() {
    if (WhatsAppManager.instance) {
      return WhatsAppManager.instance;
    }
    WhatsAppManager.instance = this;
    this.authDir = path.join(app.getPath('userData'), 'baileys_auth_info');
    
    // Ensure auth directory exists
    if (!fs.existsSync(this.authDir)) {
      fs.mkdirSync(this.authDir, { recursive: true });
    }
  }

  async connect({ force = false } = {}) {
    // MOCK MODE: Bypass Real Connection
    if (process.env.MOCK_WHATSAPP === 'true') {
      logger.info('🔌 MOCK_WHATSAPP: Simulating connection...');
      isConnected = true;
      isConnecting = false;
      reconnectAttempts = 0;
      qrCode = null;
      qrDataURL = null;
      return true;
    }

    if (isConnected && !force) return true;
    if (isConnecting && connectPromise && !force) return connectPromise;

    isConnecting = true;

    connectPromise = (async () => {
      try {
      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
      const { version } = await fetchLatestBaileysVersion();

      // Clear any prior reconnect timer
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      // If a socket already exists, close it first to avoid conflicts
      try {
        if (socket) {
          socket.end(undefined);
          socket = null;
        }
      } catch {
        // ignore
      }

      socket = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        // Windows desktop identity (avoid macOS label)
        browser: Browsers.windows('Bonificações WhatsApp'),
        logger: pino({ level: 'silent' })
      });

      socket.ev.on('creds.update', saveCreds);

      socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          qrCode = qr;
          try {
            qrDataURL = await qrcode.toDataURL(qr);
          } catch {
            qrDataURL = null;
          }
          logger.info('QR Code generated');
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error)?.output?.statusCode;
          const isLoggedOut = statusCode === DisconnectReason.loggedOut;
          const isConflict = statusCode === 440; // observed in logs: Stream Errored (conflict)

          isConnected = false;
          isConnecting = false;
          qrCode = null;
          qrDataURL = null;

          // Do not auto-reconnect if logged out; user must scan QR again
          if (isLoggedOut) {
            logger.warn('WhatsApp connection closed: logged out. Waiting for manual connect.');
            reconnectAttempts = 0;
            return;
          }

          // Conflict indicates another session is active; do a slower backoff
          const baseDelay = isConflict ? 15000 : 3000;
          reconnectAttempts = Math.min(reconnectAttempts + 1, 10);
          const delay = Math.min(baseDelay * Math.pow(2, reconnectAttempts - 1), 120000);
          const jitter = Math.floor(Math.random() * 1500);

          logger.warn('WhatsApp connection closed', {
            statusCode,
            reconnectAttempts,
            reconnectInMs: delay + jitter,
          });

          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => {
            this.connect().catch((err) => {
              logger.error('Reconnect failed', { message: err?.message, stack: err?.stack });
            });
          }, delay + jitter);

        } else if (connection === 'open') {
          logger.info('Opened connection');
          isConnected = true;
          isConnecting = false;
          reconnectAttempts = 0;
          qrCode = null;
          qrDataURL = null;
        }
      });

      return true;
    } catch (error) {
      logger.error('Failed to connect to WhatsApp', { message: error?.message, stack: error?.stack });
      throw error;
    } finally {
      isConnecting = false;
    }
    })();

    return connectPromise;
  }

  async logout() {
    // MOCK MODE: Bypass Real Logout
    if (process.env.MOCK_WHATSAPP === 'true') {
      logger.info('🔌 MOCK_WHATSAPP: Simulating logout...');
      isConnected = false;
      isConnecting = false;
      reconnectAttempts = 0;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      return true;
    }

    try {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      if (socket) {
        await socket.logout();
        socket.end(undefined);
        socket = null;
      }

      isConnected = false;
      isConnecting = false;
      reconnectAttempts = 0;
      qrCode = null;
      qrDataURL = null;

      return true;
    } catch (error) {
      logger.error('Error logging out', { message: error?.message, stack: error?.stack });
      throw error;
    }
  }

  getStatus() {
    return {
      isConnected,
      isConnecting,
      qrCode,
      qrDataURL,
      reconnectAttempts
    };
  }

  getQr() {
    return {
      qrCode,
      qrDataURL
    };
  }

  toJid(to) {
    if (!to) return '';
    if (String(to).includes('@s.whatsapp.net')) return String(to);

    // Normalize to BR format expected by the user (drop mobile 9)
    const { normalizePhoneE164 } = require('../utils/phone');
    const e164 = normalizePhoneE164(to, { defaultCountry: '55', dropBrazilMobileNine: true });
    const digits = (e164 || String(to)).replace(/\D/g, '');
    return digits ? `${digits}@s.whatsapp.net` : '';
  }

  // Processa sintaxe de spintext: {Olá|Oi|E aí}
  processSpintext(text) {
    if (!text) return '';
    return text.replace(/\{([^{}]+)\}/g, (match, content) => {
      const choices = content.split('|');
      return choices[Math.floor(Math.random() * choices.length)];
    });
  }

  async sendText(to, text) {
    if (!isConnected) {
      throw new Error('WhatsApp not connected');
    }

    const processedText = this.processSpintext(text);

    // MOCK MODE
    if (process.env.MOCK_WHATSAPP === 'true') {
      logger.info(`🔌 MOCK_WHATSAPP: Sending TEXT to ${to}: ${processedText}`);
      return { success: true, to };
    }

    const jid = this.toJid(to);
    if (!jid) throw new Error('Invalid recipient phone');

    await socket.sendMessage(jid, { text: processedText });
    return { success: true, to: jid };
  }

  async sendMedia(to, caption, mediaPath, mediaType = 'image') {
    if (!isConnected) {
      throw new Error('WhatsApp not connected');
    }

    const processedCaption = this.processSpintext(caption);

    // MOCK MODE
    if (process.env.MOCK_WHATSAPP === 'true') {
      logger.info(`🔌 MOCK_WHATSAPP: Sending MEDIA to ${to}: ${mediaPath}`);
      return { success: true, to };
    }

    const jid = this.toJid(to);
    if (!jid) throw new Error('Invalid recipient phone');

    // Lê arquivo como buffer sem bloquear o event loop
    const buffer = await fs.promises.readFile(mediaPath);

    let messageContent = {};
    if (mediaType === 'image') {
      messageContent = { image: buffer, caption: processedCaption };
    } else if (mediaType === 'video') {
      messageContent = { video: buffer, caption: processedCaption };
    } else if (mediaType === 'document') {
      // Tenta inferir mimetype ou usa padrão
      messageContent = { document: buffer, caption: processedCaption, mimetype: 'application/pdf', fileName: path.basename(mediaPath) };
    } else {
      throw new Error(`Unsupported media type: ${mediaType}`);
    }

    await socket.sendMessage(jid, messageContent);
    return { success: true, to: jid };
  }

  async startPresenceHint(recipientData, variableData) {
    if (!isConnected || !socket) return false;

    // MOCK MODE
    if (process.env.MOCK_WHATSAPP === 'true') {
      logger.info('🔌 MOCK_WHATSAPP: Presence composing');
      return true;
    }

    try {
      const phone = recipientData?.phone || recipientData?.mobile || recipientData?.whatsapp;
      if (!phone) return false;

      const jid = this.toJid(phone);
      if (!jid) return false;

      await socket.sendPresenceUpdate('composing', jid);
      return true;
    } catch (error) {
      logger.warn('Presence composing failed', { message: error?.message });
      return false;
    }
  }

  async stopPresenceHint(recipientData, variableData) {
    if (!isConnected || !socket) return false;

    // MOCK MODE
    if (process.env.MOCK_WHATSAPP === 'true') {
      logger.info('🔌 MOCK_WHATSAPP: Presence paused');
      return true;
    }

    try {
      const phone = recipientData?.phone || recipientData?.mobile || recipientData?.whatsapp;
      if (!phone) return false;

      const jid = this.toJid(phone);
      if (!jid) return false;

      await socket.sendPresenceUpdate('paused', jid);
      return true;
    } catch (error) {
      logger.warn('Presence paused failed', { message: error?.message });
      return false;
    }
  }
  
  // Interface para o Dispatch Orchestrator
  // recipientData: { phone: '5511999999999' }
  // variableData: { message: 'Olá...', mediaPath: '...', mediaType: '...' }
  async sendDispatch(recipientData, variableData) {
    const phone = recipientData.phone || recipientData.mobile || recipientData.whatsapp;
    
    if (!phone) {
      throw new Error('Recipient phone number missing');
    }

    if (variableData.mediaPath) {
      return this.sendMedia(phone, variableData.message || '', variableData.mediaPath, variableData.mediaType);
    } else {
      return this.sendText(phone, variableData.message || '');
    }
  }
}

module.exports = new WhatsAppManager();
