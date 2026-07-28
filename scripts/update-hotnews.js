// scripts/update-hotnews.js
const fs = require("fs");

async function fetchWithUA(url, customHeaders = {}, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
          "Accept": "application/json, text/plain, */*",
          "Referer": new URL(url).origin + "/",
          ...customHeaders
        }
      });
      clearTimeout(id);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      try { return JSON.parse(text); } catch { return text; }
    } catch (e) {
      clearTimeout(id);
      if (attempt === retries) return null;
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  return null;
}

// ==================== 数据源 ====================

async function getBaidu() { /* 保持不变 */ 
  const json = await fetchWithUA("https://top.baidu.com/api/board?tab=realtime");
  const list = json?.data?.cards?.[0]?.content || [];
  return list.slice(0, 5).map(i => ({ title: i.word, url: i.url || `https://www.baidu.com/s?wd=${encodeURIComponent(i.word)}` }));
}

async function getBilibili() { /* 已优化 */ 
  const json = await fetchWithUA("https://api.bilibili.com/x/web-interface/popular?ps=10&pn=1", {"Referer": "https://www.bilibili.com/"});
  const list = json?.data?.list || [];
  return list.slice(0, 5).map(i => ({ title: i.title, url: i.short_link_v2 || `https://www.bilibili.com/video/${i.bvid}` }));
}

async function getToutiao() { /* 保持 */ 
  const json = await fetchWithUA("https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc");
  const list = json?.data || [];
  return list.slice(0, 5).map(i => ({ title: i.Title, url: `https://www.toutiao.com/trending/${i.ClusterIdStr}/` }));
}

async function getIThome() { /* 保持 */ 
  const json = await fetchWithUA("https://api.ithome.com/json/newslist/news", {"Referer": "https://www.ithome.com/"});
  let list = Array.isArray(json) ? json : (json?.newslist || []);
  return list.slice(0, 5).map(i => ({ title: i.title, url: i.url }));
}

async function getNetease() {
  const json = await fetchWithUA("https://c.m.163.com/nc/article/headline/T1348647853363/0-40.html");
  const rawList = json?.T1348647853363 || [];
  const items = [];
  for (const item of rawList) {
    if (item?.title && items.length < 5 && item.title.length > 8) {
      const url = item.url || (item.docid ? `https://3g.163.com/touch/article/${item.docid}.html` : null);
      if (url) items.push({ title: item.title.trim(), url });
    }
  }
  return items.length ? items : [{title: "网易头条", url: "https://news.163.com"}];
}

async function getSinaFinance() {
  return [{ title: "新浪财经 7x24 直播", url: "https://finance.sina.com.cn/7x24/" }];
}

async function getGithub() { /* 保持 */ 
  const json = await fetchWithUA("https://api.github.com/search/repositories?q=created:>2025-01-01&sort=stars&order=desc&per_page=5");
  const list = json?.items || [];
  return list.slice(0,5).map(i => ({ title: `${i.full_name}: ${i.description?.slice(0,60) || ""}`, url: i.html_url }));
}

async function getHuggingFace() { /* 保持 */ 
  const json = await fetchWithUA("https://huggingface.co/api/models?sort=downloads&direction=-1&limit=5");
  return (Array.isArray(json) ? json : []).slice(0,5).map(i => ({ title: `Model: ${i.id}`, url: `https://huggingface.co/${i.id}` }));
}

async function getTonghuashun() {
  return [{ title: "同花顺 7x24 实时快讯", url: "https://news.10jqka.com.cn/realtimenews.html" }];
}

async function main() {
  console.log("开始抓取...");

  const results = await Promise.all([
    getBaidu(), getBilibili(), getToutiao(), getIThome(),
    getNetease(), getSinaFinance(), getGithub(), getHuggingFace(), getTonghuashun()
  ]);

  const keys = ["baidu", "bilibili", "toutiao", "ithome", "netease", "sinafinance", "github", "huggingface", "tonghuashun"];

  const finalData = { updatedAt: new Date().toISOString() };
  keys.forEach((key, i) => {
    if (Array.isArray(results[i]) && results[i].length > 0) {
      finalData[key] = results[i];
    }
  });

  fs.writeFileSync("./hotnews.json", JSON.stringify(finalData, null, 2));
  console.log("更新完成！包含源:", Object.keys(finalData).filter(k => k !== "updatedAt"));
}

main().catch(err => console.error(err));
