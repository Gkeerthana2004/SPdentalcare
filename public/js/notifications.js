const NotificationManager = {
  maxNotifications: 50,

  async getAll() {
    if (typeof SupabaseDB === 'undefined' || !SupabaseDB.isConfigured()) return [];
    try {
      const { data, error } = await SupabaseDB.getClient()
        .from('notifications')
        .select('*')
        .order('created', { ascending: false })
        .limit(this.maxNotifications);
      if (error) throw error;
      return data || [];
    } catch (e) {
      devWarn('Notifications fetch failed:', e.message);
      return [];
    }
  },

  async add(title, body, type = 'info') {
    if (typeof SupabaseDB === 'undefined' || !SupabaseDB.isConfigured()) return;
    try {
      await SupabaseDB.getClient().from('notifications').insert([{
        title, body, type, read: false
      }]);
      this.updateBadge();
      this.showToast(title, body);
    } catch (e) {
      devWarn('Notification insert failed:', e.message);
    }
  },

  async markAllRead() {
    if (typeof SupabaseDB === 'undefined' || !SupabaseDB.isConfigured()) return;
    try {
      const { data } = await SupabaseDB.getClient()
        .from('notifications')
        .select('id')
        .eq('read', false);
      if (data && data.length) {
        await SupabaseDB.getClient()
          .from('notifications')
          .update({ read: true })
          .in('id', data.map(n => n.id));
      }
      this.updateBadge();
    } catch (e) {
      devWarn('Notifications mark read failed:', e.message);
    }
  },

  async unreadCount() {
    if (typeof SupabaseDB === 'undefined' || !SupabaseDB.isConfigured()) return 0;
    try {
      const { count } = await SupabaseDB.getClient()
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('read', false);
      return count || 0;
    } catch (e) {
      return 0;
    }
  },

  async updateBadge() {
    const dot = document.querySelector('.notif-dot');
    const count = await this.unreadCount();
    if (dot) dot.style.display = count > 0 ? 'block' : 'none';
  },

  showToast(title, body) {
    if (typeof toast === 'function') {
      toast('\uD83D\uDD14', title, body);
    }
  },

  async togglePanel() {
    const existing = document.getElementById('notifPanel');
    if (existing) { existing.remove(); return; }
    await this.markAllRead();
    const notifications = await this.getAll();
    const panel = document.createElement('div');
    panel.id = 'notifPanel';
    panel.style.cssText = 'position:fixed;top:60px;right:24px;width:360px;max-height:480px;background:var(--white);border:1px solid var(--border);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,0.15);z-index:500;overflow:hidden;animation:fadeIn 0.2s ease';
    let html = '<div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between"><div style="font-weight:600;font-size:15px;color:var(--deep)">Notifications</div><div style="font-size:12px;color:var(--teal);cursor:pointer" onclick="NotificationManager.clearAll()">Clear all</div></div>';
    if (!notifications.length) {
      html += '<div style="padding:40px 20px;text-align:center;color:var(--text-dim);font-size:13px"><div style="font-size:32px;margin-bottom:8px">\uD83D\uDCB0</div>No notifications yet</div>';
    } else {
      html += '<div style="max-height:400px;overflow-y:auto">';
      notifications.forEach(n => {
        const icon = n.type === 'appointment' ? '\uD83D\uDCC5' : n.type === 'patient' ? '\uD83D\uDC64' : '\uD83D\uDD14';
        const timeAgo = this.timeAgo(n.created);
        html += '<div style="padding:14px 20px;border-bottom:1px solid var(--border);' + (n.read ? '' : 'background:rgba(45,212,191,0.04);') + '"><div style="display:flex;align-items:flex-start;gap:10px"><span style="font-size:18px;margin-top:2px">' + icon + '</span><div style="flex:1;min-width:0"><div style="font-weight:600;font-size:13px;color:var(--deep)">' + htmlEscape(n.title) + '</div><div style="font-size:12px;color:var(--text-muted);margin-top:3px;line-height:1.4">' + htmlEscape(n.body || '') + '</div><div style="font-size:11px;color:var(--text-dim);margin-top:4px">' + htmlEscape(timeAgo) + '</div></div></div></div>';
      });
      html += '</div>';
    }
    panel.innerHTML = html;
    document.body.appendChild(panel);
    const close = (e) => { if (!panel.contains(e.target) && !e.target.closest('.notif-btn')) { panel.remove(); document.removeEventListener('click', close); } };
    setTimeout(() => document.addEventListener('click', close), 10);
  },

  async clearAll() {
    if (typeof SupabaseDB === 'undefined' || !SupabaseDB.isConfigured()) return;
    try {
      await SupabaseDB.getClient().from('notifications').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    } catch (e) {
      devWarn('Notifications clear failed:', e.message);
    }
    this.updateBadge();
    const panel = document.getElementById('notifPanel');
    if (panel) panel.remove();
  },

  timeAgo(isoStr) {
    if (!isoStr) return '';
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    const days = Math.floor(hrs / 24);
    return days + 'd ago';
  },

  async init() {
    await this.updateBadge();
    this.setupRealtime();
  },

  setupRealtime() {
    if (typeof SupabaseDB === 'undefined' || !SupabaseDB.isConfigured()) return;
    const client = SupabaseDB.getClient();
    if (!client) return;
    try {
      const channel = client.channel('public:appointments');
      channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'appointments' }, payload => {
        const apt = payload.new;
        this.add('New Appointment', apt.name + ' booked ' + apt.service + ' on ' + apt.date + ' at ' + apt.time, 'appointment');
      });
      channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'appointments' }, payload => {
        const apt = payload.new;
        if (apt.status === 'Completed') {
          this.add('Appointment Completed', apt.name + ' - ' + apt.service, 'appointment');
        }
      });
      channel.subscribe();
    } catch (e) {
      devWarn('Realtime subscription failed:', e.message || e);
    }
  }
};

window.NotificationManager = NotificationManager;

document.addEventListener('DOMContentLoaded', () => {
  NotificationManager.init();
  const bell = document.querySelector('.notif-btn');
  if (bell) {
    bell.removeAttribute('onclick');
    bell.addEventListener('click', (e) => { e.stopPropagation(); NotificationManager.togglePanel(); });
  }
});
