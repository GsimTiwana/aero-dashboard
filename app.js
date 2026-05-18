let currentLocation = "MP_Floor_3"; 
let currentSessionID = 0; 
let co2Chart, climateChart, gaugeChart;
let chartUpdateTimeout = null;
const MAX_HISTORY_POINTS = 20;

function changeLocation(newLoc) {
    if (newLoc === currentLocation) return;
    currentSessionID++;
    const thisSession = currentSessionID;
    currentLocation = newLoc;

    // UI Highlights
    document.querySelectorAll('#locationList li').forEach(li => {
        li.classList.remove('active');
        if (li.getAttribute('onclick').includes(newLoc)) li.classList.add('active');
    });
    document.getElementById('currentLocationTitle').innerText = newLoc.replace(/_/g, ' ');

    hideLiveUI();
    firebase.database().ref(`air_quality`).off();
    firebase.database().ref(`air_history`).off();
    wipeCharts();
    startListening(thisSession);
}

function startListening(sessionID) {
    const livePath = firebase.database().ref(`air_quality/${currentLocation}`);
    const historyPath = firebase.database().ref(`air_history/${currentLocation}`);

    livePath.on('value', (snapshot) => {
        if (sessionID !== currentSessionID) return;
        const data = snapshot.val();
        if (data && (Date.now() - data.timestamp) < 60000) showLiveUI(data);
        else hideLiveUI();
    });

    historyPath.limitToLast(MAX_HISTORY_POINTS).on('value', (snapshot) => {
        if (sessionID !== currentSessionID) return;
        if (!snapshot.exists()) { wipeCharts(); return; }

        const labels = [], co2Data = [], tempData = [], humData = [];
        snapshot.forEach(child => {
            const v = child.val();
            const dateObj = new Date(v.timestamp);
            const label = `${dateObj.toLocaleDateString([], {day:'2-digit', month:'short'})}, ${dateObj.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12:false})}`;
            labels.push(label);
            co2Data.push(v.gas); tempData.push(v.temp); humData.push(v.humid);
        });
        throttledUpdate(labels, co2Data, tempData, humData);
    });
}

function throttledUpdate(l, c, t, h) {
    if (chartUpdateTimeout) clearTimeout(chartUpdateTimeout);
    chartUpdateTimeout = setTimeout(() => {
        co2Chart.data.labels = l; co2Chart.data.datasets[0].data = c; co2Chart.update();
        climateChart.data.labels = l; climateChart.data.datasets[0].data = t;
        climateChart.data.datasets[1].data = h; climateChart.update();
    }, 300);
}

function initCharts() {
    // 1. Gauge Chart
    const gaugeCtx = document.getElementById('gaugeChart').getContext('2d');
    gaugeChart = new Chart(gaugeCtx, {
        type: 'doughnut',
        data: { datasets: [{ data: [0, 100], backgroundColor: ['#00d4ff', '#334155'], borderWidth: 0, circumference: 180, rotation: 270, cutout: '85%', borderRadius: 10 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: { enabled: false } } }
    });

    // 2. Common Options for Line Charts
    const commonOpts = {
        responsive: true, maintainAspectRatio: false,
        elements: { line: { tension: 0.3, borderWidth: 3 }, point: { radius: 0 } },
        scales: {
            x: { ticks: { color: '#64748b', maxRotation: 45, minRotation: 45, autoSkip: true, maxTicksLimit: 8 } },
            y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
    };

    co2Chart = new Chart(document.getElementById('co2Chart'), {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'CO2 PPM', data: [], borderColor: '#00d4ff', backgroundColor: 'rgba(0,212,255,0.1)', fill: true }] },
        options: commonOpts
    });

    climateChart = new Chart(document.getElementById('climateChart'), {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'Temp °C', data: [], borderColor: '#f87171' }, { label: 'Humid %', data: [], borderColor: '#60a5fa' }] },
        options: commonOpts
    });

    startListening(currentSessionID);
}

function showLiveUI(data) {
    document.getElementById('liveSection').style.display = "flex";
    document.getElementById('liveBadge').style.display = "block";
    document.getElementById('liveScore').innerText = data.score;
    
    // --- 1. CO2 LOGIC ---
    let co2Color, co2Status, co2Advice;
    if (data.score >= 80) { 
        co2Color = "#4ade80"; co2Status = "EXCELLENT"; co2Advice = "CO2 levels are fresh and healthy!"; 
    } else if (data.score >= 60) { 
        co2Color = "#fbbf24"; co2Status = "FAIR"; co2Advice = "CO2 is acceptable, but consider ventilation."; 
    } else { 
        co2Color = "#f87171"; co2Status = "POOR"; co2Advice = "CO2 High! Open windows immediately."; 
    }

    // --- 2. HUMIDITY LOGIC (For your water spray demo) ---
    let humColor, humAdvice;
    const currentHumidity = data.humid; // Grabs the percentage from Firebase

    if (currentHumidity > 70) {
        // This triggers when you spray the water!
        humColor = "#60a5fa"; // Bright Water Blue
        humAdvice = `💧 High Humidity (${currentHumidity}%): Moisture spike detected! Risk of condensation or dampness.`;
    } else if (currentHumidity >= 30 && currentHumidity <= 70) {
        // Normal room comfort zone
        humColor = "#4ade80"; // Green
        humAdvice = `🍃 Ideal Humidity (${currentHumidity}%): Moisture comfort levels are perfectly balanced.`;
    } else {
        // Dry air
        humColor = "#fbbf24"; // Amber
        humAdvice = `🌵 Dry Air (${currentHumidity}%): Low humidity detected. Consider using a humidifier.`;
    }

    // --- 3. APPLY TO THE LIVE INTERFACE ---
    const statusEl = document.getElementById('airStatus');
    const co2Card = document.getElementById('adviceCard');
    const humCard = document.getElementById('humidityCard');
    
    // Update main overall text status
    statusEl.innerText = co2Status; 
    statusEl.style.color = co2Color;
    
    // Update Gauge colors/values
    gaugeChart.data.datasets[0].data = [data.score, 100 - data.score];
    gaugeChart.data.datasets[0].backgroundColor[0] = co2Color;
    gaugeChart.update();
    
    // Update CO2 Advice Card Visuals
    co2Card.style.borderLeftColor = co2Color;
    document.getElementById('adviceText').innerText = co2Advice;

    // Update Humidity Advice Card Visuals
    humCard.style.borderLeftColor = humColor;
    document.getElementById('humidityText').innerText = humAdvice;
}
function hideLiveUI() {
    document.getElementById('liveSection').style.display = "none";
    document.getElementById('liveBadge').style.display = "none";
}

function wipeCharts() {
    co2Chart.data.labels = []; co2Chart.data.datasets[0].data = []; co2Chart.update('none');
    climateChart.data.labels = []; climateChart.data.datasets[0].data = []; 
    climateChart.data.datasets[1].data = []; climateChart.update('none');
}

// Sidebar Toggle
document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('sidebarToggle');
    const sidebar = document.querySelector('.sidebar');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            setTimeout(() => { 
                co2Chart.resize(); climateChart.resize(); gaugeChart.resize(); 
            }, 350);
        });
    }
    initCharts();
});