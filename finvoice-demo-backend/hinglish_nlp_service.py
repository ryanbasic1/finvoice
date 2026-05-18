from flask import Flask, request, jsonify
from transformers import pipeline

app = Flask(__name__)
nlp = pipeline("ner", model="Davlan/bert-base-multilingual-cased-ner-hrl", aggregation_strategy="simple")

def parse_expenditure(text):
    entities = nlp(text)
    items, amounts = [], []
    for ent in entities:
        if ent['entity_group'] in ['MISC', 'ORG', 'PER', 'LOC']:
            items.append(ent['word'])
        elif ent['entity_group'] == 'NUM':
            amounts.append(ent['word'])
    results = []
    for i in range(max(len(items), len(amounts))):
        item = items[i] if i < len(items) else items[-1] if items else ""
        amount = amounts[i] if i < len(amounts) else ""
        results.append({"item": item, "amount": amount})
    return results

@app.route('/parse', methods=['POST'])
def parse():
    data = request.json
    result = parse_expenditure(data['text'])
    return jsonify(result)

if __name__ == '__main__':
    app.run(port=5005)
