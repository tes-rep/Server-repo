// ================== CONFIG ==================
const apiURL = "./releases.json";
let builds = [];
let selectedFirmware = null;
let userIP = null;
let countdownInterval = null;

// ===== Device & Sub-device Map =====
const deviceMap = {
    orangepi: ["orangepi", "orange-pi"],
    nanopi: ["nanopi", "nano-pi"],
    raspberrypi: ["raspberry", "rpi", "bcm27"],
    x86_64: ["x86_64", "x86-64", "amd64"],
    amlogic: {
        s905: ["s905", "s905x", "s905x2", "s905x3"],
        s905x4: ["s905x4"],
        s912: ["s912"],
        s922: ["s922"],
        a311d: ["a311d"],
        hg680p: ["hg680p"],
        b860h: ["b860h"],
        tx3: ["tx3"],
        h96: ["h96"],
        advan: ["advan"]
    }
};

// ===== Firmware Map =====
const firmwareMap = {
    openwrt: ["openwrt"],
    immortalwrt: ["immortalwrt", "immortal"]
};

// ================== UTIL FUNCTIONS ==================
async function getUserIP() {
    try {
        const res = await fetch("https://api64.ipify.org?format=json");
        const data = await res.json();
        userIP = data.ip;
    } catch {
        userIP = "unknown";
    }
}

function cleanFileName(filename) {
    if (filename.toLowerCase().includes("modsdcard")) {
        return filename.replace(/-\d{8}-MODSDCARD\.(img|bin|gz|tar|zip|xz|7z|bz2)$/gi, "-MODSDCARD");
    }
    return filename.replace(/-\d{8}\.(img|bin|gz|tar|zip|xz|7z|bz2)$/gi, "");
}

function getDeviceCategory(filename) {
    const lower = filename.toLowerCase();
    for (const [category, value] of Object.entries(deviceMap)) {
        if (typeof value === 'object') { // Amlogic sub-device
            for (const [subDevice, keywords] of Object.entries(value)) {
                if (keywords.some(k => lower.includes(k))) return subDevice;
            }
        } else if (Array.isArray(value)) {
            if (value.some(k => lower.includes(k))) return category;
        }
    }
    return "unknown";
}

function getFirmwareCategory(filename) {
    const lower = filename.toLowerCase();
    for (const [category, keywords] of Object.entries(firmwareMap)) {
        if (keywords.some(k => lower.includes(k))) return category;
    }
    return "openwrt";
}

function formatFileSize(bytes) {
    if (!bytes) return "0 B";
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

function formatDownloadCount(count) {
    if (count >= 1e6) return (count / 1e6).toFixed(1) + 'M';
    if (count >= 1e3) return (count / 1e3).toFixed(1) + 'K';
    return count.toString();
}

function formatDate(dateStr) {
    if (!dateStr) return 'Unknown';
    const d = new Date(dateStr);
    if (isNaN(d)) return 'Unknown';
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ================== DOWNLOAD CONTROL ==================
function adjustDownloadCount(firmwareUrl, originalCount) {
    if (!userIP) return originalCount;
    const key = `downloaded_${firmwareUrl}_${userIP}`;
    return localStorage.getItem(key) ? Math.max(0, originalCount - 1) : originalCount;
}

function getDownloadTimeLeft() {
    if (!userIP) return 0;
    const key = `download_delay_${userIP}`;
    const last = localStorage.getItem(key);
    if (!last) return 0;
    const diff = Date.now() - parseInt(last);
    const oneMinute = 60 * 1000;
    return diff < oneMinute ? oneMinute - diff : 0;
}

function canDownload() {
    return getDownloadTimeLeft() === 0;
}

function setDownloadDelay() {
    if (!userIP) return;
    localStorage.setItem(`download_delay_${userIP}`, Date.now().toString());
}

function formatTime(ms) {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function updateDownloadButton() {
    const btn = document.getElementById("downloadBtn");
    if (!btn || !selectedFirmware) return;
    const timeLeft = getDownloadTimeLeft();
    if (timeLeft > 0) {
        btn.textContent = `Tunggu... ${formatTime(timeLeft)}`;
        btn.className = "download-btn locked";
        btn.disabled = true;
    } else {
        btn.textContent = "Download";
        btn.className = "download-btn unlocked";
        btn.disabled = false;
    }
}

function startCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
        updateDownloadButton();
        if (getDownloadTimeLeft() === 0) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
    }, 1000);
}

function cleanup() {
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = null;
}

// ================== EMPTY / ERROR STATE ==================
function showEmptyState(message) {
    const wizard = document.getElementById("wizard");
    if (!wizard) return;
    wizard.innerHTML = `<div style="text-align:center;padding:40px;color:#666;">
        <h3>${message}</h3>
        <p>Coming soon!</p>
        <button onclick="initApp()" style="margin-top:15px;padding:10px 20px;background:#007bff;color:white;border:none;border-radius:4px;cursor:pointer;">Sabar Yah</button>
    </div>`;
}

function showError(message) {
    const wizard = document.getElementById("wizard");
    if (!wizard) return;
    wizard.innerHTML = `<div style="text-align:center;padding:40px;color:#ff6b6b;">
        <h3>Firmware Belum Tersedia</h3>
        <p>Error: ${message}</p>
        <button onclick="initApp()" style="margin-top:15px;padding:10px 20px;background:#dc3545;color:white;border:none;border-radius:4px;cursor:pointer;">Coba Lagi Nanti</button>
    </div>`;
}

// ================== APP INIT ==================
async function loadData() {
    try {
        const res = await fetch(apiURL, { cache: "no-cache", headers: { 'Content-Type': 'application/json' } });
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const releases = await res.json();
        if (!Array.isArray(releases) || releases.length === 0) throw new Error("Tidak ada firmware ditemukan");

        builds = [];
        releases.forEach(rel => {
            if (!rel.assets) return;
            rel.assets.forEach(asset => {
                if (!asset.name || !asset.browser_download_url) return;
                if (!asset.name.match(/\.(img|bin|gz|tar|zip|xz|7z|img\.gz|tar\.gz|tar\.xz|bin\.gz|bz2)$/i)) return;
                if (asset.name.toLowerCase().includes("rootfs")) return;
                const cleanName = cleanFileName(asset.name);
                if (!cleanName) return;
                builds.push({
                    displayName: cleanName,
                    originalName: asset.name,
                    category: getFirmwareCategory(asset.name),
                    device: getDeviceCategory(asset.name),
                    url: asset.browser_download_url,
                    size: asset.size || 0,
                    downloadCount: asset.download_count || 0,
                    publishedAt: rel.published_at || rel.created_at || null
                });
            });
        });

        if (builds.length === 0) throw new Error("Tidak ada firmware ditemukan");

        initWizard();

    } catch (error) {
        console.error("Error loading firmware data:", error);
        showError(error.message);
    }
}

// ================== WIZARD UI ==================
function initWizard() {
    const wizard = document.getElementById("wizard");
    if (!wizard) return;

    // Hitung jumlah firmware per device & kategori
    const deviceCounts = {};
    const firmwareCounts = {};
    builds.forEach(b => {
        deviceCounts[b.device] = (deviceCounts[b.device] || 0) + 1;
        firmwareCounts[b.category] = (firmwareCounts[b.category] || 0) + 1;
    });

    // Generate tombol kategori
    let categoryHTML = `<button class="category-btn active" data-category="all">Semua (${builds.length})</button>`;
    for (const [cat, _] of Object.entries(firmwareMap)) {
        const count = firmwareCounts[cat] || 0;
        categoryHTML += `<button class="category-btn" data-category="${cat}">${cat.toUpperCase()} (${count})</button>`;
    }

    // Generate tombol device
    let deviceHTML = `<button class="device-btn active" data-device="all">Semua</button>`;
    for (const [category, value] of Object.entries(deviceMap)) {
        if (typeof value === 'object') { // sub-device
            for (const subDevice in value) {
                const count = deviceCounts[subDevice] || 0;
                deviceHTML += `<button class="device-btn" data-device="${subDevice}">${subDevice.toUpperCase()} (${count})</button>`;
            }
        } else if (Array.isArray(value)) {
            const count = deviceCounts[category] || 0;
            deviceHTML += `<button class="device-btn" data-device="${category}">${category.toUpperCase()} (${count})</button>`;
        }
    }

    wizard.innerHTML = `
        <div class="step-card active">
            <label>Pilih Kategori Firmware:</label>
            <div class="category-buttons">${categoryHTML}</div>
        </div>
        <div class="step-card active">
            <label>Pilih Device:</label>
            <div class="device-buttons">${deviceHTML}</div>
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
        </div>
    `;

    setupEventHandlers();
}

// ================== EVENTS ==================
function setupEventHandlers() {
    const ul = document.querySelector(".firmware-list ul");
    const input = document.querySelector(".search-select input");
    if (!ul || !input) return;

    let currentCategory = "all";
    let currentDevice = "all";

    document.querySelectorAll(".category-btn").forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll(".category-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            currentCategory = btn.dataset.category;
            input.value = "";
            selectedFirmware = null;
            if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
            renderList("");
        };
    });

    document.querySelectorAll(".device-btn").forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll(".device-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            currentDevice = btn.dataset.device;
            input.value = "";
            selectedFirmware = null;
            if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
            renderList("");
        };
    });

    function renderList(filter = "") {
        ul.innerHTML = "";
        let filtered = builds;
        if (currentCategory !== "all") filtered = filtered.filter(b => b.category === currentCategory);
        if (currentDevice !== "all") filtered = filtered.filter(b => b.device === currentDevice);

        const searchFiltered = filtered.filter(b => b.displayName.toLowerCase().includes(filter.toLowerCase()))
            .sort((a,b) => new Date(b.publishedAt) - new Date(a.publishedAt));

        if (searchFiltered.length === 0) {
            ul.innerHTML = '<li style="text-align:center;color:var(--secondary-color);cursor:default;">Tidak ada firmware yang ditemukan</li>';
            return;
        }

        searchFiltered.forEach(b => {
            const li = document.createElement("li");
            li.innerHTML = `<div class="firmware-info">
                <div class="firmware-name">${b.displayName}</div>
                <div class="firmware-meta">
                    <span class="device-type">${b.device.toUpperCase()}</span>
                    <span class="file-size">Size: ${formatFileSize(b.size)}</span>
                    <span class="download-count">Downloads: ${formatDownloadCount(adjustDownloadCount(b.url, b.downloadCount))}</span>
                    <span class="release-date">Date: ${formatDate(b.publishedAt)}</span>
                </div>
            </div>`;
            li.onclick = () => {
                ul.querySelectorAll("li").forEach(li => li.classList.remove("selected"));
                li.classList.add("selected");
                selectedFirmware = b;
                updateSelectedSection();
                updateDownloadButton();
                if (getDownloadTimeLeft() > 0) startCountdown();
            };
            ul.appendChild(li);
        });
    }

    function updateSelectedSection() {
        const sel = document.querySelector(".selected-info");
        if (!sel) return;
        if (!selectedFirmware) {
            sel.innerHTML = '<div class="no-selection"><p>Pilih Firmware Terlebih Dahulu</p></div>';
            return;
        }
        sel.innerHTML = `<div class="firmware-selected">
            <strong>${selectedFirmware.displayName}</strong><br>
            <small>Category: ${selectedFirmware.category.toUpperCase()}</small><br>
            <small>Device: ${selectedFirmware.device.toUpperCase()}</small><br>
            <small style="color: var(--secondary-color);">File: ${selectedFirmware.originalName}</small><br>
            <span class="file-size">Size: ${formatFileSize(selectedFirmware.size)}</span>
            <span class="download-count">Downloads: ${formatDownloadCount(adjustDownloadCount(selectedFirmware.url, selectedFirmware.downloadCount))}</span>
            <span class="release-date">Date: ${formatDate(selectedFirmware.publishedAt)}</span>
        </div>`;
    }

    renderList();
    input.oninput = () => renderList(input.value);
}

// ================== DOWNLOAD HANDLER ==================
function handleDownload() {
    if (!selectedFirmware || !canDownload()) return;
    const key = `downloaded_${selectedFirmware.url}_${userIP}`;
    if (!localStorage.getItem(key)) localStorage.setItem(key, "true");
    setDownloadDelay();
    startCountdown();
    window.open(selectedFirmware.url, "_blank");
}

// ================== SEARCH ==================
function toggleSearch() {
    const sel = document.querySelector(".search-select");
    const btn = document.querySelector(".search-toggle-btn");
    if (!sel || !btn) return;
    if (sel.style.display === "none") {
        sel.style.display = "block"; btn.textContent = "Tutup"; btn.classList.add("active");
    } else {
        sel.style.display = "none"; btn.textContent = "Cari"; btn.classList.remove("active");
        const input = sel.querySelector("input"); if (input) { input.value = ""; input.dispatchEvent(new Event('input')); }
    }
}

// ================== INIT APP ==================
async function initApp() {
    try {
        await getUserIP();
        await loadData();
    } catch (err) {
        console.error(err);
        showError("Failed to initialize app");
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    await initApp();
    window.addEventListener('beforeunload', cleanup);
});
