// Enhanced Database Schema with Security Questions
const db = new Dexie('ImmunizationTrackerMultiFacility');
db.version(5).stores({
  facilities: '++id, code, name, password, region, district, createdAt, securityQuestions',
  children: '++id, regNo, name, dob, sex, address, contact, isDefaulter, createdAt, facilityId',
  vaccinations: '++id, childId, vaccine, dateGiven, batchNumber, placeGiven, remarks, nextVisit, status, facilityId',
  settings: 'id, value',
  backups: '++id, date, data, facilityId',
  sessions: '++id, facilityId, loggedInAt',
  passwordRecovery: '++id, facilityId, attempts, lastAttempt'
});

// Global variables for password recovery
let recoveryFacility = null;
let recoveryStep = 1;

// Show Forgot Password Form
function showForgotPasswordForm() {
  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('newFacilityForm').style.display = 'none';
  document.getElementById('forgotPasswordForm').style.display = 'block';
  
  // Reset recovery process
  recoveryFacility = null;
  recoveryStep = 1;
  showRecoveryStep(1);
}

// Show recovery step
function showRecoveryStep(step) {
  // Hide all steps
  document.querySelectorAll('.recovery-step').forEach(stepEl => {
    stepEl.classList.remove('active');
  });
  
  // Show current step
  document.getElementById(`step${step}`).classList.add('active');
  recoveryStep = step;
}

// Verify Facility for Recovery
async function verifyFacilityForRecovery() {
  const facilityCode = document.getElementById('recoveryFacilityCode').value.trim().toUpperCase();
  
  if (!facilityCode) {
    showNotification('Please enter your facility code.', 'error');
    return;
  }
  
  try {
    const facility = await db.facilities.where('code').equals(facilityCode).first();
    
    if (!facility) {
      showNotification('Facility not found. Please check your facility code.', 'error');
      return;
    }
    
    // Check if facility has security questions set up
    if (!facility.securityQuestions || facility.securityQuestions.length === 0) {
      showNotification('This facility does not have security questions set up. Please contact system administrator.', 'error');
      return;
    }
    
    recoveryFacility = facility;
    loadSecurityQuestions();
    showRecoveryStep(2);
    showNotification('Facility verified. Please answer your security questions.', 'success');
    
  } catch (error) {
    console.error('Error verifying facility:', error);
    showNotification('Error verifying facility. Please try again.', 'error');
  }
}

// Load Security Questions for Recovery
function loadSecurityQuestions() {
  const container = document.getElementById('securityQuestionsContainer');
  container.innerHTML = '';
  
  if (!recoveryFacility.securityQuestions) return;
  
  recoveryFacility.securityQuestions.forEach((question, index) => {
    const questionHtml = `
      <div class="security-question-item">
        <div class="question-text">${index + 1}. ${question.question}</div>
        <input type="text" 
               id="securityAnswerRecovery${index}" 
               placeholder="Your answer" 
               required
               data-correct-answer="${question.answer.toLowerCase()}">
      </div>
    `;
    container.innerHTML += questionHtml;
  });
}

// Verify Security Answers
function verifySecurityAnswers() {
  if (!recoveryFacility.securityQuestions) return;
  
  let allCorrect = true;
  
  recoveryFacility.securityQuestions.forEach((question, index) => {
    const userAnswer = document.getElementById(`securityAnswerRecovery${index}`).value.trim().toLowerCase();
    const correctAnswer = question.answer.toLowerCase();
    
    if (userAnswer !== correctAnswer) {
      allCorrect = false;
      document.getElementById(`securityAnswerRecovery${index}`).style.borderColor = '#dc3545';
    } else {
      document.getElementById(`securityAnswerRecovery${index}`).style.borderColor = '#28a745';
    }
  });
  
  if (allCorrect) {
    showRecoveryStep(3);
    showNotification('Security questions answered correctly! You can now reset your password.', 'success');
  } else {
    showNotification('Some answers are incorrect. Please try again.', 'error');
  }
}

// Reset Password
async function resetPassword() {
  const newPassword = document.getElementById('newPasswordRecovery').value;
  const confirmPassword = document.getElementById('confirmPasswordRecovery').value;
  
  if (!newPassword || !confirmPassword) {
    showNotification('Please fill in all password fields.', 'error');
    return;
  }
  
  if (newPassword.length < 4) {
    showNotification('Password must be at least 4 characters long.', 'error');
    return;
  }
  
  if (newPassword !== confirmPassword) {
    showNotification('Passwords do not match.', 'error');
    return;
  }
  
  try {
    // Update facility password
    await db.facilities.update(recoveryFacility.id, {
      password: newPassword
    });
    
    // Show success message
    const step3 = document.getElementById('step3');
    step3.innerHTML = `
      <div class="success-message">
        <h4>✅ Password Reset Successful!</h4>
        <p>Your password has been reset successfully. You can now login with your new password.</p>
        <button onclick="showLoginForm()" class="login-btn" style="margin-top: 15px;">
          🔐 Back to Login
        </button>
      </div>
    `;
    
    showNotification('Password reset successfully!', 'success');
    
  } catch (error) {
    console.error('Error resetting password:', error);
    showNotification('Error resetting password. Please try again.', 'error');
  }
}

// MODIFIED: New Facility Registration (now includes security questions)
document.getElementById('newFacilityForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  
  const name = document.getElementById('newFacilityName').value.trim();
  const code = document.getElementById('newFacilityCode').value.trim().toUpperCase();
  const password = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  const region = document.getElementById('facilityRegion').value.trim();
  const district = document.getElementById('facilityDistrict').value.trim();
  const question1 = document.getElementById('securityQuestion1').value;
  const answer1 = document.getElementById('securityAnswer1').value.trim();
  const question2 = document.getElementById('securityQuestion2').value;
  const answer2 = document.getElementById('securityAnswer2').value.trim();
  
  // Validation
  if (password !== confirmPassword) {
    showNotification('Passwords do not match.', 'error');
    return;
  }
  
  if (password.length < 4) {
    showNotification('Password must be at least 4 characters long.', 'error');
    return;
  }
  
  if (!question1 || !answer1 || !question2 || !answer2) {
    showNotification('Please complete all security questions.', 'error');
    return;
  }
  
  try {
    // Check if facility code already exists
    const existingFacility = await db.facilities.where('code').equals(code).first();
    if (existingFacility) {
      showNotification('Facility code already exists. Please choose a different code.', 'error');
      return;
    }
    
    // Create security questions array
    const securityQuestions = [
      { question: question1, answer: answer1 },
      { question: question2, answer: answer2 }
    ];
    
    // Create new facility
    const facilityId = await db.facilities.add({
      code: code,
      name: name,
      password: password,
      region: region,
      district: district,
      securityQuestions: securityQuestions,
      createdAt: new Date()
    });
    
    currentFacility = await db.facilities.get(facilityId);
    
    // Create session
    await db.sessions.add({
      facilityId: currentFacility.id,
      loggedInAt: new Date()
    });
    
    showMainApp();
    await loadFacilityData();
    showNotification('Facility registered successfully!', 'success');
    
  } catch (error) {
    console.error('Facility registration error:', error);
    showNotification('Registration failed. Please try again.', 'error');
  }
});

// Change Password Functionality
function showChangePasswordModal() {
  const modal = document.getElementById('changePasswordModal');
  modal.style.display = 'flex';
  
  // Clear form
  document.getElementById('currentPassword').value = '';
  document.getElementById('newPasswordChange').value = '';
  document.getElementById('confirmNewPassword').value = '';
}

function closeChangePasswordModal() {
  document.getElementById('changePasswordModal').style.display = 'none';
}

async function changePassword() {
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPasswordChange').value;
  const confirmNewPassword = document.getElementById('confirmNewPassword').value;
  
  if (!currentPassword || !newPassword || !confirmNewPassword) {
    showNotification('Please fill in all password fields.', 'error');
    return;
  }
  
  if (newPassword.length < 4) {
    showNotification('New password must be at least 4 characters long.', 'error');
    return;
  }
  
  if (newPassword !== confirmNewPassword) {
    showNotification('New passwords do not match.', 'error');
    return;
  }
  
  // Verify current password
  if (currentPassword !== currentFacility.password) {
    showNotification('Current password is incorrect.', 'error');
    return;
  }
  
  try {
    // Update password
    await db.facilities.update(currentFacility.id, {
      password: newPassword
    });
    
    // Update current facility object
    currentFacility.password = newPassword;
    
    closeChangePasswordModal();
    showNotification('Password changed successfully!', 'success');
    
  } catch (error) {
    console.error('Error changing password:', error);
    showNotification('Error changing password. Please try again.', 'error');
  }
}

// Password Strength Checker (Optional Enhancement)
function checkPasswordStrength(password) {
  let strength = 0;
  
  if (password.length >= 8) strength++;
  if (password.match(/[a-z]/) && password.match(/[A-Z]/)) strength++;
  if (password.match(/\d/)) strength++;
  if (password.match(/[^a-zA-Z\d]/)) strength++;
  
  return strength;
}

function updatePasswordStrength() {
  const password = document.getElementById('newPasswordChange').value;
  const strength = checkPasswordStrength(password);
  const strengthBar = document.getElementById('passwordStrength');
  const strengthText = document.getElementById('passwordStrengthText');
  
  if (!strengthBar) return;
  
  strengthBar.className = 'password-strength';
  let strengthClass = '';
  let text = '';
  
  if (strength === 0) {
    text = '';
  } else if (strength <= 2) {
    strengthClass = 'strength-weak';
    text = 'Weak';
  } else if (strength === 3) {
    strengthClass = 'strength-medium';
    text = 'Medium';
  } else {
    strengthClass = 'strength-strong';
    text = 'Strong';
  }
  
  strengthBar.innerHTML = `<div class="${strengthClass}"></div>`;
  strengthText.textContent = text;
}

// Add password strength indicator to change password form (optional)
// You can add this to the change password modal HTML if desired

// Enhanced Demo Login with Security Questions
async function showDemoLogin() {
  // Check if demo facility exists
  let demoFacility = await db.facilities.where('code').equals('DEMO001').first();
  
  if (!demoFacility) {
    // Create demo facility with security questions
    const demoId = await db.facilities.add({
      code: 'DEMO001',
      name: 'Demo Health Center',
      password: 'demo123',
      region: 'Greater Accra',
      district: 'Accra Metro',
      securityQuestions: [
        { question: 'What is your favorite color?', answer: 'blue' },
        { question: 'What is your favorite food?', answer: 'rice' }
      ],
      createdAt: new Date()
    });
    demoFacility = await db.facilities.get(demoId);
  }
  
  document.getElementById('facilityCode').value = 'DEMO001';
  document.getElementById('password').value = 'demo123';
  showNotification('Demo credentials filled. Click Login to continue.', 'info');
}

// MODIFIED: Initialize app with enhanced security
async function initApp() {
  showLoading(true);
  
  try {
    // Check if user is logged in
    const session = await db.sessions.orderBy('loggedInAt').reverse().first();
    
    if (session) {
      currentFacility = await db.facilities.get(session.facilityId);
      if (currentFacility) {
        showMainApp();
        await loadFacilityData();
        return;
      }
    }
    
    // If no session or facility found, show login
    showLoginScreen();
    
  } catch (error) {
    console.error('Error initializing app:', error);
    showLoginScreen();
  } finally {
    showLoading(false);
  }
}

// ... REST OF THE EXISTING FUNCTIONS REMAIN UNCHANGED ...