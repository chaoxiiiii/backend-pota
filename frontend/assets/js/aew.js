/* ============================================================
   E SAKA — AEW DASHBOARD
   Complete Frontend JavaScript (FIXED)
============================================================ */

/* ============================================================
   API CONFIGURATION
============================================================ */

const API_BASE_URL = "http://127.0.0.1:8000";

const FARMERS_ENDPOINT = `${API_BASE_URL}/api/farmers/farmers/`;
const PLANTING_INTENTS_ENDPOINT = `${API_BASE_URL}/api/planting-intents/`;
const RAW_PLANT_REPORTS_ENDPOINT = `${API_BASE_URL}/api/raw-plant-reports/from-planting-intent`;
const REPORT_SUBMISSIONS_ENDPOINT = `${API_BASE_URL}/api/report-submissions`;
const OFFTAKE_REQUESTS_ENDPOINT = `${API_BASE_URL}/api/offtake-requests/`;
const FORECASTS_ENDPOINT = `${API_BASE_URL}/api/forecasts/`;

/* ============================================================
   AUTH
============================================================ */

function getAuthToken() {
    return localStorage.getItem("access_token") || localStorage.getItem("token") || null;
}

function getAuthHeaders() {
    const token = getAuthToken();
    const headers = { "Content-Type": "application/json" };
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
}

/* ============================================================
   STATE
============================================================ */

let FARMERS_DATA = [];
let allFarmers = [];
let allBuyers = [];

// Planting Intent
let PLANTING_INTENTS_DATA = [];
let filteredPlantingIntents = null;

// Pagination
let currentFarmersPage = 1;
const farmersPerPage = 10;
const plantingIntentsPerPage = 10;
let currentDraftIntentsPage = 1;
let currentSubmittedIntentsPage = 1;

// Farmer state
let currentActiveFarmer = null;
let isEditMode = false;
let mapInstance = null;

// Map & Filter State
let MUNICIPALITY_MAP_RAW_DATA = [];
let mapMarkersLayer = null;

// Offtake state
let currentOfftakeRequest = null;
let OFFTAKE_REQUESTS_DATA = [];
let currentOfftakePage = 1;
const offtakePerPage = 7;

// Forecasting
let FORECASTS_DATA = [];
let priceChartInstance = null;

/* ============================================================
   INITIALIZATION
============================================================ */

document.addEventListener("DOMContentLoaded", async () => {
    console.log("eSaka AEW Dashboard loaded.");

    initSidebar();
    initViewNavigation();
    initMap();
    loadMunicipalityMapData();
    initFarmerSubviews();
    initPlantingIntent();
    initOfftakeRequest();
    initSignout();
    setupUserProfile();
    initForecastResults();
    initReporting();
    initNotificationBell();

    await fetchFarmers();
    await fetchPlantingIntents();
    await loadReports();
    await fetchOfftakeRequests();

    initFarmerSearch();
    initializePlantingIntentSearch();
});

/* ============================================================
   USER PROFILE (topbar text only — modal logic lives in the HTML)
============================================================ */

function setupUserProfile() {
    const storedName =
        localStorage.getItem("user_display_name") ||
        localStorage.getItem("full_name") ||
        localStorage.getItem("name") ||
        localStorage.getItem("username");
    const storedRole = localStorage.getItem("role");

    const nameElement = document.getElementById("userDisplayName");
    const roleElement = document.getElementById("userDisplayRole");

    if (nameElement && storedName) nameElement.textContent = storedName;
    if (roleElement && storedRole) roleElement.textContent = storedRole;
}

/* ============================================================
   API REQUEST HELPER
============================================================ */

async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            ...getAuthHeaders(),
            ...(options.headers || {})
        }
    });

    let data = null;
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
        try { data = await response.json(); } catch { data = null; }
    } else {
        try { data = await response.text(); } catch { data = null; }
    }

    if (!response.ok) {
        let message = `HTTP ${response.status}`;
        if (data && typeof data === "object") {
            if (data.detail) {
                message = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
            }
        } else if (typeof data === "string" && data.trim()) {
            message = data;
        }
        const error = new Error(message);
        error.status = response.status;
        error.data = data;
        throw error;
    }

    return data;
}

function handleAuthError(error) {
    if (error && (error.status === 401 || error.status === 403)) {
        console.warn("Authentication/authorization error:", error);
        return true;
    }
    return false;
}

/* ============================================================
   SIDEBAR  (FIX: hamburger now responds to CLICK, not just hover)
============================================================ */

function initSidebar() {
    const hamburgerBtn = document.getElementById("hamburgerBtn");
    const sidebar = document.getElementById("sidebar");

    if (!hamburgerBtn || !sidebar) return;

    let hoverTimer = null;

    // CLICK TOGGLE (this was missing before)
    hamburgerBtn.addEventListener("click", function(event) {
        event.stopPropagation();
        sidebar.classList.toggle("open");
        setTimeout(function() {
            if (mapInstance) mapInstance.invalidateSize();
        }, 300);
    });

    hamburgerBtn.addEventListener("mouseenter", function() {
        if (hoverTimer) {
            clearTimeout(hoverTimer);
            hoverTimer = null;
        }
        sidebar.classList.add("open");
        setTimeout(function() {
            if (mapInstance) mapInstance.invalidateSize();
        }, 300);
    });

    sidebar.addEventListener("mouseleave", function() {
        hoverTimer = setTimeout(function() {
            sidebar.classList.remove("open");
        }, 300);
    });

    sidebar.addEventListener("mouseenter", function() {
        if (hoverTimer) {
            clearTimeout(hoverTimer);
            hoverTimer = null;
        }
    });

    document.addEventListener("click", function(event) {
        const isClickInsideSidebar = sidebar.contains(event.target);
        const isClickOnHamburger = hamburgerBtn.contains(event.target);
        if (!isClickInsideSidebar && !isClickOnHamburger) {
            sidebar.classList.remove("open");
        }
    });

    sidebar.querySelectorAll(".nav-item").forEach(function(item) {
        item.addEventListener("click", function() {
            sidebar.classList.remove("open");
        });
    });

    document.addEventListener("keydown", function(event) {
        if (event.key === "Escape") {
            sidebar.classList.remove("open");
        }
    });
}

/* ============================================================
   VIEW NAVIGATION
============================================================ */

function initViewNavigation() {
    const navButtons = document.querySelectorAll(".nav-item[data-view]");
    const views = document.querySelectorAll(".view");

    navButtons.forEach(function(button) {
        button.addEventListener("click", function() {
            const targetViewKey = this.dataset.view;

            views.forEach(function(view) {
                view.classList.remove("active-view");
            });

            const targetView = document.getElementById("view-" + targetViewKey);
            if (targetView) {
                targetView.classList.add("active-view");
            }

            navButtons.forEach(function(navButton) {
                navButton.classList.toggle("active", navButton === button);
            });

            if (targetViewKey === "map" && mapInstance) {
                setTimeout(function() {
                    mapInstance.invalidateSize();
                }, 100);
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

    signoutBtn.addEventListener("click", function() {
        localStorage.removeItem("access_token");
        localStorage.removeItem("token");
        localStorage.removeItem("full_name");
        localStorage.removeItem("name");
        localStorage.removeItem("username");
        localStorage.removeItem("role");
        window.location.href = "../index.html";
    });
}

/* ============================================================
   MAP
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

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 18
    }).addTo(mapInstance);
}

/* ============================================================
   MUNICIPALITY COORDINATES & MAP DATA
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

async function loadMunicipalityMapData() {
    try {
        const response = await fetch(
            `${API_BASE_URL}/api/planting-intents/municipality-map`,
            {
                method: "GET",
                headers: { "Accept": "application/json" }
            }
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();
        console.log("AEW Municipality Map Data:", result);

        if (!result.data || !Array.isArray(result.data)) {
            console.warn("No municipality map data found.");
            return;
        }

        MUNICIPALITY_MAP_RAW_DATA = result.data;
        renderFilteredMapMarkers();

        document.getElementById('filterCommodity')?.addEventListener('change', renderFilteredMapMarkers);
        document.getElementById('filterStatus')?.addEventListener('change', renderFilteredMapMarkers);

    } catch (error) {
        console.error("Failed to load AEW municipality map data:", error);
    }
}

function renderFilteredMapMarkers() {
    if (!mapInstance) return;

    if (mapMarkersLayer) {
        mapInstance.removeLayer(mapMarkersLayer);
    }

    mapMarkersLayer = L.layerGroup().addTo(mapInstance);

    const selectedCommodity = document.getElementById('filterCommodity')?.value || 'all';
    const selectedStatus = document.getElementById('filterStatus')?.value || 'all';

    MUNICIPALITY_MAP_RAW_DATA.forEach(municipalityData => {
        const municipality = municipalityData.municipality;
        const baseCoordinates = municipalityCoordinates[municipality];

        if (!baseCoordinates || !municipalityData.commodities) return;

        const filteredCommodities = municipalityData.commodities.filter(item => {
            const commodityMatch = selectedCommodity === 'all' ||
                (item.commodity || "").toLowerCase() === selectedCommodity.toLowerCase();
            const statusVal = (item.status || "").toUpperCase();

            let statusMatch = true;
            if (selectedStatus !== 'all') {
                statusMatch = statusVal.includes(selectedStatus);
            }

            return commodityMatch && statusMatch;
        });

        const totalFiltered = filteredCommodities.length;

        filteredCommodities.forEach((item, index) => {
            const commodity = item.commodity;
            const status = (item.status || "").toUpperCase();

            const offsetLat = baseCoordinates[0] + (index - (totalFiltered / 2)) * 0.0025;
            const offsetLng = baseCoordinates[1] + (index - (totalFiltered / 2)) * 0.0025;
            const markerCoordinates = [offsetLat, offsetLng];

            let markerColor = "#6c757d"; // Gray = No Data

            if (status.includes("SURPLUS") || status.includes("OVERSUPPLY")) {
                markerColor = "#C0392B"; // Red
            } else if (status.includes("BALANCED")) {
                markerColor = "#2E7D32"; // Green
            } else if (status.includes("DEFICIT")) {
                markerColor = "#D97706"; // Amber
            }

            const customIcon = L.divIcon({
                className: 'custom-map-marker',
                html: `<div style="
                    background-color: ${markerColor};
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    border: 2px solid white;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                "></div>`,
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            });

            const popupContent = `
                <div style="min-width:180px;">
                    <strong>Municipality:</strong> ${escapeHtml(municipality)}
                    <br><br>
                    <strong>Commodity:</strong> ${escapeHtml(commodity)}
                    <br>
                    <strong>Status:</strong> <span style="font-weight:700; color:${markerColor};">${escapeHtml(status || 'NO DATA')}</span>
                </div>
            `;

            L.marker(markerCoordinates, { icon: customIcon })
                .addTo(mapMarkersLayer)
                .bindPopup(popupContent);
        });
    });
}

/* ============================================================
   FARMERS
============================================================ */

function normalizeFarmer(farmer) {
    return {
        farmer_id: farmer.farmer_id ?? null,
        rsbsa_id: farmer.rsbsa_id ?? "",
        first_name: farmer.first_name ?? "",
        middle_name: farmer.middle_name ?? "",
        last_name: farmer.last_name ?? "",
        suffix: farmer.suffix ?? "",
        address: farmer.address ?? "",
        sex: farmer.sex ?? "",
        birthdate: farmer.birthdate ?? "",
        email_address: farmer.email_address ?? "",
        phone_number: farmer.phone_number ?? "",
        region: farmer.region ?? "",
        municipality: farmer.municipality ?? "",
        barangay: farmer.barangay ?? "",
        status: farmer.status ?? "Active"
    };
}

function getFarmerFullName(farmer) {
    return [
        farmer.first_name,
        farmer.middle_name ? farmer.middle_name.charAt(0) + "." : "",
        farmer.last_name,
        farmer.suffix
    ].filter(Boolean).join(" ");
}

async function fetchFarmers() {
    const tbody = document.getElementById("farmersTableBody");
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="5" style="padding:30px; text-align:center;">Loading farmers...</td></tr>`;
    }

    try {
        const data = await apiRequest(FARMERS_ENDPOINT, { method: "GET" });

        if (!Array.isArray(data)) {
            throw new Error("Invalid farmers response.");
        }

        allFarmers = data;
        FARMERS_DATA = data.map(normalizeFarmer);
        currentFarmersPage = 1;
        renderFarmersTable();

        // FIX: refresh dropdowns here instead of monkey-patching this function
        refreshFarmerDropdowns();

        return FARMERS_DATA;
    } catch (error) {
        console.error("Unable to load farmers:", error);
        FARMERS_DATA = [];
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="5" style="padding:30px; text-align:center; color:#C0392B;">Failed to load farmers.<br><small>${escapeHtml(error.message || "Please check the FastAPI server.")}</small></td></tr>`;
        }
        updatePagination();
        return [];
    }
}

function renderFarmersTable() {
    const tbody = document.getElementById("farmersTableBody");
    if (!tbody) return;

    tbody.innerHTML = "";
    const start = (currentFarmersPage - 1) * farmersPerPage;
    const end = start + farmersPerPage;
    const paginatedItems = FARMERS_DATA.slice(start, end);

    if (paginatedItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="padding:30px; text-align:center; color:#777;">No farmers found.</td></tr>`;
        updatePagination();
        return;
    }

    paginatedItems.forEach(function(farmer) {
        tbody.appendChild(createFarmerTableRow(farmer));
    });

    updatePagination();
}

function createFarmerTableRow(farmer) {
    const tr = document.createElement("tr");
    tr.className = "clickable-row";

    const fullName = getFarmerFullName(farmer);

    tr.innerHTML = `
        <td><span class="pill">${escapeHtml(fullName)}</span></td>
        <td><span class="pill">${escapeHtml(farmer.rsbsa_id || "-")}</span></td>
        <td><span class="pill">${escapeHtml(farmer.municipality || "-")}</span></td>
        <td><span class="pill">${escapeHtml(farmer.barangay || "-")}</span></td>
        <td style="text-align: center;"><span class="status-pill active">${escapeHtml(farmer.status || "Active")}</span></td>
    `;

    tr.addEventListener("click", function() {
        openManageFarmer(farmer);
    });

    return tr;
}

function updatePagination() {
    const total = FARMERS_DATA.length;
    const totalPages = Math.max(1, Math.ceil(total / farmersPerPage));

    if (currentFarmersPage > totalPages) currentFarmersPage = totalPages;

    const start = total === 0 ? 0 : (currentFarmersPage - 1) * farmersPerPage + 1;
    const end = Math.min(currentFarmersPage * farmersPerPage, total);

    const info = document.getElementById("paginationInfo");
    if (info) info.textContent = `Showing ${start}-${end} of ${total} farmers`;

    const prev = document.getElementById("prevPageBtn");
    if (prev) prev.disabled = currentFarmersPage <= 1;

    const next = document.getElementById("nextPageBtn");
    if (next) next.disabled = currentFarmersPage >= totalPages;

    const btns = document.getElementById("pageNumberBtns");
    if (btns) {
        btns.innerHTML = "";
        for (let i = 1; i <= totalPages; i++) {
            const btn = document.createElement("button");
            btn.className = `btn-page ${i === currentFarmersPage ? "active" : ""}`;
            btn.textContent = i;
            btn.type = "button";
            btn.addEventListener("click", function() {
                currentFarmersPage = i;
                renderFarmersTable();
            });
            btns.appendChild(btn);
        }
    }
}

function initFarmerSearch() {
    const searchInput = document.getElementById("searchFarmersInput");
    if (!searchInput) return;

    searchInput.addEventListener("input", function() {
        const keyword = this.value.toLowerCase().trim();

        if (!keyword) {
            currentFarmersPage = 1;
            renderFarmersTable();
            return;
        }

        const filtered = FARMERS_DATA.filter(function(farmer) {
            const searchableText = [
                farmer.rsbsa_id, farmer.first_name, farmer.middle_name,
                farmer.last_name, farmer.suffix, farmer.address,
                farmer.email_address, farmer.phone_number, farmer.sex,
                farmer.birthdate, farmer.region, farmer.municipality,
                farmer.barangay, farmer.status
            ].join(" ").toLowerCase();

            return searchableText.includes(keyword);
        });

        currentFarmersPage = 1;
        renderFilteredFarmers(filtered);
    });
}

function renderFilteredFarmers(data) {
    const tbody = document.getElementById("farmersTableBody");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="padding:30px; text-align:center; color:#777;">No farmers found.</td></tr>`;
        updateSearchPaginationText(0);
        return;
    }

    data.forEach(function(farmer) {
        tbody.appendChild(createFarmerTableRow(farmer));
    });

    updateSearchPaginationText(data.length);
}

function updateSearchPaginationText(resultCount) {
    const paginationInfo = document.getElementById("paginationInfo");
    if (!paginationInfo) return;
    paginationInfo.textContent = `Showing ${resultCount} of ${FARMERS_DATA.length} farmers`;
}

/* ============================================================
   FARMER SUBVIEWS
============================================================ */

function initFarmerSubviews() {
    const listSubview = document.getElementById("farmersListSubview");
    const regSubview = document.getElementById("registerFarmerSubview");
    const manSubview = document.getElementById("manageFarmerSubview");

    const addBtn = document.getElementById("addFarmerBtn");
    const cancelRegBtn = document.getElementById("cancelRegisterFarmerBtn");
    const backManBtn = document.getElementById("backFromManageFarmerBtn");

    if (addBtn) {
        addBtn.addEventListener("click", function() {
            const regForm = document.getElementById("registerFarmerForm");
            if (regForm) regForm.reset();
            setValue("regFarmerId", "");
            if (listSubview) listSubview.classList.add("hidden-element");
            if (regSubview) regSubview.classList.remove("hidden-element");
        });
    }

    if (cancelRegBtn) {
        cancelRegBtn.addEventListener("click", function() {
            const regForm = document.getElementById("registerFarmerForm");
            if (regForm) regForm.reset();
            if (listSubview) listSubview.classList.remove("hidden-element");
            if (regSubview) regSubview.classList.add("hidden-element");
        });
    }

    if (backManBtn) {
        backManBtn.addEventListener("click", function() {
            if (manSubview) manSubview.classList.add("hidden-element");
            if (listSubview) listSubview.classList.remove("hidden-element");
            currentActiveFarmer = null;
            isEditMode = false;
        });
    }

    // REGISTER FARMER
    const regForm = document.getElementById("registerFarmerForm");
    if (regForm) {
        regForm.addEventListener("submit", function(event) {
            event.preventDefault();
            event.stopPropagation();

            const rsbsaId = getValue("regFarmerId");
            const municipality = getValue("regMunicipality");
            const barangay = getValue("regBarangay");
            const firstName = getValue("regFirstName");
            const middleName = getValue("regMiddleName");
            const lastName = getValue("regLastName");
            const suffix = getValue("regSuffix");
            const sex = getValue("regSex");
            const birthdate = getValue("regBirthdate");
            const phone = getValue("regPhone");
            const email = getValue("regEmail");

            if (!rsbsaId || !municipality || !barangay || !firstName || !lastName || !sex || !birthdate || !phone || !email) {
                alert("Please complete all required fields.");
                return;
            }

            window._pendingFarmer = {
                rsbsa_id: rsbsaId,
                first_name: firstName,
                middle_name: middleName,
                last_name: lastName,
                suffix: suffix,
                address: barangay + ", " + municipality,
                barangay: barangay,
                municipality: municipality,
                sex: sex,
                birthdate: birthdate,
                phone_number: phone,
                email_address: email
            };

            const confirmText = document.getElementById("confirmFarmerText");
            if (confirmText) {
                confirmText.textContent = "Register " + firstName + " " + lastName + " from " + barangay + ", " + municipality + "?";
            }

            document.getElementById("confirmFarmerModal")?.classList.add("show");
        });
    }

    // CONFIRM SAVE FARMER
    const confirmSaveBtn = document.getElementById("confirmSaveFarmerBtn");
    if (confirmSaveBtn) {
        confirmSaveBtn.addEventListener("click", async function() {
            const farmerData = window._pendingFarmer;
            if (!farmerData) {
                alert("No farmer data to save.");
                return;
            }

            this.disabled = true;
            this.textContent = "Saving...";

            try {
                await apiRequest(FARMERS_ENDPOINT, {
                    method: "POST",
                    body: JSON.stringify(farmerData)
                });

                document.getElementById("confirmFarmerModal")?.classList.remove("show");
                await fetchFarmers();
                document.getElementById("farmerAddedModal")?.classList.add("show");

                document.getElementById("registerFarmerForm")?.reset();
                window._pendingFarmer = null;

            } catch (error) {
                console.error("Error adding farmer:", error);
                document.getElementById("confirmFarmerModal")?.classList.remove("show");
                alert("Failed to add farmer.\n\n" + (error.message || "Check FastAPI server."));
            } finally {
                this.disabled = false;
                this.textContent = "Confirm & Save";
            }
        });
    }

    document.getElementById("closeFarmerAddedBtn")?.addEventListener("click", function() {
        document.getElementById("farmerAddedModal")?.classList.remove("show");
        if (regSubview) regSubview.classList.add("hidden-element");
        if (listSubview) listSubview.classList.remove("hidden-element");
    });

    document.getElementById("reviewFarmerBtn")?.addEventListener("click", function() {
        document.getElementById("confirmFarmerModal")?.classList.remove("show");
    });

    // EDIT / SAVE FARMER
    const toggleEditBtn = document.getElementById("toggleEditFarmerBtn");
    if (toggleEditBtn) {
        toggleEditBtn.addEventListener("click", async function() {
            const editableInputs = document.querySelectorAll(".man-editable");

            if (!isEditMode) {
                isEditMode = true;
                editableInputs.forEach(function(input) {
                    input.readOnly = false;
                    input.classList.add("input-editable-active");
                    input.classList.remove("input-readonly");
                });
                this.textContent = "Save Changes";

                let cancelBtn = document.getElementById("cancelEditFarmerBtn");
                if (!cancelBtn) {
                    cancelBtn = document.createElement("button");
                    cancelBtn.id = "cancelEditFarmerBtn";
                    cancelBtn.type = "button";
                    cancelBtn.className = "btn-outline-report";
                    cancelBtn.textContent = "Cancel";
                    cancelBtn.style.marginRight = "8px";
                    this.parentNode.insertBefore(cancelBtn, this);
                    cancelBtn.addEventListener("click", cancelFarmerEdit);
                }
                cancelBtn.style.display = "inline-flex";
                return;
            }

            if (!currentActiveFarmer) {
                alert("No farmer selected.");
                return;
            }

            if (!confirm("Are you sure you want to save these changes?\n\nFarmer: " + getFarmerFullName(currentActiveFarmer))) return;

            const email = getValue("manEmail");
            if (!email) {
                alert("Please enter an email address.");
                return;
            }

            const updateData = {
                address: getValue("manAddress"),
                phone_number: getValue("manPhone"),
                email_address: email
            };

            try {
                await apiRequest(FARMERS_ENDPOINT + currentActiveFarmer.farmer_id, {
                    method: "PUT",
                    body: JSON.stringify(updateData)
                });

                isEditMode = false;
                editableInputs.forEach(function(input) {
                    input.readOnly = true;
                    input.classList.remove("input-editable-active");
                    input.classList.add("input-readonly");
                });

                this.textContent = "Edit Contact Info";

                const cancelBtn = document.getElementById("cancelEditFarmerBtn");
                if (cancelBtn) cancelBtn.style.display = "none";

                await fetchFarmers();
                alert("Farmer updated successfully.");
            } catch (error) {
                console.error("Update farmer error:", error);
                alert("Failed to update farmer.\n\n" + (error.message || "Check FastAPI server."));
            }
        });
    }

    // DELETE FARMER
    document.getElementById("deleteFarmerBtn")?.addEventListener("click", function() {
        if (!currentActiveFarmer) {
            alert("No farmer selected.");
            return;
        }
        document.getElementById("deleteFarmerModal")?.classList.add("show");
    });

    const confirmDeleteBtn = document.getElementById("confirmDeleteFarmerBtn");
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener("click", async function() {
            if (!currentActiveFarmer) return;

            this.disabled = true;
            this.textContent = "Deleting...";

            try {
                await apiRequest(FARMERS_ENDPOINT + currentActiveFarmer.farmer_id, { method: "DELETE" });

                document.getElementById("deleteFarmerModal")?.classList.remove("show");
                currentActiveFarmer = null;
                await fetchFarmers();

                document.getElementById("manageFarmerSubview")?.classList.add("hidden-element");
                document.getElementById("farmersListSubview")?.classList.remove("hidden-element");

                alert("Farmer deleted successfully.");

            } catch (error) {
                console.error("Delete farmer error:", error);
                document.getElementById("deleteFarmerModal")?.classList.remove("show");

                const errorModal = document.getElementById("deleteErrorModal");
                errorModal?.classList.add("show");

            } finally {
                this.disabled = false;
                this.textContent = "Delete";
            }
        });
    }

    document.getElementById("closeDeleteErrorBtn")?.addEventListener("click", function() {
        document.getElementById("deleteErrorModal")?.classList.remove("show");
    });

    document.getElementById("deleteErrorModal")?.addEventListener("click", function(event) {
        if (event.target === this) this.classList.remove("show");
    });

    document.getElementById("cancelDeleteFarmerBtn")?.addEventListener("click", function() {
        document.getElementById("deleteFarmerModal")?.classList.remove("show");
    });

    document.getElementById("deleteFarmerModal")?.addEventListener("click", function(event) {
        if (event.target === this) this.classList.remove("show");
    });

    // PAGINATION
    document.getElementById("prevPageBtn")?.addEventListener("click", function() {
        if (currentFarmersPage > 1) {
            currentFarmersPage--;
            renderFarmersTable();
        }
    });

    document.getElementById("nextPageBtn")?.addEventListener("click", function() {
        const totalPages = Math.max(1, Math.ceil(FARMERS_DATA.length / farmersPerPage));
        if (currentFarmersPage < totalPages) {
            currentFarmersPage++;
            renderFarmersTable();
        }
    });
}

function cancelFarmerEdit() {
    const farmer = currentActiveFarmer;
    if (!farmer) return;

    if (!confirm("Are you sure you want to cancel editing?\n\nYour changes will be discarded.")) return;

    setValue("manAddress", farmer.address || "");
    setValue("manPhone", farmer.phone_number || "");
    setValue("manEmail", farmer.email_address || "");

    document.querySelectorAll(".man-editable").forEach(function(input) {
        input.readOnly = true;
        input.classList.remove("input-editable-active");
        input.classList.add("input-readonly");
    });

    isEditMode = false;

    const toggleBtn = document.getElementById("toggleEditFarmerBtn");
    if (toggleBtn) toggleBtn.textContent = "Edit Contact Info";

    const cancelBtn = document.getElementById("cancelEditFarmerBtn");
    if (cancelBtn) cancelBtn.style.display = "none";
}

function openManageFarmer(farmer) {
    if (!farmer) return;

    currentActiveFarmer = farmer;
    isEditMode = false;

    setValue("manFarmerId", farmer.rsbsa_id || "");
    setValue("manAddress", farmer.address || "");
    setValue("manFirstName", farmer.first_name || "");
    setValue("manMiddleName", farmer.middle_name || "");
    setValue("manLastName", farmer.last_name || "");
    setValue("manSuffix", farmer.suffix || "");
    setValue("manSex", farmer.sex || "");
    setValue("manBirthdate", farmer.birthdate || "");
    setValue("manPhone", farmer.phone_number || "");
    setValue("manEmail", farmer.email_address || "");

    document.querySelectorAll(".man-editable").forEach(function(input) {
        input.readOnly = true;
        input.classList.remove("input-editable-active");
        input.classList.add("input-readonly");
    });

    const editBtn = document.getElementById("toggleEditFarmerBtn");
    if (editBtn) editBtn.textContent = "Edit Contact Info";

    const cancelBtn = document.getElementById("cancelEditFarmerBtn");
    if (cancelBtn) cancelBtn.style.display = "none";

    document.getElementById("farmersListSubview")?.classList.add("hidden-element");
    document.getElementById("manageFarmerSubview")?.classList.remove("hidden-element");
}

/* ============================================================
   PLANTING INTENT
============================================================ */

function initPlantingIntent() {
    const list = document.getElementById("plantingIntentListSubview");
    const formSubview = document.getElementById("submitPlantIntentSubview");
    const modal = document.getElementById("plantIntentSubmittedModal");

    initPlantingIntentTabs();

    document.getElementById("addPlantIntentBtn")?.addEventListener("click", function() {
        document.getElementById("submitPlantIntentForm")?.reset();
        if (list) list.classList.add("hidden-element");
        if (formSubview) formSubview.classList.remove("hidden-element");
    });

    document.getElementById("cancelPlantIntentBtn")?.addEventListener("click", function() {
        document.getElementById("submitPlantIntentForm")?.reset();
        if (formSubview) formSubview.classList.add("hidden-element");
        if (list) list.classList.remove("hidden-element");
    });

    document.getElementById("backFromPlantingIntentDetailsBtn")?.addEventListener("click", function() {
        window.isEditingPlantingIntent = false;

        document.getElementById("cancelEditPlantingIntentBtn")?.remove();

        const editBtn = document.getElementById("editPlantingIntentBtn");
        if (editBtn) {
            editBtn.textContent = "Edit Details";
            editBtn.style.background = "#D97706";
            editBtn.disabled = false;
        }

        const submitBtn = document.getElementById("submitPlantingIntentBtn");
        if (submitBtn) {
            submitBtn.textContent = "Submit Intent";
            submitBtn.style.display = "inline-flex";
            submitBtn.style.background = "#2E7D32";
            submitBtn.disabled = false;
        }

        document.getElementById("plantingIntentDetailsSubview")?.classList.add("hidden-element");
        if (list) list.classList.remove("hidden-element");

        window.currentSelectedPlantingIntent = null;
        fetchPlantingIntents();
    });

    document.getElementById("submitPlantIntentForm")?.addEventListener("submit", async function(event) {
        event.preventDefault();
        await submitPlantingIntent();
    });

    document.getElementById("closePlantIntentSubmittedBtn")?.addEventListener("click", function() {
        if (modal) modal.classList.remove("show");
        if (formSubview) formSubview.classList.add("hidden-element");
        if (list) list.classList.remove("hidden-element");
        fetchPlantingIntents();
    });
}

async function submitPlantingIntentStatus(intent) {
    if (!intent) {
        alert("No planting intent selected.");
        return;
    }

    const intentId = intent.planting_intent_id;
    if (!intentId) {
        alert("Planting Intent ID not found.");
        return;
    }

    const confirmed = await showPlantIntentConfirmModal();
    if (!confirmed) return;

    const submitBtn = document.getElementById("submitPlantingIntentBtn");

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = "Submitting...";
        }

        await apiRequest(PLANTING_INTENTS_ENDPOINT + intentId + "/submit", { method: "POST" });

        intent.status = "SUBMITTED";
        intent.updated_at = new Date().toISOString();

        const index = PLANTING_INTENTS_DATA.findIndex(function(item) {
            return String(item.planting_intent_id) === String(intentId);
        });

        if (index !== -1) {
            PLANTING_INTENTS_DATA[index].status = "SUBMITTED";
            PLANTING_INTENTS_DATA[index].updated_at = intent.updated_at;
        }

        filteredPlantingIntents = null;
        renderPlantingIntentsTable();
        window.currentSelectedPlantingIntent = intent;
        openPlantingIntentDetails(intent);

        await loadReports();

        const modal = document.getElementById("plantIntentSubmittedModal");
        if (modal) {
            const pEl = modal.querySelector("p");
            if (pEl) pEl.textContent = "Planting intent submitted successfully.";
            modal.classList.add("show");
        }

    } catch (error) {
        console.error("Submit planting intent error:", error);
        alert("Failed to submit planting intent.\n\n" + (error.message || "Please try again."));
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Submit Intent";
        }
    }
}

function showPlantIntentConfirmModal() {
    return new Promise((resolve) => {
        const modal = document.getElementById("confirmPlantIntentModal");
        const confirmBtn = document.getElementById("confirmSubmitPlantIntentBtn");
        const cancelBtn = document.getElementById("cancelPlantIntentConfirmBtn");

        if (!modal || !confirmBtn || !cancelBtn) {
            resolve(confirm("Are you sure you want to submit this planting intent?"));
            return;
        }

        modal.classList.add("show");

        const cleanup = () => {
            confirmBtn.removeEventListener("click", onConfirm);
            cancelBtn.removeEventListener("click", onCancel);
            modal.classList.remove("show");
        };

        const onConfirm = () => { cleanup(); resolve(true); };
        const onCancel = () => { cleanup(); resolve(false); };

        confirmBtn.addEventListener("click", onConfirm);
        cancelBtn.addEventListener("click", onCancel);
    });
}

async function deletePlantingIntent(intent) {
    if (!intent) {
        alert("No planting intent selected.");
        return;
    }

    const status = (intent.status || "DRAFT").toUpperCase();
    if (status !== "DRAFT" && status !== "PENDING") {
        alert("Only Draft planting intents can be deleted.");
        return;
    }

    if (!confirm(`Are you sure you want to permanently delete this planting intent for "${intent.commodity}"?\n\nThis action cannot be undone.`)) {
        return;
    }

    try {
        await apiRequest(PLANTING_INTENTS_ENDPOINT + intent.planting_intent_id, { method: "DELETE" });

        PLANTING_INTENTS_DATA = PLANTING_INTENTS_DATA.filter(function(item) {
            return String(item.planting_intent_id) !== String(intent.planting_intent_id);
        });

        filteredPlantingIntents = null;
        renderPlantingIntentsTable();

        document.getElementById("plantingIntentListSubview")?.classList.remove("hidden-element");
        document.getElementById("plantingIntentDetailsSubview")?.classList.add("hidden-element");

        window.currentSelectedPlantingIntent = null;
        alert("Planting intent deleted successfully.");

    } catch (error) {
        console.error("Delete planting intent error:", error);
        alert("Failed to delete planting intent.\n\n" + (error.message || "Please try again."));
    }
}

async function pullPlantingIntent(intent) {
    if (!intent) {
        alert("No planting intent selected.");
        return;
    }

    const intentId = intent.planting_intent_id;
    if (!intentId) {
        alert("Planting Intent ID not found.");
        return;
    }

    if (!confirm("Are you sure you want to revert this planting intent to DRAFT?")) return;

    try {
        await apiRequest(PLANTING_INTENTS_ENDPOINT + intentId + "/pull", { method: "POST" });

        intent.status = "DRAFT";
        intent.updated_at = new Date().toISOString();

        const index = PLANTING_INTENTS_DATA.findIndex(function(item) {
            return String(item.planting_intent_id) === String(intentId);
        });

        if (index !== -1) {
            PLANTING_INTENTS_DATA[index].status = "DRAFT";
            PLANTING_INTENTS_DATA[index].updated_at = intent.updated_at;
        }

        filteredPlantingIntents = null;
        renderPlantingIntentsTable();

        window.currentSelectedPlantingIntent = intent;
        openPlantingIntentDetails(intent);

        await loadReports();

        alert("Planting intent reverted to DRAFT successfully.");

    } catch (error) {
        console.error("Pull planting intent error:", error);
        alert("Failed to revert planting intent to DRAFT.\n\n" + (error.message || "Please try again."));
    }
}

function initPlantingIntentTabs() {
    const tabButtons = document.querySelectorAll('.sub-tab-btn');
    const draftContainer = document.getElementById('draftIntentsContainer');
    const submittedContainer = document.getElementById('submittedIntentsContainer');

    if (!tabButtons.length) return;

    if (draftContainer) draftContainer.style.display = 'block';
    if (submittedContainer) submittedContainer.style.display = 'none';

    tabButtons.forEach(function(button) {
        button.addEventListener('click', function() {
            const tab = this.dataset.tab;

            tabButtons.forEach(function(btn) {
                btn.classList.remove('active');
                btn.style.borderBottom = 'none';
                btn.style.color = 'var(--muted)';
            });
            this.classList.add('active');
            this.style.borderBottom = '3px solid var(--green)';
            this.style.color = 'var(--green)';

            if (tab === 'draft') {
                if (draftContainer) draftContainer.style.display = 'block';
                if (submittedContainer) submittedContainer.style.display = 'none';
            } else {
                if (draftContainer) draftContainer.style.display = 'none';
                if (submittedContainer) submittedContainer.style.display = 'block';
            }
        });
    });
}

function normalizePlantingIntent(intent) {
    return {
        planting_intent_id: intent.planting_intent_id || intent.id || null,
        farmer_id: intent.farmer_id || null,
        farmer_name: intent.farmer_name || intent.name || "-",
        commodity: intent.commodity || intent.crop || "-",
        volume: intent.volume || intent.planned_volume || intent.quantity || "",
        location: intent.location || intent.municipality || intent.barangay || "-",
        barangay: intent.barangay || "",
        planting_date: intent.planting_date || "",
        harvest_date: intent.harvest_date || intent.expected_harvest_date || "",
        remarks: intent.remarks || "",
        status: intent.status || intent.report_status || "Pending",
        finalized_status: intent.finalized_status || "NOT PLANTED",
        created_at: intent.created_at || null,
        updated_at: intent.updated_at || null,
        revision_count: intent.revision_count || 0,
        report_id: intent.report_id || null
    };
}

function initializePlantingIntentSearch() {
    const searchInput = document.getElementById("searchPlantingIntentsInput");
    if (!searchInput) return;

    function performSearch() {
        const keyword = searchInput.value.toLowerCase().trim();

        if (!keyword) {
            filteredPlantingIntents = null;
            currentDraftIntentsPage = 1;
            currentSubmittedIntentsPage = 1;
            renderPlantingIntentsTable();
            return;
        }

        const searchWords = keyword.split(/\s+/).filter(Boolean);

        filteredPlantingIntents = PLANTING_INTENTS_DATA.filter(function(intent) {
            const searchableText = [
                intent.farmer_name || '', intent.commodity || '',
                intent.location || '', intent.remarks || '',
                intent.status || '', String(intent.volume || ''),
                intent.planting_date || '', intent.harvest_date || ''
            ].join(" ").toLowerCase();

            return searchWords.every(function(word) {
                return searchableText.includes(word);
            });
        });

        currentDraftIntentsPage = 1;
        currentSubmittedIntentsPage = 1;
        renderPlantingIntentsTable();
    }

    searchInput.addEventListener("input", performSearch);
    searchInput.addEventListener("search", performSearch);
}

async function fetchPlantingIntents() {
    const tbody = document.getElementById('draftIntentsTableBody');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="8" style="padding:30px; text-align:center;">Loading planting intents...</td></tr>`;
    }

    try {
        const data = await apiRequest(PLANTING_INTENTS_ENDPOINT, { method: "GET" });

        if (data && data.data && Array.isArray(data.data)) {
            PLANTING_INTENTS_DATA = data.data.map(normalizePlantingIntent);
        } else if (Array.isArray(data)) {
            PLANTING_INTENTS_DATA = data.map(normalizePlantingIntent);
        } else {
            throw new Error("Invalid planting intents response. Expected an array or paginated object.");
        }

        filteredPlantingIntents = null;
        currentDraftIntentsPage = 1;
        currentSubmittedIntentsPage = 1;
        renderPlantingIntentsTable();

        return PLANTING_INTENTS_DATA;

    } catch (error) {
        console.error("Unable to load planting intents:", error);
        PLANTING_INTENTS_DATA = [];

        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="padding:30px; text-align:center; color:#C0392B;">
                        <strong>Failed to load planting intents.</strong>
                        <br><small>${escapeHtml(error.message || "Please check the FastAPI server.")}</small>
                        <br><br>
                        <button type="button" onclick="fetchPlantingIntents()" style="padding:8px 20px; background:#2E7D32; color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:600;">Retry</button>
                    </td>
                </tr>
            `;
        }

        handleAuthError(error);
        return [];
    }
}

function renderPlantingIntentsTable() {
    const draftTbody = document.getElementById('draftIntentsTableBody');
    const submittedTbody = document.getElementById('submittedIntentsTableBody');

    if (!draftTbody || !submittedTbody) return;

    draftTbody.innerHTML = '';
    submittedTbody.innerHTML = '';

    const dataSource = (filteredPlantingIntents !== null) ? filteredPlantingIntents : PLANTING_INTENTS_DATA;

    const draftIntents = dataSource.filter(function(intent) {
        const status = (intent.status || 'Pending').toLowerCase();
        return status === 'draft' || status === 'pending';
    });

    const submittedIntents = dataSource.filter(function(intent) {
        const status = (intent.status || '').toLowerCase();
        return status === 'submitted' ||
               status === 'for_municipal_validation' ||
               status === 'for_provincial_validation' ||
               status === 'for_da_rfo_validation' ||
               status === 'revision_required' ||
               status === 'final_approved';
    });

    const draftCount = document.getElementById('draftCount');
    const submittedCount = document.getElementById('submittedCount');
    if (draftCount) draftCount.textContent = draftIntents.length;
    if (submittedCount) submittedCount.textContent = submittedIntents.length;

    if (draftIntents.length === 0) {
        draftTbody.innerHTML = `
            <tr><td colspan="8" style="padding:40px; text-align:center; color:#999;">
                ${filteredPlantingIntents !== null ? 'No Draft Intents match your search.' : 'No Draft Intents found.'}
            </td></tr>`;
    } else {
        const draftStart = (currentDraftIntentsPage - 1) * plantingIntentsPerPage;
        draftIntents.slice(draftStart, draftStart + plantingIntentsPerPage).forEach(function(intent) {
            draftTbody.appendChild(createPlantingIntentRow(intent, 'draft'));
        });
    }

    if (submittedIntents.length === 0) {
        submittedTbody.innerHTML = `
            <tr><td colspan="8" style="padding:40px; text-align:center; color:#999;">
                ${filteredPlantingIntents !== null ? 'No Submitted Intents match your search.' : 'No Submitted Intents found.'}
            </td></tr>`;
    } else {
        const submittedStart = (currentSubmittedIntentsPage - 1) * plantingIntentsPerPage;
        submittedIntents.slice(submittedStart, submittedStart + plantingIntentsPerPage).forEach(function(intent) {
            submittedTbody.appendChild(createPlantingIntentRow(intent, 'submitted'));
        });
    }

    renderPagination(draftIntents.length, "draft");
    renderPagination(submittedIntents.length, "submitted");
}

function renderPagination(totalCount, type) {
    const containerId = type === "draft" ? "draftIntentsContainer" : "submittedIntentsContainer";
    const container = document.getElementById(containerId);
    if (!container) return;

    const card = container.querySelector(".card");
    if (!card) return;

    const existing = card.querySelector(".planting-intent-pagination");
    if (existing) existing.remove();

    if (totalCount <= plantingIntentsPerPage) return;

    let currentPage = type === "draft" ? currentDraftIntentsPage : currentSubmittedIntentsPage;
    const totalPages = Math.ceil(totalCount / plantingIntentsPerPage);

    if (currentPage > totalPages) {
        currentPage = totalPages;
        if (type === "draft") currentDraftIntentsPage = currentPage;
        else currentSubmittedIntentsPage = currentPage;
    }

    const startItem = (currentPage - 1) * plantingIntentsPerPage + 1;
    const endItem = Math.min(currentPage * plantingIntentsPerPage, totalCount);

    let html = `
        <div class="pagination-container planting-intent-pagination" style="margin-top:18px; padding-top:14px; border-top:1px solid #DFD8C6;">
            <span class="pagination-info" style="font-size:12.5px; color:#625E52;">
                Showing ${startItem}-${endItem} of ${totalCount} planting intents
            </span>
            <div class="pagination-controls">
                <button class="btn-page prev-pg-btn" type="button" ${currentPage <= 1 ? 'disabled' : ''}>&laquo; Prev</button>
    `;

    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);

    if (startPage > 1) {
        html += `<button class="btn-page pg-btn" type="button" data-page="1">1</button>`;
        if (startPage > 2) html += `<span style="padding:0 4px; color:#777;">...</span>`;
    }

    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="btn-page pg-btn ${i === currentPage ? 'active' : ''}" type="button" data-page="${i}">${i}</button>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += `<span style="padding:0 4px; color:#777;">...</span>`;
        html += `<button class="btn-page pg-btn" type="button" data-page="${totalPages}">${totalPages}</button>`;
    }

    html += `
                <button class="btn-page next-pg-btn" type="button" ${currentPage >= totalPages ? 'disabled' : ''}>Next &raquo;</button>
            </div>
        </div>
    `;

    card.insertAdjacentHTML('beforeend', html);

    const paginationDiv = card.querySelector(".planting-intent-pagination");
    if (!paginationDiv) return;

    paginationDiv.querySelectorAll(".pg-btn").forEach(function(btn) {
        btn.addEventListener("click", function() {
            const page = parseInt(this.dataset.page);
            if (type === "draft") currentDraftIntentsPage = page;
            else currentSubmittedIntentsPage = page;
            renderPlantingIntentsTable();
        });
    });

    paginationDiv.querySelector(".prev-pg-btn")?.addEventListener("click", function() {
        if (type === "draft") { if (currentDraftIntentsPage > 1) currentDraftIntentsPage--; }
        else { if (currentSubmittedIntentsPage > 1) currentSubmittedIntentsPage--; }
        renderPlantingIntentsTable();
    });

    paginationDiv.querySelector(".next-pg-btn")?.addEventListener("click", function() {
        if (type === "draft") { if (currentDraftIntentsPage < totalPages) currentDraftIntentsPage++; }
        else { if (currentSubmittedIntentsPage < totalPages) currentSubmittedIntentsPage++; }
        renderPlantingIntentsTable();
    });
}

function createPlantingIntentRow(intent, type) {
    const tr = document.createElement('tr');
    tr.className = 'clickable-row';

    const farmerName = intent.farmer_name || '-';
    const commodity = intent.commodity || '-';
    const volume = formatPlantingVolume(intent.volume);
    const location = intent.location || '-';
    const plantingDate = formatPlantingDate(intent.planting_date);
    const harvestDate = formatPlantingDate(intent.harvest_date);
    const status = intent.status || 'Pending';
    const intentId = intent.planting_intent_id || '';

    let statusText = '';
    let statusClass = '';

    if (type === 'draft') {
        statusText = 'Draft';
        statusClass = 'draft';
    } else {
        const statusLower = status.toLowerCase();
        if (statusLower === 'pending') {
            statusText = 'Draft'; statusClass = 'draft';
        } else if (statusLower === 'submitted' ||
                   statusLower === 'for_municipal_validation' ||
                   statusLower === 'for_provincial_validation' ||
                   statusLower === 'for_da_rfo_validation') {
            statusText = 'Submitted'; statusClass = 'submitted';
        } else if (statusLower === 'revision_required') {
            statusText = 'Revision Required'; statusClass = 'revision';
        } else if (statusLower === 'final_approved') {
            statusText = 'Approved'; statusClass = 'approved';
        } else {
            statusText = status; statusClass = 'pending';
        }
    }

    tr.innerHTML = `
        <td><span class="pill">#${escapeHtml(String(intentId))}</span></td>
        <td><span class="pill">${escapeHtml(farmerName)}</span></td>
        <td><span class="pill">${escapeHtml(commodity)}</span></td>
        <td><span class="pill">${escapeHtml(volume)}</span></td>
        <td><span class="pill">${escapeHtml(location)}</span></td>
        <td><span class="pill">${escapeHtml(plantingDate)}</span></td>
        <td><span class="pill">${escapeHtml(harvestDate)}</span></td>
        <td class="center-col"><span class="status-pill ${statusClass}">${escapeHtml(statusText)}</span></td>
    `;

    tr.addEventListener('click', function() {
        openPlantingIntentDetails(intent);
    });

    return tr;
}

function openPlantingIntentDetails(intent) {
    const list = document.getElementById("plantingIntentListSubview");
    const details = document.getElementById("plantingIntentDetailsSubview");

    if (!details) return;

    window.currentSelectedPlantingIntent = intent;

    if (list) list.classList.add("hidden-element");
    details.classList.remove("hidden-element");

    setValue("detailPlantingIntentId", intent.planting_intent_id || "");
    setValue("detailFarmerName", intent.farmer_name || "");
    setValue("detailFarmerId", intent.farmer_id || "");
    setValue("detailCommodity", intent.commodity || "");
    setValue("detailVolume", formatPlantingVolume(intent.volume));
    setValue("detailLocation", intent.location || "");
    setValue("detailPlantingDate", formatPlantingDate(intent.planting_date));
    setValue("detailHarvestDate", formatPlantingDate(intent.harvest_date));
    setValue("detailRemarks", intent.remarks || "");

    const revisionInfo = document.getElementById("detailRevisionInfo");
    if (revisionInfo) {
        if (intent.revision_count > 0) {
            revisionInfo.textContent = "Revision #" + intent.revision_count + " | Last updated: " + formatPlantingDate(intent.updated_at || intent.created_at);
            revisionInfo.style.display = "block";
        } else {
            revisionInfo.style.display = "none";
        }
    }

    window.isEditingPlantingIntent = false;

    details.querySelectorAll("input, textarea").forEach(function(input) {
        input.readOnly = true;
        input.classList.add("input-readonly");
        input.classList.remove("input-editable-active");
        input.style.border = "";
        input.style.background = "";
    });

    const editBtn = document.getElementById("editPlantingIntentBtn");
    const submitBtn = document.getElementById("submitPlantingIntentBtn");
    const backBtn = document.getElementById("backFromPlantingIntentDetailsBtn");
    const deleteBtn = document.getElementById("deletePlantingIntentBtn");

    if (backBtn) backBtn.style.display = "inline-flex";

    const status = (intent.status || "DRAFT").toUpperCase();
    const isDraft = status === "DRAFT" || status === "PENDING";

    if (isDraft) {
        if (editBtn) {
            editBtn.style.display = "inline-flex";
            editBtn.textContent = "Edit Details";
            editBtn.style.background = "#D97706";
            editBtn.disabled = false;
            editBtn.onclick = function() { togglePlantingIntentEditMode(); };
        }
        if (deleteBtn) {
            deleteBtn.style.display = "inline-flex";
            deleteBtn.textContent = "Delete";
            deleteBtn.style.background = "#C0392B";
            deleteBtn.disabled = false;
            deleteBtn.onclick = function() { deletePlantingIntent(intent); };
        }
        if (submitBtn) {
            submitBtn.textContent = "Submit Intent";
            submitBtn.style.display = "inline-flex";
            submitBtn.style.background = "#2E7D32";
            submitBtn.disabled = false;
            submitBtn.onclick = function() { submitPlantingIntentStatus(intent); };
        }
    } else {
        if (editBtn) { editBtn.style.display = "none"; editBtn.disabled = true; }
        if (deleteBtn) { deleteBtn.style.display = "none"; deleteBtn.disabled = true; }
        if (submitBtn) {
            submitBtn.textContent = "Revert to Draft";
            submitBtn.style.display = "inline-flex";
            submitBtn.style.background = "#D97706";
            submitBtn.disabled = false;
            submitBtn.onclick = function() { pullPlantingIntent(intent); };
        }
    }

    document.getElementById("cancelEditPlantingIntentBtn")?.remove();
}

function togglePlantingIntentEditMode() {
    const intent = window.currentSelectedPlantingIntent;
    if (!intent) {
        alert("No planting intent selected.");
        return;
    }

    const details = document.getElementById("plantingIntentDetailsSubview");
    if (!details) return;

    const editBtn = document.getElementById("editPlantingIntentBtn");
    const submitBtn = document.getElementById("submitPlantingIntentBtn");
    const backBtn = document.getElementById("backFromPlantingIntentDetailsBtn");

    document.getElementById("cancelEditPlantingIntentBtn")?.remove();

    if (!window.isEditingPlantingIntent) {
        window.isEditingPlantingIntent = true;

        details.querySelectorAll("input, textarea").forEach(function(input) {
            if (input.id === "detailPlantingIntentId" || input.id === "detailFarmerId" || input.id === "detailFarmerName") return;
            input.readOnly = false;
            input.classList.remove("input-readonly");
            input.classList.add("input-editable-active");
            input.style.border = "1.5px solid #D97706";
            input.style.background = "#FFFDF7";
        });

        if (editBtn) {
            editBtn.textContent = "Save Changes";
            editBtn.style.background = "#2E7D32";
        }
        if (submitBtn) submitBtn.style.display = "none";
        if (backBtn) backBtn.style.display = "none";

        const cancelBtn = document.createElement("button");
        cancelBtn.id = "cancelEditPlantingIntentBtn";
        cancelBtn.type = "button";
        cancelBtn.className = "btn-outline-report";
        cancelBtn.textContent = "Cancel";
        cancelBtn.style.marginRight = "8px";
        editBtn.parentNode.insertBefore(cancelBtn, editBtn);
        cancelBtn.addEventListener("click", cancelPlantingIntentEdit);

    } else {
        if (!confirm("Are you sure you want to save these changes?")) return;
        savePlantingIntentChanges();
    }
}

function cancelPlantingIntentEdit() {
    const intent = window.currentSelectedPlantingIntent;
    if (!intent) return;

    if (!confirm("Are you sure you want to cancel editing?\n\nYour changes will be discarded.")) return;

    window.isEditingPlantingIntent = false;
    openPlantingIntentDetails(intent);
}

async function savePlantingIntentChanges() {
    const intent = window.currentSelectedPlantingIntent;
    if (!intent) {
        alert("No planting intent selected.");
        return;
    }

    function convertToAPIDate(dateString) {
        if (!dateString) return "";
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return dateString;
        const parts = String(dateString).split('/');
        if (parts.length === 3) {
            return parts[2].trim() + "-" + parts[0].trim().padStart(2, '0') + "-" + parts[1].trim().padStart(2, '0');
        }
        const date = new Date(dateString);
        if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
        return dateString;
    }

    const rawCommodity = getValue("detailCommodity") || intent.commodity;
    const rawVolume = getValue("detailVolume") || intent.volume;
    const rawLocation = getValue("detailLocation") || intent.location;
    const rawPlantingDate = getValue("detailPlantingDate") || intent.planting_date;
    const rawHarvestDate = getValue("detailHarvestDate") || intent.harvest_date;
    const rawRemarks = getValue("detailRemarks") || intent.remarks;

    if (!rawCommodity || !rawCommodity.trim()) {
        alert("Please enter Commodity.");
        return;
    }

    const volumeValue = String(rawVolume).replace(/,/g, "").replace(/kg/gi, "").trim();
    if (!volumeValue || isNaN(Number(volumeValue)) || Number(volumeValue) <= 0) {
        alert("Please enter a valid volume.");
        return;
    }

    const plantingDate = convertToAPIDate(rawPlantingDate);
    const harvestDate = convertToAPIDate(rawHarvestDate);

    if (!plantingDate) { alert("Please enter a valid Planting Date."); return; }
    if (!harvestDate) { alert("Please enter a valid Harvest Date."); return; }

    const payload = {
        commodity: rawCommodity.trim(),
        volume: Number(volumeValue),
        location: rawLocation || "",
        planting_date: plantingDate,
        harvest_date: harvestDate,
        remarks: rawRemarks || ""
    };

    try {
        await apiRequest(PLANTING_INTENTS_ENDPOINT + intent.planting_intent_id, {
            method: "PUT",
            body: JSON.stringify(payload)
        });

        Object.assign(intent, payload);
        intent.updated_at = new Date().toISOString();

        const index = PLANTING_INTENTS_DATA.findIndex(function(item) {
            return String(item.planting_intent_id) === String(intent.planting_intent_id);
        });
        if (index !== -1) PLANTING_INTENTS_DATA[index] = intent;

        renderPlantingIntentsTable();

        window.isEditingPlantingIntent = false;
        openPlantingIntentDetails(intent);

        alert("Planting Intent updated successfully!");

    } catch (error) {
        console.error("Save error:", error);
        alert("Failed to update planting intent.\n\n" + error.message);
    }
}

async function submitPlantingIntent() {
    const farmerNameSelect = document.getElementById("piFarmerName");
    const farmerName = farmerNameSelect ? (farmerNameSelect.options[farmerNameSelect.selectedIndex]?.text || "") : "";
    const farmerId = getValue("piFarmerId");
    const plantingDate = getValue("piPlantDate");
    const harvestDate = getValue("piHarvestDate");
    const commodity = getValue("piCommodity");
    const volume = getValue("piVolume");
    const remarks = getValue("piRemarks");

    if (!farmerNameSelect || !farmerNameSelect.value || farmerName === "Select Farmer") {
        alert("Please select a Farmer.");
        return;
    }
    if (!farmerId) { alert("Farmer ID is required."); return; }
    if (!plantingDate) { alert("Please select Planting Date."); return; }
    if (!harvestDate) { alert("Please select Harvest Date."); return; }
    if (!commodity) { alert("Please select a Commodity."); return; }
    if (!volume) { alert("Please enter Volume."); return; }

    const parsedFarmerId = Number(farmerId);
    if (!Number.isInteger(parsedFarmerId)) {
        alert("Farmer ID must be a valid number.");
        return;
    }

    const parsedVolume = Number(volume);
    if (isNaN(parsedVolume) || parsedVolume <= 0) {
        alert("Volume must be a valid positive number.");
        return;
    }

    const plantingIntentData = {
        farmer_id: parsedFarmerId,
        commodity: commodity,
        volume: parsedVolume,
        planting_date: plantingDate,
        harvest_date: harvestDate,
        remarks: remarks || undefined
    };

    try {
        await apiRequest(PLANTING_INTENTS_ENDPOINT, {
            method: "POST",
            body: JSON.stringify(plantingIntentData)
        });

        await fetchPlantingIntents();

        const modal = document.getElementById("plantIntentSubmittedModal");
        if (modal) {
            const pEl = modal.querySelector("p");
            if (pEl) pEl.textContent = "Planting intent draft successfully saved!";
            modal.classList.add("show");
        } else {
            alert("Planting intent successfully saved!");
        }

    } catch (error) {
        console.error("Create planting intent error:", error);
        handleAuthError(error);
        alert("Failed to submit planting intent.\n\n" + (error.message || "Please check the FastAPI server."));
    }
}

/* ============================================================
   REPORTING
============================================================ */

let allIndividualReports = [];
let individualFilterStatus = 'all';

function initReporting() {
    const createReportBtn = document.getElementById("createReportBtn");

    const filterSelect = document.getElementById('individualReportFilter');
    if (filterSelect) {
        filterSelect.addEventListener('change', function() {
            individualFilterStatus = this.value;
            renderFinalizedIntents(allIndividualReports);
        });
    }

    if (createReportBtn) {
        createReportBtn.addEventListener("click", function() {
            openSubmitReportSubview();
        });
    }

    document.getElementById("cancelReportBtn")?.addEventListener("click", function() {
        closeSubmitReportSubview();
    });

    document.getElementById("saveReportDraftBtn")?.addEventListener("click", function() {
        saveReport("DRAFT");
    });

    document.getElementById("submitReportFinalBtn")?.addEventListener("click", function() {
        saveReport("SUBMITTED");
    });

    document.getElementById("backFromReportDetailsBtn")?.addEventListener("click", function() {
        closeReportDetailsSubview();
    });
}

/* ============================================================
   LOAD REPORTS
============================================================ */

async function loadReports() {
    try {
        if (!PLANTING_INTENTS_DATA || PLANTING_INTENTS_DATA.length === 0) {
            renderFinalizedIntents([]);
            renderSubmittedReports([]);
            return;
        }

        const allSubmitted = PLANTING_INTENTS_DATA.filter(function(intent) {
            const status = String(intent.status || '').toUpperCase();
            return status === 'SUBMITTED' ||
                   status === 'FOR_MUNICIPAL_VALIDATION' ||
                   status === 'FOR_PROVINCIAL_VALIDATION' ||
                   status === 'FOR_DA_RFO_VALIDATION' ||
                   status === 'FINAL_APPROVED' ||
                   status === 'REVISION_REQUIRED';
        });

        const finalizedIntents = allSubmitted.filter(function(intent) {
            return String(intent.status || '').toUpperCase() === 'SUBMITTED';
        }).map(function(intent) {
            return {
                report_id: intent.planting_intent_id,
                planting_intent_id: intent.planting_intent_id,
                farmer_name: intent.farmer_name || 'Unknown',
                commodity: intent.commodity || '-',
                volume: intent.volume || 0,
                planting_date: intent.planting_date || null,
                harvest_date: intent.harvest_date || null,
                submitted_at: intent.updated_at || intent.created_at,
                finalized_status: intent.finalized_status || 'NOT PLANTED',
                status: intent.status
            };
        });

        const submittedReports = allSubmitted.filter(function(intent) {
            const status = String(intent.status || '').toUpperCase();
            return status === 'FOR_MUNICIPAL_VALIDATION' ||
                   status === 'FOR_PROVINCIAL_VALIDATION' ||
                   status === 'FOR_DA_RFO_VALIDATION' ||
                   status === 'FINAL_APPROVED' ||
                   status === 'REVISION_REQUIRED';
        }).map(function(intent) {
            return {
                report_id: intent.planting_intent_id,
                title: `${intent.commodity} - ${intent.farmer_name}`,
                submitted_at: intent.updated_at || intent.created_at,
                status: intent.status,
                planting_intent_id: intent.planting_intent_id
            };
        });

        const byDateDesc = function(a, b) {
            return new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0);
        };
        finalizedIntents.sort(byDateDesc);
        submittedReports.sort(byDateDesc);

        allIndividualReports = finalizedIntents;

        renderFinalizedIntents(finalizedIntents);
        renderSubmittedReports(submittedReports);

    } catch (error) {
        console.error("Failed to load reports:", error);
    }
}

/* ============================================================
   RENDER FINALIZED PLANTING INTENTS
============================================================ */

function renderFinalizedIntents(intents) {
    const tbody = document.getElementById('individualReportsTableBody');
    if (!tbody) return;

    let filteredIntents = intents || [];
    if (individualFilterStatus !== 'all') {
        filteredIntents = filteredIntents.filter(function(intent) {
            return (intent.finalized_status || 'NOT PLANTED').toUpperCase() === individualFilterStatus;
        });
    }

    if (filteredIntents.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="padding:30px; text-align:center; color:#999;">No finalized planting intents found.</td></tr>`;
        return;
    }

    tbody.innerHTML = filteredIntents.map(function(intent) {
        const statusUpper = (intent.finalized_status || "NOT PLANTED").toUpperCase();

        let displayText = 'Not Planted';
        let bgColor = '#6c757d';

        if (statusUpper === 'PLANTED') { displayText = 'Planted'; bgColor = '#D97706'; }
        else if (statusUpper === 'HARVESTED') { displayText = 'Harvested'; bgColor = '#2E7D32'; }
        else if (statusUpper === 'MEDIATING') { displayText = 'Mediating'; bgColor = '#2980B9'; }

        const plantingDate = intent.planting_date ? formatPlantingDate(intent.planting_date) : '-';
        const harvestDate = intent.harvest_date ? formatPlantingDate(intent.harvest_date) : '-';
        const reportId = intent.report_id || intent.planting_intent_id;

        return `
            <tr class="clickable-row" data-intent-id="${escapeHtml(String(intent.planting_intent_id))}">
                <td style="padding:12px 14px; text-align:center; font-weight:600;">#${escapeHtml(String(reportId))}</td>
                <td style="padding:12px 14px; text-align:center;">${escapeHtml(intent.farmer_name)}</td>
                <td style="padding:12px 14px; text-align:center;">${escapeHtml(intent.commodity)}</td>
                <td style="padding:12px 14px; text-align:center;">${escapeHtml(formatPlantingVolume(intent.volume))}</td>
                <td style="padding:12px 14px; text-align:center;">${escapeHtml(plantingDate)}</td>
                <td style="padding:12px 14px; text-align:center;">${escapeHtml(harvestDate)}</td>
                <td style="padding:12px 14px; text-align:center;">
                    <div class="status-dropdown-wrapper" data-intent-id="${escapeHtml(String(intent.planting_intent_id))}" style="position:relative; display:inline-block;">
                        <span class="clickable-pill"
                              style="cursor:pointer; display:inline-block; padding:4px 16px; border-radius:999px; font-size:11.5px; font-weight:700; color:#FFFFFF; text-shadow:0 1px 1px rgba(0,0,0,0.2); white-space:nowrap; user-select:none; background-color:${bgColor};">
                            ${escapeHtml(displayText)} <span style="font-size:8px; margin-left:6px;">&#9660;</span>
                        </span>
                        <div class="status-dropdown-menu" style="display:none; position:absolute; top:100%; left:50%; transform:translateX(-50%); margin-top:4px; background:#FFFFFF; border:1.5px solid #DFD8C6; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.15); min-width:130px; z-index:1000; overflow:hidden;">
                            <div class="status-option" data-status="NOT PLANTED" style="padding:8px 16px; cursor:pointer; font-size:12px; color:#333; border-bottom:1px solid #f0f0f0;">Not Planted</div>
                            <div class="status-option" data-status="PLANTED" style="padding:8px 16px; cursor:pointer; font-size:12px; color:#333; border-bottom:1px solid #f0f0f0;">Planted</div>
                            <div class="status-option" data-status="HARVESTED" style="padding:8px 16px; cursor:pointer; font-size:12px; color:#333; border-bottom:1px solid #f0f0f0;">Harvested</div>
                            <div class="status-option" data-status="MEDIATING" style="padding:8px 16px; cursor:pointer; font-size:12px; color:#333;">Mediating</div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('.status-dropdown-wrapper').forEach(function(wrapper) {
        const pill = wrapper.querySelector('.clickable-pill');
        const menu = wrapper.querySelector('.status-dropdown-menu');

        pill?.addEventListener('click', function(e) {
            e.stopPropagation();
            document.querySelectorAll('.status-dropdown-menu').forEach(function(m) {
                if (m !== menu) m.style.display = 'none';
            });
            menu.style.display = (menu.style.display === 'block') ? 'none' : 'block';
        });
    });

    tbody.querySelectorAll('.status-option').forEach(function(option) {
        option.addEventListener('click', function(e) {
            e.stopPropagation();
            const newStatus = this.dataset.status;
            const menu = this.closest('.status-dropdown-menu');
            const wrapper = menu.closest('.status-dropdown-wrapper');
            const intentId = wrapper.dataset.intentId;
            const pill = wrapper.querySelector('.clickable-pill');

            updateStatusPillVisual(pill, newStatus);
            menu.style.display = 'none';
            updateFinalizedIntentStatus(intentId, newStatus);
        });

        option.addEventListener('mouseenter', function() { this.style.background = '#f0f0f0'; });
        option.addEventListener('mouseleave', function() { this.style.background = ''; });
    });

    tbody.querySelectorAll('.clickable-row').forEach(function(row) {
        row.addEventListener('click', function(e) {
            if (e.target.closest('.status-dropdown-wrapper')) return;
            openFinalizedIntentDetails(this.dataset.intentId);
        });
    });
}

function updateStatusPillVisual(pill, newStatus) {
    if (!pill) return;
    const statusUpper = String(newStatus).toUpperCase();

    let displayText = 'Not Planted';
    let bgColor = '#6c757d';

    if (statusUpper === 'PLANTED') { displayText = 'Planted'; bgColor = '#D97706'; }
    else if (statusUpper === 'HARVESTED') { displayText = 'Harvested'; bgColor = '#2E7D32'; }
    else if (statusUpper === 'MEDIATING') { displayText = 'Mediating'; bgColor = '#2980B9'; }

    pill.innerHTML = `${escapeHtml(displayText)} <span style="font-size:8px; margin-left:6px;">&#9660;</span>`;
    pill.style.backgroundColor = bgColor;
    pill.dataset.currentStatus = statusUpper;
}

// Close dropdowns when clicking outside
document.addEventListener('click', function(e) {
    if (!e.target.closest('.status-dropdown-wrapper')) {
        document.querySelectorAll('.status-dropdown-menu').forEach(function(m) {
            m.style.display = 'none';
        });
    }
});

/* ============================================================
   UPDATE FINALIZED INTENT STATUS
   FIX: dataset IDs are strings — compare loosely, not with ===
============================================================ */

async function updateFinalizedIntentStatus(intentId, newStatus) {
    try {
        const id = String(intentId);

        const intent = PLANTING_INTENTS_DATA.find(function(i) {
            return String(i.planting_intent_id) === id;
        });

        if (!intent) {
            console.error("Intent not found:", intentId);
            return;
        }

        try {
            await apiRequest(PLANTING_INTENTS_ENDPOINT + id, {
                method: "PUT",
                body: JSON.stringify({ finalized_status: newStatus })
            });
        } catch (apiError) {
            console.warn("Could not save status to the server:", apiError);
        }

        intent.finalized_status = newStatus;
        intent.updated_at = new Date().toISOString();

        const reportIntent = allIndividualReports.find(function(r) {
            return String(r.planting_intent_id) === id;
        });
        if (reportIntent) {
            reportIntent.finalized_status = newStatus;
            reportIntent.submitted_at = intent.updated_at;
        }

        renderFinalizedIntents(allIndividualReports);

    } catch (error) {
        console.error("Failed to update status:", error);
        alert("Failed to update status. Please try again.");
    }
}

/* ============================================================
   FINALIZED INTENT DETAILS
   (was called but never defined — this caused a row-click crash)
============================================================ */

function openFinalizedIntentDetails(intentId) {
    const id = String(intentId);

    const intent = PLANTING_INTENTS_DATA.find(function(i) {
        return String(i.planting_intent_id) === id;
    });

    if (!intent) {
        console.warn("Planting intent not found for id:", intentId);
        return;
    }

    // Jump to the Planting Intent view and show the details there
    document.querySelectorAll(".view").forEach(function(view) {
        view.classList.remove("active-view");
    });
    document.getElementById("view-planting-intent")?.classList.add("active-view");

    document.querySelectorAll(".nav-item[data-view]").forEach(function(btn) {
        btn.classList.toggle("active", btn.dataset.view === "planting-intent");
    });

    openPlantingIntentDetails(intent);
}

/* ============================================================
   RENDER SUBMITTED REPORTS
   (was called but never defined — loadReports() failed silently)
============================================================ */

function renderSubmittedReports(reports) {
    const tbody = document.getElementById("submittedReportsTableBody");
    if (!tbody) return;

    if (!reports || reports.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="padding:30px; text-align:center; color:#999;">No submitted reports found.</td></tr>`;
        return;
    }

    tbody.innerHTML = reports.map(function(report) {
        const rawStatus = String(report.status || "SUBMITTED").toUpperCase();

        let statusText = "Submitted";
        let statusClass = "submitted";

        if (rawStatus === "REVISION_REQUIRED") {
            statusText = "Revision Required"; statusClass = "revision";
        } else if (rawStatus === "FINAL_APPROVED") {
            statusText = "Approved"; statusClass = "approved";
        } else if (rawStatus === "FOR_MUNICIPAL_VALIDATION") {
            statusText = "For Municipal Validation"; statusClass = "submitted";
        } else if (rawStatus === "FOR_PROVINCIAL_VALIDATION") {
            statusText = "For Provincial Validation"; statusClass = "submitted";
        } else if (rawStatus === "FOR_DA_RFO_VALIDATION") {
            statusText = "For DA-RFO Validation"; statusClass = "submitted";
        }

        return `
            <tr>
                <td style="padding:12px 14px; text-align:center; font-weight:600;">#${escapeHtml(String(report.report_id))}</td>
                <td style="padding:12px 14px; text-align:center;">${escapeHtml(report.title || "-")}</td>
                <td style="padding:12px 14px; text-align:center;">${escapeHtml(formatReportDate(report.submitted_at))}</td>
                <td style="padding:12px 14px; text-align:center;">
                    <span class="status-pill ${statusClass}">${escapeHtml(statusText)}</span>
                </td>
            </tr>
        `;
    }).join("");
}

/* ============================================================
   SUBMIT REPORT SUBVIEW
   FIX: guard against the markup not being on this page,
   otherwise the main view gets hidden and nothing is clickable
============================================================ */

function openSubmitReportSubview(reportId = null) {
    const mainView = document.getElementById("reportsMainSubview");
    const submitView = document.getElementById("submitReportSubview");
    const detailsView = document.getElementById("reportDetailsSubview");

    if (!submitView) {
        alert("The report submission form is not available on this page yet.\n\nYou can update each finalized planting intent's status directly from the table below.");
        return;
    }

    resetReportForm();

    if (mainView) mainView.classList.add("hidden-element");
    if (detailsView) detailsView.classList.add("hidden-element");
    submitView.classList.remove("hidden-element");

    window.selectedReportIntents = [];
    renderSelectedReportIntents();
    populateReportIntentSelect();

    if (reportId) loadReportForEditing(reportId);
}

function closeSubmitReportSubview() {
    document.getElementById("submitReportSubview")?.classList.add("hidden-element");
    document.getElementById("reportsMainSubview")?.classList.remove("hidden-element");
    resetReportForm();
}

function closeReportDetailsSubview() {
    document.getElementById("reportDetailsSubview")?.classList.add("hidden-element");
    document.getElementById("reportsMainSubview")?.classList.remove("hidden-element");
    window.currentSelectedReport = null;
}

function closeAllModals() {
    document.querySelectorAll(".modal-overlay").forEach(function(modal) {
        modal.classList.remove("show");
    });

    document.getElementById("submitReportSubview")?.classList.add("hidden-element");
    document.getElementById("reportDetailsSubview")?.classList.add("hidden-element");
    document.getElementById("reportsMainSubview")?.classList.remove("hidden-element");
}

function populateReportIntentSelect() {
    const select = document.getElementById("reportIntentSelect");
    if (!select) return;

    select.innerHTML = `<option value="">Select Planting Intent</option>`;

    const availableIntents = (PLANTING_INTENTS_DATA || []).filter(function(intent) {
        return String(intent.status || "").toUpperCase() === "SUBMITTED";
    });

    availableIntents.sort(function(a, b) {
        return new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0);
    });

    const selected = window.selectedReportIntents || [];

    availableIntents.forEach(function(intent) {
        const alreadyAdded = selected.some(function(item) {
            return String(item.planting_intent_id) === String(intent.planting_intent_id);
        });
        if (alreadyAdded) return;

        const option = document.createElement("option");
        option.value = intent.planting_intent_id;

        const farmer = intent.farmer_name || "Unknown Farmer";
        const barangay = intent.barangay || intent.location || "-";
        const commodity = intent.commodity || "Unknown Commodity";
        const date = intent.updated_at ? formatPlantingDate(intent.updated_at) : '';

        option.textContent = `${barangay} - ${commodity} - ${farmer} (${date})`;
        select.appendChild(option);
    });
}

function resetReportForm() {
    document.getElementById("submitReportForm")?.reset();

    const titleInput = document.getElementById("reportTitleInput");
    if (titleInput) titleInput.value = "";

    const notesInput = document.getElementById("reportNotesInput");
    if (notesInput) notesInput.value = "";

    const selectedBody = document.getElementById("selectedIntentsTableBody");
    if (selectedBody) {
        selectedBody.innerHTML = `<tr><td colspan="5" style="padding:20px; text-align:center; color:#999;">No planting intents selected. Click "Add Row" to add.</td></tr>`;
    }

    window.selectedReportIntents = [];

    const select = document.getElementById("reportIntentSelect");
    if (select) select.innerHTML = '<option value="">Select Planting Intent</option>';
}

// ADD intent to report (single delegated listener)
document.addEventListener("click", function(event) {
    if (event.target?.id !== "addIntentToReportBtn") return;

    const select = document.getElementById("reportIntentSelect");
    if (!select || !select.value) {
        alert("Please select a planting intent.");
        return;
    }

    const intent = (PLANTING_INTENTS_DATA || []).find(function(item) {
        return String(item.planting_intent_id) === String(select.value);
    });

    if (!intent) {
        alert("Planting intent not found.");
        return;
    }

    if (!window.selectedReportIntents) window.selectedReportIntents = [];

    const alreadySelected = window.selectedReportIntents.some(function(item) {
        return String(item.planting_intent_id) === String(select.value);
    });

    if (alreadySelected) {
        alert("This planting intent is already added.");
        return;
    }

    window.selectedReportIntents.push(intent);
    select.value = "";

    renderSelectedReportIntents();
    populateReportIntentSelect();
});

// REMOVE selected intent (single delegated listener)
document.addEventListener("click", function(e) {
    if (!e.target?.classList?.contains('remove-intent-btn')) return;

    const index = parseInt(e.target.dataset.index);
    if (!isNaN(index) && window.selectedReportIntents && window.selectedReportIntents[index]) {
        window.selectedReportIntents.splice(index, 1);
        renderSelectedReportIntents();
        populateReportIntentSelect();
    }
});

function renderSelectedReportIntents() {
    const tbody = document.getElementById("selectedIntentsTableBody");
    if (!tbody) return;

    const intents = window.selectedReportIntents || [];

    if (intents.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="padding:20px; text-align:center; color:#999;">No planting intents selected. Click "Add Row" to add.</td></tr>`;
        return;
    }

    tbody.innerHTML = intents.map(function(intent, index) {
        const barangay = intent.barangay || intent.location || "N/A";
        const farmer = intent.farmer_name || "N/A";
        const commodity = intent.commodity || "N/A";
        const volume = intent.volume ?? "N/A";

        return `
            <tr>
                <td>${escapeHtml(String(barangay))}</td>
                <td>${escapeHtml(String(farmer))}</td>
                <td>${escapeHtml(String(commodity))}</td>
                <td>${escapeHtml(String(volume))} kg</td>
                <td class="center-col">
                    <button type="button" class="btn-outline-report remove-intent-btn" data-index="${index}" style="padding:2px 10px; font-size:11px; border-color:#C0392B; color:#C0392B;">Remove</button>
                </td>
            </tr>
        `;
    }).join("");
}

async function saveReport(status) {
    const intents = window.selectedReportIntents || [];

    if (intents.length === 0) {
        alert("Please add at least one planting intent.");
        return;
    }

    const title = getValue("reportTitleInput");
    if (!title) {
        alert("Please enter a Report Title.");
        return;
    }

    const notes = getValue("reportNotesInput");
    if (!notes) {
        alert("Please enter notes / remarks.");
        return;
    }

    const reportData = {
        title: title,
        status: status,
        notes: notes,
        planting_intent_ids: intents.map(function(intent) {
            return intent.planting_intent_id;
        })
    };

    const submitButton = document.getElementById("submitReportFinalBtn");
    const draftButton = document.getElementById("saveReportDraftBtn");

    try {
        if (submitButton) submitButton.disabled = true;
        if (draftButton) draftButton.disabled = true;

        const result = await apiRequest(`${API_BASE_URL}/api/raw-plant-reports/from-intents`, {
            method: "POST",
            body: JSON.stringify(reportData)
        });

        if (status === "SUBMITTED" && result?.report_id) {
            await apiRequest(`${API_BASE_URL}/api/raw-plant-reports/${result.report_id}`, {
                method: "PUT",
                body: JSON.stringify({ status: "FOR_MUNICIPAL_VALIDATION" })
            });

            for (const id of reportData.planting_intent_ids) {
                await apiRequest(PLANTING_INTENTS_ENDPOINT + id, {
                    method: "PUT",
                    body: JSON.stringify({ status: "FOR_MUNICIPAL_VALIDATION" })
                });
            }
        }

        alert(status === "SUBMITTED"
            ? "Report submitted to Municipal successfully!"
            : "Report saved as draft.");

        closeSubmitReportSubview();

        await fetchPlantingIntents();
        await loadReports();

    } catch (error) {
        console.error("Failed to save report:", error);
        alert("Failed to save report.\n\n" + (error.message || "Please try again."));
    } finally {
        if (submitButton) submitButton.disabled = false;
        if (draftButton) draftButton.disabled = false;
    }
}

async function loadReportForEditing(reportId) {
    try {
        const report = await apiRequest(REPORT_SUBMISSIONS_ENDPOINT + "/" + reportId, { method: "GET" });
        populateReportForm(report);
    } catch (error) {
        console.error("Failed to load report:", error);
        alert("Unable to load report details.");
    }
}

function populateReportForm(report) {
    const notes = document.getElementById("reportNotesInput");
    if (notes) notes.value = report.notes || report.remarks || "";

    window.selectedReportIntents = report.planting_intents || report.intents || [];

    renderSelectedReportIntents();
    populateReportIntentSelect();
}

/* ============================================================
   FORMAT HELPERS
============================================================ */

function formatReportDate(dateValue) {
    if (!dateValue) return "—";
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return String(dateValue);
    return date.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value ?? "—";
}

function formatPlantingDate(dateString) {
    if (!dateString) return "-";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
}

function formatPlantingVolume(volume) {
    if (volume === null || volume === undefined || volume === "") return "-";
    if (typeof volume === "string" && volume.toLowerCase().includes("kg")) return volume;
    const numericVolume = Number(String(volume).replace(/,/g, ""));
    if (!isNaN(numericVolume)) return numericVolume.toLocaleString() + " kg";
    return String(volume);
}

/* ============================================================
   OFFTAKE REQUESTS
============================================================ */

function initOfftakeRequest() {
    const list = document.getElementById("offtakeListSubview");
    const submitSub = document.getElementById("submitOfftakeSubview");
    const confirmSub = document.getElementById("confirmOfftakeSubview");

    document.getElementById("createOfftakeBtn")?.addEventListener("click", function() {
        currentOfftakeRequest = null;
        resetOfftakeForm();
        if (list) list.classList.add("hidden-element");
        if (submitSub) submitSub.classList.remove("hidden-element");
        if (confirmSub) confirmSub.classList.add("hidden-element");
    });

    document.getElementById("returnFromSubmitOfftakeBtn")?.addEventListener("click", function() {
        if (submitSub) submitSub.classList.add("hidden-element");
        if (confirmSub) confirmSub.classList.add("hidden-element");
        if (list) list.classList.remove("hidden-element");
    });

    document.getElementById("proceedOfftakeBtn")?.addEventListener("click", function() {
        const farmerSelect = document.getElementById("offtakeFarmerSelect");
        const farmerIdInput = document.getElementById("offtakeFarmerId");

        if (!farmerSelect || !farmerSelect.value) {
            alert("Please select a farmer.");
            return;
        }
        if (farmerIdInput) farmerIdInput.value = farmerSelect.value;

        const data = collectOfftakeFormData();
        data.farmer_id = farmerSelect.value;
        data.farmer_name = farmerSelect.options[farmerSelect.selectedIndex].text;

        if (!validateOfftakeForm(data)) return;

        currentOfftakeRequest = data;
        populateOfftakeReview(data);

        const letterDate = document.getElementById("letterDate");
        if (letterDate) {
            letterDate.textContent = new Date().toLocaleDateString("en-US", {
                month: "long", day: "numeric", year: "numeric"
            });
        }

        if (submitSub) submitSub.classList.add("hidden-element");
        if (confirmSub) confirmSub.classList.remove("hidden-element");
    });

    document.getElementById("backToSubmitOfftakeBtn")?.addEventListener("click", function() {
        if (confirmSub) confirmSub.classList.add("hidden-element");
        if (submitSub) submitSub.classList.remove("hidden-element");
    });

    document.getElementById("sendOfftakeBtn")?.addEventListener("click", async function() {
        if (!currentOfftakeRequest) {
            const data = collectOfftakeFormData();
            if (!validateOfftakeForm(data)) return;
            currentOfftakeRequest = data;
        }
        await submitOfftakeRequest();
    });
}

async function fetchOfftakeRequests() {
    const tbody = document.getElementById("offtakeTableBody");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center;">Loading offtake requests...</td></tr>`;

    try {
        const requests = await apiRequest(OFFTAKE_REQUESTS_ENDPOINT, { method: "GET" });

        if (!Array.isArray(allFarmers) || allFarmers.length === 0) {
            await fetchFarmers();
        }

        OFFTAKE_REQUESTS_DATA = requests || [];
        currentOfftakePage = 1;
        renderOfftakeTable();

    } catch (error) {
        console.error("Unable to load offtake requests:", error);
        OFFTAKE_REQUESTS_DATA = [];
        tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center; color:#C0392B;">Failed to load offtake requests.<br><small>${escapeHtml(error.message || "Please check the FastAPI server.")}</small></td></tr>`;
        renderOfftakePagination(0);
    }
}

function renderOfftakeTable() {
    const tbody = document.getElementById("offtakeTableBody");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!Array.isArray(OFFTAKE_REQUESTS_DATA) || OFFTAKE_REQUESTS_DATA.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center; color:#777;">No offtake requests found.</td></tr>`;
        renderOfftakePagination(0);
        return;
    }

    const start = (currentOfftakePage - 1) * offtakePerPage;
    const paginatedItems = OFFTAKE_REQUESTS_DATA.slice(start, start + offtakePerPage);

    paginatedItems.forEach(function(request) {
        let farmer = null;
        if (request.farmer_id) {
            farmer = allFarmers.find(function(f) { return String(f.farmer_id) === String(request.farmer_id); });
        }

        let farmerName = "Unknown Farmer";
        let farmerLocation = "—";
        if (farmer) {
            farmerName = [farmer.first_name, farmer.middle_name, farmer.last_name, farmer.suffix].filter(Boolean).join(" ");
            farmerLocation = farmer.address || [farmer.barangay, farmer.municipality].filter(Boolean).join(", ") || "—";
        }

        const row = document.createElement("tr");
        row.className = "clickable-row";
        row.innerHTML = `
            <td><span class="pill">${escapeHtml(farmerName)}</span></td>
            <td><span class="pill">${escapeHtml(request.commodity || "—")}</span></td>
            <td><span class="pill">${escapeHtml(String(request.quantity || "—"))} kg</span></td>
            <td><span class="pill">${escapeHtml(farmerLocation)}</span></td>
            <td><span class="pill">${escapeHtml(formatPlantingDate(request.harvest_date))}</span></td>
            <td class="center-col"><span class="status-pill submitted">Submitted</span></td>
        `;
        tbody.appendChild(row);
    });

    renderOfftakePagination(OFFTAKE_REQUESTS_DATA.length);
}

function renderOfftakePagination(totalCount) {
    const container = document.getElementById("offtakeTableBody")?.closest(".card");
    if (!container) return;

    const existing = container.querySelector(".offtake-pagination");
    if (existing) existing.remove();

    if (totalCount <= offtakePerPage) return;

    const totalPages = Math.ceil(totalCount / offtakePerPage);
    if (currentOfftakePage > totalPages) currentOfftakePage = totalPages;

    const startItem = (currentOfftakePage - 1) * offtakePerPage + 1;
    const endItem = Math.min(currentOfftakePage * offtakePerPage, totalCount);

    let html = `
        <div class="pagination-container offtake-pagination">
            <span class="pagination-info">Showing ${startItem}-${endItem} of ${totalCount} offtake requests</span>
            <div class="pagination-controls">
                <button class="btn-page offtake-prev-btn" type="button" ${currentOfftakePage <= 1 ? 'disabled' : ''}>&laquo; Prev</button>
                <div class="page-numbers-wrap">
    `;

    let startPage = Math.max(1, currentOfftakePage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);

    if (startPage > 1) {
        html += `<button class="btn-page offtake-pg-btn" type="button" data-page="1">1</button>`;
        if (startPage > 2) html += `<span style="padding:0 4px; color:#777;">...</span>`;
    }

    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="btn-page offtake-pg-btn ${i === currentOfftakePage ? 'active' : ''}" type="button" data-page="${i}">${i}</button>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += `<span style="padding:0 4px; color:#777;">...</span>`;
        html += `<button class="btn-page offtake-pg-btn" type="button" data-page="${totalPages}">${totalPages}</button>`;
    }

    html += `
                </div>
                <button class="btn-page offtake-next-btn" type="button" ${currentOfftakePage >= totalPages ? 'disabled' : ''}>Next &raquo;</button>
            </div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', html);

    const paginationDiv = container.querySelector(".offtake-pagination");
    if (!paginationDiv) return;

    paginationDiv.querySelectorAll(".offtake-pg-btn").forEach(function(btn) {
        btn.addEventListener("click", function() {
            currentOfftakePage = parseInt(this.dataset.page);
            renderOfftakeTable();
        });
    });

    paginationDiv.querySelector(".offtake-prev-btn")?.addEventListener("click", function() {
        if (currentOfftakePage > 1) { currentOfftakePage--; renderOfftakeTable(); }
    });

    paginationDiv.querySelector(".offtake-next-btn")?.addEventListener("click", function() {
        if (currentOfftakePage < totalPages) { currentOfftakePage++; renderOfftakeTable(); }
    });
}

function collectOfftakeFormData() {
    return {
        farmer_name: getOfftakeValue(["offtakeFarmerName", "farmerName"]),
        farmer_id: getOfftakeValue(["offtakeFarmerId", "farmerId"]),
        commodity: getOfftakeValue(["offtakeCommodity", "commodity"]),
        quantity: getOfftakeValue(["offtakeQty", "offtakeQuantity", "quantity"]),
        selling_price: getOfftakeValue(["offtakePrice", "offtakeSellingPrice", "sellingPrice"]),
        harvest_date: getOfftakeValue(["offtakeHarvestDate", "harvestDate"]),
        commodity_photo: getOfftakeValue(["offtakeCommodityPhoto", "commodityPhoto"]),
        buyer: getOfftakeValue(["offtakeBuyer", "buyer"]),
        delivery_location: getOfftakeValue(["offtakeLocation", "offtakeDeliveryLocation", "deliveryLocation"])
    };
}

function getOfftakeValue(ids) {
    for (let i = 0; i < ids.length; i++) {
        const element = document.getElementById(ids[i]);
        if (element) return (element.value || "").toString().trim();
    }
    return "";
}

function validateOfftakeForm(data) {
    if (!data.farmer_name) { alert("Please select a Farmer."); return false; }
    if (!data.farmer_id) { alert("Farmer ID is missing."); return false; }
    if (!/^\d+$/.test(String(data.farmer_id))) { alert("Farmer ID must be a valid whole number."); return false; }
    if (!data.commodity) { alert("Please select a Commodity."); return false; }
    if (!data.quantity) { alert("Please enter Quantity."); return false; }
    if (!/^\d+(\.\d+)?$/.test(String(data.quantity).replace(/,/g, "").trim())) { alert("Quantity must be a valid number."); return false; }
    if (!data.selling_price) { alert("Please enter Selling Price."); return false; }
    if (!/^\d+(\.\d+)?$/.test(String(data.selling_price).replace(/,/g, "").replace(/₱/g, "").trim())) { alert("Selling Price must be a valid number."); return false; }
    if (!data.harvest_date) { alert("Please select Harvest Date."); return false; }
    if (!data.delivery_location) { alert("Please enter a Delivery Location."); return false; }
    return true;
}

function populateOfftakeReview(data) {
    setReviewValue(["confirmFarmerName", "reviewFarmerName"], data.farmer_name);
    setReviewValue(["confirmFarmerId", "reviewFarmerId"], data.farmer_id);
    setReviewValue(["confirmCommodity", "reviewCommodity"], data.commodity);
    setReviewValue(["confirmQuantity", "reviewQuantity"], data.quantity);
    setReviewValue(["confirmSellingPrice", "reviewSellingPrice"], data.selling_price);
    setReviewValue(["confirmHarvestDate", "reviewHarvestDate"], formatPlantingDate(data.harvest_date));
    setReviewValue(["confirmLocation", "confirmDeliveryLocation"], data.delivery_location);
    setReviewValue(["confirmBuyerName", "confirmBuyer"], data.buyer || "Buyer Organization");
}

function setReviewValue(ids, value) {
    for (let i = 0; i < ids.length; i++) {
        const element = document.getElementById(ids[i]);
        if (element) {
            element.textContent = value || "-";
            return;
        }
    }
}

async function submitOfftakeRequest() {
    if (!currentOfftakeRequest) {
        alert("No Offtake Request data found.");
        return;
    }

    const sendOfftakeBtn = document.getElementById("sendOfftakeBtn");
    if (sendOfftakeBtn) {
        sendOfftakeBtn.disabled = true;
        sendOfftakeBtn.textContent = "Submitting...";
    }

    try {
        const data = currentOfftakeRequest;
        const farmerId = parseInt(data.farmer_id, 10);
        if (!Number.isInteger(farmerId)) {
            throw new Error("Farmer ID must be a valid whole number.");
        }

        const quantity = String(data.quantity).replace(/,/g, "").trim();
        const sellingPrice = String(data.selling_price).replace(/,/g, "").replace(/₱/g, "").trim();

        const payload = {
            farmer_id: farmerId,
            commodity: data.commodity,
            quantity: quantity,
            selling_price: sellingPrice,
            harvest_date: data.harvest_date,
            commodity_photo: data.commodity_photo || null
        };

        await apiRequest(OFFTAKE_REQUESTS_ENDPOINT, {
            method: "POST",
            body: JSON.stringify(payload)
        });

        await fetchOfftakeRequests();

        // FIX: the old code opened a modal that does not exist in the HTML,
        // so the screen stayed stuck on the memo. Return to the list instead.
        document.getElementById("confirmOfftakeSubview")?.classList.add("hidden-element");
        document.getElementById("submitOfftakeSubview")?.classList.add("hidden-element");
        document.getElementById("offtakeListSubview")?.classList.remove("hidden-element");

        currentOfftakeRequest = null;
        resetOfftakeForm();

        alert("Offtake memorandum transmitted successfully.");

    } catch (error) {
        console.error("Create Offtake Request error:", error);
        handleAuthError(error);
        alert("Failed to submit Offtake Request.\n\n" + (error.message || "Please check the FastAPI server."));
    } finally {
        if (sendOfftakeBtn) {
            sendOfftakeBtn.disabled = false;
            sendOfftakeBtn.textContent = "Transmit Memorandum";
        }
    }
}

function resetOfftakeForm() {
    document.getElementById("submitOfftakeForm")?.reset();
    const farmerId = document.getElementById("offtakeFarmerId");
    if (farmerId) farmerId.value = "";
    currentOfftakeRequest = null;
}

/* ============================================================
   HELPER FUNCTIONS
============================================================ */

function getValue(id) {
    const element = document.getElementById(id);
    if (!element) return "";
    return (element.value || "").trim();
}

function setValue(id, value) {
    const element = document.getElementById(id);
    if (!element) return;
    const safeValue = value === null || value === undefined ? "" : value;
    if ("value" in element) {
        element.value = safeValue;
        return;
    }
    element.textContent = safeValue;
}

function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

/* ============================================================
   FARMER DROPDOWN POPULATION
============================================================ */

function populateFarmerDropdowns() {
    const farmers = allFarmers || [];
    ['piFarmerName', 'offtakeFarmerSelect'].forEach(function(dropdownId) {
        const dropdown = document.getElementById(dropdownId);
        if (!dropdown) return;

        dropdown.innerHTML = '';
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = 'Select Farmer';
        dropdown.appendChild(defaultOpt);

        farmers.forEach(function(farmer) {
            const option = document.createElement('option');
            option.value = farmer.farmer_id;
            const fullName = [farmer.first_name, farmer.middle_name, farmer.last_name, farmer.suffix].filter(Boolean).join(" ");
            option.textContent = fullName || farmer.rsbsa_id || ("Farmer " + farmer.farmer_id);
            dropdown.appendChild(option);
        });
    });
}

function setupFarmerDropdownAutoFill() {
    const piFarmerName = document.getElementById('piFarmerName');
    const piFarmerId = document.getElementById('piFarmerId');
    if (piFarmerName && piFarmerId && !piFarmerName.dataset.autofillBound) {
        piFarmerName.dataset.autofillBound = "1";
        piFarmerName.addEventListener('change', function() {
            piFarmerId.value = this.value || '';
        });
    }

    const offtakeFarmerSelect = document.getElementById('offtakeFarmerSelect');
    const offtakeFarmerId = document.getElementById('offtakeFarmerId');
    if (offtakeFarmerSelect && offtakeFarmerId && !offtakeFarmerSelect.dataset.autofillBound) {
        offtakeFarmerSelect.dataset.autofillBound = "1";
        offtakeFarmerSelect.addEventListener('change', function() {
            offtakeFarmerId.value = this.value || '';
        });
    }
}

function refreshFarmerDropdowns() {
    populateFarmerDropdowns();
    setupFarmerDropdownAutoFill();
}

/* ============================================================
   FORECAST RESULTS (FAIR PRICES)
============================================================ */

function initForecastResults() {
    const forecastView = document.getElementById("view-fair-prices");
    if (!forecastView) return;

    if (forecastView.classList.contains("active-view")) {
        setTimeout(loadForecastResults, 300);
    }

    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.attributeName === 'class' && forecastView.classList.contains('active-view')) {
                loadForecastResults();
            }
        });
    });
    observer.observe(forecastView, { attributes: true });

    document.querySelector('.nav-item[data-view="fair-prices"]')?.addEventListener('click', function() {
        setTimeout(loadForecastResults, 200);
    });
}

async function loadForecastResults() {
    const container = document.getElementById("forecastResultsContainer");
    if (!container) return;

    // Avoid reloading over and over when the view is re-activated
    if (container.dataset.loading === "1") return;
    container.dataset.loading = "1";

    container.innerHTML = `
        <div style="padding:40px; text-align:center; color:#777; font-size:15px;">
            <div style="display:inline-block; width:30px; height:30px; border:3px solid #E5E5E5; border-top-color:#2E7D32; border-radius:50%; animation:spin 0.8s linear infinite; margin-bottom:10px;"></div>
            <br>Loading forecast results...
        </div>
    `;

    try {
        const forecasts = await apiRequest(FORECASTS_ENDPOINT, { method: "GET" });

        if (!Array.isArray(forecasts)) {
            throw new Error("Invalid forecast response.");
        }

        FORECASTS_DATA = forecasts;
        renderForecastResults(forecasts);

        setTimeout(initPriceChart, 300);

    } catch (error) {
        console.error("Failed to load forecast results:", error);
        container.innerHTML = `
            <div style="padding:40px; text-align:center; color:#C0392B; font-size:15px;">
                <strong>Failed to load forecast results.</strong>
                <br><small style="color:#999;">${escapeHtml(error.message || "Please check the FastAPI server.")}</small>
                <br><br>
                <button type="button" onclick="loadForecastResults()" style="padding:8px 20px; background:#2E7D32; color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:600;">Retry</button>
            </div>
        `;
    } finally {
        container.dataset.loading = "0";
    }
}

function updatePriceMetrics(forecasts) {
    const lowestPriceEl = document.getElementById("lowestPriceDisplay");
    const highestPriceEl = document.getElementById("highestPriceDisplay");

    if (!lowestPriceEl || !highestPriceEl) return;

    const allPrices = [];
    forecasts.forEach(function(f) {
        if (f.forecast_price_low) allPrices.push(Number(f.forecast_price_low));
        if (f.forecast_price_high) allPrices.push(Number(f.forecast_price_high));
    });

    if (allPrices.length === 0) {
        lowestPriceEl.innerHTML = '₱0 <span style="font-size:13px; font-weight:500; color:#fff;">/kg</span>';
        highestPriceEl.innerHTML = '₱0 <span style="font-size:13px; font-weight:500; color:#fff;">/kg</span>';
        return;
    }

    lowestPriceEl.innerHTML = `₱${Math.min(...allPrices).toFixed(2)} <span style="font-size:13px; font-weight:500; color:#fff;">/kg</span>`;
    highestPriceEl.innerHTML = `₱${Math.max(...allPrices).toFixed(2)} <span style="font-size:13px; font-weight:500; color:#fff;">/kg</span>`;
}

function groupForecastsByYear(forecasts) {
    const grouped = {};
    forecasts.forEach(function(forecast) {
        const dateString = forecast.forecast_date || forecast.date || forecast.created_at;
        if (!dateString) return;
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return;
        const year = date.getFullYear();
        if (!grouped[year]) grouped[year] = [];
        grouped[year].push(forecast);
    });
    return grouped;
}

function groupForecastsByMonth(forecasts) {
    const grouped = {};
    forecasts.forEach(function(forecast) {
        const dateString = forecast.forecast_date || forecast.date || forecast.created_at;
        if (!dateString) return;
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return;
        const month = date.toLocaleString('en-US', { month: 'long' });
        if (!grouped[month]) grouped[month] = [];
        grouped[month].push(forecast);
    });
    return grouped;
}

function toggleForecastYear(headerElement) {
    const content = headerElement.nextElementSibling;
    const arrow = headerElement.querySelector('span:last-child');
    if (!content) return;

    if (content.style.maxHeight) {
        content.style.maxHeight = null;
        if (arrow) arrow.style.transform = 'rotate(0deg)';
    } else {
        content.style.maxHeight = content.scrollHeight + 'px';
        if (arrow) arrow.style.transform = 'rotate(180deg)';
    }
}

function toggleForecastMonth(headerElement) {
    const content = headerElement.nextElementSibling;
    const arrow = headerElement.querySelector('span:last-child');
    if (!content) return;

    if (content.style.display === 'none' || content.style.display === '') {
        content.style.display = 'block';
        if (arrow) arrow.style.transform = 'rotate(90deg)';
    } else {
        content.style.display = 'none';
        if (arrow) arrow.style.transform = 'rotate(0deg)';
    }

    const yearContent = headerElement.closest('.forecast-year-content');
    if (yearContent && yearContent.style.maxHeight) {
        yearContent.style.maxHeight = yearContent.scrollHeight + 'px';
    }
}

// Spinner keyframes
const spinnerStyle = document.createElement('style');
spinnerStyle.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
document.head.appendChild(spinnerStyle);

function renderForecastResults(forecasts) {
    const container = document.getElementById("forecastResultsContainer");
    if (!container) return;

    if (!forecasts || forecasts.length === 0) {
        container.innerHTML = `
            <div style="padding:40px; text-align:center; color:#777; font-size:15px;">
                No forecast results available.
                <br><small style="color:#999;">Please check back later.</small>
            </div>
        `;
        return;
    }

    const groupedByYear = groupForecastsByYear(forecasts);
    const sortedYears = Object.keys(groupedByYear).sort().reverse();
    const monthOrder = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    let html = '';

    sortedYears.forEach(function(year) {
        const groupedByMonth = groupForecastsByMonth(groupedByYear[year]);

        html += `
            <div class="forecast-year-group" style="margin-bottom:16px;">
                <div class="forecast-year-header" style="background:#2E7D32; color:#fff; padding:12px 20px; border-radius:8px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; font-weight:600; font-size:16px;" onclick="toggleForecastYear(this)">
                    <span>${escapeHtml(year)} Projections</span>
                    <span style="font-size:20px; transition:transform 0.3s;">&#9660;</span>
                </div>
                <div class="forecast-year-content" style="background:#fff; border:1px solid #E5E5E5; border-top:none; border-radius:0 0 8px 8px; padding:8px 12px; overflow:hidden; transition:max-height 0.3s ease;">
        `;

        const sortedMonths = Object.keys(groupedByMonth).sort(function(a, b) {
            return monthOrder.indexOf(a) - monthOrder.indexOf(b);
        });

        sortedMonths.forEach(function(month, monthIndex) {
            const sortedCommodities = groupedByMonth[month].sort(function(a, b) {
                return (a.commodity || '').localeCompare(b.commodity || '');
            });

            const isFirstMonth = monthIndex === 0;
            const displayStyle = isFirstMonth ? 'block' : 'none';
            const arrowRotation = isFirstMonth ? 'rotate(90deg)' : 'rotate(0deg)';

            html += `
                <div class="forecast-month-group" style="margin-bottom:4px;">
                    <div class="forecast-month-header" style="padding:10px 12px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; background:#F6F3EB; border-radius:6px; font-weight:500; font-size:14px;" onclick="toggleForecastMonth(this)">
                        <span>${escapeHtml(month)} ${escapeHtml(year)}</span>
                        <span style="font-size:16px; transition:transform 0.3s; transform:${arrowRotation};">&#9654;</span>
                    </div>
                    <div class="forecast-month-content" style="padding:8px 12px; background:#FAF8F5; border-radius:0 0 6px 6px; display:${displayStyle};">
                        <table style="width:100%; border-collapse:collapse; font-size:13px;">
                            <thead>
                                <tr style="border-bottom:2px solid #DEDDDC;">
                                    <th style="text-align:left; padding:8px 6px; font-weight:600; color:#333;">Commodity</th>
                                    <th style="text-align:center; padding:8px 6px; font-weight:600; color:#333;">Lower Price (₱)</th>
                                    <th style="text-align:center; padding:8px 6px; font-weight:600; color:#333;">Upper Price (₱)</th>
                                    <th style="text-align:center; padding:8px 6px; font-weight:600; color:#333;">Range</th>
                                </tr>
                            </thead>
                            <tbody>
            `;

            sortedCommodities.forEach(function(forecast, index) {
                const commodity = forecast.commodity || forecast.crop || '—';
                const lowerPriceStr = Number(forecast.forecast_price_low || 0).toFixed(2);
                const upperPriceStr = Number(forecast.forecast_price_high || 0).toFixed(2);
                const bgColor = index % 2 === 0 ? 'transparent' : '#F6F3EB';

                html += `
                    <tr style="background:${bgColor}; border-bottom:1px solid #F0EDE8;">
                        <td style="padding:8px 6px; font-weight:500;">${escapeHtml(commodity)}</td>
                        <td style="padding:8px 6px; text-align:center;">₱${lowerPriceStr}</td>
                        <td style="padding:8px 6px; text-align:center;">₱${upperPriceStr}</td>
                        <td style="padding:8px 6px; text-align:center;">
                            <span style="background:#2E7D32; color:#fff; padding:2px 12px; border-radius:12px; font-size:12px; font-weight:600;">₱${lowerPriceStr} – ₱${upperPriceStr}</span>
                        </td>
                    </tr>
                `;
            });

            html += `</tbody></table></div></div>`;
        });

        html += `</div></div>`;
    });

    container.innerHTML = html;

    const firstYearContent = container.querySelector('.forecast-year-content');
    if (firstYearContent) {
        firstYearContent.style.maxHeight = firstYearContent.scrollHeight + 'px';
    }

    updatePriceMetrics(forecasts);

    const countDiv = document.createElement('div');
    countDiv.style.cssText = 'margin-top:12px; padding:12px 0; font-size:13px; color:#666; text-align:right; border-top:1px solid #E5E5E5;';
    countDiv.textContent = `Total: ${forecasts.length} forecast(s) found.`;
    container.appendChild(countDiv);
}

/* ============================================================
   PRICE TREND CHART
============================================================ */

function initPriceChart() {
    const canvas = document.getElementById('priceTrendChart');
    if (!canvas) return;

    if (typeof Chart === 'undefined') {
        setTimeout(initPriceChart, 500);
        return;
    }

    const forecasts = FORECASTS_DATA || [];
    if (forecasts.length === 0) return;

    renderChart(forecasts, 'all');
}

function renderChart(forecasts, commodityFilter) {
    const canvas = document.getElementById('priceTrendChart');
    if (!canvas || typeof Chart === 'undefined') return;

    if (priceChartInstance) {
        priceChartInstance.destroy();
        priceChartInstance = null;
    }

    let filteredData = forecasts;
    if (commodityFilter !== 'all') {
        filteredData = forecasts.filter(function(f) {
            const rawComm = f.commodity || '';
            const cleanComm = rawComm === 'Squash fruit' ? 'Squash' : rawComm;
            return cleanComm === commodityFilter || rawComm === commodityFilter;
        });
    }

    if (filteredData.length === 0) return;

    const commodities = {};
    filteredData.forEach(function(f) {
        const rawCommodity = f.commodity || 'Unknown';
        const commodity = rawCommodity === 'Squash fruit' ? 'Squash' : rawCommodity;
        if (!commodities[commodity]) commodities[commodity] = [];
        commodities[commodity].push(f);
    });

    Object.keys(commodities).forEach(function(commodity) {
        commodities[commodity].sort(function(a, b) {
            return new Date(a.forecast_date) - new Date(b.forecast_date);
        });
    });

    const colorPalette = {
        'Tomato':      { main: '#E74C3C', light: 'rgba(231,76,60,0.15)',  gradient: ['rgba(231,76,60,0.3)',  'rgba(231,76,60,0.05)'] },
        'Squash':      { main: '#F39C12', light: 'rgba(243,156,18,0.15)', gradient: ['rgba(243,156,18,0.3)', 'rgba(243,156,18,0.05)'] },
        'Red Onion':   { main: '#8E44AD', light: 'rgba(142,68,173,0.15)', gradient: ['rgba(142,68,173,0.3)', 'rgba(142,68,173,0.05)'] },
        'White Onion': { main: '#1ABC9C', light: 'rgba(26,188,156,0.15)', gradient: ['rgba(26,188,156,0.3)', 'rgba(26,188,156,0.05)'] }
    };

    const defaultColors = ['#E74C3C', '#F39C12', '#2ECC71', '#3498DB', '#9B59B6', '#1ABC9C', '#E67E22', '#2C3E50'];
    let colorIndex = 0;

    const allDates = [];
    Object.keys(commodities).forEach(function(commodity) {
        commodities[commodity].forEach(function(f) {
            const dateStr = new Date(f.forecast_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            if (!allDates.includes(dateStr)) allDates.push(dateStr);
        });
    });
    allDates.sort(function(a, b) { return new Date(a) - new Date(b); });

    const datasets = [];

    Object.keys(commodities).forEach(function(commodity) {
        const data = commodities[commodity];

        let colorObj = colorPalette[commodity];
        if (!colorObj) {
            const mainColor = defaultColors[colorIndex % defaultColors.length];
            colorObj = { main: mainColor, light: mainColor + '33', gradient: [mainColor + '44', mainColor + '11'] };
            colorIndex++;
        }

        const lowerPrices = [];
        const upperPrices = [];

        allDates.forEach(function(dateStr) {
            const found = data.find(function(f) {
                return new Date(f.forecast_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) === dateStr;
            });

            if (found) {
                lowerPrices.push(parseFloat(found.forecast_price_low || 0));
                upperPrices.push(parseFloat(found.forecast_price_high || 0));
            } else {
                lowerPrices.push(null);
                upperPrices.push(null);
            }
        });

        datasets.push({
            label: commodity + ' (High)',
            data: upperPrices,
            borderColor: colorObj.main,
            backgroundColor: function(context) {
                const chart = context.chart;
                const { ctx, chartArea } = chart;
                if (!chartArea) return colorObj.light;
                const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                gradient.addColorStop(0, colorObj.gradient[0]);
                gradient.addColorStop(1, colorObj.gradient[1]);
                return gradient;
            },
            borderWidth: 3,
            borderDash: [7, 9],
            pointRadius: 5,
            pointBackgroundColor: colorObj.main,
            pointBorderColor: '#FFFFFF',
            pointBorderWidth: 2,
            pointHoverRadius: 8,
            tension: 0.4,
            fill: true,
            spanGaps: false
        });

        datasets.push({
            label: commodity + ' (Low)',
            data: lowerPrices,
            borderColor: colorObj.main,
            backgroundColor: 'transparent',
            borderWidth: 3,
            borderDash: [],
            pointRadius: 4,
            pointBackgroundColor: colorObj.main,
            pointBorderColor: '#FFFFFF',
            pointBorderWidth: 2,
            pointHoverRadius: 7,
            tension: 0.4,
            fill: false,
            spanGaps: false
        });
    });

    if (datasets.length === 0) return;

    try {
        priceChartInstance = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: { labels: allDates, datasets: datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            generateLabels: function(chart) {
                                const labels = Chart.defaults.plugins.legend.labels.generateLabels.call(this, chart);
                                labels.forEach(function(label) {
                                    const dataset = chart.data.datasets[label.datasetIndex];
                                    if (dataset && dataset.borderDash) label.lineDash = dataset.borderDash;
                                });
                                return labels;
                            },
                            font: { size: 12, weight: '600', family: 'Plus Jakarta Sans' },
                            boxWidth: 25,
                            boxHeight: 0,
                            padding: 16,
                            usePointStyle: false,
                            color: '#2E2A22'
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(46,42,34,0.92)',
                        titleFont: { size: 13, weight: '700', family: 'Plus Jakarta Sans' },
                        bodyFont: { size: 12, weight: '500', family: 'Plus Jakarta Sans' },
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: {
                            label: function(context) {
                                const label = context.dataset.label || '';
                                const value = context.raw;
                                if (value !== null && value !== undefined) {
                                    return label + ': ₱' + value.toFixed(2) + '/kg';
                                }
                                return label + ': No data';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            font: { size: 11, weight: '600', family: 'Plus Jakarta Sans' },
                            color: '#625E52',
                            maxRotation: 45,
                            minRotation: 30
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0,0,0,0.06)' },
                        ticks: {
                            callback: function(value) { return '₱' + value.toFixed(0); },
                            font: { size: 11, weight: '600', family: 'Plus Jakarta Sans' },
                            color: '#625E52'
                        },
                        title: {
                            display: true,
                            text: 'Price (₱/kg)',
                            font: { size: 12, weight: '700', family: 'Plus Jakarta Sans' },
                            color: '#625E52'
                        }
                    }
                },
                layout: { padding: { top: 10, bottom: 10, left: 10, right: 20 } }
            }
        });
    } catch (error) {
        console.error('Error creating chart:', error);
    }
}

function updateChart(commodity) {
    const forecasts = FORECASTS_DATA || [];
    if (forecasts.length === 0) return;

    document.querySelectorAll('.fair-price-dashboard-container .btn-outline-report').forEach(function(btn) {
        const btnText = btn.textContent.trim();
        const isActive = btnText === commodity ||
                         (commodity === 'all' && btnText === 'All') ||
                         (commodity === 'Squash fruit' && btnText === 'Squash');
        if (isActive) {
            btn.style.background = '#2E7D32';
            btn.style.color = '#fff';
            btn.style.borderColor = '#2E7D32';
        } else {
            btn.style.background = '#FFFFFF';
            btn.style.color = 'var(--ink)';
            btn.style.borderColor = 'var(--border)';
        }
    });

    renderChart(forecasts, commodity === 'Squash fruit' ? 'Squash' : commodity);
}

/* ============================================================
   NOTIFICATION BELL
============================================================ */

async function initNotificationBell() {
    const bell = document.getElementById("notificationBell");
    const dropdown = document.getElementById("notificationDropdown");

    if (!bell || !dropdown) return;

    bell.addEventListener("click", async (event) => {
        event.stopPropagation();
        dropdown.classList.toggle("show");
        if (dropdown.classList.contains("show")) {
            await loadAEWNotifications();
        }
    });

    document.addEventListener("click", (event) => {
        if (!bell.contains(event.target)) {
            dropdown.classList.remove("show");
        }
    });

    await loadAEWNotifications();
}

async function loadAEWNotifications() {
    const notificationList = document.getElementById("notificationList");
    const notificationDot = document.getElementById("notificationDot");

    if (!notificationList) return;

    try {
        notificationList.innerHTML = `<div class="notification-empty">Loading notifications...</div>`;

        const mapResponse = await fetch(`${API_BASE_URL}/api/planting-intents/municipality-map`, {
            method: "GET",
            headers: getAuthHeaders()
        });

        if (!mapResponse.ok) throw new Error(`Map API error: ${mapResponse.status}`);

        const mapResult = await mapResponse.json();

        if (!mapResult.data || !Array.isArray(mapResult.data)) {
            showNoNotifications();
            return;
        }

        const alerts = [];

        for (const municipalityData of mapResult.data) {
            const municipality = municipalityData.municipality;
            if (!Array.isArray(municipalityData.commodities)) continue;

            for (const item of municipalityData.commodities) {
                const commodity = item.commodity;

                try {
                    const alertResponse = await fetch(
                        `${API_BASE_URL}/api/alert-thresholds/oversupply/${encodeURIComponent(commodity)}?municipality=${encodeURIComponent(municipality)}`,
                        { method: "GET", headers: getAuthHeaders() }
                    );

                    if (!alertResponse.ok) continue;

                    const alertData = await alertResponse.json();

                    if (alertData.status === "OVERSUPPLY") {
                        const supply = Number(alertData.projected_supply || 0);
                        const demand = Number(alertData.base_demand || 0);
                        const surplusPercentage = demand > 0 ? ((supply - demand) / demand) * 100 : 0;

                        alerts.push({
                            commodity: alertData.commodity || commodity,
                            municipality: alertData.municipality || municipality,
                            supply: supply,
                            demand: demand,
                            surplusPercentage: surplusPercentage
                        });
                    }
                } catch (error) {
                    console.warn(`Failed to check ${commodity} in ${municipality}:`, error);
                }
            }
        }

        renderAEWNotifications(alerts);

        if (notificationDot) {
            notificationDot.style.display = alerts.length > 0 ? "block" : "none";
        }

    } catch (error) {
        console.error("Failed to load AEW notifications:", error);
        showNoNotifications();
    }
}

function renderAEWNotifications(alerts) {
    const notificationList = document.getElementById("notificationList");
    if (!notificationList) return;

    if (!alerts.length) {
        showNoNotifications();
        return;
    }

    notificationList.innerHTML = "";

    alerts.forEach(function(alert) {
        const item = document.createElement("div");
        item.className = "notification-item";
        item.style.cssText = "padding:12px 18px; border-bottom:1px solid var(--border-light); font-size:13px;";

        item.innerHTML = `
            <div style="font-weight:700; color:#C0392B; margin-bottom:4px;">
                ${escapeHtml(alert.commodity)} Oversupply Risk
            </div>
            <div style="color:var(--muted); line-height:1.4;">
                <strong>${escapeHtml(alert.municipality)}</strong><br>
                Supply: ${escapeHtml(formatKg(alert.supply))}<br>
                Demand: ${escapeHtml(formatKg(alert.demand))}<br>
                Surplus: +${Math.round(alert.surplusPercentage)}%
            </div>
        `;

        notificationList.appendChild(item);
    });
}

function showNoNotifications() {
    const notificationList = document.getElementById("notificationList");
    const notificationDot = document.getElementById("notificationDot");

    if (notificationList) {
        notificationList.innerHTML = `<div class="notification-empty">No new notifications.</div>`;
    }
    if (notificationDot) {
        notificationDot.style.display = "none";
    }
}

function formatKg(value) {
    return `${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })} kg`;
}

