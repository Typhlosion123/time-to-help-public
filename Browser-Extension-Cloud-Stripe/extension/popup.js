import { 
  app,
  auth, 
  onAuthStateChanged, 
  db,
  doc,
  getDoc,
  setDoc,
  updateDoc, 
  sendEmailVerification,
  sendPasswordResetEmail,
  getFunctions,
  httpsCallable
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
  let localWalletBalance = 0; // Stored as cents
  let localTotalDonated = 0; // Stored as cents
  
  // --- Initialize services as null ---
  let functions = null;
  let createStripeCheckout = null;

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
  
  // --- App Nav & Wallet Elements ---
  const navBtnTracker = document.getElementById("nav-btn-tracker");
  const navBtnWallet = document.getElementById("nav-btn-wallet");
  const trackerView = document.getElementById("tracker-view");
  const walletView = document.getElementById("wallet-view");

  const walletBalanceDisplay = document.getElementById("wallet-balance");
  const walletInput = document.getElementById("wallet-input");
  const btnAddFunds = document.getElementById("btn-add-funds");
  const walletMessage = document.getElementById("wallet-message");

  // --- Charity & Donation Elements ---
  const totalDonatedAmount = document.getElementById("total-donated-amount");
  const charitySelect = document.getElementById("charity-select");
  const btnSaveCharity = document.getElementById("btn-save-charity");

  // --- Daily Result Notification Elements ---
  const dailyResultNotification = document.getElementById("daily-result-notification");
  const dailyResultMessage = document.getElementById("daily-result-message");
  const dailyResultDismiss = document.getElementById("daily-result-dismiss");

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

  // --- Dismiss Daily Result Listener ---
  dailyResultDismiss.addEventListener('click', () => {
    dailyResultNotification.classList.add('hidden');
    // Mark it as "seen" in Firebase so it doesn't show again
    if (userDocRef) {
      updateDoc(userDocRef, { "dailyResult.seen": true });
    }
  });

  // --- App Navigation Logic ---
  navBtnTracker.addEventListener('click', () => {
    trackerView.classList.remove('hidden');
    walletView.classList.add('hidden');
    navBtnTracker.classList.add('active');
    navBtnWallet.classList.remove('active');
  });

  navBtnWallet.addEventListener('click', () => {
    trackerView.classList.add('hidden');
    walletView.classList.remove('hidden');
    navBtnTracker.classList.remove('active');
    navBtnWallet.classList.add('active');
    walletMessage.textContent = ''; // Clear message
  });


  // --- UI Mode Toggler (Auth) ---
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
      btnSignupSubmit.disabled = false;
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

  // --- Handle 'Enter' key submission (Auth) ---
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


  // --- Auth Functions  ---
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
        walletBalance: 0,
        totalDonated: 0,
        selectedCharity: "none", 
        createdAt: new Date(),
        editHistory: [],
        dailyResult: { seen: true } 
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
          localWalletBalance = cloudData.walletBalance || 0;
          localTotalDonated = cloudData.totalDonated || 0; 
          charitySelect.value = cloudData.selectedCharity || "none"; 
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
          time_tracking: localData[TRACKING_KEY] || {}
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
      localWalletBalance = 0;
      localTotalDonated = 0; 
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
      const type = "daily"; // Hardcoded to daily
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
        type: type,
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
    walletBalanceDisplay.textContent = formatAsDollars(localWalletBalance);
    totalDonatedAmount.textContent = formatAsDollars(localTotalDonated);
  }

  // ==========================================================
  // --- WALLET LOGIC ---
  // ==========================================================
  
  function formatAsDollars(cents) {
    return `$${(cents / 100).toFixed(2)}`;
  }
  
  function parseToCents(dollarString) {
    const floatValue = parseFloat(dollarString);
    if (isNaN(floatValue)) {
      return 0;
    }
    return Math.round(floatValue * 100);
  }

  btnAddFunds.addEventListener('click', async () => {
    const amountString = walletInput.value;
    const amountInCents = parseToCents(amountString);

    if (!amountInCents || amountInCents < 50) { // Stripe has a 50 cent minimum
      walletMessage.textContent = "Amount must be at least $0.50.";
      walletMessage.style.color = 'red';
      return;
    }

    if (!createStripeCheckout) {
      walletMessage.textContent = "Auth service not ready. Please wait a moment.";
      walletMessage.style.color = 'red';
      return;
    }

    walletMessage.textContent = 'Creating secure payment session...';
    walletMessage.style.color = 'green';
    btnAddFunds.disabled = true;

    try {
      const result = await createStripeCheckout({ amount: amountInCents });
      
      const checkoutUrl = result.data.url;
      if (!checkoutUrl) {
        throw new Error("No checkout URL returned from function.");
      }

      chrome.tabs.create({ url: checkoutUrl });

      walletMessage.textContent = "Redirecting to Stripe...";
      walletInput.value = "";

    } catch (error) {
      console.error("Cloud Function error:", error);
      if (error.message === "You must be logged in to add funds.") {
        walletMessage.textContent = "Auth error. Please log out and log back in.";
      } else {
        walletMessage.textContent = "Error: Could not create payment session.";
      }
      walletMessage.style.color = 'red';
    } finally {
      btnAddFunds.disabled = false;
    }
  });

  // --- Save Charity Listener ---
  btnSaveCharity.addEventListener('click', async () => {
    const newCharity = charitySelect.value;
    if (!userDocRef) {
      walletMessage.textContent = "Error: Not logged in.";
      walletMessage.style.color = 'red';
      return;
    }

    try {
      await updateDoc(userDocRef, { selectedCharity: newCharity });
      walletMessage.textContent = "Charity preference saved!";
      walletMessage.style.color = 'green';
    } catch (err) {
      console.error("Firebase charity sync error:", err);
      walletMessage.textContent = "Error: Could not save preference.";
      walletMessage.style.color = 'red';
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
      currentHistory.push(logEntry);
      await updateDoc(userDocRef, { editHistory: currentHistory });
    } catch (err) {
      console.error("Firebase edit log error:", err);
    }
  }

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
    const { url, limitMs } = confirmEditModal.dataset;
    closeConfirmEditModal();
    openEditModal(url, limitMs);
  });
  
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
    
    const type = "daily"; // Hardcoded
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
      
      setDoc(userDocRef, { unallowed_urls: urlsData }, { merge: true })
        .then(() => console.log("Popup Sync Up: Removed site via modal"))
        .catch(err => console.error("Firebase sync error:", err));
    }
    
    closeEditModal();
    renderBlockedList();
  });


  // ==========================================================
  // --- CENTRAL AUTH STATE LISTENER ---
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
    await auth.authStateReady();

    if (liveTimerInterval) clearInterval(liveTimerInterval); 

    if (user) {
      await user.reload(); 
      const freshUser = auth.currentUser; 

      if (freshUser.emailVerified) {
        // --- VERIFIED ---
        console.log("User verified, showing app");
        currentUserId = freshUser.uid;
        userDocRef = doc(db, "userSettings", currentUserId);

        try {
          functions = getFunctions(app, 'us-central1');
          
          createStripeCheckout = httpsCallable(functions, 'createStripeCheckout');
          
        } catch (err) {
          console.error("Failed to initialize Firebase Functions:", err);
          walletMessage.textContent = "Error: Cannot connect to payment service.";
          walletMessage.style.color = "red";
        }


        console.log("Popup Open: Starting sync...");
        try {
          // SYNC UP
          const localData = await chrome.storage.local.get([TRACKING_KEY]);
          await setDoc(userDocRef, {
            time_tracking: localData[TRACKING_KEY] || {}
          }, { merge: true });
          console.log("Popup Sync Up: Time data uploaded.");

          // SYNC DOWN
          const docSnap = await getDoc(userDocRef);
          if (docSnap.exists()) {
            const cloudData = docSnap.data();
            await chrome.storage.local.set({
              [UNALLOWED_KEY]: cloudData.unallowed_urls || [],
              [TRACKING_KEY]: cloudData.time_tracking || {}
            });
            localWalletBalance = cloudData.walletBalance || 0;
            localTotalDonated = cloudData.totalDonated || 0; 
            charitySelect.value = cloudData.selectedCharity || "none";
            console.log("Popup Sync Down: All data overwritten by server.");
            
            // --- Check for Daily Result ---
            const result = cloudData.dailyResult;
            if (result && !result.seen) {
              if (result.status === "failed_time") {
                dailyResultMessage.textContent = "You went over your time limit yesterday. Your wallet was reset.";
                dailyResultNotification.className = "notification-box fail";
              } else if (result.status === "failed_edit") {
                dailyResultMessage.textContent = "You edited your goals yesterday. Your wallet was reset.";
                dailyResultNotification.className = "notification-box fail";
              } else {
                dailyResultMessage.textContent = "You met your goal yesterday! Your wallet balance is safe.";
                dailyResultNotification.className = "notification-box success";
              }
              dailyResultNotification.classList.remove('hidden');
            } else {
              dailyResultNotification.classList.add('hidden');
            }

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
        functions = null; // Clear services
        createStripeCheckout = null; 
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
      functions = null; // Clear services
      createStripeCheckout = null; 
      localWalletBalance = 0;
      localTotalDonated = 0; 
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