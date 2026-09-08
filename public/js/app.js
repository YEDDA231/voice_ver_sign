/**
 * VoiceVerSign – App Utilities
 * Theme management, toast system, and shared helpers.
 */

/* ══════════════════════════════════════════════════════════════════════════
   THEME MANAGER
   ══════════════════════════════════════════════════════════════════════════ */

const ThemeManager = {
    get() {
        return document.documentElement.getAttribute("data-theme") || "light";
    },

    set(theme) {
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem("theme", theme);
        this.updateIcons(theme);
        this.updateSwitch(theme);
    },

    updateSwitch(theme) {
        const inputs = document.querySelectorAll(".theme-switch__input");
        inputs.forEach((input) => {
            input.checked = theme === "dark";
        });
    },

    toggle() {
        const next = this.get() === "dark" ? "light" : "dark";
        this.set(next);
        return next;
    },

    updateIcons(theme) {
        const sunPath = "M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z";
        const moonPath = "M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z";
        const path = theme === "dark" ? sunPath : moonPath;

        /* Only update icons inside explicit theme controls — avoids stray matches near logos / nav */
        const roots = document.querySelectorAll(".theme-toggle-control");
        const targets =
            roots.length > 0
                ? document.querySelectorAll(".theme-toggle-control [data-theme-icon]")
                : document.querySelectorAll("[data-theme-icon]");

        targets.forEach((el) => {
            if (el.tagName === "path") {
                el.setAttribute("d", path);
            } else {
                const p = el.querySelector("path");
                if (p) p.setAttribute("d", path);
            }
        });
    },

    init() {
        const saved = localStorage.getItem("theme");
        const fallback = document.documentElement.getAttribute("data-theme") || "light";
        this.set(saved || fallback);
    },
};

/* ══════════════════════════════════════════════════════════════════════════
   TOAST SYSTEM (sileo-inspired)
   ══════════════════════════════════════════════════════════════════════════ */

const Toast = (() => {
    let container = null;

    function ensureContainer() {
        if (!container || !document.body.contains(container)) {
            container = document.createElement("div");
            container.className = "toast-container";
            document.body.appendChild(container);
        }
        return container;
    }

    const icons = {
        success: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
        error: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
        warning: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
        info: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
    };

    function show(message, duration = 2500, type = "info") {
        const c = ensureContainer();
        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;
        toast.setAttribute("role", type === "error" || type === "warning" ? "alert" : "status");
        toast.setAttribute("aria-live", type === "error" || type === "warning" ? "assertive" : "polite");
        const iconWrap = document.createElement("span");
        iconWrap.className = "toast-icon-wrap";
        iconWrap.innerHTML = icons[type] || icons.info;
        const text = document.createElement("span");
        text.className = "toast-text";
        text.textContent = String(message);
        toast.appendChild(iconWrap);
        toast.appendChild(text);
        c.appendChild(toast);

        setTimeout(() => {
            toast.classList.add("toast-exit");
            toast.addEventListener("animationend", () => toast.remove());
        }, duration);
    }

    return {
        show,
        success: (msg, dur) => show(msg, dur, "success"),
        error: (msg, dur) => show(msg, dur, "error"),
        warning: (msg, dur) => show(msg, dur, "warning"),
        info: (msg, dur) => show(msg, dur, "info"),
    };
})();

/* ══════════════════════════════════════════════════════════════════════════
   GLOBAL HELPERS
   ══════════════════════════════════════════════════════════════════════════ */

function toggleTheme(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    ThemeManager.toggle();
}

/* ══════════════════════════════════════════════════════════════════════════
   CUSTOM ANTI-GRAVITY CURSOR
   ══════════════════════════════════════════════════════════════════════════ */

function initCustomCursor() {
    if (document.getElementById('cursor-dot')) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;

    const dot = document.createElement('div');
    dot.id = 'cursor-dot';
    dot.className = 'cursor-dot';
    
    const ring = document.createElement('div');
    ring.id = 'cursor-ring';
    ring.className = 'cursor-ring';
    
    const ringInner = document.createElement('div');
    ringInner.className = 'cursor-ring-inner';
    ring.appendChild(ringInner);
    
    document.body.appendChild(dot);
    document.body.appendChild(ring);

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let ringX = mouseX;
    let ringY = mouseY;
    
    window.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        dot.style.left = `${mouseX}px`;
        dot.style.top = `${mouseY}px`;
    });

    const animate = () => {
        ringX += (mouseX - ringX) * 0.15;
        ringY += (mouseY - ringY) * 0.15;
        ring.style.left = `${ringX}px`;
        ring.style.top = `${ringY}px`;
        requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);

    const addHover = () => document.body.classList.add('cursor-hover');
    const removeHover = () => document.body.classList.remove('cursor-hover');
    
    const bindHover = () => {
        const interactiveElements = document.querySelectorAll('a, button, input, select, textarea, .chat-item, .suggestion-card, .tier');
        interactiveElements.forEach(el => {
            el.removeEventListener('mouseenter', addHover);
            el.removeEventListener('mouseleave', removeHover);
            el.addEventListener('mouseenter', addHover);
            el.addEventListener('mouseleave', removeHover);
        });
    };
    
    bindHover();
    
    const observer = new MutationObserver((mutations) => {
        let shouldBind = false;
        for (let m of mutations) {
            if (m.addedNodes.length > 0) shouldBind = true;
        }
        if (shouldBind) bindHover();
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

document.addEventListener("DOMContentLoaded", () => {
    ThemeManager.init();
    // Custom cursor removed — using default system cursor
    // initCustomCursor();
    initConnectionMonitor();
});

/* ══════════════════════════════════════════════════════════════════════════
   CONNECTION MONITOR
   ══════════════════════════════════════════════════════════════════════════ */

let connectionBanner = null;
let connectionCheckTimer = null;
let lastConnectionState = null;

function setConnectionBanner(state, message) {
    if (!connectionBanner) {
        connectionBanner = document.createElement("div");
        connectionBanner.className = "connection-banner";
        connectionBanner.setAttribute("role", "status");
        connectionBanner.setAttribute("aria-live", "polite");
        document.body.prepend(connectionBanner);
    }
    if (!state) {
        connectionBanner.classList.remove("show", "error");
        return;
    }
    connectionBanner.classList.add("show");
    connectionBanner.classList.toggle("error", state === "error");
    connectionBanner.textContent = message;
}

async function checkConnection() {
    /* Same-origin /api/health. If the network is down or the server is
       unreachable, surface a banner. */
    try {
        const c = new AbortController();
        const t = setTimeout(() => c.abort(), 5000);
        const res = await fetch("/api/health", { cache: "no-store", signal: c.signal });
        clearTimeout(t);
        if (res.ok) {
            if (lastConnectionState !== "ok") {
                setConnectionBanner(null);
                lastConnectionState = "ok";
            }
        } else {
            if (lastConnectionState !== "error") {
                setConnectionBanner("error", "Server unavailable — some features may not work.");
                lastConnectionState = "error";
            }
        }
    } catch (e) {
        if (lastConnectionState !== "error") {
            setConnectionBanner("error", "You are offline — reconnecting…");
            lastConnectionState = "error";
        }
    }
}

function initConnectionMonitor() {
    /* Skip the check on auth pages — they should not show a banner
       before the user has logged in. */
    if (document.body.classList.contains("auth-page")) return;
    checkConnection();
    if (connectionCheckTimer) clearInterval(connectionCheckTimer);
    connectionCheckTimer = setInterval(checkConnection, 30000);
    window.addEventListener("online", () => checkConnection());
    window.addEventListener("offline", () =>
        setConnectionBanner("error", "You are offline — reconnecting…")
    );
}

function escapeHtml(str) {
    if (!str) return "";
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
