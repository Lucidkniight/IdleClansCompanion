export interface MarketItem {
  id: number;
  name: string;
}

export async function fetchGameData() {
  const res = await fetch('https://query.idleclans.com/api/Configuration/game-data');
  const text = await res.text();
  // Strip MongoDB ObjectId syntax which breaks JSON.parse
  const cleaned = text.replace(/ObjectId\("([^"]+)"\)/g, '"$1"');
  return JSON.parse(cleaned);
}

export function extractItems(data: any): MarketItem[] {
  const items: MarketItem[] = [];
  if (data?.Items?.Items && Array.isArray(data.Items.Items)) {
    for (const item of data.Items.Items) {
      items.push({
        id: item.ItemId,
        name: item.Name,
      });
    }
  }
  return items;
}