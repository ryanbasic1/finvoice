// Expanded, India-focused keyword lists for better categorization
const RULES: Record<string, string[]> = {
  Food: [
  'food','meal','breakfast','lunch','dinner','snack','restaurant','eatery','canteen','tiffin','cafe','bakery',
  'zomato','swiggy','domino','pizza hut','kfc','mcd','mcdonald','subway','starbucks','chaayos','chai','tea','nashta','break fast','paratha','biryani','thali','meal box',
  // Hindi/Devanagari
  'चाय','नाश्ता','भोजन','खाना','ढाबा','रेस्तरां','तंदूरी','समोसा','जलेबी',
    'barbeque','barbecue','bbq','fssai'
  ],
  Groceries: [
  'grocery','grocerys','kirana','vegetable','veggie','sabzi','subzi','fruit','milk','dairy','doodh','atta','rice','chawal','dal','daal','oil','tel','spice','masala','egg','anda','ration',
  'atta','maida','besan','ghee','sugar','cheeni','salt','namak','paneer',
  // Devanagari
  'किराना','सब्जी','दूध','दही','पनीर','तेल','मसाला','राशन','चीनी','नमक',
    'supermarket','mart','store','dukan','dukaan','dmart','bigbasket','big basket','jiomart','reliance fresh','more','spencer'
  ],
  Travel: [
  'uber','ola','rapido','indrive','cab','taxi','auto','rickshaw','metro','bus','train','rail','irctc',
  'flight','airline','indigo','air india','vistara','goair','spicejet','toll','parking','fare','hotel','stay','lodging',
  // vehicle upkeep
  'car','bike','scooter','gaadi','gadi','two wheeler','four wheeler','mechanic','garage','service','servicing',
  'car wash','bike wash','washing','wash','car cleaning','bike cleaning','cleaning','detailing','polish','polishing','dhona','dhone','safai','saaf',
  // Devanagari
  'गाड़ी','गाड़ी','धोना','धोने','धुलाई','सफाई','साफ',
  'puncture','tyre','tire','alignment','balancing','battery'
  ],

  Fuel: [
  'petrol','diesel','fuel','gasoline','cng','cng refill','petrol pump','hp','hindustan petroleum','iocl','indian oil','bpcl','bharat petroleum','shell',
  // Devanagari
  'पेट्रोल','डीजल','सीएनजी'
  ],
  Bills: [
  'bill','electricity','power','bijli','light bill','water','paani','gas','lpg','png','postpaid','prepaid','dth','tata play','tataplay',
  'recharge','topup','top up','data pack','broadband','fiber','wifi','jiofiber','airtel xtream','xtream','bsnl','vi','vodafone','idea','airtel','mobile bill','phone bill',
  // Devanagari
  'बिजली','लाइट','पानी','रीचार्ज','डाटा पैक'
  ],
  Utilities: [
  'utility','subscription','subscr','plan','pack','tv','set top','internet','wifi','otp','fastag','upc','plumber','electrician','carpenter','paint','painting','cleaning','housekeeping',
  // Devanagari
  'प्लंबर','इलेक्ट्रिशियन','कारपेंटर','पेंट','सफाई'
  ],
  Shopping: [
  'shopping','shop','store','mall','bazaar','market','amazon','flipkart','myntra','ajio','meesho','ikea','decathlon',
    'lifestyle','max','pantaloons','zara','h&m','nykaa','tata cliq','electronics','gadget','laptop','notebook','desktop',
    'computer','pc','mobile','phone','smartphone','tablet','ipad','iphone','samsung','oneplus','mi','redmi','vivo','oppo',
  'realme','apple','repair','service center','servicecentre','screen','display','battery','charger','adapter','keyboard',
  'mouse','ssd','hdd','clothes','cloth','kapde','kapda','dress','jeans','shirt','tshirt','kurta','saree','shoes','sandals','sneakers','watch','perfume','cosmetics','salon','haircut','parlour','parlor',
  // Devanagari
  'कपड़े','कपड़ा','कपडे','ड्रेस','शर्ट','जीन्स','जूते','सैंडल','घड़ी','इत्र','कॉस्मेटिक्स','सैलून','हेयरकट','पार्लर'
  ],
  Entertainment: [
    'movie','cinema','theatre','bms','bookmyshow','netflix','prime video','hotstar','disney','jiocinema','sony liv',
    'spotify','gaana','saavn','gaming','game','ps','xbox','steam','sports','sport','khel','cricket','football','kabaddi','stadium',
  'match','tournament','ipl','bcci','ticket','party','picnic',
  // Devanagari
  'फिल्म','मूवी','सिनेमा','टिकट','मैच','क्रिकेट','फुटबॉल'
  ],
  Health: [
  'health','medicine','medicines','pharmacy','chemist','doctor','dr ','clinic','hospital','lab','test','scan','consultation','dentist','dental','optical','optician','eye checkup','gym',
  'dawa','dawai','apollo','1mg','pharmeasy','medplus','thyrocare',
  // Devanagari
  'दवा','दवाई','डॉक्टर','हॉस्पिटल','दंत','दांत','नेत्र','जिम'
  ],
  Rent: [
  'rent','kiraya','landlord','lease','maintenance','society fees','association','hoa','pg','hostel','room rent','deposit',
  // Devanagari
  'किराया','जमानत'
  ],
  Education: [
    'education','course','tuition','coaching','class','school','college','university','exam','fees','udemy','coursera',
  'byju','unacademy','prep','skill',
  // Devanagari
  'स्कूल','कॉलेज','ट्यूशन','कोचिंग','फीस','परीक्षा'
  ],
  Transfers: [
  'transfer','upi from','received','len den','lendin','settlement','reimburse','reimbursement','splitwise','settled','payback','refund','cashback',
  // Devanagari
  'रिफंड','कैशबैक'
  ],
  Income: [
    'salary','stipend','payroll','wage','bonus','hike','increment','refund','cashback','interest','dividend','credit'
  ],
};

function normalizeText(s: string) {
  return s
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, ' ') // remove punctuation/symbols
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim();
}

export function categorize(description?: string, merchantRaw?: string): string {
  const text = normalizeText(`${description ?? ''} ${merchantRaw ?? ''}`);
  for (const [cat, words] of Object.entries(RULES)) {
    if (words.some(w => text.includes(w))) return cat;
  }
  // Try approximate match for short words (catch common misspellings)
  const tokens = text.split(/\s+/).filter(Boolean);
  for (const [cat, words] of Object.entries(RULES)) {
    for (const tok of tokens) {
      for (const w of words) {
        if (Math.abs(w.length - tok.length) <= 2 && levenshtein(w, tok) <= 1) return cat;
      }
    }
  }
  return 'Uncategorized';
}

function levenshtein(a: string, b: string) {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}
