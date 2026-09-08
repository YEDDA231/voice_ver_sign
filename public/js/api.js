/**
 * VoiceVerSign – API client (same-origin only).
 * API base URL and WebSocket endpoints are NOT user-configurable in the browser
 * (secrets and server routing belong on the server / reverse proxy).
 */
const ApiClient = (() => {
    /** Always use the current origin so requests go to the same host that served the app. */
    function getBaseUrl() {
        return "";
    }

    /** Deprecated: kept for compatibility; does nothing. */
    function setBaseUrl() {
        /* Server URL is not exposed to end users. */
    }

    /** Remove legacy keys from older builds. */
    try {
        localStorage.removeItem("apiBaseUrl");
    } catch (e) {
        /* ignore */
    }

    function getToken() {
        return localStorage.getItem("authToken") || null;
    }

    function setToken(token) {
        if (token) localStorage.setItem("authToken", token);
    }

    function clearToken() {
        localStorage.removeItem("authToken");
    }

    function isLoggedIn() {
        return !!getToken();
    }

    async function request(path, options = {}) {
        const url = `${getBaseUrl()}${path}`;
        const headers = {
            "Content-Type": "application/json",
            ...(options.headers || {}),
        };

        const token = getToken();
        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }

        const response = await fetch(url, { ...options, headers });

        let payload = null;
        try {
            payload = await response.json();
        } catch (e) {
            payload = null;
        }

        if (!response.ok) {
            if (response.status === 401) {
                clearToken();
                try {
                    localStorage.removeItem("userName");
                    localStorage.removeItem("userType");
                    localStorage.removeItem("userRole");
                    localStorage.removeItem("currentUser");
                } catch (e) {}
                
                // Avoid infinite redirect loops if we are already on a login/signup page
                if (!window.location.pathname.endsWith("login.html") && !window.location.pathname.endsWith("signup.html")) {
                    window.location.replace(window.location.pathname.includes("/dashboards/") ? "../login.html" : "login.html");
                }
            }
            const message = payload?.detail || payload?.message || `Request failed: ${response.status}`;
            throw new Error(message);
        }

        return payload;
    }

    function login(email, password) {
        return request("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({ email, password }),
        });
    }

    function signup(data) {
        return request("/api/auth/signup", {
            method: "POST",
            body: JSON.stringify(data),
        });
    }

    function forgotPassword(email) {
        return request("/api/auth/forgot-password", {
            method: "POST",
            body: JSON.stringify({ email }),
        });
    }

    function devAutoLogin() {
        /* Only available when the server is running with VVS_DEV_MODE=1.
           Returns the same shape as login() / signup(). */
        return request("/api/auth/dev-auto-login", { method: "POST" });
    }

    function devModeStatus() {
        return request("/api/auth/dev-mode-status");
    }

    function getMe() {
        return request("/api/auth/me");
    }

    function getAdminStats() {
        return request("/api/admin/stats");
    }

    function getChats() {
        return request("/api/chats");
    }

    function createChat(title = "New conversation") {
        return request("/api/chats", {
            method: "POST",
            body: JSON.stringify({ title }),
        });
    }

    function deleteChat(chatId) {
        return request(`/api/chats/${chatId}`, { method: "DELETE" });
    }

    function togglePinChat(chatId) {
        return request(`/api/chats/${chatId}/pin`, { method: "PATCH" });
    }

    function getMessages(chatId) {
        return request(`/api/chats/${chatId}/messages`);
    }

    function sendMessage(chatId, content) {
        return request(`/api/chats/${chatId}/messages`, {
            method: "POST",
            body: JSON.stringify({ content }),
        });
    }

    function getPreferences() {
        return request("/api/preferences");
    }

    function savePreferences(data) {
        return request("/api/preferences", {
            method: "PUT",
            body: JSON.stringify({ data }),
        });
    }

    function toggleDevice(type, active) {
        return request(`/api/input/${type}`, {
            method: "POST",
            body: JSON.stringify({ active }),
        });
    }

    /** Live FSL-105 / Collated pipeline + catalog. */
    function pipelineStatus() {
        return request("/api/pipeline/status");
    }

    function pipelineSignRecognize(body) {
        return request("/api/pipeline/sign-to-voice/recognize", {
            method: "POST",
            body: JSON.stringify(body || {}),
        });
    }

    function pipelineSignSpeak(body) {
        return request("/api/pipeline/sign-to-voice/speak", {
            method: "POST",
            body: JSON.stringify(body || {}),
        });
    }

    function pipelineVoiceTranscribe(body) {
        return request("/api/pipeline/voice-to-sign/transcribe", {
            method: "POST",
            body: JSON.stringify(body || {}),
        });
    }

    function pipelineVoiceRender(body) {
        return request("/api/pipeline/voice-to-sign/render", {
            method: "POST",
            body: JSON.stringify(body || {}),
        });
    }

    function signsCatalog() {
        return request("/api/signs/catalog");
    }

    function signsResolve(text) {
        return request("/api/signs/resolve", {
            method: "POST",
            body: JSON.stringify({ text: text || "" }),
        });
    }

    function getAdminUsers() {
        return request("/api/admin/users");
    }

    function deleteAdminUser(userId) {
        return request(`/api/admin/users/${userId}`, {
            method: "DELETE",
        });
    }

    function createAdminUser(data) {
        return request("/api/admin/users", {
            method: "POST",
            body: JSON.stringify(data),
        });
    }

    return {
        getBaseUrl,
        setBaseUrl,
        getToken,
        setToken,
        clearToken,
        isLoggedIn,
        request,
        login,
        signup,
        forgotPassword,
        devAutoLogin,
        devModeStatus,
        getMe,
        getAdminStats,
        getAdminUsers,
        deleteAdminUser,
        createAdminUser,
        getChats,
        createChat,
        deleteChat,
        togglePinChat,
        getMessages,
        sendMessage,
        getPreferences,
        savePreferences,
        toggleDevice,
        pipelineStatus,
        pipelineSignRecognize,
        pipelineSignSpeak,
        pipelineVoiceTranscribe,
        pipelineVoiceRender,
        signsCatalog,
        signsResolve,
    };
})();
