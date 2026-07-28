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
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  return null;
}

// ==================== 稳定数据源 ====================

async function getBaidu() {
  const json = await fetchWithUA("https://top.baidu.com/api/board?tab=realtime");
  const list = json?.data?.cards?.[0]?.content || [];
  return list.slice(0, 5).map(i => ({ title: i.word, url: i.url || `https://www.baidu.com/s?wd=${encodeURIComponent(i.word)}` }));
}

async function getBilibili() {
  const json = await fetchWithUA("https://api.bilibili.com/x/web-interface/popular?ps=10&pn=1", {"Referer": "https://www.bilibili.com/"});
  const list = json?.data?.list || [];
  return list.slice(0, 5).map(i => ({ title: i.title, url: i.short_link_v2 || `https://www.bilibili.com/video/${i.bvid}` }));
}

async function getToutiao() {
  const json = await fetchWithUA("https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc");
  const list = json?.data || [];
  return list.slice(0, 5).map(i => ({ title: i.Title, url: `https://www.toutiao.com/trending/${i.ClusterIdStr}/` }));
}

async function getIThome() {
  const json = await fetchWithUA("https://api.ithome.com/json/newslist/news", {"Referer": "https://www.ithome.com/"});
  let list = Array.isArray(json) ? json : (json?.newslist || []);
  return list.slice(0, 5).map(i => ({ title: i.title, url: i.url }));
}

async function getWeibo() {
  const json = await fetchWithUA("https://weibo.com/ajax/side/hotSearch");
  const list = json?.data?.realtime || json?.data?.band_list || [];
  return list.slice(0, 5).map(i => ({
    title: i.word || i.note || i.title,
    url: i.url || `https://weibo.com/hot/${i.mid}`
  }));
}

async function getGithub() {
  const json = await fetchWithUA("https://api.github.com/search/repositories?q=created:>2025-01-01&sort=stars&order=desc&per_page=5");
  const list = json?.items || [];
  return list.slice(0, 5).map(i => ({ title: `${i.full_name}: ${i.description || "无描述"}`, url: i.html_url }));
}

async function getHuggingFace() {
  const json = await fetchWithUA("https://huggingface.co/api/models?sort=downloads&direction=-1&limit=5");
  const list = Array.isArray(json) ? json : [];
  return list.slice(0,5).map(i => ({ title: `Model: ${i.id}`, url: `https://huggingface.co/${i.id}` }));
}

async function main() {
  console.log("开始抓取稳定数据源...");

  const results = await Promise.all([
    getBaidu(), 
    getBilibili(), 
    getToutiao(), 
    getIThome(),
    getWeibo(), 
    getGithub(), 
    getHuggingFace()
  ]);

  const keys = ["baidu", "bilibili", "toutiao", "ithome", "weibo", "github", "huggingface"];

  const finalData = { updatedAt: new Date().toISOString() };

  keys.forEach((key, index) => {
    const data = results[index];
    if (Array.isArray(data) && data.length > 0) {
      finalData[key] = data;
    }
  });

  fs.writeFileSync("./hotnews.json", JSON.stringify(finalData, null, 2));
  console.log("更新完成！包含源:", Object.keys(finalData).filter(k => k !== "updatedAt"));
}

main().catch(err => console.error("执行出错:", err));
