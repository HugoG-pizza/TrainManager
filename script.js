// --- IMPORT FIREBASE ---
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
const RANK_POWER = { 'R5': 5, 'R4': 4, 'R3': 3, 'R2': 2, 'R1': 1 };

// --- DATA ---
let members = [];
let rewards = [];
let logs = [];

// --- STATE UI ---
let activeRanks = new Set(['R1', 'R2', 'R3', 'R4', 'R5']);
let isReverseOrder = false;
let activeTypes = new Set(['VIP', 'TRAIN']);

// --- DEMARRAGE SECURISE ---
document.addEventListener('DOMContentLoaded', () => {
    
    // Init UI
    const dateInput = document.getElementById('dateInput');
    if(dateInput) dateInput.valueAsDate = new Date();
    setupEventListeners();

    // AUTH & START
    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log("Connecté (UID):", user.uid);
            startDatabaseListener();
            
            // Lancer la vérification de backup auto (petit délai pour laisser le temps de charger)
            setTimeout(checkAndRunAutoBackup, 3000);
        } else {
            console.log("Utilisateur déconnecté, tentative de connexion anonyme...");
            signInAnonymously(auth).catch((error) => {
                console.error("Erreur critique connexion:", error);
                alert("Impossible de se connecter à la base de données.");
            });
        }
    });
});

// Fonction qui démarre l'écoute de la DB
function startDatabaseListener() {
    // 1. Ecoute principale
    onValue(ref(db, '/'), (snapshot) => {
        const data = snapshot.val();
        if (data) {
            members = data.members || [];
            rewards = data.rewards || [];
            logs = data.logs || [];
        } else {
            members = []; rewards = []; logs = [];
        }
        renderAll();
    }, (error) => console.error("Erreur lecture DB:", error));

    // 2. Ecoute des Backups (pour la liste Admin)
    onValue(ref(db, 'backups'), (snapshot) => {
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

// --- SAUVEGARDE (CLOUD) ---
function saveData() {
    if (!auth.currentUser) { alert("Attendez la connexion !"); return; }
    // Utiliser update ou set ciblé pour éviter d'écraser backups/system si jamais on touche à la racine
    const updates = {};
    updates['/members'] = members;
    updates['/rewards'] = rewards;
    updates['/logs'] = logs;
    update(ref(db), updates).catch(err => console.error("Erreur save:", err));
}

// ==========================================
// SYSTÈME DE BACKUP (DISCORD + SNAPSHOTS + FICHIER)
// ==========================================

// 1. BACKUP AUTO DISCORD (QUOTIDIEN)
async function checkAndRunAutoBackup() {
    const systemRef = ref(db, 'system/lastBackupDate');
    
    get(systemRef).then(async (snapshot) => {
        const lastDate = snapshot.val();
        const today = new Date().toISOString().split('T')[0];

        if (lastDate !== today) {
            console.log("📅 Premier lancement du jour : Backup Discord en cours...");
            await sendBackupToDiscord(); // Envoi sans paramètre = Auto
            set(systemRef, today);
        } else {
            console.log("✅ Backup Discord déjà fait aujourd'hui.");
        }
    }).catch(err => console.error("Erreur vérif backup:", err));
}

async function sendBackupToDiscord(customMessage = null, customFilename = null) {
    const statusLabel = customMessage ? "Manuel" : "Automatique";
    
    const backupData = {
        type: statusLabel,
        date: new Date().toLocaleString(),
        members: members,
        rewards: rewards,
        logs: logs
    };

    const jsonString = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const fileName = customFilename || `backup_${new Date().toISOString().split('T')[0]}.json`;

    const formData = new FormData();
    formData.append('file', blob, fileName);
    const messageContent = customMessage || `💾 **Sauvegarde Automatique** du ${new Date().toLocaleDateString()}\nStatut: ${members.length} membres, ${rewards.length} récompenses.`;
    formData.append('payload_json', JSON.stringify({ content: messageContent }));

    try {
        const response = await fetch(DISCORD_WEBHOOK_URL, { method: 'POST', body: formData });
        if (response.ok) {
            console.log("🚀 Backup envoyé sur Discord !");
            return true;
        } else {
            console.error("Erreur Discord:", response.statusText);
            return false;
        }
    } catch (error) {
        console.error("Erreur réseau Backup:", error);
        return false;
    }
}

// 2. SNAPSHOTS MANUELS
window.createBackup = function() {
    const status = document.getElementById('backupStatus');
    status.innerText = "Sauvegarde Firebase...";
    status.style.color = "#ff9800";
    
    const now = new Date();
    const timestamp = now.toISOString().replace(/\..+/, '').replace(/:/g, '-');
    const backupName = `snapshot_${timestamp}`;

    const fullBackup = {
        members: members,
        rewards: rewards,
        logs: logs,
        savedAt: new Date().toLocaleString()
    };

    set(ref(db, 'backups/' + backupName), fullBackup)
    .then(async () => {
        status.innerText = "Envoi Discord...";
        const logRef = push(ref(db, 'logs'));
        set(logRef, `[${now.toLocaleString()}] BACKUP: Snapshot ${backupName} créé`);

        const discordSuccess = await sendBackupToDiscord(
            `📸 **Snapshot Manuel** créé par un Admin.\nNom : \`${backupName}\``,
            `${backupName}.json`
        );

        if (discordSuccess) {
            status.innerText = "✅ Tout est sauvegardé !";
            status.style.color = "#4caf50";
        } else {
            status.innerText = "⚠️ Firebase OK mais Erreur Discord.";
            status.style.color = "#ff9800";
        }
    })
    .catch((err) => { 
        status.innerText = "❌ Erreur : " + err.message; 
        status.style.color = "#f44336";
    });
}

// 3. RESTAURATION DEPUIS FICHIER JSON (NOUVEAU)
window.handleFileRestore = function(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            
            // Vérification basique de structure
            if (!data.members && !data.rewards) {
                alert("Ce fichier ne semble pas être une sauvegarde valide.");
                return;
            }

            const confirmMsg = `ATTENTION : Vous allez écraser TOUTES les données actuelles avec ce fichier.\n\n` +
                               `Date sauvegarde : ${data.date || 'Inconnue'}\n` +
                               `Membres : ${data.members ? data.members.length : 0}\n` +
                               `Récompenses : ${data.rewards ? data.rewards.length : 0}\n\n` +
                               `Êtes-vous sûr de vouloir continuer ?`;

            if (confirm(confirmMsg)) {
                // On met à jour les données locales
                members = data.members || [];
                rewards = data.rewards || [];
                logs = data.logs || [];
                
                // On ajoute un log de restauration
                logs.push(`[${new Date().toLocaleString()}] RESTORE: Restauration depuis fichier ${file.name}`);

                // On envoie tout ça à la racine (via update pour ne pas casser system/backups)
                const updates = {};
                updates['/members'] = members;
                updates['/rewards'] = rewards;
                updates['/logs'] = logs;

                update(ref(db), updates)
                .then(() => {
                    alert("Restauration terminée avec succès !");
                    // Reset de l'input pour pouvoir réimporter le même fichier si besoin
                    input.value = ''; 
                })
                .catch(err => alert("Erreur lors de la restauration : " + err.message));
            }
        } catch (err) {
            alert("Erreur de lecture du fichier JSON : " + err);
        }
    };
    reader.readAsText(file);
}

// 4. RESTAURATION SNAPSHOT INTERNE
window.restoreBackupPrompt = function() {
    const backupName = prompt("DANGER : Ceci va écraser TOUTES les données par une ancienne version interne.\nCollez le nom du backup (ex: snapshot_2026...):");
    
    if (backupName) {
        get(child(ref(db), `backups/${backupName}`)).then((snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                members = data.members || [];
                rewards = data.rewards || [];
                logs = data.logs || [];
                
                const updates = {};
                updates['/members'] = members;
                updates['/rewards'] = rewards;
                updates['/logs'] = logs;
                
                update(ref(db), updates).then(() => alert("Restauration terminée."));
            } else {
                alert("Sauvegarde introuvable.");
            }
        }).catch((error) => alert("Erreur: " + error.message));
    }
}

window.renderBackups = function(snapshot) {
    const container = document.getElementById('backupList');
    if(!container) return;
    const backups = snapshot.val();
    container.innerHTML = '';

    if (!backups) {
        container.innerHTML = '<span style="color:#666">Aucune sauvegarde trouvée.</span>';
        return;
    }

    const list = Object.entries(backups).sort((a, b) => b[0].localeCompare(a[0]));
    list.forEach(([key, val]) => {
        const dateStr = val.savedAt || key;
        const itemCount = (val.members ? val.members.length : 0);
        
        container.innerHTML += `
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid #333; padding:4px 0;">
                <span style="color:#00bcd4">${dateStr}</span>
                <span style="color:#666">${itemCount} mbrs</span>
                <button onclick="copyBackupData('${key}')" style="background:none; border:none; cursor:pointer; font-size:1.2em;" title="Copier le nom">📋</button>
            </div>
        `;
    });
}

window.copyBackupData = function(text) {
    navigator.clipboard.writeText(text);
    alert("Nom copié : " + text);
}

// ============================================================
// UI HELPERS
// ============================================================

window.switchTab = function(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    const activeBtn = Array.from(document.querySelectorAll('.tab-btn')).find(btn => btn.getAttribute('onclick').includes(tabId));
    if(activeBtn) activeBtn.classList.add('active');
}

window.toggleRankFilter = function(rank) {
    const btn = document.querySelector(`.rank-btn[data-rank="${rank}"]`);
    if (activeRanks.has(rank)) {
        if (activeRanks.size > 1) {
            activeRanks.delete(rank);
            btn.classList.remove('active');
        }
    } else {
        activeRanks.add(rank);
        btn.classList.add('active');
    }
    renderMainList();
}

window.resetRankFilters = function() {
    ['R1','R2','R3','R4','R5'].forEach(r => activeRanks.add(r));
    document.querySelectorAll('.rank-btn').forEach(b => b.classList.add('active'));
    renderMainList();
}

window.toggleTypeFilter = function(type) {
    const btn = document.querySelector(`.type-btn[data-type="${type}"]`);
    if (activeTypes.has(type)) {
        if (activeTypes.size > 1) {
            activeTypes.delete(type);
            btn.classList.remove('active');
        }
    } else {
        activeTypes.add(type);
        btn.classList.add('active');
    }
    renderMainList();
}

window.resetTypeFilters = function() {
    ['VIP', 'TRAIN'].forEach(t => activeTypes.add(t));
    document.querySelectorAll('.type-btn').forEach(b => b.classList.add('active'));
    renderMainList();
}

window.toggleSortOrder = function() {
    isReverseOrder = !isReverseOrder;
    const btn = document.getElementById('orderBtn');
    btn.innerHTML = isReverseOrder ? '⬆️' : '⬇️';
    renderMainList();
}

window.openImportModal = function() {
    document.getElementById('importTextarea').value = '';
    document.getElementById('importModal').style.display = 'flex';
}

window.processImport = function() {
    const rawText = document.getElementById('importTextarea').value;
    if(!rawText) return;

    const lines = rawText.split('\n');
    let addedCount = 0;
    
    lines.forEach(line => {
        const name = line.trim();
        if (name) {
            if (!members.some(m => m.name.toLowerCase() === name.toLowerCase())) {
                members.push({ name: name, rank: 'R1' });
                addedCount++;
            }
        }
    });

    if (addedCount > 0) {
        // Log via push pour pas écraser
        const logRef = push(ref(db, 'logs'));
        set(logRef, `[${new Date().toLocaleString()}] IMPORT: ${addedCount} membres ajoutés.`);
        saveData(); 
        alert(`${addedCount} ajoutés.`);
        window.closeModal('importModal');
    }
}

// --- METIER ---
function getLatestRewardDate(memberName) {
    const memberRewards = rewards.filter(r => r.member === memberName && activeTypes.has(r.type));
    if (memberRewards.length === 0) return 0;
    memberRewards.sort((a, b) => new Date(b.date) - new Date(a.date));
    return new Date(memberRewards[0].date).getTime();
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

window.selectMemberFromList = function(name) {
    document.getElementById('memberInput').value = name;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.addReward = function() {
    const memberName = document.getElementById('memberInput').value.trim();
    const date = document.getElementById('dateInput').value;
    const type = document.getElementById('typeInput').value;
    
    const realMember = members.find(m => m.name.toLowerCase() === memberName.toLowerCase());
    if (!realMember) { alert("Membre inconnu !"); return; }

    rewards.unshift({ id: Date.now(), member: realMember.name, date: date, type: type });
    
    const logRef = push(ref(db, 'logs'));
    set(logRef, `[${new Date().toLocaleString()}] AJOUT: ${realMember.name} | ${type}`);
    
    saveData();
    renderMainList();
}

window.addMember = function() {
    const name = document.getElementById('newMemberName').value.trim();
    const rank = document.getElementById('newMemberRank').value;

    if(name && !members.some(m => m.name.toLowerCase() === name.toLowerCase())) {
        members.push({ name: name, rank: rank });
        
        const logRef = push(ref(db, 'logs'));
        set(logRef, `[${new Date().toLocaleString()}] ADMIN: Création ${name} (${rank})`);
        
        saveData();
        document.getElementById('newMemberName').value = '';
    } else { alert("Nom invalide ou existant"); }
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
        const logRef = push(ref(db, 'logs'));
        set(logRef, `[${new Date().toLocaleString()}] ADMIN: ${name} Rang -> ${newRank}`);
        saveData();
        window.closeModal('memberEditModal');
    }
}

window.deleteMember = function(name) {
    event.stopPropagation();
    if(confirm(`Supprimer ${name} ?`)) {
        members = members.filter(m => m.name !== name);
        const logRef = push(ref(db, 'logs'));
        set(logRef, `[${new Date().toLocaleString()}] ADMIN: Suppression ${name}`);
        saveData();
    }
}

function renderAll() {
    renderMainList();
    renderManageMembers();
}

window.renderMainList = function() {
    const container = document.getElementById('membersListContainer');
    container.innerHTML = '';
    const statusFilter = document.getElementById('statusFilter').value;
    const sortMode = document.getElementById('sortFilter').value;

    let filtered = members.filter(m => {
        if (!activeRanks.has(m.rank)) return false;
        const memberHistory = rewards.filter(r => r.member === m.name);
        const relevantHistory = memberHistory.filter(h => activeTypes.has(h.type));
        
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

    if(filtered.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:30px; opacity:0.5">Aucun résultat.</div>';
        return;
    }

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
    const ranksOrder = ['R5', 'R4', 'R3', 'R2', 'R1'];

    ranksOrder.forEach(rank => {
        const rankMembers = members.filter(m => m.rank === rank);
        rankMembers.sort((a, b) => a.name.localeCompare(b.name));
        if (rankMembers.length > 0) {
            container.innerHTML += `<div class="rank-separator">${rank} <span style="font-size:0.8em; margin-left:8px; opacity:0.6">(${rankMembers.length})</span></div>`;
            let gridHTML = '<div class="rank-group-grid">';
            rankMembers.forEach(m => {
                gridHTML += `
                    <div class="member-chip" onclick="openMemberEditModal('${m.name}')" title="Modifier le Rang">
                        <div><span style="color:var(--accent); font-weight:bold; font-size:0.8em">[${m.rank}]</span> <span>${m.name}</span></div>
                        <button class="btn-delete" style="padding:4px 8px; margin:0;" onclick="deleteMember('${m.name}')">X</button>
                    </div>`;
            });
            gridHTML += '</div>';
            container.innerHTML += gridHTML;
        }
    });
    if(members.length === 0) container.innerHTML = '<p style="text-align:center; opacity:0.5">Aucun membre.</p>';
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
function addLog(msg) {
    const logRef = push(ref(db, 'logs'));
    set(logRef, `[${new Date().toLocaleString()}] ${msg}`);
}
window.downloadLogs = function() {
    const logArray = Array.isArray(logs) ? logs : Object.values(logs);
    const blob = new Blob([logArray.join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = window.URL.createObjectURL(blob);
    a.download = `Logs_${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
}
function formatDate(d) { return d ? d.split('-').reverse().slice(0,2).join('/') : ''; }