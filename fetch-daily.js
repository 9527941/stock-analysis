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

async function fetchIndex(symbol) {
  const url = `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${symbol}&scale=240&ma=no&datalen=30`;
  const r = await fetch(url);
  const buf = await r.arrayBuffer();
  const txt = new TextDecoder('gbk').decode(buf);
  return JSON.parse(txt);
}

async function fetchSectors() {
  // 东财行业板块涨幅前20（沪深板块）
  const url = 'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=20&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:2&fields=f12,f13,f14,f3,f20,f21,f80,f81';
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Referer': 'https://quote.eastmoney.com/',
    },
  });
  const j = await r.json();
  if (!j.data || !j.data.diff) return [];
  return j.data.diff.map(d => ({
    code: d.f12,
    name: d.f14,
    chg: d.f3,
  }));
}

async function fetchFundFlow(market, code) {
  const secid = market === 'sh' ? `1.${code}` : `0.${code}`;
  const url = `https://push2.eastmoney.com/api/qt/stock/fflow/kline/get?secid=${secid}&lmt=1&klt=101&fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55,f56,f57`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const j = await r.json();
    if (!j.data || !j.data.klines || !j.data.klines.length) return null;
    const f = j.data.klines[0].split(',');
    return {
      date: f[0],
      main: parseFloat(f[1]),      // 主力净流入（超大单+大单）
      small: parseFloat(f[2]),     // 小单净流入
      medium: parseFloat(f[3]),    // 中单净流入
      big: parseFloat(f[4]),       // 大单净流入
      superBig: parseFloat(f[5]),  // 超大单净流入
    };
  } catch (e) {
    return null;
  }
}

async function run() {
  const cfgPath = path.join(__dirname, 'stock-data.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  fs.mkdirSync(outDir, { recursive: true });

  // 1. 个股日K
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

  // 2. 大盘指数
  const marketData = { updated: new Date().toISOString() };
  try {
    marketData.sh = await fetchIndex('sh000001');
    marketData.sz = await fetchIndex('sz399001');
    marketData.cy = await fetchIndex('sz399006');
    console.log('index ok');
  } catch (e) {
    console.log('index ERR', e.message);
  }

  // 3. 板块涨幅
  try {
    marketData.sectors = await fetchSectors();
    console.log('sectors ok', marketData.sectors.length);
  } catch (e) {
    console.log('sectors ERR', e.message);
    marketData.sectors = [];
  }

  // 4. 个股资金流
  marketData.flows = {};
  for (const s of cfg.stocks || []) {
    try {
      const f = await fetchFundFlow(s.market, s.code);
      if (f) marketData.flows[s.market + s.code] = f;
    } catch (e) {
      console.log('flow ERR', s.market + s.code, e.message);
    }
  }
  console.log('flows ok', Object.keys(marketData.flows).length);

  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'data', 'market.json'), JSON.stringify(marketData, null, 2));
}

run();
