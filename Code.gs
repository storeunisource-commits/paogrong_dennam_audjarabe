// ============================================================
// SWJ Truck Maintenance Tracking System — Code.gs v2.0
// ตรวจสอบการเป่ากรอง เดนน้ำ อัดจารบี
// บริษัท ส.ศิวโรจน์ ขนส่ง จำกัด
// ============================================================

const SPREADSHEET_ID   = '1ZomKXmIss9qZK7aXn2QoEJaZsoLssp-2UPT77Wvw4Ok';
const DRIVE_ROOT_FOLDER     = 'SWJ_PM';
const DRIVE_PARENT_FOLDER_ID = '1C5doJzQSxyGHfvQPFySQXYUtYHnTSNu-';
const SESSION_EXPIRY_HOURS  = 8;
// URL โลโก้ที่ upload ขึ้น Drive แล้ว share public (แก้ได้)
const LOGO_PUBLIC_URL = '';
const COMPANY_NAME    = 'บริษัท ส.ศิวโรจน์ ขนส่ง จำกัด';
const COMPANY_ADDRESS = '205 หมู่ 7 ตำบลพุแค อำเภอเฉลิมพระเกียรติ จ.สระบุรี 18240';
const COMPANY_TEL     = '';

// ============================================================
// ROLE HIERARCHY
// ============================================================
const ROLE_ORDER = { viewer:0, operation:1, manager:2, admin:3 };

// ============================================================
// doGet — Entry point
// ============================================================
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'SWJ API v2.0 OK' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// doPost — รับ request จาก frontend
// ============================================================
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const fn   = body.fn;
    const args = body.args || [];

    const allowed = {
      // Auth
      login, logout, validateSession, getMyProfile,
      // Dashboard
      getDashboardData, getCompareData, getDashboardCardDetail,
      // Maintenance
      getMaintenanceLogs, createMaintenanceLog, uploadPhotosToLog, updateMaintenanceStatus,
      getMaintenanceHistory, notifyLine,
      // Violation
      getViolationLogs, createViolationLog, updateViolationFollowup,
      getViolationCountByType,
      // Approvals
      getPendingApprovals, approveViolationDoc, acknowledgeDocument,
      generateWarningLetterHTML, getWarningLetterPdf,
      // Line Notifications
      createLineNotification, getLineNotifications,
      // Followup / Tracking
      getFollowupTrucks,
      // Users (admin only)
      getUsers, createUser, updateUser, deleteUser,
      // Employees (admin / manager / operation)
      getEmployees, createEmployee, updateEmployee, deleteEmployee,
      // Trucks (admin / manager / operation)
      getTrucks, createTruck, updateTruck, deleteTruck,
      // Signature (manager+)
      uploadSignature,
      // Notifications
      getNotifications, dismissNotification, deleteNotification,
      // Comments
      getComments, addComment,
      // Status History
      getStatusHistory,
      // Auto Mode
      generateMonthlyPMTasks,
      // Activity
      getActivityLogs,
      // Good Employees
      getGoodEmployees,
      // Schema maintenance
      ensureAllSheets
    };

    if (!allowed[fn]) {
      return _jsonOut({ success: false, error: 'ไม่พบฟังก์ชัน: ' + fn });
    }

    const result = allowed[fn](...args);
    return _jsonOut(result);

  } catch (err) {
    return _jsonOut({ success: false, error: err.message });
  }
}

function _jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// INITIALIZATION — สร้าง sheet ทั้งหมด
// ============================================================
function initializeSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  _initSheet(ss, 'Users', [
    'id','username','name','role','password_hash','signature_url','created_at'
  ]);
  _initSheet(ss, 'Employees', [
    'employee_id','nickname','full_name','status'
  ]);
  _initSheet(ss, 'Trucks', [
    'truck_number','employee_id','status'
  ]);
  _initSheet(ss, 'MaintenanceLogs', [
    'id','type','truck_number','employee_id','status',
    'week_label','notes','photo_urls',
    'is_late','is_auto','log_date',
    'created_by','created_at'
  ]);
  _initSheet(ss, 'ViolationLogs', [
    'id','truck_number','employee_id','type','week_label','reason',
    'followup_done','punishment_level','stop_order','doc_status',
    'manager_approved_at','manager_username','driver_ack_at',
    'ack_photo_urls','pdf_pending_url','pdf_approved_url','pdf_ack_url',
    'created_by','created_at'
  ]);
  _initSheet(ss, 'ActivityLogs', [
    'id','action','username','detail','timestamp'
  ]);
  _initSheet(ss, 'Notifications', [
    'id','type','title','body','page',
    'ref_type','ref_id','target_roles','dismissed_by','created_at'
  ]);
  _initSheet(ss, 'Comments', [
    'id','ref_type','ref_id','username','display_name','message','created_at'
  ]);
  _initSheet(ss, 'StatusHistory', [
    'id','ref_type','ref_id','status_from','status_to','changed_by','changed_at','notes'
  ]);

  _seedUsers(ss);
  _seedEmployees(ss);
  _seedTrucks(ss);

  return { success: true, message: 'เริ่มต้นระบบ v2.0 เรียบร้อยแล้ว' };
}

function _initSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  } else {
    // เพิ่ม column ใหม่ถ้ายังไม่มี (backward compat)
    const existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    headers.forEach(h => {
      if (!existingHeaders.includes(h)) {
        sheet.getRange(1, sheet.getLastColumn() + 1).setValue(h);
      }
    });
  }
  return sheet;
}

function _seedUsers(ss) {
  const sheet = ss.getSheetByName('Users');
  const data  = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    const now = new Date().toISOString();
    sheet.appendRow([generateId(),'admin','ผู้ดูแลระบบ','admin',hashPassword('admin1234'),'',now]);
    sheet.appendRow([generateId(),'manager1','ผู้จัดการ','manager',hashPassword('mgr1234'),'',now]);
  }
}

function _seedEmployees(ss) {
  const sheet = ss.getSheetByName('Employees');
  if (sheet.getDataRange().getValues().length > 1) return;
  const employees = [
    ['SWJ-002','จิตร','สมจิตร มณีทำไพรี','active'],
    ['SWJ-007','เนียว','วิชัย ไหอีค้า','active'],
    ['SWJ-013','แพร','บุญโกร สังกาล','active'],
    ['SWJ-014','ดำ','ภาณุวัฒน์ พึ่งสวัสดิ์','active'],
    ['SWJ-018','เปา','รชานนท์ รุจจำรัส','active'],
    ['SWJ-024','อ้วน','สมศักดิ์ วงศ์พระจันทร์','active'],
    ['SWJ-029','ตรี','ชาตรี เป้ากองทอง','active'],
    ['SWJ-048','ขิง','วุฒิพงษ์ รอดลันดา','active'],
    ['SWJ-057','แต้ม','เกียรติศักดิ์ เทือกดา','active'],
    ['SWJ-060','จ่อย','สมใจ ชินศรี','active'],
    ['SWJ-066','พงษ์','ธนัทพัชร์ ศรีเมข','active'],
    ['SWJ-090','บูม','ภาคภูมิ รอบคอบ','active'],
    ['SWJ-097','น้าวัฒน์','นิวัฒน์ นำนไพรีศรี','active'],
    ['SWJ-100','เจน','กรีทล ศรีเที่ยง','active'],
    ['SWJ-114','นิค','วานิช ร้อยระย้า','active'],
    ['SWJ-116','วุฒิ','ณรางวุฒิ อิทธิอนไขดิ','active'],
    ['SWJ-128','เอ็ม','ประเพ็ญ มากมูล','active'],
    ['SWJ-149','บาส','รัตนเดช วรรณกุล','active'],
    ['SWJ-150','หนุ่ย','อาบนท์ พิมิงเนดร','active'],
    ['SWJ-151','เล็ก','เจริญพงษ์ อิทธิอนไขดิ','active'],
    ['US-003','เหว่า','สุชี พึ่งเนตร','active'],
    ['US-060','กอล์ฟ','สัมพันธุ์ พุกแพง','active'],
  ];
  employees.forEach(row => sheet.appendRow(row));
}

function _seedTrucks(ss) {
  const sheet = ss.getSheetByName('Trucks');
  if (sheet.getDataRange().getValues().length > 1) return;
  const trucks = [
    ['1','','inactive'],['2','SWJ-128','active'],['3','','inactive'],
    ['6','','inactive'],['7','','inactive'],
    ['02','SWJ-149','active'],['010','SWJ-151','active'],
    ['U-01','SWJ-007','active'],['U-02','SWJ-150','active'],
    ['U-03','SWJ-116','active'],['U-04','SWJ-090','active'],
    ['U-05','SWJ-002','active'],['U-06','SWJ-100','active'],
    ['U-07','US-060','active'],['U-08','SWJ-060','active'],
    ['U-09','SWJ-097','active'],['U-010','SWJ-029','active'],
    ['U-12','SWJ-014','active'],['U-13','SWJ-013','active'],
    ['U-14','SWJ-024','active'],['U-15','SWJ-057','active'],
    ['U-16','SWJ-048','active'],['U-17','SWJ-014','active'],
    ['U-18','US-003','active'],['U-19','SWJ-066','active'],
    ['U-20','SWJ-114','active'],['U-21','SWJ-018','active'],
    ['M1','','active'],
  ];
  trucks.forEach(row => sheet.appendRow(row));
}

// ============================================================
// AUTHENTICATION
// ============================================================
function login(username, password) {
  try {
    if (!username || !password) return { success:false, error:'กรุณาใส่ชื่อผู้ใช้และรหัสผ่าน' };
    const users = getSheetData('Users');
    const user  = users.find(u => u.username === username);
    if (!user || user.password_hash !== hashPassword(password)) {
      return { success:false, error:'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
    }
    const token   = generateId();
    const expiry  = new Date().getTime() + SESSION_EXPIRY_HOURS * 3600000;
    PropertiesService.getScriptProperties().setProperty(
      'session_' + token,
      JSON.stringify({ username:user.username, name:user.name, role:user.role, expiry })
    );
    logActivity('login', username, 'เข้าสู่ระบบ');
    return { success:true, token, user:{ username:user.username, name:user.name, role:user.role } };
  } catch(e) { return { success:false, error:e.message }; }
}

function logout(token) {
  try {
    const session = _getSession(token);
    if (session) {
      logActivity('logout', session.username, 'ออกจากระบบ');
      PropertiesService.getScriptProperties().deleteProperty('session_' + token);
    }
    return { success:true };
  } catch(e) { return { success:false, error:e.message }; }
}

function validateSession(token) {
  try {
    const session = _getSession(token);
    if (!session) return { success:false, error:'Session หมดอายุ' };
    return { success:true, user:{ username:session.username, name:session.name, role:session.role } };
  } catch(e) { return { success:false, error:e.message }; }
}

function getMyProfile(token) {
  try {
    const session = _requireAuth(token, 'viewer');
    const users = getSheetData('Users');
    const user  = users.find(u => u.username === session.username);
    if (!user) return { success:false, error:'ไม่พบผู้ใช้' };
    const { password_hash, ...safe } = user;
    if (safe.signature_url) {
      safe.signature_data_url = _driveImageDataUrl(safe.signature_url);
    }
    return { success:true, data:_toCC(safe) };
  } catch(e) { return { success:false, error:e.message }; }
}

function _getSession(token) {
  if (!token) return null;
  const raw = PropertiesService.getScriptProperties().getProperty('session_' + token);
  if (!raw) return null;
  const session = JSON.parse(raw);
  if (new Date().getTime() > session.expiry) {
    PropertiesService.getScriptProperties().deleteProperty('session_' + token);
    return null;
  }
  return session;
}

function _requireAuth(token, minRole) {
  const session = _getSession(token);
  if (!session) throw new Error('กรุณาเข้าสู่ระบบก่อน');
  if (minRole && ROLE_ORDER[session.role] < ROLE_ORDER[minRole]) {
    throw new Error('ไม่มีสิทธิ์เข้าถึงฟังก์ชันนี้');
  }
  return session;
}

// ============================================================
// WEEK LABEL UTILITIES
// ============================================================
// รองรับ 8 รอบ/เดือน สำหรับ เป่ากรอง + เดนน้ำ
// อัดจารบี ใช้ "รอบ1" / "รอบ2"
const WEEK_LABELS_FILTER = ['Week1/1','Week1/2','Week2/1','Week2/2','Week3/1','Week3/2','Week4/1','Week4/2'];
const WEEK_LABELS_GREASE = ['รอบ1','รอบ2'];

function _getWeekLabels(type) {
  return (type === 'อัดจารบี') ? WEEK_LABELS_GREASE : WEEK_LABELS_FILTER;
}

// ============================================================
// MAINTENANCE LOGS
// ============================================================
function getMaintenanceLogs(token, filters) {
  try {
    _requireAuth(token, 'viewer');
    let data = getSheetData('MaintenanceLogs');

    if (filters) {
      filters = _fromCC(filters);
      if (filters.type)         data = data.filter(r => r.type === filters.type);
      if (filters.status)       data = data.filter(r => r.status === filters.status);
      if (filters.truck_number) data = data.filter(r => r.truck_number === filters.truck_number);
      if (filters.employee_id)  data = data.filter(r => r.employee_id === filters.employee_id);
      if (filters.week_label)   data = data.filter(r => r.week_label === filters.week_label);
      if (filters.month || filters.year) {
        data = data.filter(r => _sameMonth(r, filters.month, filters.year));
      }
    }

    const empMap = _buildEmpMap();
    data = data.map(r => ({
      ...r,
      employee: empMap[r.employee_id] || null,
      photo_urls: _parsePhotoUrls(r.photo_urls)
    }));

    return { success:true, data:_toCC(data) };
  } catch(e) { return { success:false, error:e.message }; }
}

function getMaintenanceHistory(token, truckNumber, type, month, year) {
  try {
    _requireAuth(token, 'operation');
    let data = getSheetData('MaintenanceLogs').filter(r => {
      if (r.truck_number !== truckNumber) return false;
      if (type && r.type !== type) return false;
      if (month || year) {
        if (!_sameMonth(r, month, year)) return false;
      }
      return true;
    });
    data.sort((a,b) => _dateValue(b) - _dateValue(a));
    data = data.map(r => ({ ...r, photo_urls:_parsePhotoUrls(r.photo_urls) }));
    return { success:true, data:_toCC(data) };
  } catch(e) { return { success:false, error:e.message }; }
}

function createMaintenanceLog(token, data) {
  try {
    const session = _requireAuth(token, 'operation');
    data = _fromCC(data);

    if (!data.type || !data.truck_number || !data.status) {
      return { success:false, error:'กรุณาระบุข้อมูลให้ครบถ้วน' };
    }

    const validTypes = ['เป่ากรอง','เดรนน้ำ','อัดจารบี'];
    if (!validTypes.includes(data.type)) return { success:false, error:'ประเภทงานไม่ถูกต้อง' };

    const validStatuses = ['โทรแจ้งแล้วรับทราบ','ยังไม่ได้ทำ','ทำแล้ว','ทำหลังเตือน'];
    if (!validStatuses.includes(data.status)) return { success:false, error:'สถานะไม่ถูกต้อง' };

    const id  = generateId();
    const now = new Date().toISOString();
    const weekLabel = data.week_label || data.round || '';

    appendRow('MaintenanceLogs', [
      id, data.type, data.truck_number, data.employee_id || '',
      data.status, weekLabel,
      data.notes || '',
      JSON.stringify([]),
      data.is_late  ? 'true' : 'false',
      data.is_auto  ? 'true' : 'false',
      data.log_date || '',
      session.username, now
    ]);

    // สร้าง status history
    _addStatusHistory('maintenance', id, '', data.status, session.username, data.notes || '');

    // แจ้งเตือนถ้าสถานะเป็น ยังไม่ได้ทำ
    if (data.status === 'ยังไม่ได้ทำ') {
      _createNotification(
        'pm_overdue',
        `${data.type} ยังไม่ทำ`,
        `รถ ${data.truck_number} ${weekLabel} ยังไม่ได้ทำ`,
        'pm-form', 'maintenance', id, 'manager,admin'
      );
    }

    logActivity('create_log', session.username, `บันทึก ${data.type} รถ ${data.truck_number} ${weekLabel}`);
    return { success:true, id };
  } catch(e) { return { success:false, error:e.message }; }
}

function updateMaintenanceStatus(token, id, newStatus, notes) {
  try {
    const session = _requireAuth(token, 'operation');

    const logs = getSheetData('MaintenanceLogs');
    const log  = logs.find(l => l.id === id);
    if (!log) return { success:false, error:'ไม่พบบันทึก' };

    const oldStatus = log.status;
    updateRow('MaintenanceLogs', id, { status: newStatus });

    _addStatusHistory('maintenance', id, oldStatus, newStatus, session.username, notes || '');

    // ถ้า ทำแล้ว → auto-clear notification ที่เกี่ยวข้อง
    if (newStatus === 'ทำแล้ว' || newStatus === 'ทำหลังเตือน') {
      _clearNotificationsByRef('maintenance', id);
    }

    logActivity('update_status', session.username, `เปลี่ยนสถานะ log ${id}: ${oldStatus} → ${newStatus}`);
    return { success:true };
  } catch(e) { return { success:false, error:e.message }; }
}

function uploadPhotosToLog(token, logId, filesData) {
  try {
    const session = _requireAuth(token, 'operation');
    if (!logId || !filesData || !Array.isArray(filesData)) {
      return { success:false, error:'ข้อมูลไม่ถูกต้อง' };
    }

    const logs = getSheetData('MaintenanceLogs');
    const log  = logs.find(l => l.id === logId);
    if (!log) return { success:false, error:'ไม่พบบันทึก' };

    const now    = new Date();
    const yyyy   = now.getFullYear().toString();
    const mm     = String(now.getMonth()+1).padStart(2,'0');
    const dd     = String(now.getDate()).padStart(2,'0');

    // SWJ_PM/{numbered_type}/{YYYY}/{MM}/{YYYY-MM-DD}/{truck#}/
    const folderPath = `${DRIVE_ROOT_FOLDER}/${_typeFolder(log.type)}/${yyyy}/${mm}/${yyyy}-${mm}-${dd}/${log.truck_number}`;
    const datestamp  = `${yyyy}${mm}${dd}`;

    const newUrls = [];
    filesData.forEach((file, idx) => {
      try {
        const ext      = (file.name || '').split('.').pop() || 'jpg';
        const filename = `${log.type}_${log.truck_number}_${datestamp}_${idx+1}.${ext}`;
        const blob     = Utilities.newBlob(
          Utilities.base64Decode(file.base64),
          file.mimeType || 'image/jpeg',
          filename
        );
        const url = saveFileToDrive(folderPath, filename, blob);
        if (url && url.startsWith('http')) newUrls.push(url);
      } catch(fileErr) {
        Logger.log('uploadPhoto error: ' + fileErr.message);
      }
    });

    const allUrls = newUrls;
    updateRow('MaintenanceLogs', logId, { photo_urls: JSON.stringify(allUrls) });

    logActivity('upload_photo', session.username, `อัปโหลด ${newUrls.length} รูป log ${logId}`);
    return { success:true, urls:newUrls };
  } catch(e) { return { success:false, error:e.message }; }
}

function notifyLine(token, logId) {
  try {
    const session = _requireAuth(token, 'operation');
    const logs = getSheetData('MaintenanceLogs');
    const log  = logs.find(l => l.id === logId);
    if (!log) return { success:false, error:'ไม่พบบันทึก' };

    updateRow('MaintenanceLogs', logId, { notified_line: 'true' });

    _createNotification(
      'pm_notified',
      'แจ้งลงกลุ่มไลน์แล้ว',
      `รถ ${log.truck_number} ${log.type} ${log.week_label || ''} — แจ้งลงกลุ่มไลน์แล้ว`,
      'history', 'maintenance', logId, 'manager,admin'
    );

    logActivity('notify_line', session.username, `แจ้งลงกลุ่มไลน์ ${log.type} รถ ${log.truck_number}`);
    return { success:true };
  } catch(e) { return { success:false, error:e.message }; }
}

// ============================================================
// VIOLATION LOGS
// ============================================================
function getViolationLogs(token, filters) {
  try {
    _requireAuth(token, 'viewer');
    let data = getSheetData('ViolationLogs');

    if (filters) {
      filters = _fromCC(filters);
      if (filters.type)         data = data.filter(r => r.type === filters.type);
      if (filters.doc_status)   data = data.filter(r => r.doc_status === filters.doc_status);
      if (filters.truck_number) data = data.filter(r => r.truck_number === filters.truck_number);
      if (filters.employee_id)  data = data.filter(r => r.employee_id === filters.employee_id);
      if (filters.month || filters.year) {
        data = data.filter(r => _sameMonth(r, filters.month, filters.year));
      }
    }

    const empMap = _buildEmpMap();
    data = data.map(r => ({
      ...r,
      employee:      empMap[r.employee_id] || null,
      stop_order:    r.stop_order    === 'true',
      followup_done: r.followup_done === 'true',
      ack_photo_urls: _parsePhotoUrls(r.ack_photo_urls)
    }));

    return { success:true, data:_toCC(data) };
  } catch(e) { return { success:false, error:e.message }; }
}

// นับจำนวนการละเลยแยกตามประเภทสำหรับพนักงานคนนั้น
function getViolationCountByType(token, employeeId, type) {
  try {
    _requireAuth(token, 'operation');
    const violations = getSheetData('ViolationLogs').filter(r => {
      if (r.employee_id !== employeeId) return false;
      if (type && r.type !== type) return false;
      return true;
    });
    const counts = {};
    violations.forEach(v => {
      counts[v.type] = (counts[v.type] || 0) + 1;
    });
    return { success:true, data:counts };
  } catch(e) { return { success:false, error:e.message }; }
}

function createViolationLog(token, data) {
  try {
    const session = _requireAuth(token, 'operation');
    data = _fromCC(data);

    if (!data.truck_number || !data.type || !data.reason) {
      return { success:false, error:'กรุณาระบุข้อมูลให้ครบถ้วน' };
    }

    const id  = generateId();
    const now = new Date().toISOString();
    const previousCount = getSheetData('ViolationLogs').filter(v =>
      v.employee_id === (data.employee_id || '') &&
      v.type === data.type
    ).length;
    const actualLevel = String(previousCount + 1);

    const resetDate = new Date(now);
    resetDate.setDate(resetDate.getDate() + 60);

    appendRow('ViolationLogs', [
      id, data.truck_number, data.employee_id || '',
      data.type, data.week_label || data.round || '',
      data.reason,
      data.followup_done ? 'true' : 'false',
      actualLevel,
      data.stop_order ? 'true' : 'false',
      'pending', '', '', '',
      JSON.stringify([]),       // ack_photo_urls
      '', '', '',               // pdf urls
      session.username, now,
      data.type,                // violation_topic
      resetDate.toISOString()   // reset_date
    ]);

    _addStatusHistory('violation', id, '', 'pending', session.username, data.reason);

    // บันทึก Draft PDF (1.Draft folder)
    try {
      const draftHtml = generateWarningLetterHTML(token, id);
      if (draftHtml.success) {
        const draftVio = {
          id, truck_number: data.truck_number, employee_id: data.employee_id || '',
          type: data.type, week_label: data.week_label || data.round || '',
          reason: data.reason, punishment_level: actualLevel,
          stop_order: data.stop_order ? 'true' : 'false',
          doc_status: 'pending', manager_approved_at: '', driver_ack_at: '', manager_username: ''
        };
        const draftUrl = _saveDocumentToDrive(draftHtml.html, id, draftVio, 'pending');
        if (draftUrl) updateRow('ViolationLogs', id, { pdf_pending_url: draftUrl });
      }
    } catch(draftErr) { Logger.log('draft PDF error: ' + draftErr.message); }

    // แจ้งเตือน manager ให้ approve
    _createNotification(
      'pending_approval',
      `รออนุมัติ — รถ ${data.truck_number}`,
      `ใบเตือน ${data.type} รถ ${data.truck_number} รอการอนุมัติ`,
      'approve', 'violation', id, 'manager,admin'
    );

    logActivity('create_violation', session.username, `ใบเตือน ${data.type} รถ ${data.truck_number}`);
    return { success:true, id };
  } catch(e) { return { success:false, error:e.message }; }
}

function updateViolationFollowup(token, id, followup_done, punishment_level, stop_order, notes) {
  try {
    const session = _requireAuth(token, 'operation');
    const violations = getSheetData('ViolationLogs');
    const violation  = violations.find(v => v.id === id);
    if (!violation) return { success:false, error:'ไม่พบข้อมูล' };

    updateRow('ViolationLogs', id, {
      followup_done:    followup_done    ? 'true' : 'false',
      punishment_level: punishment_level || violation.punishment_level,
      stop_order:       stop_order       ? 'true' : 'false'
    });

    logActivity('update_followup', session.username, `อัปเดต followup ${id}`);
    return { success:true };
  } catch(e) { return { success:false, error:e.message }; }
}

// ============================================================
// DOCUMENT APPROVAL
// ============================================================
function getPendingApprovals(token) {
  try {
    const session = _requireAuth(token, 'operation');
    let data = getSheetData('ViolationLogs');

    // Operation เห็นเฉพาะของตัวเอง (เฉพาะ รอยืนยัน + เสร็จสิ้น)
    // Manager+ เห็นทั้งหมด
    if (ROLE_ORDER[session.role] < ROLE_ORDER['manager']) {
      data = data.filter(r =>
        r.doc_status === 'approved'
      );
    } else {
      data = data.filter(r => r.doc_status !== 'acknowledged');
    }

    const empMap = _buildEmpMap();
    data = data.map(r => ({
      ...r,
      employee:       empMap[r.employee_id] || null,
      stop_order:     r.stop_order    === 'true',
      followup_done:  r.followup_done === 'true',
      ack_photo_urls: _parsePhotoUrls(r.ack_photo_urls)
    }));
    data.sort((a,b) => new Date(b.created_at||0) - new Date(a.created_at||0));

    return { success:true, data:_toCC(data) };
  } catch(e) { return { success:false, error:e.message }; }
}

function approveViolationDoc(token, violationId) {
  try {
    const session = _requireAuth(token, 'manager');

    const violations = getSheetData('ViolationLogs');
    const violation  = violations.find(v => v.id === violationId);
    if (!violation) return { success:false, error:'ไม่พบใบเตือน' };
    if (violation.doc_status !== 'pending') {
      return { success:false, error:'ใบเตือนนี้ไม่ได้อยู่ในสถานะรอการอนุมัติ' };
    }

    const now = new Date().toISOString();
    updateRow('ViolationLogs', violationId, {
      doc_status:          'approved',
      manager_approved_at: now,
      manager_username:    session.username
    });

    // บันทึก PDF หลัง update ข้อมูลอนุมัติแล้ว เพื่อให้วันที่และลายเซ็นขึ้นจริง
    const htmlResult = generateWarningLetterHTML(token, violationId);
    let pdfApprovedUrl = '';
    if (htmlResult.success) {
      pdfApprovedUrl = _saveDocumentToDrive(htmlResult.html, violationId, violation, 'approved');
    }

    if (pdfApprovedUrl) updateRow('ViolationLogs', violationId, { pdf_approved_url: pdfApprovedUrl });

    _addStatusHistory('violation', violationId, 'pending', 'approved', session.username, '');

    // ลบ notification pending_approval + สร้าง notification รอยืนยัน
    _clearNotificationsByRef('violation', violationId);
    _createNotification(
      'pending_ack',
      `รอพนักงานรับทราบ — รถ ${violation.truck_number}`,
      `ใบเตือน ${violation.type} รถ ${violation.truck_number} รออยืนยัน`,
      'approve', 'violation', violationId, 'operation,manager,admin'
    );

    logActivity('approve_doc', session.username, `อนุมัติใบเตือน ${violationId} รถ ${violation.truck_number}`);
    return { success:true, pdfUrl:pdfApprovedUrl };
  } catch(e) { return { success:false, error:e.message }; }
}

function acknowledgeDocument(token, violationId, filesData) {
  try {
    const session = _requireAuth(token, 'operation');

    const violations = getSheetData('ViolationLogs');
    const violation  = violations.find(v => v.id === violationId);
    if (!violation) return { success:false, error:'ไม่พบใบเตือน' };
    if (violation.doc_status !== 'approved') {
      return { success:false, error:'ใบเตือนยังไม่ได้รับการอนุมัติ' };
    }

    // อัปโหลดรูปหลักฐาน (รองรับหลายรูป)
    const ackPhotoUrls = [];
    if (filesData && Array.isArray(filesData) && filesData.length > 0) {
      const now      = new Date();
      const yyyy     = now.getFullYear().toString();
      const mm       = String(now.getMonth()+1).padStart(2,'0');
      const dd       = String(now.getDate()).padStart(2,'0');
      const topic = _typeFolder(violation.type || '');
      const folderPath = `${DRIVE_ROOT_FOLDER}/หนังสือเตือน/${topic}/${yyyy}/${mm}/${yyyy}-${mm}-${dd}/${violation.truck_number}/3.รับทราบ`;

      filesData.forEach((file, idx) => {
        try {
          const ext      = (file.name || '').split('.').pop() || 'jpg';
          const filename = `ack_${violationId}_${idx+1}.${ext}`;
          const blob     = Utilities.newBlob(
            Utilities.base64Decode(file.base64),
            file.mimeType || 'image/jpeg',
            filename
          );
          const url = saveFileToDrive(folderPath, filename, blob);
          ackPhotoUrls.push(url);
        } catch(fe) { Logger.log('ack photo error: ' + fe.message); }
      });
    }

    const ackAt = new Date().toISOString();
    updateRow('ViolationLogs', violationId, {
      doc_status:     'acknowledged',
      driver_ack_at:  ackAt,
      ack_photo_urls: JSON.stringify(ackPhotoUrls)
    });

    // บันทึก PDF หลัง update ข้อมูลรับทราบแล้ว เพื่อให้วันที่/หลักฐานขึ้นจริง
    const htmlResult = generateWarningLetterHTML(token, violationId);
    let pdfAckUrl = '';
    if (htmlResult.success) {
      pdfAckUrl = _saveDocumentToDrive(htmlResult.html, violationId, violation, 'acknowledged');
    }

    if (pdfAckUrl) updateRow('ViolationLogs', violationId, { pdf_ack_url: pdfAckUrl });

    _addStatusHistory('violation', violationId, 'approved', 'acknowledged', session.username, '');
    _clearNotificationsByRef('violation', violationId);

    logActivity('acknowledge_doc', session.username, `รับทราบใบเตือน ${violationId}`);
    return { success:true };
  } catch(e) { return { success:false, error:e.message }; }
}

function getWarningLetterPdf(token, violationId) {
  try {
    _requireAuth(token, 'viewer');
    const violations = getSheetData('ViolationLogs');
    const violation  = violations.find(v => v.id === violationId);
    if (!violation) return { success:false, error:'ไม่พบใบเตือน' };

    let url = '';
    if (violation.doc_status === 'acknowledged') url = violation.pdf_ack_url || '';
    else if (violation.doc_status === 'approved') url = violation.pdf_approved_url || '';
    else url = violation.pdf_pending_url || '';
    if (url) return { success:true, url };

    const htmlResult = generateWarningLetterHTML(token, violationId);
    if (!htmlResult.success) return htmlResult;
    const stage = violation.doc_status === 'acknowledged'
      ? 'acknowledged'
      : violation.doc_status === 'approved'
      ? 'approved'
      : 'pending';
    url = _saveDocumentToDrive(htmlResult.html, violationId, violation, stage);
    if (url) {
      const col = stage === 'acknowledged' ? 'pdf_ack_url' : stage === 'approved' ? 'pdf_approved_url' : 'pdf_pending_url';
      updateRow('ViolationLogs', violationId, { [col]: url });
    }
    return { success:true, url };
  } catch(e) { return { success:false, error:e.message }; }
}

// ============================================================
// WARNING LETTER — HTML สำหรับ A4 ราชการไทย
// ============================================================
function generateWarningLetterHTML(token, violationId) {
  try {
    _requireAuth(token, 'viewer');

    const violations = getSheetData('ViolationLogs');
    const violation  = violations.find(v => v.id === violationId);
    if (!violation) return { success:false, error:'ไม่พบใบเตือน' };

    const empMap  = _buildEmpMap();
    const truck = getSheetData('Trucks').find(t => String(t.truck_number) === String(violation.truck_number)) || {};
    const employeeId = violation.employee_id || truck.employee_id || '';
    const employee = empMap[employeeId] || {};

    const users   = getSheetData('Users');
    const manager = users.find(u => u.username === violation.manager_username) || {};

    const isStopOrder  = violation.stop_order === 'true';
    const docTitle     = isStopOrder ? 'คำสั่งหยุดจอดรถ' : 'หนังสือเตือน';
    const docNumber    = `SWJ-VIO-${violationId.substring(0,8).toUpperCase()}`;

    const approvedDate = violation.manager_approved_at
      ? _formatThaiDate(new Date(violation.manager_approved_at)) : '.....................';
    const ackDate = violation.driver_ack_at
      ? _formatThaiDate(new Date(violation.driver_ack_at)) : '.....................';
    const createdDate = violation.created_at
      ? _formatThaiDate(new Date(violation.created_at)) : '.....................';

    const currentCreatedAt = violation.created_at ? new Date(violation.created_at).getTime() : null;
    const sameEmpSameType = violations.filter(v => {
      if (v.employee_id !== violation.employee_id || v.type !== violation.type) return false;
      if (!currentCreatedAt || !v.created_at) return true;
      return new Date(v.created_at).getTime() <= currentCreatedAt;
    });
    const actualCount = Math.max(1, sameEmpSameType.length);

    const punishmentText = actualCount === 1
      ? 'การตักเตือนด้วยวาจา (ครั้งที่ 1)'
      : actualCount === 2
      ? 'หนังสือเตือนและคำสั่งหยุดจอดรถให้ดำเนินการทันที (ครั้งที่ 2)'
      : `หนังสือเตือนอย่างเป็นทางการ พร้อมพิจารณาโทษทางวินัย (ครั้งที่ ${actualCount})`;

    const logoHtml = LOGO_PUBLIC_URL
      ? `<img src="${LOGO_PUBLIC_URL}" class="logo-img" alt="SWJ Logo">`
      : _driveNamedImageHtml('Logo.png', 'height:60px;margin-bottom:8px;display:block;margin-left:auto;margin-right:auto;object-fit:contain');
    const sigHtml = _driveImageHtml(manager.signature_url, 'height:60px;max-width:160px;display:block;margin:0 auto 4px;object-fit:contain');
    const ackPhotos = _parsePhotoUrls(violation.ack_photo_urls);
    const ackSigHtml = violation.driver_ack_at && ackPhotos.length
      ? _driveImageHtml(ackPhotos[0], 'height:60px;max-width:160px;display:block;margin:0 auto 4px;object-fit:contain')
      : '<div style="height:60px;display:block"></div>';

    const weekLabel = violation.week_label || violation.round || '';

    const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'TH Sarabun New','Sarabun',Arial,sans-serif;
    font-size: 16pt;
    line-height: 1.7;
    color: #000;
    width: 210mm;
    min-height: 297mm;
    padding: 15mm 20mm;
    box-sizing: border-box;
    margin: 0;
  }
  .page { width: 100%; margin: 0; }
  .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 14px; }
  .logo-img { height: 60px; margin-bottom: 8px; display: block; margin-left: auto; margin-right: auto; }
  .company-name { font-size: 20pt; font-weight: bold; }
  .company-sub  { font-size: 14pt; }
  .doc-title    { font-size: 18pt; font-weight: bold; text-decoration: underline; text-align: center; margin: 12px 0; }
  .doc-title-stop { font-size: 18pt; font-weight: bold; text-decoration: underline; text-align: center; margin: 12px 0; color: #cc0000; }
  .doc-meta     { text-align: right; margin-bottom: 12px; font-size: 14pt; }
  table.info    { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  table.info td { padding: 3px 6px; vertical-align: top; font-size: 16pt; }
  table.info td:first-child { width: 32%; font-weight: bold; white-space: nowrap; }
  .box { border: 1px solid #000; padding: 10px 14px; margin: 12px 0; }
  .box-title { font-weight: bold; margin-bottom: 6px; font-size: 18pt; }
  .box p { font-size: 16pt; margin: 4px 0; }
  .stop-order-text { color: #cc0000; font-weight: bold; font-size: 16pt; margin-top: 6px; }
  .stop-order-banner { border: 2px solid #cc0000; color: #cc0000; font-size: 18pt; font-weight: bold; text-align: center; padding: 8px; margin: 12px 0; }
  .body-text { font-size: 16pt; margin: 12px 0; text-align: justify; line-height: 1.8; }
  .sig-section { margin-top: 30px; display: table; width: 100%; }
  .sig-col { display: table-cell; width: 50%; text-align: center; padding: 0 10px; vertical-align: bottom; }
  .sig-img-wrap { height: 60px; display: block; margin-bottom: 4px; }
  .sig-img-wrap img { max-height: 60px; max-width: 160px; object-fit: contain; }
  .sig-line { border-top: 1px solid #000; padding-top: 4px; font-size: 16pt; }
  .sig-role { font-size: 13pt; color: #555; }
  .sig-date { font-size: 13pt; }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    ${logoHtml}
    <div class="company-name">${COMPANY_NAME}</div>
    <div class="company-sub">${COMPANY_ADDRESS}</div>
    ${COMPANY_TEL ? `<div class="company-sub">โทร. ${COMPANY_TEL}</div>` : ''}
  </div>

  <div class="${isStopOrder ? 'doc-title-stop' : 'doc-title'}">${docTitle}</div>

  <div class="doc-meta">
    เลขที่: ${docNumber}<br>
    วันที่: ${approvedDate || createdDate}
  </div>

  <table class="info">
    <tr><td>เรื่อง</td><td>: ${docTitle}พนักงานขับรถ กรณี${violation.type}${weekLabel ? ' ' + weekLabel : ''}</td></tr>
    <tr><td>เรียน</td><td>: ${employee.full_name || '...........................'} (${employee.nickname || '-'})<br>
        <span style="font-size:14pt">รหัสพนักงาน: ${employeeId || '...........................'}</span></td></tr>
    <tr><td>หมายเลขรถ</td><td>: ${violation.truck_number}</td></tr>
  </table>

  <div class="box">
    <div class="box-title">รายละเอียดการละเมิด</div>
    <p>ประเภทงาน: <strong>${violation.type}</strong>${weekLabel ? ` (${weekLabel})` : ''}</p>
    <p>เหตุผล/รายละเอียด: ${violation.reason}</p>
    ${isStopOrder ? '<p class="stop-order-text">⛔ มีคำสั่งหยุดจอดรถจนกว่าจะดำเนินการแล้วเสร็จ</p>' : ''}
  </div>

  <div class="box">
    <div class="box-title">มาตรการ / บทลงโทษ (ครั้งที่ ${actualCount})</div>
    <p>${punishmentText}</p>
    ${isStopOrder ? '<p class="stop-order-text" style="margin-top:6px">⛔ คำสั่งหยุดจอดรถมีผลทันที</p>' : ''}
  </div>

  ${isStopOrder ? '<div class="stop-order-banner">คำสั่งหยุดจอด</div>' : ''}

  <div class="body-text">
    ด้วยบริษัทฯ พบว่าท่านได้ละเลยการปฏิบัติตามมาตรการบำรุงรักษารถบรรทุกที่กำหนดไว้
    บริษัทฯ จึงขอแจ้งให้ท่านทราบและดำเนินการแก้ไขโดยทันที
    ทั้งนี้ หากท่านไม่ปฏิบัติตามระเบียบข้อบังคับของบริษัทฯ อีก
    บริษัทฯ จะพิจารณาดำเนินการตามมาตรการที่เข้มงวดยิ่งขึ้นต่อไป
    ${isStopOrder ? '<br><strong style="color:#cc0000">กรณีนี้มีคำสั่งให้หยุดจอดรถโดยทันที ห้ามนำรถออกปฏิบัติงานจนกว่าจะได้รับการตรวจสอบ แก้ไข และได้รับอนุญาตเป็นลายลักษณ์อักษรจากผู้มีอำนาจ</strong>' : ''}
  </div>

  <div class="sig-section">
    <div class="sig-col">
      <div class="sig-img-wrap">${sigHtml}</div>
      <div class="sig-line">( ${manager.name || '...............................'} )</div>
      <div class="sig-role">ผู้จัดการ / ผู้อนุมัติ</div>
      <div class="sig-date">วันที่: ${approvedDate}</div>
    </div>
    <div class="sig-col">
      <div class="sig-img-wrap">${ackSigHtml}</div>
      <div class="sig-line">( ${employee.full_name || '...............................'} )</div>
      <div class="sig-role">พนักงานขับรถ / ผู้รับทราบ</div>
      <div class="sig-date">วันที่: ${ackDate}</div>
    </div>
  </div>
</div>
</body>
</html>`;

    return { success:true, html };
  } catch(e) { return { success:false, error:e.message }; }
}

// แปลงชื่อ stage เป็น subfolder ที่ตรงตาม convention
function _stageFolder(stage) {
  return { 'approved':'2.Approve', 'acknowledged':'3.รับทราบ', 'pending':'1.Draft' }[stage] || stage;
}

// แปลงประเภทงานเป็น numbered folder
function _typeFolder(type) {
  return { 'เป่ากรอง':'1.เป่ากรอง', 'เดรนน้ำ':'2.เดนน้ำ', 'อัดจารบี':'3.อัดจารบี' }[type] || type;
}

function _saveDocumentToDrive(html, violationId, violation, stage) {
  try {
    const now    = new Date();
    const yyyy   = now.getFullYear().toString();
    const mm     = String(now.getMonth()+1).padStart(2,'0');
    const dd     = String(now.getDate()).padStart(2,'0');
    const topic  = _typeFolder(violation.type || '');
    const stageFolderName = _stageFolder(stage);
    const truck  = violation.truck_number || 'unknown';
    const folder = `${DRIVE_ROOT_FOLDER}/หนังสือเตือน/${topic}/${yyyy}/${mm}/${yyyy}-${mm}-${dd}/${truck}/${stageFolderName}`;
    const fname  = `warning_${truck}_${stageFolderName}_${now.getTime()}.pdf`;

    const htmlBlob = Utilities.newBlob(html, 'text/html', 'warning.html');
    const pdfBlob = htmlBlob.getAs(MimeType.PDF);
    pdfBlob.setName(fname);
    return saveFileToDrive(folder, fname, pdfBlob);
  } catch(e) {
    Logger.log('saveDoc PDF error: ' + e.message);
    return '';
  }
}

// ============================================================
// DASHBOARD
// ============================================================
function getDashboardData(token, month, year) {
  try {
    _requireAuth(token, 'viewer');

    const m = parseInt(month) || (new Date().getMonth()+1);
    const y = parseInt(year)  || new Date().getFullYear();

    const trucks     = getSheetData('Trucks').filter(t => !t.status || t.status === 'active');
    const empMap     = _buildEmpMap();

    const allLogs = getSheetData('MaintenanceLogs').filter(r => {
      return _sameMonth(r, m, y);
    });
    const allViolations = getSheetData('ViolationLogs').filter(r => {
      return _sameMonth(r, m, y);
    });

    const rows = trucks.map(truck => {
      const emp      = empMap[truck.employee_id] || {};
      const truckLogs = allLogs.filter(l => String(l.truck_number) === String(truck.truck_number));

      // หา status ล่าสุดตาม type + week_label
      const getStatusByType = (type) => {
        const typeLogs = truckLogs.filter(l => l.type === type);
        if (!typeLogs.length) return {};
        // จัดกลุ่มตาม week_label
        const byWeek = {};
        typeLogs.forEach(l => {
          const wl = l.week_label || l.round || 'ไม่ระบุ';
          if (!byWeek[wl] || _dateValue(l) > _dateValue(byWeek[wl])) {
            byWeek[wl] = l;
          }
        });
        return byWeek;
      };

      const filterByWeek = getStatusByType('เป่ากรอง');
      const drainByWeek  = getStatusByType('เดรนน้ำ');
      const greaseByWeek = getStatusByType('อัดจารบี');

      // สรุปสถานะรวม (ล่าสุดที่ยังไม่ทำ หรือทำล่าสุด)
      const summarizeStatus = (byWeek) => {
        const vals = Object.values(byWeek);
        if (!vals.length) return null;
        if (vals.some(l => l.status === 'ยังไม่ได้ทำ')) return 'ยังไม่ได้ทำ';
        if (vals.some(l => l.status === 'โทรแจ้งแล้วรับทราบ')) return 'โทรแจ้งแล้วรับทราบ';
        return 'ทำแล้ว';
      };

      return {
        truck_number: truck.truck_number,
        employee_id:  truck.employee_id || '',
        full_name:    emp.full_name || '',
        nickname:     emp.nickname  || '',
        filter_by_week: filterByWeek,
        drain_by_week:  drainByWeek,
        grease_by_week: greaseByWeek,
        filter_status: summarizeStatus(filterByWeek),
        drain_status:  summarizeStatus(drainByWeek),
        grease_r1:     greaseByWeek['รอบ1']?.status || null,
        grease_r2:     greaseByWeek['รอบ2']?.status || null,
        has_late:      truckLogs.some(l => l.is_late === 'true')
      };
    });

    const stats = {
      done:             allLogs.filter(l => l.status === 'ทำแล้ว' || l.status === 'ทำหลังเตือน').length,
      not_done:         allLogs.filter(l => l.status === 'ยังไม่ได้ทำ').length,
      called:           allLogs.filter(l => l.status === 'โทรแจ้งแล้วรับทราบ').length,
      warned:           allViolations.length,
      pending_approval: allViolations.filter(v => v.doc_status === 'pending').length,
      late:             allLogs.filter(l => l.is_late === 'true').length
    };

    let activities = getSheetData('ActivityLogs');
    activities.sort((a,b) => new Date(b.timestamp||0) - new Date(a.timestamp||0));
    activities = activities.slice(0,10).map(a => ({
      username: a.username, detail: a.detail, timestamp: a.timestamp
    }));

    return { success:true, data:_toCC({ month:m, year:y, stats, rows, activities }) };
  } catch(e) { return { success:false, error:e.message }; }
}

function getDashboardCardDetail(token, cardType, month, year) {
  try {
    _requireAuth(token, 'viewer');
    const m = parseInt(month) || (new Date().getMonth()+1);
    const y = parseInt(year)  || new Date().getFullYear();
    const empMap = _buildEmpMap();

    const allLogs = getSheetData('MaintenanceLogs').filter(r => {
      return _sameMonth(r, m, y);
    });

    let filtered;
    if (cardType === 'done')     filtered = allLogs.filter(l => l.status === 'ทำแล้ว' || l.status === 'ทำหลังเตือน');
    else if (cardType === 'not_done') filtered = allLogs.filter(l => l.status === 'ยังไม่ได้ทำ');
    else if (cardType === 'called')   filtered = allLogs.filter(l => l.status === 'โทรแจ้งแล้วรับทราบ');
    else if (cardType === 'late')     filtered = allLogs.filter(l => l.is_late === 'true');
    else if (cardType === 'warned') {
      const violations = getSheetData('ViolationLogs').filter(r => {
        return _sameMonth(r, m, y);
      });
      const data = violations.map(r => ({ ...r, employee: empMap[r.employee_id] || null }));
      return { success:true, data:_toCC(data) };
    } else filtered = allLogs;

    const data = filtered.map(r => ({ ...r, employee: empMap[r.employee_id] || null }));
    return { success:true, data:_toCC(data) };
  } catch(e) { return { success:false, error:e.message }; }
}

function getCompareData(token, month1, year1, month2, year2) {
  try {
    _requireAuth(token, 'viewer');
    const r1 = getDashboardData(token, month1, year1);
    const r2 = getDashboardData(token, month2, year2);
    if (!r1.success) return r1;
    if (!r2.success) return r2;
    return { success:true, data:{ col1:r1.data, col2:r2.data } };
  } catch(e) { return { success:false, error:e.message }; }
}

// ============================================================
// AUTO MODE — สร้าง PM tasks ล่วงหน้าทั้งเดือน
// ============================================================
function generateMonthlyPMTasks(token, month, year) {
  try {
    const session = _requireAuth(token, 'manager');

    const m = parseInt(month) || (new Date().getMonth()+1);
    const y = parseInt(year)  || new Date().getFullYear();
    const trucks = getSheetData('Trucks').filter(t => !t.status || t.status === 'active');
    const now    = new Date().toISOString();

    // ตรวจว่า auto tasks เดือนนี้มีแล้วหรือยัง
    const existing = getSheetData('MaintenanceLogs').filter(r =>
      r.is_auto === 'true' && _sameMonth(r, m, y)
    );
    if (existing.length > 0) {
      return { success:false, error:`มี Auto Tasks สำหรับ ${m}/${y} แล้ว (${existing.length} รายการ)` };
    }

    let count = 0;
    trucks.forEach(truck => {
      // เป่ากรอง + เดรนน้ำ: 8 รอบ/เดือน
      ['เป่ากรอง','เดรนน้ำ'].forEach(type => {
        WEEK_LABELS_FILTER.forEach(wl => {
          appendRow('MaintenanceLogs', [
            generateId(), type, truck.truck_number, truck.employee_id || '',
            'ยังไม่ได้ทำ', wl, '', JSON.stringify([]),
            'false', 'true', '',
            session.username, now
          ]);
          count++;
        });
      });
      // อัดจารบี: 2 รอบ/เดือน
      WEEK_LABELS_GREASE.forEach(wl => {
        appendRow('MaintenanceLogs', [
          generateId(), 'อัดจารบี', truck.truck_number, truck.employee_id || '',
          'ยังไม่ได้ทำ', wl, '', JSON.stringify([]),
          'false', 'true', '',
          session.username, now
        ]);
        count++;
      });
    });

    _createNotification(
      'pm_auto_created',
      `สร้าง PM Tasks อัตโนมัติ`,
      `สร้าง ${count} tasks สำหรับ ${m}/${y} เรียบร้อยแล้ว`,
      'pm-form', 'system', '', 'manager,admin,operation'
    );

    logActivity('auto_generate', session.username, `สร้าง Auto PM ${count} tasks สำหรับ ${m}/${y}`);
    return { success:true, count };
  } catch(e) { return { success:false, error:e.message }; }
}

// ============================================================
// USERS (admin only)
// ============================================================
function getUsers(token) {
  try {
    _requireAuth(token, 'manager');  // manager ดูได้ แต่ไม่สามารถแก้ไข
    const data = getSheetData('Users').map(u => {
      const { password_hash, ...safe } = u;
      return safe;
    });
    return { success:true, data:_toCC(data) };
  } catch(e) { return { success:false, error:e.message }; }
}

function createUser(token, data) {
  try {
    const session = _requireAuth(token, 'admin');
    data = _fromCC(data);
    if (!data.username || !data.password || !data.name || !data.role) {
      return { success:false, error:'กรุณาระบุข้อมูลให้ครบถ้วน' };
    }
    if (getSheetData('Users').find(u => u.username === data.username)) {
      return { success:false, error:'ชื่อผู้ใช้นี้มีอยู่แล้ว' };
    }
    const validRoles = ['admin','manager','operation','viewer'];
    if (!validRoles.includes(data.role)) return { success:false, error:'Role ไม่ถูกต้อง' };

    appendRow('Users', [
      generateId(), data.username, data.name, data.role,
      hashPassword(data.password), data.signature_url || '',
      new Date().toISOString()
    ]);
    logActivity('create_user', session.username, `สร้าง user ${data.username} (${data.role})`);
    return { success:true };
  } catch(e) { return { success:false, error:e.message }; }
}

function updateUser(token, id, data) {
  try {
    const session = _requireAuth(token, 'admin');
    data = _fromCC(data);
    const users = getSheetData('Users');
    const user  = users.find(u => u.id === id);
    if (!user) return { success:false, error:'ไม่พบผู้ใช้' };
    const updates = {};
    if (data.name)     updates.name = data.name;
    if (data.role)     updates.role = data.role;
    if (data.password) updates.password_hash = hashPassword(data.password);
    if (data.signature_url !== undefined) updates.signature_url = data.signature_url;
    updateRow('Users', id, updates);
    logActivity('update_user', session.username, `อัปเดต user ${user.username}`);
    return { success:true };
  } catch(e) { return { success:false, error:e.message }; }
}

function deleteUser(token, id) {
  try {
    const session = _requireAuth(token, 'admin');
    const users = getSheetData('Users');
    const user  = users.find(u => u.id === id);
    if (!user) return { success:false, error:'ไม่พบผู้ใช้' };
    if (user.username === session.username) return { success:false, error:'ไม่สามารถลบบัญชีตัวเองได้' };
    deleteRow('Users', id);
    logActivity('delete_user', session.username, `ลบ user ${user.username}`);
    return { success:true };
  } catch(e) { return { success:false, error:e.message }; }
}

// ============================================================
// EMPLOYEES (admin / manager / operation)
// ============================================================
function getEmployees(token) {
  try {
    _requireAuth(token, 'viewer');
    return { success:true, data:_toCC(getSheetData('Employees')) };
  } catch(e) { return { success:false, error:e.message }; }
}

function createEmployee(token, data) {
  try {
    const session = _requireAuth(token, 'operation');  // ← ลดจาก admin
    data = _fromCC(data);
    if (!data.employee_id || !data.full_name) {
      return { success:false, error:'กรุณาระบุ employee_id และ full_name' };
    }
    if (getSheetData('Employees').find(e => e.employee_id === data.employee_id)) {
      return { success:false, error:'รหัสพนักงานนี้มีอยู่แล้ว' };
    }
    appendRow('Employees', [data.employee_id, data.nickname||'', data.full_name, data.status||'active']);
    logActivity('create_employee', session.username, `เพิ่มพนักงาน ${data.employee_id} ${data.full_name}`);
    return { success:true };
  } catch(e) { return { success:false, error:e.message }; }
}

function updateEmployee(token, id, data) {
  try {
    const session = _requireAuth(token, 'operation');  // ← ลดจาก admin
    data = _fromCC(data);
    const emp = getSheetData('Employees').find(e => e.employee_id === id);
    if (!emp) return { success:false, error:'ไม่พบพนักงาน' };
    const updates = {};
    if (data.nickname  !== undefined) updates.nickname  = data.nickname;
    if (data.full_name)               updates.full_name = data.full_name;
    if (data.status)                  updates.status    = data.status;
    updateRow('Employees', id, updates, 'employee_id');
    logActivity('update_employee', session.username, `อัปเดตพนักงาน ${id}`);
    return { success:true };
  } catch(e) { return { success:false, error:e.message }; }
}

function deleteEmployee(token, id) {
  try {
    const session = _requireAuth(token, 'operation');  // ← ลดจาก admin
    const emp = getSheetData('Employees').find(e => e.employee_id === id);
    if (!emp) return { success:false, error:'ไม่พบพนักงาน' };
    deleteRow('Employees', id, 'employee_id');
    logActivity('delete_employee', session.username, `ลบพนักงาน ${id}`);
    return { success:true };
  } catch(e) { return { success:false, error:e.message }; }
}

// ============================================================
// TRUCKS (admin / manager / operation)
// ============================================================
function getTrucks(token) {
  try {
    _requireAuth(token, 'viewer');
    const trucks  = getSheetData('Trucks');
    const empMap  = _buildEmpMap();
    return { success:true, data:_toCC(trucks.map(t => ({ ...t, employee: empMap[t.employee_id]||null }))) };
  } catch(e) { return { success:false, error:e.message }; }
}

function createTruck(token, data) {
  try {
    const session = _requireAuth(token, 'operation');  // ← ลดจาก admin
    data = _fromCC(data);
    if (!data.truck_number) return { success:false, error:'กรุณาระบุหมายเลขรถ' };
    if (getSheetData('Trucks').find(t => t.truck_number === data.truck_number)) {
      return { success:false, error:'หมายเลขรถนี้มีอยู่แล้ว' };
    }
    appendRow('Trucks', [data.truck_number, data.employee_id||'', data.status||'active']);
    logActivity('create_truck', session.username, `เพิ่มรถ ${data.truck_number}`);
    return { success:true };
  } catch(e) { return { success:false, error:e.message }; }
}

function updateTruck(token, id, data) {
  try {
    const session = _requireAuth(token, 'operation');  // ← ลดจาก admin
    data = _fromCC(data);
    if (!getSheetData('Trucks').find(t => t.truck_number === id)) {
      return { success:false, error:'ไม่พบรถ' };
    }
    const updates = {};
    if (data.employee_id !== undefined) updates.employee_id = data.employee_id;
    if (data.status)                    updates.status       = data.status;
    updateRow('Trucks', id, updates, 'truck_number');
    logActivity('update_truck', session.username, `อัปเดตรถ ${id}`);
    return { success:true };
  } catch(e) { return { success:false, error:e.message }; }
}

function deleteTruck(token, id) {
  try {
    const session = _requireAuth(token, 'operation');  // ← ลดจาก admin
    if (!getSheetData('Trucks').find(t => t.truck_number === id)) {
      return { success:false, error:'ไม่พบรถ' };
    }
    deleteRow('Trucks', id, 'truck_number');
    logActivity('delete_truck', session.username, `ลบรถ ${id}`);
    return { success:true };
  } catch(e) { return { success:false, error:e.message }; }
}

// ============================================================
// SIGNATURE UPLOAD (manager+)
// ============================================================
function uploadSignature(token, base64, mimeType) {
  try {
    const session = _requireAuth(token, 'manager');
    if (!base64) return { success:false, error:'ไม่มีข้อมูลลายเซ็นต์' };

    const folder = `${DRIVE_ROOT_FOLDER}/ลายเซ็นต์`;
    const fname  = `sig_${session.username}.png`;  // ชื่อเดิมเสมอ → ลบอันเก่าอัตโนมัติ

    // ลบไฟล์ลายเซ็นต์เก่าก่อน (flat folder)
    _deleteFileInFolder(folder, fname);

    const blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType||'image/png', fname);
    const url  = saveFileToDrive(folder, fname, blob);

    updateRow('Users', null, { signature_url:url }, 'username', session.username);
    logActivity('upload_signature', session.username, 'อัปโหลดลายเซ็นต์');
    return { success:true, url };
  } catch(e) { return { success:false, error:e.message }; }
}

function _deleteFileInFolder(folderPath, filename) {
  try {
    const parts  = folderPath.split('/').filter(p => p);
    let folder   = DriveApp.getFolderById(DRIVE_PARENT_FOLDER_ID);
    for (const part of parts) {
      const folders = folder.getFoldersByName(part);
      if (!folders.hasNext()) return;
      folder = folders.next();
    }
    const files = folder.getFilesByName(filename);
    while (files.hasNext()) files.next().setTrashed(true);
  } catch(e) { Logger.log('deleteFile error: ' + e.message); }
}

// ============================================================
// NOTIFICATIONS
// ============================================================
function getNotifications(token) {
  try {
    const session = _requireAuth(token, 'viewer');
    const all = getSheetData('Notifications');
    const username = session.username;
    const role     = session.role;

    const visible = all.filter(n => {
      // ตรวจสิทธิ์
      const targetRoles = (n.target_roles || '').split(',').map(r => r.trim());
      if (!targetRoles.includes(role) && n.target_roles !== '') return false;
      // ตรวจว่า dismiss แล้วหรือยัง
      const dismissed = _parseJson(n.dismissed_by, []);
      if (dismissed.includes(username)) return false;
      return true;
    });

    visible.sort((a,b) => new Date(b.created_at||0) - new Date(a.created_at||0));
    return { success:true, data:_toCC(visible.slice(0,50)) };
  } catch(e) { return { success:false, error:e.message }; }
}

function dismissNotification(token, notifId) {
  try {
    const session = _requireAuth(token, 'viewer');
    const notifs  = getSheetData('Notifications');
    const notif   = notifs.find(n => n.id === notifId);
    if (!notif) return { success:false, error:'ไม่พบการแจ้งเตือน' };

    const dismissed = _parseJson(notif.dismissed_by, []);
    if (!dismissed.includes(session.username)) {
      dismissed.push(session.username);
      updateRow('Notifications', notifId, { dismissed_by: JSON.stringify(dismissed) });
    }
    return { success:true };
  } catch(e) { return { success:false, error:e.message }; }
}

function deleteNotification(token, notifId) {
  try {
    _requireAuth(token, 'manager');
    deleteRow('Notifications', notifId);
    return { success:true };
  } catch(e) { return { success:false, error:e.message }; }
}

function _createNotification(type, title, body, page, refType, refId, targetRoles) {
  try {
    appendRow('Notifications', [
      generateId(), type, title, body, page,
      refType, refId, targetRoles,
      JSON.stringify([]),  // dismissed_by
      new Date().toISOString()
    ]);
  } catch(e) { Logger.log('createNotif error: ' + e.message); }
}

function _clearNotificationsByRef(refType, refId) {
  try {
    const notifs  = getSheetData('Notifications');
    const ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet   = ss.getSheetByName('Notifications');
    const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
    const refTypeIdx = headers.indexOf('ref_type');
    const refIdIdx   = headers.indexOf('ref_id');
    if (refTypeIdx === -1 || refIdIdx === -1) return;

    const values = sheet.getDataRange().getValues();
    for (let i = values.length-1; i >= 1; i--) {
      if (String(values[i][refTypeIdx]) === refType &&
          String(values[i][refIdIdx])   === refId) {
        sheet.deleteRow(i+1);
      }
    }
  } catch(e) { Logger.log('clearNotif error: ' + e.message); }
}

// ============================================================
// COMMENTS
// ============================================================
function getComments(token, refType, refId) {
  try {
    const session = _requireAuth(token, 'operation');  // viewer ไม่เห็น
    let data = getSheetData('Comments').filter(c =>
      c.ref_type === refType && c.ref_id === refId
    );
    data.sort((a,b) => new Date(a.created_at||0) - new Date(b.created_at||0));
    return { success:true, data:_toCC(data) };
  } catch(e) { return { success:false, error:e.message }; }
}

function addComment(token, refType, refId, message) {
  try {
    const session = _requireAuth(token, 'operation');
    if (!message || !message.trim()) return { success:false, error:'กรุณากรอกข้อความ' };
    appendRow('Comments', [
      generateId(), refType, refId,
      session.username, session.name,
      message.trim(), new Date().toISOString()
    ]);
    logActivity('add_comment', session.username, `comment ใน ${refType} ${refId}`);
    return { success:true };
  } catch(e) { return { success:false, error:e.message }; }
}

// ============================================================
// STATUS HISTORY
// ============================================================
function getStatusHistory(token, refType, refId) {
  try {
    _requireAuth(token, 'operation');
    let data = getSheetData('StatusHistory').filter(h =>
      h.ref_type === refType && h.ref_id === refId
    );
    data.sort((a,b) => new Date(a.changed_at||0) - new Date(b.changed_at||0));
    return { success:true, data:_toCC(data) };
  } catch(e) { return { success:false, error:e.message }; }
}

function _addStatusHistory(refType, refId, statusFrom, statusTo, changedBy, notes) {
  try {
    appendRow('StatusHistory', [
      generateId(), refType, refId,
      statusFrom, statusTo, changedBy,
      new Date().toISOString(), notes||''
    ]);
  } catch(e) { Logger.log('addStatusHistory error: ' + e.message); }
}

// ============================================================
// ACTIVITY LOGS
// ============================================================
function getActivityLogs(token, filters) {
  try {
    _requireAuth(token, 'admin');
    let data = getSheetData('ActivityLogs');
    if (filters) {
      if (filters.username) data = data.filter(r => r.username === filters.username);
      if (filters.limit)    data = data.slice(-parseInt(filters.limit));
    }
    data.sort((a,b) => new Date(b.timestamp||0) - new Date(a.timestamp||0));
    return { success:true, data };
  } catch(e) { return { success:false, error:e.message }; }
}

function ensureAllSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  Object.keys(SHEET_HEADERS).forEach(name => _getOrCreateSheet(ss, name));
  return { success:true, message:'ตรวจสอบ/สร้าง sheets เรียบร้อย' };
}

function getGoodEmployees(token) {
  try {
    _requireAuth(token, 'operation');
    const employees  = getSheetData('Employees').filter(e => !e.status || e.status === 'active');
    const violations = getSheetData('ViolationLogs');
    const pmLogs     = getSheetData('MaintenanceLogs');
    const now        = new Date();
    const cut2M      = new Date(now); cut2M.setMonth(cut2M.getMonth() - 2);
    const cut3M      = new Date(now); cut3M.setMonth(cut3M.getMonth() - 3);

    const result = employees.map(emp => {
      const empVios  = violations.filter(v => v.employee_id === emp.employee_id);
      const recent   = empVios.filter(v => {
        const d = _rowDate(v);
        return d && d >= cut2M;
      });
      if (recent.length > 0) return null;

      const sorted = empVios
        .filter(v => _rowDate(v))
        .sort((a,b) => _dateValue(b) - _dateValue(a));

      const streakDays = sorted.length === 0
        ? 999
        : Math.floor((now - _rowDate(sorted[0])) / 86400000);

      const pmCount = pmLogs.filter(l =>
        l.employee_id === emp.employee_id &&
        _rowDate(l) &&
        _rowDate(l) >= cut3M
      ).length;

      return {
        employee_id:  emp.employee_id,
        nickname:     emp.nickname,
        full_name:    emp.full_name,
        streak_days:  streakDays,
        pm_count:     pmCount,
        last_vio_at:  sorted.length ? sorted[0].created_at : null,
        vio_total:    empVios.length
      };
    }).filter(Boolean);

    result.sort((a,b) => b.streak_days - a.streak_days);
    return { success:true, data:_toCC(result.slice(0, 20)) };
  } catch(e) { return { success:false, error:e.message }; }
}

// ============================================================
// HELPER — SHEET OPERATIONS
// ============================================================

// Headers map สำหรับ auto-create sheet ที่หายไป
const SHEET_HEADERS = {
  'Users':          ['id','username','name','role','password_hash','signature_url','created_at'],
  'Employees':      ['employee_id','nickname','full_name','status'],
  'Trucks':         ['truck_number','employee_id','status'],
  'MaintenanceLogs':['id','type','truck_number','employee_id','status','week_label','notes','photo_urls','is_late','is_auto','log_date','created_by','created_at','notified_line'],
  'ViolationLogs':  ['id','truck_number','employee_id','type','week_label','reason','followup_done','punishment_level','stop_order','doc_status','manager_approved_at','manager_username','driver_ack_at','ack_photo_urls','pdf_pending_url','pdf_approved_url','pdf_ack_url','created_by','created_at','violation_topic','reset_date'],
  'ActivityLogs':   ['id','action','username','detail','timestamp'],
  'Notifications':  ['id','type','title','body','page','ref_type','ref_id','target_roles','dismissed_by','created_at'],
  'Comments':       ['id','ref_type','ref_id','username','display_name','message','created_at'],
  'StatusHistory':  ['id','ref_type','ref_id','status_from','status_to','changed_by','changed_at','notes'],
  'LineNotifications': ['id','type','week_label','notes','photo_urls','created_by','created_at'],
};

function _getOrCreateSheet(ss, sheetName) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    const headers = SHEET_HEADERS[sheetName];
    if (!headers) throw new Error(`ไม่พบ sheet: ${sheetName}`);
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    Logger.log(`Auto-created sheet: ${sheetName}`);
  } else {
    // เพิ่ม column ใหม่ที่ยังไม่มี (backward compat)
    const headers = SHEET_HEADERS[sheetName];
    if (headers) {
      const existing = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      headers.forEach(h => {
        if (!existing.includes(h)) {
          sheet.getRange(1, sheet.getLastColumn() + 1).setValue(h);
        }
      });
    }
  }
  return sheet;
}

function getSheetData(sheetName) {
  const ss     = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet  = _getOrCreateSheet(ss, sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  const headers = values[0];
  return values.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      const val = row[i];
      obj[h] = val instanceof Date ? val.toISOString() : (val === undefined ? '' : val);
    });
    return obj;
  });
}

function appendRow(sheetName, rowData) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = _getOrCreateSheet(ss, sheetName);
  sheet.appendRow(rowData);
  return rowData[0];
}

function updateRow(sheetName, id, updates, idColumn, idValue) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`ไม่พบ sheet: ${sheetName}`);
  const values  = sheet.getDataRange().getValues();
  const headers = values[0];
  const keyCol  = idColumn || 'id';
  const keyVal  = (idValue !== undefined) ? idValue : id;
  const keyIdx  = headers.indexOf(keyCol);
  if (keyIdx === -1) throw new Error(`ไม่พบ column: ${keyCol}`);

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][keyIdx]) === String(keyVal)) {
      Object.keys(updates).forEach(key => {
        const colIdx = headers.indexOf(key);
        if (colIdx !== -1) sheet.getRange(i+1, colIdx+1).setValue(updates[key]);
      });
      return;
    }
  }
  throw new Error(`ไม่พบข้อมูล: ${keyCol}=${keyVal}`);
}

function deleteRow(sheetName, id, idColumn) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`ไม่พบ sheet: ${sheetName}`);
  const values  = sheet.getDataRange().getValues();
  const headers = values[0];
  const keyCol  = idColumn || 'id';
  const keyIdx  = headers.indexOf(keyCol);
  if (keyIdx === -1) throw new Error(`ไม่พบ column: ${keyCol}`);
  for (let i = values.length-1; i >= 1; i--) {
    if (String(values[i][keyIdx]) === String(id)) {
      sheet.deleteRow(i+1);
      return;
    }
  }
  throw new Error(`ไม่พบข้อมูล: ${keyCol}=${id}`);
}

// ============================================================
// HELPER — DRIVE OPERATIONS
// ============================================================
function getDriveFolder(path) {
  const parts = path.split('/').filter(p => p.length > 0);
  let folder  = DriveApp.getFolderById(DRIVE_PARENT_FOLDER_ID);
  parts.forEach(part => {
    const folders = folder.getFoldersByName(part);
    folder = folders.hasNext() ? folders.next() : folder.createFolder(part);
  });
  return folder;
}

function saveFileToDrive(folderPath, filename, blob) {
  const folder   = getDriveFolder(folderPath);
  const file     = folder.createFile(blob);
  file.setName(filename);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const mimeType = blob.getContentType ? blob.getContentType() : '';
  if (mimeType && mimeType.startsWith('image/')) {
    return 'https://drive.google.com/uc?export=view&id=' + file.getId();
  }
  return 'https://drive.google.com/file/d/' + file.getId() + '/view';
}

// ============================================================
// HELPER — UTILITY
// ============================================================
function generateId() { return Utilities.getUuid(); }

function hashPassword(password) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, password, Utilities.Charset.UTF_8
  );
  return bytes.map(b => {
    const hex = (b < 0 ? b+256 : b).toString(16);
    return hex.length === 1 ? '0'+hex : hex;
  }).join('');
}

function logActivity(action, username, detail) {
  try {
    appendRow('ActivityLogs', [generateId(), action, username, detail, new Date().toISOString()]);
  } catch(e) { Logger.log('logActivity error: ' + e.message); }
}

function _buildEmpMap() {
  const empMap = {};
  getSheetData('Employees').forEach(e => { empMap[e.employee_id] = e; });
  return empMap;
}

// แก้บั๊ก: parse photo_urls อย่างถูกต้อง
function _parsePhotoUrls(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(u => u && typeof u === 'string' && u.startsWith('http'));
  const parsed = _parseJson(raw, []);
  if (Array.isArray(parsed)) return parsed.filter(u => u && typeof u === 'string' && u.startsWith('http'));
  return [];
}

function _driveFileIdFromUrl(url) {
  if (!url) return '';
  const s = String(url);
  const m = s.match(/[?&]id=([^&]+)/) || s.match(/\/d\/([^\/]+)/);
  return m ? m[1] : '';
}

function _driveImageDataUrl(url) {
  const id = _driveFileIdFromUrl(url);
  if (!id) return '';
  try {
    const blob = DriveApp.getFileById(id).getBlob();
    const b64 = Utilities.base64Encode(blob.getBytes());
    const mime = blob.getContentType() || 'image/png';
    return `data:${mime};base64,${b64}`;
  } catch(e) {
    Logger.log('drive image data error: ' + e.message);
    return '';
  }
}

function _driveImageHtml(url, style) {
  const empty = '<div style="height:60px;display:block"></div>';
  const dataUrl = _driveImageDataUrl(url);
  return dataUrl ? `<img src="${dataUrl}" style="${style}">` : empty;
}

function _driveNamedImageHtml(filename, style) {
  const empty = '';
  try {
    const files = DriveApp.getFilesByName(filename);
    if (!files.hasNext()) return empty;
    const blob = files.next().getBlob();
    const b64 = Utilities.base64Encode(blob.getBytes());
    const mime = blob.getContentType() || 'image/png';
    return `<img src="data:${mime};base64,${b64}" style="${style}">`;
  } catch(e) {
    Logger.log('drive named image embed error: ' + e.message);
    return empty;
  }
}

function _parseJson(str, defaultVal) {
  if (!str) return defaultVal;
  try { return JSON.parse(str); } catch(e) { return defaultVal; }
}

function _rowDate(row) {
  const raw = row.created_at || row.log_date || row.updated_at || row.timestamp || '';
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d) ? null : d;
}

function _sameMonth(row, month, year) {
  const d = _rowDate(row);
  if (!d) return false;
  const monthMatch = !month || (d.getMonth()+1) === parseInt(month);
  const yearMatch = !year || d.getFullYear() === parseInt(year);
  return monthMatch && yearMatch;
}

function _dateValue(row) {
  const d = _rowDate(row);
  return d ? d.getTime() : 0;
}

function _toCamel(s) { return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase()); }
function _toSnake(s) { return s.replace(/([A-Z])/g, c => '_'+c.toLowerCase()); }

function _toCC(obj) {
  if (Array.isArray(obj)) return obj.map(_toCC);
  if (obj && typeof obj === 'object' && !(obj instanceof Date)) {
    const out = {};
    Object.keys(obj).forEach(k => { out[_toCamel(k)] = _toCC(obj[k]); });
    return out;
  }
  return obj;
}

function _fromCC(obj) {
  if (Array.isArray(obj)) return obj.map(_fromCC);
  if (obj && typeof obj === 'object' && !(obj instanceof Date)) {
    const out = {};
    Object.keys(obj).forEach(k => { out[_toSnake(k)] = _fromCC(obj[k]); });
    return out;
  }
  return obj;
}

// ============================================================
// LINE NOTIFICATIONS — แจ้งลงกลุ่มไลน์ (batch notify)
// ============================================================
function createLineNotification(token, data, filesData) {
  try {
    const session = _requireAuth(token, 'operation');
    data = _fromCC(data);

    if (!data.type || !data.week_label) {
      return { success: false, error: 'กรุณาระบุหัวข้อและรอบ' };
    }
    if (!_getWeekLabels(data.type).includes(data.week_label)) {
      return { success: false, error: 'รอบงานไม่ถูกต้องสำหรับหัวข้อนี้' };
    }
    if (!filesData || !Array.isArray(filesData) || !filesData.length) {
      return { success: false, error: 'กรุณาแนบรูปหลักฐาน' };
    }

    const now   = new Date();
    const yyyy  = now.getFullYear().toString();
    const mm    = String(now.getMonth()+1).padStart(2,'0');
    const dd    = String(now.getDate()).padStart(2,'0');
    const topic = _typeFolder(data.type);
    const safeWeek = (data.week_label || '').replace(/\//g, '-').replace(/\s/g, '_');
    const folderPath = `${DRIVE_ROOT_FOLDER}/แจ้งลงกลุ่มไลน์/${topic}/${yyyy}/${mm}/${yyyy}-${mm}-${dd}`;

    const photoUrls = [];
    filesData.forEach((file, idx) => {
      try {
        const ext  = (file.name || '').split('.').pop() || 'jpg';
        const fname = `line_${safeWeek}_${idx+1}.${ext}`;
        const blob  = Utilities.newBlob(Utilities.base64Decode(file.base64), file.mimeType || 'image/jpeg', fname);
        const url   = saveFileToDrive(folderPath, fname, blob);
        if (url && url.startsWith('http')) photoUrls.push(url);
      } catch(fe) { Logger.log('lineNotify photo error: ' + fe.message); }
    });

    if (!photoUrls.length) return { success: false, error: 'อัปโหลดรูปหลักฐานไม่สำเร็จ' };

    const id     = generateId();
    const nowIso = now.toISOString();

    appendRow('LineNotifications', [id, data.type, data.week_label, data.notes || '', JSON.stringify(photoUrls), session.username, nowIso]);

    // Batch: อัปเดต ยังไม่ได้ทำ → โทรแจ้งแล้วรับทราบ
    const logs   = getSheetData('MaintenanceLogs');
    const trucks = getSheetData('Trucks').filter(t => !t.status || t.status === 'active');
    let updatedCount = 0;
    const recordedTrucks = new Set();

    logs.forEach(log => {
      if (String(log.type) === String(data.type) && String(log.week_label) === String(data.week_label)) {
        recordedTrucks.add(String(log.truck_number));
        if (log.status === 'ยังไม่ได้ทำ') {
          try {
            updateRow('MaintenanceLogs', log.id, { status: 'โทรแจ้งแล้วรับทราบ', notified_line: 'true' });
            updatedCount++;
          } catch(e) { Logger.log('batch update: ' + e.message); }
        }
      }
    });

    // สร้าง log ใหม่สำหรับรถที่ยังไม่มีบันทึกเลย
    trucks.forEach(truck => {
      if (!recordedTrucks.has(String(truck.truck_number))) {
        try {
          appendRow('MaintenanceLogs', [
            generateId(), data.type, truck.truck_number, truck.employee_id || '',
            'โทรแจ้งแล้วรับทราบ', data.week_label,
            'แจ้งลงกลุ่มไลน์ (อัตโนมัติ)', JSON.stringify(photoUrls),
            'false', 'false', '', session.username, nowIso, 'true'
          ]);
          updatedCount++;
        } catch(e) { Logger.log('create log: ' + e.message); }
      }
    });

    logActivity('line_notify', session.username, `แจ้งลงกลุ่มไลน์ ${data.type} ${data.week_label} — ${updatedCount} รายการ`);
    return { success: true, updatedCount, photoUrls };
  } catch(e) { return { success: false, error: e.message }; }
}

function getLineNotifications(token) {
  try {
    _requireAuth(token, 'operation');
    let data = getSheetData('LineNotifications');
    data.sort((a,b) => new Date(b.created_at||0) - new Date(a.created_at||0));
    data = data.map(n => ({ ...n, photo_urls: _parsePhotoUrls(n.photo_urls) }));
    return { success: true, data: _toCC(data.slice(0, 50)) };
  } catch(e) { return { success: false, error: e.message }; }
}

// ============================================================
// FOLLOWUP / TRACKING — ติดตามสถานะ
// ============================================================
function getFollowupTrucks(token, filters) {
  try {
    _requireAuth(token, 'operation');
    filters = filters ? _fromCC(filters) : {};

    let logs = getSheetData('MaintenanceLogs');

    const targetStatuses = filters.statuses || ['ยังไม่ได้ทำ', 'โทรแจ้งแล้วรับทราบ'];
    logs = logs.filter(l => targetStatuses.includes(l.status));

    if (filters.type)       logs = logs.filter(l => l.type === filters.type);
    if (filters.week_label) logs = logs.filter(l => l.week_label === filters.week_label);
    if (filters.month || filters.year) {
      logs = logs.filter(l => _sameMonth(l, filters.month, filters.year));
    }

    const empMap = _buildEmpMap();
    logs = logs.map(l => ({
      ...l,
      employee:   empMap[l.employee_id] || null,
      photo_urls: _parsePhotoUrls(l.photo_urls)
    }));
    logs.sort((a,b) => _dateValue(b) - _dateValue(a));

    return { success: true, data: _toCC(logs) };
  } catch(e) { return { success: false, error: e.message }; }
}

function _formatThaiDate(date) {
  if (!date || !(date instanceof Date) || isNaN(date)) return '.....................';
  const thaiMonths = [
    'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน',
    'พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม',
    'กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'
  ];
  return `${date.getDate()} ${thaiMonths[date.getMonth()]} ${date.getFullYear()+543}`;
}
