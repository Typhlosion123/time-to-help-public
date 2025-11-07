const UNALLOWED_KEY = "unallowed_urls";
const TRACKING_KEY = "time_tracking";

let liveTimerInterval = null;

function formatTime(ms) {
  if (!ms || ms < 0) return "0s";
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);

  if (hr > 0) return `${hr}h ${min % 60}m`;
  if (min > 0) return `${min}m ${sec % 60}s`;
  return `${sec}s`;
}

const errorDiv = document.getElementById("error-message");
function showError(message) {
  errorDiv.textContent = message;
  errorDiv.style.display = "block";
}
function clearError() {
  errorDiv.textContent = "";
  errorDiv.style.display = "none";
}

async function renderBlockedList() {
  clearError(); 
  const data = await chrome.storage.local.get([UNALLOWED_KEY, TRACKING_KEY]);
  const urlsData = data[UNALLOWED_KEY] || []; 
  const tracking = data[TRACKING_KEY] || {};

  const list = document.getElementById("urlList");
  list.innerHTML = "";

  if (urlsData.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No tracked sites added yet.";
    list.appendChild(li);
    return;
  }

  urlsData.forEach(item => {
    const li = document.createElement("li");
    
    const u = item.url;
    const limitMs = item.limit;
    const type = item.type;

    const trackingData = tracking[u] || { time: 0 };
    const timeMs = trackingData.time;
    
    const time = formatTime(timeMs);
    const limitText = limitMs > 0 ? `${formatTime(limitMs)} ${type}` : `No limit`;

    li.innerHTML = `
      <strong id="domain-${u}">${u}</strong><br>
      <span class="time" id="time-${u}">Total: ${time}</span>
      <span class="limit">Limit: ${limitText}</span>
      <span class="session-time" id="session-${u}" style="display:none;"></span>
      <button data-url="${u}" class="removeBtn" title="Stop tracking">X</button>
    `;

    if (limitMs > 0 && timeMs > limitMs) {
      li.classList.add("over-limit");
    }

    list.appendChild(li);
  });


  document.querySelectorAll(".removeBtn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const urlToRemove = e.target.dataset.url;
      const data = await chrome.storage.local.get([UNALLOWED_KEY]);
      let urlsData = (data[UNALLOWED_KEY] || []).filter(item => item.url !== urlToRemove);
      await chrome.storage.local.set({ [UNALLOWED_KEY]: urlsData });
      renderBlockedList(); 
    });
  });
}

document.getElementById("addUrlBtn").addEventListener("click", async () => {
  clearError(); 

  const urlInput = document.getElementById("newUrl");
  const limitInput = document.getElementById("newLimit");
  const typeInput = document.getElementById("newLimitType");

  const urlValue = urlInput.value.trim();
  let finalUrl = urlValue.replace(/^https?:\/\//, '').replace(/\/.*$/, '');; 

  if (!finalUrl) {
    showError("Please enter a URL.");
    urlInput.focus();
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
    showError("Please enter a valid domain (e.g., youtube.com) or a full URL.");
    urlInput.focus();
    return;
  }

  const limitMins = parseInt(limitInput.value);
  let limitMs = 0;

  if (limitInput.value) { 
    if (isNaN(limitMins) || limitMins < 1) { 
      showError("Time limit must be 1 minute or more.");
      limitInput.focus();
      return;
    }
    limitMs = limitMins * 60 * 1000;
  } else {
    limitMs = 0;
  }
  
  const type = typeInput.value;

  const data = await chrome.storage.local.get(UNALLOWED_KEY);
  const urlsData = data[UNALLOWED_KEY] || [];

  // Check if URL already exists
  if (!urlsData.find(item => item.url === finalUrl)) {
    urlsData.push({
      url: finalUrl,
      limit: limitMs,
      type: type
    });
    await chrome.storage.local.set({ [UNALLOWED_KEY]: urlsData });
  } else {
    showError(`'${finalUrl}' is already in your tracked list.`);
    return;
  }

  // Clear inputs
  urlInput.value = "";
  limitInput.value = "";
  renderBlockedList();
});

// Clear tracking data
document.getElementById("clearData").addEventListener("click", async () => {
  clearError(); // Clear errors
  await chrome.storage.local.set({ [TRACKING_KEY]: {} });
  renderBlockedList();
});

async function startLiveTimer() {
  // Clear any old timer
  if (liveTimerInterval) {
    clearInterval(liveTimerInterval);
  }

  chrome.runtime.sendMessage({ action: "getActiveTab" }, async (activeTab) => {
    if (!activeTab || !activeTab.domain) {
      // Not tracking anything, so just stop
      return;
    }

    const data = await chrome.storage.local.get([UNALLOWED_KEY, TRACKING_KEY]);
    const urlsData = data[UNALLOWED_KEY] || [];
    const tracking = data[TRACKING_KEY] || {};

    // Find settings for the active domain
    const siteSettings = urlsData.find(item => item.url === activeTab.domain);
    const limitMs = siteSettings ? siteSettings.limit : 0;

    // Find stored time for the active domain
    const trackingData = tracking[activeTab.domain] || { time: 0 };
    const storedTime = trackingData.time;

    // Find all the elements we need to update
    const sessionElement = document.getElementById(`session-${activeTab.domain}`);
    const totalElement = document.getElementById(`time-${activeTab.domain}`);
    const liElement = sessionElement ? sessionElement.parentElement : null;

    if (!sessionElement || !totalElement || !liElement) {
      // Elements aren't on the page, stop.
      return;
    }
    
    sessionElement.style.display = "inline";

    liveTimerInterval = setInterval(() => {
      const sessionDuration = new Date().getTime() - activeTab.startTime;
      const newTotalTime = storedTime + sessionDuration;
      
      sessionElement.textContent = `Current: ${formatTime(sessionDuration)}`;
      totalElement.textContent = `Total: ${formatTime(newTotalTime)}`;

      if (limitMs > 0 && newTotalTime > limitMs) {
        liElement.classList.add("over-limit");
      }

    }, 1000); // Update every second
  });
}

async function init() {
  await renderBlockedList();
  
  startLiveTimer();
}

init();
