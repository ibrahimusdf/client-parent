import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import { io } from 'socket.io-client';

const SERVER_URL = 'https://bang-2.onrender.com';
const socket = io(SERVER_URL);

// State tracking for professional status monitoring
const childState: Record<string, { lastSeen: number; status: 'online' | 'offline' }> = {};

// --- DOM ELEMENTS ---
const appContainer = document.createElement('div');
appContainer.id = 'app-container';
document.body.appendChild(appContainer);

const sidePanel = document.createElement('div');
sidePanel.id = 'side-panel';
appContainer.appendChild(sidePanel);

const panelHeader = document.createElement('div');
panelHeader.className = 'panel-header';
panelHeader.innerHTML = `<h1>📍 Child Tracker</h1>`;
sidePanel.appendChild(panelHeader);

const connectionSection = document.createElement('div');
connectionSection.className = 'connection-section';

const inputGroup = document.createElement('div');
inputGroup.className = 'input-group';
inputGroup.innerHTML = `
  <label>Family ID</label>
  <input type="text" id="family-id" class="styled-input" placeholder="Enter family ID...">
`;
connectionSection.appendChild(inputGroup);

const joinBtn = document.createElement('button');
joinBtn.id = 'join-btn';
joinBtn.className = 'btn-primary';
joinBtn.textContent = 'Monitor Family';
connectionSection.appendChild(joinBtn);

sidePanel.appendChild(connectionSection);

const childrenListContainer = document.createElement('div');
childrenListContainer.className = 'children-list-container';
childrenListContainer.innerHTML = `<div class="children-list-title">Monitored Children</div>`;
sidePanel.appendChild(childrenListContainer);

const mapDiv = document.createElement('div');
mapDiv.id = 'map';
appContainer.appendChild(mapDiv);

// --- MAP LOGIC ---
let map: L.Map;
const markers: Record<string, L.Marker> = {};

function initMap() {
  map = L.map('map', {
    zoomControl: false
  }).setView([0, 0], 2);

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);
}

function createCustomIcon(status: 'online' | 'offline') {
  const className = status === 'online' ? 'custom-marker' : 'custom-marker marker-offline';
  return L.divIcon({
    className: className,
    html: `<div class="marker-dot"></div><div class="marker-pulse"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });
}

function updateMarker(childId: string, lat: number, lng: number, status: 'online' | 'offline') {
  if (!map) return;

  if (markers[childId]) {
    markers[childId].setLatLng([lat, lng]);
    markers[childId].setIcon(createCustomIcon(status));
  } else {
    markers[childId] = L.marker([lat, lng], {
      icon: createCustomIcon(status)
    }).addTo(map).bindPopup(`
      <div class="custom-popup">
        <div class="popup-title">${childId}</div>
        <div class="popup-time">Last updated: ${new Date().toLocaleTimeString()}</div>
      </div>
    `);
  }
}

// --- STATUS MONITORING ---
function updateChildListUI() {
  // Clear existing items except title
  const title = childrenListContainer.querySelector('.children-list-title');
  childrenListContainer.innerHTML = '';
  childrenListContainer.appendChild(title);

  Object.entries(childState).forEach(([childId, state]) => {
    const item = document.createElement('div');
    item.className = 'child-item';
    item.innerHTML = `
      <div class="child-info">
        <span class="child-name">${childId}</span>
        <span class="child-last-seen">Last seen: ${// format date
          new Date(state.lastSeen).toLocaleTimeString()
        }</span>
      </div>
      <div class="status-indicator ${state.status === 'online' ? 'status-online' : 'status-offline'}"></div>
    `;
    childrenListContainer.appendChild(item);
  });
}

// Heartbeat monitor: check for stale locations every 10 seconds
setInterval(() => {
  const now = Date.now();
  let changed = false;

  Object.entries(childState).forEach(([childId, state]) => {
    if (state.status === 'online' && (now - state.lastSeen > 30000)) {
      state.status = 'offline';
      changed = true;

      // Update marker to offline state if it exists
      if (markers[childId]) {
        markers[childId].setIcon(createCustomIcon('offline'));
      }
    }
  });

  if (changed) updateChildListUI();
}, 10000);

// --- SOCKET LOGIC ---
joinBtn.onclick = () => {
  const familyIdInput = document.getElementById('family-id') as HTMLInputElement;
  const familyId = familyIdInput.value;
  if (!familyId) {
    alert('Please enter Family ID');
    return;
  }

  socket.emit('join_family', { familyId, role: 'parent', userId: 'parent-1' });

  if (!map) initMap();
  joinBtn.disabled = true;
  joinBtn.textContent = 'Monitoring...';
};

socket.on('initial_locations', (locations) => {
  if (!map) return;

  locations.forEach((loc: any) => {
    childState[loc.childId] = { lastSeen: Date.now(), status: 'online' };
    updateMarker(loc.childId, loc.lat, loc.lng, 'online');
  });
  updateChildListUI();
});

socket.on('location_changed', (data) => {
  const { childId, lat, lng } = data;

  childState[childId] = { lastSeen: Date.now(), status: 'online' };
  updateMarker(childId, lat, lng, 'online');
  updateChildListUI();
});
