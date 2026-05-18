const axios = require('axios');

// Example Express route for /voice/add
module.exports = async function voiceAddHandler(req, res, db) {
  const { text } = req.body;
  try {
    // Call Python NLP service
    const { data: expenditures } = await axios.post('http://localhost:5005/parse', { text });
    for (const exp of expenditures) {
      // Save each expenditure to DB (adjust for your DB schema)
      await db.expenses.create({ description: exp.item, amount: exp.amount });
    }
    res.json({ status: 'ok', added: expenditures.length });
  } catch (err) {
    res.status(500).json({ error: 'NLP service error', details: err.message });
  }
};
