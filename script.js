import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, update, onValue, push, get, child } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- CONFIGURATION FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyCyag9xRPwQ_abIWO7Ng-paqdUg5sIjqHk",
  authDomain: "train-manager-83516.firebaseapp.com",
  databaseURL: "https://train-manager-83516-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "train-manager-83516",
  storageBucket: "train-manager-83516.firebasestorage.app",
  messagingSenderId: "877276977784",
  appId: "1:877276977784:web:839e7f2f234139a3692b8d"
};

// --- CONFIGURATION DISCORD ---
const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1464903308761235693/N6jEKVsxfjV7w5Pz8oswq9lNnsd6wlT2ELD0oBoNGquoVSaBte4yMQpEXwD8K_S0fPtU";

// Initialisation
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth();

// --- CONFIG APP ---
const MAX_HISTORY_DISPLAY = 5;
const RANK_POWER = { 'R5': 5, 'R4': 4, 'R3': 3, 'R2': 2, 'R1': 1, 'ABS': 0 };

// --- DATA ---
let members = [];
let rewards = [];
let logs = [];

// --- STATE UI ---
let activeRanks = new Set(['R1', 'R2', 'R3', 'R4', 'R5', 'ABS']);
let isReverseOrder = false;
let activeTypes = new Set(['VIP', 'TRAIN']);

// --- DEMARRAGE ---
document.addEventListener('DOMContentLoaded', () => {
    const dateInput = document.getElementById('dateInput');
    if(dateInput) dateInput.valueAsDate = new Date();
    
    setupEventListeners();

    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log("Connecté (UID):", user.uid);
            startDatabaseListener();
            setTimeout(checkAndRunAutoBackup, 3000);
        } else {
            signInAnonymously(auth).catch((error) => {
                console.error("Erreur connexion:", error);
                alert("Impossible de se connecter à la base de données.");
            });
        }
    });
});

// Fonction d'écoute (CORRIGÉE : LISTENERS SÉPARÉS)
function startDatabaseListener() {
    // 1. Membres
    onValue(ref(db, 'members'), (snapshot) => {
        const val = snapshot.val();
        members = val ? Object.values(val) : [];
        renderAll();
    });

    // 2. Rewards (App 1) - ISOLÉ
    // On écoute uniquement le sous-dossier rewards pour éviter qu'un log n'écrase les données locales
    onValue(ref(db, 'app1/rewards'), (snapshot) => {
        const val = snapshot.val();
        rewards = val ? Object.values(val) : [];
        renderAll();
    });

    // 3. Logs (App 1) - ISOLÉ
    onValue(ref(db, 'app1/logs'), (snapshot) => {
        const val = snapshot.val();
        logs = val ? Object.values(val) : [];
        // On ne re-render pas tout ici pour éviter les glitchs visuels inutiles
    });

    // 4. Backups
    onValue(ref(db, 'app1/backups'), (snapshot) => {
        if(window.renderBackups) window.renderBackups(snapshot);
    });
}

function setupEventListeners() {
    const searchInput = document.getElementById('memberInput');
    if(searchInput) {
        searchInput.addEventListener('input', showSuggestions);
        searchInput.addEventListener('blur', () => setTimeout(() => {
            const suggestionBox = document.getElementById('suggestions');
            if(suggestionBox) suggestionBox.style.display = 'none';
        }, 200));
    }
}

// --- SAUVEGARDE ---
function saveData() {
    if (!auth.currentUser) { alert("Attendez la connexion !"); return; }
    
    const updates = {};
    updates['/members'] = members;
    updates['/app1/rewards'] = rewards; 
    
    // On ne touche PAS aux logs ici.
    
    update(ref(db), updates).catch(err => console.error("Erreur save:", err));
}

// LOGGING
function addLog(msg) {
    const logRef = push(ref(db, 'app1/logs'));
    set(logRef, `[${new Date().toLocaleString()}] ${msg}`);
}

// ============================================================
// ACTIONS
// ============================================================

window.addReward = function() {
    try {
        const nameInput = document.getElementById('memberInput');
        const dateInput = document.getElementById('dateInput');
        const typeInput = document.getElementById('typeInput');

        if(!nameInput || !dateInput) return;

        const name = nameInput.value.trim();
        const date = dateInput.value;
        const type = typeInput.value;
        
        if (!name) { alert("Veuillez entrer un nom."); return; }

        // Recherche insensible à la casse
        const exists = members.find(m => m.name.toLowerCase() === name.toLowerCase());
        
        if (!exists) { 
            alert("Membre inconnu !"); 
            return; 
        }

        const newReward = { id: Date.now(), member: exists.name, date: date, type: type };
        
        // Initialisation si vide
        if (!Array.isArray(rewards)) rewards = [];
        rewards.unshift(newReward);
        
        // Ordre important : Log, puis Save. 
        // Avec les listeners séparés, le log ne cassera plus la variable rewards.
        addLog(`AJOUT: ${exists.name} | ${type}`);
        saveData();
        
        renderMainList();
        nameInput.value = '';

    } catch (error) {
        console.error("Erreur:", error);
        alert("Erreur : " + error.message);
    }
}

window.addMember = function() {
    const name = document.getElementById('newMemberName').value.trim();
    const rank = document.getElementById('newMemberRank').value;

    if(name && !members.some(m => m.name.toLowerCase() === name.toLowerCase())) {
        members.push({ name: name, rank: rank, customId: 0 });
        addLog(`ADMIN: Création ${name} (${rank})`);
        saveData();
        document.getElementById('newMemberName').value = '';
    } else { alert("Nom invalide ou existant"); }
}

window.deleteMember = function(name) {
    event.stopPropagation();
    if(confirm(`Supprimer ${name} ?`)) {
        members = members.filter(m => m.name !== name);
        addLog(`ADMIN: Suppression ${name}`);
        saveData();
    }
}

window.openMemberEditModal = function(name) {
    const m = members.find(x => x.name === name);
    if(!m) return;
    document.getElementById('editMemberNameOriginal').value = m.name;
    document.getElementById('editMemberName').value = m.name;
    document.getElementById('editMemberRank').value = m.rank;
    document.getElementById('memberEditModal').style.display = 'flex';
}

window.confirmMemberEdit = function() {
    const name = document.getElementById('editMemberNameOriginal').value;
    const newRank = document.getElementById('editMemberRank').value;
    const m = members.find(x => x.name === name);
    if(m) {
        m.rank = newRank;
        addLog(`ADMIN: ${name} Rang -> ${newRank}`);
        saveData();
        window.closeModal('memberEditModal');
    }
}

window.openEditModal = function(id) {
    const r = rewards.find(x => x.id === id);
    if(!r) return;
    document.getElementById('editId').value = r.id;
    document.getElementById('editPlayerName').innerText = r.member;
    document.getElementById('editDate').value = r.date;
    document.getElementById('editType').value = r.type;
    document.getElementById('editModal').style.display = 'flex';
}

window.closeModal = function(modalId) { document.getElementById(modalId).style.display = 'none'; }

window.confirmEdit = function() {
    const id = parseInt(document.getElementById('editId').value);
    const index = rewards.findIndex(r => r.id === id);
    if(index !== -1) {
        rewards[index].date = document.getElementById('editDate').value;
        rewards[index].type = document.getElementById('editType').value;
        saveData(); window.closeModal('editModal');
    }
}

window.confirmDelete = function() {
    const id = parseInt(document.getElementById('editId').value);
    if(confirm("Supprimer ?")) {
        rewards = rewards.filter(x => x.id !== id);
        saveData(); window.closeModal('editModal');
    }
}

// ==========================================
// BACKUPS
// ==========================================

async function checkAndRunAutoBackup() {
    const systemRef = ref(db, 'app1/system/lastBackupDate');
    get(systemRef).then(async (snapshot) => {
        const lastDate = snapshot.val();
        const today = new Date().toISOString().split('T')[0];
        if (lastDate !== today) {
            console.log("Backup Auto App 1...");
            await sendBackupToDiscord(); 
            set(systemRef, today);
        }
    }).catch(err => console.error(err));
}

async function sendBackupToDiscord(customMessage = null, customFilename = null) {
    const backupData = {
        type: customMessage ? "Manuel" : "Automatique",
        date: new Date().toLocaleString(),
        members: members,
        rewards: rewards,
        logs: logs
    };
    const jsonString = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const fileName = customFilename || `backup_app1_${new Date().toISOString().split('T')[0]}.json`;
    const formData = new FormData();
    formData.append('file', blob, fileName);
    formData.append('payload_json', JSON.stringify({ content: `💾 **Backup App 1**` }));
    try { await fetch(DISCORD_WEBHOOK_URL, { method: 'POST', body: formData }); } catch (error) {}
}

window.createBackup = function() {
    const status = document.getElementById('backupStatus');
    status.innerText = "Sauvegarde...";
    const now = new Date();
    const backupName = `backup_${now.toISOString().replace(/[:.]/g,'-')}`;
    const fullBackup = { members, rewards, logs, savedAt: new Date().toLocaleString() };

    set(ref(db, `app1/backups/${backupName}`), fullBackup)
    .then(async () => {
        status.innerText = "Envoi Discord...";
        addLog(`BACKUP: Snapshot ${backupName}`);
        await sendBackupToDiscord(null, `${backupName}.json`);
        status.innerText = "✅ Succès";
    })
    .catch((err) => { status.innerText = "❌ Erreur"; });
}

window.handleFileRestore = function(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.members && !data.rewards) { alert("Fichier invalide."); return; }
            if (confirm(`Restaurer les données App 1 depuis ${file.name} ?`)) {
                members = data.members ? Object.values(data.members) : [];
                rewards = data.rewards ? Object.values(data.rewards) : [];
                addLog(`RESTORE: Fichier ${file.name}`);
                const updates = {};
                updates['/members'] = members;
                updates['/app1/rewards'] = rewards;
                update(ref(db), updates).then(() => { alert("Restauration terminée !"); input.value = ''; });
            }
        } catch (err) { alert("Erreur fichier : " + err); }
    };
    reader.readAsText(file);
}

window.restoreBackupPrompt = function() {
    const backupName = prompt("Nom du snapshot :");
    if (backupName) {
        get(child(ref(db), `app1/backups/${backupName}`)).then((snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                members = data.members ? Object.values(data.members) : [];
                rewards = data.rewards ? Object.values(data.rewards) : [];
                const updates = {};
                updates['/members'] = members;
                updates['/app1/rewards'] = rewards;
                update(ref(db), updates).then(() => alert("Restauration terminée."));
            } else alert("Introuvable.");
        });
    }
}

window.renderBackups = function(snapshot) {
    const container = document.getElementById('backupList');
    if(!container) return;
    const backups = snapshot.val();
    container.innerHTML = '';
    if (!backups) { container.innerHTML = '<span style="color:#666">Aucune sauvegarde trouvée.</span>'; return; }
    Object.entries(backups).sort((a, b) => b[0].localeCompare(a[0])).forEach(([key, val]) => {
        const count = val.members ? (Array.isArray(val.members) ? val.members.length : Object.keys(val.members).length) : 0;
        container.innerHTML += `<div style="display:flex; justify-content:space-between; border-bottom:1px solid #333; padding:4px 0;"><span style="color:#00bcd4">${val.savedAt || key}</span><span style="color:#666">${count} mbrs</span><button onclick="copyBackupData('${key}')" style="background:none; border:none; cursor:pointer; font-size:1.2em;" title="Copier">📋</button></div>`;
    });
}

window.copyBackupData = function(text) { navigator.clipboard.writeText(text); alert("Copié"); }
window.downloadLogs = function() {
    const blob = new Blob([logs.map(l=>l).join('\n')], { type: 'text/plain' });
    const a = document.createElement('a'); a.href = window.URL.createObjectURL(blob); a.download = `Logs_${new Date().toISOString().slice(0,10)}.txt`; a.click();
}

// UI HELPERS & RENDU
window.switchTab = function(t){ 
    document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active')); 
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.getElementById(t).classList.add('active'); 
    if(t==='tab-rewards') document.querySelectorAll('.tab-btn')[0].classList.add('active');
    if(t==='tab-members') document.querySelectorAll('.tab-btn')[1].classList.add('active');
}
window.toggleRankFilter = function(r) { 
    const btn = document.querySelector(`.rank-btn[data-rank="${r}"]`);
    if (activeRanks.has(r)) { 
        activeRanks.delete(r); 
        if(btn) btn.classList.remove('active'); 
    } else { 
        activeRanks.add(r); 
        if(btn) btn.classList.add('active'); 
    }
    renderMainList(); 
}

window.resetRankFilters = function() { 
    ['R5','R4','R3','R2','R1','ABS'].forEach(r => activeRanks.add(r)); 
    document.querySelectorAll('.rank-btn[data-rank]').forEach(b => b.classList.add('active')); 
    renderMainList(); 
}

window.toggleTypeFilter = function(t) { 
    const btn = document.querySelector(`.type-btn[data-type="${t}"]`);
    if (activeTypes.has(t)) { 
        activeTypes.delete(t); 
        if(btn) btn.classList.remove('active'); 
    } else { 
        activeTypes.add(t); 
        if(btn) btn.classList.add('active'); 
    }
    renderMainList(); 
}

window.resetTypeFilters = function() { 
    ['VIP', 'TRAIN'].forEach(t => activeTypes.add(t)); 
    document.querySelectorAll('.type-btn').forEach(b => b.classList.add('active'));
    renderMainList(); 
}
window.toggleSortOrder = function(){ isReverseOrder = !isReverseOrder; renderMainList(); }

window.openImportModal = function(){ document.getElementById('importTextarea').value = ''; document.getElementById('importModal').style.display = 'flex'; }
window.processImport = function() {
    const rawText = document.getElementById('importTextarea').value;
    const startRankSelect = document.getElementById('importStartRank');
    const startRank = startRankSelect ? startRankSelect.value : 'R5'; 
    
    if(!rawText) return;

    // Ordre de descente incluant ABS
    const rankOrder = ['R5', 'R4', 'R3', 'R2', 'R1', 'ABS']; 
    let currentRankIndex = rankOrder.indexOf(startRank);

    const blocks = rawText.replace(/\r\n/g, '\n').split(/\n\s*\n/);

    let addedCount = 0;
    let skippedCount = 0;

    blocks.forEach(block => {
        if (currentRankIndex >= rankOrder.length) return;
        const currentRank = rankOrder[currentRankIndex];
        const lines = block.split('\n');
        
        lines.forEach(line => {
            const name = line.trim();
            if (name) {
                if (!members.some(m => m.name.toLowerCase() === name.toLowerCase())) {
                    members.push({ name: name, rank: currentRank, customId: 0 });
                    addedCount++;
                } else {
                    skippedCount++;
                }
            }
        });
        currentRankIndex++; 
    });

    if (addedCount > 0) {
        addLog(`IMPORT CASCADE: ${addedCount} ajoutés (Départ ${startRank}).`);
        saveData(); 
        alert(`Succès !\n${addedCount} membres ajoutés.\n${skippedCount} ignorés (déjà existants).`);
        window.closeModal('importModal');
    } else {
        alert("Aucun nouveau membre détecté.");
    }
}

function showSuggestions() {
    const input = document.getElementById('memberInput');
    const box = document.getElementById('suggestions');
    const val = input.value.toLowerCase();
    box.innerHTML = '';
    if (!val) { box.style.display = 'none'; return; }
    const matches = members.filter(m => m.name.toLowerCase().includes(val));
    if (matches.length > 0) {
        matches.forEach(m => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.innerHTML = `<span style="color:#aaa; font-size:0.8em; margin-right:5px">[${m.rank}]</span> ${m.name}`;
            div.onclick = () => { input.value = m.name; box.style.display = 'none'; };
            box.appendChild(div);
        });
        box.style.display = 'block';
    } else { box.style.display = 'none'; }
}
window.selectMemberFromList = function(name) { document.getElementById('memberInput').value = name; window.scrollTo({ top: 0, behavior: 'smooth' }); }

function renderAll() { renderMainList(); renderManageMembers(); }

window.renderMainList = function() {
    const container = document.getElementById('membersListContainer');
    container.innerHTML = '';
    const statusFilter = document.getElementById('statusFilter').value;
    const sortMode = document.getElementById('sortFilter').value;

    let filtered = members.filter(m => {
        if (!activeRanks.has(m.rank)) return false;
        const memberHistory = rewards.filter(r => r.member === m.name);
        const relevantHistory = memberHistory.filter(h => activeTypes.has(h.type));
        
        // --- NOUVEAU : On cache les ABS s'ils n'ont aucun historique ---
        if (m.rank === 'ABS' && relevantHistory.length === 0) return false;

        if (statusFilter === 'NEVER' && relevantHistory.length > 0) return false;
        if (statusFilter === 'RECEIVED' && relevantHistory.length === 0) return false;
        return true;
    });

    filtered.sort((a, b) => {
        let res = 0;
        if (sortMode === 'RANK') {
            const diff = RANK_POWER[b.rank] - RANK_POWER[a.rank];
            res = diff !== 0 ? diff : a.name.localeCompare(b.name);
        } else {
            const dateA = getLatestRewardDate(a.name);
            const dateB = getLatestRewardDate(b.name);
            res = dateB - dateA;
        }
        return isReverseOrder ? -res : res;
    });

    if(filtered.length === 0) { container.innerHTML = '<div style="text-align:center; padding:30px; opacity:0.5">Aucun résultat.</div>'; return; }

    let lastRank = null;
    filtered.forEach(m => {
        if (sortMode === 'RANK' && m.rank !== lastRank) {
            const count = filtered.filter(f => f.rank === m.rank).length;
            container.innerHTML += `<div class="rank-separator">${m.rank} <span style="font-size:0.8em; margin-left:8px; opacity:0.6">(${count})</span></div>`;
            lastRank = m.rank;
        }
        const memberHistory = rewards
            .filter(r => r.member === m.name && activeTypes.has(r.type))
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, MAX_HISTORY_DISPLAY);
        
        let historyHTML = '';
        memberHistory.forEach(h => {
            const bgClass = h.type === 'VIP' ? 'bg-vip' : 'bg-train';
            historyHTML += `<div class="history-badge ${bgClass}" onclick="openEditModal(${h.id}); event.stopPropagation();"><strong>${h.type}</strong><span class="date">${formatDate(h.date)}</span></div>`;
        });
        if(memberHistory.length === 0) historyHTML = '<span style="font-size:0.8em; opacity:0.3; align-self:center;">-</span>';

        container.innerHTML += `
            <div class="member-row">
                <div class="member-identity" onclick="selectMemberFromList('${m.name}')">
                    <span class="rank-badge">${m.rank}</span>
                    <span class="name-text">${m.name}</span>
                </div>
                <div class="reward-history">${historyHTML}</div>
            </div>`;
    });
}

function renderManageMembers() {
    const container = document.getElementById('manageMembersGrid');
    container.innerHTML = '';
    const ranksOrder = ['R5', 'R4', 'R3', 'R2', 'R1', 'ABS']; // Ajout de ABS ici
    
    ranksOrder.forEach(rank => {
        const rankMembers = members.filter(m => m.rank === rank).sort((a, b) => a.name.localeCompare(b.name));
        if (rankMembers.length > 0) {
            container.innerHTML += `<div class="rank-separator">${rank} <span style="font-size:0.8em; margin-left:8px; opacity:0.6">(${rankMembers.length})</span></div>`;
            let gridHTML = '<div class="rank-group-grid">';
            rankMembers.forEach(m => {
                gridHTML += `<div class="member-chip" onclick="openMemberEditModal('${m.name}')"><div><span style="color:var(--accent); font-weight:bold;">[${m.rank}]</span> ${m.name}</div><button class="btn-delete" style="padding:4px 8px; margin:0;" onclick="deleteMember('${m.name}')">X</button></div>`;
            });
            gridHTML += '</div>'; container.innerHTML += gridHTML;
        }
    });
}

function getLatestRewardDate(memberName) {
    const memberRewards = rewards.filter(r => r.member === memberName && activeTypes.has(r.type));
    if (memberRewards.length === 0) return 0;
    memberRewards.sort((a, b) => new Date(b.date) - new Date(a.date));
    return new Date(memberRewards[0].date).getTime();
}
function formatDate(d) { return d ? d.split('-').reverse().slice(0,2).join('/') : ''; }



// ============================================================
// EXPORT LISTE VERS DISCORD
// ============================================================

window.exportMembersToDiscord = async function() {
    if (!auth.currentUser) return;
    
    // On garde l'ordre R5 -> ABS
    const ranksOrder = ['R5', 'R4', 'R3', 'R2', 'R1', 'ABS'];
    let exportText = "";

    ranksOrder.forEach(rank => {
        const rankMembers = members.filter(m => m.rank === rank).sort((a, b) => a.name.localeCompare(b.name));
        if (rankMembers.length > 0) {
            rankMembers.forEach(m => {
                exportText += m.name + "\n";
            });
            // Ligne vide pour créer un "bloc" compatible avec l'import en cascade
            exportText += "\n"; 
        }
    });

    // Création du fichier texte
    const blob = new Blob([exportText.trim()], { type: 'text/plain' });
    const formData = new FormData();
    formData.append('file', blob, `Liste_Joueurs_${new Date().toISOString().split('T')[0]}.txt`);
    
    // Message accompagnant le fichier
    formData.append('payload_json', JSON.stringify({ 
        content: `📜 **Export de la liste des membres (App 1)**\n*Le fichier est au format "cascade" (prêt à être copié/collé dans la modale d'import).*` 
    }));

    try { 
        await fetch(DISCORD_WEBHOOK_URL, { method: 'POST', body: formData }); 
        alert("Liste envoyée sur Discord avec succès !");
    } catch(e) {
        alert("Erreur lors de l'envoi sur Discord.");
        console.error(e);
    }
}