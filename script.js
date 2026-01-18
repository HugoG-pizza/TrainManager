// --- IMPORT FIREBASE ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, push } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- CONFIGURATION FIREBASE (A REMPLIR) ---
// Colle ici ce que tu as trouvé dans la console Firebase (Etape 1.9)
const firebaseConfig = {

  apiKey: "AIzaSyCyag9xRPwQ_abIWO7Ng-paqdUg5sIjqHk",

  authDomain: "train-manager-83516.firebaseapp.com",

  databaseURL: "https://train-manager-83516-default-rtdb.europe-west1.firebasedatabase.app",

  projectId: "train-manager-83516",

  storageBucket: "train-manager-83516.firebasestorage.app",

  messagingSenderId: "877276977784",

  appId: "1:877276977784:web:839e7f2f234139a3692b8d"

};


// Initialisation
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth();

// --- CONFIG APP ---
const MAX_HISTORY_DISPLAY = 5;
const RANK_POWER = { 'R5': 5, 'R4': 4, 'R3': 3, 'R2': 2, 'R1': 1 };

// --- DATA (Initialement vides, remplies par Firebase) ---
let members = [];
let rewards = [];
let logs = [];

// --- STATE UI ---
let activeRanks = new Set(['R1', 'R2', 'R3', 'R4', 'R5']);
let isReverseOrder = false;
let activeTypes = new Set(['VIP', 'TRAIN']);

// --- 3. DEMARRAGE SECURISE ---
document.addEventListener('DOMContentLoaded', () => {
    
    // Initialisation Date Input
    const dateInput = document.getElementById('dateInput');
    if(dateInput) dateInput.valueAsDate = new Date();

    // Event Listeners UI (Recherche, etc)
    setupEventListeners();

    // --- C'EST ICI QUE LA MAGIE OPERE ---
    // On surveille l'état de connexion. 
    // Si l'utilisateur n'est pas connecté, on le connecte.
    // Une fois connecté, ON LANCE l'écoute de la DB.
    
    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log("Connecté (UID):", user.uid);
            startDatabaseListener();
        } else {
            console.log("Utilisateur déconnecté, tentative de connexion anonyme...");
            signInAnonymously(auth).catch((error) => {
                console.error("Erreur critique connexion:", error);
                alert("Impossible de se connecter à la base de données.");
            });
        }
    });
});

// Fonction qui démarre l'écoute de la DB (lancée seulement après auth réussite)
function startDatabaseListener() {
    const dbRef = ref(db, '/'); 
    onValue(dbRef, (snapshot) => {
        const data = snapshot.val();
        
        if (data) {
            members = data.members || [];
            rewards = data.rewards || [];
            logs = data.logs || [];
        } else {
            members = []; rewards = []; logs = [];
        }
        
        renderAll();
    }, (error) => {
        console.error("Erreur lecture DB:", error);
        // Si erreur de permission, c'est souvent un problème de règles Firebase
        if(error.code === 'PERMISSION_DENIED') {
            console.warn("Vérifiez vos règles 'rules' dans la console Firebase.");
        }
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
    // Sécurité supplémentaire : on ne sauvegarde pas si pas connecté
    if (!auth.currentUser) {
        alert("Attendez la connexion avant de sauvegarder !");
        return;
    }

    set(ref(db, '/'), {
        members: members,
        rewards: rewards,
        logs: logs
    }).catch((error) => {
        console.error("Erreur save:", error);
        alert("Erreur de sauvegarde (Permissions ?): " + error.message);
    });
}

// ============================================================
// TOUT LE RESTE DU CODE EST IDENTIQUE A TA V7
// J'ai juste gardé la logique métier, car renderAll utilise 
// les variables globales `members`, `rewards` mises à jour plus haut.
// ============================================================

// --- UI HELPERS ---
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
        if (activeTypes.size > 1) { // On empêche de tout décocher
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
        addLog(`IMPORT: ${addedCount} membres ajoutés.`);
        saveData(); // Envoie au Cloud
        alert(`${addedCount} ajoutés.`);
        window.closeModal('importModal');
    }
}

// --- METIER ---
function getLatestRewardDate(memberName) {
    // On ne regarde QUE les récompenses des types actifs
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
    addLog(`AJOUT: ${realMember.name} | ${type}`);
    saveData(); // Envoie au Cloud
}

window.addMember = function() {
    const name = document.getElementById('newMemberName').value.trim();
    const rank = document.getElementById('newMemberRank').value;

    if(name && !members.some(m => m.name.toLowerCase() === name.toLowerCase())) {
        members.push({ name: name, rank: rank });
        addLog(`ADMIN: Création ${name} (${rank})`);
        saveData(); // Envoie au Cloud
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
        addLog(`ADMIN: ${name} Rang -> ${newRank}`);
        saveData(); // Envoie au Cloud
        window.closeModal('memberEditModal');
    }
}

window.deleteMember = function(name) {
    event.stopPropagation();
    if(confirm(`Supprimer ${name} ?`)) {
        members = members.filter(m => m.name !== name);
        addLog(`ADMIN: Suppression ${name}`);
        saveData(); // Envoie au Cloud
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

    // 1. FILTRAGE DES MEMBRES
    let filtered = members.filter(m => {
        // A. Filtre Rank
        if (!activeRanks.has(m.rank)) return false;

        // B. On récupère l'historique FILTRÉ PAR TYPE pour ce membre
        // On ne considère que les récompenses (VIP ou Train) qui sont cochées en haut
        const visibleRewards = rewards.filter(r => r.member === m.name && activeTypes.has(r.type));

        // C. Filtre Statut (Déjà reçu / Jamais) basé sur les récompenses VISIBLES
        // Ex: Si je filtre "VIP" seulement, "Jamais Reçu" montrera ceux qui n'ont jamais eu de VIP (même s'ils ont eu du Train)
        if (statusFilter === 'NEVER' && visibleRewards.length > 0) return false;
        if (statusFilter === 'RECEIVED' && visibleRewards.length === 0) return false;

        return true;
    });

    // 2. TRI
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

    // 3. AFFICHAGE
    let lastRank = null;
    filtered.forEach(m => {
        if (sortMode === 'RANK' && m.rank !== lastRank) {
            // Compteur mis à jour selon le filtre
            const count = filtered.filter(f => f.rank === m.rank).length;
            container.innerHTML += `<div class="rank-separator">${m.rank} <span style="font-size:0.8em; margin-left:8px; opacity:0.6">(${count})</span></div>`;
            lastRank = m.rank;
        }

        // On ré-applique le filtre Type pour l'affichage des badges
        const memberHistory = rewards
            .filter(r => r.member === m.name && activeTypes.has(r.type)) // <--- ICI
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, MAX_HISTORY_DISPLAY);
        
        let historyHTML = '';
        memberHistory.forEach(h => {
            const bgClass = h.type === 'VIP' ? 'bg-vip' : 'bg-train';
            historyHTML += `<div class="history-badge ${bgClass}" onclick="openEditModal(${h.id}); event.stopPropagation();"><strong>${h.type}</strong><span class="date">${formatDate(h.date)}</span></div>`;
        });

        // Texte si vide (dépend du contexte)
        if(memberHistory.length === 0) {
            // Petit détail UX : Si on filtre "VIP" et que le mec n'en a pas, on affiche "Aucun VIP"
            historyHTML = '<span style="font-size:0.8em; opacity:0.3; align-self:center;">-</span>';
        }

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
    logs.unshift(`[${new Date().toLocaleString()}] ${msg}`);
    if(logs.length > 500) logs.pop();
}
window.downloadLogs = function() {
    const blob = new Blob([logs.join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = window.URL.createObjectURL(blob);
    a.download = `Logs_${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
}
function formatDate(d) { return d ? d.split('-').reverse().slice(0,2).join('/') : ''; }