// Global cache memory
let cachedMarketData = [];

// API Endpoints
const AODP_EUROPE_URL = "https://europe.albion-online-data.com/api/v2/stats/prices/";
const ALBIONDB_EUROPE_URL = "https://albiondb.net/api/v1/europe/prices/";

// Helper to handle API dates safely
function parseApiDate(dateStr) {
  if (!dateStr || dateStr.startsWith("0001-01-01")) return 0;
  const timestamp = new Date(dateStr).getTime();
  return isNaN(timestamp) || timestamp <= 0 ? 0 : timestamp;
}

// Map quality names to numbers (1-5) if HTML uses text values
function getQualityNumber(val) {
  const str = String(val).toLowerCase().trim();
  if (str === '1' || str === 'normal') return 1;
  if (str === '2' || str === 'good') return 2;
  if (str === '3' || str === 'outstanding') return 3;
  if (str === '4' || str === 'excellent') return 4;
  if (str === '5' || str === 'masterpiece') return 5;
  return Number(val) || 1;
}

// 1. GET ACTIVE FILTERS FROM UI
function getUIFilters() {
  // Grab all checked checkboxes across the page safely
  const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'));

  // Get selected Tiers
  let tiers = checkboxes
    .map(cb => cb.value.toUpperCase())
    .filter(val => val.startsWith('T') || ['4','5','6','7','8'].includes(val))
    .map(val => val.startsWith('T') ? val : `T${val}`);

  if (tiers.length === 0) tiers = ["T4", "T5", "T6", "T7", "T8"];

  // Get selected Qualities (mapped to numbers 1-5)
  let qualities = checkboxes
    .map(cb => getQualityNumber(cb.value))
    .filter(val => val >= 1 && val <= 5);

  if (qualities.length === 0) qualities = [1, 2, 3, 4, 5];

  // Get selected Locations
  const knownCities = ["Fort Sterling", "Lymhurst", "Bridgewatch", "Martlock", "Thetford", "Caerleon", "Brecilien", "Black Market"];
  let locations = checkboxes
    .map(cb => cb.value)
    .filter(val => knownCities.some(city => city.toLowerCase() === val.toLowerCase()));

  if (locations.length === 0) locations = knownCities;

  // Get Budget
  const budgetInput = document.querySelector('input[type="number"]') || document.getElementById('budget');
  const maxBudget = budgetInput ? Number(budgetInput.value) || Infinity : Infinity;

  return { tiers, qualities, locations, maxBudget };
}

// 2. BUILD ITEM LIST BASED ON TIERS
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

// 3. FETCH & MERGE DATA
async function fetchAndMergeData(itemIds) {
  if (itemIds.length === 0) return [];

  const itemString = itemIds.join(",");

  try {
    const [aodpResponse, albionDbResponse] = await Promise.all([
      fetch(`${AODP_EUROPE_URL}${encodeURIComponent(itemString)}.json`).catch(() => null),
      fetch(`${ALBIONDB_EUROPE_URL}${encodeURIComponent(itemString)}`).catch(() => null)
    ]);

    const aodpData = aodpResponse && aodpResponse.ok ? await aodpResponse.json() : [];
    const albionDbData = albionDbResponse && albionDbResponse.ok ? await albionDbResponse.json() : [];

    const normalizedAODP = aodpData.map(item => ({
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

    const normalizedAlbionDB = albionDbData.map(item => ({
      itemId: item.item_id || item.itemId,
      city: item.city,
      quality: item.quality,
      buyPrice: item.sell_price_min || item.buyPrice || 0,
      sellPrice: item.buy_price_max || item.sellPrice || 0,
      updatedAt: parseApiDate(item.updated_at || item.updatedAt)
    }));

    const freshestMap = new Map();
    const combinedData = [...normalizedAODP, ...normalizedAlbionDB];

    combinedData.forEach(entry => {
      if (entry.buyPrice <= 0 && entry.sellPrice <= 0) return;
      const key = `${entry.itemId}_${entry.city}_${entry.quality}`;
      if (!freshestMap.has(key) || entry.updatedAt > freshestMap.get(key).updatedAt) {
        freshestMap.set(key, entry);
      }
    });

    return Array.from(freshestMap.values());

  } catch (error) {
    console.error("Error fetching market data:", error);
    return [];
  }
}

// 4. MAIN RUN BUTTON TRIGGER
async function calculateAdvisor() {
  const tableBody = document.getElementById('tableBody');
  if (tableBody) {
    tableBody.innerHTML = `<div class="empty-state" style="padding: 20px; text-align: center; color: #aaa;">Searching databases for matching market entries...</div>`;
  }

  const { tiers } = getUIFilters();
  const targetItems = generateItemIds(tiers);

  cachedMarketData = await fetchAndMergeData(targetItems);

  if (!cachedMarketData || cachedMarketData.length === 0) {
    if (tableBody) tableBody.innerHTML = `<div class="empty-state" style="padding: 20px; text-align: center; color: #aaa;">No live market data found. Try clicking RUN again.</div>`;
    return;
  }

  renderTable();
}

// 5. RENDER & SORT LOCAL DATA
function renderTable() {
  const tableBody = document.getElementById('tableBody');
  if (!tableBody || !cachedMarketData || cachedMarketData.length === 0) return;

  const isPremium = document.getElementById('hasPremium')?.value === 'true' || 
                    document.querySelector('select')?.value?.includes('4%');
  const sortBy = document.getElementById('sortBy')?.value || 'margin';
  const taxRate = isPremium ? 0.04 : 0.08;
  const setupFee = 0.025;

  const { qualities, locations, maxBudget } = getUIFilters();

  let tradeRoutes = [];

  // Group market entries by item ID and Quality
  const itemsGrouped = {};
  cachedMarketData.forEach(entry => {
    // Quality Filter
    if (!qualities.includes(Number(entry.quality))) return;

    const key = `${entry.itemId}_${entry.quality}`;
    if (!itemsGrouped[key]) itemsGrouped[key] = [];
    itemsGrouped[key].push(entry);
  });

  // Calculate trade routes across cities
  Object.values(itemsGrouped).forEach(cityList => {
    for (let buyEntry of cityList) {
      for (let sellEntry of cityList) {
        if (buyEntry.city === sellEntry.city) continue;
        if (buyEntry.buyPrice <= 0 || sellEntry.sellPrice <= 0) continue;

        // Location Filter
        const buyCityMatch = locations.some(l => l.toLowerCase() === buyEntry.city.toLowerCase());
        const sellCityMatch = locations.some(l => l.toLowerCase() === sellEntry.city.toLowerCase());
        if (!buyCityMatch || !sellCityMatch) continue;

        const totalCost = buyEntry.buyPrice * (1 + setupFee);

        // Budget Filter (Skip if item exceeds budget)
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

  // Sorting logic
  if (sortBy === 'name') {
    tradeRoutes.sort((a, b) => a.itemId.localeCompare(b.itemId));
  } else if (sortBy === 'lastUpdate') {
    tradeRoutes.sort((a, b) => b.updatedAt - a.updatedAt);
  } else {
    tradeRoutes.sort((a, b) => b.profitMargin - a.profitMargin);
  }

  tableBody.innerHTML = '';

  if (tradeRoutes.length === 0) {
    tableBody.innerHTML = `<div class="empty-state" style="padding: 20px; text-align: center; color: #aaa;">No profitable trade routes match your active filters and budget.</div>`;
    return;
  }

  // Render rows
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
}

// 6. BIND AUTOMATIC LISTENERS
document.addEventListener('DOMContentLoaded', () => {
  // Bind inputs and dropdowns to update local table view
  document.querySelectorAll('select, input').forEach(element => {
    if (element.type === 'button' || element.tagName === 'BUTTON') return;
    element.addEventListener('change', renderTable);
    element.addEventListener('input', renderTable);
  });

  // RUN Button trigger
  const runBtn = document.querySelector('button') || document.querySelector('.btn-run');
  if (runBtn) {
    runBtn.addEventListener('click', calculateAdvisor);
  }

  // Initial fetch on page load
  calculateAdvisor();
});
