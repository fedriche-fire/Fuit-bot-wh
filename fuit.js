const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    downloadContentFromMessage, 
    fetchLatestBaileysVersion, 
    jidNormalizedUser,
    proto 
} = require("@whiskeysockets/baileys");
const pino = require('pino');
const fs = require('fs');
const http = require('http');
const path = require('path');
const readline = require("readline");

// --- CONFIGURATION SERVEUR POUR RENDER (Anti-Pause) ---
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end("Fuit-Bot est en ligne !");
}).listen(PORT, () => {
    console.log(`📡 Serveur de maintien activé sur le port ${PORT}`);
});

// Auto-ping toutes les 5 minutes pour éviter que Render ne s'endorme
setInterval(() => {
    http.get(`http://localhost:${PORT}`);
    console.log("⚓ Ping de maintien envoyé...");
}, 300000);

const question = (text) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(text, (answer) => { rl.close(); resolve(answer); }));
};

async function startFuit() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_fuit');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false 
    });

    // Connexion automatique via numéro (Variable d'environnement Render)
    if (!sock.authState.creds.registered) {
        let monNumero = process.env.monNumero || "242057529383"; 
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(monNumero.trim());
                console.log(`\n\n🔑 TON CODE DE CONNEXION : ${code}\n\n`);
            } catch (err) { console.log("Erreur code pairing."); }
        }, 3000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

        const from = msg.key.remoteJid;
        const isMe = msg.key.fromMe;
        const pushName = msg.pushName || "Ami";
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        const cmd = text.toLowerCase().trim();
        const myId = jidNormalizedUser(sock.user.id);

        // Effet "En train d'enregistrer"
        await sock.sendPresenceUpdate('recording', from);

        // --- MENU VERSION LIENS CLIQUABLES (STYLE PRO) ---
        if (cmd === '.menu' || cmd === 'menu') {
            const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            const myNum = "242057529383"; // Ton numéro sans le +
            const videoPath = path.join(__dirname, 'media', 'menu.mp4');
            
            // Création des liens magiques
            const linkAll = `https://wa.me/${myNum}?text=.allmenu`;
            const linkSupport = `https://wa.me/${myNum}?text=.support`;
            const linkLink = `https://wa.me/${myNum}?text=.link`;

            let menuText = `👋 Salut *${pushName}* !\n\n` +
                           `🕒 Heure : ${time}\n` +
                           `⚡ Bot Level : *V5-Hybrid*\n\n` +
                           `"Salut je suis ton assistant.. alors t'as une tâche pour moi ?"\n\n` +
                           `╔═══════════════════╗\n` +
                           `  📑 *COMMANDES RAPIDES*\n` +
                           `╚═══════════════════╝\n\n` +
                           `💠 *TOUTES LES COMMANDES*\n` +
                           `👉 ${linkAll}\n\n` +
                           `💠 *CONTACTER LE SUPPORT*\n` +
                           `👉 ${linkSupport}\n\n` +
                           `💠 *LIENS OFFICIELS*\n` +
                           `👉 ${linkLink}\n\n` +
                           `📢 _Cliquez sur un lien bleu pour lancer la commande automatiquement !_`;

            if (fs.existsSync(videoPath)) {
                await sock.sendMessage(from, { 
                    video: fs.readFileSync(videoPath), 
                    caption: menuText,
                    gifPlayback: true,
                    footer: "© Fedriche - Kelly YT"
                }, { quoted: msg });
            } else {
                await sock.sendMessage(from, { text: menuText }, { quoted: msg });
            }
        }
        // --- LA RÉPONSE AU CLIC SUR ALL MENU ---
        if (cmd === '.allmenu') {
            let listCmd = `╔══════ 📑 *LISTE COMPLETE* ══════╗\n\n` +
                          `🤖 *GENERAL* :\n` +
                          `• .menu (Retour au menu principal)\n` +
                          `• .ping (Vitesse du bot)\n` +
                          `• .link (Sites & Groupes)\n\n` +
                          `👑 *ADMIN / DEV (Toi uniquement)* :\n` +
                          `• .tagall (Mentionner tout le groupe)\n` +
                          `• .ss (Récupérer une vue unique)\n` +
                          `• .b (Infos de profil Business)\n\n` +
                          `🎮 *GAMING* :\n` +
                          `• .diamond (Prix des diamants)\n` +
                          `• .tournoi (Infos tournois Free Fire)\n\n` +
                          `╚══════════════════════════╝\n\n` +
                          `👉 _Tape la commande ou clique sur les liens du menu !_`;

            await sock.sendMessage(from, { text: listCmd }, { quoted: msg });
        }

        // --- 2. FONCTION TAGALL ---
        if (cmd === '.tagall' && isMe) {
            const groupMetadata = from.endsWith('@g.us') ? await sock.groupMetadata(from) : null;
            if (!groupMetadata) return;
            const participants = groupMetadata.participants;
            let response = `╔══════ 📢 *TAG ALL* ══════╗\n║\n`;
            let mentions = [];
            for (let i of participants) {
                response += `║ 👤 @${i.id.split('@')[0]}\n`;
                mentions.push(i.id);
            }
            response += `║\n╚════════════════════╝`;
            await sock.sendMessage(from, { text: response, mentions }, { quoted: msg });
        }

        // --- 3. FONCTION LINK ---
        if (cmd === '.link') {
            const links = `🌐 *PLATEFORMES OFFICIELLES*\n\n` +
                          `🔗 *Lien 1* : [https://youtube.com/@kellybe007?si=XdXYTmzzUYPkRrSI]\n` +
                          `🔗 *Lien 2* : [kellyyt.com]\n` +
                          `🔗 *Lien 3* : [https://kellyyt.com/tournois-free-fire/]\n\n` +
                          `_Cliquez sur les liens pour y accéder_`;
            await sock.sendMessage(from, { text: links }, { quoted: msg });
        }

        // --- 4. SUPPORT ---
        if (cmd === '.support') {
            const url = `https://wa.me/242057529383?text=${encodeURIComponent("hé j'ai essayé ton bot et je veux en savoir plus...")}`;
            await sock.sendMessage(from, { text: `📩 *CONTACT SUPPORT* :\n${url}` }, { quoted: msg });
        }

        // --- 5. ANCIENNE FONCTION PING ---
        if (cmd === '.ping') {
            const start = Date.now();
            await sock.sendMessage(from, { text: `📍 Latence : ${Date.now() - start}ms\n📡 Statut : Online (Render)` }, { quoted: msg });
        }

        // --- 6. ANCIENNE FONCTION .SS (CAPTURE) ---
        if (cmd === '.ss' && isMe) {
            const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
            const target = quoted?.viewOnceMessageV2?.message || quoted?.viewOnceMessage?.message || quoted || msg.message;
            if (target.imageMessage || target.videoMessage) {
                const type = target.imageMessage ? 'image' : 'video';
                const stream = await downloadContentFromMessage(target[type + 'Message'], type);
                let buffer = Buffer.from([]);
                for await(const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                await sock.sendMessage(myId, { [type]: buffer, caption: `📸 *CAPTURE FUIT*` });
                await sock.sendMessage(from, { delete: msg.key });
            }
        }

        // --- 7. ANCIENNE FONCTION .B (BUSINESS SNIPER) ---
        if (cmd === '.b' && isMe) {
            const mention = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || from;
            const ppUrl = await sock.profilePictureUrl(mention, 'image').catch(() => null);
            const biz = await sock.getBusinessProfile(mention).catch(() => null);
            if (ppUrl) await sock.sendMessage(myId, { image: { url: ppUrl }, caption: `👤 Photo de profil` });
            if (biz?.cover_photo) await sock.sendMessage(myId, { image: { url: biz.cover_photo.url }, caption: `🖼️ Photo de couverture` });
            await sock.sendMessage(from, { delete: msg.key });
        }
    });

    sock.ev.on('connection.update', (u) => {
        const { connection } = u;
        if (connection === 'open') console.log("✅ FUIT-BOT HYBRID CONNECTÉ");
        if (connection === 'close') setTimeout(() => startFuit(), 10000);
    });
}

startFuit();
