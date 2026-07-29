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

// ==================== 稳定数据源（原有）====================

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

// ==================== 新增财经数据源 ====================
// ✅ 华尔街见闻 7x24 快讯（修复：取 global 频道最新 5 条）
async function getWallstreet() {
  const json = await fetchWithUA("https://api-prod.wallstreetcn.com/apiv1/content/lives/pc?limit=20", {
    "Referer": "https://wallstreetcn.com/"
  });
  
  // 取 global 频道的快讯（综合/宏观，最全面）
  const list = json?.data?.global?.items || [];
  
  return list.slice(0, 5).map(i => {
    // title 经常为空，用 content_text 的第一行或前 50 字作为标题
    const text = i.content_text || i.content?.replace(/<[^>]+>/g, '') || '';
    const title = (i.title && i.title.trim()) 
      ? i.title 
      : (text.split('\n')[0].slice(0, 60) || '华尔街见闻快讯');
    
    return {
      title: title,
      url: i.uri ? `https://wallstreetcn.com/${i.uri}` : `https://wallstreetcn.com/lives/${i.id}`
    };
  });
}


// ✅ 新浪财经滚动新闻
async function getSina() {
  const json = await fetchWithUA("https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=2515&num=10&page=1", {
    "Referer": "https://finance.sina.com.cn/"
  });
  const list = json?.result?.data || [];
  return list.slice(0, 5).map(i => ({ title: i.title, url: i.url }));
}



async function main() {
  console.log("开始抓取数据源...");

  const results = await Promise.all([
    getBaidu(), 
    getBilibili(), 
    getToutiao(), 
    getIThome(),
    getWeibo(), 
    getGithub(), 
    getHuggingFace(),
    // ✅ 财经快讯：华尔街见闻 7x24 + 新浪
    getWallstreet(),
    getSina()
  ]);

  const keys = [
    "baidu", "bilibili", "toutiao", "ithome", 
    "weibo", "github", "huggingface",
    // ✅ 财经快讯
    "wallstreet", "sina"
  ];

  // ✅ 临时调试：查看每个源的返回情况
  console.log("\n========== 调试输出 ==========");
  keys.forEach((key, index) => {
    const data = results[index];
    if (Array.isArray(data)) {
      console.log(`${key}: ✅ ${data.length}条 - ${data[0]?.title?.substring(0, 30) || '无标题'}`);
    } else {
      console.log(`${key}: ❌ 返回非数组 -`, typeof data);
    }
  });
  console.log("==============================\n");

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
