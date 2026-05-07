// --- 1. CONFIGURATION ---
let currentLocation = "MP_Floor_3"; 
let currentSessionID = 0; 
let co2Chart, climateChart;
let chartUpdateTimeout = null; // Throttling variable
const MAX_HISTORY_POINTS = 20;

function changeLocation(newLoc) {
    if (newLoc === currentLocation) return;

    currentSessionID++;
    const thisSession = currentSessionID;
    currentLocation = newLoc;

    // UI Updates
    document.querySelectorAll('#locationList li').forEach(li => {
        li.classList.remove('active');
        if (li.getAttribute('onclick').includes(newLoc)) li.classList.add('active');
    });
    document.getElementById('currentLocationTitle').innerText = newLoc.replace(/_/g, ' ');

    hideLiveUI();

    // Kill listeners
    firebase.database().ref(`air_quality`).off();
    firebase.database().ref(`air_history`).off();

    // Instant reset with zero animation to free up memory
    wipeCharts();

    startListening(thisSession);
}

function startListening(sessionID) {
    const livePath = firebase.database().ref(`air_quality/${currentLocation}`);
    const historyPath = firebase.database().ref(`air_history/${currentLocation}`);

    livePath.on('value', (snapshot) => {
        if (sessionID !== currentSessionID) return;
        const data = snapshot.val();
        if (!data) { hideLiveUI(); return; }

        const isFresh = (Date.now() - data.timestamp) < 60000;
        const isCorrectRoom = (data.location === currentLocation);

        if (isFresh && isCorrectRoom) {
            showLiveUI(data);
        } else {
            hideLiveUI();
        }
    });

    historyPath.limitToLast(MAX_HISTORY_POINTS).on('value', (snapshot) => {
        if (sessionID !== currentSessionID) return;

        if (!snapshot.exists()) {
            wipeCharts();
            return;
        }

        const labels = [], co2Data = [], tempData = [], humData = [];
        snapshot.forEach(child => {
            const v = child.val();
            const time = new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            labels.push(time);
            co2Data.push(v.gas);
            tempData.push(v.temp);
            humData.push(v.humid);
        });

        // Use Throttled Update to prevent choppiness
        throttledUpdate(labels, co2Data, tempData, humData);
    });
}

/**
 * THROTTLING LOGIC
 * This prevents the browser from trying to draw too fast.
 */
function throttledUpdate(l, c, t, h) {
    if (chartUpdateTimeout) clearTimeout(chartUpdateTimeout);
    
    // Only update once every 300ms max
    chartUpdateTimeout = setTimeout(() => {
        updateCharts(l, c, t, h);
    }, 300);
}

function wipeCharts() {
    if(!co2Chart || !climateChart) return;
    co2Chart.data.labels = [];
    co2Chart.data.datasets[0].data = [];
    co2Chart.update('none'); // No animation for wipes

    climateChart.data.labels = [];
    climateChart.data.datasets[0].data = [];
    climateChart.data.datasets[1].data = [];
    climateChart.update('none');
}

function initCharts() {
    const commonOpts = { 
        responsive: true, 
        maintainAspectRatio: false,
        animation: {
            duration: 500, // Faster, snappy animation
            easing: 'linear' // Linear is much less CPU intensive than "ease"
        },
        // Performance boosts
        spanGaps: true, 
        normalized: true, 
        elements: {
            line: { tension: 0, borderWidth: 2 }, // Straight lines are easier to draw than curves
            point: { radius: 0 } // Removing points makes it 2x faster to render
        },
        plugins: { legend: { display: true } },
        scales: {
            x: { ticks: { color: '#64748b', maxRotation: 0 }, grid: { display: false } },
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
        data: { labels: [], datasets: [
            { label: 'Temp °C', data: [], borderColor: '#f87171' },
            { label: 'Humid %', data: [], borderColor: '#60a5fa' }
        ]},
        options: commonOpts
    });

    startListening(currentSessionID);
}

function updateCharts(l, c, t, h) {
    if(!co2Chart || !climateChart) return;
    
    co2Chart.data.labels = l;
    co2Chart.data.datasets[0].data = c;
    co2Chart.update();

    climateChart.data.labels = l;
    climateChart.data.datasets[0].data = t;
    climateChart.data.datasets[1].data = h;
    climateChart.update();
}

function showLiveUI(data) {
    document.getElementById('liveSection').style.display = "flex";
    document.getElementById('liveBadge').style.display = "block";
    document.getElementById('liveScore').innerText = data.score;
    const statusEl = document.getElementById('airStatus');
    statusEl.innerText = data.score >= 70 ? "GOOD" : "POOR";
    statusEl.style.color = data.score >= 70 ? "#4ade80" : "#f87171";
}

function hideLiveUI() {
    document.getElementById('liveSection').style.display = "none";
    document.getElementById('liveBadge').style.display = "none";
}

window.onload = initCharts;