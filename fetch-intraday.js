const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, 'data', 'intraday');

function secid(market, code) {
  return market === 'sh' ? `1.${code}` : `0.${code}`;
}

function symbol(market, code) {
  return market + code;
}

async function fetchEastmoney(s) {
  const sid = secid(s.market, s.code);
  const url = `https://push2his.eastmoney.com/api/qt/stock/trends2/get?secid=${sid}&ndays=1&fields1=f1,f2,f3,f4,f5&fields2=f51,f52,f53,f54,f55,f56,f57,f58`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
  const j = await r.json();
  if (!j.data || !j.data.trends) throw new Error('no trends data');
  return {
    updated: new Date().toISOString(),
    symbol: symbol(s.market, s.code),
    name: j.data.name || s.name,
    date: j.data.trends[0] ? j.data.trends[0].split(',')[0].slice(0, 10) : '',
    source: 'eastmoney',
    preClose: j.data.preClose || null,
    trends: j.data.trends,
  };
}

async function fetchSina5m(s) {
  // 新浪 5 分钟 K 线兜底：把 5 分钟 bar 拆成 5 条 1 分钟点（open/high/low/close 取 bar 值，均用 close）
  const sym = symbol(s.market, s.code);
  const url = `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${sym}&scale=5&ma=no&datalen=240`;
  const r = await fetch(url);
  const buf = await r.arrayBuffer();
  const txt = new TextDecoder('gbk').decode(buf);
  const arr = JSON.parse(txt);
  const today = new Date().toISOString().slice(0, 10);
  const trends = [];
  for (const k of arr) {
    const dt = k.day.slice(0, 10);
    if (dt !== today) continue;
    const time = k.day.slice(11, 16);
    const open = parseFloat(k.open);
    const close = parseFloat(k.close);
    const high = parseFloat(k.high);
    const low = parseFloat(k.low);
    const vol = parseFloat(k.volume);
    // 一根 5 分钟拆 5 条，时间递增
    for (let i = 0; i < 5; i++) {
      const [h, m] = time.split(':').map(Number);
      const totalMin = h * 60 + m + i;
      const nh = Math.floor(totalMin / 60).toString().padStart(2, '0');
      const nm = (totalMin % 60).toString().padStart(2, '0');
      const ts = `${dt} ${nh}:${nm}`;
      trends.push(`${ts},${open},${close},${high},${low},${Math.floor(vol / 5)},0.00,${close}`);
    }
  }
  return {
    updated: new Date().toISOString(),
    symbol: sym,
    name: s.name,
    date: today,
    source: 'sina5m',
    preClose: null,
    trends,
  };
}

async function run() {
  const cfgPath = path.join(__dirname, 'stock-data.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  fs.mkdirSync(outDir, { recursive: true });

  for (const s of cfg.stocks || []) {
    const sym = symbol(s.market, s.code);
    let data = null;
    try {
      data = await fetchEastmoney(s);
      console.log(sym, 'eastmoney ok', data.trends.length, 'points');
    } catch (e) {
      console.log(sym, 'eastmoney ERR', e.message);
    }
    if (!data) {
      try {
        data = await fetchSina5m(s);
        console.log(sym, 'sina5m ok', data.trends.length, 'points');
      } catch (e2) {
        console.log(sym, 'sina5m ERR', e2.message);
      }
    }
    if (data) {
      fs.writeFileSync(path.join(outDir, sym + '.json'), JSON.stringify(data, null, 2));
    } else {
      process.exitCode = 1;
    }
  }
}

run();
