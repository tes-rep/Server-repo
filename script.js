async function loadFirmware() {
  try {
    const response = await fetch("releases.json");
    const releases = await response.json();

    window.allFirmware = [];

    releases.forEach(release => {
      if (release.assets) {
        release.assets.forEach(asset => {
          const fw = {
            name: asset.name,
            url: asset.browser_download_url,
            size: (asset.size / 1024 / 1024).toFixed(2) + " MB",
            downloads: asset.download_count,
            category: release.name.includes("ImmortalWrt") ? "ImmortalWrt" : "OpenWrt",
            device: detectDevice(asset.name)
          };
          window.allFirmware.push(fw);
        });
      }
    });

    document.getElementById("firmwareCount").innerText = window.allFirmware.length;

    buildWizard(window.allFirmware);
    displayFirmware(window.allFirmware);

  } catch (error) {
    console.error("Gagal memuat releases.json", error);
  }
}

function detectDevice(filename) {
  const lower = filename.toLowerCase();
  const knownDevices = ["hg680p", "b860h", "s905x", "rk3328"];
  for (let dev of knownDevices) {
    if (lower.includes(dev)) return dev.toUpperCase();
  }
  const match = lower.match(/openwrt-(.*?)-/);
  return match ? match[1].toUpperCase() : "UNKNOWN";
}

function buildWizard(firmwares) {
  const wizard = document.getElementById("wizard");
  wizard.innerHTML = "";

  const categories = [...new Set(firmwares.map(fw => fw.category))];
  const devices = [...new Set(firmwares.map(fw => fw.device))];

  const step1 = document.createElement("div");
  step1.className = "step-card";
  step1.innerHTML = "<label>Pilih Kategori:</label>";
  const catBtns = document.createElement("div");
  catBtns.className = "category-buttons";
  categories.forEach(cat => {
    const btn = document.createElement("button");
    btn.innerText = cat;
    btn.className = "category-btn";
    btn.onclick = () => filterFirmware(cat, null);
    catBtns.appendChild(btn);
  });
  step1.appendChild(catBtns);
  wizard.appendChild(step1);

  const step2 = document.createElement("div");
  step2.className = "step-card";
  step2.innerHTML = "<label>Pilih Device:</label>";
  const devBtns = document.createElement("div");
  devBtns.className = "device-buttons";
  devices.forEach(dev => {
    const btn = document.createElement("button");
    btn.innerText = dev;
    btn.className = "device-btn";
    btn.onclick = () => filterFirmware(null, dev);
    devBtns.appendChild(btn);
  });
  step2.appendChild(devBtns);
  wizard.appendChild(step2);
}

function filterFirmware(category, device) {
  let filtered = window.allFirmware;
  if (category) filtered = filtered.filter(fw => fw.category === category);
  if (device) filtered = filtered.filter(fw => fw.device === device);
  displayFirmware(filtered);
}

function displayFirmware(firmwares) {
  const list = document.getElementById("firmware-list");
  list.innerHTML = "";
  if (firmwares.length === 0) {
    list.innerHTML = "<p>Tidak ada firmware ditemukan.</p>";
    return;
  }

  firmwares.forEach(fw => {
    const item = document.createElement("div");
    item.className = "fw-item";
    item.innerHTML = `
      <div>
        <strong>${fw.name}</strong><br>
        <small>Size: ${fw.size} | Downloads: ${fw.downloads} | Device: ${fw.device} | Kategori: ${fw.category}</small>
      </div>
      <button onclick="selectFirmware('${fw.url}')">Download</button>
    `;
    list.appendChild(item);
  });
}

function selectFirmware(url) {
  const section = document.getElementById("download-section");
  section.innerHTML = `
    <p>Firmware terpilih:</p>
    <a href="${url}" target="_blank"><button>⬇️ Download Sekarang</button></a>
  `;
}

document.getElementById("searchBtn").addEventListener("click", () => {
  const query = document.getElementById("searchInput").value.toLowerCase();
  const results = window.allFirmware.filter(fw => fw.name.toLowerCase().includes(query));
  displayFirmware(results);
});

loadFirmware();
