/* ============================================================
   E SAKA — PROVINCIAL COORDINATOR DASHBOARD
============================================================ */

const API_BASE_URL = "http://127.0.0.1:8000";

const PROVINCIAL_PENDING_ENDPOINT      = `${API_BASE_URL}/api/report-submissions/for-provincial-validation`;
const SENT_TO_REGIONAL_ENDPOINT        = `${API_BASE_URL}/api/report-submissions/sent-to-regional`;
const RETURNED_TO_MUNICIPAL_ENDPOINT   = `${API_BASE_URL}/api/report-submissions/returned-to-municipal`;
const RETURNED_FROM_REGIONAL_ENDPOINT  = `${API_BASE_URL}/api/report-submissions/returned-to-provincial`;
const BULK_APPROVE_ENDPOINT            = `${API_BASE_URL}/api/report-submissions/bulk-approve`;


/* ============================================================
   STATE
============================================================ */

let pendingReports = [];
let sentReports = [];
let returnedToMunicipalReports = [];
let returnedFromRegionalReports = [];
let selectedReportIds = new Set();
let selectedReport = null;
let currentSentToRegionalFilter = "all";
let isEditingRemarks = false;


/* ============================================================
   AUTH HELPERS
============================================================ */

function getAuthToken() {
    return localStorage.getItem("access_token") ||
           localStorage.getItem("token") ||
           null;
}

function getAuthHeaders(extra = {}) {
    const token = getAuthToken();
    const headers = {
        "Content-Type": "application/json",
        ...extra
    };
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
}


/* ============================================================
   FETCH WITH TIMEOUT
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
   USER PROFILE
============================================================ */

function getInitials(name) {
    if (!name) return "--";

    const cleaned = String(name)
        .replace(/^(aew|mcoord|admin|user|municipal|provincial|pcoord|da)[_\s-]+/i, "")
        .replace(/[_\-.]+/g, " ")
        .trim();

    if (!cleaned) return "--";

    const parts = cleaned.split(/\s+/).filter(Boolean);

    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();

    return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatRole(role) {
    if (!role) return "";
    return String(role).replace(/_/g, " ").toUpperCase();
}

function setupUserProfile() {
    const storedName =
        localStorage.getItem("full_name") ||
        localStorage.getItem("name") ||
        localStorage.getItem("username");

    const storedRole = localStorage.getItem("role");

    const nameEl = document.getElementById("userDisplayName");
    const roleEl = document.getElementById("userDisplayRole");
    const initEl = document.getElementById("userDisplayInitials");

    if (nameEl && storedName) nameEl.textContent = storedName;
    if (roleEl && storedRole) roleEl.textContent = formatRole(storedRole);
    if (initEl) initEl.textContent = getInitials(storedName || storedRole);
}


/* ============================================================
   SIDEBAR
============================================================ */

function initSidebar() {
    const hamburgerBtn = document.getElementById("hamburgerBtn");
    const sidebar = document.getElementById("sidebar");

    if (!hamburgerBtn || !sidebar) return;

    let hoverTimer = null;

    hamburgerBtn.addEventListener("mouseenter", () => {
        if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
        sidebar.classList.add("open");
        setTimeout(() => {
            if (window.leafletMap) window.leafletMap.invalidateSize();
        }, 300);
    });

    sidebar.addEventListener("mouseenter", () => {
        if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
    });

    sidebar.addEventListener("mouseleave", () => {
        hoverTimer = setTimeout(() => {
            sidebar.classList.remove("open");
        }, 200);
    });

    document.addEventListener("click", (e) => {
        if (!sidebar.contains(e.target) && !hamburgerBtn.contains(e.target)) {
            sidebar.classList.remove("open");
        }
    });

    sidebar.querySelectorAll(".nav-item").forEach(item => {
        item.addEventListener("click", () => sidebar.classList.remove("open"));
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") sidebar.classList.remove("open");
    });
}


/* ============================================================
   VIEW NAVIGATION
============================================================ */

function initViewNavigation() {
    const navButtons = document.querySelectorAll(".nav-item[data-view]");
    const views = document.querySelectorAll(".view");

    navButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const key = btn.dataset.view;

            views.forEach(v => v.classList.remove("active-view"));
            const target = document.getElementById("view-" + key);
            if (target) target.classList.add("active-view");

            navButtons.forEach(b => b.classList.toggle("active", b === btn));

            if (key === "map" && window.leafletMap) {
                setTimeout(() => window.leafletMap.invalidateSize(), 50);
            }
        });
    });
}


/* ============================================================
   MAP
============================================================ */

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

function initMap() {
    const mapEl = document.getElementById("map");
    if (!mapEl || typeof L === "undefined") return;

    const pampangaBounds = L.latLngBounds([14.85, 120.35], [15.35, 120.95]);

    const map = L.map("map", {
        maxBounds: pampangaBounds,
        maxBoundsViscosity: 1.0,
        minZoom: 10
    }).setView([15.0794, 120.6200], 10);

    window.leafletMap = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 18
    }).addTo(map);
}

async function loadMunicipalityMapData() {
    try {
        if (!window.leafletMap) return;

        const res = await fetch(
            `${API_BASE_URL}/api/planting-intents/municipality-map`,
            { headers: { "Accept": "application/json" } }
        );

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const result = await res.json();
        if (!result.data || !Array.isArray(result.data)) return;

        result.data.forEach(md => {
            const coords = municipalityCoordinates[md.municipality];
            if (!coords) return;

            let popup = `<div style="min-width:180px;"><strong>Municipality:</strong> ${escapeHtml(md.municipality)}<br><br>`;

            if (Array.isArray(md.commodities)) {
                md.commodities.forEach(item => {
                    popup += `<strong>Commodity:</strong> ${escapeHtml(item.commodity)}<br><strong>Status:</strong> ${escapeHtml(item.status)}<br><br>`;
                });
            }

            popup += "</div>";

            L.marker(coords).addTo(window.leafletMap).bindPopup(popup);
        });

    } catch (err) {
        console.error("Map load error:", err);
    }
}


/* ============================================================
   HELPERS
============================================================ */

function formatDate(dateString) {
    if (!dateString) return "—";
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric"
    });
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function statusLabelAndClass(status) {
    const s = String(status || "").toUpperCase();

    if (s === "SUBMITTED_PROVINCIAL_PENDING" || s === "FOR_PROVINCIAL_VALIDATION") {
        return { text: "Provincial Pending", cls: "provincial" };
    }
    if (s === "SUBMITTED_PROVINCIAL_FLAGGED") {
        return { text: "Provincial Flagged", cls: "flagged" };
    }
    if (s === "SUBMITTED_REGIONAL_PENDING" || s === "FOR_DA_RFO_VALIDATION") {
        return { text: "Regional Pending", cls: "rfo" };
    }
    if (s === "SUBMITTED_REGIONAL_FLAGGED") {
        return { text: "Regional Flagged", cls: "flagged" };
    }
    if (s === "SUBMITTED_REGIONAL_APPROVED" || s === "FINAL_APPROVED") {
        return { text: "Approved", cls: "approved" };
    }
    if (s === "SUBMITTED_MUNICIPAL_PENDING") {
        return { text: "Municipal Pending", cls: "pending" };
    }
    if (s === "SUBMITTED_MUNICIPAL_FLAGGED" || s === "REVISION_REQUIRED") {
        return { text: "Revision Required", cls: "revision" };
    }
    if (s === "DRAFT") return { text: "Draft", cls: "draft" };

    return { text: s || "—", cls: "pending" };
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
            PROVINCIAL_PENDING_ENDPOINT,
            { method: "GET", headers: getAuthHeaders({ "Accept": "application/json" }) },
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
        return s === "SUBMITTED_PROVINCIAL_PENDING" || s === "FOR_PROVINCIAL_VALIDATION";
    });

    const badge = document.getElementById("pendingCountBadge");
    if (badge) badge.textContent = reports.length;

    tbody.innerHTML = "";

    if (reports.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="padding:30px; text-align:center; color:#999;">No pending reports.</td></tr>`;
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
   LOAD RETURNED TO MUNICIPAL
============================================================ */

async function loadReturnedToMunicipal() {
    const tbody = document.getElementById("returnedToMunicipalBody");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center; color:#999;">Loading reports...</td></tr>`;

    try {
        const data = await fetchJsonWithTimeout(
            RETURNED_TO_MUNICIPAL_ENDPOINT,
            { method: "GET", headers: getAuthHeaders({ "Accept": "application/json" }) },
            10000
        );

        returnedToMunicipalReports = Array.isArray(data) ? data : [];
        renderReturnedToMunicipal();

    } catch (err) {
        console.error("Load returned error:", err);
        tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center; color:#C0392B;">Failed to load reports.</td></tr>`;
        const badge = document.getElementById("returnedToMunicipalCountBadge");
        if (badge) badge.textContent = "0";
        returnedToMunicipalReports = [];
    }
}

function renderReturnedToMunicipal() {
    const tbody = document.getElementById("returnedToMunicipalBody");
    if (!tbody) return;

    const badge = document.getElementById("returnedToMunicipalCountBadge");
    if (badge) badge.textContent = returnedToMunicipalReports.length;

    tbody.innerHTML = "";

    if (returnedToMunicipalReports.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center; color:#999;">No reports returned to municipal.</td></tr>`;
        return;
    }

    returnedToMunicipalReports.forEach(report => {
        const sl = statusLabelAndClass(report.status);
        const tr = document.createElement("tr");
        tr.className = "clickable-row";
        tr.dataset.reportId = report.report_id;

        tr.innerHTML = `
            <td class="center-col" style="font-weight: 600;">#${escapeHtml(report.report_id)}</td>
            <td>${escapeHtml(report.title || "—")}</td>
            <td>${escapeHtml(report.commodity || "—")}</td>
            <td>${escapeHtml(report.municipality || "—")}</td>
            <td class="center-col">${formatDate(report.submitted_at)}</td>
            <td class="center-col">
                <span class="status-pill ${sl.cls}">${escapeHtml(sl.text)}</span>
            </td>
        `;

        tr.addEventListener("click", () => openReportDetail(report));
        tbody.appendChild(tr);
    });
}


/* ============================================================
   LOAD SENT TO REGIONAL
============================================================ */

async function loadSentToRegional() {
    const tbody = document.getElementById("sentToRegionalBody");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center; color:#999;">Loading reports...</td></tr>`;

    try {
        const data = await fetchJsonWithTimeout(
            SENT_TO_REGIONAL_ENDPOINT,
            { method: "GET", headers: getAuthHeaders({ "Accept": "application/json" }) },
            10000
        );

        sentReports = Array.isArray(data) ? data : [];
        renderSentReports();

    } catch (err) {
        console.error("Load sent error:", err);
        tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center; color:#C0392B;">Failed to load reports.</td></tr>`;
        const badge = document.getElementById("sentCountBadge");
        if (badge) badge.textContent = "0";
        sentReports = [];
    }
}

function renderSentReports() {
    const tbody = document.getElementById("sentToRegionalBody");
    if (!tbody) return;

    const dateHeader = document.getElementById("sentDateColumnHeader");
    if (dateHeader) {
        if (currentSentToRegionalFilter === "approved") {
            dateHeader.textContent = "Approved At";
        } else {
            dateHeader.textContent = "Submitted";
        }
    }

    let filteredReports = sentReports;

    if (currentSentToRegionalFilter === "pending") {
        filteredReports = sentReports.filter(function(report) {
            const status = String(report.status || "").toUpperCase();
            return status === "SUBMITTED_REGIONAL_PENDING" ||
                   status === "SUBMITTED_REGIONAL_FLAGGED";
        });
    } else if (currentSentToRegionalFilter === "approved") {
        filteredReports = sentReports.filter(function(report) {
            const status = String(report.status || "").toUpperCase();
            return status === "SUBMITTED_REGIONAL_APPROVED" ||
                   status === "FINAL_APPROVED";
        });
    }

    const badge = document.getElementById("sentCountBadge");
    if (badge) badge.textContent = filteredReports.length;

    tbody.innerHTML = "";

    if (filteredReports.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="padding:30px; text-align:center; color:#999;">
                    ${currentSentToRegionalFilter === "all"
                        ? "No reports sent to Regional yet."
                        : currentSentToRegionalFilter === "approved"
                            ? "No approved reports yet."
                            : "No pending reports."}
                </td>
            </tr>
        `;
        return;
    }

    filteredReports.forEach(report => {
        const sl = statusLabelAndClass(report.status);
        const isFlagged = sl.cls === "flagged";

        const tr = document.createElement("tr");
        tr.className = "clickable-row";
        tr.dataset.reportId = report.report_id;

        if (isFlagged) tr.style.background = "#FFF5F5";

        let dateValue = "—";
        if (currentSentToRegionalFilter === "approved") {
            dateValue = formatDate(report.approved_at || report.updated_at || report.submitted_at);
        } else {
            dateValue = formatDate(report.submitted_at);
        }

        tr.innerHTML = `
            <td class="center-col" style="font-weight: 600;">#${escapeHtml(report.report_id)}</td>
            <td>${escapeHtml(report.title || "—")}</td>
            <td>${escapeHtml(report.commodity || "—")}</td>
            <td>${escapeHtml(report.municipality || "—")}</td>
            <td class="center-col">${dateValue}</td>
            <td class="center-col">
                <span class="status-pill ${sl.cls}">${escapeHtml(sl.text)}</span>
            </td>
        `;

        tr.addEventListener("click", () => openReportDetail(report));
        tbody.appendChild(tr);
    });
}


/* ============================================================
   FILTER PILLS — SENT TO REGIONAL
============================================================ */

function initSentToRegionalFilter() {
    const pills = document.querySelectorAll("#sentToRegionalFilterPills .filter-pill");
    if (!pills.length) return;

    pills.forEach(pill => {
        pill.addEventListener("click", () => {
            pills.forEach(p => p.classList.remove("active"));
            pill.classList.add("active");

            currentSentToRegionalFilter = pill.dataset.filter || "all";
            renderSentReports();
        });
    });
}


/* ============================================================
   SEARCH
============================================================ */

function initSearch() {
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
   BULK APPROVE
============================================================ */

function updateBulkApproveButton() {
    const btn = document.getElementById("bulkApproveBtn");
    if (!btn) return;

    if (selectedReportIds.size > 0) {
        btn.disabled = false;
        btn.textContent = `Approve ${selectedReportIds.size} & Send to Regional`;
    } else {
        btn.disabled = true;
        btn.textContent = "Approve Selected & Send to Regional";
    }
}

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
        `Approve ${n} report${n > 1 ? "s" : ""} and send to Regional?` +
        ` This action will forward the selected report${n > 1 ? "s" : ""} as-is.`;

    modal.classList.add("show");
}

async function bulkApproveSelected() {
    const confirmBtn = document.getElementById("bulkApproveConfirmBtn");
    const cancelBtn = document.getElementById("bulkApproveCancelBtn");

    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = "Processing..."; }
    if (cancelBtn) cancelBtn.disabled = true;

    try {
        const result = await fetchJsonWithTimeout(
            BULK_APPROVE_ENDPOINT,
            {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    report_ids: Array.from(selectedReportIds),
                    validator_role: "provincial_coordinator"
                })
            },
            15000
        );

        document.getElementById("bulkApproveModal")?.classList.remove("show");

        openModal(
            `${result.approved_count || 0} report${(result.approved_count || 0) > 1 ? "s" : ""} approved and sent to Regional.`
        );

        selectedReportIds.clear();

        await Promise.allSettled([
            loadPendingReports(),
            loadReturnedToMunicipal(),
            loadSentToRegional()
        ]);

    } catch (err) {
        console.error("Bulk approve error:", err);
        document.getElementById("bulkApproveModal")?.classList.remove("show");
        openModal(`Error: ${err.message}`);
    } finally {
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = "Confirm"; }
        if (cancelBtn) cancelBtn.disabled = false;
    }
}


/* ============================================================
   OPEN REPORT DETAIL
============================================================ */

async function openReportDetail(report) {

    if (!report) return;
    selectedReport = report;
    isEditingRemarks = false;

    // Hide list views
    const mainHeader = document.getElementById("reportsMainHeader");
    if (mainHeader) mainHeader.style.display = "none";

    document.getElementById("pendingReportsView")?.style.setProperty("display", "none");
    document.getElementById("returnedToMunicipalView")?.style.setProperty("display", "none");
    document.getElementById("sentToRegionalView")?.style.setProperty("display", "none");

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
    const editBtn        = document.getElementById("editReportBtn");
    const resubmitBtn    = document.getElementById("resubmitReportBtn");
    const backBtn        = document.getElementById("backToPendingBtn");

    // Populate basic info
    if (titleEl)        titleEl.textContent = report.title || `Report #${report.report_id}`;
    if (subtitleEl)     subtitleEl.textContent = `Report #${report.report_id} • ${report.municipality || ""}`;
    if (idEl)           idEl.textContent = report.report_id ?? "—";
    if (municipalityEl) municipalityEl.textContent = report.municipality || "—";
    if (dateEl)         dateEl.textContent = formatDate(report.submitted_at);
    if (encodedByEl)    encodedByEl.textContent = report.encoded_by_name || "—";
    if (yieldEl)        yieldEl.textContent = report.estimated_yield ?? "—";
    if (notesEl)        notesEl.textContent = report.notes || report.narrative || "—";

    // Status pill
    const sl = statusLabelAndClass(report.status);
    if (statusEl) {
        statusEl.innerHTML = `<span class="status-pill ${sl.cls}">${escapeHtml(sl.text)}</span>`;
    }

    // Status flags
    const statusUpper = String(report.status || "").toUpperCase();

    const isProvincialPending =
        statusUpper === "SUBMITTED_PROVINCIAL_PENDING" ||
        statusUpper === "FOR_PROVINCIAL_VALIDATION";

    const isRegionalFlagged =
        statusUpper === "SUBMITTED_REGIONAL_FLAGGED";

    const isReadOnly =
        statusUpper === "SUBMITTED_REGIONAL_PENDING" ||
        statusUpper === "SUBMITTED_REGIONAL_APPROVED" ||
        statusUpper === "FINAL_APPROVED";

    // Back button always visible
    if (backBtn) {
        backBtn.style.display = "inline-flex";
        backBtn.textContent = "Return";
    }

    // ========================================================
    // BUTTON STATES
    // ========================================================

    if (isProvincialPending) {
        // ----------------------------------------------------
        // PENDING — new from Municipal
        // ----------------------------------------------------
        if (editBtn)     editBtn.style.display = "none";
        if (resubmitBtn) resubmitBtn.style.display = "none";

        if (flagBtn) {
            flagBtn.style.display = "inline-flex";
            flagBtn.textContent = "Flag for Revision";
            flagBtn.disabled = false;
            flagBtn.classList.remove("active");
        }

        if (approveBtn) {
            approveBtn.style.display = "inline-flex";
            approveBtn.textContent = "Approve & Send to Regional";
            approveBtn.disabled = false;
            approveBtn.classList.remove("active");
        }

        if (remarksEl) {
            remarksEl.readOnly = false;
            remarksEl.disabled = false;
            remarksEl.style.background = "#FFFFFF";
            remarksEl.style.color = "var(--ink)";
            remarksEl.style.cursor = "text";
            remarksEl.style.borderColor = "var(--border)";
            remarksEl.style.borderWidth = "1.5px";
            remarksEl.placeholder = "Enter remarks (required if flagging for revision)...";
            remarksEl.value = report.revision_remarks || "";
        }

    } else if (isRegionalFlagged) {
        // ----------------------------------------------------
        // REGIONAL FLAGGED — DA-RFO sent it back to Provincial
        // ----------------------------------------------------

        if (flagBtn)    flagBtn.style.display = "none";
        if (approveBtn) approveBtn.style.display = "none";

        // ✅ Show Edit button
        if (editBtn) {
            editBtn.style.display = "inline-flex";
            editBtn.textContent = "Edit";
            editBtn.disabled = false;
            editBtn.style.borderColor = "";
            editBtn.style.color = "";
        }

        // ✅ Resubmit button — WITH onclick handler
        if (resubmitBtn) {
            resubmitBtn.style.display = "none";
            resubmitBtn.disabled = false;
            resubmitBtn.textContent = "Resubmit to Regional";
        }


        // ✅ Back button
        if (backBtn) {
            backBtn.style.display = "inline-flex";
            backBtn.textContent = "Return";
        }

        // ✅ Locked remarks
        if (remarksEl) {
            remarksEl.readOnly = true;
            remarksEl.disabled = false;
            remarksEl.style.background = "#F6F3EB";
            remarksEl.style.color = "var(--ink)";
            remarksEl.style.cursor = "default";
            remarksEl.style.borderColor = "var(--border)";
            remarksEl.style.borderWidth = "1.5px";
            remarksEl.placeholder = "Click 'Edit Remarks' to modify...";
            remarksEl.value = report.revision_remarks || "";
        }


    } else if (isReadOnly) {
        // ----------------------------------------------------
        // READ-ONLY
        // ----------------------------------------------------
        if (editBtn)     editBtn.style.display = "none";
        if (resubmitBtn) resubmitBtn.style.display = "none";
        if (flagBtn)     flagBtn.style.display = "none";
        if (approveBtn)  approveBtn.style.display = "none";

        if (remarksEl) {
            remarksEl.readOnly = true;
            remarksEl.disabled = false;
            remarksEl.style.background = "#F6F3EB";
            remarksEl.style.color = "var(--muted)";
            remarksEl.style.cursor = "default";
            remarksEl.style.borderColor = "var(--border)";
            remarksEl.style.borderWidth = "1.5px";
            remarksEl.placeholder = "Read-only — report already forwarded.";
            remarksEl.value = report.revision_remarks || "";
        }

    } else {
        // ----------------------------------------------------
        // FALLBACK
        // ----------------------------------------------------
        if (editBtn)     editBtn.style.display = "none";
        if (resubmitBtn) resubmitBtn.style.display = "none";
        if (flagBtn)     flagBtn.style.display = "none";
        if (approveBtn)  approveBtn.style.display = "none";

        if (remarksEl) {
            remarksEl.readOnly = true;
            remarksEl.disabled = false;
            remarksEl.style.background = "#F6F3EB";
            remarksEl.style.color = "var(--muted)";
            remarksEl.style.cursor = "default";
        }
    }

    // Fetch full report details
    try {
        const full = await fetchJsonWithTimeout(
            `${API_BASE_URL}/api/raw-plant-reports/${report.report_id}`,
            { method: "GET", headers: getAuthHeaders(false) },
            10000
        );

        if (notesEl) {
            notesEl.textContent = full.notes || full.remarks || full.narrative || "—";
        }

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
                    <div style="
                        display: inline-block;
                        font-size: 11px;
                        font-weight: 700;
                        color: #C0392B;
                        background: #FFFFFF;
                        padding: 3px 10px;
                        border-radius: 4px;
                        letter-spacing: 0.02em;
                        margin-bottom: 10px;
                    ">
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
   EDIT REMARKS BUTTON — Toggle Edit Mode
============================================================ */

function initEditReportButton() {
    const editBtn = document.getElementById("editReportBtn");
    const resubmitBtn = document.getElementById("resubmitReportBtn");

    if (editBtn) {
        editBtn.addEventListener("click", function () {
            const remarksEl = document.getElementById("remarksTextarea");
            if (!remarksEl) return;

            remarksEl.readOnly = false;
            remarksEl.disabled = false;
            remarksEl.style.background = "#FFFFFF";
            remarksEl.style.color = "var(--ink)";
            remarksEl.style.cursor = "text";
            remarksEl.style.borderColor = "var(--green)";
            remarksEl.style.borderWidth = "2px";
            remarksEl.placeholder = "Enter your remarks for the resubmission...";
            remarksEl.focus();

            editBtn.style.display = "none";
            if (resubmitBtn) resubmitBtn.style.display = "inline-flex";
        });
    }

    if (resubmitBtn) {
        resubmitBtn.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();

            if (!selectedReport) {
                alert("No report selected.");
                return;
            }
            resubmitToRegional(selectedReport.report_id);
        });
    }
}


/* ============================================================
   RESUBMIT TO REGIONAL
============================================================ */

async function resubmitToRegional(reportId) {

    if (!reportId) {
        alert("Report ID is missing.");
        return;
    }

    const remarksEl = document.getElementById("remarksTextarea");
    const userRemarks = (remarksEl?.value || "").trim();

    if (!confirm(
        "Resubmit this report to Regional (DA-RFO)?\n\n" +
        (userRemarks ? `Your remarks: ${userRemarks}` : "(No remarks provided)")
    )) {
        return;
    }

    const validatorId = localStorage.getItem("user_id")
                     || localStorage.getItem("userId")
                     || localStorage.getItem("id");
    const accessToken = getAuthToken();
    const tokenType = localStorage.getItem("token_type") || "bearer";

    if (!validatorId || !accessToken) {
        alert("Please log in again.");
        return;
    }

    const userName = localStorage.getItem("full_name")
                  || localStorage.getItem("username")
                  || "Unknown";

    const remarks = userRemarks
        ? `[Provincial Coordinator: ${userName}] ${userRemarks}`
        : `[Provincial Coordinator: ${userName}] Resubmitted after DA-RFO revision.`;

    const resubmitBtn = document.getElementById("resubmitReportBtn");
    const originalText = resubmitBtn?.textContent;

    if (resubmitBtn) {
        resubmitBtn.disabled = true;
        resubmitBtn.textContent = "Resubmitting...";
    }

    try {
        const url =
            `${API_BASE_URL}/api/report-submissions/${reportId}/approve` +
            `?validator_id=${encodeURIComponent(validatorId)}` +
            `&validator_role=provincial_coordinator` +
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

        alert("Report resubmitted to Regional successfully.");

        closeReportDetail();

        await Promise.allSettled([
            loadPendingReports(),
            loadReturnedToMunicipal(),
            loadSentToRegional()
        ]);

    } catch (err) {
        console.error("Resubmit error:", err);
        alert(`Error: ${err.message}`);
    } finally {
        if (resubmitBtn) {
            resubmitBtn.disabled = false;
            resubmitBtn.textContent = originalText || "Resubmit to Regional";
        }
    }
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
   CLOSE REPORT DETAIL
============================================================ */

function closeReportDetail() {
    selectedReport = null;
    isEditingRemarks = false;

    document.getElementById("individualDetailView")?.classList.add("hidden-element");
    document.getElementById("individualDetailView")?.style.setProperty("display", "none");

    document.getElementById("pendingReportsView")?.style.setProperty("display", "block");
    document.getElementById("returnedToMunicipalView")?.style.setProperty("display", "block");
    document.getElementById("sentToRegionalView")?.style.setProperty("display", "block");

    const mainHeader = document.getElementById("reportsMainHeader");
    if (mainHeader) mainHeader.style.display = "flex";

    // Reset Edit button
    const editBtn = document.getElementById("editReportBtn");
    if (editBtn) {
        editBtn.style.display = "none";
        editBtn.textContent = "Edit Remarks";
        editBtn.style.borderColor = "";
        editBtn.style.color = "";
    }

    // Reset Resubmit button
    const resubmitBtn = document.getElementById("resubmitReportBtn");
    if (resubmitBtn) {
        resubmitBtn.style.display = "none";
        resubmitBtn.disabled = false;
        resubmitBtn.textContent = "Resubmit to Regional";
    }
}


/* ============================================================
   FLAG FOR REVISION
============================================================ */

function initFlagButton() {
    const flagBtn = document.getElementById("flagBtn");
    if (!flagBtn) return;

    flagBtn.addEventListener("click", async () => {
        if (!selectedReport) return;

        const validatorId = localStorage.getItem("user_id");
        const accessToken = getAuthToken();
        const tokenType = localStorage.getItem("token_type") || "bearer";

        if (!validatorId || !accessToken) {
            openModal("Please log in again.");
            return;
        }

        const userName = localStorage.getItem("full_name")
            || localStorage.getItem("username")
            || "Unknown User";
        const userRole = localStorage.getItem("role") || "Provincial Coordinator";

        const remarksInput = document.getElementById("remarksTextarea").value.trim();
        if (!remarksInput) {
            openModal("Revision remarks are required.");
            return;
        }

        const remarks = `[${userRole}: ${userName}] ${remarksInput}`;

        flagBtn.disabled = true;
        flagBtn.textContent = "Processing...";

        try {
            const url =
                `${API_BASE_URL}/api/report-submissions/${selectedReport.report_id}/revision` +
                `?validator_id=${encodeURIComponent(validatorId)}` +
                `&validator_role=provincial_coordinator` +
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

            flagBtn.classList.add("active");
            flagBtn.textContent = "Flagged ✓";

            openModal("Report Flagged for Revision");

            setTimeout(async () => {
                closeReportDetail();
                await loadPendingReports();
                await loadReturnedToMunicipal();
                await loadSentToRegional();
            }, 800);

        } catch (err) {
            console.error("Flag error:", err);
            openModal(`Error: ${err.message}`);
            flagBtn.classList.remove("active");
            flagBtn.textContent = "Flag for Revision";
        } finally {
            flagBtn.disabled = false;
        }
    });
}


/* ============================================================
   APPROVE (INDIVIDUAL)
============================================================ */

function initApproveButton() {
    const approveBtn = document.getElementById("approveBtn");
    if (!approveBtn) return;

    approveBtn.addEventListener("click", async () => {
        if (!selectedReport) return;

        const validatorId = localStorage.getItem("user_id");
        const accessToken = getAuthToken();
        const tokenType = localStorage.getItem("token_type") || "bearer";

        if (!validatorId || !accessToken) {
            openModal("Please log in again.");
            return;
        }

        const userName = localStorage.getItem("full_name")
            || localStorage.getItem("username")
            || "Unknown User";
        const userRole = localStorage.getItem("role") || "Provincial Coordinator";

        const remarksInput = document.getElementById("remarksTextarea").value.trim();

        const remarks = remarksInput
            ? `[${userRole}: ${userName}] ${remarksInput}`
            : `Approved by ${userName} (${userRole})`;

        approveBtn.disabled = true;
        approveBtn.textContent = "Processing...";

        try {
            const url =
                `${API_BASE_URL}/api/report-submissions/${selectedReport.report_id}/approve` +
                `?validator_id=${validatorId}` +
                `&validator_role=provincial_coordinator` +
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

            approveBtn.classList.add("active");
            approveBtn.textContent = "Approved ✓";

            openModal("Report Approved and Sent to Regional");

            setTimeout(async () => {
                closeReportDetail();
                await loadPendingReports();
                await loadSentToRegional();
            }, 800);

        } catch (err) {
            console.error("Approve error:", err);
            openModal(`Error: ${err.message}`);
            approveBtn.classList.remove("active");
            approveBtn.textContent = "Approve & Send to Regional";
        } finally {
            approveBtn.disabled = false;
        }
    });
}


/* ============================================================
   MODAL HELPER
============================================================ */

function openModal(message) {
    const modal = document.getElementById("reportModal");
    const text = document.getElementById("reportModalText");

    if (!modal || !text) return;

    text.textContent = message;
    modal.classList.add("show");
}


/* ============================================================
   INITIALIZATION
============================================================ */

document.addEventListener("DOMContentLoaded", async () => {
    console.log("Provincial dashboard loaded.");

    initSidebar();
    initViewNavigation();
    initMap();
    loadMunicipalityMapData();
    setupUserProfile();
    initSearch();
    initBulkActions();
    initSentToRegionalFilter();
    initFlagButton();
    initApproveButton();
    initEditReportButton();   // ✅ Edit button handler

    const backBtn = document.getElementById("backToPendingBtn");
    if (backBtn) {
        backBtn.addEventListener("click", closeReportDetail);
    }

    const modalConfirm = document.getElementById("reportModalConfirmBtn");
    if (modalConfirm) {
        modalConfirm.addEventListener("click", () => {
            document.getElementById("reportModal")?.classList.remove("show");
        });
    }

    await Promise.allSettled([
        loadPendingReports(),
        loadReturnedToMunicipal(),
        loadSentToRegional()
    ]);
});