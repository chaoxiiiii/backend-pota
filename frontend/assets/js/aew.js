/* ============================================================
   E SAKA — AEW DASHBOARD
   Complete Frontend JavaScript
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
let filteredPlantingIntents = [];

// Pagination
let currentFarmersPage = 1;
let currentPlantingIntentsPage = 1;
const farmersPerPage = 10;
const plantingIntentsPerPage = 10;
let currentDraftIntentsPage = 1;
let currentSubmittedIntentsPage = 1;

// Farmer state
let currentActiveFarmer = null;
let isEditMode = false;
let mapInstance = null;

// Offtake state
let currentOfftakeRequest = null;
let OFFTAKE_REQUESTS_DATA = [];


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
    initFairPrice();
    initFairPriceMonthDropdown();
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
   USER PROFILE
============================================================ */

function setupUserProfile() {
    const storedName = localStorage.getItem("full_name") || localStorage.getItem("name") || localStorage.getItem("username");
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
   SIDEBAR
============================================================ */

function initSidebar() {
    const hamburgerBtn = document.getElementById("hamburgerBtn");
    const sidebar = document.getElementById("sidebar");

    if (!hamburgerBtn || !sidebar) return;

    let hoverTimer = null;

    hamburgerBtn.addEventListener("mouseenter", function() {
        if (hoverTimer) {
            clearTimeout(hoverTimer);
            hoverTimer = null;
        }
        setTimeout(function() {
            sidebar.classList.add("open");
            setTimeout(function() {
                if (mapInstance) mapInstance.invalidateSize();
            }, 300);
        }, 100);
    });

    sidebar.addEventListener("mouseleave", function() {
        hoverTimer = setTimeout(function() {
            sidebar.classList.remove("open");
        }, 200);
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

    const signoutBtn = sidebar.querySelector(".signout");
    if (signoutBtn) {
        signoutBtn.addEventListener("click", function() {
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
                headers: {
                    "Accept": "application/json"
                }
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

        result.data.forEach(municipalityData => {
            const municipality = municipalityData.municipality;
            const coordinates = municipalityCoordinates[municipality];

            if (!coordinates) {
                console.warn(`No coordinates for ${municipality}`);
                return;
            }

            let popupContent = `
                <div style="min-width:200px;">
                    <strong>Municipality:</strong>
                    ${municipality}
                    <br><br>
            `;

            if (municipalityData.commodities && Array.isArray(municipalityData.commodities)) {
                municipalityData.commodities.forEach(item => {
                    popupContent += `
                        <strong>Commodity:</strong>
                        ${item.commodity}
                        <br>
                        <strong>Status:</strong>
                        ${item.status}
                        <br><br>
                    `;
                });
            }

            popupContent += `</div>`;

            L.marker(coordinates)
                .addTo(mapInstance)
                .bindPopup(popupContent);
        });

    } catch (error) {
        console.error("Failed to load AEW municipality map data:", error);
    }
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
        tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center;">Loading farmers...</td></tr>`;
    }

    try {
        const data = await apiRequest(FARMERS_ENDPOINT, { method: "GET" });
        allFarmers = data;

        if (!Array.isArray(data)) {
            throw new Error("Invalid farmers response.");
        }

        FARMERS_DATA = data.map(normalizeFarmer);
        currentFarmersPage = 1;
        renderFarmersTable();
        return FARMERS_DATA;
    } catch (error) {
        console.error("Unable to load farmers:", error);
        FARMERS_DATA = [];
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center; color:#C0392B;">Failed to load farmers.<br><small>${escapeHtml(error.message || "Please check the FastAPI server.")}</small></td></tr>`;
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
        tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center; color:#777;">No farmers found.</td></tr>`;
        updatePagination();
        return;
    }

    paginatedItems.forEach(function(farmer) {
        const tr = createFarmerTableRow(farmer);
        tbody.appendChild(tr);
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
                farmer.rsbsa_id,
                farmer.first_name,
                farmer.middle_name,
                farmer.last_name,
                farmer.suffix,
                farmer.address,
                farmer.email_address,
                farmer.phone_number,
                farmer.sex,
                farmer.birthdate,
                farmer.region,
                farmer.municipality,
                farmer.barangay,
                farmer.status
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
        tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center; color:#777;">No farmers found.</td></tr>`;
        updateSearchPaginationText(0);
        return;
    }

    data.forEach(function(farmer) {
        const tr = createFarmerTableRow(farmer);
        tbody.appendChild(tr);
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

    

    // ============================================================
    // ADD FARMER BUTTON
    // ============================================================
    if (addBtn) {
        addBtn.addEventListener("click", function() {
            console.log("Add Farmer button clicked");
            const regForm = document.getElementById("registerFarmerForm");
            if (regForm) regForm.reset();
            setValue("regFarmerId", "");
            if (listSubview) listSubview.classList.add("hidden-element");
            if (regSubview) regSubview.classList.remove("hidden-element");
        });
    }

    // ============================================================
    // CANCEL REGISTER BUTTON
    // ============================================================
    if (cancelRegBtn) {
        cancelRegBtn.addEventListener("click", function() {
            console.log("Cancel Register button clicked");
            const regForm = document.getElementById("registerFarmerForm");
            if (regForm) regForm.reset();
            if (listSubview) listSubview.classList.remove("hidden-element");
            if (regSubview) regSubview.classList.add("hidden-element");
        });
    }

    // ============================================================
    // BACK FROM MANAGE
    // ============================================================
    if (backManBtn) {
        backManBtn.addEventListener("click", function() {
            if (manSubview) manSubview.classList.add("hidden-element");
            if (listSubview) listSubview.classList.remove("hidden-element");
            currentActiveFarmer = null;
            isEditMode = false;
        });
    }

    // ============================================================
    // REGISTER FARMER
    // ============================================================
    const regForm = document.getElementById("registerFarmerForm");
    if (regForm) {
        console.log("Register Farmer Form found");

        regForm.addEventListener("submit", function(event) {
            event.preventDefault();
            event.stopPropagation();
            console.log("Form submitted!");

            // ========================================================
            // GET FORM VALUES
            // ========================================================
            const rsbsaId = document.getElementById("regFarmerId")?.value?.trim() || "";
            const municipality = document.getElementById("regMunicipality")?.value?.trim() || "";
            const barangay = document.getElementById("regBarangay")?.value?.trim() || "";
            const firstName = document.getElementById("regFirstName")?.value?.trim() || "";
            const middleName = document.getElementById("regMiddleName")?.value?.trim() || "";
            const lastName = document.getElementById("regLastName")?.value?.trim() || "";
            const suffix = document.getElementById("regSuffix")?.value?.trim() || "";
            const sex = document.getElementById("regSex")?.value || "";
            const birthdate = document.getElementById("regBirthdate")?.value || "";
            const phone = document.getElementById("regPhone")?.value?.trim() || "";
            const email = document.getElementById("regEmail")?.value?.trim() || "";

            // ========================================================
            // BASIC VALIDATION
            // ========================================================
            if (!rsbsaId || !municipality || !barangay || !firstName || !lastName || !sex || !birthdate || !phone || !email) {
                alert("Please complete all required fields.");
                return;
            }

            // ========================================================
            // CREATE FARMER DATA
            // ========================================================
            const farmerData = {
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

            console.log("Farmer data:", farmerData);

            // ========================================================
            // STORE PENDING FARMER
            // ========================================================
            window._pendingFarmer = farmerData;

            // ========================================================
            // SHOW CONFIRMATION MODAL
            // ========================================================
            const confirmText = document.getElementById("confirmFarmerText");
            if (confirmText) {
                confirmText.textContent = "Register " + firstName + " " + lastName + " from " + barangay + ", " + municipality + "?";
            }

            const modal = document.getElementById("confirmFarmerModal");
            if (modal) {
                modal.classList.add("show");
                console.log("Confirmation modal shown.");
            } else {
                console.error("ERROR: confirmFarmerModal was not found.");
                alert("Confirmation window could not be opened.");
            }
        });
        console.log("Submit handler attached to form.");
    } else {
        console.error("ERROR: registerFarmerForm was not found.");
    }


    // ============================================================
    // CONFIRM SAVE FARMER
    // ============================================================
    const confirmSaveBtn = document.getElementById(
        "confirmSaveFarmerBtn"
    );
    if (confirmSaveBtn) {
        confirmSaveBtn.addEventListener(
            "click",
            async function() {
                const farmerData = window._pendingFarmer;
                // ====================================================
                // CHECK DATA
                // ====================================================
                if (!farmerData) {
                    alert(
                        "No farmer data to save."
                    );
                    return;
                }
                console.log(
                    "Saving farmer:",
                    farmerData
                );
                // Disable button while saving
                this.disabled = true;
                this.textContent = "Saving...";
                try {
                    // ================================================
                    // GET AUTH TOKEN
                    // ================================================
                    const token = getAuthToken();
                    console.log(
                        "Authentication token:",
                        token ? "Present" : "Missing"
                    );
                    // ================================================
                    // SEND POST REQUEST
                    // ================================================
                    const response = await fetch(
                        FARMERS_ENDPOINT,
                        {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": token
                                    ? `Bearer ${token}`
                                    : ""
                            },
                            body: JSON.stringify(
                                farmerData
                            )
                        }
                    );
                    console.log(
                        "POST response status:",
                        response.status
                    );
                    // ================================================
                    // HANDLE ERROR
                    // ================================================
                    if (!response.ok) {
                        let errorData = null;
                        try {
                            errorData =
                                await response.json();
                        } catch (e) {
                            console.error(
                                "Could not read error response."
                            );
                        }
                        let errorMessage =
                            "Failed to add farmer.";
                        if (
                            errorData &&
                            errorData.detail
                        ) {
                            errorMessage =
                                typeof errorData.detail === "string"
                                    ? errorData.detail
                                    : JSON.stringify(
                                        errorData.detail
                                    );
                        }
                        throw new Error(
                            errorMessage
                        );
                    }
                    // ================================================
                    // SUCCESS
                    // ================================================
                    const result =
                        await response.json();
                    console.log(
                        "Farmer created successfully:",
                        result
                    );
                    // Close confirmation modal
                    document
                        .getElementById(
                            "confirmFarmerModal"
                        )
                        ?.classList.remove("show");
                    // Refresh farmer table
                    await fetchFarmers();
                    // Show success modal
                    document
                        .getElementById(
                            "farmerAddedModal"
                        )
                        ?.classList.add("show");
                    // Reset form
                    const form =
                        document.getElementById(
                            "registerFarmerForm"
                        );
                    if (form) {
                        form.reset();
                    }
                    // Clear pending farmer
                    window._pendingFarmer = null;
                } catch (error) {
                    console.error(
                        "Error adding farmer:",
                        error
                    );
                    document
                        .getElementById(
                            "confirmFarmerModal"
                        )
                        ?.classList.remove("show");
                    alert(
                        "Failed to add farmer.\n\n" +
                        (error.message ||
                            "Check FastAPI server.")
                    );
                } finally {
                    // Restore button
                    this.disabled = false;
                    this.textContent =
                        "Confirm & Save";
                }
            }
        );
    } else {
        console.error(
            "ERROR: confirmSaveFarmerBtn was not found."
        );
    }

    // CLOSE FARMER ADDED MODAL
    const closeFarmerAddedBtn = document.getElementById("closeFarmerAddedBtn");
    if (closeFarmerAddedBtn) {
        closeFarmerAddedBtn.addEventListener("click", function() {
            document.getElementById("farmerAddedModal")?.classList.remove("show");
            if (regSubview) regSubview.classList.add("hidden-element");
            if (listSubview) listSubview.classList.remove("hidden-element");
        });
    }

    // REVIEW FARMER BUTTON
    const reviewFarmerBtn = document.getElementById("reviewFarmerBtn");
    if (reviewFarmerBtn) {
        reviewFarmerBtn.addEventListener("click", function() {
            document.getElementById("confirmFarmerModal")?.classList.remove("show");
        });
    }

    // ============================================================
    // EDIT / SAVE FARMER
    // ============================================================
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

            const confirmSave = confirm("Are you sure you want to save these changes?\n\nFarmer: " + getFarmerFullName(currentActiveFarmer));
            if (!confirmSave) return;

            const email = getValue("manEmail");
            if (!email) {
                alert("Please enter an email address.");
                return;
            }

            const updateData = {
                address: getValue("manAddress"),
                phone_number: getValue("manPhone"),
                email_address: getValue("manEmail")
            };

            try {
                const farmerId = currentActiveFarmer.farmer_id;

                await apiRequest(FARMERS_ENDPOINT + farmerId, {
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

    // ============================================================
    // DELETE FARMER
    // ============================================================
    const deleteBtn = document.getElementById("deleteFarmerBtn");
    if (deleteBtn) {
        deleteBtn.addEventListener("click", function() {
            if (!currentActiveFarmer) {
                alert("No farmer selected.");
                return;
            }
            document.getElementById("deleteFarmerModal")?.classList.add("show");
        });
    }

    // ============================================================
    // CONFIRM DELETE
    // ============================================================
    const confirmDeleteBtn = document.getElementById("confirmDeleteFarmerBtn");
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener("click", async function() {
            if (!currentActiveFarmer) return;

            // Disable button to prevent double-click
            this.disabled = true;
            this.textContent = "Deleting...";

            try {
                const farmerId = currentActiveFarmer.farmer_id;

                await apiRequest(FARMERS_ENDPOINT + farmerId, {
                    method: "DELETE"
                });

                document.getElementById("deleteFarmerModal")?.classList.remove("show");
                currentActiveFarmer = null;
                await fetchFarmers();

                const manSubview = document.getElementById("manageFarmerSubview");
                const listSubview = document.getElementById("farmersListSubview");
                if (manSubview) manSubview.classList.add("hidden-element");
                if (listSubview) listSubview.classList.remove("hidden-element");

                alert("Farmer deleted successfully.");

            } catch (error) {
                console.error("Delete farmer error:", error);
                document.getElementById("deleteFarmerModal")?.classList.remove("show");
                
                const errorModal = document.getElementById("deleteErrorModal");
                const errorText = errorModal?.querySelector("p");
                if (errorText) {
                    if (error.message && error.message.includes("existing records")) {
                        errorText.textContent = "This farmer has existing planting intents or offtake requests. Please delete those first, then try again.";
                    } else {
                        errorText.textContent = error.message || "The farmer could not be deleted. Please try again.";
                    }
                }
                errorModal?.classList.add("show");
                
            } finally {
                this.disabled = false;
                this.textContent = "Delete";
            }
        });
    }


    // ============================================================
    // CLOSE DELETE ERROR MODAL
    // ============================================================
    document.getElementById("closeDeleteErrorBtn")?.addEventListener("click", function() {
        document.getElementById("deleteErrorModal")?.classList.remove("show");
    });

    document.getElementById("deleteErrorModal")?.addEventListener("click", function(event) {
        if (event.target === this) {
            this.classList.remove("show");
        }
    });

    // ============================================================
    // CANCEL DELETE
    // ============================================================
    document.getElementById("cancelDeleteFarmerBtn")?.addEventListener("click", function() {
        document.getElementById("deleteFarmerModal")?.classList.remove("show");
    });

    document.getElementById("deleteFarmerModal")?.addEventListener("click", function(event) {
        if (event.target === this) {
            this.classList.remove("show");
        }
    });

    // ============================================================
    // PAGINATION
    // ============================================================
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

/* ============================================================
   CANCEL FARMER EDIT
============================================================ */

function cancelFarmerEdit() {
    const farmer = currentActiveFarmer;
    if (!farmer) return;

    if (!confirm("Are you sure you want to cancel editing?\n\nYour changes will be discarded.")) return;

    setValue("manAddress", farmer.address || "");
    setValue("manPhone", farmer.phone_number || "");
    setValue("manEmail", farmer.email_address || "");

    const editableInputs = document.querySelectorAll(".man-editable");
    editableInputs.forEach(function(input) {
        input.readOnly = true;
        input.classList.remove("input-editable-active");
        input.classList.add("input-readonly");
    });

    isEditMode = false;

    const toggleBtn = document.getElementById("toggleEditFarmerBtn");
    if (toggleBtn) toggleBtn.textContent = "Edit Contact Info";

    const backBtn = document.getElementById("backFromManageFarmerBtn");
    if (backBtn) backBtn.style.display = "inline-flex";

    const deleteBtn = document.getElementById("deleteFarmerBtn");
    if (deleteBtn) deleteBtn.style.display = "inline-flex";

    const cancelBtn = document.getElementById("cancelEditFarmerBtn");
    if (cancelBtn) cancelBtn.style.display = "none";

    console.log("Farmer edit cancelled.");
}

/* ============================================================
   OPEN MANAGE FARMER
============================================================ */

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

    const backBtn = document.getElementById("backFromManageFarmerBtn");
    if (backBtn) backBtn.style.display = "inline-flex";

    const deleteBtn = document.getElementById("deleteFarmerBtn");
    if (deleteBtn) deleteBtn.style.display = "inline-flex";

    const cancelBtn = document.getElementById("cancelEditFarmerBtn");
    if (cancelBtn) cancelBtn.style.display = "none";

    document.getElementById("farmersListSubview")?.classList.add("hidden-element");
    document.getElementById("manageFarmerSubview")?.classList.remove("hidden-element");
}

/* ============================================================
   PLANTING INTENT
============================================================ */

/* ============================================================
   INITIALIZE PLANTING INTENT
============================================================ */

function initPlantingIntent() {
    const list = document.getElementById("plantingIntentListSubview");
    const formSubview = document.getElementById("submitPlantIntentSubview");
    const modal = document.getElementById("plantIntentSubmittedModal");

    initPlantingIntentTabs();
    fetchPlantingIntents();

    // ADD BUTTON
    document.getElementById("addPlantIntentBtn")?.addEventListener("click", function() {
        const form = document.getElementById("submitPlantIntentForm");
        if (form) form.reset();
        if (list) list.classList.add("hidden-element");
        if (formSubview) formSubview.classList.remove("hidden-element");
    });

    // CANCEL BUTTON
    document.getElementById("cancelPlantIntentBtn")?.addEventListener("click", function() {
        const form = document.getElementById("submitPlantIntentForm");
        if (form) form.reset();
        if (formSubview) formSubview.classList.add("hidden-element");
        if (list) list.classList.remove("hidden-element");
    });

    // BACK FROM DETAILS
    document.getElementById("backFromPlantingIntentDetailsBtn")?.addEventListener("click", function() {
        window.isEditingPlantingIntent = false;

        const cancelBtn = document.getElementById("cancelEditPlantingIntentBtn");
        if (cancelBtn) cancelBtn.remove();

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

        const backBtn = document.getElementById("backFromPlantingIntentDetailsBtn");
        if (backBtn) backBtn.style.display = "inline-flex";

        const details = document.getElementById("plantingIntentDetailsSubview");
        if (details) details.classList.add("hidden-element");
        if (list) list.classList.remove("hidden-element");

        window.currentSelectedPlantingIntent = null;
        fetchPlantingIntents();
    });

    // SUBMIT PLANTING INTENT FORM
    document.getElementById("submitPlantIntentForm")?.addEventListener("submit", async function(event) {
        event.preventDefault();
        await submitPlantingIntent();
    });

    // CLOSE SUCCESS MODAL
    document.getElementById("closePlantIntentSubmittedBtn")?.addEventListener("click", function() {
        if (modal) modal.classList.remove("show");
        if (formSubview) formSubview.classList.add("hidden-element");
        if (list) list.classList.remove("hidden-element");
        fetchPlantingIntents();
    });
}

// ============================================================
// SUBMIT PLANTING INTENT STATUS
// ============================================================

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

    if (!confirm(
        "Are you sure you want to submit this planting intent?"
    )) {
        return;
    }

    const submitBtn =
        document.getElementById("submitPlantingIntentBtn");

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = "Submitting...";
        }

        const url =
            PLANTING_INTENTS_ENDPOINT +
            intentId +
            "/submit";

        console.log("Submitting planting intent:", url);

        const result = await apiRequest(url, {
            method: "POST"
        });

        console.log("Submit response:", result);

        // Update current intent
        intent.status = "SUBMITTED";
        intent.updated_at = new Date().toISOString();

        // Update main data array
        const index = PLANTING_INTENTS_DATA.findIndex(function(item) {
            return String(item.planting_intent_id) === String(intentId);
        });

        if (index !== -1) {
            PLANTING_INTENTS_DATA[index].status = "SUBMITTED";
            PLANTING_INTENTS_DATA[index].updated_at = intent.updated_at;
        }

        // Reset filtered data
        filteredPlantingIntents = null;

        // Refresh planting intent tables
        renderPlantingIntentsTable();

        // Keep updated intent selected
        window.currentSelectedPlantingIntent = intent;

        // Refresh details view
        openPlantingIntentDetails(intent);

        alert("Planting intent submitted successfully.");

    } catch (error) {
        console.error("Submit planting intent error:", error);

        alert(
            "Failed to submit planting intent.\n\n" +
            (error.message || "Please try again.")
        );

    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
        }
    }
}

// ============================================================
// DELETE PLANTING INTENT (DRAFT ONLY)
// ============================================================

async function deletePlantingIntent(intent) {
    if (!intent) {
        alert("No planting intent selected.");
        return;
    }

    const status = (intent.status || "DRAFT").toUpperCase();

    if (status !== "DRAFT") {
        alert("Only Draft planting intents can be deleted.");
        return;
    }

    if (!confirm(
        `Are you sure you want to permanently delete this planting intent for "${intent.commodity}"?\n\nThis action cannot be undone.`
    )) {
        return;
    }

    try {
        const url =
            PLANTING_INTENTS_ENDPOINT +
            intent.planting_intent_id;

        console.log("Deleting planting intent:", url);

        await apiRequest(url, {
            method: "DELETE"
        });

        // Remove locally
        PLANTING_INTENTS_DATA =
            PLANTING_INTENTS_DATA.filter(function(item) {
                return String(item.planting_intent_id) !==
                       String(intent.planting_intent_id);
            });

        filteredPlantingIntents = null;

        renderPlantingIntentsTable();

        const list =
            document.getElementById("plantingIntentListSubview");

        const details =
            document.getElementById("plantingIntentDetailsSubview");

        if (list) {
            list.classList.remove("hidden-element");
        }

        if (details) {
            details.classList.add("hidden-element");
        }

        window.currentSelectedPlantingIntent = null;

        alert("Planting intent deleted successfully.");

    } catch (error) {
        console.error("Delete planting intent error:", error);

        alert(
            "Failed to delete planting intent.\n\n" +
            (error.message || "Please try again.")
        );
    }
}

// ============================================================
// PULL PLANTING INTENT BACK TO DRAFT
// ============================================================

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

    if (!confirm(
        "Are you sure you want to revert this planting intent to DRAFT?"
    )) {
        return;
    }

    try {
        const url =
            PLANTING_INTENTS_ENDPOINT +
            intentId +
            "/pull";

        console.log("Reverting planting intent to Draft:", url);

        const result = await apiRequest(url, {
            method: "POST"
        });

        console.log("Pull response:", result);

        // Update local object
        intent.status = "DRAFT";
        intent.updated_at = new Date().toISOString();

        // Update main data array
        const index = PLANTING_INTENTS_DATA.findIndex(function(item) {
            return String(item.planting_intent_id) === String(intentId);
        });

        if (index !== -1) {
            PLANTING_INTENTS_DATA[index].status = "DRAFT";
            PLANTING_INTENTS_DATA[index].updated_at = intent.updated_at;
        }

        // Clear filtered data so the table rebuilds from the main data
        filteredPlantingIntents = null;

        // Refresh planting intent table
        renderPlantingIntentsTable();

        // Update current details
        window.currentSelectedPlantingIntent = intent;

        // Re-open details so buttons reflect DRAFT status
        openPlantingIntentDetails(intent);

        alert("Planting intent reverted to DRAFT successfully.");

    } catch (error) {
        console.error("Pull planting intent error:", error);

        alert(
            "Failed to revert planting intent to DRAFT.\n\n" +
            (error.message || "Please try again.")
        );
    }
}

/* ============================================================
   INIT PLANTING INTENT SUB-TABS
============================================================ */

function initPlantingIntentTabs() {
    const tabButtons = document.querySelectorAll('.sub-tab-btn');
    const draftContainer = document.getElementById('draftIntentsContainer');
    const submittedContainer = document.getElementById('submittedIntentsContainer');

    if (!tabButtons.length) return;

    // Set initial state
    if (draftContainer) draftContainer.style.display = 'block';
    if (submittedContainer) submittedContainer.style.display = 'none';

    tabButtons.forEach(function(button) {
        button.addEventListener('click', function() {
            const tab = this.dataset.tab;

            // Update active tab
            tabButtons.forEach(function(btn) {
                btn.classList.remove('active');
                btn.style.borderBottom = 'none';
                btn.style.color = 'var(--muted)';
            });
            this.classList.add('active');
            this.style.borderBottom = '3px solid var(--green)';
            this.style.color = 'var(--green)';

            // Show/hide containers
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


/* ============================================================
   NORMALIZE PLANTING INTENT
============================================================ */

function normalizePlantingIntent(intent) {
    return {
        planting_intent_id: intent.planting_intent_id || intent.id || null,
        farmer_id: intent.farmer_id || null,
        farmer_name: intent.farmer_name || intent.name || "-",
        commodity: intent.commodity || intent.crop || "-",
        volume: intent.volume || intent.planned_volume || intent.quantity || "",
        location: intent.location || intent.municipality || intent.barangay || "-",
        planting_date: intent.planting_date || "",
        harvest_date: intent.harvest_date || intent.expected_harvest_date || "",
        remarks: intent.remarks || "",
        status: intent.status || intent.report_status || "Pending",
        created_at: intent.created_at || null,
        updated_at: intent.updated_at || null,
        revision_count: intent.revision_count || 0,
        report_id: intent.report_id || null
    };
}

/* ============================================================
   SEARCH PLANTING INTENTS
============================================================ */

function initializePlantingIntentSearch() {
    const searchInput = document.getElementById("searchPlantingIntentsInput");
    if (!searchInput) return;

    function performSearch() {
        const keyword = searchInput.value.toLowerCase().trim();

        if (!keyword) {
            // ✅ Reset to show all data
            filteredPlantingIntents = null;
            currentDraftIntentsPage = 1;
            currentSubmittedIntentsPage = 1;
            renderPlantingIntentsTable();
            return;
        }

        const searchWords = keyword.split(/\s+/).filter(Boolean);

        filteredPlantingIntents = PLANTING_INTENTS_DATA.filter(function(intent) {
            const searchableText = [
                intent.farmer_name || '',
                intent.commodity || '',
                intent.location || '',
                intent.remarks || '',
                intent.status || '',
                String(intent.volume || ''),
                intent.planting_date || '',
                intent.harvest_date || ''
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



/* ============================================================
   FETCH PLANTING INTENTS
============================================================ */

async function fetchPlantingIntents() {
    const tbody = document.getElementById('draftIntentsTableBody');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="7" style="padding:30px; text-align:center;">Loading planting intents...</td></tr>`;
    }

    try {
        console.log("📡 Fetching planting intents from:", PLANTING_INTENTS_ENDPOINT);
        
        const data = await apiRequest(PLANTING_INTENTS_ENDPOINT, { method: "GET" });
        console.log("📡 API Response:", data);

        if (data && data.data && Array.isArray(data.data)) {
            PLANTING_INTENTS_DATA = data.data.map(normalizePlantingIntent);
            console.log("Loaded " + PLANTING_INTENTS_DATA.length + " planting intents from paginated response");
        } 
        else if (Array.isArray(data)) {
            PLANTING_INTENTS_DATA = data.map(normalizePlantingIntent);
            console.log("Loaded " + PLANTING_INTENTS_DATA.length + " planting intents from array response");
        } 
        else {
            console.error("Unexpected response format:", data);
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
                    <td colspan="7" style="padding:30px; text-align:center; color:#C0392B;">
                        <div style="font-size:24px; margin-bottom:8px;">❌</div>
                        <strong>Failed to load planting intents.</strong>
                        <br>
                        <small>${escapeHtml(error.message || "Please check the FastAPI server.")}</small>
                        <br><br>
                        <button onclick="fetchPlantingIntents()" style="
                            padding: 8px 20px; 
                            background: #2E7D32; 
                            color: #fff; 
                            border: none; 
                            border-radius: 6px; 
                            cursor: pointer; 
                            font-weight: 600;
                        ">
                            🔄 Retry
                        </button>
                    </td>
                </tr>
            `;
        }
        
        handleAuthError(error);
        return [];
    }
}



// ============================================================
// RENDER PLANTING INTENTS TABLE
// ============================================================

function renderPlantingIntentsTable() {
    const draftTbody = document.getElementById('draftIntentsTableBody');
    const submittedTbody = document.getElementById('submittedIntentsTableBody');

    if (!draftTbody || !submittedTbody) {
        console.warn('Planting intent table bodies not found.');
        return;
    }

    // Clear tables
    draftTbody.innerHTML = '';
    submittedTbody.innerHTML = '';

    const dataSource = (filteredPlantingIntents !== null && filteredPlantingIntents.length >= 0) 
        ? filteredPlantingIntents 
        : PLANTING_INTENTS_DATA;

    console.log("Rendering with data source:", dataSource.length, "intents");

    // Filter draft intents
    const draftIntents = dataSource.filter(function(intent) {
        const status = (intent.status || 'Pending').toLowerCase();
        return status === 'draft' || status === 'pending';
    });

    // Filter submitted intents
    const submittedIntents = dataSource.filter(function(intent) {
        const status = (intent.status || '').toLowerCase();
        return status === 'submitted' || 
               status === 'for_municipal_validation' || 
               status === 'for_provincial_validation' || 
               status === 'for_da_rfo_validation' ||
               status === 'revision_required' ||
               status === 'final_approved';
    });

    // Update counters
    const draftCount = document.getElementById('draftCount');
    const submittedCount = document.getElementById('submittedCount');
    if (draftCount) draftCount.textContent = draftIntents.length;
    if (submittedCount) submittedCount.textContent = submittedIntents.length;

    // ============================================================
    // RENDER DRAFT INTENTS
    // ============================================================
    if (draftIntents.length === 0) {
        draftTbody.innerHTML = `
            <tr>
                <td colspan="8" style="padding:40px; text-align:center; color:#999;">
                    ${filteredPlantingIntents !== null ? 'No Draft Intents match your search.' : 'No Draft Intents found.'}
                    ${filteredPlantingIntents !== null ? '<br><small>Try adjusting your search terms.</small>' : '<br>Click "Add Plant Intent" to create your first planting plan.'}
                </td>
            </tr>
        `;
    } else {
        const draftStart = (currentDraftIntentsPage - 1) * plantingIntentsPerPage;
        const paginatedDraftIntents = draftIntents.slice(draftStart, draftStart + plantingIntentsPerPage);

        paginatedDraftIntents.forEach(function(intent) {
            const tr = createPlantingIntentRow(intent, 'draft');
            draftTbody.appendChild(tr);
        });
    }

    // ============================================================
    // RENDER SUBMITTED INTENTS
    // ============================================================
    if (submittedIntents.length === 0) {
        submittedTbody.innerHTML = `
            <tr>
                <td colspan="8" style="padding:40px; text-align:center; color:#999;">
                    ${filteredPlantingIntents !== null ? 'No Submitted Intents match your search.' : 'No Submitted Intents found.'}
                    ${filteredPlantingIntents !== null ? '<br><small>Try adjusting your search terms.</small>' : '<br>Submit a draft intent to see it here.'}
                </td>
            </tr>
        `;
    } else {
        const submittedStart = (currentSubmittedIntentsPage - 1) * plantingIntentsPerPage;
        const paginatedSubmittedIntents = submittedIntents.slice(submittedStart, submittedStart + plantingIntentsPerPage);

        paginatedSubmittedIntents.forEach(function(intent) {
            const tr = createPlantingIntentRow(intent, 'submitted');
            submittedTbody.appendChild(tr);
        });
    }

    // ============================================================
    // RENDER PAGINATION
    // ============================================================
    renderPagination(draftIntents.length, "draft");
    renderPagination(submittedIntents.length, "submitted");
}



// ============================================================
// SIMPLE PAGINATION - ayaw gumana letche
// ============================================================

function renderPagination(totalCount, type) {
    // If no items or less than per page, remove pagination and return
    if (totalCount <= plantingIntentsPerPage) {
        const containerId = type === "draft" ? "draftIntentsContainer" : "submittedIntentsContainer";
        const container = document.getElementById(containerId);
        if (container) {
            const existing = container.querySelector(".planting-intent-pagination");
            if (existing) existing.remove();
        }
        return;
    }

    const containerId = type === "draft" ? "draftIntentsContainer" : "submittedIntentsContainer";
    const container = document.getElementById(containerId);
    if (!container) return;

    const card = container.querySelector(".card");
    if (!card) return;

    // Remove existing pagination
    const existing = card.querySelector(".planting-intent-pagination");
    if (existing) existing.remove();

    // Get current page
    let currentPage = type === "draft" ? currentDraftIntentsPage : currentSubmittedIntentsPage;
    const totalPages = Math.ceil(totalCount / plantingIntentsPerPage);
    
    if (currentPage > totalPages) {
        currentPage = totalPages;
        if (type === "draft") {
            currentDraftIntentsPage = currentPage;
        } else {
            currentSubmittedIntentsPage = currentPage;
        }
    }

    const startItem = (currentPage - 1) * plantingIntentsPerPage + 1;
    const endItem = Math.min(currentPage * plantingIntentsPerPage, totalCount);

    let html = `
        <div class="pagination-container planting-intent-pagination" style="margin-top: 18px; padding-top: 14px; border-top: 1px solid #DFD8C6;">
            <span class="pagination-info" style="font-size: 12.5px; color: #625E52;">
                Showing ${startItem}-${endItem} of ${totalCount} planting intents
            </span>
            <div class="pagination-controls">
                <button class="btn-page prev-pg-btn" type="button" ${currentPage <= 1 ? 'disabled' : ''}>
                    &laquo; Prev
                </button>
    `;

    // Generate page buttons (show max 5)
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    
    if (endPage - startPage < 4) {
        startPage = Math.max(1, endPage - 4);
    }

    if (startPage > 1) {
        html += `<button class="btn-page pg-btn" data-page="1">1</button>`;
        if (startPage > 2) {
            html += `<span style="padding: 0 4px; color: #777;">...</span>`;
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="btn-page pg-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            html += `<span style="padding: 0 4px; color: #777;">...</span>`;
        }
        html += `<button class="btn-page pg-btn" data-page="${totalPages}">${totalPages}</button>`;
    }

    html += `
                <button class="btn-page next-pg-btn" type="button" ${currentPage >= totalPages ? 'disabled' : ''}>
                    Next &raquo;
                </button>
            </div>
        </div>
    `;

    card.insertAdjacentHTML('beforeend', html);

    // ATTACH EVENT LISTENERS
    const paginationDiv = card.querySelector(".planting-intent-pagination");
    if (!paginationDiv) return;

    paginationDiv.querySelectorAll(".pg-btn").forEach(function(btn) {
        btn.addEventListener("click", function() {
            const page = parseInt(this.dataset.page);
            if (type === "draft") {
                currentDraftIntentsPage = page;
            } else {
                currentSubmittedIntentsPage = page;
            }
            renderPlantingIntentsTable();
        });
    });

    const prevBtn = paginationDiv.querySelector(".prev-pg-btn");
    if (prevBtn) {
        prevBtn.addEventListener("click", function() {
            if (type === "draft") {
                if (currentDraftIntentsPage > 1) currentDraftIntentsPage--;
            } else {
                if (currentSubmittedIntentsPage > 1) currentSubmittedIntentsPage--;
            }
            renderPlantingIntentsTable();
        });
    }

    const nextBtn = paginationDiv.querySelector(".next-pg-btn");
    if (nextBtn) {
        nextBtn.addEventListener("click", function() {
            if (type === "draft") {
                if (currentDraftIntentsPage < totalPages) currentDraftIntentsPage++;
            } else {
                if (currentSubmittedIntentsPage < totalPages) currentSubmittedIntentsPage++;
            }
            renderPlantingIntentsTable();
        });
    }
}



/* ============================================================
   CREATE PLANTING INTENT ROW
============================================================ */

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
            statusText = 'Draft';
            statusClass = 'draft';
        } else if (statusLower === 'submitted' || 
                   statusLower === 'for_municipal_validation' || 
                   statusLower === 'for_provincial_validation' || 
                   statusLower === 'for_da_rfo_validation') {
            statusText = 'Submitted';
            statusClass = 'submitted';
        } else if (statusLower === 'revision_required') {
            statusText = 'Revision Required';
            statusClass = 'revision';
        } else if (statusLower === 'final_approved') {
            statusText = 'Approved';
            statusClass = 'approved';
        } else {
            statusText = status;
            statusClass = 'pending';
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
        <td class="center-col">
            <span class="status-pill ${statusClass}">${escapeHtml(statusText)}</span>
        </td>
    `;

    tr.addEventListener('click', function(e) {
        openPlantingIntentDetails(intent);
    });

    return tr;
}



/* ============================================================
   OPEN PLANTING INTENT DETAILS
============================================================ */

function openPlantingIntentDetails(intent) {
    console.log("Opening details for:", intent);

    const list = document.getElementById("plantingIntentListSubview");
    const details = document.getElementById("plantingIntentDetailsSubview");

    if (!details) {
        console.warn("plantingIntentDetailsSubview not found.");
        return;
    }

    window.currentSelectedPlantingIntent = intent;

    if (list) list.classList.add("hidden-element");
    details.classList.remove("hidden-element");

    // Populate details
    setValue("detailPlantingIntentId", intent.planting_intent_id || "");
    setValue("detailFarmerName", intent.farmer_name || "");
    setValue("detailFarmerId", intent.farmer_id || "");
    setValue("detailCommodity", intent.commodity || "");
    setValue("detailVolume", formatPlantingVolume(intent.volume));
    setValue("detailLocation", intent.location || "");
    setValue("detailPlantingDate", formatPlantingDate(intent.planting_date));
    setValue("detailHarvestDate", formatPlantingDate(intent.harvest_date));
    setValue("detailRemarks", intent.remarks || "");

    // Revision info
    const revisionInfo = document.getElementById("detailRevisionInfo");
    if (revisionInfo) {
        if (intent.revision_count !== undefined && intent.revision_count > 0) {
            revisionInfo.textContent = "Revision #" + intent.revision_count + " | Last updated: " + formatPlantingDate(intent.updated_at || intent.created_at);
            revisionInfo.style.display = "block";
        } else {
            revisionInfo.style.display = "none";
        }
    }

    // Reset Edit Mode
    window.isEditingPlantingIntent = false;

    const detailInputs = details.querySelectorAll("input, textarea");
    detailInputs.forEach(function(input) {
        input.readOnly = true;
        input.classList.add("input-readonly");
        input.classList.remove("input-editable-active");
    });

    // Get button references
    const editBtn = document.getElementById("editPlantingIntentBtn");
    const submitBtn = document.getElementById("submitPlantingIntentBtn");
    const backBtn = document.getElementById("backFromPlantingIntentDetailsBtn");
    const deleteBtn = document.getElementById("deletePlantingIntentBtn");

    if (backBtn) backBtn.style.display = "inline-flex";

    // ✅ Check status
    const status = (intent.status || "DRAFT").toUpperCase();
    const isDraft = status === "DRAFT";
    const isSubmitted = status === "SUBMITTED";

    console.log("Status:", status, "| Draft:", isDraft, "| Submitted:", isSubmitted);

    if (isDraft) {
        // ✅ DRAFT - Show Edit, Delete, and Submit buttons
        if (editBtn) {
            editBtn.style.display = "inline-flex";
            editBtn.textContent = "Edit Details";
            editBtn.style.background = "#D97706";
            editBtn.style.cursor = "pointer";
            editBtn.disabled = false;
            editBtn.onclick = function() {
                togglePlantingIntentEditMode();
            };
        }
        
        if (deleteBtn) {
            deleteBtn.style.display = "inline-flex";
            deleteBtn.textContent = "Delete";
            deleteBtn.style.background = "#C0392B";
            deleteBtn.style.cursor = "pointer";
            deleteBtn.disabled = false;
            deleteBtn.onclick = function() {
                deletePlantingIntent(intent);
            };
        }
        
        if (submitBtn) {
            submitBtn.textContent = "Submit Intent";
            submitBtn.style.display = "inline-flex";
            submitBtn.style.background = "#2E7D32";
            submitBtn.style.color = "#fff";
            submitBtn.disabled = false;
            submitBtn.title = "Submit this intent (status will change to SUBMITTED)";
            submitBtn.onclick = function() {
                submitPlantingIntentStatus(intent);
            };
        }
        
    } else if (isSubmitted) {
        // ✅ SUBMITTED - Hide Edit and Delete, show Pull button
        if (editBtn) {
            editBtn.style.display = "none";
            editBtn.disabled = true;
        }
        
        if (deleteBtn) {
            deleteBtn.style.display = "none";
            deleteBtn.disabled = true;
        }
        
        if (submitBtn) {
            submitBtn.textContent = "Revert to Draft";
            submitBtn.style.display = "inline-flex";
            submitBtn.style.background = "#D97706";
            submitBtn.style.color = "#fff";
            submitBtn.disabled = false;
            submitBtn.title = "Pull back this submission to DRAFT";
            submitBtn.onclick = function() {
                pullPlantingIntent(intent);
            };
        }
    }

    // Remove Cancel button if exists
    var cancelBtn = document.getElementById("cancelEditPlantingIntentBtn");
    if (cancelBtn) cancelBtn.remove();
}

// ============================================================
// TOGGLE PLANTING INTENT EDIT MODE
// ============================================================

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
    const detailInputs = details.querySelectorAll("input, textarea");

    const existingCancel = document.getElementById("cancelEditPlantingIntentBtn");
    if (existingCancel) existingCancel.remove();

    if (!window.isEditingPlantingIntent) {
        // ============================================================
        // ENTER EDIT MODE
        // ============================================================
        window.isEditingPlantingIntent = true;

        // Enable all editable inputs
        detailInputs.forEach(function(input) {
            const id = input.id;
            // Keep these fields read-only
            if (id === "detailPlantingIntentId" || id === "detailFarmerId" || id === "detailFarmerName") {
                return;
            }
            input.readOnly = false;
            input.classList.remove("input-readonly");
            input.classList.add("input-editable-active");
            input.style.border = "1.5px solid #D97706";
            input.style.background = "#FFFDF7";
        });

        // Update button states
        if (editBtn) {
            editBtn.textContent = "Save Changes";
            editBtn.style.background = "#2E7D32";
            editBtn.style.display = "inline-flex";
        }

        if (submitBtn) {
            submitBtn.style.display = "none";
        }

        if (backBtn) {
            backBtn.style.display = "none";
        }

        // Create Cancel button
        const cancelBtn = document.createElement("button");
        cancelBtn.id = "cancelEditPlantingIntentBtn";
        cancelBtn.className = "btn-outline-report";
        cancelBtn.textContent = "Cancel";
        cancelBtn.style.marginRight = "8px";
        editBtn.parentNode.insertBefore(cancelBtn, editBtn);

        cancelBtn.addEventListener("click", function() {
            cancelPlantingIntentEdit();
        });

        console.log("Entered edit mode.");

    } else {
        // ============================================================
        // EXIT EDIT MODE - Save Changes
        // ============================================================
        const confirmSave = confirm("Are you sure you want to save these changes?");
        if (!confirmSave) {
            // If user cancels, just exit without saving
            cancelPlantingIntentEdit();
            return;
        }
        savePlantingIntentChanges();
    }
}


// ============================================================
// CANCEL PLANTING INTENT EDIT
// ============================================================

function cancelPlantingIntentEdit() {
    const intent = window.currentSelectedPlantingIntent;
    if (!intent) {
        console.warn("No planting intent to cancel edit.");
        return;
    }

    const details = document.getElementById("plantingIntentDetailsSubview");
    if (!details) return;

    if (!confirm("Are you sure you want to cancel editing?\n\nYour changes will be discarded.")) {
        return;
    }

    // Restore original values
    setValue("detailPlantingIntentId", intent.planting_intent_id || "");
    setValue("detailFarmerName", intent.farmer_name || "");
    setValue("detailFarmerId", intent.farmer_id || "");
    setValue("detailCommodity", intent.commodity || "");
    setValue("detailVolume", formatPlantingVolume(intent.volume));
    setValue("detailLocation", intent.location || "");
    setValue("detailPlantingDate", formatPlantingDate(intent.planting_date));
    setValue("detailHarvestDate", formatPlantingDate(intent.harvest_date));
    setValue("detailRemarks", intent.remarks || "");

    // Reset input styles
    const detailInputs = details.querySelectorAll("input, textarea");
    detailInputs.forEach(function(input) {
        input.readOnly = true;
        input.classList.add("input-readonly");
        input.classList.remove("input-editable-active");
        input.style.border = "";
        input.style.background = "";
    });

    window.isEditingPlantingIntent = false;

    // Restore buttons
    const editBtn = document.getElementById("editPlantingIntentBtn");
    if (editBtn) {
        editBtn.textContent = "Edit Details";
        editBtn.style.background = "#D97706";
        editBtn.style.display = "inline-flex";
    }

    const submitBtn = document.getElementById("submitPlantingIntentBtn");
    if (submitBtn) {
        submitBtn.style.display = "inline-flex";
        // Check if it should show Submit or Pull
        const status = (intent.status || "DRAFT").toUpperCase();
        if (status === "SUBMITTED") {
            submitBtn.textContent = "Revert to Draft";
            submitBtn.style.background = "#D97706";
        } else {
            submitBtn.textContent = "Submit Intent";
            submitBtn.style.background = "#2E7D32";
        }
        submitBtn.disabled = false;
    }

    const backBtn = document.getElementById("backFromPlantingIntentDetailsBtn");
    if (backBtn) backBtn.style.display = "inline-flex";

    const cancelBtn = document.getElementById("cancelEditPlantingIntentBtn");
    if (cancelBtn) cancelBtn.remove();

    console.log("Planting intent edit cancelled.");
}

// ============================================================
// SAVE PLANTING INTENT CHANGES
// ============================================================

async function savePlantingIntentChanges() {
    const intent = window.currentSelectedPlantingIntent;
    if (!intent) {
        alert("No planting intent selected.");
        return;
    }

    function convertToAPIDate(dateString) {
        if (!dateString) return "";
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return dateString;
        const dateParts = dateString.split('/');
        if (dateParts.length === 3) {
            let month = dateParts[0].trim().padStart(2, '0');
            let day = dateParts[1].trim().padStart(2, '0');
            let year = dateParts[2].trim();
            return year + "-" + month + "-" + day;
        }
        const date = new Date(dateString);
        if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];
        }
        return dateString;
    }

    // Get current values from the form
    const rawCommodity = document.getElementById("detailCommodity")?.value || intent.commodity;
    const rawVolume = document.getElementById("detailVolume")?.value || intent.volume;
    const rawLocation = document.getElementById("detailLocation")?.value || intent.location;
    const rawPlantingDate = document.getElementById("detailPlantingDate")?.value || intent.planting_date;
    const rawHarvestDate = document.getElementById("detailHarvestDate")?.value || intent.harvest_date;
    const rawRemarks = document.getElementById("detailRemarks")?.value || intent.remarks;

    // Validate required fields
    if (!rawCommodity || !rawCommodity.trim()) {
        alert("Please enter Commodity.");
        document.getElementById("detailCommodity")?.focus();
        return;
    }

    const volumeValue = String(rawVolume).replace(/,/g, "").replace(/kg/gi, "").trim();
    if (!volumeValue || isNaN(Number(volumeValue)) || Number(volumeValue) <= 0) {
        alert("Please enter a valid volume.");
        document.getElementById("detailVolume")?.focus();
        return;
    }

    const plantingDate = convertToAPIDate(rawPlantingDate);
    const harvestDate = convertToAPIDate(rawHarvestDate);

    if (!plantingDate) {
        alert("Please enter a valid Planting Date.");
        document.getElementById("detailPlantingDate")?.focus();
        return;
    }

    if (!harvestDate) {
        alert("Please enter a valid Harvest Date.");
        document.getElementById("detailHarvestDate")?.focus();
        return;
    }

    const payload = {
        commodity: rawCommodity.trim(),
        volume: Number(volumeValue),
        location: rawLocation || "",
        planting_date: plantingDate,
        harvest_date: harvestDate,
        remarks: rawRemarks || ""
    };

    console.log("Saving changes:", payload);

    try {
        const url = PLANTING_INTENTS_ENDPOINT + intent.planting_intent_id;
        const token = getAuthToken();

        const response = await fetch(url, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": token ? "Bearer " + token : ""
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            let errorData = null;
            try { errorData = await response.json(); } catch(e) {}
            let errorMessage = "Failed to update planting intent.";
            if (errorData && errorData.detail) {
                errorMessage = typeof errorData.detail === "string" ? errorData.detail : JSON.stringify(errorData.detail);
            }
            throw new Error(errorMessage);
        }

        const result = await response.json();
        console.log("Update successful:", result);

        // Update local data
        intent.commodity = payload.commodity;
        intent.volume = payload.volume;
        intent.location = payload.location;
        intent.planting_date = payload.planting_date;
        intent.harvest_date = payload.harvest_date;
        intent.remarks = payload.remarks;
        intent.updated_at = new Date().toISOString();

        // Update the data in the main array
        const index = PLANTING_INTENTS_DATA.findIndex(function(item) {
            return item.planting_intent_id === intent.planting_intent_id;
        });
        if (index !== -1) {
            PLANTING_INTENTS_DATA[index] = intent;
        }

        // Refresh the table
        renderPlantingIntentsTable();

        // Exit edit mode
        window.isEditingPlantingIntent = false;

        // Reset input styles
        const details = document.getElementById("plantingIntentDetailsSubview");
        if (details) {
            const inputs = details.querySelectorAll("input, textarea");
            inputs.forEach(function(input) {
                input.readOnly = true;
                input.classList.add("input-readonly");
                input.classList.remove("input-editable-active");
                input.style.border = "";
                input.style.background = "";
            });
        }

        // Restore buttons
        const editBtn = document.getElementById("editPlantingIntentBtn");
        if (editBtn) {
            editBtn.textContent = "Edit Details";
            editBtn.style.background = "#D97706";
            editBtn.style.display = "inline-flex";
        }

        const submitBtn = document.getElementById("submitPlantingIntentBtn");
        if (submitBtn) {
            submitBtn.style.display = "inline-flex";
            const status = (intent.status || "DRAFT").toUpperCase();
            if (status === "SUBMITTED") {
                submitBtn.textContent = "Revert to Draft";
                submitBtn.style.background = "#D97706";
            } else {
                submitBtn.textContent = "Submit Intent";
                submitBtn.style.background = "#2E7D32";
            }
            submitBtn.disabled = false;
        }

        const backBtn = document.getElementById("backFromPlantingIntentDetailsBtn");
        if (backBtn) backBtn.style.display = "inline-flex";

        const cancelBtn = document.getElementById("cancelEditPlantingIntentBtn");
        if (cancelBtn) cancelBtn.remove();

        // Update the details view with new values
        setValue("detailPlantingIntentId", intent.planting_intent_id || "");
        setValue("detailFarmerName", intent.farmer_name || "");
        setValue("detailFarmerId", intent.farmer_id || "");
        setValue("detailCommodity", intent.commodity || "");
        setValue("detailVolume", formatPlantingVolume(intent.volume));
        setValue("detailLocation", intent.location || "");
        setValue("detailPlantingDate", formatPlantingDate(intent.planting_date));
        setValue("detailHarvestDate", formatPlantingDate(intent.harvest_date));
        setValue("detailRemarks", intent.remarks || "");

        alert("Planting Intent updated successfully!");

    } catch (error) {
        console.error("Save error:", error);
        alert("Failed to update planting intent.\n\n" + error.message);
    }
}

/* ============================================================
   SUBMIT PLANTING INTENT (NEW INTENT)
============================================================ */

async function submitPlantingIntent() {
    const form = document.getElementById("submitPlantIntentForm");
    if (!form) {
        alert("Planting Intent form not found.");
        return;
    }

    const farmerNameSelect = document.getElementById("piFarmerName");
    const farmerName = farmerNameSelect ? farmerNameSelect.options[farmerNameSelect.selectedIndex]?.text || "" : "";
    const farmerId = document.getElementById("piFarmerId")?.value || "";
    const plantingDate = document.getElementById("piPlantDate")?.value || "";
    const harvestDate = document.getElementById("piHarvestDate")?.value || "";
    const commodity = document.getElementById("piCommodity")?.value?.trim() || "";
    const volume = document.getElementById("piVolume")?.value || "";
    const remarks = document.getElementById("piRemarks")?.value || "";

    if (!farmerName || farmerName === "Select Farmer") {
        alert("Please select a Farmer.");
        return;
    }
    if (!farmerId) {
        alert("Farmer ID is required.");
        return;
    }
    if (!plantingDate) {
        alert("Please select Planting Date.");
        return;
    }
    if (!harvestDate) {
        alert("Please select Harvest Date.");
        return;
    }
    if (!commodity) {
        alert("Please enter Commodity.");
        return;
    }
    if (!volume) {
        alert("Please enter Volume.");
        return;
    }

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

    console.log("Submitting planting intent:", plantingIntentData);

    try {
        const createdIntent = await apiRequest(PLANTING_INTENTS_ENDPOINT, {
            method: "POST",
            body: JSON.stringify(plantingIntentData)
        });

        console.log("Planting intent created:", createdIntent);

        await fetchPlantingIntents();

        const modal = document.getElementById("plantIntentSubmittedModal");
        if (modal) modal.classList.add("show");

    } catch (error) {
        console.error("Create planting intent error:", error);
        handleAuthError(error);
        alert("Failed to submit planting intent.\n\n" + (error.message || "Please check the FastAPI server."));
    }
}

// ============================================================
// PLANTING INTENT PAGINATION
// ============================================================

function renderPlantingIntentPagination(totalCount, type) {
    console.log("=== PAGINATION ===");
    console.log("type:", type, "totalCount:", totalCount);
    
    // Get the container for the specific tab
    const containerId = type === "draft" ? "draftIntentsContainer" : "submittedIntentsContainer";
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn("Container not found:", containerId);
        return;
    }

    // Find the card inside the container
    const card = container.querySelector(".card");
    if (!card) {
        console.warn("Card not found inside container:", containerId);
        return;
    }

    // Remove existing pagination
    let paginationDiv = card.querySelector(".planting-intent-pagination");
    if (paginationDiv) {
        paginationDiv.remove();
        paginationDiv = null;
    }

    // If no items or less than per page, hide pagination
    if (totalCount <= plantingIntentsPerPage) {
        console.log("No pagination needed (totalCount <= perPage)");
        return;
    }

    // Get current page for this tab
    const currentPage = type === "draft" ? currentDraftIntentsPage : currentSubmittedIntentsPage;
    const totalPages = Math.ceil(totalCount / plantingIntentsPerPage);

    // Make sure current page is valid
    let validPage = Math.min(Math.max(1, currentPage), totalPages);
    if (type === "draft") {
        currentDraftIntentsPage = validPage;
    } else {
        currentSubmittedIntentsPage = validPage;
    }

    const startIndex = (validPage - 1) * plantingIntentsPerPage + 1;
    const endIndex = Math.min(validPage * plantingIntentsPerPage, totalCount);

    // Create pagination div
    paginationDiv = document.createElement("div");
    paginationDiv.className = "pagination-container planting-intent-pagination";
    paginationDiv.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--border); flex-wrap: wrap; gap: 8px;";

    // Build pagination HTML
    let html = `
        <span class="pagination-info" style="font-size: 12.5px; color: var(--muted);">
            Showing ${startIndex}-${endIndex} of ${totalCount} planting intents
        </span>
        <div class="pagination-controls" style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            <button class="btn-page prev-page-btn" type="button" ${validPage <= 1 ? 'disabled' : ''}>
                &laquo; Prev
            </button>
            <div class="page-numbers-wrap" style="display: flex; gap: 4px;">
    `;

    // Show page numbers (max 5)
    let startPage = Math.max(1, validPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    
    if (endPage - startPage < 4) {
        startPage = Math.max(1, endPage - 4);
    }

    // Add first page if not in range
    if (startPage > 1) {
        html += `<button class="btn-page page-btn" data-page="1">1</button>`;
        if (startPage > 2) {
            html += `<span style="padding: 0 4px; color: #777;">...</span>`;
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="btn-page page-btn ${i === validPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }

    // Add last page if not in range
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            html += `<span style="padding: 0 4px; color: #777;">...</span>`;
        }
        html += `<button class="btn-page page-btn" data-page="${totalPages}">${totalPages}</button>`;
    }

    html += `
            </div>
            <button class="btn-page next-page-btn" type="button" ${validPage >= totalPages ? 'disabled' : ''}>
                Next &raquo;
            </button>
        </div>
    `;

    paginationDiv.innerHTML = html;

    // Append to card
    card.appendChild(paginationDiv);

    // ============================================================
    // ATTACH EVENT LISTENERS
    // ============================================================

    // Page number buttons
    paginationDiv.querySelectorAll(".page-btn").forEach(function(btn) {
        btn.addEventListener("click", function() {
            const page = parseInt(this.dataset.page);
            if (type === "draft") {
                currentDraftIntentsPage = page;
            } else {
                currentSubmittedIntentsPage = page;
            }
            renderPlantingIntentsTable();
        });
    });

    // Prev button
    const prevBtn = paginationDiv.querySelector(".prev-page-btn");
    if (prevBtn) {
        prevBtn.addEventListener("click", function() {
            if (type === "draft") {
                if (currentDraftIntentsPage > 1) currentDraftIntentsPage--;
            } else {
                if (currentSubmittedIntentsPage > 1) currentSubmittedIntentsPage--;
            }
            renderPlantingIntentsTable();
        });
    }

    // Next button
    const nextBtn = paginationDiv.querySelector(".next-page-btn");
    if (nextBtn) {
        nextBtn.addEventListener("click", function() {
            const total = type === "draft" 
                ? draftIntents.length
                : submittedIntents.length;
            if (type === "draft") {
                if (currentDraftIntentsPage < totalPages) currentDraftIntentsPage++;
            } else {
                if (currentSubmittedIntentsPage < totalPages) currentSubmittedIntentsPage++;
            }
            renderPlantingIntentsTable();
        });
    }
}

/* ============================================================
   REPORTING
============================================================ */

let INDIVIDUAL_REPORTS_DATA = [];
let SUBMITTED_REPORTS_DATA = [];

let currentIndividualReportsPage = 1;
let currentSubmittedReportsPage = 1;

const reportsPerPage = 10;


/* ============================================================
   INITIALIZE REPORTING
============================================================ */

function initReporting() {
    console.log("Initializing Reporting...");

    const createReportBtn = document.getElementById("createReportBtn");
    const cancelReportBtn = document.getElementById("cancelReportBtn");
    const saveDraftBtn = document.getElementById("saveReportDraftBtn");
    const submitFinalBtn = document.getElementById("submitReportFinalBtn");
    const backDetailsBtn = document.getElementById("backFromReportDetailsBtn");
    const editReportBtn = document.getElementById("editReportBtn");

    const selectFileBtn = document.getElementById("selectReportFileBtn");
    const fileInput = document.getElementById("reportFileInput");
    const fileNameInput = document.getElementById("reportDocFilename");

    // Initialize report filter
    const filterSelect = document.getElementById('individualReportFilter');
    if (filterSelect) {
        filterSelect.addEventListener('change', function() {
            individualFilterStatus = this.value;
            renderFinalizedIntents(allIndividualReports);
        });
    }



    /* -----------------------------------------
       CREATE NEW REPORT
    ----------------------------------------- */
    if (createReportBtn) {
        createReportBtn.addEventListener("click", function () {
            openSubmitReportSubview();
        });
    }

    /* -----------------------------------------
       CANCEL NEW REPORT
    ----------------------------------------- */
    // Cancel report creation
    if (cancelReportBtn) {
        cancelReportBtn.addEventListener("click", function () {
            console.log("❌ Cancelling report creation...");
            closeAllModals();
            // Show main view
            const mainView = document.getElementById("reportsMainSubview");
            if (mainView) {
                mainView.classList.remove("hidden-element");
            }
        });
    }

    // Back from report details
    if (backDetailsBtn) {
        backDetailsBtn.addEventListener("click", function () {
            console.log("🔙 Back from details...");
            closeAllModals();
        });
    }

    /* -----------------------------------------
       SAVE DRAFT
    ----------------------------------------- */
    if (saveDraftBtn) {
        saveDraftBtn.addEventListener("click", function () {
            saveReport("DRAFT");
        });
    }

    /* -----------------------------------------
       SUBMIT REPORT
    ----------------------------------------- */
    if (submitFinalBtn) {
        submitFinalBtn.addEventListener("click", function () {
            saveReport("SUBMITTED");
        });
    }

    /* -----------------------------------------
       BACK FROM DETAILS
    ----------------------------------------- */
    if (backDetailsBtn) {
        backDetailsBtn.addEventListener("click", function () {
            closeReportDetailsSubview();
        });
    }

    /* -----------------------------------------
       EDIT REPORT
    ----------------------------------------- */
    if (editReportBtn) {
        editReportBtn.addEventListener("click", function () {
            const reportId = this.dataset.reportId;

            if (!reportId) {
                alert("Report ID not found.");
                return;
            }

            openSubmitReportSubview(reportId);
        });
    }

    /* -----------------------------------------
       FILE SELECT
    ----------------------------------------- */
    if (selectFileBtn && fileInput) {
        selectFileBtn.addEventListener("click", function () {
            fileInput.click();
        });
    }

    if (fileNameInput && fileInput) {
        fileNameInput.addEventListener("click", function () {
            fileInput.click();
        });
    }

    if (fileInput) {
        fileInput.addEventListener("change", function () {
            const files = Array.from(this.files || []);

            if (fileNameInput) {
                fileNameInput.value =
                    files.length > 0
                        ? files.map(file => file.name).join(", ")
                        : "";
            }

            const list = document.getElementById("selectedFilesList");

            if (list) {
                if (files.length === 0) {
                    list.innerHTML = "";
                } else {
                    list.innerHTML = files
                        .map(file => `<div>${escapeHtml(file.name)}</div>`)
                        .join("");
                }
            }
        });
    }
}

// ============================================================
// RENDER FINALIZED PLANTING INTENTS
// ============================================================

function renderFinalizedIntents(intents) {
    const tbody = document.getElementById('individualReportsTableBody');
    if (!tbody) return;

    // Apply filter
    let filteredIntents = intents;
    if (individualFilterStatus !== 'all') {
        filteredIntents = intents.filter(function(intent) {
            const status = (intent.status || 'NOT PLANTED').toUpperCase();
            return status === individualFilterStatus;
        });
    }

    if (!filteredIntents || filteredIntents.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="padding:30px; text-align:center; color:#999;">No finalized planting intents found.</td></tr>`;
        return;
    }

    tbody.innerHTML = filteredIntents.map(function(intent) {
        const status = intent.status || "NOT PLANTED";
        const statusUpper = status.toUpperCase();
        const statusClass = 'status-pill-' + statusUpper.toLowerCase().replace(/ /g, '-');
        
        return `
            <tr class="clickable-row" data-intent-id="${intent.planting_intent_id}">
                <td>#${intent.report_id}</td>
                <td>${escapeHtml(intent.title)}</td>
                <td>${intent.submitted_at ? formatPlantingDate(intent.submitted_at) : '-'}</td>
                <td>
                    <div style="display:flex; align-items:center; gap:8px; justify-content:center; flex-wrap:wrap;">
                        <span class="status-pill ${statusClass}">${escapeHtml(statusUpper)}</span>
                        <select class="finalized-status-select" data-intent-id="${intent.planting_intent_id}" style="padding:4px 8px; border:1.5px solid var(--border); border-radius:var(--radius-sm); font-size:11px; background:#fff; cursor:pointer;">
                            <option value="NOT PLANTED" ${statusUpper === 'NOT PLANTED' ? 'selected' : ''}>Not Planted</option>
                            <option value="PLANTED" ${statusUpper === 'PLANTED' ? 'selected' : ''}>Planted</option>
                            <option value="HARVESTED" ${statusUpper === 'HARVESTED' ? 'selected' : ''}>Harvested</option>
                            <option value="MEDIATING" ${statusUpper === 'MEDIATING' ? 'selected' : ''}>Mediating</option>
                        </select>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Attach change event to status selects
    tbody.querySelectorAll('.finalized-status-select').forEach(function(select) {
        select.addEventListener('change', function(e) {
            e.stopPropagation();
            const intentId = this.dataset.intentId;
            const newStatus = this.value;
            updateFinalizedIntentStatus(intentId, newStatus);
        });
    });

    // Attach click event to rows
    tbody.querySelectorAll('.clickable-row').forEach(function(row) {
        row.addEventListener('click', function(e) {
            if (e.target.tagName === 'SELECT') return;
            const intentId = this.dataset.intentId;
            openFinalizedIntentDetails(intentId);
        });
    });
}

// ============================================================
// UPDATE FINALIZED INTENT STATUS
// ============================================================

async function updateFinalizedIntentStatus(intentId, newStatus) {
    try {
        // Update the intent's finalized_status (you may need to add this field to your model)
        // For now, we'll update it in the local data and re-render
        const intent = PLANTING_INTENTS_DATA.find(function(i) {
            return i.planting_intent_id === intentId;
        });
        
        if (intent) {
            intent.finalized_status = newStatus;
            
            // Also update in the allIndividualReports array
            const reportIntent = allIndividualReports.find(function(r) {
                return r.planting_intent_id === intentId;
            });
            if (reportIntent) {
                reportIntent.status = newStatus;
            }
        }
        
        // Re-render
        renderFinalizedIntents(allIndividualReports);
        
        console.log(`Status updated to ${newStatus} for intent ${intentId}`);
        
    } catch (error) {
        console.error("Failed to update status:", error);
        alert("Failed to update status. Please try again.");
    }
}

// ============================================================
// CREATE REPORT FROM PLANTING INTENTS
// ============================================================

async function createReportFromIntents(intentIds, notes, attachments) {
    try {
        // Create the report first
        const reportData = {
            planting_intent_ids: intentIds,
            notes: notes,
            status: "NOT PLANTED" // Default status for individual reports
        };
        
        const response = await apiRequest(`${API_BASE_URL}/api/raw-plant-reports/from-intents`, {
            method: "POST",
            body: JSON.stringify(reportData)
        });
        
        console.log("Report created:", response);
        return response;
    } catch (error) {
        console.error("Failed to create report:", error);
        throw error;
    }
}

// ============================================================
// INIT REPORTS
// ============================================================

function initReports() {
    const createBtn = document.getElementById('createReportBtn');
    const cancelBtn = document.getElementById('cancelReportBtn');
    const addIntentBtn = document.getElementById('addIntentToReportBtn');
    const reportIntentSelect = document.getElementById('reportIntentSelect');
    const selectedIntentsBody = document.getElementById('selectedIntentsTableBody');
    const saveDraftBtn = document.getElementById('saveReportDraftBtn');
    const submitFinalBtn = document.getElementById('submitReportFinalBtn');
    
    // Store selected intents
    let selectedIntents = [];
    
    // Load reports
    loadReports();
    
    // Populate intent dropdown with SUBMITTED intents only
    function populateIntentDropdown() {
        if (!reportIntentSelect) return;
        
        // Get submitted intents (not yet included in any report)
        const submittedIntents = PLANTING_INTENTS_DATA.filter(function(intent) {
            const status = (intent.status || '').toUpperCase();
            return status === 'SUBMITTED';
        });
        
        reportIntentSelect.innerHTML = '<option value="">Select Planting Intent</option>';
        
        submittedIntents.forEach(function(intent) {
            // Check if already selected
            if (selectedIntents.some(function(s) { return s.planting_intent_id === intent.planting_intent_id; })) {
                return;
            }
            const option = document.createElement('option');
            option.value = intent.planting_intent_id;
            option.textContent = `#${intent.planting_intent_id} - ${intent.commodity} (${intent.farmer_name})`;
            reportIntentSelect.appendChild(option);
        });
    }
    
    // Show create report view
    createBtn?.addEventListener('click', function() {
        document.getElementById('reportsMainSubview').classList.add('hidden-element');
        document.getElementById('submitReportSubview').classList.remove('hidden-element');
        selectedIntents = [];
        renderSelectedIntents();
        populateIntentDropdown();
    });
    
    // Cancel report creation
    cancelBtn?.addEventListener('click', function() {
        document.getElementById('submitReportSubview').classList.add('hidden-element');
        document.getElementById('reportsMainSubview').classList.remove('hidden-element');
        selectedIntents = [];
        renderSelectedIntents();
    });
    
    // Add intent to report
    if (addIntentBtn) {
        addIntentBtn.addEventListener("click", function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log("➕ Add row button clicked");
            
            const select = document.getElementById("reportIntentSelect");
            if (!select || !select.value) {
                alert("Please select a planting intent.");
                return;
            }

            const intentId = parseInt(select.value);
            if (!intentId) {
                alert("Invalid planting intent.");
                return;
            }

            // Find the intent
            const intent = PLANTING_INTENTS_DATA.find(function(i) {
                return i.planting_intent_id === intentId;
            });

            if (!intent) {
                alert("Planting intent not found.");
                return;
            }

            // Initialize selected intents if not exists
            if (!window.selectedReportIntents) {
                window.selectedReportIntents = [];
            }

            // Check if already selected
            const alreadySelected = window.selectedReportIntents.some(function(item) {
                return item.planting_intent_id === intentId;
            });

            if (alreadySelected) {
                alert("This planting intent is already added.");
                return;
            }

            // Add to selected
            window.selectedReportIntents.push(intent);
            
            // Clear the select
            select.value = '';
            
            // Re-render
            renderSelectedReportIntents();
            populateReportIntentSelect(); // Refresh dropdown to remove selected items
            
            console.log("Intent added:", intent);
        });
    }
    
    // Render selected intents table
    function renderSelectedIntents() {
        if (!selectedIntentsBody) return;
        
        if (selectedIntents.length === 0) {
            selectedIntentsBody.innerHTML = `
                <tr>
                    <td colspan="5" style="padding:20px; text-align:center; color:#999;">No planting intents selected. Click "Add Row" to add.</td>
                </tr>
            `;
            return;
        }
        
        selectedIntentsBody.innerHTML = selectedIntents.map(function(intent, index) {
            return `
                <tr>
                    <td>#${intent.planting_intent_id}</td>
                    <td>${escapeHtml(intent.commodity)}</td>
                    <td>${escapeHtml(formatPlantingVolume(intent.volume))}</td>
                    <td>${escapeHtml(intent.farmer_name)}</td>
                    <td class="center-col">
                        <button class="btn-danger remove-intent-btn" data-index="${index}" style="padding:4px 10px; font-size:12px; background:#C0392B; color:#fff; border:none; border-radius:4px; cursor:pointer;">Remove</button>
                    </td>
                </tr>
            `;
        }).join('');
        
        // Attach remove event
        selectedIntentsBody.querySelectorAll('.remove-intent-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                const index = parseInt(this.dataset.index);
                selectedIntents.splice(index, 1);
                renderSelectedIntents();
                populateIntentDropdown();
            });
        });
    }
    
    // Save as Draft
    saveDraftBtn?.addEventListener('click', async function() {
        if (selectedIntents.length === 0) {
            alert('Please select at least one planting intent.');
            return;
        }
        
        const notes = document.getElementById('reportNotesInput')?.value || '';
        
        this.disabled = true;
        this.textContent = 'Saving...';
        
        try {
            const intentIds = selectedIntents.map(function(i) { return i.planting_intent_id; });
            const report = await createReportFromIntents(intentIds, notes, null);
            
            alert('Report saved as draft successfully!');
            document.getElementById('submitReportSubview').classList.add('hidden-element');
            document.getElementById('reportsMainSubview').classList.remove('hidden-element');
            selectedIntents = [];
            renderSelectedIntents();
            document.getElementById('reportNotesInput').value = '';
            
            // Refresh reports
            await loadReports();
            
        } catch (error) {
            console.error('Save draft error:', error);
            alert('Failed to save report: ' + error.message);
        } finally {
            this.disabled = false;
            this.textContent = 'Save as Draft';
        }
    });
    
    // Submit to Municipal
    submitFinalBtn?.addEventListener('click', async function() {
        if (selectedIntents.length === 0) {
            alert('Please select at least one planting intent.');
            return;
        }
        
        const notes = document.getElementById('reportNotesInput')?.value || '';
        
        if (!confirm('Are you sure you want to submit this report to Municipal for validation?')) {
            return;
        }
        
        this.disabled = true;
        this.textContent = 'Submitting...';
        
        try {
            const intentIds = selectedIntents.map(function(i) { return i.planting_intent_id; });
            const report = await createReportFromIntents(intentIds, notes, null);
            
            // Update report status to FOR_MUNICIPAL_VALIDATION
            await apiRequest(`${API_BASE_URL}/api/raw-plant-reports/${report.report_id}`, {
                method: "PUT",
                body: JSON.stringify({ status: "FOR_MUNICIPAL_VALIDATION" })
            });
            
            // Update the intents status (they are now in the report)
            for (let id of intentIds) {
                await apiRequest(`${PLANTING_INTENTS_ENDPOINT}${id}`, {
                    method: "PUT",
                    body: JSON.stringify({ status: "FOR_MUNICIPAL_VALIDATION" })
                });
            }
            
            alert('Report submitted to Municipal successfully!');
            document.getElementById('submitReportSubview').classList.add('hidden-element');
            document.getElementById('reportsMainSubview').classList.remove('hidden-element');
            selectedIntents = [];
            renderSelectedIntents();
            document.getElementById('reportNotesInput').value = '';
            
            // Refresh data
            await fetchPlantingIntents();
            await loadReports();
            
        } catch (error) {
            console.error('Submit error:', error);
            alert('Failed to submit report: ' + error.message);
        } finally {
            this.disabled = false;
            this.textContent = 'Submit to Municipal';
        }
    });
}

// Make sure to call initReports in DOMContentLoaded
document.addEventListener("DOMContentLoaded", async () => {
    // ... existing initialization ...
    initReports();
});



// ============================================================
// REPORTS - LOAD REPORTS (AUTO-SHOW SUBMITTED INTENTS)
// ============================================================

let allIndividualReports = [];
let individualFilterStatus = 'all';

async function loadReports() {
    try {
        console.log("=== LOAD REPORTS DEBUG ===");
        console.log("PLANTING_INTENTS_DATA length:", PLANTING_INTENTS_DATA.length);
        
        if (!PLANTING_INTENTS_DATA || PLANTING_INTENTS_DATA.length === 0) {
            console.log("No planting intents data available.");
            renderFinalizedIntents([]);
            renderSubmittedReports([]);
            return;
        }
        
        // DEBUG: Log all intents and their statuses
        const statusCounts = {};
        PLANTING_INTENTS_DATA.forEach(function(intent) {
            const status = String(intent.status || 'UNKNOWN').toUpperCase();
            statusCounts[status] = (statusCounts[status] || 0) + 1;
        });
        console.log("Status counts:", statusCounts);
        
        // ============================================================
        // 1. FILTER: ALL SUBMITTED INTENTS (CASE INSENSITIVE)
        // ============================================================
        const allSubmitted = PLANTING_INTENTS_DATA.filter(function(intent) {
            const status = String(intent.status || '').toUpperCase();
            return status === 'SUBMITTED' || 
                   status === 'FOR_MUNICIPAL_VALIDATION' ||
                   status === 'FOR_PROVINCIAL_VALIDATION' ||
                   status === 'FOR_DA_RFO_VALIDATION' ||
                   status === 'FINAL_APPROVED' ||
                   status === 'REVISION_REQUIRED';
        });
        
        console.log("All submitted intents found:", allSubmitted.length);
        
        // ============================================================
        // 2. FINALIZED INTENTS = SUBMITTED
        // ============================================================
        const finalizedIntents = allSubmitted.filter(function(intent) {
            const status = String(intent.status || '').toUpperCase();
            return status === 'SUBMITTED';
        }).map(function(intent) {
            return {
                report_id: intent.planting_intent_id,  // Use planting_intent_id as report_id
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
        
        console.log("Finalized intents found:", finalizedIntents.length);
        
        // ============================================================
        // 3. SUBMITTED REPORTS (For validation)
        // ============================================================
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
        
        console.log("Submitted reports found:", submittedReports.length);
        
        // SORT BY DATE (NEWEST FIRST)
        finalizedIntents.sort(function(a, b) {
            const dateA = new Date(a.submitted_at || 0);
            const dateB = new Date(b.submitted_at || 0);
            return dateB - dateA;
        });
        
        submittedReports.sort(function(a, b) {
            const dateA = new Date(a.submitted_at || 0);
            const dateB = new Date(b.submitted_at || 0);
            return dateB - dateA;
        });
        
        // ============================================================
        // 4. STORE AND RENDER
        // ============================================================
        allIndividualReports = finalizedIntents;
        
        renderFinalizedIntents(finalizedIntents);
        renderSubmittedReports(submittedReports);
        
        console.log("=== LOAD REPORTS COMPLETE ===");
        
    } catch (error) {
        console.error("Failed to load reports:", error);
    }
}

/* ============================================================
   REPORT PAGINATION
============================================================ */

function renderReportPagination(
    type,
    totalCount,
    currentPage
) {
    const tableBodyId =
        type === "individual"
            ? "individualReportsTableBody"
            : "submittedReportsTableBody";

    const tbody =
        document.getElementById(tableBodyId);

    if (!tbody) return;

    const table =
        tbody.closest("table");

    if (!table) return;

    const existing =
        table.parentElement.querySelector(
            ".report-pagination"
        );

    if (existing) {
        existing.remove();
    }

    if (totalCount <= reportsPerPage) {
        return;
    }

    const totalPages =
        Math.ceil(totalCount / reportsPerPage);

    const pagination =
        document.createElement("div");

    pagination.className =
        "pagination-container report-pagination";

    const start =
        (currentPage - 1) * reportsPerPage + 1;

    const end =
        Math.min(
            currentPage * reportsPerPage,
            totalCount
        );

    pagination.innerHTML = `
        <span class="pagination-info">
            Showing ${start}-${end} of ${totalCount} reports
        </span>

        <div class="pagination-controls">

            <button
                class="btn-page report-prev"
                type="button"
                ${currentPage <= 1 ? "disabled" : ""}
            >
                &laquo; Prev
            </button>

            <span class="page-numbers-wrap"></span>

            <button
                class="btn-page report-next"
                type="button"
                ${currentPage >= totalPages ? "disabled" : ""}
            >
                Next &raquo;
            </button>

        </div>
    `;

    const pageWrap =
        pagination.querySelector(".page-numbers-wrap");

    for (
        let page = 1;
        page <= totalPages;
        page++
    ) {
        const button =
            document.createElement("button");

        button.type = "button";
        button.className =
            "btn-page" +
            (
                page === currentPage
                    ? " active"
                    : ""
            );

        button.textContent = page;

        button.addEventListener(
            "click",
            function () {

                if (type === "individual") {
                    currentIndividualReportsPage =
                        page;

                    renderIndividualReports();

                } else {

                    currentSubmittedReportsPage =
                        page;

                    renderSubmittedReports();
                }
            }
        );

        pageWrap.appendChild(button);
    }

    const prev =
        pagination.querySelector(".report-prev");

    if (prev) {
        prev.addEventListener(
            "click",
            function () {

                if (type === "individual") {
                    if (
                        currentIndividualReportsPage > 1
                    ) {
                        currentIndividualReportsPage--;
                    }

                    renderIndividualReports();

                } else {

                    if (
                        currentSubmittedReportsPage > 1
                    ) {
                        currentSubmittedReportsPage--;
                    }

                    renderSubmittedReports();
                }
            }
        );
    }

    const next =
        pagination.querySelector(".report-next");

    if (next) {
        next.addEventListener(
            "click",
            function () {

                if (type === "individual") {

                    if (
                        currentIndividualReportsPage <
                        totalPages
                    ) {
                        currentIndividualReportsPage++;
                    }

                    renderIndividualReports();

                } else {

                    if (
                        currentSubmittedReportsPage <
                        totalPages
                    ) {
                        currentSubmittedReportsPage++;
                    }

                    renderSubmittedReports();
                }
            }
        );
    }

    table.parentElement.appendChild(pagination);
}


/* ============================================================
   REPORT DETAILS
============================================================ */

function openReportDetails(report) {

    const mainView =
        document.getElementById("reportsMainSubview");

    const submitView =
        document.getElementById("submitReportSubview");

    const detailsView =
        document.getElementById("reportDetailsSubview");

    if (!detailsView) return;

    if (mainView) {
        mainView.classList.add("hidden-element");
    }

    if (submitView) {
        submitView.classList.add("hidden-element");
    }

    detailsView.classList.remove("hidden-element");

    window.currentSelectedReport = report;

    const reportId =
        report.report_id ??
        report.id ??
        "—";

    const title =
        report.title ||
        "Report Details";

    const status =
        report.status ||
        "DRAFT";

    const submittedDate =
        report.submitted_at ||
        report.submission_date ||
        report.created_at;

    setText(
        "reportDetailsTitle",
        title
    );

    setText(
        "detailReportId",
        reportId
    );

    setText(
        "detailReportStatus",
        status
    );

    setText(
        "detailReportDate",
        formatReportDate(submittedDate)
    );

    setText(
        "detailReportNotes",
        report.notes ||
        report.remarks ||
        "—"
    );

    renderReportAttachments(report);
    renderIncludedPlantingIntents(report);

    const editButton =
        document.getElementById("editReportBtn");

    if (editButton) {

        editButton.dataset.reportId =
            String(reportId);

        if (
            String(status).toUpperCase() === "DRAFT"
        ) {
            editButton.style.display = "inline-flex";
        } else {
            editButton.style.display = "none";
        }
    }
}


/* ============================================================
   REPORT ATTACHMENTS
============================================================ */

function renderReportAttachments(report) {

    const container =
        document.getElementById(
            "detailReportAttachments"
        );

    if (!container) return;

    const attachments =
        report.attachments ||
        report.files ||
        [];

    if (
        !Array.isArray(attachments) ||
        attachments.length === 0
    ) {
        container.textContent =
            "No attachments";

        return;
    }

    container.innerHTML =
        attachments.map(function (file) {

            const name =
                typeof file === "string"
                    ? file
                    : (
                        file.filename ||
                        file.file_name ||
                        "Attachment"
                    );

            const url =
                typeof file === "object"
                    ? file.url || file.file_url
                    : null;

            if (url) {
                return `
                    <div style="margin-bottom:6px;">
                        <a
                            href="${escapeHtml(url)}"
                            target="_blank"
                            rel="noopener"
                            style="color:var(--green); font-weight:600;"
                        >
                            ${escapeHtml(name)}
                        </a>
                    </div>
                `;
            }

            return `
                <div style="margin-bottom:6px;">
                    ${escapeHtml(name)}
                </div>
            `;

        }).join("");
}


/* ============================================================
   INCLUDED PLANTING INTENTS
============================================================ */

function renderIncludedPlantingIntents(report) {

    const tbody =
        document.getElementById(
            "detailReportIntentsBody"
        );

    if (!tbody) return;

    const intents =
        report.planting_intents ||
        report.intents ||
        report.included_intents ||
        [];

    if (
        !Array.isArray(intents) ||
        intents.length === 0
    ) {
        tbody.innerHTML = `
            <tr>
                <td
                    colspan="3"
                    style="padding:20px; text-align:center; color:#999;"
                >
                    No intents included.
                </td>
            </tr>
        `;

        return;
    }

    tbody.innerHTML =
        intents.map(function (intent) {

            const farmer =
                intent.farmer_name ||
                intent.farmer?.full_name ||
                intent.farmer?.name ||
                "N/A";

            const commodity =
                intent.commodity ||
                intent.crop ||
                "N/A";

            const volume =
                intent.volume ??
                intent.estimated_volume ??
                intent.estimated_yield ??
                "N/A";

            return `
                <tr>
                    <td>${escapeHtml(String(farmer))}</td>
                    <td>${escapeHtml(String(commodity))}</td>
                    <td>${escapeHtml(String(volume))} kg</td>
                </tr>
            `;

        }).join("");
}

// ============================================================
// RENDER FINALIZED PLANTING INTENTS (WORKING CLICKABLE PILL)
// ============================================================

function renderFinalizedIntents(intents) {
    const tbody = document.getElementById('individualReportsTableBody');
    if (!tbody) return;

    // Apply filter
    let filteredIntents = intents;
    if (individualFilterStatus !== 'all') {
        filteredIntents = intents.filter(function(intent) {
            const status = (intent.finalized_status || 'NOT PLANTED').toUpperCase();
            return status === individualFilterStatus;
        });
    }

    if (!filteredIntents || filteredIntents.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="padding:30px; text-align:center; color:#999;">No finalized planting intents found.</td></tr>`;
        return;
    }

    tbody.innerHTML = filteredIntents.map(function(intent) {
        const status = intent.finalized_status || "NOT PLANTED";
        const statusUpper = status.toUpperCase();
        
        // Status display text
        let displayText = statusUpper;
        let bgColor = '#6c757d';
        
        if (statusUpper === 'NOT PLANTED') {
            displayText = 'Not Planted';
            bgColor = '#6c757d';
        } else if (statusUpper === 'PLANTED') {
            displayText = 'Planted';
            bgColor = '#D97706';
        } else if (statusUpper === 'HARVESTED') {
            displayText = 'Harvested';
            bgColor = '#2E7D32';
        } else if (statusUpper === 'MEDIATING') {
            displayText = 'Mediating';
            bgColor = '#2980B9';
        }
        
        // Format dates
        const plantingDate = intent.planting_date ? formatPlantingDate(intent.planting_date) : '-';
        const harvestDate = intent.harvest_date ? formatPlantingDate(intent.harvest_date) : '-';
        
        // Use report_id if available, otherwise use planting_intent_id
        const reportId = intent.report_id || intent.planting_intent_id;
        
        return `
            <tr class="clickable-row" data-intent-id="${intent.planting_intent_id}">
                <td style="padding:12px 14px; text-align:center; font-weight:600;">#${reportId}</td>
                <td style="padding:12px 14px; text-align:center;">${escapeHtml(intent.farmer_name)}</td>
                <td style="padding:12px 14px; text-align:center;">${escapeHtml(intent.commodity)}</td>
                <td style="padding:12px 14px; text-align:center;">${formatPlantingVolume(intent.volume)}</td>
                <td style="padding:12px 14px; text-align:center;">${plantingDate}</td>
                <td style="padding:12px 14px; text-align:center;">${harvestDate}</td>
                <td style="padding:12px 14px; text-align:center;">
                    <div class="status-dropdown-wrapper" data-intent-id="${intent.planting_intent_id}" style="position:relative; display:inline-block;">
                        <span class="status-pill clickable-pill" 
                              style="cursor:pointer; display:inline-block; padding:4px 16px; border-radius:999px; font-size:11.5px; font-weight:700; color:#FFFFFF; text-shadow:0 1px 1px rgba(0,0,0,0.2); text-align:center; white-space:nowrap; letter-spacing:0.02em; user-select:none; background-color:${bgColor}; transition:all 0.2s ease;">
                            ${escapeHtml(displayText)}
                            <span style="font-size:8px; margin-left:6px;">▼</span>
                        </span>
                        <div class="status-dropdown-menu" style="display:none; position:absolute; top:100%; left:50%; transform:translateX(-50%); margin-top:4px; background:#FFFFFF; border:1.5px solid #DFD8C6; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.15); min-width:120px; z-index:1000; overflow:hidden;">
                            <div class="status-option" data-status="NOT PLANTED" style="padding:8px 16px; cursor:pointer; font-size:12px; color:#333; border-bottom:1px solid #f0f0f0; transition:background 0.15s ease;">Not Planted</div>
                            <div class="status-option" data-status="PLANTED" style="padding:8px 16px; cursor:pointer; font-size:12px; color:#333; border-bottom:1px solid #f0f0f0; transition:background 0.15s ease;">Planted</div>
                            <div class="status-option" data-status="HARVESTED" style="padding:8px 16px; cursor:pointer; font-size:12px; color:#333; border-bottom:1px solid #f0f0f0; transition:background 0.15s ease;">Harvested</div>
                            <div class="status-option" data-status="MEDIATING" style="padding:8px 16px; cursor:pointer; font-size:12px; color:#333; transition:background 0.15s ease;">Mediating</div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // ============================================================
    // ATTACH EVENT LISTENERS FOR DROPDOWNS
    // ============================================================
    
    // Get all pill wrappers
    const wrappers = tbody.querySelectorAll('.status-dropdown-wrapper');
    
    wrappers.forEach(function(wrapper) {
        const pill = wrapper.querySelector('.clickable-pill');
        const menu = wrapper.querySelector('.status-dropdown-menu');
        
        // Click on pill → toggle dropdown
        if (pill) {
            const newPill = pill.cloneNode(true);
            pill.parentNode.replaceChild(newPill, pill);
            
            newPill.addEventListener('click', function(e) {
                e.stopPropagation();
                e.preventDefault();
                
                // Close all other dropdowns
                document.querySelectorAll('.status-dropdown-menu').forEach(function(m) {
                    if (m !== menu) {
                        m.style.display = 'none';
                    }
                });
                
                // Toggle this dropdown
                if (menu.style.display === 'block') {
                    menu.style.display = 'none';
                } else {
                    menu.style.display = 'block';
                }
            });
        }
    });
    
    // Click on status option → update status
    const options = tbody.querySelectorAll('.status-option');
    options.forEach(function(option) {
        option.addEventListener('click', function(e) {
            e.stopPropagation();
            const newStatus = this.dataset.status;
            const menu = this.closest('.status-dropdown-menu');
            const wrapper = menu.closest('.status-dropdown-wrapper');
            const intentId = wrapper.dataset.intentId;
            const pill = wrapper.querySelector('.clickable-pill');
            
            // Update the pill
            updateStatusPillVisual(pill, newStatus);
            
            // Close dropdown
            menu.style.display = 'none';
            
            // Call update function
            updateFinalizedIntentStatus(intentId, newStatus);
        });
        
        // Hover effects
        option.addEventListener('mouseenter', function() {
            this.style.background = '#f0f0f0';
        });
        option.addEventListener('mouseleave', function() {
            this.style.background = '';
        });
    });
    
    // Click on row to open details
    const rows = tbody.querySelectorAll('.clickable-row');
    rows.forEach(function(row) {
        row.addEventListener('click', function(e) {
            // Don't open if clicking on pill or dropdown
            if (e.target.closest('.status-dropdown-wrapper')) return;
            const intentId = this.dataset.intentId;
            console.log("Row clicked:", intentId);
            openFinalizedIntentDetails(intentId);
        });
    });
}



// ============================================================
// UPDATE STATUS PILL VISUALLY
// ============================================================

function updateStatusPillVisual(pill, newStatus) {
    const statusUpper = newStatus.toUpperCase();
    
    // Update display text
    let displayText = statusUpper;
    if (statusUpper === 'NOT PLANTED') displayText = 'Not Planted';
    else if (statusUpper === 'PLANTED') displayText = 'Planted';
    else if (statusUpper === 'HARVESTED') displayText = 'Harvested';
    else if (statusUpper === 'MEDIATING') displayText = 'Mediating';
    
    // Update color
    let bgColor = '#6c757d';
    if (statusUpper === 'PLANTED') bgColor = '#D97706';
    else if (statusUpper === 'HARVESTED') bgColor = '#2E7D32';
    else if (statusUpper === 'MEDIATING') bgColor = '#2980B9';
    
    pill.textContent = displayText + ' ▼';
    pill.style.backgroundColor = bgColor;
}


// ============================================================
// CLOSE DROPDOWNS WHEN CLICKING OUTSIDE
// ============================================================

document.addEventListener('click', function(e) {
    if (!e.target.closest('.status-dropdown-wrapper')) {
        document.querySelectorAll('.status-dropdown-menu').forEach(function(m) {
            m.style.display = 'none';
        });
    }
});

// ============================================================
// UPDATE STATUS PILL VISUALLY
// ============================================================

function updateStatusPill(pill, newStatus) {
    const statusUpper = newStatus.toUpperCase();
    
    // Update display text
    let displayText = statusUpper;
    if (statusUpper === 'NOT PLANTED') displayText = 'Not Planted';
    else if (statusUpper === 'PLANTED') displayText = 'Planted';
    else if (statusUpper === 'HARVESTED') displayText = 'Harvested';
    else if (statusUpper === 'MEDIATING') displayText = 'Mediating';
    
    // Update color
    let bgColor = '#6c757d'; // Default gray
    if (statusUpper === 'PLANTED') bgColor = '#D97706';
    else if (statusUpper === 'HARVESTED') bgColor = '#2E7D32';
    else if (statusUpper === 'MEDIATING') bgColor = '#2980B9';
    
    pill.textContent = displayText + ' ▼';
    pill.style.backgroundColor = bgColor;
    pill.dataset.currentStatus = statusUpper;
}


// ============================================================
// UPDATE FINALIZED INTENT STATUS
// ============================================================

async function updateFinalizedIntentStatus(intentId, newStatus) {
    try {
        console.log(`Updating intent ${intentId} to ${newStatus}`);
        
        // Find the intent in the main data
        const intent = PLANTING_INTENTS_DATA.find(function(i) {
            return i.planting_intent_id === intentId;
        });
        
        if (!intent) {
            console.error("Intent not found:", intentId);
            return;
        }
        
        // CALL API TO UPDATE STATUS IN DATABASE
        try {
            const url = PLANTING_INTENTS_ENDPOINT + intentId;
            const token = getAuthToken();
            
            const response = await fetch(url, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": token ? "Bearer " + token : ""
                },
                body: JSON.stringify({
                    finalized_status: newStatus
                })
            });
            
            if (!response.ok) {
                console.warn("API update failed, but updating UI anyway");
            } else {
                console.log("Status updated in database");
            }
        } catch (apiError) {
            console.warn("Could not update status in database:", apiError);
            // Continue to update UI even if API fails
        }
        
        // UPDATE LOCAL DATA
        intent.finalized_status = newStatus;
        intent.updated_at = new Date().toISOString();
        
        // Also update in allIndividualReports
        const reportIntent = allIndividualReports.find(function(r) {
            return r.planting_intent_id === intentId;
        });
        if (reportIntent) {
            reportIntent.status = newStatus;
            reportIntent.updated_at = intent.updated_at;
        }
        
        // RE-RENDER
        renderFinalizedIntents(allIndividualReports);
        
        console.log(`Status updated to ${newStatus} for intent ${intentId}`);
        
    } catch (error) {
        console.error("Failed to update status:", error);
        alert("Failed to update status. Please try again.");
    }
}


// ============================================================
// OPEN SUBMIT REPORT SUBVIEW (WITH CLOSE PREVENTION)
// ============================================================

function openSubmitReportSubview(reportId = null) {
    console.log("Opening submit report subview...");
    
    closeAllModals();
    
    resetReportForm();
    
    const mainView = document.getElementById("reportsMainSubview");
    const submitView = document.getElementById("submitReportSubview");
    const detailsView = document.getElementById("reportDetailsSubview");

    if (mainView) {
        mainView.classList.add("hidden-element");
    }

    if (detailsView) {
        detailsView.classList.add("hidden-element");
    }

    if (submitView) {
        submitView.classList.remove("hidden-element");
    }

    window.selectedReportIntents = [];
    renderSelectedReportIntents();
    
    populateReportIntentSelect();

    if (reportId) {
        loadReportForEditing(reportId);
    }
}

// ============================================================
// CLOSE ALL MODALS
// ============================================================

function closeAllModals() {
    // Close report modals
    const submitView = document.getElementById("submitReportSubview");
    const detailsView = document.getElementById("reportDetailsSubview");
    const mainView = document.getElementById("reportsMainSubview");
    
    if (submitView) {
        submitView.classList.add("hidden-element");
    }
    if (detailsView) {
        detailsView.classList.add("hidden-element");
    }
    if (mainView) {
        mainView.classList.remove("hidden-element");
    }
    
    // Close farmer modals
    const confirmFarmer = document.getElementById("confirmFarmerModal");
    const farmerAdded = document.getElementById("farmerAddedModal");
    const deleteFarmer = document.getElementById("deleteFarmerModal");
    const deleteError = document.getElementById("deleteErrorModal");
    
    if (confirmFarmer) confirmFarmer.classList.remove("show");
    if (farmerAdded) farmerAdded.classList.remove("show");
    if (deleteFarmer) deleteFarmer.classList.remove("show");
    if (deleteError) deleteError.classList.remove("show");
    
    // Close planting intent modals
    const plantIntentSubmitted = document.getElementById("plantIntentSubmittedModal");
    if (plantIntentSubmitted) plantIntentSubmitted.classList.remove("show");
    
    // Close offtake modals
    const offtakeSubmitted = document.getElementById("offtakeSubmittedModal");
    if (offtakeSubmitted) offtakeSubmitted.classList.remove("show");
    
    // Reset form
    resetReportForm();
    
    // Clear selected intents
    window.selectedReportIntents = [];
    
    console.log("All modals closed");
}

/* ============================================================
   CLOSE SUBMIT REPORT
============================================================ */

function closeSubmitReportSubview() {

    const mainView =
        document.getElementById("reportsMainSubview");

    const submitView =
        document.getElementById("submitReportSubview");

    if (submitView) {
        submitView.classList.add("hidden-element");
    }

    if (mainView) {
        mainView.classList.remove("hidden-element");
    }

    resetReportForm();
}


/* ============================================================
   CLOSE REPORT DETAILS
============================================================ */

function closeReportDetailsSubview() {

    const mainView =
        document.getElementById("reportsMainSubview");

    const detailsView =
        document.getElementById("reportDetailsSubview");

    if (detailsView) {
        detailsView.classList.add("hidden-element");
    }

    if (mainView) {
        mainView.classList.remove("hidden-element");
    }

    window.currentSelectedReport = null;
}


// ============================================================
// POPULATE REPORT INTENT SELECT (WITH BARANGAY, COMMODITY, FARMER)
// ============================================================

function populateReportIntentSelect() {
    const select = document.getElementById("reportIntentSelect");
    if (!select) return;

    select.innerHTML = `
        <option value="">Select Planting Intent</option>
    `;

    // Get submitted intents
    const availableIntents = (PLANTING_INTENTS_DATA || []).filter(function(intent) {
        const status = String(intent.status || "").toUpperCase();
        return status === "SUBMITTED";
    });

    // SORT BY DATE (NEWEST FIRST)
    availableIntents.sort(function(a, b) {
        const dateA = new Date(a.updated_at || a.created_at || 0);
        const dateB = new Date(b.updated_at || b.created_at || 0);
        return dateB - dateA;
    });

    availableIntents.forEach(function(intent) {
        const option = document.createElement("option");
        option.value = intent.planting_intent_id;
        
        const farmer = intent.farmer_name || "Unknown Farmer";
        const barangay = intent.barangay || intent.location || "-";
        const commodity = intent.commodity || "Unknown Commodity";
        const date = intent.updated_at ? formatPlantingDate(intent.updated_at) : '';
        
        // Show: Barangay - Commodity - Farmer Name (Date)
        option.textContent = `${barangay} - ${commodity} - ${farmer} (${date})`;
        
        select.appendChild(option);
    });
}


/* ============================================================
   RESET REPORT FORM
============================================================ */

function resetReportForm() {
    const form = document.getElementById("submitReportForm");
    if (form) {
        form.reset();
    }

    // Clear report title
    const titleInput = document.getElementById("reportTitleInput");
    if (titleInput) {
        titleInput.value = "";
    }

    const selectedBody = document.getElementById("selectedIntentsTableBody");
    if (selectedBody) {
        selectedBody.innerHTML = `
            <tr>
                <td colspan="5" style="padding:20px; text-align:center; color:#999;">
                    No planting intents selected. Click "Add Row" to add.
                </td>
            </tr>
        `;
    }

    const files = document.getElementById("selectedFilesList");
    if (files) {
        files.innerHTML = "";
    }

    const fileName = document.getElementById("reportDocFilename");
    if (fileName) {
        fileName.value = "";
    }

    const reportFile = document.getElementById("reportFileInput");
    if (reportFile) {
        reportFile.value = "";
    }

    // Reset selected intents
    window.selectedReportIntents = [];
    
    // Reset dropdown
    const select = document.getElementById("reportIntentSelect");
    if (select) {
        select.innerHTML = '<option value="">Select Planting Intent</option>';
    }
}


/* ============================================================
   ADD INTENT TO REPORT
============================================================ */

document.addEventListener(
    "click",
    function (event) {

        if (
            event.target?.id !==
            "addIntentToReportBtn"
        ) {
            return;
        }

        const select =
            document.getElementById(
                "reportIntentSelect"
            );

        if (!select || !select.value) {
            alert("Please select a planting intent.");
            return;
        }

        const intentId =
            select.value;

        const intent =
            (PLANTING_INTENTS_DATA || [])
                .find(function (item) {
                    return String(
                        item.planting_intent_id
                    ) === String(intentId);
                });

        if (!intent) {
            alert("Planting intent not found.");
            return;
        }

        if (!window.selectedReportIntents) {
            window.selectedReportIntents = [];
        }

        const alreadySelected =
            window.selectedReportIntents.some(
                function (item) {
                    return String(
                        item.planting_intent_id
                    ) === String(intentId);
                }
            );

        if (alreadySelected) {
            alert("This planting intent is already added.");
            return;
        }

        window.selectedReportIntents.push(intent);

        renderSelectedReportIntents();
    }
);


    document.addEventListener("click", function(e) {
        // Check if the clicked element is a remove button
        if (e.target && e.target.classList && e.target.classList.contains('remove-intent-btn')) {
            const index = parseInt(e.target.dataset.index);
            if (!isNaN(index) && window.selectedReportIntents && window.selectedReportIntents[index]) {
                window.selectedReportIntents.splice(index, 1);
                renderSelectedReportIntents();
                populateReportIntentSelect();
            }
        }
    });


// ============================================================
// REMOVE SELECTED INTENT (EVENT LISTENER - ONE TIME ONLY)
// ============================================================

document.addEventListener("click", function(e) {
    if (e.target && e.target.classList && e.target.classList.contains('remove-intent-btn')) {
        const index = parseInt(e.target.dataset.index);
        if (!isNaN(index) && window.selectedReportIntents && window.selectedReportIntents[index]) {
            window.selectedReportIntents.splice(index, 1);
            renderSelectedReportIntents();
            populateReportIntentSelect();
        }
    }
});


// ============================================================
// RENDER SELECTED INTENTS
// ============================================================

function renderSelectedReportIntents() {
    const tbody = document.getElementById("selectedIntentsTableBody");
    if (!tbody) return;

    const intents = window.selectedReportIntents || [];

    if (intents.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="padding:20px; text-align:center; color:#999;">
                    No planting intents selected. Click "Add Row" to add.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = intents.map(function(intent, index) {
        const barangay = intent.barangay || intent.location || "N/A";
        const farmer = intent.farmer_name || "N/A";
        const commodity = intent.commodity || "N/A";
        const volume = intent.volume ?? intent.estimated_volume ?? "N/A";

        return `
            <tr>
                <td>${escapeHtml(String(barangay))}</td>
                <td>${escapeHtml(String(farmer))}</td>
                <td>${escapeHtml(String(commodity))}</td>
                <td>${escapeHtml(String(volume))} kg</td>
                <td class="center-col">
                    <button type="button" class="btn-outline-report remove-intent-btn" data-index="${index}" style="padding:2px 10px; font-size:11px; border-color:#C0392B; color:#C0392B;">
                        Remove
                    </button>
                </td>
            </tr>
        `;
    }).join("");
}


/* ============================================================
   REMOVE SELECTED INTENT
============================================================ */

function removeSelectedReportIntent(index) {

    if (
        !window.selectedReportIntents ||
        !window.selectedReportIntents[index]
    ) {
        return;
    }

    window.selectedReportIntents.splice(
        index,
        1
    );

    renderSelectedReportIntents();
}


// ============================================================
// SAVE / SUBMIT REPORT (WITH INTENT STATUS UPDATE)
// ============================================================

async function saveReport(status) {
    const intents = window.selectedReportIntents || [];

    if (intents.length === 0) {
        alert("Please add at least one planting intent.");
        return;
    }

    // Get Report Title
    const title = document.getElementById("reportTitleInput")?.value?.trim() || "";
    if (!title) {
        alert("Please enter a Report Title.");
        document.getElementById("reportTitleInput")?.focus();
        return;
    }

    const notes = document.getElementById("reportNotesInput")?.value?.trim() || "";
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

        console.log("Saving report:", reportData);

        // CREATE REPORT
        const result = await apiRequest(`${API_BASE_URL}/api/raw-plant-reports/from-intents`, {
            method: "POST",
            body: JSON.stringify(reportData)
        });

        console.log("Report saved:", result);

        // IF SUBMITTED, UPDATE INTENT STATUSES TO FOR_MUNICIPAL_VALIDATION
        if (status === "SUBMITTED") {
            const reportId = result.report_id;
            
            // Update report status
            await apiRequest(`${API_BASE_URL}/api/raw-plant-reports/${reportId}`, {
                method: "PUT",
                body: JSON.stringify({ status: "FOR_MUNICIPAL_VALIDATION" })
            });
            
            // UPDATE EACH INTENT'S STATUS
            for (let id of reportData.planting_intent_ids) {
                await apiRequest(`${PLANTING_INTENTS_ENDPOINT}${id}`, {
                    method: "PUT",
                    body: JSON.stringify({ status: "FOR_MUNICIPAL_VALIDATION" })
                });
            }
            
            console.log(" Intents updated to FOR_MUNICIPAL_VALIDATION");
        }

        alert(
            status === "SUBMITTED"
                ? "Report submitted to Municipal successfully!"
                : "Report saved as draft."
        );

        closeSubmitReportSubview();

        // REFRESH DATA
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


/* ============================================================
   LOAD REPORT FOR EDITING
============================================================ */

async function loadReportForEditing(reportId) {

    try {

        const report =
            await apiRequest(
                REPORT_SUBMISSIONS_ENDPOINT +
                "/" +
                reportId,
                {
                    method: "GET"
                }
            );

        populateReportForm(report);

    } catch (error) {

        console.error(
            "Failed to load report:",
            error
        );

        alert(
            "Unable to load report details."
        );
    }
}


/* ============================================================
   POPULATE REPORT FORM
============================================================ */

function populateReportForm(report) {

    const notes =
        document.getElementById(
            "reportNotesInput"
        );

    if (notes) {
        notes.value =
            report.notes ||
            report.remarks ||
            "";
    }

    window.selectedReportIntents =
        report.planting_intents ||
        report.intents ||
        [];

    renderSelectedReportIntents();

    populateReportIntentSelect();
}


/* ============================================================
   ERROR STATES
============================================================ */

function renderIndividualReportsError(error) {

    const tbody =
        document.getElementById(
            "individualReportsTableBody"
        );

    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td
                colspan="4"
                style="padding:30px; text-align:center; color:#C0392B;"
            >
                Failed to load individual reports.
                <br>
                <small>
                    ${escapeHtml(
                        error?.message ||
                        "Please check the server."
                    )}
                </small>
            </td>
        </tr>
    `;
}


function renderSubmittedReportsError(error) {

    const tbody =
        document.getElementById(
            "submittedReportsTableBody"
        );

    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td
                colspan="4"
                style="padding:30px; text-align:center; color:#C0392B;"
            >
                Failed to load submitted reports.
                <br>
                <small>
                    ${escapeHtml(
                        error?.message ||
                        "Please check the server."
                    )}
                </small>
            </td>
        </tr>
    `;
}


/* ============================================================
   HELPERS
============================================================ */

function formatReportDate(dateValue) {

    if (!dateValue) {
        return "—";
    }

    const date =
        new Date(dateValue);

    if (isNaN(date.getTime())) {
        return String(dateValue);
    }

    return date.toLocaleDateString(
        "en-US",
        {
            month: "numeric",
            day: "numeric",
            year: "numeric"
        }
    );
}


function setText(id, value) {

    const element =
        document.getElementById(id);

    if (element) {
        element.textContent =
            value ?? "—";
    }
}

/* ============================================================
   FORMAT HELPERS
============================================================ */

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
    if (!isNaN(numericVolume)) return numericVolume.toLocaleString() + "kg";
    return String(volume);
}



/* ============================================================
   OFFTAKE REQUESTS
============================================================ */

function initOfftakeRequest() {
    const list = document.getElementById("offtakeListSubview");
    const submitSub = document.getElementById("submitOfftakeSubview");
    const confirmSub = document.getElementById("confirmOfftakeSubview");
    const submittedModal = document.getElementById("offtakeSubmittedModal");

    fetchOfftakeRequests();

    document.getElementById("createOfftakeBtn")?.addEventListener("click", function() {
        currentOfftakeRequest = null;
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
        const farmerId = document.getElementById("offtakeFarmerId");

        if (!farmerSelect || !farmerSelect.value) {
            alert("Please select a farmer.");
            return;
        }
        if (farmerId) farmerId.value = farmerSelect.value;

        const data = collectOfftakeFormData();
        data.farmer_id = Number(farmerSelect.value);
        data.farmer_name = farmerSelect.options[farmerSelect.selectedIndex].text;

        if (!validateOfftakeForm(data)) return;

        currentOfftakeRequest = data;
        populateOfftakeReview(data);

        if (submitSub) submitSub.classList.add("hidden-element");
        if (confirmSub) confirmSub.classList.remove("hidden-element");
    });

    document.getElementById("backToSubmitOfftakeBtn")?.addEventListener("click", function() {
        if (currentOfftakeRequest) populateOfftakeForm(currentOfftakeRequest);
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

    document.getElementById("closeOfftakeSuccessBtn")?.addEventListener("click", function() {
        const modal = document.getElementById("offtakeSuccessModal");
        if (modal) modal.classList.remove("show");
        if (submittedModal) submittedModal.classList.remove("show");
        if (confirmSub) confirmSub.classList.add("hidden-element");
        if (submitSub) submitSub.classList.add("hidden-element");
        if (list) list.classList.remove("hidden-element");
        currentOfftakeRequest = null;
        resetOfftakeForm();
    });
}

async function fetchOfftakeRequests() {
    const tbody = document.getElementById("offtakeTableBody");
    if (!tbody) {
        console.error("offtakeTableBody not found.");
        return;
    }

    tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center;">Loading offtake requests...</td></tr>`;

    try {
        const requests = await apiRequest(OFFTAKE_REQUESTS_ENDPOINT, { method: "GET" });
        console.log("Offtake Requests API response:", requests);

        if (!Array.isArray(allFarmers) || allFarmers.length === 0) {
            await fetchFarmers();
        }

        tbody.innerHTML = "";

        if (!requests || requests.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center; color:#777;">No offtake requests found.</td></tr>`;
            return;
        }

        requests.forEach(function(request) {
            let farmer = null;
            const requestFarmerId = request.farmer_id;
            if (requestFarmerId) {
                farmer = allFarmers.find(function(f) { return f.farmer_id == requestFarmerId; });
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
                <td><span class="pill">${escapeHtml(request.quantity || "—")} kg</span></td>
                <td><span class="pill">${escapeHtml(farmerLocation)}</span></td>
                <td><span class="pill">${escapeHtml(request.harvest_date || "—")}</span></td>
                <td><span class="status-pill submitted">Submitted</span></td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error("Unable to load offtake requests:", error);
        tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center; color:#C0392B;">Failed to load offtake requests.<br><small>${escapeHtml(error.message || "Please check the FastAPI server.")}</small></td></tr>`;
    }
}

function collectOfftakeFormData() {
    return {
        farmer_name: getOfftakeValue(["offtakeFarmerName", "farmerName", "offtakeFarmer"]),
        farmer_id: getOfftakeValue(["offtakeFarmerId", "farmerId", "offtakeFarmerID"]),
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
    for (var i = 0; i < ids.length; i++) {
        var element = document.getElementById(ids[i]);
        if (element) {
            return (element.value || "").toString().trim();
        }
    }
    return "";
}

function validateOfftakeForm(data) {
    if (!data.farmer_name) { alert("Please enter Farmer Name."); return false; }
    if (!data.farmer_id) { alert("Please enter Farmer ID."); return false; }
    if (!/^\d+$/.test(data.farmer_id)) { alert("Farmer ID must be a valid whole number."); return false; }
    if (!data.commodity) { alert("Please enter Commodity."); return false; }
    if (!data.quantity) { alert("Please enter Quantity."); return false; }
    var quantityValue = data.quantity.replace(/,/g, "").trim();
    if (!/^\d+(\.\d+)?$/.test(quantityValue)) { alert("Quantity must be a valid number."); return false; }
    if (!data.selling_price) { alert("Please enter Selling Price."); return false; }
    var sellingPriceValue = data.selling_price.replace(/,/g, "").replace(/₱/g, "").trim();
    if (!/^\d+(\.\d+)?$/.test(sellingPriceValue)) { alert("Selling Price must be a valid number."); return false; }
    if (!data.harvest_date) { alert("Please select Harvest Date."); return false; }
    return true;
}

function populateOfftakeReview(data) {
    var values = {
        farmer_name: data.farmer_name,
        farmer_id: data.farmer_id,
        commodity: data.commodity,
        quantity: data.quantity,
        selling_price: data.selling_price,
        harvest_date: formatPlantingDate(data.harvest_date),
        commodity_photo: data.commodity_photo || "",
        buyer: data.buyer || "",
        delivery_location: data.delivery_location || ""
    };

    setReviewValue(["reviewFarmerName", "confirmFarmerName", "reviewOfftakeFarmerName"], values.farmer_name);
    setReviewValue(["reviewFarmerId", "confirmFarmerId", "reviewOfftakeFarmerId"], values.farmer_id);
    setReviewValue(["reviewCommodity", "confirmCommodity", "reviewOfftakeCommodity"], values.commodity);
    setReviewValue(["reviewQuantity", "confirmQuantity", "reviewOfftakeQuantity"], values.quantity);
    setReviewValue(["reviewSellingPrice", "confirmSellingPrice", "reviewOfftakeSellingPrice"], values.selling_price);
    setReviewValue(["reviewHarvestDate", "confirmHarvestDate", "reviewOfftakeHarvestDate"], values.harvest_date);
    setReviewValue(["reviewCommodityPhoto", "confirmCommodityPhoto", "reviewOfftakeCommodityPhoto"], values.commodity_photo);
    setReviewValue(["reviewBuyer", "confirmBuyer", "reviewOfftakeBuyer"], values.buyer);
    setReviewValue(["reviewDeliveryLocation", "confirmLocation", "confirmDeliveryLocation", "reviewOfftakeDeliveryLocation"], values.delivery_location);
}

function setReviewValue(ids, value) {
    for (var i = 0; i < ids.length; i++) {
        var element = document.getElementById(ids[i]);
        if (element) {
            var safeValue = value || "-";
            element.textContent = safeValue;
            if ("value" in element) {
                element.value = value || "";
            }
            return;
        }
    }
}

function populateOfftakeForm(data) {
    setOfftakeValue(["offtakeFarmerName", "farmerName", "offtakeFarmer"], data.farmer_name);
    setOfftakeValue(["offtakeFarmerId", "farmerId", "offtakeFarmerID"], data.farmer_id);
    setOfftakeValue(["offtakeCommodity", "commodity"], data.commodity);
    setOfftakeValue(["offtakeQuantity", "quantity"], data.quantity);
    setOfftakeValue(["offtakeSellingPrice", "sellingPrice"], data.selling_price);
    setOfftakeValue(["offtakeHarvestDate", "harvestDate"], data.harvest_date);
    setOfftakeValue(["offtakeCommodityPhoto", "commodityPhoto"], data.commodity_photo);
    setOfftakeValue(["offtakeBuyer", "buyer"], data.buyer);
    setOfftakeValue(["offtakeDeliveryLocation", "deliveryLocation"], data.delivery_location);
}

function setOfftakeValue(ids, value) {
    for (var i = 0; i < ids.length; i++) {
        var element = document.getElementById(ids[i]);
        if (element) {
            element.value = value || "";
            return;
        }
    }
}

async function submitOfftakeRequest() {
    if (!currentOfftakeRequest) {
        alert("No Offtake Request data found.");
        return;
    }

    var sendOfftakeBtn = document.getElementById("sendOfftakeBtn");
    if (sendOfftakeBtn) {
        sendOfftakeBtn.disabled = true;
        sendOfftakeBtn.textContent = "Submitting...";
    }

    try {
        var data = currentOfftakeRequest;
        var farmerId = parseInt(data.farmer_id, 10);
        if (!Number.isInteger(farmerId)) {
            throw new Error("Farmer ID must be a valid whole number.");
        }

        var quantity = String(data.quantity).replace(/,/g, "").trim();
        var sellingPrice = String(data.selling_price).replace(/,/g, "").replace(/₱/g, "").trim();

        if (!/^\d+(\.\d+)?$/.test(quantity)) {
            throw new Error("Quantity must be a valid decimal number.");
        }
        if (!/^\d+(\.\d+)?$/.test(sellingPrice)) {
            throw new Error("Selling Price must be a valid decimal number.");
        }

        var payload = {
            farmer_id: farmerId,
            commodity: data.commodity,
            quantity: quantity,
            selling_price: sellingPrice,
            harvest_date: data.harvest_date,
            commodity_photo: data.commodity_photo || null
        };

        console.log("Submitting Offtake Request:", payload);

        var response = await apiRequest(OFFTAKE_REQUESTS_ENDPOINT, {
            method: "POST",
            body: JSON.stringify(payload)
        });

        console.log("Offtake Request API response:", response);

        await fetchOfftakeRequests();

        var successModal = document.getElementById("offtakeSuccessModal");
        if (successModal) successModal.classList.add("show");

    } catch (error) {
        console.error("Create Offtake Request error:", error);
        handleAuthError(error);
        alert("Failed to submit Offtake Request.\n\n" + (error.message || "Please check the FastAPI server."));
    } finally {
        if (sendOfftakeBtn) {
            sendOfftakeBtn.disabled = false;
            sendOfftakeBtn.textContent = "Submit Request";
        }
    }
}

function resetOfftakeForm() {
    var possibleFormIds = ["offtakeRequestForm", "submitOfftakeForm", "createOfftakeForm"];
    for (var i = 0; i < possibleFormIds.length; i++) {
        var form = document.getElementById(possibleFormIds[i]);
        if (form) {
            form.reset();
            break;
        }
    }
    currentOfftakeRequest = null;
}

/* ============================================================
   FAIR PRICE
============================================================ */

function initFairPrice() {
    var select = document.getElementById("fairPriceCropSelect");
    var img = document.getElementById("cropImageDisplay");

    if (!select || !img) return;

    select.addEventListener("change", function(event) {
        var crop = event.target.value;
        if (crop === "tomato") {
            img.src = "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=600&auto=format&fit=crop&q=80";
        } else {
            img.src = "https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=600&auto=format&fit=crop&q=80";
        }
    });
}

/* ============================================================
   HELPER FUNCTIONS
============================================================ */

function getValue(id) {
    var element = document.getElementById(id);
    if (!element) return "";
    return (element.value || "").trim();
}

function setValue(id, value) {
    var element = document.getElementById(id);
    if (!element) {
        console.warn("Element with id \"" + id + "\" not found.");
        return;
    }
    var safeValue = value || "";
    if ("value" in element) {
        element.value = safeValue;
        return;
    }
    element.textContent = safeValue;
}

function escapeHtml(value) {
    return String(value || "")
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
    var farmers = allFarmers || [];
    var dropdowns = ['piFarmerName', 'offtakeFarmerSelect'];

    dropdowns.forEach(function(dropdownId) {
        var dropdown = document.getElementById(dropdownId);
        if (dropdown) {
            dropdown.innerHTML = '';
            var defaultOpt = document.createElement('option');
            defaultOpt.value = '';
            defaultOpt.textContent = 'Select Farmer';
            dropdown.appendChild(defaultOpt);

            if (Array.isArray(farmers) && farmers.length > 0) {
                farmers.forEach(function(farmer) {
                    var option = document.createElement('option');
                    option.value = farmer.farmer_id;
                    var fullName = [farmer.first_name, farmer.middle_name, farmer.last_name, farmer.suffix].filter(Boolean).join(" ");
                    option.textContent = fullName || farmer.rsbsa_id || "Farmer " + farmer.farmer_id;
                    option.dataset.farmerId = farmer.farmer_id;
                    dropdown.appendChild(option);
                });
            }
        }
    });
}

function setupFarmerDropdownAutoFill() {
    var piFarmerName = document.getElementById('piFarmerName');
    var piFarmerId = document.getElementById('piFarmerId');
    if (piFarmerName && piFarmerId) {
        piFarmerName.addEventListener('change', function() {
            var selectedOption = this.options[this.selectedIndex];
            if (selectedOption && selectedOption.value) {
                piFarmerId.value = selectedOption.value;
            } else {
                piFarmerId.value = '';
            }
        });
    }

    var offtakeFarmerSelect = document.getElementById('offtakeFarmerSelect');
    var offtakeFarmerId = document.getElementById('offtakeFarmerId');
    if (offtakeFarmerSelect && offtakeFarmerId) {
        offtakeFarmerSelect.addEventListener('change', function() {
            var selectedOption = this.options[this.selectedIndex];
            if (selectedOption && selectedOption.value) {
                offtakeFarmerId.value = selectedOption.value;
            } else {
                offtakeFarmerId.value = '';
            }
        });
    }
}

function refreshFarmerDropdowns() {
    populateFarmerDropdowns();
    setupFarmerDropdownAutoFill();
}

// Override fetchFarmers to include dropdown refresh
var originalFetchFarmers = fetchFarmers;
fetchFarmers = async function() {
    var result = await originalFetchFarmers.call(this);
    if (allFarmers && allFarmers.length > 0) {
        refreshFarmerDropdowns();
    }
    return result;
};

// Override submitPlantingIntent to use dropdown values
var originalSubmitPlantingIntent = submitPlantingIntent;
submitPlantingIntent = async function() {
    var form = document.getElementById("submitPlantIntentForm");
    if (!form) {
        alert("Planting Intent form not found.");
        return;
    }

    var farmerNameSelect = document.getElementById("piFarmerName");
    var farmerName = farmerNameSelect ? farmerNameSelect.options[farmerNameSelect.selectedIndex]?.text || "" : "";
    var farmerId = document.getElementById("piFarmerId")?.value || "";
    var plantingDate = document.getElementById("piPlantDate")?.value || "";
    var harvestDate = document.getElementById("piHarvestDate")?.value || "";
    var commodity = document.getElementById("piCommodity")?.value?.trim() || "";
    var volume = document.getElementById("piVolume")?.value || "";
    var remarks = document.getElementById("piRemarks")?.value || "";

    if (!farmerName || farmerName === "Select Farmer") {
        alert("Please select a Farmer.");
        return;
    }
    if (!farmerId) {
        alert("Farmer ID is required.");
        return;
    }
    if (!plantingDate) {
        alert("Please select Planting Date.");
        return;
    }
    if (!harvestDate) {
        alert("Please select Harvest Date.");
        return;
    }
    if (!commodity) {
        alert("Please enter Commodity.");
        return;
    }
    if (!volume) {
        alert("Please enter Volume.");
        return;
    }

    var parsedFarmerId = Number(farmerId);
    if (!Number.isInteger(parsedFarmerId)) {
        alert("Farmer ID must be a valid number.");
        return;
    }

    var parsedVolume = Number(volume);
    if (isNaN(parsedVolume) || parsedVolume <= 0) {
        alert("Volume must be a valid positive number.");
        return;
    }

    var plantingIntentData = {
        farmer_id: parsedFarmerId,
        commodity: commodity,
        volume: parsedVolume,
        planting_date: plantingDate,
        harvest_date: harvestDate,
        remarks: remarks || undefined
    };

    console.log("Submitting planting intent:", plantingIntentData);

    try {
        var createdIntent = await apiRequest(PLANTING_INTENTS_ENDPOINT, {
            method: "POST",
            body: JSON.stringify(plantingIntentData)
        });

        console.log("Planting intent created:", createdIntent);
        await fetchPlantingIntents();

        var modal = document.getElementById("plantIntentSubmittedModal");
        if (modal) modal.classList.add("show");

    } catch (error) {
        console.error("Create planting intent error:", error);
        handleAuthError(error);
        alert("Failed to submit planting intent.\n\n" + (error.message || "Please check the FastAPI server."));
    }
};

// Initialize dropdowns on DOM load
document.addEventListener("DOMContentLoaded", function() {
    setTimeout(function() {
        if (allFarmers && allFarmers.length > 0) {
            refreshFarmerDropdowns();
        }
    }, 1000);
});


/* ============================================================
   FAIR PRICE MONTH DROPDOWN
============================================================ */

function initFairPriceMonthDropdown() {
    const monthButton = document.getElementById('fairPriceMonthButton');
    const monthDropdown = document.getElementById('customMonthDropdown');
    const monthMenu = document.getElementById('fairPriceMonthMenu');
    const monthText = document.getElementById('fairPriceMonthText');
    const monthSelect = document.getElementById('fairPriceMonthSelect');
    const monthOptions = document.querySelectorAll('.month-option');

    if (!monthButton || !monthDropdown || !monthMenu) {
        console.warn('Month dropdown elements not found.');
        return;
    }

    // Toggle dropdown on button click
    monthButton.addEventListener('click', function(e) {
        e.stopPropagation();
        const isOpen = monthDropdown.classList.contains('open');
        monthDropdown.classList.toggle('open');
        this.setAttribute('aria-expanded', !isOpen);
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
        if (!monthDropdown.contains(e.target)) {
            monthDropdown.classList.remove('open');
            monthButton.setAttribute('aria-expanded', 'false');
        }
    });

    // Handle month option selection
    monthOptions.forEach(function(option) {
        option.addEventListener('click', function(e) {
            e.stopPropagation();
            
            // Update active state
            monthOptions.forEach(function(opt) {
                opt.classList.remove('active');
            });
            this.classList.add('active');
            
            // Update button text
            const value = this.getAttribute('data-value');
            const text = this.textContent.trim();
            monthText.textContent = text;
            
            // Update hidden select
            monthSelect.value = value;
            
            // Trigger change event on hidden select for any listeners
            const changeEvent = new Event('change', { bubbles: true });
            monthSelect.dispatchEvent(changeEvent);
            
            // Close dropdown
            monthDropdown.classList.remove('open');
            monthButton.setAttribute('aria-expanded', 'false');
            
            // Optional: Call a function to update the price display based on month
            if (typeof updateFairPriceDisplay === 'function') {
                updateFairPriceDisplay(value);
            }
        });
    });

    // Sync hidden select with button text when changed elsewhere
    monthSelect.addEventListener('change', function() {
        const selectedOption = document.querySelector('.month-option[data-value="' + this.value + '"]');
        if (selectedOption) {
            monthOptions.forEach(function(opt) {
                opt.classList.remove('active');
            });
            selectedOption.classList.add('active');
            monthText.textContent = selectedOption.textContent.trim();
        }
    });
}

// Optional: Update price display based on selected month
function updateFairPriceDisplay(month) {
    console.log('Month selected:', month);
    // You can add logic here to update the price metrics
    // based on the selected month (e.g., fetch price data for that month)
    // For example:
    // const crop = document.getElementById('fairPriceCropSelect').value;
    // updatePriceMetrics(crop, month);
}

/* ============================================================
   FORECAST RESULTS
============================================================ */

/* ============================================================
   FORECAST RESULTS - UPDATED
============================================================ */

/* ============================================================
   FORECAST RESULTS - INIT
============================================================ */

/* ============================================================
   FORECAST RESULTS - COMPLETE FIXED
============================================================ */

function initForecastResults() {
    console.log("Initializing Forecast Results...");
    
    const forecastView = document.getElementById("view-fair-prices");
    if (!forecastView) {
        console.warn("view-fair-prices not found in DOM");
        return;
    }
    
    console.log("Forecast view found:", forecastView);
    
    // Check if already visible
    if (forecastView.classList.contains("active-view")) {
        console.log("Fair Prices view is currently active, loading forecasts...");
        setTimeout(function() {
            loadForecastResults();
            setTimeout(initPriceChart, 500);
        }, 300);
    }
    
    // Listen for when the view becomes active
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                if (forecastView.classList.contains('active-view')) {
                    console.log("Fair Prices view became active, loading forecasts...");
                    loadForecastResults();
                    setTimeout(initPriceChart, 500);
                }
            }
        });
    });
    observer.observe(forecastView, { attributes: true });
    
    // Also listen for nav clicks
    const forecastNav = document.querySelector('.nav-item[data-view="fair-prices"]');
    if (forecastNav) {
        forecastNav.addEventListener('click', function() {
            console.log("Fair Prices nav clicked, loading forecasts...");
            setTimeout(function() {
                loadForecastResults();
                setTimeout(initPriceChart, 500);
            }, 200);
        });
    } else {
        console.warn("Nav item with data-view='fair-prices' not found");
    }
    
    // Safety check
    setTimeout(function() {
        if (forecastView.classList.contains('active-view')) {
            console.log("Safety check: loading forecasts...");
            loadForecastResults();
            setTimeout(initPriceChart, 500);
        }
    }, 1000);
}


async function loadForecastResults() {
    console.log("loadForecastResults() called...");
    
    const container = document.getElementById("forecastResultsContainer");
    if (!container) {
        console.warn("forecastResultsContainer not found.");
        return;
    }

    console.log("Container found, loading forecasts...");

    // Show loading state
    container.innerHTML = `
        <div style="padding: 40px; text-align: center; color: #777; font-size: 15px;">
            <div style="display: inline-block; width: 30px; height: 30px; border: 3px solid #E5E5E5; border-top-color: #2E7D32; border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 10px;"></div>
            <br>Loading forecast results...
        </div>
    `;

    try {
        console.log("Fetching from:", FORECASTS_ENDPOINT);
        const forecasts = await apiRequest(FORECASTS_ENDPOINT, { method: "GET" });
        console.log("Forecast Results API response:", forecasts);

        if (!Array.isArray(forecasts)) {
            throw new Error("Invalid forecast response.");
        }

        FORECASTS_DATA = forecasts;
        renderForecastResults(forecasts);
        
        // ✅ Initialize chart after rendering
        setTimeout(function() {
            initPriceChart();
        }, 300);

    } catch (error) {
        console.error("Failed to load forecast results:", error);
        container.innerHTML = `
            <div style="padding: 40px; text-align: center; color: #C0392B; font-size: 15px;">
                <div style="font-size: 40px; margin-bottom: 10px;">⚠️</div>
                <strong>Failed to load forecast results.</strong>
                <br><small style="color: #999;">${escapeHtml(error.message || "Please check the FastAPI server.")}</small>
                <br><br>
                <button onclick="loadForecastResults()" style="padding: 8px 20px; background: #2E7D32; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                    🔄 Retry
                </button>
            </div>
        `;
    }
}

// Update price metrics
function updatePriceMetrics(forecasts) {
    const lowestPriceEl = document.getElementById("lowestPriceDisplay");
    const highestPriceEl = document.getElementById("highestPriceDisplay");
    
    if (!lowestPriceEl || !highestPriceEl) return;
    
    let allPrices = [];
    forecasts.forEach(function(f) {
        // ✅ Use forecast_price_low and forecast_price_high
        if (f.forecast_price_low) allPrices.push(Number(f.forecast_price_low));
        if (f.forecast_price_high) allPrices.push(Number(f.forecast_price_high));
    });
    
    if (allPrices.length === 0) {
        lowestPriceEl.innerHTML = '₱0 <span style="font-size: 13px; font-weight: 500; color: #fff;">/kg</span>';
        highestPriceEl.innerHTML = '₱0 <span style="font-size: 13px; font-weight: 500; color: #fff;">/kg</span>';
        return;
    }
    
    const minPrice = Math.min(...allPrices);
    const maxPrice = Math.max(...allPrices);
    
    lowestPriceEl.innerHTML = `₱${minPrice.toFixed(2)} <span style="font-size: 13px; font-weight: 500; color: #fff;">/kg</span>`;
    highestPriceEl.innerHTML = `₱${maxPrice.toFixed(2)} <span style="font-size: 13px; font-weight: 500; color: #fff;">/kg</span>`;
}

// Tawagin ito sa loob ng renderForecastResults() after mag-render ng container
// Ilagay sa dulo ng renderForecastResults():
updatePriceMetrics(forecasts);

function groupForecastsByYear(forecasts) {
    const grouped = {};

    forecasts.forEach(function(forecast) {
        // ✅ Use forecast_date from your API
        let dateString = forecast.forecast_date || forecast.date || forecast.created_at;
        if (!dateString) return;

        const date = new Date(dateString);
        if (isNaN(date.getTime())) return;

        const year = date.getFullYear();
        if (!grouped[year]) {
            grouped[year] = [];
        }
        grouped[year].push(forecast);
    });

    return grouped;
}

function groupForecastsByMonth(forecasts) {
    const grouped = {};

    forecasts.forEach(function(forecast) {
        // ✅ Use forecast_date from your API
        let dateString = forecast.forecast_date || forecast.date || forecast.created_at;
        if (!dateString) return;

        const date = new Date(dateString);
        if (isNaN(date.getTime())) return;

        const month = date.toLocaleString('en-US', { month: 'long' });
        if (!grouped[month]) {
            grouped[month] = [];
        }
        grouped[month].push(forecast);
    });

    return grouped;
}


/* ============================================================
   FORECAST TOGGLE FUNCTIONS
============================================================ */

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
}

// Add CSS animation for loading spinner
const style = document.createElement('style');
style.textContent = `
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);

/* ============================================================
   RENDER FORECAST RESULTS - COMPLETE
============================================================ */

function renderForecastResults(forecasts) {
    console.log("renderForecastResults called with", forecasts.length, "forecasts");
    
    const container = document.getElementById("forecastResultsContainer");
    if (!container) {
        console.warn("forecastResultsContainer not found.");
        return;
    }

    if (!forecasts || forecasts.length === 0) {
        container.innerHTML = `
            <div style="padding: 40px; text-align: center; color: #777; font-size: 15px;">
                <div style="font-size: 40px; margin-bottom: 10px;">📊</div>
                No forecast results available.
                <br><small style="color: #999;">Please check back later.</small>
            </div>
        `;
        return;
    }

    // Group forecasts by year
    const groupedByYear = groupForecastsByYear(forecasts);

    let html = '';

    // Sort years descending (newest first)
    const sortedYears = Object.keys(groupedByYear).sort().reverse();

    sortedYears.forEach(function(year) {
        const yearData = groupedByYear[year];
        
        // Group by month within the year
        const groupedByMonth = groupForecastsByMonth(yearData);

        html += `
            <div class="forecast-year-group" style="margin-bottom: 16px;">
                <div class="forecast-year-header" style="
                    background: #2E7D32;
                    color: #fff;
                    padding: 12px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-weight: 600;
                    font-size: 16px;
                    transition: background 0.2s;
                " onclick="toggleForecastYear(this)">
                    <span>📅 ${year} Projections</span>
                    <span style="font-size: 20px; transition: transform 0.3s;">▼</span>
                </div>
                <div class="forecast-year-content" style="
                    background: #fff;
                    border: 1px solid #E5E5E5;
                    border-top: none;
                    border-radius: 0 0 8px 8px;
                    padding: 8px 12px;
                    margin-top: 0;
                    overflow: hidden;
                    transition: max-height 0.3s ease;
                ">
        `;

        // Sort months chronologically (January to December)
        const monthOrder = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const sortedMonths = Object.keys(groupedByMonth).sort(function(a, b) {
            return monthOrder.indexOf(a) - monthOrder.indexOf(b);
        });

        sortedMonths.forEach(function(month, monthIndex) {
            const monthData = groupedByMonth[month];
            
            // Sort commodities alphabetically
            const sortedCommodities = monthData.sort(function(a, b) {
                const commodityA = a.commodity || '';
                const commodityB = b.commodity || '';
                return commodityA.localeCompare(commodityB);
            });

            // ✅ Check if this is the first month
            const isFirstMonth = monthIndex === 0;
            const displayStyle = isFirstMonth ? 'block' : 'none';
            const arrowRotation = isFirstMonth ? 'rotate(90deg)' : 'rotate(0deg)';

            html += `
                <div class="forecast-month-group" style="margin-bottom: 4px;">
                    <div class="forecast-month-header" style="
                        padding: 10px 12px;
                        cursor: pointer;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        background: #F6F3EB;
                        border-radius: 6px;
                        font-weight: 500;
                        font-size: 14px;
                        transition: background 0.2s;
                    " onclick="toggleForecastMonth(this)">
                        <span>📆 ${month} ${year}</span>
                        <span style="font-size: 16px; transition: transform 0.3s; transform: ${arrowRotation};">▶</span>
                    </div>
                    <div class="forecast-month-content" style="
                        padding: 8px 12px;
                        background: #FAF8F5;
                        border-radius: 0 0 6px 6px;
                        display: ${displayStyle};
                    ">
                        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                            <thead>
                                <tr style="border-bottom: 2px solid #DEDDDC;">
                                    <th style="text-align: left; padding: 8px 6px; font-weight: 600; color: #333;">Commodity</th>
                                    <th style="text-align: center; padding: 8px 6px; font-weight: 600; color: #333;">Lower Price (₱)</th>
                                    <th style="text-align: center; padding: 8px 6px; font-weight: 600; color: #333;">Upper Price (₱)</th>
                                    <th style="text-align: center; padding: 8px 6px; font-weight: 600; color: #333;">Range</th>
                                </tr>
                            </thead>
                            <tbody>
            `;

            sortedCommodities.forEach(function(forecast, index) {
                const commodity = forecast.commodity || forecast.crop || '—';
                const lowerPrice = Number(forecast.forecast_price_low || 0);
                const upperPrice = Number(forecast.forecast_price_high || 0);
                const lowerPriceStr = lowerPrice.toFixed(2);
                const upperPriceStr = upperPrice.toFixed(2);
                const bgColor = index % 2 === 0 ? 'transparent' : '#F6F3EB';
                
                html += `
                    <tr style="background: ${bgColor}; border-bottom: 1px solid #F0EDE8;">
                        <td style="padding: 8px 6px; font-weight: 500;">${escapeHtml(commodity)}</td>
                        <td style="padding: 8px 6px; text-align: center;">₱${lowerPriceStr}</td>
                        <td style="padding: 8px 6px; text-align: center;">₱${upperPriceStr}</td>
                        <td style="padding: 8px 6px; text-align: center;">
                            <span style="
                                background: #2E7D32;
                                color: #fff;
                                padding: 2px 12px;
                                border-radius: 12px;
                                font-size: 12px;
                                font-weight: 600;
                            ">₱${lowerPriceStr} – ₱${upperPriceStr}</span>
                        </td>
                    </tr>
                `;
            });

            html += `
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    // ✅ Auto-expand the first year
    const firstYearContent = container.querySelector('.forecast-year-content');
    if (firstYearContent) {
        firstYearContent.style.maxHeight = firstYearContent.scrollHeight + 'px';
    }

    // Update price metrics
    updatePriceMetrics(forecasts);

    // Add forecast count
    const countDiv = document.createElement('div');
    countDiv.style.cssText = 'margin-top: 12px; padding: 12px 0; font-size: 13px; color: #666; text-align: right; border-top: 1px solid #E5E5E5;';
    countDiv.textContent = `Total: ${forecasts.length} forecast(s) found.`;
    container.appendChild(countDiv);
    
    console.log("Forecast rendering complete!");
}
/* ============================================================
   PRICE TREND CHART
============================================================ */


function initPriceChart() {
    console.log("🔍 initPriceChart called...");
    
    const canvas = document.getElementById('priceTrendChart');
    if (!canvas) {
        console.warn('❌ Price trend chart canvas not found');
        return;
    }
    console.log('✅ Canvas found');
    
    if (typeof Chart === 'undefined') {
        console.warn('⚠️ Chart.js not loaded yet, waiting...');
        setTimeout(initPriceChart, 500);
        return;
    }
    console.log('✅ Chart.js loaded');
    
    const forecasts = FORECASTS_DATA || [];
    console.log('📊 Forecasts data:', forecasts.length, 'records');
    
    if (forecasts.length === 0) {
        console.warn('❌ No forecast data available for chart');
        if (canvas.parentElement) {
            canvas.parentElement.innerHTML = `
                <div style="padding: 40px; text-align: center; color: #777; font-size: 15px;">
                    <div style="font-size: 40px; margin-bottom: 10px;">📊</div>
                    No price data available for chart.
                    <br><small style="color: #999;">Please load forecast data first.</small>
                </div>
            `;
        }
        return;
    }
    
    renderChart(forecasts, 'all');
}

function renderChart(forecasts, commodityFilter) {
    console.log("🔍 renderChart called with filter:", commodityFilter);
    
    const canvas = document.getElementById('priceTrendChart');
    if (!canvas) {
        console.warn('❌ Canvas not found');
        return;
    }
    
    // Destroy existing chart
    if (priceChartInstance) {
        console.log('🔄 Destroying existing chart...');
        priceChartInstance.destroy();
        priceChartInstance = null;
    }
    
    let filteredData = forecasts;
    if (commodityFilter !== 'all') {
        filteredData = forecasts.filter(function(f) {
            return f.commodity === commodityFilter;
        });
        console.log('📊 Filtered to', filteredData.length, 'records for', commodityFilter);
    }
    
    if (filteredData.length === 0) {
        console.warn('❌ No data for filter:', commodityFilter);
        if (canvas.parentElement) {
            canvas.parentElement.innerHTML = `
                <div style="padding: 40px; text-align: center; color: #777; font-size: 15px;">
                    <div style="font-size: 40px; margin-bottom: 10px;">📊</div>
                    No data available for ${commodityFilter}.
                </div>
            `;
        }
        return;
    }
    
    // Group by commodity
    const commodities = {};
    filteredData.forEach(function(f) {
        const commodity = f.commodity || 'Unknown';
        if (!commodities[commodity]) {
            commodities[commodity] = [];
        }
        commodities[commodity].push(f);
    });
    console.log('📦 Commodities found:', Object.keys(commodities));
    
    // Sort by date
    Object.keys(commodities).forEach(function(commodity) {
        commodities[commodity].sort(function(a, b) {
            return new Date(a.forecast_date) - new Date(b.forecast_date);
        });
    });
    
    // Prepare datasets with professional colors
    const datasets = [];
    const colorPalette = {
        'Tomato': {
            main: '#E74C3C',
            light: 'rgba(231, 76, 60, 0.15)',
            gradient: ['rgba(231, 76, 60, 0.3)', 'rgba(231, 76, 60, 0.05)']
        },
        'Squash fruit': {
            main: '#F39C12',
            light: 'rgba(243, 156, 18, 0.15)',
            gradient: ['rgba(243, 156, 18, 0.3)', 'rgba(243, 156, 18, 0.05)']
        },
        'Red Onion': {
            main: '#8E44AD',
            light: 'rgba(142, 68, 173, 0.15)',
            gradient: ['rgba(142, 68, 173, 0.3)', 'rgba(142, 68, 173, 0.05)']
        },
        'White Onion': {
        main: '#1ABC9C',  // Teal/Cyan color
        light: 'rgba(26, 188, 156, 0.15)',
        gradient: ['rgba(26, 188, 156, 0.3)', 'rgba(26, 188, 156, 0.05)']
    },
    };
    
    const defaultColors = ['#E74C3C', '#F39C12', '#2ECC71', '#3498DB', '#9B59B6', '#1ABC9C', '#E67E22', '#2C3E50'];
    let colorIndex = 0;
    
    // Get all unique dates
    const allDates = [];
    Object.keys(commodities).forEach(function(commodity) {
        commodities[commodity].forEach(function(f) {
            const date = new Date(f.forecast_date);
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            if (!allDates.includes(dateStr)) {
                allDates.push(dateStr);
            }
        });
    });
    allDates.sort(function(a, b) {
        const dateA = new Date(a);
        const dateB = new Date(b);
        return dateA - dateB;
    });
    console.log('📅 Dates:', allDates);
    
    Object.keys(commodities).forEach(function(commodity, idx) {
        const data = commodities[commodity];
        
        let colorObj = colorPalette[commodity];
        if (!colorObj) {
            const mainColor = defaultColors[colorIndex % defaultColors.length];
            colorObj = {
                main: mainColor,
                light: mainColor + '33',
                gradient: [mainColor + '44', mainColor + '11']
            };
            colorIndex++;
        }
        
        const lowerPrices = [];
        const upperPrices = [];
        
        allDates.forEach(function(dateStr) {
            const found = data.find(function(f) {
                const d = new Date(f.forecast_date);
                return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) === dateStr;
            });
            
            if (found) {
                lowerPrices.push(parseFloat(found.forecast_price_low || 0));
                upperPrices.push(parseFloat(found.forecast_price_high || 0));
            } else {
                lowerPrices.push(null);
                upperPrices.push(null);
            }
        });
        
        // Lower price - solid line with fill
        datasets.push({
            label: commodity + ' (Low)',
            data: lowerPrices,
            borderColor: colorObj.main,
            backgroundColor: function(context) {
                const chart = context.chart;
                const {ctx, chartArea} = chart;
                if (!chartArea) {
                    return colorObj.light;
                }
                const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                gradient.addColorStop(0, colorObj.gradient[0]);
                gradient.addColorStop(1, colorObj.gradient[1]);
                return gradient;
            },
            borderWidth: 3,
            pointRadius: 5,
            pointBackgroundColor: colorObj.main,
            pointBorderColor: '#FFFFFF',
            pointBorderWidth: 2,
            pointHoverRadius: 8,
            tension: 0.4,
            fill: true,
            spanGaps: false
        });
        
        // Upper price - dashed line
        datasets.push({
            label: commodity + ' (High)',
            data: upperPrices,
            borderColor: colorObj.main,
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [6, 4],
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
    
    if (datasets.length === 0) {
        console.warn('❌ No datasets created');
        if (canvas.parentElement) {
            canvas.parentElement.innerHTML = `
                <div style="padding: 40px; text-align: center; color: #777; font-size: 15px;">
                    <div style="font-size: 40px; margin-bottom: 10px;">📊</div>
                    No price data available for chart.
                </div>
            `;
        }
        return;
    }
    
    console.log('📊 Creating chart with', datasets.length, 'datasets');
    
    try {
        const ctx = canvas.getContext('2d');
        priceChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: allDates,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            font: {
                                size: 12,
                                weight: '600',
                                family: 'Plus Jakarta Sans'
                            },
                            boxWidth: 20,
                            boxHeight: 12,
                            padding: 16,
                            usePointStyle: true,
                            pointStyle: 'circle',
                            color: '#2E2A22'
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(46, 42, 34, 0.92)',
                        titleFont: {
                            size: 13,
                            weight: '700',
                            family: 'Plus Jakarta Sans'
                        },
                        bodyFont: {
                            size: 12,
                            weight: '500',
                            family: 'Plus Jakarta Sans'
                        },
                        padding: 12,
                        cornerRadius: 8,
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                let value = context.raw;
                                if (value !== null && value !== undefined) {
                                    const formatted = value.toFixed(2);
                                    label += ': ₱' + formatted + '/kg';
                                } else {
                                    label += ': No data';
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false,
                            drawBorder: true,
                            borderColor: 'rgba(0,0,0,0.08)'
                        },
                        ticks: {
                            font: {
                                size: 11,
                                weight: '600',
                                family: 'Plus Jakarta Sans'
                            },
                            color: '#625E52',
                            maxRotation: 45,
                            minRotation: 30
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(0,0,0,0.06)',
                            drawBorder: true,
                            borderColor: 'rgba(0,0,0,0.08)'
                        },
                        ticks: {
                            callback: function(value) {
                                return '₱' + value.toFixed(0);
                            },
                            font: {
                                size: 11,
                                weight: '600',
                                family: 'Plus Jakarta Sans'
                            },
                            color: '#625E52',
                            stepSize: 10
                        },
                        title: {
                            display: true,
                            text: 'Price (₱/kg)',
                            font: {
                                size: 12,
                                weight: '700',
                                family: 'Plus Jakarta Sans'
                            },
                            color: '#625E52'
                        }
                    }
                },
                elements: {
                    line: {
                        tension: 0.4
                    },
                    point: {
                        hoverRadius: 8
                    }
                },
                layout: {
                    padding: {
                        top: 10,
                        bottom: 10,
                        left: 10,
                        right: 20
                    }
                }
            }
        });
        console.log('✅ Chart rendered successfully!');
    } catch (error) {
        console.error('❌ Error creating chart:', error);
        if (canvas.parentElement) {
            canvas.parentElement.innerHTML = `
                <div style="padding: 40px; text-align: center; color: #C0392B; font-size: 15px;">
                    <div style="font-size: 40px; margin-bottom: 10px;">⚠️</div>
                    Error creating chart: ${error.message}
                </div>
            `;
        }
    }
}

function updateChart(commodity) {
    console.log("🔍 updateChart called with:", commodity);
    
    const forecasts = FORECASTS_DATA || [];
    if (forecasts.length === 0) {
        console.warn('❌ No forecast data available for chart');
        return;
    }
    
    // Update button styles
    document.querySelectorAll('.fair-price-dashboard-container .btn-outline-report').forEach(function(btn) {
        const btnText = btn.textContent.trim();
        if (btnText === commodity || (commodity === 'all' && btnText === 'All')) {
            btn.style.background = '#2E7D32';
            btn.style.color = '#fff';
            btn.style.borderColor = '#2E7D32';
        } else {
            btn.style.background = '#FFFFFF';
            btn.style.color = 'var(--ink)';
            btn.style.borderColor = 'var(--border)';
        }
    });
    
    renderChart(forecasts, commodity);
}

console.log("Price Trend Chart functions loaded!");

/* ============================================================
   AEW NOTIFICATION BELL
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

    // Load once on page load
    await loadAEWNotifications();
}


/* ============================================================
   LOAD AEW NOTIFICATIONS
============================================================ */

async function loadAEWNotifications() {
    const notificationList = document.getElementById("notificationList");
    const notificationDot = document.getElementById("notificationDot");

    if (!notificationList) return;

    try {
        notificationList.innerHTML = `
            <div class="notification-empty">
                Loading notifications...
            </div>
        `;

        const mapResponse = await fetch(
            `${API_BASE_URL}/api/planting-intents/municipality-map`,
            {
                method: "GET",
                headers: getAuthHeaders()
            }
        );

        if (!mapResponse.ok) {
            throw new Error(`Map API error: ${mapResponse.status}`);
        }

        const mapResult = await mapResponse.json();

        if (!mapResult.data || !Array.isArray(mapResult.data)) {
            showNoNotifications();
            return;
        }

        const alerts = [];

        for (const municipalityData of mapResult.data) {
            const municipality = municipalityData.municipality;

            if (!municipalityData.commodities || !Array.isArray(municipalityData.commodities)) {
                continue;
            }

            for (const item of municipalityData.commodities) {
                const commodity = item.commodity;

                try {
                    const alertResponse = await fetch(
                        `${API_BASE_URL}/api/alert-thresholds/oversupply/${encodeURIComponent(commodity)}?municipality=${encodeURIComponent(municipality)}`,
                        {
                            method: "GET",
                            headers: getAuthHeaders()
                        }
                    );

                    if (!alertResponse.ok) {
                        continue;
                    }

                    const alertData = await alertResponse.json();

                    if (alertData.status === "OVERSUPPLY") {
                        const supply = Number(alertData.projected_supply || 0);
                        const demand = Number(alertData.base_demand || 0);
                        let surplusPercentage = 0;

                        if (demand > 0) {
                            surplusPercentage = ((supply - demand) / demand) * 100;
                        }

                        alerts.push({
                            commodity: alertData.commodity || commodity,
                            municipality: alertData.municipality || municipality,
                            supply: supply,
                            demand: demand,
                            surplusPercentage: surplusPercentage,
                            date: new Date()
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
        notificationList.innerHTML = `
            <div class="notification-empty">
                No new notifications.
            </div>
        `;
        if (notificationDot) {
            notificationDot.style.display = "none";
        }
    }
}


/* ============================================================
   RENDER NOTIFICATIONS
============================================================ */

function renderAEWNotifications(alerts) {
    const notificationList = document.getElementById("notificationList");

    if (!notificationList) return;

    if (!alerts.length) {
        showNoNotifications();
        return;
    }

    notificationList.innerHTML = "";

    alerts.forEach(alert => {
        const item = document.createElement("div");
        item.className = "notification-item";
        item.style.padding = "12px 18px";
        item.style.borderBottom = "1px solid var(--border-light)";
        item.style.fontSize = "13px";

        item.innerHTML = `
            <div class="notification-title" style="font-weight:700; color:#C0392B; margin-bottom:4px;">
                🔴 ${escapeHtml(alert.commodity)} Oversupply Risk
            </div>
            <div class="notification-details" style="color:var(--muted); line-height:1.4;">
                <strong>${escapeHtml(alert.municipality)}</strong><br>
                Supply: ${formatKg(alert.supply)}<br>
                Demand: ${formatKg(alert.demand)}<br>
                Surplus: +${Math.round(alert.surplusPercentage)}%
            </div>
        `;

        notificationList.appendChild(item);
    });
}


/* ============================================================
   NO NOTIFICATIONS
============================================================ */

function showNoNotifications() {
    const notificationList = document.getElementById("notificationList");
    const notificationDot = document.getElementById("notificationDot");

    if (notificationList) {
        notificationList.innerHTML = `
            <div class="notification-empty" style="padding: 20px; text-align: center; color: var(--muted); font-size: 13px;">
                No new notifications.
            </div>
        `;
    }

    if (notificationDot) {
        notificationDot.style.display = "none";
    }
}


/* ============================================================
   FORMAT KG
============================================================ */

function formatKg(value) {
    return `${Number(value || 0).toLocaleString(
        "en-US",
        {
            maximumFractionDigits: 2
        }
    )} kg`;
}

