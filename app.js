// Global memory cache to store API data once fetched
let cachedMarketData = [];

const AODP_EUROPE_URL = "https://europe.albion-online-data.com/api/v2/stats/prices/"; 
const ALBIONDB_EUROPE_URL = "https://albiondb.net/api/v1/europe/prices/"; 

function parseApiDate(dateStr) {
  if (!dateStr || dateStr.startsWith("0001-01-01")) return 0;
  const timestamp = new Date(dateStr).getTime();
  return isNaN(timestamp) || timestamp <= 0 ? 0 : timestamp;
}

// ==========================================
// 1. FETCH & MERGE DATA
// ==========================================
async function fetchAndMergeData(itemIds) {
  const itemString = itemIds.join(",");

  try {
    const [aodpResponse, albionDbResponse] = await Promise.all([
      fetch(`${AODP_EUROPE_URL}${itemString}.json`).catch(() => null),
      fetch(`${ALBIONDB_EUROPE_URL}${itemString}`).catch(() => null)
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

// ==========================================
// 2. MAIN FETCH TRIGGER (RUN Button)
// ==========================================
async function calculateAdvisor() {
  const tableBody = document.getElementById('tableBody');
  tableBody.innerHTML = `<div class="empty-state">Fetching freshest data from APIs...</div>`;

  // Diverse item list to ensure different names & prices show up
  const targetItems = [
    "T4_BAG", "T5_BAG", "T6_BAG", "T7_BAG", "T8_BAG",
    "T4_MAIN_CLAW", "T6_MAIN_CLAW", 
    "T7_MOUNT_SWIFTCLAW", "T8_ARMOR_LEATHER_ROYAL", 
    "T5_POTION_HEAL"
  ];

  cachedMarketData = await fetchAndMergeData(targetItems);

  if (cachedMarketData.length === 0) {
    tableBody.innerHTML = `<div class="empty-state">No valid market data available right now. Try clicking RUN again shortly.</div>`;
    return;
  }

  renderTable();
}

// ==========================================
// 3. RENDER & SORT LOCAL DATA
// ==========================================
function renderTable() {
  const tableBody = document.getElementById('tableBody');
  if (!cachedMarketData || cachedMarketData.length === 0) return;

  const isPremium = document.getElementById('hasPremium').value === 'true';
  const sortBy = document.getElementById('sortBy').value;
  const taxRate = isPremium ? 0.04 : 0.08;
  const setupFee = 0.025;

  const activeLocations = Array.from(document.querySelectorAll('#locationToggles input:checked')).map(cb => cb.value);

  let tradeRoutes = [];

  // Group market entries by Item ID and Quality
  const itemsGrouped = {};
  cachedMarketData.forEach(entry => {
    const key = `${entry.itemId}_${entry.quality}`;
    if (!itemsGrouped[key]) itemsGrouped[key] = [];
    itemsGrouped[key].push(entry);
  });

  // Calculate trade routes across different cities
  Object.values(itemsGrouped).forEach(cityList => {
    for (let buyEntry of cityList) {
      for (let sellEntry of cityList) {
        if (buyEntry.city === sellEntry.city) continue;
        if (buyEntry.buyPrice <= 0 || sellEntry.sellPrice <= 0) continue;
        if (!activeLocations.includes(buyEntry.city) || !activeLocations.includes(sellEntry.city)) continue;

        const totalCost = buyEntry.buyPrice * (1 + setupFee);
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

  // --- SORTING LOGIC ---
  if (sortBy === 'name') {
    tradeRoutes.sort((a, b) => a.itemId.localeCompare(b.itemId));
  } else if (sortBy === 'lastUpdate') {
    tradeRoutes.sort((a, b) => b.updatedAt - a.updatedAt); // Most recent first
  } else {
    tradeRoutes.sort((a, b) => b.profitMargin - a.profitMargin); // Highest margin first
  }

  tableBody.innerHTML = '';

  if (tradeRoutes.length === 0) {
    tableBody.innerHTML = `<div class="empty-state">No trade routes match your active location filters.</div>`;
    return;
  }

  // Render sorted rows
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

// ==========================================
// 4. ATTACH AUTOMATIC EVENT LISTENERS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  // Trigger re-render instantly on filter/sort changes
  document.getElementById('sortBy')?.addEventListener('change', renderTable);
  document.getElementById('hasPremium')?.addEventListener('change', renderTable);
  
  document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', renderTable);
  });

  // Initial load
  calculateAdvisor();
});
