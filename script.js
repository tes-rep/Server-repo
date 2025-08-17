const apiURL = "./releases.json";
let builds = [];
let selectedFirmware = null;
let userIP = null;
let countdownInterval = null;

// Ambil IP user
async function getUserIP() {
    try {
        const res = await fetch("https://api64.ipify.org?format=json");
        const data = await res.json();
        userIP = data.ip;
    } catch {
        userIP = "unknown";
    }
}

// Bersihkan nama file
function cleanFileName(filename) {
    if (!filename) return "";
    if (filename.toLowerCase().includes("modsdcard")) {
        return filename.replace(/-\d{8}-MODSDCARD\.(img|bin|gz|tar|zip|xz|7z|bz2)$/i, "-MODSDCARD");
    }
    return filename.replace(/-\d{8}\.(img|bin|gz|tar|zip|xz|7z|bz2)$/i, "");
}

// Kategori firmware
function getFirmwareCategory(filename) {
    const lower = filename.toLowerCase();
    return (lower.includes("immortalwrt") || lower.includes("immortal")) ? "immortalwrt" : "openwrt";
}

// Kategori device
function getDeviceCategory(filename) {
    const lower = filename.toLowerCase();
    if (lower.includes("orangepi") || lower.includes("orange-pi")) return "orangepi";
    if (lower.includes("nanopi") || lower.includes("nano-pi")) return "nanopi";
    if (lower.includes("raspberry") || lower.includes("rpi") || lower.includes("bcm27")) return "raspberrypi";
    if (lower.includes("x86_64") || lower.includes("x86-64") || lower.includes("amd64")) return "x86_64";
    if (lower.includes("amlogic") || lower.includes("s905") || lower.includes("s912") || lower.includes("s922") 
        || lower.includes("a311d") || lower.includes("hg680p") || lower.includes("b860h") 
        || lower.includes("tx3") || lower.includes("h96") || lower.includes("s905x4") || lower.includes("advan")) return "amlogic";
    return "amlogic";
}

// Sub-device untuk amlogic
function getAmlogicSubType(filename) {
    const lower = filename.toLowerCase();
    if (lower.includes("hg680p")) return "HG680P";
    if (lower.includes("b860h")) return "B860H";
    if (lower.includes("tx3")) return "TX3";
    if (lower.includes("h96")) return "H96";
    if (lower.includes("s905x4") && lower.includes("advan")) return "S905X4 Advan";
    if (lower.includes("s905") || lower.includes("s912") || lower.includes("s922") || lower.includes("a311d")) return "Generic";
    return "Other";
}

// Format size & download count
function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes)/Math.log(k));
    return (bytes/Math.pow(k,i)).toFixed(1) + ' ' + sizes[i];
}

function formatDownloadCount(count) {
    if (count >= 1e6) return (count/1e6).toFixed(1) + 'M';
    if (count >= 1e3) return (count/1e3).toFixed(1) + 'K';
    return count.toString();
}

// Format tanggal
function formatDate(dateStr) {
    if (!dateStr) return 'Unknown';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Unknown';
    return d.toLocaleDateString('id-ID',{day:'2-digit',month:'2-digit',year:'numeric'});
}

// Delay download per IP
function getDownloadTimeLeft() {
    if (!userIP) return 0;
    const key = `download_delay_${userIP}`;
    const last = localStorage.getItem(key);
    if (!last) return 0;
    const diff = Date.now() - parseInt(last);
    const oneMinute = 60*1000;
    return (oneMinute - diff) > 0 ? (oneMinute - diff) : 0;
}

function canDownload() {
    return getDownloadTimeLeft() === 0;
}

function setDownloadDelay() {
    if (!userIP) return;
    localStorage.setItem(`download_delay_${userIP}`, Date.now().toString());
}

// Format waktu countdown
function formatTime(ms) {
    const m = Math.floor(ms/60000);
    const s = Math.floor((ms%60000)/1000);
    return `${m}:${s.toString().padStart(2,'0')}`;
}

// Update tombol download
function updateDownloadButton() {
    const btn = document.getElementById("downloadBtn");
    if (!btn) return;
    const timeLeft = getDownloadTimeLeft();
    if (!selectedFirmware) {
        btn.textContent = "Download";
        btn.disabled = true;
        btn.className = "download-btn locked";
        return;
    }
    if (timeLeft > 0) {
        btn.textContent = `Tunggu... ${formatTime(timeLeft)}`;
        btn.disabled = true;
        btn.className = "download-btn locked";
    } else {
        btn.textContent = "Download";
        btn.disabled = false;
        btn.className = "download-btn unlocked";
    }
}

// Countdown interval
function startCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(()=>{
        updateDownloadButton();
        if (getDownloadTimeLeft() <=0 ) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
    },1000);
}

// Tema
function initThemeSystem() {
    const themes = [
        {name:'neomorp',label:'Light'},
        {name:'dark',label:'Dark'},
        {name:'blue',label:'Blue'},
        {name:'green',label:'Green'},
        {name:'purple',label:'Purple'}
    ];
    let current = 0;
    const saved = localStorage.getItem('xidzs-theme') || 'neomorp';
    current = themes.findIndex(t=>t.name===saved);
    if (current<0) current=0;
    const toggle = document.getElementById('themeToggle');
    function applyTheme() {
        document.body.classList.remove('theme-dark','theme-blue','theme-green','theme-purple');
        const theme = themes[current];
        if(theme.name!=='neomorp') document.body.classList.add(`theme-${theme.name}`);
        localStorage.setItem('xidzs-theme',theme.name);
        if(toggle) toggle.textContent = theme.label;
    }
    if(toggle) toggle.addEventListener('click',()=>{
        current = (current+1)%themes.length;
        applyTheme();
    });
    applyTheme();
}

// Tampilkan empty state
function showEmptyState(msg){
    const wizard = document.getElementById("wizard");
    if(wizard){
        wizard.innerHTML = `<div class="empty-state" style="text-align:center;padding:40px;color:#666;">
            <h3>${msg}</h3>
            <p>Comingsoon Yah Sayang</p>
            <button onclick="initApp()" style="margin-top:15px;padding:10px 20px;background:#007bff;color:white;border:none;border-radius:4px;cursor:pointer;">Sabar Yah</button>
        </div>`;
    }
}

// Tampilkan error
function showError(msg){
    const wizard = document.getElementById("wizard");
    if(wizard){
        wizard.innerHTML = `<div class="error-message" style="text-align:center;padding:40px;color:#ff6b6b;">
            <h3>Firmware Belum Tersedia Sayang</h3>
            <p>Error: ${msg}</p>
            <button onclick="initApp()" style="margin-top:15px;padding:10px 20px;background:#dc3545;color:white;border:none;border-radius:4px;cursor:pointer;">Coba Lagi Nanti</button>
        </div>`;
    }
}

// Load data dari releases.json
async function loadData(){
    try{
        const res = await fetch(apiURL,{cache:'no-cache'});
        if(!res.ok) throw new Error(`HTTP ${res.status}`);
        const releases = await res.json();
        if(!Array.isArray(releases)) throw new Error("Invalid format");
        if(releases.length===0){ showEmptyState("Tidak ada firmware ditemukan"); return; }
        builds=[];
        releases.forEach(rel=>{
            if(!rel.assets) return;
            rel.assets.forEach(a=>{
                if(!a.name||!a.browser_download_url) return;
                if(!a.name.match(/\.(img|bin|gz|tar|zip|xz|7z|bz2)$/i)) return;
                if(a.name.toLowerCase().includes("rootfs")) return;
                builds.push({
                    displayName: cleanFileName(a.name),
                    originalName: a.name,
                    category: getFirmwareCategory(a.name),
                    device: getDeviceCategory(a.name),
                    subDevice: getAmlogicSubType(a.name),
                    url: a.browser_download_url,
                    size: a.size||0,
                    downloadCount: a.download_count||0,
                    publishedAt: rel.published_at||rel.created_at||null
                });
            });
        });
        if(builds.length===0){ showEmptyState("Tidak ada firmware ditemukan"); return; }
        // remove duplicates
        const seen = new Set();
        builds = builds.filter(b=>{
            const n=b.displayName.toLowerCase().trim();
            if(seen.has(n)||n==="") return false;
            seen.add(n);
            return true;
        });
        initWizard();
    }catch(e){
        console.error(e);
        showError(e.message);
    }
}

// Init wizard & list firmware
function initWizard(){
    const wizard = document.getElementById("wizard");
    if(!wizard) return;

    const allCount = builds.length;
    const openwrtCount = builds.filter(b=>b.category==='openwrt').length;
    const immortalCount = builds.filter(b=>b.category==='immortalwrt').length;
    const amlogicCount = builds.filter(b=>b.device==='amlogic').length;
    const orangepiCount = builds.filter(b=>b.device==='orangepi').length;
    const nanopiCount = builds.filter(b=>b.device==='nanopi').length;
    const raspberrypiCount = builds.filter(b=>b.device==='raspberrypi').length;
    const x86Count = builds.filter(b=>b.device==='x86_64').length;

    wizard.innerHTML=`
        <div class="step-card active">
            <label>Pilih Kategori Firmware:</label>
            <div class="category-buttons">
                <button class="category-btn active" data-category="all">Semua (${allCount})</button>
                <button class="category-btn" data-category="openwrt">OpenWrt (${openwrtCount})</button>
                <button class="category-btn" data-category="immortalwrt">ImmortalWrt (${immortalCount})</button>
            </div>
        </div>
        <div class="step-card active">
            <label>Pilih Device:</label>
            <div class="device-buttons">
                <button class="device-btn active" data-device="all">Semua</button>
                <button class="device-btn" data-device="amlogic">Amlogic (${amlogicCount})</button>
                <button class="device-btn" data-device="orangepi">OrangePi (${orangepiCount})</button>
                <button class="device-btn" data-device="nanopi">NanoPi (${nanopiCount})</button>
                <button class="device-btn" data-device="raspberrypi">RaspberryPi (${raspberrypiCount})</button>
                <button class="device-btn" data-device="x86_64">X86_64 (${x86Count})</button>
            </div>
        </div>
        <div class="step-card active">
            <div class="firmware-header">
                <label>Firmware:</label>
                <button class="search-toggle-btn" onclick="toggleSearch()">Cari</button>
            </div>
            <div class="search-select" style="display:none;">
                <input type="text" placeholder="Cari Firmware Devices..." />
            </div>
            <div class="firmware-list"><ul></ul></div>
        </div>
        <div class="step-card active">
            <div class="locked-download-section">
                <div class="download-area">
                    <div class="selected-info"><div class="no-selection"><p>Pilih Firmware Terlebih Dahulu</p></div></div>
                    <div class="action-buttons">
                        <button class="download-btn locked" id="downloadBtn" onclick="handleDownload()">Download</button>
                    </div>
                </div>
            </div>
        </div>`;
    setupEventHandlers();
}

// Event handler untuk filter, search, dan klik firmware
function setupEventHandlers(){
    const ul = document.querySelector(".firmware-list ul");
    const input = document.querySelector(".search-select input");
    if(!ul||!input) return;
    let currentCategory="all",currentDevice="all";
    document.querySelectorAll(".category-btn").forEach(btn=>{
        btn.onclick=()=>{
            document.querySelectorAll(".category-btn").forEach(b=>b.classList.remove("active"));
            btn.classList.add("active");
            currentCategory=btn.dataset.category;
            selectedFirmware=null;
            startCountdown();
            renderList(input.value);
        };
    });
    document.querySelectorAll(".device-btn").forEach(btn=>{
        btn.onclick=()=>{
            document.querySelectorAll(".device-btn").forEach(b=>b.classList.remove("active"));
            btn.classList.add("active");
            currentDevice=btn.dataset.device;
            selectedFirmware=null;
            startCountdown();
            renderList(input.value);
        };
    });
    function renderList(filter=""){
        ul.innerHTML="";
        let filtered = builds;
        if(currentCategory!=="all") filtered=filtered.filter(b=>b.category===currentCategory);
        if(currentDevice!=="all") filtered=filtered.filter(b=>b.device===currentDevice);
        filtered = filtered.filter(b=>b.displayName.toLowerCase().includes(filter.toLowerCase()))
                           .sort((a,b)=>new Date(b.publishedAt)-new Date(a.publishedAt));
        if(filtered.length===0){
            ul.innerHTML='<li style="text-align:center;color:#666;">Tidak ada firmware yang ditemukan</li>';
            return;
        }
        filtered.forEach(b=>{
            const li=document.createElement("li");
            li.innerHTML=`<div class="firmware-info">
                <div class="firmware-name">${b.displayName}</div>
                <div class="firmware-meta">
                    <span class="device-type">${b.device.toUpperCase()} ${b.subDevice?`(${b.subDevice})`:''}</span>
                    <span class="file-size">Size: ${formatFileSize(b.size)}</span>
                    <span class="download-count">Downloads: ${formatDownloadCount(b.downloadCount)}</span>
                    <span class="release-date">Date: ${formatDate(b.publishedAt)}</span>
                </div>
            </div>`;
            li.onclick=()=>{
                ul.querySelectorAll("li").forEach(li=>li.classList.remove("selected"));
                selectedFirmware=b;
                li.classList.add("selected");
                updateDownloadButton();
            };
            ul.appendChild(li);
        });
    }
    input.oninput=()=>renderList(input.value);
    renderList();
}

// Download
function handleDownload(){
    if(!selectedFirmware||!canDownload()) return;
    const key=`downloaded_${selectedFirmware.url}_${userIP}`;
    if(!localStorage.getItem(key)) localStorage.setItem(key,"true");
    setDownloadDelay();
    startCountdown();
    window.open(selectedFirmware.url,"_blank");
}

// Toggle search
function toggleSearch(){
    const sel=document.querySelector(".search-select");
    const btn=document.querySelector(".search-toggle-btn");
    if(!sel||!btn) return;
    if(sel.style.display==="none"){
        sel.style.display="block";
        btn.textContent="Tutup";
    }else{
        sel.style.display="none";
        btn.textContent="Cari";
        const input=sel.querySelector("input");
        if(input){ input.value=""; input.dispatchEvent(new Event('input')); }
    }
}

// Init app
async function initApp(){
    await getUserIP();
    await loadData();
}

// DOMContentLoaded
document.addEventListener("DOMContentLoaded",async()=>{
    initThemeSystem();
    await initApp();
    document.querySelectorAll('.aml-device-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const device = btn.getAttribute('data-device');
        filterFirmwareByDevice(device); // Fungsi filter di script.js
    });
});
});
