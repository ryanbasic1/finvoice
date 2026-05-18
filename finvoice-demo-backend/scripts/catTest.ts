import { categorize } from "../src/utils/categorize.ts";

const samples = [
  ['Food', 'nashta chai at canteen'],
  ['Groceries', 'kirana sabzi dukan'],
  ['Travel', 'ola auto gaadi service'],
  ['Fuel', 'petrol pump tank full'],
  ['Bills', 'bijli paani bill'],
  ['Shopping', 'mobile repair shop'],
  ['Entertainment', 'cricket match ticket'],
  ['Health', 'dawai from pharmacy'],
  ['Rent', 'society maintenance kiraya'],
  ['Education', 'tuition fees'],
  ['Transfers', 'upi received len den'],
];

for (const [expect, text] of samples) {
  const cat = categorize(text, text);
  console.log(text.padEnd(30), '=>', cat, cat === expect ? '✓' : `✗ (expected ${expect})`);
}
