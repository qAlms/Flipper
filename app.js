// Global cache for current run
let cachedMarketData = [];

// API Base URLs for Europe
const AODP_EUROPE_URL = "https://europe.albion-online-data.com/api/v2/stats/prices/"; 
const ALBIONDB_EUROPE_URL = "https://albiondb.net/api/v1/europe/prices/"; 

// Date helper
function parseApiDate(dateStr) {
  if (!dateStr || dateStr.startsWith("0001-01-01")) return 0;
  const timestamp = new Date(dateStr).getTime();
  return isNaN(timestamp) || timestamp <= 0 ? 0 : timestamp;
}

// 1. DYNAMIC ITEM GENERATOR BASED ON FILTERS
function getRequestedItemsFromUI() {
  // Grab active Tier checkboxes (e.g., ["T4", "T5", "T6", "T7", "T8"])
  const selectedTiers = Array.from(document.querySelectorAll('#tierToggles input:checked')).map(cb => cb.value);
  
  // Base item types you want your app to analyze (add more Albion item IDs here as needed)
  const baseItems = [
    "BAG", "CAPE", "MAIN_CLAW", "MOUNT_SWIFTCLAW", 
    "ARMOR_LEATHER_ROYAL", "POTION_HEAL", "HEAD_CLOTH_ROYAL"
  ];

  const generatedItems = [];

  // Generate full item IDs based on selected tiers (e.g. T6_BAG, T8_BAG)
  selectedTiers.forEach(tier => {
    baseItems.forEach(base => {
      // Special case: Mounts or potions might not exist on all tiers, but constructing them handles base equipment
      if (base === "MOUNT_SWIFTCLAW") {
        if (tier === "T7") generatedItems.push("T7_MOUNT_SWIFTCLAW");
      } else {
        generatedItems.push(`${tier}_${base}`);
      }
    });
  });

  return Array.from(new Set(generatedItems)); // Remove duplicates
}

// 2. FETCH & MERGE DATA FOR THE SPECIFIED ITEMS
async function fetchAndMergeData(itemIds, qualities, locations) {
  if (itemIds.length === 0) return [];

  const itemString = itemIds.join(",");
  const locationString = locations.join(",");
  const qualityString = qualities.join(",");

  try {
    // Pass query params for locations and qualities to speed up API response
    const aodpUrl = `${AODP_EUROPE_URL}${itemString}.json?locations=${locationString}&qualities=${qualityString}`;
    const albionDbUrl = `${ALBIONDB_EUROPE_URL}${itemString}?locations=${locationString}`;

    const [aodpResponse, albionDbResponse] = await Promise.all([
      fetch(aodpUrl).catch(() => null),
      fetch(albionDbUrl).catch(() => null)
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

// 3. MAIN RUN TRIGGER
async function calculateAdvisor() {
  const tableBody = document.getElementById('tableBody');
  tableBody.innerHTML = `<div class="empty-state">Searching databases for matching Tiers, Qualities, and Locations...</div>`;

  // Get active user selections from UI
  const activeLocations = Array.from(document.querySelectorAll('#locationToggles input:checked')).map(cb => cb.value);
  const activeQualities = Array.from(document.querySelectorAll('#qualityToggles input:checked')).map(cb => cb.value);
  
  // Dynamically generate item list based on checked Tiers
  const targetItems = getRequestedItemsFromUI();

  if (targetItems.length === 0 || activeLocations.length === 0) {
    tableBody.innerHTML = `<div class="empty-state">Please check at least one Tier and Location filter!</div>`;
    return;
  }

  // Fetch only the items, qualities, and locations selected in UI
  cachedMarketData = await fetchAndMergeData(targetItems, activeQualities, activeLocations);

  if (cachedMarketData.length === 0) {
    tableBody.innerHTML = `<div class="empty-state">No active market data found for selected filters. Try broadening your selection.</div>`;
    return;
  }

  renderTable();
}

// 4. RENDER & SORT LOCAL DATA
function renderTable() {
  const tableBody = document.getElementById('tableBody');
  if (!tableBody || !cachedMarketData || cachedMarketData.length === 0) return;

  const isPremium = document.getElementById('hasPremium')?.value === 'true';
  const sortBy = document.getElementById('sortBy')?.value || 'margin';
  const taxRate = isPremium ? 0.04 : 0.08;
  const setupFee = 0.025;

  const activeLocations = Array.from(document.querySelectorAll('#locationToggles input:checked')).map(cb => cb.value);
  const activeQualities = Array.from(document.querySelectorAll('#qualityToggles input:checked')).map(cb => Number(cb.value));

  let tradeRoutes = [];

  // Group market entries by item and quality
  const itemsGrouped = {};
  cachedMarketData.forEach(entry => {
    // Apply Quality Filter
    if (activeQualities.length > 0 && !activeQualities.includes(entry.quality)) return;

    const key = `${entry.itemId}_${entry.quality}`;
    if (!itemsGrouped[key]) itemsGrouped[key] = [];
    itemsGrouped[key].push(entry);
  });

  // Calculate routes across different cities
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

  // Apply Sorting
  if (sortBy === 'name') {
    tradeRoutes.sort((a, b) => a.itemId.localeCompare(b.itemId));
  } else if (sortBy === 'lastUpdate') {
    tradeRoutes.sort((a, b) => b.updatedAt - a.updatedAt);
  } else {
    tradeRoutes.sort((a, b) => b.profitMargin - a.profitMargin);
  }

  tableBody.innerHTML = '';

  if (tradeRoutes.length === 0) {
    tableBody.innerHTML = `<div class="empty-state">No matching trade routes found for these filters.</div>`;
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
}

// BIND LISTENERS
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('sortBy')?.addEventListener('change', renderTable);
  document.getElementById('hasPremium')?.addEventListener('change', renderTable);
  
  // Re-render local filters without re-fetching
  document.querySelectorAll('#qualityToggles input, #locationToggles input').forEach(checkbox => {
    checkbox.addEventListener('change', renderTable);
  });

  // Initial Run
  calculateAdvisor();
});
