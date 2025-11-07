import { 
  auth, 
  onAuthStateChanged, 
  db,
  doc,
  getDoc,
  setDoc,
  updateDoc, 
  sendEmailVerification,
  sendPasswordResetEmail
} from './firebase-init.js';

import { 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from './firebase-auth.js';

document.addEventListener('DOMContentLoaded', () => {

  // --- Global var for current user ---
  let currentUserId = null;
  let userDocRef = null;
  let localHelpingHands = 0; 

  // --- Auth DOM Elements ---
  const loginView = document.getElementById('login-view');
  const appView = document.getElementById('app-view');
  const verifyView = document.getElementById('verify-view');
  const forgotView = document.getElementById('forgot-view');
  const userEmailDisplay = document.getElementById('user-email');

  // Auth Errors/Messages
  const errorMessage = document.getElementById('error-message');
  const verifyMessage = document.getElementById('verify-message');
  const forgotMessage = document.getElementById('forgot-message');

  // Auth Inputs
  const emailInput = document.getElementById('login-email');
  const passInput = document.getElementById('login-pass');
  const passConfirmInput = document.getElementById('login-pass-confirm');
  const forgotEmailInput = document.getElementById('forgot-email');

  // Auth Buttons
  const btnLogin = document.getElementById('btn-login');
  const btnSignupSubmit = document.getElementById('btn-signup-submit');
  const btnLogout = document.getElementById('btn-logout');
  const btnLogoutVerify = document.getElementById('btn-logout-verify');
  const btnForgotSubmit = document.getElementById('btn-forgot-submit');
  const btnShowSignup = document.getElementById('btn-show-signup');
  const btnShowLogin = document.getElementById('btn-show-login');
  const btnShowForgot = document.getElementById('btn-show-forgot');
  const btnCancelForgot = document.getElementById('btn-back-to-login');
  const btnResend = document.getElementById('btn-resend');

  // Password validation elements
  const passLengthError = document.getElementById('pass-length-error');
  const passNumberError = document.getElementById('pass-number-error');
  const passSpecialError = document.getElementById('pass-special-error');
  const passMatchError = document.getElementById('pass-match-error');

  // --- Tracker DOM Elements ---
  const UNALLOWED_KEY = "unallowed_urls";
  const TRACKING_KEY = "time_tracking";
  let liveTimerInterval = null;

  const urlList = document.getElementById("urlList");
  const addUrlBtn = document.getElementById("addUrlBtn");
  const newUrlInput = document.getElementById("newUrl");
  const newLimitInput = document.getElementById("newLimit");
  const clearDataBtn = document.getElementById("clearData");
  
  const navBtnTracker = document.getElementById("nav-btn-tracker");
  const navBtnHands = document.getElementById("nav-btn-hands");
  const trackerView = document.getElementById("tracker-view");
  const handsView = document.getElementById("helping-hands-view");

  const handsDisplay = document.getElementById("hands-display");
  const handsInput = document.getElementById("hands-input");
  const btnAddHands = document.getElementById("btn-add-hands");
  const btnUseHands = document.getElementById("btn-use-hands");
  const handsMessage = document.getElementById("hands-message");

  // --- Edit Modal Elements ---
  const editModalBackdrop = document.getElementById("edit-modal-backdrop");
  const editModal = document.getElementById("edit-modal");
  const editModalUrl = document.getElementById("edit-modal-url");
  const editLimitInput = document.getElementById("edit-limit");
  const editModalCancel = document.getElementById("edit-modal-cancel");
  const editModalSave = document.getElementById("edit-modal-save");
  const editModalRemove = document.getElementById("edit-modal-remove");
  
  // --- Confirmation Modal Elements ---
  const confirmEditBackdrop = document.getElementById("confirm-edit-backdrop");
  const confirmEditModal = document.getElementById("confirm-edit-modal");
  const confirmEditUrl = document.getElementById("confirm-edit-url");
  const confirmEditCheckbox = document.getElementById("confirm-edit-checkbox");
  const confirmEditCancel = document.getElementById("confirm-edit-cancel");
  const confirmEditContinue = document.getElementById("confirm-edit-continue");


  // --- App Navigation Logic ---
  navBtnTracker.addEventListener('click', () => {
    trackerView.classList.remove('hidden');
    handsView.classList.add('hidden');
    navBtnTracker.classList.add('active');
    navBtnHands.classList.remove('active');
  });

  navBtnHands.addEventListener('click', () => {
    trackerView.classList.add('hidden');
    handsView.classList.remove('hidden');
    navBtnTracker.classList.remove('active');
    navBtnHands.classList.add('active');
    handsMessage.textContent = '';
  });


  // --- UI Mode Toggler ---
  function toggleMode(isSignUp) {
    passConfirmInput.classList.toggle('hidden', !isSignUp);
    document.querySelector('.validation-errors').classList.toggle('hidden', !isSignUp);
    
    btnLogin.classList.toggle('hidden', isSignUp);
    btnSignupSubmit.classList.toggle('hidden', !isSignUp);
    
    if (isSignUp) {
      document.getElementById('form-title').textContent = 'Sign Up';
      btnShowSignup.classList.add('hidden');
      btnShowLogin.classList.remove('hidden');
      btnSignupSubmit.disabled = true;
    } else {
      document.getElementById('form-title').textContent = 'Login';
      btnShowSignup.classList.remove('hidden');
      btnShowLogin.classList.add('hidden');
      btnSignupSubmit.disabled = false; // Not needed for login
    }
    passLengthError.classList.add('hidden');
    passNumberError.classList.add('hidden');
    passSpecialError.classList.add('hidden');
    passMatchError.classList.add('hidden');
  }
  btnShowSignup.addEventListener('click', () => toggleMode(true));
  btnShowLogin.addEventListener('click', () => toggleMode(false));

  btnShowForgot.addEventListener('click', () => {
    loginView.classList.add('hidden');
    forgotView.classList.remove('hidden');
    forgotMessage.textContent = '';
    errorMessage.textContent = '';
  });
  btnCancelForgot.addEventListener('click', () => {
    loginView.classList.remove('hidden');
    forgotView.classList.add('hidden');
    forgotMessage.textContent = '';
    errorMessage.textContent = '';
  });

  function handleEnterKey(event, buttonToClick) {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (!buttonToClick.disabled) {
        buttonToClick.click();
      }
    }
  }
  emailInput.addEventListener('keydown', (event) => {
    if (btnSignupSubmit.classList.contains('hidden')) {
      handleEnterKey(event, btnLogin);
    }
  });
  passInput.addEventListener('keydown', (event) => {
    if (btnSignupSubmit.classList.contains('hidden')) {
      handleEnterKey(event, btnLogin);
    }
  });
  passConfirmInput.addEventListener('keydown', (event) => {
    handleEnterKey(event, btnSignupSubmit);
  });
  forgotEmailInput.addEventListener('keydown', (event) => {
    handleEnterKey(event, btnForgotSubmit);
  });


  btnSignupSubmit.addEventListener('click', async () => {
    if (!validatePasswords()) {
      errorMessage.textContent = "Please fix the errors in your password.";
      return;
    }
    
    const email = emailInput.value;
    const password = passInput.value;
    errorMessage.textContent = '';

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      console.log("Creating user document for:", user.uid);
      const userDocRef = doc(db, "userSettings", user.uid);
      await setDoc(userDocRef, {
        email: user.email,
        unallowed_urls: [],
        time_tracking: {},
        helpingHands: 0,
        createdAt: new Date(),
        editHistory: [] 
      });
      
      await sendEmailVerification(user);
    } catch (error) {
      if (error.code === 'auth/email-already-in-use') {
        errorMessage.textContent = "An account with this email already exists. Please log in.";
      } else {
        errorMessage.textContent = error.message;
      }
    }
  });

  btnLogin.addEventListener('click', async () => {
    const email = emailInput.value;
    const password = passInput.value;
    errorMessage.textContent = '';

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      console.log("Login successful, performing full sync down...");
      const userDocRef = doc(db, "userSettings", userCredential.user.uid);
      const docSnap = await getDoc(userDocRef);
      if (docSnap.exists()) {
          const cloudData = docSnap.data();
          await chrome.storage.local.set({
            [UNALLOWED_KEY]: cloudData.unallowed_urls || [],
            [TRACKING_KEY]: cloudData.time_tracking || {}
          });
          localHelpingHands = cloudData.helpingHands || 0;
          console.log("Full sync down complete.");
      } else {
          console.warn("User document not found on login.");
      }
      
    } catch (error) {
       if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
        errorMessage.textContent = "Invalid email or password.";
      } else {
        errorMessage.textContent = error.message;
      }
    }
  });

  btnForgotSubmit.addEventListener('click', async () => {
    const email = forgotEmailInput.value;
    forgotMessage.textContent = 'Sending reset email...';
    try {
      await sendPasswordResetEmail(auth, email);
      forgotMessage.textContent = 'Password reset email sent! Check your inbox.';
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        forgotMessage.textContent = 'No account found with this email.';
      } else {
        forgotMessage.textContent = `Error: ${error.message}`;
      }
    }
  });

  btnResend.addEventListener('click', async () => {
    const user = auth.currentUser;
    if (user) {
      verifyMessage.textContent = 'Sending new verification email...';
      try {
        await sendEmailVerification(user);
        verifyMessage.textContent = 'New email sent! Please check your inbox.';
      } catch (error) {
        if (error.code === 'auth/too-many-requests') {
          verifyMessage.textContent = 'Error: Too many requests. Please wait a bit.';
        } else {
          verifyMessage.textContent = `Error: ${error.message}`;
        }
      }
    }
  });

  const handleLogout = async () => {
    if (liveTimerInterval) clearInterval(liveTimerInterval);
    if (userDocRef) { 
      try {
        console.log("Logout Sync: Syncing all data before logout...");
        const localData = await chrome.storage.local.get([UNALLOWED_KEY, TRACKING_KEY]);
        
        await setDoc(userDocRef, { 
          unallowed_urls: localData[UNALLOWED_KEY] || [],
          time_tracking: localData[TRACKING_KEY] || {},
          helpingHands: localHelpingHands
        }, { merge: true }); 
        
        console.log("Logout Sync: Complete.");
      } catch (error) {
        console.error("Logout Sync: Failed to sync data", error);
      }
    }
    
    try {
      await signOut(auth);
      await chrome.storage.local.set({
        [UNALLOWED_KEY]: [],
        [TRACKING_KEY]: {}
      });
      localHelpingHands = 0;
    } catch (error) {
      console.error("Logout error:", error.message);
      errorMessage.textContent = error.message;
    }
  };
  btnLogout.addEventListener('click', handleLogout);
  btnLogoutVerify.addEventListener('click', handleLogout);

  // --- Password Validation ---
  function validatePasswords() {
    const password = passInput.value;
    const confirm = passConfirmInput.value;
    const has8Chars = password.length >= 8;
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    const doMatch = password === confirm;

    passLengthError.classList.toggle('hidden', has8Chars);
    passNumberError.classList.toggle('hidden', hasNumber);
    passSpecialError.classList.toggle('hidden', hasSpecial);
    passMatchError.classList.toggle('hidden', doMatch);
    
    const allValid = has8Chars && hasNumber && hasSpecial && doMatch;
    btnSignupSubmit.disabled = !allValid;
    return allValid;
  }
  passInput.addEventListener('input', validatePasswords);
  passConfirmInput.addEventListener('input', validatePasswords);


  // ==========================================================
  // --- TIME TRACKER LOGIC ---
  // ==========================================================

  function formatTime(ms) {
    if (!ms || ms < 0) return "0s";
    const sec = Math.floor(ms / 1000);
    const min = Math.floor(sec / 60);
    const hr = Math.floor(min / 60);
    if (hr > 0) return `${hr}h ${min % 60}m`;
    if (min > 0) return `${min}m ${sec % 60}s`;
    return `${sec}s`;
  }
  function showError(message) { errorMessage.textContent = message; }
  function clearError() { errorMessage.textContent = ''; }

  async function renderBlockedList() {
    clearError();
    const data = await chrome.storage.local.get([UNALLOWED_KEY, TRACKING_KEY]);
    const urlsData = data[UNALLOWED_KEY] || []; 
    const tracking = data[TRACKING_KEY] || {};

    urlList.innerHTML = ""; 

    if (urlsData.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No tracked sites added yet.";
      urlList.appendChild(li);
      return;
    }

    urlsData.sort((a, b) => a.url.localeCompare(b.url));

    urlsData.forEach(item => {
      const li = document.createElement("li");
      const u = item.url;
      const limitMs = item.limit;
      const trackingData = tracking[u] || { time: 0 };
      const timeMs = trackingData.time;
      const time = formatTime(timeMs);

      const limitText = limitMs > 0 ? `${formatTime(limitMs)} daily` : `No limit`;

      li.innerHTML = `
        <strong id="domain-${u}">${u}</strong>
        <span class="time" id="time-${u}">Total: ${time}</span>
        <span class="limit">Limit: ${limitText}</span>
        <span class="session-time" id="session-${u}" style="display:none;"></span>
        <button data-url="${u}" data-limit-ms="${limitMs}" data-type="daily" class="editBtn" title="Edit">✏️</button>
      `;

      if (limitMs > 0 && timeMs > limitMs) {
        li.classList.add("over-limit");
      }
      urlList.appendChild(li);
    });

    // Re-attach listeners for .editBtn
    document.querySelectorAll(".editBtn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const url = e.currentTarget.dataset.url;
        const limitMs = e.currentTarget.dataset.limitMs;
        openConfirmEditModal(url, limitMs);
      });
    });
  }

  addUrlBtn.addEventListener("click", async () => {
    clearError(); 
    const urlValue = newUrlInput.value.trim();
    let finalUrl = urlValue.replace(/^https?:\/\//, '').replace(/\/.*$/, '');; 

    if (!finalUrl) {
      showError("Please enter a URL.");
      newUrlInput.focus();
      return;
    }

    const domainRegex = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i;
    try {
      if (urlValue.startsWith('http://') || urlValue.startsWith('https://')) {
        const parsedUrl = new URL(urlValue);
        finalUrl = parsedUrl.hostname.replace(/^www\./, '');
      } else if (!domainRegex.test(finalUrl)) {
        throw new Error("Invalid domain format");
      }
    } catch (error) {
      showError("Please enter a valid domain (e.g., youtube.com).");
      newUrlInput.focus();
      return;
    }

    const limitMins = parseInt(newLimitInput.value);
    let limitMs = 0;

    if (newLimitInput.value) { 
      if (isNaN(limitMins) || limitMins < 0) { // Allow 0
        showError("Time limit must be 0 or more minutes.");
        newLimitInput.focus();
        return;
      }
      limitMs = limitMins * 60 * 1000;
    } else {
      limitMs = 0; // No limit
    }
    
    const type = "daily"; 

    const data = await chrome.storage.local.get(UNALLOWED_KEY);
    const urlsData = data[UNALLOWED_KEY] || [];

    if (!urlsData.find(item => item.url === finalUrl)) {
      urlsData.push({
        url: finalUrl,
        limit: limitMs,
        type: type, // Stays as "daily"
        lastChanged: new Date().toISOString()
      });
      
      await chrome.storage.local.set({ [UNALLOWED_KEY]: urlsData });
      
      if (userDocRef) {
        const editLog = {
          edited: true,
          date: new Date().toISOString()
        };
        await logEditToFirebase(editLog);
        
        setDoc(userDocRef, { unallowed_urls: urlsData }, { merge: true })
            .then(() => console.log("Popup Sync Up: Added site"))
            .catch(err => console.error("Firebase sync error:", err));
      }

    } else {
      showError(`'${finalUrl}' is already in your tracked list.`);
      return;
    }

    newUrlInput.value = "";
    newLimitInput.value = "";
    renderBlockedList();
  });

  clearDataBtn.addEventListener("click", async () => {
    clearError(); 
    await chrome.storage.local.set({ [TRACKING_KEY]: {} });
    
    if (userDocRef) {
      setDoc(userDocRef, { time_tracking: {} }, { merge: true })
        .then(() => console.log("Popup Sync Up: Cleared time data"))
        .catch(err => console.error("Firebase sync error:", err));
    }
    
    renderBlockedList();
  });

  async function updateLiveTrackerUI() {
    if (liveTimerInterval) clearInterval(liveTimerInterval);

    chrome.runtime.sendMessage({ action: "getActiveTab" }, async (activeTab) => {
      if (!activeTab || !activeTab.domain) return;

      const data = await chrome.storage.local.get([UNALLOWED_KEY, TRACKING_KEY]);
      const urlsData = data[UNALLOWED_KEY] || [];
      const tracking = data[TRACKING_KEY] || {};
      const siteSettings = urlsData.find(item => item.url === activeTab.domain);
      
      if (!siteSettings) return;
      
      const limitMs = siteSettings.limit;
      const trackingData = tracking[activeTab.domain] || { time: 0 };
      const storedTime = trackingData.time;
      const sessionElement = document.getElementById(`session-${activeTab.domain}`);
      const totalElement = document.getElementById(`time-${activeTab.domain}`);
      const liElement = sessionElement ? sessionElement.parentElement : null;

      if (!sessionElement || !totalElement || !liElement) return;
      
      sessionElement.style.display = "inline";

      liveTimerInterval = setInterval(() => {
        const sessionDuration = new Date().getTime() - activeTab.startTime;
        const newTotalTime = storedTime + sessionDuration;
        
        sessionElement.textContent = `Current: ${formatTime(sessionDuration)}`;
        totalElement.textContent = `Total: ${formatTime(newTotalTime)}`;

        if (limitMs > 0 && newTotalTime > limitMs) {
          liElement.classList.add("over-limit");
        }
      }, 1000); 
    });
  }

  function initializeTrackerApp() {
    renderBlockedList();
    updateLiveTrackerUI(); 
    handsDisplay.textContent = localHelpingHands;
  }

  // ==========================================================
  // --- HELPING HANDS LOGIC ---
  // ==========================================================
  
  async function updateHelpingHands(amount) {
    handsMessage.textContent = '';
    const newTotal = localHelpingHands + amount;

    if (newTotal < 0) {
      handsMessage.textContent = "You don't have enough hands to use!";
      handsMessage.style.color = 'red';
      return false;
    }

    localHelpingHands = newTotal;
    handsDisplay.textContent = newTotal;

    if (userDocRef) {
      try {
        await updateDoc(userDocRef, { helpingHands: newTotal });
        handsMessage.textContent = `Successfully ${amount > 0 ? 'added' : 'used'} hands!`;
        handsMessage.style.color = 'green';
      } catch (err) {
        console.error("Firebase hands sync error:", err);
        handsMessage.textContent = 'Error: Could not sync. Please try again.';
        handsMessage.style.color = 'red';
        localHelpingHands -= amount;
        handsDisplay.textContent = localHelpingHands;
        return false;
      }
    }
    return true;
  }

  btnAddHands.addEventListener('click', () => {
    const amount = parseInt(handsInput.value);
    if (!amount || amount <= 0) {
      handsMessage.textContent = "Please enter a positive number to add.";
      handsMessage.style.color = 'red';
      return;
    }
    if (updateHelpingHands(amount)) {
      handsInput.value = '';
    }
  });

  btnUseHands.addEventListener('click', () => {
    const amount = parseInt(handsInput.value);
    if (!amount || amount <= 0) {
      handsMessage.textContent = "Please enter a positive number to use.";
      handsMessage.style.color = 'red';
      return;
    }
    if (updateHelpingHands(-amount)) {
      handsInput.value = '';
    }
  });

  // ==========================================================
  // --- EDIT/CONFIRMATION MODAL LOGIC ---
  // ==========================================================

  async function logEditToFirebase(logEntry) {
  if (!userDocRef) return;

  try {
    const docSnap = await getDoc(userDocRef);
    const currentHistory = docSnap.data()?.editHistory || [];

    if (currentHistory.length > 0) {
      currentHistory[currentHistory.length - 1] = logEntry;
    } else {
      currentHistory.push(logEntry);
    }

    await updateDoc(userDocRef, { editHistory: currentHistory });
  } catch (err) {
    console.error("Firebase edit log error:", err);
  }
}

  // --- Confirmation Modal ---
  function openConfirmEditModal(url, limitMs) { 
    confirmEditModal.dataset.url = url;
    confirmEditModal.dataset.limitMs = limitMs;
    
    confirmEditUrl.textContent = url;
    confirmEditCheckbox.checked = false;
    confirmEditContinue.disabled = true;

    confirmEditBackdrop.classList.remove('hidden');
    confirmEditModal.classList.remove('hidden');
  }

  function closeConfirmEditModal() {
    confirmEditBackdrop.classList.add('hidden');
    confirmEditModal.classList.add('hidden');
  }

  confirmEditCheckbox.addEventListener('change', () => {
    confirmEditContinue.disabled = !confirmEditCheckbox.checked;
  });

  confirmEditCancel.addEventListener('click', closeConfirmEditModal);

  confirmEditContinue.addEventListener('click', () => {
    // Get data from the confirmation modal
    const { url, limitMs } = confirmEditModal.dataset;

    closeConfirmEditModal();
    openEditModal(url, limitMs); 
  });
  
  // --- Edit Modal ---
  function openEditModal(url, limitMs) { 
    editModal.dataset.editingUrl = url;
    editModalUrl.textContent = url;
    editLimitInput.value = limitMs > 0 ? limitMs / 60000 : 0;

    editModalBackdrop.classList.remove('hidden');
    editModal.classList.remove('hidden');
  }

  function closeEditModal() {
    editModalBackdrop.classList.add('hidden');
    editModal.classList.add('hidden');
    editModal.dataset.editingUrl = '';
    errorMessage.textContent = '';
  }

  editModalCancel.addEventListener('click', closeEditModal);

  editModalSave.addEventListener('click', async () => {
    const url = editModal.dataset.editingUrl;
    if (!url) return;

    const limitMins = parseInt(editLimitInput.value);
    let limitMs = 0;

    if (editLimitInput.value) {
      if (isNaN(limitMins) || limitMins < 0) {
        showError("Limit must be 0 or more minutes.");
        return;
      }
      limitMs = limitMins * 60 * 1000;
    }
    
    const type = "daily"; 
    const lastChanged = new Date().toISOString();

    const data = await chrome.storage.local.get([UNALLOWED_KEY]);
    let urlsData = data[UNALLOWED_KEY] || [];
    
    const itemIndex = urlsData.findIndex(item => item.url === url);
    if (itemIndex > -1) {
      urlsData[itemIndex] = { url, limit: limitMs, type, lastChanged };
    } else {
      urlsData.push({ url, limit: limitMs, type, lastChanged });
    }

    await chrome.storage.local.set({ [UNALLOWED_KEY]: urlsData });

    if (userDocRef) {
      const editLog = {
        edited: true,
        date: lastChanged
      };
      await logEditToFirebase(editLog); 
      
      try {
        await setDoc(userDocRef, { unallowed_urls: urlsData }, { merge: true });
      } catch (err) {
        console.error("Firebase edit sync error:", err);
        showError("Failed to save changes to cloud.");
      }
    }

    closeEditModal();
    renderBlockedList();
  });

  editModalRemove.addEventListener('click', async () => {
    const urlToRemove = editModal.dataset.editingUrl;
    if (!urlToRemove) return;

    const data = await chrome.storage.local.get([UNALLOWED_KEY]);
    let urlsData = (data[UNALLOWED_KEY] || []).filter(item => item.url !== urlToRemove);
    await chrome.storage.local.set({ [UNALLOWED_KEY]: urlsData });
    
    if (userDocRef) {
      const editLog = {
        edited: true,
        date: new Date().toISOString()
      };
      await logEditToFirebase(editLog);
      
      // Now sync the settings array
      setDoc(userDocRef, { unallowed_urls: urlsData }, { merge: true })
        .then(() => console.log("Popup Sync Up: Removed site via modal"))
        .catch(err => console.error("Firebase sync error:", err));
    }
    
    closeEditModal();
    renderBlockedList();
  });


  // ==========================================================
  // --- CENTRAL AUTH STATE LISTENER (The "Controller") ---
  // ==========================================================

  const onTabActivated = () => {
    initializeTrackerApp(); 
  };
  const onTabUpdated = (tabId, changeInfo, tab) => {
    if (tab.active && (changeInfo.url || changeInfo.status === 'complete')) {
      initializeTrackerApp();
    }
  };


  onAuthStateChanged(auth, async (user) => {
    if (liveTimerInterval) clearInterval(liveTimerInterval); 

    if (user) {
      await user.reload(); 
      const freshUser = auth.currentUser; 

      if (freshUser.emailVerified) {
        // --- VERIFIED ---
        console.log("User verified, showing app");
        currentUserId = freshUser.uid;
        userDocRef = doc(db, "userSettings", currentUserId);

        console.log("Popup Open: Starting sync...");
        try {
          // 1. SYNC UP
          const localData = await chrome.storage.local.get([TRACKING_KEY]);
          await setDoc(userDocRef, {
            time_tracking: localData[TRACKING_KEY] || {}
          }, { merge: true });
          console.log("Popup Sync Up: Time data uploaded.");

          // 2. SYNC DOWN
          const docSnap = await getDoc(userDocRef);
          if (docSnap.exists()) {
            const cloudData = docSnap.data();
            await chrome.storage.local.set({
              [UNALLOWED_KEY]: cloudData.unallowed_urls || [],
              [TRACKING_KEY]: cloudData.time_tracking || {}
            });
            localHelpingHands = cloudData.helpingHands || 0;
            console.log("Popup Sync Down: All data overwritten by server.");
            
          } else {
            console.warn("User document not found.");
          }
        } catch (error) {
          console.error("Popup Sync Error:", error);
          errorMessage.textContent = "Failed to sync data. Please try again.";
        }
        
        // Show the app
        loginView.classList.add('hidden');
        verifyView.classList.add('hidden');
        forgotView.classList.add('hidden');
        appView.classList.remove('hidden');
        userEmailDisplay.textContent = freshUser.email;

        // START THE TRACKER APP
        initializeTrackerApp();

        // Add listeners for tab changes
        chrome.tabs.onActivated.removeListener(onTabActivated);
        chrome.tabs.onActivated.addListener(onTabActivated);
        
        chrome.tabs.onUpdated.removeListener(onTabUpdated);
        chrome.tabs.onUpdated.addListener(onTabUpdated);


      } else {
        // --- LOGGED IN, NOT VERIFIED ---
        console.log("User logged in but not verified");
        currentUserId = null;
        userDocRef = null;
        loginView.classList.add('hidden');
        verifyView.classList.remove('hidden');
        appView.classList.add('hidden');
        forgotView.classList.add('hidden');
      }
      
    } else {
      // --- LOGGED OUT ---
      console.log("User logged out");
      currentUserId = null;
      userDocRef = null;
      localHelpingHands = 0;
      loginView.classList.remove('hidden');
      verifyView.classList.add('hidden');
      appView.classList.add('hidden');
      forgotView.classList.add('hidden');
      userEmailDisplay.textContent = '';
      
      toggleMode(false); 
      
      chrome.tabs.onActivated.removeListener(onTabActivated);
      chrome.tabs.onUpdated.removeListener(onTabUpdated);
    }
    
    errorMessage.textContent = '';
    verifyMessage.textContent = '';
    forgotMessage.textContent = '';
  });

}); 

