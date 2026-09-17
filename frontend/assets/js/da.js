/* ============================================================
   eSAKA — DA-RFO OFFICER DASHBOARD
   Dynamic Buyer Registry + Map + Alert Threshold + Reports + Alerts
   (Reports section aligned with Provincial UI/Logic)

   Backend:
   GET  /api/buyer-status/pending
   GET  /api/buyer-status/verified
   PUT  /api/buyer-status/{buyer_status_id}/verify
   PUT  /api/buyer-status/{buyer_status_id}/reject
   GET  /api/buyer-registry/{buyer_registry_id}/attachment

   Reports:
   GET  /api/report-submissions/for-da-rfo-validation
   GET  /api/report-submissions/returned-to-provincial
   GET  /api/report-submissions/approved-by-regional
   POST /api/report-submissions/bulk-approve
   POST /api/report-submissions/{report_id}/approve
   POST /api/report-submissions/{report_id}/revision
   GET  /api/raw-plant-reports/{report_id}
============================================================ */


/* ============================================================
   API CONFIGURATION
============================================================ */

const API_BASE_URL = "http://127.0.0.1:8000";

const PENDING_BUYERS_ENDPOINT      = `${API_BASE_URL}/api/buyer-status/pending`;
const VERIFIED_BUYERS_ENDPOINT     = `${API_BASE_URL}/api/buyer-status/verified`;
const BUYER_STATUS_ENDPOINT        = `${API_BASE_URL}/api/buyer-status`;
const BUYER_ATTACHMENT_ENDPOINT    = `${API_BASE_URL}/api/buyer-registry/buyer-registry`;

/* ------------------- REPORT ENDPOINTS ------------------- */

const DA_PENDING_ENDPOINT              = `${API_BASE_URL}/api/report-submissions/for-da-rfo-validation`;
const RETURNED_TO_PROVINCIAL_ENDPOINT  = `${API_BASE_URL}/api/report-submissions/returned-to-provincial`;
const APPROVED_BY_REGIONAL_ENDPOINT    = `${API_BASE_URL}/api/report-submissions/approved-by-regional`;
const BULK_APPROVE_ENDPOINT            = `${API_BASE_URL}/api/report-submissions/bulk-approve`;


/* ============================================================
   AUTH
============================================================ */

function getAuthToken() {
    return (
        localStorage.getItem("access_token") ||
        localStorage.getItem("token")
    );
}

function getAuthHeaders(includeContentType = true) {
    const token = getAuthToken();
    const headers = {};

    if (includeContentType) {
        headers["Content-Type"] = "application/json";
    }

    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    return headers;
}


/* ============================================================
   FETCH HELPER WITH TIMEOUT
============================================================ */

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 10000) {

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });

        const contentType = response.headers.get("content-type") || "";
        let data = null;

        if (contentType.includes("application/json")) {
            data = await response.json();
        } else {
            const text = await response.text();
            data = text ? { detail: text } : null;
        }

        if (!response.ok) {
            const detail = data?.detail || data?.message || `HTTP ${response.status}`;
            throw new Error(detail);
        }

        return data;

    } catch (err) {
        if (err.name === "AbortError") {
            throw new Error(`API request timed out after ${timeoutMs / 1000} seconds.`);
        }
        throw err;

    } finally {
        clearTimeout(timeoutId);
    }
}


/* ============================================================
   GLOBAL VARIABLES
============================================================ */

let mapInstance = null;
let currentSelectedBuyer = null;
let pendingBuyersCache = [];
let verifiedBuyersCache = [];
let currentActiveAlertCard = null;

/* ---- REPORT STATE ---- */
let pendingReports = [];
let returnedToProvincialReports = [];
let approvedReports = [];
let selectedReportIds = new Set();
let selectedReport = null;
let currentApprovedFilter = "all";


/* ============================================================
   PAGE INITIALIZATION
============================================================ */

document.addEventListener("DOMContentLoaded", async () => {

    initSidebar();
    initViewNavigation();
    initMap();
    initBuyerRegistry();
    initAlertThreshold();
    initAlertsSection();
    initReportsSection();
    initSignout();
    initModalListeners();
    loadUserInformation();

    // Preload reports so switching to Reports view is instant
    loadReports();
});


/* ============================================================
   LOAD USER INFORMATION
============================================================ */

function loadUserInformation() {

    const userName =
        localStorage.getItem("username") ||
        localStorage.getItem("name") ||
        localStorage.getItem("full_name");

    const role = localStorage.getItem("role");

    const userDisplayName = document.getElementById("userDisplayName");
    const userDisplayRole = document.getElementById("userDisplayRole");
    const userInitials    = document.getElementById("userDisplayInitials");

    if (userName && userDisplayName) {
        userDisplayName.textContent = userName;
    }

    if (role && userDisplayRole) {
        const roleMap = {
            admin: "System Administrator",
            darfo: "DA-RFO Officer",
            aew: "Agricultural Extension Worker",
            farmer: "Farmer",
            coop: "Cooperative",
            lgu: "LGU"
        };
        userDisplayRole.textContent = roleMap[role] || role;
    }

    if (userInitials) {
        userInitials.textContent = getInitials(userName || role || "");
    }
}

function getInitials(name) {
    if (!name) return "--";

    const cleaned = String(name)
        .replace(/^(aew|mcoord|admin|user|municipal|provincial|pcoord|da)[_\s-]+/i, "")
        .replace(/[_\-.]+/g, " ")
        .trim();

    if (!cleaned) return "--";

    const parts = cleaned.split(/\s+/).filter(Boolean);

    if (parts.length === 1) {
        return parts[0].substring(0, 2).toUpperCase();
    }

    return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatRole(role) {
    if (!role) return "";
    return String(role).replace(/_/g, " ").toUpperCase();
}


/* ============================================================
   SIDEBAR
============================================================ */

function initSidebar() {
    const hamburgerBtn = document.getElementById("hamburgerBtn");
    const sidebar = document.getElementById("sidebar");

    if (!hamburgerBtn || !sidebar) return;

    let hoverTimer = null;

    hamburgerBtn.addEventListener("mouseenter", function () {
        if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }

        setTimeout(function () {
            sidebar.classList.add("open");

            setTimeout(function () {
                if (mapInstance) mapInstance.invalidateSize();
            }, 300);
        }, 100);
    });

    sidebar.addEventListener("mouseleave", function () {
        hoverTimer = setTimeout(function () {
            sidebar.classList.remove("open");
        }, 200);
    });

    sidebar.addEventListener("mouseenter", function () {
        if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
    });

    document.addEventListener("click", function (event) {
        const isClickInsideSidebar = sidebar.contains(event.target);
        const isClickOnHamburger = hamburgerBtn.contains(event.target);

        if (!isClickInsideSidebar && !isClickOnHamburger) {
            sidebar.classList.remove("open");
        }
    });

    sidebar.querySelectorAll(".nav-item").forEach(function (item) {
        item.addEventListener("click", function () {
            sidebar.classList.remove("open");
        });
    });

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") sidebar.classList.remove("open");
    });

    const signoutBtn = sidebar.querySelector(".signout");
    if (signoutBtn) {
        signoutBtn.addEventListener("click", function () {
            sidebar.classList.remove("open");
        });
    }
}


/* ============================================================
   VIEW NAVIGATION
============================================================ */

function initViewNavigation() {

    const navButtons = document.querySelectorAll(".nav-item[data-view]");
    const views = document.querySelectorAll(".view");

    navButtons.forEach(button => {
        button.addEventListener("click", () => {

            const targetViewKey = button.dataset.view;

            views.forEach(view => view.classList.remove("active-view"));

            const targetView = document.getElementById("view-" + targetViewKey);
            if (targetView) targetView.classList.add("active-view");

            navButtons.forEach(navButton => {
                navButton.classList.toggle("active", navButton === button);
            });

            if (targetViewKey === "map" && mapInstance) {
                setTimeout(() => mapInstance.invalidateSize(), 100);
            }

            if (targetViewKey === "buyer-registry") {
                loadBuyerRegistry();
            }

            if (targetViewKey === "reports") {
                loadReports();
            }
        });
    });
}


/* ============================================================
   SIGN OUT
============================================================ */

function initSignout() {
    const signoutBtn = document.getElementById("signoutBtn");
    if (!signoutBtn) return;

    signoutBtn.addEventListener("click", () => {
        localStorage.clear();
        window.location.href = "../index.html";
    });
}


/* ============================================================
   LEAFLET MAP
============================================================ */

function initMap() {
    const mapEl = document.getElementById("map");
    if (!mapEl || typeof L === "undefined") return;

    const pampangaBounds = L.latLngBounds([14.85, 120.35], [15.35, 120.95]);

    mapInstance = L.map("map", {
        maxBounds: pampangaBounds,
        maxBoundsViscosity: 1.0,
        minZoom: 10
    }).setView([15.0794, 120.6200], 10);

    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            attribution: "&copy; OpenStreetMap contributors",
            maxZoom: 18
        }
    ).addTo(mapInstance);

    const municipalityCoordinates = {
        "Angeles": [15.1450, 120.5887],
        "Apalit": [14.9470, 120.7700],
        "Arayat": [15.1500, 120.7690],
        "Bacolor": [15.0000, 120.6520],
        "Candaba": [15.0950, 120.8260],
        "Floridablanca": [14.9770, 120.5280],
        "Guagua": [14.9650, 120.6350],
        "Lubao": [14.9400, 120.6000],
        "Mabalacat": [15.2230, 120.5740],
        "Macabebe": [14.9080, 120.7150],
        "Magalang": [15.2160, 120.6630],
        "Masantol": [14.8960, 120.7100],
        "Mexico": [15.0640, 120.7190],
        "Minalin": [14.9670, 120.6840],
        "Porac": [15.0710, 120.5420],
        "San Fernando": [15.0343, 120.6840],
        "San Luis": [15.0400, 120.7870],
        "San Simon": [14.9990, 120.7800],
        "Santa Ana": [15.0950, 120.7720],
        "Santa Rita": [15.0190, 120.6110],
        "Santo Tomas": [14.9950, 120.7090]
    };

    loadMunicipalityMapData(municipalityCoordinates);
}


async function loadMunicipalityMapData(municipalityCoordinates) {

async function loadMunicipalityMapData() {
    try {
        const response = await fetch(
            `${API_BASE_URL}/api/planting-intents/municipality-map`,
            { method: "GET", headers: getAuthHeaders(false) }
        );

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const result = await response.json();

        if (!result.data || !Array.isArray(result.data)) return;

        result.data.forEach(municipalityData => {
            const municipality = municipalityData.municipality;
            const coordinates = municipalityCoordinates[municipality];

            if (!coordinates) return;

            let popupContent = `
                <div style="min-width: 180px;">
                    <strong>Municipality:</strong> ${escapeHtml(municipality)}
                    <br><br>
            `;

            (municipalityData.commodities || []).forEach(item => {
                popupContent += `
                    <strong>Commodity:</strong> ${escapeHtml(item.commodity)}<br>
                    <strong>Status:</strong> ${escapeHtml(item.status)}<br><br>
                `;
            });

            popupContent += `</div>`;

            L.marker(coordinates).addTo(mapInstance).bindPopup(popupContent);
        });

    } catch (error) {
        console.error("Failed to load municipality map data:", error);
    }
}


/* ============================================================
   BUYER REGISTRY INITIALIZATION
============================================================ */

function initBuyerRegistry() {

    loadBuyerRegistry();

    document.getElementById("returnBuyerListBtn")
        ?.addEventListener("click", showBuyerList);

    document.getElementById("viewBuyerAttachmentBtn")
        ?.addEventListener("click", async () => {
            if (!currentSelectedBuyer) {
                showError("No buyer application selected.");
                return;
            }
            await viewBuyerAttachment(currentSelectedBuyer);
        });

    document.getElementById("approveBuyerBtn")
        ?.addEventListener("click", () => {
            if (!currentSelectedBuyer) {
                showError("No buyer application selected.");
                return;
            }
            document.getElementById("confirmApproveModal")?.classList.add("show");
        });

    document.getElementById("rejectBuyerBtn")
        ?.addEventListener("click", () => {
            if (!currentSelectedBuyer) {
                showError("No buyer application selected.");
                return;
            }
            document.getElementById("confirmRejectModal")?.classList.add("show");
        });

    document.getElementById("confirmApproveBtn")
        ?.addEventListener("click", approveSelectedBuyer);

    document.getElementById("confirmRejectBtn")
        ?.addEventListener("click", rejectSelectedBuyer);
}


/* ============================================================
   VIEW BUYER ATTACHMENT
============================================================ */

async function viewBuyerAttachment(buyer) {

    if (!buyer) { showError("No buyer application selected."); return; }

    const buyerRegistryId =
        buyer.buyer_registry_id || buyer.buyerRegistryId || buyer.id;

    if (!buyerRegistryId) {
        console.error("BUYER OBJECT:", buyer);
        showError("Buyer registry ID is missing.");
        return;
    }

    const button = document.getElementById("viewBuyerAttachmentBtn");

    try {
        if (button) {
            button.disabled = true;
            button.dataset.originalText = button.textContent;
            button.textContent = "Opening...";
        }

        const endpoint =
            `${BUYER_ATTACHMENT_ENDPOINT}/${buyerRegistryId}/attachment`;

        const response = await fetch(
            endpoint,
            { method: "GET", headers: getAuthHeaders(false) }
        );

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = "Unable to load buyer attachment.";

            try {
                const errorData = JSON.parse(errorText);
                errorMessage = errorData.detail || errorData.message || errorMessage;
            } catch {
                if (errorText) errorMessage = errorText;
            }

            throw new Error(`Status ${response.status}: ${errorMessage}`);
        }

        const contentType = response.headers.get("content-type") || "";

        if (!contentType.includes("application/json")) {
            const blob = await response.blob();
            if (!blob.size) throw new Error("The buyer attachment is empty.");

            const blobUrl = URL.createObjectURL(blob);
            window.open(blobUrl, "_blank");
            setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
            return;
        }

        const data = await response.json();

        const attachmentUrl =
            data.attachment_url || data.file_url || data.document_url ||
            data.url || data.attachment_path || data.file_path || data.document_path;

        if (!attachmentUrl) throw new Error("No attachment was found for this buyer.");

        let finalUrl = attachmentUrl;

        if (!attachmentUrl.startsWith("http://") &&
            !attachmentUrl.startsWith("https://") &&
            !attachmentUrl.startsWith("blob:") &&
            !attachmentUrl.startsWith("data:")) {

            finalUrl = attachmentUrl.startsWith("/")
                ? `${API_BASE_URL}${attachmentUrl}`
                : `${API_BASE_URL}/${attachmentUrl}`;
        }

        window.open(finalUrl, "_blank");

    } catch (error) {
        console.error("VIEW BUYER ATTACHMENT ERROR:", error);
        alert(error.message || "Failed to open buyer attachment.");
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = button.dataset.originalText || "View Attachment";
        }
    }
}


/* ============================================================
   LOAD BUYER REGISTRY
============================================================ */

async function loadBuyerRegistry() {
    await Promise.all([loadPendingBuyers(), loadVerifiedBuyers()]);
}


async function loadPendingBuyers() {

    const tbody = document.getElementById("pendingBuyersBody");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="2">Loading pending buyer applications...</td></tr>`;

    try {
        const response = await fetch(
            PENDING_BUYERS_ENDPOINT,
            { method: "GET", headers: getAuthHeaders() }
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch pending buyers.\nStatus: ${response.status}\n${errorText}`);
        }

        const data = await response.json();
        pendingBuyersCache = Array.isArray(data) ? data : [];
        renderPendingBuyers(pendingBuyersCache);

    } catch (error) {
        console.error("LOAD PENDING BUYERS ERROR:", error);
        tbody.innerHTML = `
            <tr><td colspan="2">
                <strong>Unable to load pending buyers.</strong><br>
                <small>Check if FastAPI is running and the endpoint is available.</small>
            </td></tr>
        `;
    }
}


function renderPendingBuyers(buyers) {

    const tbody = document.getElementById("pendingBuyersBody");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!buyers.length) {
        tbody.innerHTML = `<tr><td colspan="2">No pending buyer applications.</td></tr>`;
        return;
    }

    buyers.forEach(buyer => {
        const row = document.createElement("tr");
        row.className = "clickable-row";
        row.dataset.buyerStatusId = buyer.buyer_status_id ?? "";
        row.dataset.buyerRegistryId = buyer.buyer_registry_id ?? "";

        row.innerHTML = `
            <td><span class="pill">${escapeHtml(buyer.organization || "N/A")}</span></td>
            <td><span class="pill">${escapeHtml(buyer.contact_person || "N/A")}</span></td>
        `;

        row.addEventListener("click", () => openBuyerReview(buyer));
        tbody.appendChild(row);
    });
}


async function loadVerifiedBuyers() {

    const tbody = document.getElementById("verifiedBuyersBody");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="5">Loading verified buyers...</td></tr>`;

    try {
        const response = await fetch(
            VERIFIED_BUYERS_ENDPOINT,
            { method: "GET", headers: getAuthHeaders() }
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch verified buyers.\nStatus: ${response.status}\n${errorText}`);
        }

        const data = await response.json();
        verifiedBuyersCache = Array.isArray(data) ? data : [];
        renderVerifiedBuyers(verifiedBuyersCache);

    } catch (error) {
        console.error("LOAD VERIFIED BUYERS ERROR:", error);
        tbody.innerHTML = `
            <tr><td colspan="5">
                <strong>Unable to load verified buyers.</strong><br>
                <small>Check if FastAPI is running and the endpoint is available.</small>
            </td></tr>
        `;
    }
}


function renderVerifiedBuyers(buyers) {

    const tbody = document.getElementById("verifiedBuyersBody");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!buyers.length) {
        tbody.innerHTML = `<tr><td colspan="4">No verified buyers found.</td></tr>`;
        return;
    }

    buyers.forEach(buyer => {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td><span class="pill">${escapeHtml(buyer.organization || "N/A")}</span></td>
            <td><span class="pill">${escapeHtml(buyer.contact_person || "N/A")}</span></td>
            <td><span class="pill">${escapeHtml(buyer.email_address || "N/A")}</span></td>
            <td><span class="status-text-verified">Verified</span></td>
        `;

        tbody.appendChild(row);
    });
}


/* ============================================================
   OPEN BUYER REVIEW
============================================================ */

function openBuyerReview(buyer) {

    currentSelectedBuyer = buyer;

    const buyerRegistryList = document.getElementById("buyerRegistryList");
    const buyerReviewDetails = document.getElementById("buyerReviewDetails");

    const reviewOrg = document.getElementById("reviewOrg");
    if (reviewOrg) reviewOrg.textContent = buyer.organization || "N/A";

    const reviewContact = document.getElementById("reviewContact");
    if (reviewContact) reviewContact.textContent = buyer.contact_person || "N/A";

    const reviewEmail = document.getElementById("reviewEmail");
    if (reviewEmail) reviewEmail.textContent = buyer.email_address || "N/A";

    renderReviewCommodities(buyer);

    const messageTextarea = document.querySelector("#buyerReviewDetails textarea");
    if (messageTextarea) {
        messageTextarea.value = buyer.message || "No message provided.";
    }

    buyerRegistryList?.classList.add("hidden-element");
    buyerReviewDetails?.classList.remove("hidden-element");
}


function renderReviewCommodities(buyer) {

    const container = document.getElementById("reviewCommodities");
    if (!container) return;

    container.innerHTML = "";

    const commodities = getCommodityArray(buyer);

    if (!commodities.length) {
        const span = document.createElement("span");
        span.className = "pill";
        span.textContent = "Not specified";
        container.appendChild(span);
        return;
    }

    commodities.forEach(commodity => {
        const span = document.createElement("span");
        span.className = "pill";
        span.textContent = commodity;
        container.appendChild(span);
    });
}


function getCommodityArray(buyer) {

    if (!buyer) return [];

    if (Array.isArray(buyer.commodities)) {
        return buyer.commodities.map(i => String(i).trim()).filter(Boolean);
    }

    if (typeof buyer.commodities === "string") {
        return buyer.commodities.split(",").map(i => i.trim()).filter(Boolean);
    }

    if (buyer.commodity) {
        return [String(buyer.commodity).trim()];
    }

    return [];
}


function showBuyerList() {

    const buyerRegistryList = document.getElementById("buyerRegistryList");
    const buyerReviewDetails = document.getElementById("buyerReviewDetails");

    buyerReviewDetails?.classList.add("hidden-element");
    buyerRegistryList?.classList.remove("hidden-element");

    currentSelectedBuyer = null;
}


/* ============================================================
   APPROVE / REJECT SELECTED BUYER
============================================================ */

async function approveSelectedBuyer() {

    if (!currentSelectedBuyer) { showError("No buyer application selected."); return; }

    const buyerStatusId = currentSelectedBuyer.buyer_status_id;
    if (!buyerStatusId) { showError("Buyer status ID is missing."); return; }

    const confirmButton = document.getElementById("confirmApproveBtn");

    try {
        setButtonLoading(confirmButton, "Approving...");

        const response = await fetch(
            `${BUYER_STATUS_ENDPOINT}/${buyerStatusId}/verify`,
            { method: "PUT", headers: getAuthHeaders() }
        );

        const data = await parseResponse(response);

        if (!response.ok) {
            throw new Error(data.detail || data.message || "Unable to approve buyer.");
        }

        closeModal("confirmApproveModal");
        alert("Buyer verified successfully.");

        currentSelectedBuyer = null;
        showBuyerList();
        await loadBuyerRegistry();

    } catch (error) {
        console.error("APPROVE BUYER ERROR:", error);
        alert(error.message || "Failed to approve buyer.");
    } finally {
        resetButton(confirmButton, "Yes, Approve");
    }
}


async function rejectSelectedBuyer() {

    if (!currentSelectedBuyer) { showError("No buyer application selected."); return; }

    const buyerStatusId = currentSelectedBuyer.buyer_status_id;
    if (!buyerStatusId) { showError("Buyer status ID is missing."); return; }

    const confirmButton = document.getElementById("confirmRejectBtn");

    try {
        setButtonLoading(confirmButton, "Rejecting...");

        const response = await fetch(
            `${BUYER_STATUS_ENDPOINT}/${buyerStatusId}/reject`,
            { method: "PUT", headers: getAuthHeaders() }
        );

        const data = await parseResponse(response);

        if (!response.ok) {
            throw new Error(data.detail || data.message || "Unable to reject buyer.");
        }

        closeModal("confirmRejectModal");
        alert("Buyer application rejected.");

        currentSelectedBuyer = null;
        showBuyerList();
        await loadBuyerRegistry();

    } catch (error) {
        console.error("REJECT BUYER ERROR:", error);
        alert(error.message || "Failed to reject buyer.");
    } finally {
        resetButton(confirmButton, "Yes, Reject");
    }
}


/* ============================================================
   GENERIC HELPERS
============================================================ */

async function parseResponse(response) {
    const text = await response.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch { return { detail: text }; }
}

function setButtonLoading(button, text) {
    if (!button) return;
    button.disabled = true;
    button.dataset.originalText = button.textContent;
    button.textContent = text;
}

function resetButton(button, defaultText) {
    if (!button) return;
    button.disabled = false;
    button.textContent = defaultText;
}

function closeModal(modalId) {
    document.getElementById(modalId)?.classList.remove("show");
}

function showError(message) {
    console.error(message);
    alert(message);
}

function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatDate(dateString) {
    if (!dateString) return "—";
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric"
    });
}

function formatKg(value) {
    return `${Number(value || 0).toLocaleString("en-US", {
        maximumFractionDigits: 2
    })} kg`;
}


/* ============================================================
   STATUS LABEL & CLASS (shared across DA sections)
============================================================ */

function statusLabelAndClass(status) {
    const s = String(status || "").toUpperCase();

    if (s === "SUBMITTED_REGIONAL_PENDING" || s === "FOR_DA_RFO_VALIDATION") {
        return { text: "Regional Pending", cls: "rfo" };
    }
    if (s === "SUBMITTED_REGIONAL_FLAGGED") {
        return { text: "Regional Flagged", cls: "flagged" };
    }
    if (s === "SUBMITTED_REGIONAL_APPROVED" || s === "FINAL_APPROVED") {
        return { text: "Approved", cls: "approved" };
    }
    if (s === "SUBMITTED_PROVINCIAL_PENDING" || s === "FOR_PROVINCIAL_VALIDATION") {
        return { text: "Provincial Pending", cls: "provincial" };
    }
    if (s === "SUBMITTED_PROVINCIAL_FLAGGED") {
        return { text: "Provincial Flagged", cls: "flagged" };
    }
    if (s === "SUBMITTED_MUNICIPAL_PENDING") {
        return { text: "Municipal Pending", cls: "pending" };
    }
    if (s === "SUBMITTED_MUNICIPAL_FLAGGED" || s === "REVISION_REQUIRED") {
        return { text: "Revision Required", cls: "revision" };
    }
    if (s === "DRAFT") {
        return { text: "Draft", cls: "draft" };
    }

    return { text: s || "—", cls: "pending" };
}


/* ============================================================
   ALERT THRESHOLD
============================================================ */

function initAlertThreshold() {

    const thresholdRange = document.getElementById("thresholdRange");
    const thresholdValue = document.getElementById("thresholdValue");
    const chips = document.querySelectorAll(".threshold-chip");
    const saveBtn = document.getElementById("saveConfigBtn");

    function updateThreshold(value) {
        if (thresholdRange) thresholdRange.value = value;
        if (thresholdValue) thresholdValue.textContent = `${value}%`;

        chips.forEach(chip => {
            chip.classList.toggle("active", chip.dataset.val === String(value));
        });
    }

    thresholdRange?.addEventListener("input", e => updateThreshold(e.target.value));

    chips.forEach(chip => {
        chip.addEventListener("click", () => updateThreshold(chip.dataset.val));
    });

    saveBtn?.addEventListener("click", async () => {

        const commodity = document.getElementById("commoditySelect")?.value;
        const baseDemand = document.getElementById("baseDemandInput")?.value;
        const oversupplyThreshold = thresholdRange?.value;

        if (!commodity) { alert("Please select a commodity."); return; }
        if (!baseDemand || Number(baseDemand) <= 0) { alert("Please enter a valid target demand."); return; }

        const payload = {
            commodity: commodity,
            base_demand: Number(baseDemand),
            oversupply_threshold: Number(oversupplyThreshold)
        };

        try {
            const response = await fetch(
                `${API_BASE_URL}/api/alert-thresholds`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${localStorage.getItem("token")}`
                    },
                    body: JSON.stringify(payload)
                }
            );

            const data = await response.json();

            if (!response.ok) {
                alert(data.detail || "Failed to save threshold configuration.");
                return;
            }

            alert("Threshold configuration saved successfully!");

        } catch (error) {
            console.error("Error saving threshold:", error);
            alert("Unable to connect to the server.");
        }
    });
}


/* ============================================================
   ALERTS SECTION
============================================================ */

function initAlertsSection() {
    loadSystemAlertLogs();
}


async function loadSystemAlertLogs() {

    const alertList = document.getElementById("alertList");
    if (!alertList) return;

    alertList.innerHTML = `
        <div style="text-align:center; padding:30px;">Loading system alerts...</div>
    `;

    try {
        const response = await fetch(
            `${API_BASE_URL}/api/planting-intents/municipality-map`,
            { method: "GET", headers: getAuthHeaders(false) }
        );

        if (!response.ok) {
            throw new Error(`Failed to load municipality map data: ${response.status}`);
        }

        const result = await response.json();

        if (!result.data || !Array.isArray(result.data)) {
            alertList.innerHTML = `
                <div style="text-align:center; padding:30px;">No system alerts found.</div>
            `;
            return;
        }

        const alertResults = [];

        for (const municipalityData of result.data) {

            const municipality = municipalityData.municipality;
            if (!municipality || !Array.isArray(municipalityData.commodities)) continue;

            for (const item of municipalityData.commodities) {

                const commodity = item.commodity;
                if (!commodity) continue;

                try {
                    const alertResponse = await fetch(
                        `${API_BASE_URL}/api/alert-thresholds/oversupply/${encodeURIComponent(commodity)}?municipality=${encodeURIComponent(municipality)}`,
                        { method: "GET", headers: getAuthHeaders(false) }
                    );

                    if (!alertResponse.ok) continue;

                    const alertData = await alertResponse.json();

                    if (String(alertData.status || "").toUpperCase() === "OVERSUPPLY") {
                        alertResults.push({
                            commodity: alertData.commodity || commodity,
                            municipality: alertData.municipality || municipality,
                            base_demand: Number(alertData.base_demand || 0),
                            projected_supply: Number(alertData.projected_supply || 0),
                            excess_supply: Number(alertData.excess_supply || 0),
                            supply_percentage: Number(alertData.supply_percentage || 0),
                            status: alertData.status,
                            date: new Date()
                        });
                    }

                } catch (error) {
                    console.error(`Error checking ${commodity} - ${municipality}:`, error);
                }
            }
        }

        renderSystemAlertLogs(alertResults);

    } catch (error) {
        console.error("LOAD SYSTEM ALERT LOGS ERROR:", error);
        alertList.innerHTML = `
            <div style="text-align:center; padding:30px; color:#C0392B;">
                Unable to load system alerts.
            </div>
        `;
    }
}


function renderSystemAlertLogs(alerts) {

    const alertList = document.getElementById("alertList");
    if (!alertList) return;

    alertList.innerHTML = "";

    if (!alerts.length) {
        alertList.innerHTML = `
            <div style="text-align:center; padding:30px;">No active oversupply alerts.</div>
        `;
        return;
    }

    alerts.forEach(alert => {

        const card = document.createElement("div");
        card.className = "alert-card";
        card.dataset.severity = "high";

        const supply = alert.projected_supply;
        const demand = alert.base_demand;

        let surplusPercentage = 0;
        if (demand > 0) {
            surplusPercentage = ((supply - demand) / demand) * 100;
        }

        const alertDate = new Date(alert.date).toLocaleDateString("en-CA");

        const description =
            `${alert.commodity} supply in ${alert.municipality} is ${Math.round(surplusPercentage)}% above projected demand. Monitor closely and coordinate with buyers.`;

        card.innerHTML = `
            <div class="alert-top">
                <div class="alert-title-group">
                    <span class="alert-title">
                        ${escapeHtml(alert.commodity)} Oversupply Risk —
                        ${escapeHtml(alert.municipality)}
                    </span>
                    <span class="sev-pill high">High</span>
                </div>
            </div>

            <p class="alert-desc">${escapeHtml(description)}</p>

            <div class="alert-stats">
                <span>Supply: <b>${formatKg(supply)}</b></span>
                <span>Demand: <b>${formatKg(demand)}</b></span>
                <span>Surplus: <b>+${Math.round(surplusPercentage)}%</b></span>
                <span class="alert-date">${alertDate}</span>
            </div>
        `;

        const statusButton = card.querySelector(".status-pill-btn");
        statusButton?.addEventListener("click", event => {
            event.stopPropagation();
            toggleAlertCardStatus(statusButton);
        });

        card.addEventListener("click", () => {
            currentActiveAlertCard = card;
            openAlertDetailModal(card);
        });

        alertList.appendChild(card);
    });
}


function toggleAlertCardStatus(button) {

    const unresolved = button.classList.contains("unresolved");

    if (unresolved) {
        button.textContent = "Acknowledged";
        button.classList.remove("unresolved");
        button.classList.add("acknowledged");
    } else {
        button.textContent = "Unresolved";
        button.classList.remove("acknowledged");
        button.classList.add("unresolved");
    }
}


function openAlertDetailModal(card) {

    const title = card.querySelector(".alert-title")?.textContent || "—";
    const desc = card.querySelector(".alert-desc")?.textContent || "—";
    const severity = card.querySelector(".sev-pill");
    const stats = card.querySelectorAll(".alert-stats span b");
    const date = card.querySelector(".alert-date")?.textContent || "—";
    const alertStatus = card.querySelector(".status-pill-btn");

    const titleElement = document.getElementById("modalAlertTitle");
    if (titleElement) titleElement.textContent = title;

    const descElement = document.getElementById("modalAlertDesc");
    if (descElement) descElement.textContent = desc;

    const modalSeverity = document.getElementById("modalAlertSev");
    if (modalSeverity && severity) {
        modalSeverity.textContent = severity.textContent;
        modalSeverity.className = "sev-pill";
        modalSeverity.classList.add(severity.classList.contains("high") ? "high" : "medium");
    }

    const supply = document.getElementById("modalAlertSupply");
    if (supply) supply.textContent = stats[0]?.textContent || "—";

    const demand = document.getElementById("modalAlertDemand");
    if (demand) demand.textContent = stats[1]?.textContent || "—";

    const surplus = document.getElementById("modalAlertSurplus");
    if (surplus) surplus.textContent = stats[2]?.textContent || "—";

    const dateElement = document.getElementById("modalAlertDate");
    if (dateElement) dateElement.textContent = date;

    const toggleButton = document.getElementById("toggleAlertStatusBtn");
    if (toggleButton && alertStatus) {
        toggleButton.textContent = alertStatus.classList.contains("unresolved")
            ? "Acknowledge Alert"
            : "Mark as Unresolved";
    }

    document.getElementById("alertDetailModal")?.classList.add("show");
}


const searchAlerts = document.getElementById("searchAlerts");
searchAlerts?.addEventListener("input", () => {
    const searchTerm = searchAlerts.value.toLowerCase().trim();

    document.querySelectorAll("#alertList .alert-card").forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(searchTerm) ? "" : "none";
    });
});


document.getElementById("toggleAlertStatusBtn")
    ?.addEventListener("click", () => {

        if (currentActiveAlertCard) {
            const button = currentActiveAlertCard.querySelector(".status-pill-btn");
            if (button) toggleAlertCardStatus(button);
        }

        document.getElementById("alertDetailModal")?.classList.remove("show");
    });


/* ============================================================
   MODAL LISTENERS
============================================================ */

function initModalListeners() {

    document.querySelectorAll(".modal-overlay").forEach(modal => {
        modal.addEventListener("click", event => {
            if (event.target === modal) modal.classList.remove("show");
        });
    });

    document.querySelectorAll(".modal-cancel-btn").forEach(button => {
        button.addEventListener("click", () => {
            button.closest(".modal-overlay")?.classList.remove("show");
        });
    });
}


/* ============================================================
   REPORTS SECTION — ALIGNED WITH PROVINCIAL PATTERN
============================================================ */

function initReportsSection() {

    // Init sub-features
    initReportSearch();
    initBulkActions();
    initReportDetailButtons();   // ← ✅ ADD THIS LINE

    // Initial load
    loadReports();

    // Observe view activation
    const viewReports = document.getElementById("view-reports");
    const observer = new MutationObserver(() => {
        if (viewReports?.classList.contains("active-view")) {
            loadReports();
        }
    });
    if (viewReports) {
        observer.observe(viewReports, { attributes: true, attributeFilter: ["class"] });
    }

    console.log("✅ DA Reports section initialized.");
}


/* ============================================================
   LOAD ALL REPORT SECTIONS
============================================================ */

async function loadReports() {
    await Promise.allSettled([
        loadPendingReports(),
        loadReturnedToProvincial(),
        loadApprovedReports()
    ]);
}


/* ============================================================
   LOAD PENDING REPORTS
============================================================ */

async function loadPendingReports() {

    const tbody = document.getElementById("pendingReportsBody");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="8" style="padding:30px; text-align:center; color:#999;">Loading reports...</td></tr>`;

    try {
        const data = await fetchJsonWithTimeout(
            DA_PENDING_ENDPOINT,
            {
                method: "GET",
                headers: getAuthHeaders(false)
            },
            10000
        );

        pendingReports = Array.isArray(data) ? data : [];
        selectedReportIds = new Set();

        renderPendingReports();
        updateBulkApproveButton();

    } catch (err) {
        console.error("Load pending error:", err);
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="padding:30px; text-align:center; color:#C0392B;">
                    Failed to load pending reports.
                    <br><small>${escapeHtml(err.message || "Unable to load reports.")}</small>
                </td>
            </tr>
        `;

        const badge = document.getElementById("pendingCountBadge");
        if (badge) badge.textContent = "0";

        pendingReports = [];
        selectedReportIds = new Set();
        updateBulkApproveButton();
    }
}


function renderPendingReports() {

    const tbody = document.getElementById("pendingReportsBody");
    if (!tbody) return;

    const reports = pendingReports.filter(report => {
        const s = String(report.status || "").toUpperCase();
        return s === "SUBMITTED_REGIONAL_PENDING" || s === "FOR_DA_RFO_VALIDATION";
    });

    const badge = document.getElementById("pendingCountBadge");
    if (badge) badge.textContent = reports.length;

    tbody.innerHTML = "";

    if (reports.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="padding:30px; text-align:center; color:#999;">No reports awaiting DA-RFO validation.</td></tr>`;
        return;
    }

    reports.forEach(report => {
        const tr = document.createElement("tr");
        tr.className = "clickable-row";
        tr.dataset.reportId = report.report_id;

        const checked = selectedReportIds.has(report.report_id) ? "checked" : "";
        if (checked) tr.classList.add("selected");

        const sl = statusLabelAndClass(report.status);

        tr.innerHTML = `
            <td class="center-col" onclick="event.stopPropagation()">
                <input type="checkbox" class="row-check" data-report-id="${escapeHtml(report.report_id)}" ${checked}>
            </td>
            <td class="center-col" style="font-weight: 600;">#${escapeHtml(report.report_id)}</td>
            <td>${escapeHtml(report.title || "—")}</td>
            <td>${escapeHtml(report.commodity || "—")}</td>
            <td>${escapeHtml(report.municipality || "—")}</td>
            <td class="center-col">${formatDate(report.planting_date)}</td>
            <td class="center-col">${report.estimated_yield ?? "—"}</td>
            <td class="center-col">
                <span class="status-pill ${sl.cls}">${escapeHtml(sl.text)}</span>
            </td>
        `;

        tr.addEventListener("click", (e) => {
            if (e.target.closest("input[type=checkbox]")) return;
            openReportDetail(report);
        });

        tbody.appendChild(tr);
    });

    tbody.querySelectorAll(".row-check").forEach(cb => {
        cb.addEventListener("change", (e) => {
            const id = Number(e.target.dataset.reportId);
            const row = e.target.closest("tr");

            if (e.target.checked) {
                selectedReportIds.add(id);
                if (row) row.classList.add("selected");
            } else {
                selectedReportIds.delete(id);
                if (row) row.classList.remove("selected");
            }

            updateSelectAllCheckbox();
            updateBulkApproveButton();
        });
    });

    updateSelectAllCheckbox();
}


/* ============================================================
   LOAD RETURNED TO PROVINCIAL
============================================================ */

async function loadReturnedToProvincial() {

    const tbody = document.getElementById("returnedToProvincialBody");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center; color:#999;">Loading reports...</td></tr>`;

    try {
        const data = await fetchJsonWithTimeout(
            RETURNED_TO_PROVINCIAL_ENDPOINT,
            {
                method: "GET",
                headers: getAuthHeaders(false)
            },
            10000
        );

        returnedToProvincialReports = Array.isArray(data) ? data : [];
        renderReturnedToProvincial();

    } catch (err) {
        console.error("Load returned error:", err);
        tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center; color:#C0392B;">Failed to load reports.</td></tr>`;
        const badge = document.getElementById("returnedToProvincialCountBadge");
        if (badge) badge.textContent = "0";
        returnedToProvincialReports = [];
    }
}


function renderReturnedToProvincial() {

    const tbody = document.getElementById("returnedToProvincialBody");
    if (!tbody) return;

    const badge = document.getElementById("returnedToProvincialCountBadge");
    if (badge) badge.textContent = returnedToProvincialReports.length;

    tbody.innerHTML = "";

    if (returnedToProvincialReports.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center; color:#999;">No reports returned to Provincial.</td></tr>`;
        return;
    }

    returnedToProvincialReports.forEach(report => {
        const sl = statusLabelAndClass(report.status);
        const tr = document.createElement("tr");
        tr.className = "clickable-row";
        tr.dataset.reportId = report.report_id;

        tr.innerHTML = `
            <td class="center-col" style="font-weight: 600;">#${escapeHtml(report.report_id)}</td>
            <td>${escapeHtml(report.title || "—")}</td>
            <td>${escapeHtml(report.commodity || "—")}</td>
            <td>${escapeHtml(report.municipality || "—")}</td>
            <td class="center-col">${formatDate(report.flagged_at || report.submitted_at)}</td>
            <td class="center-col">
                <span class="status-pill ${sl.cls}">${escapeHtml(sl.text)}</span>
            </td>
        `;

        tr.addEventListener("click", () => openReportDetail(report));
        tbody.appendChild(tr);
    });
}


/* ============================================================
   LOAD APPROVED REPORTS
============================================================ */

async function loadApprovedReports() {

    const tbody = document.getElementById("approvedReportsBody");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center; color:#999;">Loading reports...</td></tr>`;

    try {
        const data = await fetchJsonWithTimeout(
            APPROVED_BY_REGIONAL_ENDPOINT,
            {
                method: "GET",
                headers: getAuthHeaders(false)
            },
            10000
        );

        approvedReports = Array.isArray(data) ? data : [];
        renderApprovedReports();

    } catch (err) {
        console.error("Load approved error:", err);
        tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center; color:#C0392B;">Failed to load reports.</td></tr>`;
        const badge = document.getElementById("approvedCountBadge");
        if (badge) badge.textContent = "0";
        approvedReports = [];
    }
}


function renderApprovedReports() {

    const tbody = document.getElementById("approvedReportsBody");
    if (!tbody) return;

    const badge = document.getElementById("approvedCountBadge");
    if (badge) badge.textContent = approvedReports.length;

    tbody.innerHTML = "";

    if (approvedReports.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="padding:30px; text-align:center; color:#999;">
                    No approved reports yet.
                </td>
            </tr>
        `;
        return;
    }

    approvedReports.forEach(report => {
        const sl = statusLabelAndClass(report.status);
        const tr = document.createElement("tr");
        tr.className = "clickable-row";
        tr.dataset.reportId = report.report_id;

        tr.innerHTML = `
            <td class="center-col" style="font-weight: 600;">#${escapeHtml(report.report_id)}</td>
            <td>${escapeHtml(report.title || "—")}</td>
            <td>${escapeHtml(report.commodity || "—")}</td>
            <td>${escapeHtml(report.municipality || "—")}</td>
            <td class="center-col">${formatDate(report.approved_at || report.submitted_at)}</td>
            <td class="center-col">
                <span class="status-pill ${sl.cls}">${escapeHtml(sl.text)}</span>
            </td>
        `;

        tr.addEventListener("click", () => openReportDetail(report));
        tbody.appendChild(tr);
    });
}


/* ============================================================
   SEARCH (Pending Reports)
============================================================ */

function initReportSearch() {

    const input = document.getElementById("reportSearchInput");
    if (!input) return;

    input.addEventListener("input", () => {
        const term = input.value.trim().toLowerCase();
        const tbody = document.getElementById("pendingReportsBody");
        if (!tbody) return;

        const rows = tbody.querySelectorAll("tr[data-report-id]");
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(term) ? "" : "none";
        });

        updateSelectAllCheckbox();
    });
}


/* ============================================================
   SELECT ALL
============================================================ */

function updateSelectAllCheckbox() {

    const cb = document.getElementById("selectAllCheckbox");
    if (!cb) return;

    const visibleCheckboxes = document.querySelectorAll(
        "#pendingReportsBody tr:not([style*='display: none']) .row-check"
    );

    const totalVisible = visibleCheckboxes.length;
    const checkedVisible = Array.from(visibleCheckboxes).filter(c => c.checked).length;

    if (totalVisible === 0 || checkedVisible === 0) {
        cb.checked = false;
        cb.indeterminate = false;
    } else if (checkedVisible === totalVisible) {
        cb.checked = true;
        cb.indeterminate = false;
    } else {
        cb.checked = false;
        cb.indeterminate = true;
    }
}


/* ============================================================
   BULK APPROVE BUTTON STATE
============================================================ */

function updateBulkApproveButton() {

    const btn = document.getElementById("bulkApproveBtn");
    if (!btn) return;

    if (selectedReportIds.size > 0) {
        btn.disabled = false;
        btn.textContent = `Approve ${selectedReportIds.size} & Finalize`;
    } else {
        btn.disabled = true;
        btn.textContent = "Approve Selected & Finalize";
    }
}


/* ============================================================
   BULK ACTIONS
============================================================ */

function initBulkActions() {

    const selectAllCb = document.getElementById("selectAllCheckbox");
    const selectAllBtn = document.getElementById("selectAllPendingBtn");
    const bulkBtn = document.getElementById("bulkApproveBtn");

    if (selectAllCb) {
        selectAllCb.addEventListener("change", (e) => {
            const checked = e.target.checked;
            const checkboxes = document.querySelectorAll(
                "#pendingReportsBody tr:not([style*='display: none']) .row-check"
            );

            checkboxes.forEach(cb => {
                if (cb.checked !== checked) {
                    cb.checked = checked;
                    cb.dispatchEvent(new Event("change", { bubbles: true }));
                }
            });
        });
    }

    if (selectAllBtn) {
        selectAllBtn.addEventListener("click", () => {
            const checkboxes = document.querySelectorAll(
                "#pendingReportsBody tr:not([style*='display: none']) .row-check"
            );
            if (checkboxes.length === 0) return;

            const allChecked = Array.from(checkboxes).every(cb => cb.checked);
            checkboxes.forEach(cb => {
                cb.checked = !allChecked;
                cb.dispatchEvent(new Event("change", { bubbles: true }));
            });
        });
    }

    if (bulkBtn) {
        bulkBtn.addEventListener("click", () => {
            if (selectedReportIds.size === 0) return;
            openBulkApproveModal();
        });
    }

    const cancelBtn = document.getElementById("bulkApproveCancelBtn");
    const confirmBtn = document.getElementById("bulkApproveConfirmBtn");

    if (cancelBtn) {
        cancelBtn.addEventListener("click", () => {
            document.getElementById("bulkApproveModal")?.classList.remove("show");
        });
    }

    if (confirmBtn) {
        confirmBtn.addEventListener("click", bulkApproveSelected);
    }
}


function openBulkApproveModal() {

    const modal = document.getElementById("bulkApproveModal");
    const text = document.getElementById("bulkApproveText");
    if (!modal || !text) return;

    const n = selectedReportIds.size;
    text.textContent =
        `Approve ${n} report${n > 1 ? "s" : ""} and finalize?` +
        ` This action will mark the selected report${n > 1 ? "s" : ""} as APPROVED.`;

    modal.classList.add("show");
}


async function bulkApproveSelected() {

    const confirmBtn = document.getElementById("bulkApproveConfirmBtn");
    const cancelBtn = document.getElementById("bulkApproveCancelBtn");

    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = "Processing..."; }
    if (cancelBtn) cancelBtn.disabled = true;

    try {
        const response = await fetch(BULK_APPROVE_ENDPOINT, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({
                report_ids: Array.from(selectedReportIds),
                validator_role: "darfo"
            })
        });

        const data = await parseResponse(response);

        if (!response.ok) {
            throw new Error(data.detail || "Bulk approve failed.");
        }

        document.getElementById("bulkApproveModal")?.classList.remove("show");

        alert(`${data.approved_count || 0} report(s) approved.`);

        selectedReportIds.clear();

        await Promise.allSettled([
            loadPendingReports(),
            loadReturnedToProvincial(),
            loadApprovedReports()
        ]);

    } catch (err) {
        console.error("Bulk approve error:", err);
        document.getElementById("bulkApproveModal")?.classList.remove("show");
        alert(`Error: ${err.message}`);
    } finally {
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = "Confirm"; }
        if (cancelBtn) cancelBtn.disabled = false;
    }
}


/* ============================================================
   APPROVED FILTER PILLS
============================================================ */

function initApprovedFilter() {

    const pills = document.querySelectorAll("#approvedFilterPills .filter-pill");
    if (!pills.length) return;

    pills.forEach(pill => {
        pill.addEventListener("click", () => {
            pills.forEach(p => p.classList.remove("active"));
            pill.classList.add("active");
            currentApprovedFilter = pill.dataset.filter || "all";
            renderApprovedReports();
        });
    });
}


/* ============================================================
   OPEN REPORT DETAIL
============================================================ */

async function openReportDetail(report) {

    if (!report) return;
    selectedReport = report;

    // Hide subviews
    const mainHeader = document.getElementById("reportsMainHeader");
    if (mainHeader) mainHeader.style.display = "none";

    document.getElementById("pendingReportsView")?.style.setProperty("display", "none");
    document.getElementById("returnedToProvincialView")?.style.setProperty("display", "none");
    document.getElementById("approvedReportsView")?.style.setProperty("display", "none");

    const detailView = document.getElementById("individualDetailView");
    if (detailView) {
        detailView.classList.remove("hidden-element");
        detailView.style.display = "block";
    }

    // Reference elements
    const titleEl        = document.getElementById("detailReportTitle");
    const subtitleEl     = document.getElementById("detailReportSubtitle");
    const idEl           = document.getElementById("detailReportId");
    const municipalityEl = document.getElementById("detailReportMunicipality");
    const statusEl       = document.getElementById("detailReportStatus");
    const dateEl         = document.getElementById("detailReportDate");
    const encodedByEl    = document.getElementById("detailReportEncodedBy");
    const yieldEl        = document.getElementById("detailReportYield");
    const notesEl        = document.getElementById("detailReportNotes");
    const attachmentsEl  = document.getElementById("detailReportAttachments");
    const intentsBody    = document.getElementById("detailReportIntentsBody");
    const remarksEl      = document.getElementById("remarksTextarea");
    const flagBtn        = document.getElementById("flagBtn");
    const approveBtn     = document.getElementById("approveBtn");
    const backBtn        = document.getElementById("backToPendingBtn");

    // Populate
    if (titleEl)        titleEl.textContent = report.title || `Report #${report.report_id}`;
    if (subtitleEl)     subtitleEl.textContent = `Report #${report.report_id} • ${report.municipality || ""}`;
    if (idEl)           idEl.textContent = report.report_id ?? "—";
    if (municipalityEl) municipalityEl.textContent = report.municipality || "—";
    if (dateEl)         dateEl.textContent = formatDate(report.submitted_at);
    if (encodedByEl)    encodedByEl.textContent = report.encoded_by_name || "—";
    if (yieldEl)        yieldEl.textContent = report.estimated_yield ?? "—";
    if (notesEl)        notesEl.textContent = report.notes || report.narrative || "—";

    const sl = statusLabelAndClass(report.status);
    if (statusEl) {
        statusEl.innerHTML = `<span class="status-pill ${sl.cls}">${escapeHtml(sl.text)}</span>`;
    }

    const statusUpper = String(report.status || "").toUpperCase();
    const isPending =
        statusUpper === "SUBMITTED_REGIONAL_PENDING" ||
        statusUpper === "FOR_DA_RFO_VALIDATION";

    if (backBtn) { backBtn.style.display = "inline-flex"; backBtn.textContent = "Return"; }

    if (isPending) {
        if (flagBtn) {
            flagBtn.style.display = "inline-flex";
            flagBtn.textContent = "Flag for Revision";
            flagBtn.disabled = false;
            flagBtn.classList.remove("active");
        }
        if (approveBtn) {
            approveBtn.style.display = "inline-flex";
            approveBtn.textContent = "Approve & Finalize";
            approveBtn.disabled = false;
            approveBtn.classList.remove("active");
        }
        if (remarksEl) {
            remarksEl.readOnly = false;
            remarksEl.style.background = "";
            remarksEl.style.color = "";
            remarksEl.style.cursor = "";
            remarksEl.placeholder = "Enter remarks (required if flagging for revision)...";
        }
    } else {
        if (flagBtn)    flagBtn.style.display = "none";
        if (approveBtn) approveBtn.style.display = "none";
        if (remarksEl) {
            remarksEl.readOnly = true;
            remarksEl.style.background = "#F6F3EB";
            remarksEl.style.color = "var(--muted)";
            remarksEl.style.cursor = "default";
        }
    }

    if (remarksEl) remarksEl.value = report.revision_remarks || "";

    // Fetch full report
    try {
        const full = await fetchJsonWithTimeout(
            `${API_BASE_URL}/api/raw-plant-reports/${report.report_id}`,
            {
                method: "GET",
                headers: getAuthHeaders(false)
            },
            10000
        );

        if (notesEl) notesEl.textContent = full.notes || full.remarks || full.narrative || "—";

        renderAttachments(full.attachments || []);
        renderDetailIntents(full.planting_intents || []);

    } catch (err) {
        console.error("Fetch full report error:", err);
        if (attachmentsEl) {
            attachmentsEl.textContent = "Unable to load attachments.";
            attachmentsEl.style.color = "#C0392B";
        }
        if (intentsBody) {
            intentsBody.innerHTML = `
                <tr>
                    <td colspan="7" style="padding:20px; text-align:center; color:#C0392B;">
                        Failed to load intents: ${escapeHtml(err.message)}
                    </td>
                </tr>
            `;
        }
    }

    // Revision remarks box
    const remarksWrapper = document.getElementById("detailRevisionRemarksWrapper");
    const remarksContent = document.getElementById("detailRevisionRemarks");

    if (remarksWrapper && remarksContent) {
        const rawRemarks = report.revision_remarks || "";

        if (rawRemarks && rawRemarks.trim()) {
            const match = rawRemarks.match(/^\[([^\]]+)\]\s*(.*)$/s);

            if (match) {
                remarksContent.innerHTML = `
                    <div style="display: inline-block; font-size: 11px; font-weight: 700; color: #C0392B; background: #FFFFFF; padding: 3px 10px; border-radius: 4px; letter-spacing: 0.02em; margin-bottom: 10px;">
                        ${escapeHtml(match[1])}
                    </div>
                    <div style="color: #333; line-height: 1.6;">
                        ${escapeHtml(match[2])}
                    </div>
                `;
            } else {
                remarksContent.textContent = rawRemarks;
            }

            remarksWrapper.style.display = "block";
        } else {
            remarksWrapper.style.display = "none";
        }
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
}


/* ============================================================
   RENDER ATTACHMENTS
============================================================ */

function renderAttachments(attachments) {

    const container = document.getElementById("detailReportAttachments");
    if (!container) return;

    if (!Array.isArray(attachments) || attachments.length === 0) {
        container.textContent = "No attachments";
        container.style.color = "var(--muted)";
        return;
    }

    container.style.color = "var(--ink)";
    container.innerHTML = attachments.map(file => {
        const name = file.filename || file.file_name || "Attachment";
        const storedName = file.stored_name || "";
        const reportId = selectedReport?.report_id;

        const url = storedName && reportId
            ? `${API_BASE_URL}/api/raw-plant-reports/${reportId}/attachments/${storedName}`
            : null;

        if (url) {
            return `
                <div style="margin-bottom: 8px; padding: 12px 16px; background: #FFFFFF; border: 1.5px solid var(--border); border-radius: 8px; display: flex; align-items: center; gap: 10px;">
                    <div style="width: 36px; height: 36px; border-radius: 8px; background: var(--green-light); display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 18px;">📎</div>
                    <div style="flex: 1; min-width: 0;">
                        <a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="color: var(--green-dark); font-weight: 700; text-decoration: none; font-size: 13.5px;">
                            ${escapeHtml(name)}
                        </a>
                        <div style="font-size: 11px; color: var(--muted); margin-top: 2px;">Click to view attachment</div>
                    </div>
                </div>
            `;
        }

        return `<div style="margin-bottom: 6px;">📎 ${escapeHtml(name)}</div>`;
    }).join("");
}


/* ============================================================
   RENDER DETAIL INTENTS
============================================================ */

function renderDetailIntents(intents) {

    const tbody = document.getElementById("detailReportIntentsBody");
    if (!tbody) return;

    if (!Array.isArray(intents) || intents.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="padding:20px; text-align:center; color:#999;">No intents included.</td></tr>`;
        return;
    }

    tbody.innerHTML = intents.map(intent => {
        const id = intent.planting_intent_id ?? "—";
        const farmer = intent.farmer_name || "—";
        const commodity = intent.commodity || "—";
        const volume = intent.volume != null ? `${intent.volume} kg` : "—";
        const plantingDate = formatDate(intent.planting_date);
        const harvestDate = formatDate(intent.harvest_date);

        const harvestStatus = (intent.finalized_status_at_submission || "NOT PLANTED").toUpperCase();

        let statusText = "Not Planted";
        let bgColor = "#6c757d";

        if (harvestStatus === "PLANTED")        { statusText = "Planted";    bgColor = "#D97706"; }
        else if (harvestStatus === "HARVESTED") { statusText = "Harvested";  bgColor = "#2E7D32"; }
        else if (harvestStatus === "MEDIATING") { statusText = "Mediating";  bgColor = "#2980B9"; }

        return `
            <tr>
                <td class="center-col"><strong>#${escapeHtml(String(id))}</strong></td>
                <td>${escapeHtml(farmer)}</td>
                <td>${escapeHtml(commodity)}</td>
                <td class="center-col">${escapeHtml(volume)}</td>
                <td class="center-col">${escapeHtml(plantingDate)}</td>
                <td class="center-col">${escapeHtml(harvestDate)}</td>
                <td class="center-col">
                    <span class="status-pill" style="background-color:${bgColor};">
                        ${escapeHtml(statusText)}
                    </span>
                </td>
            </tr>
        `;
    }).join("");
}


/* ============================================================
   CLOSE REPORT DETAIL (Return button)
============================================================ */

function closeReportDetail() {

    console.log("🔙 closeReportDetail() called");

    selectedReport = null;

    // --------------------------------------------------------
    // HIDE DETAIL VIEW
    // --------------------------------------------------------

    const detailView = document.getElementById("individualDetailView");

    if (detailView) {
        detailView.classList.add("hidden-element");
        detailView.style.display = "none";
        console.log("   ✔ detailView hidden");
    }


    // --------------------------------------------------------
    // SHOW LIST WRAPPER + SUBVIEWS
    // --------------------------------------------------------

    const listView = document.getElementById("reportsListView");

    if (listView) {
        listView.classList.remove("hidden-element");
        listView.style.display = "block";
        console.log("   ✔ reportsListView shown");
    }

    const pendingView = document.getElementById("pendingReportsView");
    if (pendingView) {
        pendingView.style.display = "block";
    }

    const returnedView = document.getElementById("returnedToProvincialView");
    if (returnedView) {
        returnedView.style.display = "block";
    }

    const approvedView = document.getElementById("approvedReportsView");
    if (approvedView) {
        approvedView.style.display = "block";
    }


    // --------------------------------------------------------
    // RESTORE MAIN HEADER
    // --------------------------------------------------------

    const mainHeader = document.getElementById("reportsMainHeader");
    if (mainHeader) {
        mainHeader.style.display = "flex";
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
}


/* ============================================================
   REPORT DETAIL BUTTONS
============================================================ */

function initReportDetailButtons() {

    function safeAttach(id, handler) {
        const el = document.getElementById(id);
        if (!el) return;

        // Clone to remove all listeners
        const newEl = el.cloneNode(true);
        el.parentNode.replaceChild(newEl, el);

        // Attach fresh listener
        newEl.addEventListener("click", handler);
    }

    safeAttach("backToPendingBtn", closeReportDetail);
    safeAttach("flagBtn", flagReport);
    safeAttach("approveBtn", approveReport);
}


/* ============================================================
   FLAG REPORT FOR REVISION
============================================================ */

async function flagReport() {

    if (!selectedReport) return;

    const validatorId = localStorage.getItem("user_id") ||
                        localStorage.getItem("userId") ||
                        localStorage.getItem("id");
    const accessToken = getAuthToken();
    const tokenType = localStorage.getItem("token_type") || "bearer";

    if (!validatorId || !accessToken) {
        alert("Please log in again.");
        return;
    }

    const userName = localStorage.getItem("full_name")
        || localStorage.getItem("username")
        || "Unknown User";
    const userRole = localStorage.getItem("role") || "DA-RFO Officer";

    const remarksInput = document.getElementById("remarksTextarea")?.value.trim();
    if (!remarksInput) {
        alert("Revision remarks are required.");
        return;
    }

    const remarks = `[${userRole}: ${userName}] ${remarksInput}`;

    const flagBtn = document.getElementById("flagBtn");
    const originalText = flagBtn?.textContent;

    if (flagBtn) {
        flagBtn.disabled = true;
        flagBtn.textContent = "Processing...";
    }

    try {
        const url =
            `${API_BASE_URL}/api/report-submissions/${selectedReport.report_id}/revision` +
            `?validator_id=${encodeURIComponent(validatorId)}` +
            `&validator_role=darfo` +
            `&remarks=${encodeURIComponent(remarks)}`;

        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Accept": "application/json",
                "Authorization": `${tokenType} ${accessToken}`
            }
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || `HTTP ${res.status}`);
        }

        if (flagBtn) {
            flagBtn.classList.add("active");
            flagBtn.textContent = "Flagged ✓";
        }

        alert("Report flagged for revision.");

        setTimeout(async () => {
            closeReportDetail();
            await loadReports();
        }, 400);

    } catch (err) {
        console.error("Flag error:", err);
        alert(`Error: ${err.message}`);
        if (flagBtn) {
            flagBtn.classList.remove("active");
            flagBtn.textContent = originalText || "Flag for Revision";
        }
    } finally {
        if (flagBtn) flagBtn.disabled = false;
    }
}


/* ============================================================
   APPROVE REPORT (Individual)
============================================================ */

async function approveReport() {

    if (!selectedReport) return;

    const validatorId = localStorage.getItem("user_id") ||
                        localStorage.getItem("userId") ||
                        localStorage.getItem("id");
    const accessToken = getAuthToken();
    const tokenType = localStorage.getItem("token_type") || "bearer";

    if (!validatorId || !accessToken) {
        alert("Please log in again.");
        return;
    }

    const userName = localStorage.getItem("full_name")
        || localStorage.getItem("username")
        || "Unknown User";
    const userRole = localStorage.getItem("role") || "DA-RFO Officer";

    const remarksInput = document.getElementById("remarksTextarea")?.value.trim();

    const remarks = remarksInput
        ? `[${userRole}: ${userName}] ${remarksInput}`
        : `Approved by ${userName} (${userRole})`;

    const approveBtn = document.getElementById("approveBtn");
    const originalText = approveBtn?.textContent;

    if (approveBtn) {
        approveBtn.disabled = true;
        approveBtn.textContent = "Processing...";
    }

    try {
        const url =
            `${API_BASE_URL}/api/report-submissions/${selectedReport.report_id}/approve` +
            `?validator_id=${encodeURIComponent(validatorId)}` +
            `&validator_role=darfo` +
            `&remarks=${encodeURIComponent(remarks)}`;

        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Accept": "application/json",
                "Authorization": `${tokenType} ${accessToken}`
            }
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || `HTTP ${res.status}`);
        }

        if (approveBtn) {
            approveBtn.classList.add("active");
            approveBtn.textContent = "Approved ✓";
        }

        alert("Report approved and finalized.");

        setTimeout(async () => {
            closeReportDetail();
            await loadReports();
        }, 400);

    } catch (err) {
        console.error("Approve error:", err);
        alert(`Error: ${err.message}`);
        if (approveBtn) {
            approveBtn.classList.remove("active");
            approveBtn.textContent = originalText || "Approve & Finalize";
        }
    } finally {
        if (approveBtn) approveBtn.disabled = false;
    }
}


/* ============================================================
   END OF da.js
============================================================ */