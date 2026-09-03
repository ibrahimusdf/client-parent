import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { io } from 'socket.io-client';

const SERVER_URL = 'https://bang-2.onrender.com';
const socket = io(SERVER_URL);

const appDiv = document.createElement('div');
appDiv.style.fontFamily = 'sans-serif';
appDiv.style.padding = '20px';
document.body.appendChild(appDiv);

const familyInput = document.createElement('input');
familyInput.placeholder = 'Family ID';
familyInput.style.margin = '10px';
appDiv.appendChild(familyInput);

const joinBtn = document.createElement('button');
joinBtn.textContent = 'Monitor Family';
joinBtn.style.padding = '10px 20px';
appDiv.appendChild(joinBtn);

const mapDiv = document.createElement('div');
mapDiv.id = 'map';
mapDiv.style.height = '80vh';
mapDiv.style.marginTop = '20px';
mapDiv.style.border = '1px solid #ccc';
appDiv.appendChild(mapDiv);

let map: L.Map;
const markers: Record<string, L.Marker> = {};

function initMap() {
  map = L.map('map').setView([0, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);
}

joinBtn.onclick = () => {
  const familyId = familyInput.value;
  if (!familyId) {
    alert('Please enter Family ID');
    return;
  }

  socket.emit('join_family', { familyId, role: 'parent', userId: 'parent-1' });

  if (!map) initMap();
  joinBtn.disabled = true;
};

socket.on('initial_locations', (locations) => {
  if (!map) return;

  locations.forEach((loc: any) => {
    updateMarker(loc.childId, loc.lat, loc.lng);
  });

  if (Object.keys(markers).length > 0) {
    const group = L.featureGroup(Object.values(markers));
    map.fitBounds(group.getBounds());
  }
});

socket.on('location_changed', (data) => {
  const { childId, lat, lng } = data;
  updateMarker(childId, lat, lng);
});

function updateMarker(childId: string, lat: number, lng: number) {
  if (!map) return;

  if (markers[childId]) {
    markers[childId].setLatLng([lat, lng]);
  } else {
    markers[childId] = L.marker([lat, lng]).addTo(map).bindPopup(`Child: ${childId}`);
  }
}
