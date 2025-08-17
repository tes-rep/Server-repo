const apiURL = "./releases.json";
let allFirmware = [];
let selectedFirmware = null;
let userIP = null;
let countdownInterval = null;

// Ambil IP pengguna
async function getUserIP() {
    try {
        const res = await fetch("https://api64.ipify.org?format=json");
        const data = await res.json();
        userIP = data.ip;
    } catch {
        userIP = "unknown";
    }
}
getUserIP();

// Deteksi SOC berdasarkan nama file
function detectDevice(filename) {
    const lower = filename.toLowerCase();
    const socList = ["s905x4", "s905x3", "s905x2", "s905x"];
    for (let soc of socList) {
        if (lower.includes(soc)) return soc.toUpperCase();
    }
    return "UNKNOWN";
}

// Format ukuran file
function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B','KB','MB','GB'];
    const i = Math.floor(Math.log(bytes)/Math.log(k));
    return (bytes/Math.pow(k,i)).toFixed(1)+' '+sizes[i];
}

// Format download count
function formatDownloadCount(count) {
    if (count >= 1000000) return (count/1000000).toFixed(1)+'M';
    if (count >= 1000) return (count/1000).toFixed(1)+'K';
    return count.toString();
}

// Delay download per IP
function getDownloadTimeLeft() {
    if (!userIP) return 0;
    const key = `download_delay_${userIP}`;
    const last = localStorage.getItem(key);
    if (!last) return 0;
    const diff = Date.now() - parseInt(last);
    const delay = 60*1000; // 1 menit
    return diff < delay ? delay-diff : 0;
}

function canDownload() { return getDownloadTimeLeft()===0; }
function setDownloadDelay() { if(userIP) localStorage.setItem(`download_delay_${userIP}`, Date.now().toString()); }
function formatTime(ms) {
    const m = Math.floor(ms/60000);
    const s = Math.floor((ms%60000)/1000);
    return `${m}:${s.toString().padStart(2,'0')}`;
}

function updateDownloadButton() {
    const btn = document.getElementById("downloadBtn");
    if (!selectedFirmware || !btn) return;
    const timeLeft = getDownloadTimeLeft();
    if(timeLeft>0){
        btn.textContent=`Tunggu... ${formatTime(timeLeft)}`;
        btn.disabled=true;
        btn.className="download-btn locked";
    }else{
        btn.textContent="Download";
        btn.disabled=false;
        btn.className="download-btn unlocked";
    }
}

function startCountdown(){
    if(countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(()=>{
        updateDownloadButton();
        if(getDownloadTimeLeft()===0){
            clearInterval(countdownInterval);
            countdownInterval=null;
        }
    },1000);
}

// Load releases.json
async function loadData() {
    const loadingEl = document.getElementById("firmwareCount");
    loadingEl.textContent="⏳ Memuat firmware...";
    try{
        const res = await fetch(apiURL,{cache:"no-cache"});
        const releases = await res.json();
        allFirmware = [];
        releases.forEach(rel=>{
            if(rel.assets) rel.assets.forEach(asset=>{
                if(!asset.name || !asset.browser_download_url) return;
                if(!asset.name.match(/\.(img|bin|gz|tar|zip|xz|7z)$/i)) return;
                allFirmware.push({
                    name: asset.name,
                    displayName: asset.name.replace(/\.(img|bin|gz|tar|zip|xz|7z)$/i,''),
                    url: asset.browser_download_url,
                    size: asset.size,
                    downloads: asset.download_count||0,
                    category: (asset.name.toLowerCase().includes("immortal")?"ImmortalWrt":"OpenWrt"),
                    device: detectDevice(asset.name)
                });
            });
        });
        loadingEl.textContent=`${allFirmware.length} Firmware Tersedia`;
        buildWizard(allFirmware);
        displayFirmware(allFirmware);
    }catch(e){
        console.error(e);
        loadingEl.textContent="Error loading firmware";
    }
}

// Build wizard (kategori + SOC filter + search)
function buildWizard(firmwares){
    const wizard=document.getElementById("wizard");
    wizard.innerHTML="";

    // Kategori OpenWrt / ImmortalWrt / Semua
    const categories=["ALL","OpenWrt","ImmortalWrt"];
    const catDiv=document.createElement("div");
    catDiv.className="step-card";
    catDiv.innerHTML="<label>Pilih Kategori:</label>";
    categories.forEach(cat=>{
        const btn=document.createElement("button");
        btn.innerText=cat;
        btn.onclick=()=>filterFirmware(cat==="ALL"?null:cat,null);
        catDiv.appendChild(btn);
    });
    wizard.appendChild(catDiv);

    // SOC filter
    const socs=["S905X","S905X2","S905X3","S905X4"];
    const socDiv=document.createElement("div");
    socDiv.className="step-card";
    socDiv.innerHTML="<label>Pilih SOC:</label>";
    socs.forEach(soc=>{
        const btn=document.createElement("button");
        btn.innerText=soc;
        btn.onclick=()=>filterFirmware(null,soc);
        socDiv.appendChild(btn);
    });
    wizard.appendChild(socDiv);

    // Search bar
    const searchDiv=document.createElement("div");
    searchDiv.className="step-card";
    searchDiv.innerHTML='<input type="text" id="fwSearch" placeholder="Cari firmware..." style="width:100%;padding:6px;margin-bottom:10px;">';
    wizard.appendChild(searchDiv);
    document.getElementById("fwSearch").addEventListener("input",(e)=>{
        const val=e.target.value.toLowerCase();
        const filtered=allFirmware.filter(fw=>fw.displayName.toLowerCase().includes(val));
        displayFirmware(filtered);
    });

    // Container firmware list
    const listDiv=document.createElement("div");
    listDiv.className="step-card";
    listDiv.innerHTML='<div id="firmware-list" style="margin-top:10px;"></div>';
    wizard.appendChild(listDiv);

    // Download section
    const downloadDiv=document.createElement("div");
    downloadDiv.className="step-card";
    downloadDiv.innerHTML=`
        <div class="selected-info"><p>Pilih firmware terlebih dahulu</p></div>
        <button id="downloadBtn" class="download-btn locked" onclick="handleDownload()">Download</button>
    `;
    wizard.appendChild(downloadDiv);
}

// Filter firmware
function filterFirmware(category, soc){
    let filtered=allFirmware;
    if(category) filtered=filtered.filter(fw=>fw.category===category);
    if(soc) filtered=filtered.filter(fw=>fw.device===soc);
    displayFirmware(filtered);
}

// Display firmware list dengan lazy load
function displayFirmware(firmwares,start=0,limit=50){
    const list=document.getElementById("firmware-list");
    if(start===0) list.innerHTML="";
    const subset=firmwares.slice(start,start+limit);
    subset.forEach(fw=>{
        const div=document.createElement("div");
        div.className="fw-item";
        div.innerHTML=`
            <div>
                <strong>${fw.displayName}</strong><br>
                <small>${fw.category} | ${fw.device} | Size: ${formatFileSize(fw.size)} | Downloads: ${formatDownloadCount(fw.downloads)}</small>
            </div>
            <button onclick="selectFirmware('${fw.url}')">Pilih</button>
        `;
        list.appendChild(div);
    });
    if(start+limit<firmwares.length){
        const btn=document.createElement("button");
        btn.innerText="Load More...";
        btn.onclick=()=>{
            btn.remove();
            displayFirmware(firmwares,start+limit,limit);
        };
        list.appendChild(btn);
    }
}

// Pilih firmware
function selectFirmware(url){
    selectedFirmware=allFirmware.find(fw=>fw.url===url);
    const infoDiv=document.querySelector(".selected-info");
    if(selectedFirmware){
        infoDiv.innerHTML=`<strong>${selectedFirmware.displayName}</strong><br>
            <small>${selectedFirmware.category} | ${selectedFirmware.device} | Size: ${formatFileSize(selectedFirmware.size)}</small>`;
        updateDownloadButton();
    }
}

// Download firmware
function handleDownload(){
    if(!selectedFirmware) return;
    if(!canDownload()) return;
    setDownloadDelay();
    startCountdown();
    window.open(selectedFirmware.url,"_blank");
}

// Init
document.addEventListener("DOMContentLoaded",()=>{loadData();});
