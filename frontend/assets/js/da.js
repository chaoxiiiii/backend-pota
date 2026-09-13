/* ============================================================
   eSAKA — DA-RFO OFFICER DASHBOARD
   Dynamic Buyer Registry + Map + Alert Threshold + Reports + Alerts

   Backend:
   GET  /api/buyer-status/pending
   GET  /api/buyer-status/verified
   PUT  /api/buyer-status/{buyer_status_id}/verify
   PUT  /api/buyer-status/{buyer_status_id}/reject

   Buyer Attachment:
   GET  /api/buyer-registry/{buyer_registry_id}/attachment
============================================================ */


/* ============================================================
   API CONFIGURATION
============================================================ */

const API_BASE_URL = "http://127.0.0.1:8000";

const PENDING_BUYERS_ENDPOINT =
    `${API_BASE_URL}/api/buyer-status/pending`;

const VERIFIED_BUYERS_ENDPOINT =
    `${API_BASE_URL}/api/buyer-status/verified`;

const BUYER_STATUS_ENDPOINT =
    `${API_BASE_URL}/api/buyer-status`;

const BUYER_ATTACHMENT_ENDPOINT =
    `${API_BASE_URL}/api/buyer-registry/buyer-registry`;


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

        headers["Content-Type"] =
            "application/json";

    }

    if (token) {

        headers["Authorization"] =
            `Bearer ${token}`;

    }

    return headers;

}


/* ============================================================
   GLOBAL VARIABLES
============================================================ */

let mapInstance = null;

let currentSelectedBuyer = null;

let pendingBuyersCache = [];

let verifiedBuyersCache = [];

let currentActiveAlertCard = null;


/* ============================================================
   PAGE INITIALIZATION
============================================================ */

document.addEventListener("DOMContentLoaded", () => {

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

});


/* ============================================================
   LOAD USER INFORMATION
============================================================ */

function loadUserInformation() {

    const userName =
        localStorage.getItem("username") ||
        localStorage.getItem("name") ||
        localStorage.getItem("full_name");

    const role =
        localStorage.getItem("role");

    const userDisplayName =
        document.getElementById("userDisplayName");

    const userDisplayRole =
        document.getElementById("userDisplayRole");


    if (userName && userDisplayName) {

        userDisplayName.textContent =
            userName;

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

        userDisplayRole.textContent =
            roleMap[role] || role;

    }

}


/* ============================================================
   SIDEBAR
============================================================ */

function initSidebar() {
    const hamburgerBtn = document.getElementById("hamburgerBtn");
    const sidebar = document.getElementById("sidebar");

    if (!hamburgerBtn || !sidebar) return;

    let hoverTimer = null;

    // Open sidebar when hovering hamburger
    hamburgerBtn.addEventListener("mouseenter", function() {
        if (hoverTimer) {
            clearTimeout(hoverTimer);
            hoverTimer = null;
        }

        setTimeout(function() {
            sidebar.classList.add("open");

            // Fix Leaflet map size after sidebar opens
            setTimeout(function() {
                if (mapInstance) {
                    mapInstance.invalidateSize();
                }
            }, 300);

        }, 100);
    });

    // Close sidebar when mouse leaves
    sidebar.addEventListener("mouseleave", function() {
        hoverTimer = setTimeout(function() {
            sidebar.classList.remove("open");
        }, 200);
    });

    // Cancel close timer when mouse goes back to sidebar
    sidebar.addEventListener("mouseenter", function() {
        if (hoverTimer) {
            clearTimeout(hoverTimer);
            hoverTimer = null;
        }
    });

    // Close when clicking outside
    document.addEventListener("click", function(event) {
        const isClickInsideSidebar = sidebar.contains(event.target);
        const isClickOnHamburger = hamburgerBtn.contains(event.target);

        if (!isClickInsideSidebar && !isClickOnHamburger) {
            sidebar.classList.remove("open");
        }
    });

    // Close sidebar after clicking navigation item
    sidebar.querySelectorAll(".nav-item").forEach(function(item) {
        item.addEventListener("click", function() {
            sidebar.classList.remove("open");
        });
    });

    // Close sidebar using Escape key
    document.addEventListener("keydown", function(event) {
        if (event.key === "Escape") {
            sidebar.classList.remove("open");
        }
    });

    // Close sidebar on sign out
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

    const navButtons =
        document.querySelectorAll(
            ".nav-item[data-view]"
        );

    const views =
        document.querySelectorAll(".view");


    navButtons.forEach(button => {

        button.addEventListener(
            "click",
            () => {

                const targetViewKey =
                    button.dataset.view;


                /* --------------------------------------------
                   HIDE ALL VIEWS
                -------------------------------------------- */

                views.forEach(view => {

                    view.classList.remove(
                        "active-view"
                    );

                });


                /* --------------------------------------------
                   SHOW TARGET VIEW
                -------------------------------------------- */

                const targetView =
                    document.getElementById(
                        "view-" + targetViewKey
                    );


                if (targetView) {

                    targetView.classList.add(
                        "active-view"
                    );

                }


                /* --------------------------------------------
                   UPDATE ACTIVE NAV BUTTON
                -------------------------------------------- */

                navButtons.forEach(navButton => {

                    navButton.classList.toggle(
                        "active",
                        navButton === button
                    );

                });


                /* --------------------------------------------
                   FIX MAP SIZE
                -------------------------------------------- */

                if (
                    targetViewKey === "map" &&
                    mapInstance
                ) {

                    setTimeout(
                        () => {

                            mapInstance.invalidateSize();

                        },
                        100
                    );

                }


                /* --------------------------------------------
                   REFRESH BUYER REGISTRY
                -------------------------------------------- */

                if (
                    targetViewKey === "buyer-registry"
                ) {

                    loadBuyerRegistry();

                }

            }
        );

    });

}


/* ============================================================
   SIGN OUT
============================================================ */

function initSignout() {

    const signoutBtn =
        document.getElementById("signoutBtn");


    if (!signoutBtn) {

        return;

    }


    signoutBtn.addEventListener(
        "click",
        () => {

            localStorage.clear();

            window.location.href =
                "../index.html";

        }
    );

}

/* ============================================================
   LEAFLET MAP
============================================================ */

function initMap() {

    const mapEl = document.getElementById("map");

    if (!mapEl || typeof L === "undefined") {
        return;
    }

    const pampangaBounds = L.latLngBounds(
        [14.85, 120.35],
        [15.35, 120.95]
    );

    mapInstance = L.map("map", {

        maxBounds: pampangaBounds,

        maxBoundsViscosity: 1.0,

        minZoom: 10

    }).setView(
        [15.0794, 120.6200],
        10
    );


    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            attribution:
                "&copy; OpenStreetMap contributors",

            maxZoom: 18
        }
    ).addTo(mapInstance);


    // ============================================================
    // PAMPANGA MUNICIPALITY COORDINATES
    // Static coordinates only for displaying the map marker.
    // These are NOT stored in the database.
    // ============================================================

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


    // ============================================================
    // LOAD MUNICIPALITY MAP DATA
    // ============================================================

    loadMunicipalityMapData(
        municipalityCoordinates
    );

}


/* ============================================================
   LOAD MUNICIPALITY MAP DATA
============================================================ */

async function loadMunicipalityMapData(
    municipalityCoordinates
) {

    try {

        const response = await fetch(
            `${API_BASE_URL}/api/planting-intents/municipality-map`,
            {
                method: "GET",
                headers: getAuthHeaders(false)
            }
        );


        if (!response.ok) {

            throw new Error(
                `HTTP ${response.status}`
            );

        }


        const result =
            await response.json();


        console.log(
            "Municipality Map Data:",
            result
        );


        if (
            !result.data ||
            !Array.isArray(result.data)
        ) {

            console.warn(
                "No municipality map data found."
            );

            return;

        }


        // ========================================================
        // CREATE ONE MARKER PER MUNICIPALITY
        // ========================================================

        result.data.forEach(
            municipalityData => {

                const municipality =
                    municipalityData.municipality;

                const coordinates =
                    municipalityCoordinates[
                        municipality
                    ];


                // Skip if municipality has no
                // static coordinate
                if (!coordinates) {

                    console.warn(
                        `No coordinates found for municipality: ${municipality}`
                    );

                    return;

                }


                let popupContent = `
                    <div style="min-width: 180px;">
                        <strong>Municipality:</strong>
                        ${municipality}
                        <br><br>
                `;


                // =================================================
                // ADD COMMODITIES
                // =================================================

                municipalityData.commodities.forEach(
                    item => {

                        popupContent += `
                            <strong>Commodity:</strong>
                            ${item.commodity}
                            <br>

                            <strong>Status:</strong>
                            ${item.status}
                            <br><br>
                        `;

                    }
                );


                popupContent += `
                    </div>
                `;


                // =================================================
                // CREATE MARKER
                // =================================================

                L.marker(coordinates)
                    .addTo(mapInstance)
                    .bindPopup(
                        popupContent
                    );

            }
        );


    } catch (error) {

        console.error(
            "Failed to load municipality map data:",
            error
        );

    }

}

/* ============================================================
   BUYER REGISTRY INITIALIZATION
============================================================ */

function initBuyerRegistry() {

    /* --------------------------------------------
       INITIAL LOAD
    -------------------------------------------- */

    loadBuyerRegistry();


    /* --------------------------------------------
       RETURN TO BUYER LIST
    -------------------------------------------- */

    const returnBuyerListBtn =
        document.getElementById(
            "returnBuyerListBtn"
        );


    returnBuyerListBtn?.addEventListener(
        "click",
        () => {

            showBuyerList();

        }
    );


    /* --------------------------------------------
       VIEW BUYER ATTACHMENT
    -------------------------------------------- */

    const viewBuyerAttachmentBtn =
        document.getElementById(
            "viewBuyerAttachmentBtn"
        );


    viewBuyerAttachmentBtn?.addEventListener(
        "click",
        async () => {

            if (!currentSelectedBuyer) {

                showError(
                    "No buyer application selected."
                );

                return;

            }


            await viewBuyerAttachment(
                currentSelectedBuyer
            );

        }
    );


    /* --------------------------------------------
       APPROVE BUYER BUTTON
    -------------------------------------------- */

    const approveBuyerBtn =
        document.getElementById(
            "approveBuyerBtn"
        );


    approveBuyerBtn?.addEventListener(
        "click",
        () => {

            if (!currentSelectedBuyer) {

                showError(
                    "No buyer application selected."
                );

                return;

            }


            const modal =
                document.getElementById(
                    "confirmApproveModal"
                );


            modal?.classList.add("show");

        }
    );


    /* --------------------------------------------
       REJECT BUYER BUTTON
    -------------------------------------------- */

    const rejectBuyerBtn =
        document.getElementById(
            "rejectBuyerBtn"
        );


    rejectBuyerBtn?.addEventListener(
        "click",
        () => {

            if (!currentSelectedBuyer) {

                showError(
                    "No buyer application selected."
                );

                return;

            }


            const modal =
                document.getElementById(
                    "confirmRejectModal"
                );


            modal?.classList.add("show");

        }
    );


    /* --------------------------------------------
       CONFIRM APPROVE
    -------------------------------------------- */

    const confirmApproveBtn =
        document.getElementById(
            "confirmApproveBtn"
        );


    confirmApproveBtn?.addEventListener(
        "click",
        async () => {

            await approveSelectedBuyer();

        }
    );


    /* --------------------------------------------
       CONFIRM REJECT
    -------------------------------------------- */

    const confirmRejectBtn =
        document.getElementById(
            "confirmRejectBtn"
        );


    confirmRejectBtn?.addEventListener(
        "click",
        async () => {

            await rejectSelectedBuyer();

        }
    );

}


/* ============================================================
   VIEW BUYER ATTACHMENT
============================================================ */

async function viewBuyerAttachment(buyer) {

    if (!buyer) {

        showError(
            "No buyer application selected."
        );

        return;

    }


    /* --------------------------------------------
       GET BUYER REGISTRY ID
    -------------------------------------------- */

    const buyerRegistryId =
        buyer.buyer_registry_id ||
        buyer.buyerRegistryId ||
        buyer.id;


    if (!buyerRegistryId) {

        console.error(
            "BUYER OBJECT:",
            buyer
        );

        showError(
            "Buyer registry ID is missing."
        );

        return;

    }


    const button =
        document.getElementById(
            "viewBuyerAttachmentBtn"
        );


    try {

        if (button) {

            button.disabled = true;

            button.dataset.originalText =
                button.textContent;

            button.textContent =
                "Opening...";

        }


        /* --------------------------------------------
           ATTACHMENT ENDPOINT
        -------------------------------------------- */

        const endpoint =
            `${BUYER_ATTACHMENT_ENDPOINT}/${buyerRegistryId}/attachment`;


        console.log(
            "VIEW BUYER ATTACHMENT:",
            endpoint
        );


        const response =
            await fetch(
                endpoint,
                {
                    method: "GET",
                    headers: getAuthHeaders(false)
                }
            );


        /* --------------------------------------------
           HANDLE API ERROR
        -------------------------------------------- */

        if (!response.ok) {

            const errorText =
                await response.text();

            let errorMessage =
                "Unable to load buyer attachment.";


            try {

                const errorData =
                    JSON.parse(errorText);


                errorMessage =
                    errorData.detail ||
                    errorData.message ||
                    errorMessage;

            } catch {

                if (errorText) {

                    errorMessage =
                        errorText;

                }

            }


            throw new Error(
                `Status ${response.status}: ${errorMessage}`
            );

        }


        /* --------------------------------------------
           CHECK CONTENT TYPE
        -------------------------------------------- */

        const contentType =
            response.headers.get(
                "content-type"
            ) || "";


        /* --------------------------------------------
           IF DIRECT FILE RESPONSE
        -------------------------------------------- */

        if (
            !contentType.includes(
                "application/json"
            )
        ) {

            const blob =
                await response.blob();


            if (!blob.size) {

                throw new Error(
                    "The buyer attachment is empty."
                );

            }


            const blobUrl =
                URL.createObjectURL(
                    blob
                );


            window.open(
                blobUrl,
                "_blank"
            );


            setTimeout(
                () => {

                    URL.revokeObjectURL(
                        blobUrl
                    );

                },
                60000
            );


            return;

        }


        /* --------------------------------------------
           IF JSON RESPONSE
        -------------------------------------------- */

        const data =
            await response.json();


        console.log(
            "BUYER ATTACHMENT DATA:",
            data
        );


        const attachmentUrl =
            data.attachment_url ||
            data.file_url ||
            data.document_url ||
            data.url ||
            data.attachment_path ||
            data.file_path ||
            data.document_path;


        if (!attachmentUrl) {

            throw new Error(
                "No attachment was found for this buyer."
            );

        }


        /* --------------------------------------------
           HANDLE RELATIVE URL
        -------------------------------------------- */

        let finalUrl =
            attachmentUrl;


        if (
            !attachmentUrl.startsWith(
                "http://"
            ) &&
            !attachmentUrl.startsWith(
                "https://"
            ) &&
            !attachmentUrl.startsWith(
                "blob:"
            ) &&
            !attachmentUrl.startsWith(
                "data:"
            )
        ) {

            if (
                attachmentUrl.startsWith("/")
            ) {

                finalUrl =
                    `${API_BASE_URL}${attachmentUrl}`;

            } else {

                finalUrl =
                    `${API_BASE_URL}/${attachmentUrl}`;

            }

        }


        console.log(
            "OPENING ATTACHMENT:",
            finalUrl
        );


        window.open(
            finalUrl,
            "_blank"
        );


    } catch (error) {

        console.error(
            "VIEW BUYER ATTACHMENT ERROR:",
            error
        );


        alert(
            error.message ||
            "Failed to open buyer attachment."
        );


    } finally {

        if (button) {

            button.disabled = false;

            button.textContent =
                button.dataset.originalText ||
                "View Attachment";

        }

    }

}


/* ============================================================
   LOAD BUYER REGISTRY
============================================================ */

async function loadBuyerRegistry() {

    await Promise.all(
        [
            loadPendingBuyers(),
            loadVerifiedBuyers()
        ]
    );

}


/* ============================================================
   LOAD PENDING BUYERS
============================================================ */

async function loadPendingBuyers() {

    const tbody =
        document.getElementById(
            "pendingBuyersBody"
        );


    if (!tbody) {

        return;

    }


    tbody.innerHTML = `
        <tr>
            <td colspan="2">
                Loading pending buyer applications...
            </td>
        </tr>
    `;


    try {

        const response =
            await fetch(
                PENDING_BUYERS_ENDPOINT,
                {
                    method: "GET",
                    headers: getAuthHeaders()
                }
            );


        if (!response.ok) {

            const errorText =
                await response.text();

            throw new Error(
                `Failed to fetch pending buyers.
Status: ${response.status}
${errorText}`
            );

        }


        const data =
            await response.json();


        pendingBuyersCache =
            Array.isArray(data)
                ? data
                : [];


        renderPendingBuyers(
            pendingBuyersCache
        );


    } catch (error) {

        console.error(
            "LOAD PENDING BUYERS ERROR:",
            error
        );


        tbody.innerHTML = `
            <tr>
                <td colspan="2">

                    <strong>
                        Unable to load pending buyers.
                    </strong>

                    <br>

                    <small>
                        Check if FastAPI is running
                        and the endpoint is available.
                    </small>

                </td>
            </tr>
        `;

    }

}


/* ============================================================
   RENDER PENDING BUYERS
============================================================ */

function renderPendingBuyers(buyers) {

    const tbody =
        document.getElementById(
            "pendingBuyersBody"
        );


    if (!tbody) {

        return;

    }


    tbody.innerHTML = "";


    if (!buyers.length) {

        tbody.innerHTML = `
            <tr>
                <td colspan="2">
                    No pending buyer applications.
                </td>
            </tr>
        `;

        return;

    }


    buyers.forEach(
        buyer => {

            const row =
                document.createElement("tr");


            row.className =
                "clickable-row";


            row.dataset.buyerStatusId =
                buyer.buyer_status_id ?? "";


            row.dataset.buyerRegistryId =
                buyer.buyer_registry_id ?? "";


            row.innerHTML = `
                <td>
                    <span class="pill">
                        ${escapeHtml(
                            buyer.organization || "N/A"
                        )}
                    </span>
                </td>

                <td>
                    <span class="pill">
                        ${escapeHtml(
                            buyer.contact_person || "N/A"
                        )}
                    </span>
                </td>
            `;


            row.addEventListener(
                "click",
                () => {

                    openBuyerReview(
                        buyer
                    );

                }
            );


            tbody.appendChild(row);

        }
    );

}


/* ============================================================
   LOAD VERIFIED BUYERS
============================================================ */

async function loadVerifiedBuyers() {

    const tbody =
        document.getElementById(
            "verifiedBuyersBody"
        );


    if (!tbody) {

        return;

    }


    tbody.innerHTML = `
        <tr>
            <td colspan="5">
                Loading verified buyers...
            </td>
        </tr>
    `;


    try {

        const response =
            await fetch(
                VERIFIED_BUYERS_ENDPOINT,
                {
                    method: "GET",
                    headers: getAuthHeaders()
                }
            );


        if (!response.ok) {

            const errorText =
                await response.text();

            throw new Error(
                `Failed to fetch verified buyers.
Status: ${response.status}
${errorText}`
            );

        }


        const data =
            await response.json();


        verifiedBuyersCache =
            Array.isArray(data)
                ? data
                : [];


        renderVerifiedBuyers(
            verifiedBuyersCache
        );


    } catch (error) {

        console.error(
            "LOAD VERIFIED BUYERS ERROR:",
            error
        );


        tbody.innerHTML = `
            <tr>
                <td colspan="5">

                    <strong>
                        Unable to load verified buyers.
                    </strong>

                    <br>

                    <small>
                        Check if FastAPI is running
                        and the endpoint is available.
                    </small>

                </td>
            </tr>
        `;

    }

}


/* ============================================================
   RENDER VERIFIED BUYERS
============================================================ */

function renderVerifiedBuyers(buyers) {

    const tbody =
        document.getElementById(
            "verifiedBuyersBody"
        );


    if (!tbody) {

        return;

    }


    tbody.innerHTML = "";


    if (!buyers.length) {

        tbody.innerHTML = `
            <tr>
                <td colspan="4">
                    No verified buyers found.
                </td>
            </tr>
        `;

        return;

    }


    buyers.forEach(
        buyer => {

            const row =
                document.createElement("tr");


            row.innerHTML = `

                <td>
                    <span class="pill">
                        ${escapeHtml(
                            buyer.organization || "N/A"
                        )}
                    </span>
                </td>

                <td>
                    <span class="pill">
                        ${escapeHtml(
                            buyer.contact_person || "N/A"
                        )}
                    </span>
                </td>

                <td>
                    <span class="pill">
                        ${escapeHtml(
                            buyer.email_address || "N/A"
                        )}
                    </span>
                </td>

              

                <td>
                    <span class="status-text-verified">
                        Verified
                    </span>
                </td>

            `;


            tbody.appendChild(row);

        }
    );

}


/* ============================================================
   OPEN BUYER REVIEW
============================================================ */

function openBuyerReview(buyer) {

    currentSelectedBuyer =
        buyer;


    const buyerRegistryList =
        document.getElementById(
            "buyerRegistryList"
        );


    const buyerReviewDetails =
        document.getElementById(
            "buyerReviewDetails"
        );


    /* --------------------------------------------
       ORGANIZATION
    -------------------------------------------- */

    const reviewOrg =
        document.getElementById(
            "reviewOrg"
        );


    if (reviewOrg) {

        reviewOrg.textContent =
            buyer.organization || "N/A";

    }


    /* --------------------------------------------
       CONTACT PERSON
    -------------------------------------------- */

    const reviewContact =
        document.getElementById(
            "reviewContact"
        );


    if (reviewContact) {

        reviewContact.textContent =
            buyer.contact_person || "N/A";

    }


    /* --------------------------------------------
       EMAIL
    -------------------------------------------- */

    const reviewEmail =
        document.getElementById(
            "reviewEmail"
        );


    if (reviewEmail) {

        reviewEmail.textContent =
            buyer.email_address || "N/A";

    }


    /* --------------------------------------------
       COMMODITIES
    -------------------------------------------- */

    renderReviewCommodities(
        buyer
    );


    /* --------------------------------------------
       MESSAGE
    -------------------------------------------- */

    const messageTextarea =
        document.querySelector(
            "#buyerReviewDetails textarea"
        );


    if (messageTextarea) {

        messageTextarea.value =
            buyer.message ||
            "No message provided.";

    }


    /* --------------------------------------------
       SHOW REVIEW
    -------------------------------------------- */

    buyerRegistryList?.classList.add(
        "hidden-element"
    );


    buyerReviewDetails?.classList.remove(
        "hidden-element"
    );

}


/* ============================================================
   RENDER REVIEW COMMODITIES
============================================================ */

function renderReviewCommodities(buyer) {

    const container =
        document.getElementById(
            "reviewCommodities"
        );


    if (!container) {

        return;

    }


    container.innerHTML = "";


    const commodities =
        getCommodityArray(
            buyer
        );


    if (!commodities.length) {

        const span =
            document.createElement(
                "span"
            );


        span.className =
            "pill";


        span.textContent =
            "Not specified";


        container.appendChild(
            span
        );


        return;

    }


    commodities.forEach(
        commodity => {

            const span =
                document.createElement(
                    "span"
                );


            span.className =
                "pill";


            span.textContent =
                commodity;


            container.appendChild(
                span
            );

        }
    );

}


/* ============================================================
   GET COMMODITY ARRAY
============================================================ */

function getCommodityArray(buyer) {

    if (!buyer) {

        return [];

    }


    /* --------------------------------------------
       ARRAY
    -------------------------------------------- */

    if (
        Array.isArray(
            buyer.commodities
        )
    ) {

        return buyer.commodities
            .map(
                item =>
                    String(item).trim()
            )
            .filter(Boolean);

    }


    /* --------------------------------------------
       STRING
    -------------------------------------------- */

    if (
        typeof buyer.commodities === "string"
    ) {

        return buyer.commodities
            .split(",")
            .map(
                item =>
                    item.trim()
            )
            .filter(Boolean);

    }


    /* --------------------------------------------
       SINGLE COMMODITY
    -------------------------------------------- */

    if (buyer.commodity) {

        return [
            String(
                buyer.commodity
            ).trim()
        ];

    }


    return [];

}


/* ============================================================
   GET COMMODITIES FOR TABLE
============================================================ */

function getBuyerCommodities(buyer) {

    const commodities =
        getCommodityArray(
            buyer
        );


    if (!commodities.length) {

        return "Not specified";

    }


    return commodities.join(
        ", "
    );

}


/* ============================================================
   RETURN TO BUYER LIST
============================================================ */

function showBuyerList() {

    const buyerRegistryList =
        document.getElementById(
            "buyerRegistryList"
        );


    const buyerReviewDetails =
        document.getElementById(
            "buyerReviewDetails"
        );


    buyerReviewDetails?.classList.add(
        "hidden-element"
    );


    buyerRegistryList?.classList.remove(
        "hidden-element"
    );


    currentSelectedBuyer =
        null;

}


/* ============================================================
   APPROVE SELECTED BUYER
============================================================ */

async function approveSelectedBuyer() {

    if (!currentSelectedBuyer) {

        showError(
            "No buyer application selected."
        );

        return;

    }


    const buyerStatusId =
        currentSelectedBuyer.buyer_status_id;


    if (!buyerStatusId) {

        showError(
            "Buyer status ID is missing."
        );

        return;

    }


    const confirmButton =
        document.getElementById(
            "confirmApproveBtn"
        );


    try {

        setButtonLoading(
            confirmButton,
            "Approving..."
        );


        const response =
            await fetch(
                `${BUYER_STATUS_ENDPOINT}/${buyerStatusId}/verify`,
                {
                    method: "PUT",
                    headers: getAuthHeaders()
                }
            );


        const data =
            await parseResponse(
                response
            );


        if (!response.ok) {

            throw new Error(
                data.detail ||
                data.message ||
                "Unable to approve buyer."
            );

        }


        console.log(
            "BUYER APPROVED:",
            data
        );


        closeModal(
            "confirmApproveModal"
        );


        alert(
            "Buyer verified successfully."
        );


        currentSelectedBuyer =
            null;


        showBuyerList();


        /* --------------------------------------------
           REFRESH BOTH TABLES
        -------------------------------------------- */

        await loadBuyerRegistry();


    } catch (error) {

        console.error(
            "APPROVE BUYER ERROR:",
            error
        );


        alert(
            error.message ||
            "Failed to approve buyer."
        );

    } finally {

        resetButton(
            confirmButton,
            "Yes, Approve"
        );

    }

}


/* ============================================================
   REJECT SELECTED BUYER
============================================================ */

async function rejectSelectedBuyer() {

    if (!currentSelectedBuyer) {

        showError(
            "No buyer application selected."
        );

        return;

    }


    const buyerStatusId =
        currentSelectedBuyer.buyer_status_id;


    if (!buyerStatusId) {

        showError(
            "Buyer status ID is missing."
        );

        return;

    }


    const confirmButton =
        document.getElementById(
            "confirmRejectBtn"
        );


    try {

        setButtonLoading(
            confirmButton,
            "Rejecting..."
        );


        const response =
            await fetch(
                `${BUYER_STATUS_ENDPOINT}/${buyerStatusId}/reject`,
                {
                    method: "PUT",
                    headers: getAuthHeaders()
                }
            );


        const data =
            await parseResponse(
                response
            );


        if (!response.ok) {

            throw new Error(
                data.detail ||
                data.message ||
                "Unable to reject buyer."
            );

        }


        console.log(
            "BUYER REJECTED:",
            data
        );


        closeModal(
            "confirmRejectModal"
        );


        alert(
            "Buyer application rejected."
        );


        currentSelectedBuyer =
            null;


        showBuyerList();


        /* --------------------------------------------
           REFRESH BOTH TABLES
        -------------------------------------------- */

        await loadBuyerRegistry();


    } catch (error) {

        console.error(
            "REJECT BUYER ERROR:",
            error
        );


        alert(
            error.message ||
            "Failed to reject buyer."
        );

    } finally {

        resetButton(
            confirmButton,
            "Yes, Reject"
        );

    }

}


/* ============================================================
   PARSE API RESPONSE
============================================================ */

async function parseResponse(response) {

    const text =
        await response.text();


    if (!text) {

        return {};

    }


    try {

        return JSON.parse(
            text
        );

    } catch {

        return {
            detail: text
        };

    }

}


/* ============================================================
   BUTTON LOADING
============================================================ */

function setButtonLoading(
    button,
    text
) {

    if (!button) {

        return;

    }


    button.disabled =
        true;


    button.dataset.originalText =
        button.textContent;


    button.textContent =
        text;

}


/* ============================================================
   RESET BUTTON
============================================================ */

function resetButton(
    button,
    defaultText
) {

    if (!button) {

        return;

    }


    button.disabled =
        false;


    button.textContent =
        defaultText;

}


/* ============================================================
   CLOSE MODAL
============================================================ */

function closeModal(modalId) {

    const modal =
        document.getElementById(
            modalId
        );


    modal?.classList.remove(
        "show"
    );

}


/* ============================================================
   ERROR MESSAGE
============================================================ */

function showError(message) {

    console.error(
        message
    );


    alert(
        message
    );

}


/* ============================================================
   ESCAPE HTML
============================================================ */

function escapeHtml(value) {

    if (
        value === null ||
        value === undefined
    ) {

        return "";

    }


    return String(value)

        .replace(
            /&/g,
            "&amp;"
        )

        .replace(
            /</g,
            "&lt;"
        )

        .replace(
            />/g,
            "&gt;"
        )

        .replace(
            /"/g,
            "&quot;"
        )

        .replace(
            /'/g,
            "&#039;"
        );

}


/* ============================================================
   ALERT THRESHOLD
============================================================ */

function initAlertThreshold() {

    const thresholdRange =
        document.getElementById(
            "thresholdRange"
        );


    const thresholdValue =
        document.getElementById(
            "thresholdValue"
        );


    const chips =
        document.querySelectorAll(
            ".threshold-chip"
        );


    const saveBtn =
        document.getElementById(
            "saveConfigBtn"
        );


    /* --------------------------------------------
       UPDATE THRESHOLD UI
    -------------------------------------------- */

    function updateThreshold(value) {

        if (thresholdRange) {

            thresholdRange.value =
                value;

        }


        if (thresholdValue) {

            thresholdValue.textContent =
                `${value}%`;

        }


        chips.forEach(
            chip => {

                chip.classList.toggle(
                    "active",
                    chip.dataset.val ===
                    String(value)
                );

            }
        );

    }


    /* --------------------------------------------
       RANGE INPUT
    -------------------------------------------- */

    thresholdRange?.addEventListener(
        "input",
        event => {

            updateThreshold(
                event.target.value
            );

        }
    );


    /* --------------------------------------------
       THRESHOLD CHIPS
    -------------------------------------------- */

    chips.forEach(
        chip => {

            chip.addEventListener(
                "click",
                () => {

                    updateThreshold(
                        chip.dataset.val
                    );

                }
            );

        }
    );


    /* --------------------------------------------
       SAVE CONFIGURATION
    -------------------------------------------- */

    saveBtn?.addEventListener(
    "click",
    async () => {

        const commodity =
            document.getElementById(
                "commoditySelect"
            )?.value;

        const baseDemand =
            document.getElementById(
                "baseDemandInput"
            )?.value;

        const oversupplyThreshold =
            thresholdRange?.value;


        // --------------------------------------------
        // VALIDATION
        // --------------------------------------------

        if (!commodity) {
            alert("Please select a commodity.");
            return;
        }

        if (!baseDemand || Number(baseDemand) <= 0) {
            alert("Please enter a valid target demand.");
            return;
        }


        // --------------------------------------------
        // PAYLOAD
        // --------------------------------------------

        const payload = {

            commodity:
                commodity,

            base_demand:
                Number(baseDemand),

            oversupply_threshold:
                Number(oversupplyThreshold)

        };


        console.log(
            "Saving threshold configuration:",
            payload
        );


        // --------------------------------------------
        // SAVE TO BACKEND
        // --------------------------------------------

        try {

            const response =
                await fetch(
                    `${API_BASE_URL}/api/alert-thresholds`,
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json",

                            "Authorization":
                                `Bearer ${localStorage.getItem("token")}`
                        },

                        body:
                            JSON.stringify(payload)
                    }
                );


            const data =
                await response.json();


            // --------------------------------------------
            // ERROR
            // --------------------------------------------

            if (!response.ok) {

                console.error(
                    "Save threshold error:",
                    data
                );

                alert(
                    data.detail ||
                    "Failed to save threshold configuration."
                );

                return;
            }


            // --------------------------------------------
            // SUCCESS
            // --------------------------------------------

            console.log(
                "Threshold saved successfully:",
                data
            );

            alert(
                "Threshold configuration saved successfully!"
            );


        } catch (error) {

            console.error(
                "Error saving threshold:",
                error
            );

            alert(
                "Unable to connect to the server."
            );

        }

    }
);
}


/* ============================================================
   ALERTS SECTION LOGIC
============================================================ */

/* ============================================================
   ALERTS SECTION LOGIC
============================================================ */

function initAlertsSection() {

    loadSystemAlertLogs();

}


/* ============================================================
   LOAD SYSTEM ALERT LOGS
============================================================ */

async function loadSystemAlertLogs() {

    const alertList =
        document.getElementById("alertList");

    if (!alertList) {
        return;
    }

    alertList.innerHTML = `
        <div style="text-align:center; padding:30px;">
            Loading system alerts...
        </div>
    `;

    try {

        /* --------------------------------------------------------
           GET ALL MUNICIPALITY MAP DATA
        -------------------------------------------------------- */

        const response = await fetch(
            `${API_BASE_URL}/api/planting-intents/municipality-map`,
            {
                method: "GET",
                headers: getAuthHeaders(false)
            }
        );

        if (!response.ok) {

            throw new Error(
                `Failed to load municipality map data: ${response.status}`
            );

        }

        const result = await response.json();

        if (
            !result.data ||
            !Array.isArray(result.data)
        ) {

            alertList.innerHTML = `
                <div style="text-align:center; padding:30px;">
                    No system alerts found.
                </div>
            `;

            return;

        }


        /* --------------------------------------------------------
           CHECK OVERSUPPLY FOR EVERY COMMODITY
        -------------------------------------------------------- */

        const alertResults = [];

        for (const municipalityData of result.data) {

            const municipality =
                municipalityData.municipality;

            if (
                !municipality ||
                !Array.isArray(
                    municipalityData.commodities
                )
            ) {
                continue;
            }


            for (
                const item
                of municipalityData.commodities
            ) {

                const commodity =
                    item.commodity;

                if (!commodity) {
                    continue;
                }


                try {

                    const alertResponse =
                        await fetch(
                            `${API_BASE_URL}/api/alert-thresholds/oversupply/${encodeURIComponent(commodity)}?municipality=${encodeURIComponent(municipality)}`,
                            {
                                method: "GET",
                                headers: getAuthHeaders(false)
                            }
                        );


                    if (!alertResponse.ok) {

                        console.warn(
                            `No oversupply data for ${commodity} - ${municipality}`
                        );

                        continue;

                    }


                    const alertData =
                        await alertResponse.json();


                    console.log(
                        `Oversupply check: ${commodity} - ${municipality}`,
                        alertData
                    );


                    /* ------------------------------------------------
                       ONLY ADD ACTUAL OVERSUPPLY ALERTS
                    ------------------------------------------------ */

                    if (
                        String(
                            alertData.status || ""
                        ).toUpperCase() === "OVERSUPPLY"
                    ) {

                        alertResults.push({

                            commodity:
                                alertData.commodity ||
                                commodity,

                            municipality:
                                alertData.municipality ||
                                municipality,

                            base_demand:
                                Number(
                                    alertData.base_demand || 0
                                ),

                            projected_supply:
                                Number(
                                    alertData.projected_supply || 0
                                ),

                            excess_supply:
                                Number(
                                    alertData.excess_supply || 0
                                ),

                            supply_percentage:
                                Number(
                                    alertData.supply_percentage || 0
                                ),

                            status:
                                alertData.status,

                            date:
                                new Date()

                        });

                    }

                } catch (error) {

                    console.error(
                        `Error checking ${commodity} - ${municipality}:`,
                        error
                    );

                }

            }

        }


        /* --------------------------------------------------------
           RENDER ALERTS
        -------------------------------------------------------- */

        renderSystemAlertLogs(
            alertResults
        );


    } catch (error) {

        console.error(
            "LOAD SYSTEM ALERT LOGS ERROR:",
            error
        );

        alertList.innerHTML = `
            <div style="text-align:center; padding:30px; color:#C0392B;">
                Unable to load system alerts.
            </div>
        `;

    }

}


/* ============================================================
   RENDER SYSTEM ALERT LOGS
============================================================ */

function renderSystemAlertLogs(alerts) {

    const alertList =
        document.getElementById("alertList");

    if (!alertList) {
        return;
    }


    alertList.innerHTML = "";


    /* --------------------------------------------------------
       NO ALERTS
    -------------------------------------------------------- */

    if (!alerts.length) {

        alertList.innerHTML = `
            <div style="text-align:center; padding:30px;">
                No active oversupply alerts.
            </div>
        `;

        return;

    }


    /* --------------------------------------------------------
       RENDER EACH ALERT
    -------------------------------------------------------- */

    alerts.forEach(alert => {

        const card =
            document.createElement("div");

        card.className =
            "alert-card";

        card.dataset.severity =
            "high";


        const supply =
            alert.projected_supply;

        const demand =
            alert.base_demand;


        /* --------------------------------------------------------
           CALCULATE SURPLUS PERCENTAGE
        -------------------------------------------------------- */

        let surplusPercentage = 0;

        if (demand > 0) {

            surplusPercentage =
                ((supply - demand) / demand) * 100;

        }


        /* --------------------------------------------------------
           DATE
        -------------------------------------------------------- */

        const alertDate =
            new Date(
                alert.date
            ).toLocaleDateString(
                "en-CA"
            );


        /* --------------------------------------------------------
           DESCRIPTION
        -------------------------------------------------------- */

        const description =
            `${alert.commodity} supply in ${alert.municipality} is ${Math.round(surplusPercentage)}% above projected demand. Monitor closely and coordinate with buyers.`;


        /* --------------------------------------------------------
           CARD HTML
        -------------------------------------------------------- */

        card.innerHTML = `

            <div class="alert-top">

                <div class="alert-title-group">

                    <span class="alert-title">
                        ${escapeHtml(
                            alert.commodity
                        )}
                        Oversupply Risk —
                        ${escapeHtml(
                            alert.municipality
                        )}
                    </span>

                    <span class="sev-pill high">
                        High
                    </span>

                </div>


            

            </div>


            <p class="alert-desc">
                ${escapeHtml(
                    description
                )}
            </p>


            <div class="alert-stats">

                <span>
                    Supply:
                    <b>
                        ${formatKg(supply)}
                    </b>
                </span>


                <span>
                    Demand:
                    <b>
                        ${formatKg(demand)}
                    </b>
                </span>


                <span>
                    Surplus:
                    <b>
                        +${Math.round(
                            surplusPercentage
                        )}%
                    </b>
                </span>


                <span class="alert-date">
                    ${alertDate}
                </span>

            </div>

        `;


        /* --------------------------------------------------------
           STATUS BUTTON
        -------------------------------------------------------- */

        const statusButton =
            card.querySelector(
                ".status-pill-btn"
            );


        statusButton?.addEventListener(
            "click",
            event => {

                event.stopPropagation();

                toggleAlertCardStatus(
                    statusButton
                );

            }
        );


        /* --------------------------------------------------------
           OPEN ALERT DETAIL MODAL
        -------------------------------------------------------- */

        card.addEventListener(
            "click",
            () => {

                currentActiveAlertCard =
                    card;

                openAlertDetailModal(
                    card
                );

            }
        );


        alertList.appendChild(card);

    });

}


/* ============================================================
   FORMAT KG → TONS
============================================================ */

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


/* ============================================================
   TOGGLE ALERT STATUS
============================================================ */

function toggleAlertCardStatus(button) {

    const unresolved =
        button.classList.contains(
            "unresolved"
        );


    if (unresolved) {

        button.textContent =
            "Acknowledged";

        button.classList.remove(
            "unresolved"
        );

        button.classList.add(
            "acknowledged"
        );

    } else {

        button.textContent =
            "Unresolved";

        button.classList.remove(
            "acknowledged"
        );

        button.classList.add(
            "unresolved"
        );

    }

}


/* ============================================================
   OPEN ALERT DETAIL MODAL
============================================================ */

function openAlertDetailModal(card) {

    const title =
        card.querySelector(
            ".alert-title"
        )?.textContent || "—";


    const desc =
        card.querySelector(
            ".alert-desc"
        )?.textContent || "—";


    const severity =
        card.querySelector(
            ".sev-pill"
        );


    const stats =
        card.querySelectorAll(
            ".alert-stats span b"
        );


    const date =
        card.querySelector(
            ".alert-date"
        )?.textContent || "—";


    const alertStatus =
        card.querySelector(
            ".status-pill-btn"
        );


    const titleElement =
        document.getElementById(
            "modalAlertTitle"
        );

    if (titleElement) {

        titleElement.textContent =
            title;

    }


    const descElement =
        document.getElementById(
            "modalAlertDesc"
        );

    if (descElement) {

        descElement.textContent =
            desc;

    }


    const modalSeverity =
        document.getElementById(
            "modalAlertSev"
        );


    if (
        modalSeverity &&
        severity
    ) {

        modalSeverity.textContent =
            severity.textContent;

        modalSeverity.className =
            "sev-pill";

        modalSeverity.classList.add(
            severity.classList.contains(
                "high"
            )
                ? "high"
                : "medium"
        );

    }


    const supply =
        document.getElementById(
            "modalAlertSupply"
        );

    if (supply) {

        supply.textContent =
            stats[0]?.textContent || "—";

    }


    const demand =
        document.getElementById(
            "modalAlertDemand"
        );

    if (demand) {

        demand.textContent =
            stats[1]?.textContent || "—";

    }


    const surplus =
        document.getElementById(
            "modalAlertSurplus"
        );

    if (surplus) {

        surplus.textContent =
            stats[2]?.textContent || "—";

    }


    const dateElement =
        document.getElementById(
            "modalAlertDate"
        );

    if (dateElement) {

        dateElement.textContent =
            date;

    }


    const toggleButton =
        document.getElementById(
            "toggleAlertStatusBtn"
        );


    if (
        toggleButton &&
        alertStatus
    ) {

        toggleButton.textContent =
            alertStatus.classList.contains(
                "unresolved"
            )
                ? "Acknowledge Alert"
                : "Mark as Unresolved";

    }


    document
        .getElementById(
            "alertDetailModal"
        )
        ?.classList.add("show");

}


/* ============================================================
   SEARCH ALERTS
============================================================ */

const searchAlerts =
    document.getElementById(
        "searchAlerts"
    );

searchAlerts?.addEventListener(
    "input",
    () => {

        const searchTerm =
            searchAlerts.value
                .toLowerCase()
                .trim();


        document
            .querySelectorAll(
                "#alertList .alert-card"
            )
            .forEach(card => {

                const text =
                    card.textContent
                        .toLowerCase();


                card.style.display =
                    text.includes(
                        searchTerm
                    )
                        ? ""
                        : "none";

            });

    }
);


/* ============================================================
   ALERT DETAIL MODAL TOGGLE
============================================================ */

document
    .getElementById(
        "toggleAlertStatusBtn"
    )
    ?.addEventListener(
        "click",
        () => {

            if (
                currentActiveAlertCard
            ) {

                const button =
                    currentActiveAlertCard
                        .querySelector(
                            ".status-pill-btn"
                        );

                if (button) {

                    toggleAlertCardStatus(
                        button
                    );

                }

            }


            document
                .getElementById(
                    "alertDetailModal"
                )
                ?.classList.remove(
                    "show"
                );

        }
    );


/* ============================================================
   MODAL LISTENERS
============================================================ */

function initModalListeners() {

    /* --------------------------------------------
       CLICK OUTSIDE MODAL TO CLOSE
    -------------------------------------------- */

    document
        .querySelectorAll(".modal-overlay")
        .forEach(modal => {

            modal.addEventListener(
                "click",
                event => {

                    if (
                        event.target === modal
                    ) {

                        modal.classList.remove(
                            "show"
                        );

                    }

                }
            );

        });


    /* --------------------------------------------
       CANCEL BUTTONS
    -------------------------------------------- */

    document
        .querySelectorAll(".modal-cancel-btn")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const modal =
                        button.closest(
                            ".modal-overlay"
                        );

                    modal?.classList.remove(
                        "show"
                    );

                }
            );

        });

}
/* ============================================================
   REPORTS SECTION - COMPLETE WITH APPROVAL WORKFLOW
============================================================ */

function initReportsSection() {

    const reportListSubview =
        document.getElementById(
            "reportListSubview"
        );

    const reportDetailSubview =
        document.getElementById(
            "reportDetailSubview"
        );

    const reportApprovedModal =
        document.getElementById(
            "reportApprovedModal"
        );

    const flagReportBtn =
        document.getElementById(
            "flagReportBtn"
        );

    const approveReportBtn =
        document.getElementById(
            "approveReportBtn"
        );

    const backToPendingBtn =
        document.getElementById("backToPendingBtn");

    const closeReportApprovedBtn =
        document.getElementById(
            "closeReportApprovedBtn"
        );

    const searchInput = document.getElementById("reportSearchInput");
    const searchBtn = document.getElementById("reportSearchBtn");

    // Store all reports for searching
    let allReportsCache = [];
    let currentSelectedReport = null;

    // ============================================================
    // LOAD REPORTS FROM API
    // ============================================================
    async function loadReports() {
        const pendingReportsBody =
            document.querySelector("#pendingReportsBody");

        if (!pendingReportsBody) {
            console.error("pendingReportsBody not found.");
            return;
        }

        pendingReportsBody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align:center;">
                    Loading reports...
                </td>
            </tr>
        `;

        try {
            const response = await fetch(
                `${API_BASE_URL}/api/report-submissions/all-reports`,
                {
                    method: "GET",
                    headers: getAuthHeaders()
                }
            );

            const data = await parseResponse(response);

            if (!response.ok) {
                throw new Error(
                    data.detail ||
                    data.message ||
                    `Failed to fetch reports: ${response.status}`
                );
            }

            const reports = Array.isArray(data) ? data : [];

            // Store all reports for search
            allReportsCache = reports;

            // Filter for DA validation
            const daReports = reports.filter(report => {
                const status =
                    String(report.status || "")
                        .trim()
                        .toUpperCase();
                return status === "FOR_DA_RFO_VALIDATION";
            });

            // Render the reports
            renderReports(daReports);

        } catch (error) {
            console.error("LOAD DA REPORTS ERROR:", error);
            pendingReportsBody.innerHTML = `
                <tr>
                    <td colspan="6"
                        style="text-align:center; padding:30px; color:#C0392B;">
                        Error loading reports:
                        ${escapeHtml(error.message)}
                    </td>
                </tr>
            `;
        }
    }

    // ============================================================
    // RENDER REPORTS
    // ============================================================
    function renderReports(reportsToShow) {
        const pendingReportsBody =
            document.querySelector("#pendingReportsBody");

        if (!pendingReportsBody) return;

        if (reportsToShow.length === 0) {
            pendingReportsBody.innerHTML = `
                <tr>
                    <td colspan="6"
                        style="text-align:center; padding:30px; color:#666;">
                        No reports awaiting DA-RFO validation.
                    </td>
                </tr>
            `;
            return;
        }

        pendingReportsBody.innerHTML = "";

        reportsToShow.forEach(report => {
            const row = document.createElement("tr");
            row.className = "clickable-row";

            // Format dates
            const plantingDate = report.planting_date 
                ? new Date(report.planting_date).toLocaleDateString('en-PH')
                : 'N/A';
            const harvestDate = report.harvest_date 
                ? new Date(report.harvest_date).toLocaleDateString('en-PH')
                : 'N/A';

            row.innerHTML = `
                <td>
                    <span class="pill">
                        ${escapeHtml(
                            report.report_id ??
                            report.submission_id ??
                            "N/A"
                        )}
                    </span>
                </td>
                <td>
                    <span class="pill">
                        ${escapeHtml(
                            report.commodity || "N/A"
                        )}
                    </span>
                </td>
                <td>
                    <span class="pill">
                        ${escapeHtml(plantingDate)}
                    </span>
                </td>
                <td>
                    <span class="pill">
                        ${escapeHtml(harvestDate)}
                    </span>
                </td>
                <td>
                    <span class="pill">
                        ${
                            report.estimated_yield != null
                                ? escapeHtml(
                                    String(report.estimated_yield)
                                ) + " kg"
                                : "N/A"
                        }
                    </span>
                </td>
                <td>
                    <span class="status-pill pending">
                        ${escapeHtml(
                            report.status || "PENDING"
                        )}
                    </span>
                </td>
            `;

            row.addEventListener("click", () => {
                console.log("Selected DA report:", report);
                currentSelectedReport = report;
                showReportDetail(report);
            });

            pendingReportsBody.appendChild(row);
        });
    }

    // ============================================================
    // SEARCH FUNCTION
    // ============================================================
    function performSearch() {
        if (!searchInput) return;

        const searchTerm = searchInput.value.toLowerCase().trim();

        // Filter only FOR_DA_RFO_VALIDATION reports
        const daReports = allReportsCache.filter(report => {
            const status =
                String(report.status || "")
                    .trim()
                    .toUpperCase();
            return status === "FOR_DA_RFO_VALIDATION";
        });

        if (!searchTerm) {
            renderReports(daReports);
            return;
        }

        // Search across multiple fields
        const filtered = daReports.filter(report => {
            const searchableFields = [
                report.report_id,
                report.submission_id,
                report.commodity,
                report.planting_date,
                report.harvest_date,
                report.status,
                report.encoded_by_name,
                String(report.estimated_yield)
            ];

            return searchableFields.some(field => {
                if (field === null || field === undefined) return false;
                return String(field).toLowerCase().includes(searchTerm);
            });
        });

        renderReports(filtered);
    }

    // ============================================================
    // SHOW REPORT DETAIL
    // ============================================================
    function showReportDetail(report) {
        // Hide list, show detail
        reportListSubview?.classList.add('hidden-element');
        reportDetailSubview?.classList.remove('hidden-element');

        // Store report data
        reportDetailSubview.dataset.reportId = report.report_id;
        reportDetailSubview.dataset.submissionId = report.submission_id;
        currentSelectedReport = report;

        // Populate table with report data
        const tbody = document.querySelector('#reportDetailSubview table tbody');

        if (tbody) {
            // Format dates
            const plantingDate = report.planting_date 
                ? new Date(report.planting_date).toLocaleDateString('en-PH')
                : 'N/A';
            const harvestDate = report.harvest_date 
                ? new Date(report.harvest_date).toLocaleDateString('en-PH')
                : 'N/A';

            tbody.innerHTML = `
                <tr>
                    <td>
                        <span class="pill">
                            ${escapeHtml(
                                report.report_id ??
                                report.submission_id ??
                                'N/A'
                            )}
                        </span>
                    </td>
                    <td>
                        <span class="pill">
                            ${escapeHtml(
                                report.commodity || 'N/A'
                            )}
                        </span>
                    </td>
                    <td>
                        <span class="pill">
                            ${escapeHtml(plantingDate)}
                        </span>
                    </td>
                    <td>
                        <span class="pill">
                            ${escapeHtml(harvestDate)}
                        </span>
                    </td>
                    <td>
                        <span class="pill">
                            ${
                                report.estimated_yield != null
                                    ? escapeHtml(
                                        String(report.estimated_yield)
                                    ) + ' kg'
                                    : 'N/A'
                            }
                        </span>
                    </td>
                    <td>
                        <span class="pill">
                            ${escapeHtml(
                                report.encoded_by_name || 'N/A'
                            )}
                        </span>
                    </td>
                    <td>
                        <span class="status-pill pending">
                            ${escapeHtml(
                                report.status || 'Pending'
                            )}
                        </span>
                    </td>
                </tr>
            `;
        }

        // Clear notes/remarks textarea
        const notesTextarea = document.querySelector('#reportDetailSubview textarea');
        if (notesTextarea) {
            notesTextarea.value = '';
            notesTextarea.placeholder = 'Enter provincial feedback or revision notes...';
        }

        // Reset flag button
        if (flagReportBtn) {
            flagReportBtn.classList.remove('active');
            flagReportBtn.textContent = 'Flag for Revision';
            flagReportBtn.disabled = false;
        }

        // Reset approve button
        if (approveReportBtn) {
            approveReportBtn.disabled = false;
            approveReportBtn.textContent = 'Approve & Escalate';
        }

        // Show remarks required indicator
        const remarksRequired = document.querySelector('.remarks-required');
        if (remarksRequired) {
            remarksRequired.style.display = 'block';
        }
    }

    // ============================================================
    // GET CURRENT USER ID
    // ============================================================
    function getCurrentUserId() {
        const userId = localStorage.getItem('user_id') || 
                       localStorage.getItem('userId') ||
                       localStorage.getItem('id');
        
        if (!userId) {
            console.error('No user_id found in localStorage.');
            return null;
        }
        
        return userId;
    }

    // ============================================================
    // APPROVE & ESCALATE REPORT
    // ============================================================
    async function approveReport() {
        const reportId = reportDetailSubview?.dataset.reportId;
        
        if (!reportId) {
            alert('No report selected.');
            return;
        }

        // Get remarks from textarea
        const notesTextarea = document.querySelector('#reportDetailSubview textarea');
        const remarks = notesTextarea?.value?.trim();

        // Validate remarks
        if (!remarks || remarks.length < 10) {
            alert('Please provide detailed remarks (at least 10 characters) before approving.');
            if (notesTextarea) {
                notesTextarea.focus();
                notesTextarea.style.borderColor = '#C0392B';
                setTimeout(() => {
                    notesTextarea.style.borderColor = '';
                }, 3000);
            }
            return;
        }

        // Get current user ID
        const userId = getCurrentUserId();
        
        if (!userId) {
            alert('User ID not found. Please login again.');
            return;
        }

        const approveBtn = approveReportBtn;
        const originalText = approveBtn?.textContent;

        try {
            if (approveBtn) {
                approveBtn.disabled = true;
                approveBtn.textContent = '⏳ Approving...';
            }

            // Build query parameters
            const params = new URLSearchParams({
                validator_id: userId,
                validator_role: "darfo",
                remarks: remarks
            });

            const response = await fetch(
                `${API_BASE_URL}/api/report-submissions/${reportId}/approve?${params.toString()}`,
                {
                    method: "POST",
                    headers: getAuthHeaders(false)
                }
            );

            const data = await parseResponse(response);

            if (!response.ok) {
                throw new Error(
                    data.detail || 
                    data.message || 
                    'Failed to approve report'
                );
            }

            console.log('✅ Report approved and escalated:', data);

            // Show success modal
            reportApprovedModal?.classList.add('show');

            // Refresh reports list in background
            await loadReports();

        } catch (error) {
            console.error('❌ APPROVE REPORT ERROR:', error);
            alert('❌ ' + (error.message || 'Failed to approve report. Please try again.'));
        } finally {
            if (approveBtn) {
                approveBtn.disabled = false;
                approveBtn.textContent = originalText || 'Approve & Escalate';
            }
        }
    }

    // ============================================================
    // FLAG REPORT FOR REVISION
    // ============================================================
    async function flagReport() {
        const reportId = reportDetailSubview?.dataset.reportId;

        if (!reportId) {
            alert('No report selected.');
            return;
        }

        const notesTextarea = document.querySelector('#reportDetailSubview textarea');
        const remarks = notesTextarea?.value?.trim();

        if (!remarks || remarks.length < 10) {
            alert('Please provide detailed revision remarks (at least 10 characters).');
            if (notesTextarea) {
                notesTextarea.focus();
                notesTextarea.style.borderColor = '#C0392B';
                setTimeout(() => {
                    notesTextarea.style.borderColor = '';
                }, 3000);
            }
            return;
        }

        const userId = getCurrentUserId();

        if (!userId) {
            alert('User ID not found. Please login again.');
            return;
        }

        const flagBtn = flagReportBtn;
        const originalText = flagBtn?.textContent;

        try {
            if (flagBtn) {
                flagBtn.disabled = true;
                flagBtn.textContent = '⏳ Flagging...';
            }

            const params = new URLSearchParams({
                validator_id: userId,
                validator_role: "darfo",
                remarks: remarks
            });

            const response = await fetch(
                `${API_BASE_URL}/api/report-submissions/${reportId}/revision?${params.toString()}`,
                {
                    method: "POST",
                    headers: getAuthHeaders(false)
                }
            );

            const data = await parseResponse(response);

            if (!response.ok) {
                throw new Error(
                    data.detail ||
                    data.message ||
                    'Failed to flag report.'
                );
            }

            console.log('📌 Report flagged for revision:', data);

            alert('📌 Report flagged for revision successfully!');

            // Return to report list
            reportDetailSubview?.classList.add('hidden-element');
            reportListSubview?.classList.remove('hidden-element');

            // Refresh reports
            await loadReports();

        } catch (error) {
            console.error('❌ FLAG REPORT ERROR:', error);
            alert('❌ ' + (error.message || 'Failed to flag report.'));
        } finally {
            if (flagBtn) {
                flagBtn.disabled = false;
                flagBtn.textContent = originalText || 'Flag for Revision';
            }
        }
    }

    // ============================================================
    // RETURN TO REPORT LIST
    // ============================================================
    function returnToReportList() {
        reportDetailSubview?.classList.add('hidden-element');
        reportListSubview?.classList.remove('hidden-element');
        currentSelectedReport = null;
        loadReports();
    }

    // ============================================================
    // EVENT LISTENERS
    // ============================================================

    // Search events
    searchBtn?.addEventListener("click", performSearch);
    searchInput?.addEventListener("keyup", (event) => {
        if (event.key === "Enter") {
            performSearch();
        }
    });

    // Load reports when view is shown
    const viewReports = document.getElementById('view-reports');
    const observer = new MutationObserver(() => {
        if (viewReports?.classList.contains('active-view')) {
            loadReports();
        }
    });
    if (viewReports) {
        observer.observe(viewReports, { attributes: true, attributeFilter: ['class'] });
    }

    // Load reports if view is already active
    if (viewReports?.classList.contains('active-view')) {
        loadReports();
    }

    // Back to pending button
    backToPendingBtn?.addEventListener('click', returnToReportList);

    // Flag report button
    flagReportBtn?.addEventListener('click', flagReport);

    // Approve report button
    approveReportBtn?.addEventListener('click', approveReport);

    // Close approved modal - with proper return to list
    closeReportApprovedBtn?.addEventListener('click', () => {
        reportApprovedModal?.classList.remove('show');
        returnToReportList();
    });

    // Click outside modal to close
    reportApprovedModal?.addEventListener('click', (event) => {
        if (event.target === reportApprovedModal) {
            reportApprovedModal.classList.remove('show');
            returnToReportList();
        }
    });

    // Real-time validation for remarks textarea
    const remarksTextarea = document.querySelector('#reportDetailSubview textarea');
    if (remarksTextarea) {
        remarksTextarea.addEventListener('input', () => {
            const length = remarksTextarea.value.trim().length;
            if (approveReportBtn) {
                approveReportBtn.disabled = length < 10;
            }
            if (flagReportBtn) {
                flagReportBtn.disabled = length < 10;
            }
        });
    }

    console.log('✅ Reports section initialized with approval workflow');
}