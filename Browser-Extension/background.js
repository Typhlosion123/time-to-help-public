

const UNALLOWED_KEY = "unallowed_urls";
const TRACKING_KEY = "time_tracking";
const ACTIVE_TAB_KEY = "active_tab_info";


let activeTabInfo = {
  tabId: null,
  domain: null,
  startTime: null
};

function isSameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();
}

function isSameWeek(d1, d2) {
  const d1Day = (d1.getDay() + 6) % 7; // Make Monday 0, Sunday 6
  const d1Monday = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate() - d1Day);

  const d2Day = (d2.getDay() + 6) % 7;
  const d2Monday = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate() - d2Day);

  return d1Monday.getTime() === d2Monday.getTime();
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
  if (siteSettings.type === 'weekly' && !isSameWeek(now, lastResetDate)) {
    needsReset = true;
  }

  if (needsReset) {
    console.log(`Resetting time for ${domain} (${siteSettings.type})`);
    time = 0; // Reset time
    lastReset = now.getTime(); // Update reset timestamp
  }

  time += duration;

  tracking[domain] = { time: time, lastReset: lastReset };
  await chrome.storage.local.set({ [TRACKING_KEY]: tracking });
  
  console.log(`Logged ${Math.round(duration/1000)}s for ${domain}. New total: ${Math.round(time/1000)}s`);

  await chrome.storage.session.remove([ACTIVE_TAB_KEY]);
}

async function handleTabChange(tabId) {
  await logTime();

  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch (error) {
    console.warn(`Could not get tab ${tabId}: ${error.message}`);
    return;
  }

  const domain = getNormalizedDomain(tab.url);
  if (!domain) return; // Internal page

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
      const activeTabInfo = sessionData[ACTIVE_TAB_KEY];
      if (activeTabInfo && activeTabInfo.domain) {
        sendResponse(activeTabInfo);
      } else {
        sendResponse(null);
      }
    });
    return true; 
  }
  return true;
});
