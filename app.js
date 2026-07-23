// ==========================================
// CONFIGURATION & ENDPOINTS
// ==========================================

const AODP_EUROPE_URL = "https://europe.albion-online-data.com/api/v2/stats/prices/";
const ALBIONDB_EUROPE_URL = "https://albiondb.net/api/v1/europe/prices/";

// Helper to parse dates safely and avoid "0001-01-01" / epoch bugs
function parseApiDate(dateStr) {
  if (!dateStr || dateStr.startsWith("0001-01-01")) return 0;
  const timestamp = new Date(dateStr).getTime();
  return isNaN(timestamp) || timestamp <= 0 ? 0 : timestamp;
}

// ==========================================
// STEP 1: FETCH & MERGE DATA FROM BOTH DBs
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

    // Normalize AODP Data
    const normalizedAODP = aodpData.map(item => ({
      itemId: item.item_id,
      city: item.city,
      quality: item.quality,
      buyPrice: item.sell_price_min || 0, // Sell Price Min = lowest price you can buy it for
      sellPrice: item.buy_price_max || 0, // Buy Price Max = highest buy order price
      updatedAt: Math.max(
        parseApiDate(item.sell_price_min_date),
        parseApiDate(item.buy_price_max_date)
      ),
      source: "AODP"
    }));

    // Normalize AlbionDB Data
    const normalizedAlbionDB = albionDbData.map(item => ({
      itemId: item.item_id || item.itemId,
      city: item.city,
      quality: item.quality,
      buyPrice: item.sell_price_min || item.buyPrice || 0,
      sellPrice: item.buy_price_max || item.sellPrice || 0,
      updatedAt: parseApiDate(item.updated_at || item.updatedAt),
      source: "AlbionDB"
    }));

    // Merge and keep the freshest non-zero entry
    const freshestMap = new Map();
    const combinedData = [...normalizedAODP, ...normalizedAlbionDB];

    combinedData.forEach(entry => {
      // Ignore invalid/zero-priced items
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
// STEP 2: BUILD TRADE ROUTES & RENDER TABLE
// ==========================================

async function calculateAdvisor() {
  const tableBody = document.getElementById('tableBody');
  tableBody.innerHTML = `<div class="empty-state">Fetching freshest data from AODP Europe & AlbionDB Europe...</div>`;

  const isPremium = document.getElementById('hasPremium').value === 'true';
  const sortBy = document.getElementById('sortBy').value;
  const taxRate = isPremium ? 0.04 : 0.08;
  const setupFee = 0.025;

  // Selected filters
  const activeLocations = Array.from(document.querySelectorAll('#locationToggles input:checked')).map(cb => cb.value);
  const activeQualities = Array.from(document.querySelectorAll('#qualityToggles input:checked')).map(cb => cb.value);
  const activeTiers = Array.from(document.querySelectorAll('#tierToggles input:checked')).map(cb => cb.value);

  // Example item IDs to query
  const targetItems = [
    "T6_MAIN_CLAW", "T8_BAG", "T7_MOUNT_SWIFTCLAW", 
    "T8_ARMOR_LEATHER_ROYAL", "T5_POTION_HEAL"
  ];

  const marketEntries = await fetchAndMergeData(targetItems);

  if (marketEntries.length === 0) {
    tableBody.innerHTML = `<div class="empty-state">No valid market data available right now. Try running again shortly.</div>`;
    return;
  }

  // Build Buy City -> Sell City trade routes
  let tradeRoutes = [];

  // Group market entries by item ID and quality
  const itemsGrouped = {};
  marketEntries.forEach(entry => {
    const key = `${entry.itemId}_${entry.quality}`;
    if (!itemsGrouped[key]) itemsGrouped[key] = [];
    itemsGrouped[key].push(entry);
  });

  // Cross-compare cities for each item
  Object.values(itemsGrouped).forEach(cityList => {
    for (let buyEntry of cityList) {
      for (let sellEntry of cityList) {
        // Must be different cities and valid prices
        if (buyEntry.city === sellEntry.city) continue;
        if (buyEntry.buyPrice <= 0 || sellEntry.sellPrice <= 0) continue;

        // Apply location filter
        if (!activeLocations.includes(buyEntry.city) || !activeLocations.includes(sellEntry.city)) continue;

        const totalCost = buyEntry.buyPrice * (1 + setupFee);
        const netRevenue = sellEntry.sellPrice * (1 - setupFee - taxRate);
        const profit = netRevenue - totalCost;
        const profitMargin = (profit / totalCost) * 100;

        // Take the oldest date of the two for safety
        const oldestUpdate = Math.min(buyEntry.updatedAt, sellEntry.updatedAt);

        tradeRoutes.push({
          itemId: buyEntry.itemId,
          quality: buyEntry.quality,
          fromCity: buyEntry.city,
          toCity: sellEntry.city,
          buyPrice: buyEntry.buyPrice,
          sellPrice: sellEntry.sellPrice,
          profit: profit,
          profitMargin: profitMargin,
          updatedAt: oldestUpdate
        });
      }
    }
  });

  // Apply Sort
  if (sortBy === 'name') {
    tradeRoutes.sort((a, b) => a.itemId.localeCompare(b.itemId));
  } else if (sortBy === 'lastUpdate') {
    tradeRoutes.sort((a, b) => b.updatedAt - a.updatedAt);
  } else {
    tradeRoutes.sort((a, b) => b.profitMargin - a.profitMargin);
  }

  tableBody.innerHTML = '';

  if (tradeRoutes.length === 0) {
    tableBody.innerHTML = `<div class="empty-state">No profitable trade routes found for your active filters.</div>`;
    return;
  }

  // Render Table Rows
  tradeRoutes.forEach((route) => {
    // Format timestamp nicely
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
