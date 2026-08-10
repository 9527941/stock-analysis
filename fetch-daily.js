const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, 'data', 'daily');

async function fetchSymbol(symbol) {
  const url = `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${symbol}&scale=240&ma=no&datalen=320`;
  const r = await fetch(url);
  const buf = await r.arrayBuffer();
  const txt = new TextDecoder('gbk').decode(buf);
  return JSON.parse(txt);
}

async function run() {
  const cfgPath = path.join(__dirname, 'stock-data.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  fs.mkdirSync(outDir, { recursive: true });

  for (const s of cfg.stocks || []) {
    const symbol = s.market + s.code;
    try {
      const data = await fetchSymbol(symbol);
      const out = {
        updated: new Date().toISOString(),
        symbol,
        source: 'sina',
        count: data.length,
        klines: data,
      };
      fs.writeFileSync(path.join(outDir, symbol + '.json'), JSON.stringify(out, null, 2));
      console.log(symbol, 'ok', data.length, 'days');
    } catch (e) {
      console.log(symbol, 'ERR', e.message);
      process.exitCode = 1;
    }
  }
}
run();
