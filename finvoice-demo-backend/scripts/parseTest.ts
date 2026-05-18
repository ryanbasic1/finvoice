import { parseText } from "../src/utils/nlp.ts";

const samples = [
  "3 lacs for rent",
  "2 lack laptop",
  "2 lacks phone",
  "3 cr tv",
  "3 crore tv",
  "1.5 crores house",
  "5k petrol",
  "3 thousand donation",
  "₹2.5k snacks",
  "Rs 3.2 lakh school",
  "7 lakhs car",
  "4500 internet bill",
];

for (const s of samples) {
  const r = parseText(s);
  console.log(s.padEnd(25), "=>", r.entities.amount, "desc:", r.entities.merchant);
}
