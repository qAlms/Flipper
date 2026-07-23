window.cachedMarketData = [];
const AODP_EUROPE_URL = "https://europe.albion-online-data.com/api/v2/stats/prices/";

function parseApiDate(dateStr) {
  if (!dateStr || dateStr.startsWith("0001-01-01")) return 0;
  const utcDateStr = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z';
  const timestamp = new Date(utcDateStr).getTime();
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

// READ UI FILTERS
function getUIFilters() {
  const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'));

  let tiers = checkboxes
    .map(cb => cb.value.toUpperCase())
    .filter(val => val.startsWith('T') || ['4','5','6','7','8'].includes(val))
    .map(val => val.startsWith('T') ? val : `T${val}`);
  if (tiers.length === 0) tiers = ["T4", "T5", "T6", "T7", "T8"];

  let qualities = checkboxes
    .map(cb => getQualityNumber(cb.value))
    .filter(val => val >= 1 && val <= 5);
  if (qualities.length === 0) qualities = [1, 2, 3, 4, 5];

  const knownCities = ["Fort Sterling", "Lymhurst", "Bridgewatch", "Martlock", "Thetford", "Caerleon", "Brecilien", "Black Market"];
  let locations = checkboxes
    .map(cb => cb.value)
    .filter(val => knownCities.some(city => city.toLowerCase() === val.toLowerCase()));
  if (locations.length === 0) locations = knownCities;

  const budgetInput = document.getElementById('budget') || document.querySelector('input[type="number"]');
  const maxBudget = budgetInput ? Number(budgetInput.value) || Infinity : Infinity;

  return { tiers, qualities, locations, maxBudget };
}

// EXPANDED ITEM GENERATOR FOR BETTER MARKET COVERAGE
function generateItemIds(tiers) {
  const baseItems = [
    "BAG", "CAPE", "POTION_HEAL", "POTION_ENERGY", "FOOD_STEW", "FOOD_SALAD",
    "MAIN_SWORD", "2H_CLAYMORE", "MAIN_AXE", "2H_GREATAXE", "MAIN_NATURESTAFF",
    "ARMOR_CLOTH_SET1", "ARMOR_LEATHER_SET1", "ARMOR_PLATE_SET1",
    "HEAD_CLOTH_SET1", "HEAD_LEATHER_SET1", "HEAD_PLATE_SET1",
    "SHOES_CLOTH_SET1", "SHOES_LEATHER_SET1", "SHOES_PLATE_SET1",
    "MOUNT_HORSE", "MOUNT_OX", "MOUNT_SWIFTCLAW"
  ];
  
  const items = [];
  tiers.forEach(tier => {
    baseItems.forEach(base => {
      if (base.includes("MOUNT_")) {
        if (tier === "T4" || tier === "T5" || tier === "T7") {
          items.push(`${tier}_${base}`);
        }
      } else {
        items.push(`${tier}_${base}`);
      }
    });
  });
  return Array.from(new Set(items));
}

// FETCH API DATA
async function fetchAndMergeData(itemIds, progressCallback) {
  if (itemIds.length === 0) return [];

  const BATCH_SIZE = 6;
  const batches = [];
  for (let i = 0; i < itemIds.length; i += BATCH_SIZE) {
    batches.push(itemIds.slice(i, i + BATCH_SIZE));
  }

  let completed = 0;

  const fetchPromises = batches.map(async (batch) => {
    const itemString = batch.join(",");
    const requestUrl = `${AODP_EUROPE_URL}${itemString}.json`;

    try {
      const response = await fetch(requestUrl);
      if (response.ok) {
        const data = await response.json();
        completed++;
        if (progressCallback) progressCallback(Math.round((completed / batches.length) * 100), completed, batches.length);
        
        return data.map(item => ({
          itemId: item.item_id || item.ItemId,
          city: item.city || item.City,
          quality: item.quality || item.Quality || 1,
          buyPrice: item.sell_price_min ?? item.SellPriceMin ?? 0,
          sellPrice: item.buy_price_max ?? item.BuyPriceMax ?? 0,
          updatedAt: Math.max(
            parseApiDate(item.sell_price_min_date || item.SellPriceMinDate), 
            parseApiDate(item.buy_price_max_date || item.BuyPriceMaxDate)
          )
        }));
      }
    } catch (err) {
      console.warn("API batch fetch error:", err);
    }
    completed++;
    if (progressCallback) progressCallback(Math.round((completed / batches.length) * 100), completed, batches.length);
    return [];
  });

  const resultsArray = await Promise.all(fetchPromises);
  const allResults = resultsArray.flat();

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

// MAIN RUN FUNCTION
window.calculateAdvisor = async function() {
  const tableBody = document.getElementById('tableBody');
  const { tiers } = getUIFilters();
  const targetItems = generateItemIds(tiers);

  if (tableBody) {
    tableBody.innerHTML = `
      <div style="padding: 40px; text-align: center; color: #f59e0b;">
        <div style="font-size: 1.2rem; font-weight: bold; margin-bottom: 8px;">
          Searching Albion Europe Database: <span id="searchPercent">0%</span>
        </div>
        <div style="color: #94a3b8; font-size: 0.9rem;">
          Batch progress: <span id="searchBatches">0/${Math.ceil(targetItems.length / 6)}</span>
        </div>
      </div>
    `;
  }

  try {
    window.cachedMarketData = await fetchAndMergeData(targetItems, (percent, done, total) => {
      const percentEl = document.getElementById('searchPercent');
      const batchesEl = document.getElementById('searchBatches');
      if (percentEl) percentEl.textContent = `${percent}%`;
      if (batchesEl) batchesEl.textContent = `${done}/${total}`;
    });
  } catch (e) {
    console.error("Failed to fetch data:", e);
  }

  renderTable();
};

// RENDER TABLE 
window.renderTable = function() {
  const tableBody = document.getElementById('tableBody');
  if (!tableBody) return;

  if (!window.cachedMarketData || window.cachedMarketData.length === 0) {
    tableBody.innerHTML = `<div style="padding: 40px; text-align: center; color: #94a3b8;">Click <strong>RUN</strong> above to search for market deals.</div>`;
    return;
  }

  const isPremium = document.getElementById('hasPremium')?.value === 'true' || 
                    document.getElementById('hasPremium')?.value?.includes('4%');
  const sortBy = document.getElementById('sortBy')?.value || 'margin';
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
        
        if (profit <= 0) continue;

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
    tableBody.innerHTML = `<div style="padding: 40px; text-align: center; color: #94a3b8;">No profitable trade routes match your current filters.</div>`;
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
        <div class="${profitClass}">${Math.round(route.profit).toLocaleString()} silver</div>
        <div class="margin-val">${route.profitMargin.toFixed(2)} %</div>
      </div>
    `;
    tableBody.innerHTML += rowHTML;
  });
};

// INITIALIZATION
document.addEventListener('DOMContentLoaded', () => {
  const runBtn = document.getElementById('runBtn');
  if (runBtn) {
    runBtn.addEventListener('click', () => {
      window.calculateAdvisor();
    });
  }
  
  window.renderTable();
});
