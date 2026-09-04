import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import { io, Socket } from 'socket.io-client';

const SERVER_URL = 'https://bang-2.onrender.com';
const socket: Socket = io(SERVER_URL, { reconnection: true, reconnectionDelay: 3000 });

const childState: Record<string, { lastSeen: number; status: 'online' | 'offline'; lat: number; lng: number }> = {};
let currentFamilyId: string | null = null;
let monitoring = false;

// --- DOM ELEMENTS ---
const appContainer = document.createElement('div');
appContainer.id = 'app-container';
document.body.appendChild(appContainer);

// Toggle button for mobile
const toggleBtn = document.createElement('button');
toggleBtn.id = 'toggle-panel';
toggleBtn.className = 'toggle-btn';
toggleBtn.innerHTML = '&#9776;';
appContainer.appendChild(toggleBtn);

const sidePanel = document.createElement('div');
sidePanel.id = 'side-panel';
appContainer.appendChild(sidePanel);

toggleBtn.onclick = () => {
  sidePanel.classList.toggle('panel-open');
  toggleBtn.classList.toggle('btn-hidden');
  if (map) setTimeout(() => map.invalidateSize(), 350);
};

const panelHeader = document.createElement('div');
panelHeader.className = 'panel-header';
panelHeader.innerHTML = `<h1>&#x1F4CD; Child Tracker</h1>`;
sidePanel.appendChild(panelHeader);

// Connection status
const connectionBar = document.createElement('div');
connectionBar.className = 'connection-bar connection-disconnected';
connectionBar.textContent = 'Connecting...';
sidePanel.appendChild(connectionBar);

// Config section
const connectionSection = document.createElement('div');
connectionSection.className = 'connection-section';

const inputGroup = document.createElement('div');
inputGroup.className = 'input-group';
inputGroup.innerHTML = `
  <label>Family ID</label>
  <input type="text" id="family-id" class="styled-input" placeholder="Enter family ID...">
`;
connectionSection.appendChild(inputGroup);

const buttonRow = document.createElement('div');
buttonRow.className = 'button-row';

const joinBtn = document.createElement('button');
joinBtn.id = 'join-btn';
joinBtn.className = 'btn-primary';
joinBtn.textContent = 'Monitor Family';
buttonRow.appendChild(joinBtn);

connectionSection.appendChild(buttonRow);
sidePanel.appendChild(connectionSection);

// Children list
const childrenListContainer = document.createElement('div');
childrenListContainer.className = 'children-list-container';
childrenListContainer.innerHTML = `<div class="children-list-title">Monitored Children</div>`;
sidePanel.appendChild(childrenListContainer);

// Stats bar
const statsBar = document.createElement('div');
statsBar.className = 'stats-bar';
statsBar.style.display = 'none';
statsBar.innerHTML = `
  <span class="stat"><span class="stat-num" id="stat-online">0</span> online</span>
  <span class="stat"><span class="stat-num" id="stat-total">0</span> total</span>
`;
sidePanel.appendChild(statsBar);

// Map
const mapDiv = document.createElement('div');
mapDiv.id = 'map';
appContainer.appendChild(mapDiv);

// Close panel when clicking on map (mobile)
mapDiv.addEventListener('click', () => {
  if (window.innerWidth <= 768) {
    sidePanel.classList.remove('panel-open');
    toggleBtn.classList.remove('btn-hidden');
    if (map) setTimeout(() => map.invalidateSize(), 350);
  }
});

// --- MAP LOGIC ---
let map: L.Map;
const markers: Record<string, L.Marker> = {};

function createCustomIcon(status: 'online' | 'offline'): L.DivIcon {
  return L.divIcon({
    className: `custom-marker ${status === 'offline' ? 'marker-offline' : ''}`,
    html: `<div class="marker-pulse"></div><div class="marker-dot"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
}

function initMap() {
  map = L.map('map', { zoomControl: false }).setView([0, 0], 2);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
}

function fitMapToMarkers() {
  if (!map) return;
  const coords = Object.values(childState).map(c => [c.lat, c.lng] as [number, number]);
  if (coords.length === 0) return;
  if (coords.length === 1) {
    map.setView(coords[0], 15);
  } else {
    map.fitBounds(L.latLngBounds(coords), { padding: [50, 50] });
  }
}

function createPopupContent(childId: string, lat: number, lng: number): string {
  return `
    <div class="custom-popup">
      <div class="popup-title">${childId}</div>
      <div class="popup-details">
        <div class="detail-row"><strong>Lat:</strong> ${lat.toFixed(6)}</div>
        <div class="detail-row"><strong>Lng:</strong> ${lng.toFixed(6)}</div>
        <div class="popup-time">Last updated: ${new Date().toLocaleTimeString()}</div>
      </div>
      <a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" class="popup-link">View in Google Maps</a>
    </div>
  `;
}

function updateMarker(childId: string, lat: number, lng: number, status: 'online' | 'offline') {
  if (!map) return;

  const content = createPopupContent(childId, lat, lng);

  if (markers[childId]) {
    markers[childId].setLatLng([lat, lng]);
    markers[childId].setIcon(createCustomIcon(status));
    markers[childId].setPopupContent(content);
  } else {
    markers[childId] = L.marker([lat, lng], {
      icon: createCustomIcon(status)
    }).addTo(map).bindPopup(content);
  }
}

// --- CHILD LIST ---
const childElements: Record<string, HTMLElement> = {};

function updateChildListUI() {
  const title = childrenListContainer.querySelector('.children-list-title') as HTMLElement;

  // Remove stale elements
  Object.keys(childElements).forEach(id => {
    if (!childState[id]) {
      childElements[id].remove();
      delete childElements[id];
    }
  });

  // Update or create elements
  Object.entries(childState).forEach(([childId, state]) => {
    if (childElements[childId]) {
      // Update existing
      const el = childElements[childId];
      el.querySelector('.child-last-seen')!.textContent = `Last seen: ${new Date(state.lastSeen).toLocaleTimeString()}`;
      const dot = el.querySelector('.status-indicator')!;
      dot.className = `status-indicator ${state.status === 'online' ? 'status-online' : 'status-offline'}`;
    } else {
      // Create new
      const item = document.createElement('div');
      item.className = 'child-item';
      item.innerHTML = `
        <div class="child-info">
          <span class="child-name">${childId}</span>
          <span class="child-last-seen">Last seen: ${new Date(state.lastSeen).toLocaleTimeString()}</span>
        </div>
        <div class="status-indicator ${state.status === 'online' ? 'status-online' : 'status-offline'}"></div>
      `;
      item.onclick = () => {
        if (map && childState[childId]) {
          map.setView([childState[childId].lat, childState[childId].lng], 16);
          markers[childId]?.openPopup();
        }
      };
      childrenListContainer.appendChild(item);
      childElements[childId] = item;
    }
  });

  // Update stats
  const online = Object.values(childState).filter(c => c.status === 'online').length;
  const statOnline = document.getElementById('stat-online');
  const statTotal = document.getElementById('stat-total');
  if (statOnline) statOnline.textContent = String(online);
  if (statTotal) statTotal.textContent = String(Object.keys(childState).length);
}

// Heartbeat monitor
setInterval(() => {
  const now = Date.now();
  let changed = false;

  Object.entries(childState).forEach(([childId, state]) => {
    if (state.status === 'online' && (now - state.lastSeen > 30000)) {
      state.status = 'offline';
      changed = true;
      if (markers[childId]) {
        markers[childId].setIcon(createCustomIcon('offline'));
      }
    }
  });

  if (changed) updateChildListUI();
}, 10000);

// --- CONNECTION STATUS ---
function updateConnectionStatus(connected: boolean) {
  connectionBar.className = `connection-bar ${connected ? 'connection-connected' : 'connection-disconnected'}`;
  connectionBar.textContent = connected ? 'Connected to server' : 'Reconnecting...';
}

// --- SOCKET EVENTS ---
socket.on('connect', () => updateConnectionStatus(true));
socket.on('disconnect', () => updateConnectionStatus(false));
socket.on('connect_error', () => updateConnectionStatus(false));

socket.on('error', (data: { message: string }) => {
  console.error('Server error:', data.message);
});

joinBtn.onclick = () => {
  const familyIdInput = document.getElementById('family-id') as HTMLInputElement;
  const familyId = familyIdInput.value.trim();
  if (!familyId) {
    alert('Please enter Family ID');
    return;
  }

  currentFamilyId = familyId;
  monitoring = true;
  socket.emit('join_family', { familyId, role: 'parent', userId: 'parent-1' });

  if (!map) initMap();
  joinBtn.disabled = true;
  joinBtn.textContent = 'Monitoring...';

  statsBar.style.display = 'flex';
};

socket.on('initial_locations', (locations: any[]) => {
  if (!map) return;

  locations.forEach((loc) => {
    childState[loc.childId] = { lastSeen: Date.now(), status: 'online', lat: loc.lat, lng: loc.lng };
    updateMarker(loc.childId, loc.lat, loc.lng, 'online');
  });
  updateChildListUI();
  fitMapToMarkers();
});

socket.on('location_changed', (data: { childId: string; lat: number; lng: number }) => {
  const { childId, lat, lng } = data;
  childState[childId] = { lastSeen: Date.now(), status: 'online', lat, lng };
  updateMarker(childId, lat, lng, 'online');
  updateChildListUI();
});

socket.on('child_disconnected', (data: { childId: string }) => {
  if (childState[data.childId]) {
    childState[data.childId].status = 'offline';
    if (markers[data.childId]) {
      markers[data.childId].setIcon(createCustomIcon('offline'));
    }
    updateChildListUI();
  }
});
