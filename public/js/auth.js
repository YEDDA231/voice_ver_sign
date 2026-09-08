/**
 * VoiceVerSign – Auth Page Logic
 * Login, signup, and forgot-password handlers.
 */

let selectedUserType = "hearing";

/** Post-login / signup redirect from `userType` */
function dashboardUrlForUserType(userType) {
    const u = (userType || "hearing").toLowerCase();
    if (u === "admin") return "dashboards/admin.html";
    if (u === "deaf") return "dashboards/deaf.html";
    return "dashboards/hearing.html";
}

/* ── Password Visibility ── */

function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";
    /* Update the toggle's accessible label so screen readers announce the new state. */
    const btn = document.querySelector(`button[aria-controls="${inputId}"]`);
    if (btn) btn.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
}

/* ── Inline form error helper ── */
function setFormMessage(formId, message, type = "error") {
    const el = document.getElementById(formId + "FormMessage");
    if (!el) return;
    if (!message) {
        el.classList.remove("show", "error", "success");
        el.textContent = "";
        return;
    }
    el.classList.remove("error", "success");
    el.classList.add("show", type);
    el.textContent = message;
}

/* ── Password Strength ── */

function checkPasswordStrength(password) {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    const fill = document.getElementById("strengthFill");
    const text = document.getElementById("strengthText");
    if (!fill || !text) return score;

    const labels = ["Weak", "Fair", "Good", "Strong"];
    const colors = ["#ef4444", "#f59e0b", "#84cc16", "#22c55e"];
    const width = Math.max(score, 1) * 25;

    fill.style.width = `${width}%`;
    fill.style.background = colors[Math.max(score - 1, 0)];
    text.textContent = password
        ? `Strength: ${labels[Math.max(score - 1, 0)]}`
        : "Use 8+ characters with mixed types";

    return score;
}

/* ── User Type Selector ── */

function selectUserType(type) {
    selectedUserType = type;
    document.querySelectorAll(".user-type-btn").forEach((btn) => {
        const isActive = btn.dataset.type === type;
        btn.classList.toggle("active", isActive);
        btn.setAttribute("aria-checked", isActive ? "true" : "false");
    });
}

/* ── Loading State ── */

function setLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
        btn.classList.add("btn-loading");
        btn.disabled = true;
    } else {
        btn.classList.remove("btn-loading");
        btn.disabled = false;
    }
}

/* ── Login ── */

async function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById("email")?.value?.trim();
    const password = document.getElementById("password")?.value;
    const btn = document.getElementById("loginBtn");
    setFormMessage("login", "");

    if (!email || !password) {
        setFormMessage("login", "Please enter both email and password.", "error");
        Toast.warning("Please enter email and password.");
        return;
    }

    setLoading(btn, true);

    try {
        const result = await ApiClient.login(email, password);
        if (result?.token) {
            ApiClient.setToken(result.token);
            if (result.user) {
                localStorage.setItem("userName", result.user.name || "");
                const ut = result.user.userType || "hearing";
                localStorage.setItem("userType", ut);
                localStorage.setItem("userRole", ut);
            }
        }
        setFormMessage("login", "Signed in. Redirecting...", "success");
        Toast.success("Signed in successfully!");
        const ut = result?.user?.userType || localStorage.getItem("userType") || "hearing";
        setTimeout(() => (window.location.href = dashboardUrlForUserType(ut)), 600);
    } catch (error) {
        const msg = error.message || "Login failed. Please try again.";
        setFormMessage("login", msg, "error");
        Toast.error(msg);
        setLoading(btn, false);
    }
}

/* ── Signup ── */

async function handleSignup(event) {
    event.preventDefault();
    const firstName = document.getElementById("firstName")?.value?.trim();
    const lastName = document.getElementById("lastName")?.value?.trim();
    const email = document.getElementById("email")?.value?.trim();
    const password = document.getElementById("password")?.value || "";
    const confirmPassword = document.getElementById("confirmPassword")?.value || "";
    const termsAccepted = document.getElementById("terms")?.checked;
    const btn = document.querySelector("button[type='submit']");
    setFormMessage("signup", "");

    if (!firstName || !lastName || !email) {
        setFormMessage("signup", "Please complete all required fields.", "error");
        Toast.warning("Please complete all required fields.");
        return;
    }
    if (password !== confirmPassword) {
        setFormMessage("signup", "Passwords do not match.", "error");
        Toast.error("Passwords do not match.");
        return;
    }
    if (checkPasswordStrength(password) < 2) {
        setFormMessage("signup", "Please choose a stronger password.", "error");
        Toast.warning("Please choose a stronger password.");
        return;
    }
    if (!termsAccepted) {
        setFormMessage("signup", "Please accept the terms to continue.", "error");
        Toast.warning("Please accept terms to continue.");
        return;
    }

    setLoading(btn, true);

    try {
        const result = await ApiClient.signup({
            firstName,
            lastName,
            email,
            password,
            userType: selectedUserType,
        });
        if (result?.token) {
            ApiClient.setToken(result.token);
            if (result.user) {
                localStorage.setItem("userName", result.user.name || "");
                const ut = result.user.userType || "hearing";
                localStorage.setItem("userType", ut);
                localStorage.setItem("userRole", ut);
            }
        }
        setFormMessage("signup", "Account created. Redirecting...", "success");
        Toast.success("Account created successfully!");
        const ut = result?.user?.userType || selectedUserType || "hearing";
        setTimeout(() => (window.location.href = dashboardUrlForUserType(ut)), 600);
    } catch (error) {
        const msg = error.message || "Signup failed. Please try again.";
        setFormMessage("signup", msg, "error");
        Toast.error(msg);
        setLoading(btn, false);
    }
}

/* ── Forgot Password ── */

async function handleForgotPassword(event) {
    event.preventDefault();
    const email = document.getElementById("email")?.value?.trim();
    const btn = event?.target?.querySelector?.("button[type='submit']") ||
        document.querySelector("button[type='submit']");
    setFormMessage("forgot", "");

    if (!email) {
        setFormMessage("forgot", "Please enter your email.", "error");
        Toast.warning("Please enter your email.");
        return;
    }

    setLoading(btn, true);

    try {
        await ApiClient.forgotPassword(email);
        setFormMessage("forgot", "If this email is registered, a reset link has been sent.", "success");
        Toast.success("Reset link sent. Check your inbox.");
    } catch (error) {
        /* Always show a generic success-like message to avoid leaking which
           emails are registered. */
        setFormMessage("forgot", "If this email is registered, a reset link has been sent.", "success");
        Toast.info("If this email exists, a reset link has been sent.");
    } finally {
        setLoading(btn, false);
    }
}

/* ── Social Login Stubs ── */

function loginWithGoogle() {
    Toast.info("Google sign-in coming soon.");
}

function loginWithFacebook() {
    Toast.info("Facebook sign-in coming soon.");
}

/* ── Dev auto-login (only available when VVS_DEV_MODE=1) ── */

async function handleDevAutoLogin(event) {
    if (event) event.preventDefault();
    const btn = document.getElementById("devAutoLoginBtn");
    setLoading(btn, true);
    setFormMessage("login", "");

    try {
        const result = await ApiClient.devAutoLogin();
        if (result?.token) {
            ApiClient.setToken(result.token);
            if (result.user) {
                localStorage.setItem("userName", result.user.name || "");
                localStorage.setItem("userType", "admin");
                localStorage.setItem("userRole", "admin");
            }
        }
        setFormMessage("login", "Signed in as admin. Redirecting...", "success");
        Toast.success("Auto-login successful — welcome, admin.");
        setTimeout(() => (window.location.href = "dashboards/admin.html"), 500);
    } catch (error) {
        const msg = error.message || "Dev auto-login failed. Is VVS_DEV_MODE=1 set on the server?";
        setFormMessage("login", msg, "error");
        Toast.error(msg);
        setLoading(btn, false);
    }
}

/* ── Init ── */

document.addEventListener("DOMContentLoaded", () => {
    const passwordInput = document.getElementById("password");
    if (passwordInput) {
        passwordInput.addEventListener("input", (e) => {
            checkPasswordStrength(e.target.value);
        });
    }

    const typeBtn = document.querySelector(".user-type-btn.active");
    if (typeBtn) selectedUserType = typeBtn.dataset.type || "hearing";
});
