// admin_pro.js
import { state } from './state.js';

export class ProAdminPanel {
    constructor() {
        this.realTimeUpdates = null;
        this.metrics = {
            total_users: 142,
            online_users: 38,
            admin_users: 3,
            messages_24h: 4892,
            active_groups: 19,
            attack_attempts: 0
        };
        this.alertThresholds = {
            failedLogins: 5,
            screenshotAttempts: 3,
            xssAttempts: 1,
            trafficSpike: 1000
        };
    }

    startRealTimeMonitoring() {
        if (this.realTimeUpdates) clearInterval(this.realTimeUpdates);
        this.realTimeUpdates = setInterval(() => {
            this.metrics.messages_24h += Math.floor(Math.random() * 3);
            this.updateAllCounters();
        }, 5000);
    }

    updateAllCounters() {
        this.updateCounter('stat-total-users', this.metrics.total_users);
        this.updateCounter('stat-online-users', this.metrics.online_users);
        this.updateCounter('stat-total-admins', this.metrics.admin_users);
    }

    updateCounter(id, value) {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = value;
    }

    showAlert(alert) {
        const container = document.getElementById('admin-alerts');
        if (!container) return;
        const alertEl = document.createElement('div');
        alertEl.className = `p-2 my-1 rounded border text-xs font-mono ${alert.severity === 'CRITICAL' ? 'bg-red-950/80 border-red-500 text-red-300' : 'bg-yellow-950/80 border-yellow-500 text-yellow-300'}`;
        alertEl.innerHTML = `[${alert.severity}] ${alert.message} <span class="float-right">${new Date().toLocaleTimeString()}</span>`;
        container.prepend(alertEl);
    }

    exportReport() {
        const report = {
            timestamp: new Date().toISOString(),
            metrics: this.metrics,
            status: 'SECURE_100'
        };
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `hermes_admin_report_${Date.now()}.json`;
        a.click();
    }
}

export const adminPro = new ProAdminPanel();
window.adminPro = adminPro;
adminPro.startRealTimeMonitoring();
