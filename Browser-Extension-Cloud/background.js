import { auth, onAuthStateChanged, db, doc, setDoc, getDoc } from './firebase-init.js';

let currentUserId = null;
const SYNC_ALARM_NAME = "periodicFullSync";

onAuthStateChanged(auth, async (user) => { 
  if (user && user.emailVerified) {
    currentUserId = user.uid;
    console.log("Background: User logged in", currentUserId);

    // --- SYNC DOWN SETTINGS ON BROWSER START ---
    try {
      const userDocRef = doc(db, "userSettings", currentUserId);
      const docSnap = await getDoc(userDocRef);
      if (docSnap.exists()) {
        const cloudData = docSnap.data();
        console.log("Background Sync Down: Loaded settings from Firebase");
        await chrome.storage.local.set({
          [UNALLOWED_KEY]: cloudData.unallowed_urls || []
        });
        
        const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (currentTab) {
          console.log("Background: Re-checking active tab after settings sync.");
          handleTabChange(currentTab.id);
        }
        
      } else {
        console.warn("Background Sync Down: User document not found.");
      }
    } catch (error) {
      console.error("Background Sync Down: Error fetching document:", error);
    }

    // --- Start the periodic background sync timer ---
    console.log("Background: Starting periodic sync alarm.");
    chrome.alarms.create(SYNC_ALARM_NAME, {
      delayInMinutes: 1, // Wait 1 min after login to run first sync
      periodInMinutes: 15 // Run every 15 minutes after that
    });

  } else {
    currentUserId = null;
    console.log("Background: User logged out");
    // Clear local storage on logout
    await chrome.storage.local.set({ [UNALLOWED_KEY]: [], [TRACKING_KEY]: {} });
    
    // --- Stop the background sync timer ---
    console.log("Background: Clearing periodic sync alarm.");
    chrome.alarms.clear(SYNC_ALARM_NAME);
  }
});


// ==========================================================
// --- TIME TRACKER LOGIC ---
// ==========================================================

const UNALLOWED_KEY = "unallowed_urls";
const TRACKING_KEY = "time_tracking";
const ACTIVE_TAB_KEY = "active_tab_info";

// --- Utility Functions ---
function isSameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();
}


function getNormalizedDomain(url) {
  if (!url) return null;
  try {
    const domain = new URL(url).hostname;
    return domain.replace(/^www\./, '');
  } catch (error) {
    return null;
  }
}


async function logTime() {
  const sessionData = await chrome.storage.session.get([ACTIVE_TAB_KEY]);
  const activeTabInfo = sessionData[ACTIVE_TAB_KEY];

  if (!activeTabInfo || !activeTabInfo.domain || !activeTabInfo.startTime) {
    return; 
  }

  const duration = new Date().getTime() - activeTabInfo.startTime;
  if (duration <= 0) return;

  const data = await chrome.storage.local.get([TRACKING_KEY, UNALLOWED_KEY]);
  const tracking = data[TRACKING_KEY] || {};
  const unallowed = data[UNALLOWED_KEY] || [];
  
  const domain = activeTabInfo.domain;
  const siteSettings = unallowed.find(item => item.url === domain);
  if (!siteSettings) return; 

  const trackingData = tracking[domain] || { time: 0, lastReset: Date.now() };
  let { time, lastReset } = trackingData;

  const now = new Date();
  const lastResetDate = new Date(lastReset);
  let needsReset = false;

  if (siteSettings.type === 'daily' && !isSameDay(now, lastResetDate)) {
    needsReset = true;
  }

  if (needsReset) {
    console.log(`Resetting time for ${domain} (${siteSettings.type})`);
    time = 0; 
    lastReset = now.getTime();
  }

  time += duration;
  tracking[domain] = { time: time, lastReset: lastReset };

  await chrome.storage.local.set({ [TRACKING_KEY]: tracking });
  console.log(`(Local) Logged ${Math.round(duration/1000)}s for ${domain}.`);

  await chrome.storage.session.remove([ACTIVE_TAB_KEY]);
}

async function handleTabChange(tabId) {
  await logTime();

  // Now, check the new tab
  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch (error) {
    console.warn(`Could not get tab ${tabId}: ${error.message}`);
    return; // Tab was likely closed
  }

  const domain = getNormalizedDomain(tab.url);
  if (!domain) return; 
  const data = await chrome.storage.local.get(UNALLOWED_KEY);
  const unallowedData = data[UNALLOWED_KEY] || [];
  const unallowedUrls = unallowedData.map(item => item.url);

  if (unallowedUrls.includes(domain)) {
    console.log(`Started tracking: ${domain}`);
    await chrome.storage.session.set({
      [ACTIVE_TAB_KEY]: {
        tabId: tabId,
        domain: domain,
        startTime: new Date().getTime()
      }
    });
  }
}

chrome.tabs.onActivated.addListener((activeInfo) => {
  handleTabChange(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.active && changeInfo.url) {
    handleTabChange(tabId);
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const sessionData = await chrome.storage.session.get([ACTIVE_TAB_KEY]);
  const activeTabInfo = sessionData[ACTIVE_TAB_KEY];
  if (activeTabInfo && tabId === activeTabInfo.tabId) {
    await logTime();
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getActiveTab") {
    chrome.storage.session.get([ACTIVE_TAB_KEY]).then((sessionData) => {
      sendResponse(sessionData[ACTIVE_TAB_KEY] || null);
    });
    return true; 
  }
  return true;
});


chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === SYNC_ALARM_NAME && currentUserId) {
    console.log("Background Sync Alarm: Running periodic sync...");
    try {
      const localData = await chrome.storage.local.get([UNALLOWED_KEY, TRACKING_KEY]);
      
      if (localData) {
        const userDocRef = doc(db, "userSettings", currentUserId);
        
        await setDoc(userDocRef, { 
          unallowed_urls: localData[UNALLOWED_KEY] || [],
          time_tracking: localData[TRACKING_KEY] || {}
        }, { merge: true });
        
        console.log("Background Sync Alarm: Successfully synced time/settings.");
      }
    } catch (error) {
      console.error("Background Sync Alarm: Failed to sync data", error);
    }
  }
});

