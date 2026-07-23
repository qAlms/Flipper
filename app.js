// Global memory cache
window.cachedMarketData = [];

// Official Albion Online Data Project - Europe Server
const AODP_EUROPE_URL = "https://europe.albion-online-data.com/api/v2/stats/prices/";

function parseApiDate(dateStr) {
  if (!dateStr || dateStr.startsWith("0001-01-01")) return 0;
  const timestamp = new Date(dateStr).getTime();
  return isNaN(timestamp) || timestamp <= 0 ? 0 : timestamp;
}

function getQualityNumber(val) {
  const str = String(val).toLowerCase().trim();
  if (str === '1' || str === 'normal') return 1;
  if (str === '2' || str === 'good') return 2;
  if (str === '3' || str === 'outstanding') return 3;
  if (str === '4' || str === 'excellent') return 4;
  if (str === '5' || str === 'masterpiece') return 5;
  return Number(val) || 1;
}

// 1. READ UI FILTERS
function getUIFilters() {
  const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'));

  // Extract Tiers
  let tiers = checkboxes
    .map(cb => cb.value.toUpperCase())
    .filter(val => val.startsWith('T') || ['4','5','6','7','8'].includes(val))
    .map(val => val.startsWith('T') ? val : `T${val}`);

  if (tiers.length === 0) tiers = ["T4", "T5", "T6", "T7", "T8"];

  // Extract Qualities
  let qualities = checkboxes
    .map(cb => getQualityNumber(cb.value))
    .filter(val => val >= 1 && val <= 5);

  if (qualities.length === 0) qualities = [1, 2, 3, 4, 5];

  // Extract Locations
  const knownCities = ["Fort Sterling", "Lymhurst", "Bridgewatch", "Martlock", "Thetford", "Caerleon", "Brecilien", "Black Market"];
  let locations = checkboxes
    .map(cb => cb.value)
    .filter(val => knownCities.some(city => city.toLowerCase() === val.toLowerCase()));

  if (locations.length === 0) locations = knownCities;

  // Extract Budget
  const budgetInput = document.querySelector('input[type="number"]') || document.getElementById('budget');
  const maxBudget = budgetInput ? Number(budgetInput.value) || Infinity : Infinity;

  return { tiers, qualities, locations, maxBudget };
}

// 2. GENERATE ITEM IDS
function generateItemIds(tiers) {
  const baseItems = [
    "BAG", "CAPE", "MAIN_CLAW", "MOUNT_SWIFTCLAW", 
    "ARMOR_LEATHER_ROYAL", "POTION_HEAL", "HEAD_CLOTH_ROYAL", "SHOES_LEATHER_ROYAL"
  ];

  const items = [];
  tiers.forEach(tier => {
    baseItems.forEach(base => {
      if (base === "MOUNT_SWIFTCLAW") {
        if (tier === "T7") items.push("T7_MOUNT_SWIFTCLAW");
      } else {
        items.push(`${tier}_${base}`);
      }
    });
  });

  return Array.from(new Set(items));
}

// FETCH WITH TIMEOUT (Prevents freeze/stuck at 91%)
async function fetchWithTimeout(resource, options = {}) {
  const { timeout = 5000 } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

// 3. FETCH DATA IN SMALL BATCHES
async function fetchAndMergeData(itemIds, progressCallback) {
  if (itemIds.length === 0) return [];

  const BATCH_SIZE = 4;
  const batches = [];
  for (let i = 0; i < itemIds.length; i += BATCH_SIZE) {
    batches.push(itemIds.slice(i, i + BATCH_SIZE));
  }

  let allResults = [];
  let completed = 0;

  for (const batch of batches) {
    const itemString = batch.join(",");
    const requestUrl = `${AODP_EUROPE_URL}${itemString}.json`;

    try {
      const response = await fetchWithTimeout(requestUrl, { timeout: 5000 });
      if (response.ok) {
        const data = await response.json();
        const normalized = data.map(item => ({
          itemId: item.item_id,
          city: item.city,
          quality: item.quality,
          buyPrice: item.sell_price_min || 0,
          sellPrice: item.buy_price_max || 0,
          updatedAt: Math.max(
            parseApiDate(item.sell_price_min_date),
            parseApiDate(item.buy_price_max_date)
          )
        }));
        allResults.push(...normalized);
      }
    } catch (err) {
      console.warn(`Batch request timed out or skipped: ${requestUrl}`);
    }

    completed++;
    const percent = Math.round((completed / batches.length) * 100);
    if (progressCallback) progressCallback(percent, completed, batches.length);
  }

  const freshestMap = new Map();
  allResults.forEach(entry => {
    if (entry.buyPrice <= 0 && entry.sellPrice <= 0) return;
    const key = `${entry.itemId}_${entry.city}_${entry.quality}`;
    if (!freshestMap.has(key) || entry.updatedAt > freshestMap.get(key).updatedAt) {
      freshestMap.set(key, entry);
    }
  });

  return Array.from(freshestMap.values());
}

// 4. MAIN RUN EXECUTION
window.calculateAdvisor = async function() {
  const tableBody = document.getElementById('tableBody');
  const { tiers } = getUIFilters();
  const targetItems = generateItemIds(tiers);

  if (tableBody) {
    tableBody.innerHTML = `
      <div style="padding: 30px; text-align: center; color: #ffb74d;">
        <div style="font-size: 1.2rem; font-weight: bold; margin-bottom: 8px;">
          Querying Albion Europe Database: <span id="searchPercent">0%</span>
        </div>
        <div style="color: #aaa; font-size: 0.9rem;">
          Batch progress: <span id="searchBatches">0/${Math.ceil(targetItems.length / 4)}</span>
        </div>
      </div>
    `;
  }

  window.cachedMarketData = await fetchAndMergeData(targetItems, (percent, done, total) => {
    const percentEl = document.getElementById('searchPercent');
    const batchesEl = document.getElementById('searchBatches');
    if (percentEl) percentEl.textContent = `${percent}%`;
    if (batchesEl) batchesEl.textContent = `${done}/${total}`;
  });

  if (!window.cachedMarketData || window.cachedMarketData.length === 0) {
    if (tableBody) {
      tableBody.innerHTML = `<div style="padding: 20px; text-align: center; color: #f44336;">No market data received. Try clicking RUN again.</div>`;
    }
    return;
  }

  renderTable();
};

// 5. RENDER & SORT LOCAL TABLE
window.renderTable = function() {
  const tableBody = document.getElementById('tableBody');
  if (!tableBody || !window.cachedMarketData || window.cachedMarketData.length === 0) return;

  const isPremium = document.getElementById('hasPremium')?.value === 'true' || 
                    document.querySelector('select')?.value?.includes('4%');
  const sortBy = document.getElementById('sortBy')?.value || document.querySelectorAll('select')[1]?.value || 'margin';
  const taxRate = isPremium ? 0.04 : 0.08;
  const setupFee = 0.025;

  const { qualities, locations, maxBudget } = getUIFilters();

  let tradeRoutes = [];

  const itemsGrouped = {};
  window.cachedMarketData.forEach(entry => {
    if (!qualities.includes(Number(entry.quality))) return;
    const key = `${entry.itemId}_${entry.quality}`;
    if (!itemsGrouped[key]) itemsGrouped[key] = [];
    itemsGrouped[key].push(entry);
  });

  Object.values(itemsGrouped).forEach(cityList => {
    for (let buyEntry of cityList) {
      for (let sellEntry of cityList) {
        if (buyEntry.city === sellEntry.city) continue;
        if (buyEntry.buyPrice <= 0 || sellEntry.sellPrice <= 0) continue;

        const buyCityMatch = locations.some(l => l.toLowerCase() === buyEntry.city.toLowerCase());
        const sellCityMatch = locations.some(l => l.toLowerCase() === sellEntry.city.toLowerCase());
        if (!buyCityMatch || !sellCityMatch) continue;

        const totalCost = buyEntry.buyPrice * (1 + setupFee);
        if (totalCost > maxBudget) continue;

        const netRevenue = sellEntry.sellPrice * (1 - setupFee - taxRate);
        const profit = netRevenue - totalCost;
        const profitMargin = (profit / totalCost) * 100;

        tradeRoutes.push({
          itemId: buyEntry.itemId,
          quality: buyEntry.quality,
          fromCity: buyEntry.city,
          toCity: sellEntry.city,
          buyPrice: buyEntry.buyPrice,
          sellPrice: sellEntry.sellPrice,
          profit: profit,
          profitMargin: profitMargin,
          updatedAt: Math.min(buyEntry.updatedAt, sellEntry.updatedAt)
        });
      }
    }
  });

  if (sortBy.toLowerCase().includes('name')) {
    tradeRoutes.sort((a, b) => a.itemId.localeCompare(b.itemId));
  } else if (sortBy.toLowerCase().includes('update')) {
    tradeRoutes.sort((a, b) => b.updatedAt - a.updatedAt);
  } else {
    tradeRoutes.sort((a, b) => b.profitMargin - a.profitMargin);
  }

  tableBody.innerHTML = '';

  if (tradeRoutes.length === 0) {
    tableBody.innerHTML = `<div class="empty-state" style="padding: 20px; text-align: center; color: #aaa;">No matching trade routes found for your active filters/budget limit.</div>`;
    return;
  }

  tradeRoutes.forEach((route) => {
    let timeDisplay = "No Recent Data";
    if (route.updatedAt > 0) {
      const minsAgo = Math.floor((Date.now() - route.updatedAt) / 60000);
      timeDisplay = minsAgo <= 0 ? "Just now" : `${minsAgo} mins ago`;
    }

    const profitClass = route.profit >= 0 ? 'profit-positive' : 'profit-negative';

    const rowHTML = `
      <div class="table-row">
        <div class="item-title-container">
          <div class="item-title">${route.itemId}</div>
          <div class="item-subtext">Quality: ${route.quality}</div>
        </div>

        <div><span class="badge-update">${timeDisplay}</span></div>

        <div class="price-cell">
          <div class="city-info">${route.fromCity}</div>
          <div class="price-val">${Math.round(route.buyPrice).toLocaleString()} silver</div>
        </div>

        <div class="price-cell">
          <div class="city-info">${route.toCity}</div>
          <div class="price-val">${Math.round(route.sellPrice).toLocaleString()} silver</div>
        </div>

        <div class="${profitClass}">
          ${Math.round(route.profit).toLocaleString()} silver
        </div>

        <div class="margin-val">
          ${route.profitMargin.toFixed(2)} %
        </div>
      </div>
    `;

    tableBody.innerHTML += rowHTML;
  });
};

// AUTOMATIC EVENT BINDINGS FOR LIVE TOGGLING
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('select, input').forEach(element => {
    if (element.type === 'button' || element.tagName === 'BUTTON') return;
    element.addEventListener('change', () => {
      if (window.cachedMarketData && window.cachedMarketData.length > 0) {
        window.renderTable();
      }
    });
    element.addEventListener('input', () => {
      if (window.cachedMarketData && window.cachedMarketData.length > 0) {
        window.renderTable();
      }
    });
  });

  const runBtn = document.querySelector('button') || document.querySelector('.btn-run') || document.getElementById('runBtn');
  if (runBtn) {
    runBtn.addEventListener('click', window.calculateAdvisor);
  }

  window.calculateAdvisor();
});
