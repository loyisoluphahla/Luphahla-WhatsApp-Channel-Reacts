const express = require('express');
const cors = require('cors');
const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');

const app = express();
app.use(cors());
app.use(express.json());

console.log('📦 Dependencies loaded successfully');

let sock;

// ─── Connect to WhatsApp ──────────────────────────────────────────────
async function connectToWhatsApp() {
    try {
        console.log('🔄 Connecting to WhatsApp...');
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        sock = makeWASocket({
            auth: state,
            printQRInTerminal: true,
            browser: ['ReactionBot', 'Chrome', '1.0.0']
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                console.log('✅ WhatsApp bot is ready!');
            } else if (connection === 'close') {
                console.log('❌ Connection closed. Reconnecting...');
                connectToWhatsApp();
            }
        });

        console.log('✅ Connection handler set up');
    } catch (error) {
        console.error('❌ Failed to connect to WhatsApp:', error.message);
        console.error(error.stack);
        // Don't crash the server – keep it running
    }
}

// ─── Start the server FIRST, then connect ──────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    // Connect to WhatsApp after server is running
    connectToWhatsApp();
});

// ─── API: React to a channel message ──────────────────────────────
app.post('/react', async (req, res) => {
    const { link, emoji = '❤️' } = req.body;

    if (!link) {
        return res.status(400).json({ error: 'Link is required' });
    }

    // Check if WhatsApp is connected
    if (!sock) {
        return res.status(503).json({ error: 'WhatsApp not connected yet. Try again in a moment.' });
    }

    try {
        // Parse the link
        const url = new URL(link);
        const pathParts = url.pathname.split('/').filter(Boolean);

        let channelId = null;
        let messageId = null;

        const channelIndex = pathParts.indexOf('channel');
        if (channelIndex !== -1 && pathParts.length > channelIndex + 1) {
            channelId = pathParts[channelIndex + 1];
        }

        const postIndex = pathParts.indexOf('post');
        if (postIndex !== -1 && pathParts.length > postIndex + 1) {
            messageId = pathParts[postIndex + 1];
        } else if (pathParts.length > 0) {
            messageId = pathParts[pathParts.length - 1];
        }

        if (!channelId || !messageId) {
            return res.status(400).json({ error: 'Could not extract channel and message IDs from the link' });
        }

        console.log(`📨 Reacting to ${messageId} in ${channelId} with ${emoji}`);

        await sock.newsletterReactMessage({
            newsletterId: channelId,
            messageId: messageId,
            reaction: emoji
        });

        res.json({
            success: true,
            emoji: emoji,
            channelId,
            messageId
        });

    } catch (error) {
        console.error('❌ Error sending reaction:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─── Health check ────────────────────────────────────────────────────
app.get('/', (req, res) => {
    res.send('WhatsApp Reaction Bot is running!');
});

console.log('✅ Server code loaded successfully');
