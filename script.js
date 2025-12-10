// --- State ---
let cameras = [];
let nextId = 1;

// Simulation Assets (colors for noise generation)
const noiseColors = ['#111', '#1a1a1a', '#0f0f0f'];

// --- Init ---
window.addEventListener('DOMContentLoaded', () => {
    // Seed initial cameras
    for (let i = 0; i < 1; i++) {
        addCameraState(`Sector ${i + 1}`, `192.168.1.10${i + 1}`, 'SIM');
    }
    renderGrid();
    startClocks();
    animationLoop();
});

// --- Core Functions ---

function addCameraState(name, url, type = 'SIM') {
    // Parse IP for display
    let ip = 'Unknown';
    if (type === 'SIM') ip = url || `192.168.1.${100 + nextId}`;
    else if (url) {
        try {
            // Try to extract IP/Host from URL
            const urlObj = new URL(url.startsWith('http') ? url : 'http://' + url);
            ip = urlObj.hostname;
        } catch (e) { ip = url; }
    }

    cameras.push({
        id: nextId++,
        name: name || `Camera ${nextId}`,
        ip: ip,
        url: url,
        type: type, // 'SIM', 'MJPEG', 'WEBRTC'
        isRecording: false,
        active: true,
        noiseOffset: Math.random() * 1000
    });
    updateHeaderCounts();
}

function toggleUrlPlaceholder() {
    const type = document.getElementById('new-cam-type').value;
    const input = document.getElementById('new-cam-url');
    const hint = document.getElementById('url-hint');

    if (type === 'MJPEG') {
        input.placeholder = 'http://192.168.1.X:8080/video';
        hint.innerText = 'Direct stream URL (mjpeg/jpg) for 0 Latency.';
    } else if (type === 'WEBRTC') {
        input.placeholder = 'http://192.168.1.X:8888/stream';
        hint.innerText = 'WebRTC or HLS Stream URL.';
    } else {
        input.placeholder = 'Optional IP Address';
        hint.innerText = 'Auto-generated visual noise.';
    }
}

function addNewCamera() {
    const nameIn = document.getElementById('new-cam-name');
    const typeIn = document.getElementById('new-cam-type');
    const urlIn = document.getElementById('new-cam-url');

    addCameraState(nameIn.value, urlIn.value, typeIn.value);
    renderGrid();
    closeModal('add-cam-modal');

    // Reset
    nameIn.value = '';
    urlIn.value = '';
}

function removeCamera(id) {
    cameras = cameras.filter(c => c.id !== id);
    renderGrid();
    updateHeaderCounts();
    renderSettingsList(); // refresh if open
}

function toggleCamera(id) {
    const cam = cameras.find(c => c.id === id);
    if (cam) {
        cam.active = !cam.active;
        renderGrid();
        updateHeaderCounts();
    }
}

function updateHeaderCounts() {
    document.getElementById('active-cams-count').innerText = cameras.filter(c => c.active).length;
}

// --- Rendering ---

function renderGrid() {
    const grid = document.getElementById('camera-grid');
    grid.innerHTML = '';

    const activeCams = cameras.filter(c => c.active);
    const count = activeCams.length;

    // Google Meet Style Layout Logic
    let columns = '';
    let rows = '';

    const mode = document.getElementById('layout-mode').value;

    if (mode === 'auto') {
        if (count === 1) {
            // 1 Cam: Full Screen (minus padding)
            columns = '1fr';
            rows = '1fr';
        } else if (count === 2) {
            // 2 Cams: Side by Side (50/50), Full Height
            columns = '1fr 1fr';
            rows = '1fr';
        } else if (count <= 4) {
            // 4 Cams: 2x2
            columns = '1fr 1fr';
            rows = '1fr 1fr';
        } else if (count <= 6) {
            columns = 'repeat(3, 1fr)';
            rows = 'repeat(2, 1fr)';
        } else if (count <= 9) {
            columns = 'repeat(3, 1fr)';
            rows = 'repeat(3, 1fr)';
        } else {
            columns = 'repeat(4, 1fr)';
            rows = 'auto'; // allow scroll for many
        }
    } else if (mode === '2col') {
        columns = '1fr 1fr';
    } else if (mode === '3col') {
        columns = 'repeat(3, 1fr)';
    } else if (mode === '4col') {
        columns = 'repeat(4, 1fr)';
    }

    grid.style.gridTemplateColumns = columns;
    // Only apply explicit rows for small counts to force height fill
    // For many cameras, let it overflow/scroll if needed or stick to auto
    if (count <= 9 && mode === 'auto') {
        grid.style.gridTemplateRows = rows;
    } else {
        grid.style.gridTemplateRows = 'auto';
    }

    // Render Cards
    activeCams.forEach(cam => {
        const card = document.createElement('div');
        card.className = 'cam-card';

        // Content Generator based on Type
        let feedContent = '';
        if (cam.type === 'SIM') {
            feedContent = `<canvas class="feed-canvas" id="canvas-${cam.id}"></canvas>`;
        } else if (cam.type === 'MJPEG') {
            // MJPEG is just an IMG tag that reloads effectively
            feedContent = `<img src="${cam.url}" class="feed-canvas" alt="NO SIGNAL" onerror="this.style.display='none'; this.nextElementSibling.style.display='block'">
                            <div class="no-signal-text" style="display:none; color:red;">COORD LOST</div>`;
        } else if (cam.type === 'WEBRTC') {
            // Generic Video tag setup
            feedContent = `<video src="${cam.url}" class="feed-canvas" autoplay playsinline muted loop onerror="this.style.display='none'; this.nextElementSibling.style.display='block'"></video>
                            <div class="no-signal-text" style="display:none; color:red;">STREAM ERROR</div>`;
        }

        card.innerHTML = `
            <div class="cam-header">
                <div>
                    <span class="cam-status online"></span>
                    <span class="cam-title">${cam.name}</span>
                    <span class="cam-ip">[${cam.ip}::${cam.type}]</span>
                </div>
                <div style="font-size: 0.8em; color: #444;">LIVE</div>
            </div>
            <div class="cam-feed" id="feed-container-${cam.id}">
                ${feedContent}
                <div class="scan-line"></div>
                <div class="feed-overlay">
                    <div class="rec-badge" id="rec-badge-${cam.id}" style="display: ${cam.isRecording ? 'block' : 'none'}">REC</div>
                </div>
                <div class="timestamp" id="time-${cam.id}">00:00:00</div>
                <div class="feed-controls">
                    <button class="icon-btn ${cam.isRecording ? 'active-rec' : ''}" onclick="toggleRec(${cam.id})" title="Record">●</button>
                    <button class="icon-btn" title="Snapshot">📷</button>
                    <button class="icon-btn" title="Audio">🔊</button>
                    <button class="icon-btn" onclick="openFullscreen(${cam.id})" title="Fullscreen">⛶</button>
                    <button class="icon-btn" onclick="openSettings(${cam.id})" title="Settings">⚙</button>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

function updateLayout() {
    renderGrid();
}

// --- Canvas Animation (Simulated Feed) ---
function animationLoop() {
    const activeCams = cameras.filter(c => c.active);

    // Main Grid
    activeCams.forEach(cam => {
        // Only valid for SIM or maybe noise overlay on others?
        // Current logic: drawNoise only works on canvas. MJPEG/WebRTC don't have canvas by default in grid unless SIM.
        // Actually, renderGrid puts canvas ONLY for SIM.
        if (cam.type === 'SIM') {
            const canvas = document.getElementById(`canvas-${cam.id}`);
            if (canvas) drawNoise(canvas, cam);
        }
    });

    // Fullscreen
    if (currentFullscreenId) {
        const cam = cameras.find(c => c.id === currentFullscreenId);
        // Only draw noise if it's SIM type in fullscreen
        if (cam && cam.type === 'SIM') {
            const fsCanvas = document.getElementById('fullscreen-canvas-render');
            if (fsCanvas) drawNoise(fsCanvas, cam, true);
        }
    }

    requestAnimationFrame(animationLoop);
}

function drawNoise(canvas, cam, highQuality = false) {
    const ctx = canvas.getContext('2d', { alpha: false }); // Optimize

    // Resize if needed
    const rect = canvas.parentElement.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
    }

    const w = canvas.width;
    const h = canvas.height;

    // Fill Background
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, w, h);

    // Draw "Video" Elements (Moving shapes to simulate activity)
    const time = Date.now() * 0.001;

    // 1. Grid
    ctx.strokeStyle = '#112';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < w; x += 50) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 0; y < h; y += 50) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();

    // 2. Moving Object (Simulate camera movement/subject)
    const xPos = (Math.sin(time + cam.id) * w / 3) + w / 2;
    const yPos = (Math.cos(time * 0.8 + cam.id) * h / 3) + h / 2;

    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(xPos, yPos, 40, 0, Math.PI * 2);
    ctx.fill();

    // 3. Noise / Grain
    // Optimization: Only update noise every few frames or use smaller pattern
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    // Super basic noise for "Signal" look
    // We'll just touch random pixels to be faster than iterating all
    for (let i = 0; i < (highQuality ? 4000 : 1000); i++) {
        const x = Math.floor(Math.random() * w);
        const y = Math.floor(Math.random() * h);
        const index = (y * w + x) * 4;
        const val = Math.random() * 50;
        data[index] = Math.min(255, data[index] + val);     // r
        data[index + 1] = Math.min(255, data[index + 1] + val); // g
        data[index + 2] = Math.min(255, data[index + 2] + val); // b
    }
    ctx.putImageData(imageData, 0, 0);

    // 4. Time Overlay (embedded in canvas for realism?) 
    // - Actually we use DOM overlay for crisp text, so skip here.
}


// --- Interaction Logic ---

function toggleRec(id) {
    const cam = cameras.find(c => c.id === id);
    if (cam) {
        cam.isRecording = !cam.isRecording;
        // Optimization: Don't re-render whole grid for just a badge
        const badge = document.getElementById(`rec-badge-${id}`);
        const btn = document.querySelector(`#feed-container-${id} .active-rec`); // getting complex, re-render is safer for single file
        renderGrid();
    }
}

let currentFullscreenId = null;

function openFullscreen(id) {
    currentFullscreenId = id;
    const cam = cameras.find(c => c.id === id);
    document.getElementById('fs-title').innerText = cam.name + " [FULL FEED]";

    const container = document.getElementById('fullscreen-feed-container');
    // Remove old content but keep timestamp
    const ts = document.getElementById('fs-timestamp');
    container.innerHTML = '';

    // Inject correct full player
    if (cam.type === 'SIM') {
        container.innerHTML = '<canvas id="fullscreen-canvas-render" style="width:100%; height:100%; object-fit:contain;"></canvas>';
    } else if (cam.type === 'MJPEG') {
        container.innerHTML = `<img src="${cam.url}" style="width:100%; height:100%; object-fit:contain;">`;
    } else {
        container.innerHTML = `<video src="${cam.url}" autoplay loop muted playsinline style="width:100%; height:100%; object-fit:contain;"></video>`;
    }
    container.appendChild(ts);

    openModal('fullscreen-modal');
}

function openSettings(id) {
    // Helper to scroll settings info for specific cam?
    // For now just general settings
    openModal('settings-modal');
}

// --- Modals ---

function openModal(id) {
    document.getElementById(id).classList.add('open');
    if (id === 'settings-modal') renderSettingsList();
}

function closeModal(id) {
    document.getElementById(id).classList.remove('open');
    if (id === 'fullscreen-modal') currentFullscreenId = null;
}

function renderSettingsList() {
    const list = document.getElementById('cam-list-settings');
    list.innerHTML = '';
    cameras.forEach(cam => {
        const item = document.createElement('div');
        item.className = 'camera-list-item';
        item.innerHTML = `
            <span>${cam.name} <small style="color:#666">(${cam.type})</small></span>
            <div>
                <button style="border:none; color: ${cam.active ? 'var(--cyan)' : '#444'};" onclick="toggleCamera(${cam.id})">
                    ${cam.active ? 'ON' : 'OFF'}
                </button>
                <button class="danger" style="border:none;" onclick="removeCamera(${cam.id})">DEL</button>
            </div>
        `;
        list.appendChild(item);
    });
}

// Click outside to close
window.onclick = function (event) {
    if (event.target.classList.contains('modal-overlay')) {
        event.target.classList.remove('open');
        if (event.target.id === 'fullscreen-modal') currentFullscreenId = null;
    }
}

// Escape key
window.onkeydown = function (e) {
    if (e.key === "Escape") {
        document.querySelectorAll('.modal-overlay').forEach(m => {
            m.classList.remove('open');
        });
        currentFullscreenId = null;
    }
}

// --- Clocks ---
function startClocks() {
    setInterval(() => {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
        const ms = String(now.getMilliseconds()).padStart(3, '0');

        // Main Clock
        document.getElementById('main-clock').innerText = `${timeStr}`; // .${ms.substring(0,2)}

        // Cam Clocks
        cameras.forEach(cam => {
            const el = document.getElementById(`time-${cam.id}`);
            if (el) el.innerText = `${timeStr}.${ms}`; // High precision for cameras
        });

        // FS Clock
        if (currentFullscreenId) {
            const el = document.getElementById('fs-timestamp');
            if (el) el.innerText = `${timeStr}.${ms}`;
        }

    }, 40); // 25fps update for clock
}
