const apiURL = "./releases.json";
let builds = [];
let selectedFirmware = null;
let userIP = null;
let countdownInterval = null;

async function getUserIP() {
    try {
        const response = await fetch("https://api64.ipify.org?format=json");
        const data = await response.json();
        userIP = data.ip;
    } catch (error) {
        userIP = "unknown";
    }
}

getUserIP();

function cleanFileName(filename) {
    let name = filename.replace(/\.(img\.gz|tar\.gz|tar\.xz|bin\.gz|img|bin|gz|tar|zip|xz|7z|bz2)$/gi, "");
    name = name.replace(/[-_]*By[-_]*Xidz[-_]*X[-_]*/gi, "").replace(/[-_]*xidz[-_]*x[-_]*/gi, "");
    name = name.replace(/[-_]{2,}/g, "-").replace(/[-_]+$/g, "").replace(/^[-_]+/g, "").trim();
    return name;
}

function getFirmwareCategory(filename) {
    const lower = filename.toLowerCase();
    return (lower.includes("immortalwrt") || lower.includes("immortal")) ? "immortalwrt" : "openwrt";
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDownloadCount(count) {
    if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
    if (count >= 1000) return (count / 1000).toFixed(1) + 'K';
    return count.toString();
}

function adjustDownloadCount(firmwareUrl, originalCount) {
    if (!userIP) return originalCount;
    const downloadedKey = `downloaded_${firmwareUrl}_${userIP}`;
    if (localStorage.getItem(downloadedKey)) {
        return originalCount > 0 ? originalCount - 1 : 0;
    }
    return originalCount;
}

function getDownloadTimeLeft() {
    if (!userIP) return 0;
    const key = `download_delay_${userIP}`;
    const lastDownload = localStorage.getItem(key);
    if (!lastDownload) return 0;
    const timeDiff = Date.now() - parseInt(lastDownload);
    const oneMinute = 1 * 60 * 1000;
    const timeLeft = oneMinute - timeDiff;
    return timeLeft > 0 ? timeLeft : 0;
}

function canDownload() {
    return getDownloadTimeLeft() === 0;
}

function setDownloadDelay() {
    if (!userIP) return;
    const key = `download_delay_${userIP}`;
    localStorage.setItem(key, Date.now().toString());
}

function formatTime(milliseconds) {
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = Math.floor((milliseconds % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function updateDownloadButton() {
    const downloadBtn = document.getElementById("downloadBtn");
    if (!selectedFirmware || !downloadBtn) return;
    
    const timeLeft = getDownloadTimeLeft();
    
    if (timeLeft > 0) {
        downloadBtn.textContent = `Tunggu... ${formatTime(timeLeft)}`;
        downloadBtn.className = "download-btn locked";
        downloadBtn.disabled = true;
        downloadBtn.style.pointerEvents = "none";
        downloadBtn.style.cursor = "not-allowed";
    } else {
        downloadBtn.textContent = "Download";
        downloadBtn.className = "download-btn unlocked";
        downloadBtn.disabled = false;
        downloadBtn.style.pointerEvents = "auto";
        downloadBtn.style.cursor = "pointer";
    }
}

function startCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);
    
    countdownInterval = setInterval(() => {
        updateDownloadButton();
        
        const timeLeft = getDownloadTimeLeft();
        if (timeLeft === 0) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
    }, 1000);
}

function initThemeSystem() {
    const savedTheme = localStorage.getItem('xidzs-theme') || 'neomorphism';
    applyTheme(savedTheme);
    document.querySelectorAll('.theme-button').forEach(btn => {
        btn.addEventListener('click', function() {
            applyTheme(this.dataset.theme);
            localStorage.setItem('xidzs-theme', this.dataset.theme);
        });
    });
}

function applyTheme(themeName) {
    document.body.classList.remove('theme-dark', 'theme-blue', 'theme-green', 'theme-purple');
    if (themeName !== 'neomorphism') {
        document.body.classList.add(`theme-${themeName}`);
    }
    document.querySelectorAll('.theme-button').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.theme === themeName) btn.classList.add('active');
    });
}

function showEmptyState(message) {
    const firmwareCountElement = document.getElementById("firmwareCount");
    const searchBtnElement = document.getElementById("searchBtn");
    const wizard = document.getElementById("wizard");
    
    if (firmwareCountElement) {
        firmwareCountElement.textContent = message;
    }
    if (searchBtnElement) {
        searchBtnElement.textContent = "Pencarian";
    }
    
    if (wizard) {
        wizard.innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 40px; color: #666;">
                <h3>${message}</h3>
                <p>Belum ada firmware yang tersedia saat ini.</p>
                <button onclick="loadData()" style="margin-top: 15px; padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    Refresh
                </button>
            </div>
        `;
    }
}

function showError(message) {
    const firmwareCountElement = document.getElementById("firmwareCount");
    const searchBtnElement = document.getElementById("searchBtn");
    const wizard = document.getElementById("wizard");
    
    if (firmwareCountElement) {
        firmwareCountElement.textContent = "Error loading firmware";
    }
    if (searchBtnElement) {
        searchBtnElement.textContent = "Pencarian";
    }
    
    if (wizard) {
        wizard.innerHTML = `
            <div class="error-message" style="text-align: center; padding: 40px; color: #ff6b6b;">
                <h3>Gagal memuat data firmware</h3>
                <p>Error: ${message}</p>
                <button onclick="loadData()" style="margin-top: 15px; padding: 10px 20px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    Coba Lagi
                </button>
            </div>
        `;
    }
}

async function loadData() {
    try {
        const res = await fetch(apiURL, { 
            cache: "no-cache",
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        
        const releases = await res.json();
        
        if (releases.message) {
            throw new Error(releases.message);
        }
        
        if (!Array.isArray(releases) || releases.length === 0) {
            showEmptyState("Tidak ada release ditemukan");
            return;
        }
        
        builds = [];
        releases.forEach(rel => {
            if (!rel.assets || rel.assets.length === 0) {
                return;
            }
            
            rel.assets.forEach(asset => {
                if (!asset.name || !asset.browser_download_url) return;
                if (!asset.name.match(/\.(img|bin|gz|tar|zip|xz|7z)$/i)) return;
                
                const cleanName = cleanFileName(asset.name);
                if (!cleanName) return;
                
                builds.push({
                    displayName: cleanName,
                    originalName: asset.name,
                    category: getFirmwareCategory(asset.name),
                    url: asset.browser_download_url,
                    size: asset.size || 0,
                    downloadCount: typeof asset.download_count === "number" ? asset.download_count : 0
                });
            });
        });
        
        if (builds.length === 0) {
            showEmptyState("Tidak ada firmware ditemukan");
            return;
        }
        
        const uniqueBuilds = [];
        const seen = new Set();
        builds.forEach(b => {
            const n = b.displayName.toLowerCase().trim();
            if (!seen.has(n) && n.length > 0) {
                seen.add(n);
                uniqueBuilds.push(b);
            }
        });
        builds = uniqueBuilds;
        
        const firmwareCountElement = document.getElementById("firmwareCount");
        const searchBtnElement = document.getElementById("searchBtn");
        
        if (firmwareCountElement) {
            firmwareCountElement.textContent = `${builds.length} Firmware Tersedia`;
        }
        if (searchBtnElement) {
            searchBtnElement.textContent = `Pencarian`;
        }
        
        initWizard();
        
    } catch (error) {
        console.error("Error loading firmware data:", error);
        showError(error.message);
    }
}

function initWizard() {
    const wizard = document.getElementById("wizard");
    if (!wizard) return;
    
    const allCount = builds.length;
    const openwrtCount = builds.filter(b => b.category === 'openwrt').length;
    const immortalCount = builds.filter(b => b.category === 'immortalwrt').length;
    
    wizard.innerHTML = `
        <div class="step-card active">
            <label>Pilih Kategori Firmware:</label>
            <div class="category-buttons">
                <button class="category-btn active" data-category="all">Semua (${allCount})</button>
                <button class="category-btn" data-category="openwrt">OpenWrt (${openwrtCount})</button>
                <button class="category-btn" data-category="immortalwrt">ImmortalWrt (${immortalCount})</button>
            </div>
        </div>
        <div class="step-card active">
            <div class="firmware-header">
                <label>Firmware:</label>
                <button class="search-toggle-btn" onclick="toggleSearch()">Cari</button>
            </div>
            <div class="search-select" style="display: none;">
                <input type="text" placeholder="Cari Firmware..." />
            </div>
            <div class="firmware-list"><ul></ul></div>
        </div>
        <div class="step-card active">
            <div class="locked-download-section">
                <div class="download-area">
                    <div class="selected-info">
                        <div class="no-selection"><p>Pilih firmware terlebih dahulu</p></div>
                    </div>
                    <div class="action-buttons">
                        <button class="download-btn locked" id="downloadBtn" onclick="handleDownload()">Download</button>
                        <div class="info-buttons">
                            <button class="info-btn" onclick="openModal('infoModal')">Informasi</button>
                            <button class="features-btn" onclick="openModal('featuresModal')">Features</button>
                            <button class="features-btn" onclick="openModal('aboutModal')">About</button>
                            <button class="sumber-btn" onclick="openModal('sumberModal')">Sumber & Credit</button>
                            <button class="changelog-btn" onclick="openModal('changelogModal')">Changelog</button>
                            <button class="owner-btn" onclick="openModal('ownerModal')">Owner</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    setupEventHandlers();
}

function setupEventHandlers() {
    const ul = document.querySelector(".firmware-list ul");
    const input = document.querySelector(".search-select input");
    
    if (!ul || !input) return;
    
    let currentCategory = "all";

    document.querySelectorAll(".category-btn").forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll(".category-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            currentCategory = btn.dataset.category;
            input.value = "";
            selectedFirmware = null;
            if (countdownInterval) {
                clearInterval(countdownInterval);
                countdownInterval = null;
            }
            updateDownloadSection();
            renderList("");
        };
    });

    function renderList(filter = "") {
        ul.innerHTML = "";
        let filtered = currentCategory === "all" ? builds : builds.filter(b => b.category === currentCategory);
        const searchFiltered = filtered.filter(b => b.displayName.toLowerCase().includes(filter.toLowerCase()))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));

        if (searchFiltered.length === 0) {
            ul.innerHTML = '<li style="text-align:center;color:var(--secondary-color);cursor:default;">Tidak ada firmware yang ditemukan</li>';
            return;
        }
        searchFiltered.forEach(b => {
            const li = document.createElement("li");
            li.innerHTML = `
                <div class="firmware-info">
                    <div class="firmware-name">${b.displayName}</div>
                    <div class="firmware-meta">
                        <span class="file-size">Size: ${formatFileSize(b.size)}</span>
                        <span class="download-count">Downloads: ${formatDownloadCount(adjustDownloadCount(b.url, b.downloadCount))}</span>
                    </div>
                </div>`;
            li.onclick = () => {
                ul.querySelectorAll("li").forEach(li => li.classList.remove("selected"));
                selectedFirmware = b;
                li.classList.add("selected");
                if (countdownInterval) {
                    clearInterval(countdownInterval);
                    countdownInterval = null;
                }
                updateDownloadSection();
                updateDownloadButton();
                
                const timeLeft = getDownloadTimeLeft();
                if (timeLeft > 0) {
                    startCountdown();
                }
            };
            ul.appendChild(li);
        });
    }

    function updateDownloadSection() {
        const selectedInfo = document.querySelector(".selected-info");
        const downloadBtn = document.getElementById("downloadBtn");
        
        if (!selectedInfo || !downloadBtn) return;
        
        if (selectedFirmware) {
            selectedInfo.innerHTML = `
                <div class="firmware-selected">
                    <div class="firmware-details">
                        <strong>${selectedFirmware.displayName}</strong><br>
                        <small>Category: ${selectedFirmware.category.toUpperCase()}</small><br>
                        <small style="color: var(--secondary-color);">File: ${selectedFirmware.originalName}</small>
                        <span class="file-size">Size: ${formatFileSize(selectedFirmware.size)}</span>
                        <span class="download-count">Downloads: ${formatDownloadCount(adjustDownloadCount(selectedFirmware.url, selectedFirmware.downloadCount))}</span>
                    </div>
                    <div class="download-url">${selectedFirmware.url}</div>
                </div>`;
            downloadBtn.textContent = "Download";
            downloadBtn.className = "download-btn unlocked";
        } else {
            selectedInfo.innerHTML = '<div class="no-selection"><p>Pilih firmware terlebih dahulu</p></div>';
            downloadBtn.textContent = "Download";
            downloadBtn.className = "download-btn locked";
        }
    }

    renderList();
    input.oninput = () => renderList(input.value);
    updateDownloadSection();
}

function handleDownload() {
    if (!selectedFirmware) return;
    
    if (!canDownload()) {
        return;
    }
    
    const downloadedKey = `downloaded_${selectedFirmware.url}_${userIP}`;
    const wasDownloaded = localStorage.getItem(downloadedKey);
    
    if (!wasDownloaded) {
        localStorage.setItem(downloadedKey, "true");
    }
    
    setDownloadDelay();
    startCountdown();
    
    window.open(selectedFirmware.url, "_blank");
}

function toggleSearch() {
    const searchSelect = document.querySelector(".search-select");
    const toggleBtn = document.querySelector(".search-toggle-btn");
    
    if (!searchSelect || !toggleBtn) return;
    
    if (searchSelect.style.display === "none") {
        searchSelect.style.display = "block";
        toggleBtn.textContent = "Tutup";
        toggleBtn.classList.add("active");
    } else {
        searchSelect.style.display = "none";
        toggleBtn.textContent = "Cari";
        toggleBtn.classList.remove("active");
        const input = searchSelect.querySelector("input");
        if (input) {
            input.value = "";
            input.dispatchEvent(new Event('input'));
        }
    }
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    const wizardContainer = document.querySelector('.wizard-container');
    
    if (!modal) return;
    
    if (wizardContainer) {
        wizardContainer.classList.add('blur-active');
    }
    modal.style.display = "block";
    setTimeout(() => modal.classList.add('show'), 10);
}

function closeModal(modal) {
    const wizardContainer = document.querySelector('.wizard-container');
    
    if (wizardContainer) {
        wizardContainer.classList.remove('blur-active');
    }
    modal.classList.remove('show');
    setTimeout(() => modal.style.display = "none", 300);
}

document.addEventListener("DOMContentLoaded", () => {
    initThemeSystem();
    
    const searchBtn = document.getElementById("searchBtn");
    if (searchBtn) {
        searchBtn.onclick = () => {
            const wizard = document.getElementById("wizard");
            if (wizard) {
                wizard.scrollIntoView({ behavior: 'smooth' });
            }
        };
    }
    
    document.querySelectorAll(".close").forEach(btn => {
        btn.onclick = function() { 
            const modal = this.closest(".modal");
            if (modal) closeModal(modal);
        };
    });
    
    window.onclick = e => {
        if (e.target.classList.contains("modal")) closeModal(e.target);
    };
});

loadData();