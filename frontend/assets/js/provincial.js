const token = localStorage.getItem('token');
const userRole = localStorage.getItem('role');


let mapInstance = null;


const REPORT_DATA = {
  '1': { name: 'Pedro Manalang', commodity: 'Onion', volume: '15,000kg', location: 'Sta. Monica', planting: 'February 1, 2026', harvesting: 'San Juan' },
  '2': { name: 'Ana Reyes', commodity: 'Tomato', volume: '9,200kg', location: 'Sta. Barbara', planting: 'January 20, 2026', harvesting: 'Sta. Barbara' },
  '3': { name: 'Rico Villanueva', commodity: 'Cabbage', volume: '6,500kg', location: 'Sta. Lucia', planting: 'January 15, 2026', harvesting: 'Sta. Lucia' }
};




const STATUS_COLORS = {
  surplus: '#c0392b',
  deficit: '#e6b800',
  balanced: '#3d8b40',
  'no-data': '#8a8a8a'
};


// 2. LIFECYCLE INITIALIZATION
document.addEventListener('DOMContentLoaded', () => {
  initSidebar();
  initNotifDropdown();
  initViewNavigation();
  initMap();
  initReportsSection();
  initSignout();
});



// ---------- Sidebar & Navigation ----------
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


function initNotifDropdown() {
  const bellBtn = document.getElementById('bellBtn');
  const notifDropdown = document.getElementById('notifDropdown');


  if (!bellBtn || !notifDropdown) return;


  bellBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    notifDropdown.classList.toggle('show');
  });


  document.addEventListener('click', (e) => {
    if (!notifDropdown.contains(e.target) && e.target !== bellBtn) {
      notifDropdown.classList.remove('show');
    }
  });


  document.querySelector('.notif-item[data-goto="report"]')?.addEventListener('click', () => {
    switchView('report');
    notifDropdown.classList.remove('show');
  });
}


function initViewNavigation() {
  const navButtons = document.querySelectorAll('.nav-item[data-view]');


  navButtons.forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
}


function switchView(viewKey) {
  const views = document.querySelectorAll('.view');
  const navButtons = document.querySelectorAll('.nav-item[data-view]');


  views.forEach(v => v.classList.remove('active-view'));
  const targetView = document.getElementById('view-' + viewKey);
  if (targetView) targetView.classList.add('active-view');


  navButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.view === viewKey));


  if (viewKey === 'map' && mapInstance) {
    setTimeout(() => mapInstance.invalidateSize(), 50);
  }
}


function initSignout() {
  const signoutBtn = document.getElementById('signoutBtn');
  if (signoutBtn) {
    signoutBtn.addEventListener('click', () => {
      localStorage.clear();
      window.location.href = '../index.html';
    });
  }
}


function initMap() {
  const mapEl = document.getElementById('map');
  if (!mapEl) return;

  const pampangaBounds = L.latLngBounds(
    [14.85, 120.35],
    [15.35, 120.95]
  );

  mapInstance = L.map('map', {
    maxBounds: pampangaBounds,
    maxBoundsViscosity: 1.0,
    minZoom: 10
  }).setView([15.0794, 120.6200], 10);

  L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18
    }
  ).addTo(mapInstance);

  loadMunicipalityMapData();
}

async function loadMunicipalityMapData() {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/planting-intents/municipality-map`,
      {
        method: 'GET',
        headers: getAuthHeaders(false)
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();

    console.log(
      'Provincial Municipality Map Data:',
      result
    );

    if (!result.data || !Array.isArray(result.data)) {
      console.warn('No municipality map data found.');
      return;
    }

    // Convert backend data into easy lookup
    const municipalityDataMap = {};

    result.data.forEach(item => {
      municipalityDataMap[
        item.municipality.trim().toLowerCase()
      ] = item;
    });

    const markers = [];

    municipalities.forEach(municipality => {
      const backendData =
        municipalityDataMap[
          municipality.name.trim().toLowerCase()
        ];

      let status = 'no-data';
      let popupContent = `
        <div class="popup-title">
          ${municipality.name}
        </div>
      `;

      if (
        backendData &&
        Array.isArray(backendData.commodities) &&
        backendData.commodities.length > 0
      ) {
        popupContent += `
          <div class="popup-status">
            <strong>Commodity Status</strong><br><br>
        `;

        backendData.commodities.forEach(item => {

          if (item.status === 'OVERSUPPLY') {
            status = 'surplus';
          } else if (item.status === 'DEFICIT') {
            status = 'deficit';
          } else if (item.status === 'NORMAL') {
            status = 'balanced';
          }

          popupContent += `
            <strong>${item.commodity}</strong><br>
            Status:
            <strong>${item.status}</strong>
            <br><br>
          `;
        });

        popupContent += `</div>`;
      } else {
        popupContent += `
          <div class="popup-status">
            No recent report submitted
          </div>
        `;
      }

      const marker = L.circleMarker(
        [municipality.lat, municipality.lng],
        {
          radius: 9,
          fillColor: STATUS_COLORS[status],
          color: '#fff',
          weight: 2,
          fillOpacity: 0.9
        }
      ).addTo(mapInstance);

      marker.bindPopup(popupContent);

      markers.push([
        municipality.lat,
        municipality.lng
      ]);
    });

    if (markers.length > 0) {
      const bounds = L.latLngBounds(markers);

      mapInstance.fitBounds(
        bounds,
        {
          padding: [30, 30]
        }
      );
    }

  } catch (error) {
    console.error(
      'Failed to load provincial municipality map:',
      error
    );
  }
}


// ---------- Reports Section Logic ----------
function initReportsSection() {
  const reportListSubview = document.getElementById('reportListSubview');
  const reportDetailSubview = document.getElementById('reportDetailSubview');
  const reportModal = document.getElementById('reportModal');
  const reportModalText = document.getElementById('reportModalText');
  const flagBtn = document.getElementById('flagBtn');
  const approveBtn = document.getElementById('approveBtn');
  const returnBtn = document.getElementById('returnBtn');


  function showReportSubview(subview) {
    reportListSubview.classList.remove('active-subview');
    reportDetailSubview.classList.remove('active-subview');
    subview.classList.add('active-subview');
  }


  // view on report click
  document.querySelectorAll('.report-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const data = REPORT_DATA[btn.dataset.reportId];
      if (data) {
        document.getElementById('detailName').textContent = data.name;
        document.getElementById('detailCommodity').textContent = data.commodity;
        document.getElementById('detailVolume').textContent = data.volume;
        document.getElementById('detailLocation').textContent = data.location;
        document.getElementById('detailPlanting').textContent = data.planting;
        document.getElementById('detailHarvesting').textContent = data.harvesting;
      }


      if (flagBtn && approveBtn && returnBtn) {
        flagBtn.classList.remove('active');
        approveBtn.classList.remove('active');
        flagBtn.textContent = 'Flag for Revision';
        flagBtn.disabled = false;
        approveBtn.disabled = false;
        returnBtn.disabled = false;
      }


      showReportSubview(reportDetailSubview);
    });
  });


  returnBtn?.addEventListener('click', () => {
    showReportSubview(reportListSubview);
  });


  function finalizeReport(action) {
    if (!flagBtn || !approveBtn || !returnBtn) return;
    flagBtn.disabled = true;
    approveBtn.disabled = true;
    returnBtn.disabled = true;


    if (action === 'flag') {
      flagBtn.classList.add('active');
      flagBtn.textContent = 'Flagged';
      reportModalText.textContent = 'Report Flagged for Revision — Farmer will be notified.';
    } else {
      approveBtn.classList.add('active');
      reportModalText.textContent = 'Report Submitted to Regional Level';
    }


    reportModal.classList.add('show');
  }


  flagBtn?.addEventListener('click', () => finalizeReport('flag'));
  approveBtn?.addEventListener('click', () => finalizeReport('approve'));


  document.getElementById('reportModalConfirmBtn')?.addEventListener('click', () => {
    reportModal.classList.remove('show');
    showReportSubview(reportListSubview);
  });


  document.getElementById('viewAttachmentsBtn')?.addEventListener('click', () => {
    alert('No attachments available in this record.');
  });


  document.getElementById('submitReportBtn')?.addEventListener('click', () => {
    alert('Submit Report form is ready for backend connection.');
  });
}

