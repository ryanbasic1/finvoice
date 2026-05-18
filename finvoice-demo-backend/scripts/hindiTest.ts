import { parseText } from "../src/utils/nlp.ts";
import { categorize } from "../src/utils/categorize.ts";

const samples = [
  '₹500 Gadi dhone ke liye',
  'Rs 300 gaadi safai',
  '500 bike dhona',
  '₹200 chai nashta',
  '1500 kiraya',
  '₹800 bijli bill',
];

for (const s of samples) {
  const p = parseText(s);
  const cat = categorize(p.entities.merchant, p.entities.merchant);
  console.log(s.padEnd(26), '=>', 'amt:', p.entities.amount, 'desc:', p.entities.merchant, 'cat:', cat);
}
