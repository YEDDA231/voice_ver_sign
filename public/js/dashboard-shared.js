/**
* VoiceVerSign – Shared dashboard logic (used by `dashboards/hearing.html`, `deaf.html`, `admin.html`).
 * Each page loads `js/dashboard-<role>.js` first to set `window.__VOICE_VER_SIGN_DASHBOARD__`, then this file.
 */

let sidebarCollapsed = localStorage.getItem("sidebarCollapsed") === "true";
let micActive = false;
let cameraActive = false;
let micStream = null;
let cameraStream = null;
let currentChatId = null;

const PREFS_KEY = "dashboardPreferences";
const USER_ROLE_KEY = "userRole";
const authPathPrefix = window.location.pathname.includes("/dashboards/") ? "../" : "";

/** @type {"hearing"|"deaf"|"admin"} */
let resolvedUserRole = "hearing";

/**
 * @type {{ role: "hearing"|"deaf"|"admin", defaultSection: string }}
 */
window.__VOICE_VER_SIGN_DASHBOARD__ = window.__VOICE_VER_SIGN_DASHBOARD__ || {
    role: "hearing",
    defaultSection: "voiceSign",
};

function getDashboardRuntimeConfig() {
    return window.__VOICE_VER_SIGN_DASHBOARD__ || { role: "hearing", defaultSection: "voiceSign" };
}

async function enforceDashboardRole(pageRole) {
    /* Redirect unauthenticated users unless they are accessing the guest dashboard */
    if (pageRole !== "guest" && !ApiClient.isLoggedIn()) {
        window.location.replace(authPathPrefix + "login.html");
        return;
    }
    if (!ApiClient.isLoggedIn()) {
        updateUserProfileUI();
        return;
    }
    try {
        const r = await ApiClient.getMe();
        const serverRole = r?.user?.userType;
        if (r?.user) {
            localStorage.setItem(USER_ROLE_KEY, serverRole || "hearing");
            localStorage.setItem("userType", serverRole || "hearing");
            localStorage.setItem("currentUser", JSON.stringify(r.user));
        }
        if (!serverRole || serverRole === pageRole) {
            if (pageRole === "hearing" && ApiClient.isLoggedIn()) {
                document.querySelector('[data-section="signVoice"]')?.remove();
                document.getElementById("signVoicePanel")?.remove();
                if (document.querySelector('.sidebar-nav-item.active[data-section="signVoice"]')) showSection('voiceSign');
            } else if (pageRole === "deaf" && ApiClient.isLoggedIn()) {
                document.querySelector('[data-section="voiceSign"]')?.remove();
                document.getElementById("voiceSignPanel")?.remove();
                if (document.querySelector('.sidebar-nav-item.active[data-section="voiceSign"]')) showSection('signVoice');
            }
            return;
        }
        /* Same directory as this page: `public/dashboards/*.html` */
        const map = {
            hearing: "hearing.html",
            deaf: "deaf.html",
            admin: "admin.html",
        };
        const target = map[serverRole] || map.hearing;
        if (!window.location.pathname.endsWith(target)) {
            window.location.replace(target);
        }
    } catch (e) {
        /* ignore */
    } finally {
        updateUserProfileUI();
    }
}

function updateUserProfileUI() {
    const isLoggedIn = ApiClient.isLoggedIn();
    const btn = document.querySelector('.user-profile-btn');
    const dropdown = document.getElementById('userProfileDropdown');

    if (!btn) return;

    if (!isLoggedIn) {
        btn.innerHTML = `
            <div class="user-avatar" style="background:var(--bg-hover); color:var(--text-secondary);">?</div>
            <div class="user-info">
                <span class="user-name">Guest User</span>
                <span class="user-plan">Click to Log In</span>
            </div>
        `;
        btn.onclick = () => window.location.href = authPathPrefix + 'login.html';
        if (dropdown) dropdown.style.display = 'none';
        return;
    }

    // Logged in
    btn.onclick = toggleUserProfileDropdown;
    if (dropdown) dropdown.style.display = '';

    let uName = 'Elias Amaba';
    let uHandle = '@keneyias666';
    let uInitials = 'EA';

    let uAvatarHtml = '';

    try {
        const raw = localStorage.getItem('currentUser');
        if (raw) {
            const uData = JSON.parse(raw);
            if (uData.firstName || uData.lastName) {
                uName = `${uData.firstName || ''} ${uData.lastName || ''}`.trim();
                uInitials = (uData.firstName?.[0] || '') + (uData.lastName?.[0] || '');
            } else if (uData.email) {
                uName = uData.email;
                uInitials = uData.email[0].toUpperCase();
            }
            if (uData.email) {
                uHandle = '@' + uData.email.split('@')[0];
            }
            if (uData.avatar) {
                /* Only accept data: URLs or relative paths to avoid javascript: / vbscript: schemes
                   and third-party tracking pixels. */
                const av = String(uData.avatar);
                if (/^(data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,|\/(?!\/)|[^:\/?#]+$)/i.test(av) && !av.toLowerCase().includes('javascript:')) {
                    uAvatarHtml = av;
                }
            }
        }
    } catch (e) { }

    const uType = localStorage.getItem('userType');
    if (uType === 'admin' && !uName) {
        uName = 'Administrator';
    }

    /* Render an avatar image safely — never via innerHTML so an attacker
       who has written to localStorage cannot inject markup. */
    function setAvatar(container, srcOrNull, fallbackText) {
        if (!container) return;
        while (container.firstChild) container.removeChild(container.firstChild);
        if (srcOrNull) {
            const img = document.createElement('img');
            img.src = srcOrNull;
            img.alt = '';
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.borderRadius = '50%';
            img.style.objectFit = 'cover';
            img.referrerPolicy = 'no-referrer';
            container.appendChild(img);
        } else if (fallbackText) {
            container.textContent = fallbackText;
        }
    }

    // Update Footer Button (Hearing / Deaf)
    const btnAvatar = btn ? btn.querySelector('.user-avatar') : null;
    const btnName = btn ? btn.querySelector('.user-name') : null;
    if (btnAvatar) setAvatar(btnAvatar, uAvatarHtml, uInitials);
    if (btnName) btnName.textContent = uName;

    // Update Dropdown Menu content
    if (dropdown) {
        const dropAvatar = dropdown.querySelector('.dropdown-header .user-avatar');
        const dropName = dropdown.querySelector('.dropdown-user-name');
        const dropEmail = dropdown.querySelector('.dropdown-user-email');
        if (dropAvatar) setAvatar(dropAvatar, uAvatarHtml, uInitials);
        if (dropName) dropName.textContent = uName;
        if (dropEmail) dropEmail.textContent = uHandle;
    }

    // Update Admin Topbar Name
    const topAdminName = document.getElementById('topbarAdminName');
    if (topAdminName) {
        topAdminName.textContent = uName;
    }
}

function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const dataUrl = e.target.result;
            const preview = document.getElementById('settingsAvatarPreview');
            const initials = document.getElementById('settingsAvatarInitials');
            if (preview) {
                preview.src = dataUrl;
                preview.style.display = 'block';
            }
            if (initials) initials.style.display = 'none';
            localStorage.setItem('tempAvatar', dataUrl);
        };
        reader.readAsDataURL(file);
    }
}

function saveUserProfile() {
    const fnEl = document.getElementById('profFirstName');
    const lnEl = document.getElementById('profLastName');
    const emEl = document.getElementById('profEmail');

    const fName = fnEl ? fnEl.value.trim() : '';
    const lName = lnEl ? lnEl.value.trim() : '';
    const email = emEl ? emEl.value.trim() : '';
    const avatar = localStorage.getItem('tempAvatar');

    let currentUser = {};
    try {
        currentUser = JSON.parse(localStorage.getItem('currentUser')) || {};
    } catch (e) { }

    currentUser.firstName = fName;
    currentUser.lastName = lName;
    currentUser.email = email;
    if (avatar) currentUser.avatar = avatar;

    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    localStorage.removeItem('tempAvatar');

    Toast.info("Profile updated successfully!");
    updateUserProfileUI();
}

function loadUserProfileSettings() {
    let currentUser = {};
    try {
        currentUser = JSON.parse(localStorage.getItem('currentUser')) || {};
    } catch (e) { }

    if (document.getElementById('profFirstName')) document.getElementById('profFirstName').value = currentUser.firstName || '';
    if (document.getElementById('profLastName')) document.getElementById('profLastName').value = currentUser.lastName || '';
    if (document.getElementById('profEmail')) document.getElementById('profEmail').value = currentUser.email || '';

    if (currentUser.avatar) {
        const preview = document.getElementById('settingsAvatarPreview');
        const initials = document.getElementById('settingsAvatarInitials');
        if (preview) {
            preview.src = currentUser.avatar;
            preview.style.display = 'block';
        }
        if (initials) {
            initials.style.display = 'none';
        }
    }
}

function applyDashboardPageConfig(cfg) {
    resolvedUserRole = cfg.role;
    const root = document.getElementById("dashboardRoot");
    document.documentElement.dataset.userRole = cfg.role;
    if (root) {
        root.dataset.userRole = cfg.role;
        root.classList.remove("dashboard--hearing", "dashboard--deaf", "dashboard--admin");
        if (cfg.role === "admin") root.classList.add("dashboard--admin");
        else if (cfg.role === "deaf") root.classList.add("dashboard--deaf");
        else root.classList.add("dashboard--hearing");
    }
    const banner = document.getElementById("roleBanner");
    if (banner) {
        const txt = {
            hearing: "Hearing dashboard: Voice → Sign first for speech-to-sign. Use Text chat for notes.",
            deaf: "Deaf / HoH dashboard: Sign → Voice first — camera and signing prioritized.",
            admin: "Admin dashboard: system overview and all translation flows.",
            guest: "Guest Dashboard: Try the translation demo! Log in or Sign up to save chats and unlock advanced features."
        };
        banner.textContent = txt[cfg.role] || txt.guest;
    }
}

async function loadAdminStats() {
    if (!document.getElementById("adminPanel")) return;
    try {
        const s = await ApiClient.getAdminStats();
        const set = (id, v) => {
            const el = document.getElementById(id);
            if (el) el.textContent = v != null ? String(v) : "—";
        };
        set("statUsersTotal", s.usersTotal);
        set("statChatsTotal", s.chatsTotal);
        set("statHearing", s.usersByType?.hearing);
        set("statDeaf", s.usersByType?.deaf);
    } catch (e) {
        Toast.error("Could not load admin statistics.");
    }
}

/* ══════════════════════════════════════════════════════════════════════════
   MIC LEVEL (Web Audio — animates when sound is captured)
   ══════════════════════════════════════════════════════════════════════════ */

let micAudioContext = null;
let micAnalyser = null;
let micSourceNode = null;
let micLevelRaf = null;

function getActiveMicStream() {
    if (micStream && micStream.getAudioTracks().some((t) => t.readyState === "live")) return micStream;
    if (pipelineVoiceSignMicStream && pipelineVoiceSignMicStream.getAudioTracks().some((t) => t.readyState === "live")) {
        return pipelineVoiceSignMicStream;
    }
    return null;
}

function stopMicLevelMeter() {
    if (micLevelRaf) {
        cancelAnimationFrame(micLevelRaf);
        micLevelRaf = null;
    }
    if (micSourceNode) {
        try {
            micSourceNode.disconnect();
        } catch (e) {
            /* ignore */
        }
        micSourceNode = null;
    }
    if (micAnalyser) {
        try {
            micAnalyser.disconnect();
        } catch (e) {
            /* ignore */
        }
        micAnalyser = null;
    }
    if (micAudioContext && micAudioContext.state !== "closed") {
        micAudioContext.close();
    }
    micAudioContext = null;
    document.querySelectorAll(".mic-level-meter").forEach((el) => el.classList.remove("mic-level-meter--active"));
}

function syncMicMeter() {
    const stream = getActiveMicStream();
    const ind = document.getElementById("micIndicator");
    if (ind) ind.classList.toggle("active", !!stream);
    if (!stream) {
        stopMicLevelMeter();
        return;
    }
    stopMicLevelMeter();
    try {
        micAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        micAnalyser = micAudioContext.createAnalyser();
        micAnalyser.fftSize = 256;
        micAnalyser.smoothingTimeConstant = 0.72;
        micSourceNode = micAudioContext.createMediaStreamSource(stream);
        micSourceNode.connect(micAnalyser);
        const buf = new Uint8Array(micAnalyser.frequencyBinCount);
        const tick = () => {
            if (!micAnalyser) return;
            micAnalyser.getByteFrequencyData(buf);
            let sum = 0;
            for (let i = 0; i < buf.length; i++) sum += buf[i];
            const avg = sum / buf.length / 255;
            document.querySelectorAll(".mic-level-meter").forEach((meter) => {
                meter.classList.add("mic-level-meter--active");
                meter.querySelectorAll(".mic-level-bar").forEach((bar, i) => {
                    const h = Math.min(1, avg * (1.1 + i * 0.12));
                    bar.style.setProperty("--mic-level", String(h));
                });
            });
            micLevelRaf = requestAnimationFrame(tick);
        };
        tick();
    } catch (e) {
        console.warn("Mic level meter:", e);
    }
}

/* ══════════════════════════════════════════════════════════════════════════
   SIDEBAR
   ══════════════════════════════════════════════════════════════════════════ */

function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
    localStorage.setItem("sidebarCollapsed", String(sidebarCollapsed));
    const sidebar = document.getElementById("sidebar") || document.querySelector(".maxton-sidebar");
    if (sidebar) sidebar.classList.toggle("collapsed", sidebarCollapsed);
}

function toggleUserProfileDropdown(event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    const dropdown = document.getElementById("userProfileDropdown");
    if (dropdown) {
        dropdown.classList.toggle("active");
    }
}

function toggleDropdown(element) {
    if (element) {
        element.classList.toggle("active");
        const icon = element.querySelector('span'); // usually contains ‹
        if (icon) {
            icon.textContent = element.classList.contains("active") ? "⌄" : "‹";
        }
    }
}

// Close the dropdown if clicking outside
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('userProfileDropdown');
    const btn = document.querySelector('.user-profile-btn');
    if (dropdown && dropdown.classList.contains('show')) {
        // Clicked outside, or clicked a functional menu item
        if (
            (!dropdown.contains(e.target) && (!btn || !btn.contains(e.target))) ||
            e.target.closest('.dropdown-item')
        ) {
            dropdown.classList.remove('show');
        }
    }
});

/* ══════════════════════════════════════════════════════════════════════════
   SECTION SWITCHING
   ══════════════════════════════════════════════════════════════════════════ */

function setDashboardTitle(title) {
    const el = document.getElementById("dashboardTitle");
    if (el) el.textContent = title;
}

/**
 * Main shell: Sign→Voice, Voice→Sign, Text chat, Preferences, Settings.
 * Header (#mainHeader) is hidden only for preferences/settings full-page panels.
 */
function showSection(section) {
    document.querySelectorAll(".sidebar-nav-item").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".section-panel").forEach((el) => el.classList.remove("visible"));

    const roleBanner = document.getElementById("roleBanner");
    if (roleBanner) {
        roleBanner.classList.toggle("section-hidden", section === "preferences" || section === "settings");
    }

    const mainHeader = document.getElementById("mainHeader");
    const chatBody = document.getElementById("chatBody");
    const composer = document.getElementById("mainComposer");

    if (section === "chat") {
        mainHeader?.classList.remove("section-hidden");
        chatBody?.classList.remove("section-hidden");
        composer?.classList.remove("section-hidden");
        document.querySelector('[data-section="chat"]')?.classList.add("active");
        setDashboardTitle("Text chat");
        return;
    }

    if (section === "signVoice") {
        mainHeader?.classList.remove("section-hidden");
        chatBody?.classList.add("section-hidden");
        composer?.classList.add("section-hidden");
        document.querySelector('[data-section="signVoice"]')?.classList.add("active");
        document.getElementById("signVoicePanel")?.classList.add("visible");
        setDashboardTitle("Sign → Voice");
        if (pipelineSignVoiceStream && pipelineSignVoiceLiveEnabled()) {
            pipelineStartRealtimeSignTranslation();
        }
        return;
    }

    pipelineStopRealtimeSignTranslation();

    if (section === "voiceSign") {
        mainHeader?.classList.remove("section-hidden");
        chatBody?.classList.add("section-hidden");
        composer?.classList.add("section-hidden");
        document.querySelector('[data-section="voiceSign"]')?.classList.add("active");
        document.getElementById("voiceSignPanel")?.classList.add("visible");
        setDashboardTitle("Voice → Sign");
        return;
    }

    if (section === "admin") {
        const ap = document.getElementById("adminPanel");
        if (!ap) {
            Toast.warning("Open the admin dashboard to use this section.");
            return;
        }
        mainHeader?.classList.remove("section-hidden");
        chatBody?.classList.add("section-hidden");
        composer?.classList.add("section-hidden");
        document.querySelector('[data-section="admin"]')?.classList.add("active");
        ap.classList.add("visible");
        setDashboardTitle("Admin");
        loadAdminStats();
        return;
    }

    if (section === "preferences" || section === "settings") {
        mainHeader?.classList.add("section-hidden");
        chatBody?.classList.add("section-hidden");
        composer?.classList.add("section-hidden");
        const activeBtn = document.querySelector(`[data-section="${section}"]`);
        if (activeBtn) activeBtn.classList.add("active");
        const panel = document.getElementById(`${section}Panel`);
        if (panel) panel.classList.add("visible");
        setDashboardTitle(section === "preferences" ? "Preferences" : "Settings");
    }
}

/* ══════════════════════════════════════════════════════════════════════════
   CAMERA
   ══════════════════════════════════════════════════════════════════════════ */

function syncCamera(isActive) {
    const panel = document.getElementById("cameraPanel");
    const btn = document.getElementById("cameraBtn");
    const preview = document.getElementById("cameraPreview");
    const dot = document.getElementById("cameraDot");
    const stateText = document.getElementById("cameraStateText");

    panel?.classList.toggle("active", isActive);
    btn?.classList.toggle("active", isActive);
    if (!isActive && preview) preview.srcObject = null;
    dot?.classList.toggle("live", isActive);

    if (stateText) {
        stateText.textContent = isActive ? "Live" : "Off";
        isActive ? stateText.removeAttribute("data-off") : stateText.setAttribute("data-off", "");
    }
}

/* ══════════════════════════════════════════════════════════════════════════
   MIC / CAMERA INPUT
   ══════════════════════════════════════════════════════════════════════════ */

async function handleInput(type) {
    const isMic = type === "mic";
    const nextState = isMic ? !micActive : !cameraActive;
    const btn = document.getElementById(isMic ? "micBtn" : "cameraBtn");

    try {
        if (isMic) {
            if (nextState) {
                micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            } else if (micStream) {
                micStream.getTracks().forEach((t) => t.stop());
                micStream = null;
            }
            document.getElementById("micIndicator")?.classList.toggle("active", nextState);
        } else {
            if (nextState) {
                cameraStream = await navigator.mediaDevices.getUserMedia({
                    video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
                });
                const video = document.getElementById("cameraPreview");
                if (video) video.srcObject = cameraStream;
                syncCamera(true);
            } else if (cameraStream) {
                cameraStream.getTracks().forEach((t) => t.stop());
                cameraStream = null;
                syncCamera(false);
            } else {
                syncCamera(false);
            }
        }

        const result = await ApiClient.toggleDevice(type, nextState);
        if (isMic) {
            micActive = result.active;
            document.getElementById("micIndicator")?.classList.toggle("active", micActive);
        } else {
            cameraActive = result.active;
            if (!cameraActive && cameraStream) {
                cameraStream.getTracks().forEach((t) => t.stop());
                cameraStream = null;
            }
            syncCamera(cameraActive);
        }

        btn?.classList.toggle("active", result.active);
        const label = isMic ? "Microphone" : "Camera";
        Toast.info(`${label} ${result.active ? "on" : "off"}.`);
        syncMicMeter();
    } catch (error) {
        if (isMic && micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }
        if (!isMic && cameraStream) { cameraStream.getTracks().forEach((t) => t.stop()); cameraStream = null; syncCamera(false); }
        document.getElementById("micIndicator")?.classList.remove("active");
        syncMicMeter();
        const label = isMic ? "Microphone" : "Camera";
        Toast.error(`${label} unavailable. Check browser permissions.`);
    }
}

/* ══════════════════════════════════════════════════════════════════════════
   CHAT MESSAGES
   ══════════════════════════════════════════════════════════════════════════ */

function removeWelcome() {
    const el = document.getElementById("welcomeCard");
    if (el) {
        el.style.opacity = "0";
        el.style.transform = "translateY(-8px)";
        el.style.transition = "opacity 0.2s, transform 0.2s";
        setTimeout(() => el.remove(), 200);
    }
}

function addMessage(role, text) {
    const body = document.getElementById("chatBody");
    if (!body) return;

    const msg = document.createElement("div");
    msg.className = `message ${role}`;

    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = role === "user" ? "U" : "V";

    const content = document.createElement("div");
    content.className = "message-content";
    content.textContent = text;

    msg.appendChild(avatar);
    msg.appendChild(content);
    body.appendChild(msg);
    body.scrollTop = body.scrollHeight;
}

async function sendMessage() {
    const input = document.getElementById("composerInput");
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    /* Defense in depth: cap message length client-side too. The HTML
       maxlength attribute handles most cases, but a malicious user
       could remove the attribute or call sendMessage from the console. */
    const MAX_MESSAGE_LEN = 2000;
    const safeText = text.length > MAX_MESSAGE_LEN ? text.substring(0, MAX_MESSAGE_LEN) : text;

    if (!ApiClient.isLoggedIn()) {
        let guestCount = parseInt(localStorage.getItem('guestMessageCount') || '0', 10);
        // Removed the 3-message guest limit for the test chat presentation
        localStorage.setItem('guestMessageCount', String(guestCount + 1));
    }

    removeWelcome();
    addMessage("user", safeText);
    input.value = "";

    // Auto-create a chat if none exists
    if (!currentChatId && ApiClient.isLoggedIn()) {
        try {
            const res = await ApiClient.createChat(safeText.substring(0, 40));
            if (res?.chat) {
                currentChatId = res.chat.id;
                addConversationToList(res.chat);
            }
        } catch (e) {
            console.warn("Could not create chat:", e);
        }
    }

    // Send to backend
    if (currentChatId && ApiClient.isLoggedIn()) {
        try {
            const res = await ApiClient.sendMessage(currentChatId, safeText);
            if (res?.assistantMessage) {
                addMessage("assistant", res.assistantMessage.content);
            }
        } catch (e) {
            addMessage("assistant", `Demo response for: "${safeText}"`);
        }
    } else {
        try {
            const r = await ApiClient.signsResolve(safeText);
            setTimeout(() => addMessage("assistant", r.message || "Looked up in FSL-105 and Collated."), 400);
        } catch (e) {
            setTimeout(
                () => addMessage("assistant", `I could not reach the sign catalog. You said: "${safeText}"`),
                400
            );
        }
    }
}

/* ══════════════════════════════════════════════════════════════════════════
   MODALS AND PRO FEATURES
   ══════════════════════════════════════════════════════════════════════════ */

function closeModals() {
    document.querySelectorAll('.modal-overlay').forEach(el => el.classList.add('hidden'));
}

function handleAttachClick() {
    if (!ApiClient.isLoggedIn()) {
        document.getElementById('guestBlockModal')?.classList.remove('hidden');
        return;
    }
    document.getElementById('proModal')?.classList.remove('hidden');
}

window.handleSubscribe = function (tier) {
    if (!ApiClient.isLoggedIn()) {
        closeModals();
        document.getElementById('guestBlockModal')?.classList.remove('hidden');
        return;
    }
    const payTierName = document.getElementById('payTierName');
    if (payTierName) payTierName.textContent = tier;
    closeModals();
    document.getElementById('paymentModal')?.classList.remove('hidden');
};

/* ══════════════════════════════════════════════════════════════════════════
   CONVERSATION LIST
   ══════════════════════════════════════════════════════════════════════════ */

function addConversationToList(chat) {
    const list = document.getElementById("chatList");
    if (!list) return;

    const empty = document.getElementById("chatListEmpty");
    if (empty) empty.remove();

    document.querySelectorAll(".chat-item").forEach((i) => i.classList.remove("active"));

    const row = document.createElement("div");
    row.className = "chat-item active";
    row.dataset.chatId = String(chat.id || "");

    const iconNS = "http://www.w3.org/2000/svg";
    const icon = document.createElementNS(iconNS, "svg");
    icon.setAttribute("class", "chat-item-icon");
    icon.setAttribute("fill", "none");
    icon.setAttribute("stroke", "currentColor");
    icon.setAttribute("viewBox", "0 0 24 24");
    const ip = document.createElementNS(iconNS, "path");
    ip.setAttribute("stroke-linecap", "round");
    ip.setAttribute("stroke-linejoin", "round");
    ip.setAttribute("stroke-width", "1.5");
    ip.setAttribute("d", "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z");
    icon.appendChild(ip);

    const name = document.createElement("span");
    name.className = "chat-item-name";
    name.textContent = chat.title || "New conversation";

    const actions = document.createElement("div");
    actions.className = "chat-item-actions";

    const pinBtn = document.createElement("button");
    pinBtn.type = "button";
    pinBtn.setAttribute("aria-label", "Pin conversation");
    pinBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        togglePin(pinBtn, row.dataset.chatId);
    });
    const pinSvg = document.createElementNS(iconNS, "svg");
    pinSvg.setAttribute("fill", "none");
    pinSvg.setAttribute("stroke", "currentColor");
    pinSvg.setAttribute("viewBox", "0 0 24 24");
    const pinP = document.createElementNS(iconNS, "path");
    pinP.setAttribute("stroke-linecap", "round");
    pinP.setAttribute("stroke-linejoin", "round");
    pinP.setAttribute("stroke-width", "2");
    pinP.setAttribute("d", "M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z");
    pinSvg.appendChild(pinP);
    pinBtn.appendChild(pinSvg);
    actions.appendChild(pinBtn);

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.setAttribute("aria-label", "Delete conversation");
    delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteChat(delBtn, row.dataset.chatId);
    });
    const delSvg = document.createElementNS(iconNS, "svg");
    delSvg.setAttribute("fill", "none");
    delSvg.setAttribute("stroke", "currentColor");
    delSvg.setAttribute("viewBox", "0 0 24 24");
    const delP = document.createElementNS(iconNS, "path");
    delP.setAttribute("stroke-linecap", "round");
    delP.setAttribute("stroke-linejoin", "round");
    delP.setAttribute("stroke-width", "2");
    delP.setAttribute("d", "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16");
    delSvg.appendChild(delP);
    delBtn.appendChild(delSvg);
    actions.appendChild(delBtn);

    row.appendChild(icon);
    row.appendChild(name);
    row.appendChild(actions);

    row.addEventListener("click", () => {
        document.querySelectorAll(".chat-item").forEach((i) => i.classList.remove("active"));
        row.classList.add("active");
        showSection("chat");
        loadChat(row.dataset.chatId);
    });

    list.prepend(row);
}

async function loadChat(chatId) {
    currentChatId = chatId;
    const body = document.getElementById("chatBody");
    if (!body) return;
    body.innerHTML = "";

    if (!ApiClient.isLoggedIn()) return;

    try {
        const res = await ApiClient.getMessages(chatId);
        if (res?.messages) {
            res.messages.forEach((m) => addMessage(m.role, m.content));
        }
    } catch (e) {
        console.warn("Could not load messages:", e);
    }
}

async function createNewChat() {
    if (!ApiClient.isLoggedIn()) {
        Toast.warning("Please log in to create conversations.");
        return;
    }

    try {
        const res = await ApiClient.createChat("New conversation");
        if (res?.chat) {
            currentChatId = res.chat.id;
            addConversationToList(res.chat);
            const body = document.getElementById("chatBody");
            if (body) body.innerHTML = "";
            showSection("chat");
            Toast.success("New conversation started.");
        }
    } catch (e) {
        Toast.error("Could not create conversation.");
    }
}

async function togglePin(button, chatId) {
    try {
        const res = await ApiClient.togglePinChat(chatId);
        const pinned = res?.chat?.pinned;
        Toast.info(pinned ? "Conversation pinned." : "Conversation unpinned.");
    } catch (e) {
        Toast.error("Could not pin conversation.");
    }
}

async function deleteChat(button, chatId) {
    const row = button.closest(".chat-item");

    try {
        await ApiClient.deleteChat(chatId);
        if (row) {
            row.style.opacity = "0";
            row.style.transform = "translateX(-8px)";
            row.style.transition = "opacity 0.2s, transform 0.2s";
            setTimeout(() => row.remove(), 200);
        }
        if (currentChatId === chatId) {
            currentChatId = null;
            const body = document.getElementById("chatBody");
            if (body) body.innerHTML = "";
        }
        Toast.success("Conversation deleted.");
    } catch (e) {
        Toast.error("Could not delete conversation.");
    }
}

/* ══════════════════════════════════════════════════════════════════════════
   PREFERENCES
   ══════════════════════════════════════════════════════════════════════════ */

function getDefaultPrefs() {
    return {
        autoplay: false,
        cameraDefault: false,
        compactChat: false,
        smoothMotion: true,
        sound: false,
        highContrast: false,
        reducedMotion: false,
        language: "English",
        responseStyle: "balanced",
        cameraQuality: "balanced",
    };
}

function loadPrefsToForm() {
    const defaults = getDefaultPrefs();
    let prefs = { ...defaults };
    const saved = localStorage.getItem(PREFS_KEY);
    if (saved) {
        try { prefs = { ...defaults, ...JSON.parse(saved) }; } catch (e) { }
    }

    const map = {
        prefAutoplay: "autoplay",
        prefCameraDefault: "cameraDefault",
        prefCompactChat: "compactChat",
        prefSmoothMotion: "smoothMotion",
        prefSound: "sound",
        prefHighContrast: "highContrast",
        prefReducedMotion: "reducedMotion",
    };

    for (const [elId, key] of Object.entries(map)) {
        const el = document.getElementById(elId);
        if (el) el.checked = !!prefs[key];
    }

    const selects = { prefLanguage: "language", prefResponseStyle: "responseStyle", prefCameraQuality: "cameraQuality" };
    for (const [elId, key] of Object.entries(selects)) {
        const el = document.getElementById(elId);
        if (el) el.value = prefs[key] || defaults[key];
    }

    return prefs;
}

function applyPrefsVisuals(prefs) {
    document.body.classList.toggle("high-contrast", !!prefs.highContrast);
    document.body.classList.toggle("reduced-motion", !!prefs.reducedMotion);
    const chatBody = document.getElementById("chatBody");
    if (chatBody) {
        chatBody.style.maxWidth = prefs.compactChat ? "min(880px, 100%)" : "";
        chatBody.style.margin = prefs.compactChat ? "0 auto" : "";
    }
}

async function savePreferencesSettings() {
    const prefs = {
        autoplay: !!document.getElementById("prefAutoplay")?.checked,
        cameraDefault: !!document.getElementById("prefCameraDefault")?.checked,
        compactChat: !!document.getElementById("prefCompactChat")?.checked,
        smoothMotion: !!document.getElementById("prefSmoothMotion")?.checked,
        sound: !!document.getElementById("prefSound")?.checked,
        highContrast: !!document.getElementById("prefHighContrast")?.checked,
        reducedMotion: !!document.getElementById("prefReducedMotion")?.checked,
        language: document.getElementById("prefLanguage")?.value || "English",
        responseStyle: document.getElementById("prefResponseStyle")?.value || "balanced",
        cameraQuality: document.getElementById("prefCameraQuality")?.value || "balanced",
    };

    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    applyPrefsVisuals(prefs);
    Toast.info('Preferences saved successfully!');

    if (ApiClient.isLoggedIn()) {
        try { await ApiClient.savePreferences(prefs); } catch (e) { }
    }

    Toast.success("Preferences saved.");
}

/* ══════════════════════════════════════════════════════════════════════════
   SETTINGS / SESSION
   ══════════════════════════════════════════════════════════════════════════ */

function signOutApp() {
    ApiClient.clearToken();
    try {
        localStorage.removeItem("userRole");
    } catch (e) {
        /* ignore */
    }
    Toast.info("Signed out.");
    setTimeout(() => {
        window.location.href = authPathPrefix + "login.html";
    }, 400);
}

/* ══════════════════════════════════════════════════════════════════════════
   PIPELINE FLOWS (conceptual diagram: Sign→Voice · Voice→Sign)
   ══════════════════════════════════════════════════════════════════════════ */

let pipelineSignVoiceStream = null;
let pipelineVoiceSignMicStream = null;
let pipelineSignRecording = false;
let pipelineRealtimeActive = false;
let pipelineRealtimeProcessing = false;
let pipelineRealtimeCaptureTimer = null;
let pipelineRealtimeProcessTimer = null;
let pipelineRealtimeFrames = [];
let pipelineLastEmittedSign = "";
let pipelineLastEmitAt = 0;
let pipelineVoiceSpeech = null;
let pipelineVoiceSpeechActive = false;
let pipelineSignClipTimer = null;
let pipelineLandmarkBuffer = [];

const PIPELINE_REALTIME_CAPTURE_MS = 80;
const PIPELINE_REALTIME_PROCESS_MS = 900;
const PIPELINE_REALTIME_EMIT_COOLDOWN_MS = 2200;
const PIPELINE_MIN_CONFIDENCE = 0.35;

async function pipelineVerifyVisionBackend() {
    const pill = document.getElementById("signVoiceApiStatus");
    if (!pill) return false;

    pill.classList.remove("ok", "error");
    pill.textContent = "Checking server…";

    try {
        const res = await ApiClient.pipelineStatus();
        const vision = res?.flows?.sign_to_voice?.vision;
        const ready = Boolean(res?.flows?.sign_to_voice?.ready && vision?.ready);
        if (ready) {
            pill.textContent = "Live · FSL-105 + Collated";
            pill.classList.add("ok");
            pipelineSignVoiceStatusNote(vision?.message || "Live recognition is on.");
            return true;
        }
        pill.textContent = vision?.message || "Vision pipeline not ready on server";
        pill.classList.add("error");
        pipelineSignVoiceStatusNote(vision?.message || "Install vision packages and download the hand model.");
        return false;
    } catch (err) {
        pill.textContent = "Server offline — run: python app.py";
        pill.classList.add("error");
        pipelineSignVoiceStatusNote(
            "Cannot reach the API. Start the server from the voice_ver_sign folder: python app.py — then open http://127.0.0.1:5000 (not a file:// URL)."
        );
        return false;
    }
}

function pipelineWaitForVideoReady(video, timeoutMs = 4000) {
    return new Promise((resolve) => {
        if (!video) {
            resolve(false);
            return;
        }
        if (video.videoWidth > 0 && video.readyState >= 2) {
            resolve(true);
            return;
        }
        const done = () => resolve(video.videoWidth > 0 && video.readyState >= 2);
        video.addEventListener("loadedmetadata", done, { once: true });
        video.addEventListener("loadeddata", done, { once: true });
        setTimeout(done, timeoutMs);
    });
}

function pipelineBrightenCanvas(ctx, width, height) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const pixels = imageData.data;
    // Measure average brightness using a subset of pixels to be fast
    let total = 0;
    const step = 8; // Sample every 8th pixel (64x faster sampling)
    let samples = 0;
    for (let i = 0; i < pixels.length; i += 4 * step) {
        total += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
        samples++;
    }
    const avgBrightness = samples > 0 ? (total / samples) : 120;

    // Adaptive enhancement based on how dark the frame is
    let alpha, beta, gamma;
    if (avgBrightness < 40) {
        // Extremely dark — maximum boost
        alpha = 3.0; beta = 90; gamma = 2.5;
    } else if (avgBrightness < 70) {
        // Very dark
        alpha = 2.2; beta = 65; gamma = 2.0;
    } else if (avgBrightness < 100) {
        // Dark
        alpha = 1.7; beta = 45; gamma = 1.5;
    } else {
        // Moderate/good lighting — mild boost
        alpha = 1.3; beta = 20; gamma = 1.1;
    }

    // Precompute gamma lookup table (LUT) to avoid Math.pow for every pixel
    const lut = new Uint8Array(256);
    const invGamma = 1.0 / gamma;
    for (let val = 0; val < 256; val++) {
        // Apply linear contrast + brightness
        const enhanced = Math.min(255, Math.max(0, val * alpha + beta));
        // Apply gamma correction
        lut[val] = Math.min(255, 255 * Math.pow(enhanced / 255, invGamma));
    }

    // Apply LUT to all pixels
    for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] = lut[pixels[i]];
        pixels[i + 1] = lut[pixels[i + 1]];
        pixels[i + 2] = lut[pixels[i + 2]];
    }
    ctx.putImageData(imageData, 0, 0);
}

function pipelineCaptureFrameBase64() {
    const video = document.getElementById("signVoiceVideo");
    const canvas = document.getElementById("signVoiceCanvas");
    if (!video?.srcObject || !canvas) return "";
    if (!video.videoWidth || video.readyState < 2) return "";

    const ctx = canvas.getContext("2d");
    const w = video.videoWidth;
    const h = video.videoHeight;
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(video, 0, 0, w, h);
    // Send raw frame to server to preserve contrast. Server handles image enhancement.
    // pipelineBrightenCanvas(ctx, w, h);
    return canvas.toDataURL("image/jpeg", 0.92).split(",")[1] || "";
}

function pipelineUpdateHandTrackingBadge(handsDetected) {
    const badge = document.getElementById("signVoiceHandBadge");
    if (!badge) return;
    const count = Number(handsDetected) || 0;
    if (count > 0) {
        badge.textContent = `${count} hand${count === 1 ? "" : "s"} tracked`;
        badge.classList.add("active");
    } else {
        badge.textContent = "No hand in frame";
        badge.classList.remove("active");
    }
}

function pipelineSignVoiceShouldAppend() {
    const el = document.getElementById("signVoiceAppend");
    return el ? el.checked : true;
}

function pipelineSignVoiceShouldAutoSpeak() {
    const el = document.getElementById("signVoiceAutoSpeak");
    return el ? el.checked : true;
}

function pipelineSignVoiceShouldAddToChat() {
    const el = document.getElementById("signVoiceAddToChat");
    return el ? el.checked : true;
}

function pipelineSignVoiceLiveEnabled() {
    const el = document.getElementById("signVoiceLiveMode");
    return el ? el.checked : true;
}

function pipelineSignVoiceStatusNote(message) {
    const note = document.getElementById("signVoiceApiNote");
    if (note) note.textContent = message;
}

function pipelineApplyRecognizeResult(res, ta, note) {
    const text = (res?.text || "").trim();
    const confidence = typeof res.confidence === "number" ? Math.round(res.confidence * 100) : null;

    if (note) {
        const parts = [];
        if (pipelineRealtimeActive) parts.push("Live");
        if (text && confidence !== null) parts.push(`${confidence}% confidence`);
        if (res.message) parts.push(String(res.message));
        if (res.handsDetected != null) parts.push(`${res.handsDetected} hand(s) detected`);
        note.textContent = parts.length ? parts.join(" · ") : "Hold a clear sign in front of the camera.";
    }
    pipelineUpdateHandTrackingBadge(res?.handsDetected);

    if (!ta) return text;

    if (text) {
        if (pipelineSignVoiceShouldAppend()) {
            const current = ta.value.trim();
            if (!current) ta.value = text;
            else if (!current.endsWith(text)) ta.value = `${current} ${text}`;
        } else {
            ta.value = text;
        }
    }
    return text;
}

async function pipelinePostSignTranslationToChat(text) {
    const cleaned = (text || "").trim();
    if (!cleaned) return;

    const display = `🖐️ ${cleaned}`;
    removeWelcome();
    addMessage("user", display);

    if (!currentChatId && ApiClient.isLoggedIn()) {
        try {
            const res = await ApiClient.createChat(`Sign: ${cleaned.substring(0, 36)}`);
            if (res?.chat) {
                currentChatId = res.chat.id;
                addConversationToList(res.chat);
            }
        } catch (e) {
            console.warn("Could not create chat for sign:", e);
        }
    }

    if (currentChatId && ApiClient.isLoggedIn()) {
        try {
            const res = await ApiClient.sendMessage(currentChatId, `[Sign] ${cleaned}`);
            if (res?.assistantMessage) {
                addMessage("assistant", res.assistantMessage.content);
            }
        } catch (e) {
            addMessage("assistant", `I understood your sign as "${cleaned}".`);
        }
    } else {
        setTimeout(
            () =>
                addMessage(
                    "assistant",
                    `Sign recognized: "${cleaned}" — text and voice sent for the hearing person.`
                ),
            450
        );
    }
}

async function pipelineEmitSignTranslation(text, res) {
    const cleaned = (text || "").trim();
    if (!cleaned) return;

    const now = Date.now();
    const confidence = typeof res?.confidence === "number" ? res.confidence : 0;
    if (confidence < PIPELINE_MIN_CONFIDENCE) return;

    const isNew = cleaned !== pipelineLastEmittedSign;
    const cooledDown = now - pipelineLastEmitAt >= PIPELINE_REALTIME_EMIT_COOLDOWN_MS;
    if (!isNew || !cooledDown) return;

    pipelineLastEmittedSign = cleaned;
    pipelineLastEmitAt = now;

    if (pipelineSignVoiceShouldAutoSpeak()) {
        await pipelineSignVoiceSpeak(cleaned);
    }
    if (pipelineSignVoiceShouldAddToChat()) {
        await pipelinePostSignTranslationToChat(cleaned);
    }
}

function pipelineStartRealtimeSignTranslation() {
    if (pipelineRealtimeActive) return;
    const video = document.getElementById("signVoiceVideo");
    if (!video?.srcObject || !pipelineSignVoiceLiveEnabled()) return;

    pipelineRealtimeActive = true;
    pipelineRealtimeFrames = [];
    pipelineLandmarkBuffer = [];
    pipelineLastEmittedSign = "";
    pipelineLastEmitAt = 0;
    if (window.SignLive) SignLive.start(video);

    const liveDot = document.getElementById("svLiveDot");
    liveDot?.classList.add("live");

    pipelineRealtimeCaptureTimer = setInterval(() => {
        const frame = pipelineCaptureFrameBase64();
        if (frame) {
            pipelineRealtimeFrames.push(frame);
            if (pipelineRealtimeFrames.length > 15) pipelineRealtimeFrames.shift();
        }
        const snap = window.SignLive?.snapshot?.();
        if (snap?.landmarks) {
            pipelineLandmarkBuffer.push(snap.landmarks);
            if (pipelineLandmarkBuffer.length > 16) pipelineLandmarkBuffer.shift();
            pipelineUpdateHandTrackingBadge(snap.handsDetected);
        }
    }, PIPELINE_REALTIME_CAPTURE_MS);

    pipelineRealtimeProcessTimer = setInterval(() => {
        pipelineProcessRealtimeBatch();
    }, PIPELINE_REALTIME_PROCESS_MS);

    pipelineSignVoiceStatusNote("Live translation active — sign naturally; text, voice, and chat update automatically.");
    setTimeout(() => pipelineProcessRealtimeBatch(), 400);
}

function pipelineStopRealtimeSignTranslation() {
    pipelineRealtimeActive = false;
    if (pipelineRealtimeCaptureTimer) clearInterval(pipelineRealtimeCaptureTimer);
    if (pipelineRealtimeProcessTimer) clearInterval(pipelineRealtimeProcessTimer);
    pipelineRealtimeCaptureTimer = null;
    pipelineRealtimeProcessTimer = null;
    pipelineRealtimeFrames = [];
    pipelineLandmarkBuffer = [];
    pipelineRealtimeProcessing = false;
    window.SignLive?.stop?.();

    const liveDot = document.getElementById("svLiveDot");
    liveDot?.classList.remove("live");
}

function pipelineBuildRecognizeBody(extra) {
    const body = { ...(extra || {}) };
    if (pipelineLandmarkBuffer.length) {
        body.landmarkFrames = pipelineLandmarkBuffer.slice(-8);
        body.landmarks = pipelineLandmarkBuffer[pipelineLandmarkBuffer.length - 1];
    }
    const snap = window.SignLive?.snapshot?.();
    if (snap?.landmarks && !body.landmarks) {
        body.landmarks = snap.landmarks;
    }
    return body;
}

async function pipelineProcessRealtimeBatch() {
    if (!pipelineRealtimeActive || pipelineSignRecording || pipelineRealtimeProcessing) return;
    const frames = pipelineRealtimeFrames.slice(-12);
    const hasLandmarks = pipelineLandmarkBuffer.length > 0 || window.SignLive?.snapshot?.()?.landmarks;
    if (frames.length < 2 && !hasLandmarks) return;

    pipelineRealtimeProcessing = true;
    const ta = document.getElementById("signVoiceText");
    const note = document.getElementById("signVoiceApiNote");

    try {
        const res = await ApiClient.pipelineSignRecognize(pipelineBuildRecognizeBody({ frames }));
        const text = pipelineApplyRecognizeResult(res, ta, note);
        if (text) {
            await pipelineEmitSignTranslation(text, res);
        }
    } catch (err) {
        const msg = err?.message || String(err);
        console.warn("Live sign recognition:", err);
        pipelineSignVoiceStatusNote(`Recognition error: ${msg}`);
        const pill = document.getElementById("signVoiceApiStatus");
        if (pill) {
            pill.textContent = "Server error — see note below";
            pill.classList.remove("ok");
            pill.classList.add("error");
        }
    } finally {
        pipelineRealtimeProcessing = false;
    }
}

function pipelineToggleLiveSignMode() {
    if (pipelineSignVoiceLiveEnabled()) {
        pipelineStartRealtimeSignTranslation();
        Toast.success("Live translation on.");
    } else {
        pipelineStopRealtimeSignTranslation();
        pipelineSignVoiceStatusNote("Live translation paused — turn it on to translate signs automatically.");
        Toast.info("Live translation paused.");
    }
}

async function pipelinePlaySignVoiceTts(res, text) {
    const spoken = (text || "").trim();
    if (!spoken) return;

    if (res?.audioBase64) {
        const mime = res.audioMimeType || "audio/wav";
        const audio = new Audio(`data:${mime};base64,${res.audioBase64}`);
        await audio.play();
        return;
    }

    if ("speechSynthesis" in window) {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(spoken);
        u.lang = "en-US";
        speechSynthesis.speak(u);
    }
}

async function pipelineToggleCamera() {
    const video = document.getElementById("signVoiceVideo");
    const dot = document.getElementById("svCameraDot");
    if (pipelineSignVoiceStream) {
        pipelineStopRealtimeSignTranslation();
        pipelineSignVoiceStream.getTracks().forEach((t) => t.stop());
        pipelineSignVoiceStream = null;
        if (video) video.srcObject = null;
        dot?.classList.remove("live");
        Toast.info("Camera off.");
        return;
    }
    try {
        pipelineSignVoiceStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
        });
        if (video) {
            video.srcObject = pipelineSignVoiceStream;
            await pipelineWaitForVideoReady(video);
            if (window.SignLive) await SignLive.start(video);
        }
        dot?.classList.add("live");
        const backendOk = await pipelineVerifyVisionBackend();
        if (!backendOk) {
            Toast.error("Sign datasets are not ready — see status under Automatic options.");
        } else {
            Toast.success("Camera on — live FSL-105 / Collated translation starting…");
        }
        if (pipelineSignVoiceStream && pipelineSignVoiceLiveEnabled() && backendOk) {
            pipelineStartRealtimeSignTranslation();
        }
    } catch (e) {
        Toast.error("Camera unavailable. Allow permission or use HTTPS.");
    }
}

function getVoiceSignTranscriptEl() {
    return document.getElementById("voiceSignTranscript") || document.getElementById("voiceSignText");
}

function getVoiceSignImageEls() {
    let img = document.getElementById("voiceSignImage");
    let ph = document.getElementById("voiceSignImagePh");
    const wrap =
        document.getElementById("voiceSignImageWrap") || document.getElementById("voiceSignImageContainer");
    if (!img && wrap) {
        wrap.innerHTML = "";
        img = document.createElement("img");
        img.id = "voiceSignImage";
        img.className = "pipeline-sign-img";
        img.alt = "Sign visualization";
        img.style.display = "none";
        ph = document.createElement("p");
        ph.id = "voiceSignImagePh";
        ph.className = "pipeline-image-placeholder";
        wrap.appendChild(img);
        wrap.appendChild(ph);
    }
    return { img, ph, wrap };
}

function pipelineShowSignMatches(matches) {
    const { img, ph } = getVoiceSignImageEls();
    if (pipelineSignClipTimer) {
        clearInterval(pipelineSignClipTimer);
        pipelineSignClipTimer = null;
    }
    if (!matches?.length) {
        if (img) img.style.display = "none";
        if (ph) {
            ph.style.display = "block";
            ph.textContent = "No matching FSL-105 or Collated sign.";
        }
        return;
    }
    let i = 0;
    const show = () => {
        const m = matches[i % matches.length];
        if (img && m.imageUrl) {
            img.src = m.imageUrl;
            img.alt = m.label || "Sign";
            img.style.display = "block";
        }
        if (ph) {
            ph.style.display = "block";
            ph.textContent = m.category ? `${m.label} · ${m.category}` : String(m.label || "");
        }
        i += 1;
    };
    show();
    if (matches.length > 1) {
        pipelineSignClipTimer = setInterval(show, 1400);
    }
}

function pipelineStopSpeechToText() {
    pipelineVoiceSpeechActive = false;
    try {
        pipelineVoiceSpeech?.stop();
    } catch (e) {
        /* ignore */
    }
}

function pipelineStartSpeechToText() {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
        Toast.error("Speech-to-text needs Chrome or Edge.");
        return false;
    }
    pipelineStopSpeechToText();
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (event) => {
        let finalText = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
                finalText += event.results[i][0].transcript;
            }
        }
        if (!finalText) return;
        const ta = getVoiceSignTranscriptEl();
        if (ta) ta.value = `${(ta.value || "").trim()} ${finalText.trim()}`.trim();
        pipelineVoiceSignRender();
    };
    rec.onend = () => {
        if (pipelineVoiceSpeechActive) {
            try {
                rec.start();
            } catch (e) {
                /* ignore */
            }
        }
    };
    pipelineVoiceSpeech = rec;
    pipelineVoiceSpeechActive = true;
    rec.start();
    return true;
}

async function pipelineToggleMic() {
    const dot = document.getElementById("vsMicDot");
    if (pipelineVoiceSignMicStream) {
        pipelineStopSpeechToText();
        pipelineVoiceSignMicStream.getTracks().forEach((t) => t.stop());
        pipelineVoiceSignMicStream = null;
        dot?.classList.remove("live");
        Toast.info("Microphone off.");
        syncMicMeter();
        return;
    }
    try {
        pipelineVoiceSignMicStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        dot?.classList.add("live");
        const started = pipelineStartSpeechToText();
        Toast.success(started ? "Microphone on — speak to transcribe." : "Microphone on.");
        syncMicMeter();
    } catch (e) {
        Toast.error("Microphone unavailable.");
        syncMicMeter();
    }
}

async function pipelineSignVoiceRecognize() {
    const video = document.getElementById("signVoiceVideo");
    const ta = document.getElementById("signVoiceText");
    const note = document.getElementById("signVoiceApiNote");
    if (!video?.srcObject) {
        Toast.warning("Turn on the camera first.");
        return;
    }
    const imageBase64 = pipelineCaptureFrameBase64();
    if (!imageBase64) {
        Toast.warning("Could not capture a frame — wait for the video to load.");
        return;
    }

    try {
        const res = await ApiClient.pipelineSignRecognize(pipelineBuildRecognizeBody({ imageBase64 }));
        const text = pipelineApplyRecognizeResult(res, ta, note);
        if (text) {
            Toast.success(`Recognized: ${text}`);
            await pipelineEmitSignTranslation(text, res);
        } else {
            Toast.info(res.message || "No sign recognized — try Yes, Hello, or fingerspell A–Z.");
        }
    } catch (err) {
        Toast.error(err.message || String(err));
    }
}

async function pipelineSignVoiceRecordSequence() {
    const video = document.getElementById("signVoiceVideo");
    const ta = document.getElementById("signVoiceText");
    const note = document.getElementById("signVoiceApiNote");
    const btn = document.getElementById("btnSignRecord");

    if (!video?.srcObject) {
        Toast.warning("Turn on the camera first.");
        return;
    }
    if (pipelineSignRecording) return;

    pipelineSignRecording = true;
    if (btn) {
        btn.disabled = true;
        btn.textContent = "Recording…";
    }
    Toast.info("Hold your sign steady for 1.5 seconds…");

    const frames = [];
    const captureMs = 1500;
    const intervalMs = 100;
    const started = performance.now();

    await new Promise((resolve) => {
        const timer = setInterval(() => {
            const frame = pipelineCaptureFrameBase64();
            if (frame) frames.push(frame);
            if (performance.now() - started >= captureMs) {
                clearInterval(timer);
                resolve();
            }
        }, intervalMs);
    });

    try {
        const res = await ApiClient.pipelineSignRecognize(pipelineBuildRecognizeBody({ frames }));
        const text = pipelineApplyRecognizeResult(res, ta, note);
        if (text) {
            Toast.success(`Recognized: ${text}`);
            await pipelineEmitSignTranslation(text, res);
        } else {
            Toast.info(res.message || "No sign recognized across frames.");
        }
    } catch (err) {
        Toast.error(err.message || String(err));
    } finally {
        pipelineSignRecording = false;
        if (btn) {
            btn.disabled = false;
            btn.textContent = "Record sign (1.5s)";
        }
    }
}

async function pipelineSignVoiceSpeak(explicitText) {
    const ta = document.getElementById("signVoiceText");
    const text = (explicitText || ta?.value || "").trim();
    if (!text) {
        Toast.warning("No text to speak.");
        return;
    }
    try {
        const res = await ApiClient.pipelineSignSpeak({ text });
        await pipelinePlaySignVoiceTts(res, text);
        Toast.success(res.ready ? "Speaking (server TTS)." : "Speaking (browser voice).");
    } catch (err) {
        Toast.error(err.message || String(err));
    }
}

async function pipelineVoiceSignTranscribe() {
    if (pipelineVoiceSpeechActive) {
        pipelineStopSpeechToText();
        Toast.info("Speech-to-text paused.");
        return;
    }
    if (!pipelineVoiceSignMicStream) {
        await pipelineToggleMic();
        return;
    }
    const started = pipelineStartSpeechToText();
    if (started) Toast.success("Listening — speech becomes text, then FSL / Collated signs.");
}

async function pipelineVoiceSignRender() {
    const ta = getVoiceSignTranscriptEl();
    const text = (ta?.value || "").trim();
    const { ph } = getVoiceSignImageEls();
    if (!text) {
        Toast.warning("Speak or type something to translate.");
        return;
    }
    try {
        const res = await ApiClient.pipelineVoiceRender({ text });
        pipelineShowSignMatches(res.matches || []);
        if (ph && (!res.matches || !res.matches.length)) {
            ph.textContent = res.message || "No matching sign in FSL-105 / Collated.";
        }
        if (res.ready) Toast.success("Showing FSL-105 / Collated signs.");
        else Toast.info(res.message || "No dataset match.");
    } catch (err) {
        Toast.error(err.message || String(err));
    }
}

/* ══════════════════════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════════════════════ */

document.addEventListener("DOMContentLoaded", async () => {
    const cfg = getDashboardRuntimeConfig();
    await enforceDashboardRole(cfg.role);
    applyDashboardPageConfig(cfg);
    showSection(cfg.defaultSection);
    pipelineVerifyVisionBackend();

    if (cfg.role === "deaf" && cfg.defaultSection === "signVoice") {
        setTimeout(() => pipelineToggleCamera(), 900);
    }

    // Sidebar state
    document.getElementById("sidebar")?.classList.toggle("collapsed", sidebarCollapsed);

    // Camera panel off
    syncCamera(false);

    // Load preferences
    const loadedPrefs = loadPrefsToForm();
    applyPrefsVisuals(loadedPrefs);

    // Load chat history
    const list = document.getElementById("chatList");
    if (list) {
        /* Show a friendly empty state until chats arrive, then replace
           it with the real items. */
        if (!list.firstElementChild) {
            const empty = document.createElement("div");
            empty.className = "empty-state";
            empty.id = "chatListEmpty";
            const emptyIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            emptyIcon.setAttribute("class", "empty-state-icon");
            emptyIcon.setAttribute("fill", "none");
            emptyIcon.setAttribute("stroke", "currentColor");
            emptyIcon.setAttribute("viewBox", "0 0 24 24");
            emptyIcon.setAttribute("aria-hidden", "true");
            const eip = document.createElementNS("http://www.w3.org/2000/svg", "path");
            eip.setAttribute("stroke-linecap", "round");
            eip.setAttribute("stroke-linejoin", "round");
            eip.setAttribute("stroke-width", "1.5");
            eip.setAttribute("d", "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z");
            emptyIcon.appendChild(eip);
            empty.appendChild(emptyIcon);
            const t = document.createElement("div");
            t.className = "empty-state-title";
            t.textContent = "No conversations yet";
            empty.appendChild(t);
            const s = document.createElement("div");
            s.className = "empty-state-text";
            s.textContent = "Start a new chat from the button above.";
            empty.appendChild(s);
            list.appendChild(empty);
        }
    }
    if (ApiClient.isLoggedIn()) {
        try {
            const res = await ApiClient.getChats();
            if (res?.chats) {
                if (res.chats.length === 0) {
                    /* keep the empty state */
                } else {
                    const empty = document.getElementById("chatListEmpty");
                    if (empty) empty.remove();
                    res.chats.reverse().forEach((chat) => addConversationToList(chat));
                }
            }
        } catch (e) {
            console.warn("Could not load chats:", e);
        }
    }

    // Composer enter key
    const composerInput = document.getElementById("composerInput");
    if (composerInput) {
        composerInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    try {
        const st = await ApiClient.pipelineStatus();
        console.info("Pipeline capabilities:", st?.flows);
    } catch (e) {
        /* offline */
    }

    syncMicMeter();

    // Inject Feedback option for logged-in users
    if (window.ApiClient && ApiClient.isLoggedIn()) {
        const navButtons = document.getElementById("sidebarNavButtons");
        if (navButtons) {
            const feedbackBtn = document.createElement("button");
            feedbackBtn.type = "button";
            feedbackBtn.className = "sidebar-nav-item";
            feedbackBtn.innerHTML = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"/></svg> Send Feedback`;
            feedbackBtn.onclick = () => {
                if (window.Toast) Toast.info("Feedback dialog opened (Stub)");
            };
            navButtons.appendChild(feedbackBtn);
        }
    }
});
