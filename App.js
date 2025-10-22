// Initialize Dexie database
const db = new Dexie('ImmunizationTrackerDB');
db.version(3).stores({
  children: '++id, regNo, name, dob, sex, address, contact, isDefaulter, createdAt',
  vaccinations: '++id, childId, vaccine, dateGiven, batchNumber, placeGiven, remarks, nextVisit, status',
  facility: 'id, name, updatedAt',
  settings: 'id, value',
  backups: '++id, date, data'
});

// Global variables
let children = [];
let facilityName = '';
let unsavedVaccinations = {};
let selectedChildIndex = null;
let editChildIndex = null;

// Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('./service-worker.js')
      .then(function(registration) {
        console.log('ServiceWorker registration successful with scope: ', registration.scope);
      })
      .catch(function(error) {
        console.log('ServiceWorker registration failed: ', error);
      });
  });
}

// Initialize the application
async function initApp() {
  showLoading(true);
  
  try {
    // Load facility name
    const facility = await db.facility.get(1);
    if (facility) {
      facilityName = facility.name;
      document.getElementById('facilityName').value = facilityName;
    }
    
    // Load children data
    children = await db.children.orderBy('createdAt').reverse().toArray();
    
    // Load vaccinations for each child
    for (let child of children) {
      child.vaccinations = await db.vaccinations.where('childId').equals(child.id).toArray();
    }
    
    // Update UI
    updateStats();
    updateChildTable();
    updateAllTables();
    showNotification('App loaded successfully!', 'success');
  } catch (error) {
    console.error('Error initializing app:', error);
    showNotification('Error loading data. Please refresh the page.', 'error');
  } finally {
    showLoading(false);
  }
}

// Show/hide loading indicator
function showLoading(show) {
  document.getElementById('loadingIndicator').style.display = show ? 'block' : 'none';
}

// Show notification
function showNotification(message, type = 'info') {
  const notificationArea = document.getElementById('notificationArea');
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  notificationArea.appendChild(notification);
  
  // Show notification
  setTimeout(() => {
    notification.classList.add('show');
  }, 100);
  
  // Hide after 5 seconds
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 5000);
}

// Check online/offline status
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

function updateOnlineStatus() {
  const offlineIndicator = document.getElementById('offlineIndicator');
  if (!navigator.onLine) {
    offlineIndicator.style.display = 'block';
    showNotification('You are now offline. The app will continue to work.', 'info');
  } else {
    offlineIndicator.style.display = 'none';
    showNotification('Connection restored.', 'success');
  }
}

// Initialize online status
updateOnlineStatus();

// Save Facility Name
document.getElementById('facilityForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  facilityName = document.getElementById('facilityName').value;
  
  try {
    await db.facility.put({ 
      id: 1, 
      name: facilityName,
      updatedAt: new Date()
    });
    showNotification('Facility name saved successfully!', 'success');
  } catch (error) {
    console.error('Error saving facility name:', error);
    showNotification('Error saving facility name. Please try again.', 'error');
  }
});

// Vaccination Schedule
const vaccinationSchedule = [
  "BCG at Birth",
  "OPV0 at Birth",
  "Hepatitis B at Birth",
  "OPV1 at 6 weeks",
  "Penta1 at 6 weeks",
  "PCV1 at 6 weeks",
  "Rotavirus1 at 6 weeks",
  "OPV2 at 10 weeks",
  "Penta2 at 10 weeks",
  "PCV2 at 10 weeks",
  "Rotavirus2 at 10 weeks",
  "OPV3 at 14 weeks",
  "Penta3 at 14 weeks",
  "PCV3 at 14 weeks",
  "Rotavirus3 at 14 weeks",
  "IPV1 at 14 weeks",
  "Malaria1 at 6 months",
  "Malaria2 at 7 months",
  "IPV2 at 7 months",
  "Malaria3 at 9 months",
  "Measles Rubella1 at 9 months",
  "Malaria4 at 18 months",
  "Measles Rubella2 at 18 months",
  "Men A at 18 months",
  "Vitamin A at 6 months",
  "Vitamin A at 12 months",
  "Vitamin A at 18 months",
  "Vitamin A at 24 months",
  "Vitamin A at 30 months",
  "Vitamin A at 36 months",
  "Vitamin A at 42 months",
  "Vitamin A at 48 months",
  "Vitamin A at 54 months",
  "Vitamin A at 60 months"
];

// Generate unique registration number
function generateRegNo() {
  const year = new Date().getFullYear();
  let count = children.filter(child => {
    const childYear = new Date(child.createdAt || new Date()).getFullYear();
    return childYear === year;
  }).length + 1;
  
  let regNo = `${String(count).padStart(3, '0')}/${year}`;

  // Ensure the registration number is unique
  while (children.some(child => child.regNo === regNo)) {
    count++;
    regNo = `${String(count).padStart(3, '0')}/${year}`;
  }

  return regNo;
}

// Register child
document.getElementById('registrationForm').addEventListener('submit', async function (e) {
  e.preventDefault();

  const childName = document.getElementById('childName').value.trim();
  const dob = document.getElementById('dob').value;
  const today = new Date();

  // Check if child already exists
  if (children.some(child => child.name.toLowerCase() === childName.toLowerCase())) {
    showNotification('Child already registered.', 'error');
    return;
  }

  if (new Date(dob) > today) {
    showNotification('Date of Birth cannot be in the future.', 'error');
    return;
  }

  try {
    const childId = await db.children.add({
      regNo: generateRegNo(),
      name: childName,
      dob: dob,
      sex: document.getElementById('sex').value,
      address: document.getElementById('address').value,
      contact: document.getElementById('contact').value,
      isDefaulter: false,
      createdAt: new Date()
    });

    // Add the new child to the local array
    const newChild = {
      id: childId,
      regNo: generateRegNo(),
      name: childName,
      dob: dob,
      sex: document.getElementById('sex').value,
      address: document.getElementById('address').value,
      contact: document.getElementById('contact').value,
      isDefaulter: false,
      vaccinations: [],
      createdAt: new Date()
    };
    
    children.unshift(newChild);
    
    updateChildTable();
    updateStats();
    this.reset();
    showNotification('Child registered successfully!', 'success');
    
    // Scroll to show the new entry
    scrollToSection('childHealthRegister');
  } catch (error) {
    console.error('Error registering child:', error);
    showNotification('Error registering child. Please try again.', 'error');
  }
});

// Update Child Table
function updateChildTable(filteredChildren = children) {
  const tbody = document.querySelector('#childTable tbody');
  tbody.innerHTML = '';

  if (filteredChildren.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">No children found</td></tr>';
    return;
  }

  filteredChildren.forEach((child, index) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${child.regNo}</td>
      <td>${child.name}</td>
      <td>${formatDate(child.dob)}</td>
      <td>${child.sex}</td>
      <td>${child.address}</td>
      <td>${child.contact || 'N/A'}</td>
      <td>
        <button onclick="openImmunizationModal(${index})">💉 Update</button>
        <button onclick="openEditChildModal(${index})">✏️ Edit</button>
        <button onclick="deleteChild(${index})" class="danger">🗑️ Delete</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

// Open Edit Child Modal
function openEditChildModal(index) {
  editChildIndex = index;
  const modal = document.getElementById('editChildModal');
  modal.style.display = 'flex';

  const child = children[index];
  document.getElementById('editChildName').value = child.name;
  document.getElementById('editDob').value = child.dob;
  document.getElementById('editSex').value = child.sex;
  document.getElementById('editAddress').value = child.address;
  document.getElementById('editContact').value = child.contact || '';
}

// Save Edited Child Details and close modal
async function saveEditedChild() {
  const child = children[editChildIndex];
  child.name = document.getElementById('editChildName').value.trim();
  child.dob = document.getElementById('editDob').value;
  child.sex = document.getElementById('editSex').value;
  child.address = document.getElementById('editAddress').value.trim();
  child.contact = document.getElementById('editContact').value.trim();

  try {
    await db.children.update(child.id, {
      name: child.name,
      dob: child.dob,
      sex: child.sex,
      address: child.address,
      contact: child.contact
    });
    
    updateChildTable();
    updateViewRecordsModal();
    closeEditChildModal();
    showNotification('Child details updated successfully!', 'success');
  } catch (error) {
    console.error('Error updating child:', error);
    showNotification('Error updating child details. Please try again.', 'error');
  }
}

// Close Edit Child Modal
function closeEditChildModal() {
  document.getElementById('editChildModal').style.display = 'none';
}

// Open Immunization Modal
function openImmunizationModal(index) {
  selectedChildIndex = index;
  const modal = document.getElementById('immunizationModal');
  modal.style.display = 'flex';

  const tbody = document.querySelector('#immunizationTable tbody');
  tbody.innerHTML = '';

  const child = children[index];
  const childKey = `${child.regNo}-${child.name}`;
  unsavedVaccinations[childKey] = unsavedVaccinations[childKey] || {};

  vaccinationSchedule.forEach(vaccine => {
    const existingVaccine = child.vaccinations.find(v => v.vaccine === vaccine);
    const unsavedDate = unsavedVaccinations[childKey][vaccine];

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${vaccine}</td>
      <td><input type="date" class="dateGiven" value="${unsavedDate || existingVaccine?.dateGiven || ''}" onchange="trackUnsavedDate(this, '${childKey}', '${vaccine}')"></td>
      <td><input type="text" class="batchNumber" value="${existingVaccine?.batchNumber || ''}" placeholder="Enter batch number"></td>
      <td><input type="text" class="placeGiven" value="${existingVaccine?.placeGiven || ''}" placeholder="Enter place given"></td>
      <td><input type="text" class="remarks" value="${existingVaccine?.remarks || ''}" placeholder="Enter remarks"></td>
      <td>${formatDate(existingVaccine?.nextVisit) || 'N/A'}</td>
    `;
    tbody.appendChild(row);
  });
}

// Track unsaved dates
function trackUnsavedDate(input, childKey, vaccine) {
  if (!unsavedVaccinations[childKey]) {
    unsavedVaccinations[childKey] = {};
  }
  unsavedVaccinations[childKey][vaccine] = input.value;
}

// Prompt to book next visit
function promptToBookNextVisit() {
  const confirmation = confirm('Do you want to book the next visit for this child?');
  if (confirmation) {
    openBookingModal();
  } else {
    saveImmunization(false); // Save without booking next visit
  }
}

// Open Booking Modal
function openBookingModal() {
  const modal = document.getElementById('bookingModal');
  modal.style.display = 'flex';

  const child = children[selectedChildIndex];
  const childKey = `${child.regNo}-${child.name}`;
  const vaccineSelection = document.getElementById('vaccineSelection');
  vaccineSelection.innerHTML = '';

  // Get vaccines that haven't been given yet (including checking unsaved dates)
  const givenVaccines = child.vaccinations
    .filter(v => v.dateGiven)
    .map(v => v.vaccine);
  
  // Also exclude vaccines with unsaved dates
  const unsavedDates = unsavedVaccinations[childKey] || {};
  const vaccinesWithUnsavedDates = Object.keys(unsavedDates).filter(v => unsavedDates[v]);
  
  // Get booked vaccines
  const bookedVaccines = child.vaccinations
    .filter(v => v.nextVisit && !v.dateGiven)
    .map(v => v.vaccine);
  
  // Available vaccines are those not given, not booked, and not having unsaved dates
  const availableVaccines = vaccinationSchedule.filter(v => 
    !givenVaccines.includes(v) && 
    !bookedVaccines.includes(v) &&
    !vaccinesWithUnsavedDates.includes(v)
  );

  if (availableVaccines.length === 0) {
    vaccineSelection.innerHTML = '<p>No vaccines available for booking.</p>';
    document.getElementById('nextVisitDate').disabled = true;
  } else {
    availableVaccines.forEach(vaccine => {
      const vaccineItem = document.createElement('div');
      vaccineItem.className = 'vaccine-item';
      vaccineItem.innerHTML = `
        <input type="checkbox" class="vaccine-checkbox" id="vaccine-${vaccine}" value="${vaccine}">
        <label for="vaccine-${vaccine}">${vaccine}</label>
      `;
      vaccineSelection.appendChild(vaccineItem);
    });
    document.getElementById('nextVisitDate').disabled = false;
    
    // Set default date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    document.getElementById('nextVisitDate').valueAsDate = tomorrow;
  }
}

// Close Booking Modal
function closeBookingModal() {
  const modal = document.getElementById('bookingModal');
  modal.style.display = 'none';
}

// Save Booking
function saveBooking() {
  const nextVisitDate = document.getElementById('nextVisitDate').value;
  if (!nextVisitDate) {
    showNotification('Please select a next visit date.', 'error');
    return;
  }

  const checkboxes = document.querySelectorAll('.vaccine-checkbox:checked');
  if (checkboxes.length === 0) {
    showNotification('Please select at least one vaccine for the next visit.', 'error');
    return;
  }

  // First save the immunization data without next visit dates
  saveImmunization(true, nextVisitDate, Array.from(checkboxes).map(cb => cb.value));
}

// Save Immunization Data
async function saveImmunization(bookNextVisit = false, nextVisitDate = null, nextVisitVaccines = []) {
  const child = children[selectedChildIndex];
  const childKey = `${child.regNo}-${child.name}`;
  const rows = document.querySelectorAll('#immunizationTable tbody tr');

  // Validate mandatory fields
  let isValid = true;
  rows.forEach(row => {
    const dateGiven = row.querySelector('.dateGiven').value;
    const batchNumber = row.querySelector('.batchNumber').value;
    const placeGiven = row.querySelector('.placeGiven').value;
    const remarks = row.querySelector('.remarks').value;

    if (dateGiven && (!batchNumber || !placeGiven || !remarks)) {
      isValid = false;
      showNotification('Batch Number, Place Given, and Remarks are mandatory when Date Given is selected.', 'error');
    }
  });

  if (!isValid) return;

  try {
    // Delete existing vaccinations for this child
    await db.vaccinations.where('childId').equals(child.id).delete();
    
    // Save all vaccination data
    const vaccinationPromises = [];
    rows.forEach(row => {
      const vaccine = row.cells[0].textContent;
      const dateGiven = row.querySelector('.dateGiven').value;
      const batchNumber = row.querySelector('.batchNumber').value;
      const placeGiven = row.querySelector('.placeGiven').value;
      const remarks = row.querySelector('.remarks').value;

      if (dateGiven || batchNumber || placeGiven || remarks) {
        vaccinationPromises.push(
          db.vaccinations.add({
            childId: child.id,
            vaccine,
            dateGiven,
            batchNumber,
            placeGiven,
            remarks,
            nextVisit: '', // We'll handle next visits separately
            status: dateGiven ? 'completed' : 'pending'
          })
        );
      }
    });

    // If booking next visit, add next visit dates to selected vaccines
    if (bookNextVisit && nextVisitDate && nextVisitVaccines.length > 0) {
      nextVisitVaccines.forEach(vaccine => {
        vaccinationPromises.push(
          db.vaccinations.add({
            childId: child.id,
            vaccine,
            dateGiven: '',
            batchNumber: '',
            placeGiven: '',
            remarks: '',
            nextVisit: nextVisitDate,
            status: 'scheduled'
          })
        );
      });
    }

    await Promise.all(vaccinationPromises);
    
    // Update the local child data
    child.vaccinations = await db.vaccinations.where('childId').equals(child.id).toArray();

    // Clear unsaved dates for this child
    if (unsavedVaccinations[childKey]) {
      delete unsavedVaccinations[childKey];
    }

    // Update defaulter status based on next visit dates
    updateDefaulterStatus(child);
    
    // Update child defaulter status in database
    await db.children.update(child.id, { isDefaulter: child.isDefaulter });
    
    closeModal();
    closeBookingModal();
    updateChildTable();
    updateStats();
    updateAllTables();
    showNotification('Immunization data saved successfully!', 'success');
  } catch (error) {
    console.error('Error saving immunization data:', error);
    showNotification('Error saving immunization data. Please try again.', 'error');
  }
}

// Update Defaulter Status
function updateDefaulterStatus(child) {
  const today = new Date();
  child.isDefaulter = child.vaccinations.some(vaccination => {
    if (!vaccination.nextVisit) return false;
    const nextVisitDate = new Date(vaccination.nextVisit);
    return nextVisitDate < today;
  });
}

// Close Modal
function closeModal() {
  const modal = document.getElementById('immunizationModal');
  modal.style.display = 'none';
}

// Close View Records Modal
function closeViewRecordsModal() {
  const modal = document.getElementById('viewRecordsModal');
  modal.style.display = 'none';
}

// Close Help Modal
function closeHelpModal() {
  const modal = document.getElementById('helpModal');
  modal.style.display = 'none';
}

// Close Today's Appointments Modal
function closeTodayAppointmentsModal() {
  const modal = document.getElementById('todayAppointmentsModal');
  modal.style.display = 'none';
}

// Delete Child
async function deleteChild(index) {
  if (confirm('Are you sure you want to delete this child and all their vaccination records?')) {
    const child = children[index];
    
    try {
      // Delete child and associated vaccinations
      await db.transaction('rw', db.children, db.vaccinations, async () => {
        await db.vaccinations.where('childId').equals(child.id).delete();
        await db.children.delete(child.id);
      });
      
      children.splice(index, 1);
      updateChildTable();
      updateViewRecordsModal();
      updateStats();
      updateAllTables();
      showNotification('Child deleted successfully.', 'success');
    } catch (error) {
      console.error('Error deleting child:', error);
      showNotification('Error deleting child. Please try again.', 'error');
    }
  }
}

// Filter Children
function filterChildren() {
  const searchTerm = document.getElementById('search').value.toLowerCase();
  const filteredChildren = children.filter(child =>
    child.name.toLowerCase().includes(searchTerm) || child.regNo.includes(searchTerm)
  );
  updateChildTable(filteredChildren);
}

// Export to CSV
function exportToCSV() {
  const headers = ["Reg No.", "Name", "Vaccine", "Date Given", "Next Visit", "Status"];
  const data = [];

  // Add all vaccination records to CSV
  children.forEach(child => {
    child.vaccinations.forEach(vaccination => {
      const today = new Date();
      let status = 'Upcoming';
      
      if (vaccination.dateGiven) {
        status = 'Completed';
      } else if (vaccination.nextVisit) {
        const nextVisitDate = new Date(vaccination.nextVisit);
        if (nextVisitDate < today) {
          const daysOverdue = Math.floor((today - nextVisitDate) / (1000 * 60 * 60 * 24));
          status = `Overdue (${daysOverdue} days)`;
        } else {
          const daysUntil = Math.ceil((nextVisitDate - today) / (1000 * 60 * 60 * 24));
          status = `Due in ${daysUntil} days`;
        }
      }

      data.push([
        child.regNo,
        child.name,
        vaccination.vaccine,
        formatDate(vaccination.dateGiven) || 'N/A',
        formatDate(vaccination.nextVisit) || 'N/A',
        status
      ]);
    });
  });

  const csvContent = "data:text/csv;charset=utf-8," +
    [headers, ...data].map(row => row.join(",")).join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `immunization_records_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  showNotification('CSV exported successfully!', 'success');
}

// Print Records
function printRecords() {
  window.print();
}

// Backup Data
async function backupData() {
  try {
    const allData = {
      children: await db.children.toArray(),
      vaccinations: await db.vaccinations.toArray(),
      facility: await db.facility.toArray(),
      backupDate: new Date().toISOString()
    };
    
    const data = JSON.stringify(allData, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `immunization_backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showNotification('Backup downloaded successfully!', 'success');
  } catch (error) {
    console.error('Error creating backup:', error);
    showNotification('Error creating backup. Please try again.', 'error');
  }
}

// Restore Data
document.getElementById('restoreFile').addEventListener('change', async function (e) {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = async function (event) {
      try {
        const data = JSON.parse(event.target.result);
        
        if (!data.children || !data.vaccinations) {
          throw new Error('Invalid backup file format');
        }
        
        if (!confirm(`This will replace all current data with backup data from ${data.backupDate ? new Date(data.backupDate).toLocaleDateString() : 'unknown date'}. Continue?`)) {
          return;
        }
        
        // Clear existing data
        await db.transaction('rw', db.children, db.vaccinations, db.facility, async () => {
          await db.children.clear();
          await db.vaccinations.clear();
          await db.facility.clear();
          
          // Import new data
          if (data.children) await db.children.bulkAdd(data.children);
          if (data.vaccinations) await db.vaccinations.bulkAdd(data.vaccinations);
          if (data.facility) await db.facility.bulkAdd(data.facility);
        });
        
        // Reload the app
        await initApp();
        showNotification('Data restored successfully!', 'success');
      } catch (error) {
        console.error('Error restoring data:', error);
        showNotification('Invalid backup file. Please upload a valid JSON file.', 'error');
      }
    };
    reader.readAsText(file);
  }
});

// Clear All Data
async function clearAllData() {
  if (confirm('Are you sure you want to clear ALL data? This cannot be undone and will delete all children and vaccination records.')) {
    try {
      await db.transaction('rw', db.children, db.vaccinations, db.facility, async () => {
        await db.children.clear();
        await db.vaccinations.clear();
        await db.facility.clear();
      });
      
      children = [];
      facilityName = '';
      document.getElementById('facilityName').value = '';
      updateChildTable();
      updateStats();
      updateAllTables();
      showNotification('All data has been cleared.', 'success');
    } catch (error) {
      console.error('Error clearing data:', error);
      showNotification('Error clearing data. Please try again.', 'error');
    }
  }
}

// Open Help Modal
function openHelpModal() {
  document.getElementById('helpModal').style.display = 'flex';
}

// Show Today's Appointments
async function showTodayAppointments() {
  const modal = document.getElementById('todayAppointmentsModal');
  modal.style.display = 'flex';
  
  const today = new Date().toISOString().split('T')[0];
  const tbody = document.querySelector('#todayAppointmentsTable tbody');
  tbody.innerHTML = '';
  
  let hasAppointments = false;
  
  for (const child of children) {
    const todayVaccinations = child.vaccinations.filter(v => 
      v.nextVisit && v.nextVisit.split('T')[0] === today
    );
    
    if (todayVaccinations.length > 0) {
      hasAppointments = true;
      todayVaccinations.forEach(vaccination => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${child.regNo}</td>
          <td>${child.name}</td>
          <td>${vaccination.vaccine}</td>
          <td>${child.contact || 'N/A'}</td>
          <td><button onclick="openImmunizationModal(${children.indexOf(child)})">Update</button></td>
        `;
        tbody.appendChild(row);
      });
    }
  }
  
  if (!hasAppointments) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No appointments scheduled for today</td></tr>';
  }
}

// View All Records
document.getElementById('viewAll').addEventListener('click', () => {
  const modal = document.getElementById('viewRecordsModal');
  modal.style.display = 'flex';

  const select = document.getElementById('selectChildren');
  select.innerHTML = children.map((child, index) => `
    <option value="${index}">${child.regNo} - ${child.name}</option>
  `).join('');
});

// View Selected Children Records
function viewSelectedChildrenRecords() {
  const select = document.getElementById('selectChildren');
  const selectedIndices = Array.from(select.selectedOptions).map(option => option.value);

  const tbody = document.querySelector('#viewRecordsTable tbody');
  tbody.innerHTML = '';

  if (selectedIndices.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center;">Please select at least one child</td></tr>';
    return;
  }

  selectedIndices.forEach(index => {
    const child = children[index];
    const firstRow = document.createElement('tr');
    firstRow.innerHTML = `
      <td>${child.regNo}</td>
      <td>${child.name}</td>
      <td colspan="7"></td>
    `;
    tbody.appendChild(firstRow);

    child.vaccinations.forEach(vaccination => {
      const today = new Date();
      let status = 'Upcoming';
      let rowClass = '';
      
      if (vaccination.dateGiven) {
        status = 'Completed';
      } else if (vaccination.nextVisit) {
        const nextVisitDate = new Date(vaccination.nextVisit);
        if (nextVisitDate < today) {
          const daysOverdue = Math.floor((today - nextVisitDate) / (1000 * 60 * 60 * 24));
          status = `Overdue (${daysOverdue} days)`;
          rowClass = 'highlight-red';
        } else {
          const daysUntil = Math.ceil((nextVisitDate - today) / (1000 * 60 * 60 * 24));
          if (daysUntil <= 7) {
            status = `Due in ${daysUntil} days`;
            rowClass = 'highlight-yellow';
          } else {
            status = `Due in ${daysUntil} days`;
          }
        }
      }

      const row = document.createElement('tr');
      if (rowClass) row.className = rowClass;
      row.innerHTML = `
        <td></td>
        <td></td>
        <td>${vaccination.vaccine}</td>
        <td>${formatDate(vaccination.dateGiven) || 'N/A'}</td>
        <td>${vaccination.batchNumber || 'N/A'}</td>
        <td>${vaccination.placeGiven || 'N/A'}</td>
        <td>${vaccination.remarks || 'N/A'}</td>
        <td>${formatDate(vaccination.nextVisit) || 'N/A'}</td>
        <td>${status}</td>
      `;
      tbody.appendChild(row);
    });
  });
}

// Format date to DD/MM/YYYY
function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

// Update All Tables
function updateAllTables() {
  updateAllRecordsTable();
  updateDefaultersTable();
  updateDueSoonTable();
  updateUpcomingTable();
}

// Update All Records Table - Now shows each child only once with summary info
function updateAllRecordsTable() {
  const tbody = document.querySelector('#allRecordsTable tbody');
  tbody.innerHTML = '';

  if (children.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">No children registered</td></tr>';
    return;
  }

  children.forEach((child, index) => {
    const today = new Date();
    
    // Get completed vaccines
    const completedVaccines = child.vaccinations
      .filter(v => v.dateGiven)
      .map(v => v.vaccine.split(' at ')[0])
      .join(', ');
    
    // Get booked vaccines with next visit dates
    const bookedVaccines = child.vaccinations
      .filter(v => v.nextVisit && !v.dateGiven)
      .map(v => ({
        vaccine: v.vaccine.split(' at ')[0],
        nextVisit: v.nextVisit
      }));
    
    // Find the earliest next visit date
    const nextVisitDates = bookedVaccines.map(v => new Date(v.nextVisit));
    const earliestNextVisit = nextVisitDates.length > 0 ? 
      new Date(Math.min(...nextVisitDates)) : null;
    
    // Determine status
    let status = 'Up to date';
    let rowClass = '';
    
    if (bookedVaccines.length > 0) {
      if (earliestNextVisit < today) {
        const daysOverdue = Math.floor((today - earliestNextVisit) / (1000 * 60 * 60 * 24));
        status = `Overdue (${daysOverdue} days)`;
        rowClass = 'highlight-red';
      } else {
        const daysUntil = Math.ceil((earliestNextVisit - today) / (1000 * 60 * 60 * 24));
        if (daysUntil <= 7) {
          status = `Due in ${daysUntil} days`;
          rowClass = 'highlight-yellow';
        } else {
          status = `Due in ${daysUntil} days`;
        }
      }
    }

    const row = document.createElement('tr');
    if (rowClass) row.className = rowClass;
    row.innerHTML = `
      <td>${child.regNo}</td>
      <td>${child.name}</td>
      <td>${completedVaccines || 'None'}</td>
      <td>${bookedVaccines.map(v => `${v.vaccine}`).join(', ') || 'None'}</td>
      <td>${earliestNextVisit ? formatDate(earliestNextVisit) : 'N/A'}</td>
      <td>${status}</td>
      <td><button onclick="openImmunizationModal(${index})">Update</button></td>
    `;
    tbody.appendChild(row);
  });
}

// Update Defaulters Table - Now counts each child only once
function updateDefaultersTable() {
  const today = new Date();
  const defaultersList = [];
  const countedChildren = new Set(); // Track children we've already counted
  
  // Find all defaulters (children with missed Next Visit dates)
  children.forEach(child => {
    if (countedChildren.has(child.regNo)) return; // Skip if already counted
    
    const missedVaccines = child.vaccinations.filter(v => {
      if (v.nextVisit && !v.dateGiven) {
        const nextVisitDate = new Date(v.nextVisit);
        return nextVisitDate < today;
      }
      return false;
    });
    
    if (missedVaccines.length > 0) {
      countedChildren.add(child.regNo); // Mark this child as counted
      
      // Find the most overdue vaccine for this child
      const mostOverdue = missedVaccines.reduce((prev, current) => {
        const prevDate = new Date(prev.nextVisit);
        const currentDate = new Date(current.nextVisit);
        return prevDate < currentDate ? prev : current;
      });
      
      const nextVisitDate = new Date(mostOverdue.nextVisit);
      const daysOverdue = Math.floor((today - nextVisitDate) / (1000 * 60 * 60 * 24));
      
      defaultersList.push({
        child,
        vaccination: mostOverdue,
        daysOverdue
      });
    }
  });

  const tbody = document.querySelector('#defaultersTable tbody');
  tbody.innerHTML = defaultersList.map(defaulter => {
    return `
      <tr>
        <td>${defaulter.child.regNo}</td>
        <td>${defaulter.child.name}</td>
        <td>${defaulter.vaccination.vaccine.split(' at ')[0]}</td>
        <td class="highlight-red">${formatDate(defaulter.vaccination.nextVisit)}</td>
        <td class="highlight-red">${defaulter.daysOverdue}</td>
        <td><button onclick="openImmunizationModal(${children.indexOf(defaulter.child)})">Update</button></td>
      </tr>
    `;
  }).join('');

  if (defaultersList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No defaulters found</td></tr>';
  }
}

// Update Due Soon Table (7 days)
function updateDueSoonTable() {
  const today = new Date();
  const dueSoonList = [];
  const countedChildren = new Set(); // Track children we've already counted
  
  // Find all vaccines due in the next 7 days
  children.forEach(child => {
    if (countedChildren.has(child.regNo)) return; // Skip if already counted
    
    const dueSoonVaccines = child.vaccinations.filter(v => {
      if (v.nextVisit && !v.dateGiven) {
        const nextVisitDate = new Date(v.nextVisit);
        const daysUntil = Math.ceil((nextVisitDate - today) / (1000 * 60 * 60 * 24));
        return daysUntil > 0 && daysUntil <= 7;
      }
      return false;
    });
    
    if (dueSoonVaccines.length > 0) {
      countedChildren.add(child.regNo); // Mark this child as counted
      
      // Find the vaccine with the closest due date
      const closestDue = dueSoonVaccines.reduce((prev, current) => {
        const prevDate = new Date(prev.nextVisit);
        const currentDate = new Date(current.nextVisit);
        return prevDate < currentDate ? prev : current;
      });
      
      const nextVisitDate = new Date(closestDue.nextVisit);
      const daysUntil = Math.ceil((nextVisitDate - today) / (1000 * 60 * 60 * 24));
      
      dueSoonList.push({
        child,
        vaccination: closestDue,
        daysUntil
      });
    }
  });

  const tbody = document.querySelector('#dueSoonTable tbody');
  tbody.innerHTML = dueSoonList.map(item => {
    return `
      <tr>
        <td>${item.child.regNo}</td>
        <td>${item.child.name}</td>
        <td>${item.vaccination.vaccine.split(' at ')[0]}</td>
        <td class="highlight-yellow">${formatDate(item.vaccination.nextVisit)}</td>
        <td class="highlight-yellow">${item.daysUntil}</td>
        <td><button onclick="openImmunizationModal(${children.indexOf(item.child)})">Update</button></td>
      </tr>
    `;
  }).join('');

  if (dueSoonList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No vaccines due in the next 7 days</td></tr>';
  }
}

// Update Upcoming Table (30 days)
function updateUpcomingTable() {
  const today = new Date();
  const upcomingList = [];
  const countedChildren = new Set(); // Track children we've already counted
  
  // Find all vaccines due in the next 30 days (but more than 7 days)
  children.forEach(child => {
    if (countedChildren.has(child.regNo)) return; // Skip if already counted
    
    const upcomingVaccines = child.vaccinations.filter(v => {
      if (v.nextVisit && !v.dateGiven) {
        const nextVisitDate = new Date(v.nextVisit);
        const daysUntil = Math.ceil((nextVisitDate - today) / (1000 * 60 * 60 * 24));
        return daysUntil > 7 && daysUntil <= 30;
      }
      return false;
    });
    
    if (upcomingVaccines.length > 0) {
      countedChildren.add(child.regNo); // Mark this child as counted
      
      // Find the vaccine with the closest due date
      const closestDue = upcomingVaccines.reduce((prev, current) => {
        const prevDate = new Date(prev.nextVisit);
        const currentDate = new Date(current.nextVisit);
        return prevDate < currentDate ? prev : current;
      });
      
      const nextVisitDate = new Date(closestDue.nextVisit);
      const daysUntil = Math.ceil((nextVisitDate - today) / (1000 * 60 * 60 * 24));
      
      upcomingList.push({
        child,
        vaccination: closestDue,
        daysUntil
      });
    }
  });

  const tbody = document.querySelector('#upcomingTable tbody');
  tbody.innerHTML = upcomingList.map(item => {
    return `
      <tr>
        <td>${item.child.regNo}</td>
        <td>${item.child.name}</td>
        <td>${item.vaccination.vaccine.split(' at ')[0]}</td>
        <td>${formatDate(item.vaccination.nextVisit)}</td>
        <td>${item.daysUntil}</td>
        <td><button onclick="openImmunizationModal(${children.indexOf(item.child)})">Update</button></td>
      </tr>
    `;
  }).join('');

  if (upcomingList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No vaccines due in the next 30 days</td></tr>';
  }
}

// Update Stats - Now counts each child only once
function updateStats() {
  const today = new Date();
  let defaulterCount = 0;
  let dueSoonCount = 0;
  let upcomingCount = 0;
  const countedDefaulters = new Set();
  const countedDueSoon = new Set();
  const countedUpcoming = new Set();
  
  children.forEach(child => {
    let isDefaulter = false;
    let isDueSoon = false;
    let isUpcoming = false;
    
    child.vaccinations.forEach(vaccination => {
      if (vaccination.nextVisit && !vaccination.dateGiven) {
        const nextVisitDate = new Date(vaccination.nextVisit);
        if (nextVisitDate < today) {
          isDefaulter = true;
        } else {
          const daysUntil = Math.ceil((nextVisitDate - today) / (1000 * 60 * 60 * 24));
          if (daysUntil <= 7) {
            isDueSoon = true;
          } else if (daysUntil <= 30) {
            isUpcoming = true;
          }
        }
      }
    });
    
    if (isDefaulter) defaulterCount++;
    if (isDueSoon) dueSoonCount++;
    if (isUpcoming) upcomingCount++;
  });
  
  document.getElementById('totalChildren').textContent = children.length;
  document.getElementById('totalDefaulters').textContent = defaulterCount;
  document.getElementById('totalDueSoon').textContent = dueSoonCount;
  document.getElementById('totalUpcoming').textContent = upcomingCount;
}

// Tab Navigation
function openTab(tabId) {
  // Hide all tab contents
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // Deactivate all tab buttons
  document.querySelectorAll('.tab-button').forEach(button => {
    button.classList.remove('active');
  });
  
  // Activate the selected tab
  document.getElementById(tabId).classList.add('active');
  
  // Activate the button for the selected tab
  event.currentTarget.classList.add('active');
}

// Scroll to section
function scrollToSection(sectionId) {
  document.getElementById(sectionId).scrollIntoView({ 
    behavior: 'smooth',
    block: 'start'
  });
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', initApp);