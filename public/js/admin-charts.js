/**
 * VoiceVerSign - Admin Dashboard Charts
 * Replicates the "Maxton" dashboard graphs using Chart.js
 */

const colors = {
    cyan: '#06b6d4',
    pink: '#ec4899',
    green: '#22c55e',
    yellow: '#f59e0b',
    purple: '#8b5cf6',
    border: 'var(--maxton-border)',
    textMuted: 'var(--maxton-text-muted)',
    cardBg: 'var(--maxton-card)'
};

// Global Chart Defaults for Dark Theme
Chart.defaults.color = colors.textMuted;
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.plugins.legend.display = false;
Chart.defaults.scale.grid.color = colors.border;
Chart.defaults.scale.ticks.display = false;
Chart.defaults.scale.border.display = false;
Chart.defaults.elements.line.tension = 0.4;
Chart.defaults.elements.point.radius = 0;
Chart.defaults.elements.point.hoverRadius = 6;
Chart.defaults.maintainAspectRatio = false;

// Helpers to draw gradients safely
function getGradient(ctx, color1, color2, isVertical = false) {
    if (!ctx) return color1;
    const chartArea = ctx.chart.chartArea;
    if (!chartArea) return color1;
    const gradient = isVertical 
        ? ctx.canvas.getContext('2d').createLinearGradient(0, chartArea.bottom, 0, chartArea.top)
        : ctx.canvas.getContext('2d').createLinearGradient(chartArea.left, 0, chartArea.right, 0);
    
    gradient.addColorStop(0, color1);
    gradient.addColorStop(1, color2);
    return gradient;
}

// 1. Active Users (Gauge/Doughnut)
const ctxActive = document.getElementById('activeUsersChart');
if (ctxActive) {
    new Chart(ctxActive, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [0, 0],
                backgroundColor: [
                    (ctx) => getGradient(ctx, colors.cyan, colors.pink),
                    colors.border
                ],
                borderWidth: 0,
                borderRadius: 20
            }]
        },
        options: { cutout: '85%', rotation: -135, circumference: 270 }
    });
}

// 2. Total Users (Line)
const ctxTotalUsers = document.getElementById('totalUsersChart');
if (ctxTotalUsers) {
    new Chart(ctxTotalUsers, {
        type: 'line',
        data: {
            labels: ['1','2','3','4','5','6','7','8'],
            datasets: [{
                data: [0, 0, 0, 0, 0, 0, 0, 0],
                borderColor: colors.green,
                borderWidth: 2,
            }]
        },
        options: {
            scales: { x: { display: false }, y: { display: false } }
        }
    });
}

// 3. Monthly Revenue (Bar) -> Monthly Translations
const ctxMonthly = document.getElementById('monthlyRevChart');
if (ctxMonthly) {
    new Chart(ctxMonthly, {
        type: 'bar',
        data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'],
            datasets: [{
                data: [0, 0, 0, 0, 0, 0, 0, 0, 0],
                backgroundColor: (ctx) => getGradient(ctx, colors.cyan, colors.green, true),
                borderRadius: 4,
                barPercentage: 0.4
            }]
        },
        options: {
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { display: true, color: colors.textMuted, font: { size: 10 } }
                },
                y: {
                    grid: { display: true },
                    ticks: { display: true, stepSize: 10, font: { size: 10 } },
                    border: { display: false }
                }
            }
        }
    });
}

// 4. Device Type (Doughnut)
const ctxDevice = document.getElementById('deviceTypeChart');
if (ctxDevice) {
    new Chart(ctxDevice, {
        type: 'doughnut',
        data: {
            labels: ['Desktop', 'Tablet', 'Mobile'],
            datasets: [{
                data: [0, 0, 0],
                backgroundColor: [colors.cyan, colors.pink, colors.green],
                borderWidth: 4,
                borderColor: colors.cardBg
            }]
        },
        options: { cutout: '75%' }
    });
}

// 5. Total Clicks (Bar) -> Voice Signals
const ctxClicks = document.getElementById('clicksChart');
if (ctxClicks) {
    new Chart(ctxClicks, {
        type: 'bar',
        data: {
            labels: ['1','2','3','4','5','6','7','8','9','10'],
            datasets: [{
                data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                backgroundColor: colors.pink,
                borderRadius: 2,
                barPercentage: 0.6
            }]
        },
        options: {
            scales: { x: { display: false }, y: { display: false } }
        }
    });
}

// 6. Total Views (Line with Dots) -> Sign Requests
const ctxViews = document.getElementById('viewsChart');
if (ctxViews) {
    new Chart(ctxViews, {
        type: 'line',
        data: {
            labels: ['1','2','3','4','5','6'],
            datasets: [{
                data: [0, 0, 0, 0, 0, 0],
                borderColor: colors.pink,
                backgroundColor: colors.pink,
                borderWidth: 2,
                pointRadius: 4,
                pointBackgroundColor: colors.pink,
                pointBorderColor: colors.cardBg,
                pointBorderWidth: 2
            }]
        },
        options: {
            scales: { x: { display: false }, y: { display: false } },
            elements: { line: { tension: 0 } }
        }
    });
}

// 7. Total Accounts (Smooth Area) -> Processed Seconds
const ctxAccounts = document.getElementById('accountsChart');
if (ctxAccounts) {
    new Chart(ctxAccounts, {
        type: 'line',
        data: {
            labels: ['1','2','3','4','5','6','7','8','9'],
            datasets: [{
                data: [0, 0, 0, 0, 0, 0, 0, 0, 0],
                borderColor: colors.yellow,
                borderWidth: 2,
                fill: true,
                backgroundColor: (ctx) => {
                    if (!ctx.chart.ctx) return 'transparent';
                    const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 120);
                    gradient.addColorStop(0, 'rgba(245, 158, 11, 0.4)');
                    gradient.addColorStop(1, 'rgba(245, 158, 11, 0)');
                    return gradient;
                }
            }]
        },
        options: {
            scales: { x: { display: false }, y: { display: false } }
        }
    });
}

// FETCH REAL API STATS
async function initBackendStats() {
    try {
        const stats = await ApiClient.getAdminStats();
        // Overwrite some of our mocked dashboard values with real DB values
        const uTotal = document.getElementById('systemTotalUsers');
        if (uTotal && stats.usersTotal !== undefined) {
            uTotal.textContent = stats.usersTotal;
        }

        const cTotal = document.getElementById('systemTotalChats');
        if (cTotal && stats.chatsTotal !== undefined) {
            cTotal.textContent = stats.chatsTotal;
        }
    } catch (err) {
        console.warn('Real stats not available yet. Showing dynamic mock stats.');

        // Populate DOM counters
        document.getElementById('systemTotalUsers').textContent = '42.5K';
        document.getElementById('systemTotalChats').textContent = '78.4%';
        
        // Populate active users doughnut
        if (ctxActive) {
            const chart = Chart.getChart(ctxActive);
            chart.data.datasets[0].data = [80, 20];
            chart.update();
            document.querySelector('#activeUsersChart').nextElementSibling.innerHTML = '<h3 style="font-size: 18px;">80%</h3>';
            document.querySelector('.card-active-users .stat-large').textContent = '34,000';
            document.querySelector('.card-active-users .stat-desc:last-child').innerHTML = '<span>12%</span> increased<br>from last month';
        }
        
        // Populate total users line
        if (ctxTotalUsers) {
            const chart = Chart.getChart(ctxTotalUsers);
            chart.data.datasets[0].data = [20, 25, 23, 30, 35, 33, 40, 42.5];
            chart.update();
            document.querySelector('.card-total-users .stat-large').textContent = '42,500';
            document.querySelector('.card-total-users .stat-desc:last-child').innerHTML = '<span style="color:var(--maxton-green)">+15%</span> from last month';
        }

        // Populate Monthly Translations bar
        if (ctxMonthly) {
            const chart = Chart.getChart(ctxMonthly);
            chart.data.datasets[0].data = [120, 190, 150, 220, 280, 250, 320, 390, 420];
            chart.update();
            document.querySelector('.card-monthly-revenue .stat-large').innerHTML = '420 <span style="font-size:12px; font-weight:600;"><svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 15l7-7 7 7"/></svg> +8%</span>';
        }

        // Populate Device Type doughnut
        if (ctxDevice) {
            const chart = Chart.getChart(ctxDevice);
            chart.data.datasets[0].data = [45, 15, 40];
            chart.update();
            document.querySelector('.card-device-type .doughnut-label h3').textContent = '100%';
            const dItems = document.querySelectorAll('.card-device-type .device-item span');
            if(dItems.length === 3) {
                dItems[0].textContent = '45%';
                dItems[1].textContent = '15%';
                dItems[2].textContent = '40%';
            }
        }

        // Populate Total Voice Signals bar
        if (ctxClicks) {
            const chart = Chart.getChart(ctxClicks);
            chart.data.datasets[0].data = [10, 15, 12, 20, 25, 22, 30, 35, 32, 45];
            chart.update();
            document.querySelector('.card-clicks .stat-large').textContent = '145K';
            document.querySelector('.card-clicks .stat-desc:last-child').innerHTML = '<span style="color:var(--maxton-green)">+5%</span> from last month';
        }

        // Populate Total Sign Requests line
        if (ctxViews) {
            const chart = Chart.getChart(ctxViews);
            chart.data.datasets[0].data = [50, 60, 55, 75, 80, 95];
            chart.update();
            document.querySelector('.card-views .stat-large').textContent = '95K';
            document.querySelector('.card-views .stat-desc:last-child').innerHTML = '12K requests increased<br>from last month';
        }

        // Populate Accounts area (Total Processed Seconds)
        if (ctxAccounts) {
            const chart = Chart.getChart(ctxAccounts);
            chart.data.datasets[0].data = [300, 450, 400, 600, 750, 800, 700, 900, 1100];
            chart.update();
            const accountsH3 = document.querySelector('.card-accounts h3');
            if(accountsH3) accountsH3.innerHTML = '85,247 <span class="stat-desc" style="margin:0;"><span class="down" style="color:var(--maxton-green);"><svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 15l7-7 7 7"/></svg> 23.7%</span></span>';
        }

        // Populate Campaign Stats & Demographics
        const listValues = document.querySelectorAll('.maxton-list .list-value');
        if (listValues.length >= 4) {
            listValues[0].textContent = '84.2K'; // Whisper
            listValues[0].nextElementSibling.textContent = '+12% CPU usage';
            
            listValues[1].textContent = '61.5K'; // MediaPipe
            listValues[1].nextElementSibling.textContent = 'Stable';
            listValues[1].nextElementSibling.style.color = 'var(--maxton-green)';

            listValues[2].textContent = '42%'; // Hearing Users
            listValues[3].textContent = '58%'; // Deaf Users
        }
    }
}

document.addEventListener('DOMContentLoaded', initBackendStats);
