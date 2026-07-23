// ==========================================
// STEP 1: FETCH & MERGE DATA FROM BOTH DBs
// ==========================================

const AODP_EUROPE_URL = "https://europe.albion-online-data.com/api/v2/stats/prices/"; 
const ALBIONDB_EUROPE_URL = "https://albiondb.net/api/v1/europe/prices/"; 

async function fetchAndMergeData(itemIds) {
  const itemString = itemIds.join(",");

  try {
    // 1. Fetch from BOTH databases simultaneously
    const [aodpResponse, albionDbResponse] = await Promise.all([
      fetch(`${AODP_EUROPE_URL}${itemString}.json`).catch(() => null),
      fetch(`${ALBIONDB_EUROPE_URL}${itemString}`).catch(() => null)
    ]);

    // Parse JSON safely
    const aodpData = aodpResponse && aodpResponse.ok ? await aodpResponse.json() : [];
    const albionDbData = albionDbResponse && albionDbResponse.ok ? await albionDbResponse.json() : [];

    // 2. Normalize AODP data
    const normalizedAODP = aodpData.map(item => ({
      itemId: item.item_id,
      city: item.city,
      quality: item.quality,
      buyPrice: item.buy_price_min,
      sellPrice: item.sell_price_min,
      updatedAt: new Date(item.sell_price_min_date || item.date).getTime(),
      source: "AODP"
    }));

    // Normalize AlbionDB data
    const normalizedAlbionDB = albionDbData.map(item => ({
      itemId: item.item_id || item.itemId,
      city: item.city,
      quality: item.quality,
      buyPrice: item.buy_price || item.buyPrice,
      sellPrice: item.sell_price || item.sellPrice,
      updatedAt: new Date(item.updated_at || item.updatedAt).getTime(),
      source: "AlbionDB"
    }));

    // 3. Merge and keep the newest timestamp
    const freshestMap = new Map();
    const combinedData = [...normalizedAODP, ...normalizedAlbionDB];

    combinedData.forEach(entry => {
      const key = `${entry.itemId}_${entry.city}_${entry.quality}`;

      // Pick the winner with the newest updatedAt timestamp
      if (!freshestMap.has(key) || entry.updatedAt > freshestMap.get(key).updatedAt) {
        freshestMap.set(key, entry);
      }
    });

    return Array.from(freshestMap.values());

  } catch (error) {
    console.error("Error fetching or merging database data:", error);
    return [];
  }
}


// ==========================================
// STEP 2: RUN CALCULATIONS & RENDER TABLE
// ==========================================

async function calculateAdvisor() {
  const tableBody = document.getElementById('tableBody');
  tableBody.innerHTML = `<div class="empty-state">Fetching freshest data from AODP Europe & AlbionDB Europe...</div>`;

  // Define the items you want to fetch live
  const targetItems = ["T8_BAG", "T6_MAIN_CLAW", "T7_MOUNT_SWIFTCLAW", "T8_ARMOR_LEATHER_ROYAL"];

  // 1. Fetch freshest data from both databases
  const freshestMarketData = await fetchAndMergeData(targetItems);

  if (freshestMarketData.length === 0) {
    tableBody.innerHTML = `<div class="empty-state">Could not retrieve market data. Check your network or filters.</div>`;
    return;
  }

  // 2. Clear table and render rows with live data
  tableBody.innerHTML = '';

  freshestMarketData.forEach((item) => {
    // Calculate minutes ago
    const minutesAgo = Math.round((Date.now() - item.updatedAt) / 60000);
    const timeDisplay = isNaN(minutesAgo) ? 'Unknown' : `${minutesAgo} mins ago`;

    const rowHTML = `
      <div class="table-row">
        <div class="item-title-container">
          <div class="item-title">${item.itemId}</div>
          <div class="item-subtext">Quality: ${item.quality}</div>
        </div>
        <div><span class="badge-update">${timeDisplay}</span></div>
        <div class="price-cell">
          <div class="city-info">${item.city}</div>
          <div class="price-val">${item.buyPrice.toLocaleString()} silver</div>
        </div>
        <div class="price-cell">
          <div class="city-info">${item.city}</div>
          <div class="price-val">${item.sellPrice.toLocaleString()} silver</div>
        </div>
        <div class="profit-positive">Live Data</div>
        <div class="margin-val">${item.source}</div>
      </div>
    `;

    tableBody.innerHTML += rowHTML;
  });
}
