// app.js - 针绽预约 H5 网页版

// ============ 配置 ============
const CONFIG = {
  // Supabase 配置
  supabaseUrl: 'https://nqkbhywrtvypmoeuytpi.supabase.co',
  supabaseKey: 'sb_publishable_pJB6LH2VQS1hm6SLgq7jxA_4mt6FtB6',
  // 治疗项目配置（含价格）
  treatments: [
    { id: 1, name: '常规针刺（单面留针）', quota: 1, price: 80 },
    { id: 2, name: '常规针刺（双面留针）', quota: 2, price: 120 },
    { id: 3, name: '穴位埋线20根', quota: 1, price: 200 },
    { id: 4, name: '穴位埋线30-40根', quota: 2, price: 300 },
    { id: 5, name: '面针单部位', quota: 1, price: 150 },
    { id: 6, name: '面针2部位', quota: 2, price: 250 }
  ],
  // 可预约天数
  maxDaysAhead: 14,
  // 每个时段名额
  maxQuotaPerSlot: 2
};

// ============ 状态 ============
const state = {
  currentUser: null,
  isDoctor: false,
  dates: [],
  currentDateIndex: 0,
  selectedDate: null,
  selectedSlot: null,
  selectedTreatment: null,
  appointments: {},
  weekendEnabled: false,
  blockedSlots: [],
  calendarMonth: new Date().getMonth(),
  calendarYear: new Date().getFullYear()
};

// ============ Supabase 初始化 ============
let supabase;

function initSupabase() {
  if (typeof SupabaseClient === 'undefined') {
    showToast('Supabase SDK 加载失败', 'error');
    return false;
  }

  supabase = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
  return true;
}

// ============ 工具函数 ============
function formatDate(date, format = 'YYYY-MM-DD') {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

function getWeekday(dateStr) {
  const date = new Date(dateStr);
  return date.getDay();
}

function getWeekdayName(weekday) {
  const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return names[weekday];
}

// 获取可预约时段
function getTimeSlots(weekday) {
  const slots = [];

  // 周六日默认休息
  if (weekday === 0 || weekday === 6) {
    return [];
  }

  // 上午 8:00-11:00，每30分钟
  for (let hour = 8; hour < 11; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const start = String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
      const endHour = minute === 30 ? hour + 1 : hour;
      const end = String(endHour).padStart(2, '0') + ':' + (minute === 30 ? '00' : '30');
      slots.push(start + '-' + end);
    }
  }

  // 下午时段
  let afternoonStart, afternoonEnd;
  if (weekday === 2 || weekday === 4) { // 周二、四
    afternoonStart = 13;
    afternoonEnd = 16;
  } else { // 周一、三、五
    afternoonStart = 15;
    afternoonEnd = 17;
  }

  for (let hour = afternoonStart; hour < afternoonEnd; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const start = String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
      const endHour = minute === 30 ? hour + 1 : hour;
      const end = String(endHour).padStart(2, '0') + ':' + (minute === 30 ? '00' : '30');
      slots.push(start + '-' + end);
    }
  }

  return slots;
}

// 安全创建元素
function createElement(tag, className, content) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (content) el.textContent = content;
  return el;
}

function setInnerHTML(el, html) {
  el.innerHTML = html;
}

// ============ 页面导航 ============
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(function(p) { p.classList.add('hidden'); });
  document.getElementById(pageId).classList.remove('hidden');
  window.scrollTo(0, 0);
}

function showToast(message, type) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast';
  if (type) toast.classList.add(type);
  setTimeout(function() {
    toast.classList.add('hidden');
  }, 2500);
}

// ============ 数据获取 ============
async function loadDates() {
  state.dates = [];
  const today = new Date();

  for (let i = 0; i < CONFIG.maxDaysAhead; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const dateStr = formatDate(date);
    const weekday = getWeekday(dateStr);

    state.dates.push({
      date: dateStr,
      weekday: getWeekdayName(weekday),
      day: date.getDate(),
      month: date.getMonth() + 1,
      isWeekend: weekday === 0 || weekday === 6
    });
  }

  renderDates();
  renderCalendar();
}

// ============ 日历视图 ============
function renderCalendar() {
  const container = document.getElementById('calendarView');
  if (!container) return;

  const year = state.calendarYear;
  const month = state.calendarMonth;
  const today = new Date();
  const todayStr = formatDate(today);

  // 获取当月第一天是星期几
  const firstDay = new Date(year, month, 1).getDay();
  // 获取当月天数
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

  let html = '<div class="calendar-header">';
  html += '<button class="nav-btn" id="prevMonth">&lt;</button>';
  html += '<span class="calendar-title">' + year + '年 ' + monthNames[month] + '</span>';
  html += '<button class="nav-btn" id="nextMonth">&gt;</button>';
  html += '</div>';

  html += '<div class="calendar-weekdays">';
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  weekdays.forEach(function(w) {
    html += '<span class="calendar-weekday">' + w + '</span>';
  });
  html += '</div>';

  html += '<div class="calendar-days">';

  // 填充空白
  for (let i = 0; i < firstDay; i++) {
    html += '<div class="calendar-day disabled"></div>';
  }

  // 填充日期
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    const weekday = new Date(year, month, day).getDay();
    const isWeekend = weekday === 0 || weekday === 6;
    const isToday = dateStr === todayStr;
    const isPast = new Date(year, month, day) < new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const isSelected = dateStr === state.selectedDate;

    // 计算预约情况
    const appointments = state.appointments[dateStr] || [];
    const totalQuota = appointments.reduce(function(sum, a) { return sum + (a.quotaUsed || 0); }, 0);
    const maxQuota = 14 * CONFIG.maxQuotaPerSlot; // 每天约14个时段
    let quotaBadge = '';
    if (totalQuota > 0) {
      const badgeClass = totalQuota >= maxQuota ? 'full' : '';
      quotaBadge = '<span class="quota-badge ' + badgeClass + '">' + totalQuota + '</span>';
    }

    let classes = 'calendar-day';
    if (isToday) classes += ' today';
    if (isSelected) classes += ' selected';
    if (isWeekend && !state.weekendEnabled) classes += ' disabled';
    if (isPast) classes += ' disabled';

    html += '<div class="' + classes + '" data-date="' + dateStr + '">' + day + quotaBadge + '</div>';
  }

  html += '</div>';

  container.innerHTML = html;

  // 绑定事件
  document.getElementById('prevMonth').onclick = function() {
    state.calendarMonth--;
    if (state.calendarMonth < 0) {
      state.calendarMonth = 11;
      state.calendarYear--;
    }
    renderCalendar();
  };

  document.getElementById('nextMonth').onclick = function() {
    state.calendarMonth++;
    if (state.calendarMonth > 11) {
      state.calendarMonth = 0;
      state.calendarYear++;
    }
    renderCalendar();
  };

  // 日期点击
  document.querySelectorAll('.calendar-day:not(.disabled)').forEach(function(el) {
    el.onclick = function() {
      const dateStr = el.dataset.date;
      state.selectedDate = dateStr;
      state.selectedSlot = null;

      // 更新日期列表选中状态
      state.dates.forEach(function(d, i) {
        if (d.date === dateStr) {
          state.currentDateIndex = i;
        }
      });

      renderCalendar();
      loadAppointments(dateStr);
    };
  });
}

function renderDates() {
  const container = document.getElementById('dateList');
  container.innerHTML = '';

  state.dates.forEach(function(item, index) {
    const div = document.createElement('div');
    div.className = 'date-item';
    if (index === state.currentDateIndex) div.classList.add('active');

    const weekdaySpan = document.createElement('span');
    weekdaySpan.className = 'weekday';
    weekdaySpan.textContent = item.weekday;

    const daySpan = document.createElement('span');
    daySpan.className = 'day';
    daySpan.textContent = item.day;

    const monthSpan = document.createElement('span');
    monthSpan.className = 'month';
    monthSpan.textContent = item.month + '月';

    div.appendChild(weekdaySpan);
    div.appendChild(daySpan);
    div.appendChild(monthSpan);

    div.onclick = function() { selectDate(index); };
    container.appendChild(div);
  });

  // 默认选中第一个
  if (state.dates.length > 0 && !state.selectedDate) {
    selectDate(0);
  }
}

function selectDate(index) {
  state.currentDateIndex = index;
  state.selectedDate = state.dates[index].date;
  state.selectedSlot = null;

  // 更新选中状态
  document.querySelectorAll('.date-item').forEach(function(el, i) {
    if (i === index) el.classList.add('active');
    else el.classList.remove('active');
  });

  // 加载该日期的预约
  loadAppointments(state.selectedDate);
}

async function loadAppointments(date) {
  try {
    // 从 Supabase 加载预约数据
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('date', date)
      .eq('status', 'confirmed');

    if (error) throw error;

    state.appointments[date] = data || [];

    renderTimeSlots();
  } catch (err) {
    console.error('加载预约失败:', err);
    // 降级到本地模拟数据
    state.appointments[date] = [];
    renderTimeSlots();
  }
}

function renderTimeSlots() {
  const container = document.getElementById('timeSlots');
  container.innerHTML = '';

  const weekday = getWeekday(state.selectedDate);
  const slots = getTimeSlots(weekday);

  if (slots.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty-tip';
    p.textContent = '当天为休息日';
    container.appendChild(p);
    return;
  }

  const appointments = state.appointments[state.selectedDate] || [];

  slots.forEach(function(slot) {
    // 计算已用名额
    const usedQuota = appointments
      .filter(function(a) { return a.timeSlot === slot; })
      .reduce(function(sum, a) { return sum + a.quotaUsed; }, 0);

    const isBlocked = state.blockedSlots.indexOf(state.selectedDate + '-' + slot) !== -1;
    const isFull = usedQuota >= CONFIG.maxQuotaPerSlot;
    const isSelected = state.selectedSlot === slot;

    const div = document.createElement('div');
    div.className = 'slot-item';
    if (isSelected) div.classList.add('selected');
    if (isBlocked || isFull) div.classList.add('disabled');
    if (isFull) div.classList.add('full');

    const timeDiv = document.createElement('div');
    timeDiv.className = 'time';
    timeDiv.textContent = slot;

    const quotaDiv = document.createElement('div');
    quotaDiv.className = 'quota';
    if (isBlocked) {
      quotaDiv.textContent = '已封锁';
    } else {
      quotaDiv.textContent = usedQuota + '/' + CONFIG.maxQuotaPerSlot + ' 名额';
    }

    div.appendChild(timeDiv);
    div.appendChild(quotaDiv);

    if (!isBlocked && !isFull) {
      div.onclick = function() { selectSlot(slot); };
    }

    container.appendChild(div);
  });

  updateBookButton();
}

function selectSlot(slot) {
  state.selectedSlot = slot;
  renderTimeSlots();
}

function updateBookButton() {
  const btn = document.getElementById('btnBook');
  btn.disabled = !state.selectedSlot;
}

// ============ 预约功能 ============
function renderTreatmentList() {
  const container = document.getElementById('treatmentList');
  container.innerHTML = '';

  CONFIG.treatments.forEach(function(t) {
    const div = document.createElement('div');
    div.className = 'treatment-item';
    if (state.selectedTreatment === t.id) div.classList.add('selected');

    const radio = document.createElement('div');
    radio.className = 'radio';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'name';
    nameSpan.textContent = t.name;

    const quotaSpan = document.createElement('span');
    quotaSpan.className = 'quota';
    quotaSpan.textContent = '消耗' + t.quota + '名额';

    div.appendChild(radio);
    div.appendChild(nameSpan);
    div.appendChild(quotaSpan);

    div.onclick = function() { selectTreatment(t.id); };
    container.appendChild(div);
  });
}

function selectTreatment(id) {
  state.selectedTreatment = id;
  renderTreatmentList();
}

function goToBook() {
  if (!state.selectedSlot || !state.selectedDate) {
    showToast('请选择预约时间段');
    return;
  }

  document.getElementById('selectedDate').textContent = state.selectedDate;
  document.getElementById('selectedTime').textContent = state.selectedSlot;

  // 重置表单
  document.getElementById('patientName').value = '';
  document.getElementById('hideLastName').checked = false;
  state.selectedTreatment = null;
  renderTreatmentList();

  showPage('page-book');
}

async function submitAppointment() {
  const patientName = document.getElementById('patientName').value.trim();
  if (!patientName) {
    showToast('请输入您的称呼', 'error');
    return;
  }

  if (!state.selectedTreatment) {
    showToast('请选择治疗项目', 'error');
    return;
  }

  const treatment = CONFIG.treatments.find(function(t) { return t.id === state.selectedTreatment; });
  const hideLastName = document.getElementById('hideLastName').checked;

  try {
    // 保存到 Supabase
    const { data, error } = await supabase
      .from('appointments')
      .insert([
        {
          date: state.selectedDate,
          time_slot: state.selectedSlot,
          patient_name: patientName,
          hide_last_name: hideLastName,
          treatment: treatment.name,
          quota_used: treatment.quota,
          status: 'confirmed',
          created_at: new Date().toISOString()
        }
      ]);

    if (error) throw error;

    showToast('预约成功！', 'success');

    // 刷新显示
    loadAppointments(state.selectedDate);
    showPage('page-home');
  } catch (err) {
    console.error('预约失败:', err);
    // 降级到本地模拟
    if (!state.appointments[state.selectedDate]) {
      state.appointments[state.selectedDate] = [];
    }

    state.appointments[state.selectedDate].push({
      timeSlot: state.selectedSlot,
      patientName: patientName,
      hideLastName: hideLastName,
      treatment: treatment.name,
      quotaUsed: treatment.quota,
      status: 'confirmed'
    });

    showToast('预约成功（本地模式）！', 'success');
    loadAppointments(state.selectedDate);
    showPage('page-home');
  }
}

// ============ 我的预约 ============
function loadMyAppointments(status) {
  const container = document.getElementById('myAppointments');
  container.innerHTML = '';

  // 从本地数据中筛选
  let allAppointments = [];
  Object.keys(state.appointments).forEach(function(date) {
    (state.appointments[date] || []).forEach(function(a) {
      a.date = date;
      allAppointments.push(a);
    });
  });

  const filtered = allAppointments.filter(function(a) { return a.status === status; });

  if (filtered.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty-tip';
    p.textContent = '暂无预约';
    container.appendChild(p);
    return;
  }

  filtered.forEach(function(a) {
    const div = document.createElement('div');
    div.className = 'appointment-card';

    const dateDiv = document.createElement('div');
    dateDiv.className = 'date';
    dateDiv.textContent = a.date;

    const timeDiv = document.createElement('div');
    timeDiv.className = 'time';
    timeDiv.textContent = a.timeSlot;

    const treatmentDiv = document.createElement('div');
    treatmentDiv.className = 'treatment';
    treatmentDiv.textContent = a.treatment;

    let patientName = a.patientName;
    if (a.hideLastName && patientName) {
      patientName = patientName.charAt(0) + '*';
    }

    const patientDiv = document.createElement('div');
    patientDiv.className = 'patient';
    patientDiv.textContent = '预约人：' + patientName;

    const statusSpan = document.createElement('span');
    statusSpan.className = 'status ' + a.status;
    statusSpan.textContent = a.status === 'confirmed' ? '待就诊' : '已取消';

    div.appendChild(dateDiv);
    div.appendChild(timeDiv);
    div.appendChild(treatmentDiv);
    div.appendChild(patientDiv);
    div.appendChild(statusSpan);

    if (a.status === 'confirmed') {
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn-danger';
      cancelBtn.textContent = '取消预约';
      cancelBtn.onclick = (function(apt) {
        return function() { cancelAppointment(apt); };
      })(a);
      div.appendChild(cancelBtn);
    }

    container.appendChild(div);
  });
}

function cancelAppointment(appointment) {
  if (!confirm('确定要取消该预约吗？')) return;

  appointment.status = 'cancelled';
  showToast('已取消预约', 'success');
  loadMyAppointments('confirmed');
}

// ============ 医师端 ============
function checkDoctorStatus(user) {
  // TODO: 实现医师身份检查
  state.isDoctor = false;
}

function goToDoctor() {
  if (!state.currentUser) {
    showToast('请先登录', 'error');
    return;
  }

  if (!state.isDoctor) {
    showToast('您不是医师，无法进入管理端', 'error');
    return;
  }

  showPage('page-doctor');
}

function loadDoctorAppointments(date) {
  const container = document.getElementById('doctorAppointments');
  container.innerHTML = '';

  const appointments = state.appointments[date] || [];

  if (appointments.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty-tip';
    p.textContent = '当天暂无预约';
    container.appendChild(p);
    return;
  }

  appointments.forEach(function(a) {
    const div = document.createElement('div');
    div.className = 'appointment-card';

    const timeDiv = document.createElement('div');
    timeDiv.className = 'time';
    timeDiv.textContent = a.timeSlot;

    const treatmentDiv = document.createElement('div');
    treatmentDiv.className = 'treatment';
    treatmentDiv.textContent = a.treatment;

    const patientDiv = document.createElement('div');
    patientDiv.className = 'patient';
    patientDiv.textContent = '预约人：' + a.patientName + (a.hideLastName ? ' (已隐藏)' : '');

    const statusSpan = document.createElement('span');
    statusSpan.className = 'status ' + a.status;
    statusSpan.textContent = a.status === 'confirmed' ? '已确认' : '已取消';

    div.appendChild(timeDiv);
    div.appendChild(treatmentDiv);
    div.appendChild(patientDiv);
    div.appendChild(statusSpan);

    if (a.status === 'confirmed') {
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn-danger';
      cancelBtn.textContent = '取消';
      cancelBtn.onclick = (function(apt, d) {
        return function() { doctorCancelAppointment(apt, d); };
      })(a, date);
      div.appendChild(cancelBtn);
    }

    container.appendChild(div);
  });
}

function doctorCancelAppointment(appointment, date) {
  if (!confirm('确定要取消该预约吗？')) return;

  appointment.status = 'cancelled';
  showToast('已取消预约', 'success');
  loadDoctorAppointments(date);
}

function loadStats() {
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  let weekTotal = 0;
  let weekIncome = 0;
  let monthTotal = 0;
  let monthIncome = 0;

  // 统计治疗项目
  const stats = {};

  Object.keys(state.appointments).forEach(function(date) {
    (state.appointments[date] || []).forEach(function(a) {
      if (a.status === 'confirmed') {
        const apptDate = new Date(date);
        const isThisWeek = apptDate >= startOfWeek;
        const isThisMonth = apptDate >= startOfMonth;

        // 获取治疗价格
        const treatment = CONFIG.treatments.find(function(t) { return t.name === a.treatment; });
        const price = treatment ? treatment.price : 0;

        if (isThisWeek) {
          weekTotal++;
          weekIncome += price;
        }
        if (isThisMonth) {
          monthTotal++;
          monthIncome += price;
        }

        // 治疗项目统计
        const t = a.treatment;
        stats[t] = (stats[t] || 0) + 1;
      }
    });
  });

  // 更新本周统计
  document.getElementById('weekCount').textContent = weekTotal;
  document.getElementById('weekIncome').textContent = '¥' + weekIncome;

  // 更新本月统计
  document.getElementById('monthCount').textContent = monthTotal;
  document.getElementById('monthIncome').textContent = '¥' + monthIncome;

  // 渲染治疗项目统计
  const statsContainer = document.getElementById('treatmentStats');
  statsContainer.innerHTML = '';

  const keys = Object.keys(stats);
  if (keys.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty-tip';
    p.textContent = '暂无数据';
    statsContainer.appendChild(p);
  } else {
    keys.forEach(function(name) {
      const treatment = CONFIG.treatments.find(function(t) { return t.name === name; });
      const price = treatment ? treatment.price : 0;

      const div = document.createElement('div');
      div.className = 'setting-item';

      const labelSpan = document.createElement('span');
      labelSpan.textContent = name;

      const countSpan = document.createElement('span');
      countSpan.textContent = stats[name] + '人次';

      div.appendChild(labelSpan);
      div.appendChild(countSpan);
      statsContainer.appendChild(div);
    });
  }
}

function toggleWeekend(enabled) {
  state.weekendEnabled = enabled;
  showToast(enabled ? '已开启周末预约' : '已关闭周末预约', 'success');
}

function bindWechat() {
  if (!state.currentUser) {
    showToast('请先登录', 'error');
    return;
  }

  state.isDoctor = true;
  document.getElementById('bindStatus').textContent = '已绑定';
  showToast('绑定成功', 'success');
}

// ============ 模拟登录 ============
function wechatLogin() {
  // 模拟登录成功
  state.currentUser = { id: 'mock-user-123' };
  showToast('登录成功', 'success');
  showPage('page-home');
}

// ============ 初始化 ============
function init() {
  // 初始化 Supabase
  initSupabase();

  // 加载日期
  loadDates();

  // 绑定事件
  bindEvents();

  // 隐藏加载
  document.getElementById('loading').classList.add('hidden');
}

function bindEvents() {
  // 首页按钮
  document.getElementById('btnBook').onclick = goToBook;
  document.getElementById('btnMyAppointments').onclick = function() {
    loadMyAppointments('confirmed');
    showPage('page-my');
  };

  // 医师入口
  document.getElementById('btnDoctorEntry').onclick = function() {
    // 模拟医师登录（实际项目中需要真实登录）
    state.currentUser = { id: 'doctor-001' };
    state.isDoctor = true;
    showPage('page-doctor');
  };

  // 返回
  document.getElementById('backHome').onclick = function() { showPage('page-home'); };
  document.getElementById('backFromMy').onclick = function() { showPage('page-home'); };

  // 提交预约
  document.getElementById('btnSubmit').onclick = submitAppointment;

  // Tab切换
  document.querySelectorAll('.tab').forEach(function(tab) {
    tab.onclick = function() {
      document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');
      loadMyAppointments(tab.dataset.status);
    };
  });

  // 医师端
  document.getElementById('btnExitDoctor').onclick = function() { showPage('page-home'); };

  document.getElementById('menuAppointments').onclick = function() {
    state.selectedDate = formatDate(new Date());
    document.getElementById('currentDate').textContent = state.selectedDate;
    loadDoctorAppointments(state.selectedDate);
    showPage('page-doctor-appointments');
  };

  document.getElementById('menuSettings').onclick = function() { showPage('page-doctor-settings'); };
  document.getElementById('menuStats').onclick = function() {
    loadStats();
    showPage('page-doctor-stats');
  };

  // 医师端返回
  document.getElementById('backToDoctor').onclick = function() { showPage('page-doctor'); };
  document.getElementById('backToDoctor2').onclick = function() { showPage('page-doctor'); };
  document.getElementById('backToDoctor3').onclick = function() { showPage('page-doctor'); };

  // 医师端日期切换
  var doctorCurrentDate = new Date();
  document.getElementById('prevDay').onclick = function() {
    doctorCurrentDate.setDate(doctorCurrentDate.getDate() - 1);
    var dateStr = formatDate(doctorCurrentDate);
    document.getElementById('currentDate').textContent = dateStr;
    loadDoctorAppointments(dateStr);
  };
  document.getElementById('nextDay').onclick = function() {
    doctorCurrentDate.setDate(doctorCurrentDate.getDate() + 1);
    var dateStr = formatDate(doctorCurrentDate);
    document.getElementById('currentDate').textContent = dateStr;
    loadDoctorAppointments(dateStr);
  };

  // 设置
  document.getElementById('weekendEnabled').onchange = function(e) { toggleWeekend(e.target.checked); };
  document.getElementById('btnBindWechat').onclick = bindWechat;

  // 登录
  document.getElementById('wechatLogin').onclick = wechatLogin;
  document.getElementById('btnBackToUser').onclick = function() { showPage('page-home'); };

  // 周导航
  document.getElementById('prevWeek').onclick = function() {
    if (state.currentDateIndex > 0) {
      selectDate(state.currentDateIndex - 1);
    }
  };
  document.getElementById('nextWeek').onclick = function() {
    if (state.currentDateIndex < state.dates.length - 1) {
      selectDate(state.currentDateIndex + 1);
    }
  };
}

// 启动
document.addEventListener('DOMContentLoaded', init);
